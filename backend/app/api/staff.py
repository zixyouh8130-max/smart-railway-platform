# api/staff.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, date, time, timedelta
from pydantic import BaseModel
from ..core.database import get_db
from ..core.railway_time import railway_now, railway_today
from ..models import RouteStation, TrainStop, StationArrivalLog, Station
from ..models.train_rider_device import TrainRiderDevice
from ..models.staff import Staff, StaffRole, StaffStatus
from ..models.train_staff_assignment import TrainStaffAssignment, AssignmentStatus
from ..models.train import Train
from ..models.schedule import Schedule
from ..schemas.staff import (
    StaffCreate, StaffResponse, StaffUpdate,
    StaffAssignmentCreate, StaffAssignmentResponse,
    StaffAttendanceCreate, StaffAttendanceResponse
)
from ..services.staff_assignment_service import StaffAssignmentService
from ..core.dependencies import (
    get_current_admin_user,
    get_current_staff_user,
)
from ..schemas.staff import UpdateStatusRequest

router = APIRouter(tags=["Staff Management"])


class StartJourneyRequest(BaseModel):
    device_id: Optional[str] = None


# ==================== STAFF CRUD ====================

@router.post("/", response_model=StaffResponse, status_code=201, dependencies=[Depends(get_current_admin_user)])
async def create_staff(
        staff_data: StaffCreate,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Create a new staff member"""
    # Check if user already has a staff profile
    existing_staff = db.query(Staff).filter(
        Staff.user_id == staff_data.user_id
    ).first()
    if existing_staff:
        raise HTTPException(
            status_code=400,
            detail="ဤအသုံးပြုသူတွင် ဝန်ထမ်းပရိုဖိုင် ရှိပြီးသားဖြစ်သည်"
        )

    # Check if staff_id is already taken
    existing_staff_id = db.query(Staff).filter(
        Staff.staff_id == staff_data.staff_id
    ).first()
    if existing_staff_id:
        raise HTTPException(
            status_code=400,
            detail="ဤဝန်ထမ်း ID ကို အသုံးပြုပြီးဖြစ်သည်"
        )

    # Create staff
    staff = Staff(
        user_id=staff_data.user_id,
        staff_id=staff_data.staff_id,
        role=staff_data.role,
        phone=staff_data.phone,
        emergency_contact=staff_data.emergency_contact,
        department=staff_data.department,
        license_number=staff_data.license_number,
        license_expiry_date=staff_data.license_expiry_date,
        certification_details=staff_data.certification_details,
        status=StaffStatus.ACTIVE,
        is_available=True,
        joining_date=datetime.now(timezone.utc)
    )

    db.add(staff)
    db.commit()
    db.refresh(staff)

    return staff


@router.get("/", response_model=List[StaffResponse], dependencies=[Depends(get_current_admin_user)])
async def get_all_staff(
        role: Optional[StaffRole] = None,
        status: Optional[StaffStatus] = None,
        is_available: Optional[bool] = None,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Get all staff members with optional filters"""
    query = db.query(Staff)

    if role:
        query = query.filter(Staff.role == role)
    if status:
        query = query.filter(Staff.status == status)
    if is_available is not None:
        query = query.filter(Staff.is_available == is_available)

    return query.all()


@router.get("/{staff_id}", response_model=StaffResponse, dependencies=[Depends(get_current_admin_user)])
async def get_staff_by_id(
        staff_id: UUID,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Get a specific staff member by ID"""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="ဝန်ထမ်း မတွေ့ရှိပါ")
    return staff


@router.put("/{staff_id}", response_model=StaffResponse, dependencies=[Depends(get_current_admin_user)])
async def update_staff(
        staff_id: UUID,
        staff_update: StaffUpdate,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Update a staff member"""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="ဝန်ထမ်း မတွေ့ရှိပါ")

    update_data = staff_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(staff, key, value)

    db.commit()
    db.refresh(staff)
    return staff


@router.delete("/{staff_id}", dependencies=[Depends(get_current_admin_user)])
async def delete_staff(
        staff_id: UUID,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Delete a staff member"""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="ဝန်ထမ်း မတွေ့ရှိပါ")

    db.delete(staff)
    db.commit()
    return {"message": "ဝန်ထမ်းအား ဖျက်သိမ်းပြီးပါပြီ"}


# ==================== AVAILABLE STAFF FOR TRAIN ====================

@router.get("/available-for-train/{train_id}", dependencies=[Depends(get_current_admin_user)])
async def get_available_staff_for_train(
        train_id: int,
        schedule_id: Optional[int] = None,
        assignment_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
        departure_time: Optional[str] = Query(None, description="Departure time in HH:MM format"),
        arrival_time: Optional[str] = Query(None, description="Arrival time in HH:MM format"),
        is_overnight: Optional[bool] = Query(False, description="Whether the schedule is overnight"),
        role: Optional[StaffRole] = None,
        db: Session = Depends(get_db),
):
    """
    Get staff available for a train on a specific date and time.
    Uses time-based conflict detection to allow staff to be assigned to
    multiple schedules as long as they don't overlap in time.
    """
    # Parse the assignment date
    if assignment_date:
        try:
            target_date = date.fromisoformat(assignment_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = railway_today()

    # Verify train exists
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    # Parse times if provided
    parsed_departure_time = None
    parsed_arrival_time = None

    if departure_time:
        try:
            h, m = departure_time.split(':')
            parsed_departure_time = time(int(h), int(m))
        except (ValueError, AttributeError):
            pass

    if arrival_time:
        try:
            h, m = arrival_time.split(':')
            parsed_arrival_time = time(int(h), int(m))
        except (ValueError, AttributeError):
            pass

    service = StaffAssignmentService(db)
    available_staff = service.get_available_staff_for_train(
        train_id=train_id,
        assignment_date=target_date,
        schedule_id=schedule_id,
        role=role,
        departure_time=parsed_departure_time,
        arrival_time=parsed_arrival_time,
        is_overnight=is_overnight or False
    )

    return available_staff

# ==================== STAFF ASSIGNMENTS ====================

@router.post("/assignments", response_model=StaffAssignmentResponse, status_code=201, dependencies=[Depends(get_current_admin_user)])
async def create_staff_assignment(
        assignment: StaffAssignmentCreate,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Assign a staff member to a train"""
    staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    train = db.query(Train).filter(Train.id == assignment.train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    schedule = None
    if assignment.schedule_id:
        schedule = db.query(Schedule).filter(Schedule.id == assignment.schedule_id).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        if schedule.train_id != assignment.train_id:
            raise HTTPException(status_code=400, detail="Assignment train does not match schedule train")

    service = StaffAssignmentService(db)
    is_available, reason = service.is_staff_available(
        staff_id=assignment.staff_id,
        assignment_date=(schedule.departure_date if schedule else assignment.assignment_date),
        schedule_id=assignment.schedule_id,
        departure_time=(schedule.departure_time if schedule else assignment.start_time.time()),
        arrival_time=(schedule.arrival_time if schedule else (assignment.end_time.time() if assignment.end_time else None)),
        is_overnight=(schedule.is_overnight if schedule else False),
    )
    if not is_available:
        raise HTTPException(status_code=400, detail=reason)

    payload = assignment.model_dump()
    payload["assignment_date"] = datetime.combine(
        schedule.departure_date if schedule else assignment.assignment_date,
        time.min,
    )
    if schedule:
        payload["start_time"] = datetime.combine(
            schedule.departure_date,
            schedule.departure_time or time.min,
        )

    db_assignment = TrainStaffAssignment(**payload)
    db.add(db_assignment)

    # A future SCHEDULED assignment does not mean the staff is ON_DUTY now.
    # Staff status is changed when the journey actually starts.

    db.commit()
    db.refresh(db_assignment)

    return db_assignment


@router.get("/assignments/train/{train_id}", dependencies=[Depends(get_current_admin_user)])
async def get_train_staff_assignments(
        train_id: int,
        schedule_id: Optional[int] = None,
        assignment_date: Optional[date] = None,
        db: Session = Depends(get_db)
):
    """Get all staff assignments for a specific train"""
    query = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.train_id == train_id
    )

    if schedule_id:
        query = query.filter(TrainStaffAssignment.schedule_id == schedule_id)
    if assignment_date:
        query = query.filter(func.date(TrainStaffAssignment.assignment_date) == assignment_date)

    return query.all()


@router.get("/assignments/current/{staff_id}")
async def get_current_assignment(
        staff_id: str,
        db: Session = Depends(get_db),
        current_user: dict = Depends(get_current_staff_user),
):
    """Get current assignment for the logged-in staff member."""
    token_staff_id = (current_user.get("staff") or {}).get("staff_id")
    if token_staff_id != staff_id:
        raise HTTPException(status_code=403, detail="Cannot access another staff member's assignment")

    staff = db.query(Staff).filter(Staff.staff_id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Schedule is authoritative for the service date. First return any ACTIVE
    # assignment (including an overnight run that crossed midnight), then look
    # for a planned assignment whose schedule departs today.
    today = railway_today()
    assignment = (
        db.query(TrainStaffAssignment)
        .filter(
            TrainStaffAssignment.staff_id == staff.id,
            TrainStaffAssignment.status == AssignmentStatus.ACTIVE,
        )
        .order_by(TrainStaffAssignment.start_time.desc())
        .first()
    )

    if not assignment:
        assignment = (
            db.query(TrainStaffAssignment)
            .join(Schedule, TrainStaffAssignment.schedule_id == Schedule.id)
            .filter(
                TrainStaffAssignment.staff_id == staff.id,
                TrainStaffAssignment.status == AssignmentStatus.SCHEDULED,
                Schedule.departure_date == today,
                Schedule.status.in_(["SCHEDULED", "DELAYED"]),
            )
            .order_by(Schedule.departure_time.asc())
            .first()
        )

    if not assignment:
        return None

    train = db.query(Train).filter(Train.id == assignment.train_id).first()
    schedule = db.query(Schedule).filter(
        Schedule.id == assignment.schedule_id
    ).first() if assignment.schedule_id else None

    return {
        "assignment_id": str(assignment.id),
        "train_id": assignment.train_id,
        "train_name": train.train_name if train else None,
        "train_no": train.train_no if train else None,
        "role_on_train": assignment.role_on_train,
        "assignment_date": assignment.assignment_date.isoformat(),
        "start_time": assignment.start_time.isoformat() if assignment.start_time else None,
        "end_time": assignment.end_time.isoformat() if assignment.end_time else None,
        "status": assignment.status.value,
        "schedule_id": assignment.schedule_id,
        "departure_time": schedule.departure_time.strftime("%H:%M") if schedule and schedule.departure_time else None,
        "arrival_time": schedule.arrival_time.strftime("%H:%M") if schedule and schedule.arrival_time else None,
    }


@router.put("/assignments/{assignment_id}/status", dependencies=[Depends(get_current_admin_user)])
async def update_assignment_status(
        assignment_id: UUID,
        request: UpdateStatusRequest,
        db: Session = Depends(get_db),
        # current_user = Depends(get_current_admin_user)
):
    """Update assignment status"""
    assignment = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.id == assignment_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Validate status
    try:
        new_status = AssignmentStatus(request.status)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid status: {request.status}")

    assignment.status = new_status

    if new_status == AssignmentStatus.ACTIVE:
        assignment.start_time = railway_now()
        # Update staff status
        staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
        if staff:
            staff.status = StaffStatus.ON_DUTY
            staff.is_available = False


    elif new_status == AssignmentStatus.COMPLETED:
        assignment.end_time = railway_now()
        # Free up staff
        staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
        if staff:
            staff.is_available = True
            staff.status = StaffStatus.ACTIVE

    db.commit()

    return {
        "message": f"Assignment status updated to {request.status}",
        "assignment_id": str(assignment_id),
        "status": request.status
    }

@router.post("/assignments/{assignment_id}/start-journey")
async def start_journey(
        assignment_id: UUID,
        request: StartJourneyRequest,
        db: Session = Depends(get_db),
        current_user: dict = Depends(get_current_staff_user),
):
    """
    Start one dated schedule/run.

    Runtime ownership:
      TrainStop          -> static expected timetable only
      Schedule           -> dated run
      StationArrivalLog  -> actual per-station state for this schedule
      TrainRiderDevice   -> current live pointer

    This function never mutates TrainStop runtime state.
    """

    assignment = (
        db.query(TrainStaffAssignment)
        .filter(
            TrainStaffAssignment.id == assignment_id
        )
        .first()
    )

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found"
        )

    token_staff_id = (current_user.get("staff") or {}).get("staff_id")
    assignment_staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
    if not assignment_staff or assignment_staff.staff_id != token_staff_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot start another staff member's assignment"
        )

    if not assignment.schedule_id:
        raise HTTPException(
            status_code=400,
            detail="Assignment has no schedule"
        )

    schedule = (
        db.query(Schedule)
        .filter(
            Schedule.id == assignment.schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Assigned schedule not found"
        )

    if schedule.train_id != assignment.train_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "Assignment train does not match "
                "the assigned schedule train"
            )
        )

    if assignment.status == AssignmentStatus.ACTIVE:
        raise HTTPException(
            status_code=409,
            detail="This staff assignment has already started"
        )

    if schedule.status in {"COMPLETED", "CANCELLED"}:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot start journey from schedule status {schedule.status}"
        )

    train = (
        db.query(Train)
        .filter(Train.id == schedule.train_id)
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    # Use the frozen route on the schedule, not train.route_id.
    route_stations = (
        db.query(RouteStation)
        .filter(
            RouteStation.route_id == schedule.route_id
        )
        .order_by(RouteStation.order_number)
        .all()
    )

    if not route_stations:
        raise HTTPException(
            status_code=400,
            detail="Schedule route has no stations"
        )

    # TrainStop is a static template. It must already be configured.
    train_stops = (
        db.query(TrainStop)
        .filter(
            TrainStop.train_id == schedule.train_id
        )
        .all()
    )

    train_stops_map = {
        stop.route_station_id: stop
        for stop in train_stops
    }

    route_station_ids = {
        rs.id for rs in route_stations
    }

    missing_station_ids = (
        route_station_ids
        - set(train_stops_map)
    )

    if missing_station_ids:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "Train timetable is incomplete. "
                    "Configure TrainStop rows before "
                    "starting the journey."
                ),
                "missing_route_station_ids": sorted(
                    missing_station_ids
                )
            }
        )

    # One physical train cannot have two simultaneously ACTIVE schedules.
    other_active_schedule = (
        db.query(Schedule)
        .filter(
            Schedule.train_id == schedule.train_id,
            Schedule.status == "ACTIVE",
            Schedule.id != schedule.id,
        )
        .first()
    )
    if other_active_schedule:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Train is already active on schedule #{other_active_schedule.id}"
            )
        )

    # Automatic station detection requires station coordinates. Fail before
    # mutating runtime state so the rider gets a clear configuration error.
    station_ids = [rs.station_id for rs in route_stations if rs.station_id]
    station_map = {
        station.id: station
        for station in (
            db.query(Station).filter(Station.id.in_(station_ids)).all()
            if station_ids else []
        )
    }
    missing_coordinate_stations = [
        {"route_station_id": rs.id, "station_name": rs.station_name}
        for rs in route_stations
        if (
            not rs.station_id
            or rs.station_id not in station_map
            or station_map[rs.station_id].latitude is None
            or station_map[rs.station_id].longitude is None
        )
    ]
    if missing_coordinate_stations:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "Automatic location tracking requires latitude/longitude "
                    "for every station on the route."
                ),
                "stations": missing_coordinate_stations,
            },
        )

    current_time = railway_now()

    staff = (
        db.query(Staff)
        .filter(Staff.id == assignment.staff_id)
        .first()
    )

    device = None
    device_id = request.device_id
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id is required to start tracking")
    if device_id != token_staff_id:
        raise HTTPException(
            status_code=403,
            detail="The tracking device ID must match the logged-in staff ID",
        )

    # One schedule has one authoritative live location reporter. This prevents
    # two crew phones from racing station arrival/departure state.
    active_schedule_device = (
        db.query(TrainRiderDevice)
        .filter(
            TrainRiderDevice.schedule_id == schedule.id,
            TrainRiderDevice.status == "ACTIVE",
        )
        .first()
    )
    if active_schedule_device and active_schedule_device.device_id != device_id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Schedule #{schedule.id} is already being tracked by "
                f"device {active_schedule_device.device_id}"
            ),
        )

    try:
        # ----------------------------------------------------
        # Assignment/staff/schedule state
        # ----------------------------------------------------
        assignment.status = AssignmentStatus.ACTIVE
        assignment.start_time = current_time

        if staff:
            staff.status = StaffStatus.ON_DUTY
            staff.is_available = False

        if schedule.status != "ACTIVE":
            schedule.status = "ACTIVE"
        if schedule.actual_departure_time is None:
            schedule.actual_departure_time = current_time

        # ----------------------------------------------------
        # Reusable device -> bind to THIS schedule and clear
        # previous journey's transient state.
        # ----------------------------------------------------
        if device_id:
            device = (
                db.query(TrainRiderDevice)
                .filter(
                    TrainRiderDevice.device_id == device_id
                )
                .first()
            )

            if device and device.schedule_id and device.schedule_id != schedule.id:
                previous_schedule = (
                    db.query(Schedule)
                    .filter(Schedule.id == device.schedule_id)
                    .first()
                )
                if previous_schedule and previous_schedule.status == "ACTIVE":
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Device {device.device_id} is already assigned "
                            f"to active schedule #{previous_schedule.id}"
                        )
                    )

            if not device:
                device = TrainRiderDevice(
                    device_id=device_id,
                    device_name=(
                        "Staff Device - "
                        f"{staff.staff_id if staff else 'Unknown'}"
                    ),
                    device_type="STAFF_DEVICE",
                )
                db.add(device)
                db.flush()

            # A reused device must not carry the previous schedule's
            # current station/location pointer into the new run.
            device.train_id = schedule.train_id
            device.schedule_id = schedule.id
            device.staff_id = (
                staff.id if staff else None
            )
            device.status = "ACTIVE"

            device.current_route_station_id = None
            device.next_route_station_id = None

            device.current_latitude = None
            device.current_longitude = None
            device.current_speed = None
            device.location_updated_at = None

        first_station_departed = False

        # ----------------------------------------------------
        # If there is a tracking device, create/update only the
        # CURRENT schedule's first-station runtime log.
        # ----------------------------------------------------
        if device:
            first_route_station = route_stations[0]
            first_train_stop = train_stops_map[
                first_route_station.id
            ]

            # Idempotency / contamination guard:
            # schedule_id + route_station_id identifies the run-stop.
            arrival_log = (
                db.query(StationArrivalLog)
                .filter(
                    StationArrivalLog.schedule_id == schedule.id,
                    StationArrivalLog.route_station_id
                    == first_route_station.id
                )
                .first()
            )

            next_station = (
                route_stations[1]
                if len(route_stations) > 1
                else None
            )

            if arrival_log is None:
                arrival_log = StationArrivalLog(
                    device_id=device.id,
                    train_id=schedule.train_id,
                    schedule_id=schedule.id,
                    route_station_id=first_route_station.id,
                    train_stop_id=first_train_stop.id,
                    schedule_date=schedule.departure_date,
                    arrival_time=None,
                    departure_time=current_time,
                    expected_arrival_time=first_train_stop.expected_arrival_time,
                    expected_departure_time=first_train_stop.expected_departure_time,
                    arrival_latitude=None,
                    arrival_longitude=None,
                    status="DEPARTED",
                    stop_duration_seconds=0,
                    stop_duration_minutes=0,
                    next_route_station_id=(next_station.id if next_station else None),
                    next_station_name=(next_station.station_name if next_station else None),
                )
                db.add(arrival_log)
                first_station_departed = True
            else:
                first_station_departed = arrival_log.status == "DEPARTED"

            device.current_route_station_id = None
            device.next_route_station_id = (
                next_station.id
                if next_station
                else None
            )


        db.commit()

        return {
            "message": "Journey started successfully",
            "assignment_id": str(assignment.id),
            "schedule_id": schedule.id,
            "status": "ACTIVE",
            "device_linked": device is not None,
            "first_station_departed": first_station_departed,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start journey: {exc}"
        )


