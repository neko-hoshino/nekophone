// js/store.js
// 🌟 开局先去硬盘里找存档，找不到再用默认设置
// js/store.js
// 🌟 开局先去硬盘里找存档，找不到再用默认设置
const savedStoreStr = localStorage.getItem('neko_store');
let parsedStore = null;
try {
  if (savedStoreStr) {
     parsedStore = JSON.parse(savedStoreStr);
     // 🌟 核心防卡死：每次重启小手机，强制回到桌面！绝不停留在上次爆内存的子页面里！
     parsedStore.currentApp = null;
  }
} catch (e) {
  console.error('存档读取失败，可能已损坏', e);
}

export const store = parsedStore || {
  currentTime: '00:00',
  currentApp: null,
  
  apiConfig: {
    baseUrl: '',
    apiKey: '',
    model: 'gemini-2.5-flash',
    temperature: 0.8
  },
  minimaxConfig: {
    groupId: '',
    apiKey: ''
  },
  apiPresets: [],

  // 👇 新增：CSS 皮肤预设仓库
  cssPresets: [],
  customCSS: '', // 当前正在使用的 CSS
  
  // 👇 新增：全系统的钱包常数与账单记录
  wallet: {
    balance: 8888.88, // 你的初始零花钱
    transactions: [
      { id: 1, type: 'in', amount: 8888.88, title: '初始资金', date: new Date().toISOString() }
    ]
  },

  // 👇 下面是微信模块需要用到的新数据
  personas: [
    { id: 'p_default', name: '你的名字', avatar: '', isCurrent: true, prompt: '请在这里输入你的人设' }
  ],
  contacts: [],
  chats: [],
  groups: [{ id: 'default', name: '默认分组' }],
};

// ================= IndexedDB 海量数据库引擎 (支持 1GB+) =================
export const DB = {
  init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('NekoPhoneDB', 1);
      req.onupgradeneeded = e => {
         if (!e.target.result.objectStoreNames.contains('data')) {
             e.target.result.createObjectStore('data');
         }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e);
    });
  },
  async get() {
    const db = await this.init();
    return new Promise(resolve => {
      const tx = db.transaction('data', 'readonly');
      const req = tx.objectStore('data').get('store');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  },
  async set(val) {
    const db = await this.init();
    return new Promise(resolve => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put(val, 'store');
      tx.oncomplete = () => resolve(true);
    });
  }
};
// ================= 🌟 终极生命线：全系统防断层自愈引擎 =================
if (!store.personas || store.personas.length === 0) {
  store.personas = [{ id: 'p_default', name: '你的名字', avatar: '', prompt: '' }];
}
if (!store.contacts) store.contacts = [];
if (!store.chats) store.chats = [];
if (!store.groups || store.groups.length === 0) store.groups = [{ id: 'default', name: '默认分组' }];
if (!store.favorites) store.favorites = [];
if (!store.emojiLibs) store.emojiLibs = [];