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
import { renderTransmigrationApp } from './apps/transmigration.js';
import { ImageCacheDB } from './utils/imageCacheDB.js';

// ================= 🌟 召唤 Supabase 数据库接线员 =================
// 直接通过 ESM 引入官方客户端
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 填入你的 API URL
const supabaseUrl = 'https://lbvdrqefnwqyvthpjocm.supabase.co'; 
// 填入你的 Anon Key（千万别填 Secret Key！）
const supabaseKey = 'sb_publishable_3YUfNGRez8K78PeNh3GVpA_nz-hT_xL'; 

// 将 supabase 挂载到全局 window 对象上
window.supabase = createClient(supabaseUrl, supabaseKey);
// ===============================================================

// 1. 获取/生成设备唯一标识
function getDeviceId() {
    let id = localStorage.getItem('neko_device_id');
    if (!id) {
        id = 'dev-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('neko_device_id', id);
    }
    return id;
}

// 2. 🌟 全新核验逻辑
async function checkAuth() {
    const isVerified = localStorage.getItem('neko_is_verified');
    const savedCode = localStorage.getItem('neko_active_code'); 
    const authUI = document.getElementById('auth-screen');
    const deviceId = getDeviceId();

    if (isVerified === 'true' && savedCode) {
        try {
            const res = await fetch('https://neko-hoshino.duckdns.org/api/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: savedCode, deviceId })
            });
            const result = await res.json();
            
            if (res.ok && result.success) {
                if(authUI) authUI.style.display = 'none';
                return true;
            } else {
                throw new Error('授权已被管理员收回');
            }
        } catch (e) {
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
        if(authUI) authUI.style.display = 'flex';
        if(window.lucide) window.lucide.createIcons();
        return false;
    }
}

// 3. 全局验证函数
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
            localStorage.setItem('neko_is_verified', 'true');
            localStorage.setItem('neko_active_code', code); 
            
            btn.innerHTML = 'Success!';
            setTimeout(() => {
                document.getElementById('auth-screen').style.opacity = '0';
                setTimeout(() => { 
                    document.getElementById('auth-screen').style.display = 'none'; 
                    initApp(); 
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
    if (!toastContainer) return;
    
    let toastMsg = document.getElementById('toast-msg');
    if (!toastMsg) {
        toastContainer.innerHTML = `<div class="bg-gray-800/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-xl flex items-center"><span id="toast-msg" class="text-[13px] font-bold tracking-wider"></span></div>`;
        toastMsg = document.getElementById('toast-msg');
    }
    
    toastMsg.innerText = msg;
    toastContainer.classList.remove('hidden');
    setTimeout(() => toastContainer.classList.remove('opacity-0'), 10);
    setTimeout(() => {
      toastContainer.classList.add('opacity-0');
      setTimeout(() => toastContainer.classList.add('hidden'), 300);
    }, 2500);
  },
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
           const maxSize = forceCompress ? 800 : 2560; 
           if (w > h && w > maxSize) { h *= maxSize / w; w = maxSize; }
           else if (h > maxSize) { w *= maxSize / h; h = maxSize; }
           canvas.width = w; canvas.height = h;
           canvas.getContext('2d').drawImage(img, 0, 0, w, h);
           
           const quality = forceCompress ? 0.7 : 0.95;
           callback(canvas.toDataURL('image/webp', quality)); 
        };
        img.src = src;
     };

     if (source instanceof File || source instanceof Blob) {
         const reader = new FileReader();
         reader.onload = (e) => {
             if (source.size < 5 * 1024 * 1024 && !forceCompress) {
                 processImage(e.target.result, true); 
             } else {
                 processImage(e.target.result, false);
             }
         };
         reader.readAsDataURL(source);
     } else if (typeof source === 'string') {
         if (source.length < 6.5 * 1024 * 1024 && !forceCompress) {
             processImage(source, true);
         } else {
             processImage(source, false);
         }
     }
  }
};

