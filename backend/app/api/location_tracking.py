from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.dependencies import get_current_train_crew
from ..services.location_tracking_service import LocationTrackingService

router = APIRouter()


class LocationUpdate(BaseModel):
    device_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = Field(
        None,
        ge=0,
        description="Speed in miles per hour (mph)",
    )
    accuracy: Optional[float] = Field(None, ge=0)
    # Backward-compatible manual-arrival path. The UI uses the dedicated
    # /manual-arrival endpoint below, but older clients can still use this.
    manual_arrival: bool = False
    route_station_id: Optional[int] = None
    train_stop_id: Optional[int] = None


class ManualArrivalRequest(BaseModel):
    route_station_id: int
    train_stop_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DepartureRequest(BaseModel):
    manual_departure: bool = False
    route_station_id: Optional[int] = None


def _staff_code(current_user: dict) -> str:
    return (current_user.get("staff") or {}).get("staff_id")


@router.post("/update-location")
async def update_location(
    location: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_train_crew),
):
    try:
        return LocationTrackingService(db).update_device_location(
            device_id=location.device_id,
            latitude=location.latitude,
            longitude=location.longitude,
            speed=location.speed,
            accuracy=location.accuracy,
            manual_arrival=location.manual_arrival,
            route_station_id=location.route_station_id,
            train_stop_id=location.train_stop_id,
            actor_staff_id=_staff_code(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/manual-arrival/{device_id}")
async def manual_arrival(
    device_id: str,
    request: ManualArrivalRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_train_crew),
):
    """Manual fallback for the next expected station only."""
    try:
        return LocationTrackingService(db).manual_arrival(
            device_id=device_id,
            route_station_id=request.route_station_id,
            train_stop_id=request.train_stop_id,
            latitude=request.latitude,
            longitude=request.longitude,
            actor_staff_id=_staff_code(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/log-departure/{device_id}/{train_stop_id}")
async def log_departure(
    device_id: str,
    train_stop_id: int,
    departure_data: Optional[DepartureRequest] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_train_crew),
):
    try:
        return LocationTrackingService(db).log_departure(
            device_id=device_id,
            train_stop_id=train_stop_id,
            manual_departure=(departure_data.manual_departure if departure_data else False),
            route_station_id=(departure_data.route_station_id if departure_data else None),
            actor_staff_id=_staff_code(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/device-status/{device_id}")
async def get_device_status(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_train_crew),
):
    try:
        return LocationTrackingService(db).get_device_status(
            device_id,
            actor_staff_id=_staff_code(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
