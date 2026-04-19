// js/apps/memory.js
import { store } from '../store.js';

if (!store.memories) {
  store.memories = []; 
}

const memState = {
  view: 'list',       
  activeTab: 'core',  
  activeCharId: null, 
  editingId: null,
  isOrganizing: false
};

if (!window.memActions) {
  window.memActions = {
    closeApp: () => { window.actions.setCurrentApp(null); },
    switchTab: (tab) => { memState.activeTab = tab; window.render(); },
    switchChar: (charId) => { memState.activeCharId = charId; window.render(); },
    
    openEdit: (id = null) => {
      if (!memState.activeCharId) return window.actions.showToast('请先在通讯录添加角色哦');
      memState.editingId = id; 
      memState.view = 'edit'; 
      window.render(); 
    },
    closeEdit: () => { memState.view = 'list'; memState.editingId = null; window.render(); },

    deleteMemory: (id) => {
      if (confirm('确定要删除这条记忆吗？')) {
        store.memories = store.memories.filter(x => x.id !== id);
        if (window.actions.saveStore) window.actions.saveStore();
        window.actions.showToast('记忆已擦除');
        window.render();
      }
    },

    saveMemory: () => {
      const content = document.getElementById('mem-edit-content').value.trim();
      const keywords = document.getElementById('mem-edit-keywords')?.value.trim() || '';

      if (!content) return window.actions.showToast('记忆内容不能为空哦！');

      if (memState.editingId) {
        const idx = store.memories.findIndex(x => x.id === memState.editingId);
        if (idx !== -1) {
          store.memories[idx].content = content;
          store.memories[idx].keywords = keywords;
          store.memories[idx].isOrganized = false; 
        }
      } else {
        let eventTime = Date.now();
        const dateMatch = content.match(/^\[(\d{4})\/(\d{1,2})\/(\d{1,2})\]/);
        if (dateMatch) {
            eventTime = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3])).getTime();
        }

        store.memories.push({
          id: Date.now(),
          charId: memState.activeCharId,
          type: memState.activeTab,
          content: content,
          keywords: keywords,
          createdAt: eventTime,
          isOrganized: false
        });
      }
      if (window.actions.saveStore) window.actions.saveStore();
      window.actions.showToast('记忆保存成功');
      window.memActions.closeEdit();
    },

    organizeMemories: async (type) => {
        const charId = memState.activeCharId;
        if (!charId) return;
        
        const targetList = store.memories.filter(m => m.charId === charId && m.type === type && !m.isOrganized);
        
        if (targetList.length === 0) return window.actions.showToast('这里目前没有【未整理】的新记忆哦');
        if (!store.apiConfig?.apiKey) return window.actions.showToast('请先配置 API 才能使用 AI 整理功能');

        const char = store.contacts.find(c => c.id === charId);
        const chat = store.chats?.find(c => c.charId === charId);
        const pId = chat?.boundPersonaId || char?.boundPersonaId || store.personas[0].id;
        const p = store.personas.find(x => x.id === pId) || store.personas[0];
        const myName = p.name;
        const charName = char.name;

        memState.isOrganizing = true;
        window.render();

        try {
            const memoryData = targetList.map((f, i) => `[条目${i+1}] ${f.keywords ? `标签：${f.keywords}\n` : ''}内容：${f.content}`).join('\n\n');
            
            const isCore = type === 'core';
            
            // 🌟 暴力的两字触发词限制
            const keywordInstruction = isCore ? '' : `\n4. 🌟 极简触发词重构：【极其重要！】必须是日常聊天中最容易出现的【2字或3字词语】（如：做饭, 吵架, 电影, 散步, 吃醋, 晚安）！绝不能用四字成语或长句总结！你要思考的是“用户在微信里随意打出哪两个字时，我需要被唤醒这件事？”用英文逗号分隔。\n❗绝对禁令：触发关键词中【绝对禁止】出现具体名字（禁止使用：${myName}, ${charName}, 我, 你, 他, 她）！`;
            
            const jsonFormat = isCore ? `[\n  {\n    "content": "我视角下的整合记忆内容..."\n  }\n]` : `[\n  {\n    "content": "我视角下的整合记忆内容...",\n    "keywords": "两字,高频,口语"\n  }\n]`;

            // 🌟 暴力的时间段拆分逻辑
            const task = `你现在是【${charName}】的潜意识处理器。请整理并合并以下关于我（${charName}）与你（用户 ${myName}）的“${isCore ? '核心' : '碎片'}”记忆。

【整理人称与逻辑要求】：
1. 🌟 第一人称视角：你【必须】以【${charName}】的身份写这段记忆。用“我”指代自己，用“你”指代用户（${myName}）。
2. 🌟 强制时间拆分法则（极其重要！）：
   - ✅【可以合并】：只有当几条碎片发生在【同一个时间段的同一场景】（例如全都是今天下午在游乐园），才能揉合成一条记忆！
   - ❌【必须拆分】：如果两条记忆发生在【同一天的不同时间段】（比如下午去玩，晚上吵架），或者中间有明显的时间停顿，它们【必须】被拆分为独立的多个 JSON 对象！绝对不允许把一整天的流水账强行塞进一条内容里！
3. 🌟 文字调性：完整但简洁。写清楚事情的前因后果、经过以及关键瞬间。带入情感，但禁止啰嗦和堆砌修辞。
4. 🌟 时间线保留：在每条输出的 content 开头，必须加上时间戳（例如 [2026/4/18] ）。${keywordInstruction}

【待整理列表】：
${memoryData}

请严格输出 JSON 数组格式（不要带有 markdown 标记，直接输出数组）：
${jsonFormat}`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: task }] })
            });

            const data = await res.json();
            let text = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            const match = text.match(/\[[\s\S]*\]/);
            if (!match) throw new Error('AI 返回的数据格式不符合 JSON 数组规范');
            
            const newMemories = JSON.parse(match[0]);

            const targetIds = targetList.map(m => m.id);
            store.memories = store.memories.filter(m => !targetIds.includes(m.id));
            
            const dateStr = new Date().toLocaleDateString('zh-CN');

            newMemories.forEach((nm, index) => {
                let finalContent = nm.content;
                if (!/^\[\d{4}\/\d{1,2}\/\d{1,2}\]/.test(finalContent)) {
                    finalContent = `[${dateStr}] ${finalContent}`;
                }

                let eventTime = Date.now();
                const dateMatch = finalContent.match(/^\[(\d{4})\/(\d{1,2})\/(\d{1,2})\]/);
                if (dateMatch) {
                    const y = parseInt(dateMatch[1]);
                    const m = parseInt(dateMatch[2]) - 1;
                    const d = parseInt(dateMatch[3]);
                    eventTime = new Date(y, m, d).getTime() + (newMemories.length - index);
                }

                store.memories.push({
                    id: Date.now() + Math.floor(Math.random() * 1000) + index,
                    charId: charId,
                    type: type,
                    content: finalContent,
                    keywords: nm.keywords || '',
                    createdAt: eventTime,
                    isOrganized: true 
                });
            });

            if (window.actions.saveStore) window.actions.saveStore();
            window.actions.showToast(`✅ ${isCore ? '核心' : '碎片'}记忆整理完毕！`);
        } catch (err) {
            console.error(err);
            window.actions.showToast('❌ 整理失败，大模型脑细胞烧坏了');
        } finally {
            memState.isOrganizing = false;
            window.render();
        }
    }
  };
}

