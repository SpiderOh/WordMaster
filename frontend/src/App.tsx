import { BookOpen, CalendarDays, Settings, TrendingUp } from "lucide-react";
import "./styles.css";

const navItems = [
  { label: "学习", icon: BookOpen },
  { label: "日期", icon: CalendarDays },
  { label: "统计", icon: TrendingUp },
  { label: "设置", icon: Settings }
];

export function App() {
  return (
    <main className="app-shell">
      <section className="content-band">
        <p className="eyebrow">WordMaster</p>
        <h1>按页记单词</h1>
        <p className="intro">导入词库后，每页默认 15 个单词，纸笔背诵完成后再记录学习。</p>
      </section>
      <nav className="bottom-nav" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button className="nav-button" key={item.label} type="button">
              <Icon aria-hidden="true" size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
