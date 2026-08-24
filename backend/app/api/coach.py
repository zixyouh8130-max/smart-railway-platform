from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
from ..models.coach import Coach
from ..models.train import Train
from ..models.seat import Seat
from ..models.booking import Booking
from ..schemas.coach import (
    CoachCreate, CoachUpdate, CoachResponse,
    CoachBulkUpdate, SeatResponse
)

router = APIRouter(tags=["coaches"])


def _coach_has_booking_history(
    db: Session,
    coach_id: int,
) -> bool:
    """
    Any booking referencing a seat in this coach means those Seat IDs
    are historical ticket data and must not be deleted/recreated.
    """
    found = (
        db.query(Booking.id)
        .join(
            Seat,
            Booking.seat_id == Seat.id,
        )
        .filter(
            Seat.coach_id == coach_id
        )
        .first()
    )

    return found is not None


def _train_has_booking_history(
    db: Session,
    train_id: int,
) -> bool:
    found = (
        db.query(Booking.id)
        .join(
            Seat,
            Booking.seat_id == Seat.id,
        )
        .join(
            Coach,
            Seat.coach_id == Coach.id,
        )
        .filter(
            Coach.train_id == train_id
        )
        .first()
    )

    return found is not None


def _seat_type_for_coach_type(coach_type: str) -> str:
    """
    Seat metadata for the current coach type.

    Fare selection does NOT depend on this value; booking uses coach_type.
    This only keeps Seat rows semantically consistent after a coach-type
    change while preserving each existing Seat.id.
    """
    mapping = {
        "UPPER_CLASS": "UPPER_CLASS",
        "ECONOMY_CLASS": "REGULAR",
        "SLEEPER": "SLEEPER",
        "DINING": "DINING",
        "BAGGAGE": "BAGGAGE",
    }

    return mapping.get(
        str(coach_type).upper(),
        "REGULAR",
    )


def _sync_existing_seats_for_coach_type(
    db: Session,
    coach: Coach,
) -> int:
    """
    Update seat metadata IN PLACE after coach_type changes.

    Important:
    - Seat IDs are preserved.
    - seat_number/row/position are preserved.
    - is_active is preserved.
    - If a passenger coach previously had no Seat rows (for example,
      BAGGAGE -> ECONOMY_CLASS), seats are generated using the existing layout.
    """
    seats = (
        db.query(Seat)
        .filter(Seat.coach_id == coach.id)
        .order_by(
            Seat.row_number,
            Seat.position_in_row,
        )
        .all()
    )

    coach_type = str(
        coach.coach_type
    ).upper()

    if not seats:
        # Baggage coaches intentionally have no seats.
        if coach_type == "BAGGAGE":
            return 0

        # A coach converted from BAGGAGE (or another empty configuration)
        # into a passenger/dining coach needs seat rows. There are no old
        # Seat IDs to preserve in this case.
        seats_data = generate_seats_for_coach(coach)

        for seat_data in seats_data:
            db.add(
                Seat(
                    coach_id=coach.id,
                    **seat_data,
                )
            )

        return len(seats_data)

    seat_type = _seat_type_for_coach_type(
        coach_type
    )

    for seat in seats:
        # Preserve the physical seat identity and layout.
        seat.seat_type = seat_type

    return len(seats)


@router.get("/train/{train_id}", response_model=dict)
async def get_coaches_by_train(
        train_id: int,
        db: Session = Depends(get_db)
):
    """Get all coaches for a specific train"""

    # Query coaches directly
    coaches = db.query(Coach).filter(
        Coach.train_id == train_id,
        Coach.is_active == True
    ).order_by(Coach.order_number).all()

    # Convert SQLAlchemy models to dictionaries manually
    coaches_data = []
    for coach in coaches:
        coaches_data.append({
            "id": coach.id,
            "train_id": coach.train_id,
            "coach_type": coach.coach_type,
            "name": coach.name,
            "rows": coach.rows,
            "seats_per_row": coach.seats_per_row,
            "total_seats": coach.total_seats,
            "order_number": coach.order_number,
            "is_active": coach.is_active,
            "created_at": coach.created_at if hasattr(coach, 'created_at') else None,
            "updated_at": coach.updated_at if hasattr(coach, 'updated_at') else None,
        })

    # Always return 200 with coaches array (even if empty)
    return {
        "coaches": coaches_data,
        "total_coaches": len(coaches_data),
        "total_seats": sum(coach.total_seats for coach in coaches)
    }


