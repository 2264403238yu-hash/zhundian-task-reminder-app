const CACHE_NAME = 'zhundian-shell-v2';
const VIBRATION_PATTERN = [260, 120, 260, 120, 480];
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const DB_NAME = 'zhundian-reminder';
const DB_VERSION = 1;
const DB_STORE = 'kv';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const database = await openDatabase();
  const value = await new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readonly');
    const request = transaction.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value;
}

async function idbSet(key, value) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function formatDue(dueAt) {
  const date = new Date(dueAt);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `今天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

async function checkScheduledReminders() {
  try {
    const tasks = await idbGet('tasks');
    const settings = await idbGet('settings') || {};
    const notificationLog = await idbGet('notification-log') || {};
    if (!Array.isArray(tasks)) return;
    const now = Date.now();
    let changed = false;
    const vibrationEnabled = settings.vibrationEnabled !== false;

    for (const task of tasks) {
      const remindAt = new Date(task.remindAt).getTime();
      const dueAt = new Date(task.dueAt).getTime();
      const alreadySent = notificationLog[task.id] === task.remindAt;
      const appAlreadySent = task.notificationAt === task.remindAt;
      const freshEnough = now - remindAt < 48 * 60 * 60 * 1000;
      if (appAlreadySent && !alreadySent) {
        notificationLog[task.id] = task.remindAt;
        changed = true;
        continue;
      }
      if (task.completed || !Number.isFinite(remindAt) || remindAt > now || alreadySent || !freshEnough) continue;

      const overdue = Number.isFinite(dueAt) && dueAt < now;
      await self.registration.showNotification(`准点提醒：${task.title}`, {
        body: overdue ? `已逾期 · ${formatDue(task.dueAt)}${task.notes ? ` · ${task.notes}` : ''}` : `截止 ${formatDue(task.dueAt)}${task.notes ? ` · ${task.notes}` : ''}`,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: `zhundian-${task.id}-${task.remindAt}`,
        renotify: true,
        requireInteraction: true,
        ...(vibrationEnabled ? { vibrate: VIBRATION_PATTERN } : {}),
        data: { url: './', taskId: task.id, remindAt: task.remindAt }
      });
      notificationLog[task.id] = task.remindAt;
      changed = true;
    }

    if (changed) await idbSet('notification-log', notificationLog);
  } catch (error) {
    console.warn('Scheduled reminder check failed:', error);
  }
}

async function scheduleTaskNotification(task, settings) {
  if (typeof TimestampTrigger !== 'function' || !task || task.completed) return false;
  const remindAt = new Date(task.remindAt).getTime();
  if (!Number.isFinite(remindAt) || remindAt <= Date.now()) return false;

  const existing = await self.registration.getNotifications();
  existing
    .filter((notification) => notification.data?.taskId === task.id)
    .forEach((notification) => notification.close());

  await self.registration.showNotification(`准点提醒：${task.title}`, {
    body: `${formatDue(task.dueAt)}${task.notes ? ` · ${task.notes}` : ''}`,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: `zhundian-${task.id}`,
    renotify: true,
    requireInteraction: true,
    ...(settings?.vibrationEnabled !== false ? { vibrate: VIBRATION_PATTERN } : {}),
    showTrigger: new TimestampTrigger(remindAt),
    data: { url: './', taskId: task.id, remindAt: task.remindAt }
  });
  return true;
}

async function cancelScheduledNotification(taskId) {
  const notifications = await self.registration.getNotifications();
  notifications
    .filter((notification) => notification.data?.taskId === taskId)
    .forEach((notification) => notification.close());
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_REMINDER') {
    event.waitUntil(scheduleTaskNotification(event.data.task, event.data.settings || {}));
  }
  if (event.data?.type === 'CANCEL_REMINDER') {
    event.waitUntil(cancelScheduledNotification(event.data.taskId));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'task-reminders') event.waitUntil(checkScheduledReminders());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'task-reminders') event.waitUntil(checkScheduledReminders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.postMessage({ type: 'TASK_REMINDER_CLICKED' });
        return existing.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
