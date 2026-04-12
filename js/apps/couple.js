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
        enabled: false, time: '22:00', theme: 'default',
        paper: 'blank', letterSpacing: '1px', lineHeight: '2.0', textIndent: '2em',
        hiddenColor: '#ef4444', highlightColor: '#ec4899'
    };
}
if (!store.diaries) store.diaries = [];

// 🌟 新增：将问答记录作为隐藏消息推入聊天室 (仅存储，不触发 AI)
const pushQnAHiddenMessage = (charId, askerName, questionText, answererName, answerText) => {
    const chat = store.chats.find(c => c.charId === charId);
    if (!chat) return;
    // 构造清晰易读的隐藏消息文本
    const hiddenText = `【提问箱记录】\n${askerName} 问：${questionText}\n${answererName} 答：${answerText}`;
    chat.messages.push({
        id: Date.now(),
        sender: 'system',           // 系统发送，不干扰对话
        isMe: false,
        isHidden: true,             // 隐藏消息，不在聊天界面展示
        msgType: 'hidden_qna',
        text: hiddenText,
        timestamp: Date.now()
    });
    // 仅存储，不调用 scheduleCloudTask
    if (window.actions?.saveStore) window.actions.saveStore();
    // 如果当前正在渲染，刷新界面（但隐藏消息不会显示，仅保持数据同步）
    if (typeof window.render === 'function') window.render();
};

if (!window.cpActions) {
  window.cpActions = {
    // 🧠 AI 思考链净化器
    cleanAI: (text) => {
        if (!text) return '';
        return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
    },
    
    // 🌟 终极 Prompt 组装流水线 (与 llm.js 底层 1:1 对齐)
    buildMasterPrompt: (charId, options = {}) => {
      const { char, chat, boundP } = window.cpActions.getQContext(charId);
      
      const { 
          history = '',       
          task = '',          
          recentText = '',    // 用于触发记忆和世界书扫描
          scenario = 'chat',  // 'diary' | 'tod' | 'dareStory' | 'tacit' | 'hundredStory'
      } = options;

      // ==========================================
      // 1. 基础人设、核心记忆与用户设定 (对齐 llm.js)
      // ==========================================
      const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
      const boundPrompt = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';
      
      const basePrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【用户】\n当前化名：${boundP.name}${globalP}${boundPrompt}`;

      const coreMem = (store.memories || []).filter(m => m.charId === charId && m.type === 'core').map(m=>m.content).join('；');
      const coreMemStr = coreMem ? `\n\n【核心记忆】\n${coreMem}` : '';

      // ==========================================
      // 2. 动态碎片记忆扫描 (对齐 llm.js)
      // ==========================================
      let fragMemStr = '';
      if (recentText) {
          const frags = (store.memories || []).filter(m => m.charId === charId && m.type === 'fragment').filter(m => {
              const kws = (m.keywords || '').split(',').map(k=>k.trim()).filter(k=>k);
              return kws.some(k => recentText.includes(k));
          }).map(m=>m.content).join('；');
          if (frags) fragMemStr = `\n\n【触发的回忆片段】\n${frags}`;
      }

      // ==========================================
      // 3. 世界书挂载引擎 (严格区分线上/线下场景)
      // ==========================================
      let frontWb = [], middleWb = [], backWb = [];
      (store.worldbooks || []).forEach(wbItem => {
          if (!wbItem.enabled) return;
          
          let shouldInject = false;
          // 全局生效
          if (wbItem.type === 'global') shouldInject = true;
          // 🌟 核心分流：局部挂载 (Local)
          else if (wbItem.type === 'local') {
              // a. 基础线上挂载 (所有场景都生效，比如基础补充设定)
              if (char.mountedWorldbooks && char.mountedWorldbooks.includes(wbItem.id)) shouldInject = true;
              
              // b. 线下/副本专属挂载 (仅日记、大小冒险副本生效)
              const isOfflineScenario = ['diary', 'dareStory', 'hundredStory'].includes(scenario);
              if (isOfflineScenario) {
                  // 读取微信主程序的线下场景世界书
                  if (char.offlineWorldbooks && char.offlineWorldbooks.includes(wbItem.id)) shouldInject = true;
              }
          }

          if (shouldInject) {
              const entryStr = `【${wbItem.title}】：${wbItem.content}`;
              if (wbItem.position === 'front') frontWb.push(entryStr);
              else if (wbItem.position === 'back') backWb.push(entryStr);
              else middleWb.push(entryStr);
          }
      });

      const frontStr = frontWb.length > 0 ? `\n\n[前置世界观设定]\n${frontWb.join('\n')}` : '';
      const middleStr = middleWb.length > 0 ? `\n\n[当前环境/场景设定]\n${middleWb.join('\n')}` : '';
      const backStr = backWb.length > 0 ? `\n\n[最新/最高优先级世界书指令]\n${backWb.join('\n')}` : '';

      // ==========================================
      // 5. 组装终极 Prompt (利用近因效应锁定任务)
      // ==========================================
      const historyStr = history ? `\n\n【当前历史记录】\n${history}` : '';
      
      return `${basePrompt}${coreMemStr}${frontStr}\n${middleStr}${fragMemStr}${backStr}${historyStr}\n\n【系统任务】\n${task}`;
  },
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
                msgType: 'invite_card',
                text: '[情侣空间开通邀请]',
                timestamp: Date.now()
            });

            // 删掉之前的 push 隐身消息
        if (typeof window.scheduleCloudTask === 'function') {
            window.scheduleCloudTask(charId, "(系统指令：用户发送了情侣空间邀请。请回复[接受邀请]，并表达期待！[接受邀请]须单独成行。)");
        }
            
            // 🌟 注入神级反馈：加上这行绝美的 Toast！
            if (window.actions && window.actions.showToast) {
                window.actions.showToast('邀请函已飞入 TA 的信箱，请耐心等待回信~');
            }
        }
        
        cpState.showCreateSpaceModal = false;
        
        // 顺手修个潜在bug：如果原来的代码是 cpRender()，这里统一改成现代的 window.render()
        if (typeof window.render === 'function') {
            window.render();
        } else if (window.cpActions && window.cpActions.cpRender) {
            window.render();
        }
    },
  // 🌟 提问箱导航与设置
  openQuestions: (charId) => { cpState.view = 'questions'; cpState.activeCharId = charId; window.render(); },
  openQuestionSettings: () => { cpState.showQuestionSettings = true; window.render(); },
  closeQuestionSettings: () => { cpState.showQuestionSettings = false; window.render(); },
  
  // 🌟 保存设置
  saveQuestionSettings: (charId) => {
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      store.coupleSpacesData[charId].enableAiQuestions = document.getElementById('q-enable-toggle').checked;
      store.coupleSpacesData[charId].aiQuestionFreq = parseInt(document.getElementById('q-freq-select').value);
      cpState.showQuestionSettings = false;
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
      if(window.actions?.showToast) window.actions.showToast('提问箱设置已保存！');
      
      // 🌟 修复：保存后立刻强行唤醒后台扫描一次！
      if (store.coupleSpacesData[charId].enableAiQuestions && window.cpActions?.doQuestionScan) {
          window.cpActions.doQuestionScan();
      }
  },

  getQContext: (charId, text='') => {
      const char = store.contacts.find(c => c.id === charId);
      const chat = store.chats.find(c => c.charId === charId);
      // 🌟 彻底修复：精准读取当前聊天室绑定的马甲ID，没有才退回默认
      const boundPId = (chat?.isGroup ? chat.boundPersonaId : char?.boundPersonaId) || store.personas[0].id;
      const boundP = store.personas.find(p => String(p.id) === String(boundPId)) || store.personas[0];
      const globalP = store.personas[0];
      // 🌟 彻底修复：精准读取专属头像
      const myAvatar = chat?.myAvatar || boundP.avatar;

      let coreMem = (store.memories || []).filter(m => m.charId === charId && m.type === 'core').map(m=>m.content).join('；');
      let fragMem = '';
      if (text) {
          fragMem = (store.memories || []).filter(m => m.charId === charId && m.type === 'fragment').filter(m => {
              const kws = (m.keywords || '').split(',').map(k=>k.trim()).filter(k=>k);
              return kws.some(k => text.includes(k));
          }).map(m=>m.content).join('；');
      }

      const coreMemStr = coreMem ? `\n【核心记忆】\n${coreMem}` : '';
      const fragMemStr = fragMem ? `\n【触发的回忆片段】\n${fragMem}` : '';
      const globalPromptStr = globalP.prompt ? `\n【用户全局人设】\n${globalP.prompt}` : '';
      const boundPromptStr = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';

      const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${coreMemStr}${fragMemStr}\n\n【用户】\n当前化名：${boundP.name}${globalPromptStr}${boundPromptStr}`;
      
      return { char, chat, boundP, myAvatar, promptStr };
  },

  // 🌟 删除提问卡片与回答
  deleteQuestion: (charId, qId) => {
      if (!confirm('确定彻底删除这个问题吗？')) return;
      store.coupleSpacesData[charId].questions = store.coupleSpacesData[charId].questions.filter(q => q.id !== qId);
      window.render();
  },

  // 🌟 用户发起提问
  askQuestion: async (charId) => {
      const input = document.getElementById('new-q-input');
      const text = input.value.trim();
      if (!text) return;
      
      store.coupleSpacesData = store.coupleSpacesData || {};
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      store.coupleSpacesData[charId].questions = store.coupleSpacesData[charId].questions || [];
      
      const qId = 'Q_' + Date.now();
      store.coupleSpacesData[charId].questions.unshift({ id: qId, asker: 'me', text: text, answer: null, timestamp: Date.now() });
      input.value = '';
      window.render();
      await window.cpActions.fetchQAnswer(charId, qId, text);
  },

  // 🌟 角色回答的重Roll引擎
  rerollQAnswer: async (charId, qId) => {
      const targetQ = store.coupleSpacesData[charId].questions.find(q => q.id === qId);
      if (!targetQ) return;
      targetQ.answer = null;
      window.render();
      await window.cpActions.fetchQAnswer(charId, qId, targetQ.text);
  },

  fetchQAnswer: async (charId, qId, text) => {
    const ctx = window.cpActions.getQContext(charId, text);
    try {
        const taskMsg = `【系统任务】用户 ${ctx.boundP.name} 在情侣提问箱向你提问：“${text}”。\n请结合上述人设和记忆，真实、自然地回答。❗要求极度精简，字数严格控制在30字以内！直接输出回答正文，绝不要带任何前缀！`;
        const prompt = window.cpActions.buildMasterPrompt(charId, {
            task: taskMsg,
            scenario: 'questions'
        });  
        const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
        });
        const data = await res.json();
        const answer = window.cpActions.cleanAI(data.choices[0].message.content);
        const targetQ = store.coupleSpacesData[charId].questions.find(q => q.id === qId);
        if (targetQ) {
            targetQ.answer = answer;
            // 推入隐藏消息：用户提问，角色回答
            pushQnAHiddenMessage(charId, ctx.boundP.name, text, ctx.char.name, answer);
        }
        window.render();
    } catch(e) {
        if (window.actions.showToast) window.actions.showToast('网络波动，TA没能回答');
    }
},

