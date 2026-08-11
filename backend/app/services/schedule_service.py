# services/schedule_service.py
from uuid import UUID

from sqlalchemy.orm import Session
from datetime import time, datetime, timedelta, timezone
from typing import List, Optional, Dict

from ..models import TrainStaffAssignment, AssignmentStatus, Schedule
from ..models.route import Route
from ..models.route_station import RouteStation
from ..models.train import Train
from ..models.train_stop import TrainStop


class ScheduleService:
    def __init__(self, db: Session):
        self.db = db
    def get_train_schedule(self, train_id: int, route_id: int) -> List[Dict]:
        """Get the complete schedule for a specific train on a route"""
        # Get train stops with route station info
        stops = self.db.query(TrainStop).join(
            RouteStation, TrainStop.route_station_id == RouteStation.id
        ).filter(
            TrainStop.train_id == train_id,
            RouteStation.route_id == route_id
        ).order_by(RouteStation.order_number).all()

        schedule = []
        for stop in stops:
            route_station = self.db.query(RouteStation).filter(
                RouteStation.id == stop.route_station_id
            ).first()

            schedule.append({
                "station_name": route_station.station_name,
                "station_code": route_station.station_code,
                "order_number": route_station.order_number,
                "distance_from_origin": route_station.distance_from_origin,
                "is_major_stop": route_station.is_major_stop,
                "expected_arrival_time": stop.expected_arrival_time.strftime(
                    "%H:%M") if stop.expected_arrival_time else None,
                "expected_departure_time": stop.expected_departure_time.strftime(
                    "%H:%M") if stop.expected_departure_time else None,
                "actual_arrival_time": stop.actual_arrival_time.strftime("%H:%M") if stop.actual_arrival_time else None,
                "actual_departure_time": stop.actual_departure_time.strftime(
                    "%H:%M") if stop.actual_departure_time else None,
                "stop_duration_minutes": stop.stop_duration_minutes,
                "is_timed_stop": stop.is_timed_stop,
                "status": stop.status
            })

        return schedule

    def calculate_train_arrival_times(
            self,
            route_id: int,
            train_id: int,
            departure_time: Optional[str] = None
    ) -> List[Dict]:
        """Calculate arrival/departure times for all stations for a specific train"""
        # Get route stations in order
        stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == route_id
        ).order_by(RouteStation.order_number).all()

        if not stations:
            raise ValueError("No stations found for this route")

        # Get train info
        train = self.db.query(Train).filter(Train.id == train_id).first()
        if not train:
            raise ValueError("Train not found")

        # Determine base departure time
        if departure_time:
            hour, minute = map(int, departure_time.split(':'))
            base_time = datetime(2024, 1, 1, hour, minute)
        else:
            # Use route's default start time or current time
            route = self.db.query(Route).filter(Route.id == route_id).first()
            if route and route.start_time:
                base_time = datetime(2024, 1, 1, route.start_time.hour, route.start_time.minute)
            else:
                base_time = datetime(2024, 1, 1, 6, 0)  # Default 6:00 AM

        # Clear existing stops for this train
        self.db.query(TrainStop).filter(
            TrainStop.train_id == train_id,
            TrainStop.route_station_id.in_([s.id for s in stations])
        ).delete(synchronize_session=False)
        self.db.flush()

        schedule = []
        current_time = base_time

        for i, station in enumerate(stations):
            # Calculate arrival time (add travel time from previous station)
            if i == 0:
                # First station: departure time is base time
                arrival_time = current_time
                departure_time = current_time + timedelta(minutes=2)  # Default 2 min stop
            else:
                # Add travel time from previous station
                time_from_origin = station.time_from_origin_minutes or 0
                arrival_time = base_time + timedelta(minutes=time_from_origin)
                departure_time = arrival_time + timedelta(minutes=2)

            # Create or update train stop
            train_stop = TrainStop(
                train_id=train_id,
                route_station_id=station.id,
                expected_arrival_time=time(arrival_time.hour, arrival_time.minute),
                expected_departure_time=time(departure_time.hour, departure_time.minute),
                is_timed_stop=True,
                stop_duration_minutes=2,
                status="SCHEDULED"
            )
            self.db.add(train_stop)

            schedule.append({
                "station_name": station.station_name,
                "station_code": station.station_code,
                "order_number": station.order_number,
                "expected_arrival_time": arrival_time.strftime("%H:%M"),
                "expected_departure_time": departure_time.strftime("%H:%M")
            })

        self.db.commit()
        return schedule

    def calculate_next_train_arrival(
            self,
            route_id: int,
            train_id: int,
            station_order: int
    ) -> Optional[Dict]:
        """Calculate when the next train will arrive at a specific station"""
        # Get the train stop for this station
        stop = self.db.query(TrainStop).join(
            RouteStation, TrainStop.route_station_id == RouteStation.id
        ).filter(
            TrainStop.train_id == train_id,
            RouteStation.route_id == route_id,
            RouteStation.order_number == station_order
        ).first()

        if not stop or not stop.expected_arrival_time:
            return None

        # Get route station info
        route_station = self.db.query(RouteStation).filter(
            RouteStation.id == stop.route_station_id
        ).first()

        now = datetime.now()
        arrival_time = stop.expected_arrival_time

        # Add buffer time
        buffer = stop.arrival_buffer_minutes or 0
        adjusted_arrival = datetime.combine(now.date(), arrival_time) + timedelta(minutes=buffer)

        return {
            "train_id": train_id,
            "station_name": route_station.station_name,
            "station_order": station_order,
            "expected_arrival": arrival_time.strftime("%H:%M"),
            "expected_arrival_with_buffer": adjusted_arrival.strftime("%H:%M"),
            "buffer_minutes": buffer,
            "status": stop.status,
            "is_timed_stop": stop.is_timed_stop
        }

    def get_route_schedule(self, route_id: int) -> List[Dict]:
        """Get schedule for all trains on a route (legacy method)"""
        route = self.db.query(Route).filter(Route.id == route_id).first()
        if not route:
            raise ValueError("Route not found")

        trains = self.db.query(Train).filter(Train.route_id == route_id).all()

        all_schedules = {}
        for train in trains:
            schedule = self.get_train_schedule(train.id, route_id)
            all_schedules[train.train_no] = schedule

        return all_schedules

    def create_schedules_bulk(self, schedules_data: List[dict]) -> List[Schedule]:
        """Create multiple schedules with staff assignments"""
        created_schedules = []

        for schedule_data in schedules_data:
            # Extract staff data
            driver_id = schedule_data.pop('driver_id', None)
            assistant_driver_id = schedule_data.pop('assistant_driver_id', None)
            guard_id = schedule_data.pop('guard_id', None)
            ticket_checker_ids = schedule_data.pop('ticket_checker_ids', [])

            # Create schedule
            schedule = Schedule(**schedule_data)
            self.db.add(schedule)
            self.db.flush()  # Get schedule ID

            # Create staff assignments
            staff_assignments = []

            if driver_id:
                staff_assignments.append({
                    'staff_id': driver_id,
                    'role': 'TRAIN_DRIVER'
                })

            if assistant_driver_id:
                staff_assignments.append({
                    'staff_id': assistant_driver_id,
                    'role': 'ASSISTANT_DRIVER'
                })

            if guard_id:
                staff_assignments.append({
                    'staff_id': guard_id,
                    'role': 'TRAIN_GUARD'
                })

            for checker_id in ticket_checker_ids:
                if checker_id:
                    staff_assignments.append({
                        'staff_id': checker_id,
                        'role': 'TICKET_CHECKER'
                    })

            # Create staff assignment records
            for assignment_data in staff_assignments:
                assignment = TrainStaffAssignment(
                    staff_id=UUID(assignment_data['staff_id']),
                    train_id=schedule.train_id,
                    schedule_id=schedule.id,
                    role_on_train=assignment_data['role'],
                    assignment_date=schedule.departure_date,
                    start_time=datetime.now(timezone.utc),
                    status=AssignmentStatus.SCHEDULED
                )
                self.db.add(assignment)

            created_schedules.append(schedule)

        self.db.commit()

        # Refresh all created schedules
        for schedule in created_schedules:
            self.db.refresh(schedule)

        return created_schedules

    def update_schedule_with_staff(self, schedule_id: int, update_data: dict) -> Schedule:
        """Update schedule and its staff assignments"""
        schedule = self.db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule:
            raise ValueError("Schedule not found")

        # Extract staff data
        driver_id = update_data.pop('driver_id', None)
        assistant_driver_id = update_data.pop('assistant_driver_id', None)
        guard_id = update_data.pop('guard_id', None)
        ticket_checker_ids = update_data.pop('ticket_checker_ids', [])

        # Update schedule fields
        for key, value in update_data.items():
            if value is not None:
                setattr(schedule, key, value)

        # Remove existing staff assignments for this schedule
        self.db.query(TrainStaffAssignment).filter(
            TrainStaffAssignment.schedule_id == schedule_id
        ).delete()

        # Create new staff assignments
        staff_assignments = []

        if driver_id:
            staff_assignments.append({'staff_id': driver_id, 'role': 'TRAIN_DRIVER'})
        if assistant_driver_id:
            staff_assignments.append({'staff_id': assistant_driver_id, 'role': 'ASSISTANT_DRIVER'})
        if guard_id:
            staff_assignments.append({'staff_id': guard_id, 'role': 'TRAIN_GUARD'})
        for checker_id in (ticket_checker_ids or []):
            if checker_id:
                staff_assignments.append({'staff_id': checker_id, 'role': 'TICKET_CHECKER'})

        for assignment_data in staff_assignments:
            assignment = TrainStaffAssignment(
                staff_id=UUID(assignment_data['staff_id']),
                train_id=schedule.train_id,
                schedule_id=schedule.id,
                role_on_train=assignment_data['role'],
                assignment_date=schedule.departure_date,
                start_time=datetime.now(timezone.utc),
                status=AssignmentStatus.SCHEDULED
            )
            self.db.add(assignment)

        self.db.commit()
        self.db.refresh(schedule)

        return schedule