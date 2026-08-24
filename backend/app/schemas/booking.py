# backend/schemas/booking.py

from pydantic import BaseModel, Field, ConfigDict
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


class BookingPassengerBase(BaseModel):
    customer_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )
    nrc: str = Field(
        ...,
        min_length=1,
        max_length=50,
    )
    phone: Optional[str] = Field(
        None,
        max_length=20,
    )
    email: Optional[str] = Field(
        None,
        max_length=100,
    )
    passenger_count: int = Field(
        default=1,
        ge=1,
    )
    passenger_names: Optional[str] = Field(
        None,
        max_length=500,
    )
    notes: Optional[str] = Field(
        None,
        max_length=500,
    )


class BookingCreate(BookingPassengerBase):
    """
    The client chooses only:
    - exact schedule
    - exact seat
    - boarding/alighting RouteStation rows

    train_id, travel_date, fare and coach are derived on the backend.
    """

    schedule_id: int = Field(..., gt=0)
    seat_id: int = Field(..., gt=0)

    from_route_station_id: int = Field(
        ...,
        gt=0,
    )
    to_route_station_id: int = Field(
        ...,
        gt=0,
    )


class BookingUpdate(BaseModel):
    customer_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
    )
    phone: Optional[str] = Field(
        None,
        max_length=20,
    )
    email: Optional[str] = Field(
        None,
        max_length=100,
    )
    booking_status: Optional[
        BookingStatusEnum
    ] = None
    payment_status: Optional[
        PaymentStatusEnum
    ] = None
    notes: Optional[str] = Field(
        None,
        max_length=500,
    )
    is_active: Optional[bool] = None


class BookingResponse(BookingPassengerBase):
    id: int

    ticket_no: str
    booking_no: Optional[str] = None

    schedule_id: Optional[int] = None
    train_id: int
    seat_id: int

    from_route_station_id: Optional[int] = None
    to_route_station_id: Optional[int] = None

    travel_date: date
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

    model_config = ConfigDict(
        from_attributes=True,
    )


class BookingListResponse(BaseModel):
    bookings: List[BookingResponse]
    total: int


class BookingStatusUpdate(BaseModel):
    booking_status: BookingStatusEnum
    reason: Optional[str] = Field(
        None,
        max_length=500,
    )


class PaymentStatusUpdate(BaseModel):
    payment_status: PaymentStatusEnum
    transaction_id: Optional[str] = None
    amount: Optional[float] = Field(
        None,
        ge=0,
    )


class BookingConfirmRequest(BaseModel):
    payment_amount: float = Field(
        ...,
        ge=0,
    )


class BookingCancelRequest(BaseModel):
    reason: Optional[str] = Field(
        None,
        max_length=500,
    )
