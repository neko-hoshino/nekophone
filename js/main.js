// js/main.js
import { store } from './store.js';
import { renderHomeApp } from './apps/home.js';
import { renderSettingsApp } from './apps/setting.js';
import { renderWeChatApp } from './apps/wechat.js';
import { renderWorldbookApp } from './apps/worldbook.js';
import { renderMemoryApp } from './apps/memory.js';
import { renderAppearanceApp } from './apps/appearance.js';

window.actions = {
  setCurrentApp: (appId) => {
    store.currentApp = appId;
    render(); 
  },
  showToast: (msg) => {
    // ... 保持你现有的 Toast 逻辑不变 ...
    const toastContainer = document.getElementById('toast-container');
    const toastMsg = document.getElementById('toast-msg');
    toastMsg.innerText = msg;
    toastContainer.classList.remove('hidden');
    setTimeout(() => toastContainer.classList.remove('opacity-0'), 10);
    setTimeout(() => {
      toastContainer.classList.add('opacity-0');
      setTimeout(() => toastContainer.classList.add('hidden'), 300);
    }, 2500);
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
    banner.className = 'absolute top-6 left-4 right-4 bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.15)] z-[99999] flex items-center transform transition-all duration-500 -translate-y-[200%] cursor-pointer border border-gray-100/50';
    banner.onclick = () => { window.actions.setCurrentApp('wechat'); banner.classList.add('-translate-y-[200%]'); };
    document.getElementById('phone-container').appendChild(banner);
  }
  
  let previewText = text;
  if (text.includes('[图片]')) previewText = '[发来一张照片]';
  else if (text.includes('[语音]')) previewText = '[发来一段语音]';
  
  const safeAvatar = (avatarUrl && avatarUrl.startsWith('http')) ? avatarUrl : 'https://api.dicebear.com/7.x/bottts/svg';

  banner.innerHTML = `
    <img src="${safeAvatar}" class="w-11 h-11 rounded-[14px] mr-3 object-cover shadow-sm border border-gray-100" />
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
// 👈 核心：将 render 函数挂载到 window 上，方便各种内部 App 触发重绘
window.render = render; 

function updateTime() {
  const now = new Date();
  store.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.getElementById('status-time');
  if (timeEl) timeEl.innerText = store.currentTime;
}

function render() {
  // ================= 🌟 全局外观与图库引擎 =================
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

  // 🌟 2. 界面背景图与智能毛玻璃魔法 (降低了模糊度，提高清晰度)
  if (ap.interfaceBg && store.currentApp !== null) {
    fontCss += `
      /* 强制铺上背景图 */
      #phone-container {
         background: url('${ap.interfaceBg}') center/cover no-repeat !important;
      }
      
      /* 降低最底层的模糊度和白雾感，让背景图更加清晰透亮 */
      #phone-container > div:not(#mc-chat-screen) {
         background-color: rgba(255, 255, 255, 0.3) !important; 
         background-image: none !important;
         backdrop-filter: blur(5px) !important; 
         -webkit-backdrop-filter: blur(5px) !important;
      }

      /* 把所有白色卡片的透明度调高，并降低模糊度 */
      #phone-container > div:not(#mc-chat-screen) .bg-white {
         background-color: rgba(255, 255, 255, 0.5) !important;
         backdrop-filter: blur(6px) !important;
         -webkit-backdrop-filter: blur(6px) !important;
         border-color: rgba(255, 255, 255, 0.5) !important;
      }

      /* 其他灰色底板同步变清透 */
      #phone-container > div:not(#mc-chat-screen) .bg-\\[\\#f3f3f3\\], 
      #phone-container > div:not(#mc-chat-screen) .bg-\\[\\#f6f7f9\\],
      #phone-container > div:not(#mc-chat-screen) .bg-gray-50,
      #phone-container > div:not(#mc-chat-screen) .bg-gray-100 { 
         background-color: rgba(255, 255, 255, 0.5) !important; 
         backdrop-filter: blur(6px) !important; 
         -webkit-backdrop-filter: blur(6px) !important;
      }
    `;
  }

  // 🌟 2.5 全局顶栏与底栏背景强制覆盖魔法
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
  // 🌟 终极免疫盾：暴力隐藏所有文件上传输入框 + 修复头像被吞噬的层级问题
  fontCss += `
    input[type="file"] { display: none !important; position: absolute !important; width: 0 !important; height: 0 !important; opacity: 0 !important; z-index: -9999 !important; pointer-events: none !important; }
    
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
  // =======================================================
  
  const container = document.getElementById('phone-container');
  
  if (store.currentApp === null) {
    container.innerHTML = renderHomeApp(store);
  } else if (store.currentApp === 'settings') {
    container.innerHTML = renderSettingsApp(store);
  } else if (store.currentApp === 'wechat') {
    container.innerHTML = renderWeChatApp(store);
  } else if (store.currentApp === 'worldbook') {
    container.innerHTML = renderWorldbookApp(store);
  } else if (store.currentApp === 'memory') {
    container.innerHTML = renderMemoryApp(store);
  } else if (store.currentApp === 'appearance') {
    container.innerHTML = renderAppearanceApp(store);
  } else {
    container.innerHTML = `
      <div class="w-full h-full bg-white flex flex-col items-center justify-center text-gray-400">
        <i data-lucide="hammer" class="w-12 h-12 mb-4 text-gray-300"></i>
        <p>Eve，这个页面还在开发中哦！</p>
        <button onclick="window.actions.setCurrentApp(null)" class="mt-6 px-4 py-2 bg-blue-500 text-white font-bold rounded-xl active:scale-95 transition-transform">
          返回桌面
        </button>
      </div>
    `;
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.onload = () => {
  updateTime();
  setInterval(updateTime, 1000); 
  render(); 
};
// ================= 🌟 终极黑魔法：无声音频后台保活引擎 =================
const keepAliveAudio = new Audio();
// 🌟 换成了一个真实的线上无声 MP3 链接，苹果绝对承认它是一首歌！
keepAliveAudio.src = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_787593c662.mp3";
keepAliveAudio.loop = true;
keepAliveAudio.setAttribute('playsinline', 'true'); 
keepAliveAudio.setAttribute('webkit-playsinline', 'true');

document.addEventListener('touchstart', () => {
    if (keepAliveAudio.paused) {
        keepAliveAudio.play().then(() => {
            console.log("🎶 保活音乐启动！");
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: '小手机系统运行中',
                    artist: '请勿关闭，以保持消息后台接收',
                });
            }
        }).catch(e => console.log("保活音乐启动被拦截:", e));
    }
}, { once: true });
// =======================================================