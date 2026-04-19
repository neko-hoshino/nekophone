// js/apps/wechat/cloud.js — 云端通用大脑 & 信箱同步引擎
import { store } from '../../store.js';
import { getNowTime, saveScroll, restoreScroll, playCallAudio } from './shared.js';
import { fetchMinimaxVoice } from './voice.js';
import { wxState } from './state.js';

// ================= 🧠 云端通用大脑 & 信箱同步引擎 =================

const planCloudBrain = async (delayMinutes, char, llmMessages, routingId, recursiveDelayMinutes = 0, maxRecursion = 0, isCancel = false) => {
  // 🌟 新增防御：连云端都没有，就不进行网络请求了
  if (!localStorage.getItem('neko_server_pwd')) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  
  if (!store.apiConfig?.apiKey && !isCancel) throw new Error("缺少 API Key 配置，云端无法请求大模型");
  if (!sub) throw new Error("未绑定设备推送凭证！云端不知道把消息发给谁，请先在右上角授权通知！");

  const res = await fetch('https://neko-hoshino.duckdns.org/auto-plan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-secret-token': localStorage.getItem('neko_server_pwd') || ''
        },
        body: JSON.stringify({
            delayMinutes: delayMinutes,
            recursiveDelayMinutes: recursiveDelayMinutes,
            maxRecursion: maxRecursion,
            isCancel: isCancel,
            title: char.name,
            charId: routingId || char.id,
            endpoint: sub.endpoint,
            apiConfig: store.apiConfig,
            llmMessages: llmMessages || []
        })
    });
  
  if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `云端服务器拒绝了请求 (HTTP状态码: ${res.status})`);
  }
};

window.planCloudBrain = planCloudBrain; // 🌟 挂载到全局，供设置面板的空包弹调用

// 🌟 进化版：支持 forceSystemPrompt（物理隐形指令）
window.scheduleCloudTask = async (charId, forceSystemPrompt = null) => {
    if (!localStorage.getItem('neko_server_pwd')) return;

    // 修复：如果被锁挡住了，重试时也要把指令带上
    if (window.isSyncingMailbox) {
        setTimeout(() => window.scheduleCloudTask(charId, forceSystemPrompt), 1000);
        return;
    }

    const chat = store.chats.find(c => c.charId === charId);
    if (!chat) return;

    const charObj = store.contacts.find(c => c.id === chat.charId);
    const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
    const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
    
    let speakerChar = chat.isGroup ? 
        store.contacts.find(c => c.id === chat.memberIds[Math.floor(Math.random() * chat.memberIds.length)]) : 
        store.contacts.find(c => c.id === charId);
    if (!speakerChar) return;

    const targetObj = chat.isGroup ? chat : speakerChar;

    // 🌟 核心拦截升级：如果有 forceSystemPrompt，就算开关没开也强行唤醒！
    if (!targetObj.autoMsgEnabled && (!targetObj.autoMomentFreq || targetObj.autoMomentFreq === 0) && !forceSystemPrompt) return;

    try {
        const { buildLLMPayload } = await import('../../utils/llm.js');
        let groupInfo = chat.isGroup ? { id: chat.charId, name: chat.groupName, allNames: chat.memberIds.map(id => store.contacts.find(c => c.id === id)?.name).join('、'), notice: chat.groupNotice || '' } : null;
        
        // 🌟 终极净化：剔除了导致崩溃的 senderName...
        let baseHistory = chat.messages.map(msg => {
            let content = msg.text || '';
            if (msg.msgType === 'voice') content = `[语音]: ${content.replace(/^\[语音\][:：]?\s*/, '')}`;
            else if (msg.msgType === 'virtual_image') content = `[虚拟照片]: ${msg.virtualImageText || content.replace(/^\[虚拟照片\][:：]?\s*/, '') || '一张照片'}`;
            else if (msg.msgType === 'location') content = `[发送定位]: ${content.replace(/^\[(?:发送)?定位\][:：]?\s*/, '') || '未知位置'}`;
            else if (msg.msgType === 'transfer') content = `[发起转账] 金额：${msg.transferData?.amount || '未知'}，备注：${msg.transferData?.note || '无'}`;
            else if (msg.msgType === 'real_image') content = `[真实照片]`;
            else if (msg.msgType === 'emoji') content = `[表情包]: ${content.replace(/^\[表情包\][:：]?\s*/, '')}`;
            
            return { ...msg, text: content };
        });

        let turnsCount = 0; let lastSender = null; let startIndex = 0;
        const limit = targetObj.contextLimit || 30; 
        for (let i = baseHistory.length - 1; i >= 0; i--) {
            if (baseHistory[i].isMe !== lastSender) { if (lastSender !== null) turnsCount += 0.5; lastSender = baseHistory[i].isMe; }
            if (turnsCount >= limit) { startIndex = i + 1; break; }
        }
        baseHistory = baseHistory.slice(startIndex);

        const nowTime = Date.now();

        // =================================================================
        // 🧵 线程 C：特权任务快车道 (指令只在内存里，不入库！)
        // =================================================================
        if (forceSystemPrompt) {
            let systemHistory = JSON.parse(JSON.stringify(baseHistory));
            // 🌟 绝招：只在给 AI 发送的临时数组里塞指令！
            systemHistory.push({
                id: Date.now(), sender: boundPersona.name,
                text: forceSystemPrompt,
                isMe: true, isHidden: true, msgType: 'text'
            });
            
            const systemMsgs = await buildLLMPayload(speakerChar.id, systemHistory, false, false, groupInfo, null);
            const forceTaskId = 'FORCE|' + chat.charId + '|' + speakerChar.id + '|' + Date.now();
            
            // 🚀 3秒后让 AI 回复，然后直接退出，不跑下面的普通逻辑
            planCloudBrain(0.05, speakerChar, systemMsgs, forceTaskId, 0, 0);
            return; 
        }

        // =================================================================
        // 🧵 线程 A：主动搭话 (以最新消息为基准 + 防连发 + 支持云端递归)
        // =================================================================
        if (targetObj.autoMsgEnabled) {
    let chatDelayMin = targetObj.autoMsgInterval || 30; 
    // 1. 获取最新一条消息的时间戳（排除隐藏系统消息，但包括线下和通话）
    const validMsgs = baseHistory.filter(m => !m.isHidden);
    const lastMsgTime = validMsgs.length > 0 ? validMsgs[validMsgs.length - 1].id : nowTime;
            
            // 2. 理论触发时间 = 最新消息时间 + 频率
            let targetTime = lastMsgTime + chatDelayMin * 60000;
            // 3. 真实触发时间 = 理论时间 与 当前时间 的最大值 (防止出现负数倒计时)
            let realTriggerTime = Math.max(targetTime, nowTime); 
            let targetDate = new Date(realTriggerTime);

            if (speakerChar.isBlocked) {
                realTriggerTime = nowTime + 5 * 60000; // 被拉黑5分钟后立刻求饶
            } else if (targetDate.getHours() >= 0 && targetDate.getHours() < 8) {
                console.log(`[前端时空拦截] 原定 ${targetDate.toLocaleTimeString()} 搭话，自动推迟到早 8 点`);
                targetDate.setHours(8, Math.floor(Math.random() * 30), 0, 0); // 8:00 - 8:30 随机唤醒
                realTriggerTime = targetDate.getTime();
            }

            let initialDelayMinutes = (realTriggerTime - nowTime) / 60000;
            if (initialDelayMinutes < 0.5) initialDelayMinutes = 0.5; // 兜底

            let chatHistory = JSON.parse(JSON.stringify(baseHistory));
            
            if (speakerChar.isBlocked) {
                chatHistory.push({
                    id: Date.now(), sender: boundPersona.name,
                    text: `(系统严重警告：你当前处于被用户【拉黑】的状态！请立刻输出 [发送好友申请] 这个指令，乞求ta通过你的验证！绝不要带系统标签。)`,
                    isMe: true, isHidden: true, msgType: 'text'
                });
            } else {
                chatHistory.push({
                    id: Date.now(), sender: boundPersona.name,
                    text: `(系统自动触发：距离上次聊天已经过了一段时间。请结合当前语境主动发一条消息找用户搭话。符合你的性格，可以直接开启新话题，绝不可包含系统标签。)`,
                    isMe: true, isHidden: true, msgType: 'text'
                });
            }
            // 🌟 跨次元：哪怕是云端主动搭话的闹钟，也要带上群聊记忆，让 TA 可以用群里的事做开场白！
            if (!chat.isGroup && targetObj.linkedGroups) {
                const groupContext = window.wxActions.getLinkedGroupContext(targetObj);
                if (groupContext) {
                    chatHistory.push({ id: Date.now(), sender: 'system', text: groupContext, isMe: true, isHidden: true, msgType: 'text' });
                }
            }
            // 🌟 跨次元反向：如果群聊主动发起了闹钟聊天，导演同样需要知道大家的私有秘密！
            if (chat.isGroup) {
                const privateContext = window.wxActions.getLinkedPrivateContext(chat);
                if (privateContext) {
                    chatHistory.push({ id: Date.now(), sender: 'system', text: privateContext, isMe: true, isHidden: true, msgType: 'text' });
                }
            }

            const chatMsgs = await buildLLMPayload(speakerChar.id, chatHistory, false, false, groupInfo, null);

            // 🌟 先发空包弹取消云端同名旧闹钟，再投递新闹钟，防止新旧并存
            const autoTaskId = 'AUTO|' + chat.charId + '|' + speakerChar.id + '|0';
            await planCloudBrain(-1, speakerChar, [], autoTaskId, 0, 0, true).catch(() => {});
            // 🚀 发射 AUTO 闹钟！首次唤醒使用算出的延迟，后续云端每隔 chatDelayMin 递归，最多 3 次！
            planCloudBrain(initialDelayMinutes, speakerChar, chatMsgs, autoTaskId, chatDelayMin, 3).catch(e => console.error('主动聊天启动失败:', e));
        }

        // =================================================================
        // 🧵 线程 B：发朋友圈 (基于缓存防刷新重置 + 规避深夜时间)
        // =================================================================
        if (targetObj.autoMomentFreq && targetObj.autoMomentFreq > 0) {
            const freqMs = targetObj.autoMomentFreq * 3600000; 
            
            // 1. 完美抓取最新的一条朋友圈时间戳
            let lastMomentTime = 0;
            if (store.moments) {
                const charMoments = store.moments.filter(m => m.senderId === speakerChar.id);
                if (charMoments.length > 0) lastMomentTime = Math.max(...charMoments.map(m => m.id));
            }

            let realMomentTime = targetObj.nextMomentTarget;

            // 如果缓存的目标时间已经过期，或者根本没有，就需要重新算！
            if (!realMomentTime || realMomentTime <= nowTime) {
                if (nowTime - lastMomentTime > freqMs) {
                    // 已严重过期，立刻 roll 一个 0-60 分钟的随机数
                    realMomentTime = nowTime + Math.floor(Math.random() * 60) * 60000;
                } else {
                    // 正常倒计时
                    realMomentTime = lastMomentTime + freqMs;
                }
            }

            // 检查是否在凌晨 2 点 - 8 点之间
            const mDate = new Date(realMomentTime);
            if (mDate.getHours() >= 2 && mDate.getHours() < 8) {
                console.log(`[前端时空拦截] 原定 ${mDate.toLocaleTimeString()} 发朋友圈，推迟到早 8 点半`);
                mDate.setHours(8, 30 + Math.floor(Math.random() * 60), 0, 0); // 8:30 - 9:30 随机
                realMomentTime = mDate.getTime();
            }

            // 🌟 持久化预定时间，防止你一刷新网页就重新 roll 随机数！
            targetObj.nextMomentTarget = realMomentTime;

            let momentDelayMinutes = (realMomentTime - nowTime) / 60000;
            if (momentDelayMinutes < 0.5) momentDelayMinutes = 0.5;

            let momentHistory = JSON.parse(JSON.stringify(baseHistory));
            const now = new Date();
            const timeString = now.toLocaleString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            let diffHours = 0;
            const validMsgs = chat.messages.filter(m => !m.isOffline && !m.isHidden);
            if (validMsgs.length > 0) diffHours = (now.getTime() - validMsgs[validMsgs.length - 1].id) / 3600000;
            
            let relation = diffHours < 2 ? `【热聊中】你们刚刚才聊过。朋友圈可以是聊天的延续，或刚结束聊天的心情。` : diffHours < 24 ? `【日常间隔】距离上次聊天已过几个小时。分享此时此刻的独立生活。` : `【久未联系】⚠️警告：你们已经 ${Math.floor(diffHours/24)} 天没说话了！严禁提几天前的聊天内容！展示你的独立生活或落寞感。`;

            momentHistory.push({
                id: Date.now(), sender: boundPersona.name,
                text: `(系统最高指令：系统时间 ${timeString}。距离你上次发朋友圈已超过 ${targetObj.autoMomentFreq} 小时。请你立刻执行 [发朋友圈] 指令！\n\n【状态】\n${relation}\n\n1. 拒绝书面语（如岁月静好），说人话！\n2. 朋友圈通常没头没尾（如“困死”）。\n\n⚠️注意：你这次的唯一任务就是输出 [发朋友圈] 动态内容！必要时可带[附带虚拟照片:描述]或[附带定位:地点]❗必须把整个朋友圈内容压缩在同一行输出，中间严禁换行！必须严格必须严格按照格式输出！)`,
                isMe: true, isHidden: true, msgType: 'text'
            });

            const momentMsgs = await buildLLMPayload(speakerChar.id, momentHistory, false, false, groupInfo, null);
            
            // 🚀 发射 MOMENT 闹钟！(朋友圈不需要云端递归，只触发一次)
            planCloudBrain(momentDelayMinutes, speakerChar, momentMsgs, 'MOMENT|' + chat.charId + '|' + speakerChar.id + '|0', 0, 0).catch(e => console.error('朋友圈启动失败:', e));
        }   
    } catch (e) { console.error('时空巡逻员崩溃:', e); }
};

