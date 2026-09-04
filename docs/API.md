# API 说明

API 前缀为 `/api/v1`，使用 FastAPI 自动生成 OpenAPI。目标模块包括认证、词库、单词、学习页、学习事件、遗忘词、历史、统计、设置、同步和备份。

实现每个接口后，必须补充请求/响应模型、错误示例、分页与筛选参数，并生成 `docs/openapi.json`。

## 已实现接口

### `GET /api/v1/health`

返回后端进程状态和应用版本。

响应示例：

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### `POST /api/v1/vocabularies/import`

上传 CSV 并创建独立词库。请求为 multipart form-data：

- `name`：词库名称。
- `file`：CSV 文件，至少包含 `word,meaning`，可选 `number,source_page`。

响应包含词库摘要、有效导入数量和行级错误。无效行不会阻塞有效行。

### `GET /api/v1/vocabularies`

按 `priority, id` 返回当前用户未删除词库。

### `GET /api/v1/vocabularies/{id}`

返回单个词库摘要。不存在、非当前用户或已删除时返回 404。

### `PATCH /api/v1/vocabularies/{id}`

当前支持重命名：`{ "name": "新名称" }`。

### `PATCH /api/v1/vocabularies/{id}/active`

启用或停用词库：`{ "active": true }`。

### `PATCH /api/v1/vocabularies/{id}/priority`

调整词库优先级：`{ "priority": 7 }`。数值越小越靠前。

### `DELETE /api/v1/vocabularies/{id}?confirm=词库名称`

二次确认后软删除词库，并写入 `operation_logs`。

### `GET /api/v1/study-pages/next?page_size=15`

返回当前未完成学习页；如果没有未完成页，则按激活词库优先级和 CSV 原始顺序生成新页。跨词库同词跳过规则在服务层执行。词库不足时 `is_short` 为 `true`；完全没有候选词时返回 404，且不创建空页面。

### `GET /api/v1/study-pages/{id}`

返回学习页详情、固定单词顺序、释义、词库名、原始页码、学习次数、遗忘次数和是否可标记熟。

### `POST /api/v1/study-pages/{id}/words/{word_id}/master`

第一次学习时标记熟词，将该词从当前未完成页移除并补入学习次数为 0 的新词。后续学习次数不为 0 时返回 400。

若最后一个活动词被标记熟且没有候选替补，页面状态变为 `exhausted`，不会作为未完成页再次复用。

### `POST /api/v1/study-pages/{id}/complete`

请求示例：

```json
{
  "completed_at": "2026-09-04T08:30:00+00:00"
}
```

完成当前页，为当前页仍激活的单词学习次数加 1，写入 `study_sessions.snapshot` 和 `word_study_events`。

### `POST /api/v1/study-pages/{id}/undo-complete`

请求示例：

```json
{
  "session_id": 1
}
```

仅可在完成后 300 秒内撤销该页最新的未撤销记录。接口撤销对应学习次数增量并追加事件，再根据剩余有效会话恢复页面状态和单词首末学习时间。
