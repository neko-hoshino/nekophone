// js/main.js
import { store, DB } from './store.js';
import { renderHomeApp } from './apps/home.js';
import { renderSettingsApp } from './apps/setting.js';
import { renderWeChatApp } from './apps/wechat.js';
import { renderWorldbookApp } from './apps/worldbook.js';
import { renderMemoryApp } from './apps/memory.js';
import { renderAppearanceApp } from './apps/appearance.js';
import { renderCoupleApp } from './apps/couple.js';
import { renderForumApp } from './apps/forum.js';
import { renderPhoneApp } from './apps/phone.js';
import { renderShoppingApp } from './apps/shopping.js';
import { renderBloggerApp } from './apps/blogger.js';
import { renderAo3App } from './apps/ao3.js';
import { renderDarkroomApp } from './apps/darkroom.js';

// 1. 获取/生成设备唯一标识
function getDeviceId() {
    let id = localStorage.getItem('neko_device_id');
    if (!id) {
        id = 'dev-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('neko_device_id', id);
    }
    return id;
}

// 2. 🌟 全新核验逻辑：每次刷新网页都偷偷问一下服务器，码还在不在？
async function checkAuth() {
    const isVerified = localStorage.getItem('neko_is_verified');
    const savedCode = localStorage.getItem('neko_active_code'); // 取出他上次登录用的码
    const authUI = document.getElementById('auth-screen');
    const deviceId = getDeviceId();

    // 如果他以前登录过，拿着他当时的码去服务器查岗
    if (isVerified === 'true' && savedCode) {
        try {
            const res = await fetch('https://neko-hoshino.duckdns.org/api/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: savedCode, deviceId })
            });
            const result = await res.json();
            
            if (res.ok && result.success) {
                // 码还在，主人没删，隐身放行！
                if(authUI) authUI.style.display = 'none';
                return true;
            } else {
                // 💥 关键点：服务器说码无效了（被你删了）！抛出错误！
                throw new Error('授权已被管理员收回');
            }
        } catch (e) {
            // 💥 踢人逻辑：清除他的登录状态，重新弹出密码锁！
            localStorage.removeItem('neko_is_verified');
            localStorage.removeItem('neko_active_code');
            if(authUI) {
                authUI.style.display = 'flex';
                const errMsg = document.getElementById('auth-error-msg');
                if(errMsg) {
                    errMsg.innerText = '授权已失效，请重新输入有效邀请码';
                    errMsg.style.opacity = '1';
                }
            }
            if(window.lucide) window.lucide.createIcons();
            return false;
        }
    } else {
        // 根本没登录过，直接拦截
        if(authUI) authUI.style.display = 'flex';
        if(window.lucide) window.lucide.createIcons();
        return false;
    }
}

