import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { ForgottenWord } from "../../lib/types";

interface Props {
  items: ForgottenWord[];
  search: string;
  vocabularyId: number | null;
  status: string;
  onSearch: (value: string) => void;
  onVocabularyChange: (value: number | null) => void;
  onStatusChange: (value: string) => void;
  onCreateSpecialPage: (wordIds: number[]) => void;
}

export function ForgottenView({ items, search, vocabularyId, status, onSearch, onVocabularyChange, onStatusChange, onCreateSpecialPage }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const vocabularies = useMemo(() => Array.from(new Map(items.map((item) => [item.vocabulary_id, item.vocabulary_name]))), [items]);
  const toggle = (wordId: number) => setSelected((current) => current.includes(wordId) ? current.filter((id) => id !== wordId) : [...current, wordId]);

  return <section aria-labelledby="forgotten-title"><header className="view-header"><div><p className="eyebrow">按遗忘次数排序</p><h1 id="forgotten-title">遗忘单词</h1></div><a className="icon-button" href="/api/v1/forgotten-words/export" aria-label="导出遗忘单词"><Download aria-hidden="true" size={19} /></a></header><label className="search-field"><Search aria-hidden="true" size={18} /><input type="search" aria-label="搜索遗忘单词" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索单词" /></label><div className="filter-bar"><select aria-label="词库筛选" value={vocabularyId ?? ""} onChange={(event) => onVocabularyChange(event.target.value ? Number(event.target.value) : null)}><option value="">全部词库</option>{vocabularies.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select><select aria-label="状态筛选" value={status} onChange={(event) => onStatusChange(event.target.value)}><option value="">全部状态</option><option value="learning">学习中</option><option value="mastered">已掌握</option></select></div><div className="data-list">{items.map((item) => <article className="data-row selectable-row" key={item.word_id}><input type="checkbox" aria-label={`选择 ${item.word}`} checked={selected.includes(item.word_id)} onChange={() => toggle(item.word_id)} /><div><strong>{item.word}</strong><span>{item.meaning}</span></div><div className="count-stack"><b>{item.forget_count}</b><small>{item.vocabulary_name}</small></div></article>)}{items.length === 0 && <p className="empty-state">暂无遗忘单词</p>}</div><button className="primary-action" type="button" disabled={selected.length === 0} onClick={() => onCreateSpecialPage(selected)}>开始特殊学习</button></section>;
}
