// js/apps/couple.js
import { store } from '../store.js';

// 🌟 1:00 AM 跨日逻辑引擎
const getLogicalDateStr = (dateObj = new Date()) => {
   const d = new Date(dateObj.getTime());
   if (d.getHours() < 1) d.setDate(d.getDate() - 1); // 0:00-0:59 强行算作昨天！
   return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// 🌟 全局记忆提取器：抓取当天的全部聊天记录
const getTodayChatHistory = (charId, dateStr) => {
    const chat = store.chats.find(c => c.charId === charId);
    if (!chat || !chat.messages) return "【今日无聊天记录】";
    const msgs = chat.messages.filter(m => {
        const d = new Date(m.id);
        return getLogicalDateStr(d) === dateStr;
    });
    if (msgs.length === 0) return "【今日无聊天记录】";
    return msgs.map(m => `${m.sender}: ${m.msgType === 'text' ? m.text : '['+m.msgType+']'}`).join('\n');
};

const cpState = {
  view: 'select',
  activeCharId: null,
  showAddModal: false,
  diaryDate: getLogicalDateStr(), 
  showDiarySettings: false,
  showDiaryEdit: false,
  isDiaryTyping: false, 
  showCommentEdit: false, 
  editingCommentIdx: null, 
  locData: null, 
  isLocRefreshing: false,
  // 🌟 新增：日记生成 Loading 状态与创建空间弹窗
  isGeneratingDiary: false,
  showCreateSpaceModal: false,
};

// 🌟 注入日记本满血默认配置
if (!store.diaryConfig) {
    store.diaryConfig = { 
        enabled: true, time: '22:00', theme: 'default',
        paper: 'blank', letterSpacing: '1px', lineHeight: '2.0', textIndent: '2em',
        hiddenColor: '#ef4444', highlightColor: '#ec4899'
    };
}
if (!store.diaries) store.diaries = [];

if (!window.cpActions) {
  window.cpActions = {
    // 🌟 创建情侣空间引擎 (替换为发邀请函)
    toggleCreateSpaceModal: () => { cpState.showCreateSpaceModal = !cpState.showCreateSpaceModal; window.render(); },
    createSpace: (charId) => {
        const chat = store.chats.find(c => c.charId === charId);
        if (chat) {
            // 1. 发送绝美卡片 (独立类型)
            chat.messages.push({
                id: Date.now(),
                sender: 'me',
                isMe: true, 
                msgType: 'invite_card', // 🌟 正规军类型！
                text: '[情侣空间开通邀请]',
                timestamp: Date.now()
            });

            // 2. 发送大模型隐身指令 (类型为 text，但 isHidden 为 true，完全隐形！)
            chat.messages.push({
                id: Date.now() + 1,
                sender: 'system',
                isMe: true, 
                isHidden: true, 
                msgType: 'text',
                text: `(系统最高指令：用户向你发送了情侣空间开通邀请。请回复[接受邀请]，并表达你的开心与期待。❗[接受邀请]必须单独成行！必须严格按格式输出！禁止去除中括号！)`,
                timestamp: Date.now() + 1
            });
            if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(charId);
        }
        cpState.showCreateSpaceModal = false;
        window.cpActions.cpRender();
    },
    // 🌟 提问箱导航与设置
  openQuestions: (charId) => { cpState.view = 'questions'; cpState.activeCharId = charId; if(window.renderCouple) window.renderCouple(); },
  openQuestionSettings: () => { cpState.showQuestionSettings = true; if(window.renderCouple) window.renderCouple(); },
  closeQuestionSettings: () => { cpState.showQuestionSettings = false; if(window.renderCouple) window.renderCouple(); },
  
  // 🌟 保存设置
  saveQuestionSettings: (charId) => {
      store.coupleSpacesData = store.coupleSpacesData || {};
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      store.coupleSpacesData[charId].enableAiQuestions = document.getElementById('q-enable-toggle').checked;
      store.coupleSpacesData[charId].aiQuestionFreq = parseInt(document.getElementById('q-freq-select').value);
      window.actions.saveStore();
      cpState.showQuestionSettings = false;
      if(window.renderCouple) window.renderCouple();
      if(window.actions.showToast) window.actions.showToast('设置已保存');
  },

  // 🌟 用户发起提问，呼唤 AI 答题
  askQuestion: async (charId) => {
      const input = document.getElementById('new-q-input');
      const text = input.value.trim();
      if (!text) return;
      
      store.coupleSpacesData = store.coupleSpacesData || {};
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      const spaceData = store.coupleSpacesData[charId];
      spaceData.questions = spaceData.questions || [];
      
      const qId = 'Q_' + Date.now();
      spaceData.questions.unshift({ id: qId, asker: 'me', text: text, answer: null, timestamp: Date.now() });
      input.value = '';
      window.actions.saveStore();
      if(window.renderCouple) window.renderCouple();

      // 🧠 呼唤 LLM 答题
      try {
          const char = store.contacts.find(c => c.id === charId);
          const chat = store.chats.find(c => c.charId === char.id);
          const pId = chat.isGroup ? chat.boundPersonaId : (char?.boundPersonaId || store.personas[0].id);
          const boundPersona = store.personas.find(p => String(p.id) === String(pId)) || store.personas[0];
          
          const promptMsg = `(系统通知：用户 ${boundPersona.name} 在【情侣提问箱】向你提问：“${text}”。请以情侣身份自然、真诚地回答，直接说话，绝不许包含系统标签。)`;
          const tempHistory = [...chat.messages, { id: Date.now(), sender: boundPersona.name, text: promptMsg, isMe: true, isHidden: true, msgType: 'text' }];
          
          const { buildLLMPayload, getLLMReply } = await import('../utils/llm.js');
          const llmMessages = await buildLLMPayload(char.id, tempHistory, false, false, null, null);
          const response = await getLLMReply(llmMessages, char.id);
          
          if (response) {
              const targetQ = spaceData.questions.find(q => q.id === qId);
              if (targetQ) targetQ.answer = response;
              window.actions.saveStore();
              if(window.renderCouple) window.renderCouple();
          }
      } catch(e) {
          console.error("提问箱回答失败", e);
      }
  },

  // 🌟 用户回答 AI 的提问
  answerQuestion: (qId) => {
      const charId = cpState.activeCharId;
      const input = document.getElementById('ans-input-' + qId);
      const text = input.value.trim();
      if (!text) return;
      
      const spaceData = store.coupleSpacesData[charId];
      const targetQ = spaceData.questions.find(q => q.id === qId);
      if (targetQ) {
          targetQ.answer = text;
          window.actions.saveStore();
          if(window.renderCouple) window.renderCouple();
      }
  },
    // 🌟 日记重写与销毁引擎
    deleteDiary: (dateStr) => {
        if(!confirm('确定要彻底销毁这篇日记吗？（不可恢复）')) return;
        store.diaries = store.diaries.filter(d => !(d.charId === cpState.activeCharId && d.date === dateStr));
        window.render();
    },
    rerollDiary: async (dateStr) => {
        if(!confirm('确定要让他重新写这一天的日记吗？原来的记忆将被抹除！')) return;
        store.diaries = store.diaries.filter(d => !(d.charId === cpState.activeCharId && d.date === dateStr));
        window.render(); 
        await window.cpActions.callToWriteDiary();
    },
    closeApp: () => { window.actions.setCurrentApp(null); },
    openDashboard: (id) => { cpState.activeCharId = id; cpState.view = 'dashboard'; window.render(); },
    goBack: () => { cpState.view = 'select'; cpState.activeCharId = null; window.render(); },
    goBackToDashboard: () => { cpState.view = 'dashboard'; window.render(); },
    
    // 纪念日
    openAnniversaries: () => { cpState.view = 'anniversaries'; window.render(); },
    saveAnniversary: () => {
       const name = document.getElementById('anni-name').value.trim();
       const date = document.getElementById('anni-date').value;
       const desc = document.getElementById('anni-desc').value.trim();
       if (!name || !date) return window.actions.showToast('名称和日期是必填的哦！');
       store.anniversaries = store.anniversaries || [];
       store.anniversaries.push({ id: Date.now(), charId: cpState.activeCharId, name, date, desc });
       cpState.showAddModal = false; window.render();
    },
    deleteAnniversary: (id) => {
       if (!confirm('确定要删除这个纪念日吗？')) return;
       store.anniversaries = store.anniversaries.filter(a => String(a.id) !== String(id)); 
       window.render();
    },
    // 🌟 日记重 Roll 与 销毁
    deleteDiary: (dateStr) => {
        if(!confirm('确定要彻底销毁这篇日记吗？（不可恢复）')) return;
        store.diaries = store.diaries.filter(d => !(d.charId === cpState.activeCharId && d.date === dateStr));
        window.cpActions.cpRender();
    },
    rerollDiary: async (dateStr) => {
        if(!confirm('确定要让他重新写这一天的日记吗？原来的记忆将被抹除！')) return;
        store.diaries = store.diaries.filter(d => !(d.charId === cpState.activeCharId && d.date === dateStr));
        window.cpActions.cpRender(); // 先渲染一次，画面变成“正在生成”
        await window.cpActions.generateDiary(dateStr);
    },
    // 日记本
    openDiary: () => { cpState.diaryDate = getLogicalDateStr(); cpState.view = 'diary'; window.render(); },
    // 🌟 史诗级翻页引擎：自动过滤没有内容的日期，实现“跳跃式”无缝翻阅！
    changeDiaryDate: (offset) => {
        const logicalToday = getLogicalDateStr();
        // 提取所有【有正文】或【有共写】的日期
        let validDates = store.diaries.filter(d => d.charId === cpState.activeCharId && (d.content || (d.comments && d.comments.length > 0))).map(d => d.date);
        // 永远保证“今天”在列表里，方便随时写！
        if (!validDates.includes(logicalToday)) validDates.push(logicalToday);
        validDates = [...new Set(validDates)].sort();

        let currIdx = validDates.indexOf(cpState.diaryDate);
        if (currIdx === -1) currIdx = validDates.indexOf(logicalToday);

        const nextIdx = currIdx + offset;
        if (nextIdx < 0) return window.actions.showToast('更早之前没有日记啦！');
        if (nextIdx >= validDates.length) return window.actions.showToast('不能偷看未来的日记哦！');
        
        cpState.diaryDate = validDates[nextIdx];
        window.render();
    },

    // 🌟 史诗级进化：高级共写编辑弹窗引擎
    openCommentEdit: (idx) => {
        cpState.editingCommentIdx = idx;
        cpState.showCommentEdit = true;
        window.render();
    },
    closeCommentEdit: () => {
        cpState.showCommentEdit = false;
        cpState.editingCommentIdx = null;
        window.render();
    },
    saveCommentEdit: () => {
        const newText = document.getElementById('comment-edit-textarea').value.trim();
        const d = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
        if (d && d.comments[cpState.editingCommentIdx] && newText) { 
            d.comments[cpState.editingCommentIdx].text = newText; 
        }
        cpState.showCommentEdit = false;
        cpState.editingCommentIdx = null;
        window.render();
    },
    deleteComment: (idx) => {
        if (!confirm('确定删除这段共写吗？')) return;
        const d = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
        if (d && d.comments) { d.comments.splice(idx, 1); window.render(); }
    },
    rerollComment: async (idx) => {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const d = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
        if (!store.apiConfig?.apiKey || !d || !d.comments[idx]) return;
        
        // 提取重 Roll 的上下文
        const previousComments = d.comments.slice(0, idx);
        let lastUserComment = '';
        for(let i = idx-1; i>=0; i--){ if(d.comments[i].sender === 'me') { lastUserComment = d.comments[i].text; break; } }
        
        d.comments[idx].text = '...'; 
        cpState.isDiaryTyping = true; window.render();
        
        try {
            const historyStr = getTodayChatHistory(char.id, cpState.diaryDate);
            const diaryContent = d.content ? `\n\n【今日日记正文】\n${d.content}` : '';
            const commentsStr = previousComments.map(c => `${c.sender === 'me' ? '用户' : char.name}的共写: ${c.text}`).join('\n');
            const userContext = commentsStr ? `\n\n【之前的共写记录】\n${commentsStr}` : '';
            
            const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【今日聊天回忆】\n${historyStr}${diaryContent}${userContext}\n\n【用户的最新共写】\n${lastUserComment}\n\n【任务】用户对你刚才的续写不满意（要求重写）。请你以伴侣的身份，换一个更深情、更细腻的角度重新回复。\n❗要求：字数 150-300字，支持 ~~阴暗面~~ 和 **高光** 语法。直接输出正文！`;
            
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.9 }) });
            const data = await res.json();
            d.comments[idx].text = data.choices[0].message.content.trim();
        } catch (e) {
            window.actions.showToast('重写失败');
        } finally {
            cpState.isDiaryTyping = false; window.render();
        }
    },
    toggleDiarySettings: (force) => { cpState.showDiarySettings = force !== undefined ? force : !cpState.showDiarySettings; window.render(); },
    saveDiarySettings: () => {
        store.diaryConfig.enabled = document.getElementById('diary-enable-switch').checked;
        store.diaryConfig.time = document.getElementById('diary-time-input').value || '22:00';
        store.diaryConfig.theme = document.getElementById('diary-theme-select').value;
        store.diaryConfig.paper = document.getElementById('diary-paper-select').value;
        store.diaryConfig.letterSpacing = document.getElementById('diary-ls-select').value;
        store.diaryConfig.lineHeight = document.getElementById('diary-lh-select').value;
        store.diaryConfig.textIndent = document.getElementById('diary-ti-select').value;
        store.diaryConfig.hiddenColor = document.getElementById('diary-hidden-color').value;
        store.diaryConfig.highlightColor = document.getElementById('diary-highlight-color').value;
        cpState.showDiarySettings = false; window.render(); window.actions.showToast('日记排版设置已保存！');
    },
    toggleDiaryEdit: (force) => { cpState.showDiaryEdit = force !== undefined ? force : !cpState.showDiaryEdit; window.render(); },
    saveDiaryEdit: () => {
        const newText = document.getElementById('diary-edit-textarea').value.trim();
        const d = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
        if (d && newText) d.content = newText;
        cpState.showDiaryEdit = false; window.render();
    },
    callToWriteDiary: async () => {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        if (!store.apiConfig?.apiKey) return window.actions.showToast('请先配置 API Key');
        
        // 🌟 开启加载动画
        cpState.isGeneratingDiary = true; window.render();
        window.actions.showToast('正在召唤 TA 写日记，请稍候...');
        try {
            const historyStr = getTodayChatHistory(char.id, cpState.diaryDate);
            const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【今日聊天记录回忆】\n${historyStr}\n\n【任务】请你以日记的格式，写一篇今天的日记。必须结合【今日聊天记录回忆】里的互动来写（这是你们今天真实发生的事），如果没有记录，就写对ta的思念。\n❗强制要求：\n1. 字数必须在 300 字以上！情感要饱满，内容要具体，长篇大论！\n2. 可以使用 ~~包裹文字~~ 来表达你的阴暗面、吃醋、占有欲或不敢直说的话。\n3. 可以使用 **包裹文字** 来表达你的高光情感或最深的爱意。\n4. 直接输出日记的正文，绝不要输出“日记正文：”等任何多余的标题或日期！`;
            
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.8 })
            });
            const data = await res.json();
            const content = data.choices[0].message.content.trim();
            
            let d = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
            if (d) { d.content = content; }
            else { store.diaries.push({ id: Date.now(), charId: cpState.activeCharId, date: cpState.diaryDate, content: content, comments: [] }); }
            window.render();
        } catch (e) {
            window.actions.showToast('写日记失败：' + (e.message || '网络错误'));
        } finally {
            // 🌟 关闭加载动画
            cpState.isGeneratingDiary = false; window.render();
        }
    },
    
    submitComment: async () => {
        const input = document.getElementById('diary-comment-input');
        const text = input.value.trim(); if (!text) return;
        
        let d = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
        if (!d) {
            // 如果连日记都没有，直接创建一个空底子来承载共写
            d = { id: Date.now(), charId: cpState.activeCharId, date: cpState.diaryDate, content: '', comments: [] };
            store.diaries.push(d);
        }
        d.comments = d.comments || [];
        d.comments.push({ sender: 'me', text, time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) });
        input.value = ''; 
        
        // 渲染你的共写，并开启等待动画
        cpState.isDiaryTyping = true; window.render();

        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        if (!store.apiConfig?.apiKey) { cpState.isDiaryTyping = false; return window.render(); }

        try {
            const historyStr = getTodayChatHistory(char.id, cpState.diaryDate);
            const diaryContent = d.content ? `\n\n【今日日记正文】\n${d.content}` : '';
            const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【今日聊天记录回忆】\n${historyStr}${diaryContent}\n\n【用户的共写/批注】\n${text}\n\n【任务】用户刚才在日记本里写下了这段话。请你以伴侣的身份，接着ta的话继续“共写”，或者回复一段你的内心独白。\n❗强制要求：\n1. 字数在 150-300字 之间，必须深情、真挚，也可以带点小情绪或占有欲。\n2. 支持使用 ~~包裹文字~~ 和 **包裹文字** 语法。\n3. 直接输出你续写的正文，绝不要带标题或日期！`;
            
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.8 })
            });
            const data = await res.json();
            const replyContent = data.choices[0].message.content.trim();
            
            d.comments.push({ sender: char.id, text: replyContent, time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) });
        } catch (e) {
            console.error('共写回复失败', e);
        } finally {
            cpState.isDiaryTyping = false; window.render();
        }
    },

    // 🌟 永久记忆舱：点开定位时，读取这个角色的专属定位数据，绝不丢失！
    openLocation: () => { 
        cpState.view = 'location'; 
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        cpState.locData = char.locData || null; 
        window.render(); 
    },

    // 🌟 全息定位 AI 生成引擎！
    refreshLocationData: async () => {
        if (cpState.isLocRefreshing) return;
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        if (!store.apiConfig?.apiKey) return window.actions.showToast('请先配置 API Key');

        cpState.isLocRefreshing = true; window.render();
        window.actions.showToast('正在通过时空信号获取 TA 的实时行踪...');

        try {
            const historyStr = getTodayChatHistory(char.id, getLogicalDateStr());
            let memoryStr = '';
            const memories = (store.memories || []).filter(m => m.charId === char.id);
            if (memories.length > 0) {
                memoryStr = '\n【你的记忆】\n' + memories.map(m => `- ${m.content}`).join('\n');
            }

            const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${memoryStr}\n\n【今日聊天记录回忆】\n${historyStr}\n\n【任务】请结合上述信息、你的人设属性以及当前时间（${new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}），脑洞大开，推测并生成TA今天极其符合人设的行踪与健康数据。\n必须返回合法的 JSON 格式数据，结构如下：\n{\n  "distance": 距离用户的公里数(浮点数，比如2.5，如果是异地恋可以设得很大),\n  "steps": 今日运动步数(整数),\n  "places": [\n    {"time": "08:30", "name": "温馨小窝 (出门)"}\n  ], // 按时间顺序排列今天去过的地方，至少1个最多5个\n  "sleepHours": [6.5, 7.0, 5.5], // 前天、昨天、今天凌晨的睡眠时长(3个浮点数)\n  "sleepEval": "以手机系统自带【健康管家】的口吻，客观评价用户的睡眠质量（30字以内，如：昨晚深度睡眠不足，建议今晚放下手机早点休息。）",\n  "phone": {\n    "total": "6.5h",\n    "apps": [\n      {"name": "微信", "time": "2.5h"},\n      {"name": "网易云音乐", "time": "1.8h"}\n    ] // 🌟 随机生成 3 到 5 个最符合TA当前人设和行踪的 App\n  }\n}\n❗警告：只能输出 JSON 格式文本，绝不要带有 \`\`\`json 等任何 Markdown 包裹，也不要有多余解释！`;
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.85 })
            });
            const data = await res.json();
            let content = data.choices[0].message.content.trim();
            // 物理刮除可能带有的大模型 markdown
            content = content.replace(/```json/gi, '').replace(/```/g, '').trim(); 
            cpState.locData = JSON.parse(content);
            char.locData = cpState.locData; // 🌟 每次生成完，牢牢绑在角色身上永久储存！
        } catch (e) {
            console.error('获取行踪失败', e);
            window.actions.showToast('信号干扰，获取行踪失败');
        } finally {
            cpState.isLocRefreshing = false; window.render();
        }
    },

    notBuilt: (name) => { window.actions.showToast(name + ' 功能正在快马加鞭施工中！'); }
  };
}

