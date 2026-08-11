from enum import Enum
import uuid
from typing import Optional

from sqlalchemy import String, Boolean, Enum as SQLEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..core.database import Base
from datetime import datetime,timezone


class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        index=True,
        nullable=False
    )

    phone: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole),
        default=UserRole.USER,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    last_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),  # Add timezone=True
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),  # Add timezone=True
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),  # Add timezone=True
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    staff_profile = relationship("Staff", back_populates="user", uselist=False)
    #bookings = relationship("Booking", back_populates="user")
    def __repr__(self):
        return f"<User {self.email} - {self.role.value}>"