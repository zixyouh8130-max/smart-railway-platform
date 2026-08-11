# repositories/staff_repository.py
from typing import Optional, List
from uuid import UUID
from sqlalchemy.orm import Session
from ..models.staff import Staff, StaffRole, StaffStatus


class StaffRepository:
    """Repository for staff-related database operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, staff_id: UUID) -> Optional[Staff]:
        """Get staff by ID"""
        return self.db.query(Staff).filter(Staff.id == staff_id).first()

    def get_by_user_id(self, user_id: UUID) -> Optional[Staff]:
        """Get staff by user ID"""
        return self.db.query(Staff).filter(Staff.user_id == user_id).first()

    def get_by_staff_id(self, staff_id: str) -> Optional[Staff]:
        """Get staff by staff ID string"""
        return self.db.query(Staff).filter(Staff.staff_id == staff_id).first()

    def get_all(self, role: Optional[StaffRole] = None, status: Optional[StaffStatus] = None) -> List[Staff]:
        """Get all staff members with optional filters"""
        query = self.db.query(Staff)

        if role:
            query = query.filter(Staff.role == role)
        if status:
            query = query.filter(Staff.status == status)

        return query.all()

    def get_available_staff(self, role: Optional[StaffRole] = None) -> List[Staff]:
        """Get available staff members"""
        query = self.db.query(Staff).filter(
            Staff.is_available == True,
            Staff.status == StaffStatus.ACTIVE
        )

        if role:
            query = query.filter(Staff.role == role)

        return query.all()

    def get_train_crew(self) -> List[Staff]:
        """Get all train crew members (drivers, assistants, guards, ticket checkers)"""
        return self.db.query(Staff).filter(
            Staff.role.in_([
                StaffRole.TRAIN_DRIVER,
                StaffRole.ASSISTANT_DRIVER,
                StaffRole.TRAIN_GUARD,
                StaffRole.TICKET_CHECKER
            ])
        ).all()

    def get_station_staff(self) -> List[Staff]:
        """Get all station staff members"""
        return self.db.query(Staff).filter(
            Staff.role.in_([
                StaffRole.STATION_MASTER,
                StaffRole.STATION_STAFF
            ])
        ).all()

    def create(self, staff: Staff) -> Staff:
        """Create a new staff member"""
        self.db.add(staff)
        self.db.commit()
        self.db.refresh(staff)
        return staff

    def update(self, staff: Staff) -> Staff:
        """Update a staff member"""
        self.db.commit()
        self.db.refresh(staff)
        return staff

    def delete(self, staff_id: UUID) -> bool:
        """Delete a staff member"""
        staff = self.get_by_id(staff_id)
        if staff:
            self.db.delete(staff)
            self.db.commit()
            return True
        return False

    def update_availability(self, staff_id: UUID, is_available: bool) -> Optional[Staff]:
        """Update staff availability"""
        staff = self.get_by_id(staff_id)
        if staff:
            staff.is_available = is_available
            self.db.commit()
            self.db.refresh(staff)
        return staff

    def update_status(self, staff_id: UUID, status: StaffStatus) -> Optional[Staff]:
        """Update staff status"""
        staff = self.get_by_id(staff_id)
        if staff:
            staff.status = status
            self.db.commit()
            self.db.refresh(staff)
        return staff