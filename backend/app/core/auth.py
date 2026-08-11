from datetime import datetime, timedelta
from typing import Optional, Union
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from ..core.config import settings
from ..core.database import get_db
from ..models.user import User, UserRole
from ..models.staff import Staff, StaffRole

security = HTTPBearer()

def create_access_token(data: dict) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode JWT access token"""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return user


async def get_current_active_user(
        current_user: User = Depends(get_current_user),
) -> User:
    """Get current active user"""
    return current_user


async def get_current_admin_user(
        current_user: User = Depends(get_current_user),
) -> User:
    """Get current admin user"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


async def get_current_super_admin(
        current_user: User = Depends(get_current_user),
) -> User:
    """Get current super admin user"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin privileges required",
        )
    return current_user


async def get_current_staff(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
) -> Staff:
    """Get current staff member"""
    staff = db.query(Staff).filter(Staff.user_id == current_user.id).first()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account required",
        )
    return staff


async def get_current_train_crew(
        current_staff: Staff = Depends(get_current_staff),
) -> Staff:
    """Get current train crew member (driver, assistant, guard)"""
    train_crew_roles = [
        StaffRole.TRAIN_DRIVER,
        StaffRole.ASSISTANT_DRIVER,
        StaffRole.TRAIN_GUARD,
        StaffRole.TICKET_CHECKER
    ]

    if current_staff.role not in train_crew_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Train crew privileges required",
        )
    return current_staff


async def get_current_station_staff(
        current_staff: Staff = Depends(get_current_staff),
) -> Staff:
    """Get current station staff member"""
    station_roles = [
        StaffRole.STATION_MASTER,
        StaffRole.STATION_STAFF
    ]

    if current_staff.role not in station_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Station staff privileges required",
        )
    return current_staff