// ==================== 🌟 终极定向重roll 引擎 (兼容经典退回逻辑) ====================

window.wxActions.rerollReply = (msgId) => {
  saveScroll();   
  wxState.rerollTargetId = msgId; // 如果是线上 + 号菜单触发，这里就是 undefined，完美兼容！
    wxState.showRerollModal = true;
    
    // 关掉所有可能碍事的菜单 (修正为正确的状态变量名)
    window.wxActions.closeContextMenu(); 
    wxState.showPlusMenu = false; 
    wxState.showEmojiMenu = false;
    
    if (typeof window.render === 'function') window.render();
};

window.wxActions.closeRerollModal = () => {
    wxState.showRerollModal = false;
    if (typeof window.render === 'function') window.render();
    restoreScroll();
};

window.wxActions.submitReroll = async () => {
    const msgId = wxState.rerollTargetId;
    const inputEl = document.getElementById('reroll-input');
    const requirement = inputEl ? inputEl.value.trim() : '';
    window.wxActions.closeRerollModal();

    // 1. 找到当前聊天的 Chat 对象
    let chat;
    if (msgId) {
        chat = store.chats.find(c => c.messages.some(m => m.id === msgId));
    } else {
        chat = store.chats.find(c => c.charId === wxState.activeChatId);
    }
    if (!chat || chat.messages.length === 0) return;

    // ===== 群聊导演重roll =====
if (chat.isGroup) {
    // 1. 找到最后一轮AI导演生成的回复（即最后一个用户消息之后的所有AI消息）
    let lastUserMsgIndex = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].isMe) {
            lastUserMsgIndex = i;
            break;
        }
    }
    if (lastUserMsgIndex !== -1) {
        // 删除该用户消息之后的所有消息（即AI导演本轮生成的所有消息）
        chat.messages = chat.messages.slice(0, lastUserMsgIndex + 1);
    } else {
        // 如果连用户消息都没有（极端情况），则清空所有消息
        chat.messages = [];
    }

    // 2. 显示“导演正在思考”状态
    if (wxState.typingStatus) {
        wxState.typingStatus[chat.charId] = 'director'; // 可以自定义显示
    }
    if (typeof window.render === 'function') window.render();
    if (window.wxActions && window.wxActions.scrollToBottom) window.wxActions.scrollToBottom();

    // 3. 调用导演生成函数（利用现有的 getReply 但传入导演提示）
    // 注意：getReply 默认是单聊模式，我们需要通过 customPrompt 让AI生成多人回复
    const directorPrompt = `(系统指令：你作为群聊导演，请根据当前对话上下文，生成群聊中所有人的下一轮对话。每个角色用“名字: 对话内容”的格式单独成行。确保回复符合每个人的性格和当前剧情。不要包含系统标签。)`;
    await window.wxActions.getReply(false, null, directorPrompt, null, chat.charId, false);
    return; // 群聊处理完毕，不再执行后续单聊代码
}
// ===== 群聊分支结束 =====

    // 2. 完美还原你的经典删除逻辑！
    if (msgId) {
    // 线下模式：找到该消息的索引
    const targetIndex = chat.messages.findIndex(m => m.id === msgId);
    if (targetIndex > -1) {
        // 检查该消息之后是否有线上消息（安全起见，如果存在线上消息，不应该执行重roll，但这里提前返回）
        let hasOnlineAfter = false;
        for (let i = targetIndex + 1; i < chat.messages.length; i++) {
            if (!chat.messages[i].isOffline) {
                hasOnlineAfter = true;
                break;
            }
        }
        if (hasOnlineAfter) {
            window.actions.showToast('无法重roll历史消息');
            return;
        }
        // 删除该消息及其之后的所有消息（都是线下消息）
        chat.messages = chat.messages.slice(0, targetIndex);
    }
} else {
        // 【线上模式】的常规重roll：从最后一条开始往回删，直到露出你的上一句话
        if (chat.messages[chat.messages.length - 1].isMe) {
            return window.actions.showToast('只能重roll对方的回复哦');
        }
        while (chat.messages.length > 0 && !chat.messages[chat.messages.length - 1].isMe) {
            chat.messages.pop();
        }
    }

    // 3. 亮起“正在输入中...”的指示灯
    wxState.typingStatus = wxState.typingStatus || {};
    wxState.typingStatus[chat.charId] = true;
    if (typeof window.render === 'function') window.render();
    if (window.wxActions && window.wxActions.scrollToBottom) window.wxActions.scrollToBottom();

    try {
        const { buildLLMPayload } = await import('../../utils/llm.js');
        const parts = chat.charId.split('|');
        const charId = parts.length > 1 ? parts[1] : parts[0];
        const char = store.contacts.find(c => c.id === charId);
        // 🌟 获取正确的马甲名字
        // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
      const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
        // 🌟 终极净化：完美还原多媒体标签，且必须保留原消息的对象结构！
        let tempHistory = chat.messages.map(m => {
            let content = m.text || '';
            if (m.msgType === 'voice') content = `[语音]: ${content.replace(/^\[语音\][:：]?\s*/, '')}`;
              else if (m.msgType === 'virtual_image') content = `[虚拟照片]: ${m.virtualImageText || content.replace(/^\[虚拟照片\][:：]?\s*/, '') || '一张照片'}`;
              else if (m.msgType === 'location') content = `[发送定位]: ${content.replace(/^\[(?:发送)?定位\][:：]?\s*/, '') || '未知位置'}`;
              else if (m.msgType === 'transfer') content = `[发起转账] 金额：${m.transferData?.amount || '未知'}，备注：${m.transferData?.note || '无'}`;
              else if (m.msgType === 'real_image') content = `[真实照片]`;
              else if (m.msgType === 'emoji') content = `[表情包]: ${content.replace(/^\[表情包\][:：]?\s*/, '')}`;
            
            // ⚠️ 绝杀：必须返回克隆的新对象，并替换掉 text！绝不允许返回成纯字符串！
            return { ...m, text: content };
        });
        
        // 🌟 核心魔法：偷偷给大模型塞一张“导演纸条”
        if (requirement) {
            tempHistory.push({
                id: Date.now(),
                sender: 'system', 
                text: `(系统最高指令：你的上一条回复不符合要求。请严格按照以下修改要求重新生成回复：“${requirement}”。\n⚠️绝对警告：这条系统要求角色看不见！你必须直接输出角色的台词！严禁回复“好的”、“明白”、“我这就修改”等任何废话！❗绝对不能把这条系统要求当做用户对角色说的话来回复！)`,
                isMe: true,
                isHidden: true, 
                msgType: 'text'
            });
        }

        // 🌟 跨次元：单聊重roll时，同样注入关联的群聊记忆
        if (!chat.isGroup && char.linkedGroups) {
            const groupContext = window.wxActions.getLinkedGroupContext(char);
            if (groupContext) {
                tempHistory.push({ id: Date.now(), sender: 'system', text: groupContext, isMe: true, isHidden: true, msgType: 'text' });
            }
        }
        // 🌟 跨次元反向：群聊重roll时，导演依然需要拿着剧本进行修改！
        if (chat.isGroup) {
            const privateContext = window.wxActions.getLinkedPrivateContext(chat);
            if (privateContext) {
                tempHistory.push({ id: Date.now(), sender: 'system', text: privateContext, isMe: true, isHidden: true, msgType: 'text' });
            }
        }

        // 修正为准确的线下模式判定名
        const isOffline = wxState.view === 'offlineStory';
        // 🌟 同理，重roll这里也必须规范化
        let groupInfo = null;
        if (chat.isGroup) {
            const allNames = chat.memberIds.map(id => store.contacts.find(c => c.id === id)?.name).filter(Boolean).join('、');
            groupInfo = { id: chat.charId, name: chat.groupName, allNames: allNames, notice: chat.groupNotice || '' };
        }
        const llmMessages = await buildLLMPayload(char.id, tempHistory, isOffline, false, groupInfo, null);
        
        // 发送给云端代跑
        await planCloudBrain(0.05, char, llmMessages, chat.charId + '|' + char.id + '|' + (isOffline ? '1' : '0'));
        
        // 🌟 重 roll 之后，强制踹一脚巡逻员，重新校准云端闹钟！
        if (typeof window.scheduleCloudTask === 'function') {
            window.scheduleCloudTask(chat.charId);
        }
    } catch (e) {
        console.error('重roll请求失败', e);
        wxState.typingStatus[chat.charId] = false;
        if (typeof window.render === 'function') window.render(); restoreScroll();
    }
};

