from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..core.database import get_db
from ..models.coach import Coach
from ..models.train import Train
from ..models.seat import Seat
from ..schemas.coach import (
    CoachCreate, CoachUpdate, CoachResponse,
    CoachBulkUpdate, SeatResponse
)

router = APIRouter(tags=["coaches"])


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


@router.post("/bulk-update", response_model=dict)
async def bulk_update_coaches(
        data: CoachBulkUpdate,
        db: Session = Depends(get_db)
):
    """Bulk create/update coaches for a train and generate seats"""
    try:
        # Log incoming data for debugging
        print(f"Received bulk update for train_id: {data.train_id}")
        print(f"Number of coaches: {len(data.coaches)}")

        # Delete existing coaches and their seats
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

    except Exception as e:
        db.rollback()
        print(f"Error in bulk_update_coaches: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating coaches: {str(e)}"
        )


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
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


@router.put("/{coach_id}", response_model=dict)
async def update_coach(
        coach_id: int,
        coach_data: CoachUpdate,
        db: Session = Depends(get_db)
):
    """Update a coach"""
    coach = db.query(Coach).filter(Coach.id == coach_id).first()
    if not coach:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach not found"
        )

    old_total_seats = coach.total_seats

    # Update fields
    update_data = coach_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(coach, field, value)

    # If seats configuration changed, regenerate seats
    if 'rows' in update_data or 'seats_per_row' in update_data:
        # Delete existing seats
        db.query(Seat).filter(Seat.coach_id == coach.id).delete()

        # Regenerate seats
        seats_data = generate_seats_for_coach(coach)
        for seat_data in seats_data:
            seat = Seat(coach_id=coach.id, **seat_data)
            db.add(seat)

    # Update train capacity if train exists
    train = db.query(Train).filter(Train.id == coach.train_id).first()
    if train:
        train.capacity = train.capacity - old_total_seats + coach.total_seats

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


@router.delete("/{coach_id}", status_code=status.HTTP_204_NO_CONTENT)
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
        'FIRST_CLASS': 'FIRST_CLASS',
        'ECONOMY': 'REGULAR',
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