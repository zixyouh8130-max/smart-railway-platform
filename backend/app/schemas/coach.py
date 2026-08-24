from typing import Optional, List

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from .seat import SeatResponse


# Final canonical coach types.
#
# Passenger:
# - UPPER_CLASS: premium / highest class
# - ECONOMY_CLASS: ordinary/standard passenger class
# - SLEEPER: sleeper/bed coach
#
# Non-passenger:
# - DINING
# - BAGGAGE
#
# Old FIRST_CLASS / UPPER / ECONOMY values must be migrated in the DB.
ALLOWED_COACH_TYPES = {
    "UPPER_CLASS",
    "ECONOMY_CLASS",
    "SLEEPER",
    "DINING",
    "BAGGAGE",
}


class CoachBase(BaseModel):
    coach_type: str = "ECONOMY_CLASS"
    name: str
    rows: int = 10
    seats_per_row: int = 6
    total_seats: int = 60
    order_number: int = 1
    is_active: bool = True

    @field_validator("coach_type")
    @classmethod
    def validate_coach_type(
        cls,
        value: str,
    ) -> str:
        normalized = value.upper()

        if normalized not in ALLOWED_COACH_TYPES:
            raise ValueError(
                "Invalid coach type. Must be one of: "
                f"{sorted(ALLOWED_COACH_TYPES)}"
            )

        return normalized

    @model_validator(mode="after")
    def normalize_total_seats(self):
        if self.coach_type == "BAGGAGE":
            self.total_seats = 0
        else:
            self.total_seats = (
                self.rows
                * self.seats_per_row
            )

        return self


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

    @field_validator("coach_type")
    @classmethod
    def validate_coach_type(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        normalized = value.upper()

        if normalized not in ALLOWED_COACH_TYPES:
            raise ValueError(
                "Invalid coach type. Must be one of: "
                f"{sorted(ALLOWED_COACH_TYPES)}"
            )

        return normalized


class CoachResponse(CoachBase):
    id: int
    train_id: int
    seats: List[SeatResponse] = Field(
        default_factory=list
    )

    model_config = ConfigDict(
        from_attributes=True
    )


class CoachBulkUpdate(BaseModel):
    train_id: int
    coaches: List[CoachCreate]