// 3. 全局验证函数 (用户手动点 Verify 按钮时执行)
window.verifyCode = async function() {
    const code = document.getElementById('invite-code-input').value.trim();
    const btn = document.getElementById('verify-btn');
    const errMsg = document.getElementById('auth-error-msg');
    const deviceId = getDeviceId();

    if (!code) { errMsg.innerText = "请输入验证码"; errMsg.style.opacity = '1'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="w-4 h-4 animate-spin text-white">⏳</i>'; 

    try {
        const res = await fetch('https://neko-hoshino.duckdns.org/api/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, deviceId })
        });
        const result = await res.json();
        
        if (res.ok && result.success) {
            // 🌟 验证成功，把状态和码都存进手机里
            localStorage.setItem('neko_is_verified', 'true');
            localStorage.setItem('neko_active_code', code); 
            
            btn.innerHTML = 'Success!';
            setTimeout(() => {
                document.getElementById('auth-screen').style.opacity = '0';
                setTimeout(() => { 
                    document.getElementById('auth-screen').style.display = 'none'; 
                    initApp(); // 启动系统
                }, 700);
            }, 500);
        } else {
            errMsg.innerText = result.error || '验证失败';
            errMsg.style.opacity = '1';
        }
    } catch (e) {
        errMsg.innerText = '无法连接验证服务器';
        errMsg.style.opacity = '1';
    } finally {
        if (btn.innerHTML !== 'Success!') {
            btn.disabled = false;
            btn.innerHTML = '<span>Verify Access</span>';
        }
    }
};

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
  let fontCss = ''; // 保留空变量防止下面报错，但我们改用 Head 注入，彻底解决闪烁！

  // 🌟 终极修复：增加“字体记忆锁”，只有当字体真的被修改时，才去触碰底层 CSS
  if (window._lastFontRender !== ap.sysFont) {
      window._lastFontRender = ap.sysFont;
      
      let safeUrl = ap.sysFont ? ap.sysFont.trim() : '';
      let fontName = 'system-ui, -apple-system, sans-serif';

      // 斩杀旧的字体文件标签
      let existingStyle = document.getElementById('mc-custom-font-style');
      if (existingStyle) existingStyle.remove();

      // 斩杀旧的全局覆盖标签
      let rootStyle = document.getElementById('mc-root-font-style');
      if (rootStyle) rootStyle.remove();

      if (safeUrl) {
          // 判断是网络链接还是 Base64
          if (safeUrl.includes('http') || safeUrl.startsWith('data:')) {
              fontName = 'MC_CustomFont';
              let fontFormat = '';
              if (safeUrl.startsWith('data:')) {
                  if (safeUrl.includes('font/ttf') || safeUrl.includes('application/x-font-ttf')) fontFormat = "format('truetype')";
                  else if (safeUrl.includes('font/otf')) fontFormat = "format('opentype')";
                  else if (safeUrl.includes('font/woff2')) fontFormat = "format('woff2')";
                  else if (safeUrl.includes('font/woff')) fontFormat = "format('woff')";
              } else {
                  safeUrl = encodeURI(safeUrl); 
                  if (safeUrl.toLowerCase().includes('.ttf')) fontFormat = "format('truetype')";
                  else if (safeUrl.toLowerCase().includes('.otf')) fontFormat = "format('opentype')";
                  else if (safeUrl.toLowerCase().includes('.woff2')) fontFormat = "format('woff2')";
                  else if (safeUrl.toLowerCase().includes('.woff')) fontFormat = "format('woff')";
              }

              const style = document.createElement('style');
              style.id = 'mc-custom-font-style';
              // 加入 font-display: swap 让字体加载更平滑
              style.textContent = `@font-face { font-family: '${fontName}'; src: url('${safeUrl}') ${fontFormat}; font-display: swap; }`;
              document.head.appendChild(style);
          } else {
              // 识别为本地系统字体 (如 Arial)
              fontName = safeUrl; 
          }
      }

      // 将字体规则死死钉在 document.head 里，脱离 render 循环！
      const rStyle = document.createElement('style');
      rStyle.id = 'mc-root-font-style';
      rStyle.textContent = `
        :root {
           --system-font: '${fontName}', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        }
        body, body *, .font-sans, .font-serif, .font-mono, .font-cursive { 
           font-family: var(--system-font) !important; 
        }
      `;
      document.head.appendChild(rStyle);
  }
  // 🌟 核心破局：纯数值比例缩放引擎！严格防范 px * px 的非法数学错误
  if (ap.sysFontSize) {
    fontCss += `
      :root { 
          --chat-font-size: ${ap.sysFontSize}px !important; 
          /* 核心修复：只取数字计算，确保出来的系数是个纯比例！ */
          --font-scale: calc(${ap.sysFontSize} / 14) !important; 
      }
    `;
    
    // 遍历强行覆盖所有你在代码里写死的 Tailwind 字号
    const sizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32];
    sizes.forEach(s => {
        fontCss += `.text-\\[${s}px\\] { font-size: calc(${s}px * var(--font-scale)) !important; }\n`;
    });
    
    // 覆盖默认的 Tailwind 相对字号
    fontCss += `
        .text-xs { font-size: calc(0.75rem * var(--font-scale)) !important; }
        .text-sm { font-size: calc(0.875rem * var(--font-scale)) !important; }
        .text-base { font-size: calc(1rem * var(--font-scale)) !important; }
        .text-lg { font-size: calc(1.125rem * var(--font-scale)) !important; }
        .text-xl { font-size: calc(1.25rem * var(--font-scale)) !important; }
        .text-2xl { font-size: calc(1.5rem * var(--font-scale)) !important; }
        .text-4xl { font-size: calc(2.25rem * var(--font-scale)) !important; }
        
        /* 针对各种聊天和看文的正文特殊区域，连同间距一起放大防拥挤 */
        #mc-chat-scroll .whitespace-pre-wrap,
        #offline-scroll .offline-dialogue,
        #offline-scroll .offline-thought,
        #offline-scroll .offline-desc,
        #darkroom-scroll .mc-darkroom-dialogue,
        #darkroom-scroll .mc-darkroom-thought,
        #darkroom-scroll .mc-darkroom-desc {
           font-size: calc(15px * var(--font-scale)) !important;
           line-height: 1.6 !important;
        }
        #ao3-detail-scroll .break-words,
        #blogger-home-scroll .whitespace-pre-wrap {
           font-size: calc(15px * var(--font-scale)) !important;
           line-height: 1.8 !important;
        }
    `;
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

  // 🌟 1. 桌面图标渲染引擎 (替换整个大容器)
  const injectCustomIcons = (dict) => {
    if (!dict) return;
    Object.keys(dict).forEach(k => {
      if (!dict[k]) return;
      fontCss += `
        .${k} svg, .${k} i { display: none !important; }
        .${k} { 
           background-image: url('${dict[k]}') !important; 
           background-position: center !important;
           background-size: contain !important;
           background-repeat: no-repeat !important;
           background-color: transparent !important;
           border: none !important; 
           box-shadow: none !important;
        }
      `;
    });
  };

  // 🌟 2. 聊天室按钮渲染引擎 (核心修复：非破坏性精准夺舍！)
  const injectCustomButtons = (dict) => {
    if (!dict) return;
    Object.keys(dict).forEach(k => {
      if (!dict[k]) return;
      fontCss += `
        /* ① 把原生图标的线条和填充变透明，但绝对保留它的宽高度和物理占位！ */
        .${k} svg, .${k} i { 
           stroke: transparent !important;
           fill: transparent !important;
           color: transparent !important;
           /* ② 直接在原生图标的盒子里渲染你上传的图片 */
           background-image: url('${dict[k]}') !important; 
           background-position: center !important;
           background-size: contain !important;
           background-repeat: no-repeat !important;
        }
        /* 顺手把部分按钮的灰色底板去掉，让自定义图片更清爽 */
        .${k} { background-color: transparent !important; border: none !important; box-shadow: none !important; }
      `;
    });
  };

  injectCustomIcons(ap.customIcons);
  injectCustomButtons(ap.customButtons);
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
  else if (store.currentApp === 'forum') appHtml = renderForumApp(store);
  else if (store.currentApp === 'phone') appHtml = renderPhoneApp(store);
  else if (store.currentApp === 'shopping') appHtml = renderShoppingApp(store);
  else if (store.currentApp === 'blogger') appHtml = renderBloggerApp(store);
  else if (store.currentApp === 'ao3') appHtml = renderAo3App(store);
  else if (store.currentApp === 'darkroom') appHtml = renderDarkroomApp(store);
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

// 🌟 将原本的 window.onload 改装成一个叫 initApp 的启动引擎
async function initApp() {
  updateTime();
  setInterval(updateTime, 1000); 

  // 开机自检：无缝加载新数据库或迁移旧数据
  try {
    const savedDB = await DB.get();
    if (savedDB) {
       Object.assign(store, savedDB);
       store.currentApp = null;
    }
    window.render();
  } catch (e) {
    console.log('数据加载失败', e);
    window.render();
  }
}

// 🌟 真正的页面加载入口
window.onload = async () => {
  // 先把黑布拉下来（显示黑色的背景，防止验证的时候看到白屏），然后等核验结果
  document.body.style.backgroundColor = "#F8F7F3"; 
  
  const isAuthorized = await checkAuth();
  
  if (isAuthorized) {
      // 服务器说钥匙有效，立刻启动系统！
      initApp();
  }
  // 如果无效，checkAuth 函数会自动把密码锁弹出来，系统保持静默。
};