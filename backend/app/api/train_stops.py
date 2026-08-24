from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
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


def _validate_route_station_for_train(
    db: Session,
    train: Train,
    route_station_id: int
) -> RouteStation:
    route_station = (
        db.query(RouteStation)
        .filter(RouteStation.id == route_station_id)
        .first()
    )

    if not route_station:
        raise HTTPException(
            status_code=404,
            detail="Route station not found"
        )

    if train.route_id is None:
        raise HTTPException(
            status_code=400,
            detail="Train has no assigned route"
        )

    if route_station.route_id != train.route_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "Route station does not belong to "
                "the train's assigned route"
            )
        )

    return route_station


def _enrich(stop: TrainStop) -> TrainStopResponse:
    response = TrainStopResponse.model_validate(stop)

    if stop.route_station:
        response.station_name = stop.route_station.station_name
        response.station_code = stop.route_station.station_code
        response.order_number = stop.route_station.order_number

    return response


@router.get(
    "/train/{train_id}",
    response_model=TrainStopListResponse
)
async def get_train_stops(
    train_id: int,
    db: Session = Depends(get_db)
):
    """
    Read the STATIC timetable template for a train.

    This endpoint intentionally returns no actual/runtime state.
    """
    train = (
        db.query(Train)
        .filter(Train.id == train_id)
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    stops = (
        db.query(TrainStop)
        .options(joinedload(TrainStop.route_station))
        .join(
            RouteStation,
            TrainStop.route_station_id == RouteStation.id
        )
        .filter(TrainStop.train_id == train_id)
        .order_by(RouteStation.order_number)
        .all()
    )

    result = [_enrich(stop) for stop in stops]

    return TrainStopListResponse(
        stops=result,
        total=len(result)
    )


@router.post(
    "/",
    response_model=TrainStopResponse,
    status_code=201,
    dependencies=[Depends(get_current_admin_user)]
)
async def create_train_stop(
    stop_data: TrainStopCreate,
    db: Session = Depends(get_db)
):
    train = (
        db.query(Train)
        .filter(Train.id == stop_data.train_id)
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    route_station = _validate_route_station_for_train(
        db,
        train,
        stop_data.route_station_id
    )

    existing = (
        db.query(TrainStop)
        .filter(
            TrainStop.train_id == stop_data.train_id,
            TrainStop.route_station_id == stop_data.route_station_id
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Stop already exists for this train"
        )

    try:
        stop = TrainStop(**stop_data.model_dump())
        db.add(stop)
        db.commit()
        db.refresh(stop)

        stop = (
            db.query(TrainStop)
            .options(joinedload(TrainStop.route_station))
            .filter(TrainStop.id == stop.id)
            .first()
        )

        return _enrich(stop)

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error creating stop: {exc}"
        )


@router.put(
    "/{stop_id}",
    response_model=TrainStopResponse,
    dependencies=[Depends(get_current_admin_user)]
)
async def update_train_stop(
    stop_id: int,
    stop_data: TrainStopUpdate,
    db: Session = Depends(get_db)
):
    """
    Update STATIC expected timetable/configuration only.

    Runtime arrival/departure state is not accepted here.
    """
    stop = (
        db.query(TrainStop)
        .options(joinedload(TrainStop.route_station))
        .filter(TrainStop.id == stop_id)
        .first()
    )

    if not stop:
        raise HTTPException(
            status_code=404,
            detail="Train stop not found"
        )

    try:
        update_data = stop_data.model_dump(
            exclude_unset=True
        )

        for key, value in update_data.items():
            setattr(stop, key, value)

        db.commit()
        db.refresh(stop)

        return _enrich(stop)

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error updating stop: {exc}"
        )


@router.delete("/{stop_id}", dependencies=[Depends(get_current_admin_user)])
async def delete_train_stop(
    stop_id: int,
    db: Session = Depends(get_db)
):
    stop = (
        db.query(TrainStop)
        .filter(TrainStop.id == stop_id)
        .first()
    )

    if not stop:
        raise HTTPException(
            status_code=404,
            detail="Train stop not found"
        )

    try:
        db.delete(stop)
        db.commit()

        return {
            "message": "Train stop deleted successfully",
            "success": True
        }

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting stop: {exc}"
        )


@router.post("/bulk/{train_id}", dependencies=[Depends(get_current_admin_user)])
async def bulk_create_train_stops(
    train_id: int,
    stops: List[TrainStopCreate],
    db: Session = Depends(get_db)
):
    """
    Replace the STATIC timetable template for a train.

    All supplied route_station_id values must belong to the train's route.
    """
    train = (
        db.query(Train)
        .filter(Train.id == train_id)
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    if not stops:
        raise HTTPException(
            status_code=400,
            detail="At least one train stop is required"
        )

    # Validate before deleting the existing template.
    seen_route_station_ids = set()

    for stop_data in stops:
        _validate_route_station_for_train(
            db,
            train,
            stop_data.route_station_id
        )

        if stop_data.route_station_id in seen_route_station_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Duplicate route_station_id in bulk payload: "
                    f"{stop_data.route_station_id}"
                )
            )

        seen_route_station_ids.add(
            stop_data.route_station_id
        )

    try:
        current_route_station_ids = [
            row.id
            for row in db.query(RouteStation).filter(
                RouteStation.route_id == train.route_id
            ).all()
        ]

        if current_route_station_ids:
            (
                db.query(TrainStop)
                .filter(
                    TrainStop.train_id == train_id,
                    TrainStop.route_station_id.in_(current_route_station_ids),
                )
                .delete(synchronize_session=False)
            )

        for stop_data in stops:
            stop_dict = stop_data.model_dump()
            stop_dict["train_id"] = train_id
            db.add(TrainStop(**stop_dict))

        db.commit()

        return {
            "message": (
                f"Successfully replaced timetable with "
                f"{len(stops)} stops for train {train_id}"
            ),
            "count": len(stops)
        }

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error replacing train stops: {exc}"
        )


# IMPORTANT:
# The old PATCH /{stop_id}/actual-times endpoint is intentionally removed.
# Actual runtime arrival/departure belongs to StationArrivalLog and must be
# scoped by schedule_id.
