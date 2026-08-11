# services/location_tracking_service.py
from typing import Optional, Tuple, List
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2
from sqlalchemy.orm import Session
from ..models.train_rider_device import TrainRiderDevice
from ..models.location_history import LocationHistory
from ..models.station_arrival_log import StationArrivalLog
from ..models.train_stop import TrainStop
from ..models.route_station import RouteStation
from ..models.schedule import Schedule


class LocationTrackingService:
    """Service to handle train location tracking and station arrival detection"""

    ARRIVAL_RADIUS_METERS = 3.0  # 3 meters threshold

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two GPS coordinates in meters using Haversine formula"""
        R = 6371000  # Earth's radius in meters

        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)

        a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return R * c

    def update_device_location(
            self,
            device_id: str,
            latitude: float,
            longitude: float,
            speed: Optional[float] = None,
            accuracy: Optional[float] = None
    ) -> dict:
        """Update device location and check for station arrivals"""
        device = self.db.query(TrainRiderDevice).filter(
            TrainRiderDevice.device_id == device_id
        ).first()

        if not device:
            # Auto-create device if it doesn't exist
            device = TrainRiderDevice(
                device_id=device_id,
                device_name=f"Device {device_id}",
                status="ACTIVE"
            )
            self.db.add(device)
            self.db.flush()

        # Update device location
        device.current_latitude = latitude
        device.current_longitude = longitude
        device.current_speed = speed
        device.location_updated_at = datetime.utcnow()

        # Log location history
        location_log = LocationHistory(
            device_id=device.id,
            latitude=latitude,
            longitude=longitude,
            speed=speed,
            accuracy=accuracy,
            timestamp=datetime.utcnow()
        )
        self.db.add(location_log)

        # Check for station arrivals
        result = {
            "device_id": device_id,
            "status": "updated",
            "arrival_detected": False
        }

        if device.train_id and device.schedule_id:
            arrival_check = self.check_station_arrival(device, latitude, longitude)
            result.update(arrival_check)

        self.db.commit()
        return result

    def check_station_arrival(
            self,
            device: TrainRiderDevice,
            latitude: float,
            longitude: float
    ) -> dict:
        """Check if device has arrived at a station"""
        result = {
            "arrival_detected": False,
            "station_name": None,
            "next_station": None
        }

        if not device.train_id:
            return result

        # Get all train stops for this train
        train_stops = self.db.query(TrainStop).join(
            RouteStation
        ).filter(
            TrainStop.train_id == device.train_id
        ).order_by(RouteStation.order_number).all()

        current_time = datetime.utcnow()

        for train_stop in train_stops:
            if not train_stop.route_station:
                continue

            station = train_stop.route_station

            # Skip if station has no coordinates
            # Note: You may need to add latitude/longitude to RouteStation or Station model
            if not hasattr(station, 'latitude') or not hasattr(station, 'longitude'):
                continue

            if not station.latitude or not station.longitude:
                continue

            # Calculate distance to station
            distance = self.calculate_distance(
                latitude, longitude,
                station.latitude, station.longitude
            )

            # Check if within arrival radius
            if distance <= self.ARRIVAL_RADIUS_METERS:
                # Check if already logged recently
                recent_log = self.db.query(StationArrivalLog).filter(
                    StationArrivalLog.device_id == device.id,
                    StationArrivalLog.route_station_id == station.id,
                    StationArrivalLog.schedule_id == device.schedule_id,
                    StationArrivalLog.arrival_time >= current_time - timedelta(minutes=5)
                ).first()

                if recent_log:
                    continue

                # Get next station
                next_stop = self.get_next_station(train_stops, station.order_number)

                # Create arrival log
                arrival_log = StationArrivalLog(
                    device_id=device.id,
                    train_id=device.train_id,
                    schedule_id=device.schedule_id,
                    route_station_id=station.id,
                    train_stop_id=train_stop.id,
                    schedule_date=datetime.utcnow().date(),
                    arrival_time=current_time,
                    expected_arrival_time=train_stop.expected_arrival_time,
                    arrival_latitude=latitude,
                    arrival_longitude=longitude,
                    status="ARRIVED"
                )

                # Calculate delay
                if train_stop.expected_arrival_time:
                    expected_dt = datetime.combine(
                        current_time.date(),
                        train_stop.expected_arrival_time
                    )
                    delay = (current_time - expected_dt).total_seconds() / 60
                    arrival_log.arrival_delay_minutes = max(0, int(delay))

                # Set next station info
                if next_stop and next_stop.route_station:
                    arrival_log.next_route_station_id = next_stop.route_station_id
                    arrival_log.next_station_name = next_stop.route_station.station_name

                    if next_stop.expected_arrival_time:
                        expected_next = datetime.combine(
                            current_time.date(),
                            next_stop.expected_arrival_time
                        )
                        arrival_log.expected_next_arrival = expected_next

                self.db.add(arrival_log)

                # Update device status
                device.current_route_station_id = station.id
                device.next_route_station_id = next_stop.route_station_id if next_stop else None

                # Update train stop status
                train_stop.status = "ARRIVED"
                train_stop.actual_arrival_time = current_time.time()

                result["arrival_detected"] = True
                result["station_name"] = station.station_name
                result["train_stop_id"] = train_stop.id
                result["arrival_time"] = current_time.isoformat()

                if next_stop and next_stop.route_station:
                    result["next_station"] = {
                        "name": next_stop.route_station.station_name,
                        "expected_arrival": next_stop.expected_arrival_time.isoformat() if next_stop.expected_arrival_time else None,
                        "expected_departure": next_stop.expected_departure_time.isoformat() if next_stop.expected_departure_time else None
                    }

                break

        return result

    def log_departure(self, device_id: str, train_stop_id: int) -> dict:
        """Log departure from a station"""
        device = self.db.query(TrainRiderDevice).filter(
            TrainRiderDevice.device_id == device_id
        ).first()

        if not device:
            raise ValueError(f"Device {device_id} not found")

        current_time = datetime.utcnow()

        # Find the latest arrival log for this station
        arrival_log = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.train_stop_id == train_stop_id,
            StationArrivalLog.status == "ARRIVED"
        ).order_by(StationArrivalLog.arrival_time.desc()).first()

        if arrival_log:
            arrival_log.departure_time = current_time

            if arrival_log.arrival_time:
                duration = (current_time - arrival_log.arrival_time).total_seconds()
                arrival_log.stop_duration_seconds = int(duration)
                arrival_log.stop_duration_minutes = int(duration / 60)

            train_stop = self.db.query(TrainStop).filter(
                TrainStop.id == train_stop_id
            ).first()

            if train_stop:
                train_stop.status = "DEPARTED"
                train_stop.actual_departure_time = current_time.time()

                if train_stop.expected_departure_time:
                    expected_dt = datetime.combine(
                        current_time.date(),
                        train_stop.expected_departure_time
                    )
                    departure_delay = (current_time - expected_dt).total_seconds() / 60
                    arrival_log.departure_delay_minutes = max(0, int(departure_delay))

            arrival_log.status = "DEPARTED"
            self.db.commit()

            return {
                "status": "departed",
                "stop_duration_seconds": arrival_log.stop_duration_seconds,
                "stop_duration_minutes": arrival_log.stop_duration_minutes
            }

        return {"status": "no_arrival_log_found"}

    def get_next_station(self, train_stops: List[TrainStop], current_order: int) -> Optional[TrainStop]:
        """Get the next station in the route"""
        for stop in train_stops:
            if stop.route_station and stop.route_station.order_number > current_order:
                return stop
        return None

    def get_device_status(self, device_id: str) -> dict:
        """Get detailed status of a train rider device"""
        device = self.db.query(TrainRiderDevice).filter(
            TrainRiderDevice.device_id == device_id
        ).first()

        if not device:
            raise ValueError(f"Device {device_id} not found")

        recent_locations = self.db.query(LocationHistory).filter(
            LocationHistory.device_id == device.id
        ).order_by(LocationHistory.timestamp.desc()).limit(10).all()

        recent_logs = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id
        ).order_by(StationArrivalLog.created_at.desc()).limit(5).all()

        return {
            "device_id": device.device_id,
            "device_name": device.device_name,
            "status": device.status,
            "current_location": {
                "latitude": device.current_latitude,
                "longitude": device.current_longitude,
                "updated_at": device.location_updated_at.isoformat() if device.location_updated_at else None
            },
            "current_speed": device.current_speed,
            "current_station": device.current_route_station.station_name if device.current_route_station else None,
            "next_station": device.next_route_station.station_name if device.next_route_station else None,
            "train": {
                "id": device.train_id,
                "name": device.train.train_name if device.train else None
            } if device.train else None,
            "recent_locations": [
                {
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                    "speed": loc.speed,
                    "timestamp": loc.timestamp.isoformat()
                } for loc in recent_locations
            ],
            "recent_arrivals": [
                {
                    "station": log.route_station.station_name if log.route_station else None,
                    "arrival_time": log.arrival_time.isoformat() if log.arrival_time else None,
                    "departure_time": log.departure_time.isoformat() if log.departure_time else None,
                    "status": log.status,
                    "delay_minutes": log.arrival_delay_minutes
                } for log in recent_logs
            ]
        }