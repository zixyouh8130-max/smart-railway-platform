# backend/app/api/inspection.py

from datetime import datetime
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional
import asyncio
import os

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
import httpx
import motor.motor_asyncio
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from pydantic import BaseModel, ConfigDict

from ..core.config import settings
from ..core.dependencies import get_current_admin_user


router = APIRouter(
    dependencies=[Depends(get_current_admin_user)]
)

# MongoDB connection using project settings
client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
db = client[settings.MONGODB_DATABASE]

inspections_collection = db.inspections
inspection_events_collection = db.inspection_events


# ============================================================================
# Google Drive video access (OAuth user authorization)
# ============================================================================
#
# Service-account key creation can be blocked by Google Cloud organization
# policy. This backend therefore uses OAuth 2.0 user credentials instead.
#
# One-time setup:
#   1. Enable Google Drive API.
#   2. Create an OAuth 2.0 Client ID -> Desktop app.
#   3. Download the client JSON.
#   4. Run google_drive_authorize.py once while signed in to the Google account
#      that owns/can read Smart_Railway_AI/inspection_results.
#   5. Keep the generated token.json private.
#
# Configure:
#
# GOOGLE_DRIVE_OAUTH_TOKEN_FILE=C:/.../google_drive_token.json
# GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID=<inspection_results folder id>
#
# FastAPI proxies private Drive video bytes to React and forwards HTTP Range
# requests so HTML5 <video> controls can seek through MP4 output.
# ============================================================================

GOOGLE_DRIVE_OAUTH_TOKEN_FILE = (
    getattr(settings, "GOOGLE_DRIVE_OAUTH_TOKEN_FILE", None)
    or os.getenv("GOOGLE_DRIVE_OAUTH_TOKEN_FILE")
)

GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID = (
    getattr(settings, "GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID", None)
    or os.getenv("GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID")
)

GOOGLE_DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

_drive_credentials = None
_drive_credentials_lock = asyncio.Lock()


def _escape_drive_query_value(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


def _extract_run_id_from_inspection(inspection: Dict[str, Any]) -> Optional[str]:
    run_id = (
        inspection.get("run_id")
        or (inspection.get("media") or {}).get("run_id")
    )

    if run_id:
        return str(run_id)

    media = inspection.get("media") or {}

    possible_paths = [
        media.get("root_path"),
        media.get("persistent_dir"),
        media.get("left_video_path"),
        media.get("left_rail_video_path"),
        media.get("left_rail_inspection_path"),
        media.get("right_video_path"),
        media.get("right_rail_video_path"),
        media.get("right_rail_inspection_path"),
    ]

    for value in possible_paths:
        if not value or not isinstance(value, str):
            continue

        path = PurePosixPath(value.replace("\\", "/"))

        if path.suffix:
            path = path.parent

        if path.name:
            return path.name

    return None


def _candidate_video_names(
    inspection: Dict[str, Any],
    rail_side: str,
) -> List[str]:
    media = inspection.get("media") or {}

    if rail_side == "left":
        possible_paths = [
            media.get("left_video_path"),
            media.get("left_rail_video_path"),
            media.get("left_rail_inspection_path"),
            media.get("left_annotated_video_path"),
        ]
        default_name = "left_rail_inspection.mp4"
    else:
        possible_paths = [
            media.get("right_video_path"),
            media.get("right_rail_video_path"),
            media.get("right_rail_inspection_path"),
            media.get("right_annotated_video_path"),
        ]
        default_name = "right_rail_inspection.mp4"

    names: List[str] = []

    for value in possible_paths:
        if value and isinstance(value, str):
            name = PurePosixPath(value.replace("\\", "/")).name
            if name and name not in names:
                names.append(name)

    if default_name not in names:
        names.append(default_name)

    return names


def _save_drive_token(credentials: Credentials) -> None:
    if not GOOGLE_DRIVE_OAUTH_TOKEN_FILE:
        return

    token_path = os.path.abspath(GOOGLE_DRIVE_OAUTH_TOKEN_FILE)
    token_dir = os.path.dirname(token_path)

    if token_dir:
        os.makedirs(token_dir, exist_ok=True)

    with open(token_path, "w", encoding="utf-8") as token_file:
        token_file.write(credentials.to_json())


async def _get_drive_access_token() -> str:
    """
    Load the previously-authorized Google user token and refresh it when needed.

    The API server never launches an OAuth browser window. If token.json is
    missing/invalid, run google_drive_authorize.py manually once.
    """

    global _drive_credentials

    if not GOOGLE_DRIVE_OAUTH_TOKEN_FILE:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Drive OAuth is not configured. "
                "Set GOOGLE_DRIVE_OAUTH_TOKEN_FILE."
            ),
        )

    if not os.path.isfile(GOOGLE_DRIVE_OAUTH_TOKEN_FILE):
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Drive OAuth token file was not found. "
                "Run google_drive_authorize.py once, then restart FastAPI. "
                f"Expected token file: {GOOGLE_DRIVE_OAUTH_TOKEN_FILE}"
            ),
        )

    async with _drive_credentials_lock:
        if _drive_credentials is None:
            try:
                _drive_credentials = Credentials.from_authorized_user_file(
                    GOOGLE_DRIVE_OAUTH_TOKEN_FILE,
                    scopes=[GOOGLE_DRIVE_READ_SCOPE],
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Failed to load Google Drive OAuth token. "
                        f"Re-run google_drive_authorize.py. Error: {exc}"
                    ),
                ) from exc

        if not _drive_credentials.valid:
            if _drive_credentials.expired and _drive_credentials.refresh_token:
                try:
                    await asyncio.to_thread(
                        _drive_credentials.refresh,
                        GoogleAuthRequest(),
                    )
                    await asyncio.to_thread(
                        _save_drive_token,
                        _drive_credentials,
                    )
                except Exception as exc:
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            "Failed to refresh Google Drive OAuth credentials. "
                            "Re-run google_drive_authorize.py if authorization "
                            f"was revoked. Error: {exc}"
                        ),
                    ) from exc
            else:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Google Drive OAuth credentials are no longer usable. "
                        "Run google_drive_authorize.py again."
                    ),
                )

        if not _drive_credentials.token:
            raise HTTPException(
                status_code=503,
                detail="Google Drive OAuth access token is unavailable.",
            )

        return _drive_credentials.token


