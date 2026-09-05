// PWA Service Worker 注册：仅在支持的浏览器注册，失败静默降级为普通网页
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        /* 注册失败时应用仍可在线使用 */
      });
    },
    { once: true },
  );
}
