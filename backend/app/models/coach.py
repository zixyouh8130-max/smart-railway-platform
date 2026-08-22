from typing import Optional, List
from sqlalchemy import String, Integer, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class Coach(Base):
    __tablename__ = "coaches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Foreign key to train (keep as INTEGER)
    train_id: Mapped[int] = mapped_column(
        ForeignKey("trains.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Coach details
    coach_type: Mapped[str] = mapped_column(String(20), nullable=False, default="ECONOMY")
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Configuration
    rows: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    seats_per_row: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    total_seats: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    # Ordering
    order_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    train = relationship("Train", back_populates="coaches")
    seats = relationship("Seat", back_populates="coach", cascade="all, delete-orphan")

    # Unique constraint for train and order
    __table_args__ = (
        UniqueConstraint('train_id', 'order_number', name='uq_train_coach_order'),
    )