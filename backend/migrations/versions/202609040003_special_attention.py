"""special attention state

Revision ID: 202609040003
Revises: 202609040002
Create Date: 2026-09-04 03:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "202609040003"
down_revision = "202609040002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("word_progress") as batch_op:
        batch_op.add_column(
            sa.Column("needs_special_attention", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.create_index("ix_word_progress_needs_special_attention", ["needs_special_attention"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("word_progress") as batch_op:
        batch_op.drop_index("ix_word_progress_needs_special_attention")
        batch_op.drop_column("needs_special_attention")
