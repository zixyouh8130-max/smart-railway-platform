# core/dependencies.py (updated)
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError
from ..core.database import get_db
from ..core.security import decode_access_token
from ..services.auth_service import AuthService
from ..repositories.user_repository import UserRepository
from ..repositories.staff_repository import StaffRepository
from ..models.user import UserRole
from ..models.staff import StaffRole

security = HTTPBearer()


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    """Get user repository instance"""
    return UserRepository(db)


def get_staff_repository(db: Session = Depends(get_db)) -> StaffRepository:
    """Get staff repository instance"""
    return StaffRepository(db)


def get_auth_service(
        user_repo: UserRepository = Depends(get_user_repository),
        staff_repo: StaffRepository = Depends(get_staff_repository)
) -> AuthService:
    """Get auth service instance"""
    return AuthService(user_repo, staff_repo)


def get_current_user_id(
        credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Get current user ID from token"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    return user_id


def get_current_user_role(
        credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Get current user role from token"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    return payload.get("role", "USER")


def get_current_admin_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Get current admin user - requires ADMIN or SUPER_ADMIN role"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    role = payload.get("role", "USER")
    if role not in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )

    return payload


def get_current_staff_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Get current staff user - requires staff profile"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    staff_info = payload.get("staff")
    if not staff_info:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff profile required"
        )

    return payload


def get_current_train_crew(
        credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Get current train crew member"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

    staff_info = payload.get("staff")
    if not staff_info:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff profile required"
        )

    train_crew_roles = [
        StaffRole.TRAIN_DRIVER.value,
        StaffRole.ASSISTANT_DRIVER.value,
        StaffRole.TRAIN_GUARD.value,
        StaffRole.TICKET_CHECKER.value
    ]

    if staff_info.get("role") not in train_crew_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Train crew privileges required"
        )

    return payload