// ==================== 以下代码必须放在 wechat.js 的最最最底部 ====================

window.syncCloudMailbox = async () => {
  if (window.isSyncingMailbox) return; // 🌟 锁门，防止巡逻员闯入
  // 🌟 新增防御拦截：如果用户还没有填写云端密钥，信箱直接静默待命，绝不报错弹窗！
  if (!localStorage.getItem('neko_server_pwd')) return;
  window.isSyncingMailbox = true;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const res = await fetch('https://neko-hoshino.duckdns.org/sync-mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-secret-token': localStorage.getItem('neko_server_pwd') || '' },
        body: JSON.stringify({ endpoint: sub.endpoint })
    });
    // 🌟 核心防爆装甲：如果自己的服务器重启或 Nginx 返回了 HTML，静默拦截，不再报错死机！
    if (!res.ok) {
        const errText = await res.text();
        console.warn(`[系统] 信箱同步暂时受阻 (HTTP ${res.status})，服务器可能正在重启或被 Nginx 拦截。详情:`, errText.substring(0, 80));
        return; // 直接退出，等下个15秒再试，绝不强行 parse JSON！
    }
    const data = await res.json();
    if (!data.messages || data.messages.length === 0) return;

    // 🌟 核心升级：使用 for...of 保证语音和打字延迟能够“顺序执行”
    for (const msg of data.messages) {
        if (!msg.charId) continue;
        let sysMsgOffset = 1; // 🌟 修复 1：引入局部计数器，确保同一毫秒内的指令 ID 绝对唯一且为纯整数！
        let pendingCrossChat = null;
        
        // 🌟 史诗级修复：精准读取云端的 timestamp 并转换为人类时间！
const cloudTime = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : getNowTime();
        
        // 🌟 史诗级修复：剥离所有前缀，支持 AUTO、MOMENT、ALARM 和 FORCE！
        let rawCharId = msg.charId;
        let isAutoTask = false;
        let isMomentTask = false; 
        
        if (rawCharId.startsWith('AUTO|')) { 
            rawCharId = rawCharId.substring(5); 
            isAutoTask = true; 
        }
        if (rawCharId.startsWith('MOMENT|')) { 
            rawCharId = rawCharId.substring(7); 
            isMomentTask = true; 
        }
        if (rawCharId.startsWith('ALARM|')) rawCharId = rawCharId.substring(6);
        
        // 🌟 新增：剥离 FORCE 前缀 (6个字符)
        if (rawCharId.startsWith('FORCE|')) rawCharId = rawCharId.substring(6);
        
        const parts = rawCharId.split('|');
        const chatId = parts[0];
        const charId = parts[1] || chatId;
        const isOffline = parts[2] === '1';

        const chat = store.chats.find(c => c.charId === chatId);
        const char = store.contacts.find(c => c.id === charId);
        if (!chat || !char) continue;

        const targetObj = chat.isGroup ? chat : char;
        const displayName = chat.charRemark || char.name; // 🌟 提取专属备注
        
        // 🌟 如果你半路关掉了朋友圈频率，直接拦截作废这个过期动态！
        if (isMomentTask && (!targetObj.autoMomentFreq || targetObj.autoMomentFreq === 0)) {
            continue; 
        }

        // 🌟 物理砸碎引擎：
        let shouldSmashChat = false;
        if (isAutoTask && !targetObj.autoMsgEnabled) {
            shouldSmashChat = true; // 主动聊天关了，砸碎！
            console.log(`[砸碎引擎] ${char.name} 的主动聊天已关闭，拦截此条云端消息！`);
            continue; // 🌟 直接跳过这条消息的全部处理，不解析、不入库、不渲染
        }
        if (isMomentTask) {
            shouldSmashChat = true; // 🌟 核心：朋友圈专属线程【绝对不允许】将任何文字漏到聊天窗口！砸碎所有常规气泡！
        }

        const isActive = typeof wxState !== 'undefined' && wxState.activeChatId === chatId;
        
        // 🌟 核心修复 1：增加后台悬浮窗通话的判定！即使最小化，也能识别通话状态
        const isOngoingCall = typeof store !== 'undefined' && store.activeCall && store.activeCall.charId === chatId;
        const isCall = ((typeof wxState !== 'undefined' && wxState.view === 'call' && isActive) || isOngoingCall) && !chat.isGroup;

        // 🌟 安全解除“正在输入中”
        if (typeof wxState !== 'undefined' && wxState.typingStatus) wxState.typingStatus[chatId] = false;

        let replyText = msg.text || '';
        replyText = replyText.replace(/\\n/g, '\n').replace(/\/n/g, '\n').replace(/`\{[\s\S]*?\}`/gi, '').trim();
        replyText = replyText.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();

        // 🌟 1. 提取心声面板
        const thoughtRegex = /\[心声\]\s*(\{.*?\})/s;
        const thoughtMatch = replyText.match(thoughtRegex);
        if (thoughtMatch) {
            try { chat.latestInnerThought = JSON.parse(thoughtMatch[1]); chat.latestInnerThoughtTime = Date.now(); } catch(e) {}
            replyText = replyText.replace(thoughtRegex, '').trim();
        } else {
            const thoughtIndex = replyText.lastIndexOf('[心声]');
            if (thoughtIndex !== -1) {
                const jsonMatch = replyText.substring(thoughtIndex).match(/\{[\s\S]*\}/);
                if (jsonMatch) { try { chat.latestInnerThought = JSON.parse(jsonMatch[0]); chat.latestInnerThoughtTime = Date.now(); } catch(e){} }
                replyText = replyText.substring(0, thoughtIndex).trim();
            }
        }

        // 2. 净化时间戳（匹配多种格式： [HH:MM]、[YYYY-MM-DD HH:MM]、[YYYY/MM/DD HH:MM] 等）
let remainingText = replyText
    .replace(/\[\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{1,2}:\d{2}\][:：]?\s*/g, '')  // 完整日期时间
    .replace(/\[\d{1,2}:\d{2}\][:：]?\s*/g, '')                                 // 仅时分
    .replace(/\[系统提示.*?\][:：]?\s*/g, '')
    .replace(/\[好友申请\][:：]?\s*/g, '')
    .trim();

        // 提取 reply_as_user 跨聊天室注入指令（从文本中剥离，不显示给用户）
        const crossChatRegex = /\{[^{}]*"action"\s*:\s*"reply_as_user"[^{}]*\}/s;
        const crossChatMatch = remainingText.match(crossChatRegex);
        if (crossChatMatch) {
            try {
                const parsed = JSON.parse(crossChatMatch[0]);
                if (parsed.action === 'reply_as_user' && parsed.target && parsed.text) {
                    pendingCrossChat = parsed;
                }
            } catch(e) {}
            remainingText = remainingText.replace(crossChatMatch[0], '').trim();
        }

        // 🌟 3. 提取 HTML 保护罩
        let codeBlocks = [];
        
        // 剪刀一：对标准 markdown 格式 ```html ... ``` 的绞杀
        remainingText = remainingText.replace(/```[a-z]*\n?([\s\S]*?)```/gi, (match, code) => {
            let id = `__CODE_BLOCK_${codeBlocks.length}__`;
            // 🚨 核心手术：把代码块内部的所有换行符 \n \r 全部替换成空格！
            let flatCode = code.replace(/\r\n|\r|\n/g, ' ').trim();
            codeBlocks.push(`<div style="white-space: normal !important; line-height: 1.5;">${flatCode}</div>`); 
            return `\n${id}\n`; // 这里故意留换行是为了让它能独占一个气泡
        });
        
        // 剪刀二：对未正确闭合的、或者只写了裸标签的 HTML 的绞杀
        remainingText = remainingText.replace(/(<(div|html|body|main|section|article|form|table)[\s\S]*?<\/\2>)/gi, (match) => {
            let id = `__CODE_BLOCK_${codeBlocks.length}__`;
            // 🚨 同样把内部换行抹平
            let flatCode = match.replace(/\r\n|\r|\n/g, ' ').trim();
            codeBlocks.push(`<div style="white-space: normal !important; line-height: 1.5;">${flatCode}</div>`); 
            return `\n${id}\n`;
        });

        let msgsToPush = [];
        let hasSystemAction = false;
        
        if (/\[(语音|视频)?通话(已)?结束\]/.test(remainingText)) remainingText = remainingText.replace(/\[(语音|视频)?通话(已)?结束\][:：]?\s*/g, '').trim();

        // 🎲 微型剧情消费（一次性，响应后立即清除）
        if (chat.pendingMicroPlot) {
            chat.pendingMicroPlot = null;
        }

        // 🎲 短线 / 长线剧情结束检测
        if (remainingText.includes('[剧情结束]')) {
            if (chat.activeRandomPlot) {
                const endedKeyword = chat.activeRandomPlot.keyword;
                chat.activeRandomPlot = null;
                chat.messages.push({
                    id: Date.now() + sysMsgOffset++, sender: 'system',
                    text: `✨ 随机剧情「${endedKeyword}」已结束`,
                    isMe: false, source: 'wechat', msgType: 'system', time: cloudTime
                });
                hasSystemAction = true;
            }
            remainingText = remainingText.replace(/\[剧情结束\]/g, '').trim();
        }

        // 🌟 【新增】：AI 收款动作拦截器！

        // 🌟 新增：退回转账处理
if (/\[(?:退回转账|退还转账)\]/.test(remainingText)) {
    // 找到最近一条尚未处理的、用户发给 AI 的转账卡片（pending 状态）
    const pendingTransfer = chat.messages.slice().reverse().find(m => m.msgType === 'transfer' && m.transferState === 'pending' && m.isMe);
    
    if (pendingTransfer) {
        // 将转账卡片状态改为已退回
        pendingTransfer.transferState = 'returned';
        
        // 推送系统消息：“xx 已退回了转账”
        chat.messages.push({
            id: Date.now() + sysMsgOffset++, 
            sender: 'system', 
            text: `${char.name} 已退回了转账`, 
            isMe: false, source: 'wechat', isOffline: false, msgType: 'system', 
            time: cloudTime,
            timestamp: Date.now() + sysMsgOffset
        });
        hasSystemAction = true;
        if (typeof window.render === 'function' && wxState.view === 'chatRoom') window.render();
    }
    // 从剩余文本中移除该指令
    remainingText = remainingText.replace(/\[(?:退回转账|退还转账)\]/g, '').trim();
}

        if (/\[(?:确认收款|点击收款|收下转账)\]/.test(remainingText)) {
            // 找到最近的一条还没被领取的、我发出的转账卡片
            const pendingTransfer = chat.messages.slice().reverse().find(m => m.msgType === 'transfer' && m.transferState === 'pending' && m.isMe);
            
            if (pendingTransfer) {
                // 1. 卡片变绿（变更为已收款状态）
                pendingTransfer.transferState = 'accepted';
                const amount = parseFloat(pendingTransfer.transferData.amount);
                
                // 2. 扣除我的钱包余额，并生成账单
                if (typeof store !== 'undefined' && store.wallet) {
                     store.wallet.balance -= amount;
                     store.wallet.transactions.push({ type: 'out', amount, title: `转账给对方`, date: new Date().toISOString() });
                }
                
                // 3. 推送灰色的系统提示：“xx 已收款”
                chat.messages.push({
                    id: Date.now() + sysMsgOffset++, 
                    sender: 'system', 
                    text: `${char.name} 已收款`, 
                    isMe: false, source: 'wechat', isOffline: false, msgType: 'system', 
                    time: cloudTime,
                    timestamp: Date.now() + sysMsgOffset
                });
                hasSystemAction = true;
                if (typeof window.render === 'function' && wxState.view === 'chatRoom') window.render();
            }
            // 4. 物理抹除指令，不让这几个丑陋的字眼掉进正常的聊天气泡里
            remainingText = remainingText.replace(/\[(?:确认收款|点击收款|收下转账)\]/g, '').trim();
        }
        
        // 🌟 【新增代码】：在解析开始前，全局扫描聊天内容，强行把掉到下一行的照片和定位吸附回上一行！
        remainingText = remainingText.replace(/[\r\n]+\s*(\[附带虚拟照片|\[附带定位)/g, ' $1');

        // 🌟 【AI格式修正】：在所有[]指令前强制加入换行符，避免AI忘记换行导致格式错误
        // 注意：朋友圈的[附带虚拟照片]和[附带定位]已经在上面被吸附到同一行，不会被这里影响
        remainingText = remainingText.replace(/([^\n])\[(?!附带)(语音|虚拟照片|表情包|发送定位|发起转账|点击收款|退回转账|发起语音通话|发起视频通话|设置闹钟|定时发送|更换头像|修改备注|撤回上一条消息|发朋友圈|戳一戳|修改被戳动作|修改被戳后缀|拉黑用户|淘宝下单|下单|保持拉黑|解除拉黑|发送好友申请)/g, '$1\n[$2');

        // 🌟 终极安全的朋友圈拦截器：只吃当前这一行，绝对不吞噬换行后的正常聊天！
        if (/\[(?:发朋友圈|发布朋友圈)\]/.test(remainingText)) {
            const match = remainingText.match(/\[(?:发朋友圈|发布朋友圈)\][:：]?\s*([^\n]+)/); // 关键：允许带括号，遇到换行才停
            if (match) {
                let contentText = match[1].trim();
                // 🌟 解析 AI 附加的定位指令！
                let locationText = null;
                const locMatch = contentText.match(/\[附带定位[:：]?\s*([^\]]+)\]/);
                if (locMatch) {
                    locationText = locMatch[1].trim();
                    contentText = contentText.replace(/\[附带定位[:：]?\s*([^\]]+)\]/, '').trim();
                }

                let virtualText = null;
                const photoMatch = contentText.match(/\[附带虚拟照片[:：]?\s*([^\]]+)\]/);
                if (photoMatch) {
                    virtualText = photoMatch[1].trim();
                    contentText = contentText.replace(/\[附带虚拟照片[:：]?\s*([^\]]+)\]/, '').trim();
                }
                store.moments = store.moments || [];
                // 🌟 修复：把 unshift 改成 push，配合渲染时的 reverse，完美置顶！
                store.moments.push({ 
                    id: Date.now() + sysMsgOffset++, senderId: char.id, senderName: char.name, avatar: char.avatar, 
                    text: contentText.replace(/^["']|["']$/g, ''), imageUrl: null, virtualImageText: virtualText, 
                    time: cloudTime, timestamp: Date.now() + sysMsgOffset++, likes: [], comments: [] 
                });
                hasSystemAction = true;
                if (typeof window.render === 'function' && wxState.view === 'moments') window.render();
            }
            // 将这一行抹除，剩下的文字继续走后续的正常气泡渲染！
            remainingText = remainingText.replace(/\[(?:发朋友圈|发布朋友圈)\][:：]?\s*[^\n]+/, '').trim();
        }
        
        if (/\[更换头像\]/.test(remainingText)) {
    let newAvatar = null;

    // 1. 优先从聊天记录中查找最后一张用户发送的真实图片
    const userRealImages = chat.messages.filter(m => m.isMe && m.msgType === 'real_image');
    if (userRealImages.length > 0) {
        const lastImg = userRealImages[userRealImages.length - 1];
        newAvatar = lastImg.imageUrl;
    }

    // 2. 如果没找到真实图片，再尝试从指令中提取（兼容旧格式）
    if (!newAvatar) {
        const match = remainingText.match(/\[更换头像\][:：]?\s*([^\n\[\]]+)/);
        if (match) newAvatar = match[1].trim();
    }

    // 3. 如果成功获取到新头像，则更新并推送系统消息
    if (newAvatar) {
        char.avatar = newAvatar;                        // 更新角色头像
        chat.messages.push({
            id: Date.now()+ sysMsgOffset++,
            sender: 'system',
            text: `${displayName} 更换了头像`,
            isMe: false,
            source: 'wechat',
            msgType: 'system',
            time: cloudTime
        });
        hasSystemAction = true;
    }

    // 4. 从剩余文本中移除该指令
    remainingText = remainingText.replace(/\[更换头像\][:：]?\s*[^\n\[\]]*/, '').trim();
}

        if (/\[修改备注\]/.test(remainingText)) {
            const match = remainingText.match(/\[修改备注\][:：]?\s*([^\n\[\]]+)/);
            if (match) { chat.myRemark = match[1].trim().substring(0, 15); chat.messages.push({ id: Date.now()+ sysMsgOffset++, sender: 'system', text: `${displayName} 将你的备注修改为“${chat.myRemark}”`, isMe: false, source: 'wechat', msgType: 'system', time: cloudTime }); hasSystemAction = true; }
            remainingText = remainingText.replace(/\[修改备注\][:：]?\s*[^\n\[\]]+/, '').trim();
        }

        // 🌟 新增：解析修改戳一戳指令
        if (/\[修改被戳动作[:：]?([^\]]+)\]/.test(remainingText)) {
            const match = remainingText.match(/\[修改被戳动作[:：]?([^\]]+)\]/);
            if (match) { char.nudgeMeVerb = match[1].trim().substring(0, 10); chat.messages.push({ id: Date.now()+ sysMsgOffset++, sender: 'system', text: `${displayName} 将被戳动作修改为“${char.nudgeMeVerb}”`, isMe: false, source: 'wechat', msgType: 'system', time: cloudTime }); hasSystemAction = true; }
            remainingText = remainingText.replace(/\[修改被戳动作[:：]?[^\]]+\]/g, '').trim(); hasSystemAction = true;
        }
        if (/\[修改被戳后缀[:：]?([^\]]+)\]/.test(remainingText)) {
            const match = remainingText.match(/\[修改被戳后缀[:：]?([^\]]+)\]/);
            if (match) { char.nudgeMeSuffix = match[1].trim().substring(0, 20); chat.messages.push({ id: Date.now()+ sysMsgOffset++, sender: 'system', text: `${displayName} 将被戳后缀修改为“${char.nudgeMeSuffix}”`, isMe: false, source: 'wechat', msgType: 'system', time: cloudTime }); hasSystemAction = true; }
            remainingText = remainingText.replace(/\[修改被戳后缀[:：]?[^\]]+\]/g, '').trim(); hasSystemAction = true;
        }

        if (/\[拉黑用户\]/.test(remainingText)) {
            char.isBlocked = true;
            chat.messages.push({ id: Date.now()+ sysMsgOffset++, sender: 'system', text: `你已被 ${displayName} 拉入黑名单`, isMe: false, source: 'wechat', msgType: 'system', time: cloudTime });
            remainingText = remainingText.replace(/\[拉黑用户\][:：]?\s*/g, '').trim(); hasSystemAction = true;
        }
        if (/\[解除拉黑\]/.test(remainingText)) {
            char.isBlocked = false;
            chat.messages.push({ id: Date.now()+ sysMsgOffset++, sender: 'system', text: `${displayName} 已将你从黑名单中移除`, isMe: false, source: 'wechat', msgType: 'system', time: cloudTime });
            remainingText = remainingText.replace(/\[解除拉黑\][:：]?\s*/g, '').trim(); hasSystemAction = true;
        }
        if (/\[保持拉黑\]/.test(remainingText)) {
            // 如果保持拉黑，直接把这句话删掉，导致 remainingText 为空，系统就不会发任何文字上屏（完美模拟无视）！
            remainingText = remainingText.replace(/\[保持拉黑\][:：]?\s*/g, '').trim(); hasSystemAction = true;
        }

        // 🌟 恢复：解析 AI 发送的好友申请卡片！
        if (/\[(?:发送好友申请|请求添加好友)\]/.test(remainingText)) {
            chat.messages.push({ id: Date.now()+ sysMsgOffset++, sender: char.name, text: `我是 ${char.name}`, isMe: false, source: 'wechat', msgType: 'friend_request', reqState: 'pending', time: cloudTime });
            remainingText = remainingText.replace(/\[(?:发送好友申请|请求添加好友)\][:：]?\s*/g, '').trim(); hasSystemAction = true;
        }

        // 🌟 物理拦截情侣空间邀请
        if (/\[(?:接受|同意)邀请\]/.test(remainingText)) {
            msgsToPush.push({ msgType: 'accept_card', text: '[已接受邀请]' });
            remainingText = remainingText.replace(/\[(?:接受|同意)邀请\][:：]?\s*/g, '').trim();
            store.coupleSpaces = store.coupleSpaces || [];
            if (!store.coupleSpaces.includes(char.id)) store.coupleSpaces.push(char.id);
            hasSystemAction = true;
        }

        // 👇 🌟 【新增】：物理拦截 Sync 博主邀请！
        if (/\[(?:接受|同意)Sync邀请\]/i.test(remainingText)) {
            // 1. 发送一张炫酷的已同意卡片（或者直接用系统提示）
            chat.messages.push({ 
                id: Date.now() + sysMsgOffset++, sender: 'system', 
                text: `${char.name} 已接受邀请，你们的 Sync 账号已正式建立！`, 
                isMe: false, source: 'wechat', msgType: 'system', time: cloudTime, timestamp: Date.now() + sysMsgOffset 
            });
            remainingText = remainingText.replace(/\[(?:接受|同意)Sync邀请\][:：]?\s*/gi, '').trim();
            
            // 2. 物理开通 Sync 账号！
            store.syncAccounts = store.syncAccounts || [];
            // 防止重复开通
            if (!store.syncAccounts.find(a => a.charId === char.id)) {
                const pId = chat.isGroup ? chat.boundPersonaId : (char?.boundPersonaId || store.personas[0].id);
                const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
                
                store.syncAccounts.push({
                    id: 'sync_' + Date.now(),
                    charId: char.id,
                    name: `${boundPersona.name} & ${char.name}`, // 初始默认名字
                    avatar: char.avatar, // 初始默认用他的头像
                    followers: Math.floor(Math.random() * 200) + 50, // 初始给点僵尸粉
                    posts: [], // 帖子列表
                    drafts: [] // 草稿箱
                });
            }
            hasSystemAction = true;
            if (typeof window.actions?.saveStore === 'function') window.actions.saveStore();
        }

        // 👇 🌟 新增：解析手机权限请求反馈！
        if (/\[同意\]/.test(remainingText)) {
            // 1. 永久授权钢印
            char.hasPhonePermission = true; 
            
            // 2. 发送全服广播的灰色系统提示语
            chat.messages.push({ 
                id: Date.now() + sysMsgOffset++, 
                sender: 'system', 
                text: `${char.name} 已同意你的手机访问请求`, 
                isMe: false, source: 'wechat', msgType: 'system', 
                time: cloudTime, timestamp: Date.now() + sysMsgOffset
            });
            
            // 3. 抹除丑陋的指令标签，让剩下的聊天自然输出
            remainingText = remainingText.replace(/\[同意\][:：]?\s*/g, '').trim();
            hasSystemAction = true;
            if (typeof window.actions?.saveStore === 'function') window.actions.saveStore();
        }

        if (/\[拒绝\]/.test(remainingText)) {
            // 1. 剥夺权限
            char.hasPhonePermission = false; 
            
            // 2. 发送被拒绝的灰色系统提示语
            chat.messages.push({ 
                id: Date.now() + sysMsgOffset++, 
                sender: 'system', 
                text: `${char.name} 拒绝了你的手机访问请求`, 
                isMe: false, source: 'wechat', msgType: 'system', 
                time: cloudTime, timestamp: Date.now() + sysMsgOffset
            });
            
            remainingText = remainingText.replace(/\[拒绝\][:：]?\s*/g, '').trim();
            hasSystemAction = true;
            if (typeof window.actions?.saveStore === 'function') window.actions.saveStore();
        }
        // 👆 结束新增

        // 🌟 解析 AI 的主动闹钟超能力（倒计时与定时发送）
        let customAlarmMinutes = null;
        if (/\[设置闹钟\][:：]?\s*(\d+(\.\d+)?)/.test(remainingText)) {
            const match = remainingText.match(/\[设置闹钟\][:：]?\s*(\d+(\.\d+)?)/);
            customAlarmMinutes = parseFloat(match[1]);
            remainingText = remainingText.replace(/\[设置闹钟\][:：]?\s*\d+(\.\d+)?/, '').trim();
        }
        if (/\[定时发送\][:：]?\s*(\d{1,2}[:：]\d{2})/.test(remainingText)) {
            const match = remainingText.match(/\[定时发送\][:：]?\s*(\d{1,2}[:：]\d{2})/);
            const timeStr = match[1].replace('：', ':');
            const [th, tm] = timeStr.split(':').map(Number);
            const now = new Date();
            let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm, 0);
            if (targetDate.getTime() <= now.getTime()) targetDate.setDate(targetDate.getDate() + 1); // 自动推延到明天
            customAlarmMinutes = (targetDate.getTime() - now.getTime()) / 60000;
            remainingText = remainingText.replace(/\[定时发送\][:：]?\s*\d{1,2}[:：]\d{2}/, '').trim();
        }
        // 🌟 获取正确的马甲名字
        // 🌟 抢救包：先找到当前聊天对象，再拿马甲，绝不报错！
      const charObj = store.contacts.find(c => c.id === chat.charId);
      const pId = chat.isGroup ? chat.boundPersonaId : (charObj?.boundPersonaId || store.personas[0].id);
        const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
        // 🌟 如果解析到了闹钟，立刻向云端服务器投递定时唤醒任务！
        if (customAlarmMinutes && customAlarmMinutes > 0) {
            setTimeout(async () => {
                try {
                    const promptMsg = `(系统自动触发：你设定的 ${customAlarmMinutes < 60 ? Math.ceil(customAlarmMinutes) + '分钟' : (customAlarmMinutes/60).toFixed(1) + '小时'} 后的闹钟已到。请主动发消息找用户，可以叫醒ta或者提醒ta约定的事。注意：符合语境，直接说话，绝不许包含系统标签。)`;
                    const tempHistory = [...chat.messages, { id: Date.now()+ sysMsgOffset++, sender: boundPersona.name, text: promptMsg, isMe: true, isHidden: true, msgType: 'text' }];
                    let groupInfo = null;
                    if (chat.isGroup) {
                        const allNames = chat.memberIds.map(id => store.contacts.find(c => c.id === id)?.name).filter(Boolean).join('、');
                        groupInfo = { id: chat.charId, name: chat.groupName, allNames: allNames, notice: chat.groupNotice || '' };
                    }
                    const llmMessages = await buildLLMPayload(char.id, tempHistory, false, false, groupInfo, null);
                    const { buildLLMPayload } = await import('../../utils/llm.js');
                    // 借用云端托管理由引擎
                    // 🌟 核心进化：在标识符前加上 'ALARM|' 前缀！
// 这样云端就会把它当成一条完全独立的 VIP 线程，哪怕你们疯狂聊天，也绝不会打碎这个闹钟！
planCloudBrain(customAlarmMinutes, char, llmMessages, 'ALARM|' + chat.charId + '|' + char.id + '|0');
                } catch(e) { console.error('智能闹钟投递失败', e); }
            }, 1000);
        }

        // 🌟 核心修复 2：如果是通话中（即使最小化），绝对不触发纯净模式抹除！并且升级正则兼容 **双星号**
        if (isActive && typeof wxState !== 'undefined' && wxState.view === 'chatRoom' && !isOngoingCall) {
            remainingText = remainingText.replace(/\*\*?[^*]+\*\*?/g, '').replace(/[(（][^)）]*[)）]/g, '').trim();
        }
        
