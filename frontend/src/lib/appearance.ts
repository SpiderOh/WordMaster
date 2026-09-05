import type { FontSizePreference, ThemePreference } from './types';

const APPEARANCE_STORAGE_KEY = 'wordmaster-appearance';

export interface AccentPreset {
  id: string;
  label: string;
}

// 主题颜色预设：颜色值由 styles.css 中 data-accent 规则定义
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'green', label: '墨绿' },
  { id: 'blue', label: '靛蓝' },
  { id: 'purple', label: '青紫' },
  { id: 'orange', label: '暖橙' },
  { id: 'rose', label: '玫红' },
];

export const DEFAULT_ACCENT = 'green';

export interface StoredAppearance {
  theme: ThemePreference;
  font_size: FontSizePreference;
  accent: string;
}

function isTheme(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isFontSize(value: unknown): value is FontSizePreference {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function normalizeAccent(value: unknown): string {
  return ACCENT_PRESETS.some((preset) => preset.id === value) ? (value as string) : DEFAULT_ACCENT;
}

export function readStoredAppearance(): StoredAppearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredAppearance>;
      return {
        theme: isTheme(parsed.theme) ? parsed.theme : 'system',
        font_size: isFontSize(parsed.font_size) ? parsed.font_size : 'medium',
        accent: normalizeAccent(parsed.accent),
      };
    }
  } catch {
    /* 本地存储不可用时使用默认值 */
  }
  return { theme: 'system', font_size: 'medium', accent: DEFAULT_ACCENT };
}

// 将主题、字号与主题颜色同步到文档根元素并持久化；system 跟随系统深浅色
export function applyAppearance(theme: ThemePreference, fontSize: FontSizePreference, accent?: string): void {
  const stored = readStoredAppearance();
  const resolvedAccent = normalizeAccent(accent ?? stored.accent);
  const resolvedTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.fontSize = fontSize;
  document.documentElement.dataset.accent = resolvedAccent;
  try {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ theme, font_size: fontSize, accent: resolvedAccent } satisfies StoredAppearance),
    );
  } catch {
    /* 本地存储不可用时忽略 */
  }
}
