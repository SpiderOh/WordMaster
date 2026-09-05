import { beforeEach, describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, applyAppearance, readStoredAppearance } from '../lib/appearance';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = '';
  document.documentElement.dataset.fontSize = '';
  document.documentElement.dataset.accent = '';
});

describe('外观偏好', () => {
  it('提供多个主题颜色预设', () => {
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(ACCENT_PRESETS.map((preset) => preset.id)).toContain('green');
  });

  it('应用主题颜色到文档根元素并持久化', () => {
    applyAppearance('light', 'medium', 'blue');
    expect(document.documentElement.dataset.accent).toBe('blue');
    const stored = JSON.parse(localStorage.getItem('wordmaster-appearance') as string);
    expect(stored).toMatchObject({ theme: 'light', font_size: 'medium', accent: 'blue' });
  });

  it('未知主题颜色回退默认绿色', () => {
    applyAppearance('dark', 'small', 'not-a-color');
    expect(document.documentElement.dataset.accent).toBe('green');
  });

  it('省略主题颜色时保留当前选择', () => {
    applyAppearance('light', 'medium', 'purple');
    applyAppearance('dark', 'small');
    expect(document.documentElement.dataset.accent).toBe('purple');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('readStoredAppearance 返回本地保存的偏好与默认值', () => {
    expect(readStoredAppearance()).toMatchObject({ theme: 'system', font_size: 'medium', accent: 'green' });
    applyAppearance('dark', 'large', 'orange');
    expect(readStoredAppearance()).toMatchObject({ theme: 'dark', font_size: 'large', accent: 'orange' });
  });
});
