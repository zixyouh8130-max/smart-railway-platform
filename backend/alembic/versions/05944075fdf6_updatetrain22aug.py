"""UpdateTrain22Aug

Revision ID: 05944075fdf6
Revises: 734c28accaa3
Create Date: 2026-08-22 21:47:07.375509
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "05944075fdf6"
down_revision: Union[str, Sequence[str], None] = "734c28accaa3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add timestamps to trains table."""

    op.add_column(
        "trains",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.add_column(
        "trains",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Remove timestamps from trains table."""

    op.drop_column(
        "trains",
        "updated_at",
    )

    op.drop_column(
        "trains",
        "created_at",
    )