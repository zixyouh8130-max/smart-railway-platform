"""Railway inspection AI review generation for the Admin API.

The whole-inspection maintenance advisory is text/data based. Images are used
ONLY for two narrow supplementary checks that mirror the Colab workflow:

1. ``Rail Break`` -> apparent visual severity (limited/moderate/severe), stored
   only when the model can make a HIGH-confidence visual assessment.
2. ``Missing Fishplate Bolt`` -> whether a remaining fishplate nut is clearly
   backed-off/displaced/separated in a way visually consistent with looseness.
   Image analysis never claims a torque value or true mechanical tightness.

The detector result is accepted as input. The vision model must not verify or
reject the YOLO/RF-DETR class. All other defect classes remain text-only.
"""

from __future__ import annotations

from collections import Counter
import base64
from functools import lru_cache
import json
import os
from typing import Any, Dict, List, Optional

from ..core.config import settings


AI_ADVISORY_VERSION = "railway_advisory_v6_targeted_vision_event_aggregator"
AI_CLUSTER_GAP_M = 3.0
AI_CLUSTER_MIN_EVENTS = 2
AI_EVENT_AGGREGATION_GAP_M = 1.5


# ONLY these detector classes are allowed to send images to an LLM.
AI_SPECIAL_VISION_CLASSES = {
    "Missing Fishplate Bolt",
    "Rail Break",
}
AI_REQUIRED_VISUAL_CONFIDENCE = "high"

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

FISHPLATE_VISUAL_JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "loose_nut_visible": {
            "type": "boolean",
            "description": (
                "True only when a remaining fishplate nut is clearly visibly "
                "backed-off, displaced, or separated."
            ),
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
        },
        "finding": {
            "type": "string",
            "description": (
                "Short Myanmar Unicode visual observation. Empty when no clear "
                "positive visual finding is supported."
            ),
        },
    },
    "required": ["loose_nut_visible", "confidence", "finding"],
    "additionalProperties": False,
}

RAIL_BREAK_VISUAL_JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "severity_supported": {
            "type": "boolean",
            "description": (
                "True only when the images clearly support an apparent visual "
                "severity assessment."
            ),
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
        },
        "visual_severity": {
            "anyOf": [
                {
                    "type": "string",
                    "enum": ["limited", "moderate", "severe"],
                },
                {"type": "null"},
            ],
        },
        "finding": {
            "type": "string",
            "description": (
                "Short Myanmar Unicode visual description. Empty when a reliable "
                "severity assessment cannot be made."
            ),
        },
    },
    "required": [
        "severity_supported",
        "confidence",
        "visual_severity",
        "finding",
    ],
    "additionalProperties": False,
}

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


def _targeted_visual_schema(defect_type: str) -> Dict[str, Any]:
    if defect_type == "Missing Fishplate Bolt":
        return FISHPLATE_VISUAL_JSON_SCHEMA
    if defect_type == "Rail Break":
        return RAIL_BREAK_VISUAL_JSON_SCHEMA
    raise ValueError(
        f"No targeted visual JSON schema for defect class: {defect_type!r}"
    )


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


