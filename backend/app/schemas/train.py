# backend/app/schemas/train.py

from datetime import datetime
from typing import Optional, List

from pydantic import (
    BaseModel,
    Field,
    field_validator,
    ConfigDict,
)

from .train_stop import TrainStopResponse


# ============================================================
# Base Train Schema
# ============================================================

class TrainBase(BaseModel):
    """Base schema for train."""

    train_no: str = Field(
        ...,
        min_length=1,
        max_length=20,
    )

    train_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    train_type: Optional[str] = Field(
        default=None,
        max_length=50,
    )

    # Matches:
    #
    # route_id: Mapped[Optional[int]]
    # nullable=True
    #
    # A train may temporarily exist without an assigned route.
    route_id: Optional[int] = None

    total_coaches: int = Field(
        default=0,
        ge=0,
    )

    capacity: int = Field(
        default=0,
        ge=0,
    )

    # Train speed in km/h
    speed: Optional[float] = Field(
        default=None,
        gt=0,
        le=500,
    )

    status: str = Field(
        default="ACTIVE",
    )

    # --------------------------------------------------------
    # Validators
    # --------------------------------------------------------

    @field_validator("train_no")
    @classmethod
    def train_no_must_not_be_empty(
        cls,
        v: str,
    ) -> str:
        value = v.strip()

        if not value:
            raise ValueError(
                "Train number is required"
            )

        return value.upper()

    @field_validator("train_name")
    @classmethod
    def train_name_must_not_be_empty(
        cls,
        v: str,
    ) -> str:
        value = v.strip()

        if not value:
            raise ValueError(
                "Train name is required"
            )

        return value

    @field_validator("train_type")
    @classmethod
    def normalize_train_type(
        cls,
        v: Optional[str],
    ) -> Optional[str]:
        if v is None:
            return None

        value = v.strip()

        return value if value else None

    @field_validator("status")
    @classmethod
    def validate_status(
        cls,
        v: str,
    ) -> str:
        allowed_statuses = [
            "ACTIVE",
            "INACTIVE",
            "MAINTENANCE",
        ]

        value = v.strip().upper()

        if value not in allowed_statuses:
            raise ValueError(
                f"Status must be one of {allowed_statuses}"
            )

        return value


# ============================================================
# Create Train
# ============================================================

class TrainCreate(TrainBase):
    """
    Schema for creating a train.

    created_at and updated_at are intentionally omitted because
    they are managed automatically by the database/SQLAlchemy.
    """

    pass


# ============================================================
# Update Train
# ============================================================

class TrainUpdate(BaseModel):
    """Schema for updating a train."""

    train_no: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=20,
    )

    train_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    train_type: Optional[str] = Field(
        default=None,
        max_length=50,
    )

    # Allows:
    #
    # route_id = 3
    # route_id = None
    #
    # None can be used to remove the route assignment.
    route_id: Optional[int] = None

    total_coaches: Optional[int] = Field(
        default=None,
        ge=0,
    )

    capacity: Optional[int] = Field(
        default=None,
        ge=0,
    )

    speed: Optional[float] = Field(
        default=None,
        gt=0,
        le=500,
    )

    status: Optional[str] = None

    # --------------------------------------------------------
    # Validators
    # --------------------------------------------------------

    @field_validator("train_no")
    @classmethod
    def train_no_must_not_be_empty(
        cls,
        v: Optional[str],
    ) -> Optional[str]:
        if v is None:
            return None

        value = v.strip()

        if not value:
            raise ValueError(
                "Train number cannot be empty"
            )

        return value.upper()

    @field_validator("train_name")
    @classmethod
    def train_name_must_not_be_empty(
        cls,
        v: Optional[str],
    ) -> Optional[str]:
        if v is None:
            return None

        value = v.strip()

        if not value:
            raise ValueError(
                "Train name cannot be empty"
            )

        return value

    @field_validator("train_type")
    @classmethod
    def normalize_train_type(
        cls,
        v: Optional[str],
    ) -> Optional[str]:
        if v is None:
            return None

        value = v.strip()

        return value if value else None

    @field_validator("status")
    @classmethod
    def validate_status(
        cls,
        v: Optional[str],
    ) -> Optional[str]:
        if v is None:
            return None

        allowed_statuses = [
            "ACTIVE",
            "INACTIVE",
            "MAINTENANCE",
        ]

        value = v.strip().upper()

        if value not in allowed_statuses:
            raise ValueError(
                f"Status must be one of {allowed_statuses}"
            )

        return value


# ============================================================
# Route Information
# ============================================================

class RouteInfo(BaseModel):
    """Minimal route information returned with a train."""

    id: int
    name: str
    origin: str
    destination: str

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# Train Response
# ============================================================

class TrainResponse(TrainBase):
    """Schema returned by train API endpoints."""

    id: int

    route: Optional[RouteInfo] = None

    train_stops: List[TrainStopResponse] = Field(
        default_factory=list
    )

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# Train List Response
# ============================================================

class TrainListResponse(BaseModel):
    """Schema for paginated/list train responses."""

    trains: List[TrainResponse]

    total: int