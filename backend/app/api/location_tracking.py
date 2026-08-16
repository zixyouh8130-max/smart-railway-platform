# api/location_tracking.py - Updated version

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from ..core.database import get_db
from ..services.location_tracking_service import LocationTrackingService

router = APIRouter()

class LocationUpdate(BaseModel):
    device_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = None
    accuracy: Optional[float] = None
    manual_arrival: Optional[bool] = False
    route_station_id: Optional[int] = None
    train_stop_id: Optional[int] = None

# And update the departure endpoint
class DepartureRequest(BaseModel):
    manual_departure: Optional[bool] = False
    route_station_id: Optional[int] = None


@router.post("/update-location")
async def update_location(
        location: LocationUpdate,
        db: Session = Depends(get_db)
):
    """Update device location and check for station arrivals"""
    print(f"📍 Location update received: {location.model_dump()}")

    try:
        # Import your service
        from ..services.location_tracking_service import LocationTrackingService
        service = LocationTrackingService(db)

        result = service.update_device_location(
            device_id=location.device_id,
            latitude=location.latitude,
            longitude=location.longitude,
            speed=location.speed,
            accuracy=location.accuracy,
            manual_arrival=location.manual_arrival,
            route_station_id=location.route_station_id,
            train_stop_id=location.train_stop_id
        )

        print(f"✅ Location update result: {result}")
        return result

    except ValueError as e:
        print(f"❌ ValueError: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class DepartureRequest(BaseModel):
    manual_departure: Optional[bool] = False
    route_station_id: Optional[int] = None

@router.post("/log-departure/{device_id}/{train_stop_id}")
async def log_departure(
    device_id: str,
    train_stop_id: int,
    departure_data: Optional[DepartureRequest] = None,
    db: Session = Depends(get_db)
):
    """Log departure from a station"""
    service = LocationTrackingService(db)
    try:
        result = service.log_departure(
            device_id=device_id,
            train_stop_id=train_stop_id,
            manual_departure=departure_data.manual_departure if departure_data else False,
            route_station_id=departure_data.route_station_id if departure_data else None
        )
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