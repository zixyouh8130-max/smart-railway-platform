# backend/alembic/versions/a5b90a6b45cf_8aug12_03am.py

"""8Aug12:03am

Revision ID: a5b90a6b45cf
Revises: 1e004a258735
Create Date: 2026-08-08 00:03:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5b90a6b45cf'
down_revision: Union[str, None] = '1e004a258735'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add updated_at as nullable first
    op.add_column('chat_messages', sa.Column('updated_at', sa.DateTime(), nullable=True))
    
    # Populate existing rows with created_at value
    op.execute("UPDATE chat_messages SET updated_at = created_at WHERE updated_at IS NULL")
    
    # Now make it NOT NULL
    op.alter_column('chat_messages', 'updated_at', nullable=False)


def downgrade() -> None:
    op.drop_column('chat_messages', 'updated_at')