# schemas/route.py
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List
from datetime import datetime
from .route_station import RouteStationCreate, RouteStationResponse


class RouteBase(BaseModel):
    """Base schema for route"""
    name: str = Field(..., min_length=1, max_length=100)
    origin: str = Field(..., min_length=1, max_length=100)
    destination: str = Field(..., min_length=1, max_length=100)
    distance: Optional[float] = Field(
        None,
        ge=0,
        description="Route distance in miles",
    )
    duration: Optional[str] = None
    base_price: Optional[float] = Field(None, ge=0)
    status: str = Field(default="ACTIVE")

    @field_validator('name', 'origin', 'destination')
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('This field is required')
        return v.strip()

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed_statuses = ['ACTIVE', 'INACTIVE']
        if v not in allowed_statuses:
            raise ValueError(f'Status must be one of {allowed_statuses}')
        return v


class RouteCreate(RouteBase):
    """Schema for creating a route with stations"""
    stations: List[RouteStationCreate] = Field(default_factory=list)

    model_config = ConfigDict(extra='ignore')

    @field_validator('stations')
    @classmethod
    def validate_stations_order(cls, v: Optional[List[RouteStationCreate]]) -> Optional[List[RouteStationCreate]]:
        if v and len(v) > 0:
            order_numbers = [s.order_number for s in v]
            if len(order_numbers) != len(set(order_numbers)):
                raise ValueError('Station order numbers must be unique')
            expected = list(range(1, len(v) + 1))
            if sorted(order_numbers) != expected:
                raise ValueError(f'Station order numbers must be sequential from 1 to {len(v)}')
        return v


class RouteUpdate(BaseModel):
    """Schema for updating a route"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    origin: Optional[str] = Field(None, min_length=1, max_length=100)
    destination: Optional[str] = Field(None, min_length=1, max_length=100)
    distance: Optional[float] = Field(
        None,
        ge=0,
        description="Route distance in miles",
    )
    duration: Optional[str] = None
    base_price: Optional[float] = Field(None, ge=0)
    status: Optional[str] = None

    model_config = ConfigDict(extra='ignore')

    @field_validator('name', 'origin', 'destination')
    @classmethod
    def must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and (not v or not v.strip()):
            raise ValueError('This field cannot be empty')
        return v.strip() if v else v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed_statuses = ['ACTIVE', 'INACTIVE']
            if v not in allowed_statuses:
                raise ValueError(f'Status must be one of {allowed_statuses}')
        return v


class RouteResponse(RouteBase):
    """Schema for route response"""
    id: int
    distance_unit: str = "mile"
    stations: List[RouteStationResponse] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(
        from_attributes=True,
        extra='ignore'
    )


class RouteListResponse(BaseModel):
    """Schema for list of routes"""
    routes: List[RouteResponse]
    total: int


class RouteScheduleResponse(BaseModel):
    """Schema for route schedule (all trains)"""
    route_id: int
    route_name: str
    origin: str
    destination: str
    trains: list