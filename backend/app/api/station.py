# backend/app/api/station.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
from ..models.station import Station
from ..models.route_station import RouteStation
from ..models.route import Route

import math
from collections import defaultdict

router = APIRouter()


# Pydantic Schemas
class StationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Station name")
    code: Optional[str] = Field(None, max_length=10, description="Station code (e.g., YGN)")
    city: Optional[str] = Field(None, max_length=100, description="City name")
    state_region: Optional[str] = Field(None, max_length=100, description="State or Region")
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude (-180 to 180)")
    is_active: bool = Field(True, description="Station active status")


class StationCreate(StationBase):
    @field_validator('latitude', 'longitude')
    @classmethod
    def validate_coordinates(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return round(v, 6)
        return v

    @field_validator('code')
    @classmethod
    def code_to_uppercase(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return v.upper()
        return v


class StationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=10)
    city: Optional[str] = Field(None, max_length=100)
    state_region: Optional[str] = Field(None, max_length=100)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    is_active: Optional[bool] = None

    @field_validator('latitude', 'longitude')
    @classmethod
    def validate_coordinates(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return round(v, 6)
        return v

    @field_validator('code')
    @classmethod
    def code_to_uppercase(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return v.upper()
        return v


class StationResponse(StationBase):
    id: int

    class Config:
        from_attributes = True


class StationDetailResponse(StationResponse):
    """Extended response with usage statistics"""
    route_count: int = 0

    class Config:
        from_attributes = True


class StationListResponse(BaseModel):
    total: int
    stations: List[StationResponse]


class ConnectedStationResponse(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    city: Optional[str] = None
    state_region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: bool = True
    route_ids: List[int] = []

    class Config:
        from_attributes = True


# API Endpoints
@router.get("/", response_model=StationListResponse)
async def get_all_stations(
        skip: int = Query(0, ge=0, description="Number of records to skip"),
        limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
        search: Optional[str] = Query(None, description="Search by name, code, or city"),
        city: Optional[str] = Query(None, description="Filter by city"),
        state_region: Optional[str] = Query(None, description="Filter by state/region"),
        is_active: Optional[bool] = Query(None, description="Filter by active status"),
        has_coordinates: Optional[bool] = Query(None, description="Filter stations with/without GPS coordinates"),
        sort_by: Optional[str] = Query("name", description="Sort field (name, city, state_region)"),
        sort_order: Optional[str] = Query("asc", description="Sort order (asc, desc)"),
        db: Session = Depends(get_db)
):
    """Get all stations with pagination, filtering, and sorting."""
    query = db.query(Station)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Station.name.ilike(search_term),
                Station.code.ilike(search_term),
                Station.city.ilike(search_term)
            )
        )

    if city:
        query = query.filter(Station.city.ilike(f"%{city}%"))

    if state_region:
        query = query.filter(Station.state_region.ilike(f"%{state_region}%"))

    if is_active is not None:
        query = query.filter(Station.is_active == is_active)

    if has_coordinates is not None:
        if has_coordinates:
            query = query.filter(
                Station.latitude.isnot(None),
                Station.longitude.isnot(None)
            )
        else:
            query = query.filter(
                or_(
                    Station.latitude.is_(None),
                    Station.longitude.is_(None)
                )
            )

    sort_column = getattr(Station, sort_by, Station.name)
    if sort_order.lower() == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    total = query.count()
    stations = query.offset(skip).limit(limit).all()

    return StationListResponse(
        total=total,
        stations=stations
    )


@router.get("/search", response_model=List[StationResponse])
async def search_stations(
        q: str = Query(..., min_length=1, description="Search query"),
        limit: int = Query(20, ge=1, le=100, description="Maximum results"),
        db: Session = Depends(get_db)
):
    """Quick search for stations (for autocomplete/dropdown)."""
    search_term = f"%{q}%"
    stations = db.query(Station).filter(
        or_(
            Station.name.ilike(search_term),
            Station.code.ilike(search_term),
            Station.city.ilike(search_term)
        ),
        Station.is_active == True
    ).order_by(Station.name).limit(limit).all()

    return stations


@router.get("/{station_id}", response_model=StationDetailResponse)
async def get_station(
        station_id: int,
        db: Session = Depends(get_db)
):
    """Get a specific station by ID with usage statistics."""
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found"
        )

    route_count = len(station.route_stations) if station.route_stations else 0

    response = StationDetailResponse(
        id=station.id,
        name=station.name,
        code=station.code,
        city=station.city,
        state_region=station.state_region,
        latitude=float(station.latitude) if station.latitude else None,
        longitude=float(station.longitude) if station.longitude else None,
        is_active=station.is_active,
        route_count=route_count
    )

    return response


@router.get("/{station_id}/with-routes", response_model=ConnectedStationResponse)
async def get_station_with_routes(
        station_id: int,
        db: Session = Depends(get_db)
):
    """Get a station with its associated route IDs."""
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found"
        )

    # Find all routes that include this station
    route_stations = db.query(RouteStation).filter(
        (RouteStation.station_id == station_id) |
        (RouteStation.station_name == station.name) |
        ((RouteStation.station_code == station.code) & (station.code != None))
    ).all()

    route_ids = list(set(rs.route_id for rs in route_stations))

    return ConnectedStationResponse(
        id=station.id,
        name=station.name,
        code=station.code,
        city=station.city,
        state_region=station.state_region,
        latitude=float(station.latitude) if station.latitude else None,
        longitude=float(station.longitude) if station.longitude else None,
        is_active=station.is_active,
        route_ids=route_ids
    )


