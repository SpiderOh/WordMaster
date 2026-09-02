# 数据库说明

目标数据库为 SQLite，使用 Alembic 迁移。核心表：`users`、`vocabularies`、`words`、`word_progress`、`study_pages`、`study_page_words`、`study_sessions`、`word_study_events`、`operation_logs`、`sync_records`。

完整字段、索引、枚举和迁移版本将在 Task 2 实现后补齐。禁止直接修改生产数据库文件，所有结构变化必须通过迁移脚本完成。
