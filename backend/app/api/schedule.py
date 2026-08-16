from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from datetime import datetime, timedelta, time as dt_time, timezone, date
from pydantic import BaseModel, Field

from ..models import TrainStop, TrainRiderDevice
from ..models.train_staff_assignment import TrainStaffAssignment, AssignmentStatus
from ..core.database import get_db
from ..models.schedule import Schedule
from ..models.station import Station
from ..models.route import Route
from ..models.route_station import RouteStation
from ..models.train import Train
from ..schemas.schedule import (
    ScheduleCreate,
    ScheduleUpdate,
    ScheduleResponse,
    ScheduleListResponse
)
from ..services.schedule_service import ScheduleService
from ..services.staff_assignment_service import StaffAssignmentService

router = APIRouter()


class ScheduleSearchItem(BaseModel):
    schedule_id: int
    route_id: int
    route_name: str
    train_id: Optional[int] = None
    train_name: Optional[str] = None
    departure_station: str
    arrival_station: str
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    available_seats: Optional[int] = None
    status: Optional[str] = None
    days_of_week: Optional[str] = None
    departure_station_order: Optional[int] = None
    arrival_station_order: Optional[int] = None
    estimated_travel_time_minutes: Optional[int] = None

    class Config:
        from_attributes = True


class ScheduleBulkCreate(BaseModel):
    schedules: List[ScheduleCreate] = Field(..., min_items=1, description="List of schedules to create")

    class Config:
        from_attributes = True


class ScheduleBulkResponse(BaseModel):
    success: bool
    created: int
    failed: int
    schedules: List[ScheduleResponse]
    errors: Optional[List[dict]] = None


# Fields that are NOT database columns (relationships or virtual fields)
NON_COLUMN_FIELDS = {
    'staff_assignments', 'driver_id', 'assistant_driver_id',
    'guard_id', 'ticket_checker_ids'
}


def _clean_schedule_dict(schedule_dict: dict) -> dict:
    """Remove non-column fields from schedule dict before creating Schedule object."""
    return {k: v for k, v in schedule_dict.items() if k not in NON_COLUMN_FIELDS}


def _schedule_to_response_dict(schedule: Schedule, staff_data: dict) -> dict:
    """
    Convert a Schedule ORM object to a dict suitable for ScheduleResponse.
    Excludes the staff_assignments relationship and uses the provided staff_data instead.
    """
    return {
        'id': schedule.id,
        'train_id': schedule.train_id,
        'route_id': schedule.route_id,
        'departure_date': schedule.departure_date,
        'departure_time': schedule.departure_time.strftime('%H:%M') if schedule.departure_time else None,
        'arrival_time': schedule.arrival_time.strftime('%H:%M') if schedule.arrival_time else None,
        'is_overnight': schedule.is_overnight or False,
        'arrival_date': schedule.arrival_date,
        'status': schedule.status,
        'train': schedule.train,
        'created_at': schedule.created_at,
        'updated_at': schedule.updated_at,
        **staff_data,
    }


def _create_staff_assignments(db: Session, schedule: Schedule, staff_data: dict) -> List[str]:
    """Create staff assignments for a schedule. Returns list of created role labels."""
    created = []

    staff_mapping = [
        ('driver_id', 'TRAIN_DRIVER'),
        ('assistant_driver_id', 'ASSISTANT_DRIVER'),
        ('guard_id', 'TRAIN_GUARD'),
    ]

    for field, role in staff_mapping:
        staff_id = staff_data.get(field)
        if staff_id:
            try:
                staff_uuid = UUID(staff_id) if isinstance(staff_id, str) else staff_id
                assignment = TrainStaffAssignment(
                    staff_id=staff_uuid,
                    train_id=schedule.train_id,
                    schedule_id=schedule.id,
                    role_on_train=role,
                    assignment_date=schedule.departure_date,
                    start_time=datetime.now(timezone.utc),
                    status=AssignmentStatus.SCHEDULED
                )
                db.add(assignment)
                created.append(role)
                print(f"✅ {role} assigned: {staff_id}")
            except Exception as e:
                print(f"❌ Failed to assign {role} {staff_id}: {e}")

    ticket_checker_ids = staff_data.get('ticket_checker_ids', [])
    if ticket_checker_ids:
        if isinstance(ticket_checker_ids, str):
            ticket_checker_ids = [ticket_checker_ids]
        for checker_id in ticket_checker_ids:
            if checker_id:
                try:
                    checker_uuid = UUID(checker_id) if isinstance(checker_id, str) else checker_id
                    assignment = TrainStaffAssignment(
                        staff_id=checker_uuid,
                        train_id=schedule.train_id,
                        schedule_id=schedule.id,
                        role_on_train='TICKET_CHECKER',
                        assignment_date=schedule.departure_date,
                        start_time=datetime.now(timezone.utc),
                        status=AssignmentStatus.SCHEDULED
                    )
                    db.add(assignment)
                    created.append('TICKET_CHECKER')
                except Exception as e:
                    print(f"❌ Failed to assign TICKET_CHECKER {checker_id}: {e}")

    return created


