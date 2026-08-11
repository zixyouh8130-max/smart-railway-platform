# api/dashboard.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from math import radians, sin, cos, sqrt, atan2
from ..core.database import get_db
from ..models.station import Station
from ..models.train_rider_device import TrainRiderDevice
from ..models.train import Train
from ..models.train_stop import TrainStop
from ..models.route_station import RouteStation
from ..models.station_arrival_log import StationArrivalLog
from ..models.location_history import LocationHistory
from ..models.train_staff_assignment import TrainStaffAssignment
from datetime import datetime, timedelta

router = APIRouter(tags=["Dashboard"])


@router.get("/active-trains")
async def get_active_trains_overview(db: Session = Depends(get_db)):
    """Get overview of all active trains"""
    active_devices = db.query(TrainRiderDevice).filter(
        TrainRiderDevice.status == "ACTIVE",
        TrainRiderDevice.device_type == "TRAIN_DEVICE"
    ).all()

    overview = []
    for device in active_devices:
        if not device.train:
            continue

        # Get train stops
        train_stops = db.query(TrainStop).join(RouteStation).filter(
            TrainStop.train_id == device.train_id
        ).order_by(RouteStation.order_number).all()

        total_stops = len(train_stops)
        completed_stops = sum(1 for stop in train_stops if stop.status == "DEPARTED")
        progress = (completed_stops / total_stops * 100) if total_stops > 0 else 0

        # Get latest arrival
        latest_arrival = db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.status == "ARRIVED"
        ).order_by(StationArrivalLog.arrival_time.desc()).first()

        delay = latest_arrival.arrival_delay_minutes if latest_arrival else 0

        # Get staff
        staff_assignments = db.query(TrainStaffAssignment).filter(
            TrainStaffAssignment.train_id == device.train_id,
            TrainStaffAssignment.status.in_(["SCHEDULED", "ACTIVE"])
        ).all()

        staff_list = []
        for assignment in staff_assignments:
            if assignment.staff and assignment.staff.user:
                staff_list.append({
                    "staff_name": assignment.staff.user.full_name,
                    "role": assignment.role_on_train,
                    "staff_id": assignment.staff.staff_id
                })

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
            "current_station": device.current_route_station.name if device.current_route_station else None,
            "next_station": device.next_route_station.name if device.next_route_station else None,
            "progress": {
                "completed_stops": completed_stops,
                "total_stops": total_stops,
                "percentage": round(progress, 1)
            },
            "delay_minutes": delay,
            "status": device.status,
            "staff": staff_list,
            "battery": device.battery_level
        })

    return overview


@router.get("/train/{train_id}")
async def get_train_detailed_status(train_id: int, db: Session = Depends(get_db)):
    """Get detailed status of a specific train"""
    device = db.query(TrainRiderDevice).filter(
        TrainRiderDevice.train_id == train_id,
        TrainRiderDevice.device_type == "TRAIN_DEVICE"
    ).first()

    if not device:
        return {"error": "No active device found for this train"}

    train = db.query(Train).filter(Train.id == train_id).first()

    # Get train stops
    train_stops = db.query(TrainStop).join(RouteStation).filter(
        TrainStop.train_id == train_id
    ).order_by(RouteStation.order_number).all()

    stops_detail = []
    for stop in train_stops:
        station = stop.route_station
        if not station:
            continue

        arrival_log = db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.route_station_id == station.id
        ).order_by(StationArrivalLog.arrival_time.desc()).first()

        stops_detail.append({
            "station_name": station.name,
            "station_code": station.station_code,
            "order_number": station.order_number,
            "expected_arrival": stop.expected_arrival_time.strftime("%H:%M") if stop.expected_arrival_time else None,
            "expected_departure": stop.expected_departure_time.strftime(
                "%H:%M") if stop.expected_departure_time else None,
            "actual_arrival": arrival_log.arrival_time.isoformat() if arrival_log and arrival_log.arrival_time else None,
            "actual_departure": arrival_log.departure_time.isoformat() if arrival_log and arrival_log.departure_time else None,
            "delay_minutes": arrival_log.arrival_delay_minutes if arrival_log else 0,
            "status": stop.status,
            "stop_duration": arrival_log.stop_duration_minutes if arrival_log else None
        })

    return {
        "train": {
            "id": train.id if train else None,
            "name": train.train_name if train else None,
            "train_no": train.train_no if train else None
        },
        "current_status": {
            "latitude": device.current_latitude,
            "longitude": device.current_longitude,
            "speed": device.current_speed,
            "battery": device.battery_level,
            "last_update": device.location_updated_at.isoformat() if device.location_updated_at else None
        },
        "route_progress": stops_detail,
        "schedule": {
            "departure_date": device.schedule.departure_date.isoformat() if device.schedule else None,
            "status": device.schedule.status if device.schedule else None
        }
    }


@router.get("/nearby-stations")
async def get_nearby_stations(
        latitude: float,
        longitude: float,
        radius_km: float = Query(default=10, ge=1, le=50),
        db: Session = Depends(get_db)
):
    """Find stations near a given location"""
    # Get all stations (check if latitude/longitude exist)
    stations = db.query(Station).all()

    nearby = []
    for station in stations:
        # Check if station has coordinates - try different attribute names
        station_lat = getattr(station, 'latitude', None)
        station_lng = getattr(station, 'longitude', None)

        if station_lat is None or station_lng is None:
            continue

        try:
            distance = calculate_distance(
                latitude, longitude,
                float(station_lat), float(station_lng)
            )

            if distance <= radius_km * 1000:
                nearby.append({
                    "station_name": station.name,
                    "station_code": getattr(station, 'station_code', None),
                    "latitude": float(station_lat),
                    "longitude": float(station_lng),
                    "distance_meters": round(distance, 1),
                    "distance_km": round(distance / 1000, 2)
                })
        except (ValueError, TypeError) as e:
            continue  # Skip stations with invalid coordinates

    nearby.sort(key=lambda x: x["distance_meters"])
    return nearby


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS coordinates in meters"""
    R = 6371000  # Earth's radius in meters

    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c