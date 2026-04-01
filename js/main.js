// js/main.js
import { store, DB } from './store.js';
import { renderHomeApp } from './apps/home.js';
import { renderSettingsApp } from './apps/setting.js';
import { renderWeChatApp } from './apps/wechat.js';
import { renderWorldbookApp } from './apps/worldbook.js';
import { renderMemoryApp } from './apps/memory.js';
import { renderAppearanceApp } from './apps/appearance.js';
import { renderCoupleApp } from './apps/couple.js';

// 🌟 核心：全局注入 iOS 开关样式，所有 App 均可白嫖！
if (!document.getElementById('global-ios-switch-css')) {
    const style = document.createElement('style');
    style.id = 'global-ios-switch-css';
    style.innerHTML = `
        .ios-switch { position: relative; width: 44px; height: 24px; appearance: none; background: #e5e5ea; border-radius: 24px; outline: none; cursor: pointer; transition: background 0.3s ease; }
        .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.3s ease; }
        .ios-switch:checked { background: #34c759; }
        .ios-switch:checked::after { transform: translateX(20px); }
    `;
    document.head.appendChild(style);
}

window.actions = {
  setCurrentApp: (appId) => {
    store.currentApp = appId;
    render(); 
  },
  showToast: (msg) => {
    const toastContainer = document.getElementById('toast-container');
    const toastMsg = document.getElementById('toast-msg');
    toastMsg.innerText = msg;
    toastContainer.classList.remove('hidden');
    setTimeout(() => toastContainer.classList.remove('opacity-0'), 10);
    setTimeout(() => {
      toastContainer.classList.add('opacity-0');
      setTimeout(() => toastContainer.classList.add('hidden'), 300);
    }, 2500);
  },
// 智能无损与高画质压缩 (5MB内原图直出，壁纸免压)
  compressImage: (source, callback, forceCompress = false) => {
     const processImage = (src, skipCompress = false) => {
        if (skipCompress) {
           callback(src); 
           return;
        }
        const img = new Image();
        img.onload = () => {
           const canvas = document.createElement('canvas');
           let w = img.width, h = img.height;
           // 头像强制压缩时限制为 800px，壁纸/照片放宽到 2560px (2K画质)
           const maxSize = forceCompress ? 800 : 2560; 
           if (w > h && w > maxSize) { h *= maxSize / w; w = maxSize; }
           else if (h > maxSize) { w *= maxSize / h; h = maxSize; }
           canvas.width = w; canvas.height = h;
           canvas.getContext('2d').drawImage(img, 0, 0, w, h);
           
           // 头像用 0.7 压缩率，壁纸用 0.95 的无损级高画质 WebP
           const quality = forceCompress ? 0.7 : 0.95;
           callback(canvas.toDataURL('image/webp', quality)); 
        };
        img.src = src;
     };

     if (source instanceof File || source instanceof Blob) {
         const reader = new FileReader();
         reader.onload = (e) => {
             // 小于 5MB (5242880 bytes) 且不是强制要求压缩时，直接原图无损保存！保留所有画质和透明度！
             if (source.size < 5 * 1024 * 1024 && !forceCompress) {
                 processImage(e.target.result, true); 
             } else {
                 processImage(e.target.result, false);
             }
         };
         reader.readAsDataURL(source);
     } else if (typeof source === 'string') {
         // 对于一键瘦身传入的 Base64 字符串处理 (5MB 原图转 Base64 约等于 6.6M 字符)
         if (source.length < 6.5 * 1024 * 1024 && !forceCompress) {
             processImage(source, true);
         } else {
             processImage(source, false);
         }
     }
  }
};
// ================= 全局消息通知引擎 (原生本地版) =================
window.actions.notify = (title, text, avatarUrl) => {
  // 1. 触发真实系统的弹窗通知 (受设置页的极简滑块控制)
  if ("Notification" in window && Notification.permission === "granted" && store.enableNotifications !== false) {
    try {
      new Notification(title, { 
         body: text, 
         icon: avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg' 
      });
    } catch(e) {
      console.log("本地推送失败", e);
    }
  }

  // 2. 游戏内顶部悬浮横幅 (你在看别的页面时依然会有内弹窗)
  let banner = document.getElementById('mc-ios-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'mc-ios-banner';
    banner.className = 'fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)] z-[999999] flex items-center transform transition-all duration-500 -translate-y-[200%] cursor-pointer border border-gray-100/50';
    banner.onclick = () => { window.actions.setCurrentApp('wechat'); banner.classList.add('-translate-y-[200%]'); };
    document.body.appendChild(banner);
  }
  
  let previewText = text;
  if (text.includes('[图片]')) previewText = '[发来一张照片]';
  else if (text.includes('[语音]')) previewText = '[发来一段语音]';
  
  const isImageAvatar = (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:')));
  const avatarImgHtml = isImageAvatar 
    ? `<img src="${avatarUrl}" class="w-11 h-11 rounded-[14px] mr-3 object-cover shadow-sm border border-gray-100" />`
    : `<div class="w-11 h-11 rounded-[14px] mr-3 bg-gray-100 flex items-center justify-center text-gray-400 font-bold border border-gray-200 shadow-sm text-[12px]">消息</div>`;

  banner.innerHTML = `
    ${avatarImgHtml}
    <div class="flex flex-col flex-1 overflow-hidden">
      <span class="text-[14px] font-bold text-gray-900">${title}</span>
      <span class="text-[12px] font-medium text-gray-500 truncate mt-0.5">${previewText}</span>
    </div>
  `;

  try {
    const ap = store.appearance || {};
    new Audio(ap.newMsgSound || 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3').play().catch(()=>{});
  } catch(e) {}

  setTimeout(() => banner.classList.remove('-translate-y-[200%]'), 50);
  setTimeout(() => banner.classList.add('-translate-y-[200%]'), 4000);
};
// 将 render 函数挂载到 window 上，方便各种内部 App 触发重绘
window.render = render; 

function updateTime() {
  const now = new Date();
  store.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.getElementById('status-time');
  if (timeEl) timeEl.innerText = store.currentTime;
}
if (!window.globalScrollStates) window.globalScrollStates = {};
function render() {
  // 记录滚动条（存入全局）
  document.querySelectorAll('[id$="-scroll"]').forEach(el => {
      window.globalScrollStates[el.id] = { top: el.scrollTop, left: el.scrollLeft };
  });
  
  // 记录所有带有 ID 的输入框的未保存内容和焦点状态（存入局部，防弹窗刷新清空）
  const tempInputs = {};
  document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
      if (el.type === 'file') return; // 跳过文件上传框
      if (el.type === 'checkbox') tempInputs[el.id] = el.checked;
      else tempInputs[el.id] = el.value;
  });
  
  // 记录键盘焦点和光标选区（防输入法掉落）
  const activeEl = document.activeElement;
  const focusId = activeEl && activeEl.id ? activeEl.id : null;
  let selStart = 0, selEnd = 0;
  if (focusId && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      try { selStart = activeEl.selectionStart; selEnd = activeEl.selectionEnd; } catch(e){}
  }
  // ================= 全局外观与图库引擎 =================
  const ap = store.appearance || {};
  let fontCss = '';
  
  if (ap.sysFont) {
    const fontName = ap.sysFont.includes('http') ? 'MC_CustomFont' : ap.sysFont;
    if (ap.sysFont.includes('http') && ap.sysFont.match(/\.(ttf|otf|woff|woff2)/i)) {
       fontCss += `@font-face { font-family: 'MC_CustomFont'; src: url('${ap.sysFont}'); font-display: swap; }`;
    }
    fontCss += `body * { font-family: ${fontName}, sans-serif !important; }`;
  }
  if (ap.sysFontSize) {
    fontCss += `:root { --chat-font-size: ${ap.sysFontSize}px !important; }`;
  }

  // 2. 界面背景图与智能毛玻璃
  if (ap.interfaceBg && store.currentApp !== null) {
    fontCss += `
      /* 强制铺上背景图 */
      #phone-container {
         background: url('${ap.interfaceBg}') center/cover no-repeat !important;
      }
      
      /* 降低最底层的模糊度和白雾感，让背景图更加清晰透亮 */
      #phone-container > div:not(#mc-chat-screen):not(#mc-status-bar) {
         background-color: rgba(255, 255, 255, 0.3) !important; 
         background-image: none !important;
         backdrop-filter:  !important; 
         -webkit-backdrop-filter:  !important;
      }

      /* 把所有白色卡片的透明度调高，并降低模糊度 */
      #phone-container > div:not(#mc-chat-screen) .bg-white {
         background-color: rgba(255, 255, 255, 0.5) !important;
         backdrop-filter: blur(15px) !important;
         -webkit-backdrop-filter: blur(15px) !important;
         border-color: rgba(255, 255, 255, 0.5) !important;
      }

      /* 其他灰色底板同步变清透 */
      #phone-container > div:not(#mc-chat-screen) .bg-\\[\\#f3f3f3\\], 
      #phone-container > div:not(#mc-chat-screen) .bg-\\[\\#f6f7f9\\],
      #phone-container > div:not(#mc-chat-screen) .bg-gray-50,
      #phone-container > div:not(#mc-chat-screen) .bg-gray-100 { 
         background-color: rgba(255, 255, 255, 0.5) !important; 
         backdrop-filter: blur(15px) !important; 
         -webkit-backdrop-filter: blur(15px) !important;
      }
    `;
  }

  // 2.5 全局顶栏与底栏背景强制覆盖
  if (ap.topBarBg && store.currentApp !== null) {
    fontCss += `
      /* 精准狙击所有 App 的顶栏 (根据排版特征提取) */
      #phone-container > div > div.pt-12.pb-3, 
      #phone-container > div > div.pt-8.pb-3,
      .mc-topbar {
         background: url('${ap.topBarBg}') center/cover no-repeat !important;
         background-color: transparent !important;
         border-bottom: none !important;
         box-shadow: none !important;
      }
    `;
  }

  if (ap.bottomBarBg && store.currentApp !== null) {
    fontCss += `
      /* 精准狙击所有 App 的底栏 (根据排版特征提取) */
      #phone-container > div > div.pb-6.pt-2,
      #phone-container > div > div.absolute.bottom-0.pb-6,
      .mc-bottombar {
         background: url('${ap.bottomBarBg}') center/cover no-repeat !important;
         background-color: transparent !important;
         border-top: none !important;
         box-shadow: none !important;
      }
    `;
  }

  const injectCustomItems = (dict) => {
    if (!dict) return;
    Object.keys(dict).forEach(k => {
      if (!dict[k]) return;
      fontCss += `
        .${k} svg, .${k} i { display: none !important; opacity: 0 !important; visibility: hidden !important; }
        .${k} { 
           background-image: url('${dict[k]}') !important; 
           background-position: center !important;
           background-size: contain !important;
           background-repeat: no-repeat !important;
           color: transparent !important; 
           border: none !important; 
           box-shadow: none !important;
           background-color: transparent !important;
        }
      `;
    });
  };
  injectCustomItems(ap.customIcons);
  injectCustomItems(ap.customButtons);
  // 隐藏所有文件上传输入框 + 修复头像被吞噬的层级问题
  fontCss += `
    input[type="file"] { display: none !important; position: absolute !important; width: 0 !important; height: 0 !important; opacity: 0 !important; z-index: -9999 !important; pointer-events: none !important; }
    #wx-input, #publish-moment-text, #moment-comment-input, #edit-msg-textarea, #virtual-input, 
    #transfer-amount, #transfer-note, #edit-persona-prompt, #edit-char-prompt, #global-prompt-input, 
    input, textarea, select { font-size: 16px !important; }
    #phone-container .mc-avatar { 
       position: relative !important; 
       z-index: 50 !important;
    }
  `;
  let styleTag = document.getElementById('mc-global-appearance');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'mc-global-appearance';
    document.head.appendChild(styleTag);
  }
  styleTag.innerHTML = fontCss;
  
  const container = document.getElementById('phone-container');
  
  // 1. 先计算出当前页面该显示什么内容
  let appHtml = '';
  if (store.currentApp === null) appHtml = renderHomeApp(store);
  else if (store.currentApp === 'settings') appHtml = renderSettingsApp(store);
  else if (store.currentApp === 'wechat') appHtml = renderWeChatApp(store);
  else if (store.currentApp === 'worldbook') appHtml = renderWorldbookApp(store);
  else if (store.currentApp === 'memory') appHtml = renderMemoryApp(store);
  else if (store.currentApp === 'appearance') appHtml = renderAppearanceApp(store);
  else if (store.currentApp === 'couple') appHtml = renderCoupleApp(store);
  else appHtml = `
      <div class="w-full h-full bg-white flex flex-col items-center justify-center text-gray-400">
        <i data-lucide="hammer" class="w-12 h-12 mb-4 text-gray-300"></i>
        <p>这个页面还在开发中哦！</p>
        <button onclick="window.actions.setCurrentApp(null)" class="mt-6 px-4 py-2 bg-blue-500 text-white font-bold rounded-xl active:scale-95 transition-transform">返回桌面</button>
      </div>`;

  // 2. 跨 App 全局状态栏渲染引擎 (完美覆盖所有页面)
  const isHomeDark = store.currentApp === null && (ap.darkMode || false);
  const txtClass = isHomeDark ? 'text-white drop-shadow-md' : 'text-gray-800 drop-shadow-sm';
  const statusBarHtml = ap.hideStatusBar ? '' : `
    <div id="mc-status-bar" class="absolute top-0 left-0 right-0 flex bg-transparent justify-between items-center px-6 pt-3 pb-2 text-[11px] font-bold z-[9999] pointer-events-none ${txtClass}">
      <span id="status-time" class="tracking-wider">${store.currentTime || '12:00'}</span>
      <div class="flex items-center space-x-1.5 opacity-80">
        <i data-lucide="signal" style="width: 14px; height: 14px;"></i>
        <i data-lucide="wifi" style="width: 14px; height: 14px;"></i>
        <div class="flex items-center"><span class="mr-1">${store.batteryLevel || 100}%</span><i data-lucide="battery-medium" style="width: 16px; height: 16px;"></i></div>
      </div>
    </div>
  `;

  // 🌟 1. 全局来电横幅渲染（加入终极防弹衣屏蔽全局毛玻璃）
  let globalCallHtml = '';
  if (store.globalCallAlert) {
      const alert = store.globalCallAlert;
      let avatarHtml = '';
      if (alert.avatar && (alert.avatar.includes('http') || alert.avatar.startsWith('data:'))) {
          avatarHtml = `<img src="${alert.avatar}" class="w-full h-full object-cover" />`;
      } else {
          avatarHtml = `<div class="w-full h-full flex items-center justify-center text-2xl">${alert.avatar || ''}</div>`;
      }

      globalCallHtml = `
        <div class="absolute top-4 left-4 right-4 z-[99999] rounded-[16px] p-4 flex items-center shadow-2xl animate-in slide-in-from-top-4 duration-300 border border-gray-700/50 cursor-pointer" onclick="window.wxActions.answerGlobalCall('${alert.charId}')" style="background-color: #2c2c2c !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-image: none !important;">
           <div class="w-12 h-12 rounded-full overflow-hidden mr-4 border border-gray-600 shrink-0 bg-gray-800">${avatarHtml}</div>
           <div class="flex-1 flex flex-col overflow-hidden">
              <span class="text-white font-bold text-[16px] truncate" style="color: white !important;">${alert.name}</span>
              <span class="text-[13px] mt-0.5 truncate" style="color: #9ca3af !important;">邀请你进行${alert.callType === 'video' ? '视频' : '语音'}通话...</span>
           </div>
           <div class="flex space-x-3 ml-2 shrink-0">
              <div class="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md" onclick="event.stopPropagation(); window.wxActions.declineGlobalCall('${alert.charId}')"><i data-lucide="phone-off" style="width:18px;"></i></div>
              <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md animate-bounce" onclick="event.stopPropagation(); window.wxActions.answerGlobalCall('${alert.charId}')"><i data-lucide="${alert.callType === 'video' ? 'video' : 'phone'}" style="width:18px;"></i></div>
           </div>
        </div>
      `;
  }

  // 🌟 2. 全局通话悬浮窗渲染（固定颜色 + 右下角定位 + 防弹衣）
  let floatCallHtml = '';
  if (store.activeCall && (store.currentApp !== 'wechat' || window.wxState?.view !== 'call')) {
      const isVideo = store.activeCall.type === 'video';
      const duration = store.activeCall.duration || 0;
      const m = String(Math.floor(duration / 60)).padStart(2, '0');
      const s = String(duration % 60).padStart(2, '0');

      floatCallHtml = `
        <div id="mc-float-call" class="absolute bottom-40 right-4 z-[99990] opacity-100 rounded-[18px] p-3 flex flex-col items-center shadow-2xl cursor-pointer active:scale-95 transition-transform animate-in fade-in-up zoom-in border border-white/20" onclick="window.wxActions.resumeCall()" style="background-color: #07c160 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-image: none !important;">
           <i data-lucide="${isVideo ? 'video' : 'phone'}" class="w-5 h-5 mb-1 animate-pulse" style="color: white !important;"></i>
           <span id="floating-call-time" class="text-[11px] font-mono font-bold tracking-wider opacity-100" style="color: white !important;">
               ${m}:${s}
           </span>
        </div>
      `;
  }

  // 3. 将状态栏、APP界面、来电横幅、悬浮球 一起渲染！
  container.innerHTML = statusBarHtml + appHtml + globalCallHtml + floatCallHtml;
  
  if (window.lucide) window.lucide.createIcons();
  
  if (store.currentApp === 'settings' && window.settingsActions?.updateStorageDisplay) {
      window.settingsActions.updateStorageDisplay();
  }
  // 4.1 同步恢复输入内容和焦点，坚决不让手机键盘掉下去！
  Object.keys(tempInputs).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          if (el.type === 'checkbox') el.checked = tempInputs[id];
          else el.value = tempInputs[id];
      }
  });
  if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
          el.focus(); // 强制唤回输入法
          if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && selStart !== undefined) {
              try { el.setSelectionRange(selStart, selEnd); } catch(e){}
          }
      }
  }
  // 4.2 异步恢复所有页面的滚动条 (防冲突顺滑版)
  requestAnimationFrame(() => {
     Object.keys(window.globalScrollStates).forEach(id => {
         const el = document.getElementById(id);
         if (el) {
             const oldBehavior = el.style.scrollBehavior;
             el.style.scrollBehavior = 'auto';
             el.scrollTop = window.globalScrollStates[id].top;
             el.scrollLeft = window.globalScrollStates[id].left;
             el.style.scrollBehavior = oldBehavior;
         }
     });
  });
  // 5. 换用海量数据库 IndexedDB 存储！
  if (window.DB) {
     window.DB.set(JSON.parse(JSON.stringify(store))).catch(e => console.log('DB存储失败', e));
  }
};
window.DB = DB; // 暴露给全局

