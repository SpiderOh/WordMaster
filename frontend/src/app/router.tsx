import { Navigate, Route, Routes } from 'react-router-dom';
import { ForgottenView } from '../features/forgotten/ForgottenView';
import { HistoryView } from '../features/history/HistoryView';
import { LearningPage } from '../features/learning/LearningPage';
import { SpecialLearningPage } from '../features/learning/SpecialLearningPage';
import { SettingsView } from '../features/settings/SettingsView';
import { StatsView } from '../features/stats/StatsView';
import { VocabulariesView } from '../features/vocabularies/VocabulariesView';

// 应用路由表：底部导航五入口 + 专攻页与词库管理二级页
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LearningPage />} />
      <Route path="/review/:pageId" element={<LearningPage />} />
      <Route path="/history" element={<HistoryView />} />
      <Route path="/forgotten" element={<ForgottenView />} />
      <Route path="/special/:pageId" element={<SpecialLearningPage />} />
      <Route path="/stats" element={<StatsView />} />
      <Route path="/settings" element={<SettingsView />} />
      <Route path="/vocabularies" element={<VocabulariesView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
