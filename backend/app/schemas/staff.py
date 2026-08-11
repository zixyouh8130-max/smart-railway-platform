# schemas/staff.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from ..models.staff import StaffRole, StaffStatus
from ..models.train_staff_assignment import AssignmentStatus
from ..models.staff_attendance import AttendanceType

class UpdateStatusRequest(BaseModel):
    status: str

# Staff Schemas
class StaffBase(BaseModel):
    staff_id: str
    role: StaffRole
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    department: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry_date: Optional[datetime] = None
    certification_details: Optional[str] = None


class StaffCreate(StaffBase):
    user_id: UUID


class StaffUpdate(BaseModel):
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    department: Optional[str] = None
    status: Optional[StaffStatus] = None
    is_available: Optional[bool] = None
    notes: Optional[str] = None


class StaffResponse(StaffBase):
    id: UUID
    user_id: UUID
    joining_date: datetime
    status: StaffStatus
    is_available: bool
    created_at: datetime

    class Config:
        from_attributes = True


# 🆕 Staff User Info (for availability endpoint)
class StaffUserInfo(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None


# 🆕 Available Staff Response
class AvailableStaffResponse(BaseModel):
    id: str
    staff_id: str
    role: str
    phone: Optional[str] = None
    user: Optional[StaffUserInfo] = None


# 🆕 Available Staff List Response
class AvailableStaffListResponse(BaseModel):
    staff: List[AvailableStaffResponse]
    total: int


# Assignment Schemas
class StaffAssignmentBase(BaseModel):
    staff_id: UUID
    train_id: int
    role_on_train: str
    assignment_date: date
    start_time: datetime
    end_time: Optional[datetime] = None
    from_station_id: Optional[int] = None
    to_station_id: Optional[int] = None
    remarks: Optional[str] = None


class StaffAssignmentCreate(StaffAssignmentBase):
    schedule_id: Optional[int] = None


class StaffAssignmentResponse(StaffAssignmentBase):
    id: UUID
    schedule_id: Optional[int] = None
    status: AssignmentStatus
    created_at: datetime

    class Config:
        from_attributes = True


# Attendance Schemas
class StaffAttendanceCreate(BaseModel):
    staff_id: UUID
    date: date
    check_in_time: Optional[str] = None
    attendance_type: AttendanceType = AttendanceType.PRESENT
    location_check_in: Optional[str] = None
    device_id: Optional[str] = None
    remarks: Optional[str] = None


class StaffAttendanceResponse(StaffAttendanceCreate):
    id: UUID
    check_out_time: Optional[str] = None
    location_check_out: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True