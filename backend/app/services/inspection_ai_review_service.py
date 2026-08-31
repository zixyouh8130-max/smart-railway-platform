"""Railway inspection AI maintenance advisory service.

The whole-inspection advisory is data-only: detector events, confidence,
rail side, GPS/route distance, event aggregation, and spatial summaries.
No inspection images are sent to an LLM for secondary visual inspection.
Historical supplementary visual fields may remain in MongoDB but are
ignored by the advisory pipeline.
"""
from __future__ import annotations

from collections import Counter
from functools import lru_cache
import json
import os
from typing import Any, Dict, List, Optional

from ..core.config import settings


AI_ADVISORY_VERSION = "railway_advisory_v9_text_data_only_gemini35_compact"
AI_CLUSTER_GAP_M = 3.0
AI_CLUSTER_MIN_EVENTS = 2
AI_EVENT_AGGREGATION_GAP_M = 0.5



ALLOWED_PRIORITIES = {
    "routine",
    "monitor",
    "priority_inspection",
    "urgent_manual_review",
}

MYANMAR_OUTPUT_RULES = r"""
MYANMAR LANGUAGE OUTPUT REQUIREMENT:

- Write ALL human-readable prose values in natural Myanmar (Burmese) Unicode.
- Keep JSON keys EXACTLY as specified in English.
- Keep required enum/control values EXACTLY in English, including:
  routine, monitor, priority_inspection, urgent_manual_review, left, and right.
- Keep structured defect_type/class values exactly as supplied by the detector
  (for example: Missing Fastener, Missing Fishplate Bolt, Rail Break,
  Railway Joint Defect) so downstream code and MongoDB records remain stable.
- In narrative prose, explain defect names and maintenance meaning in Myanmar.
  You may include the original English technical term in parentheses when it
  improves clarity.
- Keep numbers, coordinates, distances, timestamps, and units unchanged.
- Do not switch back to English prose. If a technical term has no clear
  Myanmar equivalent, use Myanmar wording followed by the English term in
  parentheses.
- Return valid JSON only; do not add Markdown fences or text outside the JSON.
"""


# ---------------------------------------------------------------------------
# Gemini structured-output schemas
# ---------------------------------------------------------------------------
#
# The previous implementation only requested `application/json` and then called
# json.loads(response.text). Gemini could still return a truncated JSON string
# (for example when the output budget was too small), which caused errors such
# as:
#
#   JSONDecodeError: Unterminated string ...
#
# These schemas make Vertex/Gemini generate controlled JSON and allow the SDK's
# parsed response to be used when available.

ADVISORY_JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "overall_priority": {
            "type": "string",
            "enum": [
                "routine",
                "monitor",
                "priority_inspection",
                "urgent_manual_review",
            ],
        },
        "executive_summary": {"type": "string"},
        "key_findings": {
            "type": "array",
            "items": {"type": "string"},
        },
        "areas_of_attention": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rail_side": {
                        "type": "string",
                        "enum": ["left", "right"],
                    },
                    "start_distance_m": {"type": "number"},
                    "end_distance_m": {"type": "number"},
                    "event_count": {"type": "integer"},
                    "defect_counts": {
                        "type": "object",
                        "additionalProperties": {"type": "integer"},
                    },
                    "priority": {
                        "type": "string",
                        "enum": [
                            "routine",
                            "monitor",
                            "priority_inspection",
                            "urgent_manual_review",
                        ],
                    },
                    "assessment": {"type": "string"},
                    "recommended_checks": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": [
                    "rail_side",
                    "start_distance_m",
                    "end_distance_m",
                    "event_count",
                    "defect_counts",
                    "priority",
                    "assessment",
                    "recommended_checks",
                ],
            },
        },
        "individual_high_priority_events": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rail_side": {
                        "type": "string",
                        "enum": ["left", "right"],
                    },
                    "route_distance_m": {"type": "number"},
                    "defect_type": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": [
                            "priority_inspection",
                            "urgent_manual_review",
                        ],
                    },
                    "assessment": {"type": "string"},
                    "recommended_checks": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": [
                    "rail_side",
                    "route_distance_m",
                    "defect_type",
                    "priority",
                    "assessment",
                    "recommended_checks",
                ],
            },
        },
        "defect_type_assessments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "defect_type": {"type": "string"},
                    "event_count": {"type": "integer"},
                    "maintenance_significance": {"type": "string"},
                    "recommended_response": {"type": "string"},
                },
                "required": [
                    "defect_type",
                    "event_count",
                    "maintenance_significance",
                    "recommended_response",
                ],
            },
        },
        "possible_contributing_factors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "defect_type": {"type": "string"},
                    "factors": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "context": {"type": "string"},
                },
                "required": ["defect_type", "factors", "context"],
            },
        },
        "recommended_actions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "trend_assessment": {"type": "string"},
        "limitations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "overall_priority",
        "executive_summary",
        "key_findings",
        "areas_of_attention",
        "individual_high_priority_events",
        "defect_type_assessments",
        "possible_contributing_factors",
        "recommended_actions",
        "trend_assessment",
        "limitations",
    ],
}


