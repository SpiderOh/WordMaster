// 与后端 /api/v1 Pydantic 模型一一对应的领域类型

export type WordStatus = 'unlearned' | 'learning' | 'mastered';
export type ThemePreference = 'system' | 'light' | 'dark';
export type FontSizePreference = 'small' | 'medium' | 'large';
export type SpecialOutcome = 'remembered' | 'forgotten' | 'mastered';

export interface Vocabulary {
  id: number;
  name: string;
  filename: string;
  imported_at: string;
  total_words: number;
  active: boolean;
  priority: number;
}

export interface RowError {
  row_number: number;
  code: string;
  message: string;
}

export interface ImportResult {
  vocabulary: Vocabulary;
  imported_count: number;
  row_errors: RowError[];
}

export interface StudyPageWord {
  word_id: number;
  word: string;
  meaning: string;
  vocabulary_id: number;
  vocabulary_name: string;
  source_page: string | null;
  study_count: number;
  forget_count: number;
  status: WordStatus;
  display_order: number;
  can_mark_mastered: boolean;
}

export type StudyPageStatus = 'in_progress' | 'completed' | 'exhausted';

export interface StudyPage {
  id: number;
  page_number: number;
  page_size: number;
  page_type: 'normal' | 'special';
  status: StudyPageStatus;
  is_short: boolean;
  words: StudyPageWord[];
}

export interface SnapshotWord {
  word_id: number;
  word: string;
  meaning: string;
  display_order: number;
  status_before?: string;
  study_count_before?: number;
  forget_count?: number;
  outcome?: SpecialOutcome;
}

export interface PageSnapshot {
  page_id: number;
  page_size?: number;
  page_type?: string;
  words: SnapshotWord[];
}

export interface StudySession {
  id: number;
  page_id: number;
  completed_at: string;
  snapshot: PageSnapshot;
}

export interface WordProgress {
  word_id: number;
  status: WordStatus;
  study_count: number;
  forget_count: number;
  has_forgotten: boolean;
  needs_special_attention: boolean;
}

export interface ForgottenWord {
  word_id: number;
  word: string;
  meaning: string;
  vocabulary_id: number;
  vocabulary_name: string;
  status: WordStatus;
  study_count: number;
  forget_count: number;
  last_forgotten_at: string | null;
}

export interface ForgottenWordFilters {
  search?: string;
  vocabularyId?: number;
  status?: WordStatus;
  forgottenSince?: string;
}

export interface CalendarDay {
  date: string;
  has_study: boolean;
  is_recommended: boolean;
  completion_count: number;
}

export interface CalendarSummary {
  month: string;
  days: CalendarDay[];
}

export interface HistoryPageSummary {
  page_id: number;
  page_number: number;
  session_id: number | null;
  study_number: number;
  completed_on_date: boolean;
  is_recommended: boolean;
  second_completed: boolean;
  third_completed: boolean;
  remaining_recommended_rounds: number;
}

export interface DateHistory {
  date: string;
  pages: HistoryPageSummary[];
}

export interface HistoryPageSnapshot {
  session_id: number;
  page_id: number;
  completed_at: string;
  snapshot: PageSnapshot;
  previous_session_id: number | null;
  next_session_id: number | null;
}

export interface RepeatedForgettingWord {
  word_id: number;
  word: string;
  forget_count_today: number;
  total_forget_count: number;
}

export interface TodayStats {
  date: string;
  study_word_count: number;
  forgetting_count: number;
  repeated_forgetting_count: number;
  streak_days: number;
  total_study_count: number;
  learning_word_count: number;
  mastered_word_count: number;
  forgotten_word_count: number;
  repeated_forgetting_words: RepeatedForgettingWord[];
}

export interface AppSettings {
  page_size: number;
  intervals: number[];
  theme: ThemePreference;
  font_size: FontSizePreference;
  vocabulary_priorities: Record<string, number>;
}

export interface SyncEventInput {
  event_id: string;
  device_id: string;
  client_timestamp: string;
  entity_type: 'word_progress' | 'user_settings';
  entity_id: string;
  operation: string;
  changes: Record<string, unknown>;
}

export interface SyncResult {
  event_id: string;
  status: 'applied' | 'duplicate' | 'conflict';
  conflict: Record<string, unknown> | null;
}

export interface SyncPushResponse {
  results: SyncResult[];
}

export interface SyncedEvent extends SyncEventInput {
  cursor: number;
  server_timestamp: string;
  status: string;
  conflict: Record<string, unknown> | null;
}

export interface SyncPullResponse {
  events: SyncedEvent[];
  next_cursor: number;
}
