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
