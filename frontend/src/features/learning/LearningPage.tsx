import { Brain, Eye, EyeOff, Flag, X } from "lucide-react";
import { useState } from "react";

import type { StudyPage } from "../../lib/types";

interface LearningPageProps {
  page: StudyPage;
  onComplete: () => void;
  onForget: (wordId: number) => void;
  onMaster: (wordId: number) => void;
}

export function LearningPage({ page, onComplete, onForget, onMaster }: LearningPageProps) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const toggleReveal = (wordId: number) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  };

  return (
    <section className="learning-view" aria-labelledby="learning-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">第 {page.page_number} 页</p>
          <h1 id="learning-title">今日学习</h1>
        </div>
        <span className="page-count">{page.words.length}/{page.page_size}</span>
      </header>

      <div className="word-list" aria-label="学习单词">
        {page.words.map((item) => {
          const isRevealed = revealed.has(item.word_id);
          return (
            <article className="word-row" data-testid="word-row" key={item.word_id}>
              <button
                className="word-main"
                type="button"
                onClick={() => toggleReveal(item.word_id)}
                aria-label={`${isRevealed ? "隐藏" : "显示"} ${item.word} 的释义`}
              >
                <span className="meaning-slot">{isRevealed ? item.meaning : ""}</span>
                <span className="word-copy">
                  <strong>{item.word}</strong>
                  <small>{item.vocabulary_name} · 学 {item.study_count} · 忘 {item.forget_count}</small>
                </span>
                {isRevealed ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
              <div className="word-actions">
                <button className="icon-button danger" type="button" aria-label="标记遗忘" onClick={() => onForget(item.word_id)}>
                  <Flag aria-hidden="true" size={18} />
                </button>
                {item.can_mark_mastered && (
                  <button className="icon-button" type="button" aria-label="标记熟" onClick={() => onMaster(item.word_id)}>
                    <Brain aria-hidden="true" size={18} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <button className="primary-action" type="button" onClick={() => setConfirming(true)}>完成本页</button>

      {confirming && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认完成">
            <button className="icon-button close-button" type="button" aria-label="关闭" onClick={() => setConfirming(false)}>
              <X aria-hidden="true" size={20} />
            </button>
            <h2>确认完成</h2>
            <p>本页未标记为熟的单词将增加一次学习记录。</p>
            <button
              className="primary-action"
              type="button"
              aria-label="确认完成"
              onClick={() => {
                setConfirming(false);
                onComplete();
              }}
            >
              确认完成
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
