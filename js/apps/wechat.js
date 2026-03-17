// js/apps/wechat.js
import { store } from '../store.js';

const getNowTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

// 🌟 修复8：解析时间距离的引擎
const formatTimeElapsed = (ts) => {
  if (!ts) return '最新';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
};

// 🌟 修复6 & 7：真正的全局滚动记忆系统
let savedScrollPositions = {};
const saveScroll = () => {
  ['chat-scroll', 'offline-scroll', 'wechat-group-scroll', 'wechat-favorites-scroll', 'moments-scroll', 'book-read-scroll'].forEach(id => {
    const el = document.getElementById(id);
    if (el) savedScrollPositions[id] = el.scrollTop;
  });
};
const restoreScroll = () => {
  // 🌟 纯同步执行，彻底剥离 setTimeout，并覆写全局变量防止 main.js 异步回弹！
  Object.keys(savedScrollPositions).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.scrollBehavior = 'auto'; // 强制关闭默认平滑滚动
      el.scrollTop = savedScrollPositions[id];
      // 致命一击：同步改写 main.js 的记忆，让它下一帧老老实实呆在原地
      if (window.globalScrollStates && window.globalScrollStates[id]) {
          window.globalScrollStates[id].top = savedScrollPositions[id];
      }
    }
  });
};