// 在 while 循环之前声明当前说话者（默认为角色名字）
let currentSpeakerName = char.name;

// 🌟 加上无限连发引擎的安全锁
let lastLength = -1;
while (remainingText.trim().length > 0 && remainingText.length !== lastLength) {
    lastLength = remainingText.length;
    let matched = false;

    // 🌟 史诗级进化：一网打尽的超级正则！将所有顺序敏感动作拉入统一时间线！
    const regex = /\[(?:发送)?(语音|虚拟照片|定位|发起转账|转账|表情包|表情|撤回上一条消息|戳一戳|发起语音通话|发起视频通话|发起通话|下单|淘宝下单|付款)(?:\][:：]?\s*([^\r\n]*)|[:：\s]*([^\]\r\n]+)\]?|\])/;
    const match = remainingText.match(regex);

    if (match) {
        // 1. 获取标签前的文本
        let beforeText = remainingText.substring(0, match.index);
        let remainingAfterMatch = remainingText.substring(match.index + match[0].length);
        
        // 2. 从 beforeText 中提取可能的角色名
        let extractedSpeaker = null;
        let cleanedBeforeText = beforeText;
        const lines = beforeText.split(/\r\n|\r|\n/);
        let lastSpeakerLine = -1;
        
        // 从后往前找最后一个纯角色名行（格式：角色名: 或 角色名：）
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            const matchName = line.match(/^([^:：\[\]]{1,15})[:：]\s*$/);
            if (matchName) {
                extractedSpeaker = matchName[1].trim();
                lastSpeakerLine = i;
                break;
            }
        }
        
        if (extractedSpeaker) {
            // 移除该行，其余部分作为 cleanedBeforeText
            lines.splice(lastSpeakerLine, 1);
            cleanedBeforeText = lines.join('\n');
            currentSpeakerName = extractedSpeaker; // 更新当前说话者
        }
        
        // 3. 如果清理后的文本非空，按行推送为普通文本，并解析其中的角色名