export function renderMemoryApp(store) {
  if (!memState.activeCharId && store.contacts && store.contacts.length > 0) {
    memState.activeCharId = store.contacts[0].id;
  }

  if (memState.view === 'list') {
    let currentList = store.memories.filter(m => m.charId === memState.activeCharId && m.type === memState.activeTab);
    currentList.sort((a, b) => b.createdAt - a.createdAt);
    
    const unorganizedCount = currentList.filter(m => !m.isOrganized).length;

    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-2 duration-200 z-50">
        
        <div class="bg-white/80 backdrop-blur-md px-4 pt-8 pb-3 flex justify-between items-center shadow-sm relative z-20">
          <div class="flex items-center cursor-pointer active:opacity-50" onclick="window.memActions.closeApp()">
             <i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i>
          </div>
          <span class="absolute left-1/2 -translate-x-1/2 font-black text-gray-800 text-[17px]">记忆库</span>
          <div class="flex items-center text-gray-800">
             <i data-lucide="plus" class="w-6 h-6 cursor-pointer active:scale-90" onclick="window.memActions.openEdit()"></i>
          </div>
        </div>

        <div class="bg-white border-b border-gray-100 px-3 py-2.5 flex overflow-x-auto hide-scrollbar space-x-2.5 z-10">
           ${store.contacts.map(c => `
              <div class="whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-bold cursor-pointer transition-colors ${memState.activeCharId === c.id ? 'bg-gray-800 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}" onclick="window.memActions.switchChar('${c.id}')">
                 ${c.name}
              </div>
           `).join('')}
           ${store.contacts.length === 0 ? '<span class="text-xs text-gray-600 p-2">请先前往通讯录添加角色</span>' : ''}
        </div>

        <div id="memory-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3 pb-24">
           
           <div class="flex justify-between items-center px-1 mb-2 mt-1">
               <p class="text-[10px] text-gray-400 font-bold tracking-widest mt-1">
                   ${memState.activeTab === 'core' ? '核心记忆永久生效' : '碎片记忆在聊到关键词时唤醒'}
               </p>
               <button class="${unorganizedCount > 0 ? 'bg-yellow-50 text-yellow-600 border border-yellow-200/50' : 'bg-gray-100 text-gray-400 border border-gray-200 opacity-70'} px-2.5 py-1.5 rounded-[8px] text-[11px] font-bold active:scale-95 flex items-center shadow-sm transition-transform" onclick="window.memActions.organizeMemories('${memState.activeTab}')">
                   ${memState.isOrganizing ? '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin mr-1"></i>整理中...' : `<i data-lucide="sparkles" class="w-3.5 h-3.5 mr-1"></i>AI 整理 ${unorganizedCount > 0 ? `(${unorganizedCount})` : ''}`}
               </button>
           </div>
           
           ${currentList.map(item => `
              <div class="bg-white rounded-[16px] p-4 flex flex-col shadow-sm border ${item.isOrganized ? 'border-yellow-200/50 bg-yellow-50/10' : 'border-gray-100'}">
                 <div class="flex-1 text-[14px] text-gray-800 leading-relaxed font-medium mb-3 whitespace-pre-wrap">${item.content}</div>
                 
                 <div class="flex items-end justify-between border-t border-gray-50 pt-3">
                    <div class="flex-1 mr-2">
                       ${item.type === 'fragment' ? `<span class="text-[10px] font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded-[6px] break-all"><i data-lucide="key" class="inline-block w-3 h-3 mr-1 mb-0.5"></i>${item.keywords || '无关键词'}</span>` : '<span class="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-[6px]"><i data-lucide="brain-circuit" class="inline-block w-3 h-3 mr-1 mb-0.5"></i>核心记忆</span>'}
                       ${item.isOrganized ? '<span class="text-[9px] font-bold text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded-[4px] ml-1"><i data-lucide="check-circle" class="inline-block w-2.5 h-2.5 mr-0.5 mb-0.5"></i>已整理</span>' : ''}
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                       <div class="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer active:scale-90 transition-colors" onclick="window.memActions.openEdit(${item.id})">
                          <i data-lucide="edit-3" class="w-4 h-4 text-gray-800"></i>
                       </div>
                       <div class="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer active:scale-90 transition-colors" onclick="window.memActions.deleteMemory(${item.id})">
                          <i data-lucide="trash-2" class="w-4 h-4 text-gray-800"></i>
                       </div>
                    </div>
                 </div>
              </div>
           `).join('')}
           ${currentList.length === 0 ? '<div class="flex flex-col items-center justify-center mt-20 opacity-50"><i data-lucide="inbox" class="w-12 h-12 text-gray-300 mb-2"></i><span class="text-xs text-gray-600 font-bold tracking-widest">还没有任何记忆哦</span></div>' : ''}
        </div>

        <div class="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 flex justify-around items-center pt-2 pb-6 px-2 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-20">
           <div class="flex flex-col items-center space-y-1 cursor-pointer w-24 ${memState.activeTab === 'core' ? 'text-red-500' : 'text-gray-600'}" onclick="window.memActions.switchTab('core')">
              <i data-lucide="brain-circuit" style="width: 22px; height: 22px;"></i>
              <span class="text-[11px] font-bold">核心记忆</span>
           </div>
           <div class="flex flex-col items-center space-y-1 cursor-pointer w-24 ${memState.activeTab === 'fragment' ? 'text-yellow-500' : 'text-gray-600'}" onclick="window.memActions.switchTab('fragment')">
              <i data-lucide="puzzle" style="width: 22px; height: 22px;"></i>
              <span class="text-[11px] font-bold">碎片记忆</span>
           </div>
        </div>

      </div>
    `;
  }

  const data = memState.editingId ? store.memories.find(x => x.id === memState.editingId) : { content: '', keywords: '' };

  return `
    <div class="w-full h-full bg-[#f9f9f9] flex flex-col relative animate-in slide-in-from-bottom-4 duration-300 z-[60]">
      <div class="bg-white px-4 pt-12 pb-3 flex justify-between items-center shadow-sm relative shrink-0">
        <div class="cursor-pointer active:opacity-50 p-1" onclick="window.memActions.closeEdit()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-600"></i></div>
        <span class="absolute left-1/2 -translate-x-1/2 font-black text-gray-800 text-[16px]">${memState.editingId ? '编辑记忆' : '提取新记忆'}</span>
        <div class="cursor-pointer active:opacity-50 p-1" onclick="window.memActions.saveMemory()"><i data-lucide="check" class="w-6 h-6 text-gray-800"></i></div>
      </div>

      <div class="flex-1 flex flex-col overflow-y-auto p-5 space-y-5 hide-scrollbar pb-10">
        
        <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between shrink-0">
           <span class="text-[14px] font-bold text-gray-700">所属角色</span>
           ${(() => {
             const char = store.contacts.find(c => c.id === memState.activeCharId);
             return char ? `<span class="text-[14px] font-bold text-gray-800">${char.name}</span>` : '';
           })()}
        </div>

        ${memState.activeTab === 'fragment' ? `
          <div class="space-y-2 shrink-0">
            <span class="text-[12px] font-black text-gray-600 uppercase tracking-widest">触发关键词 (用英文逗号分隔)</span>
            <input id="mem-edit-keywords" type="text" value="${data.keywords}" class="w-full bg-white border border-gray-100 rounded-xl p-3.5 outline-none text-[15px] font-medium shadow-sm" placeholder="例如：滑雪,瑞士,冬天" />
          </div>
        ` : ''}

        <div class="flex-1 flex flex-col space-y-2 min-h-[200px]">
          <span class="text-[12px] font-black text-gray-600 uppercase tracking-widest shrink-0">记忆内容</span>
          <textarea id="mem-edit-content" class="w-full flex-1 bg-white border border-gray-100 rounded-xl p-4 outline-none text-[14px] font-medium leading-relaxed shadow-sm resize-none hide-scrollbar" placeholder="${memState.activeTab === 'core' ? '输入角色的核心人物关系或不可磨灭的背景...' : '客观地描述发生的一件事情...'}">${data.content}</textarea>
        </div>
      </div>
    </div>
  `;
}