# Keep the final maintenance advisory concise enough that structured JSON does
# not hit the model output-token ceiling. These are presentation limits, not
# railway-safety thresholds.
def _apply_advisory_schema_limits() -> None:
    props = ADVISORY_JSON_SCHEMA["properties"]
    props["key_findings"]["maxItems"] = 6
    props["areas_of_attention"]["maxItems"] = 8
    props["individual_high_priority_events"]["maxItems"] = 8
    props["defect_type_assessments"]["maxItems"] = 4
    props["possible_contributing_factors"]["maxItems"] = 4
    props["recommended_actions"]["maxItems"] = 8
    props["limitations"]["maxItems"] = 6

    props["areas_of_attention"]["items"]["properties"]["recommended_checks"]["maxItems"] = 5
    props["individual_high_priority_events"]["items"]["properties"]["recommended_checks"]["maxItems"] = 5
    props["possible_contributing_factors"]["items"]["properties"]["factors"]["maxItems"] = 5


_apply_advisory_schema_limits()


def _gemini_finish_reason(response: Any) -> Optional[str]:
    """Best-effort diagnostic helper without depending on one SDK version."""
    try:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return None
        reason = getattr(candidates[0], "finish_reason", None)
        if reason is None:
            return None
        return str(reason)
    except Exception:
        return None


def _parsed_gemini_json(response: Any, *, label: str) -> Dict[str, Any]:
    """
    Prefer the SDK's parsed structured-output object, then safely fall back to
    response.text. A malformed/truncated response gets a useful diagnostic
    instead of leaking raw model output.
    """
    parsed = getattr(response, "parsed", None)

    if isinstance(parsed, dict):
        return parsed

    if parsed is not None and hasattr(parsed, "model_dump"):
        dumped = parsed.model_dump()
        if isinstance(dumped, dict):
            return dumped

    text = (getattr(response, "text", None) or "").strip()
    if not text:
        finish_reason = _gemini_finish_reason(response)
        raise RuntimeError(
            f"Gemini returned an empty {label} response"
            + (
                f" (finish_reason={finish_reason})."
                if finish_reason
                else "."
            )
        )

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        finish_reason = _gemini_finish_reason(response)
        raise RuntimeError(
            f"Gemini returned malformed/truncated {label} JSON: "
            f"{type(exc).__name__}: {exc}; "
            f"text_chars={len(text)}"
            + (
                f"; finish_reason={finish_reason}"
                if finish_reason
                else ""
            )
        ) from exc

    if not isinstance(payload, dict):
        raise RuntimeError(
            f"Gemini {label} structured response was not a JSON object."
        )

    return payload


def _gemini_generate_structured_json(
    *,
    model: str,
    contents: Any,
    response_json_schema: Dict[str, Any],
    temperature: float,
    max_output_tokens: int,
    label: str,
    thinking_level: Optional[str] = None,
) -> Dict[str, Any]:
    """
    One controlled Vertex/Gemini JSON call.

    `response_json_schema` prevents free-form/truncated JSON formatting issues.
    Automatic function calling is explicitly disabled because this workflow
    uses no tools/functions and should be a single deterministic model call.
    """
    from google.genai import types as genai_types

    response = _gemini_client().models.generate_content(
        model=model,
        contents=contents,
        config=genai_types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
            response_json_schema=response_json_schema,
            thinking_config=(
                genai_types.ThinkingConfig(thinking_level=thinking_level)
                if thinking_level is not None
                else None
            ),
            automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(
                disable=True
            ),
        ),
    )

    return _parsed_gemini_json(response, label=label)


