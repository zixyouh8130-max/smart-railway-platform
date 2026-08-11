# services/train_tracking_dashboard_service.py
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload
from ..models.train_rider_device import TrainRiderDevice
from ..models.location_history import LocationHistory
from ..models.station_arrival_log import StationArrivalLog
from ..models.train import Train
from ..models.schedule import Schedule
from ..models.route_station import RouteStation
from ..models.train_stop import TrainStop
from ..models.train_staff_assignment import TrainStaffAssignment


class TrainTrackingDashboardService:
    """Service for real-time train tracking dashboard"""

    def __init__(self, db: Session):
        self.db = db

    def get_active_trains_overview(self) -> List[Dict]:
        """Get overview of all active trains with their current status"""
        active_devices = self.db.query(TrainRiderDevice).filter(
            TrainRiderDevice.status == "ACTIVE",
            TrainRiderDevice.device_type == "TRAIN_DEVICE"
        ).options(
            joinedload(TrainRiderDevice.train),
            joinedload(TrainRiderDevice.current_route_station),
            joinedload(TrainRiderDevice.next_route_station)
        ).all()

        overview = []
        for device in active_devices:
            if not device.train:
                continue

            # Get train stops to determine progress
            train_stops = self.db.query(TrainStop).filter(
                TrainStop.train_id == device.train_id
            ).order_by(TrainStop.route_station.has(RouteStation.order_number)).all()

            # Calculate progress
            total_stops = len(train_stops)
            completed_stops = sum(1 for stop in train_stops if stop.status == "DEPARTED")
            progress_percentage = (completed_stops / total_stops * 100) if total_stops > 0 else 0

            # Get latest arrival log
            latest_arrival = self.db.query(StationArrivalLog).filter(
                StationArrivalLog.device_id == device.id,
                StationArrivalLog.status == "ARRIVED"
            ).order_by(StationArrivalLog.arrival_time.desc()).first()

            # Calculate delay
            delay_minutes = 0
            if latest_arrival and latest_arrival.arrival_delay_minutes:
                delay_minutes = latest_arrival.arrival_delay_minutes

            # Get assigned staff
            staff_assignments = self.db.query(TrainStaffAssignment).filter(
                TrainStaffAssignment.train_id == device.train_id,
                TrainStaffAssignment.status.in_(["SCHEDULED", "ACTIVE"])
            ).all()

            staff_list = [
                {
                    "staff_name": assignment.staff.user.full_name if assignment.staff.user else "Unknown",
                    "role": assignment.role_on_train,
                    "staff_id": assignment.staff.staff_id
                }
                for assignment in staff_assignments
            ]

            overview.append({
                "train_id": device.train_id,
                "train_name": device.train.train_name,
                "train_no": device.train.train_no,
                "device_id": device.device_id,
                "current_location": {
                    "latitude": device.current_latitude,
                    "longitude": device.current_longitude,
                    "speed": device.current_speed,
                    "updated_at": device.location_updated_at.isoformat() if device.location_updated_at else None
                },
                "current_station": device.current_route_station.station_name if device.current_route_station else None,
                "next_station": device.next_route_station.station_name if device.next_route_station else None,
                "progress": {
                    "completed_stops": completed_stops,
                    "total_stops": total_stops,
                    "percentage": round(progress_percentage, 1)
                },
                "delay_minutes": delay_minutes,
                "status": device.status,
                "staff": staff_list,
                "battery": device.battery_level
            })

        return overview

    def get_train_detailed_status(self, train_id: int) -> Dict:
        """Get detailed status of a specific train"""
        device = self.db.query(TrainRiderDevice).filter(
            TrainRiderDevice.train_id == train_id,
            TrainRiderDevice.device_type == "TRAIN_DEVICE"
        ).options(
            joinedload(TrainRiderDevice.train),
            joinedload(TrainRiderDevice.schedule)
        ).first()

        if not device:
            return {"error": "No active device found for this train"}

        # Get train stops with status
        train_stops = self.db.query(TrainStop).filter(
            TrainStop.train_id == train_id
        ).options(
            joinedload(TrainStop.route_station)
        ).order_by(TrainStop.route_station.has(RouteStation.order_number)).all()

        stops_detail = []
        for stop in train_stops:
            station = stop.route_station
            if not station:
                continue

            # Get arrival log for this stop
            arrival_log = self.db.query(StationArrivalLog).filter(
                StationArrivalLog.device_id == device.id,
                StationArrivalLog.route_station_id == station.id
            ).order_by(StationArrivalLog.arrival_time.desc()).first()

            stops_detail.append({
                "station_name": station.station_name,
                "station_code": station.station_code,
                "order_number": station.order_number,
                "expected_arrival": stop.expected_arrival_time.strftime(
                    "%H:%M") if stop.expected_arrival_time else None,
                "expected_departure": stop.expected_departure_time.strftime(
                    "%H:%M") if stop.expected_departure_time else None,
                "actual_arrival": arrival_log.arrival_time.isoformat() if arrival_log and arrival_log.arrival_time else None,
                "actual_departure": arrival_log.departure_time.isoformat() if arrival_log and arrival_log.departure_time else None,
                "delay_minutes": arrival_log.arrival_delay_minutes if arrival_log else 0,
                "status": stop.status,
                "stop_duration": arrival_log.stop_duration_minutes if arrival_log else None
            })

        # Get recent location history
        recent_locations = self.db.query(LocationHistory).filter(
            LocationHistory.device_id == device.id,
            LocationHistory.timestamp >= datetime.utcnow() - timedelta(hours=1)
        ).order_by(LocationHistory.timestamp.desc()).limit(50).all()

        location_points = [
            {
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "speed": loc.speed,
                "timestamp": loc.timestamp.isoformat()
            }
            for loc in recent_locations
        ]

        return {
            "train": {
                "id": device.train.id,
                "name": device.train.train_name,
                "train_no": device.train.train_no,
                "speed": device.train.speed
            },
            "current_status": {
                "latitude": device.current_latitude,
                "longitude": device.current_longitude,
                "speed": device.current_speed,
                "battery": device.battery_level,
                "last_update": device.location_updated_at.isoformat() if device.location_updated_at else None
            },
            "route_progress": stops_detail,
            "location_history": location_points,
            "schedule": {
                "departure_date": device.schedule.departure_date.isoformat() if device.schedule else None,
                "status": device.schedule.status if device.schedule else None
            }
        }

    def get_nearby_stations(self, latitude: float, longitude: float, radius_km: float = 10) -> List[Dict]:
        """Find stations near a given location"""
        from ..models.station import Station

        # Get all stations with coordinates
        stations = self.db.query(Station).filter(
            Station.latitude.isnot(None),
            Station.longitude.isnot(None)
        ).all()

        nearby = []
        for station in stations:
            distance = self.calculate_distance(
                latitude, longitude,
                station.latitude, station.longitude
            )

            if distance <= radius_km * 1000:  # Convert km to meters
                nearby.append({
                    "station_name": station.station_name,
                    "station_code": station.station_code,
                    "latitude": station.latitude,
                    "longitude": station.longitude,
                    "distance_meters": round(distance, 1),
                    "distance_km": round(distance / 1000, 2)
                })

        # Sort by distance
        nearby.sort(key=lambda x: x["distance_meters"])
        return nearby

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two GPS coordinates in meters"""
        from math import radians, sin, cos, sqrt, atan2

        R = 6371000  # Earth's radius in meters

        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)

        a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return R * c