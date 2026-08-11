# api/location_tracking.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from ..core.database import get_db
from ..core.dependencies import get_current_user_id
from ..services.location_tracking_service import LocationTrackingService

router = APIRouter()


class LocationUpdate(BaseModel):
    device_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = None
    accuracy: Optional[float] = None


@router.post("/update-location")
async def update_location(
    location: LocationUpdate,
    db: Session = Depends(get_db)
):
    """Update device location and check for station arrivals"""
    service = LocationTrackingService(db)
    try:
        result = service.update_device_location(
            device_id=location.device_id,
            latitude=location.latitude,
            longitude=location.longitude,
            speed=location.speed,
            accuracy=location.accuracy
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/log-departure/{device_id}/{train_stop_id}")
async def log_departure(
    device_id: str,
    train_stop_id: int,
    db: Session = Depends(get_db)
):
    """Log departure from a station"""
    service = LocationTrackingService(db)
    try:
        result = service.log_departure(device_id, train_stop_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/device-status/{device_id}")
async def get_device_status(
    device_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed status of a train rider device"""
    service = LocationTrackingService(db)
    try:
        result = service.get_device_status(device_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))