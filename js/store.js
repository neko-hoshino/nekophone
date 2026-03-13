// js/store.js
const savedStoreStr = localStorage.getItem('neko_store');
let parsedStore = null;
try {
  if (savedStoreStr) {
     parsedStore = JSON.parse(savedStoreStr);
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
    model: '',
    temperature: 0.8
  },
  minimaxConfig: {
    groupId: '',
    apiKey: ''
  },
  apiPresets: [],

  // CSS 皮肤预设仓库
  cssPresets: [],
  customCSS: '', 
  
  // 钱包常数与账单记录
  wallet: {
    balance: 8888.88, // 你的初始零花钱
    transactions: [
      { id: 1, type: 'in', amount: 8888.88, title: '初始资金', date: new Date().toISOString() }
    ]
  },

  personas: [
    { id: 'p_default', name: '点击编辑', avatar: '', isCurrent: true, prompt: '请在这里输入你的人设' }
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
// ================= 全系统防断层自愈引擎 =================
if (!store.personas || store.personas.length === 0) {
  store.personas = [{ id: 'p_default', name: '点击编辑', avatar: '', prompt: '' }];
}
if (!store.contacts) store.contacts = [];
if (!store.chats) store.chats = [];
if (!store.groups || store.groups.length === 0) store.groups = [{ id: 'default', name: '默认分组' }];
if (!store.favorites) store.favorites = [];
if (!store.emojiLibs) store.emojiLibs = [];