@router.get("/", response_model=List[dict])
async def get_all_coaches(
        db: Session = Depends(get_db)
):
    """Get all coaches"""
    coaches = db.query(Coach).filter(Coach.is_active == True).all()

    # Convert to dictionaries
    coaches_data = []
    for coach in coaches:
        coaches_data.append({
            "id": coach.id,
            "train_id": coach.train_id,
            "coach_type": coach.coach_type,
            "name": coach.name,
            "rows": coach.rows,
            "seats_per_row": coach.seats_per_row,
            "total_seats": coach.total_seats,
            "order_number": coach.order_number,
            "is_active": coach.is_active,
        })

    return coaches_data


@router.get("/{coach_id}", response_model=dict)
async def get_coach(
        coach_id: int,
        db: Session = Depends(get_db)
):
    """Get a single coach by ID"""
    coach = db.query(Coach).filter(
        Coach.id == coach_id,
        Coach.is_active == True
    ).first()
    if not coach:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach not found"
        )

    # Convert to dictionary
    return {
        "id": coach.id,
        "train_id": coach.train_id,
        "coach_type": coach.coach_type,
        "name": coach.name,
        "rows": coach.rows,
        "seats_per_row": coach.seats_per_row,
        "total_seats": coach.total_seats,
        "order_number": coach.order_number,
        "is_active": coach.is_active,
    }


@router.post("/bulk-update", response_model=dict, dependencies=[Depends(get_current_admin_user)])
async def bulk_update_coaches(
        data: CoachBulkUpdate,
        db: Session = Depends(get_db)
):
    """Bulk create/update coaches for a train and generate seats"""
    try:
        # Log incoming data for debugging
        print(f"Received bulk update for train_id: {data.train_id}")
        print(f"Number of coaches: {len(data.coaches)}")

        # Bookings reference immutable Seat IDs. A destructive coach rebuild
        # would delete/recreate those IDs and corrupt historical tickets.
        if _train_has_booking_history(db, data.train_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Cannot bulk-rebuild coaches/seats because this train "
                    "already has booking history. Keep existing Seat IDs."
                )
            )

        # Delete existing coaches and their seats only when no booking history exists.
        existing_coaches = db.query(Coach).filter(Coach.train_id == data.train_id).all()
        for coach in existing_coaches:
            db.query(Seat).filter(Seat.coach_id == coach.id).delete()
            db.delete(coach)

        db.flush()

        # Create new coaches
        created_coaches = []
        total_seats_count = 0

        for index, coach_data in enumerate(data.coaches, 1):
            coach = Coach(
                train_id=data.train_id,
                coach_type=coach_data.coach_type,
                name=coach_data.name,
                rows=coach_data.rows,
                seats_per_row=coach_data.seats_per_row,
                total_seats=coach_data.total_seats,
                order_number=index,
                is_active=True
            )
            db.add(coach)
            db.flush()

            # Generate seats for this coach
            seats_data = generate_seats_for_coach(coach)
            for seat_data in seats_data:
                seat = Seat(coach_id=coach.id, **seat_data)
                db.add(seat)

            created_coaches.append(coach)
            total_seats_count += coach.total_seats

        # Update train totals if train exists
        train = db.query(Train).filter(Train.id == data.train_id).first()
        if train:
            train.total_coaches = len(created_coaches)
            train.capacity = total_seats_count

        db.commit()

        # Convert to dictionaries
        coaches_data = []
        for coach in created_coaches:
            db.refresh(coach)
            coaches_data.append({
                "id": coach.id,
                "train_id": coach.train_id,
                "coach_type": coach.coach_type,
                "name": coach.name,
                "rows": coach.rows,
                "seats_per_row": coach.seats_per_row,
                "total_seats": coach.total_seats,
                "order_number": coach.order_number,
                "is_active": coach.is_active,
            })

        return {
            "message": "Coaches updated successfully",
            "coaches_count": len(created_coaches),
            "seats_count": total_seats_count,
            "coaches": coaches_data
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"Error in bulk_update_coaches: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating coaches: {str(e)}"
        )


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin_user)])
async def create_coach(
        coach_data: CoachCreate,
        db: Session = Depends(get_db)
):
    """Create a single coach"""
    # Get max order number
    max_order = db.query(Coach).filter(
        Coach.train_id == coach_data.train_id
    ).order_by(Coach.order_number.desc()).first()

    coach_data.order_number = (max_order.order_number + 1) if max_order else 1

    coach = Coach(**coach_data.dict())
    db.add(coach)
    db.flush()

    # Generate seats
    seats_data = generate_seats_for_coach(coach)
    for seat_data in seats_data:
        seat = Seat(coach_id=coach.id, **seat_data)
        db.add(seat)

    # Update train totals if train exists
    train = db.query(Train).filter(Train.id == coach_data.train_id).first()
    if train:
        train.total_coaches += 1
        train.capacity += coach.total_seats

    db.commit()
    db.refresh(coach)

    # Convert to dictionary
    return {
        "id": coach.id,
        "train_id": coach.train_id,
        "coach_type": coach.coach_type,
        "name": coach.name,
        "rows": coach.rows,
        "seats_per_row": coach.seats_per_row,
        "total_seats": coach.total_seats,
        "order_number": coach.order_number,
        "is_active": coach.is_active,
    }