def _validate_staff_for_schedule(
        db: Session,
        staff_data: dict,
        assignment_date: date,
        schedule_id: Optional[int] = None,
        departure_time: Optional[dt_time] = None,
        arrival_time: Optional[dt_time] = None,
        is_overnight: bool = False
) -> List[str]:
    """Validate all staff assignments for a schedule using time-based conflict detection."""
    service = StaffAssignmentService(db)
    errors = []

    staff_checks = [
        ('driver_id', 'Train Driver'),
        ('assistant_driver_id', 'Assistant Driver'),
        ('guard_id', 'Train Guard'),
    ]

    for field, label in staff_checks:
        staff_id = staff_data.get(field)
        if staff_id:
            try:
                staff_uuid = UUID(staff_id) if isinstance(staff_id, str) else staff_id
                is_available, reason = service.is_staff_available(
                    staff_uuid, assignment_date, schedule_id=schedule_id,
                    departure_time=departure_time, arrival_time=arrival_time, is_overnight=is_overnight
                )
                if not is_available:
                    errors.append(f"❌ {label}: {reason}")
                else:
                    print(f"✅ {label} available: {staff_id}")
            except Exception as e:
                errors.append(f"❌ {label}: Invalid staff ID - {e}")

    ticket_checker_ids = staff_data.get('ticket_checker_ids', [])
    if ticket_checker_ids:
        if isinstance(ticket_checker_ids, str):
            ticket_checker_ids = [ticket_checker_ids]
        for checker_id in ticket_checker_ids:
            if checker_id:
                try:
                    checker_uuid = UUID(checker_id) if isinstance(checker_id, str) else checker_id
                    is_available, reason = service.is_staff_available(
                        checker_uuid, assignment_date, schedule_id=schedule_id,
                        departure_time=departure_time, arrival_time=arrival_time, is_overnight=is_overnight
                    )
                    if not is_available:
                        errors.append(f"❌ Ticket Checker ({checker_id}): {reason}")
                except Exception as e:
                    errors.append(f"❌ Ticket Checker: Invalid staff ID - {e}")

    return errors


def _get_staff_assignments_dict(db: Session, schedule_id: int) -> dict:
    """Get staff assignments for a schedule as a dictionary."""
    assignments = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.schedule_id == schedule_id
    ).all()

    result = {
        'driver_id': None,
        'assistant_driver_id': None,
        'guard_id': None,
        'ticket_checker_ids': [],
        'staff_assignments': []
    }

    for assignment in assignments:
        staff_id_str = str(assignment.staff_id)
        staff = assignment.staff
        staff_info = {
            'staff_id': staff_id_str,
            'role': assignment.role_on_train,
            'staff_name': staff.user.full_name if staff and hasattr(staff, 'user') and staff.user else None,
        }
        result['staff_assignments'].append(staff_info)

        if assignment.role_on_train == 'TRAIN_DRIVER':
            result['driver_id'] = staff_id_str
        elif assignment.role_on_train == 'ASSISTANT_DRIVER':
            result['assistant_driver_id'] = staff_id_str
        elif assignment.role_on_train == 'TRAIN_GUARD':
            result['guard_id'] = staff_id_str
        elif assignment.role_on_train == 'TICKET_CHECKER':
            result['ticket_checker_ids'].append(staff_id_str)

    return result


