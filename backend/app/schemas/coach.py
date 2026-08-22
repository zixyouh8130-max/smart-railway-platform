from pydantic import BaseModel, validator, ConfigDict
from typing import Optional, List
from datetime import datetime


class SeatBase(BaseModel):
    seat_number: str
    seat_type: str = "REGULAR"
    row_number: int
    position_in_row: int
    is_active: bool = True


class SeatCreate(SeatBase):
    pass


class SeatResponse(SeatBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    coach_id: int
    created_at: datetime
    updated_at: datetime


class CoachBase(BaseModel):
    coach_type: str = "ECONOMY"
    name: str
    rows: int = 10
    seats_per_row: int = 6
    total_seats: int = 60
    order_number: int = 1
    is_active: bool = True

    @validator('coach_type')
    def validate_coach_type(cls, v):
        allowed_types = ['FIRST_CLASS', 'ECONOMY', 'SLEEPER', 'DINING', 'BAGGAGE']
        if v not in allowed_types:
            raise ValueError(f'Invalid coach type. Must be one of: {allowed_types}')
        return v

    @validator('total_seats')
    def validate_total_seats(cls, v, values):
        if 'rows' in values and 'seats_per_row' in values:
            expected = values['rows'] * values['seats_per_row']
            if v != expected:
                return expected
        return v


class CoachCreate(CoachBase):
    train_id: int


class CoachUpdate(BaseModel):
    coach_type: Optional[str] = None
    name: Optional[str] = None
    rows: Optional[int] = None
    seats_per_row: Optional[int] = None
    total_seats: Optional[int] = None
    order_number: Optional[int] = None
    is_active: Optional[bool] = None

    @validator('coach_type')
    def validate_coach_type(cls, v):
        if v is not None:
            allowed_types = ['FIRST_CLASS', 'ECONOMY', 'SLEEPER', 'DINING', 'BAGGAGE']
            if v not in allowed_types:
                raise ValueError(f'Invalid coach type. Must be one of: {allowed_types}')
        return v


class CoachResponse(CoachBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    train_id: int
    created_at: datetime
    updated_at: datetime
    seats: List[SeatResponse] = []


class CoachBulkUpdate(BaseModel):
    train_id: int
    coaches: List[CoachCreate]