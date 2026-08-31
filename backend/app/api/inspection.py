# backend/app/api/inspection.py

from datetime import datetime, timezone
import hashlib
import hmac
import time
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional
import asyncio
import json
import mimetypes
import os

from bson import ObjectId
from pymongo import ReturnDocument
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import StreamingResponse
import httpx
import motor.motor_asyncio
from sqlalchemy.orm import Session
import google.auth
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from pydantic import BaseModel, ConfigDict

from ..core.config import settings
from ..core.database import get_db
from ..core.security import decode_access_token
from ..models.user import User, UserRole
from ..services.inspection_ai_review_service import (
    AI_EVENT_AGGREGATION_GAP_M,
    AI_SPECIAL_VISION_CLASSES,
    generate_inspection_ai_review,
    generate_targeted_visual_review,
)


# HTML <video src="..."> requests cannot attach the Axios Authorization
# header.  Inspection metadata stays admin-only, but media URLs returned from
# an authenticated detail request receive a short-lived, path-scoped signature.
#
# The signature is NOT the user's JWT.  It grants read-only access only to one
# inspection video side and expires automatically.
MEDIA_URL_TTL_SECONDS = 60 * 60  # 60 minutes

_optional_bearer = HTTPBearer(auto_error=False)


def _media_signature(
    inspection_id: str,
    rail_side: str,
    expires: int,
) -> str:
    message = (
        f"inspection-media|{inspection_id}|{rail_side.lower()}|{int(expires)}"
    ).encode("utf-8")

    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def _valid_signed_media_request(request: Request) -> bool:
    """
    Return True only for a valid signed inspection-media request.

    A signature is bound to:
      - inspection_id
      - rail side
      - expiration timestamp

    It cannot be reused for another inspection or another rail side.
    """
    inspection_id = request.path_params.get("inspection_id")
    rail_side = request.path_params.get("rail_side")

    # Only the media endpoint has both of these path parameters.
    if not inspection_id or not rail_side:
        return False

    rail_side = str(rail_side).strip().lower()
    if rail_side not in {"left", "right"}:
        return False

    raw_expires = request.query_params.get("expires")
    signature = request.query_params.get("sig")

    if not raw_expires or not signature:
        return False

    try:
        expires = int(raw_expires)
    except (TypeError, ValueError):
        return False

    # Expired links are rejected.
    if expires < int(time.time()):
        return False

    expected = _media_signature(
        str(inspection_id),
        rail_side,
        expires,
    )

    return hmac.compare_digest(
        expected,
        str(signature),
    )


