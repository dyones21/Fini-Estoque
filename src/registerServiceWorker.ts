export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registrado com sucesso. Escopo:', registration.scope);
        })
        .catch((error) => {
          console.warn('[PWA] Não foi possível registrar o Service Worker:', error);
        });
    });
  }
}
