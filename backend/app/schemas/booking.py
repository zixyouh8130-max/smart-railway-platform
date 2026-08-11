# backend/schemas/booking.py
from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime, date
from typing import Optional, List
from enum import Enum


class BookingStatusEnum(str, Enum):
    RESERVED = "RESERVED"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    COMPLETED = "COMPLETED"


class PaymentStatusEnum(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"
    FAILED = "FAILED"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"


class BookingBase(BaseModel):
    """Base booking schema"""
    customer_name: str = Field(..., min_length=1, max_length=100)
    nrc: str = Field(..., min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    travel_date: date
    passenger_count: int = Field(default=1, ge=1)
    passenger_names: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=500)


class BookingCreate(BookingBase):
    """Schema for creating a booking"""
    train_id: int
    seat_id: int
    coach_id: Optional[int] = None
    base_fare: float = 0.0
    tax: float = 0.0
    service_fee: float = 0.0
    total_cost: float


class BookingUpdate(BaseModel):
    """Schema for updating a booking"""
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    booking_status: Optional[BookingStatusEnum] = None
    payment_status: Optional[PaymentStatusEnum] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class BookingResponse(BookingBase):
    """Schema for booking response"""
    id: int
    ticket_no: str
    booking_no: Optional[str] = None
    train_id: int
    seat_id: int
    coach_id: Optional[int] = None
    booking_date: datetime
    reservation_expiry: Optional[datetime] = None
    cancellation_date: Optional[datetime] = None
    base_fare: float
    tax: float
    service_fee: float
    total_cost: float
    refund_amount: Optional[float] = None
    booking_status: BookingStatusEnum
    payment_status: PaymentStatusEnum
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookingListResponse(BaseModel):
    """Schema for list of bookings response"""
    bookings: List[BookingResponse]
    total: int


class BookingStatusUpdate(BaseModel):
    """Schema for updating booking status"""
    booking_status: BookingStatusEnum
    reason: Optional[str] = None


class PaymentStatusUpdate(BaseModel):
    """Schema for updating payment status"""
    payment_status: PaymentStatusEnum
    transaction_id: Optional[str] = None
    amount: Optional[float] = None