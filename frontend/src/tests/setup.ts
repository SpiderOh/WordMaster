import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom 未实现 matchMedia，主题解析与设置页需要最小可用实现
if (typeof window.matchMedia !== 'function') {
  const mediaQueryStub = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mediaQueryStub,
  });
}
