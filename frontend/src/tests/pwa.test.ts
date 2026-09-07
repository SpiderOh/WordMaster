import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../lib/pwa';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock('../lib/pwa');
  vi.doUnmock('react-dom/client');
});

describe('PWA Service Worker 注册', () => {
  it('浏览器不支持 Service Worker 时安全返回', () => {
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it('支持时在页面 load 后注册 /service-worker.js', () => {
    const register = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register } as unknown as ServiceWorkerContainer,
    });
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/service-worker.js');
  });

  it('注册失败时静默降级不抛错', () => {
    const register = vi.fn(() => Promise.reject(new Error('sw failed')));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register } as unknown as ServiceWorkerContainer,
    });
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe('应用入口的 Service Worker 注册', () => {
  async function loadMain(production: boolean): Promise<ReturnType<typeof vi.fn>> {
    const registerServiceWorker = vi.fn();
    vi.stubEnv('PROD', production);
    vi.doMock('../lib/pwa', () => ({ registerServiceWorker }));
    vi.doMock('react-dom/client', () => ({
      default: { createRoot: () => ({ render: vi.fn() }) },
    }));

    await import('../main');
    return registerServiceWorker;
  }

  it('开发环境不触发 Service Worker 注册', async () => {
    const registerServiceWorker = await loadMain(false);
    expect(registerServiceWorker).not.toHaveBeenCalled();
  });

  it('生产环境触发 Service Worker 注册', async () => {
    const registerServiceWorker = await loadMain(true);
    expect(registerServiceWorker).toHaveBeenCalledTimes(1);
  });
});