@router.get("/{staff_id}/weekly-schedules")
async def get_staff_weekly_schedules(
        staff_id: str,
        db: Session = Depends(get_db),
        current_user: dict = Depends(get_current_staff_user),
):
    """Get the logged-in staff member's schedules for the current week."""

    token_staff_id = (current_user.get("staff") or {}).get("staff_id")
    if token_staff_id != staff_id:
        raise HTTPException(status_code=403, detail="Cannot access another staff member's schedules")

    # Find staff
    staff = db.query(Staff).filter(Staff.staff_id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Calculate week range (Sunday to Saturday)
    today = railway_today()
    if today.weekday() == 6:  # Sunday
        start_of_week = today
    else:
        start_of_week = today - timedelta(days=today.weekday() + 1)

    end_of_week = start_of_week + timedelta(days=6)

    print(f"📅 Week range: {start_of_week} to {end_of_week}")

    # Get staff assignments for this week
    assignments = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.staff_id == staff.id,
        func.date(TrainStaffAssignment.assignment_date) >= start_of_week,
        func.date(TrainStaffAssignment.assignment_date) <= end_of_week
    ).all()

    # Get schedule IDs from assignments
    schedule_ids = [a.schedule_id for a in assignments if a.schedule_id]

    # Get schedules with train info
    schedules = []
    if schedule_ids:
        schedules = db.query(Schedule).filter(
            Schedule.id.in_(schedule_ids)
        ).order_by(Schedule.departure_date.desc()).all()

    # Build response with proper train info
    schedule_list = []
    for schedule in schedules:
        # ✅ Fetch train with joinedload to ensure it's loaded
        train = db.query(Train).filter(Train.id == schedule.train_id).first()

        print(
            f"🚂 Schedule {schedule.id}: train_id={schedule.train_id}, train={train.train_name if train else 'NOT FOUND'}")

        schedule_list.append({
            "id": schedule.id,
            "train_id": schedule.train_id,
            "train_name": train.train_name if train else "Unknown Train",
            "train_no": train.train_no if train else "",
            "route_id": schedule.route_id,
            "departure_date": schedule.departure_date.isoformat() if schedule.departure_date else None,
            "departure_time": schedule.departure_time.strftime("%H:%M") if schedule.departure_time else None,
            "arrival_time": schedule.arrival_time.strftime("%H:%M") if schedule.arrival_time else None,
            "status": schedule.status,
            "is_overnight": schedule.is_overnight or False,
        })

    return {
        "staff_id": staff_id,
        "week_start": start_of_week.isoformat(),
        "week_end": end_of_week.isoformat(),
        "total": len(schedule_list),
        "schedules": schedule_list
    }

