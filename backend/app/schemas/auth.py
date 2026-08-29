from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from ..models.user import UserRole


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=20)
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


class UpdateUserRoleRequest(BaseModel):
    new_role: UserRole


class StaffInfo(BaseModel):
    staff_id: str
    role: str
    is_available: bool
    department: Optional[str] = None
    status: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    role: str
    is_active: bool
    staff: Optional[StaffInfo] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse


class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class MessageResponse(BaseModel):
    message: str
