# schemas/schedule.py
from pydantic import BaseModel, Field, field_validator, ConfigDict, model_validator
from typing import Optional, List, Any
from datetime import date, datetime, time
import re


class ScheduleBase(BaseModel):
    train_id: int
    departure_date: date
    status: str = Field(default="SCHEDULED")

    @field_validator('departure_date')
    @classmethod
    def departure_date_must_be_valid(cls, v: date) -> date:
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed_statuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DELAYED']
        if v not in allowed_statuses:
            raise ValueError(f'Status must be one of {allowed_statuses}')
        return v


class ScheduleCreate(ScheduleBase):
    departure_time: Optional[str] = Field(None, description="Departure time in HH:MM format")
    arrival_time: Optional[str] = Field(None, description="Arrival time in HH:MM format")
    is_overnight: bool = Field(default=False, description="Whether the schedule spans midnight")
    arrival_date: Optional[date] = Field(None, description="Arrival date if different from departure_date")

    # 🆕 Staff assignment fields
    driver_id: Optional[str] = Field(None, description="Staff ID of the train driver")
    assistant_driver_id: Optional[str] = Field(None, description="Staff ID of the assistant driver")
    guard_id: Optional[str] = Field(None, description="Staff ID of the train guard")
    ticket_checker_ids: List[str] = Field(default_factory=list, description="List of staff IDs for ticket checkers")

    @field_validator('departure_time', 'arrival_time')
    @classmethod
    def validate_time_format(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not re.match(r'^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', v):
                raise ValueError('Time must be in HH:MM format')
        return v

    @model_validator(mode='after')
    def validate_arrival_and_overnight(self) -> 'ScheduleCreate':
        if self.is_overnight:
            if self.arrival_time and self.departure_time:
                if self.arrival_time > self.departure_time:
                    pass
        else:
            if self.arrival_time and self.departure_time:
                if self.arrival_time <= self.departure_time:
                    raise ValueError(
                        'Arrival time must be after departure time. '
                        'If this is an overnight schedule, set is_overnight=True'
                    )
        return self


class ScheduleUpdate(BaseModel):
    train_id: Optional[int] = None
    departure_date: Optional[date] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    status: Optional[str] = None
    is_overnight: Optional[bool] = None
    arrival_date: Optional[date] = None

    # 🆕 Staff assignment fields
    driver_id: Optional[str] = Field(None, description="Staff ID of the train driver")
    assistant_driver_id: Optional[str] = Field(None, description="Staff ID of the assistant driver")
    guard_id: Optional[str] = Field(None, description="Staff ID of the train guard")
    ticket_checker_ids: Optional[List[str]] = Field(None, description="List of staff IDs for ticket checkers")

    @field_validator('departure_time', 'arrival_time')
    @classmethod
    def validate_time_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r'^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', v):
            raise ValueError('Time must be in HH:MM format')
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed_statuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DELAYED']
        if v not in allowed_statuses:
            raise ValueError(f'Status must be one of {allowed_statuses}')
        return v


class ScheduleBulkCreate(BaseModel):
    schedules: List[ScheduleCreate] = Field(..., min_items=1, description="List of schedules to create")

    class Config:
        from_attributes = True


class ScheduleBulkResponse(BaseModel):
    success: bool
    created: int
    failed: int
    schedules: List[Any] = Field(default_factory=list)
    errors: Optional[List[dict]] = None


class TrainInfo(BaseModel):
    id: int
    train_no: str
    train_name: str

    model_config = ConfigDict(from_attributes=True)


# 🆕 Staff Assignment Info for response
class StaffAssignmentInfo(BaseModel):
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    role: Optional[str] = None

    class Config:
        from_attributes = True


def _time_to_str(v: Any) -> Optional[str]:
    """Convert time object or string to HH:MM string format"""
    if v is None:
        return None
    if isinstance(v, time):
        return v.strftime('%H:%M')
    if isinstance(v, str):
        return v
    return str(v)


class ScheduleResponse(ScheduleBase):
    id: int
    route_id: int
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    is_overnight: bool = False
    arrival_date: Optional[date] = None
    train: Optional[TrainInfo] = None

    # 🆕 Staff assignment fields in response
    driver_id: Optional[str] = None
    assistant_driver_id: Optional[str] = None
    guard_id: Optional[str] = None
    ticket_checker_ids: Optional[List[str]] = None

    # 🆕 Staff assignment details (populated from relationships)
    staff_assignments: Optional[List[dict]] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator('departure_time', mode='before')
    @classmethod
    def convert_departure_time(cls, v: Any) -> Optional[str]:
        return _time_to_str(v)

    @field_validator('arrival_time', mode='before')
    @classmethod
    def convert_arrival_time(cls, v: Any) -> Optional[str]:
        return _time_to_str(v)

    @field_validator('ticket_checker_ids', mode='before')
    @classmethod
    def convert_ticket_checker_ids(cls, v: Any) -> Optional[List[str]]:
        """Convert ticket_checker_ids from various formats to list of strings"""
        if v is None:
            return None
        if isinstance(v, list):
            return [str(item) for item in v]
        if isinstance(v, str):
            # Handle comma-separated string
            return [item.strip() for item in v.split(',') if item.strip()]
        return []


class ScheduleListResponse(BaseModel):
    schedules: List[ScheduleResponse]
    total: int


class ScheduleSearchItem(BaseModel):
    schedule_id: int
    route_id: int
    route_name: str

    train_id: Optional[int] = None
    train_no: Optional[str] = None
    train_name: Optional[str] = None

    departure_station: str
    arrival_station: str

    # Station-specific expected time derived from TrainStop.
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None

    timing_available: bool = False
    timing_source: str = "TRAIN_STOP_EXPECTED"

    available_seats: Optional[int] = None
    status: Optional[str] = None
    days_of_week: Optional[str] = None

    departure_station_order: Optional[int] = None
    arrival_station_order: Optional[int] = None

    estimated_travel_time_minutes: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)