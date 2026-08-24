# services/staff_assignment_service.py

from datetime import date, datetime, time, timedelta
from uuid import UUID
from typing import Tuple, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.train_staff_assignment import (
    TrainStaffAssignment,
    AssignmentStatus,
)
from ..models.schedule import Schedule
from ..models.staff import (
    Staff,
    StaffRole,
    StaffStatus,
)


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
        Check for overlapping schedule assignments.

        assignment_date is currently a timestamp column, so compare its DATE
        portion to Python date values instead of comparing timestamp == date.
        """
        if departure_time is None:
            query = (
                self.db.query(TrainStaffAssignment)
                .filter(
                    TrainStaffAssignment.staff_id == staff_id,
                    func.date(
                        TrainStaffAssignment.assignment_date
                    ) == assignment_date,
                    TrainStaffAssignment.status.in_([
                        AssignmentStatus.SCHEDULED,
                        AssignmentStatus.ACTIVE,
                    ])
                )
            )

            if schedule_id is not None:
                query = query.filter(
                    TrainStaffAssignment.schedule_id != schedule_id
                )

            conflicting = query.first()

            if conflicting:
                return (
                    False,
                    f"Already assigned to schedule "
                    f"#{conflicting.schedule_id} on {assignment_date}"
                )

            return True, "Available"

        check_dates = [
            assignment_date,
            assignment_date - timedelta(days=1),
        ]

        if is_overnight:
            check_dates.append(
                assignment_date + timedelta(days=1)
            )

        existing_assignments = (
            self.db.query(TrainStaffAssignment)
            .join(
                Schedule,
                TrainStaffAssignment.schedule_id == Schedule.id,
                isouter=True
            )
            .filter(
                TrainStaffAssignment.staff_id == staff_id,
                func.date(
                    TrainStaffAssignment.assignment_date
                ).in_(check_dates),
                TrainStaffAssignment.status.in_([
                    AssignmentStatus.SCHEDULED,
                    AssignmentStatus.ACTIVE,
                ])
            )
        )

        if schedule_id is not None:
            existing_assignments = existing_assignments.filter(
                TrainStaffAssignment.schedule_id != schedule_id
            )

        existing_assignments = existing_assignments.all()

        if not existing_assignments:
            return True, "Available"

        new_start_minutes = self._time_to_minutes(departure_time)
        new_end_minutes = (
            self._time_to_minutes(arrival_time)
            if arrival_time
            else new_start_minutes + 60
        )

        if (
            is_overnight
            or (
                arrival_time
                and arrival_time < departure_time
            )
        ):
            new_end_minutes += 1440

        for assignment in existing_assignments:
            existing_schedule = assignment.schedule

            assignment_departure = (
                existing_schedule.departure_time
                if existing_schedule
                else None
            )
            assignment_arrival = (
                existing_schedule.arrival_time
                if existing_schedule
                else None
            )
            assignment_is_overnight = bool(
                existing_schedule
                and existing_schedule.is_overnight
            )

            if not assignment_departure:
                return (
                    False,
                    f"Already assigned to schedule "
                    f"#{assignment.schedule_id} with no usable time range"
                )

            existing_start_minutes = self._time_to_minutes(
                assignment_departure
            )
            existing_end_minutes = (
                self._time_to_minutes(assignment_arrival)
                if assignment_arrival
                else existing_start_minutes + 60
            )

            if (
                assignment_is_overnight
                or (
                    assignment_arrival
                    and assignment_arrival < assignment_departure
                )
            ):
                existing_end_minutes += 1440

            # Prefer the schedule's actual service date.
            assign_date = (
                existing_schedule.departure_date
                if (
                    existing_schedule
                    and existing_schedule.departure_date
                )
                else assignment.assignment_date
            )

            if isinstance(assign_date, datetime):
                assign_date = assign_date.date()

            date_diff_days = (
                assign_date - assignment_date
            ).days

            existing_start_minutes += date_diff_days * 1440
            existing_end_minutes += date_diff_days * 1440

            if (
                new_start_minutes < existing_end_minutes
                and existing_start_minutes < new_end_minutes
            ):
                return (
                    False,
                    f"Time conflict with schedule #{assignment.schedule_id} "
                    f"on {assign_date} "
                    f"({self._minutes_to_time_str(existing_start_minutes)} - "
                    f"{self._minutes_to_time_str(existing_end_minutes)})"
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
        Return staff with no overlapping assignment.
        train_id remains for API compatibility.
        """
        staff_query = self.db.query(Staff).filter(
            Staff.status.in_([
                StaffStatus.ACTIVE,
                StaffStatus.ON_DUTY,
            ])
        )

        if role:
            staff_query = staff_query.filter(
                Staff.role == role
            )

        available_staff = []

        for staff in staff_query.all():
            is_available, _ = self.is_staff_available(
                staff.id,
                assignment_date,
                schedule_id=schedule_id,
                departure_time=departure_time,
                arrival_time=arrival_time,
                is_overnight=is_overnight
            )

            if not is_available:
                continue

            role_value = (
                staff.role.value
                if hasattr(staff.role, "value")
                else str(staff.role)
            )

            user_data = {
                "full_name": staff.staff_id,
                "email": None,
            }

            if hasattr(staff, "user") and staff.user:
                user_data = {
                    "full_name": (
                        getattr(
                            staff.user,
                            "full_name",
                            None
                        )
                        or staff.staff_id
                    ),
                    "email": getattr(
                        staff.user,
                        "email",
                        None
                    )
                }

            available_staff.append({
                "id": str(staff.id),
                "staff_id": staff.staff_id,
                "role": role_value,
                "phone": staff.phone,
                "user": user_data
            })

        return available_staff

    @staticmethod
    def _time_to_minutes(t: Optional[time]) -> int:
        if t is None:
            return 0
        return t.hour * 60 + t.minute

    @staticmethod
    def _minutes_to_time_str(minutes: int) -> str:
        minutes %= 1440
        return f"{minutes // 60:02d}:{minutes % 60:02d}"