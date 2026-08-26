"""26Aug4_28pm

Revision ID: cc6f800a0e59
Revises: 4f7a2d91c6e8
Create Date: 2026-08-26 16:29:00.290530

Track Engineer field-verification workflow.

The raw Alembic autogenerate attempted to add field_verification_status as
NOT NULL immediately. That fails when track_issues already contains rows.

This migration:
1. adds the new status column temporarily nullable,
2. backfills existing issues to NOT_CHECKED,
3. enforces NOT NULL,
4. adds the remaining verification fields, indexes, and foreign key.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cc6f800a0e59"
down_revision: Union[str, Sequence[str], None] = "4f7a2d91c6e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FK_NAME = "fk_track_issues_field_verified_by_staff_id_staff"


def upgrade() -> None:
    """Add field-verification workflow safely for existing TrackIssue rows."""

    # Step 1: nullable first because track_issues already has data.
    op.add_column(
        "track_issues",
        sa.Column(
            "field_verification_status",
            sa.String(length=30),
            nullable=True,
        ),
    )

    # Step 2: every existing issue starts as not field-checked.
    op.execute(
        """
        UPDATE track_issues
        SET field_verification_status = 'NOT_CHECKED'
        WHERE field_verification_status IS NULL
        """
    )

    # Step 3: now it is safe to enforce the model's NOT NULL requirement.
    op.alter_column(
        "track_issues",
        "field_verification_status",
        existing_type=sa.String(length=30),
        nullable=False,
    )

    op.add_column(
        "track_issues",
        sa.Column(
            "field_verification_note",
            sa.Text(),
            nullable=True,
        ),
    )

    op.add_column(
        "track_issues",
        sa.Column(
            "field_verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "track_issues",
        sa.Column(
            "field_verified_by_staff_id",
            sa.UUID(),
            nullable=True,
        ),
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

    op.create_foreign_key(
        FK_NAME,
        "track_issues",
        "staff",
        ["field_verified_by_staff_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Remove field-verification workflow columns."""

    op.drop_constraint(
        FK_NAME,
        "track_issues",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_track_issues_field_verified_by_staff_id",
        table_name="track_issues",
    )

    op.drop_index(
        "ix_track_issues_field_verification_status",
        table_name="track_issues",
    )

    op.drop_column("track_issues", "field_verified_by_staff_id")
    op.drop_column("track_issues", "field_verified_at")
    op.drop_column("track_issues", "field_verification_note")
    op.drop_column("track_issues", "field_verification_status")
