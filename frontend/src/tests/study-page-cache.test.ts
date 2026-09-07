import { beforeEach, describe, expect, it } from 'vitest';
import type { StudyPage } from '../lib/types';
import {
  clearCachedStudyPages,
  readCachedStudyPage,
  writeCachedStudyPage,
} from '../lib/offline/studyPageCache';

const page: StudyPage = {
  id: 3,
  page_number: 1,
  page_size: 15,
  page_type: 'normal',
  status: 'in_progress',
  is_short: false,
  words: [],
};

beforeEach(async () => {
  await clearCachedStudyPages();
});

describe('学习页缓存', () => {
  it('按缓存键写入并读取学习页快照', async () => {
    await writeCachedStudyPage('current', page);
    await expect(readCachedStudyPage('current')).resolves.toEqual(page);
  });

  it('不存在的缓存键返回 null', async () => {
    await expect(readCachedStudyPage('missing')).resolves.toBeNull();
  });
});