def _setting(name: str, default: Optional[str] = None) -> Optional[str]:
    value = getattr(settings, name, None)
    if value not in (None, ""):
        return str(value)
    value = os.getenv(name)
    if value not in (None, ""):
        return value
    return default


def _event_distance(event: Dict[str, Any]) -> Optional[float]:
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


def _event_key(event: Dict[str, Any]) -> str:
    return (
        f"{event.get('rail_side')}|"
        f"{event.get('defect_type')}|"
        f"{event.get('representative_frame')}|"
        f"{event.get('start_timestamp')}"
    )


def _event_id_str(event: Dict[str, Any]) -> str:
    raw = event.get("id") or event.get("_id") or ""
    return str(raw)


def _event_confidence(event: Dict[str, Any]) -> float:
    try:
        return float(event.get("confidence") or 0.0)
    except (TypeError, ValueError):
        return 0.0


def build_event_aggregation_summary(
    events: List[Dict[str, Any]],
    *,
    group_gap_m: float = AI_EVENT_AGGREGATION_GAP_M,
) -> Dict[str, Any]:
    """Group likely repeated detections into likely physical issue groups.

    This does NOT replace the raw detector events in MongoDB. It gives the AI
    review a more realistic summary so repeated nearby detections of the same
    defect on the same rail side are treated as one likely issue group.
    """
    defect_events = [event for event in events if event.get("defect_type")]

    grouped: Dict[tuple, List[Dict[str, Any]]] = {}
    no_distance_groups: List[Dict[str, Any]] = []

    for event in defect_events:
        distance = _event_distance(event)
        if distance is None:
            no_distance_groups.append(
                {
                    "group_id": f"single|{event.get('rail_side')}|{event.get('defect_type')}|{_event_id_str(event)}",
                    "rail_side": event.get("rail_side"),
                    "defect_type": event.get("defect_type"),
                    "start_distance_m": None,
                    "end_distance_m": None,
                    "span_m": None,
                    "member_event_count": 1,
                    "member_event_ids": [_event_id_str(event)],
                    "representative_event_id": _event_id_str(event),
                    "representative_confidence": round(_event_confidence(event), 4),
                }
            )
            continue
        grouped.setdefault((event.get("rail_side"), event.get("defect_type")), []).append(event)

    groups: List[Dict[str, Any]] = []

    for (rail_side, defect_type), bucket in grouped.items():
        bucket.sort(key=lambda ev: _event_distance(ev) or 0.0)
        current = [bucket[0]]

        def finalize(cluster: List[Dict[str, Any]]) -> None:
            distances = [
                _event_distance(ev)
                for ev in cluster
                if _event_distance(ev) is not None
            ]
            if not distances:
                return
            representative = max(cluster, key=_event_confidence)
            start_distance = min(distances)
            end_distance = max(distances)
            groups.append(
                {
                    "group_id": (
                        f"{rail_side}|{defect_type}|"
                        f"{start_distance:.2f}|{end_distance:.2f}|{len(cluster)}"
                    ),
                    "rail_side": rail_side,
                    "defect_type": defect_type,
                    "start_distance_m": round(start_distance, 2),
                    "end_distance_m": round(end_distance, 2),
                    "span_m": round(end_distance - start_distance, 2),
                    "member_event_count": len(cluster),
                    "member_event_ids": [_event_id_str(ev) for ev in cluster],
                    "representative_event_id": _event_id_str(representative),
                    "representative_confidence": round(_event_confidence(representative), 4),
                }
            )

        for event in bucket[1:]:
            prev = current[-1]
            gap = (_event_distance(event) or 0.0) - (_event_distance(prev) or 0.0)
            if gap <= group_gap_m:
                current.append(event)
            else:
                finalize(current)
                current = [event]

        finalize(current)

    groups.extend(no_distance_groups)
    groups.sort(
        key=lambda g: (
            str(g.get("rail_side") or ""),
            str(g.get("defect_type") or ""),
            float(g.get("start_distance_m") or 0.0),
        )
    )

    grouped_class_counts = Counter(group.get("defect_type") for group in groups)
    repeated_group_count = sum(1 for group in groups if (group.get("member_event_count") or 0) > 1)
    reduced_event_count = len(defect_events) - len(groups)

    return {
        "group_gap_m": group_gap_m,
        "raw_event_count": len(defect_events),
        "aggregated_group_count": len(groups),
        "repeated_group_count": repeated_group_count,
        "singleton_group_count": len(groups) - repeated_group_count,
        "reduction_event_count": reduced_event_count,
        "reduction_ratio": round((reduced_event_count / len(defect_events)), 4) if defect_events else 0.0,
        "grouped_class_counts": dict(grouped_class_counts),
        "groups": groups,
    }


