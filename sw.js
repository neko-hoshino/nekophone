const CACHE_NAME = 'neko-phone-v2'; // 🌟 升级版本号，强行抛弃旧缓存

self.addEventListener('install', event => {
  self.skipWaiting(); // 🌟 强行立刻接管浏览器，不等了！
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 清除所有旧版本的垃圾缓存
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});