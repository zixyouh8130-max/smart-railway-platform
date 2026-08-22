"""
Update coach, seat, and train schema.

Revision ID: ed5829132bdb
Revises: ed0590f88a6b
Create Date: 2026-08-21 09:22:04.434012
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ed5829132bdb"
down_revision: Union[str, Sequence[str], None] = "ed0590f88a6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ============================================================
    # COACHES
    # ============================================================

    # Add is_active to coaches.
    # Existing rows receive TRUE.
    op.add_column(
        "coaches",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # Remove server default after existing rows have been populated.
    # The SQLAlchemy model provides the application-level default.
    op.alter_column(
        "coaches",
        "is_active",
        server_default=None,
    )

    # Increase coach name length from VARCHAR(50) to VARCHAR(100).
    op.alter_column(
        "coaches",
        "name",
        existing_type=sa.VARCHAR(length=50),
        type_=sa.String(length=100),
        existing_nullable=False,
    )

    # order_number must not be NULL.
    op.alter_column(
        "coaches",
        "order_number",
        existing_type=sa.INTEGER(),
        nullable=False,
    )

    # IMPORTANT:
    # coaches.train_id remains INTEGER.
    #
    # Existing FK:
    # coaches.train_id -> trains.id
    #
    # Do NOT convert it to UUID.

    # One coach order number per train.
    op.create_unique_constraint(
        "uq_train_coach_order",
        "coaches",
        ["train_id", "order_number"],
    )

    # ============================================================
    # SEATS
    # ============================================================

    # IMPORTANT:
    # seats.id remains INTEGER.
    # seats.coach_id remains INTEGER.
    #
    # Existing FK:
    # seats.coach_id -> coaches.id
    #
    # Do NOT convert either column to UUID.

    # Seat number must be unique within a coach.
    op.create_unique_constraint(
        "uq_coach_seat_number",
        "seats",
        ["coach_id", "seat_number"],
    )


def downgrade() -> None:
    """Downgrade schema."""

    # ============================================================
    # SEATS
    # ============================================================

    op.drop_constraint(
        "uq_coach_seat_number",
        "seats",
        type_="unique",
    )

    # ============================================================
    # COACHES
    # ============================================================

    op.drop_constraint(
        "uq_train_coach_order",
        "coaches",
        type_="unique",
    )

    op.alter_column(
        "coaches",
        "order_number",
        existing_type=sa.INTEGER(),
        nullable=True,
    )

    op.alter_column(
        "coaches",
        "name",
        existing_type=sa.String(length=100),
        type_=sa.VARCHAR(length=50),
        existing_nullable=False,
    )

    op.drop_column(
        "coaches",
        "is_active",
    )