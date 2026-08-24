"""24Aug1242pm

Revision ID: 9b8c56209015
Revises: e51dd39c0799
Create Date: 2026-08-24 12:43:32.269655

Convert railway route/fare/speed units from kilometers to miles.

Canonical units after upgrade:
- routes.distance -> miles
- route_stations.distance_from_origin -> miles
- station_fee_rules.calculated_distance -> miles
- station_fee_rules.per_mile_rate -> MMK per mile
- trains.speed -> mph
- location_history.speed -> mph
- train_rider_devices.current_speed -> mph
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "9b8c56209015"
down_revision: Union[str, Sequence[str], None] = "e51dd39c0799"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MILES_PER_KM = 0.621371192237334
KM_PER_MILE = 1.609344


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return any(
        column["name"] == column_name
        for column in inspector.get_columns(table_name)
    )


def upgrade() -> None:
    """Convert existing km/kmh based data to miles/mph."""

    # Route distances: km -> miles
    op.execute(
        sa.text(
            """
            UPDATE routes
            SET distance = distance * :factor
            WHERE distance IS NOT NULL
            """
        ).bindparams(factor=MILES_PER_KM)
    )

    op.alter_column(
        "routes",
        "distance",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment="Route distance in miles",
        existing_nullable=True,
    )

    op.execute(
        sa.text(
            """
            UPDATE route_stations
            SET distance_from_origin = distance_from_origin * :factor
            WHERE distance_from_origin IS NOT NULL
            """
        ).bindparams(factor=MILES_PER_KM)
    )

    op.alter_column(
        "route_stations",
        "distance_from_origin",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment="Distance in miles from route origin",
        existing_nullable=True,
    )

    # Fare configuration:
    # rename the old column instead of adding a new NOT NULL column.
    if (
        _has_column("station_fee_rules", "per_km_rate")
        and not _has_column("station_fee_rules", "per_mile_rate")
    ):
        op.alter_column(
            "station_fee_rules",
            "per_km_rate",
            new_column_name="per_mile_rate",
            existing_type=sa.DOUBLE_PRECISION(precision=53),
            existing_nullable=False,
        )

    # MMK/km -> MMK/mile
    op.execute(
        sa.text(
            """
            UPDATE station_fee_rules
            SET per_mile_rate = COALESCE(per_mile_rate, 0) * :factor
            """
        ).bindparams(factor=KM_PER_MILE)
    )

    op.alter_column(
        "station_fee_rules",
        "per_mile_rate",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment="Additional fare amount per mile",
        existing_nullable=False,
    )

    op.execute(
        sa.text(
            """
            UPDATE station_fee_rules
            SET calculated_distance = calculated_distance * :factor
            WHERE calculated_distance IS NOT NULL
            """
        ).bindparams(factor=MILES_PER_KM)
    )

    op.alter_column(
        "station_fee_rules",
        "calculated_distance",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment="Calculated route distance in miles",
        existing_nullable=True,
    )

    # Configured train speed: km/h -> mph
    op.execute(
        sa.text(
            """
            UPDATE trains
            SET speed = speed * :factor
            WHERE speed IS NOT NULL
            """
        ).bindparams(factor=MILES_PER_KM)
    )

    op.alter_column(
        "trains",
        "speed",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment="Configured train speed in miles per hour (mph)",
        existing_nullable=True,
    )

    # Historical/live speed: km/h -> mph
    op.execute(
        sa.text(
            """
            UPDATE location_history
            SET speed = speed * :factor
            WHERE speed IS NOT NULL
            """
        ).bindparams(factor=MILES_PER_KM)
    )

    op.alter_column(
        "location_history",
        "speed",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment="Speed in miles per hour (mph)",
        existing_nullable=True,
    )

    if _has_column("train_rider_devices", "current_speed"):
        op.execute(
            sa.text(
                """
                UPDATE train_rider_devices
                SET current_speed = current_speed * :factor
                WHERE current_speed IS NOT NULL
                """
            ).bindparams(factor=MILES_PER_KM)
        )

        op.alter_column(
            "train_rider_devices",
            "current_speed",
            existing_type=sa.DOUBLE_PRECISION(precision=53),
            comment="Current speed in miles per hour (mph)",
            existing_nullable=True,
        )


def downgrade() -> None:
    """Convert miles/mph data back to km/kmh."""

    if _has_column("train_rider_devices", "current_speed"):
        op.execute(
            sa.text(
                """
                UPDATE train_rider_devices
                SET current_speed = current_speed * :factor
                WHERE current_speed IS NOT NULL
                """
            ).bindparams(factor=KM_PER_MILE)
        )

        op.alter_column(
            "train_rider_devices",
            "current_speed",
            existing_type=sa.DOUBLE_PRECISION(precision=53),
            comment=None,
            existing_comment="Current speed in miles per hour (mph)",
            existing_nullable=True,
        )

    op.execute(
        sa.text(
            """
            UPDATE location_history
            SET speed = speed * :factor
            WHERE speed IS NOT NULL
            """
        ).bindparams(factor=KM_PER_MILE)
    )

    op.alter_column(
        "location_history",
        "speed",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment=None,
        existing_comment="Speed in miles per hour (mph)",
        existing_nullable=True,
    )

    op.execute(
        sa.text(
            """
            UPDATE trains
            SET speed = speed * :factor
            WHERE speed IS NOT NULL
            """
        ).bindparams(factor=KM_PER_MILE)
    )

    op.alter_column(
        "trains",
        "speed",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment=None,
        existing_comment="Configured train speed in miles per hour (mph)",
        existing_nullable=True,
    )

    op.execute(
        sa.text(
            """
            UPDATE station_fee_rules
            SET calculated_distance = calculated_distance * :factor
            WHERE calculated_distance IS NOT NULL
            """
        ).bindparams(factor=KM_PER_MILE)
    )

    op.alter_column(
        "station_fee_rules",
        "calculated_distance",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment=None,
        existing_comment="Calculated route distance in miles",
        existing_nullable=True,
    )

    # MMK/mile -> MMK/km
    op.execute(
        sa.text(
            """
            UPDATE station_fee_rules
            SET per_mile_rate = COALESCE(per_mile_rate, 0) * :factor
            """
        ).bindparams(factor=MILES_PER_KM)
    )

    if (
        _has_column("station_fee_rules", "per_mile_rate")
        and not _has_column("station_fee_rules", "per_km_rate")
    ):
        op.alter_column(
            "station_fee_rules",
            "per_mile_rate",
            new_column_name="per_km_rate",
            existing_type=sa.DOUBLE_PRECISION(precision=53),
            existing_nullable=False,
        )

    op.execute(
        sa.text(
            """
            UPDATE route_stations
            SET distance_from_origin = distance_from_origin * :factor
            WHERE distance_from_origin IS NOT NULL
            """
        ).bindparams(factor=KM_PER_MILE)
    )

    op.alter_column(
        "route_stations",
        "distance_from_origin",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment=None,
        existing_comment="Distance in miles from route origin",
        existing_nullable=True,
    )

    op.execute(
        sa.text(
            """
            UPDATE routes
            SET distance = distance * :factor
            WHERE distance IS NOT NULL
            """
        ).bindparams(factor=KM_PER_MILE)
    )

    op.alter_column(
        "routes",
        "distance",
        existing_type=sa.DOUBLE_PRECISION(precision=53),
        comment=None,
        existing_comment="Route distance in miles",
        existing_nullable=True,
    )