window.onload = async () => {
  updateTime();
  setInterval(updateTime, 1000); 

  // 开机自检：无缝加载新数据库或迁移旧数据
  try {
    const savedDB = await DB.get();
    if (savedDB) {
       Object.assign(store, savedDB);
       store.currentApp = null; // 强制回城防卡死
    } else {
       // 如果新数据库是空的，检查有没有老版 localStorage 存档
       const oldLocal = localStorage.getItem('neko_store');
       if (oldLocal) {
          Object.assign(store, JSON.parse(oldLocal));
          store.currentApp = null;
          await DB.set(store); // 瞬间存入新硬盘
          localStorage.removeItem('neko_store');
       }
    }
  } catch(e) { console.log('读取DB失败', e) }

  render(); 
};
// ================= 本地/网络全兼容保活引擎 =================
window.updateAudioPlaylist = () => {
    store.customAudio = store.customAudio || [];
    window.audioPlaylist = [...store.customAudio];
    
    // 如果列表被删空了，或者索引越界，重置为 0
    if (window.audioPlaylist.length > 0 && window.audioState.currentIndex >= window.audioPlaylist.length) {
        window.audioState.currentIndex = 0;
    }
};

window.audioState = window.audioState || { currentIndex: 0, loopMode: 'list', isPlaying: false };
window.updateAudioPlaylist();

