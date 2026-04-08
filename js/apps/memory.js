// js/apps/memory.js
import { store } from '../store.js';

if (!store.memories) {
  store.memories = []; 
}

const memState = {
  view: 'list',       
  activeTab: 'core',  
  activeCharId: null, 
  editingId: null     
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
        }
      } else {
        store.memories.push({
          id: Date.now(),
          charId: memState.activeCharId,
          type: memState.activeTab,
          content: content,
          keywords: keywords,
          createdAt: Date.now()
        });
      }
      window.actions.showToast('记忆保存成功');
      window.memActions.closeEdit();
    }
  };
}

export function renderMemoryApp(store) {
  if (!memState.activeCharId && store.contacts && store.contacts.length > 0) {
    memState.activeCharId = store.contacts[0].id;
  }

  // --- 场景 1：记忆列表页 ---
  if (memState.view === 'list') {
    let currentList = store.memories.filter(m => m.charId === memState.activeCharId && m.type === memState.activeTab);
    currentList.sort((a, b) => b.createdAt - a.createdAt);

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
           ${memState.activeTab === 'core' ? '<p class="text-[10px] text-gray-400 font-bold mb-1 px-1 tracking-widest">核心记忆永久生效</p>' : '<p class="text-[10px] text-gray-400 font-bold mb-1 px-1 tracking-widest">碎片记忆平时静默，当聊天中出现关键词时自动提取</p>'}
           
           ${currentList.map(item => `
              <div class="bg-white rounded-[16px] p-4 flex flex-col shadow-sm border border-gray-100">
                 <div class="flex-1 text-[14px] text-gray-800 leading-relaxed font-medium mb-3 whitespace-pre-wrap">${item.content}</div>
                 
                 <div class="flex items-end justify-between border-t border-gray-50 pt-3">
                    <div class="flex-1 mr-2">
                       ${item.type === 'fragment' ? `<span class="text-[10px] font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded-[6px] break-all"><i data-lucide="key" class="inline-block w-3 h-3 mr-1 mb-0.5"></i>${item.keywords || '无关键词'}</span>` : '<span class="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-[6px]"><i data-lucide="brain-circuit" class="inline-block w-3 h-3 mr-1 mb-0.5"></i>核心记忆</span>'}
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

  // --- 场景 2：新建/编辑页 ---
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