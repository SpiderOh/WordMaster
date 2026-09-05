// 统一的 /api/v1 客户端：路由只做参数转换，不在此处推导业务数据
import type {
  AppSettings,
  CalendarSummary,
  DateHistory,
  ForgottenWord,
  ForgottenWordFilters,
  HistoryPageSnapshot,
  ImportResult,
  SpecialOutcome,
  StudyPage,
  StudySession,
  SyncEventInput,
  SyncPullResponse,
  SyncPushResponse,
  TodayStats,
  Vocabulary,
  WordProgress,
} from './types';

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';
const API_PREFIX = '/api/v1';
const TOKEN_STORAGE_KEY = 'wordmaster-token';

export type ApiErrorKind = 'http' | 'validation' | 'network';

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly detail: unknown;

  constructor(message: string, status: number, kind: ApiErrorKind, detail: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* 本地存储不可用时忽略 */
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* 本地存储不可用时忽略 */
  }
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

function readableDetail(detail: unknown): string {
  if (typeof detail === 'string' && detail.length > 0) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === 'object' && item !== null && 'msg' in item
          ? String((item as { msg: unknown }).msg)
          : String(item),
      )
      .filter((message) => message.length > 0);
    if (messages.length > 0) {
      return messages.join('；');
    }
  }
  if (detail !== null && detail !== undefined) {
    return JSON.stringify(detail);
  }
  return '请求失败';
}

async function send(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError('网络不可用，请稍后重试', 0, 'network');
  }
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const detail =
      payload !== null && typeof payload === 'object' && 'detail' in payload
        ? (payload as { detail: unknown }).detail
        : payload;
    const kind: ApiErrorKind = response.status === 422 ? 'validation' : 'http';
    throw new ApiError(readableDetail(detail), response.status, kind, detail);
  }
  return response;
}

