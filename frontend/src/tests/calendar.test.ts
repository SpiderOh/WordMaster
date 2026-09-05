import { describe, expect, it } from 'vitest';
import { addDays, monthGrid, todayISO } from '../lib/calendar';

describe('calendar 工具', () => {
  it('monthGrid 生成周一开头的 6x7 网格并标记是否在当月', () => {
    const grid = monthGrid('2026-09');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: '2026-08-31', inMonth: false });
    expect(grid.map((cell) => cell.date)).toContain('2026-09-01');
    expect(grid.map((cell) => cell.date)).toContain('2026-09-30');
    expect(grid[41]).toEqual({ date: '2026-10-11', inMonth: false });
    const septemberCells = grid.filter((cell) => cell.date.startsWith('2026-09'));
    expect(septemberCells).toHaveLength(30);
    expect(septemberCells.every((cell) => cell.inMonth)).toBe(true);
  });

  it('monthGrid 处理 28 天的二月', () => {
    const grid = monthGrid('2027-02');
    const februaryCells = grid.filter((cell) => cell.date.startsWith('2027-02'));
    expect(februaryCells).toHaveLength(28);
  });

  it('addDays 支持 ISO 日期加减天数并跨月进位', () => {
    expect(addDays('2026-09-05', 1)).toBe('2026-09-06');
    expect(addDays('2026-09-05', -1)).toBe('2026-09-04');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('todayISO 返回本地今天的 ISO 日期', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayISO()).toBe(expected);
  });
});
