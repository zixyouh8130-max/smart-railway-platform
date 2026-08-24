# api/route.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
from ..models.route import Route
from ..models.route_station import RouteStation
from ..schemas.route import (
    RouteCreate,
    RouteUpdate,
    RouteResponse,
    RouteListResponse,
)
from ..schemas.route_station import RouteStationCreate, RouteStationUpdate
from ..services.schedule_service import ScheduleService

router = APIRouter()


@router.get("/", response_model=RouteListResponse)
async def get_routes(
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100),
        status: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Get all routes with optional filtering"""
    query = db.query(Route).options(joinedload(Route.stations))

    if status:
        query = query.filter(Route.status == status)

    total = query.count()
    routes = query.offset(skip).limit(limit).all()

    return RouteListResponse(routes=routes, total=total)


@router.get("/{route_id}", response_model=RouteResponse)
async def get_route(route_id: int, db: Session = Depends(get_db)):
    """Get a single route by ID with stations"""
    route = db.query(Route).options(
        joinedload(Route.stations)
    ).filter(Route.id == route_id).first()

    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route


@router.get("/{route_id}/schedule/{train_id}")
async def get_route_train_schedule(
        route_id: int,
        train_id: int,
        db: Session = Depends(get_db)
):
    """Get schedule for a specific train on a route"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    service = ScheduleService(db)
    schedule = service.get_train_schedule(train_id, route_id)

    return {
        "route_id": route_id,
        "train_id": train_id,
        "route_name": route.name,
        "origin": route.origin,
        "destination": route.destination,
        "stations": schedule
    }


@router.post("/{route_id}/calculate-schedule/{train_id}", dependencies=[Depends(get_current_admin_user)])
async def calculate_train_schedule(
        route_id: int,
        train_id: int,
        departure_time: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Calculate and update arrival/departure times for a specific train"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    try:
        service = ScheduleService(db)
        schedule = service.calculate_train_arrival_times(
            route_id=route_id,
            train_id=train_id,
            departure_time=departure_time
        )
        return {
            "message": "Train schedule calculated successfully",
            "route_id": route_id,
            "train_id": train_id,
            "route_name": route.name,
            "schedule": schedule
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating schedule: {str(e)}")


@router.get("/{route_id}/next-train/{train_id}")
async def get_next_train_arrival(
        route_id: int,
        train_id: int,
        station_order: int = Query(..., ge=1, description="Station order number in the route"),
        db: Session = Depends(get_db)
):
    """Get the next train arrival time for a specific station"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    try:
        service = ScheduleService(db)
        result = service.calculate_next_train_arrival(route_id, train_id, station_order)
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Station with order {station_order} not found or has no arrival time configured"
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/", response_model=RouteResponse, status_code=201, dependencies=[Depends(get_current_admin_user)])
async def create_route(route_data: RouteCreate, db: Session = Depends(get_db)):
    """Create a new route with stations"""
    try:
        # Create route - only pass fields that exist in the model
        route = Route(
            name=route_data.name,
            origin=route_data.origin,
            destination=route_data.destination,
            distance=route_data.distance,
            duration=route_data.duration,
            base_price=route_data.base_price,
            status=route_data.status,
        )
        db.add(route)
        db.flush()

        # Add stations
        if route_data.stations:
            for station_data in route_data.stations:
                station = RouteStation(
                    route_id=route.id,
                    station_id=station_data.station_id,
                    station_name=station_data.station_name,
                    station_code=station_data.station_code,
                    order_number=station_data.order_number,
                    distance_from_origin=station_data.distance_from_origin,
                    is_major_stop=station_data.is_major_stop,
                    time_from_origin_minutes=station_data.time_from_origin_minutes
                )
                db.add(station)

        db.commit()
        db.refresh(route)

        # Reload with relationships
        route = db.query(Route).options(
            joinedload(Route.stations)
        ).filter(Route.id == route.id).first()

        return route
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating route: {str(e)}")


@router.put("/{route_id}", response_model=RouteResponse, dependencies=[Depends(get_current_admin_user)])
async def update_route(route_id: int, route_data: RouteUpdate, db: Session = Depends(get_db)):
    """Update an existing route"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    try:
        update_data = route_data.model_dump(exclude_unset=True)

        # Remove any fields that don't exist in the model
        allowed_fields = {'name', 'origin', 'destination', 'distance', 'duration', 'base_price', 'status'}
        filtered_data = {k: v for k, v in update_data.items() if k in allowed_fields}

        for key, value in filtered_data.items():
            setattr(route, key, value)

        db.commit()
        db.refresh(route)

        # Reload with relationships
        route = db.query(Route).options(
            joinedload(Route.stations)
        ).filter(Route.id == route.id).first()

        return route
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating route: {str(e)}")


@router.delete("/{route_id}", dependencies=[Depends(get_current_admin_user)])
async def delete_route(route_id: int, db: Session = Depends(get_db)):
    """Delete a route"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    try:
        db.delete(route)
        db.commit()
        return {"message": "Route deleted successfully", "success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting route: {str(e)}")


@router.put("/{route_id}/stations", response_model=RouteResponse, dependencies=[Depends(get_current_admin_user)])
async def update_route_stations(
        route_id: int,
        stations: List[RouteStationCreate],
        db: Session = Depends(get_db)
):
    """Update stations for a route"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    try:
        # Remove existing stations
        db.query(RouteStation).filter(RouteStation.route_id == route_id).delete()

        # Add new stations
        for station_data in stations:
            station = RouteStation(
                route_id=route_id,
                station_id=station_data.station_id,
                station_name=station_data.station_name,
                station_code=station_data.station_code,
                order_number=station_data.order_number,
                distance_from_origin=station_data.distance_from_origin,
                is_major_stop=station_data.is_major_stop,
                time_from_origin_minutes=station_data.time_from_origin_minutes
            )
            db.add(station)

        db.commit()
        db.refresh(route)

        # Reload with relationships
        route = db.query(Route).options(
            joinedload(Route.stations)
        ).filter(Route.id == route.id).first()

        return route
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating stations: {str(e)}")


@router.patch("/{route_id}/stations/{station_id}", dependencies=[Depends(get_current_admin_user)])
async def update_route_station_info(
        route_id: int,
        station_id: int,
        station_update: RouteStationUpdate,
        db: Session = Depends(get_db)
):
    """Update general information for a specific station on a route"""
    station = db.query(RouteStation).filter(
        RouteStation.route_id == route_id,
        RouteStation.id == station_id
    ).first()

    if not station:
        raise HTTPException(status_code=404, detail="Station not found on this route")

    try:
        update_data = station_update.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            setattr(station, key, value)

        db.commit()
        db.refresh(station)

        return {
            "message": "Station updated successfully",
            "station": station
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating station: {str(e)}")