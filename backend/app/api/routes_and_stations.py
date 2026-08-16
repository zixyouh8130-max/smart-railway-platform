# api/routes_and_stations.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date
from ..core.database import get_db
from ..models.train_rider_device import TrainRiderDevice
from ..models.schedule import Schedule
from ..models.train import Train
from ..models.station import Station

router = APIRouter(prefix="/routes-and-stations", tags=["Routes & Stations"])


@router.get("/active-trains")
async def get_active_trains(db: Session = Depends(get_db)):
    """Get all currently active trains with their real-time locations and route stations"""

    today = date.today()

    # Get ALL active schedules for today
    active_schedules = db.query(Schedule).filter(
        Schedule.departure_date == today,
        Schedule.status.in_(["ACTIVE", "DEPARTED"])
    ).all()

    print(f"📊 Found {len(active_schedules)} active schedules")

    active_trains = []

    for schedule in active_schedules:
        train = db.query(Train).filter(Train.id == schedule.train_id).first()
        if not train:
            continue

        # Find device
        device = db.query(TrainRiderDevice).filter(
            TrainRiderDevice.train_id == train.id,
            TrainRiderDevice.schedule_id == schedule.id,
            TrainRiderDevice.status == "ACTIVE"
        ).first()

        if not device:
            device = db.query(TrainRiderDevice).filter(
                TrainRiderDevice.train_id == train.id
            ).order_by(TrainRiderDevice.location_updated_at.desc()).first()

        # 🆕 Get route stations with status
        from ..models.route_station import RouteStation
        from ..models.train_stop import TrainStop
        from ..models.station_arrival_log import StationArrivalLog

        route_stations = db.query(RouteStation).filter(
            RouteStation.route_id == schedule.route_id
        ).order_by(RouteStation.order_number).all()

        train_stops = db.query(TrainStop).filter(
            TrainStop.train_id == train.id
        ).all()
        train_stops_map = {ts.route_station_id: ts for ts in train_stops}

        arrival_logs = db.query(StationArrivalLog).filter(
            StationArrivalLog.schedule_id == schedule.id
        ).order_by(StationArrivalLog.arrival_time.desc()).all()

        # 🆕 Build station status list
        stations_status = []
        for rs in route_stations:
            train_stop = train_stops_map.get(rs.id)
            arrival_log = next((log for log in arrival_logs if log.route_station_id == rs.id), None)

            station_data = {
                "route_station_id": rs.id,
                "station_name": rs.station_name,
                "station_code": rs.station_code,
                "order_number": rs.order_number,
                "status": arrival_log.status if arrival_log else (train_stop.status if train_stop else "SCHEDULED"),
                "arrival_time": arrival_log.arrival_time.isoformat() + "Z" if arrival_log and arrival_log.arrival_time else None,
                "departure_time": arrival_log.departure_time.isoformat() + "Z" if arrival_log and arrival_log.departure_time else None,
                "delay_minutes": arrival_log.arrival_delay_minutes if arrival_log else 0,
                "expected_arrival": train_stop.expected_arrival_time.strftime("%H:%M") if train_stop and train_stop.expected_arrival_time else None,
                "expected_departure": train_stop.expected_departure_time.strftime("%H:%M") if train_stop and train_stop.expected_departure_time else None,
            }
            stations_status.append(station_data)

        # Calculate progress
        total = len(route_stations)
        completed = len([s for s in stations_status if s["status"] == "DEPARTED"])
        progress = (completed / total * 100) if total > 0 else 0

        train_data = {
            "train_id": train.id,
            "train_name": train.train_name,
            "train_no": train.train_no,
            "schedule_id": schedule.id,
            "status": schedule.status,
            "departure_time": schedule.departure_time.strftime("%H:%M") if schedule.departure_time else None,
            "progress_percent": progress,
            "completed_stations": completed,
            "total_stations": total,
            "device": {
                "device_id": device.device_id if device else None,
                "latitude": float(device.current_latitude) if device and device.current_latitude else None,
                "longitude": float(device.current_longitude) if device and device.current_longitude else None,
                "speed": device.current_speed if device else None,
                "last_update": device.location_updated_at.isoformat() if device and device.location_updated_at else None,
            } if device else None,
            "stations": stations_status,  # 🆕 Add stations
        }

        active_trains.append(train_data)

    print(f"📊 Returning {len(active_trains)} active trains")

    return {
        "active_count": len(active_trains),
        "trains": active_trains
    }


@router.get("/all-devices")
async def get_all_devices(db: Session = Depends(get_db)):
    """Get ALL devices with their current locations"""

    devices = db.query(TrainRiderDevice).all()

    result = []
    for device in devices:
        train = db.query(Train).filter(Train.id == device.train_id).first() if device.train_id else None

        result.append({
            "device_id": device.device_id,
            "device_name": device.device_name,
            "status": device.status,
            "train_id": device.train_id,
            "train_name": train.train_name if train else None,
            "schedule_id": device.schedule_id,
            "latitude": float(device.current_latitude) if device.current_latitude else None,
            "longitude": float(device.current_longitude) if device.current_longitude else None,
            "speed": device.current_speed,
            "last_update": device.location_updated_at.isoformat() if device.location_updated_at else None,
        })

    return {
        "total": len(result),
        "devices": result
    }


@router.get("/all-stations")
async def get_all_stations(db: Session = Depends(get_db)):
    """Get all stations from the stations table with coordinates"""

    stations = db.query(Station).filter(
        Station.is_active == True
    ).order_by(Station.name).all()

    return {
        "total": len(stations),
        "stations": [
            {
                "id": station.id,
                "name": station.name,
                "code": station.code,
                "city": station.city,
                "state_region": station.state_region,
                "latitude": float(station.latitude) if station.latitude else None,
                "longitude": float(station.longitude) if station.longitude else None,
            }
            for station in stations
        ]
    }