def build_spatial_defect_summary(
    inspection: Dict[str, Any],
    events: List[Dict[str, Any]],
    cluster_gap_m: float = AI_CLUSTER_GAP_M,
    min_cluster_events: int = AI_CLUSTER_MIN_EVENTS,
) -> Dict[str, Any]:
    defect_events = [event for event in events if event.get("defect_type")]

    class_counts = Counter(event.get("defect_type") for event in defect_events)
    rail_counts = Counter(event.get("rail_side") for event in defect_events)

    route = inspection.get("route") or {}
    route_distance_m = route.get("distance_m")

    clusters: List[Dict[str, Any]] = []

    for rail_side in ("left", "right"):
        rail_events = [
            event
            for event in defect_events
            if event.get("rail_side") == rail_side
            and _event_distance(event) is not None
        ]
        rail_events.sort(key=lambda event: _event_distance(event) or 0.0)

        if not rail_events:
            continue

        current_cluster = [rail_events[0]]

        def finalize_cluster(cluster: List[Dict[str, Any]]) -> None:
            if len(cluster) < min_cluster_events:
                return

            distances = [
                _event_distance(event)
                for event in cluster
                if _event_distance(event) is not None
            ]
            if not distances:
                return

            defect_counts = Counter(event.get("defect_type") for event in cluster)
            start_distance = min(distances)
            end_distance = max(distances)

            clusters.append(
                {
                    "rail_side": rail_side,
                    "start_distance_m": round(start_distance, 2),
                    "end_distance_m": round(end_distance, 2),
                    "span_m": round(end_distance - start_distance, 2),
                    "event_count": len(cluster),
                    "defect_counts": dict(defect_counts),
                    "event_keys": [_event_key(event) for event in cluster],
                }
            )

        for event in rail_events[1:]:
            previous = current_cluster[-1]
            gap = (_event_distance(event) or 0.0) - (_event_distance(previous) or 0.0)

            if gap <= cluster_gap_m:
                current_cluster.append(event)
            else:
                finalize_cluster(current_cluster)
                current_cluster = [event]

        finalize_cluster(current_cluster)

    clusters.sort(key=lambda c: (-c["event_count"], c["start_distance_m"]))

    events_per_10m = None
    try:
        if route_distance_m is not None and float(route_distance_m) > 0:
            events_per_10m = round(
                (len(defect_events) / float(route_distance_m)) * 10,
                2,
            )
    except (TypeError, ValueError):
        pass

    return {
        "reviewed_event_count": len(defect_events),
        "class_counts": dict(class_counts),
        "rail_counts": dict(rail_counts),
        "route_distance_m": route_distance_m,
        "events_per_10m": events_per_10m,
        "cluster_gap_heuristic_m": cluster_gap_m,
        "clusters": clusters,
        "important_note": (
            "Clusters are descriptive attention areas from this inspection only. "
            "They are not railway safety thresholds."
        ),
    }