if (cleanedBeforeText.trim()) {
    const textLines = cleanedBeforeText.split(/\r\n|\r|\n/).filter(l => l.trim());
    textLines.forEach(line => {
        let textToPush = line.trim();
        let speaker = currentSpeakerName;
        if (chat.isGroup) {
            const gm = line.match(/^([^:：\[\]]{1,15})[:：]\s*(.*)$/);
            if (gm) {
                speaker = gm[1].trim();
                textToPush = gm[2].trim();
                if (!textToPush) return; // 只有角色名没有内容，跳过
                // 更新当前说话者，以便后续行使用
                currentSpeakerName = speaker;
            }
        }
        msgsToPush.push({ sender: speaker, msgType: 'text', text: textToPush });
    });
}
        
        // 4. 处理多媒体标签本身
        const type = match[1];
        let content = (match[2] || match[3] || '').trim();
        
        if (type === '发起转账' || type === '转账') {
    // 从 match[2] 或 match[3] 中获取转账详情
    let contentDetail = (match[2] || match[3] || '').trim();
    let amount = '520.00';
    let note = '转账给你';

    // 提取金额
    const amountMatch = contentDetail.match(/金额\s*[:：]?\s*(\d+(?:\.\d+)?)/);
    if (amountMatch) {
        amount = amountMatch[1];
    }

    // 提取备注（匹配到换行或方括号为止）
    const noteMatch = contentDetail.match(/备注\s*[:：]\s*([^\n\r[\]]+)/);
    if (noteMatch) {
        note = noteMatch[1].trim();
    }

    msgsToPush.push({ 
        sender: currentSpeakerName,
        msgType: 'transfer', 
        text: `[收到转账]`, 
        transferData: { amount, note }, 
        transferState: 'pending' 
    });

    // 剩余未处理的文本（如换行后的普通消息）继续解析
    remainingText = remainingAfterMatch;
    matched = true;
    continue;
} else if (type === '表情包' || type === '表情') {
            let foundUrl = '';
            for (let libId of (char.mountedEmojis || [])) {
                const lib = (store.emojiLibs || []).find(l => l.id === libId);
                if (lib) { const ep = lib.emojis.find(e => (typeof e === 'object' ? e.name : '') === content); if (ep) { foundUrl = ep.url; break; } }
            }
            if (foundUrl) {
                msgsToPush.push({ sender: currentSpeakerName, msgType: 'emoji', text: `[表情包] ${content}`, imageUrl: foundUrl });
            } else {
                msgsToPush.push({ sender: currentSpeakerName, msgType: 'text', text: `[表情包] ${content}` });
            }
        }
        else if (type === '撤回上一条消息') {
            msgsToPush.push({ sender: currentSpeakerName, msgType: 'recall_action' });
        }
        else if (type === '戳一戳') {
            msgsToPush.push({ sender: 'system', msgType: 'system', text: `${displayName}${char.nudgeAIVerb || '拍了拍'}了我${char.nudgeAISuffix || ''}` });
        }
        else if (type.includes('通话')) {
            let callType = type.includes('视频') ? 'video' : 'voice';
            msgsToPush.push({ sender: currentSpeakerName, msgType: 'call_action', callType: callType, text: content });
        // 👆 新增结束
        } else if (type === '下单') {
            // 🌟 史诗级升级：精准剥离出店名、价格、备注、收件人、菜品明细！
            let storeName = '未知店铺';
            let totalPriceStr = '0.00';
            let personalNote = 'Enjoy your food!'; // 兜底备注
            let recipientName = '你'; // 🌟 新增：兜底收件人
            let foodItemsArr = [];
            
            if (content.includes('|')) {
                const parts = content.split('|').map(p => p.trim());
                storeName = parts[0] || '神秘美食';
                totalPriceStr = (parts[1] || '0.00').replace(/S\$/i, ''); // 抹除价格前缀
                personalNote = parts[2] || 'Enjoy your cyber food!';
                
                let foodItemsRaw = '';
                
                // 🌟 新增防弹逻辑：判断他是写了新指令还是忘写了
                if (parts.length >= 5) {
                    // 如果切出5块及以上，说明第4块（索引3）就是收件人
                    recipientName = parts[3] || '你';
                    foodItemsRaw = parts.slice(4).join('|'); // 剩下的全是菜品
                } else {
                    // 如果他忘了写收件人，自动抓取当前你的设定名字当兜底
                    const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas.find(p => p.isCurrent) || store.personas[0];
                    recipientName = boundPersona?.name || '你';
                    foodItemsRaw = parts.slice(3).join('|'); 
                }
                
                const rawArr = foodItemsRaw.split(/[,，]/).map(f => f.trim()).filter(Boolean);
                
                // 🌟 数据清洗魔法：自动生成逼真的数量(1x)和金额分布
                const total = parseFloat(totalPriceStr) || 20.00;
                const numItems = rawArr.length;
                let runningTotal = 0;
                
                foodItemsArr = rawArr.map((item, index) => {
                    const qty = 1; // 默认1份
                    let itemPrice;
                    if (index === numItems - 1) {
                        // 最后一件，用差额保证总计金额完全相等
                        itemPrice = (total - runningTotal).toFixed(2);
                    } else {
                        // 生成一个 plausible 的价格分布（例如 total/numItems +/- 随机值）
                        const basePrice = total / numItems;
                        const variance = (Math.random() - 0.5) * (basePrice * 0.4); // +/- 20% 抖动
                        itemPrice = Math.max(1.00, (basePrice + variance)).toFixed(2); // 兜底1元
                        runningTotal += parseFloat(itemPrice);
                    }
                    return { name: item, qty, price: itemPrice };
                });
                
            } else {
                storeName = content.trim(); // 万一 AI 漏了竖线，做个兜底
                const boundPersona = store.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || store.personas.find(p => p.isCurrent) || store.personas[0];
                recipientName = boundPersona?.name || '你';
            }

            msgsToPush.push({ 
                sender: currentSpeakerName, 
                msgType: 'takeaway_card', 
                text: `[为你点了一份外卖]`, // 兜底文字，供列表预览用
                // 🌟 把收件人姓名塞进 takeawayData 中，供 UI 渲染提取！
                takeawayData: { storeName, totalPriceStr, personalNote, foodItemsArr, recipient: recipientName } 
            });
            
            // 🌟 将 TA 的外卖单写入系统
            if (typeof store !== 'undefined' && store.shoppingData) {
                const deliveryMs = 30 * 60 * 1000;
                const orderBase = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
                store.shoppingData.orders.unshift({
                    orderNum: 'WM' + orderBase.toString().slice(-8),
                    time: new Date(orderBase).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}),
                    timestamp: orderBase, deliveryTime: orderBase + deliveryMs,
                    type: 'food', storeName: storeName, items: foodItemsArr, totalPrice: totalPriceStr,
                    status: '骑手赶往中', 
                    recipient: recipientName, // 🌟 这里直接使用解析出来的收件人
                    targetCharId: char.id, buyFor: 'user_by_ta'
                });
                if (window.actions?.saveStore) window.actions.saveStore();
            }
          } else if (type === '淘宝下单') {
    let itemsRaw = [];
    let recipient = '';
    
    // 先尝试提取收件人（支持两种格式：; 收件人:xxx 或 收件人:xxx）
    let recipientMatch = content.match(/[;；]\s*收件人[:：]\s*([^;；,，\n]+)/i);
    if (!recipientMatch) {
        recipientMatch = content.match(/收件人[:：]\s*([^;；,，\n]+)/i);
    }
    if (recipientMatch) {
        recipient = recipientMatch[1].trim();
        // 从 content 中移除收件人部分，剩下的作为商品列表
        content = content.replace(recipientMatch[0], '');
    }
    
    // 按逗号切分商品（兼容中英文逗号）
    itemsRaw = content.split(/[,，]/);
    let parsedItems = [];
    let totalAmount = 0;

    itemsRaw.forEach(itemStr => {
        let parts = itemStr.split('|').map(p => p.trim());
        if (parts.length >= 1 && parts[0]) {
            let name = parts[0] || '神秘礼物';
            let price = parseFloat(parts[1]) || (Math.floor(Math.random() * 200) + 50);
            let qty = parseInt(parts[2]) || 1;
            totalAmount += (price * qty);
            parsedItems.push({ name, price: price.toFixed(2), qty });
        }
    });

    // 动态生成订单信息
    const orderNum = 'TB' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10000);
    const nowTime = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const orderTimeStr = nowTime.toLocaleString('zh-CN', { hour12: false });
    const deliveryTime = new Date(nowTime.getTime() + 3 * 24 * 60 * 60 * 1000);
    const deliveryDateStr = `${deliveryTime.getMonth() + 1}月${deliveryTime.getDate()}日`;

    // 如果没有提供收件人，使用默认值（用户当前身份的名字）
    if (!recipient) {
        const defaultPersona = store.personas.find(p => p.id === (char?.boundPersonaId || store.personas[0].id)) || store.personas[0];
        recipient = defaultPersona.name;
    }

    msgsToPush.push({ 
        sender: currentSpeakerName, 
        msgType: 'taobao_card', 
        text: `[淘宝订单]`, 
        taobaoData: { 
            items: parsedItems,
            totalPrice: totalAmount.toFixed(2),
            orderNum: orderNum,
            orderTime: orderTimeStr,
            deliveryDateStr: deliveryDateStr,
            recipient: recipient   // 新增收件人字段
        } 
    });
    
    // 同步到 shoppingData（如果需要）
    if (typeof store !== 'undefined' && store.shoppingData) {
        const deliveryMs = 2 * 24 * 60 * 60 * 1000;
        const taobaoOrderBase = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
        store.shoppingData.orders.unshift({
            orderNum: orderNum,
            time: new Date(taobaoOrderBase).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}),
            timestamp: taobaoOrderBase, deliveryTime: taobaoOrderBase + deliveryMs,
            type: 'shop', storeName: '淘宝精选', items: parsedItems, totalPrice: totalAmount.toFixed(2),
            status: '卖家已发货', recipient: recipient,
            targetCharId: char.id, buyFor: 'user_by_ta'
        });
        if (window.actions?.saveStore) window.actions.saveStore();
    }
          } else if (type === '付款') {
            // 🌟 1. 找到该聊天室里最后一张等待代付的订单（兼容淘宝和外卖）
            const pendingOrderMsg = chat.messages.slice().reverse().find(m => 
                (m.msgType === 'taobao_card' && m.taobaoData?.paymentState === 'unpaid' && m.isMe) ||
                (m.msgType === 'takeaway_card' && m.takeawayData?.paymentState === 'unpaid' && m.isMe)
            );
            
            if (pendingOrderMsg) {
                const isTakeaway = pendingOrderMsg.msgType === 'takeaway_card';
                const orderData = isTakeaway ? pendingOrderMsg.takeawayData : pendingOrderMsg.taobaoData;
                
                // 🌟 2. 潜入 Shopping 数据库，批量修改这个订单号的所有商品状态！
                if (typeof store !== 'undefined' && store.shoppingData && store.shoppingData.orders) {
                    store.shoppingData.orders.forEach(o => {
                        if (o.orderNum === orderData.orderNum && o.status === '未结账') {
                            o.status = o.type === 'food' ? '骑手赶往中' : '卖家已发货';
                            const payBase = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
                            o.deliveryTime = payBase + (o.type === 'food' ? 30*60*1000 : 2*24*60*60*1000); // 真正付款才开始倒计时！
                        }
                    });
                    if (window.actions?.saveStore) window.actions.saveStore();
                }
                
                // 🌟 3. 发送一张全新的、状态更新的“已付款”卡片到微信里
                if (isTakeaway) {
                    const newTakeawayData = JSON.parse(JSON.stringify(orderData));
                    newTakeawayData.paymentState = 'paid';
                    newTakeawayData.personalNote = '已代付：宝宝快吃，别饿坏了！'; // 覆盖备注
                    msgsToPush.push({ sender: currentSpeakerName, msgType: 'takeaway_card', text: `[已代付外卖]`, takeawayData: newTakeawayData });
                } else {
                    const newTaobaoData = JSON.parse(JSON.stringify(orderData));
                    newTaobaoData.paymentState = 'paid';
                    msgsToPush.push({ sender: currentSpeakerName, msgType: 'taobao_card', text: `[已代付订单]`, taobaoData: newTaobaoData });
                }
                
                // 附带一条专属系统提醒
                msgsToPush.push({
                    sender: 'system',
                    msgType: 'system',
                    text: `${char.name} 已为你代付了该订单`
                });
            }
            
            // 抹掉暗号文本
            remainingText = remainingText.replace(/\[付款\][:：]?\s*/g, '').trim();
          } else {
            let mType = 'text';
            if (type === '语音') mType = 'voice';
            if (type === '虚拟照片') mType = 'virtual_image';
            if (type === '定位') mType = 'location';
            
            msgsToPush.push({ 
                sender: currentSpeakerName, 
                msgType: mType, 
                text: content 
            });
        }
        
        remainingText = remainingAfterMatch;
        matched = true;
        continue;
    }

    // 4. 如果后面没有多媒体标签了，把剩下的普通文本切分开！
    if (!matched && remainingText.trim()) {
        if (isOffline) {
            let finalOfflineText = remainingText.trim();
            if (typeof codeBlocks !== 'undefined') {
                codeBlocks.forEach((code, idx) => {
                    finalOfflineText = finalOfflineText.replace(`__CODE_BLOCK_${idx}__`, `<br/><div class="mc-html-card my-2 w-full overflow-hidden">${code}</div><br/>`);
                });
            }
            msgsToPush.push({ msgType: 'text', text: finalOfflineText, sender: currentSpeakerName });
        } else {
            let parts = remainingText.split(/\r\n|\r|\n/).filter(p => p.trim());
            parts.forEach(p => {
                let textToPush = p;
                if (chat.isGroup) {
                    const gm = p.match(/^([^:：\[\]]{1,15})[:：]\s*(.*)$/);
                    if (gm) {
                        currentSpeakerName = gm[1].trim();
                        textToPush = gm[2].trim();
                        if (!textToPush) return; // 只有角色名没有内容，跳过
                    }
                }
                if (textToPush) {
                    const fragments = textToPush.split(/(\*[^*]+\*)/);
                    fragments.forEach(frag => {
                        const t = frag.trim();
                        if (!t) return;
                        let blockMatch = t.match(/__CODE_BLOCK_(\d+)__/);
                        if (blockMatch && typeof codeBlocks !== 'undefined') {
                            msgsToPush.push({ sender: currentSpeakerName, msgType: 'html_card', text: codeBlocks[parseInt(blockMatch[1])] });
                            return;
                        }
                        if (t.startsWith('*') && t.endsWith('*') && isCall)
                            msgsToPush.push({ sender: currentSpeakerName, msgType: 'action', text: t.slice(1, -1) });
                        else
                            msgsToPush.push({ sender: currentSpeakerName, msgType: 'text', text: t });
                    });
                }
            });
        }
        remainingText = '';
    }
}
        // ---------------- 🌟 5. 装配最终气泡，根治 ID 碰撞和时间错乱 ----------------
        let finalMsgs = [];
        let msgOffset = 0; 
        // 🌟 核心杀虫：强制把时间转换为纯数字！彻底杜绝字符串拼接产生的 NaN 渲染崩溃！
        let baseTime = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(); 

        msgsToPush.forEach((m) => {
          // 👇 🌟 HTML 卡片终极安检门：不管之前被错误识别成什么类型，只要含有占位符，强行恢复成网页卡片！
            if (m.text && typeof m.text === 'string') {
                let blockMatch = m.text.match(/__CODE_BLOCK_(\d+)__/);
                if (blockMatch && typeof codeBlocks !== 'undefined' && codeBlocks[parseInt(blockMatch[1])]) {
                    m.msgType = 'html_card';
                    m.text = codeBlocks[parseInt(blockMatch[1])];
                }
            }
          // 👇 🌟 真正执行“时间倒流”的撤回动作
            if (m.msgType === 'recall_action') {
                let targetMsg = null;
                // 1. 先尝试在刚刚生成的这一批新消息中寻找最后一句 AI 说的废话
                for (let j = finalMsgs.length - 1; j >= 0; j--) {
                    if (!finalMsgs[j].isMe && finalMsgs[j].msgType !== 'system' && finalMsgs[j].msgType !== 'recall_system') {
                        targetMsg = finalMsgs[j]; break;
                    }
                }
                // 2. 如果新消息里没有，说明它是要撤回历史记录里的上一句话
                if (!targetMsg) {
                    const aiMsgs = chat.messages.filter(msg => !msg.isMe && msg.msgType !== 'system' && msg.msgType !== 'recall_system');
                    if (aiMsgs.length > 0) targetMsg = aiMsgs[aiMsgs.length - 1];
                }
                // 执行爆破
                if (targetMsg) {
                    targetMsg.recalledText = targetMsg.text;
                    targetMsg.text = `${displayName} 撤回了一条消息`;
                    targetMsg.msgType = 'recall_system';
                    targetMsg.quote = null;
                }
                return; // 这个动作本身不需要变成气泡上屏，所以 return
            }

            // 👇 🌟 真正执行打电话动作
        if (m.msgType === 'call_action') {
            finalMsgs.push({
                id: baseTime + msgOffset++, 
                sender: 'system', 
                text: `${displayName}发起了${m.callType === 'video' ? '视频' : '语音'}通话`,
                isMe: false, source: 'wechat', isOffline: isOffline, msgType: 'system', time: cloudTime, timestamp: baseTime + msgOffset, isIntercepted: char.isBlocked
            });
            if (typeof wxState !== 'undefined') {
                wxState.pendingCallMsg = m.text || '';
                wxState.callType = m.callType;
                if (isActive) {
                    // 1. 如果你正好在这个聊天室，直接全屏弹出来电！
                    wxState.view = 'incomingCall'; 
                } else {
                    // 2. 如果你在别的界面，触发全局横幅通知！(🌟 修改为 store)
                    store.globalCallAlert = {
                        charId: char.id,
                        name: displayName,
                        avatar: char.avatar,
                        callType: m.callType
                    };
                }
                // 3. 无论你在哪，都让手机响起微信铃声！
                try { wxState.ringtone.src = store.appearance?.callSound || 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3'; wxState.ringtone.play(); } catch(e){}
            }
            return; 
        }
          finalMsgs.push({
                id: baseTime + msgOffset,
                sender: m.sender || char.name, // 🌟 必须传 ID，防止头像读取崩溃
                text: m.text,
                imageUrl: m.imageUrl,
                virtualImageText: m.virtualImageText,
                innerData: m.innerData,
                isMe: false,
                source: 'wechat',
                isOffline: isOffline,
                isCallMsg: isCall,
                msgType: m.msgType,
                transferData: m.transferData,
                transferState: m.transferState,
                reqState: m.reqState,
                takeawayData: m.takeawayData,
                taobaoData: m.taobaoData,
                time: cloudTime, 
                timestamp: baseTime + msgOffset, // 纯血统数字时间戳
                isIntercepted: char.isBlocked
            });
            msgOffset++; 
        });

                if (finalMsgs.length === 0 && !hasSystemAction) {
    const fallbackText = (replyText && replyText.trim()) ? replyText : 'AI 没有生成有效回复';
    // 🌟 朋友圈线程的报错信息：重定向到朋友圈动态里，不进聊天室！
    if (isMomentTask) {
        store.moments = store.moments || [];
        store.moments.push({
            id: Date.now() + sysMsgOffset++, senderId: char.id, senderName: char.name, avatar: char.avatar,
            text: `⚠️ 朋友圈生成失败: ${fallbackText}`,
            imageUrl: null, virtualImageText: null,
            time: cloudTime, timestamp: Date.now() + sysMsgOffset++, likes: [], comments: [],
            isError: true
        });
        if (typeof window.render === 'function' && wxState.view === 'moments') window.render();
        continue; // 已重定向到朋友圈，跳过后续聊天室逻辑
    }
    // 改为推入 finalMsgs，而不是直接 chat.messages.push
    finalMsgs.push({
        id: Date.now() + sysMsgOffset++,
        sender: char.name,
        text: `云端响应异常: ${fallbackText}`,
        isMe: false,
        source: 'wechat',
        isOffline: isOffline,
        msgType: 'text',
        time: cloudTime,
        timestamp: Date.now() + sysMsgOffset
    });
    hasSystemAction = true;
}

if (finalMsgs.length === 0 && !hasSystemAction) continue;

        // 🌟 砸碎引擎最终裁决：朋友圈线程的消息只允许提取朋友圈动态（上面已处理），绝不允许漏聊天气泡！
        if (shouldSmashChat) {
            console.log(`[砸碎引擎] 朋友圈线程消息已拦截，${finalMsgs.length} 条气泡被砸碎，不进入聊天窗口。`);
            continue;
        }

        // ==========================================
        // 🌟 核心分流引擎：精准拿捏 Render 时机
        // ==========================================
        const isUserWatchingChat = isActive && !document.hidden;

        // ==========================================
        // 🌟 iOS 生存第一法则：无论任何场景，先全量落袋到内存 + 持久化！
        //    绝不允许消息只存在于 JS 闭包的 setTimeout 里！
        // ==========================================
        chat.messages.push(...finalMsgs);
        // 🌟 立刻持久化到 IndexedDB，就算 iOS 下一秒杀页面也不怕！
        if (window.DB) {
            window.DB.set(JSON.parse(JSON.stringify(store))).catch(e => console.warn('紧急落盘失败:', e));
        }

        // 执行跨聊天室注入：char 冒充 user 给 target 发消息
        if (pendingCrossChat) {
            const targetChar = store.contacts.find(c => c.name === pendingCrossChat.target || c.id === pendingCrossChat.target);
            if (targetChar && targetChar.id !== chatId) {
                let targetChat = store.chats.find(c => c.charId === targetChar.id);
                if (!targetChat) {
                    targetChat = { id: 'chat_' + Date.now(), charId: targetChar.id, messages: [], boundPersonaId: store.personas[0].id };
                    store.chats.push(targetChat);
                }
                const tpId = targetChat.boundPersonaId || store.personas[0].id;
                const tPersona = store.personas.find(p => p.id === tpId) || store.personas[0];
                targetChat.messages.push({
                    id: Date.now() + 8000,
                    sender: tPersona.name,
                    text: pendingCrossChat.text,
                    isMe: true,
                    source: 'wechat', isOffline: false, msgType: 'text',
                    time: getNowTime(), timestamp: Date.now() + 8000
                });
                chat.messages.push({
                    id: Date.now() + 8001,
                    sender: 'system',
                    text: `${char.name} 冒充你给【${targetChar.name}】发了一条消息："${pendingCrossChat.text}"`,
                    isMe: false, source: 'wechat', msgType: 'system',
                    time: getNowTime(), timestamp: Date.now() + 8001
                });
                if (window.DB) window.DB.set(JSON.parse(JSON.stringify(store))).catch(() => {});
                setTimeout(() => {
                    if (typeof window.wxActions?.getReply === 'function') {
                        window.wxActions.getReply(true, null, '(系统提示：你刚刚收到了一条消息，请自然地回复，保持人设，不输出任何系统标签。)', null, targetChar.id, false);
                    }
                }, 2000 + Math.random() * 3000);
            }
            pendingCrossChat = null;
        }

        // 偷看手机概率触发：每次收到正常回复后随机触发（冷却120秒，防止偷看回复再触发）
        if (!chat.isGroup && !isAutoTask && !isMomentTask && char.canPeekPhone) {
            const prob = (char.peekPhoneProb || 15) / 100;
            const lastPeek = (window.wxPeekCooldowns || {})[chatId] || 0;
            const cooledDown = Date.now() - lastPeek > 7200000;
            if (cooledDown && Math.random() < prob) {
                const delay = 8000 + Math.random() * 20000;
                setTimeout(() => {
                    if (typeof window.wxActions?.triggerPhonePeek === 'function') {
                        window.wxActions.triggerPhonePeek(chatId);
                    }
                }, delay);
            }
        }

        if (!isUserWatchingChat) {
            // 【场景 2 & 3】：用户不在聊天室，或者切到后台了

            // 1. 增加未读红点
            chat.unreadCount = (chat.unreadCount || 0) + finalMsgs.length;
            try { new Audio(store.appearance?.newMsgSound || ' ').play().catch(()=>{}); } catch(e) {}

            // 2. 决定是否 Render (千万别打扰别的页面)
            if (typeof wxState !== 'undefined' && wxState.view === 'main') {
                // 【场景 2】：人在消息列表，需要红点跳一下！
                if (typeof window.render === 'function') window.render();
            } else {
                // 【场景 3】：人在朋友圈/通讯录，默默数数，绝对不 render 打扰！
            }

            // 3. 后台默默去处理通话语音（隐形闭包，不阻塞）
            (async () => {
                for (let i = 0; i < finalMsgs.length; i++) {
                    const newMsg = finalMsgs[i];
                    let senderChar = char;
                    if (newMsg.sender && typeof newMsg.sender === 'string') {
                        let found = store.contacts.find(c => c.name === newMsg.sender || c.id === newMsg.sender);
                        if (found) senderChar = found;
                    }

                    if (isCall && newMsg.msgType === 'text' && senderChar.minimaxVoiceId && store.minimaxConfig?.enabled !== false) {
                        const url = await fetchMinimaxVoice(newMsg.text, senderChar.minimaxVoiceId);
                        if (url && typeof wxState !== 'undefined' && wxState.view === 'call') {
                            newMsg.audioUrl = url;
                            playCallAudio(url);
                        }
                    }
                }
            })();

        } else {
            // 【场景 1】：用户就盯着这个聊天室！数据已落袋，现在做逐条冒出的视觉动画！
            if (typeof wxState !== 'undefined' && wxState.typingStatus) wxState.typingStatus[chatId] = false;

            // 🌟 用纯内存 Set 记录待揭示的消息 ID（不污染消息对象，永远不会被持久化到 IndexedDB）
            const revealIds = finalMsgs.map(m => m.id);
            revealIds.forEach(id => wxState.revealingMsgIds.add(id));
            // 先 render 一次确保 UI 干净（Set 里的消息不渲染）
            if (typeof window.render === 'function') window.render();

            (async () => {
                for (let i = 0; i < revealIds.length; i++) {
                    // 🌟 iOS 生存检查：如果页面被隐藏（切到后台），立即停止渲染循环，防止内存爆炸
                    if (document.hidden) {
                        // 批量清空剩余的待揭示消息，避免下次切回来时重复渲染
                        for (let j = i; j < revealIds.length; j++) {
                            wxState.revealingMsgIds.delete(revealIds[j]);
                        }
                        break;
                    }

                    const msgId = revealIds[i];
                    const newMsg = chat.messages.find(m => m.id === msgId);
                    if (!newMsg) break; // 防御性检查

                    // 1. 从 Set 中移除，揭开这条消息
                    wxState.revealingMsgIds.delete(msgId);

                    // 2. 出来一条就 Render 一下！画面稳稳跟上！
                    if (typeof window.render === 'function') window.render();
                    if (window.wxActions && window.wxActions.scrollToBottom) window.wxActions.scrollToBottom();

                    // 3. 叮咚提示音（非电话状态）
                    if (!isCall && newMsg.msgType !== 'system' && newMsg.msgType !== 'recall_system') {
                        try { new Audio(store.appearance?.newMsgSound || ' ').play().catch(()=>{}); } catch(e) {}
                    }

                    // 4. 通话语音处理
                    let senderChar = char;
                    if (newMsg.sender && typeof newMsg.sender === 'string') {
                        let found = store.contacts.find(c => c.name === newMsg.sender || c.id === newMsg.sender);
                        if (found) senderChar = found;
                    }
                    let callAudioPlayed = false;
                    if (isCall && newMsg.msgType === 'text' && senderChar.minimaxVoiceId && store.minimaxConfig?.enabled !== false) {
                        const url = await fetchMinimaxVoice(newMsg.text, senderChar.minimaxVoiceId);
                        if (url && typeof wxState !== 'undefined' && wxState.view === 'call') {
                            newMsg.audioUrl = url;
                            playCallAudio(url);
                            callAudioPlayed = true;
                            if (typeof window.render === 'function') window.render();
                        }
                    }

                    // 5. 核心魔法：停顿 0.8 秒，给你完美的打字感
                    if (i < revealIds.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, callAudioPlayed ? 300 : 800));
                    }
                }
            })();
        }
        
        // 🌟 继续巡逻
        setTimeout(() => { if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(chatId); }, 2000);
    }
  } catch (e) { 
      console.error('同步信箱失败:', e);
      // 🌟 物理屏蔽：如果仅仅是切后台导致的网络波动断连，直接静默退出！绝不弹窗打扰！
      if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'))) {
          return; 
      } 
      
      // 🌟 1. 翻译天书报错，转化为人类听得懂的 UI 弹窗！
      let errMsg = '云端同步失败，请检查网络或服务端状态。';
      if (e.message && (e.message.includes('Unexpected token') || e.message.includes('JSON'))) {
          errMsg = '云端返回了乱码 (大模型抽风或服务器 502 拥堵)，请稍后再试或重Roll。';
      } else if (e.message && e.message.includes('Failed to fetch')) {
          errMsg = '无法连接到云端服务器，请检查后端是否存活。';
      }

      // 🌟 2. 物理斩杀所有卡死的“输入中”状态！绝对不能让用户干等！
      if (typeof wxState !== 'undefined' && wxState.typingStatus) {
          Object.keys(wxState.typingStatus).forEach(k => wxState.typingStatus[k] = false);
      }
      
      // 🌟 3. 强制刷新界面，把死掉的 UI 救回来
      if (typeof window.render === 'function') window.render();
      
  } finally { 
      window.isSyncingMailbox = false; 
  }
};

