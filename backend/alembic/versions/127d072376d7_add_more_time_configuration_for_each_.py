# alembic/versions/127d072376d7_add_more_time_configuration_for_each_.py
"""add more time configuration for each station (on arrival and departure)

Revision ID: 127d072376d7
Revises: 2f3749d863a0
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import Time, Integer, Boolean

# revision identifiers, used by Alembic.
revision = '127d072376d7'
down_revision = '2f3749d863a0'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add route schedule fields
    op.add_column('routes', sa.Column('start_time', Time, nullable=True))
    op.add_column('routes', sa.Column('frequency_minutes', Integer, nullable=True))
    
    # Add station schedule fields - with server_default for NOT NULL columns
    op.add_column('route_stations', sa.Column('expected_arrival_time', Time, nullable=True))
    op.add_column('route_stations', sa.Column('expected_departure_time', Time, nullable=True))
    op.add_column('route_stations', sa.Column('arrival_buffer_minutes', Integer, nullable=True, server_default='0'))
    op.add_column('route_stations', sa.Column('departure_buffer_minutes', Integer, nullable=True, server_default='0'))
    
    # For boolean columns with NOT NULL constraint, use server_default
    op.add_column('route_stations', sa.Column('is_timed_stop', Boolean, nullable=False, server_default='true'))
    
    op.add_column('route_stations', sa.Column('time_from_origin_minutes', Integer, nullable=True))


def downgrade() -> None:
    # Remove station schedule fields
    op.drop_column('route_stations', 'time_from_origin_minutes')
    op.drop_column('route_stations', 'is_timed_stop')
    op.drop_column('route_stations', 'departure_buffer_minutes')
    op.drop_column('route_stations', 'arrival_buffer_minutes')
    op.drop_column('route_stations', 'expected_departure_time')
    op.drop_column('route_stations', 'expected_arrival_time')
    
    # Remove route schedule fields
    op.drop_column('routes', 'frequency_minutes')
    op.drop_column('routes', 'start_time')