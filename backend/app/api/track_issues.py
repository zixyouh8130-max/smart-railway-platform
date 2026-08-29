from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..core.database import get_db
from ..core.dependencies import (
    get_current_admin_or_track_engineer,
    get_current_admin_user,
    get_current_track_engineer,
)
from ..models.staff import Staff, StaffRole, StaffStatus
from ..models.track_issue import TrackInspectionCase, TrackIssue, TrackCaseActivity
from ..schemas.track_issue import (
    TrackCaseAssignmentRequest,
    TrackCaseCommentRequest,
    TrackCaseDetailResponse,
    TrackCaseResponse,
    TrackCaseRenameRequest,
    TrackCaseStatus,
    TrackCaseStatusRequest,
    TrackIssueFieldVerificationRequest,
    TrackIssueLocationCheckRequest,
    TrackIssueLocationCheckResponse,
    TrackIssueMaintenanceRequest,
    TrackIssueResponse,
    TrackIssueSyncResponse,
)
from .inspection import inspection_events_collection, inspections_collection


router = APIRouter()

MILES_PER_METER = 1.0 / 1609.344
DEFAULT_ON_SITE_RADIUS_MILES = 0.05
NEARBY_RADIUS_MILES = 0.25
APPROACHING_RADIUS_MILES = 1.0
MAX_RELIABLE_GPS_ACCURACY_METERS = 100.0
MAX_ON_SITE_RADIUS_MILES = 0.10

CASE_ENGINEER_TRANSITIONS = {
    "OPEN": {"ACKNOWLEDGED", "BLOCKED"},
    "ACKNOWLEDGED": {"IN_PROGRESS", "BLOCKED"},
    "IN_PROGRESS": {"VERIFYING", "BLOCKED"},
    "VERIFYING": {"COMPLETED", "IN_PROGRESS", "BLOCKED"},
    "BLOCKED": {"ACKNOWLEDGED", "IN_PROGRESS"},
    "REOPENED": {"IN_PROGRESS", "BLOCKED"},
    "COMPLETED": set(),
}

MAINTENANCE_TRANSITIONS = {
    "PENDING": {"NO_ACTION_REQUIRED", "REPAIR_REQUIRED", "FOLLOW_UP_REQUIRED"},
    "REPAIR_REQUIRED": {"REPAIR_IN_PROGRESS", "NO_ACTION_REQUIRED", "FOLLOW_UP_REQUIRED"},
    "REPAIR_IN_PROGRESS": {"REPAIR_COMPLETED", "FOLLOW_UP_REQUIRED"},
    "REPAIR_COMPLETED": {"FOLLOW_UP_REQUIRED"},
    "NO_ACTION_REQUIRED": {"FOLLOW_UP_REQUIRED"},
    "FOLLOW_UP_REQUIRED": {"REPAIR_REQUIRED", "REPAIR_IN_PROGRESS", "NO_ACTION_REQUIRED"},
}

FINAL_MAINTENANCE_STATUSES = {"NO_ACTION_REQUIRED", "REPAIR_COMPLETED"}
VALID_FIELD_RESULTS_FOR_COMPLETION = {"CONFIRMED", "PARTIALLY_CONFIRMED", "NOT_CONFIRMED"}


# ---------------------------------------------------------------------------
# Generic helpers
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
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe_snapshot(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe_snapshot(v) for v in value]
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
    return current_user.get("actor_type") == "ADMIN" or current_user.get("role") in {"ADMIN", "SUPER_ADMIN"}


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_miles = 3958.7613
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius_miles * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _proximity_for_distance(distance_miles: float, effective_on_site_radius: float) -> str:
    if distance_miles <= effective_on_site_radius:
        return "ON_SITE"
    if distance_miles <= NEARBY_RADIUS_MILES:
        return "NEARBY"
    if distance_miles <= APPROACHING_RADIUS_MILES:
        return "APPROACHING"
    return "FAR"


def _issue_complete(issue: TrackIssue) -> bool:
    return (
        issue.field_verification_status in VALID_FIELD_RESULTS_FOR_COMPLETION
        and issue.maintenance_status in FINAL_MAINTENANCE_STATUSES
    )


def _case_completion_problems(case: TrackInspectionCase) -> List[str]:
    problems: List[str] = []
    if not case.issues:
        problems.append("The inspection case has no defect checklist items.")
        return problems

    unchecked = [i for i in case.issues if i.field_verification_status == "NOT_CHECKED"]
    unable = [i for i in case.issues if i.field_verification_status == "UNABLE_TO_VERIFY"]
    follow_up = [i for i in case.issues if i.maintenance_status == "FOLLOW_UP_REQUIRED"]
    incomplete = [i for i in case.issues if not _issue_complete(i)]

    if unchecked:
        problems.append(f"{len(unchecked)} finding(s) still need field verification.")
    if unable:
        problems.append(f"{len(unable)} finding(s) could not be verified and require follow-up.")
    if follow_up:
        problems.append(f"{len(follow_up)} finding(s) are marked for follow-up.")
    remaining = [i for i in incomplete if i not in unchecked and i not in unable and i not in follow_up]
    if remaining:
        problems.append(f"{len(remaining)} finding(s) still need a final maintenance outcome.")
    return problems


