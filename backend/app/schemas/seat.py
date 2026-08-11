# backend/schemas/seat.py
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class SeatBase(BaseModel):
    """Base seat schema"""
    seat_number: str
    seat_type: str
    row_number: int
    position_in_row: int
    is_active: bool = True


class SeatCreate(SeatBase):
    """Schema for creating a seat"""
    coach_id: int


class SeatUpdate(BaseModel):
    """Schema for updating a seat"""
    seat_type: Optional[str] = None
    is_active: Optional[bool] = None


class SeatResponse(SeatBase):
    """Schema for seat response"""
    id: int
    coach_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SeatListResponse(BaseModel):
    """Schema for list of seats response"""
    seats: list[SeatResponse]
    total: int


class SeatLayoutResponse(BaseModel):
    """Schema for seat layout response"""
    row_number: int
    seats: list[SeatResponse]