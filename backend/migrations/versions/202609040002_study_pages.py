"""study pages and events

Revision ID: 202609040002
Revises: 202609040001
Create Date: 2026-09-04 00:10:00
"""

from alembic import op
import sqlalchemy as sa

revision = "202609040002"
down_revision = "202609040001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_pages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("page_size", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("page_type", sa.String(length=32), nullable=False),
        sa.Column("is_short", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_study_pages_status"), "study_pages", ["status"], unique=False)
    op.create_index(op.f("ix_study_pages_user_id"), "study_pages", ["user_id"], unique=False)

    op.create_table(
        "study_page_words",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("page_id", sa.Integer(), nullable=False),
        sa.Column("word_id", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("join_reason", sa.String(length=32), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["page_id"], ["study_pages.id"]),
        sa.ForeignKeyConstraint(["word_id"], ["words.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("page_id", "word_id", name="uq_study_page_words_page_word"),
    )
    op.create_index(op.f("ix_study_page_words_active"), "study_page_words", ["active"], unique=False)
    op.create_index(op.f("ix_study_page_words_page_id"), "study_page_words", ["page_id"], unique=False)
    op.create_index(op.f("ix_study_page_words_word_id"), "study_page_words", ["word_id"], unique=False)

    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("page_id", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("study_count_increment", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["page_id"], ["study_pages.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_study_sessions_completed_at"), "study_sessions", ["completed_at"], unique=False)
    op.create_index(op.f("ix_study_sessions_page_id"), "study_sessions", ["page_id"], unique=False)
    op.create_index(op.f("ix_study_sessions_user_id"), "study_sessions", ["user_id"], unique=False)

    op.create_table(
        "word_study_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("word_id", sa.Integer(), nullable=False),
        sa.Column("page_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delta", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["page_id"], ["study_pages.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["study_sessions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["word_id"], ["words.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_word_study_events_created_at"), "word_study_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_word_study_events_event_type"), "word_study_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_word_study_events_page_id"), "word_study_events", ["page_id"], unique=False)
    op.create_index(op.f("ix_word_study_events_session_id"), "word_study_events", ["session_id"], unique=False)
    op.create_index(op.f("ix_word_study_events_user_id"), "word_study_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_word_study_events_word_id"), "word_study_events", ["word_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_word_study_events_word_id"), table_name="word_study_events")
    op.drop_index(op.f("ix_word_study_events_user_id"), table_name="word_study_events")
    op.drop_index(op.f("ix_word_study_events_session_id"), table_name="word_study_events")
    op.drop_index(op.f("ix_word_study_events_page_id"), table_name="word_study_events")
    op.drop_index(op.f("ix_word_study_events_event_type"), table_name="word_study_events")
    op.drop_index(op.f("ix_word_study_events_created_at"), table_name="word_study_events")
    op.drop_table("word_study_events")
    op.drop_index(op.f("ix_study_sessions_user_id"), table_name="study_sessions")
    op.drop_index(op.f("ix_study_sessions_page_id"), table_name="study_sessions")
    op.drop_index(op.f("ix_study_sessions_completed_at"), table_name="study_sessions")
    op.drop_table("study_sessions")
    op.drop_index(op.f("ix_study_page_words_word_id"), table_name="study_page_words")
    op.drop_index(op.f("ix_study_page_words_page_id"), table_name="study_page_words")
    op.drop_index(op.f("ix_study_page_words_active"), table_name="study_page_words")
    op.drop_table("study_page_words")
    op.drop_index(op.f("ix_study_pages_user_id"), table_name="study_pages")
    op.drop_index(op.f("ix_study_pages_status"), table_name="study_pages")
    op.drop_table("study_pages")