async function request<T>(
  method: string,
  path: string,
  options: { json?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = `${BASE_URL}${API_PREFIX}${path}${toQuery(options.query ?? {})}`;
  const headers: Record<string, string> = { ...authHeaders() };
  let body: string | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await send(url, { method, headers, body });
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function forgottenExportUrl(): string {
  return `${BASE_URL}${API_PREFIX}/forgotten-words/export`;
}

export function vocabularyExportUrl(vocabularyId: number): string {
  return `${BASE_URL}${API_PREFIX}/vocabularies/${vocabularyId}/export`;
}

export const apiClient = {
  health(): Promise<{ status: string; version: string }> {
    return request('GET', '/health');
  },

  // ---- 认证 ----
  async login(username: string, password: string): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const result = await request<{ access_token: string; token_type: string; expires_in: number }>('POST', '/auth/login', {
      json: { username, password },
    });
    setAuthToken(result.access_token);
    return result;
  },
  async logout(): Promise<void> {
    try {
      await request('POST', '/auth/logout');
    } finally {
      clearAuthToken();
    }
  },

  // ---- 词库 ----
  listVocabularies(): Promise<Vocabulary[]> {
    return request('GET', '/vocabularies');
  },
  async importVocabulary(name: string, file: File): Promise<ImportResult> {
    const form = new FormData();
    form.append('name', name);
    form.append('file', file);
    const response = await send(`${BASE_URL}${API_PREFIX}/vocabularies/import`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: form,
    });
    return (await response.json()) as ImportResult;
  },
  renameVocabulary(vocabularyId: number, name: string): Promise<Vocabulary> {
    return request('PATCH', `/vocabularies/${vocabularyId}`, { json: { name } });
  },
  setVocabularyActive(vocabularyId: number, active: boolean): Promise<Vocabulary> {
    return request('PATCH', `/vocabularies/${vocabularyId}/active`, { json: { active } });
  },
  setVocabularyPriority(vocabularyId: number, priority: number): Promise<Vocabulary> {
    return request('PATCH', `/vocabularies/${vocabularyId}/priority`, { json: { priority } });
  },
  async deleteVocabulary(vocabularyId: number, confirmName: string): Promise<void> {
    await request('DELETE', `/vocabularies/${vocabularyId}${toQuery({ confirm: confirmName })}`);
  },
  // ---- 学习页 ----
  getNextStudyPage(pageSize?: number): Promise<StudyPage> {
    return request('GET', '/study-pages/next', { query: { page_size: pageSize } });
  },
  getStudyPage(pageId: number): Promise<StudyPage> {
    return request('GET', `/study-pages/${pageId}`);
  },
  markWordMastered(pageId: number, wordId: number): Promise<StudyPage> {
    return request('POST', `/study-pages/${pageId}/words/${wordId}/master`);
  },
  markWordForgotten(pageId: number, wordId: number, sessionId?: number): Promise<WordProgress> {
    return request('POST', `/study-pages/${pageId}/words/${wordId}/forget`, {
      json: { session_id: sessionId ?? null },
    });
  },
  completePage(pageId: number, completedAt?: string): Promise<StudySession> {
    return request('POST', `/study-pages/${pageId}/complete`, {
      json: completedAt ? { completed_at: completedAt } : {},
    });
  },
  async undoPageCompletion(pageId: number, sessionId: number): Promise<void> {
    await request('POST', `/study-pages/${pageId}/undo-complete`, { json: { session_id: sessionId } });
  },

  // ---- 遗忘与专攻 ----
  listForgottenWords(filters: ForgottenWordFilters = {}): Promise<ForgottenWord[]> {
    return request('GET', '/forgotten-words', {
      query: {
        search: filters.search,
        vocabulary_id: filters.vocabularyId,
        status: filters.status,
        forgotten_since: filters.forgottenSince,
      },
    });
  },
  createSpecialPage(wordIds: number[]): Promise<StudyPage> {
    return request('POST', '/forgotten-words/special-page', { json: { word_ids: wordIds } });
  },
  completeSpecialPage(
    pageId: number,
    outcomes: Record<number, SpecialOutcome>,
    completedAt: string,
  ): Promise<StudySession> {
    const payload: Record<string, string> = {};
    for (const [wordId, outcome] of Object.entries(outcomes)) {
      payload[wordId] = outcome;
    }
    return request('POST', `/forgotten-words/special-pages/${pageId}/complete`, {
      json: { outcomes: payload, completed_at: completedAt },
    });
  },
  restoreMasteredWord(wordId: number): Promise<WordProgress> {
    return request('POST', `/forgotten-words/${wordId}/restore`);
  },
  undoForgetting(wordId: number): Promise<WordProgress> {
    return request('POST', `/forgotten-words/${wordId}/undo`);
  },

  // ---- 历史 ----
  getCalendar(month: string): Promise<CalendarSummary> {
    return request('GET', '/history/calendar', { query: { month } });
  },
  getHistoryForDate(date: string): Promise<DateHistory> {
    return request('GET', '/history', { query: { date } });
  },
  getHistoryPageSnapshot(sessionId: number): Promise<HistoryPageSnapshot> {
    return request('GET', `/history/pages/${sessionId}`);
  },

  // ---- 统计 ----
  getTodayStats(date?: string): Promise<TodayStats> {
    return request('GET', '/stats/today', { query: { date } });
  },

  // ---- 设置 ----
  getSettings(): Promise<AppSettings> {
    return request('GET', '/settings');
  },
  updateSettings(settings: AppSettings): Promise<AppSettings> {
    return request('PUT', '/settings', { json: settings });
  },

  // ---- 备份 ----
  exportBackup(): Promise<Record<string, unknown>> {
    return request('GET', '/backup/json');
  },
  importBackup(payload: Record<string, unknown>): Promise<{ status: string }> {
    return request('POST', '/backup/json', { json: payload });
  },

  // ---- 同步 ----
  pushSyncEvents(events: SyncEventInput[]): Promise<SyncPushResponse> {
    return request('POST', '/sync/push', { json: { events } });
  },
  pullSyncEvents(cursor: number): Promise<SyncPullResponse> {
    return request('GET', '/sync/pull', { query: { cursor } });
  },
};
