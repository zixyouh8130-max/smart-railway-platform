# api/train_stops.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from ..core.database import get_db
from ..models.train_stop import TrainStop
from ..models.train import Train
from ..models.route_station import RouteStation
from ..schemas.train_stop import (
    TrainStopCreate,
    TrainStopUpdate,
    TrainStopResponse,
    TrainStopListResponse
)

router = APIRouter()


@router.get("/train/{train_id}", response_model=TrainStopListResponse)
async def get_train_stops(
        train_id: int,
        db: Session = Depends(get_db)
):
    """Get all stops for a specific train"""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    # 🔧 FIX: Use proper join and order by route_station.order_number
    stops = db.query(TrainStop).options(
        joinedload(TrainStop.route_station)
    ).join(
        RouteStation, TrainStop.route_station_id == RouteStation.id
    ).filter(
        TrainStop.train_id == train_id
    ).order_by(
        RouteStation.order_number  # ✅ Correct: order by the joined table's column
    ).all()

    # Enrich with station info
    result = []
    for stop in stops:
        stop_data = TrainStopResponse.model_validate(stop)
        if stop.route_station:
            stop_data.station_name = stop.route_station.station_name
            stop_data.station_code = stop.route_station.station_code
            stop_data.order_number = stop.route_station.order_number
        result.append(stop_data)

    return TrainStopListResponse(stops=result, total=len(result))


@router.post("/", response_model=TrainStopResponse, status_code=201)
async def create_train_stop(
        stop_data: TrainStopCreate,
        db: Session = Depends(get_db)
):
    """Add a stop to a train's schedule"""
    # Validate train exists
    train = db.query(Train).filter(Train.id == stop_data.train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    # Validate route station exists
    route_station = db.query(RouteStation).filter(
        RouteStation.id == stop_data.route_station_id
    ).first()
    if not route_station:
        raise HTTPException(status_code=404, detail="Route station not found")

    # Check for duplicate
    existing = db.query(TrainStop).filter(
        TrainStop.train_id == stop_data.train_id,
        TrainStop.route_station_id == stop_data.route_station_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Stop already exists for this train")

    try:
        stop = TrainStop(**stop_data.model_dump())
        db.add(stop)
        db.commit()
        db.refresh(stop)

        # Enrich response
        response = TrainStopResponse.model_validate(stop)
        response.station_name = route_station.station_name
        response.station_code = route_station.station_code
        response.order_number = route_station.order_number

        return response
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating stop: {str(e)}")


@router.put("/{stop_id}", response_model=TrainStopResponse)
async def update_train_stop(
        stop_id: int,
        stop_data: TrainStopUpdate,
        db: Session = Depends(get_db)
):
    """Update a train stop's schedule information"""
    stop = db.query(TrainStop).options(
        joinedload(TrainStop.route_station)
    ).filter(TrainStop.id == stop_id).first()

    if not stop:
        raise HTTPException(status_code=404, detail="Train stop not found")

    try:
        update_data = stop_data.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            setattr(stop, key, value)

        db.commit()
        db.refresh(stop)

        # Enrich response
        response = TrainStopResponse.model_validate(stop)
        if stop.route_station:
            response.station_name = stop.route_station.station_name
            response.station_code = stop.route_station.station_code
            response.order_number = stop.route_station.order_number

        return response
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating stop: {str(e)}")


@router.delete("/{stop_id}")
async def delete_train_stop(stop_id: int, db: Session = Depends(get_db)):
    """Remove a stop from a train's schedule"""
    stop = db.query(TrainStop).filter(TrainStop.id == stop_id).first()
    if not stop:
        raise HTTPException(status_code=404, detail="Train stop not found")

    try:
        db.delete(stop)
        db.commit()
        return {"message": "Train stop deleted successfully", "success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting stop: {str(e)}")


@router.post("/bulk/{train_id}")
async def bulk_create_train_stops(
        train_id: int,
        stops: List[TrainStopCreate],
        db: Session = Depends(get_db)
):
    """Bulk create/update stops for a train (replaces existing)"""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    try:
        # Remove existing stops
        db.query(TrainStop).filter(TrainStop.train_id == train_id).delete()

        # Add new stops
        for stop_data in stops:
            # Ensure train_id is set correctly
            stop_dict = stop_data.model_dump() if hasattr(stop_data, 'model_dump') else stop_data
            stop_dict['train_id'] = train_id
            stop = TrainStop(**stop_dict)
            db.add(stop)

        db.commit()

        return {
            "message": f"Successfully created {len(stops)} stops for train {train_id}",
            "count": len(stops)
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating stops: {str(e)}")


@router.patch("/{stop_id}/actual-times")
async def update_actual_times(
        stop_id: int,
        actual_arrival: Optional[str] = None,
        actual_departure: Optional[str] = None,
        status: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Update actual arrival/departure times (for real-time tracking)"""
    from datetime import time

    stop = db.query(TrainStop).filter(TrainStop.id == stop_id).first()
    if not stop:
        raise HTTPException(status_code=404, detail="Train stop not found")

    try:
        if actual_arrival:
            hour, minute = map(int, actual_arrival.split(':'))
            stop.actual_arrival_time = time(hour, minute)

        if actual_departure:
            hour, minute = map(int, actual_departure.split(':'))
            stop.actual_departure_time = time(hour, minute)

        if status:
            stop.status = status

        db.commit()
        db.refresh(stop)

        return {
            "message": "Actual times updated successfully",
            "stop": TrainStopResponse.model_validate(stop)
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating actual times: {str(e)}")