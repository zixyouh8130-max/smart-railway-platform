from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..core.dependencies import (
    get_current_admin_or_track_engineer,
    get_current_admin_user,
    get_current_track_engineer,
)
from ..models.staff import Staff, StaffRole, StaffStatus
from ..models.track_issue import TrackIssue, TrackIssueActivity
from ..models.user import User
from ..schemas.track_issue import (
    TrackIssueAssignmentRequest,
    TrackIssueCommentRequest,
    TrackIssueDetailResponse,
    TrackIssueLocationCheckRequest,
    TrackIssueLocationCheckResponse,
    TrackIssueResponse,
    TrackIssueStatus,
    TrackIssueStatusRequest,
    TrackIssueSyncResponse,
)
from .inspection import (
    inspection_events_collection,
    inspections_collection,
)


router = APIRouter()

MILES_PER_METER = 1.0 / 1609.344
DEFAULT_ON_SITE_RADIUS_MILES = 0.05
NEARBY_RADIUS_MILES = 0.25
APPROACHING_RADIUS_MILES = 1.0
MAX_RELIABLE_GPS_ACCURACY_METERS = 100.0
MAX_ON_SITE_RADIUS_MILES = 0.10

ENGINEER_TRANSITIONS = {
    "OPEN": {"ACKNOWLEDGED", "BLOCKED"},
    "ACKNOWLEDGED": {"INSPECTING", "BLOCKED"},
    "INSPECTING": {"REPAIRING", "VERIFYING", "BLOCKED"},
    "REPAIRING": {"VERIFYING", "BLOCKED"},
    "VERIFYING": {"RESOLVED", "REPAIRING", "BLOCKED"},
    "BLOCKED": {"ACKNOWLEDGED", "INSPECTING"},
    "REOPENED": {"ACKNOWLEDGED", "INSPECTING", "BLOCKED"},
    "RESOLVED": set(),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_uuid(value: Any) -> Optional[UUID]:
    if value in (None, ""):
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None




def _json_safe_snapshot(value: Any) -> Any:
    """Convert Mongo/Python values into data PostgreSQL JSONB can store."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe_snapshot(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe_snapshot(item) for item in value]
    return value


def _optional_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def _actor_user_id(current_user: dict) -> Optional[UUID]:
    return _as_uuid(current_user.get("sub"))


def _actor_staff_id(current_user: dict) -> Optional[UUID]:
    return _as_uuid((current_user.get("staff") or {}).get("id"))


def _is_admin(current_user: dict) -> bool:
    return current_user.get("actor_type") == "ADMIN" or current_user.get("role") in {
        "ADMIN",
        "SUPER_ADMIN",
    }


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_miles = 3958.7613
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_miles * c


def _proximity_for_distance(distance_miles: float, effective_on_site_radius: float) -> str:
    if distance_miles <= effective_on_site_radius:
        return "ON_SITE"
    if distance_miles <= NEARBY_RADIUS_MILES:
        return "NEARBY"
    if distance_miles <= APPROACHING_RADIUS_MILES:
        return "APPROACHING"
    return "FAR"


def _activity_to_dict(activity: TrackIssueActivity) -> Dict[str, Any]:
    actor_name = None
    actor_role = None
    actor_staff_code = None

    if activity.actor_user:
        actor_name = activity.actor_user.full_name
        actor_role = (
            activity.actor_user.role.value
            if hasattr(activity.actor_user.role, "value")
            else str(activity.actor_user.role)
        )

    if activity.actor_staff:
        actor_staff_code = activity.actor_staff.staff_id
        actor_role = (
            activity.actor_staff.role.value
            if hasattr(activity.actor_staff.role, "value")
            else str(activity.actor_staff.role)
        )
        if activity.actor_staff.user:
            actor_name = activity.actor_staff.user.full_name

    return {
        "id": activity.id,
        "activity_type": activity.activity_type,
        "message_kind": activity.message_kind,
        "message": activity.message,
        "from_status": activity.from_status,
        "to_status": activity.to_status,
        "latitude": activity.latitude,
        "longitude": activity.longitude,
        "distance_to_issue_miles": activity.distance_to_issue_miles,
        "proximity": activity.proximity,
        "extra_data": activity.extra_data,
        "parent_activity_id": activity.parent_activity_id,
        "actor_name": actor_name,
        "actor_role": actor_role,
        "actor_staff_id": actor_staff_code,
        "created_at": activity.created_at,
    }


def _issue_to_dict(
    issue: TrackIssue,
    *,
    include_detail: bool = False,
    distance_to_engineer_miles: Optional[float] = None,
) -> Dict[str, Any]:
    assigned_name = None
    assigned_code = None

    if issue.assigned_staff:
        assigned_code = issue.assigned_staff.staff_id
        if issue.assigned_staff.user:
            assigned_name = issue.assigned_staff.user.full_name

    payload: Dict[str, Any] = {
        "id": issue.id,
        "inspection_id": issue.inspection_id,
        "inspection_event_id": issue.inspection_event_id,
        "run_id": issue.run_id,
        "defect_type": issue.defect_type,
        "confidence": issue.confidence,
        "rail_side": issue.rail_side,
        "latitude": issue.latitude,
        "longitude": issue.longitude,
        "distance_from_start_miles": issue.distance_from_start_miles,
        "ai_priority": issue.ai_priority,
        "status": issue.status,
        "assigned_staff_id": issue.assigned_staff_id,
        "assigned_staff_code": assigned_code,
        "assigned_staff_name": assigned_name,
        "last_location_checked_at": issue.last_location_checked_at,
        "last_location_distance_miles": issue.last_location_distance_miles,
        "last_location_proximity": issue.last_location_proximity,
        "location_verified_at": issue.location_verified_at,
        "resolution_summary": issue.resolution_summary,
        "resolved_at": issue.resolved_at,
        "created_at": issue.created_at,
        "updated_at": issue.updated_at,
        "distance_to_engineer_miles": distance_to_engineer_miles,
    }

    if include_detail:
        payload["ai_snapshot"] = issue.ai_snapshot
        payload["media_snapshot"] = issue.media_snapshot
        payload["activities"] = [
            _activity_to_dict(item)
            for item in issue.activities
        ]

    return payload


def _load_issue(db: Session, issue_id: UUID) -> TrackIssue:
    issue = (
        db.query(TrackIssue)
        .options(
            joinedload(TrackIssue.assigned_staff).joinedload(Staff.user),
            joinedload(TrackIssue.activities).joinedload(TrackIssueActivity.actor_user),
            joinedload(TrackIssue.activities)
            .joinedload(TrackIssueActivity.actor_staff)
            .joinedload(Staff.user),
        )
        .filter(TrackIssue.id == issue_id)
        .first()
    )
    if not issue:
        raise HTTPException(status_code=404, detail="Track issue not found")
    return issue


def _ensure_engineer_can_access(issue: TrackIssue, current_user: dict) -> None:
    if _is_admin(current_user):
        return

    staff_id = _actor_staff_id(current_user)
    if not staff_id:
        raise HTTPException(status_code=403, detail="Track Engineer profile required")

    # Engineers may inspect an unassigned issue so they can verify/claim it.
    # Once assigned, only the assigned engineer can access it.
    if issue.assigned_staff_id not in {None, staff_id}:
        raise HTTPException(status_code=403, detail="This issue is assigned to another engineer")


def _add_activity(
    db: Session,
    issue: TrackIssue,
    current_user: dict,
    *,
    activity_type: str,
    message: Optional[str] = None,
    message_kind: Optional[str] = None,
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    distance_to_issue_miles: Optional[float] = None,
    proximity: Optional[str] = None,
    extra_data: Optional[dict] = None,
    parent_activity_id: Optional[UUID] = None,
) -> TrackIssueActivity:
    # Every workflow activity, including a comment-only activity, should make
    # the parent issue visibly recent in admin/engineer queues.
    issue.updated_at = _utcnow()

    activity = TrackIssueActivity(
        issue_id=issue.id,
        actor_user_id=_actor_user_id(current_user),
        actor_staff_id=_actor_staff_id(current_user),
        activity_type=activity_type,
        message=message,
        message_kind=message_kind,
        from_status=from_status,
        to_status=to_status,
        latitude=latitude,
        longitude=longitude,
        distance_to_issue_miles=distance_to_issue_miles,
        proximity=proximity,
        extra_data=extra_data,
        parent_activity_id=parent_activity_id,
    )
    db.add(activity)
    return activity


def _priority_from_source(inspection: dict, event: dict) -> Optional[str]:
    visual = event.get("supplementary_visual_review") or {}
    advisory = inspection.get("ai_advisory") or {}

    value = (
        visual.get("priority")
        or visual.get("severity")
        or event.get("priority")
        or inspection.get("ai_overall_priority")
        or advisory.get("overall_priority")
    )
    return str(value) if value not in (None, "") else None


def _build_ai_snapshot(inspection: dict, event: dict) -> Dict[str, Any]:
    """Freeze the AI evidence an engineer needs without coupling workflow state to MongoDB."""
    return _json_safe_snapshot(
        {
            "event_visual_review": event.get("supplementary_visual_review"),
            "event_visual_reviewed_at": event.get("supplementary_visual_reviewed_at"),
            "event_bounding_box": event.get("bounding_box"),
            "event_detection_count": event.get("detection_count"),
            "event_first_frame": event.get("first_frame"),
            "event_last_frame": event.get("last_frame"),
            "event_representative_frame": event.get("representative_frame"),
            "event_start_timestamp": event.get("start_timestamp"),
            "event_end_timestamp": event.get("end_timestamp"),
            "event_representative_timestamp": event.get("representative_timestamp"),
            "event_gps": event.get("gps"),
            "inspection_advisory": inspection.get("ai_advisory"),
            "inspection_spatial_summary": inspection.get("ai_spatial_summary"),
            "supplementary_visual_summary": inspection.get("supplementary_visual_summary"),
            "ai_model": inspection.get("ai_model"),
            "ai_overall_priority": inspection.get("ai_overall_priority"),
            "ai_advisory_generated_at": inspection.get("ai_advisory_generated_at"),
            "route": inspection.get("route"),
        }
    )


# ---------------------------------------------------------------------------
# Admin overview / import from AI inspections
# ---------------------------------------------------------------------------

@router.get("/statistics", dependencies=[Depends(get_current_admin_user)])
async def get_track_issue_statistics(db: Session = Depends(get_db)):
    rows = (
        db.query(TrackIssue.status, func.count(TrackIssue.id))
        .group_by(TrackIssue.status)
        .all()
    )
    by_status = {status_name: count for status_name, count in rows}
    return {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "open_work": sum(
            count
            for status_name, count in by_status.items()
            if status_name not in {"RESOLVED"}
        ),
        "resolved": by_status.get("RESOLVED", 0),
    }


@router.post(
    "/sync-inspection/{inspection_id}",
    response_model=TrackIssueSyncResponse,
    dependencies=[Depends(get_current_admin_user)],
)
async def sync_inspection_issues(
    inspection_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_user),
):
    """Create/update maintenance work items from every AI defect event."""
    if not ObjectId.is_valid(inspection_id):
        raise HTTPException(status_code=400, detail="Invalid inspection ID")

    inspection = await inspections_collection.find_one({"_id": ObjectId(inspection_id)})
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    events = await (
        inspection_events_collection
        .find({"inspection_id": inspection_id})
        .sort([("rail_side", 1), ("start_timestamp", 1)])
        .to_list(length=10000)
    )

    created = 0
    updated = 0

    try:
        for event in events:
            event_id = str(event.get("_id"))
            gps = event.get("gps") or {}

            distance_meters = gps.get("distance_from_start_m")
            distance_miles = (
                float(distance_meters) * MILES_PER_METER
                if distance_meters is not None
                else None
            )

            issue = (
                db.query(TrackIssue)
                .filter(
                    TrackIssue.inspection_id == inspection_id,
                    TrackIssue.inspection_event_id == event_id,
                )
                .first()
            )

            is_new = issue is None
            if is_new:
                issue = TrackIssue(
                    inspection_id=inspection_id,
                    inspection_event_id=event_id,
                    created_by_user_id=_actor_user_id(current_user),
                    status="OPEN",
                )
                db.add(issue)
                db.flush()
                created += 1
            else:
                updated += 1

            # Refresh AI/source metadata without overwriting human workflow state.
            run_id = inspection.get("run_id")
            issue.run_id = str(run_id) if run_id not in (None, "") else None
            issue.defect_type = str(event.get("defect_type") or "Unknown defect")
            issue.confidence = _optional_float(event.get("confidence"))
            issue.rail_side = str(event.get("rail_side")) if event.get("rail_side") not in (None, "") else None
            issue.latitude = _optional_float(gps.get("latitude"))
            issue.longitude = _optional_float(gps.get("longitude"))
            issue.distance_from_start_miles = distance_miles
            issue.ai_priority = _priority_from_source(inspection, event)
            issue.ai_snapshot = _build_ai_snapshot(inspection, event)
            issue.media_snapshot = _json_safe_snapshot({
                "event_media": event.get("media") or {},
                "inspection_media": inspection.get("media") or {},
            })

            if is_new:
                _add_activity(
                    db,
                    issue,
                    current_user,
                    activity_type="CREATED_FROM_AI",
                    message="Maintenance issue created from AI inspection finding.",
                    extra_data={
                        "inspection_id": inspection_id,
                        "inspection_event_id": event_id,
                    },
                )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return TrackIssueSyncResponse(
        inspection_id=inspection_id,
        created=created,
        updated=updated,
        total_events=len(events),
    )


@router.get(
    "",
    response_model=List[TrackIssueResponse],
    dependencies=[Depends(get_current_admin_user)],
)
async def list_track_issues(
    issue_status: Optional[TrackIssueStatus] = Query(None, alias="status"),
    assigned_staff_id: Optional[UUID] = None,
    inspection_id: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = (
        db.query(TrackIssue)
        .options(joinedload(TrackIssue.assigned_staff).joinedload(Staff.user))
    )

    if issue_status:
        q = q.filter(TrackIssue.status == issue_status.value)
    if assigned_staff_id:
        q = q.filter(TrackIssue.assigned_staff_id == assigned_staff_id)
    if inspection_id:
        q = q.filter(TrackIssue.inspection_id == inspection_id)
    if query:
        search = f"%{query.strip()}%"
        q = q.filter(
            or_(
                TrackIssue.defect_type.ilike(search),
                TrackIssue.run_id.ilike(search),
                TrackIssue.ai_priority.ilike(search),
            )
        )

    issues = q.order_by(TrackIssue.updated_at.desc()).limit(limit).all()
    return [_issue_to_dict(issue) for issue in issues]


@router.get(
    "/engineers",
    dependencies=[Depends(get_current_admin_user)],
)
async def list_track_engineers(db: Session = Depends(get_db)):
    engineers = (
        db.query(Staff)
        .options(joinedload(Staff.user))
        .filter(
            Staff.role == StaffRole.TRACK_ENGINEER,
            Staff.status != StaffStatus.INACTIVE,
        )
        .order_by(Staff.staff_id)
        .all()
    )

    return [
        {
            "id": str(staff.id),
            "staff_id": staff.staff_id,
            "name": staff.user.full_name if staff.user else staff.staff_id,
            "status": staff.status.value if hasattr(staff.status, "value") else str(staff.status),
            "is_available": staff.is_available,
        }
        for staff in engineers
    ]


# ---------------------------------------------------------------------------
# Track Engineer workspace
# ---------------------------------------------------------------------------

@router.get(
    "/mine",
    response_model=List[TrackIssueResponse],
    dependencies=[Depends(get_current_track_engineer)],
)
async def get_my_track_issues(
    include_resolved: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    staff_id = _actor_staff_id(current_user)
    q = (
        db.query(TrackIssue)
        .options(joinedload(TrackIssue.assigned_staff).joinedload(Staff.user))
        .filter(TrackIssue.assigned_staff_id == staff_id)
    )
    if not include_resolved:
        q = q.filter(TrackIssue.status != "RESOLVED")

    issues = q.order_by(TrackIssue.updated_at.desc()).all()
    return [_issue_to_dict(issue) for issue in issues]


@router.get(
    "/nearby",
    response_model=List[TrackIssueResponse],
    dependencies=[Depends(get_current_track_engineer)],
)
async def get_nearby_track_issues(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_miles: float = Query(5.0, gt=0, le=50),
    include_assigned_to_me: bool = True,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    staff_id = _actor_staff_id(current_user)

    # Cheap SQL bounding-box prefilter before the precise Haversine check.
    # This keeps field lookup fast without introducing a PostGIS dependency.
    lat_delta = radius_miles / 69.0
    cos_latitude = max(abs(math.cos(math.radians(latitude))), 0.01)
    lon_delta = radius_miles / (69.0 * cos_latitude)

    q = (
        db.query(TrackIssue)
        .options(joinedload(TrackIssue.assigned_staff).joinedload(Staff.user))
        .filter(
            TrackIssue.status != "RESOLVED",
            TrackIssue.latitude.isnot(None),
            TrackIssue.longitude.isnot(None),
            TrackIssue.latitude.between(latitude - lat_delta, latitude + lat_delta),
            TrackIssue.longitude.between(longitude - lon_delta, longitude + lon_delta),
        )
    )

    if include_assigned_to_me:
        q = q.filter(
            or_(
                TrackIssue.assigned_staff_id.is_(None),
                TrackIssue.assigned_staff_id == staff_id,
            )
        )
    else:
        q = q.filter(TrackIssue.assigned_staff_id.is_(None))

    matches = []
    for issue in q.all():
        distance = _haversine_miles(
            latitude,
            longitude,
            float(issue.latitude),
            float(issue.longitude),
        )
        if distance <= radius_miles:
            matches.append((distance, issue))

    matches.sort(key=lambda item: item[0])
    return [
        _issue_to_dict(issue, distance_to_engineer_miles=distance)
        for distance, issue in matches[:100]
    ]


@router.post(
    "/{issue_id}/claim",
    response_model=TrackIssueDetailResponse,
    dependencies=[Depends(get_current_track_engineer)],
)
async def claim_track_issue(
    issue_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    staff_id = _actor_staff_id(current_user)

    try:
        issue = (
            db.query(TrackIssue)
            .filter(TrackIssue.id == issue_id)
            .with_for_update()
            .first()
        )
        if not issue:
            raise HTTPException(status_code=404, detail="Track issue not found")
        if issue.status == "RESOLVED":
            raise HTTPException(status_code=409, detail="Resolved issues cannot be claimed")
        if issue.assigned_staff_id and issue.assigned_staff_id != staff_id:
            raise HTTPException(status_code=409, detail="Issue was already claimed by another engineer")

        if issue.assigned_staff_id is None:
            issue.assigned_staff_id = staff_id
            _add_activity(
                db,
                issue,
                current_user,
                activity_type="ASSIGNMENT",
                message="Issue claimed by Track Engineer.",
                extra_data={"action": "CLAIM"},
            )

        db.commit()
        return _issue_to_dict(_load_issue(db, issue_id), include_detail=True)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# ---------------------------------------------------------------------------
# Shared issue detail/actions: Admin + Track Engineer
# ---------------------------------------------------------------------------

@router.get(
    "/{issue_id}",
    response_model=TrackIssueDetailResponse,
)
async def get_track_issue(
    issue_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    issue = _load_issue(db, issue_id)
    _ensure_engineer_can_access(issue, current_user)
    return _issue_to_dict(issue, include_detail=True)


@router.patch(
    "/{issue_id}/assign",
    response_model=TrackIssueDetailResponse,
    dependencies=[Depends(get_current_admin_user)],
)
async def assign_track_issue(
    issue_id: UUID,
    assignment: TrackIssueAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_user),
):
    issue = _load_issue(db, issue_id)

    if issue.status == "RESOLVED" and assignment.staff_id:
        raise HTTPException(
            status_code=409,
            detail="Reopen the resolved issue before assigning an engineer",
        )

    target_staff = None
    if assignment.staff_id:
        target_staff = (
            db.query(Staff)
            .options(joinedload(Staff.user))
            .filter(Staff.id == assignment.staff_id)
            .first()
        )
        if not target_staff:
            raise HTTPException(status_code=404, detail="Track Engineer not found")
        if target_staff.role != StaffRole.TRACK_ENGINEER:
            raise HTTPException(status_code=400, detail="Staff member is not a Track Engineer")
        if target_staff.status == StaffStatus.INACTIVE:
            raise HTTPException(status_code=400, detail="Track Engineer profile is inactive")

    old_staff_id = issue.assigned_staff_id
    issue.assigned_staff_id = target_staff.id if target_staff else None

    _add_activity(
        db,
        issue,
        current_user,
        activity_type="ASSIGNMENT",
        message=(
            assignment.note
            or (
                f"Assigned to {target_staff.staff_id}."
                if target_staff
                else "Engineer assignment removed."
            )
        ),
        extra_data={
            "previous_staff_id": str(old_staff_id) if old_staff_id else None,
            "assigned_staff_id": str(target_staff.id) if target_staff else None,
            "assigned_staff_code": target_staff.staff_id if target_staff else None,
        },
    )

    db.commit()
    return _issue_to_dict(_load_issue(db, issue_id), include_detail=True)


@router.post(
    "/{issue_id}/location-check",
    response_model=TrackIssueLocationCheckResponse,
    dependencies=[Depends(get_current_track_engineer)],
)
async def check_engineer_location(
    issue_id: UUID,
    location: TrackIssueLocationCheckRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    issue = _load_issue(db, issue_id)
    _ensure_engineer_can_access(issue, current_user)

    if issue.latitude is None or issue.longitude is None:
        raise HTTPException(
            status_code=400,
            detail="This AI finding has no GPS coordinates to verify against",
        )

    distance = _haversine_miles(
        location.latitude,
        location.longitude,
        float(issue.latitude),
        float(issue.longitude),
    )

    accuracy_miles = (location.accuracy_meters or 0.0) * MILES_PER_METER
    effective_on_site_radius = min(
        MAX_ON_SITE_RADIUS_MILES,
        max(
            DEFAULT_ON_SITE_RADIUS_MILES,
            accuracy_miles * 1.5,
        ),
    )
    gps_reliable = (
        location.accuracy_meters is None
        or location.accuracy_meters <= MAX_RELIABLE_GPS_ACCURACY_METERS
    )
    proximity = (
        _proximity_for_distance(distance, effective_on_site_radius)
        if gps_reliable
        else "GPS_UNCERTAIN"
    )
    checked_at = _utcnow()

    issue.last_location_checked_at = checked_at
    issue.last_location_distance_miles = distance
    issue.last_location_proximity = proximity
    if proximity == "ON_SITE" and gps_reliable:
        issue.location_verified_at = checked_at

    _add_activity(
        db,
        issue,
        current_user,
        activity_type="LOCATION_CHECK",
        message=(
            "Engineer location verified on site."
            if proximity == "ON_SITE"
            else f"Engineer location check: {proximity.lower()}."
        ),
        latitude=location.latitude,
        longitude=location.longitude,
        distance_to_issue_miles=distance,
        proximity=proximity,
        extra_data={
            "accuracy_meters": location.accuracy_meters,
            "effective_on_site_radius_miles": effective_on_site_radius,
            "gps_reliable": gps_reliable,
        },
    )

    db.commit()

    return TrackIssueLocationCheckResponse(
        issue_id=issue.id,
        distance_miles=round(distance, 4),
        proximity=proximity,
        on_site=proximity == "ON_SITE" and gps_reliable,
        effective_on_site_radius_miles=round(effective_on_site_radius, 4),
        gps_accuracy_meters=location.accuracy_meters,
        gps_reliable=gps_reliable,
        issue_latitude=float(issue.latitude),
        issue_longitude=float(issue.longitude),
        checked_at=checked_at,
    )


@router.patch(
    "/{issue_id}/status",
    response_model=TrackIssueDetailResponse,
)
async def update_track_issue_status(
    issue_id: UUID,
    status_update: TrackIssueStatusRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    issue = _load_issue(db, issue_id)
    _ensure_engineer_can_access(issue, current_user)

    requested = status_update.status.value
    current = issue.status

    if requested == current:
        return _issue_to_dict(issue, include_detail=True)

    admin = _is_admin(current_user)

    if requested == "REOPENED" and current != "RESOLVED":
        raise HTTPException(
            status_code=409,
            detail="Only a resolved issue can be reopened",
        )

    if admin and current == "RESOLVED" and requested != "REOPENED":
        raise HTTPException(
            status_code=409,
            detail="Use REOPENED before moving a resolved issue back into active work",
        )

    if not admin:
        staff_id = _actor_staff_id(current_user)
        if issue.assigned_staff_id != staff_id:
            raise HTTPException(status_code=409, detail="Claim or receive assignment before updating status")
        if requested == "REOPENED":
            raise HTTPException(status_code=403, detail="Only admin can reopen a resolved issue")
        if requested not in ENGINEER_TRANSITIONS.get(current, set()):
            raise HTTPException(
                status_code=409,
                detail=f"Invalid engineer transition: {current} -> {requested}",
            )

    if requested in {"BLOCKED", "REOPENED", "RESOLVED"} and not (status_update.note or "").strip():
        reason_name = {
            "BLOCKED": "block reason",
            "REOPENED": "reopen reason",
            "RESOLVED": "resolution note",
        }[requested]
        raise HTTPException(
            status_code=400,
            detail=f"A {reason_name} is required for {requested}",
        )

    issue.status = requested

    if requested == "RESOLVED":
        issue.resolution_summary = status_update.note.strip()
        issue.resolved_at = _utcnow()
    elif requested == "REOPENED":
        issue.resolved_at = None
        issue.resolution_summary = None

    _add_activity(
        db,
        issue,
        current_user,
        activity_type="STATUS_CHANGE",
        message=status_update.note,
        message_kind="UPDATE" if status_update.note else None,
        from_status=current,
        to_status=requested,
    )

    db.commit()
    return _issue_to_dict(_load_issue(db, issue_id), include_detail=True)


@router.post(
    "/{issue_id}/comments",
    response_model=TrackIssueDetailResponse,
)
async def add_track_issue_comment(
    issue_id: UUID,
    comment: TrackIssueCommentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    issue = _load_issue(db, issue_id)
    _ensure_engineer_can_access(issue, current_user)

    if not _is_admin(current_user) and issue.assigned_staff_id != _actor_staff_id(current_user):
        raise HTTPException(status_code=409, detail="Claim or receive assignment before commenting")

    if comment.parent_activity_id:
        parent_exists = (
            db.query(TrackIssueActivity)
            .filter(
                TrackIssueActivity.id == comment.parent_activity_id,
                TrackIssueActivity.issue_id == issue.id,
            )
            .first()
        )
        if not parent_exists:
            raise HTTPException(status_code=400, detail="Reply target does not belong to this issue")

    _add_activity(
        db,
        issue,
        current_user,
        activity_type="COMMENT",
        message=comment.message.strip(),
        message_kind=comment.message_kind.value,
        parent_activity_id=comment.parent_activity_id,
    )

    db.commit()
    return _issue_to_dict(_load_issue(db, issue_id), include_detail=True)