@router.put("/{coach_id}", response_model=dict, dependencies=[Depends(get_current_admin_user)])
async def update_coach(
        coach_id: int,
        coach_data: CoachUpdate,
        db: Session = Depends(get_db)
):
    """
    Update a coach while preserving Seat IDs whenever the physical
    seat layout has not changed.

    Rules:
    - name/order/is_active change -> seats unchanged
    - coach_type change -> existing Seat rows updated IN PLACE
    - rows/seats_per_row change -> physical layout rebuild
      (blocked if booking history exists)
    - total_seats is derived by the backend, not trusted from the client
    """
    coach = (
        db.query(Coach)
        .filter(Coach.id == coach_id)
        .first()
    )

    if not coach:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach not found"
        )

    old_total_seats = int(
        coach.total_seats or 0
    )

    update_data = coach_data.model_dump(
        exclude_unset=True
    )

    old_coach_type = str(
        coach.coach_type
    ).upper()

    old_rows = int(
        coach.rows or 0
    )

    old_seats_per_row = int(
        coach.seats_per_row or 0
    )

    new_coach_type = str(
        update_data.get(
            "coach_type",
            coach.coach_type,
        )
    ).upper()

    new_rows = int(
        update_data.get(
            "rows",
            coach.rows,
        )
    )

    new_seats_per_row = int(
        update_data.get(
            "seats_per_row",
            coach.seats_per_row,
        )
    )

    coach_type_changed = (
        new_coach_type
        != old_coach_type
    )

    layout_changed = (
        new_rows != old_rows
        or new_seats_per_row
        != old_seats_per_row
    )

    # Only a physical layout change destroys/recreates seat rows.
    # Because Bookings reference Seat.id, that operation is forbidden
    # once this coach has booking history.
    if (
        layout_changed
        and _coach_has_booking_history(
            db,
            coach.id,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot change rows or seats_per_row because "
                "seats in this coach are referenced by booking history. "
                "Seat IDs must be preserved."
            )
        )

    try:
        # Apply editable fields, but never trust client-supplied total_seats.
        for field, value in update_data.items():
            if field == "total_seats":
                continue

            setattr(
                coach,
                field,
                value,
            )

        # total_seats is derived from the actual coach configuration.
        if str(coach.coach_type).upper() == "BAGGAGE":
            coach.total_seats = 0
        else:
            coach.total_seats = (
                int(coach.rows or 0)
                * int(
                    coach.seats_per_row
                    or 0
                )
            )

        if layout_changed:
            # Safe only because the booking-history guard above passed.
            db.query(Seat).filter(
                Seat.coach_id == coach.id
            ).delete(
                synchronize_session=False
            )

            db.flush()

            seats_data = (
                generate_seats_for_coach(
                    coach
                )
            )

            for seat_data in seats_data:
                db.add(
                    Seat(
                        coach_id=coach.id,
                        **seat_data,
                    )
                )

        elif coach_type_changed:
            # No physical layout change:
            # preserve Seat IDs and update only type metadata.
            _sync_existing_seats_for_coach_type(
                db,
                coach,
            )

        # Keep train capacity consistent with the derived coach capacity.
        train = (
            db.query(Train)
            .filter(
                Train.id
                == coach.train_id
            )
            .first()
        )

        if train:
            train.capacity = max(
                0,
                int(train.capacity or 0)
                - old_total_seats
                + int(
                    coach.total_seats
                    or 0
                ),
            )

        db.commit()
        db.refresh(coach)

        return {
            "id": coach.id,
            "train_id": coach.train_id,
            "coach_type": coach.coach_type,
            "name": coach.name,
            "rows": coach.rows,
            "seats_per_row": coach.seats_per_row,
            "total_seats": coach.total_seats,
            "order_number": coach.order_number,
            "is_active": coach.is_active,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Error updating coach: "
                f"{str(exc)}"
            ),
        )


