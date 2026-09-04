"""user settings

Revision ID: 202609040004
Revises: 202609040003
Create Date: 2026-09-04 04:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "202609040004"
down_revision = "202609040003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("page_size", sa.Integer(), nullable=False),
        sa.Column("intervals", sa.JSON(), nullable=False),
        sa.Column("theme", sa.String(length=32), nullable=False),
        sa.Column("font_size", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