def _enrich_schedule_with_staff(db: Session, schedule: Schedule) -> dict:
    """Get staff assignment data for a schedule. Returns a dict for API response."""
    staff_data = _get_staff_assignments_dict(db, schedule.id)
    return {
        'driver_id': staff_data['driver_id'],
        'assistant_driver_id': staff_data['assistant_driver_id'],
        'guard_id': staff_data['guard_id'],
        'ticket_checker_ids': staff_data['ticket_checker_ids'],
        'staff_assignments': staff_data['staff_assignments'],
    }

class ScheduleDepartRequest(BaseModel):
    device_id: Optional[str] = None
    staff_id: Optional[str] = None

# ==================== BULK CREATE ====================

@router.post("/bulk", response_model=ScheduleBulkResponse, status_code=201)
async def create_schedules_bulk(
        bulk_data: ScheduleBulkCreate,
        db: Session = Depends(get_db)
):
    """Create multiple schedules at once with staff assignments."""
    created_schedules = []
    errors = []
    staff_data_map = {}

    for idx, schedule_data in enumerate(bulk_data.schedules):
        try:
            train = db.query(Train).filter(Train.id == schedule_data.train_id).first()
            if not train:
                errors.append({"index": idx, "error": f"Train with ID {schedule_data.train_id} not found"})
                continue

            schedule_dict = schedule_data.model_dump()
            staff_data = {
                'driver_id': schedule_dict.pop('driver_id', None),
                'assistant_driver_id': schedule_dict.pop('assistant_driver_id', None),
                'guard_id': schedule_dict.pop('guard_id', None),
                'ticket_checker_ids': schedule_dict.pop('ticket_checker_ids', []),
            }
            schedule_dict['route_id'] = train.route_id

            if schedule_dict.get('departure_time') and isinstance(schedule_dict['departure_time'], str):
                h, m = schedule_dict['departure_time'].split(':')
                schedule_dict['departure_time'] = dt_time(int(h), int(m))
            if schedule_dict.get('arrival_time') and isinstance(schedule_dict['arrival_time'], str):
                h, m = schedule_dict['arrival_time'].split(':')
                schedule_dict['arrival_time'] = dt_time(int(h), int(m))

            if schedule_dict.get('is_overnight') and not schedule_dict.get('arrival_date'):
                schedule_dict['arrival_date'] = schedule_dict['departure_date'] + timedelta(days=1)

            schedule_dict = _clean_schedule_dict(schedule_dict)

            if any(staff_data.values()):
                staff_errors = _validate_staff_for_schedule(db, staff_data, schedule_dict['departure_date'])
                if staff_errors:
                    errors.append({
                        "index": idx, "train_id": schedule_data.train_id,
                        "date": str(schedule_dict['departure_date']),
                        "staff_errors": staff_errors, "error": "Staff availability conflict"
                    })
                    continue

            existing = db.query(Schedule).filter(
                Schedule.train_id == schedule_data.train_id,
                Schedule.departure_date == schedule_dict['departure_date'],
                Schedule.departure_time == schedule_dict.get('departure_time')
            ).first()
            if existing:
                errors.append({"index": idx, "error": f"Schedule already exists"})
                continue

            created_schedules.append(schedule_dict)
            staff_data_map[len(created_schedules) - 1] = staff_data

        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if not created_schedules:
        return ScheduleBulkResponse(success=False, created=0, failed=len(bulk_data.schedules), schedules=[], errors=errors)

    try:
        created_objects = []
        for i, schedule_dict in enumerate(created_schedules):
            schedule = Schedule(**schedule_dict)
            db.add(schedule)
            db.flush()
            staff_data = staff_data_map.get(i, {})
            if any(staff_data.values()):
                _create_staff_assignments(db, schedule, staff_data)
            created_objects.append(schedule)

        db.commit()

        enriched_schedules = []
        for schedule in created_objects:
            db.refresh(schedule)
            staff_data = _enrich_schedule_with_staff(db, schedule)
            response_dict = _schedule_to_response_dict(schedule, staff_data)
            enriched_schedules.append(ScheduleResponse(**response_dict))

        return ScheduleBulkResponse(
            success=True, created=len(created_objects), failed=len(errors),
            schedules=enriched_schedules, errors=errors if errors else None
        )
    except Exception as e:
        db.rollback()
        print(f"❌ Bulk create failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")


