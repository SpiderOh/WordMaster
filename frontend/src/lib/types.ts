export interface StudyPageWord {
  word_id: number;
  word: string;
  meaning: string;
  vocabulary_id: number;
  vocabulary_name: string;
  source_page: string | null;
  study_count: number;
  forget_count: number;
  status: string;
  display_order: number;
  can_mark_mastered: boolean;
}

export interface StudyPage {
  id: number;
  page_number: number;
  page_size: number;
  page_type: string;
  status: string;
  is_short: boolean;
  words: StudyPageWord[];
}

export interface CalendarDay {
  date: string;
  has_study: boolean;
  is_recommended: boolean;
  completion_count: number;
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

export interface ForgottenWord {
  word_id: number;
  word: string;
  meaning: string;
  vocabulary_id: number;
  vocabulary_name: string;
  status: string;
  study_count: number;
  forget_count: number;
  last_forgotten_at: string | null;
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
}

export interface UserSettings {
  page_size: number;
  intervals: number[];
  theme: "system" | "light" | "dark";
  font_size: "small" | "medium" | "large";
  vocabulary_priorities: Record<string, number>;
}
