(() => {
  'use strict';

  const TASKS_KEY = 'zhundian.tasks.v1';
  const SETTINGS_KEY = 'zhundian.settings.v1';
  const DB_NAME = 'zhundian-reminder';
  const DB_VERSION = 1;
  const DB_STORE = 'kv';
  const REMINDER_CHECK_INTERVAL = 20_000;

  const DEFAULT_SETTINGS = {
    soundEnabled: true,
    vibrationEnabled: true,
    theme: 'system',
    defaultReminderOffset: 30
  };

  const state = {
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    filter: 'today',
    search: '',
    editingId: null,
    reminderQueue: [],
    activeReminderId: null,
    calendarTaskId: null,
    deferredInstallPrompt: null,
    toastTimer: null,
    toastAction: null,
    audioContext: null
  };

  const elements = {
    todayDate: document.querySelector('#todayDate'),
    greetingText: document.querySelector('#greetingText'),
    summaryText: document.querySelector('#summaryText'),
    progressRing: document.querySelector('#progressRing'),
    progressPercent: document.querySelector('#progressPercent'),
    activeCount: document.querySelector('#activeCount'),
    overdueCount: document.querySelector('#overdueCount'),
    completedCount: document.querySelector('#completedCount'),
    taskList: document.querySelector('#taskList'),
    filterRow: document.querySelector('#filterRow'),
    searchToggle: document.querySelector('#searchToggle'),
    searchPanel: document.querySelector('#searchPanel'),
    searchInput: document.querySelector('#searchInput'),
    clearSearchButton: document.querySelector('#clearSearchButton'),
    addTaskButton: document.querySelector('#addTaskButton'),
    settingsTopButton: document.querySelector('#settingsTopButton'),
    settingsNavButton: document.querySelector('#settingsNavButton'),
    taskDialog: document.querySelector('#taskDialog'),
    taskForm: document.querySelector('#taskForm'),
    taskDialogEyebrow: document.querySelector('#taskDialogEyebrow'),
    taskDialogTitle: document.querySelector('#taskDialogTitle'),
    taskTitle: document.querySelector('#taskTitle'),
    taskDueDate: document.querySelector('#taskDueDate'),
    taskDueTime: document.querySelector('#taskDueTime'),
    taskReminderOffset: document.querySelector('#taskReminderOffset'),
    taskCategory: document.querySelector('#taskCategory'),
    taskRepeat: document.querySelector('#taskRepeat'),
    taskNotes: document.querySelector('#taskNotes'),
    saveTaskButton: document.querySelector('#saveTaskButton'),
    reminderDialog: document.querySelector('#reminderDialog'),
    reminderTitle: document.querySelector('#reminderTitle'),
    reminderTime: document.querySelector('#reminderTime'),
    reminderNote: document.querySelector('#reminderNote'),
    reminderDoneButton: document.querySelector('#reminderDoneButton'),
    reminderSnoozeButton: document.querySelector('#reminderSnoozeButton'),
    reminderCloseButton: document.querySelector('#reminderCloseButton'),
    settingsDialog: document.querySelector('#settingsDialog'),
    notificationStatus: document.querySelector('#notificationStatus'),
    enableNotificationsButton: document.querySelector('#enableNotificationsButton'),
    testNotificationButton: document.querySelector('#testNotificationButton'),
    soundToggle: document.querySelector('#soundToggle'),
    vibrationToggle: document.querySelector('#vibrationToggle'),
    calendarDialog: document.querySelector('#calendarDialog'),
    calendarTaskTitle: document.querySelector('#calendarTaskTitle'),
    calendarTaskTime: document.querySelector('#calendarTaskTime'),
    systemCalendarButton: document.querySelector('#systemCalendarButton'),
    googleCalendarLink: document.querySelector('#googleCalendarLink'),
    downloadIcsButton: document.querySelector('#downloadIcsButton'),
    themeOptions: document.querySelector('#themeOptions'),
    backgroundPermissionButton: document.querySelector('#backgroundPermissionButton'),
    backgroundButtonTitle: document.querySelector('#backgroundButtonTitle'),
    backgroundButtonSubtitle: document.querySelector('#backgroundButtonSubtitle'),
    installAppButton: document.querySelector('#installAppButton'),
    installHint: document.querySelector('#installHint'),
    exportDataButton: document.querySelector('#exportDataButton'),
    importDataButton: document.querySelector('#importDataButton'),
    importFileInput: document.querySelector('#importFileInput'),
    clearDataButton: document.querySelector('#clearDataButton'),
    toast: document.querySelector('#toast'),
    toastMessage: document.querySelector('#toastMessage'),
    toastAction: document.querySelector('#toastAction')
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function randomId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfDay(date = new Date()) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function endOfDay(date = new Date()) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function addMonthsClamped(date, amount) {
    const originalDay = date.getDate();
    const result = new Date(date);
    result.setDate(1);
    result.setMonth(result.getMonth() + amount);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(originalDay, lastDay));
    return result;
  }

  function isSameDay(a, b) {
    const dateA = parseDate(a);
    const dateB = parseDate(b);
    if (!dateA || !dateB) return false;
    return dateA.getFullYear() === dateB.getFullYear()
      && dateA.getMonth() === dateB.getMonth()
      && dateA.getDate() === dateB.getDate();
  }

  function toDateInputValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function toTimeInputValue(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatClock(dateValue) {
    const date = parseDate(dateValue);
    if (!date) return '';
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDateHeading(date = new Date()) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
  }

  function formatDueDate(dateValue) {
    const date = parseDate(dateValue);
    if (!date) return '未设置时间';
    const now = new Date();
    const tomorrow = addDays(now, 1);
    const clock = formatClock(date);
    if (isSameDay(date, now)) return `今天 ${clock}`;
    if (isSameDay(date, tomorrow)) return `明天 ${clock}`;
    if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
  }

  function humanDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    if (seconds < 60) return '不到 1 分钟';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours < 24) return restMinutes ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`;
  }

  function relativeDueText(task, now = Date.now()) {
    const due = parseDate(task.dueAt);
    if (!due) return '未设置时间';
    if (task.completed) return task.completedAt ? `完成于 ${formatClock(task.completedAt)}` : '已完成';
    const difference = due.getTime() - now;
    if (difference < 0) return `已逾期 ${humanDuration(-difference)}`;
    if (difference < 60_000) return '现在到期';
    return `${humanDuration(difference)}后`;
  }

  function reminderOffsetLabel(offset) {
    const minutes = Number(offset) || 0;
    if (minutes === 0) return '准时';
    if (minutes === 60) return '提前 1 小时';
    if (minutes === 180) return '提前 3 小时';
    if (minutes === 1440) return '提前 1 天';
    return `提前 ${minutes} 分钟`;
  }

  function repeatLabel(repeat) {
    return {
      none: '不重复',
      daily: '每天',
      weekly: '每周',
      monthly: '每月'
    }[repeat] || '不重复';
  }

  function priorityLabel(priority) {
    return {
      high: '高优先',
      medium: '中优先',
      low: '低优先'
    }[priority] || '中优先';
  }

  function icon(name) {
    const icons = {
      clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v15H4z"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
      snooze: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg>',
      edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5L9 20H4v-5z"/><path d="m13 6 5 5"/></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
      repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
      folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
      restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
    };
    return icons[name] || '';
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbSet(key, value) {
    try {
      const database = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(DB_STORE, 'readwrite');
        transaction.objectStore(DB_STORE).put(value, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    } catch (error) {
      console.warn('IndexedDB write skipped:', error);
    }
  }

  async function idbGet(key) {
    try {
      const database = await openDatabase();
      const value = await new Promise((resolve, reject) => {
        const transaction = database.transaction(DB_STORE, 'readonly');
        const request = transaction.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return value;
    } catch (error) {
      console.warn('IndexedDB read skipped:', error);
      return undefined;
    }
  }

  function normalizeTask(task) {
    if (!task || typeof task !== 'object') return null;
    const dueAt = parseDate(task.dueAt);
    if (!dueAt || !String(task.title || '').trim()) return null;
    const reminderOffset = Number.isFinite(Number(task.reminderOffset)) ? Number(task.reminderOffset) : 30;
    const remindAt = parseDate(task.remindAt) || new Date(dueAt.getTime() - reminderOffset * 60_000);
    return {
      id: String(task.id || randomId()),
      title: String(task.title).trim().slice(0, 80),
      notes: String(task.notes || '').slice(0, 300),
      dueAt: dueAt.toISOString(),
      reminderOffset,
      remindAt: remindAt.toISOString(),
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
      category: String(task.category || '生活').trim().slice(0, 16) || '生活',
      repeat: ['none', 'daily', 'weekly', 'monthly'].includes(task.repeat) ? task.repeat : 'none',
      completed: Boolean(task.completed),
      completedAt: parseDate(task.completedAt)?.toISOString() || null,
      notificationAt: parseDate(task.notificationAt)?.toISOString() || null,
      createdAt: parseDate(task.createdAt)?.toISOString() || new Date().toISOString(),
      updatedAt: parseDate(task.updatedAt)?.toISOString() || new Date().toISOString()
    };
  }

  function normalizeSettings(settings) {
    return {
      ...DEFAULT_SETTINGS,
      ...(settings && typeof settings === 'object' ? settings : {}),
      soundEnabled: settings?.soundEnabled !== false,
      vibrationEnabled: settings?.vibrationEnabled !== false,
      theme: ['system', 'light', 'dark'].includes(settings?.theme) ? settings.theme : 'system',
      defaultReminderOffset: Number.isFinite(Number(settings?.defaultReminderOffset))
        ? Number(settings.defaultReminderOffset)
        : 30
    };
  }

  async function loadState() {
    let tasks = [];
    let settings = { ...DEFAULT_SETTINGS };
    const localTasks = localStorage.getItem(TASKS_KEY);
    const localSettings = localStorage.getItem(SETTINGS_KEY);

    if (localTasks) {
      try {
        const parsed = JSON.parse(localTasks);
        if (Array.isArray(parsed)) tasks = parsed.map(normalizeTask).filter(Boolean);
      } catch (error) {
        console.warn('Could not parse local tasks:', error);
      }
    } else {
      const storedTasks = await idbGet('tasks');
      if (Array.isArray(storedTasks)) tasks = storedTasks.map(normalizeTask).filter(Boolean);
    }

    if (localSettings) {
      try {
        settings = normalizeSettings(JSON.parse(localSettings));
      } catch (error) {
        console.warn('Could not parse local settings:', error);
      }
    } else {
      settings = normalizeSettings(await idbGet('settings'));
    }

    state.tasks = tasks;
    state.settings = settings;
  }

  async function saveState() {
    state.tasks.forEach((task) => {
      task.updatedAt = task.updatedAt || new Date().toISOString();
    });
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(state.tasks));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (error) {
      console.warn('LocalStorage write failed:', error);
    }
    await Promise.all([
      idbSet('tasks', state.tasks),
      idbSet('settings', state.settings)
    ]);
  }

  function getTask(taskId) {
    return state.tasks.find((task) => task.id === taskId);
  }

  function isTodayTask(task) {
    return isSameDay(task.dueAt, new Date());
  }

  function getFilteredTasks() {
    const now = new Date();
    const endToday = endOfDay(now);
    const search = state.search.trim().toLocaleLowerCase('zh-CN');
    let tasks = state.tasks.filter((task) => state.filter === 'completed' ? task.completed : !task.completed);

    if (state.filter === 'today') {
      tasks = tasks.filter((task) => new Date(task.dueAt) <= endToday);
    } else if (state.filter === 'upcoming') {
      tasks = tasks.filter((task) => new Date(task.dueAt) > endToday);
    } else if (state.filter === 'overdue') {
      tasks = tasks.filter((task) => new Date(task.dueAt).getTime() < now.getTime());
    }

    if (search) {
      tasks = tasks.filter((task) => {
        const haystack = `${task.title} ${task.notes} ${task.category}`.toLocaleLowerCase('zh-CN');
        return haystack.includes(search);
      });
    }

    return tasks.sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      if (state.filter === 'completed') return new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt);
      return new Date(a.dueAt) - new Date(b.dueAt);
    });
  }
  function groupKeyForTask(task, now = new Date()) {
    if (task.completed) return 'completed';
    const due = parseDate(task.dueAt);
    if (!due) return 'later';
    if (due.getTime() < now.getTime()) return 'overdue';
    if (isSameDay(due, now)) return 'today';
    if (isSameDay(due, addDays(now, 1))) return 'tomorrow';
    return 'later';
  }

  function groupTasks(tasks) {
    const groupMeta = {
      overdue: { order: 1, label: '需要补上' },
      today: { order: 2, label: '今天' },
      tomorrow: { order: 3, label: '明天' },
      later: { order: 4, label: '接下来' },
      completed: { order: 5, label: '已完成' }
    };
    const groups = new Map();
    tasks.forEach((task) => {
      const key = groupKeyForTask(task);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => groupMeta[a].order - groupMeta[b].order)
      .map(([key, groupTaskList]) => ({ key, ...groupMeta[key], tasks: groupTaskList }));
  }

  function renderHeader() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const activeTasks = state.tasks.filter((task) => !task.completed);
    const todayActive = activeTasks.filter(isTodayTask);
    const overdue = activeTasks.filter((task) => new Date(task.dueAt).getTime() < now.getTime());
    const completedToday = state.tasks.filter((task) => task.completed && isSameDay(task.completedAt, now));
    const todayTotal = todayActive.length + completedToday.length;
    const progress = todayTotal ? Math.round((completedToday.length / todayTotal) * 100) : 0;
    elements.todayDate.textContent = formatDateHeading(now);
    elements.activeCount.textContent = String(activeTasks.length);
    elements.overdueCount.textContent = String(overdue.length);
    elements.completedCount.textContent = String(completedToday.length);
    elements.progressPercent.textContent = `${progress}%`;
    elements.progressRing.style.setProperty('--progress', `${progress}%`);
    elements.progressRing.setAttribute('aria-label', `今日完成进度 ${progress}%`);

    if (todayActive.length > 0) {
      elements.greetingText.textContent = `${greeting}，今天有 ${todayActive.length} 件事`;
      const nextTask = [...todayActive].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
      const detail = overdue.length
        ? `其中 ${overdue.length} 件已经逾期，先处理最要紧的。`
        : `下一件：${nextTask.title} · ${formatDueDate(nextTask.dueAt)}`;
      elements.summaryText.textContent = detail;
    } else if (completedToday.length > 0) {
      elements.greetingText.textContent = `${greeting}，今天的任务都完成了`;
      elements.summaryText.textContent = `已认真完成 ${completedToday.length} 件事，给自己一点休息。`;
    } else if (activeTasks.length > 0) {
      const nextTask = [...activeTasks].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
      elements.greetingText.textContent = `${greeting}，把重要的事安排好`;
      elements.summaryText.textContent = `目前有 ${activeTasks.length} 件待办，下一件在 ${formatDueDate(nextTask.dueAt)}。`;
    } else {
      elements.greetingText.textContent = `${greeting}，今天从一件小事开始`;
      elements.summaryText.textContent = '还没有任务，点击下方加号添加第一件吧。';
    }
  }

  function renderFilterState() {
    document.querySelectorAll('[data-filter]').forEach((button) => {
      const isActive = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', isActive);
      if (button.classList.contains('nav-item')) button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  function renderTaskCard(task) {
    const due = parseDate(task.dueAt);
    const now = Date.now();
    const overdue = !task.completed && due && due.getTime() < now;
    const dueSoon = !task.completed && due && due.getTime() >= now && due.getTime() - now < 60 * 60 * 1000;
    const dueClass = task.completed ? 'completed' : overdue ? 'overdue' : dueSoon ? 'due-soon' : '';
    const reminderText = task.notificationAt && task.notificationAt === task.remindAt
      ? '已提醒'
      : `${reminderOffsetLabel(task.reminderOffset)}提醒`;
    const actions = task.completed
      ? `
        <button class="task-action" type="button" data-action="toggle">${icon('restore')}恢复</button>
        <button class="task-action danger" type="button" data-action="delete">${icon('trash')}删除</button>
      `
      : `
        <button class="task-action" type="button" data-action="snooze">${icon('snooze')}稍后 10 分钟</button>
        <button class="task-action" type="button" data-action="calendar">${icon('calendar')}加入日历</button>
        <button class="task-action" type="button" data-action="edit">${icon('edit')}编辑</button>
        <button class="task-action danger" type="button" data-action="delete">${icon('trash')}删除</button>
      `;
    return `
      <article class="task-card priority-${escapeHtml(task.priority)} ${overdue ? 'is-overdue' : ''} ${task.completed ? 'is-completed' : ''}" data-task-id="${escapeHtml(task.id)}">
        <button class="check-button ${task.completed ? 'is-checked' : ''}" type="button" data-action="toggle" aria-label="${task.completed ? '恢复任务' : '标记任务完成'}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.2 4.2L19 6.7"/></svg>
        </button>
        <div class="task-content">
          <div class="task-topline">
            <h3 class="task-title">${escapeHtml(task.title)}</h3>
            <span class="priority-label">${priorityLabel(task.priority)}</span>
          </div>
          ${task.notes ? `<p class="task-note">${escapeHtml(task.notes)}</p>` : ''}
          <div class="task-meta">
            <span class="meta-pill ${dueClass}">${icon('clock')}${relativeDueText(task, now)}</span>
            <span class="meta-pill">${icon('bell')}${reminderText}</span>
            <span class="meta-pill">${icon('folder')}${escapeHtml(task.category)}</span>
            ${task.repeat !== 'none' ? `<span class="meta-pill">${icon('repeat')}${repeatLabel(task.repeat)}</span>` : ''}
          </div>
          <div class="task-actions">${actions}</div>
        </div>
      </article>
    `;
  }

  function renderTaskList() {
    const tasks = getFilteredTasks();
    if (!tasks.length) {
      const emptyMessages = {
        all: ['今天没有未完成任务', '添加一件要做的事，准点会替你记住。'],
        today: ['今天暂时没有任务', '留白也很好，或者添加一件真正重要的小事。'],
        upcoming: ['接下来还没有安排', '把未来的事情先放进来，到点再提醒你。'],
        overdue: ['没有逾期任务', '节奏很好，继续保持。'],
        completed: ['还没有完成记录', '完成第一件任务后，它会出现在这里。']
      };
      const [title, description] = emptyMessages[state.filter] || emptyMessages.today;
      elements.taskList.innerHTML = `
        <div class="empty-state">
          <div class="empty-illustration">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>
          </div>
          <h2>${title}</h2>
          <p>${description}</p>
          <button class="button button-primary button-small" type="button" data-action="empty-add">添加任务</button>
        </div>
      `;
      return;
    }
    const groups = groupTasks(tasks);
    elements.taskList.innerHTML = groups.map((group) => `
      <section class="task-group">
        <div class="group-heading">
          <h2>${group.label}</h2>
          <span>${group.tasks.length}</span>
        </div>
        ${group.tasks.map(renderTaskCard).join('')}
      </section>
    `).join('');
  }

  function render() {
    renderHeader();
    renderFilterState();
    renderTaskList();
    elements.searchToggle.setAttribute('aria-expanded', String(!elements.searchPanel.hidden));
  }

  function setFilter(filter) {
    if (!['all', 'today', 'upcoming', 'overdue', 'completed'].includes(filter)) return;
    state.filter = filter;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(message, actionLabel = '', action = null) {
    window.clearTimeout(state.toastTimer);
    state.toastAction = action;
    elements.toastMessage.textContent = message;
    elements.toastAction.textContent = actionLabel;
    elements.toastAction.hidden = !actionLabel;
    elements.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove('is-visible');
      state.toastAction = null;
    }, actionLabel ? 5500 : 2600);
  }
  function prepareDefaultDueDate() {
    const due = new Date(Date.now() + 60 * 60 * 1000);
    due.setMinutes(0, 0, 0);
    if (due.getTime() <= Date.now() + 5 * 60 * 1000) due.setHours(due.getHours() + 1);
    return due;
  }

  function openTaskDialog(task = null) {
    state.editingId = task?.id || null;
    elements.taskForm.reset();
    const defaultDue = prepareDefaultDueDate();
    elements.taskTitle.value = task?.title || '';
    elements.taskDueDate.value = task ? toDateInputValue(parseDate(task.dueAt)) : toDateInputValue(defaultDue);
    elements.taskDueTime.value = task ? toTimeInputValue(parseDate(task.dueAt)) : toTimeInputValue(defaultDue);
    elements.taskReminderOffset.value = String(task?.reminderOffset ?? state.settings.defaultReminderOffset);
    elements.taskCategory.value = task?.category || '生活';
    elements.taskRepeat.value = task?.repeat || 'none';
    elements.taskNotes.value = task?.notes || '';
    const priority = task?.priority || 'medium';
    const priorityInput = elements.taskForm.querySelector(`input[name="priority"][value="${priority}"]`);
    if (priorityInput) priorityInput.checked = true;
    elements.taskDialogEyebrow.textContent = task ? '编辑任务' : '新任务';
    elements.taskDialogTitle.textContent = task ? '调整一下安排' : '添加一件要做的事';
    elements.saveTaskButton.textContent = task ? '保存修改' : '保存任务';
    if (!elements.taskDialog.open) elements.taskDialog.showModal();
    window.setTimeout(() => elements.taskTitle.focus(), 80);
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function buildTaskFromForm(existingTask = null) {
    const title = elements.taskTitle.value.trim();
    if (!title) {
      elements.taskTitle.focus();
      showToast('先写下任务名称');
      return null;
    }
    const dueAt = new Date(`${elements.taskDueDate.value}T${elements.taskDueTime.value}:00`);
    if (Number.isNaN(dueAt.getTime())) {
      showToast('请选择有效的截止时间');
      return null;
    }
    const reminderOffset = Number(elements.taskReminderOffset.value) || 0;
    const remindAt = new Date(dueAt.getTime() - reminderOffset * 60_000);
    const now = new Date().toISOString();
    const priority = elements.taskForm.querySelector('input[name="priority"]:checked')?.value || 'medium';
    const reminderChanged = !existingTask
      || existingTask.remindAt !== remindAt.toISOString()
      || existingTask.dueAt !== dueAt.toISOString();
    return {
      ...(existingTask || {}),
      id: existingTask?.id || randomId(),
      title,
      notes: elements.taskNotes.value.trim(),
      dueAt: dueAt.toISOString(),
      reminderOffset,
      remindAt: remindAt.toISOString(),
      priority,
      category: elements.taskCategory.value.trim() || '生活',
      repeat: elements.taskRepeat.value || 'none',
      completed: Boolean(existingTask?.completed),
      completedAt: existingTask?.completedAt || null,
      notificationAt: reminderChanged ? null : existingTask?.notificationAt || null,
      createdAt: existingTask?.createdAt || now,
      updatedAt: now
    };
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    const existing = state.editingId ? getTask(state.editingId) : null;
    const task = buildTaskFromForm(existing);
    if (!task) return;
    if (existing) {
      const index = state.tasks.findIndex((item) => item.id === existing.id);
      if (index >= 0) state.tasks[index] = task;
      showToast('任务已更新');
    } else {
      state.tasks.push(task);
      showToast('任务已加入，准点会记住');
    }
    await saveState();
    scheduleTaskNotification(task);
    closeDialog(elements.taskDialog);
    render();
    window.setTimeout(processReminders, 150);
  }

  function getNextRecurringDue(dueValue, repeat) {
    const due = parseDate(dueValue);
    if (!due || repeat === 'none') return null;
    const now = new Date();
    let next = new Date(due);
    let guard = 0;
    do {
      if (repeat === 'daily') next = addDays(next, 1);
      if (repeat === 'weekly') next = addDays(next, 7);
      if (repeat === 'monthly') next = addMonthsClamped(next, 1);
      guard += 1;
    } while (next <= now && guard < 1000);
    return next;
  }

  function createNextRecurringTask(task) {
    const nextDue = getNextRecurringDue(task.dueAt, task.repeat);
    if (!nextDue) return null;
    const nextReminder = new Date(nextDue.getTime() - task.reminderOffset * 60_000);
    return {
      ...task,
      id: randomId(),
      dueAt: nextDue.toISOString(),
      remindAt: nextReminder.toISOString(),
      completed: false,
      completedAt: null,
      notificationAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function toggleTask(taskId) {
    const task = getTask(taskId);
    if (!task) return;
    cancelTaskNotification(taskId);
    if (task.completed) {
      task.completed = false;
      task.completedAt = null;
      task.notificationAt = null;
      scheduleTaskNotification(task);
      showToast('任务已恢复');
    } else {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      const nextTask = createNextRecurringTask(task);
      if (nextTask) {
        state.tasks.push(nextTask);
        scheduleTaskNotification(nextTask);
      }
      showToast(task.repeat === 'none' ? '完成一件，做得漂亮' : '已完成，下一周期也安排好了');
    }
    await saveState();
    render();
    if (document.visibilityState === 'visible') window.setTimeout(processReminders, 150);
  }

  async function snoozeTask(taskId, minutes = 10) {
    const task = getTask(taskId);
    if (!task || task.completed) return;
    cancelTaskNotification(taskId);
    task.remindAt = new Date(Date.now() + minutes * 60_000).toISOString();
    task.notificationAt = null;
    task.updatedAt = new Date().toISOString();
    state.reminderQueue = state.reminderQueue.filter((item) => item.id !== taskId);
    await saveState();
    scheduleTaskNotification(task);
    render();
    showToast(`${minutes} 分钟后会再提醒你`);
  }

  async function deleteTask(taskId) {
    const index = state.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const [deleted] = state.tasks.splice(index, 1);
    cancelTaskNotification(taskId);
    state.reminderQueue = state.reminderQueue.filter((item) => item.id !== taskId);
    await saveState();
    render();
    showToast('任务已删除', '撤销', async () => {
      state.tasks.splice(Math.min(index, state.tasks.length), 0, deleted);
      await saveState();
      render();
      showToast('已撤销删除');
    });
  }

  async function handleTaskListClick(event) {
    const emptyAdd = event.target.closest('[data-action="empty-add"]');
    if (emptyAdd) {
      openTaskDialog();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const card = actionButton.closest('[data-task-id]');
    if (!card) return;
    const taskId = card.dataset.taskId;
    const action = actionButton.dataset.action;
    const task = getTask(taskId);
    if (action === 'toggle') await toggleTask(taskId);
    if (action === 'snooze') await snoozeTask(taskId, 10);
    if (action === 'calendar' && task) openTaskCalendarDialog(task);
    if (action === 'edit' && task) openTaskDialog(task);
    if (action === 'delete') await deleteTask(taskId);
  }

  function applyTheme() {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const resolved = state.settings.theme === 'system'
      ? (prefersDark ? 'dark' : 'light')
      : state.settings.theme;
    document.body.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', resolved === 'dark' ? '#17161b' : '#28262f');
    const selected = elements.themeOptions.querySelector(`input[value="${state.settings.theme}"]`);
    if (selected) selected.checked = true;
  }
  function updateNotificationStatus() {
    const supported = 'Notification' in window;
    const permission = supported ? Notification.permission : 'unsupported';
    const labels = {
      granted: ['已开启', true],
      denied: ['已关闭', false],
      default: ['未开启', false],
      unsupported: ['不支持', false]
    };
    const [label, isOn] = labels[permission] || labels.default;
    elements.notificationStatus.textContent = label;
    elements.notificationStatus.classList.toggle('is-on', isOn);
    elements.enableNotificationsButton.textContent = permission === 'granted' ? '重新检查权限' : '开启通知';
    elements.enableNotificationsButton.disabled = permission === 'unsupported';
  }

  const VIBRATION_PATTERN = [260, 120, 260, 120, 480];

  function vibrateDevice(pattern = VIBRATION_PATTERN) {
    if (!state.settings.vibrationEnabled || !navigator.vibrate) return;
    navigator.vibrate(pattern);
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      showToast('当前浏览器不支持系统通知');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      updateNotificationStatus();
      if (permission === 'granted') showToast('通知已开启');
      else showToast('通知没有开启，可在浏览器设置中修改');
      return permission === 'granted';
    } catch (error) {
      console.warn(error);
      showToast('无法请求通知权限');
      return false;
    }
  }

  async function showSystemNotification(title, options) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const notificationOptions = {
      badge: './icons/icon-192.png',
      icon: './icons/icon-192.png',
      requireInteraction: true,
      ...(state.settings.vibrationEnabled ? { vibrate: VIBRATION_PATTERN } : {}),
      ...options
    };
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, notificationOptions);
      } else {
        const notification = new Notification(title, notificationOptions);
        notification.onclick = () => window.focus();
      }
      return true;
    } catch (error) {
      console.warn('Notification failed:', error);
      return false;
    }
  }

  async function testNotification() {
    if (!('Notification' in window)) {
      showToast('当前浏览器不支持系统通知');
      return;
    }
    const allowed = Notification.permission === 'granted' || await enableNotifications();
    if (!allowed) return;
    await showSystemNotification('准点测试提醒', {
      body: state.settings.vibrationEnabled
        ? '通知和震动测试。真正到时间时，我会再来提醒你。'
        : '通知工作正常。真正到时间时，我会再来提醒你。',
      tag: 'zhundian-test',
      renotify: true
    });
    vibrateDevice();
    showToast('测试提醒已发送');
  }

  async function sendServiceWorkerMessage(type, payload = {}) {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active || navigator.serviceWorker.controller;
      if (!worker) return false;
      worker.postMessage({ type, ...payload });
      return true;
    } catch {
      return false;
    }
  }

  function scheduleTaskNotification(task) {
    if (!task || task.completed || !parseDate(task.remindAt) || new Date(task.remindAt) <= new Date()) return;
    sendServiceWorkerMessage('SCHEDULE_REMINDER', { task, settings: state.settings });
  }

  function cancelTaskNotification(taskId) {
    if (!taskId) return;
    sendServiceWorkerMessage('CANCEL_REMINDER', { taskId });
  }

  function syncScheduledNotifications() {
    state.tasks
      .filter((task) => !task.completed && new Date(task.remindAt) > new Date())
      .forEach(scheduleTaskNotification);
  }

  function initializeAudio() {
    if (!state.settings.soundEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
    return state.audioContext;
  }

  function playChime() {
    const audioContext = initializeAudio();
    if (!audioContext) return;
    const start = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(start + index * 0.16);
      oscillator.stop(start + 0.55 + index * 0.16);
    });
  }

  function notificationBody(task) {
    const due = parseDate(task.dueAt);
    const now = Date.now();
    const status = due && due.getTime() < now ? `已逾期 ${humanDuration(now - due.getTime())}` : `截止 ${formatDueDate(task.dueAt)}`;
    return `${status}${task.notes ? ` · ${task.notes}` : ''}`;
  }

  async function processReminders() {
    const now = Date.now();
    let changed = false;
    const dueTasks = state.tasks
      .filter((task) => !task.completed && parseDate(task.remindAt)?.getTime() <= now)
      .filter((task) => task.notificationAt !== task.remindAt)
      .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
    if (!dueTasks.length) return;

    dueTasks.forEach((task) => {
      task.notificationAt = task.remindAt;
      task.updatedAt = new Date().toISOString();
      changed = true;
      const queueKey = `${task.id}:${task.remindAt}`;
      if (!state.reminderQueue.some((item) => `${item.id}:${item.remindAt}` === queueKey)) {
        state.reminderQueue.push({ id: task.id, remindAt: task.remindAt });
      }
      if (document.visibilityState !== 'visible') {
        showSystemNotification(`准点提醒：${task.title}`, {
          body: notificationBody(task),
          tag: `zhundian-${task.id}-${task.remindAt}`,
          renotify: true,
          data: { url: './' }
        });
      }
    });

    if (changed) await saveState();
    if (document.visibilityState === 'visible') showNextReminder();
  }

  function showNextReminder() {
    if (elements.reminderDialog.open || document.visibilityState !== 'visible') return;
    while (state.reminderQueue.length) {
      const queued = state.reminderQueue.shift();
      const task = getTask(queued.id);
      if (!task || task.completed || task.remindAt !== queued.remindAt) continue;
      state.activeReminderId = task.id;
      elements.reminderTitle.textContent = task.title;
      const overdue = new Date(task.dueAt).getTime() < Date.now();
      elements.reminderTime.textContent = overdue
        ? `${formatDueDate(task.dueAt)} · 已逾期`
        : `截止时间：${formatDueDate(task.dueAt)}`;
      elements.reminderNote.textContent = task.notes || '';
      elements.reminderNote.hidden = !task.notes;
      elements.reminderDialog.showModal();
      playChime();
      vibrateDevice();
      return;
    }
    state.activeReminderId = null;
  }

  async function handleReminderDone() {
    const taskId = state.activeReminderId;
    closeDialog(elements.reminderDialog);
    if (taskId) await toggleTask(taskId);
  }

  async function handleReminderSnooze() {
    const taskId = state.activeReminderId;
    closeDialog(elements.reminderDialog);
    if (taskId) await snoozeTask(taskId, 10);
  }
  function icsEscape(value = '') {
    return String(value)
      .replaceAll('\\', '\\\\')
      .replaceAll(';', '\\;')
      .replaceAll(',', '\\,')
      .replaceAll('\r\n', '\\n')
      .replaceAll('\n', '\\n');
  }

  function toIcsDate(dateValue) {
    const date = parseDate(dateValue) || new Date();
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function safeFilename(value) {
    return String(value).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 50) || '任务';
  }

  function createTaskCalendarBlob(task) {
    const due = parseDate(task.dueAt) || new Date();
    const end = new Date(due.getTime() + 30 * 60_000);
    const trigger = task.reminderOffset === 0 ? 'PT0M' : `-PT${Math.max(0, task.reminderOffset)}M`;
    const description = [task.notes, `分类：${task.category}`, '由准点任务提醒生成'].filter(Boolean).join('\n');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Zhundian//Task Reminder//CN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${icsEscape(task.id)}@zhundian.local`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(due)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${icsEscape(task.title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'BEGIN:VALARM',
      `TRIGGER:${trigger}`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`准点提醒：${task.title}`)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  }

  function buildGoogleCalendarUrl(task) {
    const due = parseDate(task.dueAt) || new Date();
    const end = new Date(due.getTime() + 30 * 60_000);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: task.title,
      dates: `${toIcsDate(due)}/${toIcsDate(end)}`,
      details: [task.notes, `分类：${task.category}`, '由准点任务提醒生成'].filter(Boolean).join('\n'),
      ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function openTaskCalendarDialog(task) {
    state.calendarTaskId = task.id;
    elements.calendarTaskTitle.textContent = task.title;
    elements.calendarTaskTime.textContent = `${formatDueDate(task.dueAt)} · ${reminderOffsetLabel(task.reminderOffset)}提醒`;
    elements.googleCalendarLink.href = buildGoogleCalendarUrl(task);
    if (!elements.calendarDialog.open) elements.calendarDialog.showModal();
  }

  function openTaskCalendar(task) {
    const blob = createTaskCalendarBlob(task);
    const url = URL.createObjectURL(blob);
    closeDialog(elements.calendarDialog);
    window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    showToast('正在打开系统日历');
  }

  function downloadTaskCalendar(task) {
    const blob = createTaskCalendarBlob(task);
    downloadBlob(blob, `${safeFilename(task.title)}.ics`);
    closeDialog(elements.calendarDialog);
    showToast('日历文件已生成，请选择用系统日历打开');
  }

  function exportData() {
    const backup = {
      app: '准点任务提醒',
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `准点备份-${toDateInputValue(new Date())}.json`);
    showToast('备份已导出');
  }

  async function importData(file) {
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const importedTasks = Array.isArray(parsed) ? parsed : parsed.tasks;
      if (!Array.isArray(importedTasks)) throw new Error('Invalid backup');
      const normalizedTasks = importedTasks.map(normalizeTask).filter(Boolean);
      if (!window.confirm(`导入后将替换当前任务，共 ${normalizedTasks.length} 条。继续吗？`)) return;
      state.tasks = normalizedTasks;
      if (parsed.settings) state.settings = normalizeSettings({ ...state.settings, ...parsed.settings });
      await saveState();
      applyTheme();
      render();
      updateSettingsView();
      closeDialog(elements.settingsDialog);
      showToast(`已导入 ${normalizedTasks.length} 条任务`);
    } catch (error) {
      console.warn(error);
      showToast('备份文件无法识别');
    } finally {
      elements.importFileInput.value = '';
    }
  }

  async function clearAllData() {
    if (!window.confirm('确定清空所有任务吗？此操作无法撤销。')) return;
    state.tasks.forEach((task) => cancelTaskNotification(task.id));
    state.tasks = [];
    state.reminderQueue = [];
    await saveState();
    render();
    closeDialog(elements.settingsDialog);
    showToast('全部任务已清空');
  }

  async function refreshBackgroundReminderState() {
    if (!('serviceWorker' in navigator) || !('periodicSync' in ServiceWorkerRegistration.prototype)) {
      elements.backgroundPermissionButton.disabled = true;
      elements.backgroundButtonTitle.textContent = '后台检查';
      elements.backgroundButtonSubtitle.textContent = '当前浏览器不支持，建议导出到系统日历';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const tags = await registration.periodicSync.getTags();
      const enabled = tags.includes('task-reminders');
      elements.backgroundButtonTitle.textContent = enabled ? '后台检查已开启' : '启用后台检查';
      elements.backgroundButtonSubtitle.textContent = enabled ? '系统会在允许时定期检查任务' : '支持 Android Chrome 等浏览器';
    } catch (error) {
      elements.backgroundButtonTitle.textContent = '启用后台检查';
      elements.backgroundButtonSubtitle.textContent = '需要安装到桌面并允许后台活动';
    }
  }

  async function enableBackgroundReminders() {
    if (!('serviceWorker' in navigator) || !('periodicSync' in ServiceWorkerRegistration.prototype)) {
      showToast('当前浏览器不支持后台检查，请使用“加入日历”获得可靠提醒');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.periodicSync.register('task-reminders', { minInterval: 15 * 60 * 1000 });
      await refreshBackgroundReminderState();
      showToast('后台检查已申请，系统会在合适时机运行');
    } catch (error) {
      console.warn(error);
      showToast('系统暂未允许后台检查，可先用日历提醒');
    }
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function handleInstallApp() {
    if (isStandalone()) {
      showToast('已经安装到桌面了');
      return;
    }
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      const result = await state.deferredInstallPrompt.userChoice;
      if (result.outcome === 'accepted') showToast('正在安装');
      state.deferredInstallPrompt = null;
      updateSettingsView();
      return;
    }
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(isiOS ? '请用 Safari 分享按钮，选择“添加到主屏幕”' : '请打开浏览器菜单，选择“安装应用”');
  }

  function updateSettingsView() {
    updateNotificationStatus();
    elements.soundToggle.checked = state.settings.soundEnabled;
    elements.vibrationToggle.checked = state.settings.vibrationEnabled;
    const themeInput = elements.themeOptions.querySelector(`input[value="${state.settings.theme}"]`);
    if (themeInput) themeInput.checked = true;
    elements.installAppButton.disabled = false;
    elements.installHint.textContent = isStandalone()
      ? '已安装'
      : state.deferredInstallPrompt ? '点击即可安装' : '安卓用浏览器菜单，iPhone 用 Safari 分享';
    refreshBackgroundReminderState();
  }

  function openSettings() {
    updateSettingsView();
    if (!elements.settingsDialog.open) elements.settingsDialog.showModal();
  }

  function bindEvents() {
    elements.filterRow.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (button) setFilter(button.dataset.filter);
    });

    document.querySelectorAll('.bottom-nav [data-filter]').forEach((button) => {
      button.addEventListener('click', () => setFilter(button.dataset.filter));
    });

    document.querySelectorAll('[data-filter-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        const map = { active: 'all', overdue: 'overdue', completed: 'completed' };
        setFilter(map[button.dataset.filterJump] || 'all');
      });
    });

    elements.searchToggle.addEventListener('click', () => {
      elements.searchPanel.hidden = !elements.searchPanel.hidden;
      elements.searchToggle.setAttribute('aria-expanded', String(!elements.searchPanel.hidden));
      if (!elements.searchPanel.hidden) elements.searchInput.focus();
    });

    elements.searchInput.addEventListener('input', () => {
      state.search = elements.searchInput.value;
      renderTaskList();
    });

    elements.clearSearchButton.addEventListener('click', () => {
      state.search = '';
      elements.searchInput.value = '';
      renderTaskList();
      elements.searchInput.focus();
    });

    elements.addTaskButton.addEventListener('click', () => openTaskDialog());
    elements.settingsTopButton.addEventListener('click', openSettings);
    elements.settingsNavButton.addEventListener('click', openSettings);
    elements.taskForm.addEventListener('submit', handleTaskSubmit);
    elements.taskList.addEventListener('click', handleTaskListClick);

    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => closeDialog(document.getElementById(button.dataset.closeDialog)));
    });

    [elements.taskDialog, elements.settingsDialog, elements.reminderDialog, elements.calendarDialog].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog && dialog !== elements.reminderDialog) dialog.close();
      });
    });

    elements.reminderDialog.addEventListener('close', () => {
      state.activeReminderId = null;
      window.setTimeout(showNextReminder, 180);
    });

    elements.reminderDoneButton.addEventListener('click', handleReminderDone);
    elements.reminderSnoozeButton.addEventListener('click', handleReminderSnooze);
    elements.reminderCloseButton.addEventListener('click', () => closeDialog(elements.reminderDialog));
    elements.systemCalendarButton.addEventListener('click', () => {
      const task = getTask(state.calendarTaskId);
      if (task) openTaskCalendar(task);
    });
    elements.downloadIcsButton.addEventListener('click', () => {
      const task = getTask(state.calendarTaskId);
      if (task) downloadTaskCalendar(task);
    });

    elements.enableNotificationsButton.addEventListener('click', enableNotifications);
    elements.testNotificationButton.addEventListener('click', testNotification);
    elements.backgroundPermissionButton.addEventListener('click', enableBackgroundReminders);
    elements.installAppButton.addEventListener('click', handleInstallApp);
    elements.exportDataButton.addEventListener('click', exportData);
    elements.importDataButton.addEventListener('click', () => elements.importFileInput.click());
    elements.importFileInput.addEventListener('change', () => importData(elements.importFileInput.files?.[0]));
    elements.clearDataButton.addEventListener('click', clearAllData);

    elements.soundToggle.addEventListener('change', async () => {
      state.settings.soundEnabled = elements.soundToggle.checked;
      await saveState();
      if (state.settings.soundEnabled) playChime();
    });

    elements.vibrationToggle.addEventListener('change', async () => {
      state.settings.vibrationEnabled = elements.vibrationToggle.checked;
      await saveState();
      syncScheduledNotifications();
      if (state.settings.vibrationEnabled) vibrateDevice([180, 80, 180]);
    });

    elements.themeOptions.addEventListener('change', async (event) => {
      if (event.target.name !== 'theme') return;
      state.settings.theme = event.target.value;
      applyTheme();
      await saveState();
    });

    elements.toastAction.addEventListener('click', async () => {
      const action = state.toastAction;
      state.toastAction = null;
      elements.toast.classList.remove('is-visible');
      if (action) await action();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        render();
        processReminders();
        syncScheduledNotifications();
      }
    });

    window.addEventListener('focus', processReminders);
    window.addEventListener('online', render);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      updateSettingsView();
    });

    window.addEventListener('appinstalled', () => {
      state.deferredInstallPrompt = null;
      updateSettingsView();
      showToast('已安装到桌面');
    });

    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (state.settings.theme === 'system') applyTheme();
    });

    document.addEventListener('pointerdown', initializeAudio, { once: true });
  }
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js');
      if ('storage' in navigator && 'persist' in navigator.storage) {
        navigator.storage.persist().catch(() => {});
      }
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'TASK_REMINDER_CLICKED') processReminders();
      });
    } catch (error) {
      console.warn('Service worker registration skipped:', error);
    }
  }

  async function init() {
    bindEvents();
    await loadState();
    applyTheme();
    updateSettingsView();
    render();
    if (new URLSearchParams(window.location.search).get('action') === 'add') {
      window.setTimeout(() => openTaskDialog(), 120);
    }
    processReminders();
    await registerServiceWorker();
    syncScheduledNotifications();
    refreshBackgroundReminderState();
    window.setInterval(processReminders, REMINDER_CHECK_INTERVAL);
  }

  init().catch((error) => {
    console.error(error);
    showToast('应用初始化失败，请刷新重试');
  });
})();
