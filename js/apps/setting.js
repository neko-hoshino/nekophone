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
    enabled: document.getElementById('minimax-enabled').checked, // 新增：全局开关
    groupId: document.getElementById('minimax-group-id').value.trim(),
    apiKey: document.getElementById('minimax-api-key').value.trim()
  };
}

// --- 2. 绑定给 HTML 按钮的交互事件 ---
window.settingsActions = {
  // 拖动滑块时实时显示数值
  updateTempDisplay: (val) => {
    document.getElementById('temp-display').innerText = val;
  },
  // 数据备份引擎
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
  // 数据清空引擎
  factoryReset: () => {
    if (confirm('⚠️ 严重警告：这将彻底清空您的所有聊天记录、角色、身份、世界书以及设定！\n\n您确定要【恢复出厂设置】吗？')) {
       if (confirm('🚨 【最终确认】此操作绝对不可逆！\n请确保您已经导出了备份！真的要全部删除吗？')) {
          // 1. 炸掉 LocalStorage
          localStorage.removeItem('neko_store');
          // 2. 炸掉海量数据库 IndexedDB
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
  // 内存探针更新
  updateStorageDisplay: () => {
    const dbSize = JSON.stringify(store).length;
    const mb = (dbSize / 1024 / 1024).toFixed(2);
    const el = document.getElementById('storage-size-display');
    if (el) el.innerText = `${mb} MB`;
  },
  // 一键瘦身与无用数据清理引擎
    optimizeStorage: async () => {
        window.actions.showToast('正在执行深层瘦身，请勿退出页面...');
        const beforeSize = JSON.stringify(store).length;
        
        // 1. 物理抹杀孤儿数据 (删掉已经被删除的角色的聊天和记忆)
        const validCharIds = store.contacts.map(c => c.id);
        store.chats = store.chats.filter(c => validCharIds.includes(c.charId));
        store.memories = (store.memories || []).filter(m => validCharIds.includes(m.charId));
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        const oldMomentsCount = (store.moments || []).length;
        store.moments = (store.moments || []).filter(m => m.id >= threeDaysAgo);
        const deletedCount = oldMomentsCount - store.moments.length;
        if (deletedCount > 0) console.log(`[系统] 已物理销毁 ${deletedCount} 条过期朋友圈数据`);
        
        // 🌟 2. 将历史积压的庞大 Base64 原图进行智能分级瘦身
        const compressPromises = [];
        const compressIfNeed = (obj, key, isAvatar = false) => {
            // 头像及UI小图标：只要大于 500KB (约 650000 字符) 就强制触发压缩
            // 其他图片(壁纸/照片)：大于 5MB (约 6500000 字符) 才执行压缩
            const threshold = isAvatar ? 650000 : 6500000;
            if (obj[key] && obj[key].length > threshold && obj[key].startsWith('data:image')) {
                compressPromises.push(new Promise(res => {
                    // 第三个参数传 isAvatar，决定是否进行中度/重度分辨率压缩
                    window.actions.compressImage(obj[key], (newBase64) => {
                        obj[key] = newBase64; res();
                    }, isAvatar);
                }));
            }
        };

        // 明确指定谁是头像，谁是壁纸
        store.personas.forEach(p => compressIfNeed(p, 'avatar', true));
        store.contacts.forEach(c => { 
            compressIfNeed(c, 'avatar', true); 
            compressIfNeed(c, 'videoAvatar', true); 
            compressIfNeed(c, 'bgImage', false); // 聊天背景属于大图
        });

        // 🌟 核心升级：外观图库全面纳入监控！
        if (store.appearance) {
            compressIfNeed(store.appearance, 'wallpaper', false);
            compressIfNeed(store.appearance, 'topBarBg', false);
            compressIfNeed(store.appearance, 'bottomBarBg', false);
            compressIfNeed(store.appearance, 'interfaceBg', false);

            // 遍历监控所有【桌面 App 图标】
            if (store.appearance.customIcons) {
                Object.keys(store.appearance.customIcons).forEach(iconKey => {
                    compressIfNeed(store.appearance.customIcons, iconKey, true);
                });
            }
            // 遍历监控所有【聊天室与扩展菜单按钮】
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
  // 恢复数据也必须写入新的 DB 引擎
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
  // 系统通知滑块专属动作
  toggleNotification: (e) => {
    const isChecked = e.target.checked;
    if (isChecked) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') {
          store.enableNotifications = true;
          window.actions.showToast('系统通知已开启！请放心切后台');
        } else {
          e.target.checked = false; // 授权失败，把滑块自动弹回去
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
  // 🌟 高精定位开关引擎
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
      // 关闭时：切断定位并强行销毁当前的真实外卖库，逼迫 AI 产生幻觉
      store.enableLocation = false;
      if (store.foodPoolInfo) store.foodPoolInfo = null;
      if (store.shoppingData && store.shoppingData.userRealLocation) store.shoppingData.userRealLocation = '';
      window.actions.showToast('定位已关闭，AI 将自由发挥外卖内容！');
      if (window.actions.saveStore) window.actions.saveStore();
      window.render();
    }
  },
  // 🌟 云端推送绑定引擎
  connectPushServer: async () => {
    try {
      // 🌟 1. 把 Toast 放在最前面，只要按钮能按，就一定会弹！
      window.actions.showToast('正在启动天线并请求权限...');
      
      // 🌟 2. 强行把天线文件安装进浏览器 (假设 sw.js 和 index.html 在同一个文件夹)
      // 如果你的 sw.js 在 js 文件夹里，请改成 './js/sw.js'
      await navigator.serviceWorker.register('./sw.js'); 
      
      const reg = await navigator.serviceWorker.ready;
      
      // 把你的乱码 Public Key 填在这里 (保留单引号)
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
      // 🌟 终极 HTTPS 域名！
      const serverUrl = 'https://neko-hoshino.duckdns.org/subscribe'; 
      
      window.actions.showToast('权限获取成功，正在直连纽约机房...');
      const res = await fetch(serverUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-secret-token': localStorage.getItem('neko_server_pwd') || '' // 👈 交上秘密令牌，验证身份用
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
            'x-secret-token': localStorage.getItem('neko_server_pwd') || '' // 👈 交上秘密令牌，验证身份用
        },
        body: JSON.stringify({ endpoint: sub.endpoint }) // 👈 同样交上设备号
     });
     window.actions.showToast('已向云端发射专属测试指令！');
  },
  // 读取预设并填入表单
  loadPreset: (index) => {
    if (index === "") return;
    const preset = store.apiPresets[index];
    document.getElementById('api-base-url').value = preset.baseUrl;
    document.getElementById('api-key').value = preset.apiKey;
    document.getElementById('api-model').value = preset.model;
    document.getElementById('api-temp').value = preset.temperature;
    document.getElementById('temp-display').innerText = preset.temperature;
    window.actions.showToast(`已加载预设：${preset.name}`);
  },

  // 把当前表单保存为新预设
  savePreset: () => {
    const name = document.getElementById('new-preset-name').value.trim();
    if (!name) return window.actions.showToast('⚠️ 请输入预设名称！');
    
    const newPreset = { name, ...getFormValues() };
    store.apiPresets.push(newPreset);
    document.getElementById('new-preset-name').value = ''; // 清空输入框
    window.actions.showToast(`✅ 预设 [${name}] 保存成功！`);
    
    // 刷新一下当前页面，让下拉菜单里出现新预设
    window.actions.setCurrentApp('settings');
  },

  // 一键拉取可用模型
  fetchModels: async () => {
    const btn = document.getElementById('fetch-models-btn');
    const vals = getFormValues();
    if (!vals.baseUrl || !vals.apiKey) {
      return window.actions.showToast('⚠️ 请先填写 Base URL 和 API Key');
    }

    btn.innerText = '拉取中...';
    btn.disabled = true;

    try {
      // 兼容 OpenAI 格式的拉取接口
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
        window.actions.showToast(`✅ 成功拉取 ${models.length} 个模型！`);
        // 把拉取到的模型塞进 datalist 下拉提示框里
        const dataList = document.getElementById('model-list');
        dataList.innerHTML = models.map(m => `<option value="${m}">`).join('');
        document.getElementById('api-model').value = models[0]; // 自动填入第一个
      }
    } catch (error) {
      window.actions.showToast(`❌ 拉取失败: ${error.message}`);
    } finally {
      btn.innerText = '拉取可用模型';
      btn.disabled = false;
    }
  },

  // 最终应用：保存到全局 Store
  applySettings: () => {
    store.apiConfig = getFormValues();
    store.minimaxConfig = getMinimaxValues(); 
    window.actions.showToast('设置已生效！');
  }
};

// --- 3. 渲染 UI 界面 ---
export function renderSettingsApp(store) {
  const c = store.apiConfig; // 当前生效的配置
  const presetsHtml = store.apiPresets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');

  return `
    <div class="w-full h-full bg-gray-50 flex flex-col relative animate-in slide-in-from-bottom-4 fade-in duration-300">
      
      <div class="bg-white/80 backdrop-blur-md pt-8 pb-3 px-4 flex items-center border-b border-gray-200 z-10 sticky top-0">
        <div class="cursor-pointer text-gray-800" onclick="window.actions.setCurrentApp(null)">
          <i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i>
        </div>
        <span class="absolute left-1/2 -translate-x-1/2 font-black text-gray-800 text-[17px]">系统设置</span>
      </div>

      <div id="setting-scroll" class="flex-1 overflow-y-auto p-4 space-y-4 pb-20">

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
        </div>
        
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          <div class="flex items-center space-x-2 text-blue-500 mb-2">
            <i data-lucide="key" style="width: 18px; height: 18px;"></i>
            <h3 class="font-bold text-gray-800 text-sm">文本对话 API 设置</h3>
          </div>
          
          <div class="pb-2 border-b border-gray-50">
            <span class="text-[10px] font-bold text-gray-500 block mb-1">快速加载预设：</span>
            <select onchange="window.settingsActions.loadPreset(this.value)" class="w-full p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold outline-none cursor-pointer">
              <option value="">-- 选择已保存的预设 --</option>
              ${presetsHtml}
            </select>
          </div>
          
          <span class="text-[10px] font-bold text-gray-500 block -mb-1 mt-2">Base URL (兼容 OpenAI 格式):</span>
          <input type="text" id="api-base-url" value="${c.baseUrl}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors" />
          
          <span class="text-[10px] font-bold text-gray-500 block -mb-1">API Key (秘钥):</span>
          <input type="password" id="api-key" value="${c.apiKey}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors" />

          <div class="flex justify-between items-end mb-1 mt-2">
            <span class="text-[10px] font-bold text-gray-500 block">模型名称 (Model):</span>
            <button id="fetch-models-btn" onclick="window.settingsActions.fetchModels()" class="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-600 active:bg-blue-200 transition-colors">
              拉取可用模型
            </button>
          </div>
          <input type="text" id="api-model" value="${c.model}" list="model-list" placeholder="手动输入，或点击上方拉取" 
          onfocus="this.dataset.old = this.value; this.value = '';" 
          onblur="if(!this.value) this.value = this.dataset.old;" 
          onchange="store.apiConfig.model = this.value; window.render();"
          class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors" />
          <datalist id="model-list"></datalist>
          
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