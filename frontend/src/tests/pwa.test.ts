import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../lib/pwa';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.restoreAllMocks();
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
