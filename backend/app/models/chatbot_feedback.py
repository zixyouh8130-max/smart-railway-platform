import uuid
from typing import Optional

from sqlalchemy import Text, UUID, Integer
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import BaseModel


class ChatbotFeedback(BaseModel):
    """Stores user feedback for chatbot responses"""
    __tablename__ = "chatbot_feedback"

    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    comment: Mapped[Optional[str]] = mapped_column(Text)
    is_helpful: Mapped[bool] = mapped_column(default=True)