from typing import Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


# Final canonical fare-bearing passenger classes.
ALLOWED_CLASS_TYPES = {
    "UPPER_CLASS",
    "ECONOMY_CLASS",
    "SLEEPER",
}


def normalize_class_type(
    value: str,
) -> str:
    normalized = str(
        value
    ).strip().upper()

    if normalized not in ALLOWED_CLASS_TYPES:
        raise ValueError(
            "Class type must be one of "
            f"{sorted(ALLOWED_CLASS_TYPES)}"
        )

    return normalized


class StationFeeRuleBase(BaseModel):
    """
    Fare rule for one train + route-station pair + passenger coach class.

    from_station_id/to_station_id refer to route_stations.id.
    """

    from_station_id: int
    to_station_id: int

    # Manual fare:
    #   base_fare=<exact fare>, per_mile_rate=0
    #
    # Distance fare:
    #   base_fare + per_mile_rate * distance
    base_fare: float = Field(
        ...,
        ge=0,
    )
    per_mile_rate: float = Field(
        0.0,
        ge=0,
    )

    class_type: str = "ECONOMY_CLASS"

    # Kept for model compatibility; current fare selection is coach-class based.
    seat_type: Optional[str] = Field(
        None,
        max_length=50,
    )

    calculated_distance: Optional[float] = Field(
        None,
        ge=0,
    )

    surcharge_percentage: float = Field(
        0.0,
        ge=0,
        le=100,
    )

    is_active: bool = True

    @field_validator("class_type")
    @classmethod
    def validate_class_type(
        cls,
        value: str,
    ) -> str:
        return normalize_class_type(
            value
        )

    @model_validator(mode="after")
    def validate_station_pair(
        self,
    ):
        if (
            self.from_station_id
            == self.to_station_id
        ):
            raise ValueError(
                "From and To stations must be different"
            )

        return self


class StationFeeRuleCreate(
    StationFeeRuleBase
):
    train_id: int
    route_id: int


class StationFeeRuleUpdate(
    BaseModel
):
    base_fare: Optional[float] = Field(
        None,
        ge=0,
    )
    per_mile_rate: Optional[float] = Field(
        None,
        ge=0,
    )
    class_type: Optional[str] = None
    seat_type: Optional[str] = Field(
        None,
        max_length=50,
    )
    calculated_distance: Optional[float] = Field(
        None,
        ge=0,
    )
    surcharge_percentage: Optional[float] = Field(
        None,
        ge=0,
        le=100,
    )
    is_active: Optional[bool] = None

    @field_validator("class_type")
    @classmethod
    def validate_class_type(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        return normalize_class_type(
            value
        )


class StationFeeRuleResponse(
    StationFeeRuleBase
):
    id: int
    train_id: int
    route_id: int

    from_station_name: Optional[str] = None
    to_station_name: Optional[str] = None

    model_config = ConfigDict(
        from_attributes=True
    )


class StationFeeRuleListResponse(
    BaseModel
):
    rules: list[
        StationFeeRuleResponse
    ]
    total: int


class FareCoachTypeResponse(
    BaseModel
):
    class_type: str
    display_name: str
    coach_count: int
    total_seats: int
    source_coach_types: list[str]


class TrainFareCoachTypesResponse(
    BaseModel
):
    train_id: int
    coach_types: list[
        FareCoachTypeResponse
    ]


class FeeCalculationRequest(
    BaseModel
):
    train_id: int

    # Optional frozen Schedule.route_id.
    route_id: Optional[int] = None

    from_station_id: int
    to_station_id: int

    class_type: str = (
        "ECONOMY_CLASS"
    )

    seat_type: Optional[str] = None

    @field_validator("class_type")
    @classmethod
    def validate_class_type(
        cls,
        value: str,
    ) -> str:
        return normalize_class_type(
            value
        )


class FeeCalculationResponse(
    BaseModel
):
    total_fare: float
    rule_base_fare: float
    distance_component: float
    surcharge: float
    distance: Optional[float]
    distance_unit: str = "mile"

    class_type: str
    seat_type: Optional[str]
    calculation_method: str

    from_station: str
    to_station: str

    train_id: int
    route_id: int
    rule_id: int


class PriceMatrixResponse(
    BaseModel
):
    train_id: int
    route_id: int
    train_no: str
    class_type: str
    stations: list
    prices: list
    distance_unit: str = "mile"


class FeeRuleGenerationRequest(
    BaseModel
):
    """
    Generate station-pair rules for one passenger coach class.
    """

    base_fare: float = Field(
        0.0,
        ge=0,
    )

    per_mile_rate: float = Field(
        ...,
        ge=0,
    )

    class_type: str = (
        "ECONOMY_CLASS"
    )

    seat_type: Optional[str] = None

    surcharge_percentage: float = Field(
        0.0,
        ge=0,
        le=100,
    )

    overwrite_existing: bool = False

    @field_validator("class_type")
    @classmethod
    def validate_class_type(
        cls,
        value: str,
    ) -> str:
        return normalize_class_type(
            value
        )