async def _drive_list_files(
    *,
    parent_id: str,
    name: str,
    mime_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    token = await _get_drive_access_token()

    query_parts = [
        f"'{_escape_drive_query_value(parent_id)}' in parents",
        f"name = '{_escape_drive_query_value(name)}'",
        "trashed = false",
    ]

    if mime_type:
        query_parts.append(
            f"mimeType = '{_escape_drive_query_value(mime_type)}'"
        )

    params = {
        "q": " and ".join(query_parts),
        "fields": "files(id,name,mimeType,size,modifiedTime)",
        "pageSize": 20,
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
    }

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        response = await http_client.get(
            "https://www.googleapis.com/drive/v3/files",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=(
                "Google Drive lookup failed "
                f"({response.status_code}): {response.text[:500]}"
            ),
        )

    return response.json().get("files", [])


async def _resolve_drive_video(
    inspection: Dict[str, Any],
    rail_side: str,
) -> Dict[str, Any]:
    if rail_side not in {"left", "right"}:
        raise HTTPException(
            status_code=400,
            detail="rail_side must be 'left' or 'right'",
        )

    media = inspection.get("media") or {}

    direct_keys = (
        ["left_video_drive_id", "left_rail_video_drive_id"]
        if rail_side == "left"
        else ["right_video_drive_id", "right_rail_video_drive_id"]
    )

    for key in direct_keys:
        file_id = media.get(key) or inspection.get(key)
        if file_id:
            return {
                "id": str(file_id),
                "name": _candidate_video_names(inspection, rail_side)[0],
                "mimeType": "video/mp4",
            }

    if not GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Drive video access is not configured. "
                "Set GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID."
            ),
        )

    run_id = _extract_run_id_from_inspection(inspection)

    if not run_id:
        raise HTTPException(
            status_code=404,
            detail="Could not determine the inspection run folder.",
        )

    run_folders = await _drive_list_files(
        parent_id=GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID,
        name=run_id,
        mime_type="application/vnd.google-apps.folder",
    )

    if not run_folders:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Google Drive run folder '{run_id}' was not found under "
                "the configured inspection_results folder."
            ),
        )

    run_folder_id = run_folders[0]["id"]

    for filename in _candidate_video_names(inspection, rail_side):
        matches = await _drive_list_files(
            parent_id=run_folder_id,
            name=filename,
        )

        if matches:
            return matches[0]

    raise HTTPException(
        status_code=404,
        detail=(
            f"No {rail_side} annotated inspection video was found "
            f"in Google Drive run folder '{run_id}'."
        ),
    )


