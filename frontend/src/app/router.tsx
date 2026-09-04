import { BarChart3, BookOpen, CalendarDays, ListRestart, Settings } from "lucide-react";

export type ViewName = "learning" | "history" | "forgotten" | "stats" | "settings";

export const navigation = [
  { id: "learning" as const, label: "学习", icon: BookOpen },
  { id: "history" as const, label: "日期", icon: CalendarDays },
  { id: "forgotten" as const, label: "遗忘", icon: ListRestart },
  { id: "stats" as const, label: "统计", icon: BarChart3 },
  { id: "settings" as const, label: "设置", icon: Settings }
];
