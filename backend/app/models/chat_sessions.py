from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import BaseModel

class ChatSession(BaseModel):
    """Stores chat sessions"""
    __tablename__ = "chat_sessions"

    user_identifier: Mapped[str] = mapped_column(String(255), default="anonymous")
    primary_language: Mapped[str] = mapped_column(String(10), default="my")
    is_active: Mapped[bool] = mapped_column(default=True)
    title: Mapped[Optional[str]] = mapped_column(String(255))

    messages = relationship("ChatMessage", back_populates="session")