async def _proxy_drive_video(
    file_id: str,
    request: Request,
    filename: str,
):
    token = await _get_drive_access_token()

    upstream_headers = {
        "Authorization": f"Bearer {token}",
    }

    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    url = (
        "https://www.googleapis.com/drive/v3/files/"
        f"{file_id}?alt=media&supportsAllDrives=true"
    )

    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=30.0,
            read=None,
            write=30.0,
            pool=30.0,
        ),
        follow_redirects=True,
    )

    upstream_request = http_client.build_request(
        "GET",
        url,
        headers=upstream_headers,
    )

    upstream_response = await http_client.send(
        upstream_request,
        stream=True,
    )

    if upstream_response.status_code not in {200, 206}:
        body = await upstream_response.aread()
        await upstream_response.aclose()
        await http_client.aclose()

        raise HTTPException(
            status_code=502,
            detail=(
                "Failed to stream Google Drive video "
                f"({upstream_response.status_code}): "
                f"{body[:500].decode('utf-8', errors='replace')}"
            ),
        )

    async def iter_video():
        try:
            async for chunk in upstream_response.aiter_bytes(
                chunk_size=1024 * 1024
            ):
                yield chunk
        finally:
            await upstream_response.aclose()
            await http_client.aclose()

    response_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "no-store",
    }

    header_map = {
        "content-length": "Content-Length",
        "content-range": "Content-Range",
        "etag": "ETag",
        "last-modified": "Last-Modified",
    }

    for source_name, output_name in header_map.items():
        value = upstream_response.headers.get(source_name)
        if value:
            response_headers[output_name] = value

    return StreamingResponse(
        iter_video(),
        status_code=upstream_response.status_code,
        media_type=(
            upstream_response.headers.get("content-type")
            or "video/mp4"
        ),
        headers=response_headers,
    )


# ============================================================================
# Pydantic response models
# ============================================================================

class GPSData(BaseModel):
    model_config = ConfigDict(extra="allow")

    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_from_start_m: Optional[float] = None


