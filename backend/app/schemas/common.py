# backend/schemas/common.py
from pydantic import BaseModel, ConfigDict
from typing import Generic, TypeVar, Optional

T = TypeVar('T')


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = "Success"
    data: Optional[T] = None
    error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    error_code: Optional[str] = None
    details: Optional[dict] = None