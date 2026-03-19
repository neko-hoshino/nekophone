// js/apps/appearance.js
import { store } from '../store.js';

if (!store.appearance) {
  store.appearance = {
    wallpaper: null, topBarBg: null, bottomBarBg: null,
    interfaceBg: null, 
    hideStatusBar: false, darkMode: false,
    sysFont: 'system-ui, -apple-system, sans-serif', sysFontSize: 14,
    newMsgSound: null, callSound: null, customIcons: {}, customButtons: {}
  };
}

const apState = { view: 'main' }; 

// 主界面App
const iconList = [
  { id: 'mc-icon-wechat', name: '桌面 - 微信', icon: 'message-circle' },
  { id: 'mc-icon-forum', name: '桌面 - 论坛', icon: 'messages-square' },
  { id: 'mc-icon-x', name: '桌面 - X', icon: 'twitter' },
  { id: 'mc-icon-diary', name: '桌面 - 情侣app', icon: 'book-heart' },
  { id: 'mc-icon-worldbook', name: 'Dock栏 - 世界书', icon: 'book-open' },
  { id: 'mc-icon-memory', name: 'Dock栏 - 记忆库', icon: 'brain' },
  { id: 'mc-icon-appearance', name: 'Dock栏 - 外观', icon: 'palette' },
  { id: 'mc-icon-settings', name: 'Dock栏 - 设置', icon: 'settings' }
];

// 聊天室里的各种功能键 + 扩展菜单
const buttonList = [
  { id: 'mc-btn-back', name: '聊天室 - 左上返回键', icon: 'chevron-left' },
  { id: 'mc-btn-more', name: '聊天室 - 右上菜单键', icon: 'more-horizontal' },
  { id: 'mc-btn-plus', name: '聊天室 - 底部加号', icon: 'plus-circle' },
  { id: 'mc-btn-emoji', name: '聊天室 - 表情包', icon: 'smile' },
  { id: 'mc-btn-send', name: '聊天室 - 发送信息', icon: 'send' },
  { id: 'mc-btn-ai', name: '聊天室 - 获取回复', icon: 'sparkles' },
  { id: 'mc-tool-reroll', name: '扩展 - 重roll回复', icon: 'refresh-cw' },
  { id: 'mc-tool-extract', name: '扩展 - 提取记忆', icon: 'brain-circuit' },
  { id: 'mc-tool-image', name: '扩展 - 发送图片', icon: 'image' },
  { id: 'mc-tool-camera', name: '扩展 - 虚拟拍照', icon: 'camera' },
  { id: 'mc-tool-mic', name: '扩展 - 发送语音', icon: 'mic' },
  { id: 'mc-tool-transfer', name: '扩展 - 发起转账', icon: 'credit-card' },
  { id: 'mc-tool-voicecall', name: '扩展 - 语音通话', icon: 'phone' },
  { id: 'mc-tool-videocall', name: '扩展 - 视频通话', icon: 'video' },
  { id: 'mc-tool-offline', name: '扩展 - 线下剧情', icon: 'coffee' }
];

