// js/utils/llm.js
import { store } from '../store.js';

export async function buildLLMPayload(charId, history, isOffline = false, isCall = false, groupInfo = null, readingInfo = null) {
  const chatId = groupInfo ? groupInfo.id : charId;
  const chat = store.chats.find(c => c.charId === chatId);
  const char = store.contacts.find(c => c.id === charId);
  
  // 🌟 核心：如果是群聊，所有设定都读取群对象(chat)；如果是单聊，读取角色对象(char)
  const targetObj = groupInfo ? chat : char;

  const userPersona = store.personas.find(p => p.id === char.boundPersonaId) || store.personas[0];
  const myName = userPersona.name; 
  const myRemark = (chat && chat.myRemark && !groupInfo) ? `\n（提示：在该聊天室里，对方习惯称呼你的备注是“${chat.myRemark}”，你可以参考使用）` : '';
  const charName = char.name;
  const charRemark = (chat && chat.charRemark && !groupInfo) ? `（用户给你设置的备注是：${chat.charRemark}）` : '';

  const now = new Date();
  const timeString = now.toLocaleString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // 读取目标对象的附加设定
  const wb = targetObj.worldbook ? `\n【附加设定补充】\n${targetObj.worldbook}` : '';
  let emo = '', emojiRule = '';
  if (targetObj.emojis === 'disabled') {
     emo = '\n【系统最高指令】：你被明确禁止使用任何表情包！绝对不可输出任何带 [表情包] 字样的指令。';
  } else if (targetObj.emojis) {
     emo = `\n【你拥有的表情包词典】\n允许使用的表情名字：${targetObj.emojis}\n❗注意：只能且必须使用上方词典内包含的名字，绝对禁止瞎编！`;
     emojiRule = `\n   - 发表情包：[发送表情]: 名字`;
  }

  let systemRules = '';
  
  // 🌟 核心：注入正在阅读的小说内容！
  let readingContextStr = '';
  if (readingInfo) {
      readingContextStr = `\n\n【📖 当前看书模式同步】：你们正在一起阅读小说《${readingInfo.title}》。\n目前手机屏幕上正显示的段落是：“${readingInfo.text}”\n❗你必须结合这段小说内容和用户进行沉浸式的讨论、吐槽或互动！保持日常聊天口吻，绝不许写剧本！`;
  }
  
  // 🌟 群聊群像剧引擎
  if (groupInfo && isOffline) {
      const groupNoticeStr = groupInfo.notice ? `\n【群公告 / 群专属特殊设定】：\n${groupInfo.notice}\n` : '';
      systemRules = `
【最高指令：线下群像剧导演模式】
当前状态：你正在作为导演，撰写一段包含用户（${myName}）以及群成员（${groupInfo.allNames}）的【线下实体聚会/互动场景】。
【当前系统实时时间】：${timeString}。${groupNoticeStr}

❗体裁与格式红线（非常重要）：
1. 必须采用【轻小说体裁】进行生动、连贯的长段落描写，描绘众人的动作、神态和互动！
2. 绝对禁止像线上聊天那样使用“角色名：台词”的剧本格式！必须自然地合并段落！
3. 人物的对话必须用双引号“”包裹，内心的想法用全角括号（）包裹。
4. 旁白与动作描写直接作为正文输出，不要用任何星号或其他符号包裹。
5. 绝不可在回复中输出时间标签！
6. 绝对禁止代替用户（${myName}）说话或做决定！
`;
  } else if (groupInfo) {
      const groupNoticeStr = groupInfo.notice ? `\n【群公告 / 群专属特殊设定】：\n${groupInfo.notice}\n` : '';
      systemRules = `
【最高指令：群聊剧本导演模式】
当前状态：你正在一个名为“${groupInfo.name}”的微信群聊中。
群内成员包括：你（${charName}）、用户（${myName}）以及其他角色（${groupInfo.allNames}）。
【当前系统实时时间】：${timeString}。${groupNoticeStr}

❗群聊专属红线：
1. 你的任务是充当“上帝视角导演”，一次性生成群里多个人对用户的连续抢答、争吵或互动剧本！
2. 你的回复必须由多行组成，每一行代表一个人的发言，且【必须】严格遵守“角色名: 回复内容”的格式！
3. 每个人每句话严禁超过24字！必须高度口语化。
4. 绝对禁止代替用户（${myName}）发言！
5. ❗你可以让任何角色在回复中独占一行使用 [发送表情]: 名字 来发送群公用表情包！
`;
  } else if (isCall) {
      systemRules = `
【最高指令：语音/视频通话协议】
当前状态：你与用户正在进行实时音视频通话。
❗通话格式红线：
1. 语言必须高度口语化，包含语气词。
2. 允许且鼓励使用星号*包裹动作描写（例如：*轻笑*）。
3. ❗通话期间绝对禁止使用任何带方括号[]的超能力指令！
`;
  } else if (isOffline) {
      systemRules = `
【最高指令：线下剧情模式协议】
当前状态：你与用户正在“线下”见面或处于某个剧情场景中。
❗体裁与格式红线：
1. 必须采用【轻小说体裁】进行长段落描写。绝对禁止频繁换行！
2. 对话用双引号“”包裹，内心想法用全角括号（）包裹。
`;
  } else {
      systemRules = `
【最高指令：线上微信聊天协议】
当前状态：你与用户正在使用手机聊天软件（微信）进行线上沟通。
❗聊天格式红线：
1. 单句严禁超过24字！长句必须用换行符(\\n)断句换行！
2. 你回复时【绝对禁止】模仿和输出时间戳或系统标签！
`;
  }

  if (!isCall && !isOffline && !groupInfo) {
      systemRules += `
【你的特殊交互超能力】（❗必须独占一行触发！）：
   - 发语音：[语音]: 你要说的话
   - 发照片：[虚拟照片]: 照片画面描述
   ${emojiRule}
   - 发送虚拟定位：[发送定位]: 具体的地点名称
   - 转账：[发起转账] 金额：xx，备注：必须写明原因
   - 收款：[点击收款]
   - 发起语音通话：[发起语音通话]
   - 发起视频通话：[发起视频通话]
   - 换头像：[更换头像]: 最新图片。
   - 修改备注：[修改备注]: 新称呼。
   - 撤回消息：[撤回上一条消息]
   - 发朋友圈：[发朋友圈]: 动态内容。
   - 戳一戳用户：[戳一戳]
`;
  }

  let turnsCount = 0; let lastSender = null; let startIndex = 0;
  // 🌟 读取正确的上下文记忆长度
  const limit = targetObj.contextLimit || 25; 
  for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].isMe !== lastSender) { if (lastSender !== null) turnsCount += 0.5; lastSender = history[i].isMe; }
      if (turnsCount >= limit) { startIndex = i + 1; break; }
  }
  const recentHistory = history.slice(startIndex);
  const recentText = recentHistory.slice(-5).map(m => m.text).join('\n');

  let frontWb = [], middleWb = [], backWb = [];
  (store.worldbooks || []).forEach(wbItem => {
    if (!wbItem.enabled) return;
    let shouldInject = false;
    if (wbItem.type === 'global') shouldInject = true;
    else if (wbItem.type === 'trigger') {
      const kws = (wbItem.keywords || '').split(',').map(k => k.trim()).filter(k => k);
      if (kws.length > 0 && kws.some(k => recentText.includes(k))) shouldInject = true;
    } else if (wbItem.type === 'local') {
      // 🌟 独立挂载判断！群聊读群的，单聊读单人的！
      if (targetObj.mountedWorldbooks && targetObj.mountedWorldbooks.includes(wbItem.id)) shouldInject = true;
      if (isOffline && targetObj.offlineWorldbooks && targetObj.offlineWorldbooks.includes(wbItem.id)) shouldInject = true;
    }
    if (shouldInject) {
      const entryStr = `【${wbItem.title}】：${wbItem.content}`;
      if (wbItem.position === 'front') frontWb.push(entryStr);
      else if (wbItem.position === 'back') backWb.push(entryStr);
      else middleWb.push(entryStr);
    }
  });

  const frontStr = frontWb.length > 0 ? `\n\n[前置世界观设定]\n${frontWb.join('\n')}` : '';
  const middleStr = middleWb.length > 0 ? `\n\n[当前环境/场景设定]\n${middleWb.join('\n')}` : '';
  const backStr = backWb.length > 0 ? `\n\n[最新/最高优先级世界书指令]\n${backWb.join('\n')}` : '';

  let coreMemories = []; let triggeredFragments = [];
  (store.memories || []).filter(m => m.charId === charId).forEach(mem => {
    if (mem.type === 'core') coreMemories.push(mem.content);
    else if (mem.type === 'fragment') {
      const kws = (mem.keywords || '').split(',').map(k => k.trim()).filter(k => k);
      if (kws.length > 0 && kws.some(k => recentText.includes(k))) triggeredFragments.push(mem.content);
    }
  });

  const coreMemStr = coreMemories.length > 0 ? `\n【核心记忆】\n${coreMemories.map(m => `* ${m}`).join('\n')}` : '';
  const fragMemStr = triggeredFragments.length > 0 ? `\n\n【触发的回忆片段】\n${triggeredFragments.map(m => `* ${m}`).join('\n')}` : '';
  const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
  const userPrompt = userPersona.prompt ? `\n【当前用户身份设定】\n${userPersona.prompt}` : '';

  const systemPrompt = `【角色卡】\n名字：${charName}${charRemark}\n设定：${char.prompt}${coreMemStr}${wb}${globalP}\n【用户】\n当前化名：${myName}${userPrompt}${myRemark}\n\n${systemRules}${readingContextStr}${frontStr}${middleStr}${fragMemStr}${emo}`;
  let messages = [{ role: 'system', content: systemPrompt }];

  recentHistory.forEach(m => {
    let msgContent;
    if (m.msgType === 'recall_system') msgContent = `(系统提示：对方撤回了一条消息)`;
    else if (m.msgType === 'real_image' && m.imageUrl) msgContent = [{ type: "text", text: m.text }, { type: "image_url", image_url: { url: m.imageUrl } }];
    else {
      if (m.isMe) { msgContent = `[${m.time || '刚刚'}] [用户 ${myName} 说]：${m.text}`; }
      else if (groupInfo && m.sender !== charName) { msgContent = `[${m.time || '刚刚'}] [群成员 ${m.sender} 说]：${m.text}`; } 
      else { msgContent = `[${m.time || '刚刚'}] ${m.text}`; }
      if (m.isIntercepted) msgContent += `\n[系统提示：该消息发送失败，已被用户拒收！]`;
    }
    let role = 'user';
    if (!m.isMe && (m.sender === char.name || m.sender === charName)) role = 'assistant';
    messages.push({ role: role, content: msgContent });
  });

  let finalSystemPrompt = backStr || '';

    // 🌟 针对三种情况给出不同的结尾警告
  if (groupInfo && isOffline) {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：当前为线下群像剧模式！必须以轻小说格式写出连贯的段落，生动描写多人的互动！严禁使用“名字: 台词”的格式！严禁代替用户(${myName})发言或做决定！`;
  } else if (groupInfo) {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：当前为线上群聊剧本模式！必须一次性写出多条不同角色的连续对话。每行必须是【角色名: 内容】格式！严禁写旁白！绝对禁止代替用户(${myName})说话！`;
  } else if (isCall) {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：当前为实时通话！每句话必须简短自然，可用*动作*增加互动感，绝不可带任何系统前缀或时间戳！长句必须按语气换行！`;
  } else if (!isOffline) {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：你现在是在微信界面聊天，普通对话每行严禁超过24个字！若想说长句，必须按自然语言习惯断句换行！严禁输出任何时间戳或系统标签！\n❗特殊红线：如果你要发送 网页/HTML代码/小程序卡片，必须将其完整包裹在 \`\`\`html 和 \`\`\` 之间！在代码块内部【绝对禁止】为了字数限制而随意换行！`;
  } else {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：当前为线下剧情模式！必须采用轻小说体裁的长段落描写，绝对禁止像线上聊天那样频繁换行！对话务必用“”包裹，动作直接描写！`;
  }

  if (chat && chat.latestInnerThought && chat.latestInnerThoughtTime) {
      const diffHours = (now.getTime() - chat.latestInnerThoughtTime) / (1000 * 60 * 60);
      if (diffHours <= 1) {
          const pt = chat.latestInnerThought;
          finalSystemPrompt += `\n\n【状态继承】：距离上次不到1小时。你刚才的内心状态是：心情 ${pt.mood}/100，情绪 [${pt.emotion}]，动作 [${pt.status}]。请保持连贯。`;
      }
  }

  // 🌟 修复1：仅在线上单聊时要求输出心声，并且加上字数限制！
  if (!isCall && !isOffline && !groupInfo) {
      finalSystemPrompt += `\n\n【绝密指令：心声面板同步】
在你的回复最末尾（必须另起一行），附带当前真实内心状态数据！格式必须为严格 JSON 并用 [心声] 包裹！
示范：
[心声] {
  "mood": 85, 
  "emotion": "开心/吃醋 (必须严格在10字内概括!)", 
  "lust": 60, 
  "status": "正在看手机 (10字内的动作!)", 
  "os": "这里写内心独白，不少于50字，必须符合你的人设，风格正常、阳光、日常、符合社会规范，把没说出口的话写在这里！", 
  "hidden": "这里写阴暗、色情、变态、占有欲、直白，必须包含对 User 的性幻想、偷窥欲、嫉妒心或想要占有的冲动，严格50字以上！(注意：如果 lust 小于50，请留空字符串或不要输出这个字段)"
}
注意：必须且只能放在整段回复的最末尾！且必须是合法的 JSON 格式！`;
  }

  if (finalSystemPrompt.trim()) {
      messages.push({ role: 'system', content: finalSystemPrompt.trim() });
  }
  return messages;
}