# schemas/station_fee_rule.py
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional


class StationFeeRuleBase(BaseModel):
    """Base schema for station fee rule"""
    from_station_id: int
    to_station_id: int
    base_fare: float = Field(..., gt=0)
    per_km_rate: float = Field(0.0, ge=0)
    class_type: str = Field(default="ORDINARY")
    seat_type: Optional[str] = Field(None, max_length=50)
    calculated_distance: Optional[float] = Field(None, ge=0)
    surcharge_percentage: float = Field(0.0, ge=0, le=100)
    is_active: bool = True

    @field_validator('class_type')
    @classmethod
    def validate_class_type(cls, v: str) -> str:
        allowed_types = ['ORDINARY', 'AC_CHAIR', 'SLEEPER', 'FIRST_CLASS', 'AC_SLEEPER']
        if v.upper() not in allowed_types:
            raise ValueError(f'Class type must be one of {allowed_types}')
        return v.upper()


class StationFeeRuleCreate(StationFeeRuleBase):
    """Schema for creating a fee rule"""
    train_id: int
    route_id: int

    @field_validator('from_station_id', 'to_station_id')
    @classmethod
    def validate_different_stations(cls, v: int, info) -> int:
        if 'to_station_id' in info.data and 'from_station_id' in info.data:
            if info.data['from_station_id'] == info.data['to_station_id']:
                raise ValueError('From and To stations must be different')
        return v


class StationFeeRuleUpdate(BaseModel):
    """Schema for updating a fee rule"""
    base_fare: Optional[float] = Field(None, gt=0)
    per_km_rate: Optional[float] = Field(None, ge=0)
    class_type: Optional[str] = None
    seat_type: Optional[str] = Field(None, max_length=50)
    calculated_distance: Optional[float] = Field(None, ge=0)
    surcharge_percentage: Optional[float] = Field(None, ge=0, le=100)
    is_active: Optional[bool] = None

    @field_validator('class_type')
    @classmethod
    def validate_class_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed_types = ['ORDINARY', 'AC_CHAIR', 'SLEEPER', 'FIRST_CLASS', 'AC_SLEEPER']
            if v.upper() not in allowed_types:
                raise ValueError(f'Class type must be one of {allowed_types}')
            return v.upper()
        return v


class StationFeeRuleResponse(StationFeeRuleBase):
    """Schema for fee rule response"""
    id: int
    train_id: int
    route_id: int
    from_station_name: Optional[str] = None
    to_station_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StationFeeRuleListResponse(BaseModel):
    """Schema for list of fee rules"""
    rules: list[StationFeeRuleResponse]
    total: int


class FeeCalculationRequest(BaseModel):
    """Schema for fee calculation request"""
    train_id: int
    from_station_id: int
    to_station_id: int
    class_type: str = Field(default="ORDINARY")
    seat_type: Optional[str] = None

    @field_validator('class_type')
    @classmethod
    def validate_class_type(cls, v: str) -> str:
        allowed_types = ['ORDINARY', 'AC_CHAIR', 'SLEEPER', 'FIRST_CLASS', 'AC_SLEEPER']
        if v.upper() not in allowed_types:
            raise ValueError(f'Class type must be one of {allowed_types}')
        return v.upper()


class FeeCalculationResponse(BaseModel):
    """Schema for fee calculation response"""
    total_fare: float
    base_fare: float
    surcharge: float
    distance: Optional[float]
    class_type: str
    seat_type: Optional[str]
    calculation_method: str
    from_station: str
    to_station: str


class PriceMatrixResponse(BaseModel):
    """Schema for price matrix response"""
    train_id: int
    route_id: int
    train_no: str
    class_type: str
    stations: list
    prices: list