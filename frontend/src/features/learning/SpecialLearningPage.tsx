import { useState } from "react";

import type { StudyPage } from "../../lib/types";

export type SpecialOutcome = "remembered" | "forgotten" | "mastered";

export function SpecialLearningPage({ page, onComplete }: { page: StudyPage; onComplete: (outcomes: Record<number, SpecialOutcome>) => void }) {
  const [outcomes, setOutcomes] = useState<Record<number, SpecialOutcome>>({});
  const complete = page.words.every((item) => outcomes[item.word_id]);

  return <section aria-labelledby="special-learning-title"><header className="view-header"><div><p className="eyebrow">遗忘词专攻</p><h1 id="special-learning-title">特殊学习</h1></div><span className="page-count">{Object.keys(outcomes).length}/{page.words.length}</span></header><div className="special-list">{page.words.map((item) => <fieldset className="special-row" key={item.word_id}><legend><strong>{item.word}</strong><span>{item.meaning}</span></legend><div className="outcome-control">{(["remembered", "forgotten", "mastered"] as const).map((outcome) => { const labels = { remembered: "记得", forgotten: "遗忘", mastered: "已熟" }; return <label key={outcome} data-active={outcomes[item.word_id] === outcome}><input type="radio" name={`outcome-${item.word_id}`} aria-label={`${item.word} ${labels[outcome]}`} checked={outcomes[item.word_id] === outcome} onChange={() => setOutcomes((current) => ({ ...current, [item.word_id]: outcome }))} /><span>{labels[outcome]}</span></label>; })}</div></fieldset>)}</div><button className="primary-action" type="button" disabled={!complete} onClick={() => onComplete(outcomes)}>完成特殊学习</button></section>;
}
