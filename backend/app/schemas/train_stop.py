# schemas/train_stop.py
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import time


class TrainStopBase(BaseModel):
    """Base schema for train stop - train-specific schedule data"""
    expected_arrival_time: Optional[time] = None
    expected_departure_time: Optional[time] = None
    arrival_buffer_minutes: Optional[int] = Field(0, ge=0)
    departure_buffer_minutes: Optional[int] = Field(0, ge=0)
    stop_duration_minutes: Optional[int] = Field(2, ge=0)
    is_timed_stop: bool = True

    @field_validator('expected_arrival_time', 'expected_departure_time')
    @classmethod
    def validate_time_order(cls, v: Optional[time], info) -> Optional[time]:
        """Validate that departure time is after arrival time"""
        values = info.data
        arrival = values.get('expected_arrival_time')
        departure = values.get('expected_departure_time')

        if arrival and departure and arrival >= departure:
            raise ValueError('Departure time must be after arrival time')
        return v


class TrainStopCreate(TrainStopBase):
    """Schema for creating a train stop"""
    train_id: int
    route_station_id: int


class TrainStopUpdate(BaseModel):
    """Schema for updating train stop schedule"""
    expected_arrival_time: Optional[time] = None
    expected_departure_time: Optional[time] = None
    arrival_buffer_minutes: Optional[int] = Field(None, ge=0)
    departure_buffer_minutes: Optional[int] = Field(None, ge=0)
    stop_duration_minutes: Optional[int] = Field(None, ge=0)
    is_timed_stop: Optional[bool] = None


class TrainStopResponse(TrainStopBase):
    """Schema for train stop response with related station info"""
    id: int
    train_id: int
    route_station_id: int
    # Additional station info (populated from relationship)
    station_name: Optional[str] = None
    station_code: Optional[str] = None
    order_number: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class TrainStopListResponse(BaseModel):
    """Schema for list of train stops"""
    stops: list[TrainStopResponse]
    total: int