def _require_inspection_admin_or_signed_media(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        _optional_bearer
    ),
    db: Session = Depends(get_db),
) -> dict:
    """
    Keep the inspection API admin-only while allowing the browser's native
    <video> request to use a short-lived signed media URL.

    Normal API calls:
        Authorization: Bearer <admin JWT>

    Native video calls:
        ?expires=<unix timestamp>&sig=<scoped HMAC signature>
    """

    if _valid_signed_media_request(request):
        return {
            "access": "signed_inspection_media",
        }

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(
        credentials.credentials
    )

    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = (
        db.query(User)
        .filter(User.id == payload["sub"])
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    if user.role not in {
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    fresh_payload = dict(payload)
    fresh_payload["role"] = (
        user.role.value
        if hasattr(user.role, "value")
        else str(user.role)
    )
    return fresh_payload


router = APIRouter(
    dependencies=[
        Depends(_require_inspection_admin_or_signed_media)
    ]
)

# MongoDB connection using project settings
client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
db = client[settings.MONGODB_DATABASE]

inspections_collection = db.inspections
inspection_events_collection = db.inspection_events


# ============================================================================
# Google Drive access
# ============================================================================
#
# Cloud Run:
#   - Uses the Cloud Run runtime service account through Application Default
#     Credentials (ADC).
#   - Share the inspection_results Google Drive folder with that service account
#     as Viewer.
#   - No service-account key file and no user OAuth token are required in Cloud Run.
#
# Local development:
#   - May continue using GOOGLE_DRIVE_OAUTH_TOKEN_FILE with the existing
#     authorized-user token.json.
#   - GOOGLE_DRIVE_OAUTH_TOKEN_JSON remains available as an optional fallback.
#
# Required for both environments:
#   GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID=<inspection_results folder id>
#
# FastAPI proxies private Drive video bytes to React and uses the same Drive
# access for targeted Rail Break / Missing Fishplate Bolt evidence images.
# ============================================================================

GOOGLE_DRIVE_OAUTH_TOKEN_FILE = (
    getattr(settings, "GOOGLE_DRIVE_OAUTH_TOKEN_FILE", None)
    or os.getenv("GOOGLE_DRIVE_OAUTH_TOKEN_FILE")
)

# Cloud Run-ready option. Put the CONTENTS of the authorized-user token.json
# in Secret Manager and expose it as this environment variable. Local Windows
# development may continue using GOOGLE_DRIVE_OAUTH_TOKEN_FILE.
GOOGLE_DRIVE_OAUTH_TOKEN_JSON = (
    getattr(settings, "GOOGLE_DRIVE_OAUTH_TOKEN_JSON", None)
    or os.getenv("GOOGLE_DRIVE_OAUTH_TOKEN_JSON")
)

GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID = (
    getattr(settings, "GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID", None)
    or os.getenv("GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID")
)

GOOGLE_DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

# K_SERVICE is automatically supplied by Cloud Run. When present, prefer the
# runtime service account through ADC even if an old local OAuth path happens
# to remain in the service environment.
GOOGLE_DRIVE_USE_ADC = bool(os.getenv("K_SERVICE"))

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


def _save_drive_token(credentials) -> None:
    """
    Persist refreshed OAuth credentials only for local development.

    Cloud Run uses ADC/service-account credentials and therefore has no local
    user OAuth token file to update.
    """
    if GOOGLE_DRIVE_USE_ADC:
        return

    if GOOGLE_DRIVE_OAUTH_TOKEN_JSON:
        # Environment/secret JSON is intentionally treated as read-only.
        return

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
    Get a Google Drive access token.

    Cloud Run:
        Uses the Cloud Run runtime service account via Application Default
        Credentials (ADC). The inspection_results folder must be shared with
        that service account.

    Local development:
        Uses GOOGLE_DRIVE_OAUTH_TOKEN_JSON or GOOGLE_DRIVE_OAUTH_TOKEN_FILE.
    """
    global _drive_credentials

    async with _drive_credentials_lock:
        if _drive_credentials is None:
            try:
                # ------------------------------------------------------------
                # Cloud Run: runtime service account via ADC
                # ------------------------------------------------------------
                if GOOGLE_DRIVE_USE_ADC:
                    _drive_credentials, _ = google.auth.default(
                        scopes=[GOOGLE_DRIVE_READ_SCOPE]
                    )
                    print(
                        "✅ Google Drive authentication: "
                        "Cloud Run ADC/service account"
                    )

                # ------------------------------------------------------------
                # Optional OAuth JSON (local/other non-Cloud-Run environment)
                # ------------------------------------------------------------
                elif GOOGLE_DRIVE_OAUTH_TOKEN_JSON:
                    token_info = json.loads(GOOGLE_DRIVE_OAUTH_TOKEN_JSON)
                    _drive_credentials = Credentials.from_authorized_user_info(
                        token_info,
                        scopes=[GOOGLE_DRIVE_READ_SCOPE],
                    )
                    print("✅ Google Drive authentication: OAuth JSON")

                # ------------------------------------------------------------
                # Local Windows OAuth token file
                # ------------------------------------------------------------
                elif GOOGLE_DRIVE_OAUTH_TOKEN_FILE:
                    if not os.path.isfile(GOOGLE_DRIVE_OAUTH_TOKEN_FILE):
                        raise RuntimeError(
                            "Google Drive OAuth token file was not found: "
                            f"{GOOGLE_DRIVE_OAUTH_TOKEN_FILE}"
                        )

                    _drive_credentials = Credentials.from_authorized_user_file(
                        GOOGLE_DRIVE_OAUTH_TOKEN_FILE,
                        scopes=[GOOGLE_DRIVE_READ_SCOPE],
                    )
                    print(
                        "✅ Google Drive authentication: "
                        "local OAuth token file"
                    )

                else:
                    raise RuntimeError(
                        "Google Drive authentication is not configured. "
                        "Cloud Run should use ADC; local development should set "
                        "GOOGLE_DRIVE_OAUTH_TOKEN_FILE or "
                        "GOOGLE_DRIVE_OAUTH_TOKEN_JSON."
                    )

            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Failed to initialize Google Drive credentials: {exc}",
                ) from exc

        if not _drive_credentials.valid:
            try:
                # Works for both ADC service-account credentials and local
                # authorized-user OAuth credentials.
                await asyncio.to_thread(
                    _drive_credentials.refresh,
                    GoogleAuthRequest(),
                )

                # This is a no-op for Cloud Run/ADC and secret-JSON mode.
                await asyncio.to_thread(
                    _save_drive_token,
                    _drive_credentials,
                )

            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Failed to refresh Google Drive credentials: {exc}",
                ) from exc

        if not _drive_credentials.token:
            raise HTTPException(
                status_code=503,
                detail="Google Drive access token is unavailable.",
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



def _safe_drive_relative_parts(relative_path: str) -> List[str]:
    normalized = str(relative_path or "").replace("\\", "/").strip()
    path = PurePosixPath(normalized)
    parts = [part for part in path.parts if part not in {"", ".", "/"}]

    if not parts or path.is_absolute() or ".." in parts:
        raise ValueError(f"Unsafe or empty Drive relative path: {relative_path!r}")

    return parts


async def _resolve_drive_relative_file(
    inspection: Dict[str, Any],
    relative_path: str,
    folder_cache: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Resolve inspection_results/<run_id>/<relative_path> to a Drive file."""
    if not GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID:
        raise RuntimeError("GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID is not configured.")

    run_id = _extract_run_id_from_inspection(inspection)
    if not run_id:
        raise RuntimeError("Could not determine the inspection run folder.")

    cache = folder_cache if folder_cache is not None else {}
    run_cache_key = f"run:{run_id}"
    run_folder_id = cache.get(run_cache_key)

    if not run_folder_id:
        run_folders = await _drive_list_files(
            parent_id=GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID,
            name=run_id,
            mime_type="application/vnd.google-apps.folder",
        )
        if not run_folders:
            raise FileNotFoundError(
                f"Drive inspection run folder '{run_id}' was not found."
            )
        run_folder_id = run_folders[0]["id"]
        cache[run_cache_key] = run_folder_id

    parts = _safe_drive_relative_parts(relative_path)
    parent_id = run_folder_id

    for folder_name in parts[:-1]:
        cache_key = f"{parent_id}/{folder_name}"
        child_id = cache.get(cache_key)
        if not child_id:
            folders = await _drive_list_files(
                parent_id=parent_id,
                name=folder_name,
                mime_type="application/vnd.google-apps.folder",
            )
            if not folders:
                raise FileNotFoundError(
                    f"Drive evidence folder '{folder_name}' was not found "
                    f"while resolving '{relative_path}'."
                )
            child_id = folders[0]["id"]
            cache[cache_key] = child_id
        parent_id = child_id

    matches = await _drive_list_files(
        parent_id=parent_id,
        name=parts[-1],
    )
    if not matches:
        raise FileNotFoundError(
            f"Drive evidence image '{relative_path}' was not found."
        )
    return matches[0]


async def _download_drive_file_bytes(
    file_id: str,
    *,
    max_bytes: int = 3 * 1024 * 1024,
) -> Dict[str, Any]:
    """Download one small evidence image from Drive into memory."""
    token = await _get_drive_access_token()
    url = (
        "https://www.googleapis.com/drive/v3/files/"
        f"{file_id}?alt=media&supportsAllDrives=true"
    )

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http_client:
        response = await http_client.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
        )

    if response.status_code != 200:
        raise RuntimeError(
            "Failed to download Drive evidence image "
            f"({response.status_code}): {response.text[:300]}"
        )

    data = response.content
    if not data:
        raise RuntimeError("Drive evidence image was empty.")
    if len(data) > max_bytes:
        raise RuntimeError(
            f"Drive evidence image is too large ({len(data)} bytes)."
        )

    return {
        "data": data,
        "mime_type": response.headers.get("content-type") or "image/jpeg",
    }


def _visual_event_id(event: Dict[str, Any]) -> str:
    return str(event.get("id") or event.get("_id") or "")


def _visual_event_distance(event: Dict[str, Any]) -> Optional[float]:
    gps = event.get("gps") or {}
    value = gps.get("distance_from_start_m")
    if value is None:
        value = event.get("distance_from_route_start_m")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _visual_event_confidence(event: Dict[str, Any]) -> float:
    try:
        return float(event.get("confidence") or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _has_visual_evidence_paths(event: Dict[str, Any]) -> bool:
    media = event.get("media") or {}
    return bool(media.get("context_relpath") and media.get("crop_relpath"))


def _full_visual_review_exists(event: Dict[str, Any]) -> bool:
    review = event.get("supplementary_visual_review") or {}
    return review.get("performed") is True and bool(review.get("scope"))


def _select_visual_group_representative(group_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    def score(event: Dict[str, Any]):
        review = event.get("supplementary_visual_review") or {}
        has_existing = 1 if _full_visual_review_exists(event) else 0
        has_positive = 1 if (review.get("findings") or review.get("rail_break_visual_severity")) else 0
        has_evidence = 1 if _has_visual_evidence_paths(event) else 0
        distance = _visual_event_distance(event)
        return (
            has_positive,
            has_existing,
            has_evidence,
            _visual_event_confidence(event),
            -(abs(distance) if distance is not None else 1e12),
        )

    return max(group_events, key=score)


def _build_targeted_visual_event_groups(
    event_docs: List[Dict[str, Any]],
    group_gap_m: float = AI_EVENT_AGGREGATION_GAP_M,
) -> List[Dict[str, Any]]:
    eligible = [
        event
        for event in event_docs
        if event.get("defect_type") in AI_SPECIAL_VISION_CLASSES
    ]

    buckets: Dict[tuple, List[Dict[str, Any]]] = {}
    singletons: List[Dict[str, Any]] = []

    for event in eligible:
        distance = _visual_event_distance(event)
        key = (event.get("rail_side"), event.get("defect_type"))
        if distance is None:
            representative = _select_visual_group_representative([event])
            singletons.append(
                {
                    "group_id": f"{key[0]}|{key[1]}|single|{_visual_event_id(event)}",
                    "rail_side": key[0],
                    "defect_type": key[1],
                    "start_distance_m": None,
                    "end_distance_m": None,
                    "span_m": None,
                    "member_count": 1,
                    "events": [event],
                    "representative_event": representative,
                }
            )
            continue
        buckets.setdefault(key, []).append(event)

    groups: List[Dict[str, Any]] = []

    for (rail_side, defect_type), bucket in buckets.items():
        bucket.sort(key=lambda ev: _visual_event_distance(ev) or 0.0)
        current = [bucket[0]]

        def finalize(cluster: List[Dict[str, Any]]) -> None:
            representative = _select_visual_group_representative(cluster)
            distances = [
                _visual_event_distance(ev)
                for ev in cluster
                if _visual_event_distance(ev) is not None
            ]
            start_distance = min(distances) if distances else None
            end_distance = max(distances) if distances else None
            group_id = (
                f"{rail_side}|{defect_type}|"
                f"{(start_distance if start_distance is not None else 0):.2f}|"
                f"{(end_distance if end_distance is not None else 0):.2f}|{len(cluster)}"
            )
            groups.append(
                {
                    "group_id": group_id,
                    "rail_side": rail_side,
                    "defect_type": defect_type,
                    "start_distance_m": round(start_distance, 2) if start_distance is not None else None,
                    "end_distance_m": round(end_distance, 2) if end_distance is not None else None,
                    "span_m": round(end_distance - start_distance, 2) if (start_distance is not None and end_distance is not None) else None,
                    "member_count": len(cluster),
                    "events": cluster,
                    "representative_event": representative,
                }
            )

        for event in bucket[1:]:
            prev = current[-1]
            gap = (_visual_event_distance(event) or 0.0) - (_visual_event_distance(prev) or 0.0)
            if gap <= group_gap_m:
                current.append(event)
            else:
                finalize(current)
                current = [event]

        finalize(current)

    groups.extend(singletons)
    groups.sort(
        key=lambda group: (
            str(group.get("rail_side") or ""),
            str(group.get("defect_type") or ""),
            float(group.get("start_distance_m") or 0.0),
        )
    )
    return groups


def _build_group_metadata(group: Dict[str, Any]) -> Dict[str, Any]:
    representative = group["representative_event"]
    return {
        "group_id": group.get("group_id"),
        "rail_side": group.get("rail_side"),
        "defect_type": group.get("defect_type"),
        "start_distance_m": group.get("start_distance_m"),
        "end_distance_m": group.get("end_distance_m"),
        "span_m": group.get("span_m"),
        "member_count": group.get("member_count"),
        "representative_event_id": _visual_event_id(representative),
        "representative_route_distance_m": _visual_event_distance(representative),
        "aggregation_gap_m": AI_EVENT_AGGREGATION_GAP_M,
    }


async def _persist_group_review_to_events(
    group: Dict[str, Any],
    review: Dict[str, Any],
    *,
    error_text: Optional[str] = None,
) -> None:
    group_metadata = _build_group_metadata(group)
    representative = group["representative_event"]
    representative_id = _visual_event_id(representative)
    review_time = datetime.now(timezone.utc)

    # Keep the full review ONLY on the representative event to avoid duplicating
    # one grouped visual result across many raw detector events. Non-
    # representatives receive a lightweight reference + group metadata.
    for event in group.get("events") or []:
        raw_event_id = event.get("_id") or event.get("id")
        if not raw_event_id or not ObjectId.is_valid(str(raw_event_id)):
            continue

        is_representative = _visual_event_id(event) == representative_id
        event["supplementary_visual_group"] = group_metadata
        event["supplementary_visual_grouped_at"] = review_time

        if is_representative:
            full_review = dict(review)
            full_review["group_id"] = group_metadata["group_id"]
            full_review["group_member_count"] = group_metadata["member_count"]
            full_review["is_group_representative"] = True
            event["supplementary_visual_review"] = full_review
            event["supplementary_visual_reviewed_at"] = review_time
            update_doc = {
                "$set": {
                    "supplementary_visual_group": group_metadata,
                    "supplementary_visual_grouped_at": review_time,
                    "supplementary_visual_review": full_review,
                    "supplementary_visual_reviewed_at": review_time,
                },
                "$unset": {
                    "supplementary_visual_review_error": "",
                    "supplementary_visual_review_ref": "",
                },
            }
        else:
            review_ref = {
                "group_id": group_metadata["group_id"],
                "source_event_id": representative_id,
                "scope": review.get("scope"),
                "performed": review.get("performed"),
                "provider": review.get("provider"),
                "model": review.get("model"),
                "review_version": review.get("review_version"),
            }
            event["supplementary_visual_review_ref"] = review_ref
            event.pop("supplementary_visual_review", None)
            update_doc = {
                "$set": {
                    "supplementary_visual_group": group_metadata,
                    "supplementary_visual_grouped_at": review_time,
                    "supplementary_visual_review_ref": review_ref,
                },
                "$unset": {
                    "supplementary_visual_review": "",
                    "supplementary_visual_review_error": "",
                },
            }

        if error_text and is_representative:
            update_doc.setdefault("$set", {})["supplementary_visual_review_error"] = error_text

        await inspection_events_collection.update_one(
            {"_id": ObjectId(str(raw_event_id))},
            update_doc,
        )


async def _load_event_visual_evidence(
    inspection: Dict[str, Any],
    event: Dict[str, Any],
    folder_cache: Optional[Dict[str, str]] = None,
) -> Dict[str, Dict[str, Any]]:
    media = event.get("media") or {}
    context_relpath = media.get("context_relpath")
    crop_relpath = media.get("crop_relpath")

    if not context_relpath or not crop_relpath:
        raise FileNotFoundError(
            "Targeted visual check requires both context_relpath and crop_relpath."
        )

    context_file = await _resolve_drive_relative_file(
        inspection,
        context_relpath,
        folder_cache,
    )
    crop_file = await _resolve_drive_relative_file(
        inspection,
        crop_relpath,
        folder_cache,
    )

    context_image, crop_image = await asyncio.gather(
        _download_drive_file_bytes(context_file["id"]),
        _download_drive_file_bytes(crop_file["id"]),
    )

    # Google Drive normally returns image/jpeg for these artifacts. Fall back
    # to the stored filename extension if an upstream proxy reports a generic
    # content type.
    for image, relpath in (
        (context_image, context_relpath),
        (crop_image, crop_relpath),
    ):
        if not str(image.get("mime_type") or "").startswith("image/"):
            image["mime_type"] = mimetypes.guess_type(str(relpath))[0] or "image/jpeg"

    return {
        "context": context_image,
        "crop": crop_image,
    }


async def _run_targeted_visual_checks(
    inspection: Dict[str, Any],
    event_docs: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Run image analysis ONLY for Rail Break and Missing Fishplate Bolt.

    A lightweight event aggregator groups nearby same-class events on the same
    rail side so that likely repeated detections of one physical issue trigger
    one visual review instead of many duplicate visual calls.
    """
    folder_cache: Dict[str, str] = {}
    total_events = len(event_docs)
    eligible_events = [
        event for event in event_docs
        if event.get("defect_type") in AI_SPECIAL_VISION_CLASSES
    ]
    grouped_events = _build_targeted_visual_event_groups(event_docs)

    summary = {
        "eligible_event_count": len(eligible_events),
        "aggregated_group_count": len(grouped_events),
        "aggregated_reduction_event_count": max(len(eligible_events) - len(grouped_events), 0),
        "aggregation_gap_m": AI_EVENT_AGGREGATION_GAP_M,
        "reused_existing_count": 0,
        "performed_count": 0,
        "failed_count": 0,
        "covered_member_event_count": 0,
        "positive_fishplate_loose_nut_findings": 0,
        "rail_break_severity_assessments": 0,
        "classes_using_images": sorted(AI_SPECIAL_VISION_CLASSES),
        "group_summaries": [],
    }

    print(
        "AI VISION FILTER | "
        f"total_events={total_events} | "
        f"eligible={len(eligible_events)} | "
        f"skipped_non_visual={total_events - len(eligible_events)} | "
        f"allowed_classes={sorted(AI_SPECIAL_VISION_CLASSES)}"
    )
    print(
        "AI VISION AGGREGATOR | "
        f"raw_eligible={len(eligible_events)} | "
        f"groups={len(grouped_events)} | "
        f"reduced_by={summary['aggregated_reduction_event_count']} | "
        f"gap_m={AI_EVENT_AGGREGATION_GAP_M}"
    )

    for index, group in enumerate(grouped_events, start=1):
        representative = group["representative_event"]
        defect_type = group.get("defect_type")
        member_count = int(group.get("member_count") or 0)
        group_id = str(group.get("group_id") or "")
        started = time.perf_counter()

        print(
            "AI VISION GROUP | "
            f"group_id={group_id} | "
            f"class={defect_type} | "
            f"rail_side={group.get('rail_side')} | "
            f"members={member_count} | "
            f"start_distance_m={group.get('start_distance_m')} | "
            f"end_distance_m={group.get('end_distance_m')} | "
            f"representative_event_id={_visual_event_id(representative)}"
        )

        try:
            existing = representative.get("supplementary_visual_review") or {}
            if existing.get("performed") is True:
                review = dict(existing)
                review["group_id"] = group_id
                review["group_member_count"] = member_count
                review["is_group_representative"] = True
                summary["reused_existing_count"] += 1
            else:
                evidence = await _load_event_visual_evidence(
                    inspection,
                    representative,
                    folder_cache,
                )
                print(
                    "AI VISION INPUT READY | "
                    f"event_id={_visual_event_id(representative)} | "
                    f"class={defect_type} | "
                    f"context_relpath={(representative.get('media') or {}).get('context_relpath')} | "
                    f"crop_relpath={(representative.get('media') or {}).get('crop_relpath')} | "
                    f"context_bytes={len(evidence['context'].get('data') or b'')} | "
                    f"crop_bytes={len(evidence['crop'].get('data') or b'')} | "
                    f"context_mime={evidence['context'].get('mime_type')} | "
                    f"crop_mime={evidence['crop'].get('mime_type')}"
                )
                print(
                    "AI VISION CALL START | "
                    f"event_id={_visual_event_id(representative)} | "
                    f"class={defect_type} | "
                    f"two_images_present=True | "
                    f"group_member_count={member_count}"
                )
                review = await asyncio.to_thread(
                    generate_targeted_visual_review,
                    representative,
                    evidence["context"],
                    evidence["crop"],
                )
                review["group_id"] = group_id
                review["group_member_count"] = member_count
                review["is_group_representative"] = True
                summary["performed_count"] += 1

            await _persist_group_review_to_events(group, review)
            summary["covered_member_event_count"] += member_count

            if review.get("findings"):
                summary["positive_fishplate_loose_nut_findings"] += len(review.get("findings") or [])
            if review.get("rail_break_visual_severity"):
                summary["rail_break_severity_assessments"] += 1

            summary["group_summaries"].append(
                {
                    "group_id": group_id,
                    "defect_type": defect_type,
                    "rail_side": group.get("rail_side"),
                    "member_count": member_count,
                    "start_distance_m": group.get("start_distance_m"),
                    "end_distance_m": group.get("end_distance_m"),
                    "representative_event_id": _visual_event_id(representative),
                    "performed": True,
                    "provider": review.get("provider"),
                    "model": review.get("model"),
                    "reused_existing": existing.get("performed") is True,
                }
            )

            print(
                "AI VISION RESULT | "
                f"event_id={_visual_event_id(representative)} | "
                f"class={defect_type} | "
                f"performed={review.get('performed')} | "
                f"provider={review.get('provider')} | "
                f"model={review.get('model')} | "
                f"scope={review.get('scope')} | "
                f"fallback_used={review.get('fallback_used')} | "
                f"group_member_count={member_count}"
            )
            print(
                "AI VISION EVENT COMPLETE | "
                f"{index}/{len(grouped_events)}, class={defect_type}, members={member_count}, "
                f"elapsed={time.perf_counter() - started:.2f}s"
            )

        except Exception as exc:
            summary["failed_count"] += 1
            error_text = f"{type(exc).__name__}: {exc}"[:1000]
            failed_review = {
                "review_version": "targeted_visual_check_failed",
                "performed": False,
                "scope": (
                    "rail_break_visual_severity"
                    if defect_type == "Rail Break"
                    else "fishplate_nut_visual_check"
                ),
                "error": error_text,
                "group_id": group_id,
                "group_member_count": member_count,
                "is_group_representative": True,
            }
            await _persist_group_review_to_events(group, failed_review, error_text=error_text)
            summary["group_summaries"].append(
                {
                    "group_id": group_id,
                    "defect_type": defect_type,
                    "rail_side": group.get("rail_side"),
                    "member_count": member_count,
                    "start_distance_m": group.get("start_distance_m"),
                    "end_distance_m": group.get("end_distance_m"),
                    "representative_event_id": _visual_event_id(representative),
                    "performed": False,
                    "error": error_text,
                }
            )
            print(
                "AI VISION GROUP FAILED | "
                f"group_id={group_id} | class={defect_type} | members={member_count} | error={error_text}"
            )

    return summary

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



def _build_signed_media_url(
    request: Request,
    inspection_id: str,
    rail_side: str,
) -> str:
    """
    Build a short-lived URL usable by a native HTML5 <video> element.

    The real admin JWT is never placed in the URL.
    """
    rail_side = rail_side.strip().lower()
    expires = int(time.time()) + MEDIA_URL_TTL_SECONDS

    signature = _media_signature(
        inspection_id,
        rail_side,
        expires,
    )

    url = request.url_for(
        "stream_inspection_video",
        inspection_id=inspection_id,
        rail_side=rail_side,
    )

    return str(
        url.include_query_params(
            expires=str(expires),
            sig=signature,
        )
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


class AIReviewGenerationResponse(BaseModel):
    inspection_id: str
    status: str
    ai_advisory_version: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_fallback_used: Optional[bool] = None
    ai_advisory_generated_at: Optional[datetime] = None
    ai_spatial_summary: Optional[Dict[str, Any]] = None
    supplementary_visual_summary: Optional[Dict[str, Any]] = None
    ai_advisory: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


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

    # Native HTML5 <video> requests do not inherit the Axios Authorization
    # header. Return scoped, short-lived signed URLs instead of exposing the
    # user's admin JWT or making the media endpoint public.
    normalized_inspection["media_urls"] = {
        "left": _build_signed_media_url(
            request,
            inspection_id,
            "left",
        ),
        "right": _build_signed_media_url(
            request,
            inspection_id,
            "right",
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


@router.post(
    "/inspections/{inspection_id}/ai-review",
    response_model=AIReviewGenerationResponse,
)
async def generate_inspection_ai_review_endpoint(
    inspection_id: str,
    force: bool = Query(False),
):
    """
    Generate the Myanmar-language railway maintenance advisory from the
    inspection + event data already stored in MongoDB.

    This endpoint does NOT rerun YOLO/RF-DETR and does NOT reopen the videos.
    It downloads saved event evidence images from Google Drive ONLY for two
    narrow checks: Rail Break apparent severity and clearly loose/backed-off
    remaining fishplate nuts on Missing Fishplate Bolt events. Existing
    Colab/Gradio supplementary visual findings are reused.

    Status flow:
        pending/failed -> processing -> completed
        processing     -> HTTP 409
        completed      -> return existing advisory unless force=true
    """

    if not ObjectId.is_valid(inspection_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid inspection ID",
        )

    object_id = ObjectId(inspection_id)

    inspection = await inspections_collection.find_one(
        {"_id": object_id}
    )

    if not inspection:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    current_status = inspection.get("ai_advisory_status")
    existing_advisory = inspection.get("ai_advisory")

    if (
        current_status == "completed"
        and isinstance(existing_advisory, dict)
        and existing_advisory
        and not force
    ):
        return AIReviewGenerationResponse(
            inspection_id=inspection_id,
            status="completed",
            ai_advisory_version=inspection.get("ai_advisory_version"),
            ai_provider=inspection.get("ai_provider"),
            ai_model=inspection.get("ai_model"),
            ai_fallback_used=inspection.get("ai_fallback_used"),
            ai_advisory_generated_at=inspection.get(
                "ai_advisory_generated_at"
            ),
            ai_spatial_summary=serialize_mongo_value(
                inspection.get("ai_spatial_summary") or {}
            ),
            supplementary_visual_summary=serialize_mongo_value(
                inspection.get("supplementary_visual_summary") or {}
            ),
            ai_advisory=serialize_mongo_value(existing_advisory),
            message="AI review already exists.",
        )

    if current_status == "processing":
        raise HTTPException(
            status_code=409,
            detail="AI review generation is already in progress.",
        )

    # Atomically claim this inspection so two Admin clicks cannot start two
    # LLM generations at the same time.
    claim_filter: Dict[str, Any] = {
        "_id": object_id,
        "ai_advisory_status": {"$ne": "processing"},
    }

    if not force:
        claim_filter["$or"] = [
            {"ai_advisory_status": {"$exists": False}},
            {"ai_advisory_status": None},
            {"ai_advisory_status": "pending"},
            {"ai_advisory_status": "failed"},
        ]

    started_at = datetime.now(timezone.utc)

    claimed = await inspections_collection.find_one_and_update(
        claim_filter,
        {
            "$set": {
                "ai_advisory_status": "processing",
                "ai_advisory_started_at": started_at,
            },
            "$unset": {
                "ai_advisory_error": "",
            },
        },
        return_document=ReturnDocument.AFTER,
    )

    if not claimed:
        latest = await inspections_collection.find_one(
            {"_id": object_id}
        )
        latest_status = (latest or {}).get("ai_advisory_status")

        if latest_status == "processing":
            raise HTTPException(
                status_code=409,
                detail="AI review generation is already in progress.",
            )

        if latest_status == "completed" and not force:
            latest_advisory = (latest or {}).get("ai_advisory") or {}
            return AIReviewGenerationResponse(
                inspection_id=inspection_id,
                status="completed",
                ai_advisory_version=(latest or {}).get(
                    "ai_advisory_version"
                ),
                ai_provider=(latest or {}).get("ai_provider"),
                ai_model=(latest or {}).get("ai_model"),
                ai_fallback_used=(latest or {}).get(
                    "ai_fallback_used"
                ),
                ai_advisory_generated_at=(latest or {}).get(
                    "ai_advisory_generated_at"
                ),
                ai_spatial_summary=serialize_mongo_value(
                    (latest or {}).get("ai_spatial_summary") or {}
                ),
                supplementary_visual_summary=serialize_mongo_value(
                    (latest or {}).get("supplementary_visual_summary") or {}
                ),
                ai_advisory=serialize_mongo_value(latest_advisory),
                message="AI review already exists.",
            )

        raise HTTPException(
            status_code=409,
            detail=(
                "Inspection could not be claimed for AI review generation. "
                f"Current status: {latest_status or 'unknown'}"
            ),
        )

    try:
        event_docs: List[Dict[str, Any]] = []
        cursor = (
            inspection_events_collection
            .find({"inspection_id": inspection_id})
            .sort([
                ("rail_side", 1),
                ("start_timestamp", 1),
            ])
        )

        async for event_doc in cursor:
            event_docs.append(
                serialize_mongo_value(dict(event_doc))
            )

        inspection_for_ai = serialize_mongo_value(dict(claimed))
        inspection_for_ai["id"] = inspection_id
        inspection_for_ai.pop("_id", None)

        # ------------------------------------------------------------
        # TARGETED IMAGE ANALYSIS ONLY
        # ------------------------------------------------------------
        # Images are downloaded/sent to the LLM ONLY for:
        #   - Rail Break -> apparent visual severity
        #   - Missing Fishplate Bolt -> clearly loose/backed-off remaining nut
        # All other classes remain data/text-only.
        # Existing Colab/Gradio supplementary reviews are reused.
        supplementary_visual_summary = await _run_targeted_visual_checks(
            inspection_for_ai,
            event_docs,
        )

        # The whole-inspection maintenance advisory is text-only. It receives
        # only positive/high-confidence targeted findings through event_docs.
        # google-genai and groq SDK calls are synchronous, so run this final
        # advisory call in a worker thread.
        ai_result = await asyncio.to_thread(
            generate_inspection_ai_review,
            inspection_for_ai,
            event_docs,
        )

        generated_at = datetime.now(timezone.utc)
        advisory = ai_result["overall_advisory"]
        spatial_summary = ai_result["spatial_summary"]
        event_aggregation_summary = ai_result.get("event_aggregation_summary") or {}

        await inspections_collection.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "ai_advisory_status": "completed",
                    "ai_advisory_version": ai_result["version"],
                    "ai_provider": ai_result["provider"],
                    "ai_model": ai_result["model"],
                    "ai_fallback_used": ai_result["fallback_used"],
                    "ai_execution": ai_result["execution"],
                    "ai_spatial_summary": spatial_summary,
                    "ai_event_aggregation_summary": event_aggregation_summary,
                    "supplementary_visual_summary": supplementary_visual_summary,
                    "ai_advisory": advisory,
                    "ai_advisory_generated_at": generated_at,
                },
                "$unset": {
                    "ai_advisory_error": "",
                    "ai_review_status": "",
                },
            },
        )

        return AIReviewGenerationResponse(
            inspection_id=inspection_id,
            status="completed",
            ai_advisory_version=ai_result["version"],
            ai_provider=ai_result["provider"],
            ai_model=ai_result["model"],
            ai_fallback_used=ai_result["fallback_used"],
            ai_advisory_generated_at=generated_at,
            ai_spatial_summary=spatial_summary,
            supplementary_visual_summary=supplementary_visual_summary,
            ai_advisory=advisory,
            message="Myanmar-language AI maintenance review generated.",
        )

    except HTTPException:
        raise

    except Exception as exc:
        error_text = f"{type(exc).__name__}: {exc}"

        await inspections_collection.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "ai_advisory_status": "failed",
                    "ai_advisory_error": error_text[:1500],
                    "ai_advisory_failed_at": datetime.now(timezone.utc),
                }
            },
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "AI review generation failed. The inspection was marked "
                f"as retryable 'failed'. Error: {error_text[:500]}"
            ),
        ) from exc


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