@router.delete("/{coach_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_current_admin_user)])
async def delete_coach(
        coach_id: int,
        db: Session = Depends(get_db)
):
    """Delete a coach"""
    coach = db.query(Coach).filter(Coach.id == coach_id).first()
    if not coach:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach not found"
        )

    if _coach_has_booking_history(db, coach.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete coach because its seats are "
                "referenced by booking history."
            )
        )

    train_id = coach.train_id
    coach_total_seats = coach.total_seats

    db.delete(coach)

    # Update train totals if train exists
    train = db.query(Train).filter(Train.id == train_id).first()
    if train:
        train.total_coaches = max(0, train.total_coaches - 1)
        train.capacity = max(0, train.capacity - coach_total_seats)

    # Reorder remaining coaches
    remaining_coaches = db.query(Coach).filter(
        Coach.train_id == train_id
    ).order_by(Coach.order_number).all()

    for index, remaining_coach in enumerate(remaining_coaches, 1):
        remaining_coach.order_number = index

    db.commit()

    return None


def generate_seats_for_coach(coach: Coach) -> List[dict]:
    """Generate seat data for a coach based on its configuration"""
    seats = []

    # Seat type mapping
    seat_type_mapping = {
        'UPPER_CLASS': 'UPPER_CLASS',
        'ECONOMY_CLASS': 'REGULAR',
        'SLEEPER': 'SLEEPER',
        'DINING': 'DINING',
        'BAGGAGE': 'BAGGAGE'
    }

    seat_type = seat_type_mapping.get(coach.coach_type, 'REGULAR')

    # If baggage car, no seats
    if coach.coach_type == 'BAGGAGE':
        return seats

    for row in range(1, coach.rows + 1):
        for position in range(1, coach.seats_per_row + 1):
            seat_letter = chr(64 + row)  # A, B, C, etc.
            seat_number = f"{seat_letter}{position}"

            seats.append({
                'seat_number': seat_number,
                'seat_type': seat_type,
                'row_number': row,
                'position_in_row': position,
                'is_active': True
            })

    return seats