def build_advisory_prompt(
    inspection: Dict[str, Any],
    events: List[Dict[str, Any]],
    spatial_summary: Dict[str, Any],
) -> str:
    """Build a compact whole-inspection prompt.

    The raw event list is intentionally NOT repeated here. The final advisory
    uses deterministic counts, compact event-aggregator groups, localized
    concentrations, and positive targeted-vision findings. This keeps the
    request comfortably below Groq's token limits and reduces Gemini truncation.
    """
    route = inspection.get("route") or {}
    defect_events = [event for event in events if event.get("defect_type")]
    event_aggregation = build_event_aggregation_summary(events)

    # Compact arrays avoid repeating long JSON key names for every event/group.
    # Row format:
    # [rail_side, defect_type, start_m, end_m, member_count, representative_confidence]
    compact_issue_groups = [
        [
            group.get("rail_side"),
            group.get("defect_type"),
            group.get("start_distance_m"),
            group.get("end_distance_m"),
            group.get("member_event_count"),
            group.get("representative_confidence"),
        ]
        for group in event_aggregation.get("groups") or []
    ]

    # Spatial clusters are already ordered by importance/event count. Limit the
    # prompt to the strongest 20 concentrations while retaining deterministic
    # full-route counts separately.
    compact_clusters = [
        [
            cluster.get("rail_side"),
            cluster.get("start_distance_m"),
            cluster.get("end_distance_m"),
            cluster.get("event_count"),
            cluster.get("defect_counts") or {},
        ]
        for cluster in (spatial_summary.get("clusters") or [])[:20]
    ]

    factual_input = {
        "inspection_model": inspection.get("model") or {},
        "route_distance_m": route.get("distance_m"),
        "raw_total_defect_events": len(defect_events),
        "raw_class_counts": spatial_summary.get("class_counts") or {},
        "raw_rail_counts": spatial_summary.get("rail_counts") or {},
        "events_per_10m": spatial_summary.get("events_per_10m"),
        "aggregation_gap_m": event_aggregation.get("group_gap_m"),
        "aggregated_issue_group_count": event_aggregation.get("aggregated_group_count"),
        "aggregated_grouped_class_counts": event_aggregation.get("grouped_class_counts") or {},
        "aggregation_reduction_event_count": event_aggregation.get("reduction_event_count"),
        "aggregated_issue_group_row_format": [
            "rail_side",
            "defect_type",
            "start_distance_m",
            "end_distance_m",
            "member_event_count",
            "representative_confidence",
        ],
        "aggregated_issue_groups": compact_issue_groups,
        "localized_concentration_row_format": [
            "rail_side",
            "start_distance_m",
            "end_distance_m",
            "raw_event_count",
            "defect_counts",
        ],
        "localized_defect_concentrations": compact_clusters,
        "localized_concentration_total_count": len(spatial_summary.get("clusters") or []),
    }

    return f"""
You are an AI railway maintenance advisory assistant.

{MYANMAR_OUTPUT_RULES}

Analyze the supplied inspection facts. Object detection has already been done.
Do not verify or reject detector classes.
No images are provided to you. Base the advisory only on the structured
detector/event/GPS facts supplied below.

CORE INTERPRETATION:
- raw_total_defect_events is the detector-event count.
- aggregated_issue_groups are a 0.5 m same-class/same-rail heuristic and are a
  better approximation of likely distinct physical issue locations.
- Do not treat every raw event as a separate physical defect.
- Use localized_defect_concentrations only for the exact supplied ranges.

PRIORITY ENUMS:
routine, monitor, priority_inspection, urgent_manual_review.

SAFETY / ENGINEERING RULES:
- Do not certify the track safe or unsafe.
- Do not invent thresholds, dimensions, torque values, crack depth, or speed restrictions.
- Do not diagnose causes; describe them only as possible contributing factors.
- Do not claim that images were independently reviewed by the LLM.
- Treat detector classes/confidences as supplied inspection data, not as visually re-verified facts.
- Final actions require applicable operator procedures and qualified field inspection.

OUTPUT RULES:
- Return valid JSON only.
- Follow the required structured schema exactly.
- Keep Myanmar prose concise: normally one short sentence per text field.
- key_findings: at most 6 concise items.
- areas_of_attention: at most 8 strongest locations.
- individual_high_priority_events: at most 8; include only when genuinely warranted.
- recommended_actions: at most 8 concise actions.
- limitations: at most 6 concise items.
- Keep defect_type values exactly as supplied by the detector.

Required top-level keys:
overall_priority, executive_summary, key_findings, areas_of_attention,
individual_high_priority_events, defect_type_assessments,
possible_contributing_factors, recommended_actions, trend_assessment, limitations.

INSPECTION FACTS:
{json.dumps(factual_input, ensure_ascii=False, separators=(",", ":"))}
"""


def _validate_advisory(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("AI advisory must be a JSON object.")

    priority = payload.get("overall_priority")
    if priority not in ALLOWED_PRIORITIES:
        raise ValueError(f"Invalid overall_priority: {priority!r}")

    if not str(payload.get("executive_summary") or "").strip():
        raise ValueError("AI advisory is missing executive_summary.")

    list_fields = (
        "key_findings",
        "areas_of_attention",
        "individual_high_priority_events",
        "defect_type_assessments",
        "possible_contributing_factors",
        "recommended_actions",
        "limitations",
    )
    for field in list_fields:
        value = payload.get(field)
        if value is None:
            payload[field] = []
        elif not isinstance(value, list):
            raise ValueError(f"{field} must be a JSON array.")

    payload.setdefault("trend_assessment", "")
    return payload


@lru_cache(maxsize=1)
def _gemini_client():
    from google import genai
    from google.genai import types as genai_types

    project_id = (
        _setting("GOOGLE_CLOUD_PROJECT_ID")
        or _setting("GOOGLE_CLOUD_PROJECT")
    )
    if not project_id:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT_ID is not configured for Vertex AI."
        )

    location = _setting("GEMINI_LOCATION", "global") or "global"

    return genai.Client(
        vertexai=True,
        project=project_id,
        location=location,
        http_options=genai_types.HttpOptions(api_version="v1"),
    )