if (!window.apActions) {
  window.apActions = {
    closeApp: () => { window.actions.setCurrentApp(null); },
    goBack: () => { apState.view = 'main'; window.render(); },
    goView: (v) => { apState.view = v; window.render(); },
    toggleStatusBar: () => { store.appearance.hideStatusBar = !store.appearance.hideStatusBar; window.render(); },
    toggleDarkMode: () => { store.appearance.darkMode = !store.appearance.darkMode; window.render(); }, // 深色模式
    updateFont: (key, val) => { store.appearance[key] = val; window.render(); },
    // 静默实时更新字号（绝对不重绘页面，防止拉条回弹）
    updateFontSizeRealtime: (val) => {
      document.getElementById('mc-font-size-display').innerText = val + 'px';
      let styleTag = document.getElementById('mc-realtime-font');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'mc-realtime-font';
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = `:root { --chat-font-size: ${val}px !important; }`;
    },
    // 松手时才保存数据
    saveFontSize: (val) => {
      store.appearance.sysFontSize = val;
      window.actions.showToast('字号已保存');
    },
    clearData: (key) => { store.appearance[key] = null; window.actions.showToast('已恢复默认'); window.render(); },
    
    handleImageUpload: (key, event) => {
      const file = event.target.files[0]; if (!file) return;
      // 接入全局压缩引擎
      window.actions.compressImage(file, (base64) => {
         store.appearance[key] = base64;
         window.actions.showToast('图片已极速加载！'); 
         window.render();
      });
      event.target.value = '';
    },

    handleItemUpload: (dictKey, itemId, event) => {
      const file = event.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height, max = 256;
          if (w > h && w > max) { h *= max/w; w = max; }
          else if (h > max) { w *= max/h; h = max; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          store.appearance[dictKey] = store.appearance[dictKey] || {};
          store.appearance[dictKey][itemId] = canvas.toDataURL('image/png');
          window.actions.showToast('组件已极速替换！'); window.render();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file); event.target.value = '';
    },
    
    clearItem: (dictKey, itemId) => {
      if(store.appearance[dictKey]) delete store.appearance[dictKey][itemId];
      window.actions.showToast('已恢复系统原生组件'); window.render();
    },

    clearAllItems: (dictKey) => {
      store.appearance[dictKey] = {};
      window.actions.showToast('已恢复全部原生组件'); 
      window.render();
    },

    handleAudioUpload: (key, event) => {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) return window.actions.showToast('音效文件不能超过 2MB 哦！');
      const reader = new FileReader();
      reader.onload = (e) => { store.appearance[key] = e.target.result; window.actions.showToast('音效设置成功！'); window.render(); };
      reader.readAsDataURL(file); event.target.value = '';
    }
  };
}

function renderUploadItem(title, icon, key, isAudio = false) {
  const hasData = store.appearance[key] ? true : false;
  const action = isAudio ? `window.apActions.handleAudioUpload('${key}', event)` : `window.apActions.handleImageUpload('${key}', event)`;
  return `
    <div class="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100 flex justify-between items-center transition-all">
      <div class="flex items-center flex-1 cursor-pointer" onclick="document.getElementById('ap-up-${key}').click()">
        <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mr-3"><i data-lucide="${icon}" class="w-4 h-4 text-blue-500"></i></div>
        <span class="text-[14px] font-bold text-gray-800">${title}</span>
      </div>
      <div class="flex items-center space-x-3">
        ${hasData ? `<div class="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer active:scale-90 transition-colors" onclick="window.apActions.clearData('${key}')"><i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i></div>` : ''}
        <span class="text-[11px] font-bold ${hasData ? 'text-[#07c160]' : 'text-gray-400'} cursor-pointer" onclick="document.getElementById('ap-up-${key}').click()">${hasData ? '已自定义' : '默认'}</span>
      </div>
      <input type="file" id="ap-up-${key}" accept="${isAudio ? 'audio/*' : 'image/*'}" class="hidden" onchange="${action}" />
    </div>
  `;
}

