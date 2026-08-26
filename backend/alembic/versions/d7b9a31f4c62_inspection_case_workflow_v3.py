"""reset Track Engineer workflow to inspection-case architecture

Revision ID: d7b9a31f4c62
Revises: cc6f800a0e59
Create Date: 2026-08-26 17:28:00

DESTRUCTIVE MIGRATION BY DESIGN

The current database is already at cc6f800a0e59. This new revision
intentionally deletes only the existing Track Engineer maintenance workflow
tables/data and recreates them using the Inspection Case architecture:

    track_inspection_cases
        -> track_issues (defect checklist items)
        -> track_case_activities

It does NOT delete MongoDB inspections/events, users, staff, routes, trains,
schedules, bookings, stations, coaches, or seats.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d7b9a31f4c62"
down_revision: Union[str, Sequence[str], None] = "cc6f800a0e59"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Destructively reset Track Engineer maintenance data and create the
    Inspection Case -> checklist-item workflow expected by the V3 backend.
    """

    # ------------------------------------------------------------
    # 1. Remove old Track Engineer workflow tables/data.
    # ------------------------------------------------------------
    # CASCADE is intentional here because the user explicitly chose to reset
    # existing Track Engineer maintenance data.
    op.execute("DROP TABLE IF EXISTS track_case_activities CASCADE")
    op.execute("DROP TABLE IF EXISTS track_issue_activities CASCADE")
    op.execute("DROP TABLE IF EXISTS track_issues CASCADE")
    op.execute("DROP TABLE IF EXISTS track_inspection_cases CASCADE")

    # ------------------------------------------------------------
    # 2. One maintenance case per MongoDB AI inspection.
    # ------------------------------------------------------------
    op.create_table(
        "track_inspection_cases",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("inspection_id", sa.String(length=64), nullable=False),
        sa.Column("run_id", sa.String(length=120), nullable=True),

        # Engineer assignment exists at CASE level only.
        sa.Column("assigned_staff_id", sa.UUID(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),

        sa.Column(
            "status",
            sa.String(length=30),
            server_default=sa.text("'OPEN'"),
            nullable=False,
        ),

        # Whole-inspection AI context is stored once on the parent case.
        sa.Column("ai_overall_priority", sa.String(length=60), nullable=True),
        sa.Column(
            "ai_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "media_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),

        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verifying_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("blocked_reason", sa.Text(), nullable=True),
        sa.Column("completion_summary", sa.Text(), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),

        sa.ForeignKeyConstraint(
            ["assigned_staff_id"],
            ["staff.id"],
            name="fk_track_inspection_cases_assigned_staff_id_staff",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_track_inspection_cases_created_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "inspection_id",
            name="uq_track_inspection_case_inspection",
        ),
    )

    op.create_index(
        "ix_track_inspection_cases_inspection_id",
        "track_inspection_cases",
        ["inspection_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_inspection_cases_run_id",
        "track_inspection_cases",
        ["run_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_inspection_cases_assigned_staff_id",
        "track_inspection_cases",
        ["assigned_staff_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_inspection_cases_status",
        "track_inspection_cases",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_track_inspection_cases_ai_overall_priority",
        "track_inspection_cases",
        ["ai_overall_priority"],
        unique=False,
    )
    op.create_index(
        "ix_track_inspection_cases_updated_at",
        "track_inspection_cases",
        ["updated_at"],
        unique=False,
    )

    # ------------------------------------------------------------
    # 3. Individual AI findings become checklist items under a case.
    # ------------------------------------------------------------
    op.create_table(
        "track_issues",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("case_id", sa.UUID(), nullable=False),
        sa.Column("inspection_event_id", sa.String(length=64), nullable=False),

        sa.Column("defect_type", sa.String(length=120), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("rail_side", sa.String(length=20), nullable=True),

        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column(
            "distance_from_start_miles",
            sa.Float(),
            nullable=True,
            comment="AI inspection distance from inspection origin in miles",
        ),

        # Event-specific AI context only.
        sa.Column("ai_priority", sa.String(length=60), nullable=True),
        sa.Column(
            "ai_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "media_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),

        # Human field verification.
        sa.Column(
            "field_verification_status",
            sa.String(length=30),
            server_default=sa.text("'NOT_CHECKED'"),
            nullable=False,
        ),
        sa.Column("field_verification_note", sa.Text(), nullable=True),
        sa.Column("field_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("field_verified_by_staff_id", sa.UUID(), nullable=True),

        # Maintenance result for this defect/checklist item.
        sa.Column(
            "maintenance_status",
            sa.String(length=30),
            server_default=sa.text("'PENDING'"),
            nullable=False,
        ),
        sa.Column("maintenance_note", sa.Text(), nullable=True),
        sa.Column("repair_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("repair_completed_at", sa.DateTime(timezone=True), nullable=True),

        # GPS evidence for this defect.
        sa.Column(
            "last_location_checked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "last_location_distance_miles",
            sa.Float(),
            nullable=True,
        ),
        sa.Column(
            "last_location_proximity",
            sa.String(length=30),
            nullable=True,
        ),
        sa.Column(
            "location_verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),

        sa.ForeignKeyConstraint(
            ["case_id"],
            ["track_inspection_cases.id"],
            name="fk_track_issues_case_id_track_inspection_cases",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["field_verified_by_staff_id"],
            ["staff.id"],
            name="fk_track_issues_field_verified_by_staff_id_staff",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "case_id",
            "inspection_event_id",
            name="uq_track_issue_case_event",
        ),
    )

    op.create_index(
        "ix_track_issues_case_id",
        "track_issues",
        ["case_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_issues_ai_priority",
        "track_issues",
        ["ai_priority"],
        unique=False,
    )
    op.create_index(
        "ix_track_issues_field_verification_status",
        "track_issues",
        ["field_verification_status"],
        unique=False,
    )
    op.create_index(
        "ix_track_issues_field_verified_by_staff_id",
        "track_issues",
        ["field_verified_by_staff_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_issues_maintenance_status",
        "track_issues",
        ["maintenance_status"],
        unique=False,
    )
    op.create_index(
        "ix_track_issues_updated_at",
        "track_issues",
        ["updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_track_issues_location",
        "track_issues",
        ["latitude", "longitude"],
        unique=False,
    )

    # ------------------------------------------------------------
    # 4. Shared case-level / issue-level conversation and audit trail.
    # ------------------------------------------------------------
    op.create_table(
        "track_case_activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("case_id", sa.UUID(), nullable=False),
        sa.Column("issue_id", sa.UUID(), nullable=True),

        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("actor_staff_id", sa.UUID(), nullable=True),

        sa.Column("activity_type", sa.String(length=50), nullable=False),
        sa.Column("message_kind", sa.String(length=30), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=True),

        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("distance_to_issue_miles", sa.Float(), nullable=True),
        sa.Column("proximity", sa.String(length=30), nullable=True),
        sa.Column(
            "extra_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),

        sa.Column("parent_activity_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),

        sa.ForeignKeyConstraint(
            ["case_id"],
            ["track_inspection_cases.id"],
            name="fk_track_case_activities_case_id_cases",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["track_issues.id"],
            name="fk_track_case_activities_issue_id_track_issues",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_track_case_activities_actor_user_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["actor_staff_id"],
            ["staff.id"],
            name="fk_track_case_activities_actor_staff_id_staff",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["parent_activity_id"],
            ["track_case_activities.id"],
            name="fk_track_case_activities_parent_activity_id_self",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_track_case_activities_case_id",
        "track_case_activities",
        ["case_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_case_activities_issue_id",
        "track_case_activities",
        ["issue_id"],
        unique=False,
    )
    op.create_index(
        "ix_track_case_activities_activity_type",
        "track_case_activities",
        ["activity_type"],
        unique=False,
    )
    op.create_index(
        "ix_track_case_activities_created_at",
        "track_case_activities",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    """
    Recreate the previous cc6f800a0e59 Track Engineer schema empty.

    Data deleted by upgrade cannot be restored, but the schema after
    downgrade matches the cc6 revision so Alembic history remains valid.
    """

    op.execute("DROP TABLE IF EXISTS track_case_activities CASCADE")
    op.execute("DROP TABLE IF EXISTS track_issues CASCADE")
    op.execute("DROP TABLE IF EXISTS track_inspection_cases CASCADE")

    op.create_table(
        "track_issues",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("inspection_id", sa.String(length=64), nullable=False),
        sa.Column("inspection_event_id", sa.String(length=64), nullable=False),
        sa.Column("run_id", sa.String(length=120), nullable=True),
        sa.Column("defect_type", sa.String(length=120), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("rail_side", sa.String(length=20), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("distance_from_start_miles", sa.Float(), nullable=True),
        sa.Column("ai_priority", sa.String(length=60), nullable=True),
        sa.Column("ai_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("media_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("assigned_staff_id", sa.UUID(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("last_location_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_location_distance_miles", sa.Float(), nullable=True),
        sa.Column("last_location_proximity", sa.String(length=30), nullable=True),
        sa.Column("location_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_summary", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("field_verification_status", sa.String(length=30), nullable=False),
        sa.Column("field_verification_note", sa.Text(), nullable=True),
        sa.Column("field_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("field_verified_by_staff_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["assigned_staff_id"], ["staff.id"],
            name="fk_track_issues_assigned_staff_id_staff_cc6",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"],
            name="fk_track_issues_created_by_user_id_users_cc6",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["field_verified_by_staff_id"], ["staff.id"],
            name="fk_track_issues_field_verified_by_staff_id_staff",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "inspection_id",
            "inspection_event_id",
            name="uq_track_issue_inspection_event",
        ),
    )

    op.create_index("ix_track_issues_ai_priority", "track_issues", ["ai_priority"], unique=False)
    op.create_index("ix_track_issues_assigned_staff_id", "track_issues", ["assigned_staff_id"], unique=False)
    op.create_index("ix_track_issues_inspection_id", "track_issues", ["inspection_id"], unique=False)
    op.create_index("ix_track_issues_location", "track_issues", ["latitude", "longitude"], unique=False)
    op.create_index("ix_track_issues_status", "track_issues", ["status"], unique=False)
    op.create_index("ix_track_issues_field_verification_status", "track_issues", ["field_verification_status"], unique=False)
    op.create_index("ix_track_issues_field_verified_by_staff_id", "track_issues", ["field_verified_by_staff_id"], unique=False)

    op.create_table(
        "track_issue_activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("issue_id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("actor_staff_id", sa.UUID(), nullable=True),
        sa.Column("activity_type", sa.String(length=40), nullable=False),
        sa.Column("message_kind", sa.String(length=30), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("distance_to_issue_miles", sa.Float(), nullable=True),
        sa.Column("proximity", sa.String(length=30), nullable=True),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("parent_activity_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_staff_id"], ["staff.id"],
            name="fk_track_issue_activities_actor_staff_id_staff_cc6",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.id"],
            name="fk_track_issue_activities_actor_user_id_users_cc6",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["issue_id"], ["track_issues.id"],
            name="fk_track_issue_activities_issue_id_track_issues_cc6",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_activity_id"], ["track_issue_activities.id"],
            name="fk_track_issue_activities_parent_activity_id_self_cc6",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_track_issue_activities_activity_type", "track_issue_activities", ["activity_type"], unique=False)
    op.create_index("ix_track_issue_activities_created_at", "track_issue_activities", ["created_at"], unique=False)
    op.create_index("ix_track_issue_activities_issue_id", "track_issue_activities", ["issue_id"], unique=False)