def _call_gemini(prompt: str) -> Dict[str, Any]:
    model = _setting("GEMINI_MODEL", "gemini-3.5-flash") or "gemini-3.5-flash"

    payload = _gemini_generate_structured_json(
        model=model,
        contents=prompt,
        response_json_schema=ADVISORY_JSON_SCHEMA,
        temperature=0.1,
        max_output_tokens=8192,
        label="maintenance-advisory",
        thinking_level="MINIMAL",
    )

    validated = _validate_advisory(payload)
    print(
        "GEMINI FINAL ADVISORY SUCCESS | "
        f"model={model} | "
        f"overall_priority={validated.get('overall_priority')}"
    )
    return validated


@lru_cache(maxsize=1)
def _groq_client():
    from groq import Groq

    api_key = _setting("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")
    return Groq(api_key=api_key)


def _call_groq(prompt: str) -> Dict[str, Any]:
    model = _setting("GROQ_MODEL", "qwen/qwen3.6-27b") or "qwen/qwen3.6-27b"

    response = _groq_client().chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        reasoning_effort="none",
        temperature=0.2,
        max_completion_tokens=1600,
    )

    content = response.choices[0].message.content or ""
    if not content.strip():
        raise RuntimeError("Groq/Qwen returned an empty response.")

    return _validate_advisory(json.loads(content))


def generate_inspection_ai_review(
    inspection: Dict[str, Any],
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate a Myanmar-language review with Gemini -> Qwen fallback."""

    spatial_summary = build_spatial_defect_summary(inspection, events)
    event_aggregation_summary = build_event_aggregation_summary(events)
    prompt = build_advisory_prompt(inspection, events, spatial_summary)

    print(
        "AI FINAL ADVISORY INPUT | "
        f"raw_events={len([e for e in events if e.get('defect_type')])} | "
        f"aggregated_groups={event_aggregation_summary.get('aggregated_group_count')} | "
        f"prompt_chars={len(prompt)}"
    )

    gemini_model = _setting("GEMINI_MODEL", "gemini-3.5-flash") or "gemini-3.5-flash"
    groq_model = _setting("GROQ_MODEL", "qwen/qwen3.6-27b") or "qwen/qwen3.6-27b"

    primary_error = None

    try:
        advisory = _call_gemini(prompt)
        return {
            "provider": "gemini_vertex",
            "model": gemini_model,
            "fallback_used": False,
            "execution": {
                "primary_provider": "gemini_vertex",
                "provider_used": "gemini_vertex",
                "model_used": gemini_model,
                "fallback_used": False,
                "fallback_provider": "groq",
                "primary_error": None,
            },
            "version": AI_ADVISORY_VERSION,
            "spatial_summary": spatial_summary,
            "event_aggregation_summary": event_aggregation_summary,
            "overall_advisory": advisory,
        }
    except Exception as exc:
        primary_error = f"{type(exc).__name__}: {exc}"
        print(
            "GEMINI ADVISORY FALLBACK | "
            f"error={primary_error[:700]}"
        )

    try:
        advisory = _call_groq(prompt)
        return {
            "provider": "groq",
            "model": groq_model,
            "fallback_used": True,
            "execution": {
                "primary_provider": "gemini_vertex",
                "provider_used": "groq",
                "model_used": groq_model,
                "fallback_used": True,
                "fallback_provider": "groq",
                "primary_error": primary_error,
            },
            "version": AI_ADVISORY_VERSION,
            "spatial_summary": spatial_summary,
            "event_aggregation_summary": event_aggregation_summary,
            "overall_advisory": advisory,
        }
    except Exception as fallback_exc:
        raise RuntimeError(
            "Both AI providers failed. "
            f"Gemini: {primary_error}. "
            f"Groq/Qwen: {type(fallback_exc).__name__}: {fallback_exc}"
        ) from fallback_exc