function renderGallery(dictKey, list) {
  return list.map(item => {
    const dict = store.appearance[dictKey] || {};
    const imgData = dict[item.id];
    return `
      <div class="bg-white rounded-[16px] p-4 flex items-center justify-between shadow-sm border border-gray-100 mb-3">
         <div class="flex items-center flex-1">
            <div class="w-12 h-12 rounded-[12px] bg-gray-50 flex items-center justify-center mr-4 shadow-inner overflow-hidden relative cursor-pointer active:scale-95 transition-transform" onclick="document.getElementById('up-${item.id}').click()">
               ${imgData ? `<img src="${imgData}" class="w-full h-full object-contain p-1 drop-shadow-sm" />` : `<i data-lucide="${item.icon}" class="w-6 h-6 text-gray-400"></i>`}
            </div>
            <div class="flex flex-col">
               <span class="text-[14px] font-bold text-gray-800">${item.name}</span>
               <span class="text-[10px] text-gray-400 mt-1 font-mono">${item.id}</span>
            </div>
         </div>
         <div class="flex space-x-2">
            ${imgData ? `<div class="p-2 bg-red-50 text-red-500 rounded-[10px] cursor-pointer active:scale-90 transition-transform" onclick="window.apActions.clearItem('${dictKey}', '${item.id}')"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></div>` : ''}
            <div class="p-2 bg-[#07c160] text-white rounded-[10px] cursor-pointer active:scale-90 transition-transform shadow-md" onclick="document.getElementById('up-${item.id}').click()"><i data-lucide="upload" class="w-4 h-4"></i></div>
         </div>
         <input type="file" id="up-${item.id}" accept="image/*" class="hidden" onchange="window.apActions.handleItemUpload('${dictKey}', '${item.id}', event)" />
      </div>
    `;
  }).join('');
}