// 🌟 解析特殊字体的魔法引擎
const renderDiaryContent = (text, cfg) => {
    let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 阴暗面：用 ~~ 包裹 -> 中间划线
    html = html.replace(/~~(.*?)~~/g, `<del style="color: ${cfg.hiddenColor}; text-decoration-color: ${cfg.hiddenColor}; opacity: 0.85; font-weight: normal;">$1</del>`);
    // 🌟 高光处进化：用 ** 包裹 -> 斜体 + 优雅的下方细划线
    html = html.replace(/\*\*(.*?)\*\*/g, `<em style="color: ${cfg.highlightColor}; border-bottom: 1px solid ${cfg.highlightColor}; padding-bottom: 1px; font-style: italic; font-weight: normal;">$1</em>`);
    
    // 首行缩进处理（按换行符切割包裹）
    const lines = html.split('\n');
    return lines.map(l => `<div style="text-indent: ${cfg.textIndent || '2em'}; min-height: 1em;">${l}</div>`).join('');
};

export function renderCoupleApp(store) {
  // 🌟 每次进门前，先检查一下有没有人通过了邀请
  if (store.pendingCouples && store.pendingCouples.length > 0) {
      store.pendingCouples.forEach(charId => {
          const chat = store.chats.find(c => c.charId === charId);
          if (chat) {
              // 找到最后一张邀请卡片的位置
              const inviteIdx = chat.messages.findLastIndex(m => m.msgType === 'invite_card');
              if (inviteIdx !== -1) {
                  // 看看卡片发出去之后，ta 有没有说话
                  const hasReply = chat.messages.slice(inviteIdx + 1).some(m => m.sender === 'char' || m.sender === charId);
                  if (hasReply) {
                      // ta 同意了！立刻偷偷建好情侣空间
                      store.coupleSpaces = store.coupleSpaces || [];
                      if (!store.coupleSpaces.includes(charId)) store.coupleSpaces.push(charId);
                      
                      // 把 ta 从待办列表移除
                      store.pendingCouples = store.pendingCouples.filter(id => id !== charId);
                  }
              }
          }
      });
  }

  const getVidHtml = (v) => {
    if (!v) return `<div class="w-full h-full bg-gray-200"></div>`;
    if (v.includes('.mp4') || v.includes('.webm')) return `<video src="${v}" autoplay loop muted playsinline class="w-full h-full object-cover"></video>`;
    return `<img src="${v}" class="w-full h-full object-cover" />`;
  };

  if (cpState.view === 'select') {
     return `
      <div class="w-full h-full bg-[#fcfcfc] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60]">
         <div class="pt-14 pb-4 px-6 sticky top-0 bg-[#fcfcfc]/90 backdrop-blur-md z-10 flex items-center justify-between shadow-sm">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.closeApp()"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
            <span class="text-lg font-extrabold text-gray-800 tracking-wide">情侣空间</span>
            <div class="cursor-pointer active:scale-90 p-1 -mr-1" onclick="window.cpActions.toggleCreateSpaceModal()"><i data-lucide="plus-circle" class="w-7 h-7 text-pink-400"></i></div>
         </div>
         
         <div id="cp-select-scroll" class="flex-1 overflow-y-auto px-5 py-4 space-y-4 hide-scrollbar pb-10">
            ${(()=>{
                store.coupleSpaces = store.coupleSpaces || [];
                if (store.coupleSpaces.length === 0) {
                    return '<div class="text-center text-gray-400 mt-20 text-[13px] font-medium flex flex-col items-center"><i data-lucide="heart-crack" class="w-10 h-10 text-gray-300 mb-3"></i><span>还没有创建情侣空间哦<br>点击右上角 + 号与他绑定吧</span></div>';
                }
                return store.coupleSpaces.map(charId => {
                    const c = store.contacts.find(char => char.id === charId);
                    if(!c) return '';
                    // 🌟 精准获取你在这个聊天室绑定的专属马甲
                    const chat = store.chats.find(ch => ch.charId === c.id);
                    const boundPersona = store.personas.find(p => String(p.id) === String(c?.boundPersonaId)) || store.personas[0];
                    // 🌟 极度安全：优先提取聊天室专属头像，并加上 ? 防止空指针崩溃！
                    const myAvatar = chat?.myAvatar || boundPersona.avatar;
                    
                    return `
                      <div class="bg-white rounded-[24px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50 flex items-center cursor-pointer active:scale-[0.98] transition-all" onclick="window.cpActions.openDashboard('${c.id}')">
                         <div class="flex items-center space-x-1 mr-4 relative">
                             <img src="${myAvatar}" class="w-12 h-12 rounded-full border border-gray-100 object-cover z-10" />
                             <div class="bg-white rounded-full p-0.5 absolute left-1/2 -translate-x-1/2 z-20 shadow-sm"><i data-lucide="heart" class="w-3 h-3 text-pink-400 fill-pink-400 animate-pulse"></i></div>
                             <img src="${c.avatar}" class="w-12 h-12 rounded-full border border-gray-100 object-cover z-10" />
                         </div>
                         <div class="flex-1 flex flex-col overflow-hidden">
                            <span class="text-[15px] font-extrabold text-gray-800 mb-0.5 tracking-wide truncate">${boundPersona.name} & ${c.name}</span>
                            <span class="text-[11px] text-gray-400 font-bold tracking-widest truncate">进入专属私密空间</span>
                         </div>
                         <i data-lucide="chevron-right" class="w-5 h-5 text-gray-300 shrink-0"></i>
                      </div>
                    `;
                }).join('');
            })()}
         </div>

         ${cpState.showCreateSpaceModal ? `
         <div class="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in" onclick="window.cpActions.toggleCreateSpaceModal()">
             <div class="bg-white w-full max-w-sm rounded-[32px] p-6 flex flex-col shadow-2xl scale-in" onclick="event.stopPropagation()">
                 <div class="flex justify-between items-center mb-6">
                     <span class="font-black text-gray-800 text-[18px]">发送专属邀请函</span>
                     <i data-lucide="x" class="w-6 h-6 text-gray-400 bg-gray-50 rounded-full p-1 cursor-pointer active:scale-90 transition-transform" onclick="window.cpActions.toggleCreateSpaceModal()"></i>
                 </div>
                 <div class="flex-1 overflow-y-auto space-y-3 hide-scrollbar max-h-[50vh]">
                     ${store.contacts.filter(c => !(store.coupleSpaces||[]).includes(c.id)).map(char => {
                         const chat = store.chats.find(c => c.charId === char.id);
                         const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0];
                         return `
                         <div class="bg-gray-50/50 rounded-2xl p-4 flex items-center shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-all hover:bg-pink-50" onclick="window.cpActions.createSpace('${char.id}')">
                             <img src="${char.avatar}" class="w-12 h-12 rounded-full object-cover mr-4 border-2 border-white shadow-sm">
                             <div class="flex-1 flex flex-col overflow-hidden">
                                 <span class="font-bold text-gray-800 text-[16px] truncate mb-1">${boundPersona.name} <span class="text-pink-300 mx-1">x</span> ${char.name}</span>
                             </div>
                             <div class="w-8 h-8 rounded-full bg-pink-400 flex items-center justify-center shrink-0 shadow-md shadow-pink-200">
                                 <i data-lucide="send" class="w-4 h-4 text-white -ml-0.5"></i>
                             </div>
                         </div>
                         `
                     }).join('') || '<div class="text-center text-gray-400 mt-10 text-[13px] font-bold">所有角色都已经开通啦！</div>'}
                 </div>
             </div>
         </div>
         ` : ''}
      </div>
    `;
  }

  if (cpState.view === 'dashboard') {
     const char = store.contacts.find(c => c.id === cpState.activeCharId);
     if (!char) return '';
     
     // 🌟 读取专属聊天室里你绑定的马甲身份
     const chat = store.chats.find(c => c.charId === char.id);
     const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0];
     // 🌟 优先提取聊天室专属头像，如果没有才用马甲头像
     const myAvatar = chat?.myAvatar || boundPersona.avatar;
     
     return `
      <div class="w-full h-full bg-[#fdfdfd] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60]">
         <div class="pt-12 pb-2 px-4 sticky top-0 z-10 flex items-center justify-between">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
            <div class="w-8"></div>
         </div>
         <div id="cp-dash-scroll" class="flex-1 overflow-y-auto hide-scrollbar pb-12">
            <div class="flex items-center justify-center pt-2 pb-10">
               <div class="flex flex-col items-center">
                  <div class="w-20 h-20 rounded-full overflow-hidden shadow-lg border-[3px] border-white z-10 bg-gray-100">${getVidHtml(myAvatar)}</div>
                  <span class="text-[12px] font-extrabold text-gray-800 mt-3 tracking-widest">${boundPersona.name}</span>
               </div>
               <div class="w-20 h-px bg-gray-200 relative mx-1 -mt-6">
                  <i data-lucide="heart" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-pink-300 fill-pink-50"></i>
               </div>
               <div class="flex flex-col items-center">
                  <div class="w-20 h-20 rounded-full overflow-hidden shadow-lg border-[3px] border-white z-10 bg-gray-100">${getVidHtml(char.avatar)}</div>
                  <span class="text-[12px] font-extrabold text-gray-800 mt-3 tracking-widest">${char.name}</span>
               </div>
            </div>

            <div class="flex justify-around px-2 mb-10">
               <div class="flex flex-col items-center cursor-pointer active:scale-90 transition-transform opacity-80 hover:opacity-100" onclick="window.cpActions.openAnniversaries()">
                  <i data-lucide="calendar-heart" class="w-[28px] h-[28px] text-rose-400 mb-2 stroke-[1.5]"></i>
                  <span class="text-[11px] font-extrabold text-gray-600 tracking-wider">纪念日</span>
               </div>
               <div class="flex flex-col items-center cursor-pointer active:scale-90 transition-transform opacity-80 hover:opacity-100" onclick="window.cpActions.openDiary()">
                  <i data-lucide="book-heart" class="w-[28px] h-[28px] text-orange-400 mb-2 stroke-[1.5]"></i>
                  <span class="text-[11px] font-extrabold text-gray-600 tracking-wider">日记本</span>
               </div>
               <div class="flex flex-col items-center cursor-pointer active:scale-90 transition-transform opacity-80 hover:opacity-100" onclick="window.cpActions.openLocation()">
                  <i data-lucide="map-pin" class="w-[28px] h-[28px] text-blue-400 mb-2 stroke-[1.5]"></i>
                  <span class="text-[11px] font-extrabold text-gray-600 tracking-wider">定位共享</span>
               </div>
               <div class="flex flex-col items-center cursor-pointer active:scale-90 transition-transform opacity-80 hover:opacity-100" onclick="window.cpActions.openQuestions('${char.id}')">
                  <i data-lucide="box" class="w-[28px] h-[28px] text-purple-400 mb-2 stroke-[1.5]"></i>
                  <span class="text-[11px] font-extrabold text-gray-600 tracking-wider">提问箱</span>
               </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3.5 px-5 mb-5">
               <div class="bg-gradient-to-br from-rose-50 to-pink-50/30 rounded-[24px] p-5 shadow-sm border border-pink-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.notBuilt('默契问答')"><i data-lucide="messages-square" class="w-6 h-6 text-rose-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">默契问答</span></div>
               <div class="bg-gradient-to-br from-orange-50 to-amber-50/30 rounded-[24px] p-5 shadow-sm border border-orange-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.notBuilt('恋爱挑战')"><i data-lucide="swords" class="w-6 h-6 text-orange-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">恋爱挑战</span></div>
               
               <div class="bg-gradient-to-br from-blue-50 to-cyan-50/30 rounded-[24px] p-5 shadow-sm border border-blue-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.notBuilt('100件事')"><i data-lucide="check-square" class="w-6 h-6 text-blue-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">100件事</span></div>
               <div class="bg-gradient-to-br from-purple-50 to-fuchsia-50/30 rounded-[24px] p-5 shadow-sm border border-purple-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.notBuilt('真心话大冒险')"><i data-lucide="dices" class="w-6 h-6 text-purple-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">真心话大冒险</span></div>
            </div>

            <div class="px-5 mb-8">
               <div class="bg-white rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-emerald-50 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all" onclick="window.cpActions.notBuilt('宠物小屋')">
                  <div class="flex items-center">
                     <div class="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mr-4 border border-emerald-100/50"><i data-lucide="cat" class="text-emerald-400 w-7 h-7"></i></div>
                     <div class="flex flex-col">
                        <span class="text-[16px] font-extrabold text-gray-800 mb-1 tracking-wide">电子宠物小屋</span>
                        <span class="text-[11px] text-gray-400 font-bold tracking-widest">小猫“雪球”正在睡觉 zzZ</span>
                     </div>
                  </div>
                  <i data-lucide="chevron-right" class="text-gray-300 w-5 h-5"></i>
               </div>
            </div>

         </div>
      </div>
     `;
  }
  
  // 🌟 界面 3：纪念日列表 (🌟 史诗级排序算法：自动计算距离下一个纪念日的天数，并按升序排列！)
  if (cpState.view === 'anniversaries') {
     const today = new Date();
     today.setHours(0,0,0,0);
     
     const list = (store.anniversaries || []).filter(a => a.charId === cpState.activeCharId).map(a => {
        const origDate = new Date(a.date);
        origDate.setHours(0,0,0,0);
        let nextDate = new Date(today.getFullYear(), origDate.getMonth(), origDate.getDate());
        if (nextDate < today) nextDate.setFullYear(today.getFullYear() + 1); 
        const daysLeft = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        const count = nextDate.getFullYear() - origDate.getFullYear();
        return { ...a, daysLeft, count, origDateStr: origDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) };
     }).sort((a, b) => a.daysLeft - b.daysLeft); 

     return `
      <div class="w-full h-full bg-[#fcfcfc] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60]">
         <div class="pt-14 pb-4 px-6 sticky top-0 bg-[#fcfcfc]/90 backdrop-blur-md z-10 flex items-center justify-between">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.goBackToDashboard()"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
            <span class="text-lg font-extrabold text-gray-800 tracking-wide">纪念日</span>
            <div class="cursor-pointer active:scale-90 p-1 -mr-1" onclick="window.cpActions.openAddModal()"><i data-lucide="plus" class="w-7 h-7 text-gray-800"></i></div>
         </div>
         <div id="cp-anni-scroll" class="flex-1 overflow-y-auto px-5 py-4 hide-scrollbar pb-12">
            ${list.map(a => `
               <div class="bg-white rounded-[20px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-rose-50 mb-4 flex items-center justify-between relative overflow-hidden group">
                  <div class="flex flex-col z-10 max-w-[60%]">
                     <span class="text-[16px] font-extrabold text-gray-800 mb-1 tracking-wide">${a.name}</span>
                     <span class="text-[11px] font-bold text-gray-400 tracking-wider">${a.origDateStr} · 第 ${a.count} 次</span>
                     ${a.desc ? `<span class="text-[12px] text-gray-500 mt-2 leading-relaxed opacity-90">${a.desc}</span>` : ''}
                  </div>
                  <div class="flex flex-col items-end z-10 pr-6">
                     <div class="flex items-start">
                        <span class="text-[10px] text-rose-400 font-bold tracking-widest mt-1.5 mr-1">${a.daysLeft === 0 ? '' : '还有'}</span>
                        ${a.daysLeft > 0 ? `<span class="text-4xl font-black text-rose-400 font-serif drop-shadow-sm leading-none">${a.daysLeft}<span class="text-[12px] font-bold ml-1 text-rose-300 font-sans">天</span></span>` : '<span class="text-[16px] font-black text-rose-400 font-serif tracking-widest mt-1.5">今天</span>'}
                     </div>
                  </div>
                  <div class="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer p-2 bg-rose-50 rounded-full active:scale-90 transition-transform z-50" onclick="window.cpActions.deleteAnniversary('${a.id}')">
                      <i data-lucide="trash-2" class="w-4 h-4 text-rose-400"></i>
                  </div>
               </div>
            `).join('')}
         </div>
         ${cpState.showAddModal ? `
         <div class="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in" onclick="window.cpActions.closeAddModal()">
             <div class="bg-white w-full max-w-sm rounded-[32px] p-8 flex flex-col items-center shadow-2xl scale-in" onclick="event.stopPropagation()">
                 <div class="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4 shadow-inner">
                     <i class="fas fa-heart text-rose-400 text-2xl animate-pulse"></i>
                 </div>
                 <h3 class="text-xl font-bold text-gray-800 mb-2">开通情侣空间</h3>
                 
                 <p class="text-rose-400 font-bold text-[18px] mb-8 text-center tracking-wide">Eve <span class="text-gray-300 mx-2">x</span> ${store.contacts.find(c=>c.id===cpState.pendingCharId)?.name || 'ta'}</p>
                 
                 <div class="flex w-full space-x-4">
                     <button onclick="window.cpActions.closeAddModal()" class="flex-1 py-3.5 rounded-[16px] bg-gray-100 text-gray-600 font-bold text-[15px] active:scale-95 transition-all">取消</button>
                     <button onclick="window.cpActions.sendInvite()" class="flex-1 py-3.5 rounded-[16px] bg-gradient-to-r from-rose-400 to-pink-400 text-white font-bold text-[15px] shadow-lg shadow-rose-200 active:scale-95 transition-all">发送邀请函</button>
                 </div>
             </div>
         </div>
         ` : ''}
      </div>
     `;
  }

  // 📍 界面 3.5：定位共享与全息健康看板
  if (cpState.view === 'location') {
     const char = store.contacts.find(c => c.id === cpState.activeCharId);
     if (!char) return '';

     // 🌟 接入 AI 全息大脑生成的数据！
     const loc = cpState.locData || {};
     const distance = loc.distance !== undefined ? loc.distance : '--';
     const steps = loc.steps !== undefined ? loc.steps : '--';
     const places = loc.places || [];
     const sleepHours = loc.sleepHours || [0, 0, 0];
     const sleepEval = loc.sleepEval || "暂无数据，请点击右上角刷新按钮，获取 TA 的实时行踪。";
     const phone = loc.phone || { total: '--', apps: [{name: '未知', time: '--'}] };
     const appColors = ['bg-purple-500', 'bg-pink-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500']; // 预备 5 种 App 颜色
     const chat = store.chats.find(c => c.charId === char.id);
     const boundPersona = store.personas.find(p => String(p.id) === String(chat?.boundPersonaId)) || store.personas[0];
     // 🌟 优先提取聊天室专属头像，如果没有才用马甲头像
     const myAvatar = chat?.myAvatar || boundPersona.avatar;

     // 根据时长计算柱状图高度 (最大 50px)
     const getBarHeight = (h) => Math.min(Math.max((h / 12) * 50, 4), 50);

     return `
      <div class="w-full h-full bg-[#f4f5f7] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60] overflow-hidden">
         
         <div class="w-full h-[35vh] relative bg-[#e5e9f0] flex-shrink-0">
            <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(#94a3b8 2px, transparent 2px); background-size: 24px 24px;"></div>
            <div class="absolute inset-0 opacity-10" style="background-image: linear-gradient(0deg, transparent 24%, rgba(148, 163, 184, 0.3) 25%, rgba(148, 163, 184, 0.3) 26%, transparent 27%, transparent 74%, rgba(148, 163, 184, 0.3) 75%, rgba(148, 163, 184, 0.3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(148, 163, 184, 0.3) 25%, rgba(148, 163, 184, 0.3) 26%, transparent 27%, transparent 74%, rgba(148, 163, 184, 0.3) 75%, rgba(148, 163, 184, 0.3) 76%, transparent 77%, transparent); background-size: 50px 50px;"></div>
            
            <div class="absolute top-12 left-5 z-20 cursor-pointer active:scale-90 p-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-white/50" onclick="window.cpActions.goBackToDashboard()">
               <i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i>
            </div>

            <div class="absolute top-12 right-5 z-20 cursor-pointer active:scale-90 p-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-white/50" onclick="window.cpActions.refreshLocationData()">
               <i data-lucide="refresh-cw" class="w-6 h-6 text-gray-800 ${cpState.isLocRefreshing ? 'animate-spin' : ''}"></i>
            </div>
            
            <svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 5;">
               <line x1="30%" y1="30%" x2="70%" y2="70%" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,4" class="opacity-40" />
            </svg>

            <div class="absolute top-[30%] left-[30%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10 animate-pulse-slow">
               <div class="w-12 h-12 rounded-full border-[3px] border-white shadow-md overflow-hidden z-10 bg-gray-100">${getVidHtml(char.avatar)}</div>
               <div class="bg-white/95 backdrop-blur px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-gray-700 mt-1 shadow-sm tracking-widest">${char.name}的位置</div>
            </div>
            
            <div class="absolute top-[70%] left-[70%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
               <div class="w-10 h-10 rounded-full border-[3px] border-white shadow-md overflow-hidden z-10 opacity-90 bg-gray-100">${getVidHtml(myAvatar)}</div>
               <div class="bg-white/95 backdrop-blur px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-blue-500 mt-1 shadow-sm tracking-widest">你的位置</div>
            </div>
            
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-500 text-white px-3 py-1.5 rounded-full text-[11px] font-extrabold shadow-lg z-10 flex items-center tracking-wider">
               <i data-lucide="navigation" class="w-3.5 h-3.5 mr-1.5"></i> 距离 ${distance} km
            </div>
         </div>

         <div id="cp-loc-scroll" class="flex-1 overflow-y-auto px-5 py-6 space-y-4 rounded-t-[24px] -mt-6 bg-[#f4f5f7] relative z-20 hide-scrollbar pb-12 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
            
            <div class="bg-white rounded-[20px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-gray-100">
               <div class="flex items-center justify-between mb-5">
                  <span class="text-[15px] font-extrabold text-gray-800 tracking-wide flex items-center"><i data-lucide="map" class="w-4 h-4 mr-1.5 text-blue-500"></i>今日行踪</span>
                  <span class="text-[11px] font-extrabold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-md tracking-widest">${places.length > 0 ? `去了 ${places.length} 个地方` : '等待刷新'}</span>
               </div>
               <div class="relative border-l-2 border-gray-100 ml-2 space-y-2.5 transition-all duration-300">
                  ${places.length === 0 ? '<div class="text-[12px] text-gray-400 pl-3">暂无行踪，请点击右上角刷新获取</div>' : places.map((p, i) => `
                     <div class="relative pl-5">
                        <div class="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${i === places.length - 1 ? 'bg-blue-500 ring-4 ring-blue-50' : 'bg-gray-300'}"></div>
                        <div class="flex items-center space-x-3">
                           <span class="text-[12px] font-black text-gray-400 w-11 tracking-wider">${p.time}</span>
                           <span class="text-[13px] font-bold text-gray-700">${p.name}</span>
                        </div>
                     </div>
                  `).join('')}
               </div>
            </div>

            <div class="bg-white rounded-[20px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-gray-100 flex items-center justify-between">
               <div class="flex flex-col">
                  <span class="text-[15px] font-extrabold text-gray-800 tracking-wide flex items-center mb-1"><i data-lucide="footprints" class="w-4 h-4 mr-1.5 text-emerald-500"></i>运动步数</span>
                  <span class="text-[11px] text-gray-400 font-bold tracking-widest">今日已行走</span>
               </div>
               <div class="flex items-baseline">
                  <span class="text-[32px] font-black font-serif text-emerald-500 tracking-tighter">${steps}</span>
                  <span class="text-[11px] font-bold text-gray-400 ml-1">步</span>
               </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
               
               <div class="bg-white rounded-[20px] p-4 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col items-center">
                  <span class="text-[12px] font-extrabold text-gray-800 tracking-wide mb-3 flex items-center w-full justify-center"><i data-lucide="smartphone" class="w-3.5 h-3.5 mr-1 text-purple-500"></i>手机使用</span>
                  
                  <div class="relative w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-sm" style="background: conic-gradient(#a855f7 0% 50%, #ec4899 50% 80%, #f3f4f6 80% 100%);">
                     <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center flex-col">
                        <span class="text-[9px] font-bold text-gray-400 tracking-widest">总计</span>
                        <span class="text-[11px] font-black text-gray-800">${phone.total}</span>
                     </div>
                  </div>
                  
                  <div class="w-full space-y-2">
                     ${(phone.apps || []).map((app, idx) => `
                     <div class="flex justify-between items-center text-[10px] font-bold">
                        <div class="flex items-center"><span class="w-2 h-2 rounded-full ${appColors[idx % appColors.length]} mr-1.5"></span><span class="text-gray-600">${app.name}</span></div>
                        <span class="text-gray-800">${app.time}</span>
                     </div>
                     `).join('')}
                  </div>
               </div>

               <div class="bg-white rounded-[20px] p-4 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col">
                  <span class="text-[12px] font-extrabold text-gray-800 tracking-wide mb-3 flex items-center w-full justify-center"><i data-lucide="moon" class="w-3.5 h-3.5 mr-1 text-indigo-500"></i>睡眠监测</span>
                  
                  <div class="flex justify-around items-end h-[70px] mb-3 border-b border-gray-100 pb-1.5">
                     <div class="flex flex-col items-center">
                        <span class="text-[10px] font-black text-indigo-400 mb-1 drop-shadow-sm">${cpState.locData ? sleepHours[0]+'h' : '--'}</span>
                        <div class="w-[14px] bg-indigo-200 rounded-t-sm transition-all duration-700 ease-out" style="height: ${getBarHeight(sleepHours[0])}px;"></div>
                        <span class="text-[9px] text-gray-400 mt-1 font-bold">前天</span>
                     </div>
                     <div class="flex flex-col items-center">
                        <span class="text-[10px] font-black text-indigo-400 mb-1 drop-shadow-sm">${cpState.locData ? sleepHours[1]+'h' : '--'}</span>
                        <div class="w-[14px] bg-indigo-300 rounded-t-sm transition-all duration-700 ease-out delay-75" style="height: ${getBarHeight(sleepHours[1])}px;"></div>
                        <span class="text-[9px] text-gray-400 mt-1 font-bold">昨天</span>
                     </div>
                     <div class="flex flex-col items-center">
                        <span class="text-[10px] font-black text-indigo-500 mb-1 drop-shadow-sm">${cpState.locData ? sleepHours[2]+'h' : '--'}</span>
                        <div class="w-[14px] bg-indigo-500 rounded-t-sm transition-all duration-700 ease-out delay-150" style="height: ${getBarHeight(sleepHours[2])}px;"></div>
                        <span class="text-[9px] text-gray-400 mt-1 font-bold">今天</span>
                     </div>
                  </div>
                  
                  <div class="text-[12px] text-gray-400 font-medium leading-relaxed font-sans mt-3 px-1 text-center">
                     ${sleepEval}
                  </div>
               </div>

            </div>
         </div>
      </div>
     `;
  }

  // 📖 界面 4：日记本 (🌟 高级排版引擎)
  if (cpState.view === 'diary') {
     const char = store.contacts.find(c => c.id === cpState.activeCharId);
     const diary = store.diaries.find(d => d.charId === cpState.activeCharId && d.date === cpState.diaryDate);
     const cfg = store.diaryConfig;
     
     // 日期格式化为 XXXX年XX月XX日
     const [yyyy, mm, dd] = cpState.diaryDate.split('-');
     const displayDate = `${yyyy}年${mm}月${dd}日`;

     // 物理屏障与纸张 CSS
     let customCss = `
        .ios-switch { position: relative; width: 44px; height: 24px; appearance: none; background: #e5e5ea; border-radius: 24px; outline: none; cursor: pointer; transition: background 0.3s ease; }
        .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.3s ease; }
        .ios-switch:checked { background: #34c759; }
        .ios-switch:checked::after { transform: translateX(20px); }
        /* 🌟 绝对防御装甲：抹杀外观主界面的背景图，同时释放底层颜色！ */
        #cp-diary-container { background-image: none !important; background-color: ${cfg.theme==='dark'?'#1a1c23':(cfg.theme==='vintage'?'#f4ebd0':(cfg.theme==='romance'?'#fff0f5':'#f8f9fa'))} !important; }
        /* 🌟 独立纹理引擎：极其强硬地覆盖，并跟随文字一起滚动！ */
        #cp-diary-container .paper-layer-lined { background-image: repeating-linear-gradient(transparent, transparent calc(${cfg.lineHeight}em - 1px), rgba(0,0,0,0.1) calc(${cfg.lineHeight}em - 1px), rgba(0,0,0,0.1) ${cfg.lineHeight}em) !important; background-attachment: local !important; }
        #cp-diary-container .paper-layer-grid { background-image: linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px) !important; background-size: 1.5em 1.5em !important; background-attachment: local !important; }
        #cp-diary-container .paper-layer-dotted { background-image: radial-gradient(rgba(0,0,0,0.2) 1.5px, transparent 1.5px) !important; background-size: 1.5em 1.5em !important; background-attachment: local !important; }
        #cp-diary-container .paper-layer-blank { background: transparent !important; }
     `;

     const themes = {
         'default': { text: 'text-gray-800', font: 'font-sans' },
         'vintage': { text: 'text-[#5c4b37]', font: 'font-serif' },
         'romance': { text: 'text-rose-900', font: 'font-sans' },
         'dark':    { text: 'text-gray-200', font: 'font-sans' }
     };
     const t = themes[cfg.theme] || themes['default'];
     const isDark = cfg.theme === 'dark';
     const logicalToday = getLogicalDateStr();
     const chat = store.chats.find(c => c.charId === char.id);
     const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0];

     return `
      <div id="cp-diary-container" class="w-full h-full flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60] transition-colors" style="background: ${cfg.theme==='dark'?'#1a1c23':(cfg.theme==='vintage'?'#f4ebd0':(cfg.theme==='romance'?'#fff0f5':'#f8f9fa'))} !important;">
         <style>${customCss}</style>

         <div class="pt-14 pb-4 px-6 sticky top-0 z-10 flex items-center justify-between backdrop-blur-md bg-transparent">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.goBackToDashboard()"><i data-lucide="chevron-left" class="w-8 h-8 ${isDark?'text-white':'text-gray-800'}"></i></div>
            <div class="flex items-center space-x-4">
                <i data-lucide="edit-3" class="w-5 h-5 cursor-pointer active:scale-90 ${isDark?'text-gray-400':'text-gray-500'}" onclick="window.cpActions.toggleDiaryEdit()"></i>
                <i data-lucide="settings" class="w-5 h-5 cursor-pointer active:scale-90 ${isDark?'text-gray-400':'text-gray-500'}" onclick="window.cpActions.toggleDiarySettings()"></i>
            </div>
         </div>

         <div class="flex items-center justify-center px-8 py-2 mb-2 pointer-events-none">
            <span class="text-[16px] font-bold tracking-widest font-serif ${isDark?'text-white':'text-gray-800'}">${displayDate}</span>
         </div>

         <div id="cp-diary-scroll" class="flex-1 overflow-y-auto px-6 pb-6 hide-scrollbar relative paper-layer-${cfg.paper}"
              ontouchstart="window.diaryTsX = event.touches[0].clientX; window.diaryTsY = event.touches[0].clientY;"
              ontouchend="window.diaryTeX = event.changedTouches[0].clientX; window.diaryTeY = event.changedTouches[0].clientY;"
              onclick="
                if (window.diaryTsX !== undefined && window.diaryTeX !== undefined) {
                   if (Math.abs(window.diaryTeX - window.diaryTsX) > 10 || Math.abs(window.diaryTeY - window.diaryTsY) > 10) { window.diaryTsX = undefined; window.diaryTeX = undefined; return; }
                   window.diaryTsX = undefined; window.diaryTeX = undefined;
                }
                const rect = this.getBoundingClientRect(); 
                if(event.clientX < rect.left + rect.width/2) window.cpActions.changeDiaryDate(-1); 
                else { if('${cpState.diaryDate}' !== '${logicalToday}') window.cpActions.changeDiaryDate(1); else window.actions.showToast('不能偷看未来的日记哦！'); }
              ">
            
            <div class="w-full min-h-[60%] flex flex-col relative overflow-hidden transition-all bg-transparent pb-8">
               
               ${cpState.isGeneratingDiary ? `
                   <div class="flex flex-col items-center justify-center py-24 animate-in fade-in">
                       <i data-lucide="loader-2" class="w-10 h-10 text-pink-400 animate-spin mb-4"></i>
                       <span class="text-[15px] font-bold text-pink-400 tracking-widest">正在用心记录点滴...</span>
                       <span class="text-[11px] text-pink-300 mt-2 font-medium">请耐心等待 TA 写下这篇日记</span>
                   </div>
               ` : diary && diary.content ? `
                   <div class="${t.font} ${t.text} text-[15px] flex-1" style="letter-spacing: ${cfg.letterSpacing}; line-height: ${cfg.lineHeight}; pb-8">
                       ${renderDiaryContent(diary.content, cfg)}
                   </div>
                   <div class="flex items-center justify-end space-x-5 mt-4 pt-4 border-t ${isDark?'border-gray-700/50':'border-gray-300/30'}">
                       <div class="flex items-center space-x-1.5 cursor-pointer active:scale-90 transition-all text-gray-400 hover:text-pink-500" onclick="window.cpActions.rerollDiary('${cpState.diaryDate}')">
                           <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                       </div>
                       <div class="flex items-center space-x-1.5 cursor-pointer active:scale-90 transition-all text-gray-400 hover:text-red-500" onclick="window.cpActions.deleteDiary('${cpState.diaryDate}')">
                           <i data-lucide="trash-2" class="w-4 h-4"></i>
                       </div>
                   </div>
               ` : ''}
               
               ${diary && (diary.comments || []).length > 0 ? `
                   <div class="mt-8 pt-6 border-t ${isDark?'border-gray-700/50':'border-gray-300/30'} flex flex-col space-y-8" onclick="event.stopPropagation()">
                      ${diary.comments.map((c, idx) => `
                          <div class="flex flex-col">
                              <span class="text-[11px] font-bold ${isDark?'text-gray-500':'text-gray-400'} mb-3 ${c.sender === 'me' ? 'text-right' : 'text-left'}">— ${c.sender === 'me' ? boundPersona.name : char.name} 的批注/共写 · ${c.time} —</span>
                              <div class="${t.font} ${t.text} text-[15px] relative group" style="letter-spacing: ${cfg.letterSpacing}; line-height: ${cfg.lineHeight};">
                                  ${renderDiaryContent(c.text, cfg)}
                                  
                                  <div class="mt-3 flex items-center space-x-3 opacity-30 group-hover:opacity-100 transition-opacity ${c.sender === 'me' ? 'justify-end' : 'justify-start'}">
                                      ${c.sender !== 'me' ? `
                                          <i data-lucide="edit-3" class="w-4 h-4 cursor-pointer hover:text-gray-800 active:scale-90" onclick="event.stopPropagation(); window.cpActions.openCommentEdit(${idx})" title="编辑"></i>
                                          <i data-lucide="refresh-cw" class="w-4 h-4 cursor-pointer hover:text-gray-800 active:scale-90" onclick="event.stopPropagation(); window.cpActions.rerollComment(${idx})" title="重Roll"></i>
                                      ` : ''}
                                      <i data-lucide="trash-2" class="w-4 h-4 cursor-pointer hover:text-red-500 active:scale-90" onclick="event.stopPropagation(); window.cpActions.deleteComment(${idx})" title="删除"></i>
                                  </div>
                              </div>
                          </div>
                      `).join('')}
                      ${cpState.isDiaryTyping ? `<div class="text-[12px] text-gray-400 text-center italic mt-4 animate-pulse">TA 正在提笔继续写...</div>` : ''}
                   </div>
               ` : ''}
            </div>
         </div>

         <div class="px-5 pb-8 pt-2 relative z-20 flex flex-col items-center" onclick="event.stopPropagation()">
            
            ${(!cpState.isGeneratingDiary && (!diary || (!diary.content && (!diary.comments || diary.comments.length === 0))) && cpState.diaryDate === logicalToday) ? `
               <button onclick="window.cpActions.callToWriteDiary()" class="mb-4 px-7 py-3 bg-gray-900/90 backdrop-blur-md text-white font-extrabold rounded-full active:scale-95 transition-transform text-[13px] tracking-widest shadow-xl border border-gray-700 flex items-center">
                  <i data-lucide="pen-tool" class="w-4 h-4 mr-2"></i> 喊 ${char.name} 提笔写日记
               </button>
            ` : ''}

            <div class="w-full bg-white/80 backdrop-blur-xl border border-gray-200/60 rounded-full flex items-center px-2 py-1.5 shadow-sm">
               <input id="diary-comment-input" type="text" placeholder="写下你的共写日记..." class="flex-1 bg-transparent px-4 py-2 text-[14px] text-gray-800 outline-none placeholder-gray-400">
               <div class="w-9 h-9 bg-gray-900 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-transform" onclick="window.cpActions.submitComment()">
                  <i data-lucide="arrow-up" class="w-5 h-5 text-white"></i>
               </div>
            </div>
         </div>

         ${cpState.showDiarySettings ? `
         <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.toggleDiarySettings(false)">
             <div class="bg-[#fcfcfc] w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-[28px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                 <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                     <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="sliders-horizontal" class="w-5 h-5 mr-2 text-gray-800"></i>日记本排版引擎</span>
                 </div>
                 <div class="p-6 flex flex-col space-y-5">
                     <div class="flex justify-between items-center bg-white p-4 rounded-[16px] border border-gray-100 shadow-sm">
                         <span class="text-[14px] font-bold text-gray-700">定时写日记</span>
                         <input type="checkbox" id="diary-enable-switch" class="ios-switch" ${cfg.enabled ? 'checked' : ''}>
                     </div>
                     <div class="grid grid-cols-2 gap-4">
                         <div>
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">每日撰写时间</span>
                             <input id="diary-time-input" type="time" value="${cfg.time}" class="w-full bg-white border border-gray-200 rounded-[12px] px-3 py-2.5 outline-none text-[16px] text-gray-800 shadow-sm">
                         </div>
                         <div>
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">整体风格</span>
                             <select id="diary-theme-select" class="w-full bg-white border border-gray-200 rounded-[12px] px-3 py-2.5 outline-none text-[16px] text-gray-800 shadow-sm">
                                 <option value="default" ${cfg.theme==='default'?'selected':''}>极简纯白</option>
                                 <option value="vintage" ${cfg.theme==='vintage'?'selected':''}>复古牛皮</option>
                                 <option value="romance" ${cfg.theme==='romance'?'selected':''}>心动粉红</option>
                                 <option value="dark" ${cfg.theme==='dark'?'selected':''}>深夜暗黑</option>
                             </select>
                         </div>
                     </div>
                     
                     <div class="h-px w-full bg-gray-200/50"></div>

                     <div>
                         <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">纸张纹理</span>
                         <select id="diary-paper-select" class="w-full bg-white border border-gray-200 rounded-[12px] px-3 py-2.5 outline-none text-[16px] text-gray-800 shadow-sm">
                             <option value="blank" ${cfg.paper==='blank'?'selected':''}>空白无痕</option>
                             <option value="lined" ${cfg.paper==='lined'?'selected':''}>横线信笺</option>
                             <option value="grid" ${cfg.paper==='grid'?'selected':''}>网格笔记</option>
                             <option value="dotted" ${cfg.paper==='dotted'?'selected':''}>点阵手帐</option>
                         </select>
                     </div>
                     <div class="grid grid-cols-3 gap-3">
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">字距</span>
                             <select id="diary-ls-select" class="w-full bg-white border border-gray-200 rounded-lg py-2 pl-2 pr-0 outline-none text-[16px] text-gray-800 shadow-sm">
                                 <option value="normal" ${cfg.letterSpacing==='normal'?'selected':''}>默认</option>
                                 <option value="1px" ${cfg.letterSpacing==='1px'?'selected':''}>宽松</option>
                                 <option value="2px" ${cfg.letterSpacing==='2px'?'selected':''}>极宽</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">行距</span>
                             <select id="diary-lh-select" class="w-full bg-white border border-gray-200 rounded-lg py-2 pl-2 pr-0 outline-none text-[16px] text-gray-800 shadow-sm">
                                 <option value="1.5" ${cfg.lineHeight==='1.5'?'selected':''}>紧凑</option>
                                 <option value="1.8" ${cfg.lineHeight==='1.8'?'selected':''}>舒适</option>
                                 <option value="2.2" ${cfg.lineHeight==='2.2'?'selected':''}>散文</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">缩进</span>
                             <select id="diary-ti-select" class="w-full bg-white border border-gray-200 rounded-lg py-2 pl-2 pr-0 outline-none text-[16px] text-gray-800 shadow-sm">
                                 <option value="0" ${cfg.textIndent==='0'?'selected':''}>无缩进</option>
                                 <option value="2em" ${cfg.textIndent==='2em'?'selected':''}>空两格</option>
                             </select>
                         </div>
                     </div>

                     <div class="h-px w-full bg-gray-200/50"></div>

                     <div class="grid grid-cols-2 gap-4">
                         <div class="flex flex-col">
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block">阴暗面字体色 (~~划线)</span>
                             <div class="flex items-center space-x-2">
                                 <input type="color" id="diary-hidden-color" value="${cfg.hiddenColor}" class="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent">
                                 <span class="text-[11px] font-mono text-gray-400">隐藏的心事</span>
                             </div>
                         </div>
                         <div class="flex flex-col">
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block">高光字体色 (**加粗)</span>
                             <div class="flex items-center space-x-2">
                                 <input type="color" id="diary-highlight-color" value="${cfg.highlightColor}" class="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent">
                                 <span class="text-[11px] font-mono text-gray-400">最深的感触</span>
                             </div>
                         </div>
                     </div>

                     <button onclick="window.cpActions.saveDiarySettings()" class="w-full py-4 mt-2 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform shadow-md tracking-widest text-[15px]">保存排版设置</button>
                 </div>
             </div>
         </div>
         ` : ''}

         ${cpState.showDiaryEdit ? `
         <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.toggleDiaryEdit(false)">
             <div class="bg-[#fcfcfc] w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                 <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
                     <span class="font-bold text-gray-800 text-[16px]">编辑日记内容</span>
                 </div>
                 <div class="p-6 flex flex-col space-y-2">
                     <span class="text-[10px] text-gray-400 font-bold">使用 <code class="text-rose-400">~~文本~~</code> 渲染阴暗面，使用 <code class="text-pink-400">**文本**</code> 渲染高光处。</span>
                     <textarea id="diary-edit-textarea" class="w-full h-48 bg-white border border-gray-200 rounded-[14px] p-4 outline-none text-[14px] text-gray-800 shadow-sm resize-none hide-scrollbar leading-relaxed">${diary ? diary.content : ''}</textarea>
                     <button onclick="window.cpActions.saveDiaryEdit()" class="w-full py-4 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform">确认修改</button>
                 </div>
             </div>
         </div>
         ` : ''}

         ${cpState.showCommentEdit ? `
         <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.closeCommentEdit()">
             <div class="bg-[#fcfcfc] w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                 <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
                     <span class="font-bold text-gray-800 text-[16px]">编辑回复内容</span>
                 </div>
                 <div class="p-6 flex flex-col space-y-2">
                     <span class="text-[10px] text-gray-400 font-bold">使用 <code class="text-rose-400">~~文本~~</code> 渲染阴暗面，使用 <code class="text-pink-400">**文本**</code> 渲染高光处。</span>
                     <textarea id="comment-edit-textarea" class="w-full h-32 bg-white border border-gray-200 rounded-[14px] p-4 outline-none text-[14px] text-gray-800 shadow-sm resize-none hide-scrollbar leading-relaxed">${diary.comments[cpState.editingCommentIdx].text}</textarea>
                     <button onclick="window.cpActions.saveCommentEdit()" class="w-full py-4 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform mt-2 tracking-widest text-[14px]">确认修改</button>
                 </div>
             </div>
         </div>
         ` : ''}

      </div>
     `;
  }

  if (cpState.view === 'questions') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const chat = store.chats.find(c => c.charId === char.id);
        const myAvatar = chat?.myAvatar || (store.personas.find(p => String(p.id) === String(chat?.boundPersonaId)) || store.personas[0]).avatar;

        store.coupleSpacesData = store.coupleSpacesData || {};
        const spaceData = store.coupleSpacesData[char.id] || {};
        spaceData.questions = spaceData.questions || [];

        // 🌟 渲染粉蓝双色卡片列表
        let qListHtml = spaceData.questions.length === 0 ? `
            <div class="flex flex-col items-center justify-center h-40 opacity-50 mt-10">
                <i data-lucide="inbox" class="w-12 h-12 mb-3 text-gray-400"></i>
                <span class="text-[14px] font-bold text-gray-400">还没有任何提问哦</span>
            </div>
        ` : spaceData.questions.map((q) => {
            if (q.asker === 'me') {
                return `
                <div class="w-full bg-rose-50 border border-rose-100/60 rounded-[24px] p-5 mb-4 shadow-sm flex flex-col">
                    <div class="flex items-center space-x-2.5 mb-3">
                        <img src="${myAvatar}" class="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm">
                        <span class="text-[13px] font-black text-rose-400">我的提问</span>
                        <span class="text-[11px] font-bold text-gray-300 ml-auto">${new Date(q.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p class="text-[16px] text-gray-800 font-bold mb-4 leading-relaxed">${q.text}</p>
                    <div class="bg-white/80 rounded-[16px] p-4 text-[14px] text-gray-700 shadow-sm border border-rose-50/50">
                        ${q.answer ? `<div class="flex items-start space-x-2"><img src="${char.avatar}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-gray-100"><span class="leading-relaxed font-medium">${window.formatTextWithEmoticons ? window.formatTextWithEmoticons(q.answer) : q.answer}</span></div>` : `<div class="flex items-center space-x-1.5 text-rose-400"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span class="text-[12px] font-bold">呼唤 ${char.name} 中...</span></div>`}
                    </div>
                </div>`;
            } else {
                return `
                <div class="w-full bg-blue-50 border border-blue-100/60 rounded-[24px] p-5 mb-4 shadow-sm flex flex-col">
                    <div class="flex items-center space-x-2.5 mb-3">
                        <img src="${char.avatar}" class="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm">
                        <span class="text-[13px] font-black text-blue-500">${char.name}的提问</span>
                        <span class="text-[11px] font-bold text-gray-300 ml-auto">${new Date(q.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p class="text-[16px] text-gray-800 font-bold mb-4 leading-relaxed">${q.text}</p>
                    ${q.answer ? `
                        <div class="bg-white/80 rounded-[16px] p-4 text-[14px] text-gray-700 shadow-sm border border-blue-50/50">
                            <div class="flex items-start space-x-2"><img src="${myAvatar}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-gray-100"><span class="leading-relaxed font-medium">${q.answer}</span></div>
                        </div>
                    ` : `
                        <div class="flex items-center space-x-2 mt-1">
                            <input type="text" id="ans-input-${q.id}" class="flex-1 bg-white border border-blue-100 rounded-full h-11 px-5 text-[14px] font-medium outline-none focus:border-blue-300 transition-colors shadow-inner" placeholder="写下你的回答...">
                            <button onclick="window.cpActions.answerQuestion('${q.id}')" class="w-11 h-11 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all shadow-md shrink-0">
                                <i data-lucide="arrow-up" class="w-5 h-5"></i>
                            </button>
                        </div>
                    `}
                </div>`;
            }
        }).join('');

        return `
        <div class="w-full h-full flex flex-col bg-[#fcfcfc] relative animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div class="h-[68px] shrink-0 flex items-center justify-between px-5 bg-white/90 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-20">
                <button onclick="window.cpActions.openDashboard('${char.id}')" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 active:bg-gray-100 transition-colors -ml-2">
                    <i data-lucide="chevron-left" class="w-7 h-7 text-gray-800"></i>
                </button>
                <span class="text-[17px] font-black text-gray-900 tracking-wide">提问箱</span>
                <button onclick="window.cpActions.openQuestionSettings()" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 active:bg-gray-100 transition-colors -mr-2">
                    <i data-lucide="settings" class="w-5 h-5 text-gray-600"></i>
                </button>
            </div>

            <div class="p-5 bg-white border-b border-gray-50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] z-10 flex flex-col space-y-3">
                <textarea id="new-q-input" class="w-full bg-gray-50 border border-transparent rounded-[20px] p-4 outline-none text-[15px] font-medium text-gray-800 resize-none h-24 focus:border-rose-200 focus:bg-rose-50/30 transition-all hide-scrollbar" placeholder="想问 ${char.name} 什么？写在这里..."></textarea>
                <div class="flex justify-end">
                    <button onclick="window.cpActions.askQuestion('${char.id}')" class="px-6 h-10 rounded-full bg-gray-900 text-white text-[14px] font-bold shadow-md active:scale-95 transition-all flex items-center">
                        投递问题 <i data-lucide="send" class="w-3.5 h-3.5 ml-2"></i>
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-5 space-y-2 pb-24 hide-scrollbar">
                ${qListHtml}
            </div>

            ${cpState.showQuestionSettings ? `
            <div class="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.closeQuestionSettings()">
                <div class="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-6 px-1">
                        <span class="text-[18px] font-black text-gray-900">设置提问箱</span>
                        <button onclick="window.cpActions.closeQuestionSettings()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>
                    
                    <div class="flex flex-col space-y-4 bg-gray-50/50 p-4 rounded-[24px] border border-gray-100">
                        <div class="flex items-center justify-between py-1">
                            <div class="flex flex-col">
                                <span class="text-[15px] font-bold text-gray-800">允许角色提问</span>
                                <span class="text-[11px] font-medium text-gray-400 mt-1">开启后，对方会向你发起提问</span>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" id="q-enable-toggle" class="sr-only peer" ${spaceData.enableAiQuestions !== false ? 'checked' : ''}>
                              <div class="w-12 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500 shadow-inner"></div>
                            </label>
                        </div>
                        
                        <div class="w-full h-[1px] bg-gray-200/60"></div>

                        <div class="flex items-center justify-between py-1">
                            <span class="text-[15px] font-bold text-gray-800">每日提问频率</span>
                            <select id="q-freq-select" class="bg-transparent border-none text-[15px] font-bold text-blue-500 outline-none cursor-pointer text-right dir-rtl">
                                <option value="1" ${spaceData.aiQuestionFreq == 1 ? 'selected' : ''}>1条/天</option>
                                <option value="2" ${(spaceData.aiQuestionFreq || 2) == 2 ? 'selected' : ''}>2条/天</option>
                                <option value="3" ${spaceData.aiQuestionFreq == 3 ? 'selected' : ''}>3条/天</option>
                                <option value="5" ${spaceData.aiQuestionFreq == 5 ? 'selected' : ''}>5条/天</option>
                            </select>
                        </div>
                    </div>

                    <button onclick="window.cpActions.saveQuestionSettings('${char.id}')" class="w-full py-4 mt-8 bg-gray-900 text-white rounded-[20px] font-black text-[15px] shadow-lg active:scale-95 transition-all">
                        完成
                    </button>
                </div>
            </div>
            ` : ''}
        </div>
        `;
    }
}