"""update userrole enum to include SUPER_ADMIN

Revision ID: update_enum_001
Revises: previous_revision_id
Create Date: 2026-07-25 15:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'update_enum_001'
down_revision: Union[str, None] = 'your_previous_revision_id'  # Replace with your actual previous revision
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add SUPER_ADMIN to the enum
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'ADMIN'")


def downgrade() -> None:
    # Cannot remove enum values in PostgreSQL easily
    # This would require creating a new type and converting
    pass