@router.get("/{staff_id}/schedule-history")
async def get_staff_schedule_history(
        staff_id: str,
        limit: int = 10,
        db: Session = Depends(get_db),
        current_user: dict = Depends(get_current_staff_user),
):
    """Get recent schedule history for the logged-in staff member."""

    token_staff_id = (current_user.get("staff") or {}).get("staff_id")
    if token_staff_id != staff_id:
        raise HTTPException(status_code=403, detail="Cannot access another staff member's history")

    staff = db.query(Staff).filter(Staff.staff_id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Get staff assignments
    assignments = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.staff_id == staff.id
    ).order_by(TrainStaffAssignment.assignment_date.desc()).limit(limit).all()

    schedule_ids = [a.schedule_id for a in assignments if a.schedule_id]

    schedules = []
    if schedule_ids:
        schedule_records = db.query(Schedule).filter(
            Schedule.id.in_(schedule_ids)
        ).order_by(Schedule.departure_date.desc()).all()

        for schedule in schedule_records:
            train = db.query(Train).filter(Train.id == schedule.train_id).first()
            schedules.append({
                "id": schedule.id,
                "train_id": schedule.train_id,
                "train_name": train.train_name if train else None,
                "train_no": train.train_no if train else None,
                "departure_date": schedule.departure_date.isoformat(),
                "departure_time": schedule.departure_time.strftime("%H:%M") if schedule.departure_time else None,
                "arrival_time": schedule.arrival_time.strftime("%H:%M") if schedule.arrival_time else None,
                "status": schedule.status,
            })

    return {
        "staff_id": staff_id,
        "total": len(schedules),
        "schedules": schedules
    }
