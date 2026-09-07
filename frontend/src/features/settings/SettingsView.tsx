import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCENT_PRESETS, applyAppearance, readStoredAppearance } from '../../lib/appearance';
import { apiClient, clearAuthToken, getAuthToken } from '../../lib/apiClient';
import { downloadJson } from '../../lib/download';
import { reloadPage } from '../../lib/reloadPage';
import type { AppSettings, FontSizePreference, ThemePreference, Vocabulary } from '../../lib/types';

// jsdom 的 Blob 未实现 text()，统一用 FileReader 读取用户选择的文件
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [vocabularyNames, setVocabularyNames] = useState<Record<number, string>>({});
  const [pageSize, setPageSize] = useState('15');
  const [intervals, setIntervals] = useState('0,1,4');
  const [priorities, setPriorities] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => getAuthToken() !== null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accent, setAccent] = useState<string>(() => readStoredAppearance().accent);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getSettings()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSettings(result);
        setPageSize(String(result.page_size));
        setIntervals(result.intervals.join(','));
        setPriorities({ ...result.vocabulary_priorities });
        applyAppearance(result.theme, result.font_size);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setMessage(cause instanceof Error ? `加载设置失败：${cause.message}` : '加载设置失败');
        }
      });
    apiClient
      .listVocabularies()
      .then((vocabularies: Vocabulary[]) => {
        if (!cancelled) {
          setVocabularyNames(Object.fromEntries(vocabularies.map((item) => [item.id, item.name])));
        }
      })
      .catch(() => {
        /* 词库名称不可用时按 ID 显示 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyTheme = useCallback((theme: ThemePreference) => {
    setSettings((current) => (current === null ? current : { ...current, theme }));
    applyAppearance(theme, (settings?.font_size ?? 'medium') as FontSizePreference);
  }, [settings]);

  const applyFontSize = useCallback(
    (fontSize: FontSizePreference) => {
      setSettings((current) => (current === null ? current : { ...current, font_size: fontSize }));
      applyAppearance((settings?.theme ?? 'system') as ThemePreference, fontSize);
    },
    [settings],
  );

  const handleAccent = useCallback(
    (nextAccent: string) => {
      setAccent(nextAccent);
      const stored = readStoredAppearance();
      applyAppearance(settings?.theme ?? stored.theme, settings?.font_size ?? stored.font_size, nextAccent);
    },
    [settings],
  );

  const parseIntervals = useCallback((raw: string): number[] | null => {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) {
      return null;
    }
    const values: number[] = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part)) {
        return null;
      }
      values.push(Number(part));
    }
    return values;
  }, []);

  const handleSave = useCallback(async () => {
    if (settings === null) {
      return;
    }
    setFormError(null);
    setMessage(null);
    const parsedPageSize = Number(pageSize);
    if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
      setFormError('每页单词数必须是 1-100 的整数');
      return;
    }
    const parsedIntervals = parseIntervals(intervals);
    if (parsedIntervals === null) {
      setFormError('推荐间隔必须是非负整数，用英文逗号分隔');
      return;
    }
    const payload: AppSettings = {
      page_size: parsedPageSize,
      intervals: parsedIntervals,
      theme: settings.theme,
      font_size: settings.font_size,
      vocabulary_priorities: priorities,
    };
    try {
      const saved = await apiClient.updateSettings(payload);
      setSettings(saved);
      setMessage('设置已保存');
    } catch (cause) {
      setFormError(cause instanceof Error ? `保存失败：${cause.message}` : '保存失败');
    }
  }, [settings, pageSize, intervals, priorities, parseIntervals]);

  const handleLogin = useCallback(async () => {
    setMessage(null);
    setFormError(null);
    try {
      await apiClient.login(username, password);
      setHasToken(true);
      setPassword('');
      setMessage('登录成功');
    } catch (cause) {
      setFormError(cause instanceof Error ? `登录失败：${cause.message}` : '登录失败');
    }
  }, [username, password]);

  const handleLogout = useCallback(async () => {
    setMessage(null);
    setFormError(null);
    try {
      await apiClient.logout();
    } finally {
      clearAuthToken();
      setHasToken(false);
      setMessage('已退出登录');
    }
  }, []);

  const handleExport = useCallback(async () => {
    setMessage(null);
    setFormError(null);
    try {
      const data = await apiClient.exportBackup();
      downloadJson('wordmaster-backup.json', data);
      setMessage('备份已导出');
    } catch (cause) {
      setFormError(cause instanceof Error ? `导出失败：${cause.message}` : '导出失败');
    }
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    setMessage(null);
    setFormError(null);
    try {
      const payload = JSON.parse(await readTextFile(file)) as Record<string, unknown>;
      await apiClient.importBackup(payload);
      setMessage('备份已恢复');
      reloadPage();
    } catch (cause) {
      setFormError(cause instanceof Error ? `导入失败：${cause.message}` : '导入失败');
    }
  }, []);

  if (settings === null) {
    return (
      <section>
        <div className="page-heading">
          <h1>设置</h1>
        </div>
        <div className="empty-state">{message ?? '正在加载设置…'}</div>
      </section>
    );
  }

  return (
    <section>
      <div className="page-heading">
        <h1>设置</h1>
      </div>

      {message !== null && (
        <div className="banner banner--info" role="status">
          {message}
        </div>
      )}
      {formError !== null && (
        <div className="banner banner--warn" role="alert">
          {formError}
        </div>
      )}

      <div className="card">
        <div className="field">
          <label className="field__label" htmlFor="page-size">
            每页单词数
          </label>
          <input
            id="page-size"
            type="number"
            min={1}
            max={100}
            value={pageSize}
            onChange={(event) => setPageSize(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="intervals">
            推荐间隔（天）
          </label>
          <input id="intervals" type="text" inputMode="numeric" value={intervals} onChange={(event) => setIntervals(event.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="theme">
            主题
          </label>
          <select id="theme" value={settings.theme} onChange={(event) => applyTheme(event.target.value as ThemePreference)}>
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="font-size">
            字号
          </label>
          <select id="font-size" value={settings.font_size} onChange={(event) => applyFontSize(event.target.value as FontSizePreference)}>
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
        </div>
        <div className="field">
          <span className="field__label" id="accent-label">
            主题颜色
          </span>
          <div className="accent-row" role="radiogroup" aria-labelledby="accent-label">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={accent === preset.id}
                className={`accent-swatch accent-swatch--${preset.id}${accent === preset.id ? ' is-selected' : ''}`}
                onClick={() => handleAccent(preset.id)}
              >
                <span className="accent-swatch__dot" aria-hidden="true" />
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => void handleSave()}>
          保存设置
        </button>
      </div>

      <div className="card">
        <h2 className="card__title">词库优先级</h2>
        {Object.entries(priorities).map(([vocabularyId, priority]) => {
          const name = vocabularyNames[Number(vocabularyId)] ?? `词库 #${vocabularyId}`;
          return (
            <div className="field" key={vocabularyId}>
              <label className="field__label" htmlFor={`priority-${vocabularyId}`}>
                {name} 优先级
              </label>
              <input
                id={`priority-${vocabularyId}`}
                type="number"
                min={0}
                value={priority}
                onChange={(event) =>
                  setPriorities((current) => ({ ...current, [vocabularyId]: Number(event.target.value) }))
                }
              />
            </div>
          );
        })}
        <Link className="btn btn--ghost" to="/vocabularies">
          管理词库
        </Link>
      </div>

      <div className="card">
        <h2 className="card__title">账号</h2>
        <p className="word-row__meta">本地模式无需登录；服务器模式使用用户名密码换取访问令牌。</p>
        {hasToken ? (
          <button type="button" className="btn btn--ghost-danger" onClick={() => void handleLogout()}>
            退出登录
          </button>
        ) : (
          <>
            <div className="field">
              <label className="field__label" htmlFor="username">
                用户名
              </label>
              <input id="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="password">
                密码
              </label>
              <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <button type="button" className="btn" disabled={username.length === 0 || password.length === 0} onClick={() => void handleLogin()}>
              登录
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="card__title">备份与恢复</h2>
        <button type="button" className="btn" onClick={() => void handleExport()}>
          导出 JSON 备份
        </button>
        <div className="field" style={{ marginTop: '0.75rem' }}>
          <label className="field__label" htmlFor="backup-file">
            导入 JSON 备份
          </label>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportFile(file);
              }
              event.target.value = '';
            }}
          />
        </div>
      </div>
    </section>
  );
}
