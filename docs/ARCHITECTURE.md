# 系统架构

当前阶段已建立应用骨架。目标架构为一个模块化单体：React/TypeScript/Vite 前端 + FastAPI 后端 + SQLite 数据库，使用 Docker Compose 部署。

## 边界

- 前端：页面交互、PWA、IndexedDB、本地事件队列。
- API：认证、词库、学习页、历史、遗忘、统计、同步、备份。
- 服务层：实现所有业务规则；路由不直接操作数据库。
- 数据层：模型、迁移、repository；事件和快照不可覆盖。

实现时新增模块必须说明职责、输入输出和测试位置，并同步更新本文件。

## 已建立模块

- `backend/app/main.py`：创建 FastAPI 应用、CORS 中间件和 `/api/v1` 路由入口。
- `backend/app/api/v1/health.py`：提供健康检查接口，用于本地和 Docker smoke test。
- `backend/app/api/v1/vocabularies.py`：提供 CSV 导入和词库管理接口。
- `backend/app/api/v1/study_pages.py`：提供学习页生成、查询、熟词替换、完成和撤销接口。
- `backend/app/core/config.py`：集中读取环境变量，前缀为 `WORDMASTER_`。
- `backend/app/services/vocabulary_import.py`：实现 CSV 字段映射、行级错误隔离和规范化重复词处理。
- `backend/app/services/study_page_service.py`：实现取词顺序、跨词库跳过、页面快照、学习次数和撤销规则。
- `frontend/src/App.tsx`：移动端优先的应用壳和底部导航入口。
- `frontend/public/service-worker.js`：PWA service worker 占位，后续 Task 8 扩展离线缓存与同步队列。
