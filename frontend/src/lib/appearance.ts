import type { FontSizePreference, ThemePreference } from './types';

const APPEARANCE_STORAGE_KEY = 'wordmaster-appearance';

// 将主题与字号偏好同步到文档根元素并持久化，system 跟随系统深浅色
export function applyAppearance(theme: ThemePreference, fontSize: FontSizePreference): void {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.fontSize = fontSize;
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme, font_size: fontSize }));
  } catch {
    /* 本地存储不可用时忽略 */
  }
}