export function renderAppearanceApp(store) {
  const ap = store.appearance;

  if (apState.view === 'icons' || apState.view === 'buttons') {
    const isIcon = apState.view === 'icons';
    return `
      <div class="w-full h-full bg-[#f6f7f9] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
        <div class="bg-white/80 backdrop-blur-md px-4 pt-12 pb-3 flex justify-between items-center shadow-sm relative shrink-0">
          <div class="cursor-pointer active:opacity-50 p-1" onclick="window.apActions.goBack()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i></div>
          <span class="absolute left-1/2 -translate-x-1/2 font-black text-gray-800 text-[16px]">${isIcon ? '更改主屏幕图标' : '更改全局交互按钮'}</span>
          <div class="w-6"></div>
        </div>
        <div id="icon-edit-scroll"class="flex-1 overflow-y-auto p-4 hide-scrollbar pb-20">
           <p class="text-[11px] text-gray-400 font-bold mb-4 px-1 tracking-widest">建议使用背景透明的 PNG 图片获得最佳效果</p>
           ${renderGallery(isIcon ? 'customIcons' : 'customButtons', isIcon ? iconList : buttonList)}
           <button onclick="window.apActions.clearAllItems('${isIcon ? 'customIcons' : 'customButtons'}')" class="w-full mt-6 py-3.5 bg-white text-red-500 font-bold rounded-2xl active:bg-red-50 transition-colors border border-red-100 shadow-sm flex items-center justify-center">
              <i data-lucide="rotate-ccw" class="w-4 h-4 mr-2"></i>一键恢复全部原生${isIcon ? '图标' : '按钮'}
           </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="w-full h-full bg-[#f6f7f9] flex flex-col relative animate-in slide-in-from-bottom-4 duration-300 z-50">
      <div class="bg-white/80 backdrop-blur-md px-4 pt-12 pb-3 flex justify-between items-center shadow-sm relative shrink-0 z-10">
        <div class="cursor-pointer active:opacity-50 p-1" onclick="window.apActions.closeApp()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i></div>
        <span class="absolute left-1/2 -translate-x-1/2 font-black text-gray-800 text-[17px] tracking-wide">外观与美化</span>
        <div class="w-6"></div>
      </div>

      <div id="appearance-scroll"class="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-6 pb-20">
        
        <div class="space-y-2">
          <span class="text-[11px] font-black text-gray-600 uppercase tracking-widest pl-2">全局背景图像</span>
          ${renderUploadItem('主屏幕壁纸', 'image', 'wallpaper')}
          ${renderUploadItem('全局顶栏背景图', 'layout-panel-top', 'topBarBg')}
          ${renderUploadItem('全局界面背景图', 'layout-template', 'interfaceBg')}
          ${renderUploadItem('全局底栏背景图', 'layout-panel-left', 'bottomBarBg')}
        </div>

        <div class="space-y-2">
           <span class="text-[11px] font-black text-gray-600 uppercase tracking-widest pl-2">主屏幕显示控制</span>
           <div class="bg-white rounded-t-2xl p-4 shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.apActions.toggleStatusBar()">
              <div class="flex items-center"><div class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mr-3"><i data-lucide="battery-medium" class="w-4 h-4 text-gray-600"></i></div><span class="text-[14px] font-bold text-gray-800">隐藏主屏幕状态栏</span></div>
              <div class="relative w-[42px] h-[24px] rounded-full transition-colors duration-300 ${ap.hideStatusBar ? 'bg-[#34c759]' : 'bg-[#e5e5ea]'}"><div class="absolute top-[2px] left-[2px] w-[20px] h-[20px] bg-white rounded-full transition-transform duration-300 shadow-sm ${ap.hideStatusBar ? 'translate-x-[18px]' : ''}"></div></div>
           </div>
           <div class="bg-white rounded-b-2xl p-4 shadow-sm border border-gray-100 border-t-0 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.apActions.toggleDarkMode()">
              <div class="flex items-center"><div class="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center mr-3"><i data-lucide="moon" class="w-4 h-4 text-white"></i></div><span class="text-[14px] font-bold text-gray-800">主屏幕深色主题</span></div>
              <div class="relative w-[42px] h-[24px] rounded-full transition-colors duration-300 ${ap.darkMode ? 'bg-[#34c759]' : 'bg-[#e5e5ea]'}"><div class="absolute top-[2px] left-[2px] w-[20px] h-[20px] bg-white rounded-full transition-transform duration-300 shadow-sm ${ap.darkMode ? 'translate-x-[18px]' : ''}"></div></div>
           </div>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-black text-gray-600 uppercase tracking-widest pl-2">深度组件定制 (图库引擎)</span>
          <div class="bg-white rounded-2xl p-4 mb-2 shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer active:bg-gray-50" onclick="window.apActions.goView('icons')">
             <div class="flex items-center"><div class="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center mr-3"><i data-lucide="layout-grid" class="w-4 h-4 text-purple-500"></i></div><span class="text-[14px] font-bold text-gray-800">更改主屏幕 App 图标</span></div>
             <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer active:bg-gray-50" onclick="window.apActions.goView('buttons')">
             <div class="flex items-center"><div class="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center mr-3"><i data-lucide="mouse-pointer-click" class="w-4 h-4 text-orange-500"></i></div><span class="text-[14px] font-bold text-gray-800">更改聊天室与扩展菜单按钮</span></div>
             <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-black text-gray-600 uppercase tracking-widest pl-2">排版引擎</span>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
             <div>
                <span class="text-[12px] font-bold text-gray-800 block mb-2">系统字体 (填自带字体名 或 TTF/WOFF直链)</span>
                <input type="text" value="${ap.sysFont}" onchange="window.apActions.updateFont('sysFont', this.value)" class="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 outline-none text-[13px] font-bold text-gray-800 focus:border-[#07c160]" placeholder="例如：Microsoft YaHei, 或 http://.../font.ttf" />
             </div>
             <div class="border-t border-gray-50 pt-4">
                <div class="flex justify-between items-center mb-2">
                   <span class="text-[12px] font-bold text-gray-800">全局字号基准</span>
                   <span id="mc-font-size-display" class="text-[13px] font-black text-gray-800">${ap.sysFontSize}px</span>
                </div>
                <input type="range" min="10" max="24" value="${ap.sysFontSize}" oninput="window.apActions.updateFontSizeRealtime(this.value)" onchange="window.apActions.saveFontSize(this.value)" class="w-full accent-[#07c160] h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
             </div>
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-black text-gray-600 uppercase tracking-widest pl-2">听觉反馈设置</span>
          ${renderUploadItem('收到新消息音效', 'message-circle', 'newMsgSound', true)}
          ${renderUploadItem('接到电话/视频音效', 'phone-call', 'callSound', true)}
        </div>

      </div>
    </div>
  `;
}