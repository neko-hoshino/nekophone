// js/apps/setting.js
import { store } from '../store.js';

// --- 1. 内部逻辑：读取当前表单上填写的数值 ---
function getFormValues() {
  return {
    baseUrl: document.getElementById('api-base-url').value.trim(),
    apiKey: document.getElementById('api-key').value.trim(),
    model: document.getElementById('api-model').value.trim(),
    temperature: parseFloat(document.getElementById('api-temp').value)
  };
}

function getMinimaxValues() {
  return {
    enabled: document.getElementById('minimax-enabled').checked, 
    groupId: document.getElementById('minimax-group-id').value.trim(),
    apiKey: document.getElementById('minimax-api-key').value.trim()
  };
}

// --- 2. 绑定给 HTML 按钮的交互事件 ---
window.settingsActions = {
  updateTempDisplay: (val) => {
    document.getElementById('temp-display').innerText = val;
  },
  exportData: () => {
    const dataStr = JSON.stringify(store);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neko_backup_${new Date().toLocaleDateString().replace(/\//g,'-')}.json`;
    a.click();
    window.actions.showToast('备份已导出！请妥善保存在手机文件里');
  },
  factoryReset: () => {
    if (confirm('⚠️ 严重警告：这将彻底清空您的所有聊天记录、角色、身份、世界书以及设定！\n\n您确定要【恢复出厂设置】吗？')) {
       if (confirm('🚨 【最终确认】此操作绝对不可逆！\n请确保您已经导出了备份！真的要全部删除吗？')) {
          localStorage.removeItem('neko_store');
          if (window.DB) {
             const req = indexedDB.deleteDatabase('NekoPhoneDB');
             req.onsuccess = () => {
                window.actions.showToast('数据已彻底清空，正在重启宇宙...');
                setTimeout(() => location.reload(), 1500);
             };
             req.onerror = () => location.reload();
          } else {
             location.reload();
          }
       }
    }
  },
  updateStorageDisplay: () => {
    const dbSize = JSON.stringify(store).length;
    const mb = (dbSize / 1024 / 1024).toFixed(2);
    const el = document.getElementById('storage-size-display');
    if (el) el.innerText = `${mb} MB`;
  },
  optimizeStorage: async () => {
      window.actions.showToast('正在执行深层瘦身，请勿退出页面...');
      const beforeSize = JSON.stringify(store).length;
      
      const validCharIds = store.contacts.map(c => c.id);
      store.chats = store.chats.filter(c => validCharIds.includes(c.charId));
      store.memories = (store.memories || []).filter(m => validCharIds.includes(m.charId));
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const oldMomentsCount = (store.moments || []).length;
      store.moments = (store.moments || []).filter(m => m.id >= threeDaysAgo);
      const deletedCount = oldMomentsCount - store.moments.length;
      if (deletedCount > 0) console.log(`[系统] 已物理销毁 ${deletedCount} 条过期朋友圈数据`);
      
      const compressPromises = [];
      const compressIfNeed = (obj, key, isAvatar = false) => {
          const threshold = isAvatar ? 650000 : 6500000;
          if (obj[key] && obj[key].length > threshold && obj[key].startsWith('data:image')) {
              compressPromises.push(new Promise(res => {
                  window.actions.compressImage(obj[key], (newBase64) => {
                      obj[key] = newBase64; res();
                  }, isAvatar);
              }));
          }
      };

      store.personas.forEach(p => compressIfNeed(p, 'avatar', true));
      store.contacts.forEach(c => { 
          compressIfNeed(c, 'avatar', true); 
          compressIfNeed(c, 'videoAvatar', true); 
          compressIfNeed(c, 'bgImage', false); 
      });

      if (store.appearance) {
          compressIfNeed(store.appearance, 'wallpaper', false);
          compressIfNeed(store.appearance, 'topBarBg', false);
          compressIfNeed(store.appearance, 'bottomBarBg', false);
          compressIfNeed(store.appearance, 'interfaceBg', false);

          if (store.appearance.customIcons) {
              Object.keys(store.appearance.customIcons).forEach(iconKey => {
                  compressIfNeed(store.appearance.customIcons, iconKey, true);
              });
          }
          if (store.appearance.customButtons) {
              Object.keys(store.appearance.customButtons).forEach(btnKey => {
                  compressIfNeed(store.appearance.customButtons, btnKey, true);
              });
          }
      }

      if (store.momentBg) compressIfNeed(store, 'momentBg', false);
      store.chats.forEach(chat => chat.messages.forEach(m => { 
          if (m.imageUrl) compressIfNeed(m, 'imageUrl', false); 
      }));
      store.moments?.forEach(m => { 
          if (m.imageUrl) compressIfNeed(m, 'imageUrl', false); 
      });

      await Promise.all(compressPromises);
      const afterSize = JSON.stringify(store).length;
      const savedMb = ((beforeSize - afterSize) / 1024 / 1024).toFixed(2);
      window.actions.showToast(`瘦身完成！共为您清理出 ${savedMb} MB 空间！`);
      window.render();
  },
  importData: (event) => {
    const file = event.target.files[0]; if(!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if(imported && imported.contacts) {
           Object.assign(store, imported);
           store.currentApp = null;
           if (window.DB) {
              window.DB.set(store).then(() => {
                 window.actions.showToast('数据恢复成功！正在重启系统...');
                 setTimeout(() => location.reload(), 1500); 
              });
           }
        } else { window.actions.showToast('无效的备份文件！'); }
      } catch(err) { window.actions.showToast('文件解析失败！'); }
    };
    r.readAsText(file);
    event.target.value = '';
  },
  toggleNotification: (e) => {
    const isChecked = e.target.checked;
    if (isChecked) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') {
          store.enableNotifications = true;
          window.actions.showToast('系统通知已开启！请放心切后台');
        } else {
          e.target.checked = false; 
          store.enableNotifications = false;
          window.actions.showToast('授权被拒绝！请确保是从主屏幕打开的哦');
        }
        window.render();
      });
    } else {
      store.enableNotifications = false;
      window.actions.showToast('系统通知已静音');
      window.render();
    }
  },
  toggleLocation: (e) => {
    const isChecked = e.target.checked;
    if (isChecked) {
      if (!navigator.geolocation) {
          e.target.checked = false;
          return window.actions.showToast('您的设备不支持定位功能');
      }
      window.actions.showToast('正在请求定位权限...');
      navigator.geolocation.getCurrentPosition(
          (pos) => {
              store.enableLocation = true;
              window.actions.showToast('📍 高精定位已开启！真实外卖雷达上线');
              if (window.actions.saveStore) window.actions.saveStore();
              window.render();
          },
          (err) => {
              e.target.checked = false;
              store.enableLocation = false;
              window.actions.showToast('授权被拒绝！雷达已关闭');
              if (window.actions.saveStore) window.actions.saveStore();
              window.render();
          },
          { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      store.enableLocation = false;
      if (store.foodPoolInfo) store.foodPoolInfo = null;
      if (store.shoppingData && store.shoppingData.userRealLocation) store.shoppingData.userRealLocation = '';
      window.actions.showToast('定位已关闭，AI 将自由发挥外卖内容！');
      if (window.actions.saveStore) window.actions.saveStore();
      window.render();
    }
  },
  toggleQuickMenu: (e) => {
    store.enableQuickMenu = e.target.checked;
    if (window.actions.saveStore) window.actions.saveStore();
    window.actions.showToast(store.enableQuickMenu ? '快捷菜单已开启，悬浮在屏幕边缘' : '快捷菜单已关闭');
    window.render();
  },
  connectPushServer: async () => {
    try {
      window.actions.showToast('正在启动天线并请求权限...');
      await navigator.serviceWorker.register('./sw.js'); 
      const reg = await navigator.serviceWorker.ready;
      const publicVapidKey = 'BHrrXkaw9VrEtv1g2XcykgbQPsFrSL8WwsxqoZ2Qg3tZGWXr1bHln5LUMUZmiYwLr7RwX7OW9HSAA5EiSA3g3QY'; 
      const padding = '='.repeat((4 - publicVapidKey.length % 4) % 4);
      const base64 = (publicVapidKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const keyArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) keyArray[i] = rawData.charCodeAt(i);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArray
      });
      const serverUrl = 'https://neko-hoshino.duckdns.org/subscribe'; 
      
      window.actions.showToast('权限获取成功，正在直连纽约机房...');
      const res = await fetch(serverUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-secret-token': localStorage.getItem('neko_server_pwd') || '' 
        },
        body: JSON.stringify(sub)
      });
      
      if(res.ok) window.actions.showToast('纽约机房绑定成功！');
      else window.actions.showToast('绑定失败了，检查下网络');
    } catch(e) {
      console.error('推送错误详情:', e);
      window.actions.showToast('推送权限被拒绝或天线安装失败，请按 F12 查看控制台');
    }
  },

  testPushServer: async () => {
     const reg = await navigator.serviceWorker.ready;
     const sub = await reg.pushManager.getSubscription();
     if (!sub) return window.actions.showToast('请先绑定设备哦');

     const serverUrl = 'https://neko-hoshino.duckdns.org/test-push';
     fetch(serverUrl, { 
        method: 'POST', 
        headers: { 
            'Content-Type': 'application/json',
            'x-secret-token': localStorage.getItem('neko_server_pwd') || '' 
        },
        body: JSON.stringify({ endpoint: sub.endpoint }) 
     });
     window.actions.showToast('已向云端发射专属测试指令！');
  },
  loadPreset: (index) => {
    if (index === "") return;
    const preset = store.apiPresets[index];
    document.getElementById('api-base-url').value = preset.baseUrl;
    document.getElementById('api-key').value = preset.apiKey;
    const modelSelect = document.getElementById('api-model');
    modelSelect.innerHTML = `<option value="${preset.model}">${preset.model}</option>`;
    modelSelect.value = preset.model;
    
    document.getElementById('api-temp').value = preset.temperature;
    document.getElementById('temp-display').innerText = preset.temperature;
    window.actions.showToast(`已加载预设：${preset.name}`);
  },

  quickLoadPreset: (index) => {
    if (index === "") return;
    const preset = store.apiPresets[index];
    store.apiConfig = {
        baseUrl: preset.baseUrl,
        apiKey: preset.apiKey,
        model: preset.model,
        temperature: preset.temperature
    };
    if (window.actions.saveStore) window.actions.saveStore();
    window.actions.showToast(`✅ 已快捷切换至预设：${preset.name}`);
    window.quickMenuExpanded = false; 
    window.render();
  },

  deletePreset: () => {
    const selectEl = document.getElementById('preset-selector');
    const index = selectEl.value;
    if (index === "") return window.actions.showToast('请先选择一个预设');
    
    const presetName = store.apiPresets[index].name;
    if (confirm(`确定要删除预设 [${presetName}] 吗？`)) {
        store.apiPresets.splice(index, 1);
        if (window.actions.saveStore) window.actions.saveStore();
        window.actions.showToast(`✅ 预设已删除`);
        window.actions.setCurrentApp('settings'); 
    }
  },

  savePreset: () => {
    const name = document.getElementById('new-preset-name').value.trim();
    if (!name) return window.actions.showToast('⚠️ 请输入预设名称！');
    
    const newPreset = { name, ...getFormValues() };
    store.apiPresets.push(newPreset);
    document.getElementById('new-preset-name').value = ''; 
    window.actions.showToast(`✅ 预设 [${name}] 保存成功！`);
    
    window.actions.setCurrentApp('settings');
  },

  autoFetchModels: async (selectEl) => {
    if (selectEl.options.length > 1) return;

    const vals = getFormValues();
    if (!vals.baseUrl || !vals.apiKey) {
      window.actions.showToast('⚠️ 请先填写 Base URL 和 API Key');
      return;
    }

    const currentModel = selectEl.value;
    selectEl.innerHTML = `<option value="${currentModel}">正在拉取可用模型...</option>`;

    try {
      const res = await fetch(`${vals.baseUrl.replace(/\/+$/, '')}/models`, {
        headers: { 'Authorization': `Bearer ${vals.apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP 状态码: ${res.status}`);
      const data = await res.json();

      let models = [];
      if (data && data.data && Array.isArray(data.data)) {
        models = data.data.map(m => m.id);
      } else {
        throw new Error('API 返回的数据格式不符合规范');
      }

      if (models.length > 0) {
        selectEl.innerHTML = models.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('');
      } else {
        selectEl.innerHTML = `<option value="${currentModel}">${currentModel}</option>`;
      }
    } catch (error) {
      window.actions.showToast(`❌ 拉取模型失败: ${error.message}`);
      selectEl.innerHTML = `<option value="${currentModel}">${currentModel}</option>`;
    }
  },

  applySettings: () => {
    store.apiConfig = getFormValues();
    store.minimaxConfig = getMinimaxValues(); 
    window.actions.showToast('设置已生效！');
  }
};

// --- 3. 渲染 UI 界面 ---
export function renderSettingsApp(store) {
  const c = store.apiConfig; 
  const presetsHtml = store.apiPresets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');

  return `
    <div class="w-full h-full bg-gray-50 flex flex-col relative animate-in slide-in-from-bottom-4 fade-in duration-300">
      
      <div class="bg-white/80 backdrop-blur-md pt-8 pb-3 px-4 flex items-center border-b border-gray-200 z-10 sticky top-0">
        <div class="cursor-pointer text-gray-800" onclick="window.actions.setCurrentApp(null)">
          <i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i>
        </div>
        <span class="absolute left-1/2 -translate-x-1/2 font-black text-gray-800 text-[17px]">系统设置</span>
      </div>

      <div id="setting-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4 pb-20">

      <div class="bg-white p-4 rounded-[16px] shadow-sm border border-gray-100 mt-4 space-y-4">
            <div class="flex justify-between items-center border-b border-gray-50 pb-3">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 text-[14px] flex items-center"><i data-lucide="bell-ring" class="w-4 h-4 mr-2 text-purple-500"></i>允许系统通知</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 ml-6">开启后切后台也能收到消息</span>
                </div>
                <input type="checkbox" ${("Notification" in window && Notification.permission === 'granted' && store.enableNotifications !== false) ? 'checked' : ''} onchange="window.settingsActions.toggleNotification(event)" class="ios-switch shrink-0" />
            </div>
            
            <div class="flex justify-between items-center">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 text-[14px] flex items-center"><i data-lucide="map-pin" class="w-4 h-4 mr-2 text-rose-500"></i>开启高精定位 (外卖雷达)</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 ml-6">关闭后，AI 将自由发挥外卖店铺与菜品</span>
                </div>
                <input type="checkbox" ${store.enableLocation ? 'checked' : ''} onchange="window.settingsActions.toggleLocation(event)" class="ios-switch shrink-0" />
            </div>

            <div class="flex justify-between items-center border-t border-gray-50 pt-3">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 text-[14px] flex items-center"><i data-lucide="layers" class="w-4 h-4 mr-2 text-indigo-500"></i>全局快捷悬浮菜单</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 ml-6">在屏幕侧边显示悬浮窗，快捷切换预设/导出数据</span>
                </div>
                <input type="checkbox" ${store.enableQuickMenu ? 'checked' : ''} onchange="window.settingsActions.toggleQuickMenu(event)" class="ios-switch shrink-0" />
            </div>
        </div>
        
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          <div class="flex items-center space-x-2 text-blue-500 mb-2">
            <i data-lucide="key" style="width: 18px; height: 18px;"></i>
            <h3 class="font-bold text-gray-800 text-sm">文本对话 API 设置</h3>
          </div>
          
          <div class="pb-2 border-b border-gray-50 flex items-center space-x-2">
            <div class="flex-1">
              <span class="text-[10px] font-bold text-gray-500 block mb-1">快速加载预设：</span>
              <select id="preset-selector" onchange="window.settingsActions.loadPreset(this.value)" class="w-full p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold outline-none cursor-pointer">
                <option value="">-- 选择已保存的预设 --</option>
                ${presetsHtml}
              </select>
            </div>
            <button onclick="window.settingsActions.deletePreset()" class="mt-4 w-9 h-9 flex items-center justify-center bg-red-50 text-red-500 rounded-xl active:bg-red-100 transition-colors" title="删除选中预设">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
          
          <span class="text-[10px] font-bold text-gray-500 block -mb-1 mt-2">Base URL (兼容 OpenAI 格式):</span>
          <input type="text" id="api-base-url" value="${c.baseUrl}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors" />
          
          <span class="text-[10px] font-bold text-gray-500 block -mb-1">API Key (秘钥):</span>
          <input type="password" id="api-key" value="${c.apiKey}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors" />

          <span class="text-[10px] font-bold text-gray-500 block -mb-1 mt-2">模型名称 (Model):</span>
          <select id="api-model" 
                  onfocus="window.settingsActions.autoFetchModels(this)" 
                  onchange="store.apiConfig.model = this.value; window.render();"
                  class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none">
             <option value="${c.model}">${c.model}</option>
          </select>
          
          <div class="pt-2">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs font-bold text-gray-600">创造力 (Temperature): <span id="temp-display" class="text-blue-500">${c.temperature}</span></span>
            </div>
            <input type="range" id="api-temp" min="0" max="2" step="0.1" value="${c.temperature}" oninput="window.settingsActions.updateTempDisplay(this.value)" class="w-full accent-blue-500" />
          </div>

          <div class="pt-3 border-t border-gray-100 mt-2 space-y-2">
            <h3 class="font-bold text-gray-800 text-sm">保存为新预设</h3>
            <div class="flex space-x-2">
              <input type="text" id="new-preset-name" placeholder="预设名称 (如: 备用代理)" class="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              <button onclick="window.settingsActions.savePreset()" class="px-4 bg-blue-500 text-white font-medium rounded-xl flex items-center justify-center active:bg-blue-600 transition-colors shadow-sm">
                <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
            <style>
              .ios-switch { position: relative; width: 44px; height: 24px; appearance: none; background: #e5e5ea; border-radius: 24px; outline: none; cursor: pointer; transition: background 0.3s ease; }
              .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.3s ease; }
              .ios-switch:checked { background: #34c759; }
              .ios-switch:checked::after { transform: translateX(20px); }
            </style>
            
            <div class="flex justify-between items-center border-b border-gray-50 pb-2 mb-2">
              <h3 class="font-bold text-gray-800 text-sm flex items-center"><i data-lucide="mic" class="w-4 h-4 mr-1 text-blue-500"></i>Minimax 语音配置</h3>
              <input type="checkbox" id="minimax-enabled" ${store.minimaxConfig?.enabled !== false ? 'checked' : ''} class="ios-switch" />
            </div>

            <span class="text-[10px] font-bold text-gray-500 block mt-2">Group ID:</span>
            <input type="text" id="minimax-group-id" value="${store.minimaxConfig?.groupId || ''}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" />
            
            <span class="text-[10px] font-bold text-gray-500 block">API Key:</span>
            <input type="text" id="minimax-api-key" value="${store.minimaxConfig?.apiKey || ''}" autocomplete="off" style="-webkit-text-security: disc;" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" />
        </div>

        <button onclick="window.settingsActions.applySettings()" class="w-full mt-4 py-3.5 bg-[#07c160] text-white font-bold rounded-xl active:opacity-80 shadow-md transition-opacity flex justify-center items-center space-x-2">
          <i data-lucide="check-circle" style="width: 18px; height: 18px;"></i>
          <span>保存并全局应用</span>
        </button>

        <div class="bg-white p-4 rounded-[16px] shadow-sm border border-gray-100 mt-4">
          <h3 class="font-bold text-gray-800 text-[15px] flex items-center mb-3">
            <i data-lucide="cloud-lightning" class="w-4 h-4 mr-2 text-purple-500"></i>云端跨国通道
          </h3>
    
          <div class="mb-4">
            <input type="password" placeholder="请输入服务器访问密钥" 
              value="${localStorage.getItem('neko_server_pwd') || ''}" 
              onchange="localStorage.setItem('neko_server_pwd', this.value.trim()); window.actions.showToast('密钥已安全存入本地');"
              class="w-full bg-gray-50 border border-gray-100 rounded-[12px] p-3 outline-none text-[13px] font-mono text-gray-800 focus:border-purple-300 transition-colors" />
            <p class="text-[10px] text-gray-400 mt-1 pl-1">密钥仅保存在您的本地浏览器缓存中。</p>
          </div>

          <button onclick="window.settingsActions.connectPushServer()" class="w-full bg-purple-500 text-white font-bold py-3.5 rounded-[12px] active:scale-95 transition-transform text-[14px] mb-2 shadow-[0_4px_12px_rgba(168,85,247,0.2)] flex items-center justify-center">
            1. 绑定当前设备接收推送
          </button>
          <button onclick="window.settingsActions.testPushServer()" class="w-full bg-gray-100 text-gray-800 font-bold py-3.5 rounded-[12px] active:bg-gray-200 transition-colors text-[14px] flex items-center justify-center">
            2. 发射云端测试广播
          </button>
        </div>

        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mt-4 space-y-3">
           <div class="flex justify-between items-center">
             <span class="font-bold text-gray-800 text-sm flex items-center"><i data-lucide="hard-drive" class="w-4 h-4 mr-1 text-blue-500"></i>系统存储探针</span>
             <span id="storage-size-display" class="text-[14px] font-mono font-black text-[#07c160]">计算中...</span>
           </div>
           <p class="text-[11px] text-gray-400 font-bold leading-relaxed">已接入底层海量数据库，支持 1000MB+ 存储。若读取变慢可点击瘦身。</p>
           <button onclick="window.settingsActions.optimizeStorage()" class="w-full bg-blue-50 text-blue-500 font-bold py-2.5 rounded-xl active:bg-blue-100 transition-colors text-[13px] flex items-center justify-center border border-blue-100"><i data-lucide="zap" class="w-4 h-4 mr-1"></i>深度压缩并清理无用数据</button>
           <div class="mt-8 mb-6 flex flex-col space-y-3 px-1 animate-in slide-in-from-bottom-2 duration-500">
          <button onclick="window.settingsActions.factoryReset()" class="w-full bg-red-50 text-red-500 font-bold py-2.5 rounded-xl active:bg-red-100 transition-colors text-[13px] flex items-center justify-center border border-red-100">
             <i data-lucide="alert-triangle" class="w-4 h-4 mr-2"></i>清除所有数据 (恢复出厂设置)
          </button>
        </div>
        </div>

        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mt-4 space-y-0">
            <h3 class="font-bold text-gray-800 text-sm flex items-center mb-2"><i data-lucide="database" class="w-4 h-4 mr-1 text-blue-500"></i>系统数据备份</h3>
            
            <div class="flex justify-between items-center py-3.5 border-b border-gray-50 cursor-pointer active:bg-gray-50 transition-colors" onclick="window.settingsActions.exportData()">
              <span class="text-[13px] font-bold text-gray-700">导出备份文件</span>
              <i data-lucide="download-cloud" class="w-4.5 h-4.5 text-gray-400"></i>
            </div>
            
            <input type="file" id="import-data-input" accept=".json" class="hidden" onchange="window.settingsActions.importData(event)" />
            <div class="flex justify-between items-center py-3.5 cursor-pointer active:bg-gray-50 transition-colors" onclick="document.getElementById('import-data-input').click()">
              <span class="text-[13px] font-bold text-gray-700">恢复本地数据</span>
              <i data-lucide="upload-cloud" class="w-4.5 h-4.5 text-gray-400"></i>
            </div>
        </div>

      </div>
    </div>
  `;
}