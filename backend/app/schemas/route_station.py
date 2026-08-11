# schemas/route_station.py
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional


class RouteStationBase(BaseModel):
    """Base schema for route station - general route data only"""
    station_id: Optional[int] = None
    station_name: str = Field(..., min_length=1, max_length=100)
    station_code: Optional[str] = Field(None, max_length=10)
    order_number: int = Field(..., ge=1)
    distance_from_origin: Optional[float] = Field(0.0, ge=0)
    is_major_stop: bool = False
    time_from_origin_minutes: Optional[int] = Field(None, ge=0)

    @field_validator('station_name')
    @classmethod
    def station_name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Station name is required')
        return v.strip()

    @field_validator('station_code')
    @classmethod
    def station_code_format(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return v.strip().upper()
        return v


class RouteStationCreate(RouteStationBase):
    """Schema for creating a route station"""
    pass


class RouteStationUpdate(BaseModel):
    """Schema for updating route station general info"""
    station_name: Optional[str] = Field(None, min_length=1, max_length=100)
    station_code: Optional[str] = Field(None, max_length=10)
    order_number: Optional[int] = Field(None, ge=1)
    distance_from_origin: Optional[float] = Field(None, ge=0)
    is_major_stop: Optional[bool] = None
    time_from_origin_minutes: Optional[int] = Field(None, ge=0)

    @field_validator('station_name')
    @classmethod
    def station_name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and (not v or not v.strip()):
            raise ValueError('Station name cannot be empty')
        return v.strip() if v else v

    @field_validator('station_code')
    @classmethod
    def station_code_format(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return v.strip().upper()
        return v


class RouteStationResponse(RouteStationBase):
    """Schema for route station response"""
    id: int
    route_id: int

    model_config = ConfigDict(
        from_attributes=True,
        extra='ignore'  # 🔧 IMPORTANT: Ignore extra fields from database (old schedule/fee fields)
    )