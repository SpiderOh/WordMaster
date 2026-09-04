import { useEffect, useMemo, useState } from "react";
import { navigation, type ViewName } from "./app/router";
import { ForgottenView } from "./features/forgotten/ForgottenView";
import { HistoryView } from "./features/history/HistoryView";
import { LearningPage } from "./features/learning/LearningPage";
import { SpecialLearningPage } from "./features/learning/SpecialLearningPage";
import { SettingsView } from "./features/settings/SettingsView";
import { StatsView } from "./features/stats/StatsView";
import { SyncStatus } from "./features/sync/SyncStatus";
import { ApiError, api } from "./lib/api";
import type { SyncQueueStatus } from "./lib/sync/SyncQueue";
import { createSyncEvent, enqueueWordChanges, syncQueue } from "./lib/sync/offlineSync";
import type { CalendarDay, ForgottenWord, HistoryPageSummary, StudyPage, TodayStats, UserSettings } from "./lib/types";
import "./styles.css";

const defaultSettings: UserSettings = { page_size: 15, intervals: [0, 1, 4], theme: "system", font_size: "medium", vocabulary_priorities: {} };
const defaultSyncStatus: SyncQueueStatus = { pending: 0, syncing: false, lastError: null, nextRetryAt: null };

export function App() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [active, setActive] = useState<ViewName>("learning");
  const [page, setPage] = useState<StudyPage | null>(null);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [historyPages, setHistoryPages] = useState<HistoryPageSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [forgotten, setForgotten] = useState<ForgottenWord[]>([]);
  const [search, setSearch] = useState("");
  const [vocabularyId, setVocabularyId] = useState<number | null>(null);
  const [forgottenStatus, setForgottenStatus] = useState("");
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncQueueStatus>(defaultSyncStatus);

  useEffect(() => { api.settings().then(setSettings).catch(() => undefined); }, []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; document.documentElement.dataset.fontSize = settings.font_size; }, [settings]);
  useEffect(() => {
    let retryTimer: number | undefined;
    const refresh = async () => { const next = await syncQueue.status(); setSyncStatus(next); if (next.pending && next.nextRetryAt && navigator.onLine) retryTimer = window.setTimeout(flush, Math.max(0, next.nextRetryAt - Date.now())); };
    const flush = () => { window.clearTimeout(retryTimer); setOnline(true); syncQueue.flush().catch(() => undefined).finally(refresh); };
    const offline = () => { setOnline(false); refresh(); };
    refresh();
    if (navigator.onLine) flush();
    window.addEventListener("online", flush);
    window.addEventListener("offline", offline);
    return () => { window.clearTimeout(retryTimer); window.removeEventListener("online", flush); window.removeEventListener("offline", offline); };
  }, []);
  useEffect(() => {
    if (active === "learning") api.nextPage(settings.page_size).then(setPage).catch(() => setPage(null));
    if (active === "history") Promise.all([api.calendar(selectedDate.slice(0, 7)), api.history(selectedDate)]).then(([calendar, history]) => { setDays(calendar.days); setHistoryPages(history.pages); }).catch(() => undefined);
    if (active === "forgotten") api.forgottenWords(search, vocabularyId, forgottenStatus).then(setForgotten).catch(() => setForgotten([]));
    if (active === "stats") api.todayStats().then(setStats).catch(() => setStats(null));
  }, [active, search, vocabularyId, forgottenStatus, selectedDate, settings.page_size, today]);

  const refreshSyncStatus = () => syncQueue.status().then(setSyncStatus);
  const saveSettings = (next: UserSettings) => { setSettings(next); api.updateSettings(next).then(setSettings).catch((error) => { if (error instanceof ApiError) return; return syncQueue.enqueue(createSyncEvent("user_settings", "1", { page_size: next.page_size, intervals: next.intervals, theme: next.theme, font_size: next.font_size })).then(refreshSyncStatus); }); };
  const navigateDate = (offset: number) => setSelectedDate((current) => { const value = new Date(`${current}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); });
  const completeCurrentPage = async (current: StudyPage) => { try { await api.completePage(current.id); } catch (error) { if (error instanceof ApiError) return; await Promise.all(current.words.map((word) => enqueueWordChanges(word.word_id, { study_count_delta: 1, status: "learning" }))); setPage(null); await refreshSyncStatus(); return; } try { setPage(await api.nextPage(current.page_size)); } catch { setPage(null); } };
  const forgetCurrentWord = async (current: StudyPage, wordId: number) => { try { await api.forgetWord(current.id, wordId); } catch (error) { if (error instanceof ApiError) return; await enqueueWordChanges(wordId, { forget_count_delta: 1 }); setPage({ ...current, words: current.words.map((word) => word.word_id === wordId ? { ...word, forget_count: word.forget_count + 1 } : word) }); await refreshSyncStatus(); return; } try { setPage(await api.nextPage(current.page_size)); } catch { setPage(current); } };

  return <main className="app-shell"><SyncStatus online={online} status={syncStatus} /><div className="workspace">
    {active === "learning" && (page ? (page.page_type === "special" ? <SpecialLearningPage page={page} onComplete={(outcomes) => api.completeSpecialPage(page.id, outcomes).then(() => { setPage(null); setActive("forgotten"); }).catch(async (error) => { if (error instanceof ApiError) return; await Promise.all(Object.entries(outcomes).map(([wordId, outcome]) => enqueueWordChanges(Number(wordId), outcome === "forgotten" ? { forget_count_delta: 1 } : { status: outcome === "mastered" ? "mastered" : "learning" }))); setPage(null); setActive("forgotten"); await refreshSyncStatus(); })} /> : <LearningPage page={page} onComplete={() => completeCurrentPage(page)} onForget={(wordId) => forgetCurrentWord(page, wordId)} onMaster={(wordId) => api.masterWord(page.id, wordId).then(setPage).catch(async (error) => { if (error instanceof ApiError) return; await enqueueWordChanges(wordId, { status: "mastered" }); setPage({ ...page, words: page.words.filter((word) => word.word_id !== wordId), is_short: true }); await refreshSyncStatus(); })} />) : <section className="empty-view"><p className="eyebrow">WordMaster</p><h1>学习</h1><p className="empty-state">导入并启用词库后开始下一页。</p></section>)}
    {active === "history" && <HistoryView month={selectedDate.slice(0, 7)} selectedDate={selectedDate} days={days} pages={historyPages} onSelectDate={setSelectedDate} onNavigateDate={navigateDate} />}
    {active === "forgotten" && <ForgottenView items={forgotten} search={search} vocabularyId={vocabularyId} status={forgottenStatus} onSearch={setSearch} onVocabularyChange={setVocabularyId} onStatusChange={setForgottenStatus} onCreateSpecialPage={(wordIds) => api.createSpecialPage(wordIds).then((specialPage) => { setPage(specialPage); setActive("learning"); })} />}
    {active === "stats" && <StatsView stats={stats} />}
    {active === "settings" && <SettingsView settings={settings} onChange={saveSettings} />}
  </div><nav className="bottom-nav" aria-label="主导航">{navigation.map((item) => { const Icon = item.icon; return <button className="nav-button" data-active={active === item.id} key={item.id} type="button" aria-label={item.label} onClick={() => setActive(item.id)}><Icon aria-hidden="true" size={20} /><span>{item.label}</span></button>; })}</nav></main>;
}