def _supplementary_findings(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reuse ONLY positive visual findings already saved by Colab/Gradio.

    When event aggregation is enabled, one representative review may cover a
    nearby same-class group. We therefore deduplicate by group_id (preferred)
    or by event id.
    """
    findings: List[Dict[str, Any]] = []
    seen_sources = set()

    for event in events:
        review = event.get("supplementary_visual_review") or {}
        if review.get("performed") is not True:
            continue

        group_id = review.get("group_id") or (event.get("supplementary_visual_group") or {}).get("group_id")
        source_key = group_id or str(event.get("id") or event.get("_id") or "")
        if source_key in seen_sources:
            continue
        seen_sources.add(source_key)

        gps = event.get("gps") or {}
        distance = (
            gps.get("distance_from_start_m")
            if gps.get("distance_from_start_m") is not None
            else event.get("distance_from_route_start_m")
        )

        for finding in review.get("findings") or []:
            if not finding:
                continue
            findings.append(
                {
                    "rail_side": event.get("rail_side"),
                    "route_distance_m": distance,
                    "related_defect": event.get("defect_type"),
                    "finding": finding,
                }
            )

        severity = review.get("rail_break_visual_severity")
        if severity:
            findings.append(
                {
                    "rail_side": event.get("rail_side"),
                    "route_distance_m": distance,
                    "related_defect": "Rail Break",
                    "rail_break_visual_severity": severity,
                }
            )

    return findings


def build_advisory_prompt(
    inspection: Dict[str, Any],
    events: List[Dict[str, Any]],
    spatial_summary: Dict[str, Any],
) -> str:
    route = inspection.get("route") or {}

    event_data = []
    for event in events:
        if not event.get("defect_type"):
            continue
        gps = event.get("gps") or {}
        event_data.append(
            {
                "rail_side": event.get("rail_side"),
                "defect_type": event.get("defect_type"),
                "confidence": event.get("confidence"),
                "route_distance_m": (
                    gps.get("distance_from_start_m")
                    if gps.get("distance_from_start_m") is not None
                    else event.get("distance_from_route_start_m")
                ),
            }
        )

    compact_clusters = [
        {
            "rail_side": cluster.get("rail_side"),
            "start_distance_m": cluster.get("start_distance_m"),
            "end_distance_m": cluster.get("end_distance_m"),
            "span_m": cluster.get("span_m"),
            "event_count": cluster.get("event_count"),
            "defect_counts": cluster.get("defect_counts") or {},
        }
        for cluster in spatial_summary.get("clusters") or []
    ]

    event_aggregation = build_event_aggregation_summary(events)
    compact_issue_groups = [
        {
            "group_id": group.get("group_id"),
            "rail_side": group.get("rail_side"),
            "defect_type": group.get("defect_type"),
            "start_distance_m": group.get("start_distance_m"),
            "end_distance_m": group.get("end_distance_m"),
            "span_m": group.get("span_m"),
            "member_event_count": group.get("member_event_count"),
        }
        for group in event_aggregation.get("groups") or []
    ]

    factual_input = {
        "inspection_model": inspection.get("model") or {},
        "route_distance_m": route.get("distance_m"),
        "raw_total_defect_events": len(event_data),
        "raw_class_counts": spatial_summary.get("class_counts") or {},
        "aggregated_issue_group_count": event_aggregation.get("aggregated_group_count"),
        "aggregated_grouped_class_counts": event_aggregation.get("grouped_class_counts") or {},
        "aggregation_gap_m": event_aggregation.get("group_gap_m"),
        "aggregation_reduction_event_count": event_aggregation.get("reduction_event_count"),
        "rail_counts": spatial_summary.get("rail_counts") or {},
        "events_per_10m": spatial_summary.get("events_per_10m"),
        "localized_defect_concentrations": compact_clusters,
        "aggregated_issue_groups": compact_issue_groups,
        "defect_events": event_data,
        "supplementary_visual_findings": _supplementary_findings(events),
    }

    return f"""
You are an AI railway maintenance advisory assistant.

{MYANMAR_OUTPUT_RULES}

You are NOT performing object detection.

The defect events below were already produced by the railway inspection system.
Treat those events as the inspection data to be analyzed.

Your job is to analyze the RESULTED DATA like a railway maintenance advisor.

Focus on:
1. defect quantity,
2. defect type,
3. spatial concentration,
4. whether defects are isolated or grouped,
5. whether the same type repeats within a short track section,
6. relationships between nearby defect types,
7. railway-maintenance significance,
8. which locations deserve greater maintenance attention,
9. recommended field inspection and maintenance checks,
10. possible contributing causes ONLY when they provide useful engineering context,
11. treat aggregated_issue_groups as the better approximation of likely physical issue groups than raw event count alone.

PRIORITY LEVELS:

routine
    No unusual concentration or immediate pattern requiring priority above
    normal maintenance inspection.

monitor
    Worth monitoring or checking during planned inspection.

priority_inspection
    The pattern or defect type warrants prioritized field inspection and
    maintenance assessment.

urgent_manual_review
    The detected defect type/pattern may have significant implications and
    warrants prompt qualified-person review. This is NOT permission to declare
    the railway unsafe or impose an operating restriction.

IMPORTANT RULES:

- Do not discuss whether the detector's detections are true or false.
- Do not perform visual verification.
- Do not expose chain-of-thought or reasoning steps.
- Do not call a location historically "defect-prone" from only one inspection.
- For one inspection, use terms such as "localized defect concentration",
  "area of elevated defect occurrence", or "section requiring attention".
- Do not invent official numerical defect thresholds.
- Do not invent speed restrictions.
- Do not certify the track as safe or unsafe.
- Do not invent measurements.
- Final action must be confirmed against the railway operator's applicable
  maintenance standard and qualified field inspection.

SUPPLEMENTARY VISUAL FINDINGS:

- These are optional observations that may already have been saved by the
  inspection-stage workflow.
- Only mention a supplementary finding when it is explicitly present in
  supplementary_visual_findings.
- If supplementary_visual_findings is empty, NEVER mention supplementary visual
  inspection, loose nuts, visual severity, missing image evidence, or absence
  of findings.
- If a Rail Break visual severity is supplied, describe it as an apparent visual
  assessment, not a structural measurement.

OUTPUT DISCIPLINE:

- Avoid words such as "critical", "structural failure", "unsafe" or
  "compromised structural integrity" unless an applicable supplied maintenance
  standard explicitly supports that conclusion.
- Prefer wording such as "may affect", "may reduce intended restraint",
  "warrants inspection", "requires field verification", and
  "priority maintenance attention".
- Recommend restoring/replacing confirmed missing components according to the
  applicable railway maintenance procedure.
- For fasteners, recommend checking presence, seating, tightness and physical
  condition. Do not assume a specific torque requirement.
- When discussing spatial concentrations, use ONLY the exact ranges supplied in
  localized_defect_concentrations. Do not invent or merge ranges.
- Possible causes must always be described as possible contributing factors,
  never as diagnosed causes.
- Do not attribute a defect to poor maintenance, neglect, incorrect installation
  or a specific environmental cause unless supporting evidence is supplied.

AGGREGATION NOTE:

- raw_total_defect_events is the raw detector event count.
- aggregated_issue_group_count and aggregated_issue_groups are the heuristic event-aggregator output and are a better approximation of likely distinct physical issue locations.
- Do not simply equate every raw detector event with a distinct physical defect.
- Use aggregated_issue_groups when judging whether issues are isolated or repeated in a short section.

INSPECTION DATA:

{json.dumps(factual_input, ensure_ascii=False, separators=(",", ":"))}

Return VALID JSON only.

Use exactly this general structure:

{{
  "overall_priority": "routine | monitor | priority_inspection | urgent_manual_review",
  "executive_summary": "မြန်မာဘာသာဖြင့် ရေးထားသော တိုတောင်းသည့် ပြုပြင်ထိန်းသိမ်းရေး အနှစ်ချုပ်",
  "key_findings": ["မြန်မာဘာသာဖြင့် ရေးထားသော အရေးကြီး တွေ့ရှိချက်"],
  "areas_of_attention": [
    {{
      "rail_side": "left or right",
      "start_distance_m": 0,
      "end_distance_m": 0,
      "event_count": 0,
      "defect_counts": {{}},
      "priority": "routine | monitor | priority_inspection | urgent_manual_review",
      "assessment": "မြန်မာဘာသာဖြင့် ဤနေရာကို အဆိုပါ ဦးစားပေးအဆင့်ဖြင့် စစ်ဆေးသင့်သည့် အကြောင်းရင်း",
      "recommended_checks": ["မြန်မာဘာသာဖြင့် သီးသန့် ပြုပြင်ထိန်းသိမ်းရေး စစ်ဆေးချက်"]
    }}
  ],
  "individual_high_priority_events": [
    {{
      "rail_side": "left or right",
      "route_distance_m": 0,
      "defect_type": "",
      "priority": "priority_inspection | urgent_manual_review",
      "assessment": "",
      "recommended_checks": []
    }}
  ],
  "defect_type_assessments": [
    {{
      "defect_type": "",
      "event_count": 0,
      "maintenance_significance": "",
      "recommended_response": ""
    }}
  ],
  "possible_contributing_factors": [
    {{
      "defect_type": "",
      "factors": ["မြန်မာဘာသာဖြင့် ဖြစ်နိုင်ခြေရှိသော အထောက်အကူပြု အကြောင်းအရင်း"],
      "context": "မြန်မာဘာသာဖြင့် ဤအကြောင်းအရင်းများ ဆက်စပ်နိုင်ပုံ"
    }}
  ],
  "recommended_actions": ["မြန်မာဘာသာဖြင့် စစ်ဆေးရေး သို့မဟုတ် ပြုပြင်ထိန်းသိမ်းရေး လုပ်ဆောင်ချက်"],
  "trend_assessment": "မြန်မာဘာသာဖြင့် ဤစစ်ဆေးမှုမှ သတ်မှတ်နိုင်သည့်အရာနှင့် မသတ်မှတ်နိုင်သည့်အရာကို ရှင်းပြချက်",
  "limitations": ["မြန်မာဘာသာဖြင့် အရေးကြီး ကန့်သတ်ချက်"]
}}
"""



def _special_event_metadata(event: Dict[str, Any]) -> Dict[str, Any]:
    gps = event.get("gps") or {}
    return {
        "event_id": str(event.get("id") or event.get("_id") or ""),
        "rail_side": event.get("rail_side"),
        "defect_type": event.get("defect_type"),
        "detector_confidence": event.get("confidence"),
        "route_distance_m": (
            gps.get("distance_from_start_m")
            if gps.get("distance_from_start_m") is not None
            else event.get("distance_from_route_start_m")
        ),
        "representative_frame": event.get("representative_frame"),
        "representative_timestamp": event.get("representative_timestamp"),
    }


def build_targeted_visual_prompt(event: Dict[str, Any]) -> str:
    """Build the narrow image-inspection prompt for one eligible event."""
    defect_type = event.get("defect_type")
    metadata = _special_event_metadata(event)

    if defect_type == "Missing Fishplate Bolt":
        return f"""
You are performing a very narrow supplementary visual check for a railway
inspection system.

{MYANMAR_OUTPUT_RULES}

The railway detector has already recorded this event:

{json.dumps(metadata, ensure_ascii=False, indent=2)}

DO NOT verify or reject the detector's Missing Fishplate Bolt classification.

Your ONLY task is to inspect the supplied context image and close-up crop for
an ADDITIONAL visible issue on the fishplate/joint:

Check whether any REMAINING fishplate nut appears clearly:
- backed away from its normal seated position,
- visibly displaced,
- visibly separated from the fishplate/joint bar,
- or otherwise visually consistent with a loose/backed-off nut.

IMPORTANT:
- You cannot determine tightening torque from an image.
- You cannot prove mechanical tightness from an image.
- Rust, dirt, shadows, blur, perspective, or discoloration alone are NOT
  evidence that a nut is loose.
- Do not infer looseness when the nut position is unclear.
- Only set loose_nut_visible=true when the visual evidence is clear.
- If uncertain, set loose_nut_visible=false.
- Do not discuss whether the detector was correct.
- Human-readable finding text must be Myanmar Unicode.
- Return JSON only.

Return exactly this shape:
{{
  "loose_nut_visible": true,
  "confidence": "high | medium | low",
  "finding": "မြန်မာဘာသာဖြင့် ရေးထားသော တိုတောင်းပြီး အချက်အလက်အခြေပြု မြင်ကွင်းဆိုင်ရာ မှတ်ချက်"
}}

When a loose/backed-off nut is NOT clearly visible, return:
{{
  "loose_nut_visible": false,
  "confidence": "low",
  "finding": ""
}}
"""

    if defect_type == "Rail Break":
        return f"""
You are performing a narrow supplementary visual assessment for a railway
inspection system.

{MYANMAR_OUTPUT_RULES}

The railway detector has already recorded this event:

{json.dumps(metadata, ensure_ascii=False, indent=2)}

DO NOT verify or reject the detector's Rail Break classification.

Your ONLY task is to determine whether the supplied images clearly support a
visual description of the APPARENT EXTENT of the detected rail break.

Possible visual severity levels:
- limited
- moderate
- severe

Use "severe" only when there is clearly extensive visible discontinuity,
separation, displacement, or major visible loss of rail continuity.

IMPORTANT:
- This is visual severity only, not a structural measurement.
- Do not determine whether trains may safely operate.
- Do not infer crack depth or internal fracture extent.
- Do not estimate dimensions that are not measurable from the image.
- Do not invent speed restrictions.
- If image quality, angle, obstruction, or ambiguity prevents a reliable
  assessment, do not provide severity.
- Severity is stored only when confidence is HIGH.
- Human-readable finding text must be Myanmar Unicode.
- Return JSON only.

Return exactly this shape:
{{
  "severity_supported": true,
  "confidence": "high | medium | low",
  "visual_severity": "limited | moderate | severe",
  "finding": "မြန်မာဘာသာဖြင့် ရေးထားသော မြင်တွေ့ရသည့် အတိုင်းအတာဆိုင်ရာ တိုတောင်းပြီး အချက်အလက်အခြေပြု ဖော်ပြချက်"
}}

If a reliable severity assessment cannot be made, return:
{{
  "severity_supported": false,
  "confidence": "low",
  "visual_severity": null,
  "finding": ""
}}
"""

    raise ValueError(f"Unsupported targeted-vision defect class: {defect_type!r}")


def _validate_targeted_visual_payload(
    event: Dict[str, Any],
    payload: Any,
    *,
    provider: str,
    model: str,
    fallback_used: bool,
    primary_error: Optional[str] = None,
) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Targeted visual result must be a JSON object.")

    defect_type = event.get("defect_type")
    confidence = str(payload.get("confidence") or "low").strip().lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"

    base = {
        "review_version": AI_ADVISORY_VERSION,
        "provider": provider,
        "model": model,
        "fallback_used": fallback_used,
        "performed": True,
        "execution": {
            "primary_provider": "gemini_vertex",
            "provider_used": provider,
            "model_used": model,
            "fallback_used": fallback_used,
            "fallback_provider": "groq",
            "primary_error": primary_error,
        },
    }

    if defect_type == "Missing Fishplate Bolt":
        loose_visible = payload.get("loose_nut_visible") is True
        finding = str(payload.get("finding") or "").strip()
        findings: List[Dict[str, Any]] = []

        # Match the Colab workflow: only a HIGH-confidence positive observation
        # becomes a supplementary maintenance finding.
        if loose_visible and confidence == AI_REQUIRED_VISUAL_CONFIDENCE and finding:
            findings.append(
                {
                    "type": "visibly_loose_or_backed_off_fishplate_nut",
                    "confidence": "high",
                    "description": finding,
                    "important_note": (
                        "This is a visual observation only. Nut torque and true "
                        "mechanical tightness cannot be determined from imagery."
                    ),
                }
            )

        return {
            **base,
            "scope": "fishplate_nut_visual_check",
            "visual_result": {
                "loose_nut_visible": loose_visible,
                "confidence": confidence,
            },
            "findings": findings,
        }

    if defect_type == "Rail Break":
        supported = payload.get("severity_supported") is True
        severity_level = payload.get("visual_severity")
        finding = str(payload.get("finding") or "").strip()
        severity = None

        if (
            supported
            and confidence == AI_REQUIRED_VISUAL_CONFIDENCE
            and severity_level in {"limited", "moderate", "severe"}
            and finding
        ):
            severity = {
                "level": severity_level,
                "confidence": "high",
                "description": finding,
                "important_note": (
                    "This is an apparent visual-severity assessment, not a "
                    "structural measurement."
                ),
            }

        return {
            **base,
            "scope": "rail_break_visual_severity",
            "visual_result": {
                "severity_supported": supported,
                "confidence": confidence,
                "visual_severity": severity_level,
            },
            "rail_break_visual_severity": severity,
        }

    raise ValueError(f"Unsupported targeted-vision defect class: {defect_type!r}")


def _gemini_visual_call(
    prompt: str,
    context_image: Dict[str, Any],
    crop_image: Dict[str, Any],
    defect_type: str,
) -> Dict[str, Any]:
    from google.genai import types as genai_types

    model = _setting("GEMINI_MODEL", "gemini-3.5-flash") or "gemini-3.5-flash"

    contents = [
        prompt,
        genai_types.Part.from_bytes(
            data=context_image["data"],
            mime_type=context_image.get("mime_type") or "image/jpeg",
        ),
        genai_types.Part.from_bytes(
            data=crop_image["data"],
            mime_type=crop_image.get("mime_type") or "image/jpeg",
        ),
    ]

    return _gemini_generate_structured_json(
        model=model,
        contents=contents,
        response_json_schema=_targeted_visual_schema(defect_type),
        temperature=0.0,
        max_output_tokens=1200,
        label=f"targeted-vision/{defect_type}",
    )


def _to_data_uri(image: Dict[str, Any]) -> str:
    mime_type = image.get("mime_type") or "image/jpeg"
    encoded = base64.b64encode(image["data"]).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _groq_visual_call(
    prompt: str,
    context_image: Dict[str, Any],
    crop_image: Dict[str, Any],
) -> Dict[str, Any]:
    model = _setting("GROQ_MODEL", "qwen/qwen3.6-27b") or "qwen/qwen3.6-27b"

    response = _groq_client().chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": _to_data_uri(context_image)},
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": _to_data_uri(crop_image)},
                    },
                ],
            }
        ],
        response_format={"type": "json_object"},
        reasoning_effort="none",
        temperature=0.1,
        max_completion_tokens=500,
    )

    content = response.choices[0].message.content or ""
    if not content.strip():
        raise RuntimeError("Groq/Qwen returned an empty targeted-vision response.")
    return json.loads(content)


def generate_targeted_visual_review(
    event: Dict[str, Any],
    context_image: Dict[str, Any],
    crop_image: Dict[str, Any],
) -> Dict[str, Any]:
    """Run the narrow Gemini -> Qwen visual check for ONE eligible event."""
    defect_type = event.get("defect_type")
    if defect_type not in AI_SPECIAL_VISION_CLASSES:
        raise ValueError(f"Images are not allowed for defect class: {defect_type!r}")

    if not context_image.get("data") or not crop_image.get("data"):
        raise ValueError("Both context and crop evidence images are required.")

    prompt = build_targeted_visual_prompt(event)
    gemini_model = _setting("GEMINI_MODEL", "gemini-3.5-flash") or "gemini-3.5-flash"
    groq_model = _setting("GROQ_MODEL", "qwen/qwen3.6-27b") or "qwen/qwen3.6-27b"

    primary_error = None
    try:
        payload = _gemini_visual_call(prompt, context_image, crop_image, defect_type)
        return _validate_targeted_visual_payload(
            event,
            payload,
            provider="gemini_vertex",
            model=gemini_model,
            fallback_used=False,
        )
    except Exception as exc:
        primary_error = f"{type(exc).__name__}: {exc}"
        print(
            "GEMINI TARGETED VISION FALLBACK | "
            f"class={defect_type} | "
            f"error={primary_error[:700]}"
        )

    try:
        payload = _groq_visual_call(prompt, context_image, crop_image)
        return _validate_targeted_visual_payload(
            event,
            payload,
            provider="groq",
            model=groq_model,
            fallback_used=True,
            primary_error=primary_error,
        )
    except Exception as fallback_exc:
        raise RuntimeError(
            "Both targeted-vision providers failed. "
            f"Gemini: {primary_error}. "
            f"Groq/Qwen: {type(fallback_exc).__name__}: {fallback_exc}"
        ) from fallback_exc

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
        max_output_tokens=4096,
        label="maintenance-advisory",
    )

    return _validate_advisory(payload)


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
        max_completion_tokens=1800,
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
    prompt = build_advisory_prompt(inspection, events, spatial_summary)

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
            "event_aggregation_summary": build_event_aggregation_summary(events),
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
            "event_aggregation_summary": build_event_aggregation_summary(events),
            "overall_advisory": advisory,
        }
    except Exception as fallback_exc:
        raise RuntimeError(
            "Both AI providers failed. "
            f"Gemini: {primary_error}. "
            f"Groq/Qwen: {type(fallback_exc).__name__}: {fallback_exc}"
        ) from fallback_exc