window.actions.notify = (title, text, avatarUrl) => {
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
    ? `<img src="${window.getCachedImageSrc(avatarUrl)}" class="w-11 h-11 rounded-[14px] mr-3 object-cover shadow-sm border border-gray-100" />`
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

// ================= 🌟 万能云端上传器 V2.0 (带智能覆盖排雷功能) =================
window.uploadMediaToCloud = async function(fileData, fileExt = 'png', fixedKey = null) {
    // 如果已经是 http 开头的链接，或者为空，直接放行
    if (!fileData || (typeof fileData === 'string' && fileData.startsWith('http'))) {
        return fileData;
    }

    try {
        const deviceId = localStorage.getItem('neko_device_id') || 'unknown';
        let fileName = '';

        // 🌟 核心魔法：如果有专属坑位名，就固定文件名用于覆盖；否则随机生成
        if (fixedKey) {
            fileName = `media/trv_${deviceId}_${fixedKey}.${fileExt}`;
        } else {
            const uniqueId = Math.random().toString(36).substring(7);
            fileName = `media/trv_${deviceId}_${Date.now()}_${uniqueId}.${fileExt}`;
        }

        // 🌟 智能 contentType：图片 / 音频 / json 分别派发
        const audioExts = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'mpeg', 'mp4']);
        const ext = (fileExt || '').toLowerCase();
        let contentType;
        if (ext === 'json') contentType = 'application/json';
        else if (audioExts.has(ext)) contentType = `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
        else contentType = `image/${ext}`;

        // 呼叫咱们 VPS 上的搬运工接口
        const response = await fetch('https://neko-hoshino.duckdns.org/api/upload-r2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: fileName,
                fileData: fileData,
                contentType: contentType
            })
        });

        const result = await response.json();
        if (result.success) {
            // 🌟 防缓存魔法：如果是覆盖上传，浏览器往往会显示本地旧缓存，所以要加个时间戳骗过浏览器
            const finalUrl = fixedKey ? `${result.url.split('?')[0]}?t=${Date.now()}` : result.url;
            console.log('✅ 上传云端成功:', finalUrl);
            return finalUrl; 
        } else {
            throw new Error(result.error);
        }
    } catch (e) {
        console.error('❌ 云端上传失败, 退回原格式:', e);
        return fileData; 
    }
};
// ===============================================================
// ================= 🌟 云端垃圾粉碎机 =================
window.deleteMediaFromCloud = async function(fileUrl) {
    // 智能拦截：如果是空、或者不是咱们云端网盘里的链接、或者是默认的系统图标，直接忽略
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.includes('pub-0e37c842dc044e1ba26eb187300cb843.r2.dev')) {
        return; 
    }

    try {
        // 呼叫 VPS 焚化炉接口
        fetch('https://neko-hoshino.duckdns.org/api/delete-r2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: fileUrl })
        });
        // 这里不需要 await 等待结果，直接让它在后台默默去删就行，不卡顿玩家的操作
        console.log('🗑️ 已发送清理指令:', fileUrl);
    } catch (e) {
        console.error('❌ 发送清理指令失败:', e);
    }
};
// ===============================================================

// ================= 🌟 整体 JSON 云端备份引擎 =================
// 1. 【云端备份】把整个 store 变成文件扔进 R2，并把地址存入 Supabase
window.backupToCloud = async function(silent = false) { // 🌟 加上 silent 参数
    try {
        if (!silent) window.actions.showToast('正在瘦身并打包存档...'); // 🌟 非静音才弹窗
        const deviceId = localStorage.getItem('neko_device_id');
        
        const backupData = JSON.parse(JSON.stringify(store));
        backupData.currentApp = null; 
        
        // 使用 'backup_main' 坑位名，完美覆盖旧文件！
        const uploadRes = await window.uploadMediaToCloud(JSON.stringify(backupData), 'json', `backup_main`);
        
        if (!uploadRes || !uploadRes.startsWith('http')) throw new Error('上传云端失败');

        const { error } = await supabase.from('user_backups').upsert({
            device_id: deviceId,
            backup_url: uploadRes,
            updated_at: new Date().toISOString()
        }, { onConflict: 'device_id' });

        if (error) throw error;
        
        if (!silent) window.actions.showToast('✅ 存档已同步至云端');
        console.log('☁️ [云端] 自动备份完成');
    } catch (e) {
        console.error('备份失败:', e);
        if (!silent) window.actions.showToast('❌ 备份失败: ' + e.message);
    }
};

// 2. 【云端恢复】从 Supabase 拿链接，去 R2 下文件，然后覆盖本地
window.restoreFromCloud = async function() {
    try {
        const deviceId = localStorage.getItem('neko_device_id');
        window.actions.showToast('正在从云端找回记忆...');

        // 1. 去 Supabase 查：我的备份在哪？
        const { data, error } = await supabase
            .from('user_backups')
            .select('backup_url')
            .eq('device_id', deviceId)
            .single();

        if (error || !data) throw new Error('云端没找到你的存档记录');

        // 2. 拿着链接去 R2 下载 JSON 文件 (加个时间戳绕过浏览器缓存)
        const backupUrl = data.backup_url.includes('?') ? data.backup_url : `${data.backup_url}?t=${Date.now()}`;
        const res = await fetch(backupUrl);
        const cloudStore = await res.json();

        if (cloudStore && cloudStore.contacts) {
            // 3. 覆盖本地数据并重启应用
            Object.assign(store, cloudStore);
            if (window.DB) await window.DB.set(store);
            window.actions.showToast('✅ 记忆已完全恢复！');
            setTimeout(() => location.reload(), 1500); // 刷新页面以应用新存档
        }
    } catch (e) {
        console.error('同步失败:', e);
        window.actions.showToast('❌ 同步失败: ' + e.message);
    }
};
// ================= 🌟 全自动影子备份引擎 =================
window.startAutoBackup = function() {
    // 1. 锁屏/切出网页时，立刻触发一次静默备份
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            console.log('☁️ [云端] 玩家切出网页，触发静默备份...');
            window.backupToCloud(true); // true 表示静音模式
        }
    });

    // 2. 每隔 15 分钟，自动兜底备份一次
    setInterval(() => {
        console.log('☁️ [云端] 触发 15 分钟定时备份...');
        window.backupToCloud(true); 
    }, 15 * 60 * 1000);
};
// ===============================================================
// ================= 🌟 缓存助手：fixedKey 上传 / 渲染优先 =================
// 预测 fixedKey 上传到 R2 的 URL（不带 ?t= 防缓存戳）
// 必须与 uploadMediaToCloud 内部 fileName 拼装规则保持一致
window.predictCloudUrl = function(fixedKey, fileExt = 'webp') {
    const deviceId = localStorage.getItem('neko_device_id') || 'unknown';
    return `https://pub-0e37c842dc044e1ba26eb187300cb843.r2.dev/media/trv_${deviceId}_${fixedKey}.${fileExt}`;
};