// 🌟 删除卡片里的回答 (连带 TA 的反应一起撤销)
  deleteQAnswer: (charId, qId) => {
      if (!confirm('确定要撤回这个回答吗？')) return;
      const targetQ = store.coupleSpacesData[charId].questions.find(q => q.id === qId);
      if (targetQ) {
          targetQ.answer = null;
          targetQ.reaction = null; // 清空反应
      }
      window.render();
  },

  answerQuestion: async (qId) => {
    const charId = cpState.activeCharId;
    const input = document.getElementById('ans-input-' + qId);
    const text = input.value.trim();
    if (!text) return;
    
    const spaceData = store.coupleSpacesData[charId];
    const targetQ = spaceData.questions.find(q => q.id === qId);
    if (!targetQ) return;
    
    targetQ.answer = text;
    const ctx = window.cpActions.getQContext(charId);
    const askerName = ctx.char.name;
    const answererName = ctx.boundP.name;
    // 推入隐藏消息：角色提问，用户回答
    pushQnAHiddenMessage(charId, askerName, targetQ.text, answererName, text);
    window.render();

    try {
        const taskMsg = `【系统任务】你之前在提问箱向用户提问：“${targetQ.text}”。\n用户刚才回答了你：“${text}”。\n请对用户的回答做出简短、自然的反应/评价。❗要求极度精简，字数严格控制在30字以内！直接输出反应正文，绝不要带任何前缀！`;
        const prompt = window.cpActions.buildMasterPrompt(charId, {
            task: taskMsg,
            scenario: 'questions'
        });
        const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
        });
        const data = await res.json();
        targetQ.reaction = window.cpActions.cleanAI(data.choices[0].message.content);
        window.render();
    } catch(e) {
        targetQ.reaction = "（TA 似乎在忙，轻轻摸了摸你的头...）";
        window.render();
    }
},
  // 🌟 重 Roll 提问箱里的 AI 反应
  rerollQReaction: async (charId, qId) => {
      const targetQ = store.coupleSpacesData[charId].questions.find(q => q.id === qId);
      if (!targetQ || !targetQ.answer) return;
      targetQ.reaction = null;
      window.render();
      try {
          const taskMsg = `【系统任务】你之前在提问箱向用户提问：“${targetQ.text}”。\n用户刚才回答了你：“${targetQ.answer}”。\n请对用户的回答做出简短、自然的反应/评价。❗要求极度精简，字数严格控制在30字以内！直接输出反应正文，绝不要带任何前缀！`;
          const prompt = window.cpActions.buildMasterPrompt(charId, {
              task: taskMsg,
              scenario: 'questions'
          });
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
          });
          const data = await res.json();
          targetQ.reaction = window.cpActions.cleanAI(data.choices[0].message.content);
          window.render();
      } catch(e) {
          targetQ.reaction = "（TA 似乎在忙，轻轻摸了摸你的头...）";
          window.render();
      }
  },
    closeApp: () => { window.actions.setCurrentApp(null); },
    openDashboard: (id) => { cpState.activeCharId = id; cpState.view = 'dashboard'; window.render(); },
    goBack: () => { cpState.view = 'select'; cpState.activeCharId = null; window.render(); },
    goBackToDashboard: () => { cpState.view = 'dashboard'; window.render(); },
    
    // 纪念日
    openAnniversaries: () => { cpState.view = 'anniversaries'; window.render(); },
    openAddModal: () => { cpState.showAddModal = true; window.render(); },
    closeAddModal: () => { cpState.showAddModal = false; window.render(); },
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
        window.render();
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
        const lockedCharId = cpState.activeCharId;
        const lockedDateStr = cpState.diaryDate; // 🌟 新增：进门先把日期死死锁住
        const char = store.contacts.find(c => c.id === lockedCharId);
        // 🌟 修复：用锁死的变量去找日记
        const d = store.diaries.find(d => d.charId === lockedCharId && d.date === lockedDateStr);
        if (!store.apiConfig?.apiKey || !d || !d.comments[idx]) return;
        
        // 提取重 Roll 的上下文
        const previousComments = d.comments.slice(0, idx);
        let lastUserComment = '';
        for(let i = idx-1; i>=0; i--){ if(d.comments[i].sender === 'me') { lastUserComment = d.comments[i].text; break; } }
        
        d.comments[idx].text = '...'; 
        cpState.isDiaryTyping = true; window.render();
        
        try {
            // 🌟 修复：这里也用锁住的日期
            const historyStr = getTodayChatHistory(lockedCharId, lockedDateStr);
            const diaryContent = d.content ? `\n\n【今日日记正文】\n${d.content}` : '';
            const commentsStr = previousComments.map(c => `${c.sender === 'me' ? '用户' : char.name}的共写: ${c.text}`).join('\n');
            const userContext = commentsStr ? `\n\n【之前的共写记录】\n${commentsStr}` : '';
            
            const taskMsg = `${diaryContent}${userContext}\n\n【用户的最新共写】\n${lastUserComment}\n\n【任务】用户对你刚才的续写不满意（要求重写）。请你以伴侣的身份，换一个更深情、更细腻的角度重新回复。\n❗要求：字数 150-300字，支持 ~~阴暗面~~ 和 **高光** 语法。直接输出正文！`;
            const promptStr = window.cpActions.buildMasterPrompt(lockedCharId, {
              history: historyStr,
              task: taskMsg,
              recentText: historyStr,
              scenario: 'diary'
          });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: Number(store.apiConfig?.temperature ?? 0.85) }) });
            const data = await res.json();
            d.comments[idx].text = window.cpActions.cleanAI(data.choices[0].message.content);
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
    // 🌟 整合与修复：重摇日记（传入具体的 charId 和 dateStr）
  rerollDiary: async (charId, dateStr) => {
      if (!confirm('确定要让 TA 重新写这一天的日记吗？')) return;
      store.diaries = (store.diaries || []).filter(d => !(d.charId === charId && d.date === dateStr));
      if (window.actions?.saveStore) window.actions.saveStore();
      window.render();
      
      await window.cpActions.callToWriteDiary(charId, dateStr);
  },

  // 🌟 整合与修复：统一的写日记核心（绝对禁止在 await 后使用 cpState.activeCharId）
  callToWriteDiary: async (targetCharId, targetDateStr) => {
      const char = store.contacts.find(c => c.id === targetCharId);
      if (!store.apiConfig?.apiKey) return window.actions.showToast('请先配置 API Key');
      
      cpState.isGeneratingDiary = true; window.render();
      if (window.actions?.showToast) window.actions.showToast('正在召唤 TA 写日记...');
      
      try {
          // 替换掉原来的 promptStr 组装
          const historyStr = getTodayChatHistory(targetCharId, targetDateStr);
          const taskMsg = `【系统任务】今天即将结束，请你结合今天的聊天记录、人设和记忆，写一篇今天的私密日记。\n要求：\n1. 第一人称口吻，真实自然的情感表达。\n2. 总结今天的互动，或者表达对用户的思念/感受。\n3. 要求：字数 150-300字，支持 ~~阴暗面~~ 和 **高光** 语法。直接输出正文！`;
          
          const promptStr = window.cpActions.buildMasterPrompt(targetCharId, {
              history: historyStr,
              task: taskMsg,
              recentText: historyStr,
              scenario: 'diary'
          });
          
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
          });
          const data = await res.json();
          const content = window.cpActions.cleanAI(data.choices[0].message.content);
          
          // ❗闭包死锁：严格使用传入的 targetCharId，无论此时用户切到了哪个界面！
          store.diaries = store.diaries || [];
          let d = store.diaries.find(d => d.charId === targetCharId && d.date === targetDateStr);
          if (d) { d.content = content; } else { store.diaries.push({ id: Date.now(), charId: targetCharId, date: targetDateStr, content: content, comments: [] }); }
      } catch (e) {
          console.error("写日记失败", e);
      } finally {
          cpState.isGeneratingDiary = false;
          if (window.actions?.saveStore) window.actions.saveStore();
          // 只有当用户还在看这个角色的日记时，才刷新画面
          if (cpState.view === 'diary' && cpState.activeCharId === targetCharId) window.render();
      }
  },

  // 🌟 修复：共写串台闭包死锁
  submitComment: async () => {
      const input = document.getElementById('diary-comment-input');
      const text = input.value.trim(); if (!text) return;
      
      // ❗立刻锁定当前状态，绝不允许带入 await 之后
      const lockedCharId = cpState.activeCharId;
      const lockedDateStr = cpState.diaryDate;
      const char = store.contacts.find(c => c.id === lockedCharId);
      
      let d = store.diaries.find(d => d.charId === lockedCharId && d.date === lockedDateStr);
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
        if (!store.apiConfig?.apiKey) { cpState.isDiaryTyping = false; return window.render(); }

        try {
            const historyStr = getTodayChatHistory(char.id, lockedDateStr);
            const diaryContent = d.content ? `\n\n【今日日记正文】\n${d.content}` : '';
            const taskMsg = `${diaryContent}\n\n【用户的共写/批注】\n${text}\n\n【任务】用户刚才在日记本里写下了这段话。请你以伴侣的身份，接着ta的话继续“共写”，或者回复一段你的内心独白。\n❗强制要求：\n1. 字数在 150-300字 之间，必须深情、真挚，也可以带点小情绪或占有欲。\n2. 支持使用 ~~包裹文字~~ 和 **包裹文字** 语法。\n3. 直接输出你续写的正文，绝不要带标题或日期！`;
            const promptStr = window.cpActions.buildMasterPrompt(lockedCharId, {
              history: historyStr,
              task: taskMsg,
              recentText: historyStr,
              scenario: 'diary'
          });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
            });
            const data = await res.json();
            const replyContent = window.cpActions.cleanAI(data.choices[0].message.content);
            
            d.comments.push({ sender: char.id, text: replyContent, time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) });
        } catch (e) {
            console.error('共写回复失败', e);
        } finally {
          cpState.isDiaryTyping = false; 
          if (cpState.view === 'diary' && cpState.activeCharId === lockedCharId) window.render();
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

            const taskMsg = `【任务】请结合聊天记录、你的人设以及当前时间（${new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}），脑洞大开，推测并生成你今天极其符合人设的行踪与健康数据。\n必须返回合法的 JSON 格式数据，结构如下：\n{\n  "distance": 距离用户的公里数(浮点数，比如2.5，如果是异地恋可以设得很大),\n  "steps": 今日运动步数(整数),\n  "places": [\n    {"time": "08:30", "name": "温馨小窝 (出门)"}\n  ], // 按时间顺序排列今天去过的地方，至少1个最多5个\n  "sleepHours": [6.5, 7.0, 5.5], // 前天、昨天、今天凌晨的睡眠时长(3个浮点数)\n  "sleepEval": "以手机系统自带【健康管家】的口吻，客观评价用户的睡眠质量（30字以内，如：昨晚深度睡眠不足，建议今晚放下手机早点休息。）",\n  "phone": {\n    "total": "6.5h",\n    "apps": [\n      {"name": "微信", "time": "2.5h"},\n      {"name": "网易云音乐", "time": "1.8h"}\n    ] // 🌟 随机生成 3 到 5 个最符合TA当前人设和行踪的 App\n  }\n}\n❗警告：只能输出 JSON 格式文本，绝不要带有 \`\`\`json 等任何 Markdown 包裹，也不要有多余解释！`;
            const promptStr = window.cpActions.buildMasterPrompt(char.id, {
              history: historyStr,
              task: taskMsg,
              recentText: historyStr,
              scenario: 'location'
          });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
            });
            const data = await res.json();
            let content = window.cpActions.cleanAI(data.choices[0].message.content);
            // 物理刮除可能带有的大模型 markdown
            content = content.replace(/```json/gi, '').replace(/```/g, '').trim(); 
            cpState.locData = JSON.parse(content);
            char.locData = cpState.locData; // 🌟 每次生成完，牢牢绑在角色身上永久储存！
        } catch (e) {
            console.error('获取行踪失败', e);
            window.actions.showToast('信号干扰，获取行踪失败');
        } finally {
            cpState.isLocRefreshing = false; 
            if (cpState.view === 'location') window.render(); // 🌟 修复：如果我还在定位页面，才刷新画面
        }
    },
    // ==========================================
  // 🌟 默契问答核心引擎
  // ==========================================
  openTacit: (charId) => { 
      cpState.view = 'tacit'; cpState.activeCharId = charId; 
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      const spaceData = store.coupleSpacesData[charId];
      // 如果进来时没有题目，自动出题
      if (!spaceData.tacitStatus) window.cpActions.fetchTacitQ(charId);
      else window.render(); 
  },

  // 🧠 AI 出题大脑 (中立视角出题 + 全局温度挂载)
  fetchTacitQ: async (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      spaceData.tacitStatus = 'loading';
      spaceData.currentTacit = null;
      spaceData.tacitChat = []; // 🌟 点击刷新时，强制清空讨论区！
      window.render();

      try {
          const ctx = window.cpActions.getQContext(charId);
          // 🌟 提取历史默契问答记录
          // 🌟 容量控制器：物理限制 100 条
          spaceData.tacitHistory = spaceData.tacitHistory || [];
          if (spaceData.tacitHistory.length > 100) {
              spaceData.tacitHistory = spaceData.tacitHistory.slice(-100);
          }
          
          // 🌟 Token保护：只提取最近 100 条题目喂给防重 prompt
          const askedHistory = spaceData.tacitHistory.slice(-100).join('、');
          const avoidPrompt = askedHistory ? `\n❗【绝对禁止重复】：你之前已经出过以下问题，绝不允许再出类似或相关的问题：${askedHistory}` : '';

          const taskMsg = `【系统任务】你现在是“情侣默契问答”的出题系统。请以绝对中立的上帝视角，提出一道刁钻、有趣、测试情侣默契度的题目。${avoidPrompt}\n同时，你需要作为 ${ctx.char.name} 给出你的真实答案。\n\n❗【出题方向指导】（严禁出诸如“生日、最爱吃什么”这种死板的记忆背诵题！）\n1. 假设性情景（例：“如果${ctx.boundP.name}中了一千万，第一件事会干嘛？”、“世界末日只能带一样东西，你会带啥？”）\n2. 深度观察/习惯拷问（例：“${ctx.char.name}最让${ctx.boundP.name}抓狂的小毛病是什么？”、“你们吵架时，${ctx.boundP.name}最吃哪一套？”）\n3. 感情回顾（例：“你们第一次冷战是因为什么微不足道的事？”）\n4. 情绪价值（例：“在极其疲惫的一天后，${ctx.boundP.name}最想听到的一句话是什么？”）\n\n❗你必须充分发散思维，结合上下文，每次提出截然不同的新题！严禁照搬上述例子！\n\n❗绝对红线：\n1. 问题必须是第三人称中立视角，绝不能带入角色口吻！\n2. 你的答案必须极度精简，严格控制在 10 个字以内！\n3. 必须输出严格的 JSON 格式：{"question": "问题内容", "answer": "你的答案"}`;

          const prompt = window.cpActions.buildMasterPrompt(charId, {
              task: taskMsg,
              scenario: 'tacit'
          });
          
          const temp = store.apiConfig?.temperature !== undefined ? Number(store.apiConfig.temperature) : 0.85; 
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: temp })
          });
          const data = await res.json();
          let jsonStr = window.cpActions.cleanAI(data.choices[0].message.content);
          const match = jsonStr.match(/\{[\s\S]*\}/); // 暴力提取 JSON
          if (!match) throw new Error("JSON 解析失败");
          
          const qData = JSON.parse(match[0]);
          spaceData.tacitHistory.push(qData.question); // 存入历史库
          spaceData.currentTacit = { question: qData.question, aiAns: qData.answer, userAns: '' };
          spaceData.tacitStatus = 'answering';
          window.render();
      } catch(e) {
          if (window.actions.showToast) window.actions.showToast('出题失败，请点击右上角重试');
          spaceData.tacitStatus = 'error';
          window.render();
      }
  },

  // 🌟 提交答案并揭晓
  submitTacitAns: (charId) => {
      const input = document.getElementById('tacit-ans-input');
      const text = input.value.trim();
      if (!text) return;

      const spaceData = store.coupleSpacesData[charId];
      spaceData.currentTacit.userAns = text;
      spaceData.tacitStatus = 'revealed';
      
      spaceData.tacitChat = spaceData.tacitChat || [];
      spaceData.tacitChat.push({
          id: Date.now(), sender: 'system', isMe: false, msgType: 'system',
          text: `【本轮对答案】\nQ: ${spaceData.currentTacit.question}\n我的回答: ${text}\nTA的回答: ${spaceData.currentTacit.aiAns}`
      });
      window.render();
      setTimeout(() => { const scrollEl = document.getElementById('cp-tacit-chat-scroll'); if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; }, 100);
  },

  // 💬 讨论区：仅发送消息上屏 (不再自动请求AI)
  sendTacitMsg: (charId) => {
      const input = document.getElementById('tacit-chat-input');
      const text = input.value.trim();
      if (!text) return;

      const spaceData = store.coupleSpacesData[charId];
      spaceData.tacitChat = spaceData.tacitChat || [];
      spaceData.tacitChat.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'text', text: text });
      input.value = '';
      window.render();
      setTimeout(() => { const el = document.getElementById('cp-tacit-chat-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
  },

  // 🧠 讨论区：单独请求 AI 回复大脑
  requestTacitReply: async (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      spaceData.tacitChat = spaceData.tacitChat || [];
      
      // 插入 Loading 气泡
      const loadingId = Date.now();
      spaceData.tacitChat.push({ id: loadingId, sender: 'ai', isMe: false, msgType: 'loading' });
      window.render();
      setTimeout(() => { const el = document.getElementById('cp-tacit-chat-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);

      try {
          const ctx = window.cpActions.getQContext(charId);
          const tacitContext = `【当前默契问答】\n问题：${spaceData.currentTacit.question}\n我的答案：${spaceData.currentTacit.userAns}\n你的答案：${spaceData.currentTacit.aiAns}`;
          const chatHistory = spaceData.tacitChat.filter(m => m.msgType === 'text').slice(-20).map(m => `${m.isMe ? '用户' : '你'}: ${m.text}`).join('\n');
          
          const taskMsg = `${tacitContext}\n\n【系统任务】结合对答案情况，以伴侣身份回复用户的聊天。❗要求：极度精简，像微信聊天，严格在30字内！直接输出正文！`;
          const prompt = window.cpActions.buildMasterPrompt(charId, {
            history: chatHistory,  
            task: taskMsg,
            recentText: chatHistory,
            scenario: 'tacit'
          });
          const temp = store.apiConfig?.temperature !== undefined ? Number(store.apiConfig.temperature) : 0.85;
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: temp })
          });
          const data = await res.json();
          
          // 🌟 替换 Loading 气泡为真正的文字气泡
          const targetIdx = spaceData.tacitChat.findIndex(m => m.id === loadingId);
          if (targetIdx !== -1) {
              spaceData.tacitChat[targetIdx] = { id: Date.now(), sender: 'ai', isMe: false, msgType: 'text', text: window.cpActions.cleanAI(data.choices[0].message.content) };
          }
          window.render();
          setTimeout(() => { const el = document.getElementById('cp-tacit-chat-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
      } catch(e) {
          // 失败时移除 loading 气泡
          spaceData.tacitChat = spaceData.tacitChat.filter(m => m.id !== loadingId);
          if (window.actions.showToast) window.actions.showToast('TA 走神了，没能回复');
          window.render();
      }
  },

  // 🌟 讨论区：重 Roll 最后一句话
  rerollTacitMsg: (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      if (!spaceData || !spaceData.tacitChat) return;
      // 找到最后一句 AI 的话，删掉它
      let lastAiIdx = -1;
      for (let i = spaceData.tacitChat.length - 1; i >= 0; i--) {
          if (!spaceData.tacitChat[i].isMe && spaceData.tacitChat[i].msgType === 'text') { lastAiIdx = i; break; }
      }
      if (lastAiIdx !== -1) {
          spaceData.tacitChat.splice(lastAiIdx, 1);
          window.render();
          // 重新呼叫 AI
          window.cpActions.requestTacitReply(charId);
      }
  },
  // ==========================================
  // 🌟 100件小事 (恋爱副本) 核心引擎
  // ==========================================
  openHundredThings: (charId) => {
      cpState.view = 'hundredThings'; cpState.activeCharId = charId;
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      const spaceData = store.coupleSpacesData[charId];
      
      // 🌟 注入纯净且丰富的 100 件小事预设
      if (!spaceData.hundredThings) {
          const presets = [
            "一起看日出", "一起看日落", "在星空下许愿", "共进浪漫烛光晚餐", "互相写一封情书", 
            "一起学习烹饪新菜式", "参加一次情侣瑜伽", "裹着毯子看爱情电影", "在初雪的天气里打雪仗", "去动物园看喜欢的小动物",
            "一起去滑雪或滑冰", "在周末去郊外露营野餐", "尝试一次极限运动", "潜水探索海底世界", "来一场说走就走的自驾游",
            "挑战攀岩攀树", "去广阔的草原骑马", "探访神秘的古老村落", "乘船出海感受海风", "去冰川徒步",
            "深入地下洞穴探险", "去天文台看星星", "参加一场狂欢的音乐节", "共同大扫除打理家务", "一起重新布置房间",
            "共同制定完美的旅行计划", "互相按摩放松身心", "窝在沙发里追完一部剧", "一起去报班学个新技能", "精心准备度过一个节日",
            "互换身份体验对方的一天", "手牵手去逛街买衣服", "参加朋友婚礼沾沾喜气", "一起去北欧看极光", "乘坐热气球俯瞰大地",
            "体验高空跳伞/滑翔伞", "报名参加一次戏剧表演", "进录音棚合唱一首情歌", "去迪士尼当一天小朋友", "一起去做一件DIY手作",
            "生病时温柔地互相照顾", "洗完澡帮彼此吹干头发", "教对方自己的一个特长", "互相给对方化一次妆", "手牵手去彼此的母校走走",
            "为对方准备惊喜派对", "一起去鬼屋", "去寺庙一起求个平安符", "假装当陌生人一天", "庆祝纪念日",
            "一起翻童年相册", "坐在摩天轮最高处接吻", "一起做蛋糕", "做对方一天的专属生活助理", "一起去电玩城",
            "一起去敬老院或孤儿院", "一起写明信片给一年后的我们", "盲挑一套衣服给对方穿", "一起制作爱情相册", "一起写一首我们的歌",
            "一起去对方长大的城市city walk", "一起拼酒，看谁先醉", "一起去水族馆", "拍一套搞怪又甜蜜的情侣写真", "闭上眼睛让对方牵着过马路",
            "深夜下楼吃一次路边摊", "写一篇关于我的小文", "去菜市场买菜体验烟火气", "一起去一次彼此最想去的城市", "一起去挑战一个最不敢做的事",
            "你给我扎一次辫子，我给你刮一次胡子", "互相给对方洗一次头发", "为对方写一首诗", "做一次对方的模特，让他自由创作", "交换手机玩一整天不生气",
            "一起坐一辆从没做过的车，在不认识的地方下车到处逛", "互相模仿对方的行为习惯过一天", "亲手为对方剪一次头发", "互穿对方衣服", "一起参加一次情侣默契比赛",
            "一起制定愿望清单", "给对方准备一个盲盒惊喜", "一起制定家规", "一起cosplay", "一起精心规划一次约会",
            "一起讨论一条社会新闻", "一起去挑选情侣对戒", "冬天去泡一次暖呼呼的温泉", "把车停在路边听歌聊天到深夜", "去书店给对方盲挑一本书",
            "一起分享自己最深的秘密", "一起学一支双人舞", "一起去医院体检", "一起去摆一次摊", "下雨接对方下班",
            "一起去玩一次剧本杀", "一起去玩一次密室逃脱", "冬天为对方亲手织一条围巾", "在没人的海边偷偷放烟花", "互相画一幅对方的印象画"
          ];
          // 状态：0=去完成, 1=进行中, 2=已完成
          spaceData.hundredThings = presets.map((title, idx) => ({ id: 'T_'+Date.now()+'_'+idx, title, status: 0, messages: [] }));
          if(window.actions?.saveStore) window.actions.saveStore();
      } else {
          // 🌟 兼容老数据，把 completed 转化为 status
          spaceData.hundredThings.forEach(t => { if(t.status === undefined) t.status = t.completed ? 2 : 0; });
      }
      window.render();
  },

  addHundredThing: (charId) => {
      const input = document.getElementById('new-thing-input');
      const text = input.value.trim();
      if (!text) return;
      const spaceData = store.coupleSpacesData[charId];
      spaceData.hundredThings.unshift({ id: 'T_'+Date.now(), title: text, status: 0, messages: [] });
      input.value = '';
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },

  openHundredStory: async (charId, thingId) => {
      cpState.view = 'hundredStory'; cpState.activeCharId = charId; cpState.activeThingId = thingId;
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === thingId);
      // 🌟 点进去如果未完成，立刻变成进行中！
      if (target.status === 0) { target.status = 1; if(window.actions?.saveStore) window.actions.saveStore(); }
      window.render();
      
      if (target.messages.length === 0) {
          await window.cpActions.fetchHundredStoryReply(charId, thingId, true);
      } else {
          // 同步置底防闪烁
          const el = document.getElementById('cp-story-scroll');
          if (el) {
              el.style.scrollBehavior = 'auto';
              el.scrollTop = el.scrollHeight;
              if (window.globalScrollStates && window.globalScrollStates['cp-story-scroll']) {
                  window.globalScrollStates['cp-story-scroll'].top = el.scrollHeight;
              }
          }
      }
  },

  // 🌟 退出时的状态拦截引擎
  attemptExitHundredStory: (charId) => {
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === cpState.activeThingId);
      if (target && target.status === 1) {
          cpState.showHundredExitModal = true;
          window.render();
      } else {
          window.cpActions.openHundredThings(charId);
      }
  },
  confirmExitHundredStory: (charId, action) => {
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === cpState.activeThingId);
      if (action === 'finish') {
          target.status = 2; // 已完成！
          // 🌟 触发超神级后台静默记忆提取，将番外写进主线记忆库！
          window.cpActions.extractHundredMemory(charId, target);
      }
      if(window.actions?.saveStore) window.actions.saveStore();
      cpState.showHundredExitModal = false;
      window.cpActions.openHundredThings(charId);
  },

  // 🧠 后台静默记忆提取引擎 (恋爱小事专属版)
  extractHundredMemory: async (charId, target) => {
      if (!store.apiConfig?.apiKey || !target || !target.messages || target.messages.length === 0) return;
      try {
          const char = store.contacts.find(c => c.id === charId);
          const chat = store.chats.find(c => c.charId === charId);
          const pId = (chat?.isGroup ? chat.boundPersonaId : char?.boundPersonaId) || store.personas[0].id;
          const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
          
          // 提取对话记录
          const logText = target.messages.map(m => `${m.isMe ? boundPersona.name : char.name}: ${m.text}`).join('\n');
          const promptStr = `【后台任务】用户和你刚刚完成了情侣100件小事之：【${target.title}】。\n以下是你们在这个番外副本里的互动剧情记录。请你以第三人称客观、简练地总结为一个记忆碎片（50字以内）。\n❗要求：\n1. 开头必须加上 [碎片] 标签。\n2. 示例：[碎片]和Eve一起去海边看日出，两人在沙滩漫步并深情相拥。\n\n【剧情】\n${logText}`;

          // 调用大模型提取记忆
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.3 })
          });
          const data = await res.json();
          let summary = window.cpActions.cleanAI(data.choices[0].message.content).replace(/^["']|["']$/g, '').replace(/【?\[?碎片\]?】?/g, '').trim();

          // 提取2个触发关键词
          const kwRes = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: `请从以下总结中提取2个核心名词作为触发关键词，用英文逗号分隔，不要输出多余符号。\n${summary}` }], temperature: 0.3 })
          });
          const kwData = await kwRes.json();
          const kws = kwwindow.cpActions.cleanAI(data.choices[0].message.content).replace(/^["']|["']$/g, '');

          // 存入主线全局记忆库
          const dateStr = new Date().toLocaleDateString('zh-CN');
          const finalSummary = `[${dateStr} 小事成就] ${summary}`;
          store.memories = store.memories || [];
          store.memories.push({ id: Date.now(), charId: charId, type: 'fragment', content: finalSummary, keywords: kws, createdAt: Date.now() });
          
          if(window.actions?.saveStore) window.actions.saveStore();
          console.log(`[系统] 100件小事完成！已为您存入🧩碎片记忆:`, finalSummary);
      } catch (e) { console.error('[系统] 记忆提取失败', e); }
  },

  // 🌟 内部消息增删改查引擎
  deleteHundredMsg: (charId, msgId) => {
      if(!confirm("确定要删除这条消息吗？")) return;
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === cpState.activeThingId);
      target.messages = target.messages.filter(m => m.id !== msgId);
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },
  openEditHundredMsg: (charId, msgId) => {
      cpState.editingHundredMsgId = msgId; cpState.showHundredEditModal = true; window.render();
  },
  closeEditHundredMsg: () => {
      cpState.showHundredEditModal = false; cpState.editingHundredMsgId = null; window.render();
  },
  saveEditHundredMsg: (charId) => {
      const text = document.getElementById('hundred-edit-textarea').value.trim();
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === cpState.activeThingId);
      const msg = target.messages.find(m => m.id === cpState.editingHundredMsgId);
      if (msg && text) msg.text = text;
      cpState.showHundredEditModal = false;
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },
  rerollHundredMsg: async (charId, msgId) => {
      if(!confirm("确定让TA重新生成这段剧情吗？")) return;
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === cpState.activeThingId);
      const msgIdx = target.messages.findIndex(m => m.id === msgId);
      if (msgIdx === -1) return;
      target.messages = target.messages.slice(0, msgIdx); // 截断到这条之前
      if(window.actions?.saveStore) window.actions.saveStore();
      
      window.render();
      // 同步置底防闪烁
      const el = document.getElementById('cp-story-scroll');
      if (el) {
          el.style.scrollBehavior = 'auto';
          el.scrollTop = el.scrollHeight;
          if (window.globalScrollStates && window.globalScrollStates['cp-story-scroll']) {
              window.globalScrollStates['cp-story-scroll'].top = el.scrollHeight;
          }
      }
      
      await window.cpActions.fetchHundredStoryReply(charId, target.id, target.messages.length === 0);
  },

  // 🌟 发送与推演引擎
  sendHundredStoryMsg: async (charId) => {
      const input = document.getElementById('story-chat-input');
      const text = input.value.trim(); if (!text) return;
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === cpState.activeThingId);
      target.messages.push({ id: Date.now(), sender: 'me', isMe: true, text: text });
      input.value = '';
      if(window.actions?.saveStore) window.actions.saveStore(); 
      
      window.render();
      // 同步置底防闪烁
      const el = document.getElementById('cp-story-scroll');
      if (el) {
          el.style.scrollBehavior = 'auto';
          el.scrollTop = el.scrollHeight;
          if (window.globalScrollStates && window.globalScrollStates['cp-story-scroll']) {
              window.globalScrollStates['cp-story-scroll'].top = el.scrollHeight;
          }
      }
      
      await window.cpActions.fetchHundredStoryReply(charId, target.id, false);
  },
  continueHundredStory: async (charId) => {
      await window.cpActions.fetchHundredStoryReply(charId, cpState.activeThingId, false);
  },

  fetchHundredStoryReply: async (charId, thingId, isOpening) => {
      const target = store.coupleSpacesData[charId].hundredThings.find(t => t.id === thingId);
      target.isTyping = true; 
      window.render();
      
      // AI开始打字同步置底防闪烁
      let el = document.getElementById('cp-story-scroll');
      if (el) {
          el.style.scrollBehavior = 'auto';
          el.scrollTop = el.scrollHeight;
          if (window.globalScrollStates && window.globalScrollStates['cp-story-scroll']) {
              window.globalScrollStates['cp-story-scroll'].top = el.scrollHeight;
          }
      }

      try {
        // 替换掉原来的 prompt 组装
        const ctx = window.cpActions.getQContext(charId);
          const history = target.messages.slice(-20).map(m => `${m.isMe ? '用户指令/动作' : ctx.char.name}: ${m.text}`).join('\n');
    
          let taskMsg = `【系统任务】你和用户正在体验恋爱100件小事之：【${target.title}】。这是一个独立于主线微信聊天的线下番外副本。\n`;
          if (isOpening) taskMsg += `这是约会的刚开始。请你直接描写当前的场景氛围，交代环境、氛围以及你们将要做的事。\n❗警告：绝对不要在开头写出“好的”、“开场白”、“开始”等出戏的系统词汇！\n`;
          else taskMsg += `【当前剧情进展】\n请顺着用户的动作往下推进剧情，若用户未发动作则继续叙述。\n`;
          taskMsg += `❗绝对红线：\n1. 必须采用【轻小说体裁】！\n2. 严禁使用“名字: 台词”的剧本格式！\n3. 人物对话用『』包裹，内心想法用全角括号（）包裹。直接输出正文！`;

          const prompt = window.cpActions.buildMasterPrompt(charId, {
              history: history,
              task: taskMsg,
              recentText: history,
              scenario: 'hundredStory'
          });  
        
          const temp = store.apiConfig?.temperature !== undefined ? Number(store.apiConfig.temperature) : 0.85;
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: temp })
          });
          const data = await res.json();
          target.messages.push({ id: Date.now(), sender: 'ai', isMe: false, text: window.cpActions.cleanAI(data.choices[0].message.content) });
      } catch(e) {
          if (window.actions?.showToast) window.actions.showToast('TA 走神了，没写出来');
      } finally {
          target.isTyping = false;
          if(window.actions?.saveStore) window.actions.saveStore(); 
          
          window.render();
          // AI写完同步置底防闪烁
          el = document.getElementById('cp-story-scroll');
          if (el) {
              el.style.scrollBehavior = 'auto';
              el.scrollTop = el.scrollHeight;
              if (window.globalScrollStates && window.globalScrollStates['cp-story-scroll']) {
                  window.globalScrollStates['cp-story-scroll'].top = el.scrollHeight;
              }
          }
      }
  },

  openHundredSettings: () => { cpState.showHundredSettingsModal = true; window.render(); },
  closeHundredSettings: () => { cpState.showHundredSettingsModal = false; window.render(); },
  saveHundredSettings: (charId) => {
      store.coupleSpacesData[charId].hundredCSS = document.getElementById('set-hundred-css').value;
      cpState.showHundredSettingsModal = false;
      if(window.actions?.saveStore) window.actions.saveStore(); window.render();
  },
  updateHundredTextColor: (charId, type, color) => {
      const spaceData = store.coupleSpacesData[charId];
      if (type === 'dialogue') spaceData.hundredDialogueColor = color;
      if (type === 'thought') spaceData.hundredThoughtColor = color;
      window.render();
  },
  handleHundredBgUpload: (charId, event) => {
      const file = event.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => { store.coupleSpacesData[charId].hundredBg = e.target.result; window.render(); };
      reader.readAsDataURL(file);
  },
  clearHundredBg: (charId) => { store.coupleSpacesData[charId].hundredBg = ''; window.render(); },
  // ==========================================
  // 🌟 真心话大冒险核心引擎
  // ==========================================
  openToD: (charId) => {
      cpState.view = 'tod'; cpState.activeCharId = charId;
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      const spaceData = store.coupleSpacesData[charId];
      spaceData.todChat = spaceData.todChat || [];
      window.render();
  },
  resetToD: (charId) => {
      if (!confirm('确定要清空当前讨论区和大冒险副本的记录，重新开始新的一局吗？')) return;
      const spaceData = store.coupleSpacesData[charId];
      if (!spaceData) return;
      
      spaceData.currentToD = null;
      spaceData.todChat = [];
      spaceData.loserHistory = [];
      
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },

  // 🧠 核心：呼唤 AI 开启新一轮冒险 (强制输出 JSON)
  nextToDRound: async (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      
      // 🌟 核心修复 1：在一切开始之前，立刻把旧的剧情记录备份到内存里！
      let oldDareMessages = [];
      if (spaceData.currentToD && spaceData.currentToD.messages) {
          oldDareMessages = spaceData.currentToD.messages;
      }

      // 🌟 核心修复 2：去掉了 spaceData.currentToD = null; 
      // 这样在 AI 思考的几秒钟里，旧卡片还会显示在画面上，不会变成一闪而过的白板，体验极度丝滑！
      spaceData.todLoading = true; 
      window.render();

      try {
          const ctx = window.cpActions.getQContext(charId);
          
          spaceData.todHistory = spaceData.todHistory || [];
          if (spaceData.todHistory.length > 100) {
              spaceData.todHistory = spaceData.todHistory.slice(-100);
          }
          
          const askedHistory = spaceData.todHistory.slice(-100).join('、');
          const avoidPrompt = askedHistory ? `\n❗【防重复红线】：以下是你最近出过的惩罚，绝对禁止重复或高度相似：\n${askedHistory}` : '';

          spaceData.loserHistory = spaceData.loserHistory || [];
          let nextLoser = Math.random() < 0.5 ? 'user' : 'ai'; 
          
          if (spaceData.loserHistory.length >= 2) {
              const len = spaceData.loserHistory.length;
              if (spaceData.loserHistory[len - 1] === spaceData.loserHistory[len - 2]) {
                  nextLoser = spaceData.loserHistory[len - 1] === 'user' ? 'ai' : 'user';
              }
          }
          spaceData.loserHistory.push(nextLoser);
          if (spaceData.loserHistory.length > 10) spaceData.loserHistory.shift();
          
          const loserName = nextLoser === 'ai' ? ctx.char.name : '用户';

          const taskMsg = `【系统任务】真心话大冒险。本轮的输家已经由系统判定为：【${loserName}】！${avoidPrompt} \n\n❗❗你的任务链：\n1. 随机选择惩罚类型（truth或dare）。\n2. 给输家【${loserName}】制定一个色情、暧昧、直接的惩罚内容。例如：“你内心深处最大尺度的性幻想是什么？”，“上一次自慰是什么时候？”，“含咬赢家喉结十分钟。”，“让赢家为所欲为十分钟。”\n❗你是以中立的系统身份在制定惩罚，请用输家和赢家来描述，禁止用你和我来描述惩罚内容。\n3. 扮演 ${ctx.char.name} 说一句15字内的反应（比如你输了可以假装不甘心，赢了可以得意）。\n\n❗警告：你只需输出严格 JSON，不要输出输家是谁，也绝对不要带多余的字符：\n{"type": "truth/dare", "content": "惩罚内容", "reaction": "你的反应"}`;

          const prompt = window.cpActions.buildMasterPrompt(charId, {
              task: taskMsg,
              scenario: 'chat' 
          });

          const temp = Number(store.apiConfig?.temperature ?? 0.85);
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: temp })
          });
          const data = await res.json();
          let jsonStr = window.cpActions.cleanAI(data.choices[0].message.content);
          const match = jsonStr.match(/\{[\s\S]*\}/); 
          if (!match) throw new Error("JSON Parsing Failed");
          
          const result = JSON.parse(match[0]);
          result.loser = nextLoser;
          
          // 🌟 核心修复 3：生成新卡片时，把备份在兜里的旧剧情原封不动地还给它！
          spaceData.currentToD = { id: 'TOD_'+Date.now(), ...result, messages: oldDareMessages };
          spaceData.todHistory.push(result.content);
          spaceData.todChat.push({ id: Date.now(), sender: 'ai', text: result.reaction });
          
          if(window.actions?.saveStore) window.actions.saveStore();
      } catch(e) {
          if (window.actions?.showToast) window.actions.showToast('发牌员走神了，点击右上角重试');
      } finally {
          spaceData.todLoading = false; window.render();
          setTimeout(() => { const el = document.getElementById('cp-tod-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
      }
  },

  // 💬 真心话：用户仅仅发送文字上屏 (不呼叫AI)
  sendToDMsg: (charId) => {
      const input = document.getElementById('tod-chat-input');
      const text = input.value.trim(); if (!text) return;
      const spaceData = store.coupleSpacesData[charId];
      spaceData.todChat.push({ id: Date.now(), sender: 'me', text: text });
      input.value = '';
      if(window.actions?.saveStore) window.actions.saveStore(); window.render();
      setTimeout(() => { const el = document.getElementById('cp-tod-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
  },

  // 🧠 真心话：主动点击按钮呼唤 AI 回复 (复刻默契问答)
  requestToDReply: async (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      const tod = spaceData.currentToD;
      if (!tod) return;
      
      spaceData.todChat = spaceData.todChat || [];
      const loadingId = Date.now();
      spaceData.todChat.push({ id: loadingId, sender: 'ai', msgType: 'loading' });
      window.render();
      setTimeout(() => { const el = document.getElementById('cp-tod-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);

      try {
          const ctx = window.cpActions.getQContext(charId);
          const chatHistory = spaceData.todChat.filter(m => !m.msgType).slice(-20).map(m => `${m.sender === 'me' ? '用户' : '你'}: ${m.text}`).join('\n');
          
          // 🌟 精准识别本轮的输家和任务类型
          const loserRole = tod.loser === 'ai' ? '你' : '用户';
          const todTypeStr = tod.type === 'truth' ? '真心话' : '大冒险';
          
          const taskMsg = `【当前回合状态】\n类型：${todTypeStr}\n内容：${tod.content}\n本轮输家：${loserRole}\n\n【讨论区记录】\n${chatHistory}\n\n【系统任务】你和用户正在进行真心话大冒险，现在处于讨论区环节。\n❗你的核心任务（根据输赢选择）：\n1. 如果输家是你（${ctx.char.name}）：请你愿赌服输，直接在回复中执行真心话惩罚。\n2. 如果输家是用户：请你根据用户的最新回复，评价TA的惩罚完成度，或者根据人设催促TA快点执行惩罚。\n❗严格要求：极度精简，像微信聊天，控制在50字内！直接输出正文！`;
          const prompt = window.cpActions.buildMasterPrompt(charId, {
            history: chatHistory,  
            task: taskMsg,
            recentText: chatHistory,
            scenario: 'chat'
          });
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
          });
          const data = await res.json();
          const targetIdx = spaceData.todChat.findIndex(m => m.id === loadingId);
          if (targetIdx !== -1) {
              spaceData.todChat[targetIdx] = { id: Date.now(), sender: 'ai', text: window.cpActions.cleanAI(data.choices[0].message.content) };
          }
      } catch(e) {
          spaceData.todChat = spaceData.todChat.filter(m => m.id !== loadingId);
      } finally {
          window.render();
          setTimeout(() => { const el = document.getElementById('cp-tod-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
      }
  },

  // 🌟 大冒险：进入专属副本剧情模式 (WeChat style + AutoOpener)
  openDareStory: async (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      const tod = spaceData.currentToD;
      // 初始化大冒险副本数据结构 (复用副本引擎)
      tod.messages = tod.messages || [];
      cpState.view = 'dareStory'; cpState.activeCharId = charId; cpState.activeToDId = tod.id;
      window.render();
      
      // 如果第一次进入，呼唤 AI 写沉浸式开场白！
      if (tod.messages.length === 0) {
          await window.cpActions.fetchDareStoryReply(charId, tod.id, true);
      } else {
          // 同步置底防闪烁
          const el = document.getElementById('cp-dare-scroll');
          if (el) {
              el.style.scrollBehavior = 'auto';
              el.scrollTop = el.scrollHeight;
              if (window.globalScrollStates && window.globalScrollStates['cp-dare-scroll']) {
                  window.globalScrollStates['cp-dare-scroll'].top = el.scrollHeight;
              }
          }
      }
  },

  // 🧠 副本写作大脑 (视觉小说级 Prompt - 抹除"书写"气泡，增加常驻按钮)
  fetchDareStoryReply: async (charId, todId, isOpening) => {
      const spaceData = store.coupleSpacesData[charId];
      const tod = spaceData.currentToD; // 因为一次只存在一个当前 ToD
      tod.isTyping = true; 
      
      window.render();
      // AI开始打字同步置底防闪烁
      let el = document.getElementById('cp-dare-scroll');
      if (el) {
          el.style.scrollBehavior = 'auto';
          el.scrollTop = el.scrollHeight;
          if (window.globalScrollStates && window.globalScrollStates['cp-dare-scroll']) {
              window.globalScrollStates['cp-dare-scroll'].top = el.scrollHeight;
          }
      }

      try {
          // 替换掉原来的 prompt 组装
          const ctx = window.cpActions.getQContext(charId);
          const history = tod.messages.slice(-20).map(m => `${m.isMe ? '用户指令/动作' : ctx.char.name}: ${m.text}`).join('\n');
          const loserRole = tod.loser === 'ai' ? ctx.char.name : ctx.boundP.name;
          
          let taskMsg = `你们正在进行线下的大冒险惩罚副本。\n【当前惩罚内容】：${tod.content}\n【受罚者（输家）】：${loserRole}\n`;
          if (isOpening) taskMsg += `这是惩罚的刚开始，请你直接描写当前的场景氛围，交代环境、氛围以及你们正在做的事。\n你的核心任务（根据输赢选择）：\n1. 如果输家是你（${ctx.char.name}）：请你愿赌服输，执行大冒险惩罚。\n2. 如果输家是用户：请你根据用户的最新回复，评价TA的惩罚完成度，或者根据人设催促TA快点执行惩罚。\n❗警告：绝对不要在开头写出“好的”、“开场白”、“开始”等出戏的系统词汇！\n`;
          else taskMsg += `请顺着剧情和用户的动作往下自然推进。\n`;
          taskMsg += `❗绝对红线：\n1. 必须采用【轻小说体裁】！\n2. 严禁使用“名字: 台词”的剧本格式！\n3. 人物对话用『』包裹，内心想法用全角括号（）包裹。直接输出正文！`;

          const prompt = window.cpActions.buildMasterPrompt(charId, {
              history: history,
              task: taskMsg,
              recentText: tod.content + '\n' + history,
              scenario: 'dareStory'
          });
          const temp = Number(store.apiConfig?.temperature ?? 0.85);
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: temp })
          });
          const data = await res.json();
          tod.messages.push({ id: Date.now(), sender: 'ai', text: window.cpActions.cleanAI(data.choices[0].message.content) });
      } catch(e) { } finally {
          tod.isTyping = false;
          if(window.actions?.saveStore) window.actions.saveStore(); 
          
          window.render();
          // AI写完同步置底防闪烁
          el = document.getElementById('cp-dare-scroll');
          if (el) {
              el.style.scrollBehavior = 'auto';
              el.scrollTop = el.scrollHeight;
              if (window.globalScrollStates && window.globalScrollStates['cp-dare-scroll']) {
                  window.globalScrollStates['cp-dare-scroll'].top = el.scrollHeight;
              }
          }
      }
  },
  
  // 大冒险副本动作 (WeChat style)
  sendDareMsg: async (charId) => {
      const input = document.getElementById('dare-chat-input');
      const text = input.value.trim(); if (!text) return;
      const tod = store.coupleSpacesData[charId].currentToD;
      tod.messages.push({ id: Date.now(), sender: 'me', isMe: true, text: text });
      input.value = ''; 
      
      window.render();
      // 同步置底防闪烁
      const el = document.getElementById('cp-dare-scroll');
      if (el) {
          el.style.scrollBehavior = 'auto';
          el.scrollTop = el.scrollHeight;
          if (window.globalScrollStates && window.globalScrollStates['cp-dare-scroll']) {
              window.globalScrollStates['cp-dare-scroll'].top = el.scrollHeight;
          }
      }

      await window.cpActions.fetchDareStoryReply(charId, tod.id, false);
  },
  continueDareStory: async (charId) => {
      await window.cpActions.fetchDareStoryReply(charId, store.coupleSpacesData[charId].currentToD.id, false);
  },
  // 🌟 大冒险副本：专属增删改查重摇引擎
  deleteDareMsg: (charId, msgId) => {
      if(!confirm("确定要删除这条消息吗？")) return;
      const tod = store.coupleSpacesData[charId].currentToD;
      tod.messages = tod.messages.filter(m => m.id !== msgId);
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },
  openEditDareMsg: (charId, msgId) => {
      cpState.editingDareMsgId = msgId; cpState.showDareEditModal = true; window.render();
  },
  closeEditDareMsg: () => {
      cpState.showDareEditModal = false; cpState.editingDareMsgId = null; window.render();
  },
  saveEditDareMsg: (charId) => {
      const text = document.getElementById('dare-edit-textarea').value.trim();
      const tod = store.coupleSpacesData[charId].currentToD;
      const msg = tod.messages.find(m => m.id === cpState.editingDareMsgId);
      if (msg && text) msg.text = text;
      cpState.showDareEditModal = false;
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },
  rerollDareMsg: async (charId, msgId) => {
      if(!confirm("确定让TA重新生成这段剧情吗？")) return;
      const tod = store.coupleSpacesData[charId].currentToD;
      const msgIdx = tod.messages.findIndex(m => m.id === msgId);
      if (msgIdx === -1) return;
      tod.messages = tod.messages.slice(0, msgIdx); // 截断这条以后的对话
      if(window.actions?.saveStore) window.actions.saveStore();
      window.render();
      await window.cpActions.fetchDareStoryReply(charId, tod.id, tod.messages.length === 0);
  },
  // ==========================================
  // 🌟 共同成长 (自律打卡系统) 核心引擎
  // ==========================================
  openGrowth: (charId) => {
      cpState.view = 'growth'; 
      cpState.activeCharId = charId;
      cpState.growthTab = 'me';
      
      store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
      const spaceData = store.coupleSpacesData[charId];
      spaceData.growth = spaceData.growth || { plans: [], records: {} };
      
      if (!spaceData.startDate) spaceData.startDate = Date.now();
      
      // 🌟 核心：每次点开面板，后台静默按概率自检角色有无完成计划
      window.cpActions.autoCheckGrowthTasks(charId);
      
      window.render();
  },
  
  switchGrowthTab: async (charId, tab) => {
      cpState.growthTab = tab;
      const spaceData = store.coupleSpacesData[charId];
      window.render();
      
      // 🌟 如果首次切到 TA的，且 TA 还没有计划，立刻触发 AI 自动生成！
      if (tab === 'ai' && spaceData.growth.plans.filter(p => p.owner === 'ai').length === 0 && !spaceData.isGeneratingAIPlans) {
          spaceData.isGeneratingAIPlans = true; window.render();
          try {
              const prompt = window.cpActions.buildMasterPrompt(charId, {
                  task: `【系统任务】你们正在使用情侣App的“共同成长”自律打卡功能。请根据你的人设，为自己制定3个极度符合你目前性格和处境的日常自律/成长计划（每日任务）。\n要求：每条必须具体、量化（例如：每天看10页书，每天去健身房练胸30分钟）。\n❗严格红线：必须输出严格的 JSON 数组格式，绝对不要带有任何 markdown 标记、\`\`\`json 或其他解释：\n["任务1", "任务2", "任务3"]`
              });
              const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                  body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: 0.85 })
              });
              const data = await res.json();
              const jsonStr = window.cpActions.cleanAI(data.choices[0].message.content).replace(/^```[a-z]*\n?/gi, '').replace(/```$/g, '').trim();
              const tasks = JSON.parse(jsonStr);
              if (Array.isArray(tasks)) {
                  tasks.forEach(t => {
                      spaceData.growth.plans.push({ id: 'P_'+Date.now()+'_'+Math.random(), owner: 'ai', type: 'daily', text: t, createdAt: Date.now() });
                  });
              }
          } catch(e) { console.error('AI生成自律计划失败', e); } 
          finally {
              spaceData.isGeneratingAIPlans = false;
              if (window.actions?.saveStore) window.actions.saveStore();
              window.render();
          }
      }
  },

  autoCheckGrowthTasks: (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      if (!spaceData || !spaceData.growth || !spaceData.growth.plans) return;
      const logicalToday = getLogicalDateStr();
      spaceData.growth.records[logicalToday] = spaceData.growth.records[logicalToday] || {};

      let changed = false;
      const prob = Math.min(0.95, new Date().getHours() / 24); 

      spaceData.growth.plans.forEach(p => {
          if (p.owner === 'ai') {
              let isDone = false;
              if (p.type === 'weekly') {
                  const d = new Date(logicalToday);
                  const day = d.getDay() || 7;
                  d.setDate(d.getDate() - day + 1);
                  const weekDates = [];
                  for(let i=0; i<7; i++) {
                      const nd = new Date(d);
                      nd.setDate(d.getDate() + i);
                      weekDates.push(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`);
                  }
                  isDone = weekDates.some(wd => spaceData.growth.records[wd] && spaceData.growth.records[wd][p.id]);
              } else if (p.type === 'monthly') {
                  const prefix = logicalToday.substring(0, 7);
                  isDone = Object.keys(spaceData.growth.records).some(k => k.startsWith(prefix) && spaceData.growth.records[k][p.id]);
              } else {
                  isDone = spaceData.growth.records[logicalToday][p.id];
              }

              if (!isDone && Math.random() < prob) {
                  spaceData.growth.records[logicalToday][p.id] = true;
                  changed = true;
              }
          }
      });
      if (changed) {
          if (window.actions?.saveStore) window.actions.saveStore();
          // 🌟 AI 完成打卡时，也检查一下成就是否达标！
          if (window.cpActions.checkGrowthAchievements) window.cpActions.checkGrowthAchievements(charId);
      }
  },
  // 🌟 共同成长：成就系统检测大脑
  checkGrowthAchievements: (charId) => {
      const spaceData = store.coupleSpacesData[charId];
      if (!spaceData || !spaceData.growth) return;

      const growth = spaceData.growth;
      growth.claimedAchievements = growth.claimedAchievements || [];

      // 1. 动态计算历史总累计完美打卡天数
      let totalPerfects = 0;
      const allDates = Object.keys(growth.records).sort();
      allDates.forEach(dateStr => {
          const recordsDay = growth.records[dateStr];
          const activePlans = growth.plans;

          const myDailyPlans = activePlans.filter(p => p.owner === 'me' && p.type === 'daily');
          const taDailyPlans = activePlans.filter(p => p.owner === 'ai' && p.type === 'daily');

          const myDailyOk = myDailyPlans.length > 0 && myDailyPlans.every(p => recordsDay[p.id]);
          const taDailyOk = taDailyPlans.length > 0 && taDailyPlans.every(p => recordsDay[p.id]);

          const bothChecked = activePlans.some(p => p.owner === 'me' && recordsDay[p.id]) && activePlans.some(p => p.owner === 'ai' && recordsDay[p.id]);
          if (bothChecked && myDailyOk && taDailyOk) totalPerfects++;
      });

      // 2. 设定里程碑档位
      const milestones = [
          { days: 3, desc: "太棒了！你们达成了最初的默契，好的开始是成功的一半。" },
          { days: 7, desc: "一周的坚持！自律的种子已经发芽，继续保持哦！" },
          { days: 30, desc: "整整一个月的完美打卡！你们的毅力令人惊叹，爱在坚持中升温。" },
          { days: 100, desc: "百日里程碑！一百个日夜的互相监督，这份羁绊已经坚不可摧！" }
      ];

      // 3. 拦截并颁发成就
      let newlyClaimed = false;
      milestones.forEach(ms => {
          if (totalPerfects >= ms.days && !growth.claimedAchievements.includes(ms.days)) {
              growth.claimedAchievements.push(ms.days);
              newlyClaimed = true;

              const chat = store.chats.find(c => c.charId === charId);
                  if (chat) {
                  // 1. 发送成就卡片 (这是唯一会被存进数据库、被消息列表看到的内容)
                  chat.messages.push({
                      id: Date.now(), sender: 'system', isMe: false, msgType: 'growth_achievement_card',
                      cardData: { days: ms.days, desc: ms.desc },
                      text: `[成就解锁：累计完美打卡 ${ms.days} 天]`, // 列表预览会显示这个，很高级！
                      timestamp: Date.now()
                  });

                  // 2. 调用大脑，把指令偷偷塞过去！
                  if (typeof window.scheduleCloudTask === 'function') {
                      window.scheduleCloudTask(charId, `(系统指令：用户达成了打卡 ${ms.days} 天成就，请发消息热烈庆祝！字数40字内。)`);
                  }
                  }
          }
      });

      if (newlyClaimed && window.actions?.saveStore) window.actions.saveStore();
  },

  toggleGrowthTask: (charId, planId) => {
      const spaceData = store.coupleSpacesData[charId];
      const logicalToday = getLogicalDateStr();
      spaceData.growth.records[logicalToday] = spaceData.growth.records[logicalToday] || {};

      const p = spaceData.growth.plans.find(x => x.id === planId);
      if (!p) return;

      // 🌟 扫描周期状态，防止重复打勾和取消打勾
      let isDone = false;
      if (p.type === 'weekly') {
          const d = new Date(logicalToday);
          const day = d.getDay() || 7;
          d.setDate(d.getDate() - day + 1); // 算到周一
          const weekDates = [];
          for(let i=0; i<7; i++) {
              const nd = new Date(d);
              nd.setDate(d.getDate() + i);
              weekDates.push(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`);
          }
          isDone = weekDates.some(wd => spaceData.growth.records[wd] && spaceData.growth.records[wd][planId]);
      } else if (p.type === 'monthly') {
          const prefix = logicalToday.substring(0, 7); // YYYY-MM
          isDone = Object.keys(spaceData.growth.records).some(dateKey => dateKey.startsWith(prefix) && spaceData.growth.records[dateKey][planId]);
      } else {
          isDone = spaceData.growth.records[logicalToday][planId];
      }

      // 如果当前周期内已经打卡了，直接无视点击，实现“不可取消”
      if (isDone) return; 

      spaceData.growth.records[logicalToday][planId] = true;
      if (window.actions?.saveStore) window.actions.saveStore();
      
      // 🌟 每次打卡后，检查一下有没有解锁成就！
      if (window.cpActions.checkGrowthAchievements) window.cpActions.checkGrowthAchievements(charId);
      
      window.render();
  },
  toggleGrowthCalendar: () => {
      cpState.growthCalendarExpanded = !cpState.growthCalendarExpanded;
      window.render();
  },
  deleteGrowthTask: (charId, planId) => {
      if(!confirm('确定要放弃这个计划吗？')) return;
      const spaceData = store.coupleSpacesData[charId];
      spaceData.growth.plans = spaceData.growth.plans.filter(p => p.id !== planId);
      if (window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },

  // 🌟 全新分离式弹窗引擎
  openGrowthManualModal: () => {
      cpState.growthModalView = 'manual';
      cpState.growthAddType = 'daily';
      window.render();
  },
  openGrowthAiModal: () => {
      cpState.growthModalView = 'ai';
      cpState.growthAddResult = '';
      cpState.aiGeneratedPlans = []; // 清空上次的生成记录
      window.render();
  },
  closeGrowthModal: () => {
      cpState.growthModalView = null;
      window.render();
  },
  setGrowthAddType: (type) => {
      cpState.growthAddType = type;
      window.render();
  },

  // 🌟 用户手动保存计划
  saveGrowthManualPlan: (charId) => {
      const text = document.getElementById('growth-manual-input').value.trim();
      if (!text) return window.actions?.showToast('计划内容不能为空哦');
      
      const spaceData = store.coupleSpacesData[charId];
      spaceData.growth.plans.unshift({ id: 'P_'+Date.now(), owner: 'me', type: cpState.growthAddType, text: text, createdAt: Date.now() });
      cpState.growthModalView = null;
      if (window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },

  // 🧠 AI 智能长短期计划拆解大脑
  generateGrowthPlan: async (charId) => {
      const fuzzy = document.getElementById('growth-fuzzy-input').value.trim();
      if (!fuzzy) return window.actions?.showToast('请先输入你的大概目标哦');
      
      cpState.isGeneratingGrowth = true; window.render();
      try {
          const prompt = window.cpActions.buildMasterPrompt(charId, {
              task: `【系统任务】用户想在情侣App的自律打卡板块中创建一个长期计划，大致目标是：【${fuzzy}】。\n请你以靠谱伴侣的身份，帮用户把这个目标拆解成一个行之有效且易于坚持的计划表。既要包含简单的每日任务（daily），也要包含稍有挑战的每周任务（weekly）。总共生成 3 到 5 条任务。\n❗严格红线：必须输出严格的 JSON 数组格式，绝对不要带有任何 markdown 标记、\`\`\`json 或其他多余解释。格式示范：\n[{"type": "daily", "text": "每天喝水2L"}, {"type": "weekly", "text": "每周去跑步3次"}]`
          });
          const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
              body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: 0.8 })
          });
          const data = await res.json();
          const jsonStr = window.cpActions.cleanAI(data.choices[0].message.content).replace(/^```[a-z]*\n?/gi, '').replace(/```$/g, '').trim();
          cpState.aiGeneratedPlans = JSON.parse(jsonStr);
      } catch(e) { window.actions?.showToast('生成失败，请重试'); } 
      finally { cpState.isGeneratingGrowth = false; window.render(); }
  },

  // 🌟 AI 生成结果的编辑与删除
  deleteAiGeneratedPlan: (idx) => {
      cpState.aiGeneratedPlans.splice(idx, 1);
      window.render();
  },
  editAiGeneratedPlan: (idx) => {
      const newText = prompt('修改计划内容：', cpState.aiGeneratedPlans[idx].text);
      if (newText !== null && newText.trim() !== '') {
          cpState.aiGeneratedPlans[idx].text = newText.trim();
          window.render();
      }
  },

  // 🌟 将 AI 生成的计划批量存入主库
  saveAiGeneratedPlans: (charId) => {
      if (!cpState.aiGeneratedPlans || cpState.aiGeneratedPlans.length === 0) return window.actions?.showToast('没有可保存的计划哦');
      const spaceData = store.coupleSpacesData[charId];
      cpState.aiGeneratedPlans.forEach((p, index) => {
          spaceData.growth.plans.unshift({ id: 'P_'+Date.now()+'_'+index, owner: 'me', type: p.type || 'daily', text: p.text, createdAt: Date.now() });
      });
      cpState.growthModalView = null;
      cpState.aiGeneratedPlans = [];
      if (window.actions?.saveStore) window.actions.saveStore();
      window.render();
  },

  // 🌟 电子宠物小屋核心大脑
    // 🌟 全新的生理节律与“老公代劳”计算器
    updatePetStats: (charId) => {
        const spaceData = store.coupleSpacesData[charId];
        if (!spaceData || !spaceData.pet) return;
        const pet = spaceData.pet;
        const now = Date.now();

        if (pet.foodLevel === undefined) pet.foodLevel = 100;
        if (pet.hunger === undefined) pet.hunger = 100;
        if (pet.clean === undefined) pet.clean = 100;
        if (pet.lastUpdate === undefined) pet.lastUpdate = now;
        if (pet.lastInteract === undefined) pet.lastInteract = now;
        if (pet.album === undefined) pet.album = [];

        const hoursPassed = (now - pet.lastUpdate) / (1000 * 60 * 60);
        pet.lastUpdate = now;

        // 1. 食物与饱食度：加快消耗！食物每小时掉 20 点（5小时吃光）
        pet.foodLevel = Math.max(0, pet.foodLevel - hoursPassed * 20);
        if (pet.foodLevel <= 0) {
            pet.hunger = Math.max(0, pet.hunger - hoursPassed * 10);
        } else {
            pet.hunger = Math.min(100, pet.hunger + hoursPassed * 10);
        }
        // 2. 清洁度：每小时掉 5 点
        pet.clean = Math.max(0, pet.clean - hoursPassed * 5);

        const hoursSinceInteract = (now - pet.lastInteract) / (1000 * 60 * 60);
        const interactScore = Math.max(0, 100 - hoursSinceInteract * 4); 
        pet.mood = Math.round((pet.hunger * 0.4) + (pet.clean * 0.3) + (interactScore * 0.3));

        // 🌟 方案一引擎：触发便利贴盲盒！(离线超 2 小时，且状态低于 60)
        if (hoursPassed > 2 && !pet.stickyNote) {
            const roll = Math.random();
            if (roll < 0.6) { // 60% 概率触发老公代劳
                if (pet.hunger < 60) {
                    pet.foodLevel = 100; pet.hunger = 100;
                    window.cpActions.generateStickyNote(charId, 'eat');
                } else if (pet.clean < 60) {
                    pet.clean = 100;
                    window.cpActions.generateStickyNote(charId, 'bath');
                }
            }
        }
        if(window.actions?.saveStore) window.actions.saveStore();
    },

    // 🌟 便利贴生成器
    generateStickyNote: async (charId, type) => {
        const pet = store.coupleSpacesData[charId].pet;
        pet.stickyNote = "正在加载便利贴..."; window.render();
        try {
            const actionDesc = type === 'eat' ? `给${pet.name}加满了猫粮，喂了它` : `给${pet.name}洗了个香喷喷的澡，清理了屋子`;
            const prompt = window.cpActions.buildMasterPrompt(charId, {
                task: `【系统任务】你刚刚趁用户不在，${actionDesc}。请你在墙上留一张黄色实体便利贴告诉用户。\n要求：字数在30字以内，语气自然、宠溺或带点邀功/玩笑，像真实的同居情侣留言。直接输出便利贴内容！`
            });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: 0.85 })
            });
            const data = await res.json();
            pet.stickyNote = window.cpActions.cleanAI(data.choices[0].message.content);
            window.render();
        } catch(e) { pet.stickyNote = `我刚来给${pet.name}弄好啦，乖乖按时吃饭！`; window.render(); }
    },
    removeStickyNote: (charId) => {
        store.coupleSpacesData[charId].pet.stickyNote = null;
        if(window.actions?.saveStore) window.actions.saveStore(); window.render();
    },

    // 🌟 方案三引擎：传话筒逻辑
    leavePetMessage: (charId) => {
        // 🌟 修复关键：必须先把猫（pet）找出来，才能在下面用它的名字！
        const pet = store.coupleSpacesData[charId].pet;
        
        const msg = prompt(`想让${pet.name}帮我带什么话给 TA？`);
        if (!msg) return;
        
        pet.userMessage = msg;
        pet.aiReply = null; 
        if(window.actions?.saveStore) window.actions.saveStore(); window.render();
        
        // 🌟 这里也顺手替换好啦
        window.actions?.showToast(`${pet.name}记住啦，等TA回信吧~`);
        
        window.cpActions.generatePetReply(charId, msg);
    },
    generatePetReply: async (charId, userMsg) => {
        const pet = store.coupleSpacesData[charId].pet;
        try {
            const prompt = window.cpActions.buildMasterPrompt(charId, {
                task: `【系统任务】用户让你们共同的宠物猫“${pet.name}”给你带了一句话：“${userMsg}”。\n请你简短地回复用户，这句话将会由${pet.name}顶在头上转达给用户。\n要求：字数在20字以内，自然的生活化口吻。直接输出回复内容！`
            });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: prompt }], temperature: 0.85 })
            });
            const data = await res.json();
            pet.aiReply = window.cpActions.cleanAI(data.choices[0].message.content);
            if (cpState.view === 'petRoom') window.render();
        } catch(e) { pet.aiReply = "好滴，我知道啦！"; }
    },
    clearPetReply: (charId) => {
        store.coupleSpacesData[charId].pet.aiReply = null;
        store.coupleSpacesData[charId].pet.userMessage = null;
        window.render();
    },

    // 🌟 核心引擎：提炼出生成今天照片的 API 调用，支持重Roll
    generateTodayPhoto: async (charId, photoObject) => {
        const pet = store.coupleSpacesData[charId].pet;
        const p3 = (n) => String(n).padStart(3, '0');
        
        cpState.isGeneratingPhoto = true; 
        
        try {
            const prompt = window.cpActions.buildMasterPrompt(charId, {
                task: `【系统任务】请结合今天的聊天记录或你的想象，写一段你和宠物猫“${pet.name}”今天发生的趣事作为拍立得相册的配文。\n要求：第一人称口吻，字数40字左右，像随手记录的日记，充满生活气息。直接输出配文，不要输出任何思考过程或报错信息！`
            });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                // 🌟 修复点 1：把 role 改成了 'user'！这是解决 99% 的 API 莫名其妙拒收的关键！
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
            });
            
            // 🌟 修复点 2：拦截 HTTP 错误，把真实的报错信息挖出来！
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `网络状态码 ${res.status}`);
            }

            const data = await res.json();
            
            // 🌟 修复点 3：防止 API 没返回 choices 导致代码崩溃
            if (!data.choices || !data.choices[0]) {
                throw new Error('API没有返回正确的格式');
            }

            const reply = window.cpActions.cleanAI(data.choices[0].message.content);
            if (reply.startsWith('<think>') || reply.length < 5) { throw new Error('AI 回复抽风了'); }

            const imgStates = ['calm', 'sleep', 'pet-head', 'cozy'];
            photoObject.imgState = imgStates[Math.floor(Math.random() * imgStates.length)];
            photoObject.text = reply;
        } catch(e) {
            photoObject.imgState = 'sleep';
            // 🌟 修复点 4：把真实的死因（e.message）直接写在照片上，让 Bug 无处遁形！
            photoObject.text = `冲洗失败啦！原因：${e.message}。（生成失败，可以点重Roll试试）`;
        } finally {
            cpState.isGeneratingPhoto = false; 
        }
        
        if(window.actions?.saveStore) window.actions.saveStore();
        if (cpState.petModalView === 'album') window.render(); 
    },

    // 🌟 方案二引擎：拍立得相册逻辑 (加入了僵尸清理机制)
    openPetAlbum: async (charId) => {
        cpState.petModalView = 'album';
        const pet = store.coupleSpacesData[charId].pet;
        const logicalToday = (typeof getLogicalDateStr === 'function') ? getLogicalDateStr() : new Date().toLocaleDateString('zh-CN');
        
        // 🌟 防卡死清道夫：如果你心急刷新了，这里会把死掉的 loading 揪出来！
        pet.album.forEach(photo => {
            if (photo.imgState === 'loading' && !cpState.isGeneratingPhoto) {
                photo.imgState = 'sleep';
                photo.text = "冲洗胶卷时遇到了时空乱流...（生成失败，可以点重Roll试试）";
            }
        });

        // 1. 如果今天还没照片，先占位并触发生成
        const todayPhoto = pet.album.find(a => a.date === logicalToday);
        if (!todayPhoto) {
            const newPhoto = { id: Date.now(), date: logicalToday, imgState: 'loading', text: '正在冲洗今天的拍立得...' };
            pet.album.unshift(newPhoto);
            window.render();
            window.cpActions.generateTodayPhoto(charId, newPhoto);
        } else if (todayPhoto.text.includes('(生成失败')) {
            // 如果上次失败了（包括刚才被我们揪出来的僵尸），打开相册时它会自动帮你再试一次！
            todayPhoto.imgState = 'loading'; todayPhoto.text = '正在重新冲洗...';
            window.render();
            window.cpActions.generateTodayPhoto(charId, todayPhoto);
        } else {
            window.render(); // 有照片就直接显示
        }
    },

    // 🌟 新增：重Roll拍立得
    rerollTodayPhoto: (charId, photoId) => {
        const pet = store.coupleSpacesData[charId].pet;
        const photo = pet.album.find(a => a.id === photoId);
        if (!photo) return;

        // 设为加载中状态
        photo.imgState = 'loading';
        photo.text = '正在重新冲洗...';
        window.render(); // 刷出加载动画

        // 调用生成引擎
        window.cpActions.generateTodayPhoto(charId, photo);
    },
    closePetAlbum: () => { cpState.petModalView = null; window.render(); },
    // 🌟 宠物领养与取名大脑
    nextAdoptCat: () => {
        cpState.adoptCatIndex = cpState.adoptCatIndex >= 5 ? 0 : (cpState.adoptCatIndex || 0) + 1;
        window.render();
    },
    prevAdoptCat: () => {
        cpState.adoptCatIndex = cpState.adoptCatIndex <= 0 ? 5 : (cpState.adoptCatIndex || 0) - 1;
        window.render();
    },
    startNameAdoptCat: () => {
        cpState.petAdoptionPhase = 'name';
        window.render();
    },
    closeNameAdoptCat: () => {
        cpState.petAdoptionPhase = 'select';
        window.render();
    },
    confirmAdoptCat: (charId) => {
        const input = document.getElementById('pet-name-input');
        const petName = (input && input.value.trim() !== '') ? input.value.trim() : '${pet.name}';
        
        // 映射用户挑选的皮肤
        const catFiles = ['AllCats.png', 'AllCatsBlack.png', 'AllCatsGrey.png', 'AllCatsGreyWhite.png', 'AllCatsOrange.png', 'AllCatsWhite.png'];
        const selectedFile = catFiles[cpState.adoptCatIndex || 0];
        
        const spaceData = store.coupleSpacesData[charId];
        spaceData.pet = {
            name: petName,
            spriteUrl: `./image/${selectedFile}`, // 🌟 永久记录专属皮肤！
            hunger: 100, clean: 100, mood: 100, foodLevel: 100,
            lastUpdate: Date.now(), lastInteract: Date.now(),
            state: 'calm', baseState: 'active', posX: 50, facing: 1,
            house: { currentBackgroundId: 1 },
            album: []
        };
        
        cpState.view = 'petRoom'; // 领养完毕，正式进入小屋
        cpState.petAdoptionPhase = null;
        if (window.actions?.saveStore) window.actions.saveStore();
        window.render();
    },

    // 🌟 切换标签页时，重置滚动条记忆
    switchPetDecoTab: (tabId) => {
        cpState.petDecoTab = tabId;
        window.render();
    },

    // 🌟 完美版装修大脑：防重复购买 + 一键卸下 + 基础硬装保护
    applyDecoration: (charId, prefix, itemId, cost) => {
        const spaceData = store.coupleSpacesData[charId];
        const pet = spaceData.pet;
        const itemKey = `${prefix}_${itemId}`;
        const isDefault = (prefix === 'bg' && itemId === 1) || (prefix === 'window' && itemId === 1);
        
        // 获取当前正在装备的 ID
        let currId = 0;
        if (prefix === 'bg') currId = pet.house.currentBackgroundId;
        else if (prefix === 'window') currId = pet.house.currentWindowId;
        else if (prefix === 'shelf') currId = pet.house.currentShelfId;
        else if (prefix === 'tile') currId = pet.house.currentTileId;
        else if (prefix === 'bed') currId = pet.house.currentBedId;
        else if (prefix === 'plant') currId = pet.house.currentPlantId;
        else if (prefix === 'frame') currId = pet.house.currentFrameId;
        else if (prefix === 'fish') currId = pet.house.currentFishId;
        else if (prefix === 'toy') currId = pet.house.currentToyId;
        else if (prefix === 'ball') currId = pet.house.currentBallId;
        else if (prefix === 'cube') currId = pet.house.currentCubeId;

        const isEquipped = currId === itemId;

        // 1. 如果已经穿在身上，执行“卸下”逻辑
        if (isEquipped) {
            if (!['bg', 'window'].includes(prefix)) {
                itemId = 0; // 置零即为卸下
                if (window.actions?.showToast) window.actions.showToast('已收起该家具~');
            } else {
                if (window.actions?.showToast) window.actions.showToast('基础装修不可卸下哦！');
                return; // 基础硬装直接拦截，不准卸下
            }
        } 
        // 2. 如果没穿在身上，检查是否需要购买
        else {
            if (!isDefault && !pet.house.ownedItems.includes(itemKey)) {
                const currentScore = window.cpActions.calculateCurrentScore(charId);
                if (currentScore < cost) {
                    if (window.actions?.showToast) window.actions.showToast('积分不足哦，快去共同成长打卡吧！');
                    return;
                }
                pet.house.ownedItems.push(itemKey);
                if (window.actions?.showToast) window.actions.showToast('购买成功！已自动为您布置~');
            }
        }

        // 3. 应用变更（无论是新买的、已拥有的、还是被置为 0 的）
        if (prefix === 'bg') pet.house.currentBackgroundId = itemId;
        else if (prefix === 'window') pet.house.currentWindowId = itemId;
        else if (prefix === 'shelf') pet.house.currentShelfId = itemId;
        else if (prefix === 'tile') pet.house.currentTileId = itemId;
        else if (prefix === 'bed') pet.house.currentBedId = itemId;
        else if (prefix === 'plant') pet.house.currentPlantId = itemId;
        else if (prefix === 'frame') pet.house.currentFrameId = itemId;
        else if (prefix === 'fish') pet.house.currentFishId = itemId;
        else if (prefix === 'toy') pet.house.currentToyId = itemId;
        else if (prefix === 'ball') pet.house.currentBallId = itemId;
        else if (prefix === 'cube') pet.house.currentCubeId = itemId;

        if (window.actions?.saveStore) window.actions.saveStore();
        window.render();
    },

    openPetRoom: (charId) => {
        cpState.activeCharId = charId;
        store.coupleSpacesData[charId] = store.coupleSpacesData[charId] || {};
        const spaceData = store.coupleSpacesData[charId];

        if (!spaceData.pet) {
            cpState.view = 'petAdoption';
            cpState.adoptCatIndex = 0;
            cpState.petAdoptionPhase = 'select';
            window.render();
            return;
        }
        
        cpState.view = 'petRoom';
        
        // 🌟 强行扩容旧存档的储物空间
        if (!spaceData.pet.house) spaceData.pet.house = {};
        const h = spaceData.pet.house;
        if (h.currentBackgroundId === undefined) h.currentBackgroundId = 1;
        if (h.currentWindowId === undefined) h.currentWindowId = 1; 
        if (h.currentShelfId === undefined) h.currentShelfId = 0;   
        if (h.currentTileId === undefined) h.currentTileId = 0;   
        if (h.currentBedId === undefined) h.currentBedId = 0;   
        if (h.currentPlantId === undefined) h.currentPlantId = 0;   
        if (h.currentFrameId === undefined) h.currentFrameId = 0;   
        if (h.currentFishId === undefined) h.currentFishId = 0;   
        if (h.currentToyId === undefined) h.currentToyId = 0;   
        if (h.currentBallId === undefined) h.currentBallId = 0;   
        if (h.currentCubeId === undefined) h.currentCubeId = 0;   
        if (!h.ownedItems) h.ownedItems = [];

        window.cpActions.updatePetStats(charId);
        
        const pet = spaceData.pet;
        if (pet.mood < 40) {
            pet.baseState = 'sad'; pet.state = 'sad';
        } else if (Math.random() < 0.2) { 
            pet.baseState = 'sleep'; pet.state = 'sleep';
        } else {
            pet.baseState = 'active'; pet.state = 'calm'; 
        }
        
        cpState.petModalView = null; 
        cpState.petDecoTab = 'wallpaper'; 
        window.render();
    },

    // 🌟 积分助手：为了装修实时查分
    calculateCurrentScore: (charId) => {
        const growth = store.coupleSpacesData[charId].growth;
        if (!growth) return 0;
        let score = 0;
        let consecutiveCheckins = 0;
        let consecutivePerfects = 0;
        let lastDateObj = null;

        Object.keys(growth.records).sort().forEach(dateStr => {
            const recordsDay = growth.records[dateStr];
            const activePlans = growth.plans;
            const bothChecked = (activePlans.filter(p => p.owner === 'me' && recordsDay[p.id]).length > 0) && (activePlans.filter(p => p.owner === 'ai' && recordsDay[p.id]).length > 0);
            if (!bothChecked) { consecutiveCheckins = 0; consecutivePerfects = 0; return; }
            
            const currDateObj = new Date(dateStr);
            if (lastDateObj && Math.round((currDateObj - lastDateObj) / (1000 * 60 * 60 * 24)) > 1) { consecutiveCheckins = 0; consecutivePerfects = 0; }
            lastDateObj = currDateObj;

            consecutiveCheckins++;
            score += 10; 
            if (consecutiveCheckins % 3 === 0) score += 10; 

            const myDaily = activePlans.filter(p => p.owner === 'me' && p.type === 'daily');
            const taDaily = activePlans.filter(p => p.owner === 'ai' && p.type === 'daily');
            const bothPerfect = bothChecked && myDaily.every(p => recordsDay[p.id]) && taDaily.every(p => recordsDay[p.id]);

            if (bothPerfect) {
                consecutivePerfects++;
                score += 10; 
                if (consecutivePerfects % 3 === 0) score += 20; 
            } else { consecutivePerfects = 0; }
        });
        
        // 减去已消耗的积分
        const pet = store.coupleSpacesData[charId].pet;
        const spent = (pet.house.ownedItems || []).length * 50; // 假设每件家具 50 积分
        return Math.max(0, score - spent);
    },

    interactPet: (charId, actionType) => {
        const spaceData = store.coupleSpacesData[charId];
        if (!spaceData || !spaceData.pet) return;
        const pet = spaceData.pet;

        if (['bath', 'pet-head', 'pet-belly'].includes(pet.state)) return;

        pet.lastInteract = Date.now();

        if (actionType === 'eat') {
            pet.foodLevel = 100;
            pet.hunger = 100;
            window.cpActions.updatePetStats(charId);
            window.render();
            if (window.actions?.showToast) window.actions.showToast('哗啦啦... 猫粮倒满啦！');
            return;
        }

        if (actionType === 'bath') {
            pet.state = 'bath';
        } else if (actionType === 'play') {
            pet.state = Math.random() > 0.5 ? 'pet-head' : 'pet-belly';
            // 🌟 哄哄魔法：摸摸它能立刻恢复心情，并打破“难过”的死循环！
            pet.mood = Math.min(100, pet.mood + 30);
            if (pet.baseState === 'sad' && pet.mood >= 40) {
                pet.baseState = 'active'; 
            }
        }

        window.render();

        setTimeout(() => {
            if (store.coupleSpacesData[charId] && store.coupleSpacesData[charId].pet) {
                const p = store.coupleSpacesData[charId].pet;
                if (actionType === 'bath') p.clean = 100;
                
                // 🌟 核心修复：刷新最新状态后，重新评估一次情绪！
                window.cpActions.updatePetStats(charId);
                
                // 如果刚才还在难过，但现在心情已经及格了，立刻脱离难过状态，变回开心！
                if (p.baseState === 'sad' && p.mood >= 40) {
                    p.baseState = 'active'; 
                }
                
                // 互动结束后，再退回它的基础状态
                p.state = p.baseState === 'sleep' ? 'sleep' : (p.baseState === 'sad' ? 'sad' : 'calm'); 
                
                if (cpState.view === 'petRoom' && cpState.activeCharId === charId) {
                    window.render();
                }
            }
        }, 3000); // 互动动画保持 3 秒
    },
    // 🌟 电子宠物装修大脑
    openPetRoomDecorationModal: (charId) => {
        cpState.activeCharId = charId;
        cpState.petModalView = 'decoration'; 
        window.render();
    },
    // 🌟 新增：专门用于关闭装修弹窗的安全动作
    closePetRoomDecorationModal: () => {
        cpState.petModalView = null;
        window.render();
    },
    changePetHouseBackground: (charId, bgId) => {
        const spaceData = store.coupleSpacesData[charId];
        if (!spaceData || !spaceData.pet || !spaceData.pet.house) return;
        
        spaceData.pet.house.currentBackgroundId = bgId; 
        if (window.actions?.saveStore) window.actions.saveStore();
        window.render(); 
    },

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
         <div class="pt-8 pb-3 px-4 sticky top-0 bg-[#fcfcfc]/90 backdrop-blur-md z-10 flex items-center justify-between shadow-sm">
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
             <div style="background: #ffffff !important;" class="w-full max-w-sm rounded-[32px] p-6 flex flex-col shadow-2xl scale-in" onclick="event.stopPropagation()">
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
         <div class="pt-8 pb-3 px-4 sticky top-0 z-10 flex items-center justify-between">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
            <div class="w-8"></div>
         </div>
         <div id="cp-dash-scroll" class="flex-1 overflow-y-auto hide-scrollbar pb-12">
            <div class="flex items-baseline justify-center mt-4 mb-2 space-x-1">
                  <span class="text-[11px] font-black text-rose-300 tracking-widest uppercase drop-shadow-sm">相伴</span>
                  <span class="text-[32px] font-black font-serif text-rose-400 leading-none">${(()=>{
                      const spaceData = store.coupleSpacesData[char.id] || {};
                      let earliestDate = Date.now();
                      
                      // 修复：从全局存储中正确抓取属于这个角色的纪念日
                      const annis = (store.anniversaries || []).filter(a => a.charId === char.id);
                      
                      if (annis.length > 0) {
                          // 遍历找到最早的那一个纪念日
                          const earliestStr = annis.reduce((min, p) => p.date < min ? p.date : min, annis[0].date);
                          earliestDate = new Date(earliestStr).getTime();
                      } else if (spaceData.startDate) {
                          earliestDate = spaceData.startDate;
                      }
                      return Math.max(1, Math.ceil((Date.now() - earliestDate) / (1000 * 60 * 60 * 24)));
                  })()}</span>
                  <span class="text-[12px] font-bold text-rose-300">天</span>
            </div>
         
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
               <div class="bg-gradient-to-br from-rose-50 to-pink-50/30 rounded-[24px] p-5 shadow-sm border border-pink-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.openTacit('${char.id}')"><i data-lucide="messages-square" class="w-6 h-6 text-rose-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">默契问答</span></div>
               <div class="bg-gradient-to-br from-orange-50 to-amber-50/30 rounded-[24px] p-5 shadow-sm border border-orange-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.openGrowth('${char.id}')"><i data-lucide="trending-up" class="w-6 h-6 text-orange-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">共同成长</span></div>
               
               <div class="bg-gradient-to-br from-blue-50 to-cyan-50/30 rounded-[24px] p-5 shadow-sm border border-blue-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.openHundredThings('${char.id}')"><i data-lucide="check-square" class="w-6 h-6 text-blue-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">100件小事</span></div>
               <div class="bg-gradient-to-br from-purple-50 to-fuchsia-50/30 rounded-[24px] p-5 shadow-sm border border-purple-100/50 flex flex-col cursor-pointer active:scale-95 transition-transform" onclick="window.cpActions.openToD('${char.id}')"><i data-lucide="dices" class="w-6 h-6 text-purple-400 mb-6 opacity-80"></i><span class="text-[15px] font-extrabold text-gray-800 mb-1 tracking-wide">真心话大冒险</span></div>
            </div>

            <div class="px-5 mb-8">
               <div class="bg-white rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-emerald-50 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all" onclick="window.cpActions.openPetRoom('${char.id}')">
                  <div class="flex items-center">
                     <div class="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mr-4 border border-emerald-100/50"><i data-lucide="cat" class="text-emerald-400 w-7 h-7"></i></div>
                     <div class="flex flex-col">
                        <span class="text-[16px] font-extrabold text-gray-800 mb-1 tracking-wide">电子宠物小屋</span>
                        <span class="text-[11px] text-gray-400 font-bold tracking-widest">去看看我们共同的赛博小宝贝</span>
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
         <div class="pt-8 pb-3 px-4 sticky top-0 bg-[#fcfcfc]/90 backdrop-blur-md z-10 flex items-center justify-between">
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
                  <div class="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer p-2 rounded-full active:scale-90 transition-transform z-50" onclick="window.cpActions.deleteAnniversary('${a.id}')">
                      <i data-lucide="trash-2" class="w-4 h-4 text-rose-400"></i>
                  </div>
               </div>
            `).join('')}
         </div>
         ${cpState.showAddModal ? `
         <div class="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in" onclick="window.cpActions.closeAddModal()">
             <div class="w-full max-w-sm rounded-[32px] p-6 flex flex-col shadow-2xl scale-in" style="background: #ffffff !important;" onclick="event.stopPropagation()">
                 <div class="flex justify-between items-center mb-6 px-2">
                     <span class="font-black text-gray-800 text-[18px]">添加纪念日</span>
                     <i data-lucide="x" class="w-6 h-6 text-gray-400 bg-gray-50 rounded-full p-1 cursor-pointer active:scale-90 transition-transform" onclick="window.cpActions.closeAddModal()"></i>
                 </div>
                 <div class="flex flex-col space-y-4 px-2">
                     <div>
                         <span class="text-[12px] font-bold text-gray-500 mb-1.5 block">纪念日名称</span>
                         <input id="anni-name" type="text" class="w-full bg-gray-50 border border-gray-100 rounded-[16px] px-4 py-3 outline-none text-[15px] font-bold text-gray-800 focus:bg-rose-50/50 focus:border-rose-200 transition-all" placeholder="例如：第一次相遇">
                     </div>
                     <div>
                         <span class="text-[12px] font-bold text-gray-500 mb-1.5 block">日期</span>
                         <input id="anni-date" type="date" class="w-80% bg-gray-50 border border-gray-100 rounded-[16px] px-4 py-3 outline-none text-[15px] font-bold text-gray-800 focus:bg-rose-50/50 focus:border-rose-200 transition-all">
                     </div>
                     <div>
                         <span class="text-[12px] font-bold text-gray-500 mb-1.5 block">想说的话 (选填)</span>
                         <textarea id="anni-desc" class="w-full bg-gray-50 border border-gray-100 rounded-[16px] px-4 py-3 outline-none text-[15px] text-gray-800 focus:bg-rose-50/50 focus:border-rose-200 transition-all resize-none h-20" placeholder="写下这一刻的感受..."></textarea>
                     </div>
                     <button onclick="window.cpActions.saveAnniversary()" class="w-full mt-2 py-3.5 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform shadow-md">保存纪念日</button>
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
     const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0];
     // 🌟 优先提取聊天室专属头像，如果没有才用马甲头像
     const myAvatar = chat?.myAvatar || boundPersona.avatar;

     // 根据时长计算柱状图高度 (最大 50px)
     const getBarHeight = (h) => Math.min(Math.max((h / 12) * 50, 4), 50);

     return `
      <div class="w-full h-full bg-[#f4f5f7] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60] overflow-hidden">
         
         <div class="w-full h-[35vh] relative bg-[#e5e9f0] flex-shrink-0">
            <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(#94a3b8 2px, transparent 2px); background-size: 24px 24px;"></div>
            <div class="absolute inset-0 opacity-10" style="background-image: linear-gradient(0deg, transparent 24%, rgba(148, 163, 184, 0.3) 25%, rgba(148, 163, 184, 0.3) 26%, transparent 27%, transparent 74%, rgba(148, 163, 184, 0.3) 75%, rgba(148, 163, 184, 0.3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(148, 163, 184, 0.3) 25%, rgba(148, 163, 184, 0.3) 26%, transparent 27%, transparent 74%, rgba(148, 163, 184, 0.3) 75%, rgba(148, 163, 184, 0.3) 76%, transparent 77%, transparent); background-size: 50px 50px;"></div>
            
            <div class="absolute top-8 left-4 z-20 cursor-pointer active:scale-90 p-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-white/50" onclick="window.cpActions.goBackToDashboard()">
               <i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i>
            </div>

            <div class="absolute top-8 right-4 z-20 cursor-pointer active:scale-90 p-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-white/50" onclick="window.cpActions.refreshLocationData()">
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

  // 📖 界面 4：日记本 
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

         <div class="pt-8 pb-3 px-4 sticky top-0 z-10 flex items-center justify-between backdrop-blur-md bg-transparent">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.goBackToDashboard()"><i data-lucide="chevron-left" class="w-8 h-8 ${isDark?'text-white':'text-gray-800'}"></i></div>
            <span class="absolute left-1/2 -translate-x-1/2 font-extrabold text-gray-800 text-lg">日记本</span>
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
                       <i data-lucide="loader-2" class="w-10 h-10 text-gray-800 animate-spin mb-4"></i>
                       <span class="text-[15px] font-bold text-gray-600 tracking-widest">正在用心记录点滴...</span>
                       <span class="text-[11px] text-gray-400 mt-2 font-medium">请耐心等待 TA 写下这篇日记</span>
                   </div>
               ` : diary && diary.content ? `
                   <div class="${t.font} ${t.text} text-[15px] flex-1" style="letter-spacing: ${cfg.letterSpacing}; line-height: ${cfg.lineHeight}; pb-8">
                       ${renderDiaryContent(diary.content, cfg)}
                   </div>
                   <div class="flex items-center justify-end space-x-5 mt-4 pt-4 border-t ${isDark?'border-gray-700/50':'border-gray-300/30'}">
                       <div class="flex items-center space-x-1.5 cursor-pointer active:scale-90 transition-all text-gray-400 hover:text-pink-500" onclick="window.cpActions.rerollDiary('${cpState.activeCharId}', '${cpState.diaryDate}')">
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
                                  
                                  <div class="mt-3 flex items-center space-x-3 opacity-80 transition-opacity ${c.sender === 'me' ? 'justify-end' : 'justify-start'}">
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
               <button onclick="window.cpActions.callToWriteDiary('${char.id}', '${cpState.diaryDate}')" class="mb-4 px-7 py-3 bg-gray-900/90 backdrop-blur-md text-white font-extrabold rounded-full active:scale-95 transition-transform text-[13px] tracking-widest shadow-xl border border-gray-700 flex items-center">
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
             <div style="background: #fcfcfc !important;" class="w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-[28px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                 <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                     <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="sliders-horizontal" class="w-5 h-5 mr-2 text-gray-800"></i>日记本排版引擎</span>
                 </div>
                 <div class="p-6 flex flex-col space-y-5">
                     <div class="flex justify-between items-center bg-white p-4 rounded-[16px] border border-gray-100 shadow-sm">
                         <span class="text-[14px] font-bold text-gray-700">定时写日记</span>
                         <input type="checkbox" id="diary-enable-switch" class="ios-switch" ${cfg.enabled ? 'checked' : ''}>
                     </div>

                     <div>
                         <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">每日撰写时间</span>
                         <input id="diary-time-input" type="time" value="${cfg.time}" class="w-80% bg-white border border-gray-200 rounded-[12px] px-3 py-2.5 outline-none text-[16px] text-gray-800 shadow-sm">
                     </div>
                     
                     <div class="grid grid-cols-2 gap-4">
                         <div>
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">整体风格</span>
                             <select id="diary-theme-select" class="w-full bg-white border border-gray-200 rounded-[12px] px-3 py-2.5 outline-none text-[16px] text-gray-800 shadow-sm">
                                 <option value="default" ${cfg.theme==='default'?'selected':''}>极简纯白</option>
                                 <option value="vintage" ${cfg.theme==='vintage'?'selected':''}>复古牛皮</option>
                                 <option value="romance" ${cfg.theme==='romance'?'selected':''}>心动粉红</option>
                                 <option value="dark" ${cfg.theme==='dark'?'selected':''}>深夜暗黑</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">纸张纹理</span>
                             <select id="diary-paper-select" class="w-full bg-white border border-gray-200 rounded-[12px] px-3 py-2.5 outline-none text-[16px] text-gray-800 shadow-sm">
                                 <option value="blank" ${cfg.paper==='blank'?'selected':''}>空白无痕</option>
                                 <option value="lined" ${cfg.paper==='lined'?'selected':''}>横线信笺</option>
                                 <option value="grid" ${cfg.paper==='grid'?'selected':''}>网格笔记</option>
                                 <option value="dotted" ${cfg.paper==='dotted'?'selected':''}>点阵手帐</option>
                             </select>
                         </div>
                     </div>
                     
                     <div class="h-px w-full bg-gray-200/50"></div>

                     <div class="grid grid-cols-3 gap-3">
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">字距</span>
                             <select id="diary-ls-select" class="w-full bg-white border border-gray-200 rounded-[10px] py-2 pl-2 pr-0 outline-none text-[14px] text-gray-800 shadow-sm">
                                 <option value="normal" ${cfg.letterSpacing==='normal'?'selected':''}>默认</option>
                                 <option value="1px" ${cfg.letterSpacing==='1px'?'selected':''}>宽松</option>
                                 <option value="2px" ${cfg.letterSpacing==='2px'?'selected':''}>极宽</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">行距</span>
                             <select id="diary-lh-select" class="w-full bg-white border border-gray-200 rounded-[10px] py-2 pl-2 pr-0 outline-none text-[14px] text-gray-800 shadow-sm">
                                 <option value="1.5" ${cfg.lineHeight==='1.5'?'selected':''}>紧凑</option>
                                 <option value="1.8" ${cfg.lineHeight==='1.8'?'selected':''}>舒适</option>
                                 <option value="2.2" ${cfg.lineHeight==='2.2'?'selected':''}>散文</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">缩进</span>
                             <select id="diary-ti-select" class="w-full bg-white border border-gray-200 rounded-[10px] py-2 pl-2 pr-0 outline-none text-[14px] text-gray-800 shadow-sm">
                                 <option value="0" ${cfg.textIndent==='0'?'selected':''}>无</option>
                                 <option value="2em" ${cfg.textIndent==='2em'?'selected':''}>空两格</option>
                             </select>
                         </div>
                     </div>

                     <div class="h-px w-full bg-gray-200/50"></div>

                     <div class="grid grid-cols-2 gap-4">
                         <div class="flex flex-col">
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block">阴暗面色 (~~划线)</span>
                             <div class="flex items-center space-x-2">
                                 <input type="color" id="diary-hidden-color" value="${cfg.hiddenColor}" class="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent">
                                 <span class="text-[11px] font-mono text-gray-400">隐藏的心事</span>
                             </div>
                         </div>
                         <div class="flex flex-col">
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block">高光色 (**加粗)</span>
                             <div class="flex items-center space-x-2">
                                 <input type="color" id="diary-highlight-color" value="${cfg.highlightColor}" class="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent">
                                 <span class="text-[11px] font-mono text-gray-400">最深的感触</span>
                             </div>
                         </div>
                     </div>

                     <button onclick="window.cpActions.saveDiarySettings()" class="w-full py-3.5 mt-2 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform shadow-md tracking-widest text-[15px]">保存排版设置</button>
                 </div>
             </div>
         </div>
         ` : ''}

         ${cpState.showDiaryEdit ? `
         <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.toggleDiaryEdit(false)">
             <div style="background: #fcfcfc !important;" class="w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
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
             <div style="background: #fcfcfc !important;" class="w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
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

  // 🌟 界面 5：提问箱 
  if (cpState.view === 'questions') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const chat = store.chats.find(c => c.charId === char.id);
        const myAvatar = chat?.myAvatar || (store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0]).avatar;

        store.coupleSpacesData = store.coupleSpacesData || {};
        const spaceData = store.coupleSpacesData[char.id] || {};
        spaceData.questions = spaceData.questions || [];

        // 🌟 极简粉蓝卡片渲染流 (横线分割 + TA的反应)
        let qListHtml = spaceData.questions.length === 0 ? `
            <div class="flex flex-col items-center justify-center h-40 opacity-50 mt-10">
                <i data-lucide="inbox" class="w-12 h-12 mb-3 text-gray-400"></i><span class="text-[14px] font-bold text-gray-400">还没互相提问过哦</span>
            </div>
        ` : spaceData.questions.map((q) => {
            if (q.asker === 'me') {
                return `
                <div class="w-full bg-rose-50 border border-rose-100/60 rounded-[24px] p-5 mb-4 shadow-sm flex flex-col relative group">
                    <div class="absolute right-4 top-4 opacity-80 transition-opacity">
                        <i data-lucide="trash-2" class="w-4 h-4 text-rose-300 hover:text-rose-500 cursor-pointer active:scale-90" onclick="window.cpActions.deleteQuestion('${char.id}', '${q.id}')"></i>
                    </div>
                    <div class="flex items-center space-x-2.5 mb-3">
                        <img src="${myAvatar}" class="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm">
                        <span class="text-[13px] font-black text-rose-400">我的提问</span>
                        <span class="text-[11px] font-bold text-gray-400 ml-auto mr-5">${new Date(q.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p class="text-[16px] text-gray-800 font-bold leading-relaxed">${q.text}</p>
                    
                    <div class="mt-4 pt-4 border-t border-rose-100/60 relative">
                        ${q.answer ? `
                            <div class="flex items-start space-x-2.5">
                                <img src="${char.avatar}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-white shadow-sm">
                                <span class="text-[14px] text-gray-700 leading-relaxed font-medium">${window.formatTextWithEmoticons ? window.formatTextWithEmoticons(q.answer) : q.answer}</span>
                            </div>
                            <div class="mt-3 flex justify-end space-x-2.5 opacity-80 transition-opacity">
                                <i data-lucide="refresh-cw" class="w-4 h-4 text-gray-400 hover:text-rose-400 cursor-pointer active:scale-90" title="让他重答" onclick="window.cpActions.rerollQAnswer('${char.id}', '${q.id}')"></i>
                                <i data-lucide="x-circle" class="w-4 h-4 text-gray-400 hover:text-red-400 cursor-pointer active:scale-90" title="撤回回答" onclick="window.cpActions.deleteQAnswer('${char.id}', '${q.id}')"></i>
                            </div>
                        ` : `<div class="flex items-center space-x-1.5 text-rose-400"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span class="text-[12px] font-bold">呼唤 ${char.name} 中...</span></div>`}
                    </div>
                </div>`;
            } else {
                return `
                <div class="w-full bg-blue-50 border border-blue-100/60 rounded-[24px] p-5 mb-4 shadow-sm flex flex-col relative group">
                    <div class="absolute right-4 top-4 opacity-80 transition-opacity">
                        <i data-lucide="trash-2" class="w-4 h-4 text-blue-300 hover:text-blue-500 cursor-pointer active:scale-90" onclick="window.cpActions.deleteQuestion('${char.id}', '${q.id}')"></i>
                    </div>
                    <div class="flex items-center space-x-2.5 mb-3">
                        <img src="${char.avatar}" class="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm">
                        <span class="text-[13px] font-black text-blue-500">${char.name}的提问</span>
                        <span class="text-[11px] font-bold text-gray-400 ml-auto mr-5">${new Date(q.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p class="text-[16px] text-gray-800 font-bold leading-relaxed">${q.text}</p>
                    
                    ${q.answer ? `
                        <div class="mt-4 pt-4 border-t border-blue-100/60 relative">
                            <div class="flex items-start space-x-2.5">
                                <img src="${myAvatar}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-white shadow-sm">
                                <span class="text-[14px] text-gray-700 leading-relaxed font-medium">${q.answer}</span>
                            </div>
                            <div class="mt-2 flex justify-end space-x-2.5 opacity-80 transition-opacity">
                                <i data-lucide="x-circle" class="w-4 h-4 text-gray-400 hover:text-red-400 cursor-pointer active:scale-90" title="撤回回答" onclick="window.cpActions.deleteQAnswer('${char.id}', '${q.id}')"></i>
                            </div>
                        </div>
                        
                        <div class="mt-3 pt-3 border-t border-blue-100/60 relative">
                            ${q.reaction ? `
                                <div class="flex items-start space-x-2.5">
                                    <img src="${char.avatar}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-white shadow-sm">
                                    <span class="text-[14px] text-gray-700 leading-relaxed font-medium">${q.reaction}</span>
                                </div>
                                <div class="mt-2 flex justify-end space-x-2.5 opacity-80 transition-opacity">
                                    <i data-lucide="refresh-cw" class="w-4 h-4 text-gray-400 hover:text-blue-400 cursor-pointer active:scale-90" title="重摇反应" onclick="window.cpActions.rerollQReaction('${char.id}', '${q.id}')"></i>
                                </div>
                            ` : `<div class="flex items-center space-x-1.5 text-blue-400"><i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span class="text-[11px] font-bold">TA 正在看你的回答...</span></div>`}
                        </div>
                    ` : `
                        <div class="mt-4 pt-4 border-t border-blue-100/60 flex items-center space-x-2">
                            <input type="text" id="ans-input-${q.id}" class="flex-1 bg-white border border-blue-100/80 rounded-full h-10 px-4 text-[14px] font-medium outline-none focus:border-blue-300 transition-colors shadow-inner text-gray-800 placeholder-gray-300" onkeydown="if(event.key==='Enter'){event.preventDefault();window.cpActions.answerQuestion('${q.id}')}" placeholder="写下你的回答...">
                            <button onclick="window.cpActions.answerQuestion('${q.id}')" class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all shadow-md shrink-0"><i data-lucide="arrow-up" class="w-4 h-4"></i></button>
                        </div>
                    `}
                </div>`;
            }
        }).join('');

        return `
        <div class="w-full h-full flex flex-col bg-[#fcfcfc] relative animate-in fade-in slide-in-from-right-4 duration-300">
            <div class="pt-8 pb-3 px-4 shrink-0 flex items-center justify-between bg-[#fcfcfc]/90 backdrop-blur-md sticky top-0 z-20">
                <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')">
                    <i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i>
                </div>
                <span class="text-lg font-extrabold text-gray-800 tracking-wide">提问箱</span>
                <div class="cursor-pointer active:scale-90 p-1 -mr-1" onclick="window.cpActions.openQuestionSettings()">
                    <i data-lucide="settings" class="w-6 h-6 text-gray-800"></i>
                </div>
            </div>

            <div class="px-5 py-4 bg-white border-b border-gray-50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] z-10">
                <div class="w-full bg-gray-50/80 border border-gray-100 rounded-[20px] flex items-center px-4 py-2 focus-within:bg-rose-50/50 focus-within:border-rose-200 transition-all shadow-inner">
                    <textarea id="new-q-input" class="flex-1 bg-transparent border-none outline-none text-[15px] font-medium text-gray-800 resize-none h-10 mt-2 hide-scrollbar" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();window.cpActions.askQuestion('${char.id}')}" placeholder="想问 ${char.name} 什么？"></textarea>
                    <button onclick="window.cpActions.askQuestion('${char.id}')" class="w-9 h-9 flex items-center justify-center shrink-0 active:scale-90 transition-transform text-rose-400 hover:text-rose-500 ml-2">
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-5 space-y-2 pb-24 hide-scrollbar">
                ${qListHtml}
            </div>

            ${cpState.showQuestionSettings ? `
            <div class="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.closeQuestionSettings()">
                <div style="background: #ffffff !important;" class="w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
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
                            </div>
                            <input type="checkbox" id="q-enable-toggle" class="ios-switch" ${spaceData.enableAiQuestions === true ? 'checked' : ''}>
                        </div>
                        <div class="w-full h-[1px] bg-gray-200/60"></div>
                        <div class="flex items-center justify-between py-1">
                            <span class="text-[15px] font-bold text-gray-800">每日提问频率</span>
                            <select id="q-freq-select" class="bg-transparent border-none text-[15px] font-bold text-blue-500 outline-none cursor-pointer text-right dir-rtl">
                                <option value="1" ${spaceData.aiQuestionFreq == 1 ? 'selected' : ''}>1条/天</option>
                                <option value="2" ${(spaceData.aiQuestionFreq || 1) == 2 ? 'selected' : ''}>2条/天</option>
                                <option value="3" ${spaceData.aiQuestionFreq == 3 ? 'selected' : ''}>3条/天</option>
                            </select>
                        </div>
                    </div>
                    <button onclick="window.cpActions.saveQuestionSettings('${char.id}')" class="w-full py-4 mt-8 bg-gray-900 text-white rounded-[20px] font-black text-[15px] shadow-lg active:scale-95 transition-all">完成</button>
                </div>
            </div>
            ` : ''}
        </div>
        `;
  }

  // 🌟 界面 5.5：共同成长 (自律打卡系统)
  if (cpState.view === 'growth') {
      const char = store.contacts.find(c => c.id === cpState.activeCharId);
      const spaceData = store.coupleSpacesData[char.id] || {};
      const growth = spaceData.growth || { plans: [], records: {} };
      const logicalToday = getLogicalDateStr();
      
      // 🌟 1. 动态生成本周打卡日历 & 全局积分计算引擎
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const prefixThisMonth = `${year}-${String(month+1).padStart(2,'0')}-`;
      const [tY, tM, tD] = logicalToday.split('-');
      // 算出今天是本月的第几行
      const todayRow = Math.floor((firstDay + parseInt(tD) - 1) / 7);

      // 🎯 积分与统计大脑
      let totalCheckins = 0, totalPerfects = 0;
      let monthCheckins = 0, monthPerfects = 0;
      let totalScore = 0;
      let consecutiveCheckins = 0, consecutivePerfects = 0;
      let lastDateObj = null;

      const allDates = Object.keys(growth.records).sort();
      allDates.forEach(dateStr => {
          const recordsDay = growth.records[dateStr];
          const activePlans = growth.plans;

          const myDailyPlans = activePlans.filter(p => p.owner === 'me' && p.type === 'daily');
          const taDailyPlans = activePlans.filter(p => p.owner === 'ai' && p.type === 'daily');

          const myDailyCompleted = myDailyPlans.filter(p => recordsDay[p.id]).length;
          const taDailyCompleted = taDailyPlans.filter(p => recordsDay[p.id]).length;

          const myDailyOk = myDailyPlans.length > 0 && myDailyCompleted === myDailyPlans.length;
          const taDailyOk = taDailyPlans.length > 0 && taDailyCompleted === taDailyPlans.length;

          const myHasCheck = activePlans.filter(p => p.owner === 'me' && recordsDay[p.id]).length > 0;
          const taHasCheck = activePlans.filter(p => p.owner === 'ai' && recordsDay[p.id]).length > 0;

          const bothChecked = myHasCheck && taHasCheck;
          const bothPerfect = bothChecked && myDailyOk && taDailyOk;

          if (!bothChecked) {
              consecutiveCheckins = 0;
              consecutivePerfects = 0;
              return; 
          }

          // 判断断签 (相隔大于 1 天)
          const currDateObj = new Date(dateStr);
          if (lastDateObj) {
              const diffDays = Math.round((currDateObj - lastDateObj) / (1000 * 60 * 60 * 24));
              if (diffDays > 1) {
                  consecutiveCheckins = 0;
                  consecutivePerfects = 0;
              }
          }
          lastDateObj = currDateObj;

          totalCheckins++;
          if (dateStr.startsWith(prefixThisMonth)) monthCheckins++;
          consecutiveCheckins++;
          totalScore += 10; 
          if (consecutiveCheckins % 3 === 0) totalScore += 10; 

          if (bothPerfect) {
              totalPerfects++;
              if (dateStr.startsWith(prefixThisMonth)) monthPerfects++;
              consecutivePerfects++;
              totalScore += 10; 
              if (consecutivePerfects % 3 === 0) totalScore += 20; 
          } else {
              consecutivePerfects = 0;
          }
      });

      // 🌟 生成格子并通过 cellArray 抓取本周
      let cellArray = [];
      for(let i=0; i<firstDay; i++) { cellArray.push({ row: 0, html: `<div></div>` }); } 
      
      for(let d=1; d<=daysInMonth; d++) {
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const recordsDay = growth.records[dateStr] || {};
          const activePlans = growth.plans; 
          
          const myDailyPlans = activePlans.filter(p => p.owner === 'me' && p.type === 'daily');
          const taDailyPlans = activePlans.filter(p => p.owner === 'ai' && p.type === 'daily');
          
          const myDailyCompleted = myDailyPlans.filter(p => recordsDay[p.id]).length;
          const taDailyCompleted = taDailyPlans.filter(p => recordsDay[p.id]).length;
          
          const myDailyOk = myDailyPlans.length > 0 && myDailyCompleted === myDailyPlans.length;
          const taDailyOk = taDailyPlans.length > 0 && taDailyCompleted === taDailyPlans.length;
          
          const myHasCheck = activePlans.filter(p => p.owner === 'me' && recordsDay[p.id]).length > 0;
          const taHasCheck = activePlans.filter(p => p.owner === 'ai' && recordsDay[p.id]).length > 0;
          
          const bothChecked = myHasCheck && taHasCheck;
          const bothPerfect = bothChecked && myDailyOk && taDailyOk; 
          
          const isTodayDate = dateStr === logicalToday;
          const cellRow = Math.floor((firstDay + d - 1) / 7);
          
          let bgClass = isTodayDate ? 'bg-white border border-gray-100 shadow-md text-gray-800' : 'bg-transparent text-gray-600';
          if (bothPerfect || bothChecked) {
              bgClass = isTodayDate ? 'bg-white border border-gray-100 shadow-md text-gray-300' : 'bg-transparent text-gray-300';
          }
          
          let stampHtml = '';
          if (bothPerfect) {
              stampHtml = `<div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"><div class="w-10 h-10 border-2 border-rose-400/80 rounded-full flex flex-col items-center justify-center rotate-[-12deg] mix-blend-multiply"><span class="text-[8px] font-black text-rose-500 uppercase tracking-tighter leading-none mt-1">Perfect</span><div class="w-7 h-[1.5px] bg-rose-400/80 my-[1px]"></div><span class="text-[6px] font-bold text-rose-500/90">${month+1}.${d}</span></div></div>`;
          } else if (bothChecked) {
              stampHtml = `<div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"><div class="w-9 h-9 border-[1.5px] border-orange-400/70 rounded-full flex items-center justify-center rotate-[15deg] mix-blend-multiply"><span class="text-[10px] font-black text-orange-500/80 uppercase tracking-widest font-serif">Done</span></div></div>`;
          }
          
          let dotsHtml = '';
          if (!bothChecked && !bothPerfect) {
              if (myHasCheck) dotsHtml += '<div class="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-sm mx-[1px]"></div>';
              if (taHasCheck) dotsHtml += '<div class="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-sm mx-[1px]"></div>';
          }
          let dotsContainer = dotsHtml ? `<div class="absolute bottom-1 left-0 right-0 flex justify-center">${dotsHtml}</div>` : '';

          const html = `
          <div class="flex justify-center relative h-11 items-center my-1">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold ${bgClass} transition-all relative z-0">
                  <span>${d}</span>
                  ${dotsContainer}
              </div>
              ${stampHtml}
          </div>`;
          
          cellArray.push({ row: cellRow, html: html });
      }

      // 🌟 强行过滤，只渲染今天所在的这一周
      let finalCells = cellArray.filter(c => c.row === todayRow);

      let daysHtml = '';
      const weekDays = ['日','一','二','三','四','五','六'];
      daysHtml += weekDays.map(d => `<div class="text-[10px] text-gray-400 text-center font-bold mb-2">${d}</div>`).join('');
      daysHtml += finalCells.map(c => c.html).join('');

      // 🌟 精简版单行图例 (已拉近间距)
      const legendHtml = `
      <div class="flex items-center justify-center space-x-5 w-full mt-2 pt-3 border-t border-gray-50 text-[9px] font-bold text-gray-400 tracking-wider">
          <div class="flex items-center"><div class="w-1.5 h-1.5 rounded-full bg-pink-400 mr-1 shadow-sm"></div>我</div>
          <div class="flex items-center"><div class="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1 shadow-sm"></div>TA</div>
          <div class="flex items-center"><span class="text-[8px] font-black text-orange-400 border border-orange-300 rounded-[2px] px-0.5 rotate-[5deg] mr-1">DONE</span>共同</div>
          <div class="flex items-center"><span class="text-[8px] font-black text-rose-400 border border-rose-300 rounded-[2px] px-0.5 rotate-[-5deg] mr-1">PERFECT</span>完美</div>
      </div>
      `;

      // 🌟 2. 计划列表渲染 (带长短周期检测、沉底排序和颜色区分)
      const currentTab = cpState.growthTab;
      const currentPlans = growth.plans.filter(p => p.owner === currentTab);

      // 核心辅助大脑：判断某个计划在当前周期内是否已达标
      const checkIsDone = (p, dateStr) => {
          if (p.type === 'weekly') {
              const d = new Date(dateStr);
              const day = d.getDay() || 7;
              d.setDate(d.getDate() - day + 1);
              const weekDates = [];
              for(let i=0; i<7; i++) {
                  const nd = new Date(d);
                  nd.setDate(d.getDate() + i);
                  weekDates.push(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`);
              }
              return weekDates.some(wd => growth.records[wd] && growth.records[wd][p.id]);
          } else if (p.type === 'monthly') {
              const prefix = dateStr.substring(0, 7);
              return Object.keys(growth.records).some(k => k.startsWith(prefix) && growth.records[k][p.id]);
          } else {
              return growth.records[dateStr] && growth.records[dateStr][p.id];
          }
      };

      const typeWeight = { daily: 1, weekly: 2, monthly: 3 };

      // 🌟 重新洗牌排序：未打卡在上，已打卡沉底；同状态下 每日 > 每周 > 每月
      const sortedPlans = [...currentPlans].sort((a, b) => {
          const aDone = checkIsDone(a, logicalToday);
          const bDone = checkIsDone(b, logicalToday);
          if (aDone !== bDone) return aDone ? 1 : -1;
          return typeWeight[a.type] - typeWeight[b.type];
      });

      const planHtml = sortedPlans.length === 0 ? `
          <div class="flex flex-col items-center justify-center py-10 opacity-60">
              ${spaceData.isGeneratingAIPlans ? `<i data-lucide="loader-2" class="w-10 h-10 animate-spin text-orange-400 mb-3"></i><span class="text-[13px] font-bold text-orange-500">TA 正在认真思考自律计划...</span>` : `<i data-lucide="target" class="w-12 h-12 text-gray-400 mb-3"></i><span class="text-[13px] font-bold text-gray-500">还没有制定计划哦</span>`}
          </div>
      ` : sortedPlans.map(p => {
          const isDone = checkIsDone(p, logicalToday);
          const typeBadge = p.type === 'daily' ? '每日' : (p.type === 'weekly' ? '每周' : '每月');
          // 彻底阻断打卡动作：不是自己的计划 或者 已经完成的，都不许碰
          const canToggle = p.owner === 'me' && !isDone; 

          // 🌟 专属颜色挂载
          let colorClass = 'text-orange-400 bg-orange-50';
          let borderColor = 'border-orange-400 bg-orange-400';
          if (p.type === 'weekly') {
              colorClass = 'text-blue-500 bg-blue-50';
              borderColor = 'border-blue-400 bg-blue-400';
          } else if (p.type === 'monthly') {
              colorClass = 'text-purple-500 bg-purple-50';
              borderColor = 'border-purple-400 bg-purple-400';
          }

          return `
          <div class="bg-white rounded-[20px] p-4 shadow-[0_4px_15px_rgba(0,0,0,0.02)] border border-gray-100 flex items-center transition-all duration-300 ${isDone ? 'opacity-50 bg-gray-50/80 scale-[0.98]' : ''}">
              <div class="w-6 h-6 rounded-full border-2 ${isDone ? borderColor : 'border-gray-300'} flex items-center justify-center mr-4 shrink-0 ${canToggle ? 'cursor-pointer active:scale-90' : 'cursor-not-allowed opacity-80'}" ${canToggle ? `onclick="window.cpActions.toggleGrowthTask('${char.id}', '${p.id}')"` : ''}>
                  ${isDone ? '<i data-lucide="check" class="w-4 h-4 text-white"></i>' : ''}
              </div>
              <div class="flex-1 flex flex-col justify-center ${canToggle ? 'cursor-pointer' : ''}" ${canToggle ? `onclick="window.cpActions.toggleGrowthTask('${char.id}', '${p.id}')"` : ''}>
                  <span class="text-[15px] font-bold ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'} leading-snug">${p.text}</span>
                  <span class="text-[10px] font-black ${colorClass} px-2 py-0.5 rounded-full self-start mt-1.5 tracking-widest">${typeBadge}</span>
              </div>
              <i data-lucide="trash-2" class="w-4 h-4 text-gray-300 hover:text-red-400 cursor-pointer active:scale-90 ml-3 shrink-0" onclick="window.cpActions.deleteGrowthTask('${char.id}', '${p.id}')"></i>
          </div>
          `;
      }).join('');

      return `
      <div class="w-full h-full flex flex-col bg-[#fcfcfc] relative animate-in fade-in slide-in-from-right-4 duration-300 z-[60]">
          <div class="pt-8 pb-3 px-4 shrink-0 flex items-center justify-between bg-[#fcfcfc]/90 backdrop-blur-md sticky top-0 z-20">
              <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
              <span class="text-lg font-extrabold text-gray-800 tracking-wide">共同成长</span>
              <div class="w-8"></div>
          </div>

          <div id="cp-growth-scroll" class="flex-1 overflow-y-auto hide-scrollbar">
              <div class="px-5 py-2">
                  <div class="bg-white rounded-[24px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-gray-50 flex flex-col">
                      <div class="flex items-center justify-between mb-4">
                          <span class="text-[14px] font-extrabold text-gray-800 flex items-center"><i data-lucide="calendar-days" class="w-4 h-4 mr-1.5 text-orange-400"></i>打卡日历</span>
                          <span class="text-[11px] font-bold text-gray-400">${year}年${month+1}月</span>
                      </div>
                      
                      <div class="grid grid-cols-7 gap-y-0 relative transition-all duration-300">${daysHtml}</div>
                      
                      ${legendHtml}

                      <div class="mt-4 bg-gray-50/60 rounded-[16px] p-3 border border-gray-100/50">
                          <div class="flex items-center justify-between mb-3 px-1">
                              <span class="text-[12px] font-extrabold text-gray-700 flex items-center"><i data-lucide="award" class="w-4 h-4 mr-1 text-orange-400"></i>成就与积分</span>
                              <div class="bg-orange-100/60 text-orange-600 px-2.5 py-0.5 rounded-full flex items-center shadow-sm border border-orange-200/50">
                                  <i data-lucide="coins" class="w-3.5 h-3.5 mr-1 text-orange-500"></i>
                                  <span class="text-[13px] font-black font-serif drop-shadow-sm">${totalScore}</span>
                              </div>
                          </div>
                          
                          <div class="grid grid-cols-3 gap-y-2 gap-x-2">
                              <div class="flex flex-col items-center bg-white py-1.5 rounded-lg border border-gray-100 shadow-sm">
                                  <span class="text-[9px] font-bold text-gray-400">本月打卡</span>
                                  <span class="text-[14px] font-black text-gray-700 font-serif">${monthCheckins}</span>
                              </div>
                              <div class="flex flex-col items-center bg-white py-1.5 rounded-lg border border-gray-100 shadow-sm relative overflow-hidden">
                                  <span class="text-[9px] font-bold text-gray-400">连续打卡</span>
                                  <span class="text-[14px] font-black text-blue-500 font-serif">${consecutiveCheckins}</span>
                              </div>
                              <div class="flex flex-col items-center bg-white py-1.5 rounded-lg border border-gray-100 shadow-sm">
                                  <span class="text-[9px] font-bold text-gray-400">总计打卡</span>
                                  <span class="text-[14px] font-black text-gray-700 font-serif">${totalCheckins}</span>
                              </div>
                              
                              <div class="flex flex-col items-center bg-white py-1.5 rounded-lg border border-gray-100 shadow-sm">
                                  <span class="text-[9px] font-bold text-gray-400">本月完美</span>
                                  <span class="text-[14px] font-black text-rose-400 font-serif">${monthPerfects}</span>
                              </div>
                              <div class="flex flex-col items-center bg-white py-1.5 rounded-lg border border-gray-100 shadow-sm relative overflow-hidden">
                                  <span class="text-[9px] font-bold text-gray-400">连续完美</span>
                                  <span class="text-[14px] font-black text-rose-500 font-serif">${consecutivePerfects}</span>
                              </div>
                              <div class="flex flex-col items-center bg-white py-1.5 rounded-lg border border-gray-100 shadow-sm">
                                  <span class="text-[9px] font-bold text-gray-400">总计完美</span>
                                  <span class="text-[14px] font-black text-rose-400 font-serif">${totalPerfects}</span>
                              </div>
                          </div>
                      </div>
                      
                  </div>
              </div>

              <div class="mt-4 px-5">
                  <div class="flex items-center bg-gray-100/80 p-1 rounded-full mb-5">
                      <div class="flex-1 py-2 text-center text-[13px] font-bold rounded-full cursor-pointer transition-all ${currentTab === 'me' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}" onclick="window.cpActions.switchGrowthTab('${char.id}', 'me')">我的计划</div>
                      <div class="flex-1 py-2 text-center text-[13px] font-bold rounded-full cursor-pointer transition-all ${currentTab === 'ai' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}" onclick="window.cpActions.switchGrowthTab('${char.id}', 'ai')">TA 的计划</div>
                  </div>

                  <div class="flex flex-col space-y-3 relative min-h-[200px] pb-28">
                      ${planHtml}
                  </div>
              </div>
          </div>
          
          ${currentTab === 'me' ? `
          <div class="absolute bottom-6 left-0 right-0 z-30 flex justify-center space-x-3 px-5">
              <button onclick="window.cpActions.openGrowthManualModal()" class="flex-1 flex items-center justify-center py-3.5 bg-white border border-gray-200 text-gray-800 font-bold text-[14px] rounded-[18px] shadow-xl active:scale-95 transition-transform">
                  <i data-lucide="edit-3" class="w-4 h-4 mr-1.5"></i> 自己写计划
              </button>
              <button onclick="window.cpActions.openGrowthAiModal()" class="flex-1 flex items-center justify-center py-3.5 bg-gray-900 text-white font-bold text-[14px] rounded-[18px] shadow-xl active:scale-95 transition-transform">
                  <i data-lucide="sparkles" class="w-4 h-4 mr-1.5 text-orange-400"></i> 让 TA 帮我写
              </button>
          </div>
          ` : ''}
          
          ${cpState.growthModalView ? `
          <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.closeGrowthModal()">
              <div style="background: #ffffff !important;" class="w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 max-h-[80vh]" onclick="event.stopPropagation()">
                  <div class="flex justify-between items-center mb-5 shrink-0">
                      <span class="text-[18px] font-black text-gray-900">${cpState.growthModalView === 'manual' ? '自己写计划' : '让 TA 帮你做计划'}</span>
                      <button onclick="window.cpActions.closeGrowthModal()" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95"><i data-lucide="x" class="w-4 h-4"></i></button>
                  </div>
                  
                  <div class="flex flex-col space-y-4 overflow-y-auto hide-scrollbar flex-1 pb-2">
                      ${cpState.growthModalView === 'manual' ? `
                          <div class="animate-in fade-in">
                              <span class="text-[12px] font-bold text-gray-500 mb-2 block">打卡频率</span>
                              <div class="flex space-x-2">
                                  ${['daily:每日', 'weekly:每周', 'monthly:每月'].map(t => {
                                      const [val, label] = t.split(':');
                                      const isActive = cpState.growthAddType === val;
                                      return `<div class="flex-1 py-2 text-center text-[12px] font-bold rounded-[10px] cursor-pointer transition-all ${isActive ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'bg-gray-50 text-gray-500 border border-transparent'}" onclick="window.cpActions.setGrowthAddType('${val}');">${label}</div>`;
                                  }).join('')}
                              </div>
                          </div>
                          <div class="mt-2 animate-in fade-in">
                              <span class="text-[12px] font-bold text-gray-500 mb-2 block">计划内容</span>
                              <textarea id="growth-manual-input" class="w-full bg-gray-50 border border-gray-100 rounded-[16px] px-4 py-3 outline-none text-[14px] font-medium text-gray-800 focus:bg-white focus:border-orange-200 transition-all resize-none h-24 shadow-inner placeholder-gray-400" placeholder="例如：每天早睡 / 每天背20个单词"></textarea>
                          </div>
                          <button onclick="window.cpActions.saveGrowthManualPlan('${char.id}')" class="w-full py-3.5 mt-4 bg-gray-900 text-white font-black rounded-[16px] active:scale-95 transition-transform tracking-widest text-[14px] shrink-0">创建计划</button>
                      ` : `
                          <div class="mt-1 animate-in fade-in shrink-0">
                              <span class="text-[12px] font-bold text-gray-500 mb-2 block">你想达成什么目标？</span>
                              <div class="flex items-center space-x-2">
                                  <input id="growth-fuzzy-input" type="text" class="flex-1 bg-gray-50 px-4 py-3 rounded-[12px] text-[14px] font-medium text-gray-800 outline-none placeholder-gray-400 border border-gray-100 focus:border-orange-200 focus:bg-orange-50/30 transition-all" placeholder="如: 想变瘦/想更自律/想考研">
                                  <button onclick="window.cpActions.generateGrowthPlan('${char.id}')" class="w-12 h-12 bg-gray-900 text-white rounded-[12px] flex items-center justify-center shrink-0 active:scale-95 transition-all">
                                      ${cpState.isGeneratingGrowth ? '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>' : '<i data-lucide="sparkles" class="w-5 h-5 text-orange-400"></i>'}
                                  </button>
                              </div>
                          </div>
                          
                          ${cpState.aiGeneratedPlans && cpState.aiGeneratedPlans.length > 0 ? `
                          <div class="mt-4 animate-in fade-in flex flex-col space-y-2">
                              <span class="text-[12px] font-bold text-orange-500 mb-1 flex items-center">${char.name}为你定制的计划表</span>
                              ${cpState.aiGeneratedPlans.map((p, idx) => `
                                  <div class="bg-orange-50/50 border border-orange-100 rounded-[12px] p-3 flex items-center justify-between group">
                                      <div class="flex flex-col flex-1 pr-2">
                                          <span class="text-[13px] font-bold text-gray-800 leading-snug">${p.text}</span>
                                          <span class="text-[10px] font-black text-orange-400 mt-1">${p.type === 'weekly' ? '每周任务' : '每日任务'}</span>
                                      </div>
                                      <div class="flex items-center space-x-2 shrink-0">
                                          <i data-lucide="edit-3" class="w-4 h-4 text-gray-400 hover:text-gray-800 cursor-pointer active:scale-90" onclick="window.cpActions.editAiGeneratedPlan(${idx})"></i>
                                          <i data-lucide="trash-2" class="w-4 h-4 text-gray-400 hover:text-red-400 cursor-pointer active:scale-90" onclick="window.cpActions.deleteAiGeneratedPlan(${idx})"></i>
                                      </div>
                                  </div>
                              `).join('')}
                          </div>
                          ` : ''}

                          ${cpState.aiGeneratedPlans && cpState.aiGeneratedPlans.length > 0 && !cpState.isGeneratingGrowth ? `
                              <button onclick="window.cpActions.saveAiGeneratedPlans('${char.id}')" class="w-full py-3.5 mt-4 bg-orange-500 text-white font-black rounded-[16px] active:scale-95 transition-transform tracking-widest text-[14px] shadow-md shadow-orange-200 shrink-0">保存这些计划</button>
                          ` : ''}
                      `}
                  </div>
              </div>
          </div>
          ` : ''}
      </div>
      `;
    }

  // 🌟 界面 6：默契问答
  if (cpState.view === 'tacit') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const chat = store.chats.find(c => c.charId === char.id);
        const myAvatar = chat?.myAvatar || (store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0]).avatar;

        store.coupleSpacesData = store.coupleSpacesData || {};
        const spaceData = store.coupleSpacesData[char.id] || {};
        const tStatus = spaceData.tacitStatus || 'loading';
        const tData = spaceData.currentTacit || {};
        const tChat = spaceData.tacitChat || [];

        // 🌟 上半屏：答题区 (图标按钮 + 红心对齐)
        let topAreaHtml = '';
        if (tStatus === 'loading') {
            topAreaHtml = `<div class="flex-1 flex flex-col items-center justify-center py-10 opacity-70"><i data-lucide="loader-2" class="w-8 h-8 animate-spin text-purple-400 mb-3"></i><span class="text-[14px] font-bold text-purple-500">系统正在出题...</span></div>`;
        } else if (tStatus === 'error') {
            topAreaHtml = `<div class="flex-1 flex flex-col items-center justify-center py-10 opacity-70"><i data-lucide="alert-circle" class="w-8 h-8 text-red-400 mb-3"></i><span class="text-[14px] font-bold text-red-400 cursor-pointer" onclick="window.cpActions.fetchTacitQ('${char.id}')">出题失败，点击重试</span></div>`;
        } else {
            topAreaHtml = `
            <div class="flex flex-col items-center pt-2 pb-4 w-full px-6">
                <div class="bg-purple-50 text-purple-600 text-[10px] font-black px-3 py-1 rounded-full tracking-widest uppercase mb-4 shadow-sm border border-purple-100">题目</div>
                <div class="text-[17px] font-black text-gray-800 text-center leading-relaxed mb-6">${tData.question}</div>
                
                ${tStatus === 'answering' ? `
                    <div class="w-full relative">
                        <input id="tacit-ans-input" type="text" class="w-full bg-gray-50 border border-gray-100 rounded-[16px] pl-5 pr-14 py-4 outline-none text-[15px] font-medium text-gray-800 focus:bg-purple-50/30 focus:border-purple-200 transition-all text-center shadow-inner" onkeydown="if(event.key==='Enter'){event.preventDefault();window.cpActions.submitTacitAns('${char.id}')}" placeholder="写下你的答案...">
                        <button onclick="window.cpActions.submitTacitAns('${char.id}')" class="absolute right-2 top-2 bottom-2 w-10 bg-purple-200 text-white rounded-full flex items-center justify-center hover:bg-purple-400 active:scale-95 transition-transform shadow-md"><i data-lucide="check" class="w-5 h-5"></i></button>
                    </div>
                ` : `
                    <div class="w-full flex items-center justify-between space-x-4">
                        <div class="flex-1 flex flex-col items-center bg-rose-50/50 border border-rose-100 rounded-[16px] p-4 relative shadow-sm">
                            <img src="${myAvatar}" class="w-8 h-8 rounded-full border-2 border-white absolute -top-4 shadow-sm">
                            <span class="text-[14px] font-bold text-gray-800 mt-2 text-center">${tData.userAns}</span>
                        </div>
                        <div class="flex flex-col items-center justify-center shrink-0">
                            <i data-lucide="heart" class="w-6 h-6 text-pink-400 fill-pink-100 animate-pulse"></i>
                        </div>
                        <div class="flex-1 flex flex-col items-center bg-blue-50/50 border border-blue-100 rounded-[16px] p-4 relative shadow-sm">
                            <img src="${char.avatar}" class="w-8 h-8 rounded-full border-2 border-white absolute -top-4 shadow-sm">
                            <span class="text-[14px] font-bold text-gray-800 mt-2 text-center">${tData.aiAns}</span>
                        </div>
                    </div>
                `}
            </div>`;
        }

        // 🌟 寻找讨论区最后一句 AI 的话，用来挂载重 Roll 键
        let lastAiIdx = -1;
        for (let i = tChat.length - 1; i >= 0; i--) {
            if (!tChat[i].isMe && tChat[i].msgType === 'text') { lastAiIdx = i; break; }
        }

        // 🌟 下半屏：讨论区渲染 (带 Loading 与 重Roll)
        let chatHtml = tChat.map((m, idx) => {
            if (m.msgType === 'system') {
                return `<div class="flex justify-center my-4"><div class="bg-black/5 text-gray-400 text-[11px] font-bold px-4 py-2 rounded-full text-center whitespace-pre-wrap leading-relaxed max-w-[80%]">${m.text}</div></div>`;
            } else if (m.msgType === 'loading') {
                return `<div class="flex justify-start my-3 pr-12"><div class="bg-blue-100/60 text-blue-500 px-4 py-2.5 rounded-[18px] rounded-tl-sm shadow-sm flex items-center space-x-1.5"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span class="text-[12px] font-bold">正在输入...</span></div></div>`;
            } else if (m.isMe) {
                return `<div class="flex justify-end my-3 pl-12"><div class="bg-rose-100 text-gray-800 text-[14px] font-medium px-4 py-2.5 rounded-[18px] rounded-tr-sm shadow-sm break-words">${m.text}</div></div>`;
            } else {
                let rerollBtn = (idx === lastAiIdx) ? `<div class="flex flex-col justify-end ml-1.5 opacity-80 transition-opacity"><i data-lucide="refresh-cw" class="w-4 h-4 text-gray-400 hover:text-blue-500 cursor-pointer active:scale-90" onclick="window.cpActions.rerollTacitMsg('${char.id}')"></i></div>` : '';
                return `<div class="flex justify-start my-3 pr-12 items-end"><div class="bg-blue-100 text-gray-800 text-[14px] font-medium px-4 py-2.5 rounded-[18px] rounded-tl-sm shadow-sm break-words">${m.text}</div>${rerollBtn}</div>`;
            }
        }).join('');

        return `
        <div class="w-full h-full flex flex-col bg-transparent relative animate-in fade-in slide-in-from-right-4 duration-300">
            <div class="w-full bg-[#fcfcfc] shrink-0 flex flex-col shadow-[0_10px_30px_-15px_rgba(0,0,0,0.1)] z-20 rounded-b-[32px] relative">
                <div class="pt-8 pb-3 px-4 flex items-center justify-between">
                    <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
                    <span class="text-lg font-extrabold text-gray-800 tracking-wide">默契问答</span>
                    <div class="cursor-pointer active:scale-90 p-1 -mr-1" title="换一题 (将清空讨论)" onclick="window.cpActions.fetchTacitQ('${char.id}')"><i data-lucide="refresh-cw" class="w-6 h-6 text-gray-800"></i></div>
                </div>
                <div class="pb-6 pt-2 transition-all duration-300">
                    ${topAreaHtml}
                </div>
            </div>

            <div class="flex-1 flex flex-col overflow-hidden relative z-10">
                ${tStatus !== 'revealed' ? `
                    <div class="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center opacity-80">
                        <i data-lucide="lock" class="w-10 h-10 text-gray-300 mb-3"></i>
                        <span class="text-[13px] font-black text-gray-400 tracking-widest uppercase">答题期间禁止讨论</span>
                    </div>
                ` : ''}
                
                <div id="cp-tacit-chat-scroll" class="flex-1 overflow-y-auto p-5 hide-scrollbar">
                    ${chatHtml}
                </div>
                
                <div class="flex p-4 bg-gray-50 backdrop-blur-md border-t border-gray-100/50 shrink-0">
                    <div class="flex-1 bg-white rounded-[20px] flex items-center border border-gray-200/60 px-2 py-0.5">
                        <input id="tacit-chat-input" type="text" class="flex-1 h-[38px] py-1.5 px-2 outline-none text-[15px] bg-transparent text-gray-800 placeholder-gray-400" onkeydown="if(event.key==='Enter'){event.preventDefault();window.cpActions.sendTacitMsg('${char.id}')}" placeholder="吐槽点什么..." ${tStatus !== 'revealed' ? 'disabled' : ''}>
                    </div>
                    <button onclick="window.cpActions.requestTacitReply('${char.id}')" class="w-[60px] h-[40px] flex items-center justify-center bg-transperant rounded-full text-gray-500 active:scale-90 transition-transform flex-shrink-0 ${tStatus !== 'revealed' ? 'opacity-50' : ''}" ${tStatus !== 'revealed' ? 'disabled' : ''} title="获取 TA 的回复">
                        <i data-lucide="sparkles" class="w-7 h-7 ml-1"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
  }

  //界面 7：100件小事 & 100个故事
  if (cpState.view === 'hundredThings') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const spaceData = store.coupleSpacesData[char.id] || {};
        const things = spaceData.hundredThings || [];
        
        // 🌟 终极排序引擎：进行中(1) -> 去完成(0) -> 已完成(2 沉底)
        const sortedThings = [...things].sort((a, b) => {
            const getWeight = s => s === 1 ? 0 : s === 0 ? 1 : 2;
            return getWeight(a.status) - getWeight(b.status);
        });

        return `
        <div class="w-full h-full flex flex-col bg-[#fcfcfc] relative animate-in fade-in slide-in-from-right-4 duration-300">
            <div class="pt-8 pb-3 px-4 shrink-0 flex items-center justify-between bg-[#fcfcfc]/90 backdrop-blur-md sticky top-0 z-20 shadow-sm border-b border-gray-100">
                <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
                <span class="text-lg font-extrabold text-gray-800 tracking-wide">100件小事</span>
                <div class="w-8"></div>
            </div>

            <div id="cp-hundred-scroll" class="flex-1 overflow-y-auto p-5 pb-24 hide-scrollbar scroll-smooth relative">
                
                <div class="flex items-center bg-white rounded-[20px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] border border-rose-50 mb-6 focus-within:border-rose-200 transition-all overflow-hidden pl-5 pr-1.5 py-1.5">
                    <input id="new-thing-input" type="text" class="flex-1 bg-transparent border-none outline-none text-[15px] font-medium text-gray-800 placeholder-gray-300 h-10" onkeydown="if(event.key==='Enter'){event.preventDefault();window.cpActions.addHundredThing('${char.id}')}" placeholder="写下一件想和 TA 一起做的事...">
                    <button onclick="window.cpActions.addHundredThing('${char.id}')" class="w-10 h-10 rounded-full flex items-center justify-center text-rose-400 hover:bg-rose-50 active:scale-90 transition-all shrink-0"><i data-lucide="plus" class="w-6 h-6"></i></button>
                </div>

                <div class="space-y-3">
                    ${sortedThings.map((t, idx) => {
                        let statusHtml = '';
                        if (t.status === 1) statusHtml = '<span class="text-[12px] font-bold text-amber-500 mr-1.5 tracking-widest">进行中</span><i data-lucide="loader-2" class="w-4 h-4 text-amber-500 animate-spin"></i>';
                        else if (t.status === 2) statusHtml = '<span class="text-[12px] font-bold text-rose-400 mr-1.5 tracking-widest">已完成</span><i data-lucide="heart" class="w-4 h-4 fill-rose-300 text-rose-300"></i>';
                        else statusHtml = '<span class="text-[12px] font-bold text-gray-400 mr-1 tracking-widest">去完成</span><i data-lucide="chevron-right" class="w-4 h-4 text-gray-400"></i>';
                        return `
                        <div class="group flex items-center justify-between bg-white p-4 rounded-[20px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-50 cursor-pointer active:scale-[0.98] transition-all hover:shadow-md" onclick="window.cpActions.openHundredStory('${char.id}', '${t.id}')">
                            <div class="flex items-center space-x-4 overflow-hidden">
                                <span class="text-[16px] font-black text-gray-300 italic w-6 shrink-0">${idx + 1}</span>
                                <span class="text-[15px] font-bold ${t.status === 2 ? 'text-gray-400 line-through' : 'text-gray-800'} truncate">${t.title}</span>
                            </div>
                            <div class="shrink-0 ml-3 flex items-center justify-center h-8 transition-all pointer-events-none">${statusHtml}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            
            <div class="absolute bottom-28 right-4 flex flex-col space-y-3 z-30">
                <button onclick="document.getElementById('cp-hundred-scroll').scrollTo({top: 0, behavior: 'smooth'})" class="w-10 h-10 bg-white/80 backdrop-blur border border-gray-100 shadow-lg rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-90 transition-all"><i data-lucide="arrow-up" class="w-5 h-5"></i></button>
                <button onclick="const el=document.getElementById('cp-hundred-scroll'); el.scrollTo({top: el.scrollHeight, behavior: 'smooth'})" class="w-10 h-10 bg-white/80 backdrop-blur border border-gray-100 shadow-lg rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-90 transition-all"><i data-lucide="arrow-down" class="w-5 h-5"></i></button>
            </div>
        `;
    } else if (cpState.view === 'hundredStory') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const chat = store.chats.find(c => c.charId === char.id);
        const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas[0];
        const spaceData = store.coupleSpacesData[char.id] || {};
        const target = spaceData.hundredThings.find(t => t.id === cpState.activeThingId);
        
        const bgUrl = spaceData.hundredBg || '';
        const dialogueColor = spaceData.hundredDialogueColor || '#d4b856';
        const thoughtColor = spaceData.hundredThoughtColor || '#9ca3af';
        // 🌟 不管有没有背景图，旁白统统强制使用深灰色！
        const descColor = '#374151'; 

        let storyHtml = target.messages.map(msg => {
            let nameStr = msg.isMe ? boundPersona.name : char.name;
            // 移除 think 标签
let cleanText = msg.text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
let preProcessedText = cleanText
    .replace(/(『[^』]*』)/g, '\n$1\n')
    .replace(/(「[^」]*」)/g, '\n$1\n')
    .replace(/[（(]([^）)]*)[）)]/g, '\n（$1）\n');
            let formattedLines = preProcessedText.split('\n').filter(l=>l.trim()).map(l => {
                let line = l.trim();
                if (line.startsWith('『') && line.endsWith('』')) return `<p class="cp-story-dialogue my-1.5 leading-relaxed text-[#d4b856]">${line}</p>`; 
                else if (line.startsWith('（') && line.endsWith('）')) return `<p class="cp-story-thought my-1.5 leading-relaxed text-[#9ca3af]">${line.slice(1, -1)}</p>`; 
                else return `<p class="cp-story-desc my-1.5 leading-relaxed text-gray-800">${line}</p>`; 
            }).join('');

            return `
            <div class="flex justify-center my-4 w-full">
                <div class="cp-story-user-msg w-full bg-white/60 backdrop-blur-md border border-gray-100/50 rounded-[14px] p-5 relative flex flex-col shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <div class="mb-3 text-[12px] font-black tracking-widest text-gray-400">${nameStr}</div>
                    <div class="text-[15px] text-gray-800 leading-relaxed font-serif text-justify pb-6">${formattedLines}</div>
                    <div class="absolute bottom-3 right-4 flex items-center space-x-3.5 opacity-80 transition-opacity">
                        ${!msg.isMe ? `<i data-lucide="refresh-cw" class="w-4 h-4 cursor-pointer active:scale-90 text-gray-500" onclick="window.cpActions.rerollHundredMsg('${char.id}', ${msg.id})" title="重摇"></i>` : ''}
                        <i data-lucide="edit-3" class="w-4 h-4 cursor-pointer active:scale-90 text-gray-500" onclick="window.cpActions.openEditHundredMsg('${char.id}', ${msg.id})" title="编辑"></i>
                        <i data-lucide="trash-2" class="w-4 h-4 cursor-pointer active:scale-90 text-red-400" onclick="window.cpActions.deleteHundredMsg('${char.id}', ${msg.id})" title="删除"></i>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="cp-story-container w-full h-full flex flex-col relative font-serif z-[60] animate-in slide-in-from-bottom-4 duration-300" style="background: ${bgUrl ? `url('${bgUrl}') center/cover no-repeat` : '#fcfcfc'} !important;">
            <style>.cp-story-dialogue { color: ${dialogueColor}; } .cp-story-thought { color: ${thoughtColor}; } .cp-story-desc { color: ${descColor}; } ${spaceData.hundredCSS || ''}</style>
            
            ${bgUrl ? `<div class="absolute inset-0 bg-white/50 backdrop-blur-[3px] z-0 pointer-events-none"></div>` : ''}
            
            <div class="cp-story-topbar bg-white/80 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between z-10 sticky top-0 border-b border-gray-100 shadow-sm">
                 <div class="flex items-center cursor-pointer text-gray-800 active:opacity-50" onclick="window.cpActions.attemptExitHundredStory('${char.id}')"><i data-lucide="chevron-down" class="w-8 h-8"></i></div>
                 <span class="cp-story-title flex-1 text-center font-bold text-[16px] tracking-widest text-gray-800 truncate px-4">${target.isTyping ? '正在构思...' : target.title}</span>
                 <div class="flex justify-end cursor-pointer active:scale-90 text-gray-800" onclick="window.cpActions.openHundredSettings()"><i data-lucide="settings" class="w-6 h-6"></i></div>
            </div>
            
            <div id="cp-story-scroll" class="cp-story-scroll flex-1 p-5 overflow-y-auto hide-scrollbar flex flex-col pb-6 z-10">
                <div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 番外篇 · 开始 ——</div>
                ${storyHtml}
                ${target.status === 2 ? `<div class="text-center text-xs text-rose-400 italic my-8 tracking-widest font-bold">—— 该小事已封存为浪漫回忆 ——</div>` : ''}
            </div>
            
            <div class="cp-story-bottombar bg-white/80 backdrop-blur-md px-4 py-3 pb-8 border-t border-gray-100 flex flex-col shadow-2xl z-20 relative">
                <div class="relative w-full bg-white/80 border border-gray-200 focus-within:bg-white rounded-[16px] p-1 flex items-end transition-all shadow-inner">
                    <textarea id="story-chat-input" placeholder="${target.status === 2 ? '记忆已封存...' : '描写你的动作或对话...'}" class="flex-1 min-h-[80px] max-h-[150px] bg-transparent text-gray-800 placeholder-gray-400 p-3 outline-none text-[15px] resize-none font-serif leading-relaxed hide-scrollbar" ${target.isTyping || target.status === 2 ? 'disabled' : ''}></textarea>
                    <div class="flex flex-col items-center justify-end pb-2 pr-2 space-y-3 shrink-0">
                        <button onclick="window.cpActions.continueHundredStory('${char.id}')" class="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 active:scale-90 transition-all ${(target.isTyping || target.status === 2) ? 'opacity-30' : ''}" ${(target.isTyping || target.status === 2) ? 'disabled' : ''} title="让AI接着往下写"><i data-lucide="feather" class="w-5 h-5"></i></button>
                        <button onclick="window.cpActions.sendHundredStoryMsg('${char.id}')" class="w-9 h-9 flex items-center justify-center text-gray-800 active:scale-90 transition-all ${(target.isTyping || target.status === 2) ? 'opacity-30' : ''}" ${(target.isTyping || target.status === 2) ? 'disabled' : ''} title="发送"><i data-lucide="send" class="w-5 h-5 -ml-0.5"></i></button>
                    </div>
                </div>
            </div>
            
            ${cpState.showHundredExitModal ? `
            <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.confirmExitHundredStory('${char.id}', 'leave')">
                <div style="background: #fcfcfc !important;" class="w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                    <div class="p-8 flex flex-col items-center text-center">
                        <div class="w-16 h-16 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center mb-5 shadow-inner"><i data-lucide="heart" class="w-8 h-8 fill-rose-300"></i></div>
                        <span class="text-[18px] font-black text-gray-800 mb-2 tracking-wide">这件小事做完了吗？</span>
                        <span class="text-[12px] font-bold text-gray-400 mb-8 leading-relaxed px-4">如果标记为已完成，这段美好的记忆将被永久封存提取，无法再继续往下写。</span>
                        <div class="flex w-full space-x-3">
                            <button onclick="window.cpActions.confirmExitHundredStory('${char.id}', 'leave')" class="flex-1 py-3.5 bg-gray-100 text-gray-600 font-bold rounded-[14px] active:scale-95 transition-all text-[14px]">暂离 (下次继续)</button>
                            <button onclick="window.cpActions.confirmExitHundredStory('${char.id}', 'finish')" class="flex-1 py-3.5 bg-rose-400 text-white font-bold rounded-[14px] active:scale-95 transition-all shadow-md text-[14px]">已完成</button>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            ${cpState.showHundredEditModal ? `
            <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.closeEditHundredMsg()">
                 <div style="background: #fcfcfc !important;" class="w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                     <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white"><span class="font-bold text-gray-800 text-[16px]">编辑剧情内容</span></div>
                     <div class="p-6 flex flex-col space-y-2">
                         <textarea id="hundred-edit-textarea" class="w-full h-48 bg-white border border-gray-200 rounded-[16px] p-5 outline-none text-[15px] text-gray-800 shadow-sm resize-none hide-scrollbar leading-relaxed font-serif">${target.messages.find(m => m.id === cpState.editingHundredMsgId)?.text || ''}</textarea>
                         <button onclick="window.cpActions.saveEditHundredMsg('${char.id}')" class="w-full py-4 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform mt-2 tracking-widest text-[14px]">确认修改</button>
                     </div>
                 </div>
             </div>
            ` : ''}

            ${cpState.showHundredSettingsModal ? `
             <div class="absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm p-4 pb-8" onclick="window.cpActions.closeHundredSettings()">
                <div class="bg-[#fcfcfc] w-full max-h-[75vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                   <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm shrink-0">
                      <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="settings" class="text-gray-800 mr-2 w-5 h-5"></i>副本专属设置</span>
                      <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.cpActions.closeHundredSettings()"></i>
                   </div>
                   <div class="flex-1 overflow-y-auto p-5 space-y-6 hide-scrollbar">
                      <div>
                         <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="image" class="w-4 h-4 mr-1 text-green-500"></i>副本背景图 (留空则为默认白底)</span>
                         <div class="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
                            <div class="flex items-center space-x-3"><div class="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center relative cursor-pointer" onclick="document.getElementById('hundred-bg-upload').click()">${bgUrl ? `<img src="${bgUrl}" class="w-full h-full object-cover">` : `<i data-lucide="plus" class="text-gray-400"></i>`}</div><span class="text-[12px] font-bold text-gray-600">${bgUrl ? '已设置专属背景' : '默认纯白背景'}</span></div>
                            <div class="flex space-x-2">
                               ${bgUrl ? `<button onclick="window.cpActions.clearHundredBg('${char.id}')" class="px-3 py-1.5 bg-red-50 text-red-500 text-[11px] font-bold rounded-lg">清除</button>` : ''}
                               <button onclick="document.getElementById('hundred-bg-upload').click()" class="px-3 py-1.5 bg-gray-800 text-white text-[11px] font-bold rounded-lg">上传</button>
                               <input type="file" id="hundred-bg-upload" accept="image/*" class="hidden" onchange="window.cpActions.handleHundredBgUpload('${char.id}', event)">
                            </div>
                         </div>
                      </div>
                      <div>
                         <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="palette" class="w-4 h-4 mr-1 text-orange-500"></i>文本解析颜色</span>
                         <div class="grid grid-cols-2 gap-3">
                            <div class="bg-white border border-gray-100 p-3 rounded-xl flex items-center justify-between shadow-sm"><span class="text-[12px] font-bold text-gray-700">人物对话</span><input type="color" value="${dialogueColor}" onchange="window.cpActions.updateHundredTextColor('${char.id}', 'dialogue', this.value)" class="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"></div>
                            <div class="bg-white border border-gray-100 p-3 rounded-xl flex items-center justify-between shadow-sm"><span class="text-[12px] font-bold text-gray-700">内心想法</span><input type="color" value="${thoughtColor}" onchange="window.cpActions.updateHundredTextColor('${char.id}', 'thought', this.value)" class="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"></div>
                         </div>
                      </div>
                      <div>
                         <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="code" class="w-4 h-4 mr-1 text-blue-500"></i>CSS 界面美化</span>
                         <textarea id="set-hundred-css" rows="6" class="w-full bg-white border border-gray-200 rounded-xl p-3 outline-none text-[12px] font-mono resize-none hide-scrollbar shadow-inner leading-relaxed" placeholder="可用语义化标签：\n.cp-story-container\n.cp-story-topbar\n.cp-story-title\n.cp-story-scroll\n.cp-story-dialogue\n.cp-story-thought\n.cp-story-desc\n.cp-story-user-msg\n.cp-story-bottombar">${spaceData.hundredCSS || ''}</textarea>
                      </div>
                   </div>
                   <div class="p-4 bg-white border-t border-gray-100 shrink-0"><button onclick="window.cpActions.saveHundredSettings('${char.id}')" class="w-full py-3.5 bg-gray-800 text-white font-bold rounded-[14px] active:scale-95 transition-transform shadow-md">保存并应用</button></div>
                </div>
             </div>
            ` : ''}
        </div>
        `;
  }

  //界面 8：真心话大冒险
  if (cpState.view === 'tod') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const spaceData = store.coupleSpacesData[char.id] || {};
        const tod = spaceData.currentToD;
        const chat = spaceData.todChat || [];
        // 🌟 读取专属头像和马甲
        const ctx = window.cpActions.getQContext(char.id);
        const myAvatar = ctx.myAvatar;
        const myName = ctx.boundP.name;

        let topAreaHtml = '';
        if (spaceData.todLoading) topAreaHtml = `<div class="flex-1 flex flex-col items-center justify-center py-10 opacity-70"><i data-lucide="loader-2" class="w-8 h-8 animate-spin text-pink-400 mb-3"></i><span class="text-[14px] font-bold text-pink-500">正在疯狂发牌...</span></div>`;
        else if (!tod) topAreaHtml = `<div class="flex-1 flex flex-col items-center justify-center py-10 opacity-70 cursor-pointer group" onclick="window.cpActions.nextToDRound('${char.id}')"><i data-lucide="dice-5" class="w-10 h-10 text-pink-300 mb-3 group-active:scale-95 transition-transform"></i><span class="text-[14px] font-bold text-gray-400">点击右上角骰子开启冒险</span></div>`;
        else {
            const isTruth = tod.type === 'truth';
            const cardBg = isTruth ? 'from-blue-50 to-cyan-50 border-blue-100' : 'from-pink-50 to-rose-100 border-pink-100';
            const textColor = isTruth ? 'text-blue-500' : 'text-rose-500';
            const titleStr = isTruth ? '真心话' : '大冒险';

            topAreaHtml = `
            <div class="flex flex-col items-center pt-2 pb-4 w-full px-6 animate-in fade-in">
                <div class="text-[11px] font-black ${tod.loser === 'ai' ? 'text-blue-500 bg-blue-50' : 'text-rose-500 bg-rose-50'} px-3 py-1 rounded-full mb-4 shadow-inner border border-rose-100">${tod.loser === 'ai' ? `${char.name} 输了！` : '你输了！'}</div>
                <div class="bg-gradient-to-br ${cardBg} p-5 rounded-[24px] shadow-lg border flex flex-col items-left w-full mb-2">
                    <span class="text-[16px] font-black ${textColor} tracking-widest">${titleStr}</span>
                    <div class="w-4/5 h-px bg-gray-300 my-3 rounded-full opacity-30"></div>
                    <div class="text-[16px] font-extrabold text-gray-800 text-center leading-relaxed font-serif">${tod.content}</div>
                </div>
            </div>`;
        }

        // 🌟 1:1 复刻默契问答聊天区（带 Loading 和 专属头像）
        let chatHtml = chat.map((m) => {
            if (m.msgType === 'loading') {
                return `<div class="flex justify-start my-3 pr-12 w-full"><div class="bg-blue-100/60 text-blue-500 px-4 py-2.5 rounded-[18px] rounded-tl-sm shadow-sm flex items-center space-x-1.5"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span class="text-[12px] font-bold">TA 正在输入...</span></div></div>`;
            } else if (m.sender === 'me') {
                return `<div class="flex justify-end my-3 pl-12 w-full"><div class="bg-rose-100 text-gray-800 text-[14px] font-medium px-4 py-2.5 rounded-[18px] rounded-tr-sm shadow-sm break-words relative"><img src="${myAvatar}" class="w-6 h-6 rounded-full absolute -right-8 top-0 border border-rose-200">${m.text}</div></div>`;
            } else {
                return `<div class="flex justify-start my-3 pr-12 w-full"><div class="bg-blue-100 text-gray-800 text-[14px] font-medium px-4 py-2.5 rounded-[18px] rounded-tl-sm shadow-sm break-words relative"><img src="${char.avatar}" class="w-6 h-6 rounded-full absolute -left-8 top-0 border border-blue-200">${m.text}</div></div>`;
            }
        }).join('');

        return `
        <div class="w-full h-full flex flex-col bg-[#fcfcfc] relative animate-in fade-in slide-in-from-right-4 duration-300">
            <div class="w-full shrink-0 flex flex-col shadow-sm z-20 rounded-b-[32px] relative" style="background: #ffffff !important;">
                <div class="pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-100 sticky top-0">
                    <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')"><i data-lucide="chevron-left" class="w-7 h-7 text-gray-800"></i></div>
                    <span class="text-[16px] font-extrabold text-gray-800 tracking-wider">真心话大冒险</span>
                    <div class="flex items-center space-x-3 -mr-1">
                        <div class="cursor-pointer active:scale-90 p-1" onclick="window.cpActions.resetToD('${char.id}')" title="重置/洗牌记录">
                            <i data-lucide="rotate-ccw" class="w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors"></i>
                        </div>
                        <div class="cursor-pointer active:scale-90 p-1" onclick="window.cpActions.nextToDRound('${char.id}')" title="掷骰子开启下一轮">
                            <i data-lucide="dice-5" class="w-6 h-6 text-pink-400 hover:text-pink-500 transition-colors"></i>
                        </div>
                    </div>
                </div>
                <div class="pb-6 pt-2">${topAreaHtml}</div>
            </div>

            <div id="cp-tod-scroll" class="flex-1 overflow-y-auto p-5 pb-24 hide-scrollbar relative z-10 scroll-smooth">
                <div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 真心话讨论区 ——</div>
                <div class="space-y-4 px-6">${chatHtml}</div>
                ${tod && tod.type === 'dare' ? `<div class="flex justify-center my-6"><div onclick="window.cpActions.openDareStory('${char.id}')" class="px-6 py-3 bg-rose-400 text-white font-black rounded-full flex items-center space-x-2 shadow-lg active:scale-95 transition-all cursor-pointer"><i data-lucide="flame" class="w-4 h-4"></i><span class="text-[13px]">去完成大冒险副本</span></div></div>` : ''}
            </div>

            <div class="flex p-4 bg-gray-50 backdrop-blur-md border-t border-gray-100/50 shrink-0 absolute bottom-0 left-0 right-0 z-20">
                <div class="flex-1 bg-white rounded-[20px] flex items-center border border-gray-200/60 px-2 py-0.5">
                    <input id="tod-chat-input" type="text" class="flex-1 h-[38px] py-1.5 px-2 outline-none text-[15px] bg-transparent text-gray-800 placeholder-gray-400" onkeydown="if(event.key==='Enter'){event.preventDefault();window.cpActions.sendToDMsg('${char.id}')}" placeholder="吐槽点什么..." ${!tod || spaceData.todLoading ? 'disabled' : ''}>
                </div>
                <button onclick="window.cpActions.requestToDReply('${char.id}')" class="w-[60px] h-[40px] flex items-center justify-center bg-transparent rounded-full text-gray-500 active:scale-90 transition-transform flex-shrink-0 ${(!tod || spaceData.todLoading) ? 'opacity-50' : ''}" ${(!tod || spaceData.todLoading) ? 'disabled' : ''} title="获取 TA 的回复">
                    <i data-lucide="sparkles" class="w-7 h-7 ml-1"></i>
                </button>
            </div>
        </div>
        `;

    } else if (cpState.view === 'dareStory') {
        const char = store.contacts.find(c => c.id === cpState.activeCharId);
        const spaceData = store.coupleSpacesData[char.id] || {};
        const tod = spaceData.currentToD;
        const bgUrl = spaceData.hundredBg || ''; 
        const ctx = window.cpActions.getQContext(char.id);

        // 🌟 正则替换：严格解析『』包裹的对话
        let storyHtml = tod.messages.map(msg => {
            let nameStr = msg.sender === 'me' ? ctx.boundP.name : char.name;
            // 移除 think 标签
let cleanText = msg.text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
let preProcessedText = cleanText
    .replace(/(『[^』]*』)/g, '\n$1\n')
    .replace(/(「[^」]*」)/g, '\n$1\n')
    .replace(/[（(]([^）)]*)[）)]/g, '\n（$1）\n');
            let formattedLines = preProcessedText.split('\n').filter(l=>l.trim()).map(l => {
                let line = l.trim();
                if (line.startsWith('『') && line.endsWith('』')) return `<p class="cp-story-dialogue my-1.5 leading-relaxed text-[#d4b856]">${line}</p>`; 
                else if (line.startsWith('（') && line.endsWith('）')) return `<p class="cp-story-thought my-1.5 leading-relaxed text-[#9ca3af]">${line.slice(1, -1)}</p>`; 
                else return `<p class="cp-story-desc my-1.5 leading-relaxed text-gray-800">${line}</p>`; 
            }).join('');

            return `
            <div class="flex justify-center my-4 w-full relative group">
                <div class="cp-story-user-msg w-full bg-white/60 backdrop-blur-md border border-gray-100/50 rounded-[14px] p-5 relative flex flex-col shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <div class="mb-3 text-[12px] font-black tracking-widest text-gray-400">${nameStr}</div>
                    <div class="text-[15px] text-gray-800 leading-relaxed font-serif text-justify pb-6">${formattedLines}</div>
                    <div class="absolute bottom-3 right-4 flex items-center space-x-3.5 opacity-80 transition-opacity">
                        ${!msg.isMe ? `<i data-lucide="refresh-cw" class="w-4 h-4 cursor-pointer active:scale-90 text-gray-500" onclick="window.cpActions.rerollDareMsg('${char.id}', ${msg.id})" title="重摇"></i>` : ''}
                        <i data-lucide="edit-3" class="w-4 h-4 cursor-pointer active:scale-90 text-gray-500" onclick="window.cpActions.openEditDareMsg('${char.id}', ${msg.id})" title="编辑"></i>
                        <i data-lucide="trash-2" class="w-4 h-4 cursor-pointer active:scale-90 text-red-400" onclick="window.cpActions.deleteDareMsg('${char.id}', ${msg.id})" title="删除"></i>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="cp-story-container w-full h-full flex flex-col relative font-serif z-[60] animate-in slide-in-from-bottom-4 duration-300" style="background: ${bgUrl ? `url('${bgUrl}') center/cover no-repeat` : '#fcfcfc'} !important;">
            ${bgUrl ? `<div class="absolute inset-0 bg-white/50 backdrop-blur-[3px] z-0 pointer-events-none"></div>` : ''}
            <div class="cp-story-topbar bg-white/80 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between z-10 sticky top-0 border-b border-gray-100 shadow-sm">
                 <div class="flex items-center cursor-pointer text-gray-800 active:opacity-50" onclick="window.cpActions.openToD('${char.id}')"><i data-lucide="chevron-down" class="w-7 h-7"></i></div>
                 <span class="cp-story-title flex-1 text-center font-bold text-[16px] tracking-widest text-gray-800 truncate px-4">${tod.isTyping ? '构思剧情...' : '大冒险副本'}</span>
                 <div class="flex justify-end cursor-pointer active:scale-90 text-gray-800" onclick="window.cpActions.openHundredSettings()"><i data-lucide="settings" class="w-6 h-6"></i></div>
            </div>
            
            <div id="cp-dare-scroll" class="cp-story-scroll flex-1 p-5 overflow-y-auto hide-scrollbar flex flex-col pb-6 z-10 relative scroll-smooth">
                <div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 惩罚开始 ——</div>
                <div class="bg-gradient-to-br from-pink-50 to-rose-100 p-6 rounded-[20px] shadow-lg border border-pink-100 flex flex-col items-center w-full mb-8 relative z-20">
                    <span class="text-[10px] font-black text-rose-300 absolute -top-2 left-6 bg-white px-2">惩罚任务</span>
                    <div class="text-[16px] font-black text-rose-900 text-center leading-relaxed font-serif">${tod.content}</div>
                </div>
                ${storyHtml}
            </div>
            
            <div class="cp-story-bottombar bg-white/80 backdrop-blur-md px-4 py-3 pb-8 border-t border-gray-100 flex flex-col shadow-2xl z-20 relative">
                <div class="relative w-full bg-white/80 border border-gray-200 focus-within:bg-white rounded-[16px] p-1 flex items-end transition-all shadow-inner">
                    <textarea id="dare-chat-input" placeholder="描写动作..." class="flex-1 min-h-[80px] max-h-[150px] bg-transparent text-gray-800 p-3 outline-none text-[15px] resize-none font-serif hide-scrollbar" ${tod.isTyping ? 'disabled' : ''}></textarea>
                    <div class="flex flex-col items-center justify-end pb-2 pr-2 space-y-3 shrink-0">
                        <button onclick="window.cpActions.continueDareStory('${char.id}')" class="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 active:scale-90 transition-all ${tod.isTyping ? 'opacity-30' : ''}" ${tod.isTyping ? 'disabled' : ''} title="让AI接着往下写"><i data-lucide="feather" class="w-5 h-5"></i></button>
                        <button onclick="window.cpActions.sendDareMsg('${char.id}')" class="w-9 h-9 flex items-center justify-center text-gray-800 active:scale-90 transition-all ${tod.isTyping ? 'opacity-30' : ''}" ${tod.isTyping ? 'disabled' : ''} title="发送"><i data-lucide="send" class="w-5 h-5 -ml-0.5"></i></button>
                    </div>
                </div>
            </div>

            ${cpState.showDareEditModal ? `
            <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in" onclick="window.cpActions.closeEditDareMsg()">
                 <div style="background: #fcfcfc !important;" class="w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                     <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white"><span class="font-bold text-gray-800 text-[16px]">编辑剧情内容</span></div>
                     <div class="p-6 flex flex-col space-y-2">
                         <textarea id="dare-edit-textarea" class="w-full h-48 bg-white border border-gray-200 rounded-[16px] p-5 outline-none text-[15px] text-gray-800 shadow-sm resize-none hide-scrollbar leading-relaxed font-serif">${tod.messages.find(m => m.id === cpState.editingDareMsgId)?.text || ''}</textarea>
                         <button onclick="window.cpActions.saveEditDareMsg('${char.id}')" class="w-full py-4 bg-gray-900 text-white font-extrabold rounded-[16px] active:scale-95 transition-transform mt-2 tracking-widest text-[14px]">确认修改</button>
                     </div>
                 </div>
             </div>
            ` : ''}
        </div>
        `;
  }

  // 🐾 界面 10：宠物领养中心
  if (cpState.view === 'petAdoption') {
      const char = store.contacts.find(c => c.id === cpState.activeCharId);
      const catFiles = ['AllCats.png', 'AllCatsBlack.png', 'AllCatsGrey.png', 'AllCatsGreyWhite.png', 'AllCatsOrange.png', 'AllCatsWhite.png'];
      const selectedFile = catFiles[cpState.adoptCatIndex || 0];
      const currentSpriteUrl = `./image/${selectedFile}`;

      const adoptCss = `
        <style>
           .adopt-viewport {
               width: 64px; height: 64px;
               overflow: hidden; position: relative;
               transform: scale(3.5); /* 把箱子放得大大的 */
               transform-origin: bottom center;
           }
           .adopt-sprite {
               position: absolute; top: 0; left: 0;
               max-width: none !important; width: auto !important; height: auto !important;
               image-rendering: pixelated; 
               /* 🌟 第9行(索引8) 10帧动画：精确定位到纸箱猫猫 */
               animation: play-box 1.5s steps(10) infinite;
           }
           @keyframes play-box {
               from { transform: translate(0, calc(64px * -8)); }
               to { transform: translate(calc(64px * -10), calc(64px * -8)); }
           }
        </style>
      `;

      // 🌟 取名弹窗
      const nameModal = cpState.petAdoptionPhase === 'name' ? `
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-5 animate-in fade-in duration-300">
              <div style="background: #ffffff !important;" class="w-full rounded-[32px] p-6 shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-300">
                  <div class="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4 border border-orange-100 shadow-inner">
                      <i data-lucide="edit-3" class="text-orange-400 w-8 h-8"></i>
                  </div>
                  <span class="text-[18px] font-extrabold text-gray-800 mb-2">给小猫起个名字吧</span>
                  <span class="text-[12px] font-bold text-gray-400 mb-6 text-center">以后这就是我们共同的赛博小宝贝啦</span>
                  
                  <input id="pet-name-input" type="text" class="w-full bg-gray-50 border border-gray-100 rounded-[16px] px-4 py-3.5 outline-none text-[15px] font-black text-center text-gray-800 focus:bg-white focus:border-orange-300 transition-all mb-6 shadow-inner" placeholder="例如：${pet.name} / 咪咪" value="${pet.name}" maxlength="10">
                  
                  <div class="flex space-x-3 w-full">
                      <button onclick="window.cpActions.closeNameAdoptCat()" class="flex-1 py-3.5 bg-gray-100 text-gray-600 font-bold rounded-[16px] active:scale-95 transition-transform">返回重选</button>
                      <button onclick="window.cpActions.confirmAdoptCat('${char.id}')" class="flex-1 py-3.5 bg-orange-500 text-white font-black rounded-[16px] shadow-[0_4px_15px_rgba(249,115,22,0.3)] active:scale-95 transition-transform">确认领养</button>
                  </div>
              </div>
          </div>
      ` : '';

      return `
      <div class="w-full h-full flex flex-col bg-[#fcfcfc] relative animate-in fade-in slide-in-from-right-4 duration-300 z-[60]">
          
          <div class="pt-8 pb-3 px-4 shrink-0 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-sm border-b border-gray-100">
              <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
              <span class="text-lg font-extrabold text-gray-800 tracking-wide">领养中心</span>
              <div class="w-8"></div>
          </div>

          <div class="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-orange-50/50 to-orange-100/30">
                  <div class="absolute inset-0 opacity-[0.03] pointer-events-none" style="background-image: radial-gradient(circle at 2px 2px, black 1px, transparent 0); background-size: 20px 20px;"></div>
                  
                  ${adoptCss}

                  <div class="relative flex items-center justify-center space-x-6 mb-16 z-40">
                  <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md cursor-pointer active:scale-90 transition-transform" onclick="window.cpActions.prevAdoptCat()">
                      <i data-lucide="chevron-left" class="w-6 h-6 text-gray-600"></i>
                  </div>
                  <div class="flex flex-col items-center w-24">
                      <span class="text-[13px] font-black text-orange-500 tracking-widest uppercase mb-1">挑选猫咪</span>
                      <span class="text-[10px] font-bold text-gray-400">${(cpState.adoptCatIndex || 0) + 1} / 6</span>
                  </div>
                  <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md cursor-pointer active:scale-90 transition-transform" onclick="window.cpActions.nextAdoptCat()">
                      <i data-lucide="chevron-right" class="w-6 h-6 text-gray-600"></i>
                  </div>
              </div>

              <div class="relative w-full flex flex-col items-center justify-center h-48 mb-16 z-10">
                  <div class="adopt-viewport z-10">
                      <img src="${currentSpriteUrl}" class="adopt-sprite" />
                  </div>
                  <div class="w-32 h-4 bg-black/10 rounded-[100%] absolute bottom-[-10px] filter blur-[2px] z-0"></div>
              </div>

              <button onclick="window.cpActions.startNameAdoptCat()" class="relative z-40 px-10 py-4 bg-gray-900 text-white font-black text-[15px] rounded-full shadow-xl hover:bg-gray-800 active:scale-95 transition-transform flex items-center space-x-2">
                  <i data-lucide="heart" class="w-5 h-5 text-rose-400 fill-rose-400/20"></i>
                  <span>就要这只小可爱</span>
              </button>

          </div>

          ${nameModal}
      </div>
      `;
  }

  // 🐾 界面 9：电子宠物小屋
  if (cpState.view === 'petRoom') {
      const char = store.contacts.find(c => c.id === cpState.activeCharId);
      const spaceData = store.coupleSpacesData[char.id];
      const pet = spaceData.pet;

      // 🌟 动态读取当前宠物的专属皮肤，兼容旧档
      const spriteUrl = pet.spriteUrl || './image/AllCats.png'; 
      const bgId = pet.house.currentBackgroundId;
      const backgroundUrl = `./image/house/${bgId}.png`;

      let bowlImg = 'bowl003.png'; 
      if (pet.foodLevel > 70) bowlImg = 'bowl000.png';
      else if (pet.foodLevel > 30) bowlImg = 'bowl001.png';
      else if (pet.foodLevel > 0) bowlImg = 'bowl002.png';
      const bowlUrl = `./image/house/${bowlImg}`;

      const spriteCss = `
        <style>
           :root { var(--pet-w): 64px; var(--pet-h): 64px; }
           
           /* 🌟 修复点 1：把所有的 translateX(-50%) 全部删掉，防止计算出半个像素导致手机端模糊溢出！ */
           @keyframes run-lap {
               0%    { left: 50%; bottom: 12%; transform: scaleX(1) scale(1); z-index: 10; }
               25%   { left: 85%; bottom: 18%; transform: scaleX(1) scale(0.85); z-index: 5; }
               25.1% { left: 85%; bottom: 18%; transform: scaleX(-1) scale(0.85); z-index: 5; }
               50%   { left: 50%; bottom: 25%; transform: scaleX(-1) scale(0.7); z-index: 2; }
               75%   { left: 15%; bottom: 18%; transform: scaleX(-1) scale(0.85); z-index: 5; }
               75.1% { left: 15%; bottom: 18%; transform: scaleX(1) scale(0.85); z-index: 5; }
               100%  { left: 50%; bottom: 12%; transform: scaleX(1) scale(1); z-index: 10; }
           }

           .pet-viewport-container {
               position: absolute;
               left: 50%; bottom: 12%; 
               /* 🌟 修复点 2：用传统的 margin-left: -32px; 来代替 translateX，强制浏览器按整数像素对齐！ */
               margin-left: -32px; 
               transition: left 1s ease-in-out; 
               z-index: 10;
           }
           
           .is-running {
               animation: run-lap 8s linear infinite;
           }

           .pet-viewport {
               width: 63px; height: 64px;
               overflow: hidden; 
               position: relative;
               transform: scale(2.0); 
               transform-origin: bottom center;
               /* 🌟 修复点 3：把那把破剪刀 clip-path 彻底扔掉，不切了！让电脑端恢复完整！ */
               image-rendering: pixelated; 
           }
           
           .pet-sprite {
               /* 🌟 修复点 4：确保左上角死死钉在 0 的位置，绝对不能偏移！ */
               position: absolute; top: 0; left: 0;
               max-width: none !important; width: auto !important; height: auto !important;
               image-rendering: pixelated; 
           }
           
           @keyframes play-calm { from { transform: translate(0, 0); } to { transform: translate(calc(64px * -6), 0); } }
           @keyframes play-sleep { from { transform: translate(0, calc(64px * -3)); } to { transform: translate(calc(64px * -4), calc(64px * -3)); } }
           @keyframes play-pet-head { from { transform: translate(0, calc(64px * -4)); } to { transform: translate(calc(64px * -10), calc(64px * -4)); } }
           @keyframes play-run { from { transform: translate(0, calc(64px * -5)); } to { transform: translate(calc(64px * -6), calc(64px * -5)); } }
           @keyframes play-sad { from { transform: translate(0, calc(64px * -10)); } to { transform: translate(calc(64px * -4), calc(64px * -10)); } }
           @keyframes play-cozy { from { transform: translate(0, calc(64px * -12)); } to { transform: translate(calc(64px * -8), calc(64px * -12)); } }
           @keyframes play-pet-belly { from { transform: translate(0, calc(64px * -14)); } to { transform: translate(calc(64px * -4), calc(64px * -14)); } }
           @keyframes loading-bar { from { width: 0%; } to { width: 100%; } }
           
           .anim-calm { animation: play-calm 1s steps(6) infinite; }
           .anim-sleep { animation: play-sleep 1.5s steps(4) infinite; }
           .anim-pet-head { animation: play-pet-head 1.2s steps(10) infinite; }
           .anim-run { animation: play-run 0.5s steps(6) infinite; } 
           .anim-sad { animation: play-sad 1s steps(4) infinite; }
           .anim-cozy { animation: play-cozy 1.2s steps(8) infinite; }
           .anim-pet-belly { animation: play-pet-belly 0.8s steps(4) infinite; }
        </style>
      `;

      // 🌟 状态文案体系更新 (加入传话筒优先级)
      let statusText = '正在安静地陪着你...';
      if (pet.state === 'run') statusText = '芜湖！满屋子跑酷！✨';
      if (pet.state === 'sleep') statusText = '呼噜呼噜... zzZ 💤';
      if (pet.state === 'pet-head') statusText = '喵呜~ 舒服~ ❤️';
      if (pet.state === 'pet-belly') statusText = '呼噜噜... 别停~ 🥺';
      if (pet.state === 'sad') statusText = '饿了或者脏了，不开森... 🥀';
      if (pet.state === 'cozy') statusText = '伸个懒腰，生活真美好~ 🌸';

      // 🌟 传话筒状态覆盖！
      if (pet.aiReply) {
          statusText = `<span class="text-blue-500 font-black">TA 回复你：</span>${pet.aiReply} <i data-lucide="x-circle" class="w-4 h-4 inline ml-1 cursor-pointer text-gray-400 hover:text-red-400 active:scale-90 align-text-bottom" onclick="window.cpActions.clearPetReply('${char.id}')"></i>`;
      } else if (pet.userMessage) {
          statusText = `正在拼命记住你要带给 TA 的话... 🐾`;
      }

      const containerClass = pet.state === 'run' ? 'pet-viewport-container is-running' : 'pet-viewport-container';

      const backgroundsList = [];
      for (let i = 1; i <= 20; i++) backgroundsList.push(i);

      // 🌟 终极家具商城面板 (自动补零，标签清晰，记忆滚动条)
      const currentScore = window.cpActions.calculateCurrentScore(char.id);
      
      const decorationModalHtml = cpState.petModalView === 'decoration' ? `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-5 animate-in fade-in duration-300" onclick="window.cpActions.closePetRoomDecorationModal()">
            <div class="w-full h-[80%] bg-[#ffffff] rounded-[32px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden" onclick="event.stopPropagation()">
                
                <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-[#ffffff] shrink-0">
                    <div class="flex flex-col">
                        <span class="font-black text-gray-800 text-[16px]">装修宠物小屋</span>
                        <div class="flex items-center mt-1">
                            <i data-lucide="coins" class="w-3.5 h-3.5 mr-1 text-orange-500"></i>
                            <span class="text-[13px] font-black font-serif text-orange-600">${currentScore}</span>
                        </div>
                    </div>
                    <i data-lucide="x" class="w-6 h-6 text-gray-400 bg-gray-100 rounded-full p-1 cursor-pointer active:scale-90" onclick="window.cpActions.closePetRoomDecorationModal()"></i>
                </div>

                <div class="flex space-x-4 px-6 py-3 overflow-x-auto hide-scrollbar border-b border-gray-100 shrink-0 bg-gray-50">
                    ${[ {id:'wallpaper', n:'墙纸'}, {id:'window', n:'窗户'}, {id:'shelf', n:'猫爬架'}, {id:'bed', n:'猫窝'}, {id:'decor', n:'装饰'}, {id:'toy', n:'玩具'} ].map(tab => `
                        <div onclick="window.cpActions.switchPetDecoTab('${tab.id}')" class="shrink-0 pb-1 px-1 text-[13px] font-bold transition-all cursor-pointer ${cpState.petDecoTab === tab.id ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}">${tab.n}</div>
                    `).join('')}
                </div>

                <div id="pet-deco-scroll" class="flex-1 overflow-y-auto p-6 hide-scrollbar bg-[#ffffff]">
                    <div class="grid grid-cols-2 gap-4">
                        ${(() => {
                            let items = [];
                            const p3 = (n) => String(n).padStart(3, '0'); 
                            
                            if (cpState.petDecoTab === 'wallpaper') {
                                for(let i=1; i<=20; i++) items.push({ pfx: 'bg', id: i, name: `墙纸 ${i}`, img: `./image/house/${i}.png`, price: i===1?0:50 });
                            } else if (cpState.petDecoTab === 'window') {
                                for(let i=1; i<=8; i++) items.push({ pfx: 'window', id: i, name: `窗户 ${i}`, img: `./image/house/window${i}.png`, price: i===1?0:30 });
                            } else if (cpState.petDecoTab === 'shelf') {
                                for(let i=1; i<=14; i++) {
                                    // 🌟 拦截器：如果遇到 5 和 6，直接跳过不卖了！
                                    if (i === 5 || i === 6) continue; 
                                    items.push({ pfx: 'shelf', id: i, name: `落地架 ${i}`, img: `./image/house/shelf${p3(i)}.png`, price: 80 });
                                }
                                for(let i=1; i<=4; i++) items.push({ pfx: 'tile', id: i, name: `墙上爬架 ${i}`, img: `./image/house/tile${p3(i)}.png`, price: 60 });
                            } else if (cpState.petDecoTab === 'bed') {
                                for(let i=1; i<=12; i++) items.push({ pfx: 'bed', id: i, name: `猫窝 ${i}`, img: `./image/house/bed${p3(i)}.png`, price: 70 });
                            } else if (cpState.petDecoTab === 'decor') {
                                for(let i=1; i<=14; i++) items.push({ pfx: 'plant', id: i, name: `盆栽 ${i}`, img: `./image/house/plant${p3(i)}.png`, price: 40 });
                                for(let i=1; i<=10; i++) items.push({ pfx: 'frame', id: i, name: `相框 ${i}`, img: `./image/house/frame${p3(i)}.png`, price: 40 });
                            } else if (cpState.petDecoTab === 'toy') {
                                for(let i=1; i<=6; i++) items.push({ pfx: 'fish', id: i, name: `咸鱼玩具 ${i}`, img: `./image/house/fish${i}.png`, price: 20 });
                                for(let i=1; i<=3; i++) items.push({ pfx: 'toy', id: i, name: `逗猫棒 ${i}`, img: `./image/house/toy${p3(i)}.png`, price: 20 });
                                for(let i=1; i<=12; i++) items.push({ pfx: 'ball', id: i, name: `毛线球 ${i}`, img: `./image/house/ball${p3(i)}.png`, price: 15 });
                                for(let i=1; i<=4; i++) items.push({ pfx: 'cube', id: i, name: `魔方 ${i}`, img: `./image/house/cube${p3(i)}.png`, price: 25 });
                            }

                            if (items.length === 0) return `<div class="col-span-2 text-center py-20 text-gray-300 text-xs font-bold tracking-widest">道具进货中...</div>`;

                            return items.map(item => {
                                const itemKey = `${item.pfx}_${item.id}`;
                                const isOwned = pet.house.ownedItems.includes(itemKey) || item.price === 0;
                                const isEquipped = 
                                    (item.pfx === 'bg' && pet.house.currentBackgroundId === item.id) ||
                                    (item.pfx === 'window' && pet.house.currentWindowId === item.id) ||
                                    (item.pfx === 'shelf' && pet.house.currentShelfId === item.id) ||
                                    (item.pfx === 'tile' && pet.house.currentTileId === item.id) ||
                                    (item.pfx === 'bed' && pet.house.currentBedId === item.id) ||
                                    (item.pfx === 'plant' && pet.house.currentPlantId === item.id) ||
                                    (item.pfx === 'frame' && pet.house.currentFrameId === item.id) ||
                                    (item.pfx === 'fish' && pet.house.currentFishId === item.id) ||
                                    (item.pfx === 'toy' && pet.house.currentToyId === item.id) ||
                                    (item.pfx === 'ball' && pet.house.currentBallId === item.id) ||
                                    (item.pfx === 'cube' && pet.house.currentCubeId === item.id);

                                // 🌟 智能文案逻辑
                                let btnText = '';
                                if (isEquipped) {
                                    btnText = ['bg', 'window'].includes(item.pfx) ? '· 不可卸下' : '· 点击卸下';
                                } else if (isOwned) {
                                    btnText = '· 点击装扮';
                                }

                                return `
                                    <div class="relative flex flex-col group cursor-pointer" onclick="window.cpActions.applyDecoration('${char.id}', '${item.pfx}', ${item.id}, ${item.price})">
                                        <div class="aspect-square bg-gray-50 rounded-[20px] overflow-hidden border-2 ${isEquipped ? 'border-orange-400' : 'border-transparent'} shadow-sm transition-all active:scale-95">
                                            <img src="${item.img}" class="w-full h-full object-cover" onerror="this.src='./image/house/window1.png'; this.style.opacity='0.1';" />
                                            ${!isOwned ? `
                                                <div class="absolute inset-0 bg-black/40 flex items-center justify-center rounded-[18px]">
                                                    <div class="bg-white/90 px-2 py-1 rounded-full flex items-center shadow-lg">
                                                        <i data-lucide="coins" class="w-3 h-3 mr-1 text-orange-500"></i>
                                                        <span class="text-[10px] font-black text-gray-800">${item.price}</span>
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                        <span class="mt-2 text-[11px] font-bold text-center ${isEquipped ? 'text-orange-500' : 'text-gray-500'}">${item.name} <span class="text-[9px] font-normal opacity-70">${btnText}</span></span>
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                </div>
            </div>
        </div>
      ` : '';

      const p3 = (n) => String(n).padStart(3, '0');
      const h = pet.house;
      const logicalToday = (typeof getLogicalDateStr === 'function') ? getLogicalDateStr() : new Date().toLocaleDateString('zh-CN');

      // 🌟 新增：拍立得相册弹窗 (加入了重Roll按钮)
      const albumModalHtml = cpState.petModalView === 'album' ? `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-5 animate-in fade-in duration-300" onclick="window.cpActions.closePetAlbum()">
            <div class="w-full h-[85%] bg-[#f4f5f7] rounded-[32px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300" onclick="event.stopPropagation()">
                <div class="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-white rounded-t-[32px] shrink-0">
                    <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="camera" class="w-5 h-5 mr-2 text-blue-500"></i>${pet.name}的拍立得</span>
                    <i data-lucide="x" class="w-6 h-6 text-gray-400 bg-gray-100 rounded-full p-1 cursor-pointer active:scale-90" onclick="window.cpActions.closePetAlbum()"></i>
                </div>
                <div id="pet-deco-scroll" class="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar relative">
                    ${spriteCss} 
                    ${pet.album.length === 0 ? '<div class="text-center text-gray-400 text-xs mt-10">还没有照片哦...</div>' : pet.album.map(a => `
                        <div class="bg-white p-3 pb-6 rounded-sm shadow-[0_10px_20px_rgba(0,0,0,0.05)] border border-gray-200 transform ${Math.random() > 0.5 ? 'rotate-1' : '-rotate-1'} mx-2 relative group">
                            
                            ${a.date === logicalToday && a.imgState !== 'loading' ? `
                                <div class="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity" title="重新冲洗这只小猫">
                                    <div class="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center cursor-pointer active:scale-90 border border-gray-100 text-gray-500 hover:text-orange-500" onclick="window.cpActions.rerollTodayPhoto('${char.id}', ${a.id})">
                                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                                    </div>
                                </div>
                            `: ''}

                            <div class="w-full h-44 bg-[#e5e7eb] flex items-center justify-center overflow-hidden relative shadow-inner">
                                ${a.imgState === 'loading' ? '<i data-lucide="loader-2" class="w-6 h-6 text-gray-400 animate-spin"></i>' : `
                                    <div class="pet-viewport" style="transform: scale(2.5); bottom: -15px;">
                                        <img src="${spriteUrl}" class="pet-sprite anim-${a.imgState}" style="object-position: bottom center;"/>
                                    </div>
                                `}
                            </div>
                            <div class="mt-4 px-2 text-[14px] text-gray-700 font-serif leading-relaxed text-justify font-medium break-words">
                                ${a.text}
                            </div>
                            <div class="mt-3 px-2 text-[10px] font-black text-gray-300 tracking-wider font-sans text-right">
                                ${a.date}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
      ` : '';

      return `
      <div class="w-full h-full flex flex-col bg-[#f0f4f8] relative animate-in fade-in slide-in-from-right-4 duration-300 z-[60]">
          
          <div class="pt-8 pb-3 px-4 shrink-0 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-sm border-b border-gray-100">
              <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.openDashboard('${char.id}')"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
              <span class="text-lg font-extrabold text-gray-800 tracking-wide">${pet.name} 的小屋</span>
              <div class="w-8"></div>
          </div>

          <div class="flex-1 overflow-y-auto hide-scrollbar flex flex-col relative" style="background-image: url('${backgroundUrl}'); background-size: cover; background-position: center bottom;">
              
              <div class="absolute inset-0 bg-black/10 pointer-events-none z-0"></div>

              ${pet.state === 'bath' ? `
                  <div class="absolute inset-0 bg-blue-900/40 backdrop-blur-md z-[150] flex flex-col items-center justify-center animate-in fade-in">
                      <i data-lucide="droplets" class="w-16 h-16 text-blue-200 mb-6 animate-bounce"></i>
                      <div class="w-60 h-6 bg-blue-100/50 rounded-full overflow-hidden shadow-inner relative">
                         <div class="h-full bg-blue-400 rounded-full" style="animation: loading-bar 3s linear forwards;"></div>
                      </div>
                      <span class="text-[16px] font-black text-blue-100 mt-6 tracking-widest drop-shadow-lg">正在努力洗香香，非礼勿视...</span>
                  </div>
              ` : ''}

              ${h.currentWindowId > 0 ? `<div class="absolute top-[25%] left-1/2 -translate-x-1/2 w-[85%] h-36 z-[1] pointer-events-none opacity-95"><img src="./image/house/window${h.currentWindowId}.png" class="w-full h-full object-contain filter drop-shadow-md" /></div>` : ''}
              ${h.currentFrameId > 0 ? `<div class="absolute top-[30%] right-[15%] w-16 h-20 z-[1] pointer-events-none"><img src="./image/house/frame${p3(h.currentFrameId)}.png" class="w-full h-full object-contain filter drop-shadow-md" /></div>` : ''}
              ${h.currentTileId > 0 ? `<div class="absolute top-[50%] right-[20%] w-54 h-54 z-[1] pointer-events-none"><img src="./image/house/tile${p3(h.currentTileId)}.png" class="w-full h-full object-contain filter drop-shadow-md" style="image-rendering: pixelated;"/></div>` : ''}
              ${h.currentShelfId > 0 ? `<div class="absolute bottom-[20%] left-[4%] w-36 h-66 z-[2] pointer-events-none"><img src="./image/house/shelf${p3(h.currentShelfId)}.png" class="w-full h-full object-contain filter drop-shadow-lg" style="object-position: bottom center;" /></div>` : ''}
              ${h.currentBedId > 0 ? `<div class="absolute bottom-[20%] right-[5%] w-40 h-30 z-[2] pointer-events-none"><img src="./image/house/bed${p3(h.currentBedId)}.png" class="w-full h-full object-contain filter drop-shadow-md" style="image-rendering: pixelated;"/></div>` : ''}
              ${h.currentPlantId > 0 ? `<div class="absolute bottom-[14%] left-[-4%] w-24 h-36 z-[2] pointer-events-none"><img src="./image/house/plant${p3(h.currentPlantId)}.png" class="w-full h-full object-contain filter drop-shadow-md" /></div>` : ''}
              ${h.currentCubeId > 0 ? `<div class="absolute bottom-[-2%] right-[25%] w-14 h-14 z-[3] pointer-events-none"><img src="./image/house/cube${p3(h.currentCubeId)}.png" class="w-full h-full object-contain filter drop-shadow-sm" style="image-rendering: pixelated;"/></div>` : ''}
              ${h.currentBallId > 0 ? `<div class="absolute bottom-[12%] right-[6%] w-50 h-50 z-[3] pointer-events-none"><img src="./image/house/ball${p3(h.currentBallId)}.png" class="w-full h-full object-contain filter drop-shadow-sm" style="image-rendering: pixelated;"/></div>` : ''}
              ${h.currentFishId > 0 ? `<div class="absolute bottom-[0%] left-[-6%] w-48 h-24 z-[3] pointer-events-none"><img src="./image/house/fish${h.currentFishId}.png" class="w-full h-full object-contain filter drop-shadow-sm" style="image-rendering: pixelated;"/></div>` : ''}
              ${h.currentToyId > 0 ? `<div class="absolute bottom-[15%] right-[-6%] w-24 h-24 z-[3] pointer-events-none"><img src="./image/house/toy${p3(h.currentToyId)}.png" class="w-full h-full object-contain filter drop-shadow-sm" style="image-rendering: pixelated;"/></div>` : ''}
              <div class="absolute top-40 right-4 z-20 flex flex-col space-y-3">
                  <div class="cursor-pointer p-2.5 rounded-full bg-white/80 backdrop-blur-md border border-white shadow-lg active:scale-95 transition-all group hover:bg-white flex items-center justify-center" onclick="window.cpActions.openPetRoomDecorationModal('${char.id}')" title="装修">
                      <i data-lucide="layout-dashboard" class="w-4 h-4 text-orange-400 group-hover:rotate-12 transition-transform"></i>
                  </div>
                  <div class="cursor-pointer p-2.5 rounded-full bg-white/80 backdrop-blur-md border border-white shadow-lg active:scale-95 transition-all group hover:bg-white flex items-center justify-center" onclick="window.cpActions.openPetAlbum('${char.id}')" title="拍立得相册">
                      <i data-lucide="camera" class="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform"></i>
                  </div>
                  <div class="cursor-pointer p-2.5 rounded-full bg-white/80 backdrop-blur-md border border-white shadow-lg active:scale-95 transition-all group hover:bg-white flex items-center justify-center" onclick="window.cpActions.leavePetMessage('${char.id}')" title="传话给TA">
                      <i data-lucide="mic" class="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform"></i>
                  </div>
              </div>

              ${pet.stickyNote ? `
                  <div class="absolute top-36 left-6 z-20 w-36 bg-yellow-100/95 backdrop-blur-sm p-3.5 shadow-md transform -rotate-3 rounded-br-2xl rounded-tl-sm border border-yellow-200/50">
                      <i data-lucide="pin" class="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-5 text-red-400 drop-shadow-sm"></i>
                      <div class="text-[13px] text-yellow-900 font-medium leading-relaxed font-serif mt-2 break-words">
                          ${pet.stickyNote}
                      </div>
                      <i data-lucide="x" class="absolute top-1 right-1 w-3.5 h-3.5 text-yellow-600/30 cursor-pointer active:scale-90 hover:text-yellow-600" onclick="window.cpActions.removeStickyNote('${char.id}')"></i>
                  </div>
              ` : ''}

              <div class="bg-white/90 backdrop-blur-md m-4 p-4 rounded-[24px] shadow-sm border border-white/50 flex flex-col space-y-4 relative z-20">
                  <div class="flex items-center justify-between">
                      <span class="text-[11px] font-bold text-gray-500 w-12 shrink-0">饱食度</span>
                      <div class="flex-1 h-2.5 bg-gray-100 rounded-full mx-3 overflow-hidden shadow-inner">
                          <div class="h-full bg-orange-400 rounded-full transition-all duration-500 ease-out" style="width: ${Math.round(pet.hunger)}%"></div>
                      </div>
                      <span class="text-[11px] font-black text-gray-700 w-8 text-right">${Math.round(pet.hunger)}%</span>
                  </div>
                  <div class="flex items-center justify-between">
                      <span class="text-[11px] font-bold text-gray-500 w-12 shrink-0">清洁度</span>
                      <div class="flex-1 h-2.5 bg-gray-100 rounded-full mx-3 overflow-hidden shadow-inner">
                          <div class="h-full bg-blue-400 rounded-full transition-all duration-500 ease-out" style="width: ${Math.round(pet.clean)}%"></div>
                      </div>
                      <span class="text-[11px] font-black text-gray-700 w-8 text-right">${Math.round(pet.clean)}%</span>
                  </div>
                  <div class="flex items-center justify-between">
                      <span class="text-[11px] font-bold text-gray-500 w-12 shrink-0">心情值</span>
                      <div class="flex-1 h-2.5 bg-gray-100 rounded-full mx-3 overflow-hidden shadow-inner">
                          <div class="h-full bg-pink-400 rounded-full transition-all duration-500 ease-out" style="width: ${Math.round(pet.mood)}%"></div>
                      </div>
                      <span class="text-[11px] font-black text-gray-700 w-8 text-right">${Math.round(pet.mood)}%</span>
                  </div>
              </div>

              <div class="flex-1 flex flex-col items-center justify-end relative pb-8 z-10 w-full overflow-hidden">
                  
                  <div class="bg-white/95 backdrop-blur border border-gray-100 px-4 py-2 rounded-2xl rounded-bl-sm shadow-md text-[12px] font-bold text-gray-600 mb-8 absolute bottom-36 z-30 transition-all ${['pet-head','pet-belly','run'].includes(pet.state) ? 'scale-110 text-rose-500 bg-rose-50 border-rose-100' : ''} ${pet.aiReply ? 'ring-2 ring-blue-200' : ''} ${pet.stickyNote ? 'invisible':''}">
                      ${statusText}
                  </div>

                  ${spriteCss}

                  ${pet.state !== 'bath' ? `
                      <div class="${containerClass}">
                          <div class="pet-viewport">
                              <img src="${spriteUrl}" class="pet-sprite anim-${pet.state}" />
                          </div>
                          <div class="w-20 h-2 bg-black/15 rounded-[100%] absolute bottom-1 left-1/2 -translate-x-1/2 z-0 filter blur-[1px]"></div>
                      </div>

                      <div class="absolute bottom-2 right-2 z-10 w-20 h-20 flex flex-col items-center group cursor-pointer" onclick="window.cpActions.interactPet('${char.id}', 'eat')">
                      <img src="${bowlUrl}" class="w-full h-full object-contain filter drop-shadow-md group-active:scale-95 transition-transform" style="image-rendering: pixelated;" />
                  </div>
                  ` : ''}

              </div>
          </div>

          <div class="bg-white px-6 py-6 pb-8 border-t border-gray-100 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] flex justify-around relative z-30 shrink-0">
              <div class="flex flex-col items-center cursor-pointer group" onclick="window.cpActions.interactPet('${char.id}', 'eat')">
                  <div class="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mb-2 shadow-sm border border-orange-100 group-active:scale-90 transition-transform ${['bath', 'pet-head', 'pet-belly'].includes(pet.state) ? 'opacity-50 grayscale' : ''}">
                      <i data-lucide="beef" class="w-6 h-6 text-orange-400"></i>
                  </div>
                  <span class="text-[12px] font-bold text-gray-600">喂食</span>
              </div>
              <div class="flex flex-col items-center cursor-pointer group" onclick="window.cpActions.interactPet('${char.id}', 'bath')">
                  <div class="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-2 shadow-sm border border-blue-100 group-active:scale-90 transition-transform ${['bath', 'pet-head', 'pet-belly'].includes(pet.state) ? 'opacity-50 grayscale' : ''}">
                      <i data-lucide="bath" class="w-6 h-6 text-blue-400"></i>
                  </div>
                  <span class="text-[12px] font-bold text-gray-600">洗澡</span>
              </div>
              <div class="flex flex-col items-center cursor-pointer group" onclick="window.cpActions.interactPet('${char.id}', 'play')">
                  <div class="w-14 h-14 rounded-full bg-pink-50 flex items-center justify-center mb-2 shadow-sm border border-pink-100 group-active:scale-90 transition-transform ${['bath', 'pet-head', 'pet-belly'].includes(pet.state) ? 'opacity-50 grayscale' : ''}">
                      <i data-lucide="hand-heart" class="w-6 h-6 text-pink-400"></i>
                  </div>
                  <span class="text-[12px] font-bold text-gray-600">摸摸</span>
              </div>
          </div>

          ${decorationModalHtml}
          ${albumModalHtml}
      </div>
      `;
  }
}

// 🌟 终极宠物漫游与情绪 AI 引擎 (每 8 秒思考一次人生)
if (!window.petAiRunning) {
    window.petAiRunning = true;
    setInterval(() => {
        if (cpState.view !== 'petRoom') return;
        
        const charId = cpState.activeCharId;
        const spaceData = store.coupleSpacesData[charId];
        if (!spaceData || !spaceData.pet) return;
        
        const pet = spaceData.pet;

        // 如果在洗澡、被摸，绝对不能打断
        if (['bath', 'pet-head', 'pet-belly'].includes(pet.state)) return;

        // 后台静默刷新一下生理状态
        window.cpActions.updatePetStats(charId);

        // 🌟 只在它没睡着、没难过（即 baseState 是 active）时，才让它切换动作！
        if (pet.baseState === 'active') {
            const roll = Math.random();
            if (roll < 0.2) {
                pet.state = 'run'; // 20% 概率跑一圈（CSS动画控制它刚好跑完回到原点）
            } else if (roll < 0.7) {
                pet.state = 'calm'; // 50% 概率安静站着
            } else {
                pet.state = 'cozy'; // 30% 概率伸懒腰
            }
        } else if (pet.baseState === 'sleep') {
            pet.state = 'sleep';
        } else if (pet.baseState === 'sad') {
            pet.state = 'sad';
        }

        window.render();
    }, 8000); // 8000 毫秒 = 8秒钟，和跑圈的时间完美对齐！
}

// ==========================================
// 🌟 终极独立后台静默扫描引擎 (脱离 UI 独立挂载，永不宕机！)
// ==========================================
if (!window.cpBootScanStarted) {
    window.cpBootScanStarted = true;
    
    // 🧠 独立的记忆提取器
    const getBgContext = (charId) => {
        const char = store.contacts.find(c => c.id === charId);
        const chat = store.chats.find(c => c.charId === charId);
        const boundPId = chat?.boundPersonaId || store.personas[0].id;
        const boundP = store.personas.find(p => String(p.id) === String(boundPId)) || store.personas[0];
        let coreMem = (store.memories || []).filter(m => m.charId === charId && m.type === 'core').map(m=>m.content).join('；');
        const coreMemStr = coreMem ? `\n【核心记忆】\n${coreMem}` : '';
        const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${coreMemStr}\n\n【用户】\n当前化名：${boundP.name}\n设定：${boundP.prompt || store.personas[0].prompt}`;
        return { char, chat, boundP, promptStr };
    };

    // 🌟 引擎一：提问箱巡逻员
    const doQuestionScan = async () => {
        if (!store.coupleSpaces || !store.apiConfig?.apiKey) return;
        for (const charId of store.coupleSpaces) {
            store.coupleSpacesData = store.coupleSpacesData || {};
            const spaceData = store.coupleSpacesData[charId] || {};
            spaceData.questions = spaceData.questions || [];
            if (spaceData.enableAiQuestions !== true) continue;
            
            const targetFreq = spaceData.aiQuestionFreq || 1;
            const logicalToday = (typeof getLogicalDateStr === 'function') ? getLogicalDateStr() : new Date().toLocaleDateString('zh-CN');
            const todayCount = spaceData.questions.filter(q => q.asker === 'ai' && ((typeof getLogicalDateStr === 'function') ? getLogicalDateStr(new Date(q.timestamp)) : new Date(q.timestamp).toLocaleDateString('zh-CN')) === logicalToday).length;
            
            if (todayCount < targetFreq) {
                const hasUnanswered = spaceData.questions.some(q => q.asker === 'ai' && !q.answer);
                if (hasUnanswered) continue;
                
                if (spaceData.isFetchingAIQ) continue;
                spaceData.isFetchingAIQ = true;
                
                try {
                    const ctx = getBgContext(charId);
                    const msgs = (ctx.chat?.messages || []).filter(m => m.msgType === 'text' && !m.isHidden).slice(-100);
                    const last30 = msgs.map(m => `${m.isMe ? ctx.boundP.name : ctx.char.name}: ${m.text}`).join('\n');
                    const historyPrompt = last30 ? `\n【最近30回合聊天记录】\n${last30}` : '';
                    
                    const askedHistory = spaceData.questions.filter(q => q.asker === 'ai').map(q => q.text).slice(-100).join('、');
                    const avoidPrompt = askedHistory ? `\n❗【绝对禁止重复】：你之前已经问过以下问题，绝不允许再问类似的问题：${askedHistory}` : '';
                    
                    const taskMsg = `【系统任务】你现在在情侣提问箱。请向用户提出1个想问但平时不敢或不好意思提出的，有一定深度的问题。${avoidPrompt}\n你可以针对最近的聊天记录提问，也可以针对记忆中的事件提问，或者问一些哲学、生活习惯问题。\n❗要求：语言极度精简自然，字数严格在30字以内！直接输出问题正文，绝不要带任何前缀！`;
                    
                    const prompt = window.cpActions?.buildMasterPrompt ? window.cpActions.buildMasterPrompt(charId, {
                        history: historyPrompt,
                        task: taskMsg,
                        recentText: historyPrompt,
                        scenario: 'questions'
                    }) : taskMsg;

                    const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                        body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9 })
                    });
                    
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error?.message || `网络状态码 ${res.status}`);
                    }

                    const data = await res.json();
                    if (!data.choices || !data.choices[0]) throw new Error('API 返回数据为空');

                    const questionText = window.cpActions.cleanAI(data.choices[0].message.content).replace(/^["']|["']$/g, '');
                    if (questionText.startsWith('<think>')) throw new Error('AI 回复抽风了');
                    
                    spaceData.questions.unshift({ id: 'Q_' + Date.now(), asker: 'ai', text: questionText, answer: null, timestamp: Date.now() });
                    if (typeof window.actions !== 'undefined' && window.actions.saveStore) window.actions.saveStore();
                    if (typeof window.render === 'function') window.render();
                    
                    console.log(`[CoupleApp] 巡逻员：成功为角色生成提问！`);
                } catch(e) {
                    console.warn(`[CoupleApp] 提问箱静默出题失败:`, e.message);
                    
                    // 🌟 新增：手机端可视化报错！一旦 API 失败，直接在屏幕上弹窗告诉你原因！
                    if (typeof window.actions !== 'undefined' && window.actions.showToast) {
                        window.actions.showToast(`提问箱 API 失败: ${e.message}`);
                    }
                } finally {
                    spaceData.isFetchingAIQ = false; 
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    };
    if (!window.cpActions) window.cpActions = {};
    window.cpActions.doQuestionScan = doQuestionScan;

    // 🌟 引擎二：日记本巡逻员
    const doDiaryScan = async () => {
        if (!store.coupleSpaces || !store.apiConfig?.apiKey || !store.diaryConfig?.enabled) return;
        
        const now = new Date();
        const currentStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        if (currentStr < store.diaryConfig.time) return; 

        if (store.isFetchingDiaryScan) return;
        store.isFetchingDiaryScan = true;

        try {
            const logicalToday = (typeof getLogicalDateStr === 'function') ? getLogicalDateStr() : new Date().toLocaleDateString('zh-CN');
            for (const charId of store.coupleSpaces) {
                store.diaries = store.diaries || [];
                const hasDiary = store.diaries.find(d => d.charId === charId && d.date === logicalToday);
                if (hasDiary) continue; 

                try {
                    const historyStr = typeof getTodayChatHistory === 'function' ? getTodayChatHistory(charId, logicalToday) : '';
                    const taskMsg = `【系统任务】今天即将结束，请你结合今天的聊天记录、人设和记忆，写一篇今天的私密日记。\n要求：\n1. 第一人称口吻，真实自然的情感表达。\n2. 总结今天的互动，或者表达对用户的思念/感受。\n3. 要求：字数 150-300字，支持 ~~阴暗面~~ 和 **高光** 语法。直接输出正文！`;
                    
                    const prompt = window.cpActions?.buildMasterPrompt ? window.cpActions.buildMasterPrompt(charId, {
                        history: historyStr,
                        task: taskMsg,
                        recentText: historyStr,
                        scenario: 'diary'
                    }) : taskMsg;

                    const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                        body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
                    });
                    
                    if (!res.ok) throw new Error(`日记 API 状态码 ${res.status}`);
                    const data = await res.json();
                    
                    store.diaries.push({ id: Date.now(), charId: charId, date: logicalToday, content: window.cpActions.cleanAI(data.choices[0].message.content), comments: [] });
                    if (typeof window.actions !== 'undefined' && window.actions.saveStore) window.actions.saveStore();
                    if (typeof window.render === 'function') window.render();
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch(e) { console.error('静默写日记单角色失败', e.message); }
            }
        } finally {
            store.isFetchingDiaryScan = false;
        }
    };

    // 🌟 引擎三：共同成长打卡巡逻员 (全新加入！)
    const doGrowthScan = async () => {
        if (!store.coupleSpaces) return;

        const now = new Date();
        const hour = now.getHours();
        
        // 🌟 规定巡逻时间：晚上 8 点 (20) 到 凌晨 1 点之前 (0)
        // (注：因为 getLogicalDateStr 已经把 0:00-0:59 算作了昨天，所以 0 点依然在逻辑的“当天”末尾)
        if (!(hour >= 20 || hour === 0)) return;

        if (store.isFetchingGrowthScan) return;
        store.isFetchingGrowthScan = true;

        try {
            const logicalToday = (typeof getLogicalDateStr === 'function') ? getLogicalDateStr() : new Date().toLocaleDateString('zh-CN');

            for (const charId of store.coupleSpaces) {
                const spaceData = store.coupleSpacesData[charId];
                if (!spaceData || !spaceData.growth) continue;

                // 🌟 防止夺命连环 Call：每天只提醒一次
                if (spaceData.growth.lastRemindDate === logicalToday) continue;

                const activePlans = spaceData.growth.plans || [];
                const myDaily = activePlans.filter(p => p.owner === 'me' && p.type === 'daily');

                // 🌟 没有每日计划的用户，巡逻员直接放过
                if (myDaily.length === 0) continue;

                const todayRecords = spaceData.growth.records[logicalToday] || {};
                const allDone = myDaily.every(p => todayRecords[p.id]);

                // 🌟 如果有未完成的计划，立刻发牌警告！
                if (!allDone) {
                    const chat = store.chats.find(c => c.charId === charId);
                    if (chat) {
                        // 1. 发送提示卡片
                        chat.messages.push({
                            id: Date.now(), sender: 'system', isMe: false, msgType: 'system',
                            text: `✨ 【自律小助手】有计划待完成哦！`,
                            timestamp: Date.now()
                        });

                        // 2. 偷偷塞指令
                        if (typeof window.scheduleCloudTask === 'function') {
                            window.scheduleCloudTask(charId, `(系统指令：用户今天没打卡，请用你的语气催促一下。字数40字内。)`);
                        }

                        // 3. 记录已提醒，今天不会再被骂了
                        spaceData.growth.lastRemindDate = logicalToday;
                        
                        if (window.actions && window.actions.saveStore) window.actions.saveStore();
                        if (typeof window.render === 'function') window.render();
                        console.log(`[CoupleApp] 打卡巡逻员：已向微信主程序发射催促指令！`);
                    }
                }
            }
        } catch (e) {
            console.error('自律打卡巡逻员出错', e);
        } finally {
            store.isFetchingGrowthScan = false;
        }
    };

    // 🌟 心脏起搏器 (永远在后台跳动)
    const bootPulse = () => {
        if (store && store.contacts && store.contacts.length > 0) {
            console.log('[CoupleApp] ⚡ 数据库就绪，三引擎巡逻大脑已启动！');
            
            // 🌟 【暴力破拆僵尸锁】：每次启动时，强制把所有残留的锁砸烂，防止刷新造成的永久死锁！
            store.isFetchingDiaryScan = false;
            store.isFetchingGrowthScan = false;
            if (store.coupleSpacesData) {
                for (const key in store.coupleSpacesData) {
                    if (store.coupleSpacesData[key]) {
                        store.coupleSpacesData[key].isFetchingAIQ = false;
                    }
                }
            }

            doQuestionScan(); 
            doDiaryScan();    
            doGrowthScan(); 
            
            // 每分钟的心跳大循环
            setInterval(() => {
                doDiaryScan();
                doQuestionScan();
                doGrowthScan(); 
            }, 60000);
        } else {
            setTimeout(bootPulse, 1000);
        }
    };
    setTimeout(bootPulse, 2000);
}