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
  isDiaryTyping: false, // 🌟 新增：记录 AI 是否正在补写日记
  showCommentEdit: false, // 🌟 新增：控制评论编辑弹窗
  editingCommentIdx: null, // 🌟 新增：记录当前正在编辑哪一条
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
       store.anniversaries = store.anniversaries.filter(a => a.id !== id); window.render();
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
  const myAvatar = store.personas[0].avatar;
  const getVidHtml = (v) => {
    if (!v) return `<div class="w-full h-full bg-gray-200"></div>`;
    if (v.includes('.mp4') || v.includes('.webm')) return `<video src="${v}" autoplay loop muted playsinline class="w-full h-full object-cover"></video>`;
    return `<img src="${v}" class="w-full h-full object-cover" />`;
  };

  if (cpState.view === 'select') {
     return `
      <div class="w-full h-full bg-[#fdfdfd] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60]">
         <div class="pt-14 pb-4 px-6 sticky top-0 bg-[#fdfdfd]/90 backdrop-blur-md z-10 flex items-center justify-between">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.closeApp()"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
            <span class="text-lg font-extrabold text-gray-800 tracking-wide">选择伴侣</span>
            <div class="w-8"></div>
         </div>
         <div class="flex-1 overflow-y-auto px-5 py-2 space-y-4 hide-scrollbar pb-10">
            ${store.contacts.map(c => `
              <div class="bg-white rounded-[24px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50 flex items-center cursor-pointer active:scale-[0.98] transition-all" onclick="window.cpActions.openDashboard('${c.id}')">
                 <div class="w-14 h-14 rounded-full overflow-hidden shadow-inner mr-4 border border-gray-100">${getVidHtml(c.avatar)}</div>
                 <div class="flex-1 flex flex-col">
                    <span class="text-[16px] font-extrabold text-gray-800 mb-0.5 tracking-wide">${c.name}</span>
                    <span class="text-[11px] text-gray-400 font-bold tracking-widest">进入专属私密空间</span>
                 </div>
                 <div class="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center border border-pink-100/50"><i data-lucide="heart" class="w-4 h-4 text-pink-400 fill-pink-100"></i></div>
              </div>
            `).join('')}
         </div>
      </div>
    `;
  }

  if (cpState.view === 'dashboard') {
     const char = store.contacts.find(c => c.id === cpState.activeCharId);
     if (!char) return '';
     return `
      <div class="w-full h-full bg-[#fdfdfd] flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60]">
         <div class="pt-12 pb-2 px-4 sticky top-0 z-10 flex items-center justify-between">
            <div class="cursor-pointer active:scale-90 p-1 -ml-1" onclick="window.cpActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8 text-gray-800"></i></div>
            <div class="w-8"></div>
         </div>
         <div class="flex-1 overflow-y-auto hide-scrollbar pb-12">
            <div class="flex items-center justify-center pt-2 pb-10">
               <div class="flex flex-col items-center">
                  <div class="w-20 h-20 rounded-full overflow-hidden shadow-lg border-[3px] border-white z-10 bg-gray-100">${getVidHtml(myAvatar)}</div>
                  <span class="text-[12px] font-extrabold text-gray-800 mt-3 tracking-widest">${store.personas[0].name}</span>
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
               <div class="flex flex-col items-center cursor-pointer active:scale-90 transition-transform opacity-80 hover:opacity-100" onclick="window.cpActions.notBuilt('定位共享')">
                  <i data-lucide="map-pin" class="w-[28px] h-[28px] text-blue-400 mb-2 stroke-[1.5]"></i>
                  <span class="text-[11px] font-extrabold text-gray-600 tracking-wider">定位共享</span>
               </div>
               <div class="flex flex-col items-center cursor-pointer active:scale-90 transition-transform opacity-80 hover:opacity-100" onclick="window.cpActions.notBuilt('提问箱')">
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
         <div class="flex-1 overflow-y-auto px-5 py-4 hide-scrollbar pb-12">
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
                        ${a.daysLeft > 0 ? `<span class="text-4xl font-black text-rose-400 font-serif drop-shadow-sm leading-none">${a.daysLeft}<span class="text-[12px] font-bold ml-1 text-rose-300 font-sans">天</span></span>` : '<span class="text-[16px] font-black text-rose-400 font-serif tracking-widest mt-1.5">就是今天</span>'}
                     </div>
                  </div>
                  <div class="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-2 bg-rose-50 rounded-full" onclick="window.cpActions.deleteAnniversary(${a.id})">
                      <i data-lucide="trash-2" class="w-4 h-4 text-rose-400"></i>
                  </div>
               </div>
            `).join('')}
         </div>
         ${cpState.showAddModal ? `...此处弹窗代码保持不变...` : ''}
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
        /* 强行阻断 main.js 的背景污染，固定日记本底层色彩 */
        #cp-diary-container { background-image: none !important; background-color: ${cfg.theme==='dark'?'#1a1c23':(cfg.theme==='vintage'?'#f4ebd0':(cfg.theme==='romance'?'#fff0f5':'#f8f9fa'))} !important; }
        /* 纸张纹理引擎 */
        .paper-lined { background-image: repeating-linear-gradient(transparent, transparent calc(${cfg.lineHeight}em - 1px), rgba(0,0,0,0.06) calc(${cfg.lineHeight}em - 1px), rgba(0,0,0,0.06) ${cfg.lineHeight}em) !important; background-attachment: local; }
        .paper-grid { background-image: linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px) !important; background-size: 1.5em 1.5em !important; background-attachment: local; }
        .paper-dotted { background-image: radial-gradient(rgba(0,0,0,0.08) 1.5px, transparent 1.5px) !important; background-size: 1.5em 1.5em !important; background-attachment: local; }
        .paper-blank { background: transparent !important; }
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

     return `
      <div id="cp-diary-container" class="w-full h-full flex flex-col relative animate-in slide-in-from-right-4 duration-300 z-[60] transition-colors paper-${cfg.paper}">
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

         <div class="flex-1 overflow-y-auto px-6 pb-6 hide-scrollbar relative"
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
               
               ${diary && diary.content ? `
                   <div class="${t.font} ${t.text} text-[15px] flex-1" style="letter-spacing: ${cfg.letterSpacing}; line-height: ${cfg.lineHeight}; pb-8">
                       ${renderDiaryContent(diary.content, cfg)}
                   </div>
               ` : ''}
               
               ${diary && (diary.comments || []).length > 0 ? `
                   <div class="mt-8 pt-6 border-t ${isDark?'border-gray-700/50':'border-gray-300/30'} flex flex-col space-y-8" onclick="event.stopPropagation()">
                      ${diary.comments.map((c, idx) => `
                          <div class="flex flex-col">
                              <span class="text-[11px] font-bold ${isDark?'text-gray-500':'text-gray-400'} mb-3 ${c.sender === 'me' ? 'text-right' : 'text-left'}">— ${c.sender === 'me' ? store.personas[0].name : char.name} 的批注/共写 · ${c.time} —</span>
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
            
            ${(!diary || (!diary.content && (!diary.comments || diary.comments.length === 0))) && cpState.diaryDate === logicalToday ? `
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
                             <input id="diary-time-input" type="time" value="${cfg.time}" class="w-full bg-white border border-gray-200 rounded-[12px] p-2.5 outline-none text-[13px] text-gray-800 shadow-sm">
                         </div>
                         <div>
                             <span class="text-[11px] font-bold text-gray-500 mb-1 block uppercase tracking-widest">整体风格</span>
                             <select id="diary-theme-select" class="w-full bg-white border border-gray-200 rounded-[12px] p-2.5 outline-none text-[13px] text-gray-800 shadow-sm">
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
                         <select id="diary-paper-select" class="w-full bg-white border border-gray-200 rounded-[12px] p-2.5 outline-none text-[13px] text-gray-800 shadow-sm">
                             <option value="blank" ${cfg.paper==='blank'?'selected':''}>空白无痕</option>
                             <option value="lined" ${cfg.paper==='lined'?'selected':''}>横线信笺</option>
                             <option value="grid" ${cfg.paper==='grid'?'selected':''}>网格笔记</option>
                             <option value="dotted" ${cfg.paper==='dotted'?'selected':''}>点阵手帐</option>
                         </select>
                     </div>
                     <div class="grid grid-cols-3 gap-3">
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">字距</span>
                             <select id="diary-ls-select" class="w-full bg-white border border-gray-200 rounded-lg p-2 outline-none text-[12px] text-gray-800 shadow-sm">
                                 <option value="normal" ${cfg.letterSpacing==='normal'?'selected':''}>默认</option>
                                 <option value="1px" ${cfg.letterSpacing==='1px'?'selected':''}>宽松</option>
                                 <option value="2px" ${cfg.letterSpacing==='2px'?'selected':''}>极宽</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">行距</span>
                             <select id="diary-lh-select" class="w-full bg-white border border-gray-200 rounded-lg p-2 outline-none text-[12px] text-gray-800 shadow-sm">
                                 <option value="1.5" ${cfg.lineHeight==='1.5'?'selected':''}>紧凑</option>
                                 <option value="1.8" ${cfg.lineHeight==='1.8'?'selected':''}>舒适</option>
                                 <option value="2.2" ${cfg.lineHeight==='2.2'?'selected':''}>散文</option>
                             </select>
                         </div>
                         <div>
                             <span class="text-[10px] font-bold text-gray-500 mb-1 block">缩进</span>
                             <select id="diary-ti-select" class="w-full bg-white border border-gray-200 rounded-lg p-2 outline-none text-[12px] text-gray-800 shadow-sm">
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
}