// 渲染优先：cache 命中→Base64（无 flicker），缺失→原 URL
// 适用于 fixedKey 槽位（壁纸/头像等）。聊天图片用 msg.id 键，仍用 imageCache.getSync(msg.id)
window.getCachedImageSrc = function(url) {
    if (!url || typeof url !== 'string') return url || '';
    const key = url.split('?')[0];
    return window.imageCache?.getSync?.(key) || url;
};
// ===============================================================

// ================= 🌟 AI 专属的视觉恢复魔法 (CORS 破壁版) =================
window.urlToBase64ForAI = async function(url) {
    if (!url || !url.startsWith('http')) return url; 
    try {
        // 🌟 核心魔法：加上 mode 和 cache 参数，强行破除浏览器本地缓存的幽灵！
        // 如果 url 里没有带时间戳，再手动给它挂一个随机数骗过缓存
        const fetchUrl = url.includes('?t=') ? url : `${url}?bypass=${Date.now()}`;
        
        const response = await fetch(fetchUrl, {
            mode: 'cors',       // 明确声明我要跨域
            cache: 'no-cache'   // 警告浏览器：不许用缓存，必须去服务器问！
        });
        
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); 
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("❌ 为 AI 获取图片失败:", e);
        return null;
    }
};
// ===============================================================

