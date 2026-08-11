# services/staff_assignment_service.py

from datetime import date, datetime, time, timedelta
from uuid import UUID
from typing import Tuple, List, Optional
from sqlalchemy.orm import Session

from ..models.train_staff_assignment import TrainStaffAssignment, AssignmentStatus
from ..models.schedule import Schedule
from ..models.staff import Staff, StaffRole, StaffStatus


class StaffAssignmentService:
    def __init__(self, db: Session):
        self.db = db

    def is_staff_available(
            self,
            staff_id: UUID,
            assignment_date: date,
            schedule_id: Optional[int] = None,
            departure_time: Optional[time] = None,
            arrival_time: Optional[time] = None,
            is_overnight: bool = False
    ) -> Tuple[bool, str]:
        """
        Check if staff is available for assignment on a given date and time.
        A staff member is available if they don't have any conflicting assignments
        that overlap in TIME with the proposed schedule.
        """
        # If no specific times are provided, fall back to date-only check
        if departure_time is None:
            query = self.db.query(TrainStaffAssignment).filter(
                TrainStaffAssignment.staff_id == staff_id,
                TrainStaffAssignment.assignment_date == assignment_date,
                TrainStaffAssignment.status.in_([
                    AssignmentStatus.SCHEDULED,
                    AssignmentStatus.ACTIVE
                ])
            )

            if schedule_id:
                query = query.filter(TrainStaffAssignment.schedule_id != schedule_id)

            conflicting = query.first()

            if conflicting:
                return False, f"Already assigned to schedule #{conflicting.schedule_id} on {assignment_date}"
            return True, "Available"

        # Time-based conflict detection
        check_dates = [assignment_date]

        # If the new schedule is overnight, also check the next day
        if is_overnight:
            next_day = assignment_date + timedelta(days=1)
            check_dates.append(next_day)

        # Also check the previous day
        prev_day = assignment_date - timedelta(days=1)
        check_dates.append(prev_day)

        # Get all assignments for the relevant dates
        existing_assignments = self.db.query(TrainStaffAssignment).join(
            Schedule,
            TrainStaffAssignment.schedule_id == Schedule.id,
            isouter=True
        ).filter(
            TrainStaffAssignment.staff_id == staff_id,
            TrainStaffAssignment.assignment_date.in_(check_dates),
            TrainStaffAssignment.status.in_([
                AssignmentStatus.SCHEDULED,
                AssignmentStatus.ACTIVE
            ])
        )

        if schedule_id:
            existing_assignments = existing_assignments.filter(
                TrainStaffAssignment.schedule_id != schedule_id
            )

        existing_assignments = existing_assignments.all()

        # If no existing assignments, staff is available
        if not existing_assignments:
            return True, "Available"

        # Calculate the time range of the new schedule
        new_start_minutes = self._time_to_minutes(departure_time)
        new_end_minutes = self._time_to_minutes(arrival_time) if arrival_time else new_start_minutes + 60

        # Handle overnight: if arrival is before departure, add 24 hours
        if is_overnight or (arrival_time and arrival_time < departure_time):
            new_end_minutes += 1440  # Add 24 hours in minutes

        # Check each existing assignment for time overlap
        for assignment in existing_assignments:
            assignment_departure = None
            assignment_arrival = None
            assignment_is_overnight = False

            # Get the schedule details if available
            if assignment.schedule:
                assignment_departure = assignment.schedule.departure_time
                assignment_arrival = assignment.schedule.arrival_time
                assignment_is_overnight = assignment.schedule.is_overnight or False

            # If no schedule time info, assume the assignment takes the whole day
            if not assignment_departure:
                return False, f"Already assigned to schedule #{assignment.schedule_id} on {assignment.assignment_date} (full day)"

            # Calculate existing assignment time range
            existing_start_minutes = self._time_to_minutes(assignment_departure)
            existing_end_minutes = self._time_to_minutes(
                assignment_arrival) if assignment_arrival else existing_start_minutes + 60

            # Handle existing overnight assignment
            if assignment_is_overnight or (assignment_arrival and assignment_arrival < assignment_departure):
                existing_end_minutes += 1440

            # 🆕 FIX: Convert assignment_date to date if it's datetime
            assign_date = assignment.assignment_date
            if isinstance(assign_date, datetime):
                assign_date = assign_date.date()

            # Adjust time ranges based on date difference
            date_diff_days = (assign_date - assignment_date).days

            # Shift existing assignment times by date difference
            existing_start_minutes += date_diff_days * 1440
            existing_end_minutes += date_diff_days * 1440

            # Check for overlap: start1 < end2 AND start2 < end1
            if new_start_minutes < existing_end_minutes and existing_start_minutes < new_end_minutes:
                overlap_start = max(new_start_minutes, existing_start_minutes)
                overlap_end = min(new_end_minutes, existing_end_minutes)

                return False, (
                    f"Time conflict with schedule #{assignment.schedule_id} "
                    f"on {assign_date} "
                    f"({self._minutes_to_time_str(existing_start_minutes % 1440)} - "
                    f"{self._minutes_to_time_str(existing_end_minutes % 1440)})"
                )

        return True, "Available"

    def get_available_staff_for_train(
            self,
            train_id: int,
            assignment_date: date,
            schedule_id: Optional[int] = None,
            role: Optional[StaffRole] = None,
            departure_time: Optional[time] = None,
            arrival_time: Optional[time] = None,
            is_overnight: bool = False
    ) -> List[dict]:
        """
        Get all staff available for a train on a specific date and time.
        Filters out staff with conflicting time assignments.
        """
        # Get all active staff
        staff_query = self.db.query(Staff).filter(
            Staff.status.in_([StaffStatus.ACTIVE, StaffStatus.ON_DUTY])
        )

        if role:
            staff_query = staff_query.filter(Staff.role == role)

        all_staff = staff_query.all()

        available_staff = []
        for staff in all_staff:
            is_available, _ = self.is_staff_available(
                staff.id,
                assignment_date,
                schedule_id=schedule_id,
                departure_time=departure_time,
                arrival_time=arrival_time,
                is_overnight=is_overnight
            )

            if is_available:
                role_value = staff.role.value if hasattr(staff.role, 'value') else str(staff.role)

                staff_data = {
                    "id": str(staff.id),
                    "staff_id": staff.staff_id,
                    "role": role_value,
                    "phone": staff.phone,
                    "user": None
                }

                if hasattr(staff, 'user') and staff.user:
                    staff_data["user"] = {
                        "full_name": getattr(staff.user, 'full_name', None) or staff.staff_id,
                        "email": getattr(staff.user, 'email', None)
                    }
                else:
                    staff_data["user"] = {
                        "full_name": staff.staff_id,
                        "email": None
                    }

                available_staff.append(staff_data)

        return available_staff

    def _time_to_minutes(self, t: Optional[time]) -> int:
        """Convert a time object to minutes since midnight."""
        if t is None:
            return 0
        return t.hour * 60 + t.minute

    def _minutes_to_time_str(self, minutes: int) -> str:
        """Convert minutes since midnight to HH:MM string."""
        minutes = minutes % 1440  # Normalize to 0-1439
        hours = minutes // 60
        mins = minutes % 60
        return f"{hours:02d}:{mins:02d}"