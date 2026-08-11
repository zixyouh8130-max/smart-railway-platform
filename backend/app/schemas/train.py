# schemas/train.py
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List
from datetime import datetime
from .train_stop import TrainStopResponse


class TrainBase(BaseModel):
    """Base schema for train"""
    train_no: str = Field(..., min_length=1, max_length=20)
    train_name: str = Field(..., min_length=1, max_length=100)
    train_type: Optional[str] = Field(None, max_length=50)
    route_id: int
    total_coaches: int = Field(0, ge=0)
    capacity: int = Field(0, ge=0)
    speed: Optional[float] = Field(None, ge=0, le=500)  # 🆕 Speed in km/h (0-500)
    status: str = Field(default="ACTIVE")

    @field_validator('train_no')
    @classmethod
    def train_no_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Train number is required')
        return v.strip().upper()

    @field_validator('train_name')
    @classmethod
    def train_name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Train name is required')
        return v.strip()

    @field_validator('speed')
    @classmethod
    def validate_speed(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError('Speed must be greater than 0')
        if v is not None and v > 500:
            raise ValueError('Speed cannot exceed 500 km/h')
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed_statuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE']
        if v not in allowed_statuses:
            raise ValueError(f'Status must be one of {allowed_statuses}')
        return v


class TrainCreate(TrainBase):
    """Schema for creating a train"""
    pass


class TrainUpdate(BaseModel):
    """Schema for updating a train"""
    train_no: Optional[str] = Field(None, min_length=1, max_length=20)
    train_name: Optional[str] = Field(None, min_length=1, max_length=100)
    train_type: Optional[str] = Field(None, max_length=50)
    route_id: Optional[int] = None
    total_coaches: Optional[int] = Field(None, ge=0)
    capacity: Optional[int] = Field(None, ge=0)
    speed: Optional[float] = Field(None, ge=0, le=500)  # 🆕
    status: Optional[str] = None

    @field_validator('train_no')
    @classmethod
    def train_no_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and (not v or not v.strip()):
            raise ValueError('Train number cannot be empty')
        return v.strip().upper() if v else v

    @field_validator('train_name')
    @classmethod
    def train_name_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and (not v or not v.strip()):
            raise ValueError('Train name cannot be empty')
        return v.strip() if v else v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed_statuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE']
            if v not in allowed_statuses:
                raise ValueError(f'Status must be one of {allowed_statuses}')
        return v


class RouteInfo(BaseModel):
    """Minimal route info for train response"""
    id: int
    name: str
    origin: str
    destination: str

    model_config = ConfigDict(from_attributes=True)


class TrainResponse(TrainBase):
    """Schema for train response"""
    id: int
    route: Optional[RouteInfo] = None
    train_stops: Optional[List[TrainStopResponse]] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TrainListResponse(BaseModel):
    """Schema for list of trains"""
    trains: List[TrainResponse]
    total: int