const keepAliveAudio = window.keepAliveAudio || new Audio();
window.keepAliveAudio = keepAliveAudio; 
keepAliveAudio.setAttribute('playsinline', 'true'); 
keepAliveAudio.setAttribute('webkit-playsinline', 'true');
// 只有当有歌的时候才去设置 src
if (window.audioPlaylist.length > 0 && !keepAliveAudio.src) keepAliveAudio.src = window.audioPlaylist[0].src;

window.updateAudioUI = () => {
    const isPlaying = window.audioState.isPlaying;
    const hasTrack = window.audioPlaylist && window.audioPlaylist.length > 0;
    
    // 适配空列表的 UI 显示文字
    const trackName = hasTrack ? window.audioPlayer.getTrackName() : "暂无音乐";
    const artistName = hasTrack ? window.audioPlayer.getArtistName() : "请点击右上角 + 添加音乐";
    const loopMode = window.audioState.loopMode;
    const isSilent = trackName.includes('静音');

    const record = document.getElementById('mc-audio-record');
    if (record) record.style.animationPlayState = isPlaying ? 'running' : 'paused';
    
    const cover = document.getElementById('mc-audio-cover');
    if (cover) cover.style.backgroundImage = hasTrack 
        ? `url('${isSilent ? 'https://api.dicebear.com/7.x/shapes/svg?seed=silent' : 'https://api.dicebear.com/7.x/shapes/svg?seed='+encodeURIComponent(trackName)}')`
        : `url('https://api.dicebear.com/7.x/shapes/svg?seed=empty')`;
    
    const title = document.getElementById('mc-audio-name');
    if (title) title.innerText = trackName;
    const artist = document.getElementById('mc-audio-artist'); 
    if (artist) artist.innerText = artistName;

    const playBtnIcon = document.getElementById('mc-audio-play-icon');
    if (playBtnIcon) playBtnIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    const loopBtnIcon = document.getElementById('mc-audio-loop-icon');
    if (loopBtnIcon) loopBtnIcon.setAttribute('data-lucide', loopMode === 'list' ? 'repeat' : 'repeat-1');
    
    if (window.lucide) window.lucide.createIcons();
};

