import type { CalendarDay, ForgottenWord, HistoryPageSummary, StudyPage, TodayStats, UserSettings } from "./types";

const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API request failed: ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, { headers: { "Content-Type": "application/json", ...init?.headers }, ...init });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export const api = {
  nextPage: (pageSize = 15) => request<StudyPage>(`/study-pages/next?page_size=${pageSize}`),
  masterWord: (pageId: number, wordId: number) => request<StudyPage>(`/study-pages/${pageId}/words/${wordId}/master`, { method: "POST" }),
  forgetWord: (pageId: number, wordId: number) => request(`/study-pages/${pageId}/words/${wordId}/forget`, { method: "POST", body: "{}" }),
  completePage: (pageId: number) => request(`/study-pages/${pageId}/complete`, { method: "POST", body: "{}" }),
  calendar: (month: string) => request<{ month: string; days: CalendarDay[] }>(`/history/calendar?month=${month}`),
  history: (date: string) => request<{ date: string; pages: HistoryPageSummary[] }>(`/history?date=${date}`),
  forgottenWords: (search = "", vocabularyId: number | null = null, status = "") => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (vocabularyId !== null) params.set("vocabulary_id", String(vocabularyId));
    if (status) params.set("status", status);
    return request<ForgottenWord[]>(`/forgotten-words?${params.toString()}`);
  },
  createSpecialPage: (wordIds: number[]) => request<StudyPage>("/forgotten-words/special-page", { method: "POST", body: JSON.stringify({ word_ids: wordIds }) }),
  completeSpecialPage: (pageId: number, outcomes: Record<number, "remembered" | "forgotten" | "mastered">) => request(`/forgotten-words/special-pages/${pageId}/complete`, { method: "POST", body: JSON.stringify({ outcomes, completed_at: new Date().toISOString() }) }),
  todayStats: () => request<TodayStats>("/stats/today"),
  settings: () => request<UserSettings>("/settings"),
  updateSettings: (settings: UserSettings) => request<UserSettings>("/settings", { method: "PUT", body: JSON.stringify(settings) })
};
