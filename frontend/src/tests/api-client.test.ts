import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, clearAuthToken, getAuthToken, setAuthToken } from '../lib/apiClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  clearAuthToken();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  it('向 /api/v1 前缀发起 GET 请求并解析 JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', version: '0.1.0' }));
    const health = await apiClient.health();
    expect(health).toEqual({ status: 'ok', version: '0.1.0' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/health');
    expect(init.method).toBe('GET');
  });

  it('设置了 Token 时附加 Authorization 头', async () => {
    setAuthToken('token-abc');
    fetchMock.mockResolvedValue(jsonResponse([]));
    await apiClient.listVocabularies();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token-abc');
  });

  it('POST JSON 时携带 Content-Type 与序列化请求体', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    await apiClient.undoPageCompletion(3, 9);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/study-pages/3/undo-complete');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ session_id: 9 });
  });

  it('把 FastAPI 的 detail 字符串转换为 ApiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Study page not found' }, 404));
    await expect(apiClient.getStudyPage(1)).rejects.toMatchObject({
      status: 404,
      kind: 'http',
      message: 'Study page not found',
    });
  });

  it('把 422 校验错误数组拼接为可读消息', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: [{ msg: 'page_size 必须大于 0', type: 'value_error' }] }, 422),
    );
    const error = await apiClient.getNextStudyPage(0).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('validation');
    expect((error as ApiError).message).toContain('page_size 必须大于 0');
  });

  it('网络失败时抛出 kind 为 network 的 ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await apiClient.getTodayStats().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).kind).toBe('network');
  });

  it('删除词库时把确认名称作为查询参数', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await apiClient.deleteVocabulary(7, '四级核心');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/vocabularies/7?confirm=%E5%9B%9B%E7%BA%A7%E6%A0%B8%E5%BF%83');
    expect(init.method).toBe('DELETE');
  });

  it('专攻页完成请求把 outcomes 键转换为字符串并附 completed_at', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1, page_id: 2, completed_at: '', snapshot: {} }));
    await apiClient.completeSpecialPage(2, { 5: 'remembered', 8: 'forgotten' }, '2026-09-04T10:00:00Z');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/forgotten-words/special-pages/2/complete');
    const body = JSON.parse(init.body);
    expect(body.outcomes).toEqual({ '5': 'remembered', '8': 'forgotten' });
    expect(body.completed_at).toBe('2026-09-04T10:00:00Z');
  });

  it('遗忘列表筛选条件映射为查询字符串', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await apiClient.listForgottenWords({ search: 'ab', vocabularyId: 2, status: 'learning', forgottenSince: '2026-09-01' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/forgotten-words?');
    expect(url).toContain('search=ab');
    expect(url).toContain('vocabulary_id=2');
    expect(url).toContain('status=learning');
    expect(url).toContain('forgotten_since=2026-09-01');
  });

  it('登录提交用户名密码并保存 Token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'jwt-1', token_type: 'bearer', expires_in: 3600 }));
    const result = await apiClient.login('admin', 'secret');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/login');
    expect(JSON.parse(init.body)).toEqual({ username: 'admin', password: 'secret' });
    expect(result.access_token).toBe('jwt-1');
    expect(getAuthToken()).toBe('jwt-1');
  });

  it('登出携带 Bearer 头并清除本地 Token', async () => {
    setAuthToken('jwt-2');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await apiClient.logout();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/logout');
    expect(init.headers.Authorization).toBe('Bearer jwt-2');
    expect(getAuthToken()).toBeNull();
  });
});
