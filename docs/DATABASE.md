# 数据库说明

目标数据库为 SQLite，使用 Alembic 迁移。核心表：`users`、`vocabularies`、`words`、`word_progress`、`study_pages`、`study_page_words`、`study_sessions`、`word_study_events`、`operation_logs`、`sync_records`。

禁止直接修改生产数据库文件，所有结构变化必须通过迁移脚本完成。

## 当前迁移

- 版本：`202609040001_initial_vocabulary`
- 位置：`backend/migrations/versions/202609040001_initial_vocabulary.py`

## 已实现表

- `users`：本地默认用户和后续服务器认证账户。
- `vocabularies`：词库名称、原文件名、导入时间、总词数、激活状态、优先级和软删除时间。
- `words`：词库内原始编号、英文、规范化英文、释义、原始页码和 CSV 顺序。
- `word_progress`：用户与单词的学习状态、学习次数、遗忘次数、历史遗忘标志和推荐日期。
- `operation_logs`：词库导入、重命名、激活/停用、优先级和删除操作的追加日志。

## 当前索引与约束

- `words` 使用 `vocabulary_id + normalized_word` 唯一约束，避免同一词库重复导入同一规范化英文。
- `word_progress` 使用 `user_id + word_id` 唯一约束，确保每个用户每个词只有一条进度。
- 常用查询字段 `user_id`、`normalized_word`、`operation` 建有索引。