@router.get("/by-route/{station_id}", response_model=List[ConnectedStationResponse])
async def get_connected_stations(
        station_id: int,
        db: Session = Depends(get_db)
):
    """
    Get stations that are reachable FROM the given station.
    Only returns stations that come AFTER the departure station in the route order.
    """
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found"
        )

    print(f"\nFinding reachable stations FROM: {station.name} (ID: {station.id})")

    # Find all route_stations that reference this station
    route_stations = db.query(RouteStation).filter(
        (RouteStation.station_id == station_id) |
        (RouteStation.station_name == station.name) |
        ((RouteStation.station_code == station.code) & (station.code != None))
    ).all()

    if not route_stations:
        print("  No routes found containing this station")
        return []

    station_routes = defaultdict(set)
    station_details = {}

    for rs in route_stations:
        route_id = rs.route_id
        departure_order = rs.order_number

        route = db.query(Route).filter(Route.id == route_id).first()
        route_name = route.name if route else f"Route {route_id}"
        print(f"  Route: {route_name}, Departure order: {departure_order}")

        # Get ALL stations on this route ordered by order_number
        all_route_stations = db.query(RouteStation).filter(
            RouteStation.route_id == route_id
        ).order_by(RouteStation.order_number).all()

        # Only get stations AFTER departure (higher order_number)
        for next_rs in all_route_stations:
            if next_rs.order_number > departure_order:
                station_obj = None

                # Try to get station by station_id first
                if next_rs.station_id:
                    station_obj = db.query(Station).filter(
                        Station.id == next_rs.station_id,
                        Station.is_active == True
                    ).first()

                # If not found, try by station_name
                if not station_obj and next_rs.station_name:
                    station_obj = db.query(Station).filter(
                        Station.name == next_rs.station_name,
                        Station.is_active == True
                    ).first()

                if station_obj:
                    # Skip if this is the departure station itself
                    if station_obj.id != station_id:
                        station_routes[station_obj.id].add(route_id)
                        if station_obj.id not in station_details:
                            station_details[station_obj.id] = station_obj

    # Build response
    result = []
    for station_id_key, route_ids_set in station_routes.items():
        if station_id_key in station_details:
            s = station_details[station_id_key]
            result.append(ConnectedStationResponse(
                id=s.id,
                name=s.name,
                code=s.code,
                city=s.city,
                state_region=s.state_region,
                latitude=float(s.latitude) if s.latitude else None,
                longitude=float(s.longitude) if s.longitude else None,
                is_active=s.is_active,
                route_ids=list(route_ids_set)
            ))

    print(f"  Total reachable stations: {len(result)}")
    return result


@router.get("/by-code/{code}", response_model=StationResponse)
async def get_station_by_code(
        code: str,
        db: Session = Depends(get_db)
):
    """Get a station by its unique code."""
    station = db.query(Station).filter(Station.code == code.upper()).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with code '{code}' not found"
        )
    return station


@router.post("/", response_model=StationResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin_user)])
async def create_station(
        station: StationCreate,
        db: Session = Depends(get_db)
):
    """Create a new station."""
    if station.code:
        existing = db.query(Station).filter(
            Station.code == station.code.upper()
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Station with code '{station.code}' already exists"
            )

    if station.city and station.name:
        existing = db.query(Station).filter(
            Station.name == station.name,
            Station.city == station.city
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Station '{station.name}' already exists in {station.city}"
            )

    db_station = Station(
        name=station.name,
        code=station.code.upper() if station.code else None,
        city=station.city,
        state_region=station.state_region,
        latitude=station.latitude,
        longitude=station.longitude,
        is_active=station.is_active
    )

    db.add(db_station)
    db.commit()
    db.refresh(db_station)

    return db_station