// =================  1. Minimax 语音请求引擎 (纯净稳定版) =================
async function fetchMinimaxVoice(text, voiceId) {
  const config = store.minimaxConfig || {};
  if (config.enabled === false) return null;
  if (!config.apiKey || !config.groupId || !voiceId) return null;

  // 终极净化：过滤动作描写和括号，防止标点引发崩溃
  let cleanText = text.replace(/\[.*?\]|\*.*?\*|（.*?）|\(.*?\)/g, '').trim();
  if (!cleanText) return null;

  try {
    const res = await fetch(`https://api.minimax.chat/v1/t2a_v2?GroupId=${config.groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: "speech-01-turbo", 
        text: cleanText, 
        stream: false,
        voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 }
      })
    });
    
    const data = await res.json();
    
    if (data.base_resp && data.base_resp.status_code !== 0) {
       console.error("❌ Minimax 报错:", data.base_resp.status_msg);
       window.actions.showToast('语音报错: ' + data.base_resp.status_msg);
       return null;
    }
    
    if (data.data && data.data.audio) {
      const hexStr = data.data.audio;
      const bytes = new Uint8Array(hexStr.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      return URL.createObjectURL(blob);
    }
  } catch (e) { 
    console.error('语音网络请求崩溃:', e); 
  }
  return null;
}

// ================= 2. 后台静默自动记忆引擎 =================
async function triggerAutoMemory(charId, msgs) {
  if (!store.apiConfig?.apiKey) return;
  try {
    const logText = msgs.map(m => `${m.sender}: ${m.msgType==='text' ? m.text : '[' + m.msgType + ']'}`).join('\n');
    
    const promptStr = `【后台任务】请判断以下近期的对话记录中，是否包含剧情进展、情感转折或新设定。
如果只是毫无营养的日常闲聊（如早安、吃了吗等），请务必只输出“无”这一个字。
如果有重要内容，请客观简练地总结为一个记忆碎片（50字以内）。
❗最重要的是：你需要判断这个记忆的【重要性级别】：
- 如果是影响深远的重大设定、核心人物关系改变（如表白、决裂、身世揭晓），请在开头加上 [核心] 标签。
- 如果只是普通的剧情事件或情绪记忆，请在开头加上 [碎片] 标签。
示例输出：[核心]Aric向你表白了，你们确立了恋爱关系。

【对话】
${logText}`;
    
    const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
        body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.3 })
    });
    const data = await res.json();
    const rawSummary = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    
    // 物理拦截废话
    if (rawSummary === '无' || rawSummary.toLowerCase().includes('none') || rawSummary.includes('无重要信息')) {
       console.log(`[系统] 本轮对话无重要进展，拒绝产生垃圾记忆。`);
       return; 
    }

    // 智能解析 AI 打上的重要性标签
    let memType = 'fragment';
    let summary = rawSummary;
    if (summary.includes('核心')) { memType = 'core'; summary = summary.replace(/【?\[?核心\]?】?/g, '').trim(); }
    else if (summary.includes('碎片')) { memType = 'fragment'; summary = summary.replace(/【?\[?碎片\]?】?/g, '').trim(); }
    
    let kws = '';
    // 只有碎片记忆才需要提取触发词，核心记忆是全局挂载的！
    if (memType === 'fragment') {
        const kwRes = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: `请从以下总结中提取2个核心名词作为触发关键词，用英文逗号分隔，不要输出多余符号。\n${summary}` }], temperature: 0.3 })
        });
        const kwData = await kwRes.json();
        kws = kwData.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    }
    
    // 🌟 在存入 store 之前，给内容打上时间戳
    const dateStr = new Date().toLocaleDateString('zh-CN'); // 例如：2026/3/16
    const finalSummary = `[${dateStr}] ${summary}`;
    
    store.memories = store.memories || [];
    store.memories.push({ id: Date.now(), charId: charId, type: memType, content: finalSummary, keywords: kws, createdAt: Date.now() });
    console.log(`[系统] 提取到高价值 ${memType === 'core' ? '❤️核心' : '🧩碎片'} 记忆:`, finalSummary);
  } catch (e) {}
}

const wxState = {
  view: 'main', 
  activeTab: 'chats', 
  activeChatId: null,
  showNewChatModal: false,
  showPlusMenu: false,
  isTyping: false,
  virtualModalType: 'none',
  activeTransferId: null,
  callType: null, 
  callStartTime: null,
  pendingCallMsg: '',
  ringtone: new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3'),
  savedScroll: 0, 
  activeMenuMsgId: null, 
  longPressTimer: null, 
  quoteMsgId: null, // 用来记住你正在引用哪条消息
  isMultiSelecting: false, // 是否处于多选模式
  selectedMsgIds: [],  // 记录被选中的消息 ID 数组
  expandedGroups: {}, // 记录哪些分组是展开的
  editingContactId: null, // 当前正在编辑的角色ID
  tempAvatar: null, // 临时存储上传的头像
  editingPersonaId: null,
  editingEmojiLibId: null,
  favManageMode: false,
  selectedFavIds: [],
  tempPersonaAvatar: null, // 用来存正在编辑的身份头像
  showEmojiMenu: false, // 表情面板开关
  activeEmojiTab: 0, // 表情面板当前停留的 Tab 页
  showEmojiMountModal: false, // 聊天设置里的挂载弹窗开关
  showWbMountModal: false,  // 控制世界书弹窗
  activeWbGroup: '全部',     // 世界书分组筛选状态
  showPersonaMountModal: false, 
  tempBoundPersonaId: null,
  tempMomentImage: null,
  activeMomentMenuId: null, // 当前点开了哪个动态的菜单
  momentInput: { active: false, momentId: null, replyTo: null }, // 评论输入框状态
  showGlobalPromptModal: false,
  tempMomentVirtual: null,
  showForwardModal: false,
  forwardType: 'single', // 'single' 逐条, 'merge' 合并
  forwardMsgIds: [],      // 记录要转发的消息ID
  showExtractMemoryModal: false,
  extractMemoryStep: 1, // 1=选择轮数和类型，2=编辑保存结果
  extractMemoryConfig: { msgCount: 20, type: 'fragment', keywords: '' },
  extractMemoryContent: '', // 存放 AI 总结好的话
  isExtracting: false, // 是否正在请求大模型
  showNewChatModal: false,
  newChatStep: 'chooseType', // 'chooseType' | 'singleList' | 'groupSelect' | 'groupSetup'
  newGroupData: { members: [], name: '', personaId: null },
};
wxState.ringtone.loop = true;

window.wxActions = {
// 更加无敌的“计次型”双击判定器
  avatarClickCount: 0,
  avatarClickTimer: null,
  handleAvatarClick: (charId) => {
    // 每次点击，计数器 +1
    window.wxActions.avatarClickCount++;
    if (window.wxActions.avatarClickCount === 1) {
        // 第一次点击，开启一个 300ms 的倒计时
        window.wxActions.avatarClickTimer = setTimeout(() => {
            // 如果 300ms 过去了，计数器还是 1，说明用户没有点第二下，是纯纯的【单击】！
            window.wxActions.avatarClickCount = 0; // 及时清零
            saveScroll();
            wxState.showInnerThoughtModal = charId;
            window.render();
            restoreScroll();
        }, 300); // 300ms 是人类双击的黄金间隔，觉得快了可以改 350
    } else if (window.wxActions.avatarClickCount === 2) {
        // 在 300ms 内点下了第二下，触发【双击】！
        clearTimeout(window.wxActions.avatarClickTimer); // 赶紧拦截住单击的弹窗
        window.wxActions.avatarClickCount = 0;           // 计数器清零
        window.wxActions.sendNudge(charId);              // 触发戳一戳！
    }
  },
  closeInnerThoughtModal: () => {
    saveScroll();
    wxState.showInnerThoughtModal = null;
    window.render();
    restoreScroll();
  },
  // ================= 🎵 终极语音播放引擎 =================
  playVoiceMsg: (msgId) => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (!chat) return;
      const msg = chat.messages.find(m => m.id === msgId);
      if (!msg) return;

      if (msg.audioUrl) {
          if (wxState.playingAudio) {
              wxState.playingAudio.pause();
              if (wxState.playingMsgId === msgId) { 
                  wxState.playingMsgId = null; wxState.playingAudio = null; window.render(); return; 
              }
          }
          // 因为现在是 Base64，所以即使不用强制交互，浏览器也大概率会乖乖出声
          const audio = new Audio(msg.audioUrl);
          wxState.playingAudio = audio; 
          wxState.playingMsgId = msgId; 
          window.render();
          
          audio.play().catch(e => window.actions.showToast('播放被浏览器拦截，请再点一次'));
          audio.onended = () => { wxState.playingMsgId = null; wxState.playingAudio = null; window.render(); };
      } else {
          window.actions.showToast('后台正在生成语音，请稍等两秒再点...');
      }
  },
  clearChatHistory: () => {
      if(!confirm('⚠️ 确定要清空当前窗口的聊天记录吗？此操作不会删除角色或其记忆设定。')) return;
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if(chat) chat.messages = [];
      window.actions.showToast('当前聊天记录已清空');
      wxState.view = 'chatRoom';
      window.render();
  },
  toggleBlockCharacter: () => {
      const char = store.contacts.find(c => c.id === wxState.activeChatId);
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (char.isBlocked) {
          char.isBlocked = false;
          if (chat) chat.messages.push({ id: Date.now(), sender: 'system', text: `已将${char.name}从黑名单中移除`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          window.render();
          window.wxActions.getReply(true, char.id, '(系统指令：用户主动解除了对你的拉黑。请对用户的宽容表示反应。⚠️警告：保持人设，必须分段换行，绝不可输出任何系统标签！)');
      } else {
          if(!confirm('🚨 确定要拉黑该角色吗？')) return;
          char.isBlocked = true;
          if (chat) chat.messages.push({ id: Date.now(), sender: 'system', text: `已将${char.name}拉入黑名单`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          window.render();
          window.wxActions.getReply(true, char.id, '(系统指令：你被用户拉黑了！你的消息将被拒收，请立即发消息并附带好友申请拼命试图挽回用户。⚠️警告：情绪要到位，必须分段换行，绝不可输出任何系统标签！)');
      }
  },
  handleFriendReq: (msgId, isAccept) => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const char = store.contacts.find(c => c.id === wxState.activeChatId);
      const msg = chat.messages.find(m => m.id === msgId);
      if (!msg) return;
      msg.reqState = isAccept ? 'accepted' : 'rejected';
      if (isAccept) {
          char.isBlocked = false;
          chat.messages.push({ id: Date.now(), sender: 'system', text: `你已同意${char.name}的好友申请`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          window.actions.showToast('已解除拉黑状态');
          window.render();
          window.wxActions.getReply(true, char.id, '(系统指令：用户已同意你的好友申请，拉黑状态已解除！请表达你的激动。⚠️警告：必须分段换行，绝不可输出任何系统标签！)');
      } else {
          chat.messages.push({ id: Date.now(), sender: 'system', text: `你已拒绝${char.name}的好友申请`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          window.actions.showToast('已拒绝申请');
          window.render();
          window.wxActions.getReply(true, char.id, '(系统指令：用户无情地拒绝了你的好友申请。请继续发消息想办法挽回！⚠️警告：必须分段换行，绝不可输出任何系统标签！)');
      }
  },
  switchTab: (tab) => { wxState.activeTab = tab; window.render(); },
  openChat: (charId) => { wxState.activeChatId = charId; wxState.view = 'chatRoom'; wxState.showPlusMenu = false; window.render(); window.wxActions.scrollToBottom(); },
  closeChat: () => { wxState.view = 'main'; wxState.activeChatId = null; window.render(); },
  togglePlusMenu: () => { 
    saveScroll(); 
    wxState.showPlusMenu = !wxState.showPlusMenu; 
    wxState.showEmojiMenu = false; 
    window.render(); 
    restoreScroll(); 
  },
  openPrivacyModal: () => {
      wxState.showPrivacyModal = true;
      if (!wxState.momentPrivacyType) wxState.momentPrivacyType = 'public';
      if (!wxState.momentPrivacyGroups) wxState.momentPrivacyGroups = [];
      window.render();
  },
  closePrivacyModal: () => { wxState.showPrivacyModal = false; window.render(); },
  setPrivacyType: (type) => { wxState.momentPrivacyType = type; window.render(); },
  togglePrivacyGroup: (groupId) => {
      const idx = wxState.momentPrivacyGroups.indexOf(groupId);
      if (idx > -1) wxState.momentPrivacyGroups.splice(idx, 1);
      else wxState.momentPrivacyGroups.push(groupId);
      window.render();
  },
  // 戳一戳动作
  // 戳一戳动作
  sendNudge: (charId) => {
    saveScroll();
    const chat = store.chats.find(c => c.charId === charId);
    const char = store.contacts.find(c => c.id === charId);
    if (!chat || !char) return;
    const verb = char.nudgeMeVerb || '拍了拍';
    const suffix = char.nudgeMeSuffix || '';
    const nudgeMsg = `我${verb}了${char.name}${suffix}`;
    chat.messages.push({ id: Date.now(), sender: 'system', text: nudgeMsg, isMe: true, source: 'wechat', msgType: 'system', time: getNowTime() });
    
    window.render(); 
    restoreScroll(); // 🌟 修复：先把书页位置复原
    window.wxActions.scrollToBottom();  // 🌟 再让聊天框到底部
    
    window.wxActions.getReply(true, char.id, `(系统提示：用户刚刚戳了戳你（动作：${nudgeMsg}），请根据你的性格作出反应。可以直接说话或反击，绝不可带系统提示字眼)`);
  },
  // 戳一戳数据更新动作
  updateNudge: (key, val) => {
    saveScroll();
    const char = store.contacts.find(c => c.id === wxState.activeChatId);
    if (key === 'meVerb') char.nudgeMeVerb = val;
    if (key === 'meSuffix') char.nudgeMeSuffix = val;
    if (key === 'aiVerb') char.nudgeAIVerb = val;
    if (key === 'aiSuffix') char.nudgeAISuffix = val;
    window.render();
    restoreScroll();
  },
  continueOffline: () => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (chat && chat.isGroup) {
          const directorId = chat.memberIds[Math.floor(Math.random() * chat.memberIds.length)];
          // 🌟 核心修复：把指令放到第 3 个参数 (customPrompt) 的位置！
          window.wxActions.getReply(true, directorId, '(系统指令：请作为群聊导演，顺着上面的剧情继续往下写，自然地推动情节发展，绝不要使用“名字: 台词”的格式。)');
      } else {
          // 🌟 同样修复单聊的参数位置
          window.wxActions.getReply(true, null, '(系统指令：请顺着上面的剧情继续往下写，不要重复，自然地推动情节发展。)');
      }
  },
  // 美化预设
  applyCSSPreset: (event) => {
    saveScroll();
    const val = event.target.value;
    if (!val) { restoreScroll(); return; }
    const char = store.contacts.find(c => c.id === wxState.activeChatId);
    const preset = store.cssPresets.find(p => p.id === val);
    if (preset) {
        char.customCSS = preset.css;
        const cssBox = document.getElementById('set-custom-css');
        if (cssBox) cssBox.value = preset.css; // 实时推入输入框
    }
    window.actions.showToast(`已加载预设：${preset.name}`);
    window.render();
    restoreScroll();
  },
  saveCSSPreset: () => {
    saveScroll();
    const name = prompt("请输入新美化预设的名称：", "我的自定义预设");
    if (!name) { restoreScroll(); return window.actions.showToast("已取消保存"); }
    const cssBox = document.getElementById('set-custom-css');
    const currentCssStr = cssBox ? cssBox.value : '';
    
    if (!store.cssPresets) store.cssPresets = [];
    store.cssPresets.push({ id: 'css_' + Date.now(), name: name, css: currentCssStr });
    window.actions.showToast(`已保存美化预设：${name}`);
    window.render();
    restoreScroll();
  },
  // 表情面板开关
  toggleEmojiMenu: () => {
    saveScroll();
    wxState.showEmojiMenu = !wxState.showEmojiMenu;
    wxState.showPlusMenu = false; // 与+号面板互斥
    window.render();
    restoreScroll();
  },
  // 去掉自动获取回复的逻辑，让它像文字一样可以暂存
  sendEmoji: (url, name = '表情') => {
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    if (chat) {
      chat.messages.push({ id: Date.now(), sender: store.personas[0].name, text: `[表情包] ${name}`, imageUrl: url, isMe: true, source: 'wechat', isOffline: false, msgType: 'emoji', time: getNowTime() });
      wxState.showEmojiMenu = false; window.render(); window.wxActions.scrollToBottom();
    }
  },
  // 表情 Tab 切换与挂载库管理
  switchEmojiTab: (idx) => { wxState.activeEmojiTab = idx; window.render(); },
  toggleEmojiMountModal: () => {
      saveScroll();
      wxState.showEmojiMountModal = !wxState.showEmojiMountModal;
      window.render();
      restoreScroll();
    },
  toggleEmojiMount: (libId) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if (!targetObj.mountedEmojis) targetObj.mountedEmojis = [];
      if (targetObj.mountedEmojis.includes(libId)) {
         targetObj.mountedEmojis = targetObj.mountedEmojis.filter(id => id !== libId);
      } else {
         targetObj.mountedEmojis.push(libId);
      }
      window.render();
      restoreScroll();
  },
  toggleWbMount: (wbId) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if (!targetObj.mountedWorldbooks) targetObj.mountedWorldbooks = [];
      const numId = Number(wbId) || wbId; 
      if (targetObj.mountedWorldbooks.includes(numId)) {
         targetObj.mountedWorldbooks = targetObj.mountedWorldbooks.filter(id => id !== numId);
      } else {
         targetObj.mountedWorldbooks.push(numId);
      }
      window.render();
      restoreScroll();
  },
  toggleDisableEmoji: () => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      targetObj.disableEmoji = !targetObj.disableEmoji;
      window.render();
      restoreScroll();
  },
  scrollToBottom: () => {
    // 🌟 纯同步置底，绝不用任何延时，并在同一帧锁死全局位置！
    const chatBox = document.getElementById('chat-scroll') || document.getElementById('offline-scroll') || document.getElementById('call-scroll');
    if (chatBox) {
      chatBox.style.scrollBehavior = 'auto';
      chatBox.scrollTop = chatBox.scrollHeight;
      if (window.globalScrollStates && window.globalScrollStates[chatBox.id]) {
          window.globalScrollStates[chatBox.id].top = chatBox.scrollHeight;
      }
    }
    
    const bookBox = document.getElementById('book-read-scroll');
    if (bookBox && savedScrollPositions['book-read-scroll'] !== undefined) {
       bookBox.style.scrollBehavior = 'auto';
       bookBox.scrollTop = savedScrollPositions['book-read-scroll'];
       if (window.globalScrollStates && window.globalScrollStates['book-read-scroll']) {
           window.globalScrollStates['book-read-scroll'].top = savedScrollPositions['book-read-scroll'];
       }
    }
  },
  // 世界书与表情包挂载专属动作 (修复了滚动条回弹)
    toggleWbMountModal: () => { 
      saveScroll();
      wxState.showWbMountModal = !wxState.showWbMountModal; 
      wxState.activeWbGroup = '全部'; 
      window.render(); 
      restoreScroll();
    },
    setWbMountGroup: (g) => { 
      saveScroll();
      wxState.activeWbGroup = g; 
      window.render(); 
      restoreScroll();
    },
  // 通讯录核心引擎
  toggleGroup: (groupId) => {
    wxState.expandedGroups[groupId] = wxState.expandedGroups[groupId] === false ? true : false;
    window.render();
  },
  openContactEdit: (charId) => {
    saveScroll();
    wxState.editingContactId = charId;
    wxState.tempAvatar = null;
    wxState.tempBoundPersonaId = null; // 打开编辑时，清空临时身份记忆
    wxState.view = 'contactEdit';
    window.render();
  },
  togglePersonaMountModal: () => { wxState.showPersonaMountModal = !wxState.showPersonaMountModal; window.render(); },
  selectBoundPersona: (id) => { wxState.tempBoundPersonaId = id; wxState.showPersonaMountModal = false; window.render(); },
  closeSubView: () => {
    wxState.view = 'main';
    window.render();
    restoreScroll();
  },
  handleContactAvatarUpload: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
      wxState.tempAvatar = base64; window.render();
    });
    event.target.value = '';
  },
  saveContact: () => {
    const name = document.getElementById('edit-char-name').value.trim();
    if (!name) return window.actions.showToast('名字不能为空哦！');
    
    const contactData = {
      name: name,
      prompt: document.getElementById('edit-char-prompt').value.trim(),
      greeting: document.getElementById('edit-char-greeting').value.trim(),
      minimaxVoiceEnabled: document.getElementById('edit-char-voice-enabled').checked,
      minimaxVoiceId: document.getElementById('edit-char-voice-id').value.trim(),
      boundPersonaId: wxState.tempBoundPersonaId || (wxState.editingContactId ? store.contacts.find(c => c.id === wxState.editingContactId)?.boundPersonaId : store.personas[0].id) || store.personas[0].id,
      groupId: document.getElementById('edit-char-group').value
    };

    if (wxState.editingContactId) {
      // 存在则是编辑
      const char = store.contacts.find(c => c.id === wxState.editingContactId);
      if (char) {
        Object.assign(char, contactData);
        if (wxState.tempAvatar) char.avatar = wxState.tempAvatar; // 只有换了才更新
      }
    } else {
      // 不存在则是新建
      const newId = 'char_' + Date.now();
      contactData.id = newId;
      contactData.avatar = wxState.tempAvatar;
      contactData.videoAvatar = contactData.avatar;
      contactData.autoMsgEnabled = false;
      contactData.autoMsgInterval = 5;
      store.contacts.push(contactData);
      store.chats.push({ id: 'chat_' + Date.now(), charId: newId, messages: [] });
      
      // 如果有开场白，直接作为第一条消息发出来
      if (contactData.greeting) {
        const newChat = store.chats.find(c => c.charId === newId);
        newChat.messages.push({ id: Date.now() + 1, sender: name, text: contactData.greeting, isMe: false, source: 'wechat', isOffline: false, msgType: 'text', time: getNowTime() });
      }
    }
    window.actions.showToast('角色保存成功！');
    window.wxActions.closeSubView();
  },
  deleteContact: () => {
    if (!wxState.editingContactId) return;
    if (!confirm('确定要删除这个角色吗？相关的聊天记录也会被彻底清除！')) return;
    store.contacts = store.contacts.filter(c => c.id !== wxState.editingContactId);
    store.chats = store.chats.filter(c => c.charId !== wxState.editingContactId);
    window.actions.showToast('角色已删除');
    window.wxActions.closeSubView();
  },
  openGroupManage: () => { saveScroll(); wxState.view = 'groupManage'; window.render(); },
  addGroup: () => {
    store.groups = store.groups || [];
    store.groups.push({ id: 'group_' + Date.now(), name: '新分组' });
    window.render();
  },
  updateGroupName: (groupId, name) => {
    const g = store.groups.find(g => g.id === groupId);
    if (g) g.name = name;
  },
  deleteGroup: (groupId) => {
    if (groupId === 'default') return window.actions.showToast('默认分组不能被删除哦！');
    if (!confirm('确定删除该分组吗？组内角色将被安全转移至默认分组。')) return;
    store.groups = store.groups.filter(g => g.id !== groupId);
    store.contacts.forEach(c => { if (c.groupId === groupId) c.groupId = 'default'; });
    window.render();
  },
  rerollReply: (targetMsgId = null) => {
    saveScroll();
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    if (!chat || chat.messages.length === 0) return;
    if (targetMsgId) {
        // 线下剧情的精准重roll：以你点击的这条消息为界，斩断它和后面的所有时间线
        const targetIndex = chat.messages.findIndex(m => m.id === targetMsgId);
        if (targetIndex > -1) {
            chat.messages = chat.messages.slice(0, targetIndex);
        }
    } else {
        // 经典的常规重roll：从最后一条开始往回删，直到露出你的上一句话
        if (chat.messages[chat.messages.length - 1].isMe) return window.actions.showToast('只能重roll对方的回复哦');
        while (chat.messages.length > 0 && !chat.messages[chat.messages.length - 1].isMe) {
          chat.messages.pop();
        }
    }
    wxState.showPlusMenu = false; 
    wxState.activeMenuMsgId = null; // 顺手关掉长按菜单
    window.render();
    restoreScroll();
    window.wxActions.getReply(); // 召唤大模型重新续写时间线
  },
  // ================= 🚀 发起新聊天/群聊 向导动作 =================
  toggleNewChatModal: () => { 
    wxState.showNewChatModal = !wxState.showNewChatModal; 
    wxState.newChatStep = 'chooseType'; // 每次打开都重置为第一步
    wxState.newGroupData = { members: [], name: '', personaId: null };
    window.render(); 
  },
  goToNewChatStep: (step) => {
    wxState.newChatStep = step;
    window.render();
  },
  startNewChat: (charId) => {
    let chat = store.chats.find(c => c.charId === charId && !c.isGroup);
    if (!chat) {
      chat = { id: 'chat_' + Date.now(), charId: charId, isGroup: false, messages: [] };
      store.chats.push(chat);
      const char = store.contacts.find(c => c.id === charId);
      if (char && char.greeting) {
        chat.messages.push({ id: Date.now() + 1, sender: char.name, text: char.greeting, isMe: false, source: 'wechat', isOffline: false, msgType: 'text', time: getNowTime() });
      }
    }
    wxState.showNewChatModal = false;
    window.wxActions.openChat(charId); 
  },
  // 群聊专属控制
  toggleGroupMemberSelect: (charId) => {
    const idx = wxState.newGroupData.members.indexOf(charId);
    if (idx > -1) wxState.newGroupData.members.splice(idx, 1);
    else wxState.newGroupData.members.push(charId);
    window.render();
  },
  goToGroupSetup: () => {
    if (wxState.newGroupData.members.length < 2) return window.actions.showToast('群聊至少需要选择2个角色哦');
    wxState.newGroupData.personaId = store.personas[0].id; // 默认选中主身份
    wxState.newChatStep = 'groupSetup';
    window.render();
  },
  createGroupChat: () => {
    const groupName = document.getElementById('new-group-name').value.trim();
    if (!groupName) return window.actions.showToast('请给群聊起个名字吧');
    const pId = document.getElementById('new-group-persona').value;
    
    // 🌟 创建群聊对象（与单聊平级，但有专属标记）
    const newChatId = 'group_' + Date.now();
    const newGroupChat = { 
        id: 'chat_' + Date.now(), 
        charId: newChatId, // 群聊的专属 ID
        isGroup: true, 
        groupName: groupName,
        memberIds: [...wxState.newGroupData.members],
        boundPersonaId: pId, // 🌟 你的方案 1：群聊专属独立身份！
        messages: [] 
    };
    store.chats.push(newGroupChat);
    
    // 推送一条建群系统消息
    newGroupChat.messages.push({ id: Date.now(), sender: 'system', text: `你邀请了 ${wxState.newGroupData.members.map(id => store.contacts.find(c=>c.id===id)?.name).join('、')} 加入了群聊`, isMe: true, source: 'wechat', msgType: 'system', time: getNowTime() });

    window.actions.showToast('群聊创建成功！');
    wxState.showNewChatModal = false;
    window.wxActions.openChat(newChatId); // 借用现有的打开聊天室动作
  },
  // 按菜单核心引擎 (带防滑误触机制)
  handleTouchStart: (msgId) => {
    wxState.longPressTimer = setTimeout(() => {
      saveScroll(); 
      wxState.activeMenuMsgId = msgId;
      window.render();
      restoreScroll(); 
    }, 400); // 长按 0.4 秒触发
  },
  // 只要手指滑动了，立马取消长按判定
  handleTouchMove: () => {
    if (wxState.longPressTimer) { clearTimeout(wxState.longPressTimer); wxState.longPressTimer = null; }
  },
  handleTouchEnd: () => {
    if (wxState.longPressTimer) { clearTimeout(wxState.longPressTimer); wxState.longPressTimer = null; }
  },
  closeContextMenu: () => {
    saveScroll();
    wxState.activeMenuMsgId = null; 
    window.render();
    restoreScroll();
  },

  // 菜单动作：删除与编辑
  deleteMessage: (msgId) => {
    saveScroll();
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    wxState.activeMenuMsgId = null; 
    window.render();
    restoreScroll();
  },
  // 高级居中编辑弹窗
  openEditMessageModal: (msgId) => {
    saveScroll();
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    const msg = chat.messages.find(m => m.id === msgId);
    if (msg) {
       wxState.editMsgData = { id: msgId, text: msg.text };
       wxState.activeMenuMsgId = null; 
       window.render();
    }
    restoreScroll();
  },
  closeEditMessageModal: () => {
    saveScroll(); wxState.editMsgData = null; window.render(); restoreScroll();
  },
  saveEditedMessage: () => {
    saveScroll();
    const newText = document.getElementById('edit-msg-textarea').value.trim();
    if (newText) {
       const chat = store.chats.find(c => c.charId === wxState.activeChatId);
       const msg = chat.messages.find(m => m.id === wxState.editMsgData.id);
       if (msg) msg.text = newText;
    }
    wxState.editMsgData = null;
    window.render();
    restoreScroll();
  },
  // 引用动作
  quoteMessage: (msgId) => {
    saveScroll();
    wxState.quoteMsgId = msgId;
    wxState.activeMenuMsgId = null; // 关闭黑色菜单
    window.render();
    restoreScroll();
  },
  cancelQuote: () => {
    saveScroll();
    wxState.quoteMsgId = null;
    window.render();
    restoreScroll();
  },
  // 用户撤回动作
  recallMessage: (msgId) => {
    saveScroll();
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    const msg = chat.messages.find(m => m.id === msgId);
    if (msg && msg.isMe) {
      msg.recalledText = msg.text; // 保存作案证据
      msg.text = '你撤回了一条消息';
      msg.msgType = 'recall_system';
      msg.quote = null; // 清空附带的引用
    }
    wxState.activeMenuMsgId = null; 
    window.render();
    restoreScroll();
  },
  // 收藏与多选系统
  favoriteMessage: (msgId) => {
    saveScroll();
    store.favorites = store.favorites || [];
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    const msg = chat.messages.find(m => m.id === msgId);
    const charName = store.contacts.find(c => c.id === chat.charId)?.name || '未知';
    if (msg) {
      store.favorites.push({ ...msg, savedAt: Date.now(), chatName: charName });
      window.actions.showToast('已添加至收藏');
    }
    wxState.activeMenuMsgId = null; 
    window.render(); 
    restoreScroll();
  },
  startMultiSelect: (msgId) => {
    saveScroll();
    wxState.isMultiSelecting = true;
    wxState.selectedMsgIds = [msgId];
    wxState.activeMenuMsgId = null;
    window.render(); 
    restoreScroll();
  },
  toggleSelectMsg: (msgId) => {
    saveScroll();
    if (wxState.selectedMsgIds.includes(msgId)) {
      wxState.selectedMsgIds = wxState.selectedMsgIds.filter(id => id !== msgId);
    } else {
      wxState.selectedMsgIds.push(msgId);
    }
    window.render(); 
    restoreScroll();
  },
  cancelMultiSelect: () => {
    saveScroll();
    wxState.isMultiSelecting = false;
    wxState.selectedMsgIds = [];
    window.render(); 
    restoreScroll();
  },
  deleteSelected: () => {
    if (wxState.selectedMsgIds.length === 0) return window.actions.showToast('请至少选择一项');
    saveScroll();
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages = chat.messages.filter(m => !wxState.selectedMsgIds.includes(m.id));
    wxState.isMultiSelecting = false;
    wxState.selectedMsgIds = [];
    window.render(); 
    restoreScroll();
  },
  batchAction: (actionName) => {
    if (wxState.selectedMsgIds.length === 0) return window.actions.showToast('请至少选择一项');
    // 多选收藏
    if (actionName === '收藏') {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const charName = store.contacts.find(c => c.id === chat.charId)?.name || '未知';
      store.favorites = store.favorites || [];
      wxState.selectedMsgIds.forEach(id => {
         const msg = chat.messages.find(m => m.id === id);
         if (msg) store.favorites.push({ ...msg, savedAt: Date.now(), chatName: charName });
      });
      window.actions.showToast(`成功收藏 ${wxState.selectedMsgIds.length} 条消息`);
    } 
    // 逐条与合并转发
    else if (actionName === '逐条转发' || actionName === '合并转发') {
      saveScroll();
      wxState.forwardType = actionName === '逐条转发' ? 'single' : 'merge';
      wxState.forwardMsgIds = [...wxState.selectedMsgIds];
      wxState.showForwardModal = true;
      wxState.isMultiSelecting = false;
      wxState.selectedMsgIds = [];
      window.render();
      return; // 拦截默认的退出动作
    } else {
      window.actions.showToast(`已${actionName} ${wxState.selectedMsgIds.length} 条消息 (开发中)`);
    }
    saveScroll();
    wxState.isMultiSelecting = false;
    wxState.selectedMsgIds = [];
    window.render(); 
    restoreScroll();
  },
  // 用于安全关闭转发弹窗的动作
  closeForwardModal: () => {
    wxState.showForwardModal = false;
    wxState.forwardMsgIds = [];
    window.render();
  },
  // 执行转发的终极确认函数
  confirmForward: (targetCharId) => {
    const sourceChat = store.chats.find(c => c.charId === wxState.activeChatId);
    let targetChat = store.chats.find(c => c.charId === targetCharId);
    if (!targetChat) {
      targetChat = { id: 'chat_' + Date.now(), charId: targetCharId, messages: [] };
      store.chats.push(targetChat);
    }
    // 提取并按时间先后排序
    const msgsToForward = sourceChat.messages.filter(m => wxState.forwardMsgIds.includes(m.id)).sort((a,b) => a.id - b.id);
    if (wxState.forwardType === 'single') {
      msgsToForward.forEach((m, idx) => {
        const newMsg = { ...m, id: Date.now() + idx, isMe: true, time: getNowTime() }; // 转发过去都算是我发出的
        if (newMsg.msgType === 'transfer') newMsg.transferState = 'pending';
        targetChat.messages.push(newMsg);
      });
    } else {
      // 生成微信原生的聊天记录卡片数据
      const sourceCharName = store.contacts.find(c => c.id === sourceChat.charId)?.name || '对方';
      const title = store.personas[0].name + '与' + sourceCharName + '的聊天记录';
      
      const previewLines = msgsToForward.slice(0, 4).map(m => {
        let senderName = m.isMe ? store.personas[0].name : sourceCharName;
        let content = m.text;
        if (m.msgType === 'emoji' || m.msgType === 'real_image') content = '[图片]';
        if (m.msgType === 'voice') content = '[语音]';
        if (m.msgType === 'virtual_image') content = '[照片]';
        if (m.msgType === 'transfer') content = '[转账]';
        if (m.msgType === 'history_record') content = '[聊天记录]';
        return `${senderName}: ${content}`;
      }).join('\n');

      const fullContent = msgsToForward.map(m => {
        let senderName = m.isMe ? store.personas[0].name : sourceCharName;
        return `${senderName}: ${m.text}`;
      }).join('\n');
      
      targetChat.messages.push({
        id: Date.now(), 
        sender: store.personas[0].name,
        text: `[聊天记录详细内容]\n${fullContent}`,
        isMe: true, 
        source: 'wechat', 
        isOffline: false, 
        msgType: 'history_record',
        historyData: { title, preview: previewLines },
        time: getNowTime()
      });
    }
    wxState.showForwardModal = false;
    wxState.forwardMsgIds = [];
    window.actions.showToast('已转发');
    window.render();
  },
  // ================= 自动提取记忆引擎 =================
  openExtractMemoryModal: () => {
    saveScroll();
    wxState.showPlusMenu = false;
    wxState.showExtractMemoryModal = true;
    wxState.extractMemoryStep = 1;
    wxState.extractMemoryConfig = { msgCount: 20, type: 'fragment', keywords: '' };
    wxState.extractMemoryContent = '';
    wxState.isExtracting = false;
    window.render();
    restoreScroll();
  },
  closeExtractMemoryModal: () => {
    saveScroll();
    wxState.showExtractMemoryModal = false;
    window.render();
    restoreScroll();
  },
  updateExtractConfig: (key, val) => {
    wxState.extractMemoryConfig[key] = val;
    window.render();
  },
  startExtractMemory: async () => {
    if (!store.apiConfig || !store.apiConfig.apiKey) return window.actions.showToast('请先配置 API Key');
    wxState.isExtracting = true;
    window.render();
    try {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      // 过滤掉系统消息，只取真实的对话
      const validMsgs = chat.messages.filter(m => !m.isHidden && !(m.msgType || '').includes('system'));
      // 直接精确截取指定条数的消息
      const msgCount = wxState.extractMemoryConfig.msgCount;
      const msgs = validMsgs.slice(-msgCount);
      const logText = msgs.map(m => `${m.sender}: ${m.msgType==='text' ? m.text : '[' + m.msgType + ']'}`).join('\n');
      
      const promptStr = `【任务】请提取并总结以下对话记录。\n要求：${wxState.extractMemoryConfig.type === 'core' ? '总结出这段对话中体现的【核心人物关系】或【不可磨灭的重大背景状态】。' : '客观地总结刚刚这段剧情中【发生了什么事】。'}\n直接输出总结内容，不加引号，不带“总结”、“这段对话”等废话，务必控制在50字以内。\n\n【对话记录】\n${logText}`;

      const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
          body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.3 })
      });
      const data = await res.json();
      const rawContent = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
      
      // 🌟 给手动提取的记忆也打上时间戳
      const dateStr = new Date().toLocaleDateString('zh-CN');
      wxState.extractMemoryContent = `[${dateStr}] ${rawContent}`;
      
      wxState.isExtracting = false;
      wxState.extractMemoryStep = 2;
      
      // 如果是碎片记忆，让 AI 再干点活：自动提炼关键词！
      if (wxState.extractMemoryConfig.type === 'fragment') {
         const kwPrompt = `请从以下总结中提取2-3个核心名词作为触发关键词，用英文逗号分隔，绝不输出其他多余废话。\n${wxState.extractMemoryContent}`;
         const resKw = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: kwPrompt }], temperature: 0.3 })
        });
        const kwData = await resKw.json();
        wxState.extractMemoryConfig.keywords = kwData.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
      }
      window.render();
    } catch (e) {
      wxState.isExtracting = false;
      window.actions.showToast('提取失败：' + e.message);
      window.render();
    }
  },
  saveExtractedMemory: () => {
     store.memories = store.memories || [];
     const content = document.getElementById('extract-mem-content').value.trim();
     const kws = document.getElementById('extract-mem-keywords') ? document.getElementById('extract-mem-keywords').value.trim() : '';
     if (!content) return window.actions.showToast('总结内容不能为空哦');
     
     store.memories.push({
       id: Date.now(),
       charId: wxState.activeChatId,
       type: wxState.extractMemoryConfig.type,
       content: content,
       keywords: kws,
       createdAt: Date.now()
     });
     
     window.actions.showToast('记忆已保存！');
     window.wxActions.closeExtractMemoryModal();
  },
  // ================= 📖 一起看书核心引擎 =================
  openBookshelf: () => { saveScroll(); wxState.view = 'bookshelf'; window.render(); restoreScroll(); },
  uploadBookTxt: (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return window.actions.showToast('文件过大，请截取 5MB 以内的片段上传哦');
      
      const parseAndSave = (text) => {
          const pages = [];
          let current = '';
          const paragraphs = text.split('\n');
          for(let p of paragraphs) {
              // 🌟 将单页字数从 400 提高到了 1200，大约是原来的三倍！
              if(current.length + p.length > 1200 && current.trim().length > 0) {
                  // 🌟 核心修复：用 .trim() 强制切掉首尾所有多余的空格和回车，绝不让它带到下一页开头！
                  pages.push(current.trim());
                  current = p + '\n';
              } else {
                  current += p + '\n';
              }
          }
          if(current.trim()) pages.push(current.trim()); // 最后一页也要脱水
          
          store.books = store.books || [];
          store.books.push({ id: 'book_' + Date.now(), title: file.name.replace('.txt', ''), pages: pages, progress: 0 });
          window.actions.showToast('书籍导入成功！');
          window.render();
      };

      const reader = new FileReader();
      reader.onload = (e) => {
          const text = e.target.result;
          if (text.includes('')) {
              const readerGBK = new FileReader();
              readerGBK.onload = (e2) => parseAndSave(e2.target.result);
              readerGBK.readAsText(file, 'gbk'); 
          } else {
              parseAndSave(text);
          }
      };
      reader.readAsText(file, 'utf-8'); 
      event.target.value = '';
  },
  deleteBook: (id) => {
      if(confirm('确定从书架删除这本书吗？')) {
          store.books = store.books.filter(b => b.id !== id);
          window.render();
      }
  },
  openBookSelectModal: () => { wxState.showPlusMenu = false; wxState.showBookSelectModal = true; window.render(); },
  closeBookSelectModal: () => { wxState.showBookSelectModal = false; window.render(); },
  selectBookForReading: (id) => { wxState.tempSelectedBookId = id; wxState.showBookSelectModal = false; wxState.showBookModeModal = true; window.render(); },
  closeBookModeModal: () => { wxState.showBookModeModal = false; window.render(); },
  startReading: (mode) => {
      const book = store.books.find(b => b.id === wxState.tempSelectedBookId);
      if(!book) return;
      wxState.reading = { active: true, bookId: book.id, mode: mode, isMinimized: false };
      wxState.showBookModeModal = false;
      window.wxActions.syncReadingToStore();
      window.render();
      
      if(mode === 'listen') window.wxActions.playCurrentPageAudio();
      else if(mode === 'active') window.wxActions.triggerActiveReadingAI();
      else window.actions.showToast('已开启安静陪伴模式');
  },
  stopReading: () => {
      if(wxState.readingAudio) { wxState.readingAudio.pause(); wxState.readingAudio = null; }
      wxState.reading = { active: false };
      window.wxActions.syncReadingToStore();
      window.render();
  },
  toggleReadingSize: () => { wxState.reading.isMinimized = !wxState.reading.isMinimized; window.render(); },
  nextBookPage: () => {
      const book = store.books.find(b => b.id === wxState.reading?.bookId);
      if(book && book.progress < book.pages.length - 1) {
          if(wxState.readingAudio) { wxState.readingAudio.pause(); wxState.readingAudio = null; }
          book.progress++;
          window.wxActions.syncReadingToStore();
          window.render();
          if(wxState.reading.mode === 'listen') window.wxActions.playCurrentPageAudio();
          else if(wxState.reading.mode === 'active') window.wxActions.triggerActiveReadingAI();
      } else { window.actions.showToast('已经是最后一页啦'); }
  },
  prevBookPage: () => {
      const book = store.books.find(b => b.id === wxState.reading?.bookId);
      if(book && book.progress > 0) {
          if(wxState.readingAudio) { wxState.readingAudio.pause(); wxState.readingAudio = null; }
          book.progress--;
          window.wxActions.syncReadingToStore();
          window.render();
          if(wxState.reading.mode === 'listen') window.wxActions.playCurrentPageAudio();
      } else { window.actions.showToast('已经是第一页啦'); }
  },
  syncReadingToStore: () => {
      if (wxState.reading?.active) {
          const book = store.books.find(b => b.id === wxState.reading.bookId);
          if(book) store.activeReading = { active: true, bookName: book.title, text: book.pages[book.progress] };
      } else {
          store.activeReading = { active: false };
      }
  },
  triggerActiveReadingAI: () => {
      window.wxActions.getReply(true, null, '(系统自动触发：用户翻到了新的一页，请你主动发表关于当前页面的简短感想、吐槽或提问，不要超过30个字。)');
  },
  playCurrentPageAudio: () => {
      const book = store.books.find(b => b.id === wxState.reading?.bookId);
      const char = store.contacts.find(c => c.id === wxState.activeChatId);
      if(!book || !char || !char.minimaxVoiceId) return window.actions.showToast('该角色未配置 Minimax 音色，无法听书哦');
      
      const text = book.pages[book.progress];
      window.actions.showToast('正在生成语音，请稍候...');
      fetchMinimaxVoice(text, char.minimaxVoiceId).then(url => {
          if(url && wxState.reading?.active) { 
              wxState.readingAudio = new Audio(url);
              wxState.readingAudio.play();
              wxState.readingAudio.onended = () => { if(wxState.reading?.active) window.wxActions.nextBookPage(); };
          }
      });
  },

  // ================= 朋友圈核心引擎 (含 AI 交互) =================
  handleMomentBgUpload: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
       store.momentBg = base64; window.render(); 
    });
    event.target.value = '';
  },
  handleMomentImageUpload: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
       wxState.tempMomentImage = base64; window.render(); 
    });
    event.target.value = '';
  },
  // 朋友圈支持虚拟照片
  openPublishMoment: () => { saveScroll(); wxState.tempMomentImage = null; wxState.tempMomentVirtual = null; wxState.view = 'momentPublish'; window.render(); },
  // 安全操作虚拟照片与本地图片的开关
  setTempMomentVirtual: () => { wxState.tempMomentVirtual = ''; window.render(); },
  clearTempMomentVirtual: () => { wxState.tempMomentVirtual = null; window.render(); },
  clearTempMomentImage: () => { wxState.tempMomentImage = null; window.render(); },
  submitMoment: async () => {
    const text = document.getElementById('publish-moment-text').value.trim();
    const virtualInput = document.getElementById('moment-virtual-input');
    const virtualText = virtualInput ? virtualInput.value.trim() : null;
    if (!text && !wxState.tempMomentImage && !virtualText) return window.actions.showToast('写点什么或发张图吧');
    store.moments = store.moments || [];
    const newId = Date.now();
    const my = store.personas[0];
    const pType = wxState.momentPrivacyType || 'public';
    const pGroups = wxState.momentPrivacyGroups || [];
    const newMoment = { 
       id: newId, senderId: my.id, senderName: my.name, avatar: my.avatar, 
       text: text, imageUrl: wxState.tempMomentImage, virtualImageText: virtualText, 
       time: '刚刚', likes: [], comments: [], privacyType: pType, privacyGroups: pGroups 
    };
    store.moments.push(newMoment);
    wxState.view = 'main'; window.render(); restoreScroll();
    let promptText = text;
    if (virtualText) promptText += ` [配图是一张虚拟照片：${virtualText}]`;
    else if (wxState.tempMomentImage) promptText += ` [配图是一张照片]`;
    let allowedChars = store.contacts;
    if (pType === 'visible') allowedChars = store.contacts.filter(c => pGroups.includes(c.groupId));
    else if (pType === 'invisible') allowedChars = store.contacts.filter(c => !pGroups.includes(c.groupId));
    // 导入真正的 LLM 引擎
    const { callLLM } = await import('../utils/llm.js');   
    allowedChars.forEach((char, index) => {
       const chat = store.chats.find(c => c.charId === char.id);
       // 将朋友圈动态作为隐形消息塞入聊天流
       if (chat) {
           chat.messages.push({
               id: Date.now() + index, 
               sender: 'system',
               text: `(系统记忆：用户刚刚发了一条朋友圈动态：“${promptText}”。如果你现在要找我搭话，或者我们正在聊天，你可以顺着这个话题自然地关心我一下。如果我们在聊别的，无需强行打断。)`,
               isMe: true, isHidden: true, msgType: 'system', time: getNowTime()
           });
       }
       // 利用时间差，制造出“大家陆陆续续看到并评论”的拟真感
       setTimeout(async () => {
           try {
              const chat = store.chats.find(c => c.charId === char.id);
              // 把他们各自的聊天记录带上，让他们拥有记忆
              const tempHistory = [...(chat ? chat.messages.filter(m=>!m.isHidden && !m.isOffline) : [])];
              tempHistory.push({
                  isMe: true, 
                  text: `(系统指令：我刚刚发布了一条朋友圈：“${promptText}”。请你作为列表里的好友，结合我们以往的聊天上下文，给出简短的评论，绝不加引号，纯口语，20字以内。如果你觉得没啥可说的，可以直接回复“点赞”两个字。)`
              });
              
              const reply = await callLLM(char.id, tempHistory, false);
              const cleanReply = reply.trim().replace(/^["']|["']$/g, '');
              
              // 智能判断是点赞还是评论
              if (cleanReply.includes('点赞') && cleanReply.length <= 5) {
                  if(!newMoment.likes.includes(char.name)) newMoment.likes.push(char.name);
              } else {
                  newMoment.comments.push({ id: Date.now() + index, senderId: char.id, senderName: char.name, replyTo: null, text: cleanReply });
              }
              window.render();
           } catch(e) { console.error('朋友圈生成失败', e); }
       }, 2000 + index * 1500); // 每个人间隔 1.5 秒陆陆续续冒出来
    });
  },
  submitMomentComment: async () => {
    saveScroll(); 
    const text = document.getElementById('moment-comment-input').value.trim(); if (!text) return;
    const m = store.moments.find(x => x.id === wxState.momentInput.momentId); const my = store.personas[0];
    m.comments.push({ id: Date.now(), senderId: my.id, senderName: my.name, replyTo: wxState.momentInput.replyTo, text: text });
    const replyTarget = wxState.momentInput.replyTo; wxState.momentInput.active = false; window.render(); restoreScroll();
    
    if (m.senderId !== my.id || replyTarget) {
       const charId = replyTarget ? store.contacts.find(c => c.name === replyTarget)?.id : m.senderId;
       const char = store.contacts.find(c => c.id === charId);
       if (char) {
           const { callLLM } = await import('../utils/llm.js');
           setTimeout(async () => {
               try {
                  const chat = store.chats.find(c => c.charId === char.id);
                  const tempHistory = [...(chat ? chat.messages.filter(m=>!m.isHidden && !m.isOffline) : [])];
                  tempHistory.push({
                      isMe: true, 
                      text: `(系统指令：你在朋友圈收到了我的回复：“${text}”。请结合我们以往的聊天上下文，立刻怼回去或回复我，绝不加引号，纯口语，20字以内。)`
                  });
                  const reply = await callLLM(char.id, tempHistory, false);
                  const cleanReply = reply.trim().replace(/^["']|["']$/g, '');
                  
                  saveScroll();
                  m.comments.push({ id: Date.now(), senderId: char.id, senderName: char.name, replyTo: my.name, text: cleanReply });
                  window.render(); restoreScroll();
               } catch(e) {}
           }, 2000);
       }
    }
  },
  // 让 AI 全员一起发朋友圈
  triggerAIMoment: async () => {
    const chars = store.contacts; 
    if (chars.length === 0) return window.actions.showToast('通讯录还没人哦');
    if (!confirm('确定要召唤通讯录里的【所有人】同时发布一条最新动态吗？(角色越多越耗时)')) return;
    
    window.actions.showToast(`正在呼唤全员发送动态，请稍候...`);
    
    store.moments = store.moments || [];
    let successCount = 0;

    // 错峰并发引擎：大家排队发，防止瞬间并发把 API 接口挤爆报错
    const promises = chars.map(async (char, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 800)); 
        try {
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n【任务】请发一条朋友圈动态。符合你的性格，描述一下你现在在做什么或心情。直接输出内容，绝不加引号，40字以内。` }], temperature: 0.9 })
            });
            const data = await res.json();
            // id 加上 index 防止多条动态时间戳绝对一致导致排序错乱
            store.moments.push({ id: Date.now() + index, senderId: char.id, senderName: char.name, avatar: char.avatar, text: data.choices[0].message.content.trim().replace(/^["']|["']$/g, ''), imageUrl: null, time: '刚刚', likes: [], comments: [] });
            successCount++;
            window.render();
        } catch(e) { console.error(char.name + '发朋友圈失败'); }
    });

    await Promise.all(promises);
    window.actions.showToast(`全员动态更新完毕！共成功发布 ${successCount} 条`);
  },
  // 朋友圈交互
  toggleMomentMenu: (id) => { saveScroll(); wxState.activeMomentMenuId = wxState.activeMomentMenuId === id ? null : id; window.render(); restoreScroll(); },
  likeMoment: (id) => {
    saveScroll();
    const m = store.moments.find(x => x.id === id); const myName = store.personas[0].name;
    if (m.likes.includes(myName)) m.likes = m.likes.filter(n => n !== myName); else m.likes.push(myName);
    wxState.activeMomentMenuId = null; window.render(); restoreScroll();
  },
  openMomentComment: (id, replyTo = null) => { saveScroll(); wxState.momentInput = { active: true, momentId: id, replyTo: replyTo }; wxState.activeMomentMenuId = null; window.render(); restoreScroll(); },
  closeMomentComment: () => { wxState.momentInput.active = false; window.render(); },
  submitMomentComment: async () => {
    saveScroll(); // 锁定滚动
    const text = document.getElementById('moment-comment-input').value.trim(); if (!text) return;
    const m = store.moments.find(x => x.id === wxState.momentInput.momentId); const my = store.personas[0];
    m.comments.push({ id: Date.now(), senderId: my.id, senderName: my.name, replyTo: wxState.momentInput.replyTo, text: text });
    const replyTarget = wxState.momentInput.replyTo; wxState.momentInput.active = false; window.render(); restoreScroll();
    
    // 呼叫 AI 回复
    if (m.senderId !== my.id || replyTarget) {
       const charId = replyTarget ? store.contacts.find(c => c.name === replyTarget)?.id : m.senderId;
       const char = store.contacts.find(c => c.id === charId);
       if (char) {
           setTimeout(async () => {
               try {
                  const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                      body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n【任务】你在朋友圈收到了用户的评论：“${text}”。请立刻怼回去或回复ta，绝不加引号，纯口语，20字以内。` }], temperature: 0.8 })
                  });
                  const data = await res.json();
                  saveScroll();
                  m.comments.push({ id: Date.now(), senderId: char.id, senderName: char.name, replyTo: my.name, text: data.choices[0].message.content.trim().replace(/^["']|["']$/g, '') });
                  window.render(); restoreScroll();
               } catch(e) {}
           }, 2500);
       }
    }
  },
  deleteMoment: (id) => { if(confirm('确定删除这条动态吗？')) { saveScroll(); store.moments = store.moments.filter(x => x.id !== id); window.render(); restoreScroll(); } },
  handleCommentClick: (mId, cId) => {
    saveScroll();
    const m = store.moments.find(x => x.id === mId); const c = m.comments.find(x => x.id === cId);
    if (c.senderId === store.personas[0].id) { if(confirm('删除这条评论？')) { m.comments = m.comments.filter(x => x.id !== cId); window.render(); restoreScroll(); } } 
    else { window.wxActions.openMomentComment(mId, c.senderName); restoreScroll(); }
  },
  favoriteMoment: (id) => {
    saveScroll();
    const m = store.moments.find(x => x.id === id); store.favorites = store.favorites || [];
    store.favorites.push({ id: Date.now(), savedAt: Date.now(), chatName: m.senderName, text: `[朋友圈动态] ${m.text}` });
    window.actions.showToast('已收藏'); wxState.activeMomentMenuId = null; window.render(); restoreScroll();
  },

  // ================= “我”页面核心动作库 =================
  updateMyName: (name) => { store.personas[0].name = name; window.render(); },
  handleMyAvatarUploadMain: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
      store.personas[0].avatar = base64; window.render();
    });
    event.target.value = '';
  },
  // 全局人设弹窗化动作
  editGlobalPrompt: () => { wxState.showGlobalPromptModal = true; window.render(); },
  closeGlobalPrompt: () => { wxState.showGlobalPromptModal = false; window.render(); },
  saveGlobalPrompt: () => {
    store.globalPrompt = document.getElementById('global-prompt-input').value.trim();
    wxState.showGlobalPromptModal = false;
    window.actions.showToast('全局人设已保存！'); window.render();
  },
  openView: (v) => { saveScroll(); wxState.view = v; window.render(); },
  // 收藏夹动作
  toggleFavManage: () => { wxState.favManageMode = !wxState.favManageMode; wxState.selectedFavIds = []; window.render(); },
  toggleSelectFav: (id) => {
    if (wxState.selectedFavIds.includes(id)) wxState.selectedFavIds = wxState.selectedFavIds.filter(i => i !== id);
    else wxState.selectedFavIds.push(id); window.render();
  },
  deleteSelectedFavs: () => {
    store.favorites = (store.favorites || []).filter(f => !wxState.selectedFavIds.includes(f.id));
    wxState.favManageMode = false; wxState.selectedFavIds = []; window.render();
  },
  
  // 身份与马甲动作
  openPersonaEdit: (id) => { saveScroll(); wxState.editingPersonaId = id; wxState.tempPersonaAvatar = null; wxState.view = 'personaEdit'; window.render(); },
  handlePersonaAvatarUpload: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
      wxState.tempPersonaAvatar = base64; window.render();
    });
    event.target.value = '';
  },
  savePersona: () => {
    // 🌟 修复：如果留空，默认使用主身份的真名，而不是“新身份”
    const name = document.getElementById('edit-persona-name').value.trim() || store.personas[0].name;
    const promptStr = document.getElementById('edit-persona-prompt').value.trim();
    if (wxState.editingPersonaId) {
      const p = store.personas.find(p => p.id === wxState.editingPersonaId);
      if (p) { 
        p.name = name; p.prompt = promptStr; 
        if (wxState.tempPersonaAvatar) p.avatar = wxState.tempPersonaAvatar;
      }
    } else { 
      store.personas.push({ id: 'p_' + Date.now(), name, prompt: promptStr, avatar: wxState.tempPersonaAvatar }); 
    }
    window.actions.showToast('身份保存成功'); wxState.view = 'personaManage'; window.render(); restoreScroll();
  },
  
  // 表情包库动作
  addEmojiLib: () => { store.emojiLibs = store.emojiLibs || []; store.emojiLibs.push({ id: 'el_' + Date.now(), name: '新表情包库', emojis: [] }); window.render(); },
  renameEmojiLib: (id, name) => { const lib = store.emojiLibs.find(l => l.id === id); if (lib) lib.name = name; },
  deleteEmojiLib: (id) => { store.emojiLibs = store.emojiLibs.filter(l => l.id !== id); window.render(); },
  openEmojiEdit: (id) => { saveScroll(); wxState.editingEmojiLibId = id; wxState.view = 'emojiEdit'; window.render(); },
  addEmojiUrl: () => {
    const url = prompt("请输入表情包图片 URL 链接："); if (!url) return;
    const lib = store.emojiLibs.find(l => l.id === wxState.editingEmojiLibId);
    if (lib) { lib.emojis.push(url); window.render(); }
  },
  deleteEmojiUrl: (index) => {
    const lib = store.emojiLibs.find(l => l.id === wxState.editingEmojiLibId);
    if (lib) { lib.emojis.splice(index, 1); window.render(); }
  },
  uploadEmojiJson: (event) => {
    const file = event.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      try {
        let data = JSON.parse(e.target.result); store.emojiLibs = store.emojiLibs || [];
        let emojisToAdd = [];
        let libName = file.name.replace('.json', '');

        // 智能解析：兼容你提供的高级带 description 结构
        if (data.version && data.emojis && Array.isArray(data.emojis)) {
           if (data.library && data.library.name) libName = data.library.name;
           emojisToAdd = data.emojis.map(item => ({ url: item.url, name: item.description || item.name || '表情' }));
        } else if (Array.isArray(data)) {
           emojisToAdd = data.map(u => ({ url: u, name: '表情' }));
        } else if (typeof data === 'object') {
           for (let key in data) {
              if (Array.isArray(data[key])) emojisToAdd = emojisToAdd.concat(data[key].map(u => ({url: u, name: '表情'})));
              else if (typeof data[key] === 'string') emojisToAdd.push({ url: data[key], name: key });
           }
        }
        
        // 过滤掉不合法的图
        emojisToAdd = emojisToAdd.filter(u => typeof u.url === 'string' && (u.url.startsWith('http') || u.url.startsWith('data:')));

        if (emojisToAdd.length > 0) {
           store.emojiLibs.push({ id: 'el_' + Date.now(), name: libName, emojis: emojisToAdd });
           window.actions.showToast(`成功导入 ${emojisToAdd.length} 个表情！`); window.render();
        } else { window.actions.showToast('未在文件中找到有效的图片链接！'); }
      } catch (err) { window.actions.showToast('JSON 格式错误，请检查文件！'); }
    };
    r.readAsText(file); event.target.value = '';
  },
  batchAddEmojis: () => {
    const input = document.getElementById('batch-emoji-input').value;
    if (!input.trim()) return window.actions.showToast('请输入内容！');
    const lines = input.split('\n');
    const lib = store.emojiLibs.find(l => l.id === wxState.editingEmojiLibId);
    if (!lib) return;
    let added = 0;
    lines.forEach(line => {
      let text = line.trim(); if (!text) return;
      let url = text, name = '表情';
      // 智能提取名字和链接
      if (text.includes('http')) {
        url = text.substring(text.indexOf('http')).trim();
        let prefix = text.substring(0, text.indexOf('http')).trim();
        if(prefix.endsWith(':') || prefix.endsWith('：')) prefix = prefix.slice(0, -1);
        if(prefix) name = prefix;
      } else {
        const parts = text.split(/[:：]/);
        if (parts.length > 1) { name = parts[0].trim(); url = parts[1].trim(); }
      }
      if (url && (url.startsWith('http') || url.startsWith('data:'))) {
        lib.emojis.push({ url: url, name: name }); added++;
      }
    });
    window.actions.showToast(`成功导入 ${added} 个表情！`); window.render();
  },

  // 设置页面控制与图片上传逻辑
  openSettings: () => { saveScroll(); wxState.view = 'chatSettings'; window.render(); },
  closeSettings: () => { wxState.view = 'chatRoom'; window.render(); restoreScroll(); },
  triggerAvatarUpload: (targetId) => { document.getElementById(targetId).click(); },
  handleSettingImageUpload: (event, targetType) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
      const char = store.contacts.find(c => c.id === wxState.activeChatId);
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (targetType === 'myAvatar') {
         const boundPersona = store.personas.find(p => p.id === char.boundPersonaId) || store.personas[0];
         boundPersona.avatar = base64;
      }
      if (targetType === 'charAvatar') char.avatar = base64;
      if (targetType === 'groupAvatar') chat.groupAvatar = base64;
      if (targetType === 'myVideo') chat.myVideoAvatar = base64; 
      if (targetType === 'charVideo') chat.charVideoAvatar = base64; 
      window.actions.showToast('图片已加载！'); window.render();
    });
    event.target.value = '';
  },
  clearSettingBg: () => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      targetObj.bgImage = null; 
      window.actions.showToast('该专属背景已清除！');
      window.render();
      restoreScroll();
  },
  handleSettingBgUpload: (event) => {
    saveScroll();
    const file = event.target.files[0]; if (!file) { restoreScroll(); return; }
    window.actions.compressImage(file, (base64) => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      targetObj.bgImage = base64; 
      window.actions.showToast('专属背景图已加载！记得点保存~');
      window.render(); restoreScroll();
    });
    event.target.value = '';
  },
  updateCustomCSS: (val) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      targetObj.customCSS = val;
      window.render();
      restoreScroll();
  },

  saveSettings: () => {
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);

    if (chat.isGroup) {
        chat.groupName = document.getElementById('set-group-name').value.trim() || '群聊';
        chat.groupNotice = document.getElementById('set-group-notice').value.trim();
    } else {
        chat.myRemark = document.getElementById('set-my-name').value.trim();
        chat.charRemark = document.getElementById('set-char-name').value.trim();
    }

    targetObj.contextLimit = parseInt(document.getElementById('set-context-limit').value) || 25;
    targetObj.autoMsgEnabled = document.getElementById('set-auto-msg').checked;
    const intervalVal = parseFloat(document.getElementById('set-auto-interval').value);
    targetObj.autoMsgInterval = isNaN(intervalVal) ? 5 : intervalVal;
    
    if (targetObj.disableEmoji) { targetObj.emojis = "disabled"; } else {
      const allowedNames = [];
      (targetObj.mountedEmojis || []).forEach(libId => { 
         const lib = (store.emojiLibs || []).find(l => l.id === libId);
         if (lib) allowedNames.push(...lib.emojis.map(e => typeof e === 'object' ? e.name : '表情'));
      });
      if (allowedNames.length > 0) { targetObj.emojis = [...new Set(allowedNames)].join(', '); } else { targetObj.emojis = ""; }
    }
    
    targetObj.customCSS = document.getElementById('set-custom-css').value;
    window.actions.showToast('设置已生效！');
    wxState.view = 'chatRoom'; window.render(); restoreScroll();
  },
  sendMessage: () => {
    const isOffline = wxState.view === 'offlineStory';
    const isCall = wxState.view === 'call';
    const input = document.getElementById(isOffline ? 'offline-input' : 'wx-input');
    const text = input?.value.trim();
    if (!text) return;

    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    if (chat) {
      let quoteData = null;
      if (wxState.quoteMsgId) {
        const qMsg = chat.messages.find(m => m.id === wxState.quoteMsgId);
        if (qMsg) {
          // 限制引用字数，防止太长撑爆气泡
          let shortText = qMsg.text.length > 30 ? qMsg.text.substring(0, 30) + '...' : qMsg.text;
          quoteData = { sender: qMsg.sender, text: shortText };
        }
      }
      chat.messages.push({
        id: Date.now(), sender: store.personas[0].name, text: text,
        isMe: true, source: 'wechat', 
        isOffline: isOffline, 
        isCallMsg: isCall, msgType: 'text', time: getNowTime(),
        quote: quoteData
      });
      input.value = ''; 
      wxState.quoteMsgId = null; 
      saveScroll();
      window.render();
      restoreScroll();
      document.getElementById(isOffline ? 'offline-input' : 'wx-input')?.focus();
      window.wxActions.scrollToBottom();
      
      // 🌟 修复暂存机制：如果是线上聊天室，发完就停（仅暂存）；如果是打电话或线下，才自动触发 AI！
      if (wxState.view !== 'chatRoom') {
          if (chat.isGroup) {
              const directorId = chat.memberIds[Math.floor(Math.random() * chat.memberIds.length)];
              setTimeout(() => window.wxActions.getReply(false, directorId, null, null, chat.charId), 500);
          } else {
              setTimeout(() => window.wxActions.getReply(false, null, null, null, chat.charId), 500);
          }
      } else {
          // 🌟 用户在线上发了消息，虽然不立即请求 AI 回复，但必须要向云端投递最新闹钟（砸碎旧闹钟）！
          window.scheduleCloudTask(chat.charId);
      }
    }
  },

  // 🌟 修复 Bug：加入了 saveScroll() 和 restoreScroll()
  openVirtualModal: (type) => { saveScroll(); wxState.showPlusMenu = false; wxState.virtualModalType = type; window.render(); restoreScroll(); },
  closeVirtualModal: () => { saveScroll(); wxState.virtualModalType = 'none'; window.render(); restoreScroll(); },
  openTransferModal: (msgId) => { saveScroll(); wxState.activeTransferId = msgId; window.render(); restoreScroll(); },
  closeTransferModal: () => { saveScroll(); wxState.activeTransferId = null; window.render(); restoreScroll(); },

  handleImageUpload: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, (base64) => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (chat) {
        chat.messages.push({ id: Date.now(), sender: store.personas[0].name, text: '发送了一张真实照片', imageUrl: base64, isMe: true, source: 'wechat', isOffline: false, msgType: 'real_image', time: getNowTime() });
        wxState.showPlusMenu = false; window.render(); window.wxActions.scrollToBottom();
      }
    });
    event.target.value = '';
  },

  handleTransferAction: (action) => {
    saveScroll(); // 修复弹窗操作导致的滚动跳跃
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    const msg = chat.messages.find(m => m.id === wxState.activeTransferId);
    if (!msg) return;

    msg.transferState = action === 'accept' ? 'accepted' : 'returned';
    const amount = parseFloat(msg.transferData.amount);

    if (action === 'accept') {
      if (msg.isMe) { store.wallet.balance -= amount; store.wallet.transactions.push({ type: 'out', amount, title: `转账给对方`, date: new Date().toISOString() });
      } else { store.wallet.balance += amount; store.wallet.transactions.push({ type: 'in', amount, title: `收到转账`, date: new Date().toISOString() }); }
    }
    const sysText = action === 'accept' ? `${msg.isMe ? '对方' : store.personas[0].name} 已收款` : `${msg.isMe ? '对方' : store.personas[0].name} 已退还了转账`;
    chat.messages.push({ id: Date.now(), sender: 'system', text: sysText, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    wxState.activeTransferId = null; window.render(); restoreScroll();
  },

  sendVirtualMedia: () => {
    // 发送消息不需要记忆位置，直接滚到底部
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    if (!chat) return;
    if (wxState.virtualModalType === 'transfer') {
      const amount = document.getElementById('transfer-amount').value.trim();
      const note = document.getElementById('transfer-note').value.trim() || '转账';
      if (!amount || isNaN(amount) || Number(amount) <= 0) return window.actions.showToast('请输入有效的金额！');
      chat.messages.push({ id: Date.now(), sender: store.personas[0].name, text: `[发起转账] 金额：${amount}元，备注：${note}`, transferData: { amount, note }, transferState: 'pending', isMe: true, source: 'wechat', isOffline: false, msgType: 'transfer', time: getNowTime() });
    } else {
      const input = document.getElementById('virtual-input');
      const desc = input.value.trim();
      if (!desc) return window.actions.showToast('内容不能为空哦！');
      // 🌟 根据模式发送不同气泡
      let mType = 'text';
      if (wxState.virtualModalType === 'image') mType = 'virtual_image';
      if (wxState.virtualModalType === 'voice') mType = 'voice';
      if (wxState.virtualModalType === 'location') mType = 'location'; // 🌟 发送定位
      
      chat.messages.push({ id: Date.now(), sender: store.personas[0].name, text: desc, isMe: true, source: 'wechat', isOffline: false, msgType: mType, time: getNowTime() });
    }
    wxState.virtualModalType = 'none'; 
    window.render(); 
    window.wxActions.scrollToBottom(); 
  },

  startCall: (type) => { 
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages.push({ id: Date.now(), sender: 'system', text: `你发起了${type === 'video' ? '视频' : '语音'}通话`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    wxState.view = 'call'; wxState.callType = type; wxState.callStartTime = Date.now(); wxState.showPlusMenu = false; 

    // 🌟 核心防御：趁着你点拨打的瞬间，给全局播放器喂一口静音，抢占浏览器白名单！
    if (!window.wxCallPlayer) window.wxCallPlayer = new Audio();
    window.wxCallPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    window.wxCallPlayer.play().catch(()=>{});

    wxState.callDurationSeconds = 0;
    if(wxState.callTimerId) clearInterval(wxState.callTimerId);
    wxState.callTimerId = setInterval(() => {
      wxState.callDurationSeconds++;
      const el = document.getElementById('call-duration-display');
      if(el) {
        const m = String(Math.floor(wxState.callDurationSeconds / 60)).padStart(2, '0');
        const s = String(wxState.callDurationSeconds % 60).padStart(2, '0');
        el.innerText = `${m}:${s}`;
      }
    }, 1000);
    window.render(); window.wxActions.scrollToBottom();
  },
  
  acceptCall: () => {
    try { wxState.ringtone.pause(); wxState.ringtone.currentTime = 0; } catch(e){} 
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages.push({ id: Date.now(), sender: 'system', text: `已接通${wxState.callType === 'video' ? '视频' : '语音'}通话`, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    wxState.view = 'call'; wxState.callStartTime = Date.now(); 
    
    // 🌟 核心防御：趁着接听的瞬间，抢占白名单！
    if (!window.wxCallPlayer) window.wxCallPlayer = new Audio();
    window.wxCallPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    window.wxCallPlayer.play().catch(()=>{});

    wxState.callDurationSeconds = 0;
    if(wxState.callTimerId) clearInterval(wxState.callTimerId);
    wxState.callTimerId = setInterval(() => {
      wxState.callDurationSeconds++;
      const el = document.getElementById('call-duration-display');
      if(el) el.innerText = `${String(Math.floor(wxState.callDurationSeconds / 60)).padStart(2, '0')}:${String(wxState.callDurationSeconds % 60).padStart(2, '0')}`;
    }, 1000);
    window.render();
    if (wxState.pendingCallMsg) {
      setTimeout(() => {
        chat.messages.push({ id: Date.now() + 1, sender: store.contacts.find(c=>c.id===wxState.activeChatId).name, text: wxState.pendingCallMsg, isMe: false, source: 'wechat', isOffline: false, isCallMsg: true, msgType: 'text', time: getNowTime() });
        wxState.pendingCallMsg = ''; window.render(); window.wxActions.scrollToBottom();
      }, 600); 
    }
  },
  declineCall: () => {
    try { wxState.ringtone.pause(); wxState.ringtone.currentTime = 0; } catch(e){}
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages.push({ id: Date.now(), sender: 'system', text: `已拒绝通话`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    if(wxState.callTimerId) { clearInterval(wxState.callTimerId); wxState.callTimerId = null; }
    wxState.view = 'chatRoom'; wxState.callType = null; window.render(); window.wxActions.scrollToBottom();
  },
  endCall: () => {
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages.push({ id: Date.now(), sender: 'system', text: `通话已挂断`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    // 🌟 挂断时释放播放器
    if (window.wxCallPlayer) { window.wxCallPlayer.pause(); window.wxCallPlayer.src = ''; }
    if(wxState.callTimerId) { clearInterval(wxState.callTimerId); wxState.callTimerId = null; }
    wxState.view = 'chatRoom'; wxState.callType = null; wxState.callStartTime = null; window.render(); window.wxActions.scrollToBottom();
  },
  
  enterOffline: () => { wxState.view = 'offlineStory'; wxState.showPlusMenu = false; window.render(); window.wxActions.scrollToBottom(); },
  exitOffline: () => { wxState.view = 'chatRoom'; window.render(); window.wxActions.scrollToBottom(); },
  
  // 🌟 线下剧情模式专属设置动作
  openOfflineSettings: () => { 
      saveScroll(); 
      wxState.showOfflineSettingsModal = true; 
      wxState.activeOfflineWbGroup = '全部'; // 🌟 每次打开默认显示全部
      window.render(); 
      restoreScroll(); 
  },
  closeOfflineSettings: () => { saveScroll(); wxState.showOfflineSettingsModal = false; window.render(); restoreScroll(); },
  setOfflineWbMountGroup: (g) => {
      saveScroll();
      wxState.activeOfflineWbGroup = g;
      window.render();
      restoreScroll();
  },
  toggleOfflineWbMount: (wbId) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if (!targetObj.offlineWorldbooks) targetObj.offlineWorldbooks = [];
      const numId = Number(wbId) || wbId; // 强行转数字防Bug
      if (targetObj.offlineWorldbooks.includes(numId)) targetObj.offlineWorldbooks = targetObj.offlineWorldbooks.filter(id => id !== numId);
      else targetObj.offlineWorldbooks.push(numId);
      window.render();
      restoreScroll();
  },
  saveOfflineSettings: () => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      targetObj.offlineCSS = document.getElementById('set-offline-css').value;
      window.actions.showToast('线下设置已保存！');
      wxState.showOfflineSettingsModal = false;
      window.render();
      restoreScroll();
  },
  // 🌟 线下模式专属进阶设置
  handleOfflineBgUpload: (event) => {
      const file = event.target.files[0]; if (!file) return;
      window.actions.compressImage(file, (base64) => {
          const chat = store.chats.find(c => c.charId === wxState.activeChatId);
          const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
          targetObj.offlineBg = base64;
          window.actions.showToast('线下专属背景已加载！');
          window.render();
      });
      event.target.value = '';
  },
  clearOfflineBg: () => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      targetObj.offlineBg = null;
      window.actions.showToast('已清除背景');
      window.render();
  },
  updateOfflineTextColor: (type, color) => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if(type === 'dialogue') targetObj.offlineDialogueColor = color;
      if(type === 'thought') targetObj.offlineThoughtColor = color;
      window.render();
  },
  // 🌟 修复5：增加 explicitIsOffline 参数，完美锁死线下模式，绝不乱入线上！
  getReply: async (isAuto = false, targetSpeakerId = null, customPrompt = null, preGeneratedText = null, explicitChatId = null, explicitIsOffline = null) => {
    const chatId = explicitChatId || wxState.activeChatId;
    const chat = store.chats.find(c => c.charId === chatId);
    if (!chat) return;

    let charId = targetSpeakerId;
    if (!charId) {
        if (chat.isGroup) {
            let avail = chat.memberIds.filter(id => id !== chat.lastGroupSpeaker);
            if(avail.length === 0) avail = chat.memberIds;
            charId = avail[Math.floor(Math.random() * avail.length)];
        } else { charId = chat.charId; }
    }
    const char = store.contacts.find(c => c.id === charId);
    if (!char) return;

    chat.lastGroupSpeaker = charId; 
    const isActive = wxState.activeChatId === chatId;
    // 🌟 修复5：通过 explicitIsOffline 强制读取维度坐标，防止线下和线上跨次元串台
    const isOffline = explicitIsOffline !== null ? explicitIsOffline : (wxState.view === 'offlineStory' && isActive);
    const isCall = wxState.view === 'call' && isActive && !chat.isGroup;

    const validMsgs = chat.messages.filter(m => !m.isHidden && !(m.msgType || '').includes('system'));
    const lastSumIndex = chat.lastSummarizedIndex || 0;
    if (validMsgs.length - lastSumIndex >= 20) {
       chat.lastSummarizedIndex = validMsgs.length;
       triggerAutoMemory(charId, validMsgs.slice(lastSumIndex, validMsgs.length));
    }

    let hiddenMsgId = null;
    if (isAuto || customPrompt) {
      hiddenMsgId = Date.now();
      chat.messages.push({ 
        id: hiddenMsgId, sender: store.personas[0].name, 
        text: customPrompt || "(系统自动触发：请主动搭话)", 
        isMe: true, source: 'wechat', isOffline: isOffline, msgType: 'text', isHidden: true 
      });
    }

    let delegatedToCloud = false; 

    try {
      let replyText = '';

      if (preGeneratedText) {
          replyText = preGeneratedText;
          if (hiddenMsgId) chat.messages = chat.messages.filter(m => m.id !== hiddenMsgId);
      } else {
          wxState.typingStatus = wxState.typingStatus || {};
          wxState.cloudTaskStartTimes = wxState.cloudTaskStartTimes || {};
          
          // 🌟 核心修复 1：以当前聊天室的 ID 为钥匙，彻底隔离！
          if (chat.isGroup) {
              // 群聊：在这个房间里，存入所有正在打字的人的名单
              wxState.typingStatus[chat.charId] = [...chat.memberIds];
              wxState.cloudTaskStartTimes[chat.charId] = Date.now();
          } else {
              // 单聊：给这个房间亮起打字灯
              wxState.typingStatus[chat.charId] = true;
              wxState.cloudTaskStartTimes[chat.charId] = Date.now();
          }
          
          if (isActive) { saveScroll(); window.render(); restoreScroll(); window.wxActions.scrollToBottom(); }
          else { window.render(); } 
          
          let groupInfo = null;
          if (chat.isGroup) {
              const allNames = chat.memberIds.map(id => store.contacts.find(c => c.id === id)?.name).filter(Boolean).join('、');
              groupInfo = { id: chat.charId, name: chat.groupName, allNames: allNames, notice: chat.groupNotice || '' };
          }

          // 🌟 直接从屏幕抓取小说文字，让 AI “看”到你的屏幕
          let readingInfo = null;
          if (wxState.reading && wxState.reading.active) {
              const bookBox = document.getElementById('book-read-scroll');
              if (bookBox) {
                  let text = bookBox.innerText.trim().replace(/\n+/g, ' ');
                  if (text.length > 500) text = text.substring(0, 500) + '...';
                  readingInfo = { text: text };
              }
          }

          const { buildLLMPayload } = await import('../utils/llm.js');
          // 🌟 把抓到的 readingInfo 传给大模型
          const llmMessages = await buildLLMPayload(charId, chat.messages, isOffline, isCall, groupInfo, readingInfo);
          
          // 🌟 满足你的硬核架构：全面交由云端排队代跑！
          if (hiddenMsgId) chat.messages = chat.messages.filter(m => m.id !== hiddenMsgId);
          
          // ⚠️ 极其核心的 await 拦截：绝不允许它偷偷溜走！如果它敢报错，直接会被最下面的 catch 抓去弹红字！
          await planCloudBrain(0, char, llmMessages, chat.charId + '|' + char.id + '|' + (isOffline ? '1' : '0'));
          
          // 只有服务器明确返回了 200 OK 接单成功，才允许打上“已托管”标记！
          delegatedToCloud = true; 
          return; 
      }
      
      // 🌟 物理切除世界书里的 `{思考链}` 
      replyText = replyText.replace(/`\{[\s\S]*?\}`/gi, '').trim();

      const thoughtRegex = /\[心声\]\s*(\{.*?\})/s;
      const thoughtMatch = replyText.match(thoughtRegex);
      if (thoughtMatch) {
          try {
              chat.latestInnerThought = JSON.parse(thoughtMatch[1]);
              chat.latestInnerThoughtTime = Date.now(); 
          } catch(e) {}
          replyText = replyText.replace(thoughtRegex, '').trim();
      }

      let remainingText = replyText
          .replace(/\[\d{1,2}:\d{2}\][:：]?\s*/g, '')
          .replace(/\[系统提示.*?\][:：]?\s*/g, '')
          .replace(/\[好友申请\][:：]?\s*/g, '')
          .trim();

      let codeBlocks = [];
      
      remainingText = remainingText.replace(/```[a-z]*\n?([\s\S]*?)```/gi, (match, code) => {
          let id = `__CODE_BLOCK_${codeBlocks.length}__`;
          // 🌟 核心防爆护盾：给提取出来的 HTML 强行套上 white-space: normal! 
          // 这样它就彻底免疫了外部 whitespace-pre-wrap 的破坏，代码里怎么 \n 都不会断层！
          codeBlocks.push(`<div style="white-space: normal !important; line-height: 1.5;">${code.trim()}</div>`); 
          return `\n${id}\n`;
      });
      
      remainingText = remainingText.replace(/(<div[\s\S]*?<\/div>)/gi, (match) => {
          let id = `__CODE_BLOCK_${codeBlocks.length}__`;
          // 🌟 同样给裸露的 div 套上护盾
          codeBlocks.push(`<div style="white-space: normal !important; line-height: 1.5;">${match.trim()}</div>`); 
          return `\n${id}\n`;
      });

      let msgsToPush = [];
      let delayedActions = [];
      let hasSystemAction = false;
      
      if (/\[发起(语音|视频)?通话\]/.test(remainingText)) {
        if (wxState.view === 'call') {
          remainingText = remainingText.replace(/\[发起(语音|视频)?通话\][:：]?\s*/g, '').trim();
        } else {
          const match = remainingText.match(/\[发起(语音|视频)?通话\]/);
          let parts = remainingText.split(/\[发起(语音|视频)?通话\][:：]?\s*/);
          if (parts[0].trim()) { chat.messages.push({ id: Date.now(), sender: char.name, text: parts[0].trim(), isMe: false, source: 'wechat', isOffline: false, msgType: 'text', time: getNowTime() }); }
          wxState.pendingCallMsg = parts[2] ? parts[2].trim() : '';
          wxState.view = 'incomingCall'; wxState.callType = match[1] === '视频' ? 'video' : 'voice'; wxState.isTyping = false; 
          try { 
            const ap = store.appearance || {};
            wxState.ringtone.src = ap.callSound || 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3';
            wxState.ringtone.play(); 
          } catch(e){}
          return window.render(); 
        }
      }
      
      if (/\[(语音|视频)?通话(已)?结束\]/.test(remainingText)) { delayedActions.push('end_call'); remainingText = remainingText.replace(/\[(语音|视频)?通话(已)?结束\][:：]?\s*/g, '').trim(); }
      if (/\[(点击收款|接收转账)\]/.test(remainingText)) { delayedActions.push('accept_transfer'); remainingText = remainingText.replace(/\[(点击收款|接收转账)\][:：]?\s*/g, '').trim(); }
      
      if (/\[(?:发朋友圈|发布朋友圈)\]/.test(remainingText)) {
        const match = remainingText.match(/\[(?:发朋友圈|发布朋友圈)\][:：]?\s*([^\n\[\]]+)/);
        if (match) {
          store.moments = store.moments || [];
          store.moments.push({ id: Date.now(), senderId: char.id, senderName: char.name, avatar: char.avatar, text: match[1].trim(), imageUrl: null, time: '刚刚', likes: [], comments: [] });
          hasSystemAction = true;
        }
        remainingText = remainingText.replace(/\[(?:发朋友圈|发布朋友圈)\][:：]?\s*[^\n\[\]]+/, '').trim();
      }
      
      if (/\[更换头像\]/.test(remainingText)) {
        const match = remainingText.match(/\[更换头像\][:：]?\s*([^\n\[\]]+)/);
        if (match) {
          let newAvatar = match[1].trim();
          if (newAvatar.includes('最新图片')) {
            const lastImgMsg = chat.messages.slice().reverse().find(m => m.msgType === 'real_image');
            newAvatar = (lastImgMsg && lastImgMsg.imageUrl) ? lastImgMsg.imageUrl : '❓';
          }
          char.avatar = newAvatar;
          chat.messages.push({ id: Date.now() + 150, sender: 'system', text: `${char.name} 更改了TA的头像`, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          hasSystemAction = true;
        }
        remainingText = remainingText.replace(/\[更换头像\][:：]?\s*[^\n\[\]]+/, '').trim();
      }

      if (/\[(?:发送表情|表情包)\]/.test(remainingText)) {
        const match = remainingText.match(/\[(?:发送表情|表情包)\][:：]?\s*([^\n\[\]]+)/);
        if (match) {
          const emojiName = match[1].trim();
          let foundUrl = '';
          for (let libId of (char.mountedEmojis || [])) {
             const lib = (store.emojiLibs || []).find(l => l.id === libId);
             if (lib) {
                 const ep = lib.emojis.find(e => (typeof e === 'object' ? e.name : '') === emojiName);
                 if (ep) { foundUrl = ep.url; break; }
             }
          }
          if (foundUrl) {
              chat.messages.push({ id: Date.now() + 150, sender: char.name, text: `[表情包] ${emojiName}`, imageUrl: foundUrl, isMe: false, source: 'wechat', isOffline: false, msgType: 'emoji', time: getNowTime() });
              hasSystemAction = true;
          }
        }
        remainingText = remainingText.replace(/\[(?:发送表情|表情包)\][:：]?\s*[^\n\[\]]*/, '').trim();
      }

      if (/\[修改备注\]/.test(remainingText)) {
        const match = remainingText.match(/\[修改备注\][:：]?\s*([^\n\[\]]+)/);
        if (match) {
          // 🌟 修复3：修改专属备注
          chat.myRemark = match[1].trim().substring(0, 15);
          chat.messages.push({ id: Date.now() + 160, sender: 'system', text: `${char.name} 将你的备注修改为“${chat.myRemark}”`, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          hasSystemAction = true;
        }
        remainingText = remainingText.replace(/\[修改备注\][:：]?\s*[^\n\[\]]+/, '').trim();
      }

      if (/\[撤回上一条消息\]/.test(remainingText)) {
        const aiMsgs = chat.messages.filter(m => !m.isMe && m.msgType !== 'system' && m.msgType !== 'recall_system');
        if (aiMsgs.length > 0) {
          const lastAiMsg = aiMsgs[aiMsgs.length - 1];
          lastAiMsg.recalledText = lastAiMsg.text; 
          lastAiMsg.text = `${char.name} 撤回了一条消息`;
          lastAiMsg.msgType = 'recall_system'; 
          lastAiMsg.quote = null;
        }
        remainingText = remainingText.replace(/\[撤回上一条消息\][:：]?\s*/, '').trim();
        hasSystemAction = true;
      }

      if (/\[戳一戳\]/.test(remainingText)) {
        const verb = char.nudgeAIVerb || '拍了拍';
        const suffix = char.nudgeAISuffix || '';
        chat.messages.push({ id: Date.now() + 50, sender: 'system', text: `${char.name}${verb}了我${suffix}`, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
        remainingText = remainingText.replace(/\[戳一戳\][:：]?\s*/g, '').trim();
        hasSystemAction = true;
      }

      if (wxState.view === 'chatRoom') remainingText = remainingText.replace(/\*[^*]*\*/g, '').replace(/[(（][^)）]*[)）]/g, '').trim();

      if (/\[发起转账\]/.test(remainingText)) {
        let parts = remainingText.split(/\[发起转账\][:：]?\s*/);
        if (parts[0].trim()) msgsToPush.push({ msgType: 'text', text: parts[0].trim() });
        let nextLines = parts[1].split('\n');
        const tStr = nextLines[0] || '';
        const amount = (tStr.match(/金额[:：]?\s*(\d+(\.\d+)?)/) || [])[1] || '520.00';
        const note = (tStr.match(/备注[:：]?\s*([^，,。\]\n]+)/) || [])[1] || '转账给你';
        msgsToPush.push({ msgType: 'transfer', text: `[收到转账] 金额：${amount}元，备注：${note}`, transferData: { amount, note }, transferState: 'pending' });
        let restText = nextLines.slice(1).join('\n').trim();
        if (restText) msgsToPush.push({ msgType: 'text', text: restText });
      } else if (/\[语音\]/.test(remainingText)) {
        let parts = remainingText.split(/\[语音\][:：]?\s*/);
        if (parts[0].trim()) msgsToPush.push({ msgType: 'text', text: parts[0].trim() });
        let nextLines = parts[1].split('\n');
        if (nextLines[0].trim()) msgsToPush.push({ msgType: 'voice', text: nextLines[0].trim() });
        let restText = nextLines.slice(1).join('\n').trim();
        if (restText) msgsToPush.push({ msgType: 'text', text: restText });
      } else if (/\[虚拟照片\]/.test(remainingText)) {
        let parts = remainingText.split(/\[虚拟照片\][:：]?\s*/);
        if (parts[0].trim()) msgsToPush.push({ msgType: 'text', text: parts[0].trim() });
        let nextLines = parts[1].split('\n');
        if (nextLines[0].trim()) msgsToPush.push({ msgType: 'virtual_image', text: nextLines[0].trim() });
        let restText = nextLines.slice(1).join('\n').trim();
        if (restText) msgsToPush.push({ msgType: 'text', text: restText });
      } else if (/\[发送定位\]/.test(remainingText)) {
        let parts = remainingText.split(/\[发送定位\][:：]?\s*/);
        if (parts[0].trim()) msgsToPush.push({ msgType: 'text', text: parts[0].trim() });
        let nextLines = parts[1].split('\n');
        if (nextLines[0].trim()) msgsToPush.push({ msgType: 'location', text: nextLines[0].trim() });
        let restText = nextLines.slice(1).join('\n').trim();
        if (restText) msgsToPush.push({ msgType: 'text', text: restText });
      } else {
        if (remainingText.trim()) {
          if (isOffline) { 
            let finalOfflineText = remainingText.trim();
            codeBlocks.forEach((code, idx) => {
                finalOfflineText = finalOfflineText.replace(`__CODE_BLOCK_${idx}__`, `<br/><div class="mc-html-card my-2 w-full overflow-hidden">${code}</div><br/>`);
            });
            msgsToPush.push({ msgType: 'text', text: finalOfflineText, sender: char.name });
          } else {
            let parts = remainingText.split('\n').filter(p => p.trim());
            let currentSpeakerName = char.name;
            
            parts.forEach(p => {
              let textToPush = p;
              if (chat.isGroup) {
                  const match = p.match(/^([^:：\[\]]{1,15})[:：]\s*(.*)$/);
                  if (match) {
                      const possibleName = match[1].trim();
                      const isMember = chat.memberIds.some(id => {
                          const c = store.contacts.find(x => x.id === id);
                          return c && (c.name === possibleName || c.name.includes(possibleName) || possibleName.includes(c.name));
                      });
                      if (isMember || possibleName === char.name) {
                          currentSpeakerName = possibleName;
                          textToPush = match[2].trim();
                      }
                  }
              }
              if (textToPush) {
                  const fragments = textToPush.split(/(\*[^*]+\*)/); 
                  fragments.forEach(frag => {
                      const t = frag.trim(); if (!t) return;
                      let blockMatch = t.match(/__CODE_BLOCK_(\d+)__/);
                      if (blockMatch) { msgsToPush.push({ sender: currentSpeakerName, msgType: 'html_card', text: codeBlocks[parseInt(blockMatch[1])] }); return; }
                      if (t.startsWith('*') && t.endsWith('*') && isCall) msgsToPush.push({ sender: currentSpeakerName, msgType: 'action', text: t.slice(1, -1) });
                      else msgsToPush.push({ sender: currentSpeakerName, msgType: 'text', text: t });
                  });
              }
            });
          }
        }
      }

      const finalMsgs = [];
      msgsToPush.forEach((m, index) => {
        // 🌟 核心劈气泡引擎：强行拦截所有文本，把换行符劈成独立气泡！
        if (m.msgType === 'text' && !isOffline) {
            // 兼容真实的回车符，以及大模型搞错的反斜杠 \n 和斜杠 /n
            const safeText = m.text.replace(/\\n/g, '\n').replace(/\/n/g, '\n');
            const lines = safeText.split('\n').filter(l => l.trim());

            lines.forEach((line, subIdx) => {
                let textToPush = line.trim();
                let senderName = m.sender || char.name;

                // 顺手补一个群聊发言人识别（防止超能力前后的文字没被切开解析）
                if (chat.isGroup) {
                    const match = textToPush.match(/^([^:：\[\]]{1,15})[:：]\s*(.*)$/);
                    if (match) {
                        senderName = match[1].trim();
                        textToPush = match[2].trim();
                    }
                }

                finalMsgs.push({
                    // 🌟 错开 id 防止渲染覆盖
                    id: Date.now() + index * 100 + subIdx, 
                    sender: senderName, text: textToPush, isMe: false, source: 'wechat', 
                    isOffline: isOffline, isCallMsg: isCall, msgType: m.msgType, 
                    transferData: m.transferData, transferState: m.transferState, time: getNowTime(),
                    isIntercepted: char.isBlocked ? true : false 
                });
            });
        } else {
            // 非文本内容（如照片、语音）或线下模式，原样放行
            finalMsgs.push({ 
              id: Date.now() + index * 100, sender: m.sender || char.name, text: m.text, isMe: false, source: 'wechat', 
              isOffline: isOffline, isCallMsg: isCall, msgType: m.msgType, transferData: m.transferData, transferState: m.transferState, time: getNowTime(),
              isIntercepted: char.isBlocked ? true : false 
            });
        }
      });

      if (char.isBlocked && msgsToPush.length > 0) {
         finalMsgs.push({ id: Date.now() + 999, sender: 'system', text: '好友申请', msgType: 'friend_request', isMe: false, time: getNowTime() });
      }

      for (let i = 0; i < finalMsgs.length; i++) {
         const newMsg = finalMsgs[i];
         chat.messages.push(newMsg);

         if (isActive) { 
             saveScroll(); 
             window.render(); 
             restoreScroll(); 
             window.wxActions.scrollToBottom(); 
         }

         let callAudioPlayed = false;

         if (char.minimaxVoiceId && store.minimaxConfig?.enabled !== false && store.minimaxConfig?.apiKey) {
             if (isCall && newMsg.msgType === 'text') {
                 const url = await fetchMinimaxVoice(newMsg.text, char.minimaxVoiceId);
                 if (url && wxState.view === 'call') { 
                    newMsg.audioUrl = url; 
                    await new Promise(resolve => { 
                        if (!window.wxCallPlayer) window.wxCallPlayer = new Audio();
                        window.wxCallPlayer.src = url;
                        window.wxCallPlayer.onended = resolve;
                        window.wxCallPlayer.onerror = resolve;
                        window.wxCallPlayer.play().catch(() => resolve()); 
                    });
                    callAudioPlayed = true;
                 }
             } else if (newMsg.msgType === 'voice') {
                 (async () => {
                    const url = await fetchMinimaxVoice(newMsg.text, char.minimaxVoiceId);
                    if (url) { newMsg.audioUrl = url; if(isActive) window.render(); }
                 })();
             }
         }

         if (!isCall && newMsg.msgType !== 'system' && newMsg.msgType !== 'friend_request' && newMsg.msgType !== 'recall_system') {
             try { const ap = store.appearance || {}; new Audio(ap.newMsgSound || 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3').play().catch(()=>{}); } catch(e) {}
         }

         // 🌟 修复8：切出后台再回来，瞬间读完，不再卡死流式输出！
         if (i < finalMsgs.length - 1 && !callAudioPlayed && !document.hidden) {
             await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(newMsg.text.length * 60, 600), 2500)));
         }
      }

      if (msgsToPush.length === 0 && !hasSystemAction) {
        chat.messages.push({ id: Date.now() + 100, sender: char.name, text: `[系统] API返回了空消息或被规则拦截，请重roll`, isMe: false, source: 'wechat', isOffline: isOffline, msgType: 'text', time: getNowTime() });
      }

    } catch (error) { 
      let rawErr = error ? (error.message || error.toString()) : "未知网络错误";
      const errMsg = rawErr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      wxState.showPlusMenu = false; wxState.showEmojiMenu = false;
      chat.messages.push({ 
        id: Date.now(), sender: document.hidden ? 'system' : char.name, 
        text: document.hidden ? `连接被系统强行中断。请重roll。` : `[系统] 请求失败: ${errMsg} (请重roll)`, 
        isMe: document.hidden, source: 'wechat', isOffline: isOffline, msgType: document.hidden ? 'system' : 'text', time: getNowTime() 
      });
    } finally {
      if (!delegatedToCloud) {
          wxState.typingStatus = wxState.typingStatus || {};
          // 🌟 核心修复 2：直接清空当前房间的状态，再也不用循环遍历了
          wxState.typingStatus[chat.charId] = false; 
          
          if (isActive) { saveScroll(); window.render(); restoreScroll(); window.wxActions.scrollToBottom(); }
          else { window.render(); }
          
          // 🌟 AI 回复完毕后，重新向云端下发最新定时的闹钟
          setTimeout(() => { window.scheduleCloudTask(chat.charId); }, 1000);
      }
    }
  },
};

// --- 渲染 UI ---
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
  const myAvatar = boundPersona.avatar;


  // 📷 头像渲染辅助函数：修复了强制圆形导致视频也变圆的问题
  const getVidHtml = (val, defaultVal, isBg) => {
    let v = val || defaultVal || '';
    if (v.length > 100 && !v.startsWith('http') && !v.startsWith('data:')) v = 'data:image/jpeg;base64,' + v;
    if (v.includes('http') || v.startsWith('data:')) {
      // 🌟 移除了这里的 rounded-full，让外层的 div 来决定它是圆的还是方的
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
                 <div class="w-12 h-12 bg-gray-100 rounded-[12px] flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden text-2xl" onclick="window.wxActions.triggerAvatarUpload('upload-group-avatar')">${getVidHtml(chatData.groupAvatar, false) || '<i data-lucide="users" class="w-6 h-6 text-blue-400"></i>'}</div>
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
               <span class="text-[15px] font-medium text-gray-800 w-1/3">我的头像</span>
               <div class="flex-1 flex justify-end">
                 <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-my-avatar')">${getVidHtml(myAvatar, false)}</div>
               </div>
             </div>
             <div class="flex justify-between items-center">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">我的备注</span>
               <input id="set-my-name" value="${chatData.myRemark || store.personas[0].name}" class="flex-1 text-right outline-none bg-transparent py-1 text-[15px] text-black font-medium" placeholder="输入备注" />
             </div>

             <div class="flex justify-between items-center border-t border-gray-100 pt-4 mb-2">
               <span class="text-[15px] font-medium text-gray-800 w-1/3">对方头像</span>
               <div class="flex-1 flex justify-end">
                 <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-char-avatar')">${getVidHtml(char.avatar, false)}</div>
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
               <div class="w-12 h-16 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-my-video')">${getVidHtml(chatData.myVideoAvatar || store.personas[0].videoAvatar, myAvatar, false)}</div>
             </div>
             <div class="flex justify-between items-center border-t border-gray-100 pt-4">
               <div class="flex flex-col w-2/3"><span class="text-[15px] font-medium text-gray-800">对方视频画面</span><span class="text-xs text-gray-500">仅本聊天室生效</span></div>
               <div class="w-12 h-16 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden" onclick="window.wxActions.triggerAvatarUpload('upload-char-video')">${getVidHtml(chatData.charVideoAvatar || char.videoAvatar, char.avatar, false)}</div>
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
                 <span class="text-[15px] font-medium text-gray-800">允许主动聊天</span>
                 <input type="checkbox" id="set-auto-msg" ${targetObj.autoMsgEnabled ? 'checked' : ''} class="ios-switch" />
               </div>
               <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                 <span class="text-[15px] font-medium text-gray-800">未读冷落触发时长</span>
                 <div class="flex items-center"><input type="number" id="set-auto-interval" value="${targetObj.autoMsgInterval || 30}" class="w-12 text-center outline-none bg-gray-50 p-1.5 rounded-lg text-[15px] font-medium text-black" /><span class="ml-2 text-[13px] text-gray-500">分钟</span></div>
               </div>
               <div class="flex justify-between items-center border-t border-gray-100 pt-4">
                 <div class="flex flex-col"><span class="text-[15px] font-medium text-gray-800">附带历史记忆条数</span><span class="text-[10px] text-gray-500">1-100，越大越耗Token</span></div>
                 <div class="flex items-center"><input type="number" id="set-context-limit" value="${targetObj.contextLimit || 30}" class="w-12 text-center outline-none bg-gray-50 p-1.5 rounded-lg text-[15px] font-medium text-black" /><span class="ml-2 text-[13px] text-gray-500">回合</span></div>
               </div>
            </div>

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
               <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden shadow-sm mb-3" onclick="document.getElementById('upload-edit-avatar').click()">${getVidHtml(displayAvatar, false)}</div>
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
                  <div class="text-[14px] text-gray-800 leading-relaxed overflow-wrap break-words">${f.text.replace(/<[^>]*>?/gm, '')}</div>
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
                  <div class="flex justify-between items-center cursor-pointer active:opacity-50" onclick="window.actions.showToast('该功能仅做沉浸展示')">
                     <div class="flex items-center space-x-3"><i data-lucide="map-pin" class="w-5 h-5 text-gray-800"></i><span class="text-[16px] text-gray-800 font-medium">所在位置</span></div>
                     <div class="flex items-center space-x-1"><i data-lucide="chevron-right" class="w-5 h-5 text-gray-400"></i></div>
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
          <div class="w-28 h-28 rounded-full overflow-hidden shadow-[0_0_60px_rgba(74,222,128,0.3)] animate-pulse border-2 border-green-500 flex items-center justify-center bg-gray-800">${getVidHtml(char.videoAvatar, char.avatar, false)}</div>
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
    // 🌟 智能读取群聊/单聊的背景、名称和设置载体
    const targetObj = chatData.isGroup ? chatData : char;
    const titleName = chatData.isGroup ? chatData.groupName : char?.name;
    const bgUrl = targetObj?.offlineBg || store.bgImage || '';

    return `
      <div class="mc-offline-container absolute inset-0 w-full h-full flex flex-col font-serif z-[60] animate-in slide-in-from-bottom-4 duration-300" style="background: ${bgUrl ? `url('${bgUrl}') center/cover no-repeat` : '#fcfcfc'} !important;">
        
        <style>
          .mc-offline-dialogue { color: ${targetObj?.offlineDialogueColor || '#d4b856'}; font-family: inherit; }
          .mc-offline-thought { color: ${targetObj?.offlineThoughtColor || '#9ca3af'}; font-family: inherit; }
          .mc-offline-desc { color: inherit; font-family: inherit; }
          ${targetObj?.offlineCSS || ''}
        </style>
        
        ${wxState.activeMenuMsgId ? `<div class="absolute inset-0 z-[90]" onclick="window.wxActions.closeContextMenu()" ontouchstart="window.wxActions.closeContextMenu()"></div>` : ''}

        <div class="mc-offline-topbar bg-white/90 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 z-10 sticky top-0 shadow-sm transition-all ${wxState.isMultiSelecting ? 'bg-[#fcfcfc]' : ''}">
          ${wxState.isMultiSelecting ? `
             <div class="cursor-pointer text-gray-600 w-1/4 text-[15px]" onclick="window.wxActions.cancelMultiSelect()">取消</div>
             <span class="flex-1 text-center font-bold text-gray-800 text-[16px]">已选择 ${wxState.selectedMsgIds.length} 项</span>
             <div class="w-1/4"></div>
          ` : `
             <div class="flex items-center cursor-pointer text-gray-600 w-1/4 active:opacity-50" onclick="window.wxActions.exitOffline()"><i data-lucide="chevron-down" style="width:28px; height:28px;"></i></div>
             <span class="flex-1 text-center font-bold text-[16px] tracking-widest text-gray-800 transition-colors ${(wxState.typingStatus && wxState.typingStatus[chatData.charId]) ? 'animate-pulse text-gray-400' : ''}">${(wxState.typingStatus && wxState.typingStatus[chatData.charId]) ? '正在构思...' : `线下 · ${titleName}`}</span>
             <div class="w-1/4 flex justify-end">
                <i data-lucide="settings" class="text-gray-600 cursor-pointer active:scale-90 transition-transform" style="width: 24px; height: 24px;" onclick="window.wxActions.openOfflineSettings()"></i>
             </div>
          `}
        </div>
        
        <div id="offline-scroll" class="mc-offline-scroll flex-1 p-5 overflow-y-auto hide-scrollbar flex flex-col pb-6 ${targetObj?.offlineBg ? 'bg-black/10 backdrop-blur-[2px]' : 'bg-[#fcfcfc]'}" ontouchmove="window.wxActions.handleTouchMove()">
          <div class="text-center text-xs text-gray-400 italic mb-8 tracking-widest pointer-events-none">—— 故事开始 ——</div>
          ${(() => {
              let html = '';
              
              // 🌟 核心时空断层算法：寻找最后一条“线上聊天”的边界点
              let lastOnlineMsgId = 0;
              for (let i = chatData.messages.length - 1; i >= 0; i--) {
                  if (!chatData.messages[i].isOffline) {
                      lastOnlineMsgId = chatData.messages[i].id;
                      break;
                  }
              }

              offlineMsgs.forEach((msg, index) => {
                 // 如果这条线下消息发生在最后一次线上聊天之前，它就是被封存的历史！
                 const isHistory = msg.id < lastOnlineMsgId;
                 
                 // 🌟 插入历史记录分割线（在当前剧情的第一句话之前插入）
                 if (!isHistory && index > 0 && offlineMsgs[index - 1].id < lastOnlineMsgId) {
                    html += `<div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 以上为历史记录 ——</div>`;
                 }

                 const isSelected = wxState.selectedMsgIds?.includes(msg.id);
                 const checkboxHtml = wxState.isMultiSelecting ? `<div class="mr-4 flex-shrink-0 mt-1"><div class="w-[20px] h-[20px] rounded-full border ${isSelected ? 'bg-gray-800 border-gray-800' : 'border-gray-300 bg-white'} flex items-center justify-center transition-colors shadow-sm">${isSelected ? `<i data-lucide="check" class="text-white" style="width:12px; height:12px;"></i>` : ''}</div></div>` : '';

                 let menuHtml = '';
                 if (wxState.activeMenuMsgId === msg.id) {
                   menuHtml = `
                     <div class="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-2 bg-[#2c2c2c] text-white rounded-[12px] px-1 py-0.5 flex items-center shadow-2xl animate-in zoom-in-95 duration-150 whitespace-nowrap border border-white/10" onclick="event.stopPropagation()">
                       ${(!msg.isMe && !isHistory) ? `<div class="flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.rerollReply(${msg.id})"><i data-lucide="refresh-cw" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">重roll</span></div>` : ''}
                       <div class="flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.openEditMessageModal(${msg.id})"><i data-lucide="edit" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">编辑</span></div>
                       <div class="flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.startMultiSelect(${msg.id})"><i data-lucide="check-square" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">多选</span></div>
                       <div class="flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.deleteMessage(${msg.id})"><i data-lucide="trash-2" class="w-[18px] h-[18px] mb-1 text-red-400"></i><span class="text-[10px] text-red-400 scale-90">删除</span></div>
                     </div>
                   `;
                 }

                 const formattedLines = msg.text.split('\n').filter(l=>l.trim()).map(l => {
                     let line = l
                         .replace(/(“[^”]*”|"[^"]*")/g, '<span class="mc-offline-dialogue">$1</span>')
                         .replace(/[（(]([^）)]*)[）)]/g, '<span class="mc-offline-thought">$1</span>');
                     return `<p class="mc-offline-desc">${line}</p>`;
                 }).join('');

                 if (msg.msgType === 'system' || msg.msgType === 'recall_system') {
                     html += `
                     <div class="mc-offline-sysmsg relative flex items-center justify-center py-2 mb-6 animate-in fade-in duration-300 ${wxState.isMultiSelecting ? 'cursor-pointer' : ''}" ${wxState.isMultiSelecting ? `onclick="window.wxActions.toggleSelectMsg(${msg.id})"` : ''}>
                        ${checkboxHtml}
                        <span class="text-[12px] text-gray-400 font-bold tracking-widest bg-gray-100/80 backdrop-blur-sm px-4 py-1.5 rounded-full pointer-events-${wxState.isMultiSelecting ? 'none' : 'auto'}" 
                              onmousedown="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchStart(${msg.id})`}" 
                              onmouseup="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}" 
                              onmouseleave="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}" 
                              ontouchstart="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchStart(${msg.id})`}" 
                              ontouchend="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}">${msg.text.replace(/\[|\]/g, '')}</span>
                        ${menuHtml}
                     </div>
                     `;
                 } else {
                     html += `
                     <div class="mc-offline-msg relative flex items-start animate-in fade-in duration-300 mb-8 ${wxState.isMultiSelecting ? 'cursor-pointer' : ''}" 
                          ${wxState.isMultiSelecting ? `onclick="window.wxActions.toggleSelectMsg(${msg.id})"` : ''}>
                       ${checkboxHtml}
                       <div class="mc-offline-bubble flex-1 text-[16px] text-gray-800 flex flex-col leading-loose pointer-events-${wxState.isMultiSelecting ? 'none' : 'auto'}"
                            onmousedown="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchStart(${msg.id})`}" 
                            onmouseup="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}" 
                            onmouseleave="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}" 
                            ontouchstart="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchStart(${msg.id})`}" 
                            ontouchend="${wxState.isMultiSelecting ? '' : `window.wxActions.handleTouchEnd()`}">
                         <div class="flex items-baseline mb-2"><span class="mc-offline-name font-black text-[13px] mr-2 ${msg.isMe ? 'text-gray-400' : (targetObj?.offlineBg ? 'text-white drop-shadow-md' : 'text-gray-900')} tracking-wider">${msg.sender}</span></div>
                         <div class="mc-offline-content space-y-3 opacity-95 text-justify ${targetObj?.offlineBg ? 'text-white drop-shadow-md' : ''}">${formattedLines}</div>
                       </div>
                       ${menuHtml}
                     </div>
                     `;
                 }
              });

              // 如果当前所有的线下消息全部都是历史记录，把分割线补在最底部！
              if (offlineMsgs.length > 0 && offlineMsgs[offlineMsgs.length - 1].id < lastOnlineMsgId) {
                  html += `<div class="text-center text-xs text-gray-400 italic mb-8 mt-4 tracking-widest pointer-events-none">—— 以上为历史记录 ——</div>`;
              }
              
              return html;
          })()}
        </div>
        
        ${wxState.isMultiSelecting ? `
          <div class="mc-offline-bottombar bg-white px-6 py-3 pb-8 border-t border-gray-100 flex justify-between items-center shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-20 relative animate-in slide-in-from-bottom-2">
             <div class="flex flex-col items-center cursor-pointer hover:text-red-500 transition-colors active:scale-90" onclick="window.wxActions.deleteSelected()"><i data-lucide="trash-2" class="w-[22px] h-[22px] mb-1 text-red-500"></i><span class="text-[10px] text-red-500 font-bold tracking-widest">删除</span></div>
          </div>
        ` : `
          <div class="mc-offline-bottombar bg-white px-4 py-3 pb-8 border-t border-gray-100 flex flex-col shadow-[0_-5px_20px_rgba(0,0,0,0.03)] z-20 relative">
            <div class="mc-offline-input-wrapper relative w-full bg-gray-50 border border-gray-200 rounded-[16px] p-1 flex items-end transition-all focus-within:border-gray-400 focus-within:bg-white shadow-inner">
                <textarea id="offline-input" placeholder="描写你的动作或对话..." class="flex-1 min-h-[80px] max-h-[150px] bg-transparent text-gray-800 p-3 outline-none text-[15px] resize-none placeholder-gray-400 font-serif leading-relaxed hide-scrollbar"></textarea>
                <div class="flex flex-col items-center justify-end pb-2 pr-2 space-y-4 shrink-0">
                    <button onclick="window.wxActions.continueOffline()" class="mc-offline-btn-continue w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-90 transition-all" title="让AI接着往下写"><i data-lucide="feather" style="width:20px;"></i></button>
                    <button onmousedown="event.preventDefault();" onclick="window.wxActions.sendMessage()" class="mc-offline-btn-send w-9 h-9 flex items-center justify-center text-gray-800 active:scale-90 transition-all hover:text-black"><i data-lucide="send" style="width:22px; margin-left: 2px;"></i></button>
                </div>
            </div>
          </div>
        `}

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

      </div>
    `;
  }

  // 📞 场景 3：沉浸式音视频通话模式
  if (wxState.view === 'call') {
    const isVideo = wxState.callType === 'video';
    const visibleMsgs = chatData.messages.filter(m => wxState.callStartTime && m.id >= wxState.callStartTime && m.msgType !== 'system' && !m.isHidden);
    
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

          <div class="absolute inset-0 z-0 bg-gray-900 flex items-center justify-center">${getVidHtml(char.videoAvatar, char.avatar, true)}</div>
          
          <div class="absolute top-16 right-5 w-24 h-36 bg-gray-800 rounded-xl border border-white/20 shadow-2xl overflow-hidden z-20">${getVidHtml(store.personas[0].videoAvatar, myAvatar, false)}</div>
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
              <div class="flex justify-center relative w-full">
                 <button onclick="window.wxActions.rerollReply()" class="absolute left-0 w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white active:bg-white/20 transition-colors shadow-lg border border-white/10" title="重roll回复"><i data-lucide="refresh-cw" style="width:24px;"></i></button>
                 <button onclick="window.wxActions.endCall()" class="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl active:bg-red-600 transition-colors"><i data-lucide="phone-off" style="width:24px;"></i></button>
              </div>
            </div>
          </div>
        ` : `
          <div class="flex-1 flex flex-col items-center justify-start relative z-10 pt-[12vh]">
            <div class="text-white text-xl font-medium mb-1 tracking-wide drop-shadow-md">${char.name}</div>
            <div id="call-duration-display" class="text-white/80 text-[13px] font-mono mb-5 drop-shadow-md">00:00</div>

            <div class="w-24 h-24 rounded-full overflow-hidden shadow-[0_0_40px_rgba(74,222,128,0.25)] animate-pulse ring-[3px] ring-green-500/30 flex items-center justify-center bg-gray-800 border border-gray-700">${getVidHtml(char.avatar, false)}</div>
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
              <div class="flex justify-center relative w-full">
                 <button onclick="window.wxActions.rerollReply()" class="absolute left-0 w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white active:bg-white/20 transition-colors shadow-lg border border-white/10" title="重roll回复"><i data-lucide="refresh-cw" style="width:24px;"></i></button>
                 <button onclick="window.wxActions.endCall()" class="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl active:bg-red-600 transition-colors"><i data-lucide="phone-off" style="width:24px;"></i></button>
              </div>
            </div>
          </div>
        `}
      </div>
    `;
  }

  // 💬 场景 4：正常的微信聊天室
  if (wxState.view === 'chatRoom') {
    let lastRenderedTime = ''; 
    const messagesHtml = chatData.messages.filter(m => !m.isOffline && !m.isHidden).map(msg => {
      // 🌟 找到发送者的角色数据（群聊时动态查找，单聊时直接用 char）
      const senderChar = (isGroup && !msg.isMe) ? store.contacts.find(c => c.name === msg.sender) : char;
      const senderAvatar = senderChar ? senderChar.avatar : '';
      // 🌟 如果是群聊，在别人发的气泡上方显示TA的名字
      const groupNameHtml = (isGroup && !msg.isMe && msg.msgType !== 'system' && msg.msgType !== 'recall_system' && msg.msgType !== 'friend_request') 
          ? `<span class="text-[11px] font-bold text-gray-400 mb-1 ml-1 block">${msg.sender}</span>` : '';
      let timeHtml = '';
      if (msg.time && msg.time !== lastRenderedTime) {
        timeHtml = `<div class="flex justify-center my-3 animate-in fade-in"><span class="mc-time-tag text-[11px] text-gray-400 font-medium">${msg.time}</span></div>`;
        lastRenderedTime = msg.time;
      }
      
      const isSelected = wxState.selectedMsgIds?.includes(msg.id);
      const checkboxHtml = wxState.isMultiSelecting ? `<div class="mr-3 flex-shrink-0"><div class="w-[22px] h-[22px] rounded-full border ${isSelected ? 'bg-[#07c160] border-[#07c160]' : 'border-gray-300 bg-white'} flex items-center justify-center transition-colors shadow-sm">${isSelected ? `<i data-lucide="check" class="text-white" style="width:14px; height:14px;"></i>` : ''}</div></div>` : '';

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
        
        // 🌟 回退到最原始、最粗暴、绝不被拦截的行内播放！
        const playScript = msg.audioUrl ? `new Audio('${msg.audioUrl}').play().catch(e=>window.actions.showToast('生成中或被浏览器拦截'));` : `window.actions.showToast('正在生成语音...');`;        
        
        contentHtml = `<div class="flex flex-col cursor-pointer" onclick="const textOut = this.closest('.relative').querySelector('.mc-voice-text-out'); if(textOut) textOut.classList.toggle('hidden'); ${playScript}"><div class="flex items-center space-x-3 ${msg.isMe ? 'flex-row-reverse space-x-reverse' : ''}"><div class="flex items-center gap-[2px] ${msg.isMe ? 'text-green-800' : 'text-gray-800'}">${barsHtml}</div><span class="text-[13px] opacity-80">${duration}"</span></div></div>`;      
        voiceTextOut = `<div class="mc-voice-text-out hidden mt-1.5 text-[14px] text-gray-600 bg-gray-100/90 rounded-[10px] px-3 py-2 max-w-full break-words shadow-sm border border-gray-200/50 relative before:content-[''] before:absolute before:border-[6px] before:border-transparent before:border-b-gray-100 ${msg.isMe ? 'before:right-4 before:-top-[11px]' : 'before:left-4 before:-top-[11px]'}">${msg.text}</div>`;
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
        bubbleClass = `mc-bubble-text px-4 py-2.5 rounded-xl shadow-sm leading-relaxed overflow-wrap break-words whitespace-pre-wrap text-[15px] ${msg.isMe ? 'bg-[#95ec69] text-black rounded-tr-sm' : 'bg-white text-black rounded-tl-sm'}`;
        bubbleStyle = '';
        
        let safeText = msg.text;
        try { // 🌟 防止普通零碎文字里的孤立 HTML 标签撑破底栏
            if (safeText.includes('<') && safeText.includes('>')) {
               const doc = new DOMParser().parseFromString(safeText, 'text/html');
               safeText = doc.body.innerHTML;
            }
        } catch(e) {}
        
        if (msg.quote) {
           quoteHtmlOut = `<div class="mc-quote-out text-[11px] text-gray-500 bg-gray-200/60 rounded-[8px] px-2.5 py-1.5 mb-1 max-w-full break-words whitespace-pre-wrap ${msg.isMe ? 'self-end' : 'self-start'}">${msg.quote.sender}：${msg.quote.text}</div>`;
        }
        contentHtml = safeText;
      } else if (msg.msgType === 'real_image') {
        maxWidthClass = 'max-w-[40%]';
        bubbleClass = 'mc-bubble-img bg-white p-1 rounded-xl shadow-sm border border-gray-100'; 
        bubbleStyle = ''; 
        contentHtml = `<img src="${msg.imageUrl}" class="w-full h-auto rounded-lg object-cover max-h-[200px] cursor-pointer" onclick="window.actions.showToast('查看大图')" alt="照片" />`;
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
             <span class="text-[15px] font-bold text-gray-800 mb-1">${char?.name || '角色'} 申请添加你为朋友</span>
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
          <div class="mc-context-menu absolute z-[100] bottom-[105%] ${msg.isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'} bg-[#2c2c2c] text-white rounded-[12px] px-1 py-0.5 flex items-center shadow-2xl animate-in zoom-in-95 duration-150 whitespace-nowrap border border-white/10" onclick="event.stopPropagation()">
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.quoteMessage(${msg.id})"><i data-lucide="quote" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">引用</span></div>
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.favoriteMessage(${msg.id})"><i data-lucide="star" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">收藏</span></div>
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.startMultiSelect(${msg.id})"><i data-lucide="check-square" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">多选</span></div>
            ${msg.isMe ? `<div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.recallMessage(${msg.id})"><i data-lucide="undo-2" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">撤回</span></div>` : ''}
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.openEditMessageModal(${msg.id})"><i data-lucide="edit" class="w-[18px] h-[18px] mb-1 text-gray-300"></i><span class="text-[10px] text-gray-300 scale-90">编辑</span></div>
            <div class="mc-context-item flex flex-col items-center justify-center w-[46px] py-2 cursor-pointer hover:bg-white/10 rounded-lg transition-colors" onclick="window.wxActions.deleteMessage(${msg.id})"><i data-lucide="trash-2" class="w-[18px] h-[18px] mb-1 text-red-400"></i><span class="text-[10px] text-red-400 scale-90">删除</span></div>
          </div>
        `;
      }

      // 🌟气泡组装 (把 quoteHtmlOut 和 voiceTextOut 独立于 mc-bubble 外)
      return `${timeHtml}
      <div class="mc-msg-row ${msg.isMe ? 'mc-is-me' : 'mc-is-ai'} flex items-start w-full animate-in fade-in duration-300 mb-3 ${wxState.isMultiSelecting ? 'pl-2 cursor-pointer' : ''}" ${wxState.isMultiSelecting ? `onclick="window.wxActions.toggleSelectMsg(${msg.id})"` : ''}>
        
        ${checkboxHtml}
        
        <div class="flex-1 flex items-start ${msg.isMe ? 'justify-end' : 'justify-start'} pointer-events-${wxState.isMultiSelecting ? 'none' : 'auto'}">
          ${!msg.isMe ? `<div class="mc-avatar w-10 h-10 bg-[var(--bubble-char-bg)] rounded-full overflow-hidden flex items-center justify-center text-xl mr-2 shadow-sm flex-shrink-0 cursor-pointer" onclick="window.wxActions.handleAvatarClick('${senderChar?.id}')" style="font-family: var(--system-font)">${getVidHtml(senderAvatar, '', false)}</div>` : ''}
          
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
          
          ${!msg.isMe && msg.isIntercepted ? `<div class="self-center ml-2 w-[20px] h-[20px] rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-[13px] shadow-sm flex-shrink-0" title="消息已被拒收">!</div>` : ''}
          ${msg.isMe ? `<div class="mc-avatar w-10 h-10 bg-white border border-gray-100 overflow-hidden rounded-full flex items-center justify-center text-xl ml-2 shadow-sm flex-shrink-0" style="font-family: var(--system-font)">${getVidHtml(myAvatar, myAvatar, false)}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const plusMenuHtml = [
      { id: 'mc-tool-reroll', icon: 'refresh-cw', label: '重roll回复', action: 'window.wxActions.rerollReply()', hideInGroup: false },
      { id: 'mc-tool-extract', icon: 'brain-circuit', label: '提取记忆', action: "window.wxActions.openExtractMemoryModal()", hideInGroup: true },
      { id: 'mc-tool-image', icon: 'image', label: '发送图片', action: "document.getElementById('real-image-input').click()", hideInGroup: false },
      { id: 'mc-tool-camera', icon: 'camera', label: '虚拟拍照', action: "window.wxActions.openVirtualModal('image')", hideInGroup: false },
      { id: 'mc-tool-transfer', icon: 'credit-card', label: '转账', action: "window.wxActions.openVirtualModal('transfer')", hideInGroup: false },
      { id: 'mc-tool-mic', icon: 'mic', label: '发送语音', action: "window.wxActions.openVirtualModal('voice')", hideInGroup: false },
      { id: 'mc-tool-voicecall', icon: 'phone', label: '语音通话', action: "window.wxActions.startCall('voice')", hideInGroup: true },
      { id: 'mc-tool-videocall', icon: 'video', label: '视频通话', action: "window.wxActions.startCall('video')", hideInGroup: true },
      { id: 'mc-tool-location', icon: 'map-pin', label: '发送定位', action: "window.wxActions.openVirtualModal('location')", hideInGroup: false },
      { id: 'mc-tool-offline', icon: 'coffee', label: '线下剧情', action: "window.wxActions.enterOffline()", hideInGroup: false },
      { id: 'mc-tool-read', icon: 'book-open', label: '一起看书', action: "window.wxActions.openBookSelectModal()", hideInGroup: true }
    ].filter(item => !(isGroup && item.hideInGroup)).map(item => `
      <div class="mc-tool-item flex flex-col items-center justify-center space-y-1.5 cursor-pointer active:scale-95 transition-transform" onclick="${item.action}">
        <div class="${item.id} w-14 h-14 flex items-center justify-center">
          <i data-lucide="${item.icon}" class="text-gray-800" style="width: 28px; height: 28px;"></i>
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
                  ${isMe ? '你发起的转账' : `来自 ${tMsg.sender} 的转账`}
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
      <div id="mc-chat-screen" class="w-full h-full flex flex-col animate-in slide-in-from-right-4 duration-200 relative z-0" style="background-color: var(--chat-bg-color); background-image: var(--chat-bg-image); background-size: cover; background-position: center;">
        
        <style>
          ${chatData.isGroup ? (chatData.customCSS || '') : (char?.customCSS || '')}
          ${char?.bgImage ? `:root { --chat-bg-image: url('${char.bgImage}'); }` : (store.bgImage ? `:root { --chat-bg-image: url('${store.bgImage}'); }` : '')}
        </style>

        <div class="absolute inset-0 z-[-1]" style="background: var(--chat-bg-overlay); pointer-events: none;"></div>
        ${wxState.activeMenuMsgId ? `<div class="absolute inset-0 z-[90]" onclick="window.wxActions.closeContextMenu()" ontouchstart="window.wxActions.closeContextMenu()"></div>` : ''}
        
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
              let titleText = isGroup ? `${chatData.groupName} (${chatData.memberIds.length})` : char?.name;
              
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
                <span class="mc-title flex-1 font-bold text-gray-800 text-[17px] text-center transition-all duration-300 ${isAnyTyping ? 'opacity-60 animate-pulse text-gray-400' : ''}">${isAnyTyping ? typingText : titleText}</span>
                <div class="mc-btn-more w-1/4 flex justify-end"><i data-lucide="more-horizontal" class="text-gray-800 cursor-pointer active:scale-90" style="width: 24px; height: 24px;" onclick="window.wxActions.openSettings()"></i></div>
              `;
            }
          })()}
        </div>
        
        <div id="chat-scroll" class="mc-msg-list flex-1 p-4 overflow-y-auto hide-scrollbar space-y-4 flex flex-col pb-6">
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
          <div class="mc-bottombar bg-gray-50/90 px-3 py-2 pb-6 border-t border-gray-200/50 z-20 relative transition-all duration-200">

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

            <div class="flex items-end space-x-2">
              <div class="flex items-center space-x-2.5 mb-1.5 px-1">
                <i data-lucide="smile" class="mc-btn-emoji cursor-pointer transition-colors ${wxState.showEmojiMenu ? 'text-[#07c160]' : 'text-gray-800'}" style="width: 28px; height: 28px;" onclick="window.wxActions.toggleEmojiMenu()"></i>
                <i data-lucide="plus-circle" class="mc-btn-plus cursor-pointer transition-transform duration-200 ${wxState.showPlusMenu ? 'rotate-45' : ''}" style="width: 28px; height: 28px;" onclick="window.wxActions.togglePlusMenu()"></i>
              </div>
              <div class="flex-1 bg-white/90 backdrop-blur-sm rounded-xl flex items-center pr-1 min-h-[38px] shadow-sm border border-gray-100">
                <input type="text" id="wx-input" onkeydown="if(event.key==='Enter') window.wxActions.sendMessage()" class="mc-input flex-1 h-full py-2 px-3 outline-none text-[15px] bg-transparent" />
                <div class="flex items-center space-x-1 pl-1 pr-1">
                  <button class="mc-btn-ai w-8 h-8 flex items-center justify-center text-gray-800 active:scale-90 transition-transform" title="获取回复" onclick="window.wxActions.getReply()"><i data-lucide="sparkles" style="width: 22px; height: 22px;"></i></button>
                  <button onmousedown="event.preventDefault();" class="mc-btn-send w-8 h-8 flex items-center justify-center text-gray-800 active:scale-90 transition-transform" title="发送" onclick="window.wxActions.sendMessage()"><i data-lucide="send" style="width: 20px; height: 20px; margin-left: 2px;"></i></button>
                </div>
              </div>
            </div>
            <div class="mc-tools-panel ${wxState.showPlusMenu ? 'grid' : 'hidden'} pt-4 grid-cols-4 gap-4 animate-in slide-in-from-bottom-2 fade-in">
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
                  <textarea id="edit-msg-textarea" rows="8" class="w-full bg-white border border-gray-100 rounded-xl p-3 outline-none text-[15px] text-gray-800 font-medium leading-relaxed shadow-sm resize-none hide-scrollbar">${wxState.editMsgData.text}</textarea>
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
                         <span class="text-[16px] font-black text-[#07c160] font-mono">${wxState.extractMemoryConfig.msgCount} 条</span>
                       </div>
                       <input type="range" min="2" max="100" value="${wxState.extractMemoryConfig.msgCount}" class="w-full accent-[#07c160] h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" oninput="window.wxActions.updateExtractConfig('msgCount', this.value)" />
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
                            ${getVidHtml(char.avatar, char.avatar, false)}
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
                                <div class="flex justify-between text-[11px] font-extrabold mb-1.5"><span class="text-blue-500 tracking-wider">心情指数</span><span class="text-gray-500">${thought.mood}/100</span></div>
                                <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-blue-300 to-blue-500 rounded-full transition-all duration-1000 ease-out" style="width: ${thought.mood}%"></div></div>
                            </div>
                            <div>
                                <div class="flex justify-between text-[11px] font-extrabold mb-1.5"><span class="text-pink-500 tracking-wider">情欲 / 占有欲</span><span class="text-gray-500">${thought.lust}/100</span></div>
                                <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div class="h-full bg-gradient-to-r from-pink-300 to-pink-500 rounded-full transition-all duration-1000 ease-out" style="width: ${thought.lust}%"></div></div>
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
        avatarHtml = `<div class="w-full h-full bg-blue-50 text-blue-400 flex items-center justify-center"><i data-lucide="users" class="w-6 h-6"></i></div>`;
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
        avatarHtml = getVidHtml(c.avatar, false);
        // 🌟 核心修复 3：精确读取当前单聊房间的状态
        if (wxState.typingStatus && wxState.typingStatus[chat.charId]) {
            typingHtml = `<span class="text-gray-400 font-bold tracking-widest animate-pulse">[正在输入中...]</span>`;
        }
    }
    
    const previewHtml = typingHtml ? typingHtml : preview;

    return `
      <div onclick="window.wxActions.openChat('${chat.charId}')" class="flex items-center px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 active:bg-gray-100">
        <div class="w-12 h-12 bg-gray-100 rounded-[14px] flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl mr-3 shadow-sm border border-gray-200/50">
          ${avatarHtml}
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
        interactHtml = '<div class="bg-gray-50 mt-2.5 rounded-[6px] px-3 py-2 text-[13px] relative before:content-[\'\'] before:absolute before:bottom-full before:left-3 before:border-4 before:border-transparent before:border-b-gray-50">';
        if (hasLikes) interactHtml += `<div class="flex items-start text-[#576b95] font-medium ${hasComments?'border-b border-gray-200/60 pb-1.5 mb-1.5':''}"><i data-lucide="heart" class="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0"></i><span class="leading-relaxed">${m.likes.join(', ')}</span></div>`;
         if (hasComments) {
            interactHtml += m.comments.map(c => `<div class="active:bg-gray-200 transition-colors py-0.5 leading-relaxed cursor-pointer break-words" onclick="window.wxActions.handleCommentClick(${m.id}, ${c.id})"><span class="text-[#576b95] font-medium">${c.senderName}</span>${c.replyTo ? ` 回复 <span class="text-[#576b95] font-medium">${c.replyTo}</span>` : ''}<span class="text-gray-800">：${c.text}</span></div>`).join('');
         }
        interactHtml += '</div>';
    }

      // 菜单弹出动画区
      const menuHtml = wxState.activeMomentMenuId === m.id ? `
        <div class="absolute right-8 top-[-6px] bg-[#4c5154] rounded-[6px] flex items-center px-4 py-2 text-white space-x-5 animate-in slide-in-from-right-2 duration-150 z-10 shadow-lg">
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
            ${m.imageUrl ? `<img src="${m.imageUrl}" class="mt-2 max-w-[70%] max-h-48 object-cover rounded-[4px] border border-gray-100" onclick="window.actions.showToast('查看大图')" />` : ''}
            ${m.virtualImageText ? `
              <div class="mt-2 w-48 min-h-[12rem] bg-white cursor-pointer select-none rounded-[4px] shadow-sm overflow-hidden border border-gray-200 relative" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');">
                <div class="absolute inset-0 p-4 overflow-y-auto text-[13px] text-gray-700 leading-relaxed text-left bg-white hide-scrollbar">
                   <span class="font-medium text-gray-400 block mb-1 flex items-center"><i data-lucide="image" class="mr-1" style="width:14px; height:14px;"></i>照片内容：</span>
                   ${m.virtualImageText}
                </div>
                <div class="img-overlay absolute inset-0 bg-gray-100 flex flex-col items-center justify-center text-gray-400 transition-opacity duration-300 z-10">
                   <i data-lucide="image" class="mb-2 text-gray-300" style="width: 36px; height: 36px;"></i>
                   <span class="text-[11px] font-bold tracking-widest animate-pulse">图片加载中...</span>
                </div>
              </div>
            ` : ''}
            <div class="flex items-center justify-between mt-3 relative">
              <div class="flex items-center space-x-3 text-[12px] text-gray-400">
                <span>${m.time}</span>
                <span class="text-[#576b95] cursor-pointer active:opacity-50" onclick="window.wxActions.deleteMoment(${m.id})">删除</span>
              </div>
              <div class="bg-gray-100 rounded-[4px] px-2 py-0.5 cursor-pointer active:bg-gray-200" onclick="window.wxActions.toggleMomentMenu(${m.id})"><i data-lucide="more-horizontal" class="text-[#576b95] w-4 h-4"></i></div>
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
               <div class="w-16 h-16 rounded-[12px] overflow-hidden border-2 border-white shadow-md bg-white flex items-center justify-center z-10">${getVidHtml(my.avatar, false)}</div>
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
           <div class="w-16 h-16 rounded-[12px] overflow-hidden bg-gray-100 flex items-center justify-center cursor-pointer mr-4 shadow-sm border border-gray-200" onclick="document.getElementById('upload-my-avatar-main').click()">${getVidHtml(my.avatar, false)}</div>
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
              <button class="ml-3 bg-[#07c160] text-white px-4 py-2 rounded-[6px] font-bold text-[14px] active:opacity-80 transition-opacity" onclick="window.wxActions.submitMomentComment()">发送</button>
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

// ================= 🧠 云端通用大脑 & 信箱同步引擎 =================

const planCloudBrain = async (delayMinutes, char, llmMessages, routingId) => {
  // 🚨 移除静默 try-catch，让错误能直接抛给 UI 界面！
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  
  if (!store.apiConfig?.apiKey) throw new Error("缺少 API Key 配置，云端无法请求大模型");
  if (!sub) throw new Error("未绑定设备推送凭证！云端不知道把消息发给谁，请先在右上角授权通知！");

  const res = await fetch('https://neko-hoshino.duckdns.org/auto-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret-token': localStorage.getItem('neko_server_pwd') || '' },
      body: JSON.stringify({
          delayMinutes: delayMinutes,
          title: char.name,
          charId: routingId || char.id, 
          endpoint: sub.endpoint,
          apiConfig: store.apiConfig, 
          llmMessages: llmMessages    
      })
  });
  
  if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `云端服务器拒绝了请求 (HTTP状态码: ${res.status})`);
  }
};
// ==================== 以下代码必须放在 wechat.js 的最最最底部 ====================

window.syncCloudMailbox = async () => {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const res = await fetch('https://neko-hoshino.duckdns.org/sync-mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-secret-token': localStorage.getItem('neko_server_pwd') || '' },
        body: JSON.stringify({ endpoint: sub.endpoint })
    });
    const data = await res.json();
    if (!data.messages || data.messages.length === 0) return;

    let shouldRender = false;

    data.messages.forEach(msg => {
        if (!msg.charId) return;
        const parts = msg.charId.split('|');
        const chatId = parts[0];
        const charId = parts[1] || chatId;
        const isOfflineMsg = parts[2] === '1';

        const chat = store.chats.find(c => c.charId === chatId);
        if (!chat) return;

        // 🌟 核心防爆：极其安全地解除“正在输入中”的卡死状态
        if (typeof wxState !== 'undefined' && wxState.typingStatus) wxState.typingStatus[chatId] = false;
        if (window.wxState && window.wxState.typingStatus) window.wxState.typingStatus[chatId] = false;

        const safeText = (msg.text || '').replace(/\\n/g, '\n').replace(/\/n/g, '\n').replace(/`\{[\s\S]*?\}`/gi, '').trim();
        const lines = safeText.split('\n').filter(l => l.trim());
        
        lines.forEach((line, subIdx) => {
            let textToPush = line.trim();
            let senderName = store.contacts.find(c => c.id === charId)?.name || '未知';

            if (chat.isGroup) {
                const match = textToPush.match(/^([^:：\[\]]{1,15})[:：]\s*(.*)$/);
                if (match) { senderName = match[1].trim(); textToPush = match[2].trim(); }
            }

            // 🌟 修复虚拟照片：加上 \n\n 前后空行，逼迫 Markdown 引擎乖乖将其渲染为高级卡片！
            const photoMatch = textToPush.match(/\[虚拟照片\][:：]?\s*(.*)/);
            if (photoMatch) {
                textToPush = "\n\n```html\n" + `<div class="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200/60 flex flex-col items-center shadow-sm my-1 mx-2"><i data-lucide="camera" class="w-8 h-8 text-blue-400 mb-2 drop-shadow-sm"></i><span class="text-[11px] text-gray-400 font-extrabold mb-1 tracking-widest uppercase">Virtual Photo</span><span class="text-[14px] text-gray-800 text-center font-serif italic font-medium leading-relaxed">"${photoMatch[1]}"</span></div>` + "\n```\n\n";
            }

            chat.messages.push({
                id: msg.timestamp + subIdx,
                sender: senderName,
                text: textToPush,
                isMe: false,
                source: 'wechat',
                isOffline: isOfflineMsg,
                msgType: 'text',
                time: new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            });
        });
        shouldRender = true;
    });

    if (shouldRender) {
        if (typeof window.render === 'function') window.render();
        if (window.wxActions && window.wxActions.scrollToBottom) window.wxActions.scrollToBottom();
    }
  } catch (e) { console.error('同步信箱失败:', e); }
};

// 🌟 防爆废弃壳
window.checkAutoMsg = async () => {}; 

// 🌟 【绝对不能删的生命线】：每 15 秒自动去云端邮箱看一眼！
setInterval(window.syncCloudMailbox, 15000); 

// 🌟 切回页面时立刻查收
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') window.syncCloudMailbox();
});

// 🌟 刚打开网页时也立刻查收（防止有之前遗留的信息）
window.addEventListener('load', () => {
  setTimeout(window.syncCloudMailbox, 2000);
});