# ---------------------------------------------------------------------------
# AI mapping helpers
# ---------------------------------------------------------------------------

def _event_distance_m(event: dict) -> Optional[float]:
    gps = event.get("gps") or {}
    return _optional_float(
        gps.get("distance_from_start_m")
        if gps.get("distance_from_start_m") is not None
        else event.get("distance_from_start_m")
    )


def _same_defect_type(left: Any, right: Any) -> bool:
    if left in (None, "") or right in (None, ""):
        return False
    return str(left).strip().casefold() == str(right).strip().casefold()


def _derive_event_ai_context(inspection: dict, event: dict) -> Dict[str, Any]:
    """Map inspection-wide AI advisory back to one concrete checklist finding."""
    visual = event.get("supplementary_visual_review") or {}
    advisory = inspection.get("ai_advisory") or {}
    event_distance_m = _event_distance_m(event)
    event_rail = str(event.get("rail_side") or "").strip().casefold()
    event_defect = event.get("defect_type") or event.get("type") or event.get("class_name")

    if visual.get("priority"):
        return {
            "issue_priority": str(visual.get("priority")),
            "priority_source": "event_visual_review",
            "priority_reason": visual.get("assessment") or visual.get("summary"),
            "recommended_checks": visual.get("recommended_checks") or [],
        }

    for item in advisory.get("individual_high_priority_events") or []:
        item_distance = _optional_float(item.get("route_distance_m"))
        rail_matches = not item.get("rail_side") or str(item.get("rail_side")).strip().casefold() == event_rail
        defect_matches = not item.get("defect_type") or _same_defect_type(item.get("defect_type"), event_defect)
        distance_matches = item_distance is None or event_distance_m is None or abs(item_distance - event_distance_m) <= 0.75
        if rail_matches and defect_matches and distance_matches:
            return {
                "issue_priority": str(item.get("priority") or "priority_inspection"),
                "priority_source": "individual_high_priority_event",
                "priority_reason": item.get("assessment"),
                "recommended_checks": item.get("recommended_checks") or [],
                "matched_high_priority_event": item,
            }

    if event_distance_m is not None:
        for area in advisory.get("areas_of_attention") or []:
            start_m = _optional_float(area.get("start_distance_m"))
            end_m = _optional_float(area.get("end_distance_m"))
            area_rail = str(area.get("rail_side") or "").strip().casefold()
            if start_m is None or end_m is None:
                continue
            if area_rail and event_rail and area_rail != event_rail:
                continue
            if min(start_m, end_m) <= event_distance_m <= max(start_m, end_m):
                return {
                    "issue_priority": str(area.get("priority") or "monitor"),
                    "priority_source": "area_of_attention",
                    "priority_reason": area.get("assessment"),
                    "recommended_checks": area.get("recommended_checks") or [],
                    "matched_area": area,
                }

    if event.get("priority"):
        return {
            "issue_priority": str(event.get("priority")),
            "priority_source": "event",
            "priority_reason": None,
            "recommended_checks": visual.get("recommended_checks") or [],
        }

    if visual.get("severity"):
        return {
            "issue_priority": str(visual.get("severity")),
            "priority_source": "event_visual_severity",
            "priority_reason": visual.get("assessment") or visual.get("summary"),
            "recommended_checks": visual.get("recommended_checks") or [],
        }

    return {
        "issue_priority": "unassessed",
        "priority_source": "no_event_specific_priority",
        "priority_reason": "No event-specific or spatial priority was provided by the AI review.",
        "recommended_checks": [],
    }


def _build_case_ai_snapshot(inspection: dict) -> Dict[str, Any]:
    advisory = inspection.get("ai_advisory") or {}
    return _json_safe_snapshot({
        "executive_summary": advisory.get("executive_summary"),
        "overall_priority": advisory.get("overall_priority") or inspection.get("ai_overall_priority"),
        "key_findings": advisory.get("key_findings") or [],
        "areas_of_attention": advisory.get("areas_of_attention") or [],
        "recommended_actions": advisory.get("recommended_actions") or [],
        "limitations": advisory.get("limitations") or [],
        "trend_assessment": advisory.get("trend_assessment"),
        "defect_type_assessments": advisory.get("defect_type_assessments") or [],
        "possible_contributing_factors": advisory.get("possible_contributing_factors") or [],
        "individual_high_priority_events": advisory.get("individual_high_priority_events") or [],
        "inspection_spatial_summary": inspection.get("ai_spatial_summary"),
        "supplementary_visual_summary": inspection.get("supplementary_visual_summary"),
        "ai_model": inspection.get("ai_model"),
        "ai_advisory_generated_at": inspection.get("ai_advisory_generated_at"),
        "route": inspection.get("route"),
        "raw_advisory": advisory,
    })


def _build_issue_ai_snapshot(inspection: dict, event: dict) -> Dict[str, Any]:
    """Store event-only evidence; inspection-wide advisory lives once on the parent case."""
    context = _derive_event_ai_context(inspection, event)
    return _json_safe_snapshot({
        "event_context": context,
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
    })


# ---------------------------------------------------------------------------
# ORM serialization / loading
# ---------------------------------------------------------------------------

