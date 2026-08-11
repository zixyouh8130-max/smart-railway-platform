# backend/schemas/coach.py
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List
from datetime import datetime
from .seat import SeatResponse


class CoachBase(BaseModel):
    """Base coach schema"""
    train_id: int
    coach_type: str  # Changed from 'type' to 'coach_type'
    name: str = Field(..., min_length=1, max_length=50)
    rows: int = Field(..., gt=0, le=20)  # Added max rows limit
    seats_per_row: int = Field(..., gt=0, le=10)  # Added max seats per row limit
    total_seats: int = Field(..., gt=0)
    order_number: Optional[int] = Field(None, ge=1)

    @field_validator('coach_type')
    @classmethod
    def validate_coach_type(cls, v: str) -> str:
        allowed_types = ['FIRST_CLASS', 'ECONOMY', 'SLEEPER', 'DINING', 'BAGGAGE']
        if v not in allowed_types:
            raise ValueError(f'Coach type must be one of {allowed_types}')
        return v

    @field_validator('name')
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Coach name is required')
        return v.strip()

    @field_validator('total_seats')
    @classmethod
    def validate_total_seats(cls, v: int, info) -> int:
        if 'rows' in info.data and 'seats_per_row' in info.data:
            expected = info.data['rows'] * info.data['seats_per_row']
            if v != expected:
                raise ValueError(f'Total seats must equal rows × seats per row ({expected})')
        return v


class CoachCreate(CoachBase):
    """Schema for creating a coach"""
    pass


class CoachUpdate(BaseModel):
    """Schema for updating a coach"""
    coach_type: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    rows: Optional[int] = Field(None, gt=0, le=20)
    seats_per_row: Optional[int] = Field(None, gt=0, le=10)
    total_seats: Optional[int] = Field(None, gt=0)
    order_number: Optional[int] = Field(None, ge=1)

    @field_validator('coach_type')
    @classmethod
    def validate_coach_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed_types = ['FIRST_CLASS', 'ECONOMY', 'SLEEPER', 'DINING', 'BAGGAGE']
            if v not in allowed_types:
                raise ValueError(f'Coach type must be one of {allowed_types}')
        return v

    @field_validator('total_seats')
    @classmethod
    def validate_total_seats_update(cls, v: Optional[int], info) -> Optional[int]:
        """Validate total seats when updating, considering both provided values and existing values"""
        if v is not None and 'rows' in info.data and 'seats_per_row' in info.data:
            rows = info.data['rows']
            seats_per_row = info.data['seats_per_row']
            if rows is not None and seats_per_row is not None:
                expected = rows * seats_per_row
                if v != expected:
                    raise ValueError(f'Total seats must equal rows × seats per row ({expected})')
        return v


class CoachResponse(BaseModel):
    """Schema for coach response"""
    id: int
    train_id: int
    coach_type: str
    name: str
    rows: int
    seats_per_row: int
    total_seats: int
    order_number: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    seats: Optional[List[SeatResponse]] = None  # Include seats in response

    model_config = ConfigDict(from_attributes=True)


class CoachListResponse(BaseModel):
    """Schema for list of coaches response"""
    coaches: List[CoachResponse]
    total: int


class BulkCoachUpdate(BaseModel):
    """Schema for bulk coach update request"""
    coaches: List[CoachCreate]


class BulkUpdateResponse(BaseModel):
    """Schema for bulk coach update response"""
    message: str
    coaches_count: int
    seats_count: int
    coaches: List[CoachResponse]
    total: int


class CoachWithSeatsResponse(BaseModel):
    """Schema for coach with detailed seat layout"""
    coach: CoachResponse
    seat_layout: dict  # Organized by row number
    total_seats: int


class TrainSeatsResponse(BaseModel):
    """Schema for all train seats organized by coach"""
    train_id: int
    coaches: dict  # coach_id -> CoachWithSeatsResponse
    total_seats: int


class SeatGenerationResponse(BaseModel):
    """Schema for seat generation response"""
    coach_id: int
    coach_name: str
    seats_generated: int
    seat_numbers: List[str]
    message: str