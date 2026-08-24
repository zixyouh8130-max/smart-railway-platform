from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
from ..services.train_tracking_dashboard_service import TrainTrackingDashboardService

router = APIRouter(
    tags=["Dashboard"],
    dependencies=[Depends(get_current_admin_user)],
)

@router.get("/active-trains")
async def get_active_trains_overview(db: Session = Depends(get_db)):
    return TrainTrackingDashboardService(db).get_active_trains_overview()

@router.get("/train/{train_id}")
async def get_train_detailed_status(train_id: int, db: Session = Depends(get_db)):
    return TrainTrackingDashboardService(db).get_train_detailed_status(train_id)

@router.get("/nearby-stations")
async def get_nearby_stations(
    latitude: float,
    longitude: float,
    radius_miles: float = Query(
        default=6,
        ge=1,
        le=31,
        description="Search radius in miles",
    ),
    db: Session = Depends(get_db),
):
    return TrainTrackingDashboardService(db).get_nearby_stations(
        latitude, longitude, radius_miles
    )
