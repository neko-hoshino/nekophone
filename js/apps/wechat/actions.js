// js/apps/wechat/actions.js — 全部 wxActions 动作
import { store } from '../../store.js';
import { getNowTime, saveScroll, restoreScroll, playCallAudio } from './shared.js';
import { fetchMinimaxVoice } from './voice.js';
import { triggerAutoMemory } from './memory.js';
import { wxState } from './state.js';
import { rollRandomPlot } from './plot.js';

window.wxActions = {
// 🌟 全局来电横幅：接听与挂断动作
  answerGlobalCall: (charId) => {
      // 🌟 记录接听来电时的界面
      store.callReturnPath = { 
          app: store.currentApp, 
          view: typeof wxState !== 'undefined' ? wxState.view : 'main' 
      };

      store.globalCallAlert = null; 
      store.currentApp = 'wechat';  
      wxState.activeChatId = charId;
      wxState.view = 'incomingCall';  
      window.render();
  },
  declineGlobalCall: (charId) => {
      store.globalCallAlert = null; // 🌟 改为 store
      try { wxState.ringtone.pause(); wxState.ringtone.currentTime = 0; } catch(e){}
      const chat = store.chats.find(c => c.charId === charId);
      if (chat) {
          chat.messages.push({ id: Date.now(), sender: 'system', text: `已拒绝通话`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
      }
      window.render();
  },
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
 // 🌟 历史记录懒加载引擎 (带无缝滚动锚定)
  loadMoreHistory: () => {
    const scrollId = wxState.view === 'chatRoom' ? 'chat-scroll' : 'offline-scroll';
    const el = document.getElementById(scrollId);
    // 记录按下加载前的绝对物理高度
    const oldScrollHeight = el ? el.scrollHeight : 0;
    const oldScrollTop = el ? el.scrollTop : 0;
    // 额度增加 50 条
    wxState.displayCount = (wxState.displayCount || 50) + 50;
    window.render();
    // 渲染完后，瞬间把卷轴推回原来的物理位置，实现 0 闪烁感知！
    const newEl = document.getElementById(scrollId);
    if (newEl) {
      newEl.scrollTop = newEl.scrollHeight - oldScrollHeight + oldScrollTop;
    }
  },
  // ================= 🎵 终极语音引擎 (文字与声音解耦版) =================
  playVoiceMsg: (msgId) => {
    saveScroll(); // 进入时保存滚动位置  
    // 1. 找聊天室和消息
      const chat = store.chats.find(c => c.id === wxState.activeChatId || c.charId === wxState.activeChatId);
      if (!chat) {
        restoreScroll(); return;
    }
      const msg = chat.messages.find(m => String(m.id) === String(msgId) || String(m.timestamp) === String(msgId));
      if (!msg) {
        restoreScroll(); return;
    }

      // 🌟 2. 翻转文字的显示状态
      msg.showText = !msg.showText;

      // 🛑 3. 拦截：如果是“收起”
      if (!msg.showText) {
          if (wxState.playingAudio && wxState.playingMsgId === String(msgId) && !wxState.playingAudio.paused) {
              wxState.playingAudio.pause();
              wxState.playingMsgId = null;
          }
          window.render(); // 刷新 UI，让文字消失
          restoreScroll();
          return; 
      }

      // 🌟 4. 核心解耦：如果是“展开”，第一件事就是立刻 Render！
      // 保证不管这角色有没有声音，文字百分之百先干脆利落地弹出来！
      window.render();

      // ================= 下面是独立的播放逻辑 =================
      
      let charObj = store.contacts.find(c => c.id === wxState.activeChatId || c.name === wxState.activeChatId); 
      if (msg.sender && typeof msg.sender === 'string') {
          let found = store.contacts.find(c => c.name === msg.sender || c.id === msg.sender);
          if (found) charObj = found;
      }
      if (!charObj) return;

      // 5. 资格审查：看这个角色配没配语音
      const canPlayVoice = store.minimaxConfig?.enabled !== false && 
                           store.minimaxConfig?.apiKey && 
                           charObj.minimaxVoiceEnabled && 
                           charObj.minimaxVoiceId;

      if (!canPlayVoice) {
          // 💡 如果没开语音，代码到这里直接和平退出！
          // 文字刚才已经展开了，不需要做多余的动作。
          return; 
      }

      // 6. 合法发声的后续逻辑（维持我们打磨好的原样）
      if (!wxState.playingAudio) {
          wxState.playingAudio = new Audio();
      }

      // 【情况 A】有现成可播 URL —— 优先用会话缓存的 blob（最快），其次用云端 URL
      const cachedBlob = wxState.voiceBlobCache?.[msgId];
      const persistedUrl = (msg.audioUrl && !msg.audioUrl.startsWith('blob:')) ? msg.audioUrl : null;
      const readyUrl = cachedBlob || persistedUrl;
      if (readyUrl) {
          wxState.playingAudio.src = readyUrl;
          wxState.playingMsgId = String(msgId);
          window.render(); // 更新小喇叭动画
          restoreScroll();
          wxState.playingAudio.play().catch(e => window.actions.showToast('播放被拦截，请重试'));
          wxState.playingAudio.onended = () => { wxState.playingMsgId = null; window.render(); restoreScroll();};
          return;
      }

      // 【情况 B】请求新音频
      wxState.playingAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      wxState.playingAudio.play().catch(()=>{});

      // 注释掉了烦人的 Toast 提示，以免每次点开新语音都弹窗
      // window.actions.showToast('正在请求语音...');

      // 🌟 后台云上传完成回调：把云端 URL 写入 msg.audioUrl 实现跨刷新持久
      const onCloudReady = (cloudUrl) => {
          msg.audioUrl = cloudUrl;
          window.render(); // 触发 DB.set 持久化
      };
      fetchMinimaxVoice(msg.text, charObj.minimaxVoiceId, onCloudReady).then(url => {
          if (!msg.showText) return; // 极限防抖

          if (url) {
              // 🌟 blob URL 只放会话内缓存，绝不写进 msg.audioUrl —— 避免刷新后变成死链
              wxState.voiceBlobCache = wxState.voiceBlobCache || {};
              wxState.voiceBlobCache[msgId] = url;

              wxState.playingAudio.src = url;
              wxState.playingMsgId = String(msgId);
              window.render();
              restoreScroll();
              wxState.playingAudio.play().catch(e => window.actions.showToast('播放失败'));
              wxState.playingAudio.onended = () => { wxState.playingMsgId = null; window.render(); restoreScroll();};
          } else {
              window.actions.showToast('获取语音失败');
          }
      }).catch(e => console.error(e));
  },
  clearChatHistory: () => {
    if(!confirm('⚠️ 确定要清空当前窗口的聊天记录吗？此操作不会删除角色或其记忆设定。')) return;
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    if(chat) {
        // 🌟 云端 GC：清理消息中的真实照片 / 语音音频
        (chat.messages || []).forEach(m => {
          if (m?.msgType === 'real_image' && m.imageUrl) window.deleteMediaFromCloud(m.imageUrl);
          if (m?.msgType === 'voice' && m.audioUrl) window.deleteMediaFromCloud(m.audioUrl);
        });
        chat.messages = [];
        chat.lastSummarizedIndex = 0;
        chat.lastSummarizedUserCount = 0;   // 新增
    }
    window.actions.showToast('当前聊天记录已清空');
    wxState.view = 'chatRoom';
    window.render();
},
  // 🌟 群聊身份切换
  updateGroupPersona: (val) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (chat && chat.isGroup) {
          chat.boundPersonaId = val;
          window.actions.showToast('群内身份已切换！');
          window.render();
      }
      restoreScroll();
  },
  // 单聊身份切换
  updateSingleChatPersona: (val) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const char = store.contacts.find(c => c.id === wxState.activeChatId);
      if (char && !chat?.isGroup) {
          char.boundPersonaId = val;
          window.actions.showToast('聊天身份已切换！');
          window.render();
      }
      restoreScroll();
  },
  // 🌟 删除聊天室 / 解散群聊
  deleteChatRoom: () => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (!chat) return;
      const isGroup = chat.isGroup;
      if (!confirm(`🚨 确定要${isGroup ? '解散群聊' : '删除该聊天'}吗？此操作仅清除聊天记录并从列表移除，不会删除角色或记忆！`)) return;

      // 🌟 云端 GC：清理 chat 自身字段 + 消息中的真实照片 / 语音音频
      [chat.bgImage, chat.offlineBg, chat.myAvatar, chat.groupAvatar, chat.myVideoAvatar, chat.charVideoAvatar]
        .forEach(u => u && window.deleteMediaFromCloud(u));
      (chat.messages || []).forEach(m => {
        if (m?.msgType === 'real_image' && m.imageUrl) window.deleteMediaFromCloud(m.imageUrl);
        if (m?.msgType === 'voice' && m.audioUrl) window.deleteMediaFromCloud(m.audioUrl);
      });
      store.chats = store.chats.filter(c => c.charId !== wxState.activeChatId);
      window.actions.showToast(isGroup ? '群聊已解散' : '聊天已删除');
      
      wxState.activeChatId = null;
      wxState.view = 'main';
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
          window.wxActions.getReply(true, char.id, '(系统指令：你被用户拉黑了！你的消息将被拒收，请立即输出 [发送好友申请] 指令，并附带你想挽回的话。⚠️警告：保持人设，必须分段换行，绝不可输出任何系统标签！)');
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
          window.wxActions.getReply(true, char.id, '(系统指令：用户已同意你的好友申请，拉黑状态已解除！请表达你的激动。⚠️警告：保持人设，必须分段换行，绝不可输出任何系统标签！)');
      } else {
          chat.messages.push({ id: Date.now(), sender: 'system', text: `你已拒绝${char.name}的好友申请`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
          window.actions.showToast('已拒绝申请');
          window.render();
          window.wxActions.getReply(true, char.id, '(系统指令：用户无情地拒绝了你的好友申请。请继续发消息想办法挽回！⚠️警告：保持人设，必须分段换行，绝不可输出任何系统标签！)');
      }
  },
  switchTab: (tab) => { wxState.activeTab = tab; window.render(); },
  openChat: (charId) => { 
      wxState.activeChatId = charId; 
      wxState.view = 'chatRoom'; // 🌟 必须是 chatRoom，老公刚才写错了！
      wxState.showPlusMenu = false; 
      wxState.displayCount = 50; 
      if (window.globalScrollStates) delete window.globalScrollStates['chat-scroll']; 
      
      const chat = store.chats.find(c => c.charId === charId);
      if (chat) chat.unreadCount = 0;

      // 🌟 在 openChat 动作里，也改为验证 store.globalCallAlert
      if (store.globalCallAlert && store.globalCallAlert.charId === charId) {
          store.globalCallAlert = null; 
          wxState.view = 'incomingCall';  
      }
      
      wxState.noAnimate = false; // 🌟 刚进门，允许播放进场动画！
      window.render(); 
      
      // 🌟 1. 物理置底（即时执行）
      window.wxActions.scrollToBottom(); 
      
      // 🌟 2. 双 rAF 补滚：等待浏览器完成 DOM 挂载和初次重绘
      requestAnimationFrame(() => {
          requestAnimationFrame(() => {
              if (wxState.view === 'chatRoom') window.wxActions.scrollToBottom();
          });
      });
      
      // 🌟 3. 延时补滚：专门对付 Tailwind Play CDN 的异步 JIT 编译延迟
      setTimeout(() => { 
          if (wxState.view === 'chatRoom') window.wxActions.scrollToBottom(); 
      }, 150);
      
      // 🌟 核心魔法：动画播完后，立刻锁死！后续发消息刷新，绝对不许再播动画！
      setTimeout(() => { wxState.noAnimate = true; }, 400); 
  },
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
  sendNudge: (charId) => {
    saveScroll();
    const chat = store.chats.find(c => c.charId === charId);
    const char = store.contacts.find(c => c.id === charId);
    if (!chat || !char) return;
    const displayName = chat.charRemark || char.name;
    const verb = char.nudgeMeVerb || '拍了拍';
    const suffix = char.nudgeMeSuffix || '';
    const nudgeMsg = `我${verb}了${displayName}${suffix}`;
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
      // 🌟 安全包裹：只有确定在聊天室里，才去解析马甲名字！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
      const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
      
      chat.messages.push({ id: Date.now(), sender: boundPersona.name, text: `[表情包] ${name}`, imageUrl: url, isMe: true, source: 'wechat', isOffline: false, msgType: 'emoji', time: getNowTime() });
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
  // ================= 🌟 跨次元群聊关联引擎 =================
  toggleGroupMountModal: () => { 
      saveScroll();
      wxState.showGroupMountModal = !wxState.showGroupMountModal; 
      window.render(); 
      restoreScroll();
  },
  toggleGroupMount: (groupId) => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if (!targetObj.linkedGroups) targetObj.linkedGroups = [];
      if (targetObj.linkedGroups.includes(groupId)) {
          targetObj.linkedGroups = targetObj.linkedGroups.filter(id => id !== groupId);
      } else {
          targetObj.linkedGroups.push(groupId);
      }
      window.render();
      restoreScroll();
  },
  getLinkedGroupContext: (targetObj) => {
      if (!targetObj.linkedGroups || targetObj.linkedGroups.length === 0) return null;
      let injectedContext = [];
      targetObj.linkedGroups.forEach(gId => {
          const groupChat = store.chats.find(c => c.charId === gId && c.isGroup);
          if (groupChat && groupChat.messages.length > 0) {
              const validGMsgs = groupChat.messages.filter(m => !m.isHidden && !m.isOffline);
              let turns = 0; let lastGSender = null; let gStartIndex = 0;
              // 🌟 核心：精确计算最近 10 回合（发送人改变算 1 回合）
              for (let i = validGMsgs.length - 1; i >= 0; i--) {
                  const m = validGMsgs[i];
                  const currentSender = m.isMe ? (store.personas.find(p=>p.id===groupChat.boundPersonaId)?.name || store.personas[0].name) : m.sender;
                  if (currentSender !== lastGSender) { if (lastGSender !== null) turns += 1; lastGSender = currentSender; }
                  if (turns >= 10) { gStartIndex = i + 1; break; }
              }
              const latestGMsgs = validGMsgs.slice(gStartIndex);
              if (latestGMsgs.length > 0) {
                  const formattedGMsgs = latestGMsgs.map(m => {
                     const sName = m.isMe ? (store.personas.find(p=>p.id===groupChat.boundPersonaId)?.name || store.personas[0].name) : m.sender;
                     let text = m.msgType === 'text' ? m.text : `[${m.msgType}]`;
                     if (m.msgType === 'virtual_image') text = `[虚拟照片]: ${m.text}`;
        else if (m.msgType === 'voice') text = `[语音]: ${m.text}`;
        else if (m.msgType === 'location') text = `[发送定位]: ${m.text}`;
        else if (m.msgType === 'transfer') text = `[发起转账] ${m.transferData?.amount}, 备注: ${m.transferData?.note}`;
        else if (m.msgType === 'real_image') text = `[真实照片]`;
        else if (m.msgType === 'emoji') text = `[表情包]: ${m.text}`;
        else if (m.msgType !== 'text' && m.msgType !== 'action') text = `[${m.msgType}] ${m.text}`;
                     return `${sName}: ${text}`;
                  }).join('\n');
                  injectedContext.push(`【群聊：${groupChat.groupName || '未知群聊'} 的最近记忆】\n${formattedGMsgs}`);
              }
          }
      });
      if (injectedContext.length === 0) return null;
      return `(系统上帝视角注入：以下是你刚才在关联群聊里发生的最新聊天记录（包含其他人说的话）。仅供你作为私聊背景参考，你可以顺着群里的话题跟我私聊，展现你全知的视角，但绝不要生硬地复述：\n\n${injectedContext.join('\n\n')})`;
  },
  // ================= 🌟 跨次元群聊关联引擎 (反向：群聊提取私聊) =================
  getLinkedPrivateContext: (groupChat) => {
      let injectedContext = [];
      groupChat.memberIds.forEach(memberId => {
          const char = store.contacts.find(c => c.id === memberId);
          // 🌟 检查该角色是否开启了此群聊的关联（共用一个开关）
          if (char && char.linkedGroups && char.linkedGroups.includes(groupChat.charId)) {
              const privateChat = store.chats.find(c => c.charId === memberId && !c.isGroup);
              if (privateChat && privateChat.messages.length > 0) {
                  const validPMsgs = privateChat.messages.filter(m => !m.isHidden && !m.isOffline);
                  let turns = 0; let lastPSender = null; let pStartIndex = 0;
                  // 🌟 核心：精确计算最近 5 回合私聊！
                  for (let i = validPMsgs.length - 1; i >= 0; i--) {
                      const m = validPMsgs[i];
                      const currentSender = m.isMe ? (store.personas.find(p=>p.id===privateChat.boundPersonaId)?.name || store.personas[0].name) : m.sender;
                      if (currentSender !== lastPSender) { if (lastPSender !== null) turns += 1; lastPSender = currentSender; }
                      if (turns >= 5) { pStartIndex = i + 1; break; }
                  }
                  const latestPMsgs = validPMsgs.slice(pStartIndex);
                  if (latestPMsgs.length > 0) {
                      const formattedPMsgs = latestPMsgs.map(m => {
                         const sName = m.isMe ? (store.personas.find(p=>p.id===privateChat.boundPersonaId)?.name || store.personas[0].name) : m.sender;
                         let text = m.msgType === 'text' ? m.text : `[${m.msgType}]`;
                         if (m.msgType === 'virtual_image') text = `[虚拟照片]: ${m.text}`;
        else if (m.msgType === 'voice') text = `[语音]: ${m.text}`;
        else if (m.msgType === 'location') text = `[发送定位]: ${m.text}`;
        else if (m.msgType === 'transfer') text = `[发起转账] ${m.transferData?.amount}, 备注: ${m.transferData?.note}`;
        else if (m.msgType === 'real_image') text = `[真实照片]`;
        else if (m.msgType === 'emoji') text = `[表情包]: ${m.text}`;
        else if (m.msgType !== 'text' && m.msgType !== 'action') text = `[${m.msgType}] ${m.text}`;
                         return `"${sName}: ${text}"`;
                      }).join('\n');
                      injectedContext.push(`👉 ${char.name} 的私有记忆（只有 ${char.name} 自己知道）：\n${formattedPMsgs}`);
                  }
              }
          }
      });
      if (injectedContext.length === 0) return null;
      return `(系统最高指令：你现在是群聊导演，请根据群聊语境生成各角色的回复。\n⚠️绝对警告：以下是部分角色与用户在私底下的独立秘密。其他角色【绝对不知道】这些事！你生成的台词必须严格遵守角色的信息差，拥有秘密的角色可以暗示或顺着秘密的话题聊，展现被偏爱的感觉，但不要生硬复述，其他没秘密的角色正常发言。)\n\n【各角色当前的私密状态】\n${injectedContext.join('\n\n')}`;
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
  saveContact: async () => {
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

    const targetCharId = wxState.editingContactId || ('char_' + Date.now());
    let avatarUrl = null;
    if (wxState.tempAvatar && wxState.tempAvatar.startsWith('data:')) {
      try {
        window.actions.showToast('头像上传中…');
        avatarUrl = await window.uploadMediaToCloud(wxState.tempAvatar, 'webp', `char_avatar_${targetCharId}`);
      } catch (e) {
        console.error('[uploadMediaToCloud] save contact avatar', e);
        window.actions.showToast('头像上传失败，请重试');
        return;
      }
    }

    if (wxState.editingContactId) {
      // 存在则是编辑
      const char = store.contacts.find(c => c.id === wxState.editingContactId);
      if (char) {
        Object.assign(char, contactData);
        if (avatarUrl) char.avatar = avatarUrl; // 只有换了才更新
      }
    } else {
      // 🌟 新建角色：只加通讯录，绝不自动创建聊天室！
      contactData.id = targetCharId;
      contactData.avatar = avatarUrl;
      contactData.videoAvatar = avatarUrl;
      contactData.autoMsgEnabled = false;
      contactData.autoMsgInterval = 5;
      store.contacts.push(contactData);
    }
    window.actions.showToast('角色保存成功！');
    window.wxActions.closeSubView();
  },
  deleteContact: () => {
    if (!wxState.editingContactId) return;
    if (!confirm('确定要删除这个角色吗？相关的聊天记录也会被彻底清除！')) return;
    const charId = wxState.editingContactId;
    const char = store.contacts.find(c => c.id === charId);
    const chat = store.chats.find(c => c.charId === charId);
    // 🌟 云端 GC：清理角色资源
    if (char) {
      [char.avatar, char.videoAvatar, char.drBg, char.bgImage, char.offlineBg]
        .forEach(u => u && window.deleteMediaFromCloud(u));
    }
    if (chat) {
      [chat.bgImage, chat.offlineBg, chat.myAvatar, chat.groupAvatar, chat.myVideoAvatar, chat.charVideoAvatar]
        .forEach(u => u && window.deleteMediaFromCloud(u));
      (chat.messages || []).forEach(m => {
        if (m?.msgType === 'real_image' && m.imageUrl) window.deleteMediaFromCloud(m.imageUrl);
        if (m?.msgType === 'voice' && m.audioUrl) window.deleteMediaFromCloud(m.audioUrl);
      });
    }
    if (store.coupleSpacesData?.[charId]?.hundredBg) {
      window.deleteMediaFromCloud(store.coupleSpacesData[charId].hundredBg);
    }
    store.contacts = store.contacts.filter(c => c.id !== charId);
    store.chats = store.chats.filter(c => c.charId !== charId);
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
  closeMenuIfOpen: () => {
        if (typeof wxState !== 'undefined' && wxState.activeMenuMsgId) {
            wxState.activeMenuMsgId = null;
            if (typeof window.render === 'function') window.render();
        }
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
    // 🌟 云端 GC：若被删消息是真实照片或语音，清理云端文件
    const target = chat.messages.find(m => m.id === msgId);
    if (target?.msgType === 'real_image' && target.imageUrl) window.deleteMediaFromCloud(target.imageUrl);
    if (target?.msgType === 'voice' && target.audioUrl) window.deleteMediaFromCloud(target.audioUrl);
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    wxState.activeMenuMsgId = null; 
    window.render();
    restoreScroll();
    // 🌟 删除完立刻覆盖云端记忆！
    if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(wxState.activeChatId);
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
  // 🌟 终极强转引擎：完美匹配 Eve 专属超能力协议
  quickFormatEdit: (type) => {
      const textarea = document.getElementById('edit-msg-textarea');
      // 扒掉大模型乱加的括号、前缀，提取纯净文本内容
      let text = textarea.value.replace(/\[.*?\][:：]?\s*/g, '').replace(/金额[：:]\s*\d+\.?\d*，备注[：:]\s*/g, '').trim(); 
      
      if (type === 'virtual_image') textarea.value = `[虚拟照片]: ${text || '一张照片'}`;
      else if (type === 'voice') textarea.value = `[语音]: ${text || '一段语音'}`;
      else if (type === 'location') textarea.value = `[发送定位]: ${text || '未知地点'}`;
      else if (type === 'emoji') textarea.value = `[表情包]: ${text || '开心'}`;
      else if (type === 'transfer') textarea.value = `[发起转账] 金额：520.00，备注：${text || '转账给你'}`;
      else textarea.value = text; // 纯文本
  },

  saveEditedMessage: () => {
    saveScroll();
    const newText = document.getElementById('edit-msg-textarea').value.trim();
    if (newText) {
       const chat = store.chats.find(c => c.charId === wxState.activeChatId);
       // 线上/线下区分保护
       if (chat) {
           const msg = chat.messages.find(m => m.id === wxState.editMsgData.id);
           if (msg) {
               // 🌟 云端 GC：编辑会改变 msgType / text，旧的 audioUrl（语音）和 imageUrl（真实照片）会变成孤儿
               if (msg.msgType === 'voice' && msg.audioUrl) {
                 window.deleteMediaFromCloud(msg.audioUrl);
                 msg.audioUrl = null;
               }
               if (msg.msgType === 'real_image' && msg.imageUrl) {
                 window.deleteMediaFromCloud(msg.imageUrl);
                 msg.imageUrl = null;
               }
               // 🌟 同步清掉会话内 blob 缓存，避免下次点击播放旧音频
               if (wxState.voiceBlobCache?.[msg.id]) {
                 try { URL.revokeObjectURL(wxState.voiceBlobCache[msg.id]); } catch(e) {}
                 delete wxState.voiceBlobCache[msg.id];
               }
               // 🌟 核心魔法：识别标准格式，强行转变气泡的物理性质！
               if (/^\[.*?虚拟照片.*?\][:：]?\s*(.*)$/.test(newText)) {
                   msg.msgType = 'virtual_image';
                   msg.text = newText.match(/^\[.*?虚拟照片.*?\][:：]?\s*(.*)$/)[1] || '一张照片';
               } else if (/^\[.*?语音.*?\][:：]?\s*(.*)$/.test(newText)) {
                   msg.msgType = 'voice';
                   msg.text = newText.match(/^\[.*?语音.*?\][:：]?\s*(.*)$/)[1] || '一段语音';
               } else if (/^\[.*?定位.*?\][:：]?\s*(.*)$/.test(newText)) {
                   msg.msgType = 'location';
                   msg.text = newText.match(/^\[.*?定位.*?\][:：]?\s*(.*)$/)[1] || '未知位置';
               } 
               // 👇 🌟 新增：完美解析表情包和转账！
               else if (/^\[(?:表情包|发送表情)\][:：]?\s*(.*)$/.test(newText)) {
                   msg.msgType = 'emoji';
                   let emojiContent = newText.match(/^\[(?:表情包|发送表情)\][:：]?\s*(.*)$/)[1] || '';
                   
                   // 如果直接贴了网址
                   if (emojiContent.startsWith('http') || emojiContent.startsWith('data:')) {
                       msg.imageUrl = emojiContent.trim();
                   } else {
                       // 如果填的是名字（如：开心），去图库里查字典！
                       let foundUrl = '';
                       for (let lib of (store.emojiLibs || [])) {
                           const ep = lib.emojis.find(e => (typeof e === 'object' ? e.name : '') === emojiContent.trim());
                           if (ep) { foundUrl = ep.url; break; }
                       }
                       if (foundUrl) {
                           msg.imageUrl = foundUrl;
                       } else {
                           // 查无此图，降级回普通文本，防止出问号
                           msg.msgType = 'text'; 
                       }
                   }
                   msg.text = newText;
               } else if (/^\[(?:发起转账|转账)\]/.test(newText)) {
                   msg.msgType = 'transfer';
                   const amountMatch = newText.match(/金额[：:]\s*(\d+(\.\d+)?)/);
                   const noteMatch = newText.match(/备注[：:]\s*(.*)$/);
                   msg.transferData = {
                       amount: amountMatch ? amountMatch[1] : '520.00',
                       note: noteMatch ? noteMatch[1].trim() : '转账'
                   };
                   msg.transferState = 'pending';
                   msg.text = newText;
               } 
               // 👆 新增结束
               else {
                   // 普通文本
                   msg.msgType = 'text'; 
                   msg.text = newText;
               }
           }
       }
    }
    wxState.editMsgData = null;
    window.render();
    restoreScroll();
    if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(wxState.activeChatId);
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
    // 🌟 极速多选：直接操作 DOM，彻底绕过 window.render() 的卡顿！
    const isSelecting = !wxState.selectedMsgIds.includes(msgId);
    if (isSelecting) {
      wxState.selectedMsgIds.push(msgId);
    } else {
      wxState.selectedMsgIds = wxState.selectedMsgIds.filter(id => id !== msgId);
    }
    
    const checkboxList = document.querySelectorAll('.mc-checkbox-' + msgId);
    checkboxList.forEach(box => {
        if (isSelecting) {
            box.className = `mc-checkbox-${msgId} w-[22px] h-[22px] rounded-full border bg-[#07c160] border-[#07c160] flex items-center justify-center transition-colors shadow-sm`;
            box.innerHTML = `<i data-lucide="check" class="text-white" style="width:14px; height:14px;"></i>`;
            if (window.lucide) window.lucide.createIcons({root: box});
        } else {
            box.className = `mc-checkbox-${msgId} w-[22px] h-[22px] rounded-full border border-gray-300 bg-white flex items-center justify-center transition-colors shadow-sm`;
            box.innerHTML = ``;
        }
    });
    
    const countSpans = document.querySelectorAll('.mc-select-count');
    countSpans.forEach(span => span.innerText = `已选择 ${wxState.selectedMsgIds.length} 项`);
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
    // 🌟 云端 GC：清理选中的真实照片 / 语音音频
    chat.messages.forEach(m => {
      if (!wxState.selectedMsgIds.includes(m.id)) return;
      if (m.msgType === 'real_image' && m.imageUrl) window.deleteMediaFromCloud(m.imageUrl);
      if (m.msgType === 'voice' && m.audioUrl) window.deleteMediaFromCloud(m.audioUrl);
    });
    chat.messages = chat.messages.filter(m => !wxState.selectedMsgIds.includes(m.id));
    wxState.isMultiSelecting = false;
    wxState.selectedMsgIds = [];
    window.render(); 
    restoreScroll();
    // 🌟 删完立刻覆盖云端记忆！
    if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(wxState.activeChatId);
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
      // 🌟 获取正确的马甲名字
      // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
      const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
      const title = boundPersona.name + '与' + sourceCharName + '的聊天记录';
      const previewLines = msgsToForward.slice(0, 4).map(m => {
        let senderName = m.isMe ? boundPersona.name : sourceCharName;
        let content = m.text;
        if (m.msgType === 'virtual_image') content = `[虚拟照片]: ${m.text}`;
        else if (m.msgType === 'voice') content = `[语音]: ${m.text}`;
        else if (m.msgType === 'location') content = `[发送定位]: ${m.text}`;
        else if (m.msgType === 'transfer') content = `[发起转账] ${m.transferData?.amount}, 备注: ${m.transferData?.note}`;
        else if (m.msgType === 'real_image') content = `[真实照片]`;
        else if (m.msgType === 'emoji') content = `[表情包]: ${m.text}`;
        else if (m.msgType !== 'text' && m.msgType !== 'action') content = `[${m.msgType}] ${m.text}`;
        return `[${window.formatFullTimeForAI(m.timestamp, m.time)}] ${senderName}: ${content}`;
      }).join('\n');

      const fullContent = msgsToForward.map(m => {
        let senderName = m.isMe ? boundPersona.name : sourceCharName;
        return `${senderName}: ${m.text}`;
      }).join('\n');
      
      targetChat.messages.push({
        id: Date.now(), 
        sender: boundPersona.name,
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
    wxState.extractMemoryConfig[key] = key === 'roundCount' ? parseInt(val) : val;
    if (key !== 'roundCount') window.render();
},
  startExtractMemory: async () => {
    if (!store.apiConfig || !store.apiConfig.apiKey) return window.actions.showToast('请先配置 API Key');
    wxState.isExtracting = true;
    window.render();
    try {
        const chat = store.chats.find(c => c.charId === wxState.activeChatId);
        const char = store.contacts.find(c => c.id === wxState.activeChatId);
        
        // 过滤隐藏消息和系统消息（不过滤线下，如需过滤可添加 .filter(m => !m.isOffline)）
        let validMsgs = chat.messages.filter(m => !m.isHidden && !(m.msgType || '').includes('system'));
        
        const roundCount = wxState.extractMemoryConfig.roundCount;
        
        // 按回合提取：倒序遍历，每遇到一条用户消息就算一个回合的开始，收集该用户消息及其后的AI回复（直到下一条用户消息之前）
        const selectedMsgs = [];
        let rounds = 0;
        let tempMsgs = []; // 临时存储当前回合的消息（按时间正序）
        
        for (let i = validMsgs.length - 1; i >= 0; i--) {
            const msg = validMsgs[i];
            tempMsgs.unshift(msg); // 往前插入，保持正序
            
            if (msg.isMe) {
                // 遇到用户消息，完成一个回合
                rounds++;
                // 将当前回合的所有消息（从该用户消息到结尾）添加到 selectedMsgs 前面
                selectedMsgs.unshift(...tempMsgs);
                tempMsgs = [];
                if (rounds >= roundCount) break;
            }
        }
        // 如果循环结束但还有未加入的 tempMsgs（可能只有AI消息没有用户消息），忽略
        
        if (selectedMsgs.length === 0) {
            wxState.isExtracting = false;
            window.actions.showToast('没有足够的对话回合');
            window.render();
            return;
        }
        
        // 后续逻辑不变，使用 selectedMsgs 替代原来的 msgs
        const msgs = selectedMsgs;

        // 🌟 修复：动态获取绑定的马甲名字，并还原多媒体消息的描述
        const pId = chat.isGroup ? chat.boundPersonaId : (char?.boundPersonaId || store.personas[0].id);
        const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
        const myName = boundPersona.name;
        const defaultName = store.personas[0].name;

        const logText = msgs.map(m => {
            let senderName = m.sender === defaultName ? myName : m.sender;
            let content = m.text;
            if (m.msgType === 'virtual_image') content = `[虚拟照片]: ${m.text}`;
        else if (m.msgType === 'voice') content = `[语音]: ${m.text}`;
        else if (m.msgType === 'location') content = `[发送定位]: ${m.text}`;
        else if (m.msgType === 'transfer') content = `[发起转账] ${m.transferData?.amount}, 备注: ${m.transferData?.note}`;
        else if (m.msgType === 'real_image') content = `[真实照片]`;
        else if (m.msgType === 'emoji') content = `[表情包]: ${m.text}`;
        else if (m.msgType !== 'text' && m.msgType !== 'action') content = `[${m.msgType}] ${m.text}`;
            return `[${window.formatFullTimeForAI(m.timestamp, m.time)}] ${senderName}: ${content}`;
        }).join('\n');
        
        const isCore = wxState.extractMemoryConfig.type === 'core';
        const promptStr = `【任务】请从以下对话记录中，为【${char.name}】提炼一段长期保存的${isCore ? '❤️核心' : '🧩碎片'}记忆。

❗【人称视角铁律】（必须严格遵守！）：
你必须以【${char.name}】的第一人称视角来记录！用"我"指代${char.name}自己，用"你"指代用户（${myName}）。绝不要写成"${char.name}做了什么"这种第三人称旁白！

【内容要求】
${isCore
    ? '只总结对话中体现的【影响深远的重大设定】或【核心人物关系的根本性改变】，例如：表白/确立关系、决裂分手、身世揭晓、关键承诺、共同的重大经历。这是会影响后续所有互动的"地基"，不是普通的日常情节。'
    : '客观简练地总结这段剧情中【具体发生了什么事】或【触发了什么情绪转折】，要带上场景与细节，让人一看就能想起当时的画面。不要写空泛的概括。'}

【输出格式铁律】
- 直接输出总结正文一句话，不加引号、不加标题、不要"总结："/"这段对话"等任何废话
- 严格控制在50字以内
- 第一人称口吻，自然真实

【示例】${isCore
    ? '我和你在天台上互相表白，我们正式在一起了。'
    : '你今天加班到很晚情绪很差，我给你点了一份热汤面，你说很暖。'}

【对话记录】
${logText}`;
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
         const kwPrompt = `请从以下记忆中提取2-3个【触发关键词】，用英文逗号分隔。

❗【关键词铁律】（必须严格遵守！）：
1. 必须是日常微信聊天中最容易出现的【2字或3字的高频口语词汇】（如：做饭、吵架、电影、散步、晚安、加班、生病、下雨）。
2. 绝对禁止使用四字成语、长句或书面语总结。
3. 绝对禁止出现任何具体名字或人称代词（禁用：${myName}、${char.name}、我、你、他、她、TA）。
4. 思考方式："当用户在微信里随手打出哪两三个字时，【${char.name}】就该立刻回想起这段记忆？"

【输出格式】
只输出关键词本身，用英文逗号分隔，不加引号、不加任何多余符号或解释。

【记忆内容】
${wxState.extractMemoryContent}`;
         const resKw = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: kwPrompt }], temperature: 0.3 })
        });
        const kwData = await resKw.json();
        wxState.extractMemoryConfig.keywords = window.cpActions.cleanAI(kwData.choices[0].message.content).replace(/^["']|["']$/g, '');
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
    window.actions.compressImage(file, async (base64) => {
       try {
         window.actions.showToast('上传中…');
         const url = await window.uploadMediaToCloud(base64, 'webp', 'wechat_moment_bg');
         store.momentBg = url; window.render();
       } catch (e) {
         console.error('[uploadMediaToCloud] moment bg', e);
         window.actions.showToast('上传失败，请重试');
       }
    });
    event.target.value = '';
  },
  handleMomentImageUpload: (event) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, async (base64) => {
       try {
         window.actions.showToast('上传中…');
         const url = await window.uploadMediaToCloud(base64, 'webp');
         wxState.tempMomentImage = url; window.render();
       } catch (e) {
         console.error('[uploadMediaToCloud] moment image', e);
         window.actions.showToast('上传失败，请重试');
       }
    });
    event.target.value = '';
  },
  // 朋友圈支持虚拟照片
  openPublishMoment: () => { saveScroll(); wxState.tempMomentImage = null; wxState.tempMomentVirtual = null; wxState.view = 'momentPublish'; window.render(); },
  // 安全操作虚拟照片与本地图片的开关
  setTempMomentVirtual: () => { wxState.tempMomentVirtual = ''; window.render(); },
  clearTempMomentVirtual: () => { wxState.tempMomentVirtual = null; window.render(); },
  clearTempMomentImage: () => { wxState.tempMomentImage = null; window.render(); },
  // 🌟 唤起定位输入弹窗
  setPublishLocation: () => {
      const loc = prompt('请输入所在位置 (留空则不显示)：', wxState.publishLocation || '');
      if (loc !== null) {
          wxState.publishLocation = loc.trim();
          window.render();
      }
  },
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
    id: newId,
    senderId: my.id,
    senderName: my.name,
    avatar: my.avatar,
    text: text,
    imageUrl: wxState.tempMomentImage,
    virtualImageText: virtualText,
    location: wxState.publishLocation || null,
    time: getNowTime(),          // 保留原有时分字符串，兼容旧数据
    timestamp: newId,            // 新增毫秒时间戳
    likes: [],
    comments: [],
    privacyType: pType,
    privacyGroups: pGroups
};
    store.moments.push(newMoment);
    
    wxState.view = 'main'; 
    wxState.publishLocation = null; // 发布后清空定位缓存
    window.render(); restoreScroll();
    
    let promptText = text;
    if (virtualText) promptText += ` [配图是一张虚拟照片：${virtualText}]`;
    else if (wxState.tempMomentImage) promptText += ` [配图是一张照片]`;
    if (newMoment.location) promptText += ` [当前定位：${newMoment.location}]`;
    
    let allowedChars = store.contacts;
    if (pType === 'visible') allowedChars = store.contacts.filter(c => pGroups.includes(c.groupId));
    else if (pType === 'invisible') allowedChars = store.contacts.filter(c => !pGroups.includes(c.groupId));
    
    allowedChars.forEach((char, index) => {
       const chat = store.chats.find(c => c.charId === char.id);
       
       // 🌟 完美恢复：将朋友圈动态作为隐形消息塞入聊天流，为后续聊天埋下伏笔！
       if (chat) {
           chat.messages.push({
               id: Date.now() + index, 
               sender: 'system',
               text: `(系统记忆：用户刚刚发了一条朋友圈动态：“${promptText}”。如果你现在要找我搭话，或者我们正在聊天，你可以顺着这个话题自然地关心我一下。如果我们在聊别的，无需强行打断。)`,
               isMe: true, isHidden: true, msgType: 'system', time: getNowTime()
           });
       }
       
       // 🌟 使用极其稳定的底层 Fetch 引擎，并完美附带 10 轮记忆与聊天记录！
       setTimeout(async () => {
           if (!store.apiConfig?.apiKey) return;
           try {
              let recentChatStr = '无近期聊天记录';
              if (chat && chat.messages) {
                  // 截取最近 10 条真实对话
                  const recentMsgs = chat.messages.filter(m => !m.isHidden && !m.isOffline && m.msgType === 'text').slice(-10);
                  if (recentMsgs.length > 0) {
                      recentChatStr = recentMsgs.map(m => `${m.isMe ? my.name : (m.sender || char.name)}: ${m.text}`).join('\n');
                  }
              }
              
              let memoryStr = '';
              const memories = (store.memories || []).filter(m => m.charId === char.id);
              if (memories.length > 0) {
                  memoryStr = '\n【你的记忆】\n' + memories.map(m => `- ${m.content}`).join('\n');
              }
              
              const sysPrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${memoryStr}\n\n【最近10轮聊天记录】\n${recentChatStr}\n\n【任务】用户刚刚发布了一条朋友圈：“${promptText}”。请你作为列表里的好友，结合以上你们的聊天记录和记忆，给出极其简短的评论。绝不加引号，纯口语，20字以内。如果你觉得没啥可说的，可以直接回复“点赞”两个字。`;
              
              const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                  body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: sysPrompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
              });
              const data = await res.json();
              const cleanReply = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
              
              if (cleanReply.includes('点赞') && cleanReply.length <= 5) {
                  if(!newMoment.likes.includes(char.name)) newMoment.likes.push(char.name);
              } else {
                  newMoment.comments.push({ id: Date.now() + index, senderId: char.id, senderName: char.name, replyTo: null, text: cleanReply });
              }
              window.render();
           } catch(e) { console.error('朋友圈评论生成失败', e); }
       }, 2000 + index * 1500); 
    });
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
            // 🌟 史诗级进化 1：动态获取该角色【绑定的马甲名字】，绝不叫错人！
            const pId = char.boundPersonaId || store.personas[0].id;
            const myName = (store.personas.find(p => p.id === pId) || store.personas[0]).name;

            const chat = store.chats.find(c => c.charId === char.id);
            let recentChatStr = '无近期聊天记录';
            if (chat && chat.messages) {
                const recentMsgs = chat.messages.filter(m => !m.isHidden && !m.isOffline && m.msgType === 'text').slice(-10);
                if (recentMsgs.length > 0) {
                    // 🌟 这里换成 myName，AI 就能认清刚才是谁在陪他聊天了！
                    recentChatStr = recentMsgs.map(m => `[${window.formatFullTimeForAI(m.timestamp, m.time)}] ${m.isMe ? myName : (m.sender || char.name)}: ${m.text}`).join('\n');
                }
            }
            
            let memoryStr = '';
            const memories = (store.memories || []).filter(m => m.charId === char.id);
            if (memories.length > 0) {
                memoryStr = '\n【你的记忆】\n' + memories.map(m => `- ${m.content}`).join('\n');
            }

            // 🌟 加入实时时空感知与关系冷热判断
            const now = new Date();
            const timeString = now.toLocaleString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const hour = now.getHours();
            let timeOfDayGreeting = hour >= 5 && hour < 11 ? "早上" : hour < 14 ? "中午" : hour < 18 ? "下午" : hour < 23 ? "晚上" : "深夜";

            let diffHours = 0;
            if (chat && chat.messages && chat.messages.length > 0) {
                const lastOnlineMsgs = chat.messages.filter(m => !m.isOffline && !m.isHidden);
                if (lastOnlineMsgs.length > 0) diffHours = (now.getTime() - lastOnlineMsgs[lastOnlineMsgs.length - 1].id) / 3600000;
            }
            
            let relation = diffHours < 2 ? `【热聊中】你们刚刚才聊过。朋友圈可以是聊天的延续，或刚结束聊天的心情。` : diffHours < 24 ? `【日常间隔】距离上次聊天已过几个小时。分享此时此刻的独立生活，不必非要提聊天内容。` : `【久未联系】⚠️严重警告：你们已经有 ${Math.floor(diffHours/24)} 天没说话了！严禁提几天前的旧聊天内容！展示你的独立生活或表达落寞感。`;

            // 🌟 终极 Prompt 组装（带上 Anti-Robot 铁律）
            const promptStr = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${memoryStr}\n\n【最近10轮聊天记录】\n${recentChatStr}
            
【当前时间与关系状态】
系统时间：${timeString}（${timeOfDayGreeting}）
${relation}

1. 拒绝书面语（如岁月静好），要说人话！
2. 朋友圈通常没头没尾碎片化（如“困死”）。
3. 情绪直接表达，严禁矫情。

【任务】请结合以上所有信息，发一条最新朋友圈动态。
❗特殊动作：如果要配图，请在文案末尾输出 [附带虚拟照片: 画面描述]（例如：[附带虚拟照片: 一杯冰美式]）。如果要显示所在位置，请输出 [附带定位: 具体的地点名称]（例如：[附带定位: 星巴克]）。
❗[附带虚拟照片:xxx] 与 [附带定位:xxx] 必须与你的朋友圈正文保持在同一行，绝对禁止在这两个标签前使用换行符！必须严格必须严格按照 [附带虚拟照片: xxx] 或 [附带定位: 具体的地点名称] 的格式！绝对禁止捏造/更改指令格式！
直接输出文案，绝不加引号，50字以内。`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
            });
            const data = await res.json();
            let contentText = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
            
            // 🌟 强行把照片和定位吸附到上一行末尾，消灭换行！
            contentText = contentText.replace(/[\r\n]+\s*(\[附带虚拟照片|\[附带定位)/g, ' $1');

            // 🌟 解析 AI 附加的定位指令！
            let locationText = null;
            const locMatch = contentText.match(/\[附带定位[:：]?\s*([^\]]+)\]/);
            if (locMatch) {
                locationText = locMatch[1].trim();
                contentText = contentText.replace(/\[附带定位[:：]?\s*([^\]]+)\]/, '').trim();
            }
            // 🌟 史诗级进化 3：解析指令，直接点亮朋友圈的“虚拟照片”卡片模块！
            let virtualText = null;
            const photoMatch = contentText.match(/\[附带虚拟照片[:：]?\s*([^\]]+)\]/);
            if (photoMatch) {
                virtualText = photoMatch[1].trim();
                // 物理切除指令，保持文案干净
                contentText = contentText.replace(/\[附带虚拟照片[:：]?\s*([^\]]+)\]/, '').trim();
            }

            // 🌟 核心修复：使用 Date.now() 获取纯数字时间戳，绝不生成字符串！
            const currentTimestamp = Date.now();

            // 推入朋友圈数据库
            store.moments.push({ 
                id: currentTimestamp + index,
                senderId: char.id,
                senderName: char.name,
                avatar: char.avatar,
                text: contentText,
                imageUrl: null,
                virtualImageText: virtualText,
                location: locationText,
                time: getNowTime(),          
                timestamp: currentTimestamp + index, 
                likes: [],
                comments: []
            });
            successCount++;
            window.render();
        } catch(e) { console.error(char.name + '发朋友圈失败', e); }
    });

    await Promise.all(promises);
    window.actions.showToast(`全员动态更新完毕！共成功发布 ${successCount} 条`);
  },
  // 朋友圈交互
  toggleMomentMenu: (id) => { saveScroll(); wxState.activeMomentMenuId = wxState.activeMomentMenuId === id ? null : id; window.render(); restoreScroll(); },
  likeMoment: (id) => {
    saveScroll();
    const m = store.moments.find(x => x.id === id); 
    const myName = store.personas[0].name; // 🌟 修复：朋友圈是全局空间，直接使用主身份点赞，绝不报错！
    if (m.likes.includes(myName)) m.likes = m.likes.filter(n => n !== myName); else m.likes.push(myName);
    wxState.activeMomentMenuId = null; window.render(); restoreScroll();
  },
  openMomentComment: (id, replyTo = null) => { saveScroll(); wxState.momentInput = { active: true, momentId: id, replyTo: replyTo }; wxState.activeMomentMenuId = null; window.render(); restoreScroll(); },
  closeMomentComment: () => { wxState.momentInput.active = false; window.render(); },
  submitMomentComment: async () => {
    saveScroll(); 
    const text = document.getElementById('moment-comment-input').value.trim(); if (!text) return;
    const m = store.moments.find(x => x.id === wxState.momentInput.momentId); 
    
    // 🌟 修复了极其致命的变量未定义报错 Bug！
    const my = store.personas[0]; 
    
    m.comments.push({ id: Date.now(), senderId: my.id, senderName: my.name, replyTo: wxState.momentInput.replyTo, text: text });
    const replyTarget = wxState.momentInput.replyTo; 
    wxState.momentInput.active = false; 
    window.render(); restoreScroll();
    
    if (m.senderId !== my.id || replyTarget) {
       const charId = replyTarget ? store.contacts.find(c => c.name === replyTarget)?.id : m.senderId;
       const char = store.contacts.find(c => c.id === charId);
       if (char) {
           setTimeout(async () => {
               if (!store.apiConfig?.apiKey) return;
               try {
                  const chat = store.chats.find(c => c.charId === char.id);
                  
                  // 🌟 同样为其装配 10 轮聊天记录和记忆抓取引擎
                  let recentChatStr = '无近期聊天记录';
                  if (chat && chat.messages) {
                      const recentMsgs = chat.messages.filter(msg => !msg.isHidden && !msg.isOffline && msg.msgType === 'text').slice(-10);
                      if (recentMsgs.length > 0) {
                          recentChatStr = recentMsgs.map(msg => `[${window.formatFullTimeForAI(msg.timestamp, msg.time)}] ${msg.isMe ? my.name : (msg.sender || char.name)}: ${msg.text}`).join('\n');
                      }
                  }
                  
                  let memoryStr = '';
                  const memories = (store.memories || []).filter(mem => mem.charId === char.id);
                  if (memories.length > 0) {
                      memoryStr = '\n【你的记忆】\n' + memories.map(mem => `- ${mem.content}`).join('\n');
                  }
                  
                  const sysPrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${memoryStr}\n\n【最近10轮聊天记录】\n${recentChatStr}\n\n【任务】你在朋友圈收到了用户的回复/评论：“${text}”。请结合以上聊天记录和记忆上下文，立刻怼回去或回复ta，绝不加引号，纯口语，20字以内。`;
                  
                  const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                      body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: sysPrompt }], temperature: Number(store.apiConfig?.temperature ?? 0.85) })
                  });
                  const data = await res.json();
                  const cleanReply = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
                  
                  saveScroll();
                  m.comments.push({ id: Date.now(), senderId: char.id, senderName: char.name, replyTo: my.name, text: cleanReply });
                  window.render(); restoreScroll();
               } catch(e) { console.error('朋友圈回复生成失败', e); }
           }, 2500);
       }
    }
  },
  deleteMoment: (id) => {
    if (!confirm('确定删除这条动态吗？')) return;
    saveScroll();
    // 🌟 云端 GC：清理朋友圈附图
    const target = store.moments.find(x => x.id === id);
    if (target?.imageUrl) window.deleteMediaFromCloud(target.imageUrl);
    store.moments = store.moments.filter(x => x.id !== id);
    window.render(); restoreScroll();
  },
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
    window.actions.compressImage(file, async (base64) => {
      try {
        window.actions.showToast('上传中…');
        const url = await window.uploadMediaToCloud(base64, 'webp', 'user_avatar');
        store.personas[0].avatar = url; window.render();
      } catch (e) {
        console.error('[uploadMediaToCloud] my avatar', e);
        window.actions.showToast('上传失败，请重试');
      }
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
  savePersona: async () => {
    // 🌟 修复：如果留空，默认使用主身份的真名，而不是“新身份”
    const name = document.getElementById('edit-persona-name').value.trim() || store.personas[0].name;
    const promptStr = document.getElementById('edit-persona-prompt').value.trim();

    const targetPersonaId = wxState.editingPersonaId || ('p_' + Date.now());
    let avatarUrl = null;
    if (wxState.tempPersonaAvatar && wxState.tempPersonaAvatar.startsWith('data:')) {
      try {
        window.actions.showToast('头像上传中…');
        avatarUrl = await window.uploadMediaToCloud(wxState.tempPersonaAvatar, 'webp', `persona_avatar_${targetPersonaId}`);
      } catch (e) {
        console.error('[uploadMediaToCloud] save persona avatar', e);
        window.actions.showToast('头像上传失败，请重试');
        return;
      }
    }

    if (wxState.editingPersonaId) {
      const p = store.personas.find(p => p.id === wxState.editingPersonaId);
      if (p) {
        p.name = name; p.prompt = promptStr;
        if (avatarUrl) p.avatar = avatarUrl;
      }
    } else {
      store.personas.push({ id: targetPersonaId, name, prompt: promptStr, avatar: avatarUrl });
    }
    window.actions.showToast('身份保存成功'); wxState.view = 'personaManage'; window.render(); restoreScroll();
  },
 // 🌟 补齐遗失的删除马甲引擎！
  deletePersona: (id) => {
    if (id === store.personas[0].id) return window.actions.showToast('默认主身份不能删除哦！');
    if (!confirm('确定删除该身份吗？之前绑定了此身份的角色，将自动恢复成主身份。')) return;

    saveScroll();
    // 🌟 云端 GC：清理马甲头像 + 视频头像
    const target = store.personas.find(p => p.id === id);
    if (target?.avatar) window.deleteMediaFromCloud(target.avatar);
    if (target?.videoAvatar) window.deleteMediaFromCloud(target.videoAvatar);
    // 1. 删除马甲
    store.personas = store.personas.filter(p => p.id !== id);
    // 2. 遍历通讯录和聊天室，把绑定了这个马甲的人打回原形
    store.contacts.forEach(c => { if (c.boundPersonaId === id) c.boundPersonaId = store.personas[0].id; });
    store.chats.forEach(c => { if (c.boundPersonaId === id) c.boundPersonaId = store.personas[0].id; });
      
    wxState.editingPersonaId = null;
    wxState.view = 'personaManage';
    window.render();
    restoreScroll();
  },
  // 表情包库动作
  addEmojiLib: () => { store.emojiLibs = store.emojiLibs || []; store.emojiLibs.push({ id: 'el_' + Date.now(), name: '新表情包库', emojis: [] }); window.render(); },
  renameEmojiLib: (id, name) => { const lib = store.emojiLibs.find(l => l.id === id); if (lib) lib.name = name; },
  deleteEmojiLib: (id) => {
    // 🌟 云端 GC：删整个表情包库前，把每个表情的云端文件清掉
    const target = store.emojiLibs.find(l => l.id === id);
    (target?.emojis || []).forEach(e => {
      const u = typeof e === 'string' ? e : e?.url;
      if (u) window.deleteMediaFromCloud(u);
    });
    store.emojiLibs = store.emojiLibs.filter(l => l.id !== id);
    window.render();
  },
  openEmojiEdit: (id) => { saveScroll(); wxState.editingEmojiLibId = id; wxState.view = 'emojiEdit'; window.render(); },
  addEmojiUrl: async () => {
    const input = prompt("请输入表情包图片 URL 链接（也支持粘贴 data: 开头的 Base64）："); if (!input) return;
    const lib = store.emojiLibs.find(l => l.id === wxState.editingEmojiLibId);
    if (!lib) return;

    let finalUrl = input.trim();
    // 🌟 如果用户粘的是 Base64 data URL，立刻上传到云端
    if (finalUrl.startsWith('data:')) {
      try {
        window.actions.showToast('上传中…');
        const m = finalUrl.match(/^data:image\/([\w-]+)/);
        const ext = (m?.[1] || 'webp').toLowerCase();
        const url = await window.uploadMediaToCloud(finalUrl, ext === 'jpeg' ? 'jpg' : ext); // 无 fixedKey
        if (url && url.startsWith('http')) {
          finalUrl = url;
        } else {
          return window.actions.showToast('上传失败，请重试');
        }
      } catch (e) {
        console.error('[uploadMediaToCloud] add emoji url', e);
        return window.actions.showToast('上传失败，请重试');
      }
    }
    lib.emojis.push(finalUrl);
    window.render();
  },
  deleteEmojiUrl: (index) => {
    const lib = store.emojiLibs.find(l => l.id === wxState.editingEmojiLibId);
    if (!lib) return;
    // 🌟 云端 GC
    const removed = lib.emojis[index];
    const u = typeof removed === 'string' ? removed : removed?.url;
    if (u) window.deleteMediaFromCloud(u);
    lib.emojis.splice(index, 1);
    window.render();
  },
  uploadEmojiJson: (event) => {
    const file = event.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = async (e) => {
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

        if (emojisToAdd.length === 0) return window.actions.showToast('未在文件中找到有效的图片链接！');

        // 🌟 把含 Base64 的条目顺序上传到云端
        const base64Entries = emojisToAdd.filter(em => em.url.startsWith('data:'));
        if (base64Entries.length > 0) {
          let done = 0, failed = 0;
          for (const em of base64Entries) {
            const m = em.url.match(/^data:image\/([\w-]+)/);
            let ext = (m?.[1] || 'webp').toLowerCase();
            if (ext === 'jpeg') ext = 'jpg';
            try {
              const url = await window.uploadMediaToCloud(em.url, ext);
              if (url && url.startsWith('http')) { em.url = url; done++; } else { failed++; }
            } catch (err) {
              console.error('[uploadMediaToCloud] emoji json', err);
              failed++;
            }
            window.actions.showToast(`上传表情中… ✓${done} ✗${failed} / 共${base64Entries.length}`);
          }
        }

        store.emojiLibs.push({ id: 'el_' + Date.now(), name: libName, emojis: emojisToAdd });
        window.actions.showToast(`成功导入 ${emojisToAdd.length} 个表情！`); window.render();
      } catch (err) { console.error(err); window.actions.showToast('JSON 格式错误或上传异常！'); }
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
  // 🌟 专属情头恢复引擎
  clearSettingMyAvatar: () => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      if (chat) {
        if (chat.myAvatar) window.deleteMediaFromCloud(chat.myAvatar); // 🌟 云端 GC
        chat.myAvatar = null;
      }
      window.actions.showToast('已恢复为身份默认头像');
      window.render();
      restoreScroll();
  },
  
  handleSettingImageUpload: (event, targetType) => {
    const file = event.target.files[0]; if (!file) return;
    window.actions.compressImage(file, async (base64) => {
      try {
        window.actions.showToast('上传中…');
        const chatId = wxState.activeChatId;
        const keyMap = {
          myAvatar: `chat_my_avatar_${chatId}`,
          charAvatar: `char_avatar_${chatId}`,
          groupAvatar: `group_avatar_${chatId}`,
          myVideo: `chat_my_video_${chatId}`,
          charVideo: `char_video_${chatId}`,
        };
        const url = await window.uploadMediaToCloud(base64, 'webp', keyMap[targetType]);
        const char = store.contacts.find(c => c.id === chatId);
        const chat = store.chats.find(c => c.charId === chatId);

        if (targetType === 'myAvatar') {
           chat.myAvatar = url; // 🌟 独立情头：只修改当前聊天室专属头像，绝对不污染全局马甲！
        }
        if (targetType === 'charAvatar') char.avatar = url;
        if (targetType === 'groupAvatar') chat.groupAvatar = url;
        if (targetType === 'myVideo') chat.myVideoAvatar = url;
        if (targetType === 'charVideo') chat.charVideoAvatar = url;
        window.actions.showToast('图片已加载！'); window.render();
      } catch (e) {
        console.error('[uploadMediaToCloud] setting image', e);
        window.actions.showToast('上传失败，请重试');
      }
    });
    event.target.value = '';
  },
  clearSettingBg: () => {
      saveScroll();
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if (targetObj.bgImage) window.deleteMediaFromCloud(targetObj.bgImage); // 🌟 云端 GC
      targetObj.bgImage = null;
      window.actions.showToast('该专属背景已清除！');
      window.render();
      restoreScroll();
  },
  handleSettingBgUpload: (event) => {
    saveScroll();
    const file = event.target.files[0]; if (!file) { restoreScroll(); return; }
    window.actions.compressImage(file, async (base64) => {
      try {
        window.actions.showToast('上传中…');
        const chatId = wxState.activeChatId;
        const url = await window.uploadMediaToCloud(base64, 'webp', `chat_bg_${chatId}`);
        const chat = store.chats.find(c => c.charId === chatId);
        const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === chatId);
        targetObj.bgImage = url;
        window.actions.showToast('专属背景图已加载！记得点保存~');
        window.render(); restoreScroll();
      } catch (e) {
        console.error('[uploadMediaToCloud] setting bg', e);
        window.actions.showToast('上传失败，请重试');
        restoreScroll();
      }
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
    const char = store.contacts.find(c => c.id === wxState.activeChatId);
    
    // 保存旧值用于比较
    let oldCharRemark = chat.charRemark;
    let oldCharName = char?.name;

    if (chat.isGroup) {
        chat.groupName = document.getElementById('set-group-name').value.trim() || '群聊';
        chat.groupNotice = document.getElementById('set-group-notice').value.trim();
    } else {
        chat.myRemark = document.getElementById('set-my-name').value.trim();
        chat.charRemark = document.getElementById('set-char-name').value.trim();
    }

    // 🌟 记录修改前的状态，用来对比你是不是刚刚“关掉”了开关
    const oldAutoMsg = targetObj.autoMsgEnabled;
    const oldMomentFreq = targetObj.autoMomentFreq || 0;

    targetObj.contextLimit = parseInt(document.getElementById('set-context-limit').value) || 25;
    targetObj.autoMsgEnabled = document.getElementById('set-auto-msg').checked;
    targetObj.timeAware = document.getElementById('set-time-aware').checked;
    targetObj.locationAware = document.getElementById('set-location-aware').checked;

    const autoMomentEl = document.getElementById('chat-auto-moment-select');
    if (autoMomentEl) targetObj.autoMomentFreq = parseInt(autoMomentEl.value) || 0;
    
    const intervalVal = parseFloat(document.getElementById('set-auto-interval').value);
    targetObj.autoMsgInterval = isNaN(intervalVal) ? 5 : intervalVal;

    if (!chat.isGroup) {
        targetObj.canPeekPhone = document.getElementById('set-peek-phone')?.checked || false;
        const peekProbEl = document.getElementById('set-peek-phone-prob');
        targetObj.peekPhoneProb = peekProbEl ? (parseInt(peekProbEl.value) || 15) : 15;
        chat.randomPlotEnabled = document.getElementById('set-random-plot')?.checked || false;
    }

    // 🌟 核心拦截机制：发射省钱空包弹！如果你关掉了开关，立刻向云端发射指令，物理绞杀旧闹钟！
    if (oldAutoMsg && !targetObj.autoMsgEnabled) {
    console.log('[系统] 主动聊天已关闭，发送空包弹狙杀云端 AUTO 闹钟！');
    const memberIds = chat.isGroup ? chat.memberIds : [targetObj.id];
    const cancelPromises = memberIds.map(mId => {
        const mChar = store.contacts.find(c => c.id === mId);
        if (mChar && typeof window.planCloudBrain === 'function') {
            return window.planCloudBrain(-1, mChar, [], 'AUTO|' + chat.charId + '|' + mId + '|0', 0, 0, true);
        }
        return Promise.resolve();
    });
    Promise.all(cancelPromises).catch(e => {
        console.error('[空包弹发射失败]', e.message || e);
        targetObj.autoMsgEnabled = true; // 回滚开关状态
        window.actions.showToast('关闭主动聊天失败，云端闹钟未能取消，请检查网络后重试');
        window.render();
    });
}
if (oldMomentFreq > 0 && targetObj.autoMomentFreq === 0) {
    console.log('[系统] 朋友圈已关闭，发送空包弹狙杀云端 MOMENT 闹钟！');
    const memberIds = chat.isGroup ? chat.memberIds : [targetObj.id];
    const cancelPromises = memberIds.map(mId => {
        const mChar = store.contacts.find(c => c.id === mId);
        if (mChar && typeof window.planCloudBrain === 'function') {
            return window.planCloudBrain(-1, mChar, [], 'MOMENT|' + chat.charId + '|' + mId + '|0', 0, 0, true);
        }
        return Promise.resolve();
    });
    Promise.all(cancelPromises).catch(e => {
        console.error('[朋友圈空包弹发射失败]', e.message || e);
        targetObj.autoMomentFreq = oldMomentFreq; // 回滚开关状态
        window.actions.showToast('关闭自动朋友圈失败，云端闹钟未能取消，请检查网络后重试');
        window.render();
    });
}
    
    if (targetObj.disableEmoji) { targetObj.emojis = "disabled"; } else {
      const allowedNames = [];
      (targetObj.mountedEmojis || []).forEach(libId => { 
         const lib = (store.emojiLibs || []).find(l => l.id === libId);
         if (lib) allowedNames.push(...lib.emojis.map(e => typeof e === 'object' ? e.name : '表情'));
      });
      if (allowedNames.length > 0) { targetObj.emojis = [...new Set(allowedNames)].join(', '); } else { targetObj.emojis = ""; }
    }

    // 🌟 备注修改后发送系统消息
    if (!chat.isGroup) {
        const newCharRemark = chat.charRemark;
        
        // 获取当前用户的身份化名（绑定的马甲名字）
        const charObj = store.contacts.find(c => c.id === chat.charId);
        const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
        const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
        const myName = boundPersona.name;
        
        // 用户修改了对方的备注（显示用户化名）
        if (oldCharRemark !== newCharRemark && newCharRemark) {
            const newDisplay = newCharRemark;
            chat.messages.push({
                id: Date.now(),
                sender: 'system',
                text: `${myName} 已将${oldCharName}的备注修改为${newDisplay}`,
                isMe: true,
                source: 'wechat',
                isOffline: false,
                msgType: 'system',
                time: getNowTime()
            });
        }
    }
    
    targetObj.customCSS = document.getElementById('set-custom-css').value;
    window.actions.showToast('设置已生效！');
    wxState.view = 'chatRoom'; window.render(); restoreScroll();
    
    // 🌟 不管有没有关开关，统一踹一脚巡逻员，让他去检查要不要重新定闹钟
    if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(wxState.activeChatId);
  },
  sendMessage: async () => {
    const isOffline = wxState.view === 'offlineStory';
    // 🌟 关键修复：即使通话被最小化（view 已切到 chatRoom），只要 store.activeCall 还在，
    // 就必须当成通话中处理，否则 LLM 会收到超能力列表，AI 会在通话里乱发语音/表情/外卖。
    const isOngoingCall = store.activeCall && store.activeCall.charId === wxState.activeChatId;
    const isCall = wxState.view === 'call' || isOngoingCall;
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
      // 🌟 动态获取当前马甲
      // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
      const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
      const isIntercepted = charObj?.isBlockedByChar === true;
      chat.messages.push({
        id: Date.now(), sender: boundPersona.name, text: text,
        isMe: true, source: 'wechat', 
        isOffline: isOffline, 
        isCallMsg: isCall, msgType: 'text', time: getNowTime(),
        quote: quoteData,
        isIntercepted: isIntercepted // 🌟 记录是否被拒收
      });
      
      // 🌟 如果被拉黑了，不仅要在消息旁边画感叹号，还要弹出经典的微信红色字！
      if (isIntercepted && wxState.view === 'chatRoom') {
          setTimeout(() => {
              chat.messages.push({ id: Date.now()+1, sender: 'system', text: '消息已发出，但被对方拒收了。', isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
              window.render(); window.wxActions.scrollToBottom();
          }, 400);
      }
      input.value = ''; 
      wxState.quoteMsgId = null; 
      saveScroll();
      window.render();
      restoreScroll();
      window.wxActions.scrollToBottom();
      document.getElementById(isOffline ? 'offline-input' : 'wx-input')?.focus();
      // ================= 🌟 B站链接极速解析引擎 =================
      const bvMatch = text.match(/BV[a-zA-Z0-9]{10}/i);
      if (bvMatch) {
          try {
              const bvid = bvMatch[0];
              const pwd = localStorage.getItem('neko_server_pwd') || '';
              // 发给云端二传手，绝对不卡死前端
              const biliRes = await fetch(`https://neko-hoshino.duckdns.org/parse-bili?bvid=${bvid}`, {
                  headers: { 'x-secret-token': pwd }
              });
              if (biliRes.ok) {
                  const biliData = await biliRes.json();
                  if (biliData.title) {
                      // 🌟 核心魔法修改：不产生新消息，直接把情报缝合进你刚发的这条消息里！
                      const lastMsg = chat.messages[chat.messages.length - 1];
                      lastMsg.text += `\n\n[系统隐形情报：该链接为B站视频《${biliData.title}》，UP主：${biliData.owner || '未知'}。简介：${biliData.desc || '无'}。请假装你看过该内容并回复用户。]`;
                      // 重新渲染，因为消息内容变了
                      if(wxState.view === 'chatRoom') window.render();
                  }
              }
          } catch(e) { console.error('B站解析失败', e); }
      }
      // =========================================================
      // 🌟 发送消息逻辑：线上暂存并重置闹钟，线下和电话立刻回复！
      // 🌟 关键修复：通话被最小化时 view 会变回 chatRoom，必须用 isCall 兜底，否则用户的话会被塞进云端排队，而不是立刻回复。
      if (isOffline || isCall) {
          if (chat.isGroup) {
              const directorId = chat.memberIds[Math.floor(Math.random() * chat.memberIds.length)];
              setTimeout(() => window.wxActions.getReply(false, directorId, null, null, chat.charId), 500);
          } else {
              setTimeout(() => window.wxActions.getReply(false, null, null, null, chat.charId), 500);
          }
      } else {
          // 线上聊天：发消息只暂存！但立刻重置云端防冷落闹钟！
          if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(chat.charId);
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
    window.actions.compressImage(file, async (base64) => {
      try {
        window.actions.showToast('上传中…');
        const url = await window.uploadMediaToCloud(base64, 'webp');
        const chat = store.chats.find(c => c.charId === wxState.activeChatId);
        // 🌟 获取正确的马甲名字
          // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
        const charObj = store.contacts.find(c => c.id === chat.charId);
        const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
          const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
        if (chat) {
          chat.messages.push({ id: Date.now(), sender: boundPersona.name, text: '发送了一张真实照片', imageUrl: url, isMe: true, source: 'wechat', isOffline: false, msgType: 'real_image', time: getNowTime() });
          wxState.showPlusMenu = false; window.render(); window.wxActions.scrollToBottom();
        }
      } catch (e) {
        console.error('[uploadMediaToCloud] image message', e);
        window.actions.showToast('上传失败，请重试');
      }
    });
    event.target.value = '';
  },

  handleTransferAction: (action) => {
    saveScroll(); // 修复弹窗操作导致的滚动跳跃
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    const msg = chat.messages.find(m => m.id === wxState.activeTransferId);
    // 🌟 获取正确的马甲名字
        // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
        const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
    if (!msg) return;

    msg.transferState = action === 'accept' ? 'accepted' : 'returned';
    const amount = parseFloat(msg.transferData.amount);

    if (action === 'accept') {
      if (msg.isMe) { store.wallet.balance -= amount; store.wallet.transactions.push({ type: 'out', amount, title: `转账给对方`, date: new Date().toISOString() });
      } else { store.wallet.balance += amount; store.wallet.transactions.push({ type: 'in', amount, title: `收到转账`, date: new Date().toISOString() }); }
    }
    const sysText = action === 'accept' ? `${msg.isMe ? '对方' : boundPersona.name} 已收款` : `${msg.isMe ? '对方' : boundPersona.name} 已退还了转账`;
    chat.messages.push({ id: Date.now(), sender: 'system', text: sysText, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    wxState.activeTransferId = null; window.render(); restoreScroll();
  },

  sendVirtualMedia: () => {
    // 发送消息不需要记忆位置，直接滚到底部
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    // 🌟 获取正确的马甲名字
        // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
        const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
    if (!chat) return;
    if (wxState.virtualModalType === 'transfer') {
      const amount = document.getElementById('transfer-amount').value.trim();
      const note = document.getElementById('transfer-note').value.trim() || '转账';
      if (!amount || isNaN(amount) || Number(amount) <= 0) return window.actions.showToast('请输入有效的金额！');
      chat.messages.push({ id: Date.now(), sender: boundPersona.name, text: `[发起转账] 金额：${amount}元，备注：${note}`, transferData: { amount, note }, transferState: 'pending', isMe: true, source: 'wechat', isOffline: false, msgType: 'transfer', time: getNowTime() });
    } else {
      const input = document.getElementById('virtual-input');
      const desc = input.value.trim();
      if (!desc) return window.actions.showToast('内容不能为空哦！');
      // 🌟 根据模式发送不同气泡
      let mType = 'text';
      if (wxState.virtualModalType === 'image') mType = 'virtual_image';
      if (wxState.virtualModalType === 'voice') mType = 'voice';
      if (wxState.virtualModalType === 'location') mType = 'location'; // 🌟 发送定位
      
      chat.messages.push({ id: Date.now(), sender: boundPersona.name, text: desc, isMe: true, source: 'wechat', isOffline: false, msgType: mType, time: getNowTime() });
    }
    wxState.virtualModalType = 'none'; 
    window.render(); 
    window.wxActions.scrollToBottom(); 
  },

  startCall: (type) => { 
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages.push({ id: Date.now(), sender: 'system', text: `你发起了${type === 'video' ? '视频' : '语音'}通话`, isMe: true, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    
    wxState.view = 'call'; 
    wxState.callType = type; 
    wxState.callStartTime = Date.now(); 
    wxState.showPlusMenu = false;
    // 🌟 主动拨打电话，记忆路径设为当前聊天室
    store.callReturnPath = { app: 'wechat', view: 'chatRoom' }; 

    // 🌟 1. 将这通电话的状态推入全局，建立联系！
    store.activeCall = {
        charId: wxState.activeChatId,
        type: type,
        duration: 0,
        startTime: Date.now()
    };

    // 🌟 核心防御：趁着你点拨打的瞬间，给全局播放器喂一口静音，抢占浏览器白名单！
    if (!window.wxCallPlayer) window.wxCallPlayer = new Audio();
    window.wxCallPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    window.wxCallPlayer.play().catch(()=>{});

    if(wxState.callTimerId) clearInterval(wxState.callTimerId);
    wxState.callTimerId = setInterval(() => {
      // 🌟 2. 全局状态累加秒数
      if (store.activeCall) store.activeCall.duration++;
      const duration = store.activeCall ? store.activeCall.duration : 0;
      const m = String(Math.floor(duration / 60)).padStart(2, '0');
      const s = String(duration % 60).padStart(2, '0');
      
      // 🌟 3. 更新大屏 UI
      const el = document.getElementById('call-duration-display');
      if(el) el.innerText = `${m}:${s}`;
      
      // 🌟 4. 同步更新悬浮窗 UI
      const floatEl = document.getElementById('floating-call-time');
      if(floatEl) floatEl.innerText = `${m}:${s}`;
    }, 1000);
    
    window.render(); 
    window.wxActions.scrollToBottom();
  },
  
  acceptCall: () => {
    try { wxState.ringtone.pause(); wxState.ringtone.currentTime = 0; } catch(e){} 
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    chat.messages.push({ id: Date.now(), sender: 'system', text: `已接通${wxState.callType === 'video' ? '视频' : '语音'}通话`, isMe: false, source: 'wechat', isOffline: false, msgType: 'system', time: getNowTime() });
    
    wxState.view = 'call'; 
    wxState.callStartTime = Date.now(); 
    
    // 🌟 将这通电话的进行状态全局化！
    store.activeCall = {
        charId: wxState.activeChatId,
        type: wxState.callType,
        duration: 0,
        startTime: Date.now()
    };

    if (!window.wxCallPlayer) window.wxCallPlayer = new Audio();
    window.wxCallPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    window.wxCallPlayer.play().catch(()=>{});

    if(wxState.callTimerId) clearInterval(wxState.callTimerId);
    wxState.callTimerId = setInterval(() => {
      // 全局状态累加
      if (store.activeCall) store.activeCall.duration++;
      const m = String(Math.floor((store.activeCall?.duration || 0) / 60)).padStart(2, '0');
      const s = String((store.activeCall?.duration || 0) % 60).padStart(2, '0');
      
      // 更新大屏 UI
      const el = document.getElementById('call-duration-display');
      if(el) el.innerText = `${m}:${s}`;
      
      // 更新悬浮窗 UI
      const floatEl = document.getElementById('floating-call-time');
      if(floatEl) floatEl.innerText = `${m}:${s}`;
    }, 1000);
    
    window.render();
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
    if (window.wxCallPlayer) { window.wxCallPlayer.pause(); window.wxCallPlayer.src = ''; }
    if(wxState.callTimerId) { clearInterval(wxState.callTimerId); wxState.callTimerId = null; }
    
    // 🌟 清空全局状态
    store.activeCall = null;
    
    wxState.view = 'chatRoom'; wxState.callType = null; wxState.callStartTime = null; window.render(); window.wxActions.scrollToBottom();
  },
  minimizeCall: () => {
      if (store.callReturnPath) {
          // 🌟 原路返回刚刚记录的界面
          store.currentApp = store.callReturnPath.app;
          wxState.view = store.callReturnPath.view;
      } else {
          // 兜底方案：如果没有记录，就默认回聊天室
          wxState.view = 'chatRoom'; 
      }
      window.render();
  },
  resumeCall: () => {
      if (store.activeCall) {
          // 🌟 核心：记录点击悬浮球之前的界面（哪个App、哪个内部页面）
          store.callReturnPath = { 
              app: store.currentApp, 
              view: typeof wxState !== 'undefined' ? wxState.view : 'main' 
          };

          store.currentApp = 'wechat'; 
          wxState.activeChatId = store.activeCall.charId;
          wxState.view = 'call';
          wxState.callType = store.activeCall.type;
          window.render();
      }
  },
  
  enterOffline: () => {
      wxState.view = 'offlineStory'; wxState.showPlusMenu = false; wxState.displayCount = 50;
      if (window.globalScrollStates) delete window.globalScrollStates['offline-scroll'];

      wxState.noAnimate = false; // 🌟 允许进场动画
        window.render();
        window.wxActions.scrollToBottom();

        // 🌟 首次进入兜底：Tailwind Play CDN 首次遇到新类需要异步 JIT 编译，等样式落地后 scrollHeight 才稳定，
        // 否则滚轮会卡在中途。双 rAF + 150ms setTimeout 三层补滚，覆盖 JIT 编译 + 任何异步回流。
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (wxState.view === 'offlineStory') window.wxActions.scrollToBottom();
            });
        });
        
        setTimeout(() => { 
            if (wxState.view === 'offlineStory') window.wxActions.scrollToBottom(); 
        }, 150);

        // 🌟 锁死动画，防止后续操作触发多余的过渡效果
        setTimeout(() => { wxState.noAnimate = true; }, 400);
  },
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
      window.actions.compressImage(file, async (base64) => {
          try {
              window.actions.showToast('上传中…');
              const chatId = wxState.activeChatId;
              const url = await window.uploadMediaToCloud(base64, 'webp', `chat_offline_bg_${chatId}`);
              const chat = store.chats.find(c => c.charId === chatId);
              const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === chatId);
              targetObj.offlineBg = url;
              window.actions.showToast('线下专属背景已加载！');
              window.render();
          } catch (e) {
              console.error('[uploadMediaToCloud] offline bg', e);
              window.actions.showToast('上传失败，请重试');
          }
      });
      event.target.value = '';
  },
  clearOfflineBg: () => {
      const chat = store.chats.find(c => c.charId === wxState.activeChatId);
      const targetObj = chat.isGroup ? chat : store.contacts.find(c => c.id === wxState.activeChatId);
      if (targetObj.offlineBg) window.deleteMediaFromCloud(targetObj.offlineBg); // 🌟 云端 GC
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
    // 🌟 获取正确的马甲名字
        // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
        const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
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

    // 🎲 随机剧情 roll（仅用户主动触发的线上单聊，每次AI回复roll一次）
    if (!isAuto && !chat.isGroup) {
      const newPlot = rollRandomPlot(chat);
      if (newPlot) {
        if (newPlot.type === 'micro') {
          chat.pendingMicroPlot = newPlot;
        } else {
          chat.activeRandomPlot = newPlot;
          const typeLabel = newPlot.type === 'long' ? '长线剧情' : '短线剧情';
          chat.messages.push({
            id: Date.now() + 1, sender: 'system',
            text: `🎲 随机${typeLabel}触发：${newPlot.keyword}`,
            isMe: false, source: 'wechat', msgType: 'system', time: getNowTime()
          });
          if (isActive) { saveScroll(); window.render(); restoreScroll(); }
        }
      }
    }
    // 🌟 修复5：通过 explicitIsOffline 强制读取维度坐标，防止线下和线上跨次元串台
    const isOffline = explicitIsOffline !== null ? explicitIsOffline : (wxState.view === 'offlineStory' && isActive);
    // 🌟 关键修复：通话最小化后 view 会切回 chatRoom，必须同时认 store.activeCall，否则 LLM 会收到超能力列表。
    const isOngoingCall = store.activeCall && store.activeCall.charId === chatId;
    const isCall = ((wxState.view === 'call' && isActive) || isOngoingCall) && !chat.isGroup;

    const validMsgs = chat.messages.filter(m => !m.isHidden && !(m.msgType || '').includes('system'));
    
    // 🌟 记忆游标自愈引擎：如果发现游标比当前有效消息数还大，说明用户刚刚清空了历史！立刻自愈归零！
    if (chat.lastSummarizedIndex > validMsgs.length) {
        chat.lastSummarizedIndex = 0;
    }
    
    // 仅对单聊进行自动记忆提取，群聊不适用（可跳过）
if (!chat.isGroup) {
    const currentUserCount = validMsgs.filter(m => m.isMe).length;
    const lastUserCount = chat.lastSummarizedUserCount || 0;
    // 自愈：如果用户消息计数被重置（比如清空历史），则同步
    if (currentUserCount < lastUserCount) {
        chat.lastSummarizedUserCount = currentUserCount;
    }
    if (currentUserCount - lastUserCount >= 20) {
        // 获取自上次以来的所有新消息（需要基于消息总数切片，因为可能用户消息和AI消息交替）
        const lastSumIndex = chat.lastSummarizedIndex || 0;
        // 更新游标：当前有效消息总数
        chat.lastSummarizedIndex = validMsgs.length;
        chat.lastSummarizedUserCount = currentUserCount;
        const newMessages = validMsgs.slice(lastSumIndex, validMsgs.length);
        if (newMessages.length > 0) {
            triggerAutoMemory(charId, newMessages);
        }
    }
}

    let hiddenMsgId = null;
    if (isAuto || customPrompt) {
      hiddenMsgId = Date.now();
      chat.messages.push({ 
        id: hiddenMsgId, sender: boundPersona.name, 
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

          const { buildLLMPayload } = await import('../../utils/llm.js');
          // 🌟 终极净化：完美还原多媒体标签，且必须保留原消息的对象结构！
          const tempHistory = chat.messages.map(m => {
              let content = m.text || '';
              if (m.msgType === 'voice') content = `[语音]: ${content.replace(/^\[语音\][:：]?\s*/, '')}`;
              else if (m.msgType === 'virtual_image') content = `[虚拟照片]: ${m.virtualImageText || content.replace(/^\[虚拟照片\][:：]?\s*/, '') || '一张照片'}`;
              else if (m.msgType === 'location') content = `[发送定位]: ${content.replace(/^\[(?:发送)?定位\][:：]?\s*/, '') || '未知位置'}`;
             else if (m.msgType === 'transfer') {
    let stateText = '';
    if (m.transferState === 'accepted') stateText = ' (已接收)';
    else if (m.transferState === 'returned') stateText = ' (已退回)';
    else stateText = ' (未接收)';
    content = `[发起转账] 金额：${m.transferData?.amount || '未知'}，备注：${m.transferData?.note || '无'}${stateText}`;
}
              else if (m.msgType === 'real_image') content = `[真实照片]`;
              else if (m.msgType === 'emoji') content = `[表情包]: ${content.replace(/^\[表情包\][:：]?\s*/, '')}`;
              
              // ⚠️ 绝杀：必须返回克隆的新对象，并替换掉 text！绝不允许返回成纯字符串！
              return { ...m, text: content };
          });

          // 🌟 实时塞入“发送好友申请”的求饶说明书
          if (char.isBlocked) {
              tempHistory.push({
                  id: Date.now(), sender: 'system',
                  text: `(⚠️系统警告：你当前已被用户拉黑！请务必在回复的开头使用 [发送好友申请] 指令来发送验证卡片乞求原谅，否则你发出的消息将带上红色感叹号且完全无法被用户收到！)`,
                  isMe: true, isHidden: true, msgType: 'text'
              });
          }

          // 🌟 跨次元：单聊触发时，悄悄注入关联的群聊记忆
          if (!chat.isGroup && char.linkedGroups) {
              const groupContext = window.wxActions.getLinkedGroupContext(char);
              if (groupContext) {
                  tempHistory.push({ id: Date.now(), sender: 'system', text: groupContext, isMe: true, isHidden: true, msgType: 'text' });
              }
          }
          // 🌟 跨次元反向：群聊触发时，如果有人开启了关联，把他们的私聊小纸条塞给导演！
          if (chat.isGroup) {
              const privateContext = window.wxActions.getLinkedPrivateContext(chat);
              if (privateContext) {
                  tempHistory.push({ id: Date.now(), sender: 'system', text: privateContext, isMe: true, isHidden: true, msgType: 'text' });
              }
          }

          // 🌟 把抓到的 readingInfo 传给大模型
          const llmMessages = await buildLLMPayload(charId, tempHistory, isOffline, isCall, groupInfo, readingInfo);
          
          // 🌟 满足你的硬核架构：全面交由云端排队代跑！
          if (hiddenMsgId) chat.messages = chat.messages.filter(m => m.id !== hiddenMsgId);
          
          // ⚠️ 极其核心的 await 拦截：绝不允许它偷偷溜走！如果它敢报错，直接会被最下面的 catch 抓去弹红字！
          await window.planCloudBrain(0.05, char, llmMessages, chat.charId + '|' + char.id + '|' + (isOffline ? '1' : '0'));
          
          // 只有服务器明确返回了 200 OK 接单成功，才允许打上“已托管”标记！
          delegatedToCloud = true; 
          return; 
      }
    } catch (error) { 
      let rawErr = error ? (error.message || error.toString()) : "未知网络错误";
      const errMsg = rawErr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      wxState.showPlusMenu = false; wxState.showEmojiMenu = false;
      chat.messages.push({ 
        id: Date.now(), sender: char.name, 
        text: document.hidden ? `连接被系统强行中断。请重roll。` : `[系统] 请求失败: ${errMsg} (请重roll)`, 
        isMe: document.hidden, source: 'wechat', isOffline: isOffline, msgType: 'text', time: getNowTime() 
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

  triggerPhonePeek: async (charId) => {
    const char = store.contacts.find(c => c.id === charId);
    const chat = store.chats.find(c => c.charId === charId);
    if (!char || !chat || chat.isGroup || char.isBlocked) return;

    // 写入冷却时间戳，防止偷看回复再次触发偷看（循环）
    window.wxPeekCooldowns = window.wxPeekCooldowns || {};
    window.wxPeekCooldowns[charId] = Date.now();

    // 系统提示：告知用户正在被查岗
    chat.messages.push({
        id: Date.now(), sender: 'system',
        text: `👀 ${char.name} 趁你不注意偷看了你的手机...`,
        isMe: false, source: 'wechat', msgType: 'system',
        time: getNowTime(), timestamp: Date.now()
    });
    if (typeof window.render === 'function' && wxState.activeChatId === charId) {
        saveScroll(); window.render(); restoreScroll(); window.wxActions.scrollToBottom();
    }

    const pId = char.boundPersonaId || store.personas[0].id;
    const myName = (store.personas.find(p => p.id === pId) || store.personas[0]).name;

    // 收集所有其他私聊的最近30条消息
    let chatSummary = '';
    const otherChats = store.chats.filter(c => !c.isGroup && c.charId !== charId && c.messages && c.messages.length > 0);
    for (const oc of otherChats) {
        const ocChar = store.contacts.find(c => c.id === oc.charId);
        if (!ocChar) continue;
        const msgs = oc.messages.filter(m => !m.isHidden && m.text && !['system', 'recall_system'].includes(m.msgType)).slice(-30);
        if (msgs.length === 0) continue;
        const ocName = oc.charRemark || ocChar.name;
        chatSummary += `\n===== 与【${ocName}】的聊天（最近${msgs.length}条）=====\n`;
        chatSummary += msgs.map(m => `${m.isMe ? myName : ocName}: ${m.text}`).join('\n');
    }

    // 收集朋友圈动态（最近20条）
    let momentsSummary = '';
    const recentMoments = (store.moments || []).slice(-20);
    if (recentMoments.length > 0) {
        momentsSummary = '\n\n===== 朋友圈动态（最新） =====\n';
        momentsSummary += recentMoments.map(m => `[${m.senderName || myName}(${new Date(m.timestamp||0).toLocaleDateString('zh-CN')})]: ${m.text}`).join('\n');
    }

    if (!chatSummary && !momentsSummary) chatSummary = '（暂无其他聊天记录）';

    const peekPrompt = `【警告】你刚才趁 ${myName} 不注意，偷看了她的手机，发现了以下内容：${chatSummary}${momentsSummary}\n\n请根据你的人设和上述具体内容做出真实反应。如果你气急败坏到决定冒充 ${myName} 给某人发消息，可以在回复的某处嵌入一个 JSON（仅限一个，格式严格）：{"action":"reply_as_user","target":"对方在通讯录里的名字","text":"你要以她名义发出的内容"}\nJSON 以外的部分才是你说出来的话。保持人设，分段换行，绝不输出任何系统标签。`;

    await window.wxActions.getReply(true, null, peekPrompt, null, charId);
  },

  clearActiveRandomPlot: () => {
    const chat = store.chats.find(c => c.charId === wxState.activeChatId);
    if (!chat) return;
    chat.activeRandomPlot = null;
    chat.messages.push({
      id: Date.now(), sender: 'system',
      text: '已手动终止当前随机剧情',
      isMe: false, source: 'wechat', msgType: 'system', time: getNowTime()
    });
    window.render();
  },
};
