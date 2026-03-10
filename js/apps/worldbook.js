// js/apps/worldbook.js
import { store } from '../store.js';

// 🌟 初始化三系独立分组引擎 (去掉了默认分组)
if (!store.worldbooks) store.worldbooks = [];
if (!store.wbGroups || Array.isArray(store.wbGroups)) {
  store.wbGroups = {
    global: [],
    local: [],
    trigger: []
  };
}

const wbState = {
  view: 'list',       
  activeTab: 'global', 
  activeGroup: '全部',
  editingId: null,      
  showGroupModal: false
};

if (!window.wbActions) {
  window.wbActions = {
    closeApp: () => { window.actions.setCurrentApp(null); },
    switchTab: (tab) => { wbState.activeTab = tab; wbState.activeGroup = '全部'; window.render(); },
    switchGroup: (g) => { wbState.activeGroup = g; window.render(); },
    openEdit: (id = null) => { wbState.editingId = id; wbState.view = 'edit'; window.render(); },
    closeEdit: () => { wbState.view = 'list'; wbState.editingId = null; window.render(); },
    
    toggleEnable: (id) => { 
      const item = store.worldbooks.find(x => x.id === id);
      if (item) item.enabled = !item.enabled;
      window.render();
    },

    openGroupModal: () => { wbState.showGroupModal = true; window.render(); },
    closeGroupModal: () => { wbState.showGroupModal = false; window.render(); },
    addGroup: () => {
      const name = prompt(`为【${wbState.activeTab==='global'?'全局':wbState.activeTab==='local'?'局部':'触发'}】模式新建分组：`);
      if (name && name.trim()) {
        const currentGroups = store.wbGroups[wbState.activeTab];
        if (!currentGroups.includes(name.trim())) {
          currentGroups.push(name.trim());
          window.actions.showToast('分组创建成功');
          window.render();
        } else {
          window.actions.showToast('分组已存在');
        }
      }
    },
    // 🌟 修复：允许删除任何分组，并自动转移词条
    deleteGroup: (gName) => {
      const currentGroups = store.wbGroups[wbState.activeTab];
      if (currentGroups.length <= 1) return window.actions.showToast('至少要保留一个分组哦');
      
      const fallbackGroup = currentGroups[0] === gName ? currentGroups[1] : currentGroups[0];
      if (confirm(`确定删除分组 [${gName}] 吗？\n删除后该分组下的词条将被自动移至 [${fallbackGroup}]。`)) {
        store.wbGroups[wbState.activeTab] = currentGroups.filter(g => g !== gName);
        store.worldbooks.forEach(wb => {
          if (wb.type === wbState.activeTab && wb.group === gName) wb.group = fallbackGroup;
        });
        if (wbState.activeGroup === gName) wbState.activeGroup = '全部';
        window.actions.showToast('已删除');
        window.render();
      }
    },

    deleteEntry: (id) => {
      if (confirm('确定要彻底删除这条设定吗？此操作不可逆哦！')) {
        store.worldbooks = store.worldbooks.filter(x => x.id !== id);
        window.actions.showToast('词条已删除');
        window.render();
      }
    },

    saveEntry: () => {
      const title = document.getElementById('wb-edit-title').value.trim();
      const content = document.getElementById('wb-edit-content').value.trim();
      const group = document.getElementById('wb-edit-group').value;
      const position = document.getElementById('wb-edit-pos').value;
      const keywords = document.getElementById('wb-edit-keywords')?.value.trim() || '';

      if (!title || !content) return window.actions.showToast('标题和设定都不能为空哦！');

      if (wbState.editingId) {
        const idx = store.worldbooks.findIndex(x => x.id === wbState.editingId);
        store.worldbooks[idx] = { ...store.worldbooks[idx], title, content, group, position, keywords };
      } else {
        store.worldbooks.push({
          id: Date.now(), title, content, group, position, keywords,
          type: wbState.activeTab, enabled: true, createdAt: Date.now()
        });
      }
      window.actions.showToast('保存成功');
      wbActions.closeEdit();
    }
  };
}

