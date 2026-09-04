import type { TodayStats } from "../../lib/types";

export function StatsView({ stats }: { stats: TodayStats | null }) {
  const metrics = stats ? [["今日学习", stats.study_word_count], ["今日遗忘", stats.forgetting_count], ["再次遗忘", stats.repeated_forgetting_count], ["连续天数", stats.streak_days], ["累计学习", stats.total_study_count], ["学习中", stats.learning_word_count], ["熟词", stats.mastered_word_count], ["遗忘词", stats.forgotten_word_count]] : [];
  return <section aria-labelledby="stats-title"><header className="view-header"><div><p className="eyebrow">学习概览</p><h1 id="stats-title">统计</h1></div></header><div className="metric-grid">{metrics.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{!stats && <p className="empty-state">完成学习后会在这里看到统计</p>}</section>;
}