window.audioPlayer = {
  play: () => { 
      if(window.audioPlaylist.length > 0) keepAliveAudio.play().catch(()=>{}); 
      else window.actions.showToast('请先点击右上角添加音乐哦！'); 
  },
  pause: () => keepAliveAudio.pause(),
  next: () => { 
      if(window.audioPlaylist.length <= 1) return;
      window.audioState.currentIndex = (window.audioState.currentIndex + 1) % window.audioPlaylist.length; 
      window.audioPlayer.loadAndPlay(); 
  },
  prev: () => { 
      if(window.audioPlaylist.length <= 1) return;
      window.audioState.currentIndex = (window.audioState.currentIndex - 1 + window.audioPlaylist.length) % window.audioPlaylist.length; 
      window.audioPlayer.loadAndPlay(); 
  },
  toggleLoop: () => { window.audioState.loopMode = window.audioState.loopMode === 'list' ? 'single' : 'list'; window.updateAudioUI(); },
  loadAndPlay: () => {
     // 如果曲库为空，彻底停播并重置
     if(window.audioPlaylist.length === 0) {
         keepAliveAudio.pause();
         keepAliveAudio.removeAttribute('src');
         window.updateAudioUI();
         return;
     }
     
     const track = window.audioPlaylist[window.audioState.currentIndex];
     
     // 绕过 iOS 媒体缓存 Bug
     let safeSrc = track.src;
     if (safeSrc.startsWith('http')) safeSrc += (safeSrc.includes('?') ? '&' : '?') + 't=' + Date.now();
     
     keepAliveAudio.src = safeSrc;
     keepAliveAudio.play().catch(()=>{});
     if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: track.name, artist: track.artist || 'NekoPhone 保活引擎' });
     window.updateAudioUI();
  },
  getTrackName: () => window.audioPlaylist[window.audioState.currentIndex].name,
  getArtistName: () => window.audioPlaylist[window.audioState.currentIndex].artist || '未知歌手'
};

keepAliveAudio.onended = () => { if (window.audioState.loopMode === 'single') keepAliveAudio.play().catch(()=>{}); else window.audioPlayer.next(); };
keepAliveAudio.onplay = () => { window.audioState.isPlaying = true; window.updateAudioUI(); };
keepAliveAudio.onpause = () => { window.audioState.isPlaying = false; window.updateAudioUI(); };
keepAliveAudio.onerror = () => { 
    if (window.audioPlaylist.length > 0) window.actions.showToast('音频链接已失效或受跨域限制，请在列表中删除'); 
    window.audioState.isPlaying = false; window.updateAudioUI();
};

document.addEventListener('touchstart', function unlockAudio() {
    if(window.audioPlaylist.length > 0 && keepAliveAudio.src) {
        keepAliveAudio.play().then(() => keepAliveAudio.pause()).catch(()=>{});
    }
    document.removeEventListener('touchstart', unlockAudio);
}, { once: true });