# ==================== GET ALL ====================

@router.get("/", response_model=ScheduleListResponse)
async def get_schedules(
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100),
        status: Optional[str] = None,
        route_id: Optional[int] = None,
        train_id: Optional[int] = None,
        db: Session = Depends(get_db)
):
    """Get all schedules with optional filters"""
    query = db.query(Schedule).options(joinedload(Schedule.train))

    if status:
        query = query.filter(Schedule.status == status)
    if route_id:
        query = query.filter(Schedule.route_id == route_id)
    if train_id:
        query = query.filter(Schedule.train_id == train_id)

    total = query.count()
    schedules = query.order_by(Schedule.departure_date.desc()).offset(skip).limit(limit).all()

    enriched_schedules = []
    for schedule in schedules:
        staff_data = _enrich_schedule_with_staff(db, schedule)
        response_dict = _schedule_to_response_dict(schedule, staff_data)
        enriched_schedules.append(ScheduleResponse(**response_dict))

    return ScheduleListResponse(schedules=enriched_schedules, total=total)


# ==================== SEARCH ====================

@router.get("/search", response_model=List[ScheduleSearchItem])
async def search_schedules(
        from_station_id: int = Query(..., description="Departure station ID"),
        to_station_id: int = Query(..., description="Arrival station ID"),
        route_ids: str = Query(..., description="Comma-separated route IDs"),
        date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
        date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
        db: Session = Depends(get_db)
):
    """Search for train schedules between two stations."""
    route_id_list = [int(id.strip()) for id in route_ids.split(',') if id.strip()]
    if not route_id_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one route ID is required")

    try:
        start_date = datetime.strptime(date_from, '%Y-%m-%d').date()
        end_date = datetime.strptime(date_to, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD")

    from_station = db.query(Station).filter(Station.id == from_station_id).first()
    to_station = db.query(Station).filter(Station.id == to_station_id).first()
    if not from_station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Departure station not found")
    if not to_station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Arrival station not found")

    valid_route_ids = []
    route_station_info = {}
    for route_id in route_id_list:
        route = db.query(Route).filter(Route.id == route_id).first()
        if not route:
            continue
        from_rs = db.query(RouteStation).filter(
            RouteStation.route_id == route_id,
            (RouteStation.station_id == from_station_id) | (RouteStation.station_name == from_station.name)
        ).first()
        to_rs = db.query(RouteStation).filter(
            RouteStation.route_id == route_id,
            (RouteStation.station_id == to_station_id) | (RouteStation.station_name == to_station.name)
        ).first()
        if from_rs and to_rs and from_rs.order_number < to_rs.order_number:
            valid_route_ids.append(route_id)
            route_station_info[route_id] = {'from_order': from_rs.order_number, 'to_order': to_rs.order_number, 'from_station': from_rs, 'to_station': to_rs}

    if not valid_route_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid routes found")

    schedules = db.query(Schedule).filter(
        Schedule.route_id.in_(valid_route_ids),
        Schedule.departure_date >= start_date,
        Schedule.departure_date <= end_date,
        Schedule.status == 'SCHEDULED'
    ).order_by(Schedule.departure_date, Schedule.departure_time).all()

    route_ids_found = list(set(s.route_id for s in schedules))
    routes = db.query(Route).filter(Route.id.in_(route_ids_found)).all()
    routes_dict = {r.id: r for r in routes}
    train_ids = list(set(s.train_id for s in schedules if s.train_id))
    trains = db.query(Train).filter(Train.id.in_(train_ids)).all() if train_ids else []
    trains_dict = {t.id: t for t in trains}

    result = []
    for schedule in schedules:
        route = routes_dict.get(schedule.route_id)
        train = trains_dict.get(schedule.train_id) if schedule.train_id else None
        station_info = route_station_info.get(schedule.route_id, {})
        estimated_travel_minutes = None
        if station_info:
            from_rs = station_info.get('from_station')
            to_rs = station_info.get('to_station')
            if from_rs and to_rs and from_rs.time_from_origin_minutes is not None and to_rs.time_from_origin_minutes is not None:
                estimated_travel_minutes = to_rs.time_from_origin_minutes - from_rs.time_from_origin_minutes

        departure_datetime = None
        if schedule.departure_date:
            departure_datetime = datetime.combine(schedule.departure_date, schedule.departure_time or dt_time(0, 0))
        arrival_datetime = None
        if schedule.departure_date and schedule.arrival_time:
            if schedule.departure_time and schedule.arrival_time < schedule.departure_time:
                arrival_datetime = datetime.combine(schedule.departure_date + timedelta(days=1), schedule.arrival_time)
            else:
                arrival_datetime = datetime.combine(schedule.departure_date, schedule.arrival_time)

        result.append(ScheduleSearchItem(
            schedule_id=schedule.id, route_id=schedule.route_id,
            route_name=route.name if route else "Unknown Route",
            train_id=schedule.train_id, train_name=train.train_name if train else f"Train {schedule.train_id}",
            departure_station=from_station.name, arrival_station=to_station.name,
            departure_time=departure_datetime.isoformat() if departure_datetime else None,
            arrival_time=arrival_datetime.isoformat() if arrival_datetime else None,
            available_seats=None, status=schedule.status, days_of_week=None,
            departure_station_order=station_info.get('from_order'),
            arrival_station_order=station_info.get('to_order'),
            estimated_travel_time_minutes=estimated_travel_minutes
        ))
    return result


# ==================== GET SINGLE ====================

@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Get a single schedule with staff assignments"""
    schedule = db.query(Schedule).options(joinedload(Schedule.train)).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    staff_data = _enrich_schedule_with_staff(db, schedule)
    response_dict = _schedule_to_response_dict(schedule, staff_data)
    return ScheduleResponse(**response_dict)


# ==================== CREATE ====================

@router.post("/", response_model=ScheduleResponse, status_code=201)
async def create_schedule(schedule_data: ScheduleCreate, db: Session = Depends(get_db)):
    """Create a new schedule with optional staff assignments"""
    try:
        train = db.query(Train).filter(Train.id == schedule_data.train_id).first()
        if not train:
            raise HTTPException(status_code=400, detail="Train not found")

        schedule_dict = schedule_data.model_dump()
        staff_data = {
            'driver_id': schedule_dict.pop('driver_id', None),
            'assistant_driver_id': schedule_dict.pop('assistant_driver_id', None),
            'guard_id': schedule_dict.pop('guard_id', None),
            'ticket_checker_ids': schedule_dict.pop('ticket_checker_ids', []),
        }
        schedule_dict['route_id'] = train.route_id

        if schedule_dict.get('departure_time') and isinstance(schedule_dict['departure_time'], str):
            h, m = schedule_dict['departure_time'].split(':')
            schedule_dict['departure_time'] = dt_time(int(h), int(m))
        if schedule_dict.get('arrival_time') and isinstance(schedule_dict['arrival_time'], str):
            h, m = schedule_dict['arrival_time'].split(':')
            schedule_dict['arrival_time'] = dt_time(int(h), int(m))

        if schedule_dict.get('is_overnight') and not schedule_dict.get('arrival_date'):
            schedule_dict['arrival_date'] = schedule_dict['departure_date'] + timedelta(days=1)

        schedule_dict = _clean_schedule_dict(schedule_dict)

        if any(staff_data.values()):
            staff_errors = _validate_staff_for_schedule(db, staff_data, schedule_dict['departure_date'])
            if staff_errors:
                raise HTTPException(status_code=400, detail={"message": "Staff availability conflict", "errors": staff_errors})

        schedule = Schedule(**schedule_dict)
        db.add(schedule)
        db.flush()

        if any(staff_data.values()):
            _create_staff_assignments(db, schedule, staff_data)

        db.commit()
        db.refresh(schedule)

        staff_data_response = _enrich_schedule_with_staff(db, schedule)
        response_dict = _schedule_to_response_dict(schedule, staff_data_response)
        return ScheduleResponse(**response_dict)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Create schedule failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ==================== UPDATE ====================
# api/schedule.py - In the update_schedule endpoint

@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(schedule_id: int, schedule_data: ScheduleUpdate, db: Session = Depends(get_db)):
    """Update a schedule and its staff assignments"""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # 🆕 Check if schedule is ACTIVE or COMPLETED
    if schedule.status in ["ACTIVE", "COMPLETED"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update schedule with status '{schedule.status}'. Only SCHEDULED, DELAYED, or CANCELLED schedules can be updated."
        )

    # 🆕 Also check if any device is actively tracking this schedule
    active_device = db.query(TrainRiderDevice).filter(
        TrainRiderDevice.schedule_id == schedule_id,
        TrainRiderDevice.status == "ACTIVE"
    ).first()

    if active_device:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update schedule while train is actively running. Device '{active_device.device_id}' is currently tracking this schedule."
        )

    try:
        update_data = schedule_data.model_dump(exclude_unset=True)
        staff_data = {
            'driver_id': update_data.pop('driver_id', None),
            'assistant_driver_id': update_data.pop('assistant_driver_id', None),
            'guard_id': update_data.pop('guard_id', None),
            'ticket_checker_ids': update_data.pop('ticket_checker_ids', None),
        }
        update_data = _clean_schedule_dict(update_data)

        # 🔑 Check if train_id is being changed
        old_train_id = schedule.train_id
        new_train_id = update_data.get('train_id', old_train_id)
        train_changed = old_train_id != new_train_id

        # Parse times if needed
        if 'departure_time' in update_data and update_data['departure_time'] and isinstance(
                update_data['departure_time'], str):
            h, m = update_data['departure_time'].split(':')
            update_data['departure_time'] = dt_time(int(h), int(m))
        if 'arrival_time' in update_data and update_data['arrival_time'] and isinstance(update_data['arrival_time'],
                                                                                        str):
            h, m = update_data['arrival_time'].split(':')
            update_data['arrival_time'] = dt_time(int(h), int(m))

        # Update schedule fields
        for key, value in update_data.items():
            if hasattr(schedule, key):
                setattr(schedule, key, value)

        if schedule.is_overnight and not schedule.arrival_date:
            schedule.arrival_date = schedule.departure_date + timedelta(days=1)

        # Update TrainRiderDevice if train changed
        if train_changed:
            print(f"🔄 Train changed from {old_train_id} to {new_train_id}")

            devices = db.query(TrainRiderDevice).filter(
                TrainRiderDevice.schedule_id == schedule_id
            ).all()

            for device in devices:
                device.train_id = new_train_id
                print(f"✅ Device {device.device_id} updated: train_id={new_train_id}")

            staff_assignments = db.query(TrainStaffAssignment).filter(
                TrainStaffAssignment.schedule_id == schedule_id
            ).all()

            for assignment in staff_assignments:
                assignment.train_id = new_train_id
                print(f"✅ Staff assignment {assignment.id} updated: train_id={new_train_id}")

        # Handle staff updates
        has_staff_updates = any(v is not None for v in staff_data.values())
        if has_staff_updates:
            staff_to_validate = {k: v for k, v in staff_data.items() if v is not None and v != []}
            if staff_to_validate:
                staff_errors = _validate_staff_for_schedule(db, staff_to_validate, schedule.departure_date,
                                                            schedule_id=schedule_id)
                if staff_errors:
                    raise HTTPException(status_code=400,
                                        detail={"message": "Staff availability conflict", "errors": staff_errors})

            db.query(TrainStaffAssignment).filter(TrainStaffAssignment.schedule_id == schedule_id).delete()
            db.flush()
            if staff_to_validate:
                _create_staff_assignments(db, schedule, staff_to_validate)

        db.commit()
        db.refresh(schedule)

        staff_data_response = _enrich_schedule_with_staff(db, schedule)
        response_dict = _schedule_to_response_dict(schedule, staff_data_response)
        return ScheduleResponse(**response_dict)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Update schedule failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{schedule_id}/depart")
async def depart_schedule(
        schedule_id: int,
        request: ScheduleDepartRequest = None,
        db: Session = Depends(get_db)
):
    """Set schedule status to DEPARTED and initialize train stops"""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if schedule.status != "SCHEDULED":
        raise HTTPException(status_code=400, detail=f"Schedule is already {schedule.status}")

    try:
        # Update schedule status
        schedule.status = "ACTIVE"
        schedule.actual_departure_time = datetime.now(timezone.utc)

        # Initialize all train stops for this journey
        route_stations = db.query(RouteStation).filter(
            RouteStation.route_id == schedule.route_id
        ).all()

        train_stops = db.query(TrainStop).filter(
            TrainStop.train_id == schedule.train_id
        ).all()

        # Create train stops if they don't exist
        existing_route_station_ids = {ts.route_station_id for ts in train_stops}

        for route_station in route_stations:
            if route_station.id not in existing_route_station_ids:
                # Calculate expected times based on route station data
                expected_arrival = None
                expected_departure = None

                if schedule.departure_time and route_station.time_from_origin_minutes is not None:
                    base_time = datetime.combine(schedule.departure_date, schedule.departure_time)
                    arrival_time = base_time + timedelta(minutes=route_station.time_from_origin_minutes)
                    expected_arrival = arrival_time.time()

                    stop_duration = route_station.stop_duration_minutes or 2
                    departure_time = arrival_time + timedelta(minutes=stop_duration)
                    expected_departure = departure_time.time()

                train_stop = TrainStop(
                    train_id=schedule.train_id,
                    route_station_id=route_station.id,
                    expected_arrival_time=expected_arrival,
                    expected_departure_time=expected_departure,
                    stop_duration_minutes=route_station.stop_duration_minutes or 2,
                    is_timed_stop=route_station.is_timed_stop,
                    status="SCHEDULED"
                )
                db.add(train_stop)
            else:
                # Reset existing stops to SCHEDULED
                existing_stop = next(
                    ts for ts in train_stops
                    if ts.route_station_id == route_station.id
                )
                existing_stop.status = "SCHEDULED"
                existing_stop.actual_arrival_time = None
                existing_stop.actual_departure_time = None

        db.commit()

        return {
            "message": "Schedule departed successfully",
            "schedule_id": schedule_id,
            "status": "DEPARTED",
            "departure_time": schedule.actual_departure_time.isoformat()
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==================== DELETE ====================

@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a schedule and its staff assignments (cascade)"""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    try:
        db.delete(schedule)
        db.commit()
        return {"message": "Schedule deleted successfully", "success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/bulk")
async def delete_schedules_bulk(
        schedule_ids: List[int] = Query(..., description="List of schedule IDs to delete"),
        db: Session = Depends(get_db)
):
    """Delete multiple schedules at once"""
    try:
        deleted_count = 0
        errors = []
        for schedule_id in schedule_ids:
            schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
            if schedule:
                db.delete(schedule)
                deleted_count += 1
            else:
                errors.append(f"Schedule with ID {schedule_id} not found")
        db.commit()
        return {"success": True, "deleted": deleted_count, "errors": errors if errors else None}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed: {str(e)}")


# ==================== STATION ARRIVAL ====================

@router.get("/{schedule_id}/station-arrival/{station_order}")
async def get_station_arrival(schedule_id: int, station_order: int, db: Session = Depends(get_db)):
    """Get the expected arrival/departure time for a specific station on a schedule."""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    route_station = db.query(RouteStation).filter(
        RouteStation.route_id == schedule.route_id, RouteStation.order_number == station_order
    ).first()
    if not route_station:
        raise HTTPException(status_code=404, detail=f"Station with order {station_order} not found")

    if schedule.departure_date and schedule.departure_time and route_station.time_from_origin_minutes:
        base_datetime = datetime.combine(schedule.departure_date, schedule.departure_time)
        arrival_datetime = base_datetime + timedelta(minutes=route_station.time_from_origin_minutes)
        if route_station.arrival_buffer_minutes:
            arrival_datetime += timedelta(minutes=route_station.arrival_buffer_minutes)
        departure_datetime = arrival_datetime + timedelta(minutes=route_station.stop_duration_minutes or 2)
        if route_station.departure_buffer_minutes:
            departure_datetime += timedelta(minutes=route_station.departure_buffer_minutes)
        return {
            "schedule_id": schedule_id, "station_name": route_station.station_name,
            "station_order": station_order,
            "expected_arrival": arrival_datetime.isoformat(), "expected_departure": departure_datetime.isoformat(),
            "stop_duration_minutes": route_station.stop_duration_minutes,
            "arrival_buffer_minutes": route_station.arrival_buffer_minutes,
            "departure_buffer_minutes": route_station.departure_buffer_minutes,
            "is_timed_stop": route_station.is_timed_stop
        }
    return {"schedule_id": schedule_id, "station_name": route_station.station_name, "station_order": station_order, "error": "Cannot calculate arrival time"}


# ==================== ROUTE STOPS ====================
@router.get("/{schedule_id}/route-stops")
async def get_schedule_route_stops(schedule_id: int, db: Session = Depends(get_db)):
    """Get all route stops for a schedule with station coordinates"""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    train = db.query(Train).filter(Train.id == schedule.train_id).first()
    if not train or not train.route_id:
        raise HTTPException(status_code=404, detail="Train or route not found")

    route_stations = db.query(RouteStation).filter(
        RouteStation.route_id == train.route_id
    ).order_by(RouteStation.order_number).all()

    train_stops = db.query(TrainStop).filter(
        TrainStop.train_id == train.id
    ).all()
    train_stops_map = {ts.route_station_id: ts for ts in train_stops}

    from ..models.station_arrival_log import StationArrivalLog

    # ✅ IMPORTANT: Filter arrival logs by CURRENT schedule_id ONLY
    arrival_logs = db.query(StationArrivalLog).filter(
        StationArrivalLog.schedule_id == schedule_id  # ✅ Current schedule only
    ).all()
    arrival_logs_map = {log.route_station_id: log for log in arrival_logs}
    station_ids = [rs.station_id for rs in route_stations if rs.station_id]
    stations = db.query(Station).filter(Station.id.in_(station_ids)).all() if station_ids else []
    stations_map = {s.id: s for s in stations}

    stops = []
    for rs in route_stations:
        station = stations_map.get(rs.station_id) if rs.station_id else None
        train_stop = train_stops_map.get(rs.id)
        arrival_log = arrival_logs_map.get(rs.id)

        stops.append({
            "id": rs.id,
            "route_station_id": rs.id,
            "train_stop_id": train_stop.id if train_stop else None,  # ✅ Include train_stop_id
            "station_name": rs.station_name,
            "station_code": rs.station_code,
            "order_number": rs.order_number,
            "distance_from_origin": rs.distance_from_origin,
            "latitude": station.latitude if station else None,
            "longitude": station.longitude if station else None,
            "expected_arrival": train_stop.expected_arrival_time.strftime(
                "%H:%M") if train_stop and train_stop.expected_arrival_time else None,
            "expected_departure": train_stop.expected_departure_time.strftime(
                "%H:%M") if train_stop and train_stop.expected_departure_time else None,
            # To include UTC suffix:
            "actual_arrival": arrival_log.arrival_time.isoformat() + "Z" if arrival_log and arrival_log.arrival_time else None,
            "actual_departure": arrival_log.departure_time.isoformat() + "Z" if arrival_log and arrival_log.departure_time else None,
            "status": arrival_log.status if arrival_log else (train_stop.status if train_stop else "SCHEDULED"),
            "delay_minutes": arrival_log.arrival_delay_minutes if arrival_log else 0,
            "stop_duration_minutes": train_stop.stop_duration_minutes if train_stop else None,
        })

    return {
        "schedule_id": schedule_id,
        "train_name": train.train_name,
        "train_no": train.train_no,
        "stops": stops
    }