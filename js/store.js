// js/store.js
// 🌟 开局先去硬盘里找存档，找不到再用默认设置
const savedStore = localStorage.getItem('neko_store');
export const store = savedStore ? JSON.parse(savedStore) : {
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
  apiPresets: [
    { name: 'GG公益站', baseUrl: 'https://gcli.ggchan.dev/', apiKey: 'gg-gcli-Wweij52Um-yEv9jxKkOz3LN47PMAHXv8zv-NWYDU6SY', model: '', temperature: 0.8 },
  ],

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
    { id: 'p1', name: 'Eve', isCurrent: true }
  ],
  contacts: [
    { id: 'c1', name: 'Aric', desc: '全天候 AI 搭档', prompt: '你是一个专业的扮演者。' ,
      // 👇 新增：主动发消息的常数
      autoMsgEnabled: false,
      autoMsgInterval: 10
    }
  ],
  chats: [
    { 
      id: 'chat1', charId: 'c1', 
      messages: [
        { id: 1, sender: 'Aric', text: '你好！只要在系统设置里填入 API Key，并点【应用设置】，我就可以开始陪你测试啦！', isMe: false, source: 'wechat', isOffline: false }
      ] 
    }
  ]
};