window.render = render; 

function updateTime() {
  const now = new Date();
  store.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.getElementById('status-time');
  if (timeEl) timeEl.innerText = store.currentTime;
}
if (!window.globalScrollStates) window.globalScrollStates = {};

window.floatCallPos = null;
window.startDragFloatCall = function(e) {
    let isDragging = false;
    let startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    let startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    const el = document.getElementById('mc-float-call');
    if (!el) return;

    el.style.transition = 'none'; 

    const container = document.getElementById('phone-container');
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    let initialLeft = elRect.left - containerRect.left;
    let initialTop = elRect.top - containerRect.top;

    const moveHandler = (moveEvent) => {
        let currentX = moveEvent.type.includes('mouse') ? moveEvent.clientX : moveEvent.touches[0].clientX;
        let currentY = moveEvent.type.includes('mouse') ? moveEvent.clientY : moveEvent.touches[0].clientY;
        
        let dx = currentX - startX;
        let dy = currentY - startY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            isDragging = true;
        }

        if (isDragging) {
            moveEvent.preventDefault();
            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;
            
            newLeft = Math.max(0, Math.min(newLeft, containerRect.width - elRect.width));
            newTop = Math.max(0, Math.min(newTop, containerRect.height - elRect.height));

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }
    };

    const endHandler = () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('mouseup', endHandler);
        document.removeEventListener('touchend', endHandler);
        
        el.style.transition = '';

        if (isDragging) {
            window.floatCallPos = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
        } else {
            if (window.wxActions && window.wxActions.resumeCall) {
                window.wxActions.resumeCall();
            }
        }
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchend', endHandler);
};

// ================= 🌟 快捷悬浮菜单引擎 (智能防溢出 + 全局毛玻璃) =================
window.quickMenuPos = null;
window.quickMenuExpanded = false;

window.toggleQuickMenu = function(e) {
    if (e) e.stopPropagation();
    window.quickMenuExpanded = !window.quickMenuExpanded;
    window.render();
};

window.startDragQuickMenu = function(e) {
    let isDragging = false;
    let startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    let startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    const el = document.getElementById('mc-quick-menu');
    if (!el) return;

    el.style.transition = 'none'; 

    const container = document.getElementById('phone-container');
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    let initialLeft = elRect.left - containerRect.left;
    let initialTop = elRect.top - containerRect.top;

    const moveHandler = (moveEvent) => {
        let currentX = moveEvent.type.includes('mouse') ? moveEvent.clientX : moveEvent.touches[0].clientX;
        let currentY = moveEvent.type.includes('mouse') ? moveEvent.clientY : moveEvent.touches[0].clientY;
        
        let dx = currentX - startX;
        let dy = currentY - startY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            isDragging = true;
        }

        if (isDragging) {
            moveEvent.preventDefault(); 
            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;
            
            newLeft = Math.max(0, Math.min(newLeft, containerRect.width - elRect.width));
            newTop = Math.max(0, Math.min(newTop, containerRect.height - elRect.height));

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }
    };

    const endHandler = () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('mouseup', endHandler);
        document.removeEventListener('touchend', endHandler);
        
        el.style.transition = '';

        if (isDragging) {
            window.quickMenuPos = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
        } else {
            window.toggleQuickMenu();
        }
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchend', endHandler);
};

