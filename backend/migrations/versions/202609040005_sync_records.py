"""sync records

Revision ID: 202609040005
Revises: 202609040004
Create Date: 2026-09-04 05:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "202609040005"
down_revision = "202609040004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sync_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("device_id", sa.String(length=120), nullable=False),
        sa.Column("client_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("server_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=120), nullable=False),
        sa.Column("operation", sa.String(length=80), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("conflict", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "event_id", name="uq_sync_records_user_event"),
    )
    op.create_index(op.f("ix_sync_records_user_id"), "sync_records", ["user_id"], unique=False)
    op.create_index(op.f("ix_sync_records_device_id"), "sync_records", ["device_id"], unique=False)
    op.create_index(op.f("ix_sync_records_server_timestamp"), "sync_records", ["server_timestamp"], unique=False)
    op.create_index(op.f("ix_sync_records_entity_type"), "sync_records", ["entity_type"], unique=False)
    op.create_index(op.f("ix_sync_records_status"), "sync_records", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sync_records_status"), table_name="sync_records")
    op.drop_index(op.f("ix_sync_records_entity_type"), table_name="sync_records")
    op.drop_index(op.f("ix_sync_records_server_timestamp"), table_name="sync_records")
    op.drop_index(op.f("ix_sync_records_device_id"), table_name="sync_records")
    op.drop_index(op.f("ix_sync_records_user_id"), table_name="sync_records")
    op.drop_table("sync_records")