window.checkAutoMsg = async () => {}; 
setInterval(window.syncCloudMailbox, 5000); // 🌟 加快信箱拉取频率，告别慢半拍！ 
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.syncCloudMailbox(); });
window.addEventListener('load', () => { setTimeout(window.syncCloudMailbox, 2000); });

// ==========================================================
// 🌟 究极唤醒装甲：彻底解决“网页不刷新、永远输入中”的死局
// 请务必将这段代码直接放在 wechat.js 的最底部！
// ==========================================================

// 🚀 引擎 1：主动心跳轮询 (每 4 秒强制看一眼信箱，无视挂机)
if (!window.mailboxHeartbeat) {
    window.mailboxHeartbeat = setInterval(() => {
        if (typeof window.syncCloudMailbox === 'function') {
            window.syncCloudMailbox();
        }
    }, 4000); // 4000 毫秒 = 4 秒极速轮询
}

// 🚀 引擎 2：后台推送物理监听 (只要 Service Worker 收到通知，立刻踹醒网页)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', () => {
        console.log('[系统] 侦测到后台推送信号，强制唤醒信箱！');
        if (typeof window.syncCloudMailbox === 'function') window.syncCloudMailbox();
    });
}

// 🚀 引擎 3：屏幕复活侦测 (当你从别的 App 切回网页，或者手机解锁亮屏时，瞬间拉取)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && typeof window.syncCloudMailbox === 'function') {
        console.log('[系统] 屏幕已亮起，极速拉取最新消息！');
        window.syncCloudMailbox();
    }
});