class InspectionEvent(BaseModel):
    """
    Supports the current dual-rail schema while remaining compatible with
    older event documents.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    inspection_id: str

    rail_side: Optional[str] = None
    defect_type: str
    confidence: float = 0.0

    first_frame: Optional[int] = None
    last_frame: Optional[int] = None
    representative_frame: Optional[int] = None

    start_timestamp: Optional[float] = None
    end_timestamp: Optional[float] = None
    representative_timestamp: Optional[float] = None

    detection_count: int = 0
    bounding_box: Optional[Dict[str, Any]] = None

    gps: Optional[GPSData] = None
    media: Optional[Dict[str, Any]] = None

    # Current targeted Qwen visual check
    supplementary_visual_review: Optional[Dict[str, Any]] = None
    supplementary_visual_reviewed_at: Optional[datetime] = None

    created_at: Optional[datetime] = None


class InspectionSummary(BaseModel):
    """
    Lightweight inspection representation used by:
      GET /inspections
      GET /inspections/search
      GET /statistics/overview (latest inspection)

    Old single-video fields are optional so schema-v1/v2 documents can still
    be returned without causing Pydantic validation errors.
    """

    model_config = ConfigDict(extra="allow")

    id: str

    schema_version: int = 1
    status: Optional[str] = None
    run_id: Optional[str] = None

    gpx_name: Optional[str] = None
    video_name: Optional[str] = None

    created_at: Optional[datetime] = None

    route: Optional[Dict[str, Any]] = None
    media: Optional[Dict[str, Any]] = None

    inspection_events: int = 0
    defect_count: int = 0

    # AI maintenance advisory
    ai_advisory_status: Optional[str] = None
    ai_advisory_version: Optional[str] = None
    ai_model: Optional[str] = None
    ai_advisory_generated_at: Optional[datetime] = None
    ai_overall_priority: Optional[str] = None

    # Included so the current React dashboard can show the priority directly.
    # If list payload size becomes large later, these two can be removed from
    # InspectionSummary and kept only in InspectionDetail.
    ai_advisory: Optional[Dict[str, Any]] = None
    ai_spatial_summary: Optional[Dict[str, Any]] = None
    supplementary_visual_summary: Optional[Dict[str, Any]] = None

    # Legacy single-video fields
    duration_seconds: Optional[float] = None
    original_fps: Optional[float] = None
    processed_fps: Optional[float] = None
    total_frames: Optional[int] = None
    processed_frames: Optional[int] = None
    frame_detections: Optional[int] = None


class InspectionDetail(BaseModel):
    model_config = ConfigDict(extra="allow")

    inspection: Dict[str, Any]
    events: List[InspectionEvent]


class DefectStatistics(BaseModel):
    defect_type: str
    count: int
    avg_confidence: float
    total_detections: int


# ============================================================================
# Serialization / normalization helpers
# ============================================================================

def serialize_mongo_value(value: Any) -> Any:
    """
    Recursively convert MongoDB-only values to JSON-safe values.

    ObjectId -> str
    dict/list -> recursively converted
    datetime remains datetime so FastAPI/Pydantic can serialize it normally.
    """

    if isinstance(value, ObjectId):
        return str(value)

    if isinstance(value, dict):
        return {
            key: serialize_mongo_value(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [
            serialize_mongo_value(item)
            for item in value
        ]

    if isinstance(value, tuple):
        return [
            serialize_mongo_value(item)
            for item in value
        ]

    return value


async def get_event_count(inspection_id: str) -> int:
    return await inspection_events_collection.count_documents(
        {"inspection_id": inspection_id}
    )


async def build_inspection_summary(
    doc: Dict[str, Any],
    event_count: Optional[int] = None,
) -> InspectionSummary:
    """
    Normalize both old and schema-v3 inspection documents into one response.
    """

    inspection_id = str(doc["_id"])

    if event_count is None:
        event_count = await get_event_count(inspection_id)

    route = serialize_mongo_value(doc.get("route") or {})
    media = serialize_mongo_value(doc.get("media") or {})

    ai_advisory = serialize_mongo_value(doc.get("ai_advisory") or None)
    ai_spatial_summary = serialize_mongo_value(
        doc.get("ai_spatial_summary") or None
    )
    supplementary_visual_summary = serialize_mongo_value(
        doc.get("supplementary_visual_summary") or None
    )

    ai_overall_priority = None
    if isinstance(ai_advisory, dict):
        ai_overall_priority = ai_advisory.get("overall_priority")

    duration_seconds = (
        doc.get("duration_seconds")
        if doc.get("duration_seconds") is not None
        else route.get("duration_seconds")
    )

    # Some schema-v3 documents may keep the GPX name in media or a nested
    # source object. Keep the fallbacks harmless if those fields do not exist.
    gpx_name = (
        doc.get("gpx_name")
        or media.get("gpx_name")
        or (doc.get("source") or {}).get("gpx_name")
    )

    video_name = (
        doc.get("video_name")
        or media.get("video_name")
        or (doc.get("source") or {}).get("video_name")
    )

    return InspectionSummary(
        id=inspection_id,
        schema_version=doc.get("schema_version", 1),
        status=doc.get("status"),
        run_id=doc.get("run_id"),
        gpx_name=gpx_name,
        video_name=video_name,
        created_at=doc.get("created_at"),
        route=route or None,
        media=media or None,
        inspection_events=event_count,
        defect_count=event_count,
        ai_advisory_status=(
            doc.get("ai_advisory_status")
            or doc.get("ai_review_status")
        ),
        ai_advisory_version=doc.get("ai_advisory_version"),
        ai_model=doc.get("ai_model"),
        ai_advisory_generated_at=(
            doc.get("ai_advisory_generated_at")
            or doc.get("ai_reviewed_at")
        ),
        ai_overall_priority=ai_overall_priority,
        ai_advisory=ai_advisory,
        ai_spatial_summary=ai_spatial_summary,
        supplementary_visual_summary=supplementary_visual_summary,
        duration_seconds=duration_seconds,
        original_fps=doc.get("original_fps"),
        processed_fps=doc.get("processed_fps"),
        total_frames=doc.get("total_frames"),
        processed_frames=doc.get("processed_frames"),
        frame_detections=doc.get("frame_detections"),
    )


def normalize_event_document(doc: Dict[str, Any]) -> InspectionEvent:
    normalized = serialize_mongo_value(dict(doc))

    normalized["id"] = str(normalized.pop("_id"))

    # Current schema should already contain inspection_id as a string.
    normalized["inspection_id"] = str(normalized.get("inspection_id", ""))

    # Keep response validation resilient for older records.
    normalized["confidence"] = float(normalized.get("confidence") or 0.0)
    normalized["detection_count"] = int(
        normalized.get("detection_count") or 0
    )

    return InspectionEvent(**normalized)


# ============================================================================
# Routes
# ============================================================================

@router.get(
    "/inspections",
    response_model=List[InspectionSummary],
)
async def get_inspections(
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    """Get inspections with pagination using the current schema."""

    cursor = (
        inspections_collection
        .find({})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )

    inspections: List[InspectionSummary] = []

    async for doc in cursor:
        inspections.append(
            await build_inspection_summary(doc)
        )

    return inspections


# IMPORTANT:
# Keep this static "/inspections/search" route ABOVE
# "/inspections/{inspection_id}" so "search" is not interpreted as an ID.
@router.get(
    "/inspections/search",
    response_model=List[InspectionSummary],
)
async def search_inspections(
    query: str = Query(..., min_length=1),
):
    """
    Search by:
      - GPX name
      - legacy video name
      - run ID
      - status
      - defect type

    Matching defect types are resolved back to their inspection IDs.
    """

    query = query.strip()

    inspection_filter = {
        "$or": [
            {"gpx_name": {"$regex": query, "$options": "i"}},
            {"video_name": {"$regex": query, "$options": "i"}},
            {"run_id": {"$regex": query, "$options": "i"}},
            {"status": {"$regex": query, "$options": "i"}},
        ]
    }

    matching_docs = await (
        inspections_collection
        .find(inspection_filter)
        .sort("created_at", -1)
        .limit(50)
        .to_list(length=50)
    )

    docs_by_id: Dict[str, Dict[str, Any]] = {
        str(doc["_id"]): doc
        for doc in matching_docs
    }

    defect_matches = await inspection_events_collection.distinct(
        "inspection_id",
        {
            "defect_type": {
                "$regex": query,
                "$options": "i",
            }
        },
    )

    for inspection_id in defect_matches:
        inspection_id = str(inspection_id)

        if inspection_id in docs_by_id:
            continue

        if not ObjectId.is_valid(inspection_id):
            continue

        doc = await inspections_collection.find_one(
            {"_id": ObjectId(inspection_id)}
        )

        if doc:
            docs_by_id[inspection_id] = doc

    # Preserve newest-first ordering after merging both search paths.
    merged_docs = list(docs_by_id.values())
    merged_docs.sort(
        key=lambda doc: doc.get("created_at") or datetime.min,
        reverse=True,
    )

    results: List[InspectionSummary] = []

    for doc in merged_docs[:50]:
        results.append(
            await build_inspection_summary(doc)
        )

    return results


@router.get(
    "/inspections/{inspection_id}",
    response_model=InspectionDetail,
)
async def get_inspection_detail(
    inspection_id: str,
    request: Request,
):
    """
    Get a complete inspection.

    The inspection object includes the full current MongoDB schema, including:
      - route/media
      - ai_advisory
      - ai_spatial_summary
      - supplementary_visual_summary

    Events include:
      - GPS/route distance
      - rail_side
      - representative frame/time
      - media
      - supplementary_visual_review
    """

    if not ObjectId.is_valid(inspection_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid inspection ID",
        )

    inspection = await inspections_collection.find_one(
        {"_id": ObjectId(inspection_id)}
    )

    if not inspection:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    events_cursor = (
        inspection_events_collection
        .find({"inspection_id": inspection_id})
        .sort([
            ("rail_side", 1),
            ("start_timestamp", 1),
        ])
    )

    events: List[InspectionEvent] = []

    async for doc in events_cursor:
        events.append(
            normalize_event_document(doc)
        )

    normalized_inspection = serialize_mongo_value(dict(inspection))
    normalized_inspection["id"] = str(
        normalized_inspection.pop("_id")
    )

    # Add a computed count to make the detail payload convenient for React.
    normalized_inspection["inspection_events"] = len(events)
    normalized_inspection["defect_count"] = len(events)

    normalized_inspection["media_urls"] = {
        "left": str(
            request.url_for(
                "stream_inspection_video",
                inspection_id=inspection_id,
                rail_side="left",
            )
        ),
        "right": str(
            request.url_for(
                "stream_inspection_video",
                inspection_id=inspection_id,
                rail_side="right",
            )
        ),
    }

    ai_advisory = normalized_inspection.get("ai_advisory") or {}
    if isinstance(ai_advisory, dict):
        normalized_inspection["ai_overall_priority"] = (
            ai_advisory.get("overall_priority")
        )

    return InspectionDetail(
        inspection=normalized_inspection,
        events=events,
    )


@router.get(
    "/inspections/{inspection_id}/media/{rail_side}",
    name="stream_inspection_video",
)
async def stream_inspection_video(
    inspection_id: str,
    rail_side: str,
    request: Request,
):
    """
    Stream annotated LEFT/RIGHT MP4 output from private Google Drive storage.
    """

    if not ObjectId.is_valid(inspection_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid inspection ID",
        )

    rail_side = rail_side.strip().lower()

    if rail_side not in {"left", "right"}:
        raise HTTPException(
            status_code=400,
            detail="rail_side must be 'left' or 'right'",
        )

    inspection = await inspections_collection.find_one(
        {"_id": ObjectId(inspection_id)}
    )

    if not inspection:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    drive_file = await _resolve_drive_video(
        inspection,
        rail_side,
    )

    return await _proxy_drive_video(
        file_id=drive_file["id"],
        request=request,
        filename=(
            drive_file.get("name")
            or f"{rail_side}_rail_inspection.mp4"
        ),
    )


@router.get(
    "/inspections/{inspection_id}/events",
    response_model=List[InspectionEvent],
)
async def get_inspection_events(
    inspection_id: str,
    defect_type: Optional[str] = None,
):
    """Get events for one inspection, optionally filtered by defect type."""

    if not ObjectId.is_valid(inspection_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid inspection ID",
        )

    # Make sure the parent inspection actually exists.
    exists = await inspections_collection.find_one(
        {"_id": ObjectId(inspection_id)},
        {"_id": 1},
    )

    if not exists:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    query: Dict[str, Any] = {
        "inspection_id": inspection_id,
    }

    if defect_type:
        query["defect_type"] = defect_type

    cursor = (
        inspection_events_collection
        .find(query)
        .sort([
            ("rail_side", 1),
            ("start_timestamp", 1),
        ])
    )

    events: List[InspectionEvent] = []

    async for doc in cursor:
        events.append(
            normalize_event_document(doc)
        )

    return events


@router.get(
    "/statistics/defects",
    response_model=List[DefectStatistics],
)
async def get_defect_statistics(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
):
    """Aggregate event statistics by defect class."""

    match_stage: Dict[str, Any] = {}

    if start_date or end_date:
        match_stage["created_at"] = {}

        if start_date:
            match_stage["created_at"]["$gte"] = start_date

        if end_date:
            match_stage["created_at"]["$lte"] = end_date

    pipeline = [
        {"$match": match_stage},
        {
            "$group": {
                "_id": "$defect_type",
                "count": {"$sum": 1},
                "avg_confidence": {"$avg": "$confidence"},
                "total_detections": {
                    "$sum": {"$ifNull": ["$detection_count", 0]}
                },
            }
        },
        {"$sort": {"count": -1}},
    ]

    results: List[DefectStatistics] = []

    async for doc in inspection_events_collection.aggregate(pipeline):
        avg_confidence = float(doc.get("avg_confidence") or 0.0)

        results.append(
            DefectStatistics(
                defect_type=doc.get("_id") or "Unknown",
                count=int(doc.get("count") or 0),
                avg_confidence=round(avg_confidence, 4),
                total_detections=int(
                    doc.get("total_detections") or 0
                ),
            )
        )

    return results


@router.get("/statistics/overview")
async def get_overview_statistics():
    """Get overall dashboard statistics."""

    total_inspections = await inspections_collection.count_documents({})
    total_events = await inspection_events_collection.count_documents({})

    latest = await inspections_collection.find_one(
        {},
        sort=[("created_at", -1)],
    )

    pipeline = [
        {
            "$group": {
                "_id": "$defect_type",
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"count": -1}},
    ]

    defect_distribution: Dict[str, int] = {}

    async for doc in inspection_events_collection.aggregate(pipeline):
        defect_distribution[
            doc.get("_id") or "Unknown"
        ] = int(doc.get("count") or 0)

    latest_summary = None

    if latest:
        latest_event_count = await get_event_count(
            str(latest["_id"])
        )

        latest_summary = (
            await build_inspection_summary(
                latest,
                event_count=latest_event_count,
            )
        ).model_dump()

    return {
        "total_inspections": total_inspections,
        "total_defects": total_events,
        "total_events": total_events,
        "latest_inspection": latest_summary,
        "defect_distribution": defect_distribution,
    }


@router.get("/health")
async def inspection_health_check():
    """Check MongoDB connection health."""

    try:
        await client.admin.command("ping")

        return {
            "status": "healthy",
            "mongodb_connected": True,
            "database": settings.MONGODB_DATABASE,
        }

    except Exception as exc:
        return {
            "status": "unhealthy",
            "mongodb_connected": False,
            "error": str(exc),
        }