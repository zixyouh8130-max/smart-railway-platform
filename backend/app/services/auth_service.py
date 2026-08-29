# services/auth_service.py (updated - timezone aware)
from typing import Optional
from fastapi import HTTPException, status
from ..models.user import User, UserRole
from ..models.staff import Staff, StaffRole, StaffStatus
from ..repositories.user_repository import UserRepository
from ..repositories.staff_repository import StaffRepository
from ..core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from datetime import datetime, timezone


class AuthService:

    def __init__(self, repo: UserRepository, staff_repo: Optional[StaffRepository] = None):
        self.repo = repo
        self.staff_repo = staff_repo

    def register(self, request) -> User:
        """Register a new user"""
        if self.repo.get_by_email(request.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="ဤအီးမေးလ်ဖြင့် မှတ်ပုံတင်ထားပြီးဖြစ်သည်"
            )

        user = User(
            full_name=request.full_name,
            email=request.email,
            phone=request.phone,
            password_hash=hash_password(request.password),
            role=UserRole.USER  # Default role is USER
        )

        return self.repo.create(user)

    def login(self, request) -> dict:
        """Login for regular users"""
        user = self.repo.get_by_email(request.email)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="အီးမေးလ် မှားယွင်းနေပါသည်"
            )

        if not verify_password(request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="စကားဝှက် မှားယွင်းနေပါသည်"
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="အကောင့် ပိတ်ထားပါသည်"
            )

        staff_info = None
        if self.staff_repo:
            staff = self.staff_repo.get_by_user_id(user.id)
            if staff:
                staff_info = {
                    "staff_id": staff.staff_id,
                    "role": staff.role.value if isinstance(staff.role, StaffRole) else staff.role,
                    "department": staff.department,
                    "status": staff.status.value if isinstance(staff.status, StaffStatus) else str(staff.status),
                    "is_available": staff.is_available
                }

        token_data = {
            "sub": str(user.id),
            "role": user.role.value,
            "type": "access"
        }
        if staff_info:
            token_data["staff"] = staff_info

        token = create_access_token(token_data)
        refresh_token = create_refresh_token(str(user.id), user.email)

        # Update last login - timezone aware
        user.last_login = datetime.now(timezone.utc)
        self.repo.db.commit()

        user_dict = self._user_to_dict(user)
        if staff_info:
            user_dict["staff"] = staff_info

        return {
            "access_token": token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user_dict,
        }

    def admin_login(self, request) -> dict:
        """Login for admin users"""
        user = self.repo.get_by_email(request.email)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="အီးမေးလ် မှားယွင်းနေပါသည်"
            )

        if not verify_password(request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="စကားဝှက် မှားယွင်းနေပါသည်"
            )

        # Check if user has admin role
        if user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="အက်ဒမင် အခွင့်အရေး မရှိပါ"
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="အကောင့် ပိတ်ထားပါသည်"
            )

        # Check for staff profile (admin can also be staff)
        staff_info = None
        if self.staff_repo:
            staff = self.staff_repo.get_by_user_id(user.id)
            if staff:
                staff_info = {
                    "staff_id": staff.staff_id,
                    "role": staff.role.value if isinstance(staff.role, StaffRole) else staff.role,
                    "is_available": staff.is_available
                }

        token_data = {
            "sub": str(user.id),
            "role": user.role.value,
            "type": "admin"
        }

        if staff_info:
            token_data["staff"] = staff_info
        token = create_access_token(token_data)
        refresh_token = create_refresh_token(str(user.id), user.email)

        # Update last login - timezone aware
        user.last_login = datetime.now(timezone.utc)
        self.repo.db.commit()

        user_dict = self._user_to_dict(user)
        if staff_info:
            user_dict["staff"] = staff_info

        return {
            "access_token": token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user_dict,
        }

    def refresh_access_token(self, refresh_token: str) -> dict:
        """Rotate a valid refresh token and issue a fresh access token."""
        payload = decode_access_token(refresh_token)

        if not payload or payload.get("type") != "refresh" or not payload.get("sub"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        user = self.repo.get_by_id(payload["sub"])
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User no longer exists",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive",
            )

        token_data = {
            "sub": str(user.id),
            "role": user.role.value if isinstance(user.role, UserRole) else str(user.role),
            "type": "access",
        }

        # Keep the staff claim consistent with login tokens.
        if self.staff_repo:
            staff = self.staff_repo.get_by_user_id(user.id)
            if staff:
                token_data["staff"] = {
                    "staff_id": staff.staff_id,
                    "role": staff.role.value if isinstance(staff.role, StaffRole) else staff.role,
                    "department": staff.department,
                    "status": staff.status.value if isinstance(staff.status, StaffStatus) else str(staff.status),
                    "is_available": staff.is_available,
                }

        return {
            "access_token": create_access_token(token_data),
            "refresh_token": create_refresh_token(str(user.id), user.email),
            "token_type": "bearer",
        }

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        """Change the current user's password after verifying the old password."""
        user = self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="အသုံးပြုသူ မတွေ့ရှိပါ",
            )

        if not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="လက်ရှိ စကားဝှက် မှားယွင်းနေပါသည်",
            )

        if verify_password(new_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="စကားဝှက်အသစ်သည် လက်ရှိစကားဝှက်နှင့် မတူရပါ",
            )

        user.password_hash = hash_password(new_password)
        self.repo.update(user)

    def get_current_user(self, user_id: str) -> dict:
        """Get current user by ID"""
        user = self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="အသုံးပြုသူ မတွေ့ရှိပါ"
            )

        user_dict = self._user_to_dict(user)

        # Add staff info if exists
        if self.staff_repo:
            staff = self.staff_repo.get_by_user_id(user.id)
            if staff:
                user_dict["staff"] = {
                    "staff_id": staff.staff_id,
                    "role": staff.role.value if isinstance(staff.role, StaffRole) else staff.role,
                    "department": staff.department,
                    "status": staff.status.value if hasattr(staff.status, 'value') else staff.status,
                    "is_available": staff.is_available
                }

        return user_dict

    def get_all_users(self, current_user_role: UserRole) -> list:
        """Get all users (admin only)"""
        if current_user_role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ဤလုပ်ဆောင်ချက်အတွက် အခွင့်အရေးမရှိပါ"
            )
        users = self.repo.get_all()

        result = []
        for user in users:
            user_dict = self._user_to_dict(user)

            # Add staff info if exists
            if self.staff_repo:
                staff = self.staff_repo.get_by_user_id(user.id)
                if staff:
                    user_dict["staff"] = {
                        "staff_id": staff.staff_id,
                        "role": staff.role.value if isinstance(staff.role, StaffRole) else staff.role,
                        "is_available": staff.is_available
                    }

            result.append(user_dict)

        return result

    def update_user_role(self, user_id: str, new_role: UserRole, current_user_role: UserRole) -> dict:
        """Update user role (super admin only)"""
        if current_user_role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="စူပါအက်ဒမင် အခွင့်အရေးသာ ရှိပါသည်"
            )

        user = self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="အသုံးပြုသူ မတွေ့ရှိပါ"
            )

        user.role = new_role
        self.repo.db.commit()
        return self._user_to_dict(user)

    def _user_to_dict(self, user: User) -> dict:
        """Convert user model to dictionary"""
        return {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role": user.role.value if isinstance(user.role, UserRole) else user.role,
            "is_active": user.is_active,
        }