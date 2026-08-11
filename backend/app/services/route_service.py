# services/schedule_service.py
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import time, datetime, timedelta
from ..models.route import Route
from ..models.route_station import RouteStation


class ScheduleService:
    def __init__(self, db: Session):
        self.db = db

    def calculate_arrival_times(
            self,
            route_id: int,
            base_start_time: Optional[time] = None,
            time_between_stations: Optional[Dict[int, int]] = None  # station_order -> minutes
    ) -> List[Dict]:
        """
        Calculate expected arrival/departure times for all stations on a route
        """
        route = self.db.query(Route).filter(Route.id == route_id).first()
        if not route:
            raise ValueError("Route not found")

        stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == route_id
        ).order_by(RouteStation.order_number).all()

        if not stations:
            return []

        # Use route start time if not provided
        start_time = base_start_time or route.start_time
        if not start_time:
            raise ValueError("No start time configured for this route")

        # Create base time as datetime for calculations
        base_datetime = datetime.combine(datetime.today(), start_time)

        schedule = []
        current_time = base_datetime

        for i, station in enumerate(stations):
            # Calculate time from origin if not provided
            if i > 0:
                # Use provided time between stations or default
                travel_time = time_between_stations.get(station.order_number, 30)  # default 30 min
                current_time += timedelta(minutes=travel_time)

                # Update station with calculated times
                station.expected_arrival_time = current_time.time()

                # Add stop duration
                stop_duration = station.stop_duration_minutes or 2
                departure_time = current_time + timedelta(minutes=stop_duration)
                station.expected_departure_time = departure_time.time()
                station.time_from_origin_minutes = int((current_time - base_datetime).total_seconds() / 60)

                # Update in database
                self.db.add(station)

                # Move current time to departure time for next leg
                current_time = departure_time
            else:
                # First station - departure time is start time
                station.expected_arrival_time = start_time
                stop_duration = station.stop_duration_minutes or 2
                departure_time = base_datetime + timedelta(minutes=stop_duration)
                station.expected_departure_time = departure_time.time()
                station.time_from_origin_minutes = 0
                self.db.add(station)
                current_time = departure_time

            schedule.append({
                'station_name': station.station_name,
                'order_number': station.order_number,
                'arrival_time': station.expected_arrival_time,
                'departure_time': station.expected_departure_time,
                'time_from_origin_minutes': station.time_from_origin_minutes,
                'distance_from_origin': station.distance_from_origin
            })

        self.db.commit()
        return schedule

    def get_route_schedule(self, route_id: int) -> List[Dict]:
        """Get the full schedule for a route"""
        stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == route_id
        ).order_by(RouteStation.order_number).all()

        return [{
            'station_name': s.station_name,
            'station_code': s.station_code,
            'order_number': s.order_number,
            'expected_arrival_time': s.expected_arrival_time,
            'expected_departure_time': s.expected_departure_time,
            'time_from_origin_minutes': s.time_from_origin_minutes,
            'distance_from_origin': s.distance_from_origin,
            'is_timed_stop': s.is_timed_stop,
            'stop_duration_minutes': s.stop_duration_minutes
        } for s in stations]

    def calculate_next_train_arrival(
            self,
            route_id: int,
            station_order: int,
            current_time: Optional[datetime] = None
    ) -> Optional[Dict]:
        """Calculate when the next train will arrive at a specific station"""
        current_time = current_time or datetime.now()

        route = self.db.query(Route).filter(Route.id == route_id).first()
        if not route or not route.start_time or not route.frequency_minutes:
            return None

        station = self.db.query(RouteStation).filter(
            RouteStation.route_id == route_id,
            RouteStation.order_number == station_order
        ).first()

        if not station or not station.expected_arrival_time:
            return None

        # Base time for today's schedule
        base_datetime = datetime.combine(current_time.date(), route.start_time)
        station_arrival_datetime = datetime.combine(
            current_time.date(),
            station.expected_arrival_time
        )

        # If arrival time has passed today, add frequency until next arrival
        while station_arrival_datetime < current_time:
            station_arrival_datetime += timedelta(minutes=route.frequency_minutes)

        time_until_arrival = (station_arrival_datetime - current_time).total_seconds() / 60

        return {
            'station_name': station.station_name,
            'station_code': station.station_code,
            'next_arrival_time': station_arrival_datetime,
            'minutes_until_arrival': int(time_until_arrival),
            'is_timed_stop': station.is_timed_stop,
            'frequency_minutes': route.frequency_minutes
        }