# backend/api/coaches.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..core.database import get_db
from ..models.train import Train
from ..models.coach import Coach
from ..models.seat import Seat
from ..schemas.coach import CoachCreate, CoachUpdate, CoachResponse, CoachListResponse
from ..schemas.seat import SeatResponse
from ..services.seat_generator import SeatGenerator

router = APIRouter()


@router.get("/", response_model=CoachListResponse)
async def get_coaches(
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100),
        train_id: Optional[int] = None,
        coach_type: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Get all coaches with optional filtering"""
    query = db.query(Coach)

    if train_id:
        query = query.filter(Coach.train_id == train_id)

    if coach_type:
        query = query.filter(Coach.coach_type == coach_type)

    total = query.count()
    coaches = query.order_by(Coach.order_number).offset(skip).limit(limit).all()

    return CoachListResponse(coaches=coaches, total=total)


@router.get("/{coach_id}", response_model=CoachResponse)
async def get_coach(coach_id: int, db: Session = Depends(get_db)):
    """Get a single coach by ID"""
    coach = db.query(Coach).filter(Coach.id == coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    return coach


@router.post("/", response_model=CoachResponse, status_code=201)
async def create_coach(coach_data: CoachCreate, db: Session = Depends(get_db)):
    """Create a new coach with auto-generated seats"""
    try:
        # Verify train exists
        train = db.query(Train).filter(Train.id == coach_data.train_id).first()
        if not train:
            raise HTTPException(status_code=404, detail="Train not found")

        # Create coach
        coach = Coach(**coach_data.model_dump())
        db.add(coach)
        db.flush()  # Get the coach ID without committing

        # Generate seats for the new coach
        seat_data_list = SeatGenerator.generate_seats_for_coach(coach)
        for seat_data in seat_data_list:
            seat = Seat(**seat_data)
            db.add(seat)

        db.commit()
        db.refresh(coach)
        return coach
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating coach: {str(e)}")


@router.put("/{coach_id}", response_model=CoachResponse)
async def update_coach(coach_id: int, coach_data: CoachUpdate, db: Session = Depends(get_db)):
    """Update an existing coach and regenerate seats if configuration changed"""
    coach = db.query(Coach).filter(Coach.id == coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")

    try:
        # Check if seat configuration is changing
        config_changing = False
        update_data = coach_data.model_dump(exclude_unset=True)

        if ('rows' in update_data and update_data['rows'] != coach.rows) or \
                ('seats_per_row' in update_data and update_data['seats_per_row'] != coach.seats_per_row):
            config_changing = True

        # Update coach fields
        for key, value in update_data.items():
            setattr(coach, key, value)

        # Regenerate seats if configuration changed
        if config_changing:
            # Delete existing seats
            db.query(Seat).filter(Seat.coach_id == coach_id).delete()
            db.flush()

            # Generate new seats
            seat_data_list = SeatGenerator.generate_seats_for_coach(coach)
            for seat_data in seat_data_list:
                seat = Seat(**seat_data)
                db.add(seat)

        db.commit()
        db.refresh(coach)
        return coach
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating coach: {str(e)}")


@router.delete("/{coach_id}")
async def delete_coach(coach_id: int, db: Session = Depends(get_db)):
    """Delete a coach and its seats"""
    coach = db.query(Coach).filter(Coach.id == coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")

    try:
        # Delete associated seats first (cascade should handle this, but being explicit)
        db.query(Seat).filter(Seat.coach_id == coach_id).delete()
        db.delete(coach)
        db.commit()
        return {"message": "Coach deleted successfully", "success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting coach: {str(e)}")


@router.get("/train/{train_id}", response_model=CoachListResponse)
async def get_train_coaches(train_id: int, db: Session = Depends(get_db)):
    """Get all coaches for a specific train"""
    # Verify train exists
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    coaches = db.query(Coach).filter(Coach.train_id == train_id).order_by(Coach.order_number).all()

    return CoachListResponse(coaches=coaches, total=len(coaches))


@router.put("/train/{train_id}/bulk")
async def bulk_update_coaches(
        train_id: int,
        coaches_data: List[CoachCreate],
        db: Session = Depends(get_db)
):
    """Bulk update coaches for a train (replace all coaches) and regenerate all seats"""
    # Verify train exists
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    try:
        # Delete existing coaches and their seats (cascade should handle seats)
        db.query(Coach).filter(Coach.train_id == train_id).delete()
        db.flush()

        # Create new coaches and generate seats
        new_coaches = []
        total_seats = 0

        for coach_data in coaches_data:
            # Convert Pydantic model to dict
            coach_dict = coach_data.model_dump()
            # Ensure train_id is set
            coach_dict['train_id'] = train_id

            # Create coach
            coach = Coach(**coach_dict)
            db.add(coach)
            db.flush()  # Get the ID without committing

            # Generate seats for this coach
            seat_data_list = SeatGenerator.generate_seats_for_coach(coach)
            for seat_data in seat_data_list:
                seat = Seat(**seat_data)
                db.add(seat)
                total_seats += 1

            new_coaches.append(coach)

        db.commit()

        # Refresh all new coaches
        for coach in new_coaches:
            db.refresh(coach)

        return {
            "message": "Coaches updated successfully",
            "coaches_count": len(new_coaches),
            "seats_count": total_seats,
            "coaches": [CoachResponse.from_orm(coach) for coach in new_coaches],
            "total": len(new_coaches)
        }
    except Exception as e:
        db.rollback()
        print(f"Error in bulk_update_coaches: {str(e)}")  # Add logging
        raise HTTPException(status_code=500, detail=f"Error updating coaches: {str(e)}")


@router.get("/{coach_id}/seats")
async def get_coach_seats(coach_id: int, db: Session = Depends(get_db)):
    """Get all seats for a specific coach with visual layout"""
    coach = db.query(Coach).filter(Coach.id == coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")

    # Get all seats ordered by row and position
    seats = db.query(Seat).filter(Seat.coach_id == coach_id).order_by(
        Seat.row_number, Seat.position_in_row
    ).all()

    # Organize seats by row for visual layout
    seat_layout = {}
    for seat in seats:
        if seat.row_number not in seat_layout:
            seat_layout[seat.row_number] = []
        seat_layout[seat.row_number].append(SeatResponse.from_orm(seat))

    return {
        "coach": CoachResponse.from_orm(coach),
        "seat_layout": seat_layout,
        "total_seats": len(seats)
    }


@router.get("/train/{train_id}/seats")
async def get_train_seats(train_id: int, db: Session = Depends(get_db)):
    """Get all seats for a train, organized by coach"""
    # Verify train exists
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    coaches = db.query(Coach).filter(
        Coach.train_id == train_id
    ).order_by(Coach.order_number).all()

    if not coaches:
        return {
            "train_id": train_id,
            "coaches": {},
            "total_seats": 0
        }

    seats_by_coach = {}
    total_seats = 0

    for coach in coaches:
        seats = db.query(Seat).filter(Seat.coach_id == coach.id).order_by(
            Seat.row_number, Seat.position_in_row
        ).all()

        seat_layout = {}
        for seat in seats:
            if seat.row_number not in seat_layout:
                seat_layout[seat.row_number] = []
            seat_layout[seat.row_number].append(SeatResponse.from_orm(seat))

        seats_by_coach[coach.id] = {
            'coach': CoachResponse.from_orm(coach),
            'seat_layout': seat_layout,
            'total_seats': len(seats)
        }
        total_seats += len(seats)

    return {
        "train_id": train_id,
        "coaches": seats_by_coach,
        "total_seats": total_seats
    }