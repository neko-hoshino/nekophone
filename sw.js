// 真正的云端推送天线
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'NekoPhone';
  const options = {
    body: data.body || '你收到了一条新消息',
    icon: data.icon || 'https://api.dicebear.com/7.x/shapes/svg?seed=success',
    badge: data.icon || 'https://api.dicebear.com/7.x/shapes/svg?seed=success',
    vibrate: [200, 100, 200] // 让手机震动！
  };
  
  // 强行唤醒苹果/安卓的系统级通知面板！
  event.waitUntil(self.registration.showNotification(title, options));
});

// 监听通知被点击的事件
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // 以后可以在这里写：点击通知自动打开小手机界面
});