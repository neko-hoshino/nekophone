// js/apps/wechat/render.js — 主渲染函数
import { wxState } from './state.js';
import { getNowTime, formatTimeElapsed } from './shared.js';

export function renderWeChatApp(store) {
  // 🌟 初始化旧数据的分组字段
  if (!store.personas || store.personas.length === 0) store.personas = [{ id: 'p_default', name: '点击编辑', avatar: '', prompt: '' }];
  if (!store.contacts) store.contacts = [];
  if (!store.chats) store.chats = [];
  if (!store.groups || store.groups.length === 0) store.groups = [{ id: 'default', name: '默认分组' }];
  store.contacts.forEach(c => { if (!c.groupId) c.groupId = 'default'; });

  // 🌟 幽灵防卡死：兼容群聊验证
  if (wxState.activeChatId) {
     const activeChat = store.chats.find(c => c.charId === wxState.activeChatId);
     if (!activeChat) {
         wxState.view = 'main'; wxState.activeChatId = null;
     } else if (!activeChat.isGroup && !store.contacts.find(c => c.id === wxState.activeChatId)) {
         // 如果是单聊且角色被删了，强制退出
         wxState.view = 'main'; wxState.activeChatId = null;
     }
  }

  const chatData = store.chats.find(c => c.charId === wxState.activeChatId) || { messages: [] };
  const isGroup = chatData.isGroup === true;
  
  // 🌟 核心拆分：如果是群聊，没有单独的 char 对象！
  const char = isGroup ? null : store.contacts.find(c => c.id === wxState.activeChatId);
  
  // 🌟 精准身份绑定：提取你提议的“群聊专属马甲”
  const pId = isGroup ? chatData.boundPersonaId : (char ? char.boundPersonaId : store.personas[0].id);
  const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
  const myAvatar = chatData.myAvatar || boundPersona.avatar; // 🌟 独立情头：优先读取本房间的专属头像，如果没有才用马甲的！
  const formatMomentTime = (timestamp) => {
    if (!timestamp) return '刚刚';
    const now = new Date();
    const target = new Date(timestamp);
    const diffDays = Math.floor((now - target) / (1000 * 60 * 60 * 24));
    const timeStr = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    if (diffDays === 0) return timeStr;
    if (diffDays === 1) return `昨天 ${timeStr}`;
    if (diffDays === 2) return `2天前 ${timeStr}`;
    // 更早的显示具体日期
    return `${target.getMonth()+1}月${target.getDate()}日 ${timeStr}`;
};

  // 🌟 提取全局复用的重roll导演弹窗
  const globalRerollModalHtml = wxState.showRerollModal ? `
  <div class="mc-modal-overlay absolute inset-0 z-[999] bg-black/40 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm" onclick="window.wxActions.closeRerollModal()" ontouchstart="event.preventDefault(); window.wxActions.closeRerollModal()">
      <div class="mc-modal-content bg-[#f6f6f6] w-full rounded-[24px] overflow-hidden shadow-2xl flex flex-col" onclick="event.stopPropagation()" ontouchstart="event.stopPropagation()">
          <div class="px-6 pt-6 pb-4">
              <h3 class="text-[18px] font-extrabold text-gray-800 mb-2 flex items-center"><i data-lucide="refresh-cw" class="w-5 h-5 mr-2 text-blue-500"></i>定向重新生成</h3>
              <p class="text-[13px] text-gray-500 mb-4">告诉角色你希望它怎么修改这条回复（留空则默认按原语境重试）。</p>
              <textarea id="reroll-input" class="w-full h-24 bg-gray-50/50 border border-gray-200/60 rounded-[12px] p-3 text-[14px] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-none hide-scrollbar" placeholder="例如：语气再稍微温柔一点..."></textarea>
          </div>
          <div class="flex border-t border-gray-100/80 bg-gray-50/50">
              <button class="flex-1 py-3.5 text-[15px] font-bold text-gray-500 active:bg-gray-100 transition-colors" onclick="window.wxActions.closeRerollModal()" ontouchend="event.preventDefault(); window.wxActions.closeRerollModal()">取消</button>
              <div class="w-px bg-gray-100/80"></div>
              <button class="flex-1 py-3.5 text-[15px] font-extrabold text-blue-500 active:bg-blue-50 transition-colors" onclick="window.wxActions.submitReroll()" ontouchend="event.preventDefault(); window.wxActions.submitReroll()">确认</button>
          </div>
      </div>
  </div>
  ` : '';

  // 📷 头像渲染辅助函数：修复了强制圆形导致视频也变圆的问题
  const getVidHtml = (val, defaultVal, isBg) => {
    let v = val || defaultVal || '';
    if (v.length > 100 && !v.startsWith('http') && !v.startsWith('data:')) v = 'data:image/jpeg;base64,' + v;
    if (v.includes('http') || v.startsWith('data:')) {
      // 🌟 开启异步解码和懒加载，杜绝滑动和渲染时的卡顿！
      return `<img src="${v}" class="w-full h-full object-cover ${isBg ? 'opacity-40' : ''}" />`;
    }
    
    // 如果是真实的图片（带链接或 Base64）
    if (v.includes('http') || v.startsWith('data:')) {
      return `<img src="${v}" class="w-full h-full object-cover ${isBg ? '' : 'rounded-full'}" />`;
    }
    
    // 如果是 Emoji 或普通文字（加入 overflow-hidden 防止任何意外溢出）
    return `<div class="w-full h-full flex items-center justify-center overflow-hidden ${isBg ? 'opacity-30 text-[150px]' : 'text-5xl'}">${v}</div>`;
  };

  // ⚙️ 场景 0.5：究极进化版聊天设置页面 (强迫症对齐版)
  if (wxState.view === 'chatSettings') {
    const targetObj = chatData.isGroup ? chatData : char; // 🌟 核心分流
    
    let topSectionHtml = '';
    if (chatData.isGroup) {
        topSectionHtml = `
          <div class="bg-white rounded-[16px] p-4 space-y-4 shadow-sm border border-gray-100 mb-4">
             <div class="flex justify-between items-center mb-2">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">群聊头像</span>
               <div class="flex-1 flex justify-end">
                 <div class="w-12 h-12 bg-gray-100 rounded-[12px] flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden text-2xl" onclick="window.wxActions.triggerAvatarUpload('upload-group-avatar')">${getVidHtml(chatData.groupAvatar, '') || '<i data-lucide="users" class="w-6 h-6 text-blue-400"></i>'}</div>
               </div>
             </div>
             <div class="flex justify-between items-center border-t border-gray-100 pt-4">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">群聊名称</span>
               <input id="set-group-name" value="${chatData.groupName || ''}" class="flex-1 text-right outline-none bg-transparent py-1 text-[15px] text-black font-medium" placeholder="输入群聊名称" />
             </div>
             <div class="flex flex-col border-t border-gray-100 pt-4">
               <span class="text-[15px] font-medium text-gray-800 mb-2">群公告</span>
               <textarea id="set-group-notice" rows="3" class="w-full outline-none bg-gray-50 rounded-lg p-2 text-[14px] text-black font-medium resize-none hide-scrollbar" placeholder="输入专门给该群聊的特殊世界观或设定...">${chatData.groupNotice || ''}</textarea>
             </div>
          </div>
        `;
    } else {
        topSectionHtml = `
          <div class="bg-white rounded-[16px] p-4 space-y-4 shadow-sm border border-gray-100 mb-4">
             <div class="flex justify-between items-center mb-2">
               <div class="flex flex-col w-1/3">
                 <span class="text-[15px] font-medium text-gray-800">我的头像</span>
                 ${chatData.myAvatar ? `<span class="text-[10px] text-blue-500 font-bold cursor-pointer active:opacity-50 mt-0.5" onclick="window.wxActions.clearSettingMyAvatar()">恢复默认头像</span>` : `<span class="text-[10px] text-gray-400 mt-0.5">仅当前聊天生效</span>`}
               </div>
               <div class="flex-1 flex justify-end">
                 <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-my-avatar')">${getVidHtml(myAvatar, '')}</div>
               </div>
             </div>
             <div class="flex justify-between items-center">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">我的备注</span>
               <input id="set-my-name" value="${chatData.myRemark || store.personas[0].name}" class="flex-1 text-right outline-none bg-transparent py-1 text-[15px] text-black font-medium" placeholder="输入备注" />
             </div>

             <div class="flex justify-between items-center border-t border-gray-100 pt-4 mb-2">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">对方头像</span>
               <div class="flex-1 flex justify-end">
                 <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-char-avatar')">${getVidHtml(char.avatar, '')}</div>
               </div>
             </div>
             <div class="flex justify-between items-center">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">对方备注</span>
               <input id="set-char-name" value="${chatData.charRemark || char.name}" class="flex-1 text-right outline-none bg-transparent py-1 text-[15px] text-black font-medium" placeholder="输入备注" />
             </div>
          </div>

          <div class="bg-white rounded-[16px] p-4 space-y-4 shadow-sm border border-gray-100 mb-4">
             <div class="flex justify-between items-center">
               <div class="flex flex-col w-2/3"><span class="text-[15px] font-medium text-gray-800">我的视频画面</span><span class="text-xs text-gray-500">仅本聊天室生效</span></div>
               <div class="w-12 h-16 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-my-video')">${getVidHtml(chatData.myVideoAvatar || store.personas[0].videoAvatar, myAvatar, '')}</div>
             </div>
             <div class="flex justify-between items-center border-t border-gray-100 pt-4">
               <div class="flex flex-col w-2/3"><span class="text-[15px] font-medium text-gray-800">对方视频画面</span><span class="text-xs text-gray-500">仅本聊天室生效</span></div>
               <div class="w-12 h-16 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-char-video')">${getVidHtml(chatData.charVideoAvatar || char.videoAvatar, char.avatar, '')}</div>
             </div>
          </div>

          <div class="bg-white rounded-[16px] p-4 mb-4 shadow-sm border border-gray-100 flex flex-col space-y-3">
           <span class="text-[15px] font-medium text-gray-800 block">设置戳一戳</span>
           <div class="flex flex-col space-y-2">
             <span class="text-[12px] font-medium text-gray-500">双击头像触发</span>
             <div class="flex items-center space-x-2">
                <span class="text-[13px] text-gray-600">我</span>
                <input type="text" value="${char.nudgeMeVerb || '拍了拍'}" onchange="window.wxActions.updateNudge('meVerb', this.value)" class="w-20 bg-gray-50 border border-gray-100 rounded-lg p-2 outline-none text-[13px] text-center" placeholder="拍了拍" />
                <span class="text-[13px] text-gray-600">TA</span>
                <input type="text" value="${char.nudgeMeSuffix || ''}" onchange="window.wxActions.updateNudge('meSuffix', this.value)" class="flex-1 bg-gray-50 border border-gray-100 rounded-lg p-2 outline-none text-[13px]" placeholder="如：的小脑袋" />
             </div>
           </div>
             <div class="flex items-center space-x-2">
                <span class="text-[13px] text-gray-600">TA</span>
                <input type="text" value="${char.nudgeAIVerb || '拍了拍'}" onchange="window.wxActions.updateNudge('aiVerb', this.value)" class="w-20 bg-gray-50 border border-gray-100 rounded-lg p-2 outline-none text-[13px] text-center" placeholder="拍了拍" />
                <span class="text-[13px] text-gray-600">我</span>
                <input type="text" value="${char.nudgeAISuffix || ''}" onchange="window.wxActions.updateNudge('aiSuffix', this.value)" class="flex-1 bg-gray-50 border border-gray-100 rounded-lg p-2 outline-none text-[13px]" placeholder="如：的肩膀" />
             </div>
          </div>
        `;
    }

    return `
      <style>
        .ios-switch { position: relative; width: 44px; height: 24px; appearance: none; background: #e5e5ea; border-radius: 24px; outline: none; cursor: pointer; transition: background 0.3s ease; }
        .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.3s ease; }
        .ios-switch:checked { background: #34c759; }
        .ios-switch:checked::after { transform: translateX(20px); }
      </style>
      
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSettings()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">${chatData.isGroup ? '群聊设置' : '聊天设置'}</span>
           <div class="w-1/4"></div>
         </div>
         
         <div id="settings-scroll" class="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-20">
            <input type="file" id="upload-my-avatar" accept="image/*" class="hidden" onchange="window.wxActions.handleSettingImageUpload(event, 'myAvatar')" />
            <input type="file" id="upload-char-avatar" accept="image/*" class="hidden" onchange="window.wxActions.handleSettingImageUpload(event, 'charAvatar')" />
            <input type="file" id="upload-my-video" accept="image/*" class="hidden" onchange="window.wxActions.handleSettingImageUpload(event, 'myVideo')" />
            <input type="file" id="upload-char-video" accept="image/*" class="hidden" onchange="window.wxActions.handleSettingImageUpload(event, 'charVideo')" />
            <input type="file" id="upload-bg-image" accept="image/*" class="hidden" onchange="window.wxActions.handleSettingBgUpload(event)" />
            <input type="file" id="upload-group-avatar" accept="image/*" class="hidden" onchange="window.wxActions.handleSettingImageUpload(event, 'groupAvatar')" />

            ${topSectionHtml}

            <div class="bg-white rounded-[16px] p-4 mb-4 shadow-sm border border-gray-100 flex justify-between items-center">
                 <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity flex-1" onclick="document.getElementById('upload-bg-image').click()">
                    <i data-lucide="image" class="w-5 h-5 mr-3 text-blue-500"></i>
                    <span class="text-[15px] font-medium text-gray-800">设置聊天背景图</span>
                 </div>
                 <div class="flex items-center">
                   ${targetObj.bgImage ? `<div class="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg mr-3 cursor-pointer active:scale-90 transition-colors" onclick="window.wxActions.clearSettingBg()"><i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i></div>` : ''}
                   <span class="text-[12px] font-medium text-gray-500 mr-1 cursor-pointer" onclick="document.getElementById('upload-bg-image').click()">${targetObj.bgImage ? '已设置' : '未设置'}</span>
                   <i data-lucide="chevron-right" class="text-gray-600 w-4 h-4 cursor-pointer" onclick="document.getElementById('upload-bg-image').click()"></i>
                 </div>
            </div>
          
          ${chatData.isGroup ? `
            <div class="bg-white rounded-[16px] p-4 mb-4 shadow-sm border border-gray-100 flex justify-between items-center">
                 <div class="flex items-center flex-1">
                    <i data-lucide="user-square" class="w-5 h-5 mr-3 text-purple-500"></i>
                    <span class="text-[15px] font-medium text-gray-800">你在本群的身份</span>
                 </div>
                 <div class="flex items-center">
                   <select onchange="window.wxActions.updateGroupPersona(this.value)" class="outline-none text-[15px] text-gray-500 font-medium bg-transparent cursor-pointer appearance-none text-right pr-2">
                       ${store.personas.map(p => `<option value="${p.id}" ${chatData.boundPersonaId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                   </select>
                   <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4 pointer-events-none"></i>
                 </div>
            </div>
            ` : `
            <div class="bg-white rounded-[16px] p-4 mb-4 shadow-sm border border-gray-100 flex justify-between items-center">
                 <div class="flex items-center flex-1">
                    <i data-lucide="user-square" class="w-5 h-5 mr-3 text-purple-500"></i>
                    <span class="text-[15px] font-medium text-gray-800">你的身份</span>
                 </div>
                 <div class="flex items-center">
                   <select onchange="window.wxActions.updateSingleChatPersona(this.value)" class="outline-none text-[15px] text-gray-500 font-medium bg-transparent cursor-pointer appearance-none text-right pr-2">
                       ${store.personas.map(p => `<option value="${p.id}" ${char.boundPersonaId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                   </select>
                   <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4 pointer-events-none"></i>
                 </div>
            </div>
            `}

          ${!chatData.isGroup ? `
            <div class="bg-white rounded-[16px] mb-4 shadow-sm border border-gray-100 flex flex-col overflow-hidden"> 
            <div class="p-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors border-b border-gray-50" onclick="window.wxActions.toggleGroupMountModal()">
               <span class="text-[15px] font-medium text-gray-800">关联群聊记忆</span>
               <div class="flex items-center">
                 <span class="text-[14px] text-gray-400 mr-1">${targetObj.linkedGroups && targetObj.linkedGroups.length > 0 ? `已关联 ${targetObj.linkedGroups.length} 个` : '未关联'}</span>
                 <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i>
               </div>
             </div>
             </div>
             ` : ''}

          <div class="bg-white rounded-[16px] mb-4 shadow-sm border border-gray-100 flex flex-col overflow-hidden">
             <div class="p-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors border-b border-gray-50" onclick="window.wxActions.toggleWbMountModal()">
               <span class="text-[15px] font-medium text-gray-800">挂载世界书</span>
               <div class="flex items-center">
                 <span class="text-[14px] text-gray-400 mr-1">${targetObj.mountedWorldbooks && targetObj.mountedWorldbooks.length > 0 ? `已挂载 ${targetObj.mountedWorldbooks.length} 个` : '未挂载'}</span>
                 <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i>
               </div>
             </div>
             
             <div class="p-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors border-b border-gray-50" onclick="window.wxActions.toggleEmojiMountModal()">
               <span class="text-[15px] font-medium text-gray-800">挂载表情包</span>
               <div class="flex items-center">
                 <span class="text-[14px] text-gray-400 mr-1">${targetObj.mountedEmojis && targetObj.mountedEmojis.length > 0 ? `已挂载 ${targetObj.mountedEmojis.length} 个` : '未挂载'}</span>
                 <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i>
               </div>
             </div>

             <div class="p-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.toggleDisableEmoji()">
               <span class="text-[15px] font-medium text-gray-800">禁止使用表情包</span>
               <div class="relative w-[42px] h-[24px] rounded-full transition-colors duration-300 ${targetObj.disableEmoji ? 'bg-[#34c759]' : 'bg-[#e5e5ea]'}">
                 <div class="absolute top-[2px] left-[2px] w-[20px] h-[20px] bg-white rounded-full transition-transform duration-300 shadow-sm ${targetObj.disableEmoji ? 'translate-x-[18px]' : ''}"></div>
               </div>
             </div>
          </div>

            <div class="bg-white rounded-[16px] p-4 space-y-4 shadow-sm border border-gray-100 mb-4">
               <div class="flex justify-between items-center">
                 <div class="flex flex-col">
                   <span class="text-[15px] font-medium text-gray-800">时间感知</span>
                   <span class="text-[10px] text-gray-400 mt-0.5">开启后，ta将感知真实时间与聊天记录中的时间戳</span>
                 </div>
                 <input type="checkbox" id="set-time-aware" ${targetObj.timeAware !== false ? 'checked' : ''} class="ios-switch" />
               </div>
               <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                 <div class="flex flex-col">
                   <span class="text-[15px] font-medium text-gray-800">位置感知</span>
                   <span class="text-[10px] text-gray-400 mt-0.5">需在设置中开启高精定位，否则ta将发送虚拟外卖</span>
                 </div>
                 <input type="checkbox" id="set-location-aware" ${targetObj.locationAware !== false ? 'checked' : ''} class="ios-switch" />
               </div>
            </div>

            <div class="bg-white rounded-[16px] p-4 space-y-4 shadow-sm border border-gray-100 mb-4">
               <div class="flex justify-between items-center">
                 <span class="text-[15px] font-medium text-gray-800">允许主动聊天</span>
                 <input type="checkbox" id="set-auto-msg" ${targetObj.autoMsgEnabled ? 'checked' : ''} class="ios-switch" />
               </div>
               <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                 <span class="text-[15px] font-medium text-gray-800">未读冷落触发时长</span>
                 <div class="flex items-center"><input type="number" id="set-auto-interval" value="${targetObj.autoMsgInterval || 30}" class="w-14 text-center outline-none bg-gray-50 p-1.5 rounded-lg text-[15px] font-medium text-black" /><span class="ml-0 text-[13px] text-gray-500">分钟</span></div>
               </div>
               <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                 <div class="flex flex-col"><span class="text-[15px] font-medium text-gray-800">附带历史记忆条数</span><span class="text-[10px] text-gray-500">1-100，耗费Token</span></div>
                 <div class="flex items-center"><input type="number" id="set-context-limit" value="${targetObj.contextLimit || 30}" class="w-14 text-center outline-none bg-gray-50 p-1.5 rounded-lg text-[15px] font-medium text-black" /><span class="ml-0 text-[13px] text-gray-500">回合</span></div>
               </div>
               ${!chatData.isGroup ? `
<div class="flex justify-between items-center border-t border-gray-100 pt-4">
  <div class="flex flex-col">
    <span class="text-[15px] font-medium text-gray-800">发朋友圈频率</span>
    <span class="text-[10px] text-gray-400">后台自动发布动态间隔</span>
  </div>
  <select id="chat-auto-moment-select" class="bg-gray-50 text-center outline-none p-1.5 rounded-lg text-[14px] font-medium text-black border border-transparent focus:border-gray-200">
      <option value="0" ${!targetObj.autoMomentFreq ? 'selected' : ''}>不自动发</option>
      <option value="2" ${targetObj.autoMomentFreq === 2 ? 'selected' : ''}>每 2 小时</option>
      <option value="4" ${targetObj.autoMomentFreq === 4 ? 'selected' : ''}>每 4 小时</option>
      <option value="8" ${targetObj.autoMomentFreq === 8 ? 'selected' : ''}>每 8 小时</option>
  </select>
</div>
` : ''}
            </div>

            ${!chatData.isGroup ? `
            <div class="bg-white rounded-[16px] p-4 space-y-4 shadow-sm border border-gray-100 mb-4">
              <div class="flex justify-between items-center">
                <div class="flex flex-col">
                  <span class="text-[15px] font-medium text-gray-800">偷看手机权限</span>
                  <span class="text-[10px] text-gray-400 mt-0.5">开启后ta可能趁你不注意偷翻你的聊天和朋友圈</span>
                </div>
                <input type="checkbox" id="set-peek-phone" ${targetObj.canPeekPhone ? 'checked' : ''} class="ios-switch" />
              </div>
              <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                <div class="flex flex-col">
                  <span class="text-[15px] font-medium text-gray-800">偷看触发概率</span>
                  <span class="text-[10px] text-gray-400 mt-0.5">每次AI回复后随机触发的概率</span>
                </div>
                <div class="flex items-center"><input type="number" id="set-peek-phone-prob" value="${targetObj.peekPhoneProb || 15}" min="1" max="80" class="w-12 text-center outline-none bg-gray-50 p-1.5 rounded-lg text-[15px] font-medium text-black" /><span class="ml-2 text-[13px] text-gray-500">%</span></div>
              </div>
              <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                <div class="flex flex-col">
                  <span class="text-[15px] font-medium text-gray-800">随机剧情</span>
                  <span class="text-[10px] text-gray-400 mt-0.5">获取回复时有概率触发随机事件（微型20%·短线15%·长线8%）</span>
                </div>
                <input type="checkbox" id="set-random-plot" ${chatData.randomPlotEnabled ? 'checked' : ''} class="ios-switch" />
              </div>
              ${chatData.activeRandomPlot ? `
              <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                <div class="flex flex-col">
                  <span class="text-[15px] font-medium text-gray-800">当前进行中剧情</span>
                  <span class="text-[10px] text-${chatData.activeRandomPlot.type === 'long' ? 'orange' : 'blue'}-500 font-bold mt-0.5">${chatData.activeRandomPlot.type === 'long' ? '🔴 长线' : '🔵 短线'} · ${chatData.activeRandomPlot.keyword}</span>
                </div>
                <button onclick="window.wxActions.clearActiveRandomPlot()" class="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-full font-bold active:scale-95 transition-transform">强制终止</button>
              </div>
              ` : ''}
              ${chatData.pendingMicroPlot ? `
              <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                <div class="flex flex-col">
                  <span class="text-[15px] font-medium text-gray-800">待触发的微型插曲</span>
                  <span class="text-[10px] text-gray-400 font-bold mt-0.5">⚡ ${chatData.pendingMicroPlot.keyword}</span>
                </div>
              </div>
              ` : ''}
            </div>
            ` : ''}

            <div class="bg-white rounded-[16px] p-4 space-y-3 shadow-sm border border-gray-100 flex flex-col mb-6">
               <div class="flex justify-between items-center">
                 <span class="text-[15px] font-medium text-gray-800">CSS界面美化设置</span>
                 <select onchange="window.wxActions.applyCSSPreset(event)" class="bg-gray-50 outline-none text-xs p-1.5 rounded-md text-gray-600 border border-gray-200">
                   <option value="">-- 选择预设 --</option>
                   ${(store.cssPresets || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                 </select>
               </div>
               <textarea id="set-custom-css" rows="6" class="w-full bg-white text-black border border-gray-200 rounded-xl p-3 outline-none text-[11px] font-mono resize-none hide-scrollbar shadow-inner leading-relaxed" placeholder="编写或加载 CSS 代码...">${targetObj.customCSS || ''}</textarea>
               <div class="flex justify-end pt-1">
                 <button onclick="window.wxActions.saveCSSPreset()" class="text-xs text-[#07c160] font-bold bg-green-50 px-3 py-1.5 rounded-full active:scale-95 transition-transform"><i data-lucide="save" class="inline-block w-3 h-3 mr-1"></i>保存为新预设</button>
               </div>
            </div>
            
            <button onclick="window.wxActions.saveSettings()" class="w-full py-3.5 mt-2 bg-[#07c160] text-white font-bold rounded-xl active:scale-95 transition-transform shadow-md">保存并应用</button>
            
            <div class="mt-8 flex flex-col space-y-3 pb-8 animate-in fade-in">
              ${!chatData.isGroup ? `<button onclick="window.wxActions.toggleBlockCharacter()" class="w-full py-3.5 bg-white text-red-500 font-bold rounded-xl border border-red-100 shadow-sm active:bg-gray-50 transition-colors">${char.isBlocked ? '解除拉黑' : '拉黑该角色'}</button>` : ''}
              <button onclick="window.wxActions.clearChatHistory()" class="w-full py-3.5 bg-white text-red-500 font-bold rounded-xl border border-red-100 shadow-sm active:bg-gray-50 transition-colors">清空当前聊天记录</button>
              
              <button onclick="window.wxActions.deleteChatRoom()" class="w-full py-3.5 bg-white text-red-500 font-bold rounded-xl border border-red-100 shadow-sm active:bg-gray-50 transition-colors">${chatData.isGroup ? '解散群聊' : '删除聊天'}</button>
            </div>
         </div>

         ${wxState.showEmojiMountModal ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm p-4" onclick="window.wxActions.toggleEmojiMountModal()">
            <div class="mc-modal-content bg-[#f6f6f6] w-[90%] max-h-[70vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
              <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm shrink-0">
                <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="smile" class="text-[#07c160] mr-2 w-5 h-5"></i>管理挂载的表情包</span>
                <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.toggleEmojiMountModal()"></i>
              </div>
              <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
                ${(store.emojiLibs || []).map(lib => `
                  <div class="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border ${targetObj.mountedEmojis && targetObj.mountedEmojis.includes(lib.id) ? 'border-[#07c160]' : 'border-gray-100'} cursor-pointer active:scale-[0.98] transition-all" onclick="window.wxActions.toggleEmojiMount('${lib.id}')">
                     <div class="flex flex-col flex-1 overflow-hidden mr-3">
                        <span class="text-[14px] font-bold ${targetObj.mountedEmojis && targetObj.mountedEmojis.includes(lib.id) ? 'text-[#07c160]' : 'text-gray-800'} truncate">${lib.name}</span>
                        <span class="text-[10px] text-gray-400 mt-0.5">包含 ${lib.emojis.length} 个表情</span>
                     </div>
                     <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${targetObj.mountedEmojis && targetObj.mountedEmojis.includes(lib.id) ? 'bg-[#07c160] border-[#07c160]' : 'border-gray-300'}">
                        ${targetObj.mountedEmojis && targetObj.mountedEmojis.includes(lib.id) ? '<i data-lucide="check" class="text-white w-4 h-4"></i>' : ''}
                     </div>
                  </div>
                `).join('')}
                ${(store.emojiLibs || []).length === 0 ? '<div class="text-center text-gray-400 mt-10 text-[12px] font-bold">还没有导入过表情包哦</div>' : ''}
              </div>
            </div>
          </div>
        ` : ''}

        ${wxState.showGroupMountModal ? `
          <div class="mc-modal-overlay flex items-center justify-center animate-in fade-in backdrop-blur-sm p-4 absolute inset-0 z-[80]" onclick="window.wxActions.toggleGroupMountModal()">
            <div class="bg-[#f6f6f6] w-[90%] max-h-[75vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
              <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm shrink-0">
                 <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="message-circle" class="text-blue-500 mr-2 w-5 h-5"></i>关联群聊记忆</span>
                 <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.toggleGroupMountModal()"></i>
              </div>
              <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
                 <p class="text-[10px] text-gray-400 font-bold mb-2 pl-1">跨次元打通：让 TA 在私聊中保留群聊的记忆视角。</p>
                 ${(() => {
                    const mounted = targetObj.linkedGroups || [];
                    // 🌟 智能过滤：只显示 TA 当前已经加入的群聊！
                    const availableGroups = store.chats.filter(c => c.isGroup && c.memberIds.includes(targetObj.id));
                    if(availableGroups.length === 0) return '<div class="text-center text-gray-400 mt-10 text-[12px] font-bold">该角色还没有加入任何群聊哦</div>';
                    
                    return availableGroups.map(g => `
                      <div class="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border ${mounted.includes(g.charId) ? 'border-blue-300 bg-blue-50/20' : 'border-gray-100'} cursor-pointer active:scale-[0.98] transition-all" onclick="window.wxActions.toggleGroupMount('${g.charId}')">
                         <div class="flex flex-col flex-1 overflow-hidden mr-3">
                            <span class="text-[14px] font-bold ${mounted.includes(g.charId) ? 'text-blue-600' : 'text-gray-800'} truncate">${g.groupName || '群聊'}</span>
                            <span class="text-[10px] text-gray-400 mt-0.5">包含 ${g.memberIds.length} 名成员</span>
                         </div>
                         <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${mounted.includes(g.charId) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}">
                            ${mounted.includes(g.charId) ? '<i data-lucide="check" class="text-white w-4 h-4"></i>' : ''}
                         </div>
                      </div>
                    `).join('');
                 })()}
              </div>
            </div>
          </div>
        ` : ''}

        ${wxState.showWbMountModal ? `
          <div class="mc-modal-overlay flex items-center justify-center animate-in fade-in backdrop-blur-sm p-4 absolute inset-0 z-[80]" onclick="window.wxActions.toggleWbMountModal()">
            <div class="bg-[#f6f6f6] w-[90%] max-h-[75vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
              <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm shrink-0">
                 <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="book-open" class="text-purple-500 mr-2 w-5 h-5"></i>挂载局部世界书</span>
                 <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.toggleWbMountModal()"></i>
              </div>
              
              <div class="bg-white px-4 py-3 border-b border-gray-100 shrink-0">
                 <select class="w-full bg-gray-50 border border-gray-100 rounded-xl p-2.5 outline-none text-[13px] font-bold text-gray-700 cursor-pointer" onchange="window.wxActions.setWbMountGroup(this.value)">
                    <option value="全部" ${wxState.activeWbGroup === '全部' ? 'selected' : ''}>全部分组</option>
                    ${(store.wbGroups && store.wbGroups['local'] ? store.wbGroups['local'] : []).map(g => `<option value="${g}" ${wxState.activeWbGroup === g ? 'selected' : ''}>${g}</option>`).join('')}
                 </select>
              </div>

              <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
                 ${(() => {
                    const mounted = targetObj.mountedWorldbooks || [];
                    const localWbs = (store.worldbooks || []).filter(w => w.type === 'local' && (wxState.activeWbGroup === '全部' || w.group === wxState.activeWbGroup));
                    if(localWbs.length === 0) return '<div class="text-center text-gray-400 mt-10 text-[12px] font-bold">该分组下没有局部世界书哦</div>';
                    
                    return localWbs.map(w => `
                      <div class="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border ${mounted.includes(w.id) ? 'border-purple-300' : 'border-gray-100'} cursor-pointer active:scale-[0.98] transition-all" onclick="window.wxActions.toggleWbMount('${w.id}')">
                         <div class="flex flex-col flex-1 overflow-hidden mr-3">
                            <span class="text-[14px] font-bold ${mounted.includes(w.id) ? 'text-purple-600' : 'text-gray-800'} truncate">${w.title}</span>
                            <span class="text-[10px] text-gray-400 mt-0.5">${w.group || '默认'}</span>
                         </div>
                         <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${mounted.includes(w.id) ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}">
                            ${mounted.includes(w.id) ? '<i data-lucide="check" class="text-white w-4 h-4"></i>' : ''}
                         </div>
                      </div>
                    `).join('');
                 })()}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  // 📝 场景 0.6：通讯录 - 角色编辑/创建界面
  if (wxState.view === 'contactEdit') {
    const isNew = !wxState.editingContactId;
    const charData = isNew ? {} : store.contacts.find(c => c.id === wxState.editingContactId);
    const displayAvatar = wxState.tempAvatar || charData.avatar;
    
    return `
      <style>
        .ios-switch { position: relative; width: 44px; height: 24px; appearance: none; background: #e5e5ea; border-radius: 24px; outline: none; cursor: pointer; transition: background 0.3s ease; }
        .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.3s ease; }
        .ios-switch:checked { background: #34c759; }
        .ios-switch:checked::after { transform: translateX(20px); }
      </style>
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-bottom-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-down" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">${isNew ? '创建新角色' : '编辑角色'}</span>
           <div class="w-1/4"></div> </div>
         
         <div class="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-10">
            <input type="file" id="upload-edit-avatar" accept="image/*" class="hidden" onchange="window.wxActions.handleContactAvatarUpload(event)" />
            
            <div class="bg-white rounded-[12px] p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
               <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden shadow-sm mb-3" onclick="document.getElementById('upload-edit-avatar').click()">${getVidHtml(displayAvatar, '')}</div>
               <span class="text-xs text-gray-500 font-medium tracking-widest">点击更换头像</span>
            </div>

            <div class="bg-white rounded-[12px] px-4 shadow-sm border border-gray-100">
               <div class="flex items-center py-3.5 border-b border-gray-100">
                 <span class="w-24 text-[15px] font-medium text-gray-800">名字</span>
                 <input id="edit-char-name" value="${charData.name || ''}" class="flex-1 outline-none bg-transparent text-[15px] text-black font-bold"/>
               </div>
               <div class="flex items-center py-3.5 border-b border-gray-100">
                 <span class="w-24 text-[15px] font-medium text-gray-800">所属分组</span>
                 <select id="edit-char-group" class="flex-1 outline-none text-[15px] text-gray-800 font-medium bg-transparent appearance-none">
                   ${store.groups.map(g => `<option value="${g.id}" ${(charData.groupId || 'default') === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
                 </select>
               </div>
               <div class="flex items-center py-3.5 cursor-pointer active:opacity-50" onclick="window.wxActions.togglePersonaMountModal()">
                 <span class="w-24 text-[15px] font-medium text-gray-800">绑定身份</span>
                 <div class="flex-1 flex justify-end items-center">
                   ${(() => {
                     const pId = wxState.tempBoundPersonaId || charData.boundPersonaId || store.personas[0].id;
                     const p = store.personas.find(x => x.id === pId) || store.personas[0];
                     return `<div class="flex items-center"><div class="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center mr-2 text-xs border border-gray-200 overflow-hidden shadow-sm">${getVidHtml(p.avatar, '', false)}</div><span class="text-[15px] text-gray-600 font-medium">${p.name || store.personas[0].name}</span></div>`;
                   })()}
                   <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4 ml-2"></i>
                 </div>
               </div>
            </div>

            <div class="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 space-y-3">
               <span class="text-[15px] font-medium text-gray-800 block">人设</span>
               <textarea id="edit-char-prompt" rows="4" class="w-full bg-gray-50 rounded-lg p-3 outline-none text-[14px] resize-none text-gray-700 leading-relaxed hide-scrollbar" placeholder="输入角色的性格、背景等详细设定...">${charData.prompt || ''}</textarea>
            </div>

            <div class="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 space-y-3">
               <span class="text-[15px] font-medium text-gray-800 block">开场白</span>
               <textarea id="edit-char-greeting" rows="2" class="w-full bg-gray-50 rounded-lg p-3 outline-none text-[14px] resize-none text-gray-700 leading-relaxed hide-scrollbar" placeholder="新建角色后，TA对你说的第一句话...">${charData.greeting || ''}</textarea>
            </div>

            <div class="bg-white rounded-[12px] px-4 py-1 shadow-sm border border-gray-100">
               <div class="flex justify-between items-center py-3.5 border-b border-gray-100">
                 <span class="text-[15px] font-medium text-gray-800">MiniMax 语音系统</span>
                 <input type="checkbox" id="edit-char-voice-enabled" ${charData.minimaxVoiceEnabled ? 'checked' : ''} class="ios-switch" />
               </div>
               <div class="flex items-center py-3.5">
                 <span class="w-24 text-[15px] text-gray-600">音色 ID</span>
                 <input id="edit-char-voice-id" value="${charData.minimaxVoiceId || ''}" class="flex-1 outline-none bg-transparent text-[14px] text-gray-800 font-mono bg-gray-50 px-2 py-1 rounded" placeholder="例：male-qn-qingse" />
               </div>
            </div>
            
            <button onclick="window.wxActions.saveContact()" class="w-full py-3.5 mt-4 bg-[#07c160] text-white font-bold rounded-[12px] active:scale-95 transition-transform shadow-sm">保存角色</button>
            ${!isNew ? `<button onclick="window.wxActions.deleteContact()" class="w-full py-3.5 mt-2 bg-white text-red-500 font-bold rounded-[12px] active:bg-gray-50 transition-colors border border-red-100 shadow-sm">删除角色</button>` : ''}
         </div>
         ${wxState.showPersonaMountModal ? `
              <div class="absolute inset-0 bg-black/40 z-[60] flex items-end justify-center animate-in fade-in backdrop-blur-sm" onclick="window.wxActions.togglePersonaMountModal()">
                <div class="bg-[#f3f3f3] w-full rounded-t-[24px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[70vh]" onclick="event.stopPropagation()">
                  <div class="bg-white px-4 py-4 flex justify-between items-center border-b border-gray-100">
                    <div class="cursor-pointer active:opacity-50" onclick="window.wxActions.togglePersonaMountModal()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-600"></i></div>
                    <span class="font-medium text-gray-800 text-[16px]">选择与之聊天的身份</span>
                    <div class="w-8"></div>
                  </div>
                  <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f3f3f3] hide-scrollbar">
                    ${store.personas.map(p => {
                      const currentPId = wxState.tempBoundPersonaId || charData.boundPersonaId || store.personas[0].id;
                      const isSel = p.id === currentPId;
                      return `
                      <div class="bg-white rounded-xl p-4 flex justify-between items-center shadow-sm cursor-pointer active:scale-95 transition-transform border ${isSel ? 'border-[#07c160]' : 'border-transparent'}" onclick="window.wxActions.selectBoundPersona('${p.id}')">
                        <div class="flex items-center space-x-3">
                          <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl overflow-hidden shadow-sm border border-gray-100">${getVidHtml(p.avatar, '', false)}</div>
                          <div class="flex flex-col">
                            <span class="font-medium text-gray-800 text-[15px]">${p.name || store.personas[0].name}</span>
                            <span class="text-[11px] text-gray-400 mt-0.5 w-48 truncate">${p.prompt || '暂无设定内容'}</span>
                          </div>
                        </div>
                        <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSel ? 'bg-[#07c160] border-[#07c160]' : 'border-gray-300'}"><i data-lucide="check" class="text-white w-4 h-4 ${isSel ? 'opacity-100' : 'opacity-0'}"></i></div>
                      </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            ` : ''}
      </div>
    `;
  }

  // 📂 场景 0.7：通讯录 - 分组管理界面
  if (wxState.view === 'groupManage') {
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">管理分组</span>
           <div class="w-1/4 flex justify-end"><i data-lucide="plus" class="cursor-pointer active:scale-90 transition-transform text-[#07c160]" style="width: 28px; height: 28px;" onclick="window.wxActions.addGroup()"></i></div>
         </div>
         
         <div id="wechat-group-scroll" class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar pb-10">
            <p class="text-[11px] text-gray-400 font-bold mb-3 px-1 tracking-widest uppercase">修改名称后实时自动保存</p>
            ${store.groups.map(g => `
              <div class="bg-white rounded-[12px] p-3.5 shadow-sm border border-gray-100 flex items-center justify-between">
                <i data-lucide="menu" class="w-5 h-5 text-gray-300 mr-3 cursor-grab"></i>
                <input value="${g.name}" onchange="window.wxActions.updateGroupName('${g.id}', this.value)" class="flex-1 outline-none text-[15px] text-black bg-transparent font-medium" />
                ${g.id !== 'default' ? `<div class="w-8 h-8 flex items-center justify-center cursor-pointer active:scale-90 opacity-60 hover:opacity-100 hover:text-red-500 transition-all ml-2" onclick="window.wxActions.deleteGroup('${g.id}')"><i data-lucide="minus-circle" class="w-5 h-5 text-red-400"></i></div>` : `<div class="w-8 h-8 flex items-center justify-center"><i data-lucide="lock" class="w-4 h-4 text-gray-300"></i></div>`}
              </div>
            `).join('')}
         </div>
      </div>
    `;
  }

  // 💳 场景 0.8: 钱包页面
  if (wxState.view === 'wallet') {
    store.wallet = store.wallet || { balance: 0, transactions: [] };
    // 🌟 修复：只取最后20条，节省DOM内存
    const visibleTx = store.wallet.transactions.filter(t => !t.title.includes('初始资金')).slice(-20);
    return `
      <div class="w-full h-full flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50" style="background-color: #ffffff !important; background-image: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;">
          <div class="px-4 pt-12 pb-3 flex justify-between items-center shrink-0 z-10 relative" style="background-color: #07c160 !important; background-image: none !important; border: none !important; backdrop-filter: none !important;">
            <div class="w-1/4 cursor-pointer" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" style="width: 28px; height: 28px; text-white;"></i></div>
            <span class="absolute left-1/2 -translate-x-1/2 font-bold text-white text-[17px] tracking-wide">服务</span>
            <div class="w-6"></div>
          </div>
         <div class="bg-[#07c160] flex flex-col items-center justify-center pb-10 pt-4 text-white shadow-sm">
            <i data-lucide="shield-check" class="mb-2 opacity-90" style="width:40px; height:40px;"></i>
            <span class="text-[14px] mb-2 opacity-90 font-bold">我的零钱</span>
            <span class="text-[44px] font-bold font-mono tracking-tight">¥${store.wallet.balance.toFixed(2)}</span>
         </div>
         <div class="flex-1 overflow-y-auto p-4 bg-white mt-2">
            <p class="text-[12px] text-gray-400 font-bold mb-4 tracking-widest border-b border-gray-100 pb-2">近期账单明细</p>
            ${[...visibleTx].reverse().map(t => `
              <div class="flex justify-between items-center py-3.5 border-b border-gray-50">
                <div class="flex flex-col"><span class="text-[15px] text-gray-800 font-medium mb-1">${t.title}</span><span class="text-[11px] text-gray-400">${new Date(t.date).toLocaleString()}</span></div>
                <span class="text-[16px] font-medium ${t.type==='in'?'text-[#07c160]':'text-gray-800'} font-mono">${t.type==='in'?'+':'-'}${t.amount.toFixed(2)}</span>
              </div>
            `).join('')}
            ${visibleTx.length === 0 ? '<div class="text-center text-gray-400 mt-10 text-[13px]">暂无账单记录</div>' : ''}
         </div>
      </div>
    `;
  }

  // 🌟 场景 0.9: 收藏夹
  if (wxState.view === 'favorites') {
    store.favorites = store.favorites || [];
    const isManage = wxState.favManageMode;
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">收藏</span>
           <div class="w-1/4 flex justify-end cursor-pointer" onclick="window.wxActions.toggleFavManage()">
           ${isManage ? '<div class="p-1 active:scale-90 transition-transform"><i data-lucide="check" class="w-6 h-6 text-[#07c160]"></i></div>' : '<div class="p-1 active:scale-90 transition-transform"><i data-lucide="settings" class="w-6 h-6 text-gray-800"></i></div>'}
           </div>
         </div>
         <div id="wechat-favorites-scroll" class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar ${isManage ? 'pb-24' : 'pb-10'}">
            ${store.favorites.map(f => `
              <div class="bg-white p-4 rounded-[12px] shadow-sm flex items-start ${isManage ? 'cursor-pointer active:bg-gray-50' : ''} transition-colors" ${isManage ? `onclick="window.wxActions.toggleSelectFav(${f.id})"` : ''}>
                ${isManage ? `<div class="mr-3 mt-1 w-[22px] h-[22px] rounded-full border flex-shrink-0 ${wxState.selectedFavIds?.includes(f.id) ? 'bg-[#07c160] border-[#07c160]' : 'border-gray-300'} flex items-center justify-center transition-colors shadow-sm">${wxState.selectedFavIds?.includes(f.id) ? '<i data-lucide="check" class="text-white" style="width:14px; height:14px;"></i>' : ''}</div>` : ''}
                <div class="flex-1 overflow-hidden">
                  <div class="flex items-center mb-2"><span class="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded mr-2 font-bold">${f.chatName}</span><span class="text-[10px] text-gray-400">${new Date(f.savedAt).toLocaleDateString()}</span></div>
                  ${f.msgType === 'html_card' ? 
    `<div class="mc-html-render-box w-full text-[14px] text-gray-800 leading-relaxed" style="white-space: normal !important; word-break: break-word !important;">
        <style>
            .mc-html-render-box button { background-color: #f3f4f6; color: #374151; padding: 6px 14px; border-radius: 8px; font-weight: bold; border: 1px solid #e5e7eb; cursor: pointer; transition: all 0.2s; }
            .mc-html-render-box button:active { transform: scale(0.95); background-color: #e5e7eb; }
            .mc-html-render-box input { border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; outline: none; width: 100%; }
            .mc-html-render-box h1 { font-size: 1.4em; font-weight: 900; margin-bottom: 0.5em; }
            .mc-html-render-box h2 { font-size: 1.2em; font-weight: 800; margin-bottom: 0.5em; }
            .mc-html-render-box ul, .mc-html-render-box ol { padding-left: 1.5em; margin-bottom: 0.5em; }
            .mc-html-render-box p { margin-bottom: 0.5em; }
        </style>
        ${f.text}
    </div>` :
    `<div class="text-[14px] text-gray-800 leading-relaxed overflow-wrap break-words">${f.text.replace(/<[^>]*>?/gm, '')}</div>`
}
                </div>
              </div>
            `).join('')}
            ${store.favorites.length === 0 ? '<div class="text-center text-gray-400 mt-10 text-[13px] font-bold tracking-widest">暂无收藏内容</div>' : ''}
         </div>
         ${isManage && wxState.selectedFavIds?.length > 0 ? `
           <div class="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-center animate-in slide-in-from-bottom-2 z-20 pb-8">
             <button onclick="window.wxActions.deleteSelectedFavs()" class="w-full bg-red-500 text-white font-bold py-3.5 rounded-[12px] active:bg-red-600 shadow-sm flex items-center justify-center transition-colors"><i data-lucide="trash-2" class="mr-2" style="width:18px;height:18px;"></i>删除选中的 ${wxState.selectedFavIds.length} 项</button>
           </div>
         ` : ''}
      </div>
    `;
  }
  // 📚 场景 0.95: 我的书架
  if (wxState.view === 'bookshelf') {
    store.books = store.books || [];
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">我的书架</span>
           <div class="w-1/4 flex justify-end items-center text-[#07c160]">
             <input type="file" id="upload-book-txt" accept=".txt" class="hidden" onchange="window.wxActions.uploadBookTxt(event)" />
             <i data-lucide="upload-cloud" class="cursor-pointer active:scale-90 transition-transform" style="width: 26px; height: 26px;" onclick="document.getElementById('upload-book-txt').click()"></i>
           </div>
         </div>
         <div class="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-10">
            ${store.books.map(b => `
              <div class="bg-white rounded-[16px] p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                 <div class="flex items-center flex-1 overflow-hidden mr-3">
                    <div class="w-12 h-14 bg-purple-50 rounded-lg flex items-center justify-center mr-4 shadow-inner border border-purple-100"><i data-lucide="book" class="text-purple-400 w-6 h-6"></i></div>
                    <div class="flex flex-col overflow-hidden flex-1">
                       <span class="text-[15px] font-bold text-gray-800 truncate">${b.title}</span>
                       <span class="text-[11px] text-gray-400 mt-1">阅读进度: ${(b.progress / b.pages.length * 100).toFixed(1)}% (${b.progress + 1}/${b.pages.length})</span>
                    </div>
                 </div>
                 <div class="w-8 h-8 flex items-center justify-center cursor-pointer active:scale-90 opacity-60 hover:text-red-500 transition-all" onclick="window.wxActions.deleteBook('${b.id}')"><i data-lucide="trash-2" class="w-5 h-5 text-red-400"></i></div>
              </div>
            `).join('')}
            ${store.books.length === 0 ? '<div class="text-center text-gray-400 mt-20 text-[13px] font-bold tracking-widest flex flex-col items-center"><i data-lucide="book-dashed" class="w-12 h-12 mb-3 opacity-30"></i>右上角上传 TXT 小说吧</div>' : ''}
         </div>
      </div>
    `;
  }
  // 🎭 场景 0.10: 身份管理 & 编辑
  if (wxState.view === 'personaManage') {
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">我的身份列表</span>
           <div class="w-1/4 flex justify-end"><i data-lucide="plus" class="cursor-pointer active:scale-90 transition-transform text-[#07c160]" style="width: 26px; height: 26px;" onclick="window.wxActions.openPersonaEdit(null)"></i></div>
         </div>
         <div id="persona-scroll" class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar pb-10">
            <p class="text-[11px] text-gray-400 font-bold mb-3 px-1 tracking-widest">可绑定至不同角色的聊天中</p>
            ${store.personas.map(p => `
              <div class="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.openPersonaEdit('${p.id}')">
                <div class="flex items-center">
                  <div class="w-10 h-10 bg-gray-100 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center mr-3 text-lg border border-gray-200">${getVidHtml(p.avatar, '', false)}
                  </div>
                  <div class="flex flex-col"><span class="text-[15px] font-medium text-gray-800">${p.name}</span><span class="text-[11px] text-gray-400 truncate w-32">${p.prompt || '暂无设定内容'}</span>
                  </div>
                </div>
                ${p.id !== store.personas[0].id ? `<div class="w-8 h-8 flex items-center justify-center cursor-pointer active:scale-90 opacity-60 hover:text-red-500 transition-all" onclick="event.stopPropagation(); window.wxActions.deletePersona('${p.id}')"><i data-lucide="trash-2" class="w-5 h-5 text-red-400"></i></div>` : `<span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded font-medium">默认身份</span>`}
              </div>
            `).join('')}
         </div>
      </div>
    `;
  }
  if (wxState.view === 'personaEdit') {
    const isNew = !wxState.editingPersonaId;
    const pData = isNew ? {} : store.personas.find(p => p.id === wxState.editingPersonaId);
    const displayAvatar = wxState.tempPersonaAvatar || pData.avatar ;
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-bottom-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.openView('personaManage')"><i data-lucide="chevron-down" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">${isNew ? '创建新马甲' : '编辑身份设定'}</span>
           <div class="w-1/4"></div> </div>
         <div class="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-10">
            <input type="file" id="upload-persona-avatar" accept="image/*" class="hidden" onchange="window.wxActions.handlePersonaAvatarUpload(event)" />
            
            <div class="bg-white rounded-[12px] p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
               <div class="w-24 h-24 bg-gray-100 rounded-[16px] flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden shadow-sm mb-3" onclick="document.getElementById('upload-persona-avatar').click()">${getVidHtml(displayAvatar, '', false)}</div>
               <span class="text-xs text-gray-500 font-medium tracking-widest">点击更换形象</span>
            </div>

            <div class="bg-white rounded-[12px] px-4 shadow-sm border border-gray-100">
               <div class="flex items-center py-3.5">
                 <span class="w-20 text-[15px] font-medium text-gray-800">化名</span>
                 <input id="edit-persona-name" value="${pData.name || ''}" class="flex-1 outline-none bg-transparent text-[15px] text-black font-medium" placeholder="留空则默认使用你的主名字" />
               </div>
            </div>
            
            <div class="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 space-y-3">
               <span class="text-[15px] font-medium text-gray-800 block">详细设定 (Prompt)</span>
               <textarea id="edit-persona-prompt" rows="6" class="w-full bg-gray-50 rounded-lg p-3 outline-none text-[14px] resize-none text-gray-700 leading-relaxed hide-scrollbar" placeholder="输入该身份的背景、特殊习惯、当前状态等。AI 会根据此设定对待你...">${pData.prompt || ''}</textarea>
            </div>

            <button onclick="window.wxActions.savePersona()" class="w-full py-3.5 mt-4 bg-[#07c160] text-white font-bold rounded-[12px] active:scale-95 transition-transform shadow-sm">保存身份配置</button>
            ${!isNew && pData.id !== store.personas[0].id ? `<button onclick="window.wxActions.deletePersona('${pData.id}')" class="w-full py-3.5 mt-2 bg-white text-red-500 font-bold rounded-[12px] active:bg-gray-50 transition-colors border border-red-100 shadow-sm">删除该身份</button>` : ''}
         </div>
      </div>
    `;
  }

  // 🤩 场景 0.11: 表情包管理 & 编辑
  if (wxState.view === 'emojiManage') {
    store.emojiLibs = store.emojiLibs || [];
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-bold text-gray-800">表情包库管理</span>
           <div class="w-1/4 flex justify-end space-x-4 items-center text-[#07c160]">
             <input type="file" id="upload-emoji-json" accept=".json" class="hidden" onchange="window.wxActions.uploadEmojiJson(event)" />
             <i data-lucide="upload-cloud" class="cursor-pointer active:scale-90 transition-transform" style="width: 22px; height: 22px;" onclick="document.getElementById('upload-emoji-json').click()"></i>
             <i data-lucide="plus" class="cursor-pointer active:scale-90 transition-transform" style="width: 26px; height: 26px;" onclick="window.wxActions.addEmojiLib()"></i>
           </div>
         </div>
         <div id="emoji-manage-scroll" class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar pb-10">
            <p class="text-[11px] text-gray-400 font-bold mb-3 px-1 tracking-widest">点击名称修改，点击卡片编辑内部图片</p>
            ${store.emojiLibs.map(lib => `
              <div class="bg-white rounded-[12px] p-3.5 shadow-sm border border-gray-100 flex items-center justify-between">
                <div class="flex-1 flex items-center cursor-pointer" onclick="window.wxActions.openEmojiEdit('${lib.id}')">
                  <i data-lucide="smile" class="w-5 h-5 text-yellow-500 mr-3"></i>
                  <input value="${lib.name}" onclick="event.stopPropagation()" onchange="window.wxActions.renameEmojiLib('${lib.id}', this.value)" class="flex-1 outline-none text-[15px] text-black bg-transparent font-medium" />
                </div>
                <div class="text-[12px] text-gray-400 font-medium mr-3 w-8 text-center">${lib.emojis?.length || 0} 图</div>
                <div class="w-8 h-8 flex items-center justify-center cursor-pointer active:scale-90 opacity-60 hover:text-red-500 transition-all" onclick="window.wxActions.deleteEmojiLib('${lib.id}')"><i data-lucide="minus-circle" class="w-5 h-5 text-red-400"></i></div>
              </div>
            `).join('')}
         </div>
      </div>
    `;
  }
  if (wxState.view === 'emojiEdit') {
    const lib = store.emojiLibs.find(l => l.id === wxState.editingEmojiLibId) || { emojis: [] };
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-right-4 duration-200 z-50">
         <div class="bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
           <div class="w-1/4 cursor-pointer text-gray-800" onclick="window.wxActions.openView('emojiManage')"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
           <span class="flex-1 text-center font-medium text-gray-800 truncate">${lib.name}</span>
           <div class="w-1/4"></div>
         </div>
         <div id="emoji-edit-scroll" class="flex-1 overflow-y-auto p-4 hide-scrollbar pb-10">
            <div class="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 mb-4 space-y-3">
              <span class="text-[14px] font-medium text-gray-800 flex items-center"><i data-lucide="zap" class="text-blue-500 mr-2 w-4 h-4"></i>极速批量导入</span>
              <textarea id="batch-emoji-input" rows="3" class="w-full bg-gray-50 rounded-lg p-3 outline-none text-[12px] resize-none text-gray-700 leading-relaxed" placeholder="支持格式：\n名称1: http://图片链接\n直接粘贴 http://图片链接"></textarea>
              <button onclick="window.wxActions.batchAddEmojis()" class="w-full py-2.5 bg-gray-800 text-white text-[13px] font-bold rounded-lg active:scale-95 transition-transform shadow-sm">解析并导入</button>
            </div>
            
            <p class="text-[11px] text-gray-400 font-bold mb-3 px-1 tracking-widest uppercase">已添加的表情包 (${lib.emojis.length})</p>
            <div class="grid grid-cols-4 gap-x-3 gap-y-4">
              ${lib.emojis.map((e, idx) => {
                // 兼容老数据
                const ep = typeof e === 'string' ? {url: e, name: '表情'} : e;
                const shortName = ep.name.length > 5 ? ep.name.substring(0,5) + '...' : ep.name;
                return `
                <div class="flex flex-col items-center">
                  <div class="relative aspect-square w-full bg-gray-100 rounded-[12px] border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm group">
                    <img src="${ep.url}" class="w-full h-full object-cover" />
                    <div class="absolute top-1 right-1 bg-black/60 rounded-full p-1 cursor-pointer active:scale-90 shadow-md transition-transform hover:bg-red-500" onclick="window.wxActions.deleteEmojiUrl(${idx})"><i data-lucide="x" class="text-white w-3 h-3"></i></div>
                  </div>
                  <span class="text-[10px] text-gray-500 mt-1.5 truncate w-full text-center font-medium">${shortName}</span>
                </div>
              `}).join('')}
              ${lib.emojis.length === 0 ? '<div class="col-span-4 text-center text-gray-300 mt-6 text-[12px] font-bold tracking-widest">点击右上角添加图片 URL</div>' : ''}
            </div>
         </div>
      </div>
    `;
  }
  // 📸 场景 0.12: 发布朋友圈动态
  if (wxState.view === 'momentPublish') {
    return `
      <div class="w-full h-full bg-[#f3f3f3] flex flex-col relative animate-in slide-in-from-bottom-4 duration-200 z-50">
         <div class="bg-[#f3f3f3] pt-8 pb-3 px-4 flex items-center justify-between sticky top-0 relative z-10">
           <div class="cursor-pointer active:opacity-50" onclick="window.wxActions.closeSubView()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-600"></i></div>
           <span class="text-white bg-[#07c160] px-3 py-1.5 rounded-[6px] cursor-pointer font-bold text-[14px] active:scale-95 transition-transform" onclick="window.wxActions.submitMoment()">发表</span>
         </div>
         <div class="flex-1 overflow-y-auto p-5 bg-white">
            <div class="w-full bg-gray-50 border border-gray-200 rounded-[8px] p-3 relative z-10 shadow-sm ">
              <textarea id="publish-moment-text" rows="5" class="w-full bg-transparent outline-none text-[15px] text-gray-800 resize-none placeholder-gray-400 hide-scrollbar" placeholder="这一刻的想法..."></textarea>
            </div>
            <div class="mt-4 flex flex-wrap gap-3">
               ${wxState.tempMomentImage ? `
                 <div class="w-24 h-24 bg-gray-100 rounded-[8px] overflow-hidden relative shadow-sm">
                   <img src="${wxState.tempMomentImage}" class="w-full h-full object-cover" />
                   <div class="absolute top-1 right-1 bg-black/50 rounded-full p-1 cursor-pointer active:scale-90" onclick="window.wxActions.clearTempMomentImage()"><i data-lucide="x" class="text-white w-3 h-3"></i></div>
                 </div>
               ` : wxState.tempMomentVirtual !== null && wxState.tempMomentVirtual !== undefined ? `
                 <div class="w-full bg-gray-50 border border-gray-200 rounded-[8px] p-3 relative shadow-sm animate-in fade-in">
                    <span class="text-[12px] font-bold text-gray-400 flex items-center mb-2"><i data-lucide="camera" class="w-3 h-3 mr-1"></i>虚拟照片画面描述</span>
                    <textarea id="moment-virtual-input" rows="3" class="w-full bg-transparent outline-none text-[13px] text-gray-700 resize-none hide-scrollbar" placeholder="详细描述照片中的人物、动作或环境...">${wxState.tempMomentVirtual}</textarea>
                    <div class="absolute top-2 right-2 bg-black/20 rounded-full p-1 cursor-pointer hover:bg-black/40 active:scale-90" onclick="window.wxActions.clearTempMomentVirtual()"><i data-lucide="x" class="text-white w-3 h-3"></i></div>
                 </div>
               ` : `
                 <div class="w-24 h-24 bg-gray-50 rounded-[8px] flex flex-col items-center justify-center cursor-pointer active:bg-gray-100 border border-gray-200 shadow-sm transition-colors" onclick="document.getElementById('upload-moment-img').click()">
                   <i data-lucide="image" class="text-gray-400 w-7 h-7 mb-1"></i>
                   <span class="text-[10px] text-gray-400 font-bold">本地图片</span>
                 </div>
                 <div class="w-24 h-24 bg-gray-50 rounded-[8px] flex flex-col items-center justify-center cursor-pointer active:bg-gray-100 border border-gray-200 shadow-sm transition-colors" onclick="window.wxActions.setTempMomentVirtual()">
                   <i data-lucide="camera" class="text-gray-400 w-7 h-7 mb-1"></i>
                   <span class="text-[10px] text-gray-400 font-bold">虚拟照片</span>
                 </div>
               `}
               <input type="file" id="upload-moment-img" accept="image/*" class="hidden" onchange="window.wxActions.handleMomentImageUpload(event)" />
            </div>
            <div class="w-full mt-6 border-t border-gray-100 pt-4 flex flex-col space-y-4 animate-in fade-in">
                  <div class="flex justify-between items-center cursor-pointer active:opacity-50" onclick="window.wxActions.openPrivacyModal()">
                     <div class="flex items-center space-x-3"><i data-lucide="users" class="w-5 h-5 text-gray-800"></i><span class="text-[16px] text-gray-800 font-medium">谁可以看</span></div>
                     <div class="flex items-center space-x-1">
                        <span class="text-[15px] text-gray-500">${wxState.momentPrivacyType === 'invisible' ? '不给谁看' : (wxState.momentPrivacyType === 'visible' ? '部分可见' : '公开')}</span>
                        <i data-lucide="chevron-right" class="w-5 h-5 text-gray-400"></i>
                     </div>
                  </div>

                  <div class="flex items-center justify-between py-3 border-b border-gray-100 cursor-pointer active:bg-gray-50" onclick="window.wxActions.setPublishLocation()">
               <div class="flex items-center space-x-2">
                   <i data-lucide="map-pin" class="w-5 h-5 text-gray-800"></i>
                   <span class="text-[15px] text-gray-800">所在位置</span>
               </div>
               <div class="flex items-center">
                 <span class="text-[13px] ${wxState.publishLocation ? 'text-blue-500 font-bold' : 'text-gray-400'} mr-1 max-w-[150px] truncate">${wxState.publishLocation || '不显示'}</span>
                 <i data-lucide="chevron-right" class="w-4 h-4 text-gray-400"></i>
               </div>
             </div>

               </div>
         </div>
      </div>
      ${wxState.showPrivacyModal ? `
          <div class="fixed inset-0 z-[99999] bg-black/40 flex items-end justify-center animate-in fade-in backdrop-blur-sm" onclick="window.wxActions.closePrivacyModal()">
             <div class="bg-white w-full sm:w-[375px] rounded-t-[24px] p-5 pb-8 flex flex-col max-h-[85vh] overflow-hidden" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-5">
                   <span class="text-[17px] font-black text-gray-800">谁可以看</span>
                   <i data-lucide="x" class="w-6 h-6 text-gray-400 cursor-pointer active:scale-90" onclick="window.wxActions.closePrivacyModal()"></i>
                </div>
                <div class="flex-1 overflow-y-auto space-y-4 hide-scrollbar">
                   <div class="flex items-center justify-between p-4 border border-gray-100 rounded-2xl cursor-pointer ${wxState.momentPrivacyType === 'public' ? 'border-[#07c160] bg-[#07c160]/5' : ''}" onclick="window.wxActions.setPrivacyType('public')">
                      <div><div class="text-[16px] font-bold text-gray-800">公开</div><div class="text-[12px] text-gray-400 mt-0.5">所有人可见</div></div>
                      ${wxState.momentPrivacyType === 'public' ? '<i data-lucide="check-circle-2" class="w-6 h-6 text-[#07c160]"></i>' : '<div class="w-6 h-6 rounded-full border border-gray-300"></div>'}
                   </div>
                   
                   <div class="flex flex-col border border-gray-100 rounded-2xl overflow-hidden ${wxState.momentPrivacyType === 'visible' ? 'border-[#07c160]' : ''}">
                      <div class="flex items-center justify-between p-4 cursor-pointer ${wxState.momentPrivacyType === 'visible' ? 'bg-[#07c160]/5' : ''}" onclick="window.wxActions.setPrivacyType('visible')">
                         <div><div class="text-[16px] font-bold text-gray-800">部分可见</div><div class="text-[12px] text-gray-400 mt-0.5">选中的分组可见</div></div>
                         ${wxState.momentPrivacyType === 'visible' ? '<i data-lucide="check-circle-2" class="w-6 h-6 text-[#07c160]"></i>' : '<div class="w-6 h-6 rounded-full border border-gray-300"></div>'}
                      </div>
                      ${wxState.momentPrivacyType === 'visible' ? `
                      <div class="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3">
                         ${store.groups.map(g => `
                            <div class="flex items-center space-x-2.5 cursor-pointer active:opacity-50" onclick="window.wxActions.togglePrivacyGroup('${g.id}')">
                               <div class="w-5 h-5 rounded-[6px] border flex items-center justify-center ${wxState.momentPrivacyGroups?.includes(g.id) ? 'bg-[#07c160] border-[#07c160]' : 'border-gray-300 bg-white'}">
                                  ${wxState.momentPrivacyGroups?.includes(g.id) ? '<i data-lucide="check" class="w-3.5 h-3.5 text-white"></i>' : ''}
                               </div>
                               <span class="text-[14px] text-gray-700 truncate font-bold">${g.name}</span>
                            </div>
                         `).join('')}
                      </div>` : ''}
                   </div>
                   
                   <div class="flex flex-col border border-gray-100 rounded-2xl overflow-hidden ${wxState.momentPrivacyType === 'invisible' ? 'border-red-500' : ''}">
                      <div class="flex items-center justify-between p-4 cursor-pointer ${wxState.momentPrivacyType === 'invisible' ? 'bg-red-50' : ''}" onclick="window.wxActions.setPrivacyType('invisible')">
                         <div><div class="text-[16px] font-bold text-gray-800">不给谁看</div><div class="text-[12px] text-gray-400 mt-0.5">选中的分组不可见</div></div>
                         ${wxState.momentPrivacyType === 'invisible' ? '<i data-lucide="check-circle-2" class="w-6 h-6 text-red-500"></i>' : '<div class="w-6 h-6 rounded-full border border-gray-300"></div>'}
                      </div>
                      ${wxState.momentPrivacyType === 'invisible' ? `
                      <div class="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3">
                         ${store.groups.map(g => `
                            <div class="flex items-center space-x-2.5 cursor-pointer active:opacity-50" onclick="window.wxActions.togglePrivacyGroup('${g.id}')">
                               <div class="w-5 h-5 rounded-[6px] border flex items-center justify-center ${wxState.momentPrivacyGroups?.includes(g.id) ? 'bg-red-500 border-red-500' : 'border-gray-300 bg-white'}">
                                  ${wxState.momentPrivacyGroups?.includes(g.id) ? '<i data-lucide="check" class="w-3.5 h-3.5 text-white"></i>' : ''}
                               </div>
                               <span class="text-[14px] text-gray-700 truncate font-bold">${g.name}</span>
                            </div>
                         `).join('')}
                      </div>` : ''}
                   </div>
                </div>
                <button onclick="window.wxActions.closePrivacyModal()" class="w-full mt-5 py-3.5 bg-[#07c160] text-white font-bold rounded-xl active:scale-95 transition-transform shadow-md">完成</button>
             </div>
          </div>
        ` : ''}
    `;
  }

  // 🔔 场景 1：来电显示界面
  if (wxState.view === 'incomingCall') {
    const isVideo = wxState.callType === 'video';
    return `
      <div class="w-full h-full bg-[#111] flex flex-col relative animate-in zoom-in-95 duration-300 z-50" style="background: #111 !important;">
        <div class="flex-1 flex flex-col items-center pt-24 space-y-4">
          <div class="w-28 h-28 rounded-full overflow-hidden shadow-[0_0_60px_rgba(74,222,128,0.3)] animate-pulse border-2 border-green-500 flex items-center justify-center bg-gray-800">${getVidHtml(char.videoAvatar, char.avatar, '')}</div>
          <h2 class="text-white text-2xl font-medium mt-4">${char.name}</h2>
          <p class="text-white/60 text-sm animate-pulse">邀请你进行${isVideo ? '视频' : '语音'}通话...</p>
        </div>
        <div class="pb-16 px-10 flex justify-between w-full z-20">
          <div onclick="window.wxActions.declineCall()" class="flex flex-col items-center space-y-2 cursor-pointer active:scale-90 transition-transform"><div class="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg"><i data-lucide="phone-off" style="width:28px;"></i></div><span class="text-white/80 text-sm">拒绝</span></div>
          <div onclick="window.wxActions.acceptCall()" class="flex flex-col items-center space-y-2 cursor-pointer active:scale-90 transition-transform"><div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg animate-bounce"><i data-lucide="${isVideo ? 'video' : 'phone'}" style="width:28px;"></i></div><span class="text-white/80 text-sm">接听</span></div>
        </div>
      </div>
    `;
  }

  // 🍺 场景 2：线下酒馆模式 
  if (wxState.view === 'offlineStory') {
    const offlineMsgs = chatData.messages.filter(m => m.isOffline && !m.isHidden);
    const displayCount = wxState.displayCount || 50;
    // 🌟 智能读取群聊/单聊的背景、名称和设置载体
    const targetObj = chatData.isGroup ? chatData : char;
    const titleName = chatData.isGroup ? chatData.groupName : char?.name;
    const bgUrl = targetObj?.offlineBg || store.bgImage || '';

    return `
      <div class="mc-offline-container absolute inset-0 w-full h-full flex flex-col font-serif z-[60] ${wxState.noAnimate ? '' : 'animate-in slide-in-from-bottom-4 duration-300'}" style="background: ${bgUrl ? `url('${bgUrl}') center/cover no-repeat` : '#fcfcfc'} !important;">
        
        <style>
          .mc-offline-dialogue { color: ${targetObj?.offlineDialogueColor || '#d4b856'}; font-family: inherit; }
          .mc-offline-thought { color: ${targetObj?.offlineThoughtColor || '#9ca3af'}; font-family: inherit; }
          .mc-offline-desc { color: inherit; font-family: inherit; }
          ${targetObj?.offlineCSS || ''}
        </style>

        <div class="mc-offline-topbar bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 z-10 sticky top-0 shadow-sm">
    <div class="flex items-center cursor-pointer text-gray-600 w-1/4 active:opacity-50" onclick="window.wxActions.exitOffline()">
        <i data-lucide="chevron-down" style="width:28px; height:28px;"></i>
    </div>
    <span class="flex-1 text-center font-bold text-[16px] tracking-widest text-gray-800 transition-colors ${(wxState.typingStatus && wxState.typingStatus[chatData.charId]) ? 'animate-pulse text-gray-400' : ''}">
        ${(wxState.typingStatus && wxState.typingStatus[chatData.charId]) ? '正在构思...' : `线下 · ${titleName}`}
    </span>
    <div class="w-1/4 flex justify-end">
        <i data-lucide="settings" class="text-gray-600 cursor-pointer active:scale-90 transition-transform" style="width: 24px; height: 24px;" onclick="window.wxActions.openOfflineSettings()"></i>
    </div>
</div>
        
        <div id="offline-scroll" class="mc-offline-list flex-1 p-5 overflow-y-auto hide-scrollbar flex flex-col pb-6 ${targetObj?.offlineBg ? 'bg-black/10 backdrop-blur-[2px]' : 'bg-[#fcfcfc]'}">
          <div class="text-center text-xs text-gray-400 italic mb-8 tracking-widest pointer-events-none">—— 故事开始 ——</div>
          ${(() => {
              let html = '';
if (offlineMsgs.length > displayCount) {
    html += `<div class="flex justify-center my-3"><div class="text-[11px] font-bold tracking-widest text-gray-600 bg-black/5 px-4 py-1.5 rounded-full cursor-pointer active:scale-90 transition-transform" onclick="window.wxActions.loadMoreHistory()">点击加载更多剧情</div></div>`;
}
const slicedOfflineMsgs = offlineMsgs.slice(-displayCount);

// 1. 找到最后一条线上消息的 id
let lastOnlineMsgId = 0;
for (let i = chatData.messages.length - 1; i >= 0; i--) {
    if (!chatData.messages[i].isOffline) {
        lastOnlineMsgId = chatData.messages[i].id;
        break;
    }
}

// 2. 找到最后一条线上消息在 slicedOfflineMsgs 中的索引
let lastOnlineMsgIndex = -1;
for (let i = 0; i < slicedOfflineMsgs.length; i++) {
    if (!slicedOfflineMsgs[i].isOffline) {
        lastOnlineMsgIndex = i;
    }
}

let lastWasHistory = false;

slicedOfflineMsgs.forEach((msg, idx) => {
    const isHistory = msg.id < lastOnlineMsgId;

    // 插入历史记录分割线（仅当从历史切换到非历史时）
    if (!isHistory && lastWasHistory) {
        html += `<div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 以上为历史记录 ——</div>`;
    }
    lastWasHistory = isHistory;

    // 系统消息保持原样（灰条居中）
    if (msg.msgType === 'system' || msg.msgType === 'recall_system') {
        html += `
        <div class="mc-offline-sysmsg flex items-center justify-center py-2 mb-6 animate-in fade-in duration-300">
            <span class="text-[12px] text-gray-400 font-bold tracking-widest bg-gray-100/80 backdrop-blur-sm px-4 py-1.5 rounded-full">${msg.text.replace(/\[|\]/g, '')}</span>
        </div>`;
        return;
    }

    // ---------- 普通消息卡片 ----------
    // 移除 think 标签
let cleanText = msg.text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
let preProcessedText = cleanText
    .replace(/(『[^』]*』)/g, '\n$1\n')
    .replace(/(「[^」]*」)/g, '\n$1\n')
    .replace(/[（(]([^）)]*)[）)]/g, '\n（$1）\n');

    const formattedLines = preProcessedText.split('\n').filter(l=>l.trim()).map(l => {
    let line = l.trim();
    if (line.startsWith('『') && line.endsWith('』')) {
        return `<p class="offline-dialogue my-2.5 leading-relaxed" style="color: ${targetObj?.offlineDialogueColor || '#d4b856'};">${line}</p>`;
    } else if (line.startsWith('（') && line.endsWith('）')) {
        const pureThought = line.slice(1, -1);
        return `<p class="offline-thought my-2.5 leading-relaxed" style="color: ${targetObj?.offlineThoughtColor || '#9ca3af'};">${pureThought}</p>`;
    } else {
        // 固定使用深灰色，不再根据背景图变白
        return `<p class="offline-desc my-1.5 leading-relaxed" style="color: #374151;">${line}</p>`;
    }
}).join('');

    const showReroll = !msg.isMe && !isHistory;
    const actionIcons = `
    <div class="absolute bottom-3 right-4 flex items-center space-x-3.5 opacity-80 transition-opacity">
        ${showReroll ? `<i data-lucide="refresh-cw" class="w-4 h-4 cursor-pointer active:scale-90 text-gray-500" onclick="window.wxActions.rerollReply(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.rerollReply(${msg.id})" title="重roll"></i>` : ''}
        <i data-lucide="edit-3" class="w-4 h-4 cursor-pointer active:scale-90 text-gray-500" onclick="window.wxActions.openEditMessageModal(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.openEditMessageModal(${msg.id})" title="编辑"></i>
        <i data-lucide="trash-2" class="w-4 h-4 cursor-pointer active:scale-90 text-red-400" onclick="window.wxActions.deleteMessage(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.deleteMessage(${msg.id})" title="删除"></i>
    </div>`;

    // 生成时间戳显示（与线上格式一致）
const timestampDisplay = window.formatSmartTime(msg.timestamp, msg.time, msg.id);
const timestampHtml = `<div class="text-[10px] text-gray-400/70 mt-2 text-left">${timestampDisplay}</div>`;

html += `
<div class="flex justify-center my-4 w-full">
    <div class="offline-card w-full bg-white/80 backdrop-blur-md border border-gray-100/50 rounded-[14px] p-5 relative flex flex-col shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
        <div class="mb-3 text-[12px] font-black tracking-widest text-gray-400">${msg.sender}</div>
        <div class="text-[15px] text-gray-800 leading-relaxed font-serif text-justify pb-6">${formattedLines}</div>
        ${actionIcons}
        ${timestampHtml}
    </div>
</div>`;
});

// 如果最后一条消息是历史，补一条结尾分割线
if (slicedOfflineMsgs.length > 0 && slicedOfflineMsgs[slicedOfflineMsgs.length - 1].id < lastOnlineMsgId) {
    html += `<div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 以上为历史记录 ——</div>`;
}
              
              return html;
          })()}
        </div>
        
        <div class="mc-offline-bottombar bg-white px-4 py-3 pb-8 border-t border-gray-100 flex flex-col shadow-[0_-5px_20px_rgba(0,0,0,0.03)] z-20 relative">
    <div class="mc-offline-input-wrapper relative w-full bg-gray-50 border border-gray-200 rounded-[16px] p-1 flex items-end transition-all focus-within:border-gray-400 focus-within:bg-white shadow-inner">
        <textarea id="offline-input" placeholder="描写你的动作或对话..." class="flex-1 min-h-[80px] max-h-[150px] bg-transparent text-gray-800 p-3 outline-none text-[15px] resize-none placeholder-gray-400 font-serif leading-relaxed hide-scrollbar"></textarea>
        <div class="flex flex-col items-center justify-end pb-2 pr-2 space-y-4 shrink-0">
            <button onclick="window.wxActions.continueOffline()" class="mc-offline-btn-continue w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-90 transition-all" title="让AI接着往下写"><i data-lucide="feather" style="width:20px;"></i></button>
            <button onmousedown="event.preventDefault();" onclick="window.wxActions.sendMessage()" class="mc-offline-btn-send w-9 h-9 flex items-center justify-center text-gray-800 active:scale-90 transition-all hover:text-black"><i data-lucide="send" style="width:22px; margin-left: 2px;"></i></button>
        </div>
    </div>
</div>

        ${wxState.showOfflineSettingsModal ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm p-4 pb-8" onclick="window.wxActions.closeOfflineSettings()">
             <div class="mc-modal-content bg-[#f6f6f6] w-full max-h-[75vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm shrink-0">
                   <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="settings" class="text-gray-800 mr-2 w-5 h-5"></i>线下模式专属设置</span>
                   <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.closeOfflineSettings()"></i>
                </div>
                <div id="offline-settings-scroll" class="flex-1 overflow-y-auto p-5 space-y-6 hide-scrollbar">
                   
                   <div>
                      <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="image" class="w-4 h-4 mr-1 text-green-500"></i>专属背景图 (与线上聊天独立)</span>
                      <div class="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
                         <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center relative cursor-pointer" onclick="document.getElementById('offline-bg-upload').click()">
                               ${targetObj.offlineBg ? `<img src="${targetObj.offlineBg}" class="w-full h-full object-cover">` : `<i data-lucide="plus" class="text-gray-400"></i>`}
                            </div>
                            <span class="text-[12px] font-bold text-gray-600">${targetObj.offlineBg ? '已设置专属背景' : '默认纯色背景'}</span>
                         </div>
                         <div class="flex space-x-2">
                            ${targetObj.offlineBg ? `<button onclick="window.wxActions.clearOfflineBg()" class="px-3 py-1.5 bg-red-50 text-red-500 text-[11px] font-bold rounded-lg">清除</button>` : ''}
                            <button onclick="document.getElementById('offline-bg-upload').click()" class="px-3 py-1.5 bg-gray-800 text-white text-[11px] font-bold rounded-lg">上传</button>
                            <input type="file" id="offline-bg-upload" accept="image/*" class="hidden" onchange="window.wxActions.handleOfflineBgUpload(event)">
                         </div>
                      </div>
                   </div>

                   <div>
                      <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="palette" class="w-4 h-4 mr-1 text-orange-500"></i>文本解析颜色</span>
                      <div class="grid grid-cols-2 gap-3">
                         <div class="bg-white border border-gray-100 p-3 rounded-xl flex items-center justify-between shadow-sm">
                            <span class="text-[12px] font-bold text-gray-700">人物对话</span>
                            <input type="color" value="${targetObj.offlineDialogueColor || '#d4b856'}" onchange="window.wxActions.updateOfflineTextColor('dialogue', this.value)" class="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent">
                         </div>
                         <div class="bg-white border border-gray-100 p-3 rounded-xl flex items-center justify-between shadow-sm">
                            <span class="text-[12px] font-bold text-gray-700">内心想法</span>
                            <input type="color" value="${targetObj.offlineThoughtColor || '#9ca3af'}" onchange="window.wxActions.updateOfflineTextColor('thought', this.value)" class="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent">
                         </div>
                      </div>
                   </div>

                   <div>
                      <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="code" class="w-4 h-4 mr-1 text-blue-500"></i>线下模式CSS界面美化</span>
                      <textarea id="set-offline-css" rows="6" class="w-full bg-white border border-gray-200 rounded-xl p-3 outline-none text-[12px] font-mono resize-none hide-scrollbar shadow-inner leading-relaxed" placeholder="可用语义化标签：\n.mc-offline-topbar\n.mc-offline-bottombar\n.mc-offline-name\n.mc-offline-desc\n.mc-offline-dialogue\n...">${targetObj.offlineCSS || ''}</textarea>
                   </div>
                   
                   <div>
                      <span class="text-[13px] font-bold text-gray-800 mb-2 flex items-center"><i data-lucide="book-open" class="w-4 h-4 mr-1 text-purple-500"></i>选择线下预设/剧本</span>
                      
                      <div class="bg-white px-3 py-2 border border-gray-100 rounded-xl mb-3 shadow-sm flex items-center justify-between">
                         <span class="text-[12px] font-bold text-gray-500">选择世界书分类</span>
                         <select class="bg-gray-50 border border-gray-100 p-1.5 rounded-lg outline-none text-[12px] font-bold text-gray-700 cursor-pointer" onchange="window.wxActions.setOfflineWbMountGroup(this.value)">
                            <option value="全部" ${wxState.activeOfflineWbGroup === '全部' ? 'selected' : ''}>全部分组</option>
                            ${(store.wbGroups && store.wbGroups['local'] ? store.wbGroups['local'] : []).map(g => `<option value="${g}" ${wxState.activeOfflineWbGroup === g ? 'selected' : ''}>${g}</option>`).join('')}
                         </select>
                      </div>

                      <div class="space-y-2 mb-4">
                         ${(() => {
                            const mounted = targetObj.offlineWorldbooks || [];
                            const localWbs = (store.worldbooks || []).filter(w => w.type === 'local' && (wxState.activeOfflineWbGroup === '全部' || w.group === wxState.activeOfflineWbGroup));
                            
                            if(localWbs.length === 0) return '<div class="text-[12px] text-gray-400 text-center py-4 bg-white rounded-xl border border-gray-100 border-dashed">该分组下暂无剧本</div>';
                            
                            return localWbs.map(w => `
                              <div class="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border ${mounted.includes(w.id) ? 'border-gray-800' : 'border-gray-100'} cursor-pointer active:scale-[0.98] transition-all" onclick="window.wxActions.toggleOfflineWbMount('${w.id}')">
                                 <div class="flex flex-col flex-1 overflow-hidden mr-3">
                                    <span class="text-[14px] font-bold ${mounted.includes(w.id) ? 'text-gray-800' : 'text-gray-600'} truncate">${w.title}</span>
                                    <span class="text-[10px] text-gray-400 mt-0.5">${w.group || '默认'}</span>
                                 </div>
                                 <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${mounted.includes(w.id) ? 'bg-gray-800 border-gray-800' : 'border-gray-300'}">
                                    ${mounted.includes(w.id) ? '<i data-lucide="check" class="text-white w-3 h-3"></i>' : ''}
                                 </div>
                              </div>
                            `).join('');
                         })()}
                      </div>
                   </div>
                </div>
                <div class="p-4 bg-white border-t border-gray-100 shrink-0">
                   <button onclick="window.wxActions.saveOfflineSettings()" class="w-full py-3.5 bg-gray-800 text-white font-bold rounded-[14px] active:scale-95 transition-transform shadow-md">保存并应用</button>
                </div>
             </div>
          </div>
        ` : ''}

        ${wxState.editMsgData ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm" onclick="window.wxActions.closeEditMessageModal()">
            <div class="mc-modal-content bg-[#f6f6f6] w-full rounded-[24px] overflow-hidden shadow-2xl flex flex-col" onclick="event.stopPropagation()">
               <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm">
                 <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="edit-3" class="text-blue-500 mr-2 w-5 h-5"></i>编辑文字</span>
                 <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.closeEditMessageModal()"></i>
               </div>
               <div class="p-5 flex flex-col space-y-4">
                  <textarea id="edit-msg-textarea" rows="8" class="w-full bg-white border border-gray-100 rounded-xl p-4 outline-none text-[15px] text-gray-800 font-medium leading-loose shadow-sm resize-none hide-scrollbar">${wxState.editMsgData.text}</textarea>
                  <div class="flex space-x-3 pt-2">
                    <button class="flex-1 bg-white border border-gray-200 text-gray-600 font-bold py-3.5 rounded-xl active:bg-gray-50 transition-colors shadow-sm" onclick="window.wxActions.closeEditMessageModal()">取消</button>
                    <button class="flex-1 bg-gray-800 text-white font-bold py-3.5 rounded-xl active:bg-black transition-colors shadow-md" onclick="window.wxActions.saveEditedMessage()">保存修改</button>
                  </div>
               </div>
            </div>
          </div>
        ` : ''}

        ${globalRerollModalHtml}

      </div>
    `;
  }

  // 📞 场景 3：沉浸式音视频通话模式
  if (wxState.view === 'call') {
    const isVideo = wxState.callType === 'video';
    // 🌟 修复幽灵消息：严格屏蔽线下剧情消息！
    const visibleMsgs = chatData.messages.filter(m => wxState.callStartTime && m.id >= wxState.callStartTime && m.msgType !== 'system' && !m.isHidden && !m.isOffline);
    
    return `
      <div class="w-full h-full bg-[#111] flex flex-col relative animate-in zoom-in-95 duration-300 z-50" style="background: #111 !important;">
        
        <div class="absolute top-0 left-0 right-0 pt-8 pb-4 px-6 flex justify-center text-white z-30 drop-shadow-md pointer-events-none">
          <span class="font-medium text-sm opacity-90 flex items-center shadow-black drop-shadow-lg">
            ${(wxState.typingStatus && wxState.typingStatus[char?.id]) ? '<div class="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>对方正在说话...' : ''}
          </span>
        </div>

        ${isVideo ? `
          <div class="absolute top-16 left-6 z-30 flex flex-col drop-shadow-md">
            <span class="text-white text-xl font-medium tracking-wide">${char.name}</span>
            <span id="call-duration-display" class="text-white/80 font-mono text-[14px] mt-1">00:00</span>
          </div>

          <div class="absolute inset-0 z-0 bg-gray-900 flex items-center justify-center">${getVidHtml(chatData.charVideoAvatar || char.videoAvatar, char.avatar, true)}</div>
          
          <div class="absolute top-16 right-5 w-24 h-36 bg-gray-800 rounded-xl border border-white/20 shadow-2xl overflow-hidden z-20">${getVidHtml(chatData.myVideoAvatar || store.personas[0].videoAvatar, myAvatar, '')}</div>
          <div class="absolute bottom-0 left-0 right-0 h-[45%] pt-5 pb-8 px-5 z-20 flex flex-col justify-between">
            <div id="call-scroll" class="flex-1 overflow-y-auto hide-scrollbar flex flex-col space-y-3 mask-image-top mb-4">
              <div class="mt-auto"></div>
              ${visibleMsgs.map(msg => `
                <div class="flex ${msg.isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2">
                  <span class="inline-block px-3 py-1.5 rounded-xl text-[15px] ${msg.msgType === 'action' ? 'bg-transparent text-white/70 italic font-serif' : 'bg-white/20 text-white'} backdrop-blur-md shadow-sm">${msg.text}</span>
                </div>
              `).join('')}
            </div>
            <div class="flex flex-col space-y-4">
              <div class="flex space-x-3 items-center bg-white/10 p-1.5 rounded-full backdrop-blur-xl border border-white/10">
                <input type="text" id="wx-input" onkeydown="if(event.key==='Enter') window.wxActions.sendMessage()" class="flex-1 bg-transparent text-white placeholder-white/50 px-4 py-2 outline-none text-[15px]" placeholder="正在通话中说话..." />
                <button onclick="window.wxActions.sendMessage()" class="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform"><i data-lucide="send" style="width:24px; margin-left:2px;"></i></button>
              </div>
              <div class="flex justify-center relative w-full mt-4">
    <button onclick="window.wxActions.rerollReply()" class="absolute left-6 w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white active:bg-white/20 transition-colors shadow-lg border border-white/10" title="重roll回复"><i data-lucide="refresh-cw" style="width:24px;"></i></button>
    <button onclick="window.wxActions.endCall()" class=" w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl active:bg-red-600 transition-colors"><i data-lucide="phone-off" style="width:24px;"></i></button>
    <button onclick="window.wxActions.minimizeCall()" class="absolute right-6 w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white active:bg-white/20 transition-colors shadow-lg border border-white/10" title="缩小悬浮窗">
        <i data-lucide="minimize-2" style="width:24px;"></i>
    </button>
  </div>
            </div>
          </div>
        ` : `
          <div class="flex-1 flex flex-col items-center justify-start relative z-10 pt-[12vh]">
            <div class="text-white text-xl font-medium mb-1 tracking-wide drop-shadow-md">${char.name}</div>
            <div id="call-duration-display" class="text-white/80 text-[13px] font-mono mb-5 drop-shadow-md">00:00</div>

            <div class="w-24 h-24 rounded-full overflow-hidden shadow-[0_0_40px_rgba(74,222,128,0.25)] animate-pulse ring-[3px] ring-green-500/30 flex items-center justify-center bg-gray-800 border border-gray-700">${getVidHtml(char.avatar, '')}</div>
            <div class="mt-5 flex items-center space-x-1 text-green-500 opacity-80">
              <div class="w-1 h-2 bg-current rounded-full animate-pulse"></div>
              <div class="w-1 h-5 bg-current rounded-full animate-pulse" style="animation-delay: 200ms"></div>
              <div class="w-1 h-3 bg-current rounded-full animate-pulse" style="animation-delay: 400ms"></div>
              <div class="w-1 h-6 bg-current rounded-full animate-pulse" style="animation-delay: 600ms"></div>
            </div>
          </div>
          <div class="absolute bottom-0 left-0 right-0 pb-8 px-5 z-20 flex flex-col justify-end">
            <div id="call-scroll" class="h-56 overflow-y-auto hide-scrollbar flex flex-col space-y-3 mask-image-top mb-5">
              <div class="mt-auto"></div>
              ${visibleMsgs.map(msg => `
                <div class="flex ${msg.isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2">
                  <span class="inline-block px-3 py-1.5 rounded-xl text-[15px] ${msg.msgType === 'action' ? 'bg-transparent text-white/70 italic font-serif' : 'bg-white/20 text-white'} backdrop-blur-md shadow-sm">${msg.text}</span>
                </div>
              `).join('')}
            </div>
            <div class="flex flex-col space-y-5">
              <div class="flex space-x-3 items-center bg-white/10 p-1.5 rounded-full backdrop-blur-xl border border-white/10">
                <input type="text" id="wx-input" onkeydown="if(event.key==='Enter') window.wxActions.sendMessage()" class="flex-1 bg-transparent text-white placeholder-white/50 px-4 py-2 outline-none text-[15px]" placeholder="正在通话中说话..." />
                <button onclick="window.wxActions.sendMessage()" class="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform"><i data-lucide="send" style="width:24px; margin-left:2px;"></i></button>
              </div>
              <div class="flex justify-center relative w-full mt-4">
    <button onclick="window.wxActions.rerollReply()" class="absolute left-6 w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white active:bg-white/20 transition-colors shadow-lg border border-white/10" title="重roll回复"><i data-lucide="refresh-cw" style="width:24px;"></i></button>
    <button onclick="window.wxActions.endCall()" class=" w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl active:bg-red-600 transition-colors"><i data-lucide="phone-off" style="width:24px;"></i></button>
    <button onclick="window.wxActions.minimizeCall()" class="absolute right-6 w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white active:bg-white/20 transition-colors shadow-lg border border-white/10" title="缩小悬浮窗">
        <i data-lucide="minimize-2" style="width:24px;"></i>
    </button>
  </div>
            </div>
          </div>
        `}

        ${globalRerollModalHtml}
      </div>
    `;
  }

  // 💬 场景 4：正常的微信聊天室
  if (wxState.view === 'chatRoom') {
    let lastRenderedTime = ''; 
    
    // 🌟 核心切片：将线上消息提取出来，根据 displayCount 截断，并在顶部加上加载按钮！
    const onlineMsgs = chatData.messages.filter(m => !m.isOffline && !m.isHidden && !wxState.revealingMsgIds.has(m.id));
    const displayCount = wxState.displayCount || 50;
    
    const messagesHtml = (onlineMsgs.length > displayCount ? `<div class="flex justify-center my-2"><div class="text-[11px] font-bold tracking-widest text-gray-600 bg-gray-100/80 px-4 py-1.5 rounded-full cursor-pointer active:scale-90 transition-transform" onclick="window.wxActions.loadMoreHistory()">点击加载更多历史记录</div></div>` : '') + 
    onlineMsgs.slice(-displayCount).map((msg, index, array) => {
      // 🌟 找到发送者的角色数据（群聊时动态查找，单聊时直接用 char）
      const senderChar = (isGroup && !msg.isMe) ? store.contacts.find(c => c.name === msg.sender) : char;
      const senderAvatar = senderChar ? senderChar.avatar : '';
      // 🌟 如果是群聊，在别人发的气泡上方显示TA的名字
      const groupNameHtml = (isGroup && !msg.isMe && msg.msgType !== 'system' && msg.msgType !== 'recall_system' && msg.msgType !== 'friend_request') 
          ? `<span class="text-[11px] font-bold text-gray-400 mb-1 ml-1 block">${msg.sender}</span>` : '';
      let timeHtml = '';
      if (msg.time && msg.time !== lastRenderedTime) {
        timeHtml = `<div class="flex justify-center my-3 animate-in fade-in"><span class="mc-time-tag text-[11px] text-gray-400 font-medium">${window.formatSmartTime(msg.timestamp, msg.time, msg.id)}</span></div>`;
        lastRenderedTime = msg.time;
      }
      
      const isSelected = wxState.selectedMsgIds?.includes(msg.id);
      const checkboxHtml = wxState.isMultiSelecting ? `<div class="mr-3 flex-shrink-0"><div class="mc-checkbox-${msg.id} w-[22px] h-[22px] rounded-full border ${isSelected ? 'bg-[#07c160] border-[#07c160]' : 'border-gray-300 bg-white'} flex items-center justify-center transition-colors shadow-sm">${isSelected ? `<i data-lucide="check" class="text-white" style="width:14px; height:14px;"></i>` : ''}</div></div>` : '';

      if (msg.msgType === 'system' || msg.msgType === 'recall_system') {
        let clickStr = '', hintStr = '';
        if (msg.msgType === 'recall_system' && !msg.isMe && msg.recalledText) {
          clickStr = `onclick="alert('被撤回的原文：\\n\\n' + decodeURIComponent('${encodeURIComponent(msg.recalledText)}'))"`;
          hintStr = `<i data-lucide="eye" class="inline-block w-[12px] h-[12px] ml-1 opacity-60"></i>`;
        }
        const cursorCls = clickStr ? 'cursor-pointer hover:bg-gray-300/80 active:scale-95 transition-all shadow-sm' : '';
        return `${timeHtml}<div class="mc-msg-sys flex items-center w-full my-1.5 animate-in fade-in duration-300 ${wxState.isMultiSelecting ? 'pl-2 cursor-pointer' : ''}" ${wxState.isMultiSelecting ? `onclick="window.wxActions.toggleSelectMsg(${msg.id})"` : ''}>${checkboxHtml}<div class="flex-1 flex justify-center pointer-events-${wxState.isMultiSelecting ? 'none' : 'auto'}"><span ${clickStr} class="flex items-center bg-gray-200/60 text-gray-500 text-[11px] px-3 py-1 rounded-full font-medium backdrop-blur-sm ${cursorCls}">${msg.text.replace(/\[|\]/g, '')}${hintStr}</span></div></div>`;
      }
      
      let contentHtml = '', bubbleClass = '', bubbleStyle = '', maxWidthClass = 'max-w-[75%]';
      let quoteHtmlOut = '', voiceTextOut = ''; // 🌟 新增：独立在外层的框
      
      if (msg.msgType === 'action') {
        bubbleClass = 'mc-bubble-action px-4 py-1.5 text-[14px]'; 
        bubbleStyle = `font-family: var(--chat-font); background-color: transparent; color: #9ca3af; font-style: italic;`; 
        contentHtml = msg.text;
      } else if (msg.msgType === 'virtual_image') {
        maxWidthClass = 'max-w-[70%]';
        bubbleClass = 'mc-bubble-vimg rounded-xl shadow-sm overflow-hidden border border-gray-200'; 
        bubbleStyle = ''; 
        contentHtml = `<div class="relative w-48 min-h-[12rem] bg-white cursor-pointer select-none" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');"><div class="absolute inset-0 p-4 overflow-y-auto text-[13px] text-gray-700 leading-relaxed text-left bg-white"><span class="font-bold text-gray-400 block mb-1 flex items-center"><i data-lucide="image" class="mr-1" style="width:14px; height:14px;"></i>照片内容：</span>${msg.text}</div><div class="img-overlay absolute inset-0 bg-gray-100 flex flex-col items-center justify-center text-gray-400 transition-opacity duration-300 z-10"><i data-lucide="image" class="mb-2 text-gray-300" style="width: 36px; height: 36px;"></i><span class="text-[11px] font-bold tracking-widest animate-pulse">图片加载中...</span></div></div>`;
      } else if (msg.msgType === 'voice') {
        bubbleClass = `mc-bubble-voice px-4 py-2.5 rounded-xl shadow-sm leading-relaxed overflow-hidden text-[15px] ${msg.isMe ? 'bg-[#95ec69] text-black rounded-tr-sm' : 'bg-white text-black rounded-tl-sm'}`; 
        bubbleStyle = '';
        const duration = Math.min(Math.max(Math.round(msg.text.length / 4), 2), 60); const numBars = Math.min(8 + Math.floor(duration * 1.8), 45); 
        let barsHtml = ''; for (let i = 0; i < numBars; i++) barsHtml += `<div class="w-[2px] ${['h-2', 'h-4', 'h-3', 'h-5', 'h-2', 'h-6', 'h-3', 'h-4'][i % 8]} bg-current rounded-full animate-pulse opacity-80" style="animation-delay: ${(i * 100) % 1000}ms"></div>`;        
        
        // 💡 变化1：去掉了强行改 DOM 的代码，onclick 里只干干净净地呼叫 playVoiceMsg
        contentHtml = `<div class="flex flex-col cursor-pointer" onclick="window.wxActions.playVoiceMsg('${msg.id}')"><div class="flex items-center space-x-3 ${msg.isMe ? 'flex-row-reverse space-x-reverse' : ''}"><div class="flex items-center gap-[2px] ${msg.isMe ? 'text-green-800' : 'text-gray-800'}">${barsHtml}</div><span class="text-[13px] opacity-80">${duration}"</span></div></div>`;      
        
        // 💡 变化2：根据消息数据的状态，动态决定要不要加上 hidden！
        const textHiddenClass = msg.showText ? '' : 'hidden'; 
        voiceTextOut = `<div class="mc-voice-text-out ${textHiddenClass} mt-1.5 text-[14px] text-gray-600 bg-gray-100/90 rounded-[10px] px-3 py-2 max-w-full break-words shadow-sm border border-gray-200/50 relative before:content-[''] before:absolute before:border-[6px] before:border-transparent before:border-b-gray-100 ${msg.isMe ? 'before:right-4 before:-top-[11px]' : 'before:left-4 before:-top-[11px]'}">${msg.text}</div>`;
      } else if (msg.msgType === 'html_card') {
        maxWidthClass = 'max-w-[85%]';
        // 🌟 修复 1：恢复漂亮的白色底板和卡片圆角阴影
        bubbleClass = 'mc-bubble-html bg-white rounded-[16px] shadow-sm border border-gray-100 overflow-hidden w-full flex flex-col';
        bubbleStyle = '';
        
        let safeHtml = msg.text;
        try { 
            const doc = new DOMParser().parseFromString(safeHtml, 'text/html');
            // 🌟 修复 2：把 AI 写在 <head> 里的 CSS 样式（<style>）强行抢救回来！
            const headStyles = Array.from(doc.head.querySelectorAll('style')).map(s => s.outerHTML).join('\n');
            safeHtml = headStyles + doc.body.innerHTML;
        } catch(e) {}
        
        // 🌟 修复 3：加入一套基础的“兜底 CSS”，抵抗 Tailwind 的格式化重置！
        // 这样即使 AI 不写样式，按钮也是好看的灰色圆角按钮，标题也是加粗的！
        contentHtml = `
          <div class="w-full p-4 mc-html-render-box relative text-[14px] text-gray-800 leading-relaxed">
             <style>
               /* 🌟 免疫血清：无视大模型的代码回车缩进，强制回归标准 HTML 连贯排版！ */
               .mc-html-render-box { white-space: normal !important; word-break: break-word !important; }
               
               .mc-html-render-box button { background-color: #f3f4f6; color: #374151; padding: 6px 14px; border-radius: 8px; font-weight: bold; border: 1px solid #e5e7eb; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
               .mc-html-render-box button:active { transform: scale(0.95); background-color: #e5e7eb; }
               .mc-html-render-box input { border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; outline: none; width: 100%; box-sizing: border-box; }
               .mc-html-render-box input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
               .mc-html-render-box h1 { font-size: 1.4em; font-weight: 900; margin-bottom: 0.5em; color: #111827; }
               .mc-html-render-box h2 { font-size: 1.2em; font-weight: 800; margin-bottom: 0.5em; color: #1f2937; }
               .mc-html-render-box h3 { font-size: 1.1em; font-weight: bold; margin-bottom: 0.5em; color: #374151; }
               .mc-html-render-box ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 0.5em; }
               .mc-html-render-box ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 0.5em; }
               .mc-html-render-box p { margin-bottom: 0.5em; }
               .mc-html-render-box hr { border: 0; border-top: 1px solid #e5e7eb; margin: 1em 0; }
               .mc-html-render-box a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
             </style>
             ${safeHtml}
          </div>
        `;
        
      } else if (msg.msgType === 'text') {
        // 🌟 修复：加入了 whitespace-pre-wrap 让 \n 能够被浏览器正确渲染成换行！
        bubbleClass = `mc-bubble-text px-4 py-2.5 rounded-xl shadow-sm leading-relaxed break-all overflow-wrap break-words whitespace-pre-wrap text-[15px] ${msg.isMe ? 'bg-[#95ec69] text-black rounded-tr-sm' : 'bg-white text-black rounded-tl-sm'}`;
        bubbleStyle = '';
        
        // 🌟 物理擦除 AI 附加的接受邀请指令，让用户只能看到 AI 开心的回复
        let safeText = msg.text.replace(/\[系统隐形情报：[\s\S]*?\]/g, '').replace(/\[(?:接受|同意)邀请\]/g, '').trim();

        try { // 🌟 防止普通零碎文字里的孤立 HTML 标签撑破底栏
            if (safeText.includes('<') && safeText.includes('>')) {
               const doc = new DOMParser().parseFromString(safeText, 'text/html');
               safeText = doc.body.innerHTML;
            }
        } catch(e) {}

        if (msg.quote) {
           quoteHtmlOut = `<div class="mc-quote-out text-[11px] text-gray-800 bg-gray-300/80 rounded-[8px] px-2.5 py-1.5 mb-1 max-w-full break-words whitespace-pre-wrap ${msg.isMe ? 'self-end' : 'self-start'}">${msg.quote.sender}：${msg.quote.text}</div>`;
        }
        // 🌟 保留用户消息中的换行符，使其在气泡中正确显示
        contentHtml = msg.isMe ? safeText.replace(/\n/g, '<br>') : safeText;
      } else if (msg.msgType === 'real_image') {
        maxWidthClass = 'max-w-[40%]';
        bubbleClass = 'mc-bubble-img bg-white p-1 rounded-xl shadow-sm border border-gray-100'; 
        bubbleStyle = ''; 
        contentHtml = `<img src="${msg.imageUrl}" class="w-full h-auto rounded-lg object-cover max-h-[200px] cursor-pointer" alt="照片" />`;
      } else if (msg.msgType === 'location') {
        maxWidthClass = 'max-w-[65%]';
        bubbleClass = 'mc-bubble-location bg-white rounded-[12px] shadow-sm border border-gray-100 overflow-hidden p-0 cursor-pointer active:scale-95 transition-transform';
        bubbleStyle = '';
        contentHtml = `
          <div class="flex flex-col w-56" onclick="window.actions.showToast('正在打开地图...')">
            <div class="px-3 pt-2 text-[15px] text-gray-800 font-bold truncate w-full">${msg.text}</div>
            <div class="text-[11px] text-gray-400 px-3 pb-2 truncate w-full">点击查看详细位置</div>
            <div class="h-24 relative w-full overflow-hidden border-t border-gray-100 bg-[#f2f0e6]">
               <div class="absolute w-full h-2 bg-white top-8 rotate-12"></div>
               <div class="absolute w-full h-3 bg-white top-12 -rotate-6"></div>
               <div class="absolute w-2 h-full bg-white left-12 rotate-3"></div>
               <div class="absolute w-3 h-full bg-white right-10 -rotate-12"></div>
               <div class="absolute w-16 h-10 bg-[#c8e6c9] top-2 left-20 rounded-md opacity-60"></div>
               <div class="absolute w-32 h-6 bg-[#bbdefb] bottom-2 right-[-10px] rotate-[-15deg] opacity-80"></div>
               <div class="absolute inset-0 flex items-center justify-center">
                   <i data-lucide="map-pin" class="text-red-500 drop-shadow-md pb-2" style="width: 32px; height: 32px; fill: #ef444420;"></i>
               </div>
            </div>
          </div>
        `;
      } else if (msg.msgType === 'transfer') {
        maxWidthClass = ''; 
        bubbleClass = 'mc-bubble-transfer w-[230px] h-[95px] rounded-xl shadow-sm overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-transform'; 
        bubbleStyle = ''; 
        const isPending = (msg.transferState || 'pending') === 'pending'; 
        const stateText = isPending ? msg.transferData.note : (msg.transferState === 'accepted' ? '已收款' : '已退还');
        const tBg = isPending ? '#fbab66' : '#f9ede3';
        const textCol = isPending ? 'text-white' : 'text-[#f69b49]';
        contentHtml = `
          <div class="mc-transfer-top flex-1 flex items-center p-3.5 space-x-3 transition-colors ${textCol}" style="background-color: ${tBg};" onclick="window.wxActions.openTransferModal(${msg.id})">
            <div class="mc-transfer-icon w-10 h-10 rounded-full flex items-center justify-center border border-current flex-shrink-0 transition-colors opacity-90">
              <i data-lucide="${isPending ? 'arrow-right-left' : (msg.transferState === 'accepted' ? 'check' : 'corner-up-left')}" style="width:20px; height:20px; color: currentcolor;"></i>
            </div>
            <div class="mc-transfer-info flex flex-col overflow-hidden">
              <span class="mc-transfer-amt text-[15px] font-bold">¥${msg.transferData.amount}</span>
              <span class="mc-transfer-note text-[11px] opacity-90 truncate">${stateText}</span>
            </div>
          </div>
          <div class="mc-transfer-bot h-[26px] bg-white px-3 flex items-center justify-between text-[10px] text-gray-400 font-bold border-t border-gray-100 flex-shrink-0">
            <span>转账</span>
            ${!isPending ? `<i data-lucide="check-circle" style="width:12px; height:12px;" class="opacity-50"></i>` : ''}
          </div>
        `;
      } else if (msg.msgType === 'friend_request') {
        maxWidthClass = 'w-full';
        bubbleClass = 'w-full flex justify-center my-2 bg-transparent shadow-none'; bubbleStyle = '';
        const reqState = msg.reqState || 'pending';
        contentHtml = `
          <div class="bg-white rounded-[16px] shadow-sm border border-gray-100 p-5 w-[280px] flex flex-col items-center">
             <div class="w-12 h-12 rounded-full overflow-hidden border border-gray-100 mb-2"><img src="${char?.avatar || ''}" class="w-full h-full object-cover"></div>
             <span class="text-[15px] font-bold text-gray-800 mb-1">${char?.name || '角色'} 申请添加你为好友</span>
             ${reqState === 'pending' ? `
             <div class="flex space-x-3 w-full">
                <button onclick="window.wxActions.handleFriendReq(${msg.id}, false)" class="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-[14px] font-bold active:bg-gray-200 transition-colors">拒绝</button>
                <button onclick="window.wxActions.handleFriendReq(${msg.id}, true)" class="flex-1 py-2.5 bg-[#07c160] text-white rounded-xl text-[14px] font-bold active:bg-[#06ad56] transition-colors">同意</button>
             </div>
             ` : `<span class="text-[13px] font-bold px-4 py-1.5 rounded-full ${reqState==='accepted'?'bg-green-50 text-[#07c160]':'bg-red-50 text-red-500'}">${reqState==='accepted'?'已同意':'已拒绝'}</span>`}
          </div>
        `;
      } else if (msg.msgType === 'history_record') {
        maxWidthClass = 'max-w-[75%]';
        bubbleClass = 'mc-bubble-record bg-white rounded-[12px] shadow-sm border border-gray-100 flex flex-col overflow-hidden cursor-pointer active:bg-gray-50 transition-colors'; 
        bubbleStyle = ''; 
        contentHtml = `
          <div class="p-3 pb-2 flex flex-col text-left">
            <span class="text-[14px] font-medium text-gray-800 mb-1.5 truncate w-[13rem]">${msg.historyData.title}</span>
            <div class="text-[11px] text-gray-500 leading-snug space-y-0.5 line-clamp-4">
               ${msg.historyData.preview.split('\n').map(l => `<div class="truncate">${l}</div>`).join('')}
            </div>
          </div>
          <div class="border-t border-gray-100 mx-3 py-1.5 flex justify-between items-center text-[10px] text-gray-400"><span>聊天记录</span></div>
        `;
      } else if (msg.msgType === 'forum_post_card') {
            // 🌟 完美融入架构：给论坛转发卡片专门设计的绝美 UI！
            maxWidthClass = 'max-w-[250px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            const cd = msg.cardData || {};
            
            contentHtml = `
            <div class="w-[230px] bg-white rounded-[14px] border border-gray-200 p-3.5 shadow-sm select-none flex flex-col active:bg-gray-50 cursor-pointer transition-colors" 
                 onclick="window.actions.setCurrentApp('forum'); setTimeout(()=> { if(window.forumActions) { window.forumState.mainTab='home'; window.forumActions.openPostDetail(${cd.postId}); } }, 100);">
                
                <div class="flex items-center space-x-1.5 text-gray-500 mb-2.5">
                    <i data-lucide="compass" class="w-4 h-4 text-red-500 shrink-0"></i>
                    <span class="text-[11px] font-bold tracking-wide">笔记分享</span>
                </div>
                
                <div class="text-[15px] font-black text-gray-900 mb-1.5 leading-snug line-clamp-2">${cd.title}</div>
                <div class="text-[13px] font-medium text-gray-500 line-clamp-2 leading-relaxed mb-3">${cd.contentSnippet}</div>
                
                <div class="border-t border-gray-100 pt-2.5 flex items-center">
                    <div class="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 overflow-hidden shrink-0">
                        <i data-lucide="user" class="w-3 h-3 text-gray-400"></i>
                    </div>
                    <span class="text-[10px] text-gray-400 font-bold truncate">来自 @${cd.author}</span>
                </div>
            </div>
            `;
      } else if (msg.msgType === 'phone_invite_card') {
            // 🌟 查手机权限邀请卡片 (高级极客风配色)
            maxWidthClass = 'max-w-[240px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            contentHtml = `
            <div class="w-[200px] bg-slate-50 rounded-[18px] border border-slate-200 p-4 shadow-sm select-none flex flex-col items-center justify-center">
                <div class="flex items-center space-x-2 text-slate-700 mb-2.5 mt-1">
                    <i data-lucide="smartphone" class="w-5 h-5 opacity-80 shrink-0"></i>
                    <span class="text-[14px] font-black tracking-wide leading-snug text-center">${boundPersona.name}请求获取<br>手机访问权限</span>
                </div>
                <div class="flex items-center space-x-1.5 text-slate-400 mb-1">
                    <i data-lucide="shield-question" class="w-3.5 h-3.5 opacity-80"></i>
                    <span class="text-[10px] font-bold">等待对方授权...</span>
                </div>
            </div>
            `;
      } else if (msg.msgType === 'takeaway_card') {
            // 🍔 像素级克隆：赛博小票联名款 (Aric寄语版 + 待付款提示)
            maxWidthClass = 'max-w-[280px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            
            const data = msg.takeawayData || {};
            const isUnpaid = data.paymentState === 'unpaid';
            
            // 优雅地把多个菜品转化为逼真的小票列表
            const foodListHtml = (data?.foodItemsArr || [])
                .map(f => `
                    <div class="flex text-[11px] font-mono tracking-tight leading-relaxed text-gray-800">
                        <span class="w-[30px] flex-shrink-0 text-center">${f.qty}x</span>
                        <span class="flex-1 truncate pr-2">${f.name}</span>
                        <span class="w-[50px] text-right">¥${f.price}</span>
                    </div>
                `)
                .join('');

            contentHtml = `
            <div class=" साइबर-रसीद relative w-[260px] ${isUnpaid ? 'bg-[#fffbeb]' : 'bg-[#f8f8f8]'} p-6 pb-2 text-gray-900 shadow-md select-none flex flex-col items-center justify-center font-mono tracking-tight active:scale-95 transition-transform cursor-pointer overflow-visible border-dashed border-t-2 border-b-2 ${isUnpaid ? 'border-orange-300' : 'border-gray-300'}">
                
                <div class="flex items-center justify-center text-[11px] ${isUnpaid ? 'text-orange-500 font-bold' : 'opacity-70'} mb-2">${isUnpaid ? 'AWAITING PAYMENT' : 'CYBER DELIVERIES BY CAT'}</div>
                <div class="font-black text-gray-900 text-[18px] text-center truncate mb-1">${data?.storeName || '神秘美食'}</div>
                
                <div class="border-b-2 border-dashed ${isUnpaid ? 'border-orange-200' : 'border-gray-300'} w-full my-3"></div>
                
                <div class="w-full rounded-[6px] p-2 text-rose-600 font-bold text-[14px] leading-snug break-words whitespace-pre-wrap text-left before:content-['备注：']">${data?.personalNote || 'Enjoy your cyber food!'}</div>
                
                <div class="border-b-2 border-dashed ${isUnpaid ? 'border-orange-200' : 'border-gray-300'} w-full mt-4 mb-4"></div>
                
                <div class="flex text-[11px] font-black text-gray-700 w-full mb-3 px-1">
                    <span class="w-[30px] flex-shrink-0 text-center">QTY</span>
                    <span class="flex-1 pr-2">ITEM</span>
                    <span class="w-[50px] text-right pr-1">AMT</span>
                </div>
                
                <div class="w-full space-y-2.5 mb-2 px-1">
                    ${foodListHtml || '<div class="text-center text-gray-400 text-[10px]">没有菜品信息</div>'}
                </div>
                
                <div class="border-b-2 border-dashed ${isUnpaid ? 'border-orange-200' : 'border-gray-300'} w-full my-4"></div>
                
                <div class="flex justify-between font-bold text-gray-600 text-[12px] w-full mb-2 px-1">
                    <span>RECIPIENT</span>
                    <span class="text-gray-800">${data?.recipient || '未知'}</span>
                </div>
                
                <div class="flex justify-between font-black text-gray-950 text-[15px] w-full mb-5 px-1">
                    <span>${isUnpaid ? 'PENDING TOTAL' : 'GRAND TOTAL'}</span>
                    <span class="${isUnpaid ? 'text-orange-500' : ''}">¥${data?.totalPriceStr || '0.00'}</span>
                </div>
                
                <div class="border-b-2 border-dashed ${isUnpaid ? 'border-orange-200' : 'border-gray-300'} w-full mb-3"></div>
                
                <div class="flex items-center justify-center text-[10px] opacity-70 mb-3 tracking-wider">#ARICSCATERING</div>
                <div class="flex h-12 w-full bg-[#f3f3f3] mt-2 mb-1" style="background-image: repeating-linear-gradient(90deg, #111 0px, #111 2px, transparent 2px, transparent 4px, #111 4px, #111 5px, transparent 5px, transparent 7px);"></div> 
            </div>
            `;
      } else if (msg.msgType === 'taobao_card') {
            maxWidthClass = 'max-w-[300px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            
            const data = msg.taobaoData || { items: [], totalPrice: '0.00', orderNum: '未知', orderTime: '未知', deliveryDateStr: '未知', paymentState: 'paid', recipient: '' };
            const isUnpaid = data.paymentState === 'unpaid';
            
            // 🌟 根据付款状态切换主题色
            const headerBg = isUnpaid ? 'linear-gradient(135deg,#FFB000,#FF8C00)' : 'linear-gradient(135deg,#FF4E00,#FF7E3E)';
            const headerTitle = isUnpaid ? '等待付款' : '订单提交成功';
            const headerSub = isUnpaid ? '请在24小时内完成支付' : '卖家将在24小时内发货';
            const headerIcon = isUnpaid 
                ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="#fff" stroke-width="2"/><path d="M12 6v6l4 2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="#fff" stroke-width="2"/><path d="M8 12.5L11 15.5L16.5 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            
            const itemsHtml = data.items.map(item => `
                <div style="padding:16px;border-bottom:1px solid #f0f0f0">
                    <div style="display:flex;gap:12px">
                        <div style="width:80px;height:80px;border-radius:8px;background:#f9fafb;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid #f0f0f0">
    <i data-lucide="package" style="width:40px;height:40px;color:#ccc"></i>
</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:14px;color:#333;font-weight:500;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${item.name}</div>
                            <div style="font-size:12px;color:#999;margin-top:6px">默认规格</div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                                <span style="font-size:15px;color:${isUnpaid?'#FFB000':'#FF4E00'};font-weight:600">¥${item.price}</span>
                                <span style="font-size:12px;color:#999">x${item.qty}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');

            // 🌟 动态添加收件人信息
            const recipientHtml = data.recipient ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>收件人</span><span style="color:#333">${data.recipient}</span></div>` : '';

            contentHtml = `
            <div style="white-space: normal !important; line-height: 1.5; width: 280px;" class="cursor-pointer active:scale-95 transition-transform select-none">
                <div style="margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);background:#fff">
                    <div style="background:${headerBg};padding:16px;color:#fff">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                            ${headerIcon}
                            <span style="font-size:16px;font-weight:600">${headerTitle}</span>
                        </div>
                        <div style="font-size:12px;opacity:0.9">${headerSub}</div>
                    </div>
                    
                    ${itemsHtml}
                    
                    <div style="padding:12px 16px;font-size:12px;color:#666;border-bottom:1px solid #f0f0f0">
                        <div style="display:flex;justify-content:space-between;padding:4px 0"><span>订单编号</span><span style="color:#333">${data.orderNum}</span></div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0"><span>下单时间</span><span style="color:#333">${data.orderTime}</span></div>
                        ${recipientHtml}
                    </div>
                    
                    <div style="padding:12px 16px;background:${isUnpaid?'#FFFDF5':'#FFF9F5'}">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                            <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="${isUnpaid?'#FFB000':'#FF4E00'}" stroke-width="1.5"/><path d="M9 5v4.5l3 1.5" stroke="${isUnpaid?'#FFB000':'#FF4E00'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            <span style="font-size:12px;color:${isUnpaid?'#FFB000':'#FF4E00'};font-weight:500">预计送达</span>
                        </div>
                        <div style="font-size:14px;color:#333;font-weight:600">${data.deliveryDateStr} 14:00-18:00</div>
                    </div>
                    
                    <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:#FAFAFA">
                        <span style="font-size:13px;color:#999">${isUnpaid?'待付款':'实付款'}</span>
                        <span style="font-size:18px;color:${isUnpaid?'#FFB000':'#FF4E00'};font-weight:700">¥${data.totalPrice}</span>
                    </div>
                </div>
            </div>
            `;
      // 👇 🌟 新增：Sync 博主共创邀请卡片
        } else if (msg.msgType === 'sync_invite_card') {
            maxWidthClass = 'max-w-[260px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            contentHtml = `
            <div class="w-[240px] bg-[#fcfcfc] rounded-[12px] border border-gray-200 p-6 shadow-sm select-none flex flex-col items-center justify-center relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-[3px] bg-gray-900"></div>
                
                <i data-lucide="infinity" class="w-7 h-7 text-gray-900 mb-3 opacity-90"></i>
                <span class="text-[16px] font-black tracking-[0.2em] leading-snug text-center font-serif text-gray-900 mb-1 uppercase">Sync.</span>
                <span class="text-[9px] text-gray-400 tracking-[0.2em] uppercase mb-5">Invitation</span>
                
                <div class="text-[12px] font-bold text-gray-600 text-center leading-relaxed font-serif">
                    <span class="text-gray-900 border-b border-gray-300 pb-0.5 px-1">${msg.sender}</span><br>
                    <span class="text-[11px] opacity-80 mt-2 block font-sans tracking-wide">invited you to co-create</span>
                </div>
            </div>
            `;
      // 👇 🌟 新增：公关危机转发预警卡片
        } else if (msg.msgType === 'pr_forward_card') {
            maxWidthClass = 'max-w-[260px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            const titleMatch = msg.text.match(/标题：(.*)/);
            const title = titleMatch ? titleMatch[1] : '突发危机事件';
            contentHtml = `
            <div class="w-[240px] bg-[#fcfcfc] rounded-[12px] border border-rose-200 p-6 shadow-sm select-none flex flex-col items-center justify-center relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-[3px] bg-rose-500"></div>
                <i data-lucide="alert-triangle" class="w-7 h-7 text-rose-500 mb-3 opacity-90 animate-pulse"></i>
                <span class="text-[16px] font-black tracking-[0.2em] leading-snug text-center font-serif text-gray-900 mb-1 uppercase">PR Alert</span>
                <span class="text-[9px] text-rose-400 tracking-[0.2em] uppercase mb-5">Crisis Management</span>
                <div class="text-[12px] font-bold text-gray-600 text-center leading-relaxed font-serif w-full">
                    <span class="text-rose-600 border-b border-rose-200 pb-0.5 px-1 block truncate">${title}</span>
                    <span class="text-[11px] opacity-80 mt-3 block font-sans tracking-wide text-gray-500">⚠️ 请尽快商议公关对策</span>
                </div>
            </div>
            `;
      } else if (msg.msgType === 'invite_card') {
            // 🌟 完美融入架构：利用底层气泡包装器，只需指定宽度和透明底色！头像和时间会自动对齐！
            maxWidthClass = 'max-w-[240px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            contentHtml = `
            <div class="w-[200px] bg-rose-50 rounded-[18px] border border-rose-100 p-4 shadow-sm select-none flex flex-col items-center justify-center">
                <div class="flex items-center space-x-2 text-[#881337] mb-2.5 mt-1">
                    <i data-lucide="mail" class="w-5 h-5 opacity-80 shrink-0"></i>
                    <span class="text-[14px] font-black tracking-wide leading-snug text-center">${boundPersona.name}邀请你<br>开通情侣空间</span>
                </div>
                <div class="flex items-center space-x-1.5 text-rose-400 mb-1">
                    <span class="text-[10px] font-bold">等待对方接受邀请...</span>
                </div>
            </div>
            `;
        } else if (msg.msgType === 'accept_card') {
            // 🌟 同理，极其干净的接收卡片
            maxWidthClass = 'max-w-[200px]';
            bubbleClass = 'bg-transparent shadow-none p-0 m-0 border-0'; 
            bubbleStyle = ''; 
            contentHtml = `
            <div class="w-[200px] bg-rose-50 rounded-[18px] border border-rose-100 p-4 shadow-sm select-none flex flex-col items-center justify-center">
                <div class="flex items-center space-x-2 text-[#881337] mb-2.5 mt-1">
                    <i data-lucide="mail-check" class="w-6 h-6 shrink-0"></i>
                    <span class="text-[14px] font-black tracking-wide leading-snug text-center">已接受邀请</span>
                </div>
                <div class="flex items-center space-x-1.5 text-rose-400 mb-1">
                    <span class="text-[10px] font-bold">快去看看吧！</span>
                </div>
            </div>
            `;
        // --- 🌟 艺术级进化：渲染 iOS 风高级感纪念日卡片 ---
              } else if (msg.msgType === 'anniversary_card') {
                const cd = msg.cardData || {};
                const anni = (store.anniversaries || []).find(a => String(a.id) === String(cd.anniId));
                
                maxWidthClass = 'max-w-[280px] w-full';
                bubbleClass = 'bg-transparent shadow-none p-0 border-0'; 
                bubbleStyle = ''; 
                
                if (!anni) {
                    contentHtml = `<div class="text-[12px] text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">该纪念日卡片已失效</div>`;
                } else {
                    const nth = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
                    
                    // 🌟 提取天数数字
                    const numMatch = cd.daysLeftText.match(/\d+/);
                    const daysNum = numMatch ? numMatch[0] : '';
                    const isToday = cd.daysLeftText.includes('今天');

                    contentHtml = `
                    <div class="relative z-10 cursor-pointer active:scale-95 transition-transform w-full" onclick="event.stopPropagation(); window.actions.showAnniDetail('${anni.id}')">
                      <div class="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm flex flex-col items-center w-full">
                        
                        <div class="flex items-center space-x-3.5 w-full mb-3">
                            <div class="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center shrink-0">
                                <i data-lucide="heart" class="w-5 h-5 text-rose-400 fill-rose-100"></i>
                            </div>
                            <div class="flex flex-col text-left">
                                <span class="text-[15px] font-bold text-gray-800">专属纪念日提醒</span>
                                <span class="text-[11px] text-gray-400 tracking-wider">ANNIVERSARY</span>
                            </div>
                        </div>

                        <div class="h-px w-full bg-gray-100 mb-3.5"></div>

                        <div class="flex flex-col items-center w-full">
                            <span class="text-[15px] font-bold text-gray-700">${anni.name}</span>
                            
                            ${isToday ? 
                                `<span class="text-[36px] font-black text-red-500 tracking-tight leading-none py-3 drop-shadow-sm">今天</span>` : 
                                `<div class="w-full flex justify-center items-baseline py-3">
                                    <span class="text-[13px] font-bold text-gray-400 mr-2 tracking-widest">倒计时</span>
                                    <span class="text-[38px] font-black ${cd.statusColor} tracking-tight leading-none drop-shadow-sm">${daysNum}<span class="text-[20px] ml-1">天</span></span>
                                 </div>`
                            }
                            
                            <span class="text-[13px] font-medium text-gray-500">${cd.origDateStr}</span>
                            
                            <span class="text-[11px] text-gray-400 font-medium mt-1">
                                这是我们第 ${nth(cd.count)} 次过这个纪念日
                            </span>
                        </div>

                      </div>
                    </div>
                    `;
                }
      } else if (msg.msgType === 'growth_achievement_card') {
                    const cd = msg.cardData || {};
                    
                    maxWidthClass = 'max-w-[280px] w-full';
                    bubbleClass = 'bg-transparent shadow-none p-0 border-0'; 
                    bubbleStyle = ''; 
                    
                    // 🌟 动态计算勋章级别和颜色
                    let iconHtml = '<i data-lucide="medal" class="w-6 h-6 text-orange-500 fill-orange-200"></i>';
                    let bgGradient = 'from-orange-50 to-amber-50 border-orange-100';
                    let textColor = 'text-orange-500';
                    let titleText = '共同成长 · 成就达成';

                    // 100天的最高规格排面！
                    if (cd.days >= 100) {
                        iconHtml = '<i data-lucide="crown" class="w-6 h-6 text-yellow-600 fill-yellow-300"></i>';
                        bgGradient = 'from-yellow-50 to-amber-100 border-yellow-200';
                        textColor = 'text-yellow-600';
                        titleText = '共同成长 · 百日里程碑';
                    }

                    // 🌟 卡片本身强制居中，营造“系统全局播报”的史诗感
                    contentHtml = `
                    <div class="relative z-10 w-full flex justify-center mt-2 mb-2">
                      <div class="bg-gradient-to-br ${bgGradient} border rounded-[24px] p-5 shadow-lg flex flex-col items-center w-full relative overflow-hidden">
                        
                        <div class="absolute -right-4 -top-4 w-16 h-16 bg-white/40 rounded-full blur-xl pointer-events-none"></div>

                        <div class="flex items-center justify-center space-x-2 w-full mb-3 relative z-10">
                            <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm border border-white/50">
                                ${iconHtml}
                            </div>
                            <div class="flex flex-col text-left">
                                <span class="text-[14px] font-black text-gray-800 tracking-wide">${titleText}</span>
                                <span class="text-[10px] font-black text-gray-400 tracking-widest font-serif">ACHIEVEMENT UNLOCKED</span>
                            </div>
                        </div>

                        <div class="h-px w-full bg-black/5 my-3 relative z-10"></div>

                        <div class="flex flex-col items-center w-full relative z-10">
                            <span class="text-[12px] font-bold text-gray-500 mb-1">累计完美打卡</span>
                            <div class="flex items-baseline mb-2">
                                <span class="text-[46px] font-black ${textColor} tracking-tighter leading-none drop-shadow-sm font-serif">${cd.days}</span>
                                <span class="text-[15px] font-bold ${textColor} ml-1">天</span>
                            </div>
                            <span class="text-[12px] font-medium text-gray-600 text-center px-1 leading-relaxed">
                                ${cd.desc || '你们的坚持让爱与自律共同生长！'}
                            </span>
                        </div>

                      </div>
                    </div>
                    `;
      } else if (msg.msgType === 'emoji') {
        maxWidthClass = 'max-w-[25%]';
        bubbleClass = 'bg-transparent shadow-none'; 
        bubbleStyle = ''; 
        contentHtml = `<img src="${msg.imageUrl}" class="w-full h-auto object-contain cursor-pointer drop-shadow-md" />`;
      } else {
        bubbleClass = `mc-bubble-text px-4 py-2.5 rounded-xl shadow-sm leading-relaxed overflow-wrap break-words text-[15px] ${msg.isMe ? 'bg-[#95ec69] text-black rounded-tr-sm' : 'bg-white text-black rounded-tl-sm'}`;
        bubbleStyle = '';
        const quoteHtml = msg.quote ? `<div class="text-[11px] bg-black/5 rounded-md px-2 py-1.5 mb-1.5 border-l-2 border-black/20 break-words whitespace-pre-wrap leading-relaxed" style="color: inherit; opacity: 0.75;">${msg.quote.sender}：${msg.quote.text}</div>` : '';
        contentHtml = quoteHtml + msg.text;
      }

      let menuHtml = '';
      if (wxState.activeMenuMsgId === msg.id) {
        menuHtml = `
          <div class="mc-context-menu absolute z-[100] bottom-[105%] ${msg.isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'} bg-[#2c2c2c] text-white rounded-[12px] px-1 py-0.5 flex items-center shadow-2xl animate-in zoom-in-95 duration-150 whitespace-nowrap border border-white/10" onclick="event.stopPropagation()" ontouchstart="event.stopPropagation()">
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer active:bg-white/20 rounded-lg transition-colors" onclick="window.wxActions.quoteMessage(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.quoteMessage(${msg.id})"><i data-lucide="quote" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">引用</span></div>
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer active:bg-white/20 rounded-lg transition-colors" onclick="window.wxActions.favoriteMessage(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.favoriteMessage(${msg.id})"><i data-lucide="star" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">收藏</span></div>
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer active:bg-white/20 rounded-lg transition-colors" onclick="window.wxActions.startMultiSelect(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.startMultiSelect(${msg.id})"><i data-lucide="check-square" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">多选</span></div>
            ${msg.isMe ? `<div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer active:bg-white/20 rounded-lg transition-colors" onclick="window.wxActions.recallMessage(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.recallMessage(${msg.id})"><i data-lucide="undo-2" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">撤回</span></div>` : ''}
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer active:bg-white/20 rounded-lg transition-colors" onclick="window.wxActions.openEditMessageModal(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.openEditMessageModal(${msg.id})"><i data-lucide="edit" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">编辑</span></div>
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer active:bg-white/20 rounded-lg transition-colors" onclick="window.wxActions.deleteMessage(${msg.id})" ontouchend="event.preventDefault(); window.wxActions.deleteMessage(${msg.id})"><i data-lucide="trash-2" class="w-[18px] h-[18px] mb-1 text-red-400"></i><span class="text-[10px] text-red-400 scale-90">删除</span></div>
          </div>
        `;
      }

      // 🌟 性能优化：只有最后 3 条消息才触发浮出动画，历史记录直接静态渲染，极大减轻手机负担！
      const animationClass = (index >= array.length - 3) ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : '';
      return `${timeHtml}
      <div class="mc-msg-row ${msg.isMe ? 'mc-is-me' : 'mc-is-ai'} flex items-start w-full ${animationClass} mb-3 ${wxState.isMultiSelecting ? 'pl-2 cursor-pointer' : ''}" ${wxState.isMultiSelecting ? `onclick="window.wxActions.toggleSelectMsg(${msg.id})"` : ''}>
        
        ${checkboxHtml}
        
        <div class="flex-1 flex items-start ${msg.isMe ? 'justify-end' : 'justify-start'} pointer-events-${wxState.isMultiSelecting ? 'none' : 'auto'}">
          ${!msg.isMe ? `<div class="mc-avatar w-10 h-10 bg-[var(--bubble-char-bg)] rounded-full overflow-hidden flex items-center justify-center text-xl mr-2 shadow-sm flex-shrink-0 cursor-pointer" onclick="window.wxActions.handleAvatarClick('${senderChar?.id}')" style="font-family: var(--system-font)">${getVidHtml(senderAvatar, '', false)}</div>` : ''}
          
          ${msg.isMe && msg.isIntercepted ? `<div class="self-center mr-2 w-[20px] h-[20px] rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-[13px] shadow-sm flex-shrink-0" title="消息已发出，但被对方拒收了">!</div>` : ''}
          
          <div class="relative inline-flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} ${maxWidthClass}"
               onmousedown="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchStart(${msg.id})`}" 
               onmouseup="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}" 
               onmouseleave="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}" 
               ontouchstart="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchStart(${msg.id})`}" 
               ontouchend="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}"
               ontouchmove="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchMove()`}"
               onmousemove="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchMove()`}">
               
            ${groupNameHtml}
            ${quoteHtmlOut}
            <div class="mc-bubble ${bubbleClass}" style="${bubbleStyle}">${contentHtml}</div>
            ${voiceTextOut}
            ${menuHtml}
          </div>
          
          ${!msg.isMe && msg.isIntercepted ? `<div class="self-center ml-2 w-[20px] h-[20px] rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-[13px] shadow-sm flex-shrink-0" title="消息已被你拒收">!</div>` : ''}
          
          ${msg.isMe ? `<div class="mc-avatar w-10 h-10 bg-white border border-gray-100 overflow-hidden rounded-full flex items-center justify-center text-xl ml-2 shadow-sm flex-shrink-0" style="font-family: var(--system-font)">${getVidHtml(myAvatar, myAvatar, '')}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const plusMenuHtml = [
      { id: 'mc-tool-reroll', icon: 'refresh-cw', label: '重roll回复', action: 'window.wxActions.rerollReply()', hideInGroup: false },
      { id: 'mc-tool-extract', icon: 'brain-circuit', label: '提取记忆', action: "window.wxActions.openExtractMemoryModal()", hideInGroup: true },
      { id: 'mc-tool-transfer', icon: 'credit-card', label: '转账', action: "window.wxActions.openVirtualModal('transfer')", hideInGroup: false },
      { id: 'mc-tool-location', icon: 'map-pin', label: '发送定位', action: "window.wxActions.openVirtualModal('location')", hideInGroup: false },
      { id: 'mc-tool-voicecall', icon: 'phone', label: '语音通话', action: "window.wxActions.startCall('voice')", hideInGroup: true },
      { id: 'mc-tool-videocall', icon: 'video', label: '视频通话', action: "window.wxActions.startCall('video')", hideInGroup: true },
      { id: 'mc-tool-offline', icon: 'coffee', label: '线下剧情', action: "window.wxActions.enterOffline()", hideInGroup: false },
      { id: 'mc-tool-read', icon: 'book-open', label: '一起看书', action: "window.wxActions.openBookSelectModal()", hideInGroup: true }
    ].filter(item => !(isGroup && item.hideInGroup)).map(item => `
      <div class="mc-tool-item flex flex-col items-center justify-center space-y-1.5 cursor-pointer active:scale-95 transition-transform" onclick="${item.action}" ontouchend="event.preventDefault(); ${item.action}">
        <div class="${item.id} w-14 h-14 flex items-center justify-center">
          <i data-lucide="${item.icon}" class="text-gray-600" style="width: 28px; height: 28px;"></i>
        </div>
        <span class="text-[11px] font-bold text-gray-500">${item.label}</span>
      </div>
    `).join('');

    const virtualModalHtml = wxState.virtualModalType !== 'none' ? `
      <div class="absolute inset-0 bg-black/40 z-50 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm">
        <div class="bg-white w-full rounded-[24px] p-5 shadow-2xl animate-in zoom-in-95 duration-200">
          ${wxState.virtualModalType === 'transfer' ? `
            <h3 class="font-bold text-gray-800 mb-4 flex items-center justify-center"><i data-lucide="credit-card" class="mr-2 text-orange-500" style="width:20px; height:20px;"></i>发起转账</h3>
            <div class="flex items-center text-4xl font-bold border-b border-gray-200 pb-2 mb-4 text-gray-800"><span class="mr-2 text-2xl">¥</span><input type="number" id="transfer-amount" class="flex-1 outline-none bg-transparent" placeholder="0.00" /></div>
            <input type="text" id="transfer-note" class="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none text-sm mb-6 font-bold" placeholder="转账说明（选填，默认：转账）" />
          ` : `
            <h3 class="font-bold text-gray-800 mb-2 flex items-center">
              <i data-lucide="${wxState.virtualModalType === 'image' ? 'camera' : (wxState.virtualModalType === 'location' ? 'map-pin' : 'mic')}" class="mr-2 text-blue-500" style="width:20px; height:20px;"></i>
              ${wxState.virtualModalType === 'image' ? '拍摄虚拟照片' : (wxState.virtualModalType === 'location' ? '发送虚拟定位' : '录制语音消息')}
            </h3>
            <p class="text-[10px] text-gray-500 mb-4">
              ${wxState.virtualModalType === 'image' ? '详细描写照片画面。' : (wxState.virtualModalType === 'location' ? '输入你想发送的具体位置名称。' : '输入你想要用语音发送的文字内容。')}
            </p>
            <textarea id="virtual-input" rows="4" class="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none text-sm mb-4 resize-none focus:border-blue-500 transition-colors" placeholder="请输入内容..."></textarea>
          `}
          <div class="flex space-x-3">
            <button onclick="window.wxActions.closeVirtualModal()" class="flex-1 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl active:bg-gray-200">取消</button>
            <button onclick="window.wxActions.sendVirtualMedia()" class="flex-1 py-2.5 ${wxState.virtualModalType === 'transfer' ? 'bg-[#f98a2e] active:bg-orange-600' : 'bg-blue-500 active:bg-blue-600'} text-white font-bold rounded-xl shadow-md">发送</button>
          </div>
        </div>
      </div>
    ` : '';
    let transferDetailHtml = '';
    if (wxState.activeTransferId) {
      const tMsg = chatData.messages.find(m => m.id === wxState.activeTransferId);
      // 🌟 安全提取：这里变量名叫 chatData，并且我们要去联系人列表里揪出这名角色
            const targetChar = store.contacts.find(c => c.id === chatData.charId) || {};
            const displayName = chatData.charRemark || targetChar.name || '对方';
      if (tMsg) {
        const isMe = tMsg.isMe, state = tMsg.transferState || 'pending';
        // 🌟 核心防爆：转账卡片的发送人直接读取 tMsg.sender，完美兼容群聊！
        transferDetailHtml = `
          <div class="absolute inset-0 bg-black/40 z-50 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm">
            <div class="bg-[#f6f6f6] w-full max-w-[300px] rounded-[20px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
              
              <div class="bg-[#f98a2e] flex flex-col items-center pt-8 pb-6 px-4 text-white relative">
                <div class="absolute top-3 left-3 cursor-pointer p-1 active:opacity-50" onclick="window.wxActions.closeTransferModal()">
                  <i data-lucide="x" style="width:22px; height:22px;"></i>
                </div>
                <div class="w-12 h-12 bg-[#fca253] rounded-full flex items-center justify-center mb-3 shadow-inner">
                  <i data-lucide="arrow-right-left" style="width:24px; height:24px;"></i>
                </div>
                <span class="text-[13px] font-bold opacity-90 mb-1">
                  ${isMe ? '你发起的转账' : `来自 ${displayName} 的转账`}
                </span>
                <span class="text-3xl font-bold font-mono mt-1 mb-2">¥${tMsg.transferData.amount}</span>
                <div class="text-[13px] text-white/90 bg-transparent px-3 py-1.5 rounded-full mt-1 mb-2 font-medium break-all text-center max-w-[80%]">
                  ${tMsg.transferData.note || '转账'}
                </div>
              </div>
              
              <div class="bg-white p-5 flex flex-col items-center justify-center min-h-[120px]">
                ${state === 'pending' ? (
                  !isMe ? `
                    <button onclick="window.wxActions.handleTransferAction('accept')" class="w-full py-3 bg-[#07c160] text-white font-bold rounded-xl active:bg-green-600 mb-4 flex justify-center items-center shadow-sm transition-colors">
                      <i data-lucide="check-circle" class="mr-1" style="width:18px;"></i> 确认接收
                    </button>
                    <span onclick="window.wxActions.handleTransferAction('return')" class="text-[11px] text-gray-400 font-bold cursor-pointer hover:text-gray-600 active:opacity-70 transition-colors">退还给对方</span>
                  ` : `
                    <span class="text-sm font-bold text-gray-400 flex flex-col items-center"><i data-lucide="clock" class="mb-2 opacity-50"></i>等待对方收款...</span>
                  `
                ) : `
                  <span class="text-sm font-bold text-gray-500 flex flex-col items-center">
                    <i data-lucide="${state === 'accepted' ? 'check-circle' : 'corner-up-left'}" class="mb-2 text-gray-400"></i>
                    ${state === 'accepted' ? '转账已完成' : '转账已退回'}
                  </span>
                `}
              </div>
              
            </div>
          </div>
        `;
      }
    }

    return `
      <div id="mc-chat-screen" class="w-full h-full flex flex-col ${wxState.noAnimate ? '' : 'animate-in slide-in-from-right-4 duration-200'} relative z-0" style="background-color: var(--chat-bg-color); background-image: var(--chat-bg-image); background-size: cover; background-position: center;">
        
        <style>
          ${chatData.isGroup ? (chatData.customCSS || '') : (char?.customCSS || '')}
          ${char?.bgImage ? `:root { --chat-bg-image: url('${char.bgImage}'); }` : (store.bgImage ? `:root { --chat-bg-image: url('${store.bgImage}'); }` : '')}
          
          /* 🌟 核心性能优化 1：强制开启 iOS 原生丝滑滚动 */
          .hide-scrollbar { -webkit-overflow-scrolling: touch; }
          
          /* 🌟 核心性能优化 2：仅对滚动容器进行 GPU 加速，释放气泡显存，解决卡顿和层级穿透 */
          #chat-scroll { transform: translateZ(0); }
          
          /* 🌟 核心性能优化 3：移动端自适应降级毛玻璃，拯救手机发烫和滑动卡顿 */
          @media (max-width: 768px) {
             .backdrop-blur-md, .backdrop-blur-2xl, .backdrop-blur-xl {
                 backdrop-filter: blur(10px) !important;
                 -webkit-backdrop-filter: blur(10px) !important;
             }
          /* 🌟 物理免疫 iOS 强制放大 BUG！强制所有输入框字体不小于 16px！ */
             input, textarea, select { font-size: 16px !important; }
          }
        </style>

        <div class="absolute inset-0 z-[-1]" style="background: var(--chat-bg-overlay); pointer-events: none;"></div>
        
        <div class="mc-topbar backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-10 sticky top-0 transition-colors ${wxState.isMultiSelecting ? 'bg-[#f3f3f3]' : 'bg-gray-100/90'}">
          ${(() => {
            if (wxState.isMultiSelecting) {
              return `
                <div class="cursor-pointer text-gray-800 w-1/4 text-[15px]" onclick="window.wxActions.cancelMultiSelect()">取消</div>
                <span class="flex-1 text-center font-bold text-gray-800 text-[16px]">已选择 ${wxState.selectedMsgIds.length} 项</span>
                <div class="w-1/4"></div>
              `;
            } else {
              // 🌟 动态监控顶栏打字状态
              let isAnyTyping = false;
              let typingText = '';
              let titleText = isGroup ? `${chatData.groupName} (${chatData.memberIds.length})` : (chatData.charRemark || char?.name);
              
              if (isGroup) {
                  // 🌟 核心修复 5：群聊顶栏精确读取当前群的状态
                  const typingMembers = wxState.typingStatus && wxState.typingStatus[chatData.charId];
                  if (Array.isArray(typingMembers) && typingMembers.length > 0) {
                      isAnyTyping = true;
                      typingText = typingMembers.map(id => store.contacts.find(c=>c.id===id)?.name).join('、') + '输入中...';
                  }
              } else {
                  // 🌟 单聊顶栏精确读取当前单聊的状态
                  if (wxState.typingStatus && wxState.typingStatus[chatData.charId]) {
                      isAnyTyping = true;
                      typingText = '对方正在输入...';
                  }
              }

              return `
                <div class="mc-btn-back flex items-center cursor-pointer text-gray-800 w-1/4" onclick="window.wxActions.closeChat()"><i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i></div>
                <span class="mc-title flex-1 font-bold text-gray-800 text-[17px] text-center truncate px-2 transition-all duration-300 ${isAnyTyping ? 'opacity-60 animate-pulse text-gray-400' : ''}">${isAnyTyping ? typingText : titleText}</span>
                <div class="mc-btn-more w-1/4 flex justify-end"><i data-lucide="more-horizontal" class="text-gray-800 cursor-pointer active:scale-90" style="width: 24px; height: 24px;" onclick="window.wxActions.openSettings()"></i></div>
              `;
            }
          })()}
        </div>
        
        <div id="chat-scroll" class="mc-msg-list flex-1 p-4 overflow-y-auto hide-scrollbar space-y-4 flex flex-col pb-6" onclick="window.wxActions.closeMenuIfOpen()" ontouchstart="window.wxActions.closeMenuIfOpen()">
          ${messagesHtml}
        </div>

        ${wxState.isMultiSelecting ? `
          <div class="px-6 py-3 pb-8 border-t border-gray-200/50 z-20 relative bg-[#f3f3f3] flex justify-between items-center text-gray-600 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom-2">
            <div class="flex flex-col items-center cursor-pointer hover:text-[#07c160] transition-colors active:scale-90" onclick="window.wxActions.batchAction('逐条转发')"><i data-lucide="share" class="w-[22px] h-[22px] mb-1"></i><span class="text-[10px]">逐条转发</span></div>
            <div class="flex flex-col items-center cursor-pointer hover:text-[#07c160] transition-colors active:scale-90" onclick="window.wxActions.batchAction('合并转发')"><i data-lucide="message-square-plus" class="w-[22px] h-[22px] mb-1"></i><span class="text-[10px]">合并转发</span></div>
            <div class="flex flex-col items-center cursor-pointer hover:text-yellow-500 transition-colors active:scale-90" onclick="window.wxActions.batchAction('收藏')"><i data-lucide="star" class="w-[22px] h-[22px] mb-1"></i><span class="text-[10px]">收藏</span></div>
            <div class="flex flex-col items-center cursor-pointer hover:text-red-500 transition-colors active:scale-90" onclick="window.wxActions.deleteSelected()"><i data-lucide="trash-2" class="w-[22px] h-[22px] mb-1"></i><span class="text-[10px]">删除</span></div>
          </div>
        ` : `
          <div class="mc-bottombar bg-gray-50 px-3 py-2 pb-6 border-t border-gray-200/60 z-20 relative transition-all duration-200">

            ` + (() => {
              if (!wxState.quoteMsgId) return '';
              const qm = chatData.messages.find(m => m.id === wxState.quoteMsgId);
              if (!qm) return '';
              const shortT = qm.text.length > 20 ? qm.text.substring(0, 20) + '...' : qm.text;
              return '<div class="mc-quote-box mb-2 bg-black/5 rounded-lg px-3 py-2 flex items-center justify-between border border-black/10 shadow-sm animate-in fade-in slide-in-from-bottom-2">' +
                '<span class="text-[12px] text-gray-500 truncate flex-1 opacity-80">引用 ' + qm.sender + '：' + shortT + '</span>' +
                '<div class="cursor-pointer ml-3 p-1 active:scale-90 opacity-60 hover:opacity-100" onclick="window.wxActions.cancelQuote()"><i data-lucide="x-circle" style="width:16px; height:16px;"></i></div>' +
              '</div>';
            })() + `

            <div class="flex items-center space-x-3 mb-2 px-1">
              <div class="flex-1 bg-white rounded-[20px] flex items-center border border-gray-200/60 px-2 py-0.5">
                <input type="text" id="wx-input" onkeydown="if(event.key==='Enter') window.wxActions.sendMessage()" class="mc-input flex-1 h-[38px] py-1.5 px-2 outline-none text-[15px] bg-transparent text-gray-800 placeholder-gray-400" placeholder="回车发送消息..." />
              </div>
              <button class="mc-btn-ai w-[40px] h-[40px] flex items-center justify-center bg-transperant rounded-full text-gray-500 active:scale-90 transition-transform flex-shrink-0" title="获取回复" onclick="window.wxActions.getReply()"><i data-lucide="sparkles" style="width: 25px; height: 25px;"></i></button>
            </div>

            <div class="flex justify-between items-center px-5 mt-3 mb-1">
               <div class="mc-btn-voice flex flex-col items-center cursor-pointer active:scale-90 transition-transform group" onclick="window.wxActions.openVirtualModal('voice')">
                 <i data-lucide="mic" class="text-gray-500 group-hover:text-gray-700" style="width: 26px; height: 26px;"></i>
               </div>
               
               <div class="mc-btn-image flex flex-col items-center cursor-pointer active:scale-90 transition-transform group" onclick="document.getElementById('real-image-input').click()">
                 <i data-lucide="image" class="text-gray-500 group-hover:text-gray-700" style="width: 26px; height: 26px;"></i>
               </div>
               
               <div class="mc-btn-camera flex flex-col items-center cursor-pointer active:scale-90 transition-transform group" onclick="window.wxActions.openVirtualModal('image')">
                 <i data-lucide="camera" class="text-gray-500 group-hover:text-gray-700" style="width: 26px; height: 26px;"></i>
               </div>
               
               <div class="mc-btn-emoji flex flex-col items-center cursor-pointer active:scale-90 transition-transform group" onclick="window.wxActions.toggleEmojiMenu()">
                 <i data-lucide="smile" class="transition-colors ${wxState.showEmojiMenu ? 'text-[#07c160]' : 'text-gray-500 group-hover:text-gray-700'}" style="width: 26px; height: 26px;"></i>
               </div>
               
               <div class="mc-btn-plus flex flex-col items-center cursor-pointer active:scale-90 transition-transform group" onclick="window.wxActions.togglePlusMenu()">
                 <i data-lucide="plus-circle" class="transition-all duration-200 ${wxState.showPlusMenu ? 'rotate-45 text-[#07c160]' : 'text-gray-500 group-hover:text-gray-700'}" style="width: 26px; height: 26px;"></i>
               </div>
            </div>

            <div class="mc-tools-panel ${wxState.showPlusMenu ? 'grid' : 'hidden'} pt-4 grid-cols-4 gap-4 animate-in slide-in-from-bottom-2 fade-in border-t border-gray-200/50 mt-3">
              ${plusMenuHtml}
            </div>
            
            ` + (() => {
              if (!wxState.showEmojiMenu) return '';
              let groupedEmojis = [];

              (store.emojiLibs || []).forEach(lib => {
                  if (lib.emojis && lib.emojis.length > 0) {
                      groupedEmojis.push({
                          name: lib.name,
                          emojis: lib.emojis.map(e => typeof e === 'string' ? {url: e, name: '表情'} : e)
                      });
                  }
              });

              let eHtml = '<div class="mc-emoji-panel flex flex-col h-72 bg-[#f3f3f3] mx-[-12px] px-0 pt-0 pb-6 animate-in slide-in-from-bottom-2 fade-in border-t border-gray-200 mt-2">';
              
              if (groupedEmojis.length === 0) {
                 return eHtml + '<div class="text-center text-gray-400 mt-10 text-[12px] font-bold tracking-widest">请在“我”页面导入 JSON 或添加表情哦</div></div>';
              }

              eHtml += '<div class="mc-emoji-tabs flex overflow-x-auto hide-scrollbar bg-[#f6f6f6] border-b border-gray-200 px-3 py-2 space-x-3 items-center shadow-sm z-10">';
              groupedEmojis.forEach((group, idx) => {
                 const isActive = wxState.activeEmojiTab === idx;
                 eHtml += '<div class="mc-emoji-tab whitespace-nowrap px-3 py-1.5 rounded-full text-[13px] font-bold cursor-pointer transition-all ' + (isActive ? 'bg-white text-gray-800 shadow-sm border border-gray-100' : 'bg-transparent text-gray-400 border border-transparent hover:bg-gray-200/50') + '" onclick="window.wxActions.switchEmojiTab(' + idx + ')">' + group.name + '</div>';
              });
              eHtml += '</div>';

              const activeGroup = groupedEmojis[wxState.activeEmojiTab] || groupedEmojis[0];
              eHtml += '<div class="mc-emoji-list flex-1 overflow-y-auto hide-scrollbar p-4">';
              eHtml += '<div class="grid grid-cols-4 gap-x-3 gap-y-4">'; 
              activeGroup.emojis.forEach(ep => {
                 const shortName = ep.name.length > 5 ? ep.name.substring(0,5) + '...' : ep.name;
                 eHtml += '<div class="mc-emoji-item flex flex-col items-center cursor-pointer active:scale-95 transition-transform" onclick="window.wxActions.sendEmoji(\'' + ep.url + '\', \'' + ep.name + '\')">';
                 eHtml += '<div class="w-[3.5rem] h-[3.5rem] rounded-[12px] overflow-hidden flex items-center justify-center p-1"><img src="' + ep.url + '" class="w-full h-full object-contain drop-shadow-sm" /></div>';
                 eHtml += '<span class="text-[10px] text-gray-500 mt-1.5 truncate w-full text-center">' + shortName + '</span>';
                 eHtml += '</div>';
              });
              eHtml += '</div></div></div>';
              return eHtml;
            })() + `
            
          </div>
        `}
        
        ${virtualModalHtml}${transferDetailHtml}
        <input type="file" id="real-image-input" accept="image/*" class="hidden" onchange="window.wxActions.handleImageUpload(event)" />
        
        ${wxState.showForwardModal ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-end justify-center animate-in fade-in backdrop-blur-sm" onclick="window.wxActions.closeForwardModal()">
            <div class="mc-modal-content bg-[#f3f3f3] w-full max-h-[75vh] rounded-t-[24px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 flex flex-col" onclick="event.stopPropagation()">
              <div class="bg-white px-4 py-4 flex justify-between items-center border-b border-gray-100">
                <div class="cursor-pointer active:opacity-50 p-1" onclick="window.wxActions.closeForwardModal()"><i data-lucide="chevron-left" class="w-6 h-6 text-gray-600"></i></div>
                <span class="absolute left-1/2 -translate-x-1/2 font-bold text-gray-800 text-[16px]">选择发送给谁</span>
                <div class="w-8"></div>
              </div>
              <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar pb-10">
                <p class="text-[11px] text-gray-400 font-bold mb-2 px-1 tracking-widest text-center">${wxState.forwardType === 'single' ? '逐条转发' : '合并为一条聊天记录转发'}</p>
                ${store.contacts.map(c => `
                  <div class="bg-white rounded-[16px] p-3 flex items-center shadow-sm cursor-pointer active:scale-95 border border-transparent hover:border-[#07c160]/30 transition-all" onclick="window.wxActions.confirmForward('${c.id}')">
                    <div class="w-12 h-12 rounded-[12px] overflow-hidden bg-gray-100 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm border border-gray-100">${getVidHtml(c.avatar, '', false)}</div>
                    <div class="flex-1 flex flex-col overflow-hidden">
                      <span class="text-[15px] font-bold text-gray-800 truncate">${c.name}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        ${wxState.editMsgData ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm" onclick="window.wxActions.closeEditMessageModal()">
            <div class="mc-modal-content bg-[#f6f6f6] w-full rounded-[24px] overflow-hidden shadow-2xl flex flex-col" onclick="event.stopPropagation()">
               <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm">
                 <span class="font-black text-gray-800 text-[16px] flex items-center"><i data-lucide="edit-3" class="text-blue-500 mr-2 w-5 h-5"></i>编辑消息</span>
                 <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.closeEditMessageModal()"></i>
               </div>
               <div class="p-5 flex flex-col space-y-4">
                  <div class="flex flex-wrap items-center gap-1 border-b border-gray-100/80">
                     <span class="text-[12px] font-bold text-gray-400 tracking-widest w-full">格式修复</span>
                     <button class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-500 text-[11px] font-bold rounded-md active:scale-95 transition-all" onclick="window.wxActions.quickFormatEdit('virtual_image')">照片</button>
                     <button class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-500 text-[11px] font-bold rounded-md active:scale-95 transition-all" onclick="window.wxActions.quickFormatEdit('voice')">语音</button>
                     <button class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-500 text-[11px] font-bold rounded-md active:scale-95 transition-all" onclick="window.wxActions.quickFormatEdit('location')">定位</button>
                     <button class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-500 text-[11px] font-bold rounded-md active:scale-95 transition-all" onclick="window.wxActions.quickFormatEdit('emoji')">表情包</button>
                     <button class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-500 text-[11px] font-bold rounded-md active:scale-95 transition-all" onclick="window.wxActions.quickFormatEdit('transfer')">转账</button>
                     <button class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-500 text-[11px] font-bold rounded-md active:scale-95 transition-all" onclick="window.wxActions.quickFormatEdit('text')">文本</button>
                  </div>
                  <textarea id="edit-msg-textarea" rows="4" class="w-full bg-white border border-gray-100 rounded-xl p-4 outline-none text-[15px] text-gray-800 font-medium leading-loose shadow-sm resize-none hide-scrollbar">${wxState.editMsgData.text}</textarea>
                  <div class="flex space-x-3 pt-2">
                    <button class="flex-1 bg-white border border-gray-200 text-gray-600 font-bold py-3.5 rounded-xl active:bg-gray-50 transition-colors shadow-sm" onclick="window.wxActions.closeEditMessageModal()">取消</button>
                    <button class="flex-1 bg-blue-500 text-white font-bold py-3.5 rounded-xl active:bg-blue-600 transition-colors shadow-md" onclick="window.wxActions.saveEditedMessage()">保存修改</button>
                  </div>
               </div>
            </div>
          </div>
        ` : ''}

        ${wxState.showExtractMemoryModal ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm" onclick="window.wxActions.closeExtractMemoryModal()">
            <div class="mc-modal-content bg-[#f6f6f6] w-full rounded-[24px] overflow-hidden shadow-2xl flex flex-col" onclick="event.stopPropagation()">
               <div class="bg-white px-5 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm">
                 <span class="font-black text-gray-800 text-[16px] flex items-center tracking-wide"><i data-lucide="brain-circuit" class="text-purple-500 mr-2 w-5 h-5"></i>提取记忆片段</span>
                 <i data-lucide="x" class="text-gray-400 cursor-pointer active:scale-90 transition-transform bg-gray-50 p-1 rounded-full w-6 h-6" onclick="window.wxActions.closeExtractMemoryModal()"></i>
               </div>
               <div class="p-5">
               ${wxState.extractMemoryStep === 1 ? `
                 <div class="space-y-5 animate-in slide-in-from-left-4">
                    <div>
                       <span class="text-[12px] font-black text-gray-400 uppercase tracking-widest block mb-2 pl-1">保存至何处？</span>
                       <div class="flex space-x-3">
                          <label class="flex-1 flex flex-col items-center justify-center bg-white border-2 ${wxState.extractMemoryConfig.type === 'core' ? 'border-red-400 text-red-500 shadow-[0_4px_12px_rgba(248,113,113,0.15)]' : 'border-transparent text-gray-400 shadow-sm'} rounded-xl py-3 cursor-pointer transition-all" onclick="window.wxActions.updateExtractConfig('type', 'core')"><i data-lucide="brain-circuit" class="w-6 h-6 mb-1"></i><span class="text-[11px] font-bold">核心记忆 (钢印)</span></label>
                          <label class="flex-1 flex flex-col items-center justify-center bg-white border-2 ${wxState.extractMemoryConfig.type === 'fragment' ? 'border-yellow-400 text-yellow-500 shadow-[0_4px_12px_rgba(250,204,21,0.15)]' : 'border-transparent text-gray-400 shadow-sm'} rounded-xl py-3 cursor-pointer transition-all" onclick="window.wxActions.updateExtractConfig('type', 'fragment')"><i data-lucide="puzzle" class="w-6 h-6 mb-1"></i><span class="text-[11px] font-bold">碎片记忆 (触发)</span></label>
                       </div>
                    </div>
                    <div>
                       <div class="flex justify-between items-end mb-2 pl-1">
                         <span class="text-[12px] font-black text-gray-400 uppercase tracking-widest">总结过去多少条聊天？</span>
                         <span id="extract-msg-count-display" class="text-[16px] font-black text-[#07c160] font-mono">${wxState.extractMemoryConfig.roundCount || 20} 回合</span>
                       </div>
                       <input type="range" min="1" max="100" value="${wxState.extractMemoryConfig.roundCount|| 20}" class="w-full accent-[#07c160] h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" oninput="document.getElementById('extract-msg-count-display').innerText = this.value + ' 回合'; window.wxActions.updateExtractConfig('roundCount', this.value)" />
                    </div>
                    <button class="w-full bg-[#07c160] text-white font-bold py-3.5 rounded-[14px] flex items-center justify-center active:scale-95 transition-transform shadow-[0_4px_15px_rgba(7,193,96,0.3)] mt-2" onclick="window.wxActions.startExtractMemory()">
                      ${wxState.isExtracting ? '<i data-lucide="loader-2" class="animate-spin mr-2 w-5 h-5"></i>飞速阅读中...' : '<i data-lucide="sparkles" class="mr-2 w-5 h-5"></i>开始一键提取'}
                    </button>
                 </div>
               ` : `
                 <div class="space-y-4 animate-in slide-in-from-right-4">
                    <div class="space-y-2">
                      <span class="text-[12px] font-black text-gray-400 uppercase tracking-widest block pl-1">提取结果</span>
                      <textarea id="extract-mem-content" rows="4" class="w-full bg-white border border-gray-100 rounded-xl p-3 outline-none text-[14px] text-gray-800 font-medium leading-relaxed shadow-sm resize-none hide-scrollbar">${wxState.extractMemoryContent}</textarea>
                    </div>
                    ${wxState.extractMemoryConfig.type === 'fragment' ? `
                      <div class="space-y-2 animate-in fade-in">
                        <span class="text-[12px] font-black text-blue-400 uppercase tracking-widest block pl-1">触发词</span>
                        <input id="extract-mem-keywords" value="${wxState.extractMemoryConfig.keywords}" class="w-full bg-blue-50/50 border border-blue-100 rounded-xl p-3 outline-none text-[14px] text-blue-600 font-bold placeholder-blue-300" />
                      </div>
                    ` : ''}
                    <div class="flex space-x-3 pt-2">
                      <button class="flex-1 bg-white border border-gray-200 text-gray-600 font-bold py-3 rounded-xl active:bg-gray-50 transition-colors shadow-sm" onclick="window.wxActions.updateExtractConfig('extractMemoryStep', 1); window.wxActions.openExtractMemoryModal()">重新提取</button>
                      <button class="flex-1 bg-[#07c160] text-white font-bold py-3 rounded-xl active:bg-green-600 transition-colors shadow-md" onclick="window.wxActions.saveExtractedMemory()">保存到记忆</button>
                    </div>
                 </div>
               `}
               </div>
            </div>
          </div>
        ` : ''}

        ${globalRerollModalHtml}

        ${wxState.showInnerThoughtModal ? (() => {
            const charId = wxState.showInnerThoughtModal;
            const chat = store.chats.find(c => c.charId === charId);
            const char = store.contacts.find(c => c.id === charId);
            const thought = chat?.latestInnerThought || { mood: 50, emotion: '平静', lust: 10, status: '正在看着手机', os: '暂时没有什么特别的想法...', hidden: '' };
            
            return `
            <div class="mc-modal-overlay absolute inset-0 z-[200] bg-black/30 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300" onclick="window.wxActions.closeInnerThoughtModal()">
                <div class="mc-modal-content bg-white/95 backdrop-blur-2xl w-full max-h-[70vh] rounded-[32px] shadow-[0_20px_40px_rgba(0,0,0,0.1)] overflow-hidden animate-in zoom-in-95 duration-300 border border-white/60 flex flex-col" onclick="event.stopPropagation()">
                    
                    <div class="px-6 pt-8 pb-4 flex flex-col items-center relative shrink-0">
                        <div class="w-16 h-16 rounded-full overflow-hidden shadow-sm mb-3 border-2 border-white ring-4 ring-gray-50/50">
                            ${getVidHtml(char.avatar, char.avatar, '')}
                        </div>
                        <h3 class="text-[19px] font-extrabold text-gray-800 tracking-wide">${char.name}</h3>
                        <span class="text-[11px] text-gray-400 font-bold tracking-widest uppercase mt-0.5">Inner Thoughts</span>
                    </div>
                    
                    <div class="px-6 pb-2 space-y-5 flex-1 overflow-y-auto hide-scrollbar">
                        <div class="flex justify-between items-center bg-[#f8f9fa] p-4 rounded-[20px] shadow-inner border border-gray-100/50">
                            <div class="flex flex-col w-[45%]">
                               <span class="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider flex items-center"><i data-lucide="smile" class="w-3 h-3 mr-1"></i>当前情绪</span>
                               <span class="text-[15px] font-bold text-gray-800 truncate">${thought.emotion}</span>
                            </div>
                            <div class="w-px h-8 bg-gray-200"></div>
                            <div class="flex flex-col text-right w-[45%]">
                               <span class="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider flex items-center justify-end">当前状态<i data-lucide="activity" class="w-3 h-3 ml-1"></i></span>
                               <span class="text-[14px] font-bold text-gray-700 truncate">${thought.status}</span>
                            </div>
                        </div>
                        
                        <div class="space-y-4 px-1">
                            <div>
                                <div class="flex justify-between text-[11px] font-extrabold mb-1.5"><span class="text-blue-500 tracking-wider">心情指数</span><span class="text-gray-500">${thought.mood || 10}/100</span></div>
                                <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-blue-300 to-blue-500 rounded-full transition-all duration-1000 ease-out" style="width: ${thought.mood || 10}%"></div></div>
                            </div>
                            <div>
                                <div class="flex justify-between text-[11px] font-extrabold mb-1.5"><span class="text-pink-500 tracking-wider">情欲 / 占有欲</span><span class="text-gray-500">${thought.lust || 10}/100</span></div>
                                <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div class="h-full bg-gradient-to-r from-pink-300 to-pink-500 rounded-full transition-all duration-1000 ease-out" style="width: ${thought.lust || 10}%"></div></div>
                            </div>
                        </div>
                        
                        <div class="bg-blue-50/60 p-4 rounded-[20px] relative mt-2 border border-blue-100/50">
                            <i data-lucide="message-circle-heart" class="absolute top-4 right-4 text-blue-200 w-5 h-5"></i>
                            <span class="text-[11px] text-blue-500 font-extrabold mb-1.5 block tracking-wider">内心 OS</span>
                            <p class="text-[14px] text-gray-700 leading-relaxed font-serif italic pr-4">"${thought.os}"</p>
                        </div>
                        
                        ${thought.lust > 50 && thought.hidden ? `
                        <div class="bg-[#1c1c1e] p-4 rounded-[20px] relative mt-3 shadow-lg border border-[#2c2c2e] animate-in slide-in-from-bottom-2 fade-in duration-300 mb-4">
                            <i data-lucide="lock-open" class="absolute top-4 right-4 text-red-500/20 w-5 h-5"></i>
                            <span class="text-[11px] text-red-400 font-extrabold mb-1.5 tracking-wider flex items-center"><i data-lucide="flame" class="w-3.5 h-3.5 mr-1 text-red-500 animate-pulse"></i>阴暗面 / 隐藏冲动</span>
                            <p class="text-[14px] text-gray-200 leading-relaxed font-serif italic shadow-sm pr-4">"${thought.hidden}"</p>
                        </div>
                        ` : '<div class="h-4"></div>'}
                    </div>
                    
                    <div class="border-t border-gray-100/80 p-4 bg-gray-50/30 shrink-0">
                        <button class="w-full py-3.5 bg-white text-gray-800 text-[15px] font-extrabold rounded-[16px] shadow-sm border border-gray-200 active:scale-[0.98] active:bg-gray-50 transition-all" onclick="window.wxActions.closeInnerThoughtModal()">我知道了</button>
                    </div>
                </div>
            </div>
            `;
        })() : ''}
        ${wxState.showBookSelectModal ? `
          <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm" onclick="window.wxActions.closeBookSelectModal()">
            <div class="mc-modal-content bg-[#f3f3f3] w-11/12 max-w-sm max-h-[75vh] rounded-[24px] overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col" onclick="event.stopPropagation()">
              <div class="bg-white px-4 py-4 flex justify-between items-center border-b border-gray-100 shrink-0">
                <div class="cursor-pointer active:opacity-50 p-1" onclick="window.wxActions.closeBookSelectModal()"><i data-lucide="x" class="w-5 h-5 text-gray-500"></i></div>
                <span class="font-bold text-gray-800 text-[16px]">选择要一起读的书</span>
                <div class="w-7"></div>
              </div>
              <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar pb-6">
                ${(store.books || []).map(b => `
                  <div class="bg-white rounded-[16px] p-3 flex items-center shadow-sm cursor-pointer active:scale-95 border border-transparent hover:border-[#07c160]/30 transition-all" onclick="window.wxActions.selectBookForReading('${b.id}')">
                    <div class="w-10 h-12 bg-purple-50 rounded flex items-center justify-center mr-3 border border-purple-100"><i data-lucide="book" class="text-purple-400 w-5 h-5"></i></div>
                    <div class="flex-1 flex flex-col overflow-hidden">
                      <span class="text-[14px] font-bold text-gray-800 truncate">${b.title}</span>
                      <span class="text-[10px] text-gray-400 mt-0.5">上次读到第 ${b.progress + 1} 页</span>
                    </div>
                  </div>
                `).join('')}
                ${(store.books || []).length === 0 ? '<div class="text-center text-gray-400 mt-6 text-[12px] font-bold">书架空空如也，请先去“我”页面上传 txt 吧</div>' : ''}
              </div>
            </div>
          </div>
        ` : ''}

        ${wxState.showBookModeModal ? `
          <div class="absolute inset-0 z-[90] bg-black/40 flex items-center justify-center animate-in fade-in p-5 backdrop-blur-sm" onclick="window.wxActions.closeBookModeModal()">
            <div class="bg-white w-full rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" onclick="event.stopPropagation()">
                <h3 class="font-black text-gray-800 mb-5 text-center text-[18px]">选择陪读模式</h3>
                <div class="space-y-4">
                   <div class="bg-blue-50 border border-blue-100 rounded-[16px] p-4 cursor-pointer active:scale-95 transition-transform shadow-sm" onclick="window.wxActions.startReading('active')">
                      <div class="flex items-center mb-1.5"><i data-lucide="messages-square" class="text-blue-500 w-5 h-5 mr-2"></i><span class="font-bold text-blue-700 text-[15px]">主动探讨模式</span></div>
                      <p class="text-[11px] text-blue-500/80 leading-relaxed">每翻一页，TA 都会主动发起关于书中内容的讨论，极度粘人。</p>
                   </div>
                   <div class="bg-green-50 border border-green-100 rounded-[16px] p-4 cursor-pointer active:scale-95 transition-transform shadow-sm" onclick="window.wxActions.startReading('passive')">
                      <div class="flex items-center mb-1.5"><i data-lucide="coffee" class="text-green-600 w-5 h-5 mr-2"></i><span class="font-bold text-green-700 text-[15px]">安静陪伴模式</span></div>
                      <p class="text-[11px] text-green-600/80 leading-relaxed">TA 会安安静静陪你读，只有当你主动发消息时，TA 才会在上下文里回复你。</p>
                   </div>
                   <div class="bg-purple-50 border border-purple-100 rounded-[16px] p-4 cursor-pointer active:scale-95 transition-transform shadow-sm" onclick="window.wxActions.startReading('listen')">
                      <div class="flex items-center mb-1.5"><i data-lucide="headphones" class="text-purple-500 w-5 h-5 mr-2"></i><span class="font-bold text-purple-700 text-[15px]">听 TA 读模式</span></div>
                      <p class="text-[11px] text-purple-500/80 leading-relaxed">调用语音大模型，让 TA 亲自用声音把书里的内容读给你听。</p>
                   </div>
                </div>
            </div>
          </div>
        ` : ''}

        ${(wxState.reading && wxState.reading.active) ? (() => {
            const book = store.books.find(b => b.id === wxState.reading.bookId);
            if (!book) return '';
            
            if (wxState.reading.isMinimized) {
                // 🍏 灵动岛模式
                return `
                  <div class="absolute top-[85px] left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md text-white px-4 py-2 rounded-full flex items-center space-x-3 z-[70] shadow-[0_10px_25px_rgba(0,0,0,0.2)] cursor-pointer animate-in slide-in-from-top-4 hover:scale-105 active:scale-95 transition-all border border-white/10" onclick="window.wxActions.toggleReadingSize()">
                     <div class="w-6 h-6 bg-[#07c160] rounded-full flex items-center justify-center shadow-inner ${wxState.reading.mode === 'listen' ? 'animate-pulse' : ''}"><i data-lucide="${wxState.reading.mode === 'listen' ? 'headphones' : 'book-open'}" class="w-3.5 h-3.5 text-white"></i></div>
                     <div class="flex flex-col">
                         <span class="text-[13px] font-bold truncate max-w-[120px] tracking-wide">${book.title}</span>
                         <span class="text-[9px] text-white/60 font-mono mt-[1px]">正在阅读 · ${book.progress + 1} / ${book.pages.length}</span>
                     </div>
                  </div>
                `;
            } else {
                // 📖 半屏悬浮阅读模式 (留出底部三分之一)
                return `
                  <div class="absolute top-0 left-0 right-0 h-[65%] z-[60] bg-[#f4f1ea] flex flex-col animate-in slide-in-from-top-4 duration-300 rounded-b-[32px] shadow-[0_20px_40px_rgba(0,0,0,0.15)] border-b border-[#e5e0d8] overflow-hidden" onclick="event.stopPropagation()">
                     <div class="pt-10 pb-3 px-4 flex justify-between items-center border-b border-[#e5e0d8]/60 bg-[#f4f1ea] shrink-0">
                        <div class="cursor-pointer p-2 active:scale-90 opacity-70 bg-black/5 rounded-full" onclick="window.wxActions.toggleReadingSize()"><i data-lucide="minimize-2" class="w-5 h-5 text-gray-800"></i></div>
                        <div class="flex flex-col items-center">
                           <span class="text-[15px] font-bold text-gray-800 truncate max-w-[180px]">${book.title}</span>
                           <span class="text-[10px] text-gray-500 font-mono mt-1 px-2 py-0.5 bg-black/5 rounded-md">${wxState.reading.mode === 'active' ? '主动探讨' : (wxState.reading.mode === 'listen' ? '语音听书' : '安静陪伴')} · ${book.progress + 1} / ${book.pages.length}</span>
                        </div>
                        <div class="cursor-pointer p-2 active:scale-90 opacity-70 text-red-500 bg-red-50 rounded-full" onclick="window.wxActions.stopReading()"><i data-lucide="power" class="w-5 h-5"></i></div>
                     </div>
                     <div id="book-read-scroll" class="flex-1 overflow-y-auto px-6 py-5 text-[16.5px] text-[#333] leading-[1.8] font-serif hide-scrollbar text-justify break-words tracking-wide">
                        ${book.pages[book.progress].split('\n').filter(line => line.trim() !== '').map(line => `<p style="text-indent: 2em; margin-bottom: 0.85em;">${line.trim()}</p>`).join('')}
                     </div>
                     <div class="p-4 pb-5 flex justify-between items-center bg-[#fcfbf9] border-t border-[#e5e0d8]/50 shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
                        <button class="w-20 py-2.5 bg-gray-100 rounded-[12px] text-[13px] font-bold text-gray-600 active:scale-95 transition-transform" onclick="window.wxActions.prevBookPage()">上一页</button>
                        ${wxState.reading.mode === 'listen' ? `
                           <div class="w-12 h-12 bg-[#07c160] rounded-full flex items-center justify-center text-white shadow-[0_8px_20px_rgba(7,193,96,0.3)] animate-pulse">
                              <i data-lucide="headphones" class="w-5 h-5"></i>
                           </div>
                        ` : '<div class="text-[11px] text-gray-400 font-medium tracking-widest px-2">一起阅读中</div>'}
                        <button class="w-20 py-2.5 bg-gray-800 rounded-[12px] text-[13px] font-bold text-white active:scale-95 transition-transform shadow-md" onclick="window.wxActions.nextBookPage()">下一页</button>
                     </div>
                  </div>
                `;
            }
        })() : ''}
      </div>
    `;
}
  // ================= 2. 渲染主界面 (四大标签页) =================
  const chatsHtml = store.chats.map(chat => {
    let name = '', avatarHtml = '', preview = '暂无消息', typingHtml = '';
    
    // 🚨 救命核心代码：这里就是被我不小心让你覆盖掉的段落！现在原封不动加回来了！
    const validMsgs = chat.messages.filter(m => !m.isOffline && !m.isHidden);
    if (validMsgs.length > 0) {
       const rawText = validMsgs[validMsgs.length - 1].text || '';
       const cleanText = rawText.replace(/<[^>]+>/g, '').trim();
       preview = cleanText === '' ? (rawText.includes('<') ? '[网页卡片]' : '[空白消息]') : cleanText.split('\n')[0];
    }

    // 🌟 修复8：展示刚刚、几分钟前
    let timeElap = '最新';
    if (validMsgs.length > 0) {
       timeElap = formatTimeElapsed(validMsgs[validMsgs.length - 1].id);
    }

    if (chat.isGroup) {
        name = chat.groupName || '群聊';
        if (chat.groupAvatar) {
        avatarHtml = `<img src="${chat.groupAvatar}" class="w-full h-full object-cover" />`;
    } else {
        avatarHtml = `<div class="w-full h-full bg-blue-50 text-blue-400 flex items-center justify-center"><i data-lucide="users" class="w-6 h-6"></i></div>`;
    }
        // 🌟 核心修复 3：精确读取当前群聊的打字名单
        const typingMembers = wxState.typingStatus && wxState.typingStatus[chat.charId];
        if (Array.isArray(typingMembers) && typingMembers.length > 0) {
            const tNames = typingMembers.map(id => store.contacts.find(c=>c.id===id)?.name).join('、');
            typingHtml = `<span class="text-gray-400 font-bold tracking-widest animate-pulse">[${tNames} 输入中...]</span>`;
        }
    } else {
        const c = store.contacts.find(x => x.id === chat.charId);
        if (!c) return '';
        name = chat.charRemark || c.name;
        avatarHtml = getVidHtml(c.avatar, '');
        // 🌟 核心修复 3：精确读取当前单聊房间的状态
        if (wxState.typingStatus && wxState.typingStatus[chat.charId]) {
            typingHtml = `<span class="text-gray-400 font-bold tracking-widest animate-pulse">[正在输入中...]</span>`;
        }
    }
    
    const previewHtml = typingHtml ? typingHtml : preview;

    return `
      <div onclick="window.wxActions.openChat('${chat.charId}')" class="flex items-center px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 active:bg-gray-100">
        <div class="relative mr-3">
            <div class="w-12 h-12 bg-gray-100 rounded-[14px] flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl shadow-sm border border-gray-200/50">
              ${avatarHtml}
            </div>
            ${chat.unreadCount > 0 ? `<div class="absolute -top-1.5 -right-1.5 bg-[#ff3b30] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm z-10 border-[1.5px] border-white">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</div>` : ''}
        </div>
        <div class="flex-1 overflow-hidden">
          <div class="flex justify-between items-center mb-1"><span class="font-bold text-gray-800">${name}</span><span class="text-xs text-gray-500">${timeElap}</span></div>
          <p class="text-sm text-gray-500 truncate">${previewHtml}</p>
        </div>
      </div>
    `;
  }).join('');

  // 顶部标题
  let headerTitle = '消息';
  if(wxState.activeTab === 'contacts') headerTitle = '通讯录';
  if(wxState.activeTab === 'moments') headerTitle = '朋友圈';
  if(wxState.activeTab === 'me') headerTitle = '我';

  // 内容区
  let contentHtml = '';
  if (wxState.activeTab === 'chats') {
    contentHtml = `<div id="chats-tab-scroll" class="flex-1 overflow-y-auto hide-scrollbar">${chatsHtml}</div>`;
  } else if (wxState.activeTab === 'contacts') {
    // 🌟 生成手风琴式分组列表
    const groupsHtml = store.groups.map(group => {
      const members = store.contacts.filter(c => c.groupId === group.id);
      const isExpanded = wxState.expandedGroups[group.id] !== false; // 默认展开
      return `
        <div class="border-b border-gray-100/60">
          <div class="px-4 py-3.5 bg-white flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors" onclick="window.wxActions.toggleGroup('${group.id}')">
            <span class="font-bold text-[15px] text-gray-800">${group.name} <span class="text-gray-400 font-normal text-sm ml-1">${members.length}</span></span>
            <i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}" class="w-5 h-5 text-gray-300 transition-transform"></i>
          </div>
          <div class="${isExpanded ? 'block' : 'hidden'} bg-white animate-in slide-in-from-top-2 duration-150">
            ${members.length === 0 ? `<div class="py-4 text-center text-xs text-gray-300 font-bold tracking-widest">空空如也</div>` : members.map(c => `
              <div class="flex items-center px-4 py-2 cursor-pointer active:bg-gray-100 transition-colors" onclick="window.wxActions.openContactEdit('${c.id}')">
                <div class="w-10 h-10 rounded-lg overflow-hidden mr-3 bg-gray-100 flex items-center justify-center text-xl flex-shrink-0 shadow-sm border border-black/5">${getVidHtml(c.avatar, '', false)}</div>
                <div class="flex-1 border-b border-gray-50 py-3"><span class="font-bold text-[15px] text-gray-800">${c.name}</span></div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
    contentHtml = `<div id="contacts-tab-scroll" class="flex-1 overflow-y-auto hide-scrollbar bg-[#f3f3f3] pt-2">${groupsHtml}</div>`;
  } else if (wxState.activeTab === 'moments') {
    const my = store.personas[0];
    store.moments = store.moments || [];
    store.momentBg = store.momentBg;
    
    // 🌟 核心升级：仅筛选出最近 3 天（72小时）内的动态
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const validMoments = store.moments.filter(m => m.id >= threeDaysAgo);
    
    // 生成朋友圈流列表
    const feedHtml = validMoments.slice().reverse().map(m => {
    // 生成点赞和评论区
    const hasLikes = m.likes && m.likes.length > 0;
    const hasComments = m.comments && m.comments.length > 0;
    let interactHtml = '';
    if (hasLikes || hasComments) {
        // 🌟 优化：评论区底板改成淡灰色 #f0f0f0
        interactHtml = '<div class="bg-gray-50 mt-2.5 rounded-[6px] px-3 py-2 text-[13px] relative before:content-[\'\'] before:absolute before:bottom-full before:left-3 before:border-4 before:border-transparent before:border-b-[#f0f0f0]">';
        if (hasLikes) interactHtml += `<div class="flex items-start text-[#576b95] font-medium ${hasComments?'border-b border-gray-300/50 pb-1.5 mb-1.5':''}"><i data-lucide="heart" class="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0"></i><span class="leading-relaxed">${m.likes.join(', ')}</span></div>`;
         if (hasComments) {
            interactHtml += m.comments.map(c => `<div class="active:bg-gray-200 transition-colors py-0.5 leading-relaxed cursor-pointer break-words" onclick="window.wxActions.handleCommentClick(${m.id}, ${c.id})"><span class="text-[#576b95] font-medium">${c.senderName}</span>${c.replyTo ? ` 回复 <span class="text-[#576b95] font-medium">${c.replyTo}</span>` : ''}<span class="text-gray-800">：${c.text}</span></div>`).join('');
         }
        interactHtml += '</div>';
    }

      // 菜单弹出动画区
      const menuHtml = wxState.activeMomentMenuId === m.id ? `
        <div class="absolute right-8 top-[-6px] bg-[#4c5154] rounded-[6px] flex items-center px-4 py-2 text-white space-x-5 animate-in slide-in-from-right-2 duration-150 z-30 shadow-lg" onclick="event.stopPropagation()">
          <div class="flex items-center space-x-1 cursor-pointer active:opacity-50" onclick="window.wxActions.likeMoment(${m.id})"><i data-lucide="heart" class="w-4 h-4"></i><span class="text-[12px] font-bold">${m.likes.includes(my.name)?'取消':'赞'}</span></div>
          <div class="w-[1px] h-4 bg-gray-600"></div>
          <div class="flex items-center space-x-1 cursor-pointer active:opacity-50" onclick="window.wxActions.openMomentComment(${m.id})"><i data-lucide="message-circle" class="w-4 h-4"></i><span class="text-[12px] font-bold">评论</span></div>
          <div class="w-[1px] h-4 bg-gray-600"></div>
          <div class="flex items-center space-x-1 cursor-pointer active:opacity-50" onclick="window.wxActions.favoriteMoment(${m.id})"><i data-lucide="star" class="w-4 h-4"></i><span class="text-[12px] font-bold">收藏</span></div>
        </div>
      ` : '';

      return `
        <div class="flex items-start p-4 border-b border-gray-100/60 bg-white">
          <div class="w-10 h-10 rounded-[8px] overflow-hidden bg-gray-100 flex-shrink-0 mr-3 shadow-sm border border-gray-100">${getVidHtml(m.avatar, '', false)}</div>
          <div class="flex-1 flex flex-col min-w-0">
            <span class="text-[#576b95] font-medium text-[15px] mb-1">${m.senderName}</span>
            ${m.text ? `<span class="text-gray-800 text-[15px] leading-relaxed break-words whitespace-pre-wrap">${m.text}</span>` : ''}
            ${m.imageUrl ? `<img src="${m.imageUrl}" class="mt-2 max-w-[70%] max-h-48 object-cover rounded-[4px] border border-gray-100" />` : ''}
            ${m.virtualImageText ? `
              <div class="mt-2 w-48 min-h-[12rem] bg-white cursor-pointer select-none rounded-[4px] shadow-sm overflow-hidden border border-gray-200 relative" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');">
                <div class="absolute inset-0 p-4 overflow-y-auto text-[13px] text-gray-700 leading-relaxed text-left bg-white hide-scrollbar">
                   <span class="font-medium text-gray-400 block mb-1 flex items-center"><i data-lucide="image" class="mr-1" style="width:14px; height:14px;"></i>照片内容：</span>
                   ${m.virtualImageText}
                </div>
                <div class="img-overlay absolute inset-0 bg-[#f3f4f6] flex flex-col items-center justify-center text-gray-400 transition-opacity duration-300 z-10">
                   <i data-lucide="image" class="mb-2 text-gray-300" style="width: 36px; height: 36px;"></i>
                   <span class="text-[11px] font-bold tracking-widest animate-pulse">图片加载中...</span>
                </div>
              </div>
            ` : ''}
            ${m.location ? `<div class="text-[12px] text-blue-500/90 font-bold mb-1.5 flex items-center tracking-wide"><i data-lucide="map-pin" class="w-3.5 h-3.5 mr-1"></i>${m.location}</div>` : ''}
            <div class="flex items-center justify-between mt-3 relative">
              <div class="flex items-center space-x-3 text-[12px] text-gray-400">
                <span>${formatMomentTime(m.timestamp || m.id)}</span>
                <span class="text-[#576b95] cursor-pointer active:opacity-50" onclick="window.wxActions.deleteMoment(${m.id})">删除</span>
              </div>
              <div class="bg-gray-100 rounded-[4px] px-2 py-0.5 cursor-pointer active:bg-gray-200" 
     onclick="event.stopPropagation(); window.wxActions.toggleMomentMenu(${m.id})">
  <i data-lucide="more-horizontal" class="text-[#576b95] w-4 h-4"></i>
</div>
              ${menuHtml}
            </div>
            ${interactHtml}
          </div>
        </div>
      `;
    }).join('');

    contentHtml = `
      <div id="moments-scroll" class="flex-1 overflow-y-auto bg-white hide-scrollbar relative pb-10" onclick="if(wxState.activeMomentMenuId) window.wxActions.toggleMomentMenu(null)">
         <input type="file" id="upload-moment-bg" accept="image/*" class="hidden" onchange="window.wxActions.handleMomentBgUpload(event)" />
         <div class="relative h-60 bg-gray-200 flex items-center justify-center overflow-visible cursor-pointer" onclick="document.getElementById('upload-moment-bg').click()">
            <img src="${store.momentBg}" class="w-full h-full object-cover" />
            <div class="absolute inset-x-0 bottom-[-20px] flex justify-end items-end px-4">
               <span class="text-white font-bold text-[20px] mr-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] pb-6">${my.name}</span>
               <div class="w-16 h-16 rounded-[12px] overflow-hidden border-2 border-white shadow-md bg-white flex items-center justify-center z-10">${getVidHtml(my.avatar, '')}</div>
            </div>
         </div>
         <div class="h-10 bg-white"></div> <div class="flex flex-col">${feedHtml.length > 0 ? feedHtml : '<div class="text-center text-gray-400 mt-20 text-[13px] tracking-widest">点击右上角发表第一条动态吧</div>'}</div>
      </div>
    `;
  } else if (wxState.activeTab === 'me') {
    const my = store.personas[0];
    contentHtml = `
      <div id="me-tab-scroll" class="flex-1 overflow-y-auto bg-[#f3f3f3] hide-scrollbar pt-2 pb-10">
        <div class="bg-white p-6 flex items-center mb-2 shadow-sm relative mx-3 rounded-[16px] border border-gray-100 mt-2">
           <input type="file" id="upload-my-avatar-main" accept="image/*" class="hidden" onchange="window.wxActions.handleMyAvatarUploadMain(event)" />
           <div class="w-16 h-16 rounded-[12px] overflow-hidden bg-gray-100 flex items-center justify-center cursor-pointer mr-4 shadow-sm border border-gray-200" onclick="document.getElementById('upload-my-avatar-main').click()">${getVidHtml(my.avatar, '')}</div>
           <div class="flex-1 flex flex-col justify-center">
              <input value="${my.name}" onchange="window.wxActions.updateMyName(this.value)" class="text-xl font-bold text-gray-800 bg-transparent outline-none w-full" placeholder="输入你的名字" />
              <span class="text-[13px] text-gray-500 mt-1 font-mono">微信号：wxid_${Date.now().toString().slice(-6)}</span>
           </div>
           <i data-lucide="qr-code" class="text-gray-400" style="width:20px;height:20px;"></i>
        </div>

        <div class="bg-white mx-3 rounded-[16px] shadow-sm mb-2 border border-gray-100 overflow-hidden">
           <div class="px-4 py-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.editGlobalPrompt()">
              <div class="flex items-center"><i data-lucide="globe" class="text-gray-600 mr-3 w-5 h-5"></i><span class="text-[15px] text-gray-800 font-bold">通用用户人设</span></div>
              <div class="flex items-center"><span class="text-[12px] font-bold ${store.globalPrompt ? 'text-[#07c160]' : 'text-gray-400'} mr-2 truncate w-24 text-right">${store.globalPrompt ? '已配置' : '未配置'}</span><i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i></div>
           </div>
        </div>

        <div class="bg-white mx-3 rounded-[16px] shadow-sm mb-2 border border-gray-100 overflow-hidden">
           <div class="px-4 py-4 border-b border-gray-50 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.openView('personaManage')">
              <div class="flex items-center"><i data-lucide="users-2" class="text-gray-600 mr-3 w-5 h-5"></i><span class="text-[15px] text-gray-800 font-bold">用户身份管理</span></div>
              <div class="flex items-center"><span class="text-[12px] font-bold text-gray-400 mr-2">${store.personas.length} 个身份</span><i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i></div>
           </div>
           <div class="px-4 py-4 border-b border-gray-50 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.openView('emojiManage')">
              <div class="flex items-center"><i data-lucide="smile-plus" class="text-gray-600 mr-3 w-5 h-5"></i><span class="text-[15px] text-gray-800 font-bold">表情包库</span></div>
              <div class="flex items-center"><span class="text-[12px] font-bold text-gray-400 mr-2">${store.emojiLibs ? store.emojiLibs.length : 0} 个库</span><i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i></div>
           </div>
           <div class="px-4 py-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.openView('favorites')">
              <div class="flex items-center"><i data-lucide="box" class="text-gray-600 mr-3 w-5 h-5"></i><span class="text-[15px] text-gray-800 font-bold">收藏</span></div>
              <div class="flex items-center"><span class="text-[12px] font-bold text-gray-400 mr-2">${store.favorites ? store.favorites.length : 0} 条记录</span><i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i></div>
           </div>
        </div>

        <div class="bg-white mx-3 rounded-[16px] shadow-sm mb-6 border border-gray-100 overflow-hidden">
           <div class="px-4 py-4 border-b border-gray-50 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.openView('wallet')">
              <div class="flex items-center"><i data-lucide="wallet" class="text-gray-600 mr-3 w-5 h-5"></i><span class="text-[15px] text-gray-800 font-bold">钱包</span></div>
              <i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i>
           </div>
           <div class="px-4 py-4 flex justify-between items-center cursor-pointer active:bg-gray-50 transition-colors" onclick="window.wxActions.openBookshelf()">
              <div class="flex items-center"><i data-lucide="library" class="text-gray-600 mr-3 w-5 h-5"></i><span class="text-[15px] text-gray-800 font-bold">书架</span></div>
              <div class="flex items-center"><span class="text-[12px] font-bold text-gray-400 mr-2">${store.books ? store.books.length : 0} 本</span><i data-lucide="chevron-right" class="text-gray-300 w-4 h-4"></i></div>
           </div>
        </div>
      </div>
    `;
  }
  // 🌟 终极居中多步骤建聊向导
  let modalHtml = '';
  if (wxState.showNewChatModal) {
    modalHtml = `
      <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm p-5" onclick="window.wxActions.toggleNewChatModal()">
        <div class="bg-[#f6f6f6] w-full max-h-[80vh] rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
          
          <div class="bg-white px-4 py-4 flex justify-between items-center border-b border-gray-100 shadow-sm shrink-0">
             <div class="cursor-pointer active:opacity-50 p-1" onclick="${wxState.newChatStep === 'chooseType' ? 'window.wxActions.toggleNewChatModal()' : 'window.wxActions.goToNewChatStep(\'chooseType\')'}">
                <i data-lucide="${wxState.newChatStep === 'chooseType' ? 'x' : 'chevron-left'}" class="w-6 h-6 text-gray-500"></i>
             </div>
             <span class="font-black text-gray-800 text-[16px]">
                ${wxState.newChatStep === 'chooseType' ? '发起聊天' : (wxState.newChatStep === 'singleList' ? '选择联系人' : (wxState.newChatStep === 'groupSelect' ? '发起群聊' : '群聊设置'))}
             </span>
             ${wxState.newChatStep === 'groupSelect' ? `
                <button class="text-[13px] font-bold px-3 py-1.5 rounded-full ${wxState.newGroupData.members.length >= 2 ? 'bg-[#07c160] text-white active:scale-95 transition-transform' : 'bg-gray-200 text-gray-400'}" onclick="window.wxActions.goToGroupSetup()">下一步 (${wxState.newGroupData.members.length})</button>
             ` : '<div class="w-8"></div>'}
          </div>

          <div class="flex-1 overflow-y-auto p-5 hide-scrollbar relative">
            
            ${wxState.newChatStep === 'chooseType' ? `
              <div class="flex flex-col space-y-4 animate-in slide-in-from-left-4">
                 <div class="bg-white rounded-2xl p-5 flex items-center shadow-sm cursor-pointer active:scale-[0.98] transition-all border border-transparent hover:border-[#07c160]/50" onclick="window.wxActions.goToNewChatStep('singleList')">
                    <div class="w-14 h-14 bg-green-50 rounded-[14px] flex items-center justify-center mr-4 border border-green-100"><i data-lucide="user" class="text-[#07c160] w-7 h-7"></i></div>
                    <div class="flex flex-col flex-1"><span class="text-[16px] font-bold text-gray-800 mb-1">发起单聊</span><span class="text-[12px] text-gray-400">选择一个角色进行一对一对话</span></div>
                    <i data-lucide="chevron-right" class="text-gray-300 w-5 h-5"></i>
                 </div>
                 <div class="bg-white rounded-2xl p-5 flex items-center shadow-sm cursor-pointer active:scale-[0.98] transition-all border border-transparent hover:border-blue-400/50" onclick="window.wxActions.goToNewChatStep('groupSelect')">
                    <div class="w-14 h-14 bg-blue-50 rounded-[14px] flex items-center justify-center mr-4 border border-blue-100"><i data-lucide="users" class="text-blue-500 w-7 h-7"></i></div>
                    <div class="flex flex-col flex-1"><span class="text-[16px] font-bold text-gray-800 mb-1">发起群聊</span><span class="text-[12px] text-gray-400">拉多个角色进入同一个群</span></div>
                    <i data-lucide="chevron-right" class="text-gray-300 w-5 h-5"></i>
                 </div>
              </div>
            ` : ''}

            ${wxState.newChatStep === 'singleList' ? `
              <div class="space-y-3 animate-in slide-in-from-right-4">
                ${store.contacts.map(c => {
                  const hasChat = store.chats.some(chat => chat.charId === c.id && !chat.isGroup);
                  return `
                    <div class="bg-white rounded-[16px] p-3 flex items-center shadow-sm transition-all ${hasChat ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer active:scale-95 border border-transparent hover:border-[#07c160]/30'}" ${hasChat ? '' : `onclick="window.wxActions.startNewChat('${c.id}')"`}>
                      <div class="w-12 h-12 rounded-[12px] overflow-hidden bg-gray-100 flex items-center justify-center mr-3 border border-gray-100">${getVidHtml(c.avatar, '', false)}</div>
                      <div class="flex-1 flex flex-col"><span class="text-[15px] font-bold text-gray-800">${c.name}</span><span class="text-[11px] ${hasChat ? 'text-gray-400' : 'text-[#07c160]'} mt-0.5 font-medium">${hasChat ? '已在消息列表中' : '点击发起聊天'}</span></div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}

            ${wxState.newChatStep === 'groupSelect' ? `
              <div class="space-y-3 animate-in slide-in-from-right-4">
                <p class="text-[11px] text-gray-400 font-bold mb-2 pl-1 tracking-widest uppercase">请选择要拉入群聊的角色</p>
                ${store.contacts.map(c => {
                  const isSel = wxState.newGroupData.members.includes(c.id);
                  return `
                    <div class="bg-white rounded-[16px] p-3 flex items-center shadow-sm cursor-pointer active:scale-[0.98] transition-all border ${isSel ? 'border-blue-400 bg-blue-50/30' : 'border-gray-100 hover:border-blue-300/50'}" onclick="window.wxActions.toggleGroupMemberSelect('${c.id}')">
                      <div class="w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center transition-colors ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}">${isSel ? '<i data-lucide="check" class="text-white w-3 h-3"></i>' : ''}</div>
                      <div class="w-12 h-12 rounded-[12px] overflow-hidden bg-gray-100 flex items-center justify-center mr-3 border border-gray-100">${getVidHtml(c.avatar, '', false)}</div>
                      <div class="flex-1 font-bold ${isSel ? 'text-blue-700' : 'text-gray-800'}">${c.name}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}

            ${wxState.newChatStep === 'groupSetup' ? `
              <div class="space-y-5 animate-in slide-in-from-right-4">
                <div class="flex flex-col items-center justify-center py-4">
                   <div class="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-3 shadow-inner border border-blue-200"><i data-lucide="users" class="text-blue-500 w-8 h-8"></i></div>
                   <span class="text-[13px] font-bold text-gray-500">已选择 ${wxState.newGroupData.members.length} 位群成员</span>
                </div>
                
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm relative focus-within:border-blue-400 transition-colors">
                   <span class="text-[11px] text-blue-500 font-black tracking-widest absolute -top-2 left-3 bg-white px-1">群聊名称</span>
                   <input type="text" id="new-group-name" class="w-full outline-none text-[15px] font-bold text-gray-800 placeholder-gray-300" placeholder="例如：霸总们的茶话会" />
                </div>

                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm relative focus-within:border-blue-400 transition-colors mt-2">
                   <span class="text-[11px] text-blue-500 font-black tracking-widest absolute -top-2 left-3 bg-white px-1">你的群内身份</span>
                   <select id="new-group-persona" class="w-full outline-none text-[15px] font-bold text-gray-800 bg-transparent cursor-pointer">
                      ${store.personas.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                   </select>
                   <p class="text-[10px] text-gray-400 mt-2 leading-relaxed">此身份仅在该群聊中生效，群内所有角色都会以此身份的设定来对待你，不影响其他单聊设定。</p>
                </div>

                <button class="w-full py-3.5 bg-blue-500 text-white font-black text-[15px] rounded-xl active:scale-95 transition-transform shadow-[0_4px_15px_rgba(59,130,246,0.3)] mt-4" onclick="window.wxActions.createGroupChat()">立即创建群聊</button>
              </div>
            ` : ''}

          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="w-full h-full bg-white flex flex-col relative animate-in zoom-in-95 duration-200">
      
      <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 z-10 sticky top-0 relative transition-all" style="${store.appearance?.topBarBg ? `background: url('${store.appearance.topBarBg}') center/cover no-repeat !important; border-bottom: none !important;` : 'background-color: rgba(243, 244, 246, 0.9);'}">
        <div class="text-gray-800 cursor-pointer w-1/4 active:opacity-50 transition-opacity" onclick="window.actions.setCurrentApp(null)">
          <i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i>
        </div>
        
        <span class="absolute left-1/2 -translate-x-1/2 font-bold text-gray-800 text-[17px] tracking-wide">${headerTitle}</span>
        
        <div class="w-1/4 flex justify-end space-x-3 text-gray-800">
          ${wxState.activeTab === 'moments' ? `
            <i data-lucide="wand-2" class="cursor-pointer active:scale-90 transition-transform text-[#07c160]" style="width: 24px; height: 24px;" onclick="window.wxActions.triggerAIMoment()" title="让角色发动态"></i>
            <i data-lucide="camera" class="cursor-pointer active:scale-90 transition-transform" style="width: 24px; height: 24px;" onclick="window.wxActions.openPublishMoment()"></i>
          ` : wxState.activeTab === 'contacts' ? `
            <i data-lucide="layout-list" class="cursor-pointer active:scale-90 transition-transform" style="width: 22px; height: 22px;" onclick="window.wxActions.openGroupManage()"></i>
            <i data-lucide="user-plus" class="cursor-pointer active:scale-90 transition-transform" style="width: 24px; height: 24px;" onclick="window.wxActions.openContactEdit(null)"></i>
          ` : wxState.activeTab === 'chats' ? `
            <i data-lucide="plus" class="cursor-pointer active:scale-90 transition-transform" style="width: 24px; height: 24px;" onclick="window.wxActions.toggleNewChatModal()"></i>
          ` : ''}
        </div>
      </div>

      ${contentHtml}

      <div class="backdrop-blur-md border-t border-gray-200 flex items-center justify-around pb-6 pt-2 z-10 transition-all" style="${store.appearance?.bottomBarBg ? `background: url('${store.appearance.bottomBarBg}') center/cover no-repeat !important; border-top: none !important;` : 'background-color: rgba(249, 250, 251, 0.9);'}">
        <div onclick="window.wxActions.switchTab('chats')" class="flex flex-col items-center space-y-1 cursor-pointer w-16 ${wxState.activeTab === 'chats' ? 'text-[#07c160]' : 'text-gray-500'}">
          <i data-lucide="message-circle" class="${wxState.activeTab === 'chats' ? 'fill-current' : ''}" style="width: 24px; height: 24px;"></i>
          <span class="text-[10px] font-bold">消息</span>
        </div>
        <div onclick="window.wxActions.switchTab('contacts')" class="flex flex-col items-center space-y-1 cursor-pointer w-16 ${wxState.activeTab === 'contacts' ? 'text-[#07c160]' : 'text-gray-500'}">
          <i data-lucide="users" style="width: 24px; height: 24px;"></i>
          <span class="text-[10px] font-bold">通讯录</span>
        </div>
        <div onclick="window.wxActions.switchTab('moments')" class="flex flex-col items-center space-y-1 cursor-pointer w-16 ${wxState.activeTab === 'moments' ? 'text-[#07c160]' : 'text-gray-500'}">
          <i data-lucide="aperture" style="width: 24px; height: 24px;"></i>
          <span class="text-[10px] font-bold">朋友圈</span>
        </div>
        <div onclick="window.wxActions.switchTab('me')" class="flex flex-col items-center space-y-1 cursor-pointer w-16 ${wxState.activeTab === 'me' ? 'text-[#07c160]' : 'text-gray-500'}">
          <i data-lucide="user" style="width: 24px; height: 24px;"></i>
          <span class="text-[10px] font-bold">我</span>
        </div>
      </div>
      ${wxState.momentInput && wxState.momentInput.active ? `
        <div class="absolute inset-0 z-[70] bg-transparent" onclick="window.wxActions.closeMomentComment()">
           <div class="absolute bottom-0 left-0 right-0 bg-gray-100 px-3 py-2 border-t border-gray-200 flex items-center shadow-[0_-5px_15px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom-2" onclick="event.stopPropagation()">
              <input type="text" id="moment-comment-input" class="flex-1 bg-white rounded-[6px] px-3 py-2 outline-none text-[15px]" placeholder="${wxState.momentInput.replyTo ? '回复 ' + wxState.momentInput.replyTo + '：' : '评论'}" autofocus onkeydown="if(event.key==='Enter') window.wxActions.submitMomentComment()" />
              <button class="ml-3 bg-[#07c160] text-white w-8 h-8 rounded-[6px] flex items-center justify-center active:opacity-80 transition-opacity" onclick="window.wxActions.submitMomentComment()">
    <i data-lucide="send" class="w-4 h-4"></i>
</button>
           </div>
        </div>
      ` : ''}
      ${wxState.showGlobalPromptModal ? `
        <div class="mc-modal-overlay absolute inset-0 z-[80] bg-black/40 flex items-center justify-center animate-in fade-in backdrop-blur-sm" onclick="window.wxActions.closeGlobalPrompt()">
           <div class="mc-modal-content bg-[#f3f3f3] w-[85%] max-w-[320px] rounded-[16px] overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col" onclick="event.stopPropagation()">
              <div class="bg-white px-4 py-4 flex justify-between items-center border-b border-gray-100">
                 <span class="font-bold text-gray-800 text-[16px] mx-auto">通用用户人设</span>
              </div>
              <div class="p-4 bg-white">
                 <textarea id="global-prompt-input" rows="6" class="w-full bg-gray-50 rounded-lg p-3 outline-none text-[14px] resize-none text-gray-700 leading-relaxed hide-scrollbar" placeholder="输入通用用户人设（该设定将对所有角色生效）...">${store.globalPrompt || ''}</textarea>
              </div>
              <div class="flex border-t border-gray-100 bg-white">
                 <div class="flex-1 py-3.5 text-center text-gray-500 font-bold border-r border-gray-100 cursor-pointer active:bg-gray-50" onclick="window.wxActions.closeGlobalPrompt()">取消</div>
                 <div class="flex-1 py-3.5 text-center text-[#07c160] font-bold cursor-pointer active:bg-gray-50" onclick="window.wxActions.saveGlobalPrompt()">保存</div>
              </div>
           </div>
        </div>
      ` : ''}

      ${modalHtml}

    </div>
  `;
}