@router.post("/bulk", response_model=List[StationResponse], status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin_user)])
async def create_stations_bulk(
        stations: List[StationCreate],
        db: Session = Depends(get_db)
):
    """Create multiple stations at once."""
    db_stations = []
    errors = []

    for i, station_data in enumerate(stations):
        try:
            if station_data.code:
                existing = db.query(Station).filter(
                    Station.code == station_data.code.upper()
                ).first()
                if existing:
                    errors.append(f"Station {i + 1}: Code '{station_data.code}' already exists")
                    continue

            db_station = Station(
                name=station_data.name,
                code=station_data.code.upper() if station_data.code else None,
                city=station_data.city,
                state_region=station_data.state_region,
                latitude=station_data.latitude,
                longitude=station_data.longitude,
                is_active=station_data.is_active
            )
            db_stations.append(db_station)
        except Exception as e:
            errors.append(f"Station {i + 1}: {str(e)}")

    if errors and not db_stations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "No stations could be created", "errors": errors}
        )

    db.add_all(db_stations)
    db.commit()
    for station in db_stations:
        db.refresh(station)

    return db_stations


@router.put("/{station_id}", response_model=StationResponse, dependencies=[Depends(get_current_admin_user)])
async def update_station(
        station_id: int,
        station_update: StationUpdate,
        db: Session = Depends(get_db)
):
    """Update an existing station."""
    db_station = db.query(Station).filter(Station.id == station_id).first()
    if not db_station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found"
        )

    if station_update.code and station_update.code != db_station.code:
        existing = db.query(Station).filter(
            Station.code == station_update.code.upper()
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Station with code '{station_update.code}' already exists"
            )

    update_data = station_update.model_dump(exclude_unset=True)

    if 'code' in update_data and update_data['code']:
        update_data['code'] = update_data['code'].upper()

    for field, value in update_data.items():
        setattr(db_station, field, value)

    db.commit()
    db.refresh(db_station)

    return db_station


@router.delete("/{station_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(get_current_admin_user)])
async def delete_station(
        station_id: int,
        force: bool = Query(False, description="Force delete even if station is in use"),
        db: Session = Depends(get_db)
):
    """Delete a station."""
    db_station = db.query(Station).filter(Station.id == station_id).first()
    if not db_station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found"
        )

    if db_station.route_stations and not force:
        route_names = [rs.route.name for rs in db_station.route_stations if rs.route]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Station cannot be deleted because it is used in routes",
                "routes": route_names[:5],
                "total_routes": len(route_names),
                "hint": "Use force=true to delete anyway"
            }
        )

    try:
        station_name = db_station.name
        db.delete(db_station)
        db.commit()
        return {
            "message": f"Station '{station_name}' deleted successfully",
            "station_id": station_id
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete station: {str(e)}"
        )


@router.get("/nearby/coordinates", response_model=List[StationResponse])
async def find_nearby_stations(
        latitude: float = Query(..., ge=-90, le=90),
        longitude: float = Query(..., ge=-180, le=180),
        radius_miles: float = Query(
            31,
            ge=1,
            le=311,
            description="Search radius in miles",
        ),
        limit: int = Query(10, ge=1, le=50),
        db: Session = Depends(get_db)
):
    """Find stations near given coordinates using a miles-based bounding box."""
    # One degree of latitude is approximately 69 statute miles.
    miles_per_degree_latitude = 69.0
    lat_delta = radius_miles / miles_per_degree_latitude

    cos_latitude = math.cos(math.radians(latitude))
    # Avoid division by zero very near the poles.
    lon_denominator = max(
        miles_per_degree_latitude * abs(cos_latitude),
        0.000001,
    )
    lon_delta = radius_miles / lon_denominator

    min_lat = latitude - lat_delta
    max_lat = latitude + lat_delta
    min_lon = longitude - lon_delta
    max_lon = longitude + lon_delta

    stations = db.query(Station).filter(
        Station.latitude.isnot(None),
        Station.longitude.isnot(None),
        Station.latitude.between(min_lat, max_lat),
        Station.longitude.between(min_lon, max_lon),
        Station.is_active == True
    ).limit(limit).all()

    return stations