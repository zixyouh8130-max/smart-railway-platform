from sqlalchemy import ForeignKey, String, Integer, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..core.database import Base


class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    # Each seat belongs to one coach
    coach_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("coaches.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    seat_number: Mapped[str] = mapped_column(
        String(10),
        nullable=False
    )

    seat_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="REGULAR"
    )

    row_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    position_in_row: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    # Relationships
    coach = relationship(
        "Coach",
        back_populates="seats"
    )

    bookings = relationship(
        "Booking",
        back_populates="seat"
    )

    # Seat number must be unique within a coach
    __table_args__ = (
        UniqueConstraint(
            "coach_id",
            "seat_number",
            name="uq_coach_seat_number"
        ),
    )