def _activity_to_dict(activity: TrackCaseActivity) -> Dict[str, Any]:
    actor_name = None
    actor_role = None
    actor_staff_code = None
    if activity.actor_user:
        actor_name = activity.actor_user.full_name
        actor_role = getattr(activity.actor_user.role, "value", str(activity.actor_user.role))
    if activity.actor_staff:
        actor_staff_code = activity.actor_staff.staff_id
        actor_role = getattr(activity.actor_staff.role, "value", str(activity.actor_staff.role))
        if activity.actor_staff.user:
            actor_name = activity.actor_staff.user.full_name
    return {
        "id": activity.id,
        "issue_id": activity.issue_id,
        "issue_defect_type": activity.issue.defect_type if activity.issue else None,
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


def _issue_to_dict(issue: TrackIssue) -> Dict[str, Any]:
    return {
        "id": issue.id,
        "case_id": issue.case_id,
        "inspection_event_id": issue.inspection_event_id,
        "defect_type": issue.defect_type,
        "confidence": issue.confidence,
        "rail_side": issue.rail_side,
        "latitude": issue.latitude,
        "longitude": issue.longitude,
        "distance_from_start_miles": issue.distance_from_start_miles,
        "ai_priority": issue.ai_priority,
        "ai_snapshot": issue.ai_snapshot,
        "media_snapshot": issue.media_snapshot,
        "field_verification_status": issue.field_verification_status,
        "field_verification_note": issue.field_verification_note,
        "field_verified_at": issue.field_verified_at,
        "field_verified_by_staff_id": issue.field_verified_by_staff_id,
        "field_verified_by_staff_code": issue.field_verified_by_staff.staff_id if issue.field_verified_by_staff else None,
        "maintenance_status": issue.maintenance_status,
        "maintenance_note": issue.maintenance_note,
        "repair_started_at": issue.repair_started_at,
        "repair_completed_at": issue.repair_completed_at,
        "last_location_checked_at": issue.last_location_checked_at,
        "last_location_distance_miles": issue.last_location_distance_miles,
        "last_location_proximity": issue.last_location_proximity,
        "location_verified_at": issue.location_verified_at,
        "checklist_complete": _issue_complete(issue),
        "created_at": issue.created_at,
        "updated_at": issue.updated_at,
    }


def _case_to_dict(
    case: TrackInspectionCase,
    *,
    include_detail: bool = False,
    distance_to_engineer_miles: Optional[float] = None,
    nearest_issue_id: Optional[UUID] = None,
) -> Dict[str, Any]:
    assigned_code = None
    assigned_name = None
    if case.assigned_staff:
        assigned_code = case.assigned_staff.staff_id
        if case.assigned_staff.user:
            assigned_name = case.assigned_staff.user.full_name

    issues = list(case.issues or [])
    total = len(issues)
    checked = sum(1 for i in issues if i.field_verification_status != "NOT_CHECKED")
    completed = sum(1 for i in issues if _issue_complete(i))
    repair_required = sum(1 for i in issues if i.maintenance_status in {"REPAIR_REQUIRED", "REPAIR_IN_PROGRESS", "REPAIR_COMPLETED"})
    repair_completed = sum(1 for i in issues if i.maintenance_status == "REPAIR_COMPLETED")
    false_positive = sum(1 for i in issues if i.field_verification_status == "NOT_CONFIRMED")
    follow_up = sum(1 for i in issues if i.field_verification_status == "UNABLE_TO_VERIFY" or i.maintenance_status == "FOLLOW_UP_REQUIRED")

    payload: Dict[str, Any] = {
        "id": case.id,
        "inspection_id": case.inspection_id,
        "case_name": case.case_name,
        "run_id": case.run_id,
        "status": case.status,
        "ai_overall_priority": case.ai_overall_priority,
        "assigned_staff_id": case.assigned_staff_id,
        "assigned_staff_code": assigned_code,
        "assigned_staff_name": assigned_name,
        "total_findings": total,
        "checked_findings": checked,
        "completed_findings": completed,
        "repair_required_count": repair_required,
        "repair_completed_count": repair_completed,
        "false_positive_count": false_positive,
        "follow_up_count": follow_up,
        "progress_percent": round((completed / total) * 100, 1) if total else 0.0,
        "acknowledged_at": case.acknowledged_at,
        "started_at": case.started_at,
        "verifying_at": case.verifying_at,
        "completed_at": case.completed_at,
        "blocked_reason": case.blocked_reason,
        "completion_summary": case.completion_summary,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "distance_to_engineer_miles": distance_to_engineer_miles,
        "nearest_issue_id": nearest_issue_id,
    }
    if include_detail:
        payload["ai_snapshot"] = case.ai_snapshot
        payload["media_snapshot"] = case.media_snapshot
        payload["issues"] = [_issue_to_dict(i) for i in issues]
        payload["activities"] = [_activity_to_dict(a) for a in case.activities]
    return payload


def _case_query(db: Session):
    return db.query(TrackInspectionCase).options(
        joinedload(TrackInspectionCase.assigned_staff).joinedload(Staff.user),
        selectinload(TrackInspectionCase.issues).joinedload(TrackIssue.field_verified_by_staff),
        selectinload(TrackInspectionCase.activities).joinedload(TrackCaseActivity.actor_user),
        selectinload(TrackInspectionCase.activities).joinedload(TrackCaseActivity.issue),
        selectinload(TrackInspectionCase.activities).joinedload(TrackCaseActivity.actor_staff).joinedload(Staff.user),
    )


def _load_case(db: Session, case_id: UUID) -> TrackInspectionCase:
    case = _case_query(db).filter(TrackInspectionCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Inspection maintenance case not found")
    return case


def _load_case_issue(case: TrackInspectionCase, issue_id: UUID) -> TrackIssue:
    for issue in case.issues:
        if issue.id == issue_id:
            return issue
    raise HTTPException(status_code=404, detail="Checklist finding not found in this inspection case")


def _ensure_engineer_can_view_case(case: TrackInspectionCase, current_user: dict) -> None:
    if _is_admin(current_user):
        return
    staff_id = _actor_staff_id(current_user)
    if not staff_id:
        raise HTTPException(status_code=403, detail="Track Engineer profile required")
    if case.assigned_staff_id not in {None, staff_id}:
        raise HTTPException(status_code=403, detail="This inspection case is assigned to another engineer")


def _ensure_assigned_engineer(case: TrackInspectionCase, current_user: dict) -> UUID:
    staff_id = _actor_staff_id(current_user)
    if not staff_id:
        raise HTTPException(status_code=403, detail="Track Engineer profile required")
    if case.assigned_staff_id != staff_id:
        raise HTTPException(status_code=403, detail="This inspection case must be assigned to you before field work can be recorded")
    return staff_id


def _touch_case(case: TrackInspectionCase) -> None:
    case.updated_at = _utcnow()


def _add_activity(
    db: Session,
    case: TrackInspectionCase,
    current_user: dict,
    *,
    activity_type: str,
    issue: Optional[TrackIssue] = None,
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
) -> TrackCaseActivity:
    _touch_case(case)
    activity = TrackCaseActivity(
        case_id=case.id,
        issue_id=issue.id if issue else None,
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


# ---------------------------------------------------------------------------
# Admin overview / AI sync
# ---------------------------------------------------------------------------

@router.get("/statistics", dependencies=[Depends(get_current_admin_user)])
async def get_case_statistics(db: Session = Depends(get_db)):
    cases = _case_query(db).all()
    all_issues = [issue for case in cases for issue in case.issues]
    return {
        "total_cases": len(cases),
        "open_cases": sum(1 for c in cases if c.status in {"OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "VERIFYING", "REOPENED"}),
        "blocked_cases": sum(1 for c in cases if c.status == "BLOCKED"),
        "completed_cases": sum(1 for c in cases if c.status == "COMPLETED"),
        "unassigned_cases": sum(1 for c in cases if c.assigned_staff_id is None and c.status != "COMPLETED"),
        "total_findings": len(all_issues),
        "needs_field_check": sum(1 for i in all_issues if i.field_verification_status == "NOT_CHECKED"),
        "confirmed_findings": sum(1 for i in all_issues if i.field_verification_status == "CONFIRMED"),
        "false_positive_findings": sum(1 for i in all_issues if i.field_verification_status == "NOT_CONFIRMED"),
        "follow_up_findings": sum(1 for i in all_issues if i.field_verification_status == "UNABLE_TO_VERIFY" or i.maintenance_status == "FOLLOW_UP_REQUIRED"),
    }


@router.post(
    "/sync-inspection/{inspection_id}",
    response_model=TrackIssueSyncResponse,
    dependencies=[Depends(get_current_admin_user)],
)
async def sync_inspection_case(
    inspection_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_user),
):
    if not ObjectId.is_valid(inspection_id):
        raise HTTPException(status_code=400, detail="Invalid inspection ID")

    inspection = await inspections_collection.find_one({"_id": ObjectId(inspection_id)})
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    events = await (
        inspection_events_collection.find({"inspection_id": inspection_id})
        .sort([("rail_side", 1), ("start_timestamp", 1)])
        .to_list(length=10000)
    )
    if not events:
        raise HTTPException(status_code=400, detail="This inspection has no AI defect events to create a maintenance checklist")

    run_id = inspection.get("run_id")
    run_id_value = str(run_id) if run_id not in (None, "") else None
    advisory = inspection.get("ai_advisory") or {}
    overall_priority = advisory.get("overall_priority") or inspection.get("ai_overall_priority") or "unassessed"

    case = _case_query(db).filter(TrackInspectionCase.inspection_id == inspection_id).first()
    case_created = case is None

    try:
        if case is None:
            case = TrackInspectionCase(
                inspection_id=inspection_id,
                run_id=run_id_value,
                status="OPEN",
                ai_overall_priority=str(overall_priority),
                ai_snapshot=_build_case_ai_snapshot(inspection),
                media_snapshot=_json_safe_snapshot(inspection.get("media") or {}),
                created_by_user_id=_actor_user_id(current_user),
            )
            db.add(case)
            db.flush()
            _add_activity(
                db,
                case,
                current_user,
                activity_type="CASE_CREATED_FROM_AI",
                message=f"Inspection maintenance case created with {len(events)} AI findings.",
                extra_data={"inspection_id": inspection_id, "total_events": len(events)},
            )
        else:
            # AI re-sync refreshes inspection context only; assignment and human progress remain untouched.
            case.run_id = run_id_value
            case.ai_overall_priority = str(overall_priority)
            case.ai_snapshot = _build_case_ai_snapshot(inspection)
            case.media_snapshot = _json_safe_snapshot(inspection.get("media") or {})
            _touch_case(case)

        created = 0
        updated = 0
        for event in events:
            event_id = str(event.get("_id"))
            gps = event.get("gps") or {}
            distance_m = _event_distance_m(event)
            distance_miles = distance_m * MILES_PER_METER if distance_m is not None else None
            defect_type = str(event.get("defect_type") or event.get("type") or event.get("class_name") or "Unknown defect")
            context = _derive_event_ai_context(inspection, event)

            issue = next((i for i in case.issues if i.inspection_event_id == event_id), None)
            source_fields = {
                "defect_type": defect_type,
                "confidence": _optional_float(event.get("confidence") if event.get("confidence") is not None else event.get("score")),
                "rail_side": str(event.get("rail_side")) if event.get("rail_side") not in (None, "") else None,
                "latitude": _optional_float(gps.get("latitude") if gps.get("latitude") is not None else event.get("latitude")),
                "longitude": _optional_float(gps.get("longitude") if gps.get("longitude") is not None else event.get("longitude")),
                "distance_from_start_miles": distance_miles,
                "ai_priority": str(context.get("issue_priority") or "unassessed"),
                "ai_snapshot": _build_issue_ai_snapshot(inspection, event),
                "media_snapshot": _json_safe_snapshot({"event_media": event.get("media") or {}}),
            }

            if issue is None:
                issue = TrackIssue(case_id=case.id, inspection_event_id=event_id, **source_fields)
                db.add(issue)
                db.flush()
                _add_activity(
                    db,
                    case,
                    current_user,
                    issue=issue,
                    activity_type="FINDING_CREATED_FROM_AI",
                    message=f"AI checklist finding created: {defect_type}.",
                    extra_data={"inspection_event_id": event_id, "ai_priority": source_fields["ai_priority"]},
                )
                created += 1
            else:
                for key, value in source_fields.items():
                    setattr(issue, key, value)
                updated += 1

        db.commit()
        case = _load_case(db, case.id)
        return TrackIssueSyncResponse(
            inspection_id=inspection_id,
            case_id=case.id,
            case_created=case_created,
            issues_created=created,
            issues_updated=updated,
            total_events=len(events),
        )
    except Exception:
        db.rollback()
        raise


@router.get("/engineers", dependencies=[Depends(get_current_admin_user)])
async def list_track_engineers(db: Session = Depends(get_db)):
    engineers = (
        db.query(Staff)
        .options(joinedload(Staff.user))
        .filter(Staff.role == StaffRole.TRACK_ENGINEER, Staff.status == StaffStatus.ACTIVE)
        .order_by(Staff.staff_id)
        .all()
    )
    return [
        {
            "id": item.id,
            "staff_id": item.staff_id,
            "name": item.user.full_name if item.user else item.staff_id,
            "is_available": item.is_available,
        }
        for item in engineers
    ]


@router.get("/mine", response_model=List[TrackCaseResponse])
async def get_my_cases(
    include_completed: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    staff_id = _actor_staff_id(current_user)
    query = _case_query(db).filter(TrackInspectionCase.assigned_staff_id == staff_id)
    if not include_completed:
        query = query.filter(TrackInspectionCase.status != "COMPLETED")
    cases = query.order_by(TrackInspectionCase.updated_at.desc()).all()
    return [_case_to_dict(c) for c in cases]


@router.get("/nearby", response_model=List[TrackCaseResponse])
async def get_nearby_cases(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_miles: float = Query(5.0, gt=0, le=50),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    staff_id = _actor_staff_id(current_user)
    candidates = (
        _case_query(db)
        .filter(
            TrackInspectionCase.status != "COMPLETED",
            or_(TrackInspectionCase.assigned_staff_id.is_(None), TrackInspectionCase.assigned_staff_id == staff_id),
        )
        .all()
    )
    results = []
    for case in candidates:
        nearest_distance = None
        nearest_issue_id = None
        for issue in case.issues:
            if issue.latitude is None or issue.longitude is None:
                continue
            distance = _haversine_miles(latitude, longitude, issue.latitude, issue.longitude)
            if nearest_distance is None or distance < nearest_distance:
                nearest_distance = distance
                nearest_issue_id = issue.id
        if nearest_distance is not None and nearest_distance <= radius_miles:
            results.append(_case_to_dict(case, distance_to_engineer_miles=round(nearest_distance, 4), nearest_issue_id=nearest_issue_id))
    results.sort(key=lambda item: item["distance_to_engineer_miles"])
    return results


@router.get("", response_model=List[TrackCaseResponse], dependencies=[Depends(get_current_admin_user)])
async def list_cases(
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_staff_id: Optional[UUID] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = _case_query(db)
    if status_filter:
        query = query.filter(TrackInspectionCase.status == status_filter)
    if assigned_staff_id:
        query = query.filter(TrackInspectionCase.assigned_staff_id == assigned_staff_id)
    if q:
        token = f"%{q.strip()}%"
        query = query.filter(
            or_(
                TrackInspectionCase.case_name.ilike(token),
                TrackInspectionCase.inspection_id.ilike(token),
                TrackInspectionCase.run_id.ilike(token),
            )
        )
    cases = query.order_by(TrackInspectionCase.updated_at.desc()).all()
    return [_case_to_dict(c) for c in cases]


# ---------------------------------------------------------------------------
# Case ownership / detail
# ---------------------------------------------------------------------------

@router.post("/{case_id}/claim", response_model=TrackCaseDetailResponse)
async def claim_case(
    case_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    staff_id = _actor_staff_id(current_user)
    case = db.query(TrackInspectionCase).filter(TrackInspectionCase.id == case_id).with_for_update().first()
    if not case:
        raise HTTPException(status_code=404, detail="Inspection maintenance case not found")
    if case.status == "COMPLETED":
        raise HTTPException(status_code=409, detail="Completed cases must be reopened by an admin before they can be claimed")
    if case.assigned_staff_id not in {None, staff_id}:
        raise HTTPException(status_code=409, detail="Another Track Engineer already claimed this inspection case")
    if case.assigned_staff_id is None:
        case.assigned_staff_id = staff_id
        _add_activity(db, case, current_user, activity_type="CASE_CLAIMED", message="Track Engineer claimed the complete inspection case.")
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


@router.get("/{case_id}", response_model=TrackCaseDetailResponse)
async def get_case(
    case_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    case = _load_case(db, case_id)
    _ensure_engineer_can_view_case(case, current_user)
    return _case_to_dict(case, include_detail=True)



@router.patch(
    "/{case_id}/name",
    response_model=TrackCaseDetailResponse,
    dependencies=[Depends(get_current_admin_user)],
)
async def rename_case(
    case_id: UUID,
    payload: TrackCaseRenameRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_user),
):
    case = _load_case(db, case_id)
    new_name = payload.name.strip()

    if not new_name:
        raise HTTPException(status_code=400, detail="Case name cannot be empty")

    if len(new_name) > 160:
        raise HTTPException(status_code=400, detail="Case name cannot exceed 160 characters")

    previous_name = case.case_name
    if previous_name == new_name:
        return _case_to_dict(case, include_detail=True)

    case.case_name = new_name
    _add_activity(
        db,
        case,
        current_user,
        activity_type="CASE_RENAMED",
        message=f'Case renamed to "{new_name}".',
        extra_data={
            "previous_name": previous_name,
            "new_name": new_name,
        },
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


@router.patch("/{case_id}/assign", response_model=TrackCaseDetailResponse, dependencies=[Depends(get_current_admin_user)])
async def assign_case(
    case_id: UUID,
    payload: TrackCaseAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_user),
):
    case = _load_case(db, case_id)
    if case.status == "COMPLETED" and payload.staff_id is not None:
        raise HTTPException(status_code=409, detail="Reopen the completed case before assigning more field work")

    previous = case.assigned_staff_id
    if payload.staff_id is not None:
        engineer = (
            db.query(Staff)
            .filter(Staff.id == payload.staff_id, Staff.role == StaffRole.TRACK_ENGINEER, Staff.status == StaffStatus.ACTIVE)
            .first()
        )
        if not engineer:
            raise HTTPException(status_code=400, detail="Selected staff member is not an active Track Engineer")
    case.assigned_staff_id = payload.staff_id
    _add_activity(
        db,
        case,
        current_user,
        activity_type="CASE_ASSIGNED" if payload.staff_id else "CASE_UNASSIGNED",
        message=payload.note or ("Inspection case assigned to Track Engineer." if payload.staff_id else "Inspection case unassigned."),
        extra_data={"previous_staff_id": str(previous) if previous else None, "new_staff_id": str(payload.staff_id) if payload.staff_id else None},
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


# ---------------------------------------------------------------------------
# Field checklist operations
# ---------------------------------------------------------------------------

@router.post("/{case_id}/issues/{issue_id}/location-check", response_model=TrackIssueLocationCheckResponse)
async def check_issue_location(
    case_id: UUID,
    issue_id: UUID,
    location: TrackIssueLocationCheckRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    case = _load_case(db, case_id)
    _ensure_assigned_engineer(case, current_user)
    issue = _load_case_issue(case, issue_id)
    if issue.latitude is None or issue.longitude is None:
        raise HTTPException(status_code=400, detail="This AI finding has no GPS coordinates")

    distance = _haversine_miles(location.latitude, location.longitude, issue.latitude, issue.longitude)
    accuracy_miles = (location.accuracy_meters or 0.0) * MILES_PER_METER
    effective_on_site_radius = min(MAX_ON_SITE_RADIUS_MILES, max(DEFAULT_ON_SITE_RADIUS_MILES, accuracy_miles * 1.5))
    gps_reliable = location.accuracy_meters is None or location.accuracy_meters <= MAX_RELIABLE_GPS_ACCURACY_METERS
    proximity = _proximity_for_distance(distance, effective_on_site_radius) if gps_reliable else "GPS_UNCERTAIN"
    checked_at = _utcnow()

    issue.last_location_checked_at = checked_at
    issue.last_location_distance_miles = distance
    issue.last_location_proximity = proximity
    if proximity == "ON_SITE" and gps_reliable:
        issue.location_verified_at = checked_at

    _add_activity(
        db,
        case,
        current_user,
        issue=issue,
        activity_type="LOCATION_CHECK",
        message="Engineer compared current GPS position with this AI finding.",
        latitude=location.latitude,
        longitude=location.longitude,
        distance_to_issue_miles=distance,
        proximity=proximity,
        extra_data={"accuracy_meters": location.accuracy_meters, "gps_reliable": gps_reliable, "effective_on_site_radius_miles": effective_on_site_radius},
    )
    db.commit()
    return TrackIssueLocationCheckResponse(
        case_id=case.id,
        issue_id=issue.id,
        distance_miles=round(distance, 4),
        proximity=proximity,
        on_site=proximity == "ON_SITE" and gps_reliable,
        effective_on_site_radius_miles=round(effective_on_site_radius, 4),
        gps_accuracy_meters=location.accuracy_meters,
        gps_reliable=gps_reliable,
        issue_latitude=issue.latitude,
        issue_longitude=issue.longitude,
        checked_at=checked_at,
    )


@router.patch("/{case_id}/issues/{issue_id}/field-verification", response_model=TrackCaseDetailResponse)
async def verify_issue_in_field(
    case_id: UUID,
    issue_id: UUID,
    payload: TrackIssueFieldVerificationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_track_engineer),
):
    case = _load_case(db, case_id)
    staff_id = _ensure_assigned_engineer(case, current_user)
    if case.status == "COMPLETED":
        raise HTTPException(status_code=409, detail="Completed cases must be reopened before field verification changes")
    if payload.verification_status.value == "NOT_CHECKED":
        raise HTTPException(status_code=400, detail="Choose an actual field-verification result")

    issue = _load_case_issue(case, issue_id)
    old_result = issue.field_verification_status
    issue.field_verification_status = payload.verification_status.value
    issue.field_verification_note = payload.note.strip()
    issue.field_verified_at = _utcnow()
    issue.field_verified_by_staff_id = staff_id

    # Practical defaults: a rejected AI finding needs no repair; an unverifiable
    # finding automatically becomes follow-up work. Confirmed findings still
    # require the engineer to choose the maintenance disposition.
    if issue.field_verification_status == "NOT_CONFIRMED":
        issue.maintenance_status = "NO_ACTION_REQUIRED"
        issue.maintenance_note = "AI finding was not confirmed during field inspection; no repair required."
        issue.repair_started_at = None
        issue.repair_completed_at = None
    elif issue.field_verification_status == "UNABLE_TO_VERIFY":
        issue.maintenance_status = "FOLLOW_UP_REQUIRED"
        issue.maintenance_note = payload.note.strip()
        issue.repair_started_at = None
        issue.repair_completed_at = None
    elif old_result in {"NOT_CONFIRMED", "UNABLE_TO_VERIFY"} and issue.maintenance_status in {"NO_ACTION_REQUIRED", "FOLLOW_UP_REQUIRED"}:
        issue.maintenance_status = "PENDING"
        issue.maintenance_note = None
        issue.repair_started_at = None
        issue.repair_completed_at = None

    if case.status in {"ACKNOWLEDGED", "REOPENED"}:
        case.status = "IN_PROGRESS"
        case.started_at = case.started_at or _utcnow()

    _add_activity(
        db,
        case,
        current_user,
        issue=issue,
        activity_type="FIELD_VERIFICATION",
        message=payload.note.strip(),
        extra_data={"from": old_result, "verification_status": issue.field_verification_status},
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


@router.patch("/{case_id}/issues/{issue_id}/maintenance", response_model=TrackCaseDetailResponse)
async def update_issue_maintenance(
    case_id: UUID,
    issue_id: UUID,
    payload: TrackIssueMaintenanceRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    case = _load_case(db, case_id)
    if not _is_admin(current_user):
        _ensure_assigned_engineer(case, current_user)
    issue = _load_case_issue(case, issue_id)
    if case.status == "COMPLETED":
        raise HTTPException(status_code=409, detail="Reopen the case before changing a completed checklist item")

    target = payload.maintenance_status.value
    current = issue.maintenance_status
    if issue.field_verification_status == "NOT_CHECKED" and not (_is_admin(current_user) and target == "FOLLOW_UP_REQUIRED"):
        raise HTTPException(status_code=409, detail="Field-verify this AI finding before choosing a maintenance outcome")
    if issue.field_verification_status == "NOT_CONFIRMED" and target not in {"NO_ACTION_REQUIRED", "FOLLOW_UP_REQUIRED"}:
        raise HTTPException(status_code=409, detail="A not-confirmed AI finding cannot be marked for repair unless the field verification result is changed")
    if issue.field_verification_status == "UNABLE_TO_VERIFY" and target != "FOLLOW_UP_REQUIRED":
        raise HTTPException(status_code=409, detail="An unverifiable finding must remain follow-up work until it is field-verified")

    allowed = MAINTENANCE_TRANSITIONS.get(current, set())
    if target != current and target not in allowed and not _is_admin(current_user):
        raise HTTPException(status_code=409, detail=f"Maintenance transition {current} → {target} is not allowed")

    if target in {"NO_ACTION_REQUIRED", "REPAIR_COMPLETED", "FOLLOW_UP_REQUIRED"} and not (payload.note or "").strip():
        raise HTTPException(status_code=400, detail="A note is required for this maintenance outcome")

    issue.maintenance_status = target
    if payload.note is not None:
        issue.maintenance_note = payload.note.strip()
    if target == "REPAIR_IN_PROGRESS":
        issue.repair_started_at = issue.repair_started_at or _utcnow()
    if target == "REPAIR_COMPLETED":
        issue.repair_started_at = issue.repair_started_at or _utcnow()
        issue.repair_completed_at = _utcnow()
    elif target in {"REPAIR_REQUIRED", "FOLLOW_UP_REQUIRED"}:
        issue.repair_completed_at = None

    if case.status in {"ACKNOWLEDGED", "REOPENED"}:
        case.status = "IN_PROGRESS"
        case.started_at = case.started_at or _utcnow()

    _add_activity(
        db,
        case,
        current_user,
        issue=issue,
        activity_type="MAINTENANCE_STATUS",
        message=payload.note,
        from_status=current,
        to_status=target,
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


# ---------------------------------------------------------------------------
# Case lifecycle / communication
# ---------------------------------------------------------------------------

@router.patch("/{case_id}/status", response_model=TrackCaseDetailResponse)
async def update_case_status(
    case_id: UUID,
    payload: TrackCaseStatusRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    case = _load_case(db, case_id)
    target = payload.status.value
    current = case.status

    if not _is_admin(current_user):
        _ensure_assigned_engineer(case, current_user)
        if target == "REOPENED":
            raise HTTPException(status_code=403, detail="Only an admin can reopen a completed inspection case")
        if target != current and target not in CASE_ENGINEER_TRANSITIONS.get(current, set()):
            raise HTTPException(status_code=409, detail=f"Case transition {current} → {target} is not allowed")
    else:
        # Admin owns assignment/oversight, but once the Track Engineer has
        # acknowledged the case, lifecycle progress belongs to that engineer.
        # The only post-completion exception is the admin-only REOPEN action.
        if current == "COMPLETED":
            if target != "REOPENED":
                raise HTTPException(
                    status_code=403,
                    detail="A completed case can only be reopened by an admin before more field work is recorded",
                )
        elif case.acknowledged_at is not None:
            if target != current:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "After Track Engineer acknowledgement, case lifecycle status "
                        "is controlled by the assigned Track Engineer. Admin may monitor, "
                        "reassign, comment, rename, and review AI evidence."
                    ),
                )
        else:
            admin_pre_ack_allowed = {"OPEN", "BLOCKED"}
            if target not in admin_pre_ack_allowed:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Before acknowledgement, admin may only leave the case OPEN "
                        "or mark it BLOCKED. The Track Engineer must acknowledge the case."
                    ),
                )

    note = (payload.note or "").strip()
    if target == "BLOCKED" and not note:
        raise HTTPException(status_code=400, detail="Explain why this inspection case is blocked")
    if target == "REOPENED" and not note:
        raise HTTPException(status_code=400, detail="An admin reason is required to reopen the case")

    if target in {"VERIFYING", "COMPLETED"}:
        problems = _case_completion_problems(case)
        if problems:
            raise HTTPException(status_code=409, detail={"message": "The checklist is not ready for final case verification.", "problems": problems})
    if target == "COMPLETED" and not note:
        raise HTTPException(status_code=400, detail="A completion summary is required")

    case.status = target
    now = _utcnow()
    if target == "ACKNOWLEDGED":
        case.acknowledged_at = case.acknowledged_at or now
    elif target == "IN_PROGRESS":
        case.started_at = case.started_at or now
        case.blocked_reason = None
    elif target == "VERIFYING":
        case.verifying_at = now
    elif target == "COMPLETED":
        case.completed_at = now
        case.completion_summary = note
        case.blocked_reason = None
    elif target == "BLOCKED":
        case.blocked_reason = note
    elif target == "REOPENED":
        case.completed_at = None
        case.verifying_at = None
        case.completion_summary = None
        case.blocked_reason = None

    _add_activity(
        db,
        case,
        current_user,
        activity_type="CASE_STATUS",
        message=note or None,
        from_status=current,
        to_status=target,
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


@router.post("/{case_id}/comments", response_model=TrackCaseDetailResponse)
async def add_case_comment(
    case_id: UUID,
    payload: TrackCaseCommentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    case = _load_case(db, case_id)
    _ensure_engineer_can_view_case(case, current_user)
    if not _is_admin(current_user):
        _ensure_assigned_engineer(case, current_user)
    _add_activity(
        db,
        case,
        current_user,
        activity_type="CASE_MESSAGE",
        message_kind=payload.message_kind.value,
        message=payload.message.strip(),
        parent_activity_id=payload.parent_activity_id,
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)


@router.post("/{case_id}/issues/{issue_id}/comments", response_model=TrackCaseDetailResponse)
async def add_issue_comment(
    case_id: UUID,
    issue_id: UUID,
    payload: TrackCaseCommentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_admin_or_track_engineer),
):
    case = _load_case(db, case_id)
    _ensure_engineer_can_view_case(case, current_user)
    if not _is_admin(current_user):
        _ensure_assigned_engineer(case, current_user)
    issue = _load_case_issue(case, issue_id)
    _add_activity(
        db,
        case,
        current_user,
        issue=issue,
        activity_type="FINDING_MESSAGE",
        message_kind=payload.message_kind.value,
        message=payload.message.strip(),
        parent_activity_id=payload.parent_activity_id,
    )
    db.commit()
    return _case_to_dict(_load_case(db, case_id), include_detail=True)
