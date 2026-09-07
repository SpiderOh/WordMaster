import type { StudyPage } from '../types';
import { studyPageClear, studyPageGet, studyPagePut } from './db';

export const CURRENT_STUDY_PAGE_CACHE_KEY = 'current';

interface CachedStudyPage {
  key: string;
  page: StudyPage;
  updated_at: string;
}

export async function writeCachedStudyPage(key: string, page: StudyPage): Promise<void> {
  await studyPagePut({ key, page, updated_at: new Date().toISOString() } satisfies CachedStudyPage);
}

export async function readCachedStudyPage(key: string): Promise<StudyPage | null> {
  const cached = await studyPageGet<CachedStudyPage>(key);
  return cached?.page ?? null;
}

export async function clearCachedStudyPages(): Promise<void> {
  await studyPageClear();
}
