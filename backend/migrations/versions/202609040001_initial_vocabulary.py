"""initial vocabulary schema

Revision ID: 202609040001
Revises:
Create Date: 2026-09-04 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "202609040001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)

    op.create_table(
        "vocabularies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_words", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vocabularies_name"), "vocabularies", ["name"], unique=False)
    op.create_index(op.f("ix_vocabularies_user_id"), "vocabularies", ["user_id"], unique=False)

    op.create_table(
        "words",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vocabulary_id", sa.Integer(), nullable=False),
        sa.Column("original_number", sa.String(length=80), nullable=True),
        sa.Column("word", sa.String(length=255), nullable=False),
        sa.Column("normalized_word", sa.String(length=255), nullable=False),
        sa.Column("meaning", sa.Text(), nullable=False),
        sa.Column("source_page", sa.String(length=80), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["vocabulary_id"], ["vocabularies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vocabulary_id", "normalized_word", name="uq_words_vocabulary_normalized"),
    )
    op.create_index(op.f("ix_words_normalized_word"), "words", ["normalized_word"], unique=False)
    op.create_index(op.f("ix_words_vocabulary_id"), "words", ["vocabulary_id"], unique=False)

    op.create_table(
        "word_progress",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("word_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("study_count", sa.Integer(), nullable=False),
        sa.Column("forget_count", sa.Integer(), nullable=False),
        sa.Column("has_forgotten", sa.Boolean(), nullable=False),
        sa.Column("first_studied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_studied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mastered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recommended_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["word_id"], ["words.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "word_id", name="uq_word_progress_user_word"),
    )
    op.create_index(op.f("ix_word_progress_user_id"), "word_progress", ["user_id"], unique=False)
    op.create_index(op.f("ix_word_progress_word_id"), "word_progress", ["word_id"], unique=False)

    op.create_table(
        "operation_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=80), nullable=False),
        sa.Column("object_type", sa.String(length=80), nullable=False),
        sa.Column("object_id", sa.String(length=80), nullable=False),
        sa.Column("before_value", sa.JSON(), nullable=True),
        sa.Column("after_value", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_id", sa.String(length=120), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_operation_logs_operation"), "operation_logs", ["operation"], unique=False)
    op.create_index(op.f("ix_operation_logs_user_id"), "operation_logs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_operation_logs_user_id"), table_name="operation_logs")
    op.drop_index(op.f("ix_operation_logs_operation"), table_name="operation_logs")
    op.drop_table("operation_logs")
    op.drop_index(op.f("ix_word_progress_word_id"), table_name="word_progress")
    op.drop_index(op.f("ix_word_progress_user_id"), table_name="word_progress")
    op.drop_table("word_progress")
    op.drop_index(op.f("ix_words_vocabulary_id"), table_name="words")
    op.drop_index(op.f("ix_words_normalized_word"), table_name="words")
    op.drop_table("words")
    op.drop_index(op.f("ix_vocabularies_user_id"), table_name="vocabularies")
    op.drop_index(op.f("ix_vocabularies_name"), table_name="vocabularies")
    op.drop_table("vocabularies")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
