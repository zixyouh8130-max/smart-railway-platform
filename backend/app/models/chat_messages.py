from typing import Optional

from sqlalchemy import String, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import BaseModel


class ChatMessage(BaseModel):
    __tablename__ = "chat_messages"

    session_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id"),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    content_burmese: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    content_english: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    intent_detected: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    response_time_ms: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    translation_used: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    llm_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    language: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="myanmar",
    )

    # Relationships
    session: Mapped["ChatSession"] = relationship(
        back_populates="messages"
    )