from fastapi import APIRouter, Depends, HTTPException, status
from ..schemas.auth import (
    RegisterRequest,
    LoginRequest,
    AdminLoginRequest,
    UserResponse,
    TokenResponse,
    MessageResponse,
)
from ..core.dependencies import get_auth_service, get_current_user_id, get_current_admin_user
from ..services.auth_service import AuthService
from ..models.user import UserRole

router = APIRouter(tags=["Authentication"])


@router.post("/register", response_model=MessageResponse)
def register(
    request: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Register a new user"""
    user = service.register(request)
    return {
        "message": "အကောင့်ဖွင့်ခြင်း အောင်မြင်ပါသည်"
    }


@router.post("/login", response_model=TokenResponse)
def login(
    request: LoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Login for regular users"""
    result = service.login(request)
    return result


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(
    request: AdminLoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Login for admin users"""
    result = service.admin_login(request)
    return result


@router.get("/me", response_model=UserResponse)
def get_me(
    user_id: str = Depends(get_current_user_id),
    service: AuthService = Depends(get_auth_service),
):
    """Get current user profile"""
    user = service.get_current_user(user_id)
    return user


@router.get("/admin/users", response_model=list[UserResponse])
def get_all_users(
    admin_user: dict = Depends(get_current_admin_user),
    service: AuthService = Depends(get_auth_service),
):
    """Get all users (admin only)"""
    users = service.get_all_users(
        current_user_role=UserRole(admin_user["role"])
    )
    return users


@router.put("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    new_role: UserRole,
    admin_user: dict = Depends(get_current_admin_user),
    service: AuthService = Depends(get_auth_service),
):
    """Update user role (super admin only)"""
    updated_user = service.update_user_role(
        user_id=user_id,
        new_role=new_role,
        current_user_role=UserRole(admin_user["role"])
    )
    return updated_user