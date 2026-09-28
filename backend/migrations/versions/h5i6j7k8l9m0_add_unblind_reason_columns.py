"""add unblind_reason to randomization_records and audit_logs

Revision ID: h5i6j7k8l9m0
Revises: g4h5i6j7k8l9
Create Date: 2026-09-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h5i6j7k8l9m0"
down_revision: Union[str, Sequence[str], None] = "g4h5i6j7k8l9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "randomization_records",
        sa.Column("unblind_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("unblind_reason", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("audit_logs", "unblind_reason")
    op.drop_column("randomization_records", "unblind_reason")
