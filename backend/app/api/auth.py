from fastapi import APIRouter, Depends

from ..core.dependencies import (
    get_auth_service,
    get_current_admin_user,
    get_current_user_id,
)
from ..models.user import UserRole
from ..schemas.auth import (
    AdminLoginRequest,
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
    TokenResponse,
    UpdateUserRoleRequest,
    UserResponse,
)
from ..services.auth_service import AuthService

router = APIRouter(tags=["Authentication"])


@router.post("/register", response_model=MessageResponse)
def register(
    request: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Register a new user."""
    service.register(request)
    return {"message": "အကောင့်ဖွင့်ခြင်း အောင်မြင်ပါသည်"}


@router.post("/login", response_model=TokenResponse)
def login(
    request: LoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Login for regular users."""
    return service.login(request)


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(
    request: AdminLoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Login for admin users."""
    return service.admin_login(request)


@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh_token(
    request: RefreshTokenRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Exchange a valid refresh token for a new access/refresh token pair."""
    return service.refresh_access_token(request.refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout():
    """
    Stateless JWT logout acknowledgement.

    The client must remove its access/refresh tokens. Server-side revocation can
    be added later if refresh tokens are persisted/blacklisted.
    """
    return {"message": "ထွက်ခွာခြင်း အောင်မြင်ပါသည်"}


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    request: ChangePasswordRequest,
    user_id: str = Depends(get_current_user_id),
    service: AuthService = Depends(get_auth_service),
):
    """Change the authenticated user's password."""
    service.change_password(
        user_id=user_id,
        current_password=request.current_password,
        new_password=request.new_password,
    )
    return {"message": "စကားဝှက် ပြောင်းလဲခြင်း အောင်မြင်ပါသည်"}


@router.get("/me", response_model=UserResponse)
def get_me(
    user_id: str = Depends(get_current_user_id),
    service: AuthService = Depends(get_auth_service),
):
    """Get current user profile."""
    return service.get_current_user(user_id)


@router.get("/admin/users", response_model=list[UserResponse])
def get_all_users(
    admin_user: dict = Depends(get_current_admin_user),
    service: AuthService = Depends(get_auth_service),
):
    """Get all users (admin only)."""
    return service.get_all_users(
        current_user_role=UserRole(admin_user["role"])
    )


@router.put("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    request: UpdateUserRoleRequest,
    admin_user: dict = Depends(get_current_admin_user),
    service: AuthService = Depends(get_auth_service),
):
    """Update a user's role using a JSON request body (super admin only)."""
    return service.update_user_role(
        user_id=user_id,
        new_role=request.new_role,
        current_user_role=UserRole(admin_user["role"]),
    )