export function renderWorldbookApp(store) {
  const globalStyles = `
    <style>
      .ios-switch { position: relative; width: 42px; height: 24px; appearance: none; background: #e5e5ea; border-radius: 24px; cursor: pointer; transition: background 0.3s; outline: none; }
      .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: transform 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .ios-switch:checked { background: #34c759; }
      .ios-switch:checked::after { transform: translateX(18px); }
    </style>
  `;

  if (wbState.view === 'list') {
    let currentList = store.worldbooks.filter(wb => wb.type === wbState.activeTab);
    if (wbState.activeGroup !== '全部') {
      currentList = currentList.filter(wb => wb.group === wbState.activeGroup);
    }
    currentList.sort((a, b) => (b.enabled - a.enabled) || (b.createdAt - a.createdAt));

    return `
      ${globalStyles}
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-2 duration-200 z-50">
        <div class="bg-white px-4 pt-12 pb-3 flex justify-between items-center shadow-sm relative z-20">
          <div class="flex items-center cursor-pointer active:opacity-50" onclick="window.wbActions.closeApp()"><i data-lucide="chevron-left" class="w-6 h-6"></i></div>
          <span class="absolute left-1/2 -translate-x-1/2 font-bold text-gray-800 text-[20px]">世界书</span>
          <div class="flex items-center space-x-4 text-gray-800">
             <i data-lucide="folder-cog" class="w-5 h-5 cursor-pointer active:scale-90" onclick="window.wbActions.openGroupModal()"></i>
             <i data-lucide="plus" class="w-6 h-6 cursor-pointer active:scale-90" onclick="window.wbActions.openEdit()"></i>
          </div>
        </div>

        <div class="bg-white border-b border-gray-100 px-3 py-2.5 flex overflow-x-auto hide-scrollbar space-x-2.5 z-10">
           ${['全部', ...store.wbGroups[wbState.activeTab]].map(g => `
              <div class="whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12px] font-bold cursor-pointer transition-colors ${wbState.activeGroup === g ? 'bg-gray-800 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}" onclick="window.wbActions.switchGroup('${g}')">${g}</div>
           `).join('')}
        </div>

        <div class="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3 pb-24">
           ${currentList.map(item => `
              <div class="bg-white rounded-[16px] p-4 flex justify-between items-center shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform" onclick="window.wbActions.openEdit(${item.id})">
                 <div class="flex flex-col flex-1 overflow-hidden mr-3">
                    <span class="font-extrabold text-gray-800 text-[16px] truncate ${item.enabled ? '' : 'text-gray-400'}">${item.title}</span>
                    <div class="flex items-center space-x-2 mt-1">
                       <span class="text-[9px] font-medium text-[#07c160] bg-[#07c160]/10 px-1.5 py-0.5 rounded">${item.group}</span>
                       <span class="text-[9px] font-bold text-gray-600">位置：${item.position === 'front' ? '前置' : (item.position === 'middle' ? '中间' : '后置')}</span>
                    </div>
                 </div>
                 <div class="flex items-center space-x-3 shrink-0" onclick="event.stopPropagation()">
                    <input type="checkbox" class="ios-switch" ${item.enabled ? 'checked' : ''} onchange="window.wbActions.toggleEnable(${item.id})" />
                    <div class="p-1.5 rounded-full hover:bg-red-50 active:scale-90 transition-transform cursor-pointer" onclick="window.wbActions.deleteEntry(${item.id})">
                       <i data-lucide="trash-2" class="w-4 h-4 text-red-400"></i>
                    </div>
                 </div>
              </div>
           `).join('')}
           ${currentList.length === 0 ? '<div class="text-center text-gray-600 mt-20 text-xs font-bold tracking-widest opacity-50">该分类下暂无词条</div>' : ''}
        </div>

        <div class="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-100 flex justify-around items-center pt-2 pb-6 px-2 shadow-lg z-20">
           <div class="flex flex-col items-center space-y-1 cursor-pointer w-20 ${wbState.activeTab === 'global' ? 'text-gray-800' : 'text-gray-400'}" onclick="window.wbActions.switchTab('global')"><i data-lucide="globe-2" style="width:20px;"></i><span class="text-[10px] font-bold">全局</span></div>
           <div class="flex flex-col items-center space-y-1 cursor-pointer w-20 ${wbState.activeTab === 'local' ? 'text-gray-800' : 'text-gray-400'}" onclick="window.wbActions.switchTab('local')"><i data-lucide="user-cog" style="width:20px;"></i><span class="text-[10px] font-bold">局部</span></div>
           <div class="flex flex-col items-center space-y-1 cursor-pointer w-20 ${wbState.activeTab === 'trigger' ? 'text-gray-800' : 'text-gray-400'}" onclick="window.wbActions.switchTab('trigger')"><i data-lucide="zap" style="width:20px;"></i><span class="text-[10px] font-bold">触发</span></div>
        </div>

        ${wbState.showGroupModal ? `
          <div class="absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm" onclick="window.wbActions.closeGroupModal()">
             <div class="bg-[#f3f3f3] w-[85%] max-w-[320px] rounded-[20px] overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[70vh]" onclick="event.stopPropagation()">
                <div class="bg-white px-4 py-4 flex justify-between items-center border-b border-gray-100">
                   <div class="w-6"></div>
                   <span class="font-bold text-gray-800 text-[16px]">管理分组</span>
                   <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.wbActions.closeGroupModal()"></i>
                </div>
                <div class="flex-1 overflow-y-auto p-3 bg-[#f3f3f3] space-y-2 hide-scrollbar">
                   ${store.wbGroups[wbState.activeTab].map(g => `
                      <div class="bg-white rounded-xl p-4 flex justify-between items-center shadow-sm">
                         <span class="text-[14px] font-bold text-gray-800">${g}</span>
                         <div class="p-1 rounded-full bg-red-50 cursor-pointer active:scale-90 transition-transform" onclick="window.wbActions.deleteGroup('${g}')">
                            <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
                         </div>
                      </div>
                   `).join('')}
                </div>
                <div class="p-4 bg-white border-t border-gray-100">
                   <div class="w-full py-3 bg-[#07c160]/10 text-[#07c160] font-bold rounded-xl text-center text-[14px] cursor-pointer active:bg-[#07c160]/20 transition-colors flex justify-center items-center" onclick="window.wbActions.addGroup()">
                      <i data-lucide="plus" class="w-4 h-4 mr-1"></i> 新建分组
                   </div>
                </div>
             </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 🌟 修复：默认分组动态读取当前 Tab 的第一个分组
  const data = wbState.editingId ? store.worldbooks.find(x => x.id === wbState.editingId) : { title: '', content: '', group: store.wbGroups[wbState.activeTab][0], position: 'front', keywords: '' };

  return `
    <div class="w-full h-full bg-[#f9f9f9] flex flex-col relative animate-in slide-in-from-bottom-4 duration-300 z-[60]">
      <div class="bg-white px-4 pt-12 pb-3 flex justify-between items-center shadow-sm relative shrink-0">
        <div class="cursor-pointer active:opacity-50" onclick="window.wbActions.closeEdit()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-600"></i></div>
        <span class="font-bold text-gray-800 text-[16px]">${wbState.editingId ? '编辑词条' : '新建词条'}</span>
        <div class="cursor-pointer active:opacity-50" onclick="window.wbActions.saveEntry()"><i data-lucide="check" class="w-6 h-6 text-gray-800"></i></div>
      </div>

      <div class="flex-1 flex flex-col overflow-y-auto p-5 space-y-5 hide-scrollbar pb-10">
        <div class="space-y-2 shrink-0">
          <span class="text-[12px] font-bold text-gray-600 uppercase tracking-widest">词条标题</span>
          <input id="wb-edit-title" type="text" value="${data.title}" class="w-full bg-white border border-gray-100 rounded-xl p-3.5 outline-none text-[15px] font-medium shadow-sm" />
        </div>

        ${wbState.activeTab === 'trigger' ? `
          <div class="space-y-2 shrink-0 animate-in fade-in">
            <span class="text-[12px] font-bold text-gray-600 uppercase tracking-widest">触发关键词 (英文逗号分隔)</span>
            <input id="wb-edit-keywords" type="text" value="${data.keywords}" class="w-full bg-blue-50/30 border border-blue-100 rounded-xl p-3.5 outline-none text-[14px] font-medium text-blue-600" />
          </div>
        ` : ''}

        <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4 shrink-0">
           <div class="flex justify-between items-center border-b border-gray-50 pb-4">
              <span class="text-[14px] font-bold text-gray-700">所属分组</span>
              <select id="wb-edit-group" class="bg-transparent outline-none text-[14px] font-medium text-[#07c160] text-right appearance-none cursor-pointer">
                 ${store.wbGroups[wbState.activeTab].map(g => `<option value="${g}" ${data.group === g ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
           </div>
           <div class="flex justify-between items-center">
              <span class="text-[14px] font-bold text-gray-700">插入位置</span>
              <select id="wb-edit-pos" class="bg-transparent outline-none text-[14px] font-medium text-gray-800 text-right appearance-none cursor-pointer">
                 <option value="front" ${data.position === 'front' ? 'selected' : ''}>前置 (注入前)</option>
                 <option value="middle" ${data.position === 'middle' ? 'selected' : ''}>中间 (注入后)</option>
                 <option value="back" ${data.position === 'back' ? 'selected' : ''}>后置 (尾端)</option>
              </select>
           </div>
        </div>

        <div class="flex-1 flex flex-col space-y-2 min-h-[200px]">
          <span class="text-[12px] font-bold text-gray-600 uppercase tracking-widest shrink-0">设定内容</span>
          <textarea id="wb-edit-content" class="w-full flex-1 bg-white border border-gray-100 rounded-xl p-4 outline-none text-[14px] font-medium leading-relaxed shadow-sm resize-none hide-scrollbar" >${data.content}</textarea>
        </div>
      </div>
    </div>
  `;
}