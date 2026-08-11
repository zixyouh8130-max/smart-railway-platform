from typing import Optional

from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column
from ..core.database import Base


class TrainClass(Base):
    """Available classes for trains"""
    __tablename__ = "train_classes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    amenities: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)