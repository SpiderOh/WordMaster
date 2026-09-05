// 日期工具：统一使用本地时区的 ISO YYYY-MM-DD 字符串

export function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(year, month - 1, day + days);
  return toISO(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export interface MonthCell {
  date: string;
  inMonth: boolean;
}

// 生成周一开头的 6x7 月历网格，用于固定日历高度避免跳动
export function monthGrid(month: string): MonthCell[] {
  const [year, monthIndex] = month.split('-').map(Number);
  const first = new Date(year, monthIndex - 1, 1);
  const offsetToMonday = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex - 1, 1 - offsetToMonday);
  const cells: MonthCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    cells.push({
      date: toISO(current.getFullYear(), current.getMonth() + 1, current.getDate()),
      inMonth: current.getMonth() === monthIndex - 1,
    });
  }
  return cells;
}

export function formatMonthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return `${year}年${monthIndex}月`;
}