function render() {
  document.querySelectorAll('[id$="-scroll"]').forEach(el => {
      window.globalScrollStates[el.id] = { top: el.scrollTop, left: el.scrollLeft };
  });
  
  const tempInputs = {};
  document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
      if (el.type === 'file') return; 
      if (el.type === 'checkbox') tempInputs[el.id] = el.checked;
      else tempInputs[el.id] = el.value;
  });
  
  const activeEl = document.activeElement;
  const focusId = activeEl && activeEl.id ? activeEl.id : null;
  let selStart = 0, selEnd = 0;
  if (focusId && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      try { selStart = activeEl.selectionStart; selEnd = activeEl.selectionEnd; } catch(e){}
  }
  
  const ap = store.appearance || {};
  let fontCss = ''; 

  if (window._lastFontRender !== ap.sysFont) {
      window._lastFontRender = ap.sysFont;
      
      let safeUrl = ap.sysFont ? ap.sysFont.trim() : '';
      let fontName = 'system-ui, -apple-system, sans-serif';

      let existingStyle = document.getElementById('mc-custom-font-style');
      if (existingStyle) existingStyle.remove();

      let rootStyle = document.getElementById('mc-root-font-style');
      if (rootStyle) rootStyle.remove();

      if (safeUrl) {
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
              style.textContent = `@font-face { font-family: '${fontName}'; src: url('${safeUrl}') ${fontFormat}; font-display: swap; }`;
              document.head.appendChild(style);
          } else {
              fontName = safeUrl; 
          }
      }

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

  if (ap.sysFontSize) {
    fontCss += `
      :root { 
          --chat-font-size: ${ap.sysFontSize}px !important; 
          --font-scale: calc(${ap.sysFontSize} / 14) !important; 
      }
    `;
    
    const sizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32];
    sizes.forEach(s => {
        fontCss += `.text-\\[${s}px\\] { font-size: calc(${s}px * var(--font-scale)) !important; }\n`;
    });
    
    fontCss += `
        .text-xs { font-size: calc(0.75rem * var(--font-scale)) !important; }
        .text-sm { font-size: calc(0.875rem * var(--font-scale)) !important; }
        .text-base { font-size: calc(1rem * var(--font-scale)) !important; }
        .text-lg { font-size: calc(1.125rem * var(--font-scale)) !important; }
        .text-xl { font-size: calc(1.25rem * var(--font-scale)) !important; }
        .text-2xl { font-size: calc(1.5rem * var(--font-scale)) !important; }
        .text-4xl { font-size: calc(2.25rem * var(--font-scale)) !important; }
        
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

  if (ap.interfaceBg && store.currentApp !== null) {
    fontCss += `
      #phone-container {
         background: url('${window.getCachedImageSrc(ap.interfaceBg)}') center/cover no-repeat !important;
      }
      #trans-app-screen, #trans-app-screen * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
      #trans-app-screen { background: #0d1117 !important; background-image: none !important; }
      #phone-container > div:not(#mc-chat-screen):not(#mc-status-bar):not(#trans-app-screen) {
         background-color: rgba(255, 255, 255, 0.3) !important; 
         background-image: none !important;
         backdrop-filter: blur(0px) !important; 
         -webkit-backdrop-filter: blur(0px) !important;
      }
      #phone-container > div:not(#mc-chat-screen) .bg-white {
         background-color: rgba(255, 255, 255, 0.8) !important;
         backdrop-filter: blur(15px) !important;
         -webkit-backdrop-filter: blur(15px) !important;
         border-color: rgba(255, 255, 255, 0.8) !important;
      }
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

  if (ap.topBarBg && store.currentApp !== null) {
    fontCss += `
      #phone-container > div > div.pt-12.pb-3, 
      #phone-container > div > div.pt-8.pb-3,
      .mc-topbar {
         background: url('${window.getCachedImageSrc(ap.topBarBg)}') center/cover no-repeat !important;
         background-color: transparent !important;
         border-bottom: none !important;
         box-shadow: none !important;
      }
    `;
  }

  if (ap.bottomBarBg && store.currentApp !== null) {
    fontCss += `
      #phone-container > div > div.pb-6.pt-2,
      #phone-container > div > div.absolute.bottom-0.pb-6,
      .mc-bottombar {
         background: url('${window.getCachedImageSrc(ap.bottomBarBg)}') center/cover no-repeat !important;
         background-color: transparent !important;
         border-top: none !important;
         box-shadow: none !important;
      }
    `;
  }

  const injectCustomIcons = (dict) => {
    if (!dict) return;
    Object.keys(dict).forEach(k => {
      if (!dict[k]) return;
      fontCss += `
        .${k} svg, .${k} i { display: none !important; }
        .${k} {
           background-image: url('${window.getCachedImageSrc(dict[k])}') !important;
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

  const injectCustomButtons = (dict) => {
    if (!dict) return;
    Object.keys(dict).forEach(k => {
      if (!dict[k]) return;
      fontCss += `
        .${k} svg, .${k} i { 
           stroke: transparent !important;
           fill: transparent !important;
           color: transparent !important;
           background-image: url('${window.getCachedImageSrc(dict[k])}') !important;
           background-position: center !important;
           background-size: contain !important;
           background-repeat: no-repeat !important;
        }
        .${k} { background-color: transparent !important; border: none !important; box-shadow: none !important; }
      `;
    });
  };

  injectCustomIcons(ap.customIcons);
  injectCustomButtons(ap.customButtons);
  
  // 🌟 暴力隐藏全局所有容器的滚动条
  fontCss += `
    .hide-scrollbar::-webkit-scrollbar { display: none !important; }
    .hide-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
    
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
  else if (store.currentApp === 'transmigrate') appHtml = renderTransmigrationApp(store);
  else appHtml = `
      <div class="w-full h-full bg-white flex flex-col items-center justify-center text-gray-400">
        <i data-lucide="hammer" class="w-12 h-12 mb-4 text-gray-300"></i>
        <p>这个页面还在开发中哦！</p>
        <button onclick="window.actions.setCurrentApp(null)" class="mt-6 px-4 py-2 bg-blue-500 text-white font-bold rounded-xl active:scale-95 transition-transform">返回桌面</button>
      </div>`;

  // 🌟 新增判断：当前是否处于开屏动画阶段？
  const isBooting = store.currentApp === null && window.homeState && window.homeState.isBooting;

  const isHomeDark = store.currentApp === null && (ap.darkMode || false);
  const txtClass = isHomeDark ? 'text-white drop-shadow-md' : 'text-gray-800 drop-shadow-sm';
  
  // 🌟 如果在开屏阶段，直接隐藏状态栏
  const statusBarHtml = (ap.hideStatusBar || isBooting) ? '' : `
    <div id="mc-status-bar" class="absolute top-0 left-0 right-0 flex bg-transparent justify-between items-center px-6 pt-3 pb-2 text-[11px] font-bold z-[9999] pointer-events-none ${txtClass}">
      <span id="status-time" class="tracking-wider">${store.currentTime || '12:00'}</span>
      <div class="flex items-center space-x-1.5 opacity-80">
        <i data-lucide="signal" style="width: 14px; height: 14px;"></i>
        <i data-lucide="wifi" style="width: 14px; height: 14px;"></i>
        <div class="flex items-center"><span class="mr-1">${store.batteryLevel || 100}%</span><i data-lucide="battery-medium" style="width: 16px; height: 16px;"></i></div>
      </div>
    </div>
  `;

  let globalCallHtml = '';
  // 🌟 如果在开屏阶段，抑制全局弹窗显示
  if (!isBooting && store.globalCallAlert) {
      const alert = store.globalCallAlert;
      let avatarHtml = '';
      if (alert.avatar && (alert.avatar.includes('http') || alert.avatar.startsWith('data:'))) {
          avatarHtml = `<img src="${window.getCachedImageSrc(alert.avatar)}" class="w-full h-full object-cover" />`;
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

  let floatCallHtml = '';
  // 🌟 如果在开屏阶段，隐藏悬浮球
  if (!isBooting && store.activeCall && (store.currentApp !== 'wechat' || window.wxState?.view !== 'call')) {
      const isVideo = store.activeCall.type === 'video';
      const duration = store.activeCall.duration || 0;
      const m = String(Math.floor(duration / 60)).padStart(2, '0');
      const s = String(duration % 60).padStart(2, '0');

      let posStyle = '';
      let posClasses = 'bottom-40 right-4';
      if (window.floatCallPos) {
          posClasses = '';
          posStyle = `left: ${window.floatCallPos.x}px; top: ${window.floatCallPos.y}px; right: auto; bottom: auto;`;
      }

      floatCallHtml = `
        <div id="mc-float-call" class="absolute z-[99990] opacity-100 rounded-[18px] p-3 flex flex-col items-center shadow-2xl cursor-grab active:scale-95 transition-transform animate-in fade-in-up zoom-in border border-white/20 select-none ${posClasses}" 
             onmousedown="window.startDragFloatCall(event)" ontouchstart="window.startDragFloatCall(event)"
             style="background-color: #07c160 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-image: none !important; touch-action: none; ${posStyle}">
           <i data-lucide="${isVideo ? 'video' : 'phone'}" class="w-5 h-5 mb-1 animate-pulse pointer-events-none" style="color: white !important;"></i>
           <span id="floating-call-time" class="text-[11px] font-mono font-bold tracking-wider opacity-100 pointer-events-none" style="color: white !important;">
               ${m}:${s}
           </span>
        </div>
      `;
  }

  let quickMenuHtml = '';
  // 🌟 如果在开屏阶段，彻底隐藏快捷设置悬浮球！
  if (!isBooting && store.enableQuickMenu) {
      const isExpanded = window.quickMenuExpanded;
      let posStyle = '';
      let posClasses = isExpanded ? 'rounded-[16px]' : 'rounded-full w-10 h-10'; 
      
      const container = document.getElementById('phone-container');
      const containerWidth = container ? container.clientWidth : window.innerWidth;
      const containerHeight = container ? container.clientHeight : window.innerHeight;

      let renderX = window.quickMenuPos ? window.quickMenuPos.x : null;
      let renderY = window.quickMenuPos ? window.quickMenuPos.y : null;
      
      if (renderX === null || renderY === null) {
          renderX = containerWidth - (isExpanded ? 190 : 50); 
          renderY = containerHeight * 0.25; 
      }
      
      if (isExpanded) {
          const menuWidth = 180; 
          const menuHeight = 145; 
          
          if (renderX + menuWidth > containerWidth - 12) renderX = containerWidth - menuWidth - 12;
          if (renderX < 12) renderX = 12;

          if (renderY + menuHeight > containerHeight - 12) renderY = containerHeight - menuHeight - 12;
          if (renderY < 12) renderY = 12;
      } else {
          const menuWidth = 40; 
          const menuHeight = 40;
          if (renderX + menuWidth > containerWidth) renderX = containerWidth - menuWidth;
          if (renderX < 0) renderX = 0;
          if (renderY + menuHeight > containerHeight) renderY = containerHeight - menuHeight;
          if (renderY < 0) renderY = 0;
      }
      
      posStyle = `left: ${renderX}px; top: ${renderY}px; right: auto; bottom: auto;`;

      const presetsHtml = (store.apiPresets || []).map((p, i) => `<option value="${i}" ${store.apiConfig?.name === p.name ? 'selected' : ''}>${p.name}</option>`).join('');

      if (isExpanded) {
          quickMenuHtml = `
              <div id="mc-quick-menu" class="absolute z-[99995] bg-white/50 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-3.5 flex flex-col space-y-3 animate-in zoom-in duration-200 select-none ${posClasses}" 
                   style="width: 180px; touch-action: none; ${posStyle}">
                  <div class="flex justify-between items-center mb-1 cursor-grab" onmousedown="window.startDragQuickMenu(event)" ontouchstart="window.startDragQuickMenu(event)">
                      <span class="text-[12px] font-black text-gray-800 flex items-center tracking-widest drop-shadow-sm"><i data-lucide="layers" class="w-3.5 h-3.5 mr-1.5 text-indigo-600"></i>快捷菜单</span>
                      <i data-lucide="x" class="w-4 h-4 text-gray-600 cursor-pointer active:scale-90 bg-white/60 rounded-full p-0.5 shadow-sm" onclick="window.toggleQuickMenu(event)"></i>
                  </div>
                  <div class="flex flex-col space-y-1" onclick="event.stopPropagation()">
                      <select onchange="window.settingsActions.quickLoadPreset(this.value)" class="w-full bg-white/60 border border-white/50 rounded-lg p-2 text-[11px] font-bold text-gray-800 outline-none focus:border-indigo-400 shadow-sm backdrop-blur-md">
                          <option value="">-- 切换 API 预设 --</option>
                          ${presetsHtml}
                      </select>
                  </div>
                  <button class="w-full bg-indigo-50/70 text-indigo-700 border border-indigo-200/50 rounded-lg py-2 text-[11px] font-bold active:bg-indigo-100/80 transition-colors flex items-center justify-center shadow-sm backdrop-blur-md" onclick="event.stopPropagation(); window.settingsActions.exportData()">
                      <i data-lucide="download-cloud" class="w-3.5 h-3.5 mr-1.5"></i>导出数据备份
                  </button>

<button class="w-full bg-indigo-50/70 text-indigo-700 border border-indigo-200/50 rounded-lg py-2 text-[11px] font-bold active:bg-indigo-100/80 transition-colors flex items-center justify-center shadow-sm backdrop-blur-md mb-2" onclick="window.backupToCloud()">
    <i data-lucide="cloud-upload" class="w-3.5 h-3.5 mr-1.5"></i>同步存档至云端
</button>

<button class="w-full bg-indigo-50/70 text-indigo-700 border border-indigo-200/50 rounded-lg py-2 text-[11px] font-bold active:bg-indigo-100/80 transition-colors flex items-center justify-center shadow-sm backdrop-blur-md" onclick="window.restoreFromCloud()">
    <i data-lucide="cloud-download" class="w-3.5 h-3.5 mr-1.5"></i>从云端恢复存档
</button>
              </div>
          `;
      } else {
          quickMenuHtml = `
              <div id="mc-quick-menu" class="absolute z-[99995] bg-white/50 backdrop-blur-xl border border-white/40 shadow-lg flex items-center justify-center cursor-grab active:scale-95 transition-transform select-none ${posClasses}" 
                   onmousedown="window.startDragQuickMenu(event)" ontouchstart="window.startDragQuickMenu(event)"
                   style="touch-action: none; ${posStyle}">
                  <i data-lucide="settings-2" class="w-5 h-5 text-indigo-600 pointer-events-none drop-shadow-sm"></i>
              </div>
          `;
      }
  }

  // 合并渲染！
  container.innerHTML = statusBarHtml + appHtml + globalCallHtml + floatCallHtml + quickMenuHtml;
  
  if (window.lucide) window.lucide.createIcons();
  
  if (store.currentApp === 'settings' && window.settingsActions?.updateStorageDisplay) {
      window.settingsActions.updateStorageDisplay();
  }
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
          el.focus(); 
          if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && selStart !== undefined) {
              try { el.setSelectionRange(selStart, selEnd); } catch(e){}
          }
      }
  }
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
  if (window.DB) {
     window.DB.set(JSON.parse(JSON.stringify(store))).catch(e => console.log('DB存储失败', e));
  }
};
window.DB = DB; 

async function initApp() {
  updateTime();
  setInterval(updateTime, 1000);

  // 🌟 图片缓存预热：把独立 IndexedDB 里的图片加载进内存，让首屏渲染就能用 Base64
  await ImageCacheDB.init();

  try {
    const savedDB = await DB.get();
    if (savedDB) {
       Object.assign(store, savedDB);
       store.currentApp = null;
    }
    window.render();

    // 🌟 引擎点火：在系统初始化完成后，启动全自动备份！
    window.startAutoBackup();

  } catch (e) {
    console.log('数据加载失败', e);
    window.render();
  }
}

window.onload = async () => {
  document.body.style.backgroundColor = "#F8F7F3"; 
  const isAuthorized = await checkAuth();
  if (isAuthorized) {
      initApp();
  }
};