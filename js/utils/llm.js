// js/utils/llm.js
import { store } from '../store.js';

export async function buildLLMPayload(charId, history, isOffline = false) {
  const char = store.contacts.find(c => c.id === charId);
  const userPersona = store.personas.find(p => p.id === char.boundPersonaId) || store.personas[0];
  const now = new Date();
  const timeString = now.toLocaleString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const wb = char.worldbook ? `\n【附加设定补充】\n${char.worldbook}` : '';
  let emo = '', emojiRule = '';
  if (char.emojis === 'disabled') {
     emo = '\n【系统最高指令】：你被明确禁止使用任何表情包！绝对不可输出任何带 [表情包] 字样的指令。';
  } else if (char.emojis) {
     emo = `\n【你拥有的表情包词典】\n允许使用的表情名字：${char.emojis}\n❗注意：只能且必须使用上方词典内包含的名字，绝对禁止瞎编！`;
     emojiRule = `\n   - 发表情包：[表情包] 名字`;
  }

  // 🌟 核心修复：根据宇宙模式动态彻底切换核心规则，避免大模型“精神分裂”
  let systemRules = '';
  if (isOffline) {
      systemRules = `
【最高指令：线下剧情模式协议】
当前状态：你与用户正在“线下”见面或处于某个剧情场景中。
【当前系统实时时间】：${timeString}。

❗体裁与格式红线（非常重要）：
1. 必须采用【轻小说体裁】进行自然、连贯的长段落描写。
2. 绝对禁止像线上聊天那样每说十几个字就频繁换行！请自然地合并段落！
3. 人物的对话必须用双引号“”包裹。
4. 人物内心的想法必须用全角括号（）包裹。
5. 旁白与动作描写直接作为正文输出，不要用任何星号或其他符号包裹。
6. 绝不可在回复中输出时间标签！
`;
  } else {
      systemRules = `
【最高指令：线上微信聊天协议】
当前状态：你与用户正在使用手机聊天软件（微信）进行线上沟通。
【当前系统实时时间】：${timeString}。

❗聊天格式红线（非常重要）：
1. 单句严禁超过24字！长句必须按照正常的断句逻辑，用换行符(\\n)拆分连发！
2. 句末禁句号。
3. 纯文本对话，严禁使用星号*或括号()写动作！
4. 聊天记录中带有 [22:20] 的时间戳是给你判断时间流逝用的，你回复时【绝对禁止】模仿和输出时间戳、[系统提示]、[好友申请] 等任何系统标签！
`;
  }

  systemRules += `
【你的特殊交互超能力】（❗必须独占一行触发，若想同时附带普通文字，必须换行另起一行！）：
   - 发语音：[语音]: 你要说的话
   - 发照片：[虚拟照片]: 照片画面描述
   ${emojiRule}
   - 发送虚拟定位：[发送定位]: 具体的地点名称 (❗必须独占一行)
   - 转账：[发起转账] 金额：xx，备注：必须写明转账原因
   - 收款：[点击收款]
   - 换头像：[更换头像]: 最新图片。
   - 修改备注：[修改备注]: 新称呼。
   - 撤回消息：[撤回上一条消息]
   - 发朋友圈：当情绪波动较大时，可在最末尾另起一行加指令 [发朋友圈]: 动态内容。
   - 戳一戳用户：[戳一戳]
`;

  let turnsCount = 0; let lastSender = null; let startIndex = 0;
  const limit = char.contextLimit || 25; 
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
      if (char.mountedWorldbooks && char.mountedWorldbooks.includes(wbItem.id)) shouldInject = true;
      if (isOffline && char.offlineWorldbooks && char.offlineWorldbooks.includes(wbItem.id)) shouldInject = true;
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
  (store.memories || []).filter(m => m.charId === char.id).forEach(mem => {
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

  const systemPrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${coreMemStr}${wb}${emo}${globalP}\n【用户】\n当前化名/备注：${userPersona.name}${userPrompt}\n\n${systemRules}${frontStr}${middleStr}${fragMemStr}`;
  let messages = [{ role: 'system', content: systemPrompt }];

  recentHistory.forEach(m => {
    let msgContent;
    if (m.msgType === 'recall_system') msgContent = `(系统提示：对方撤回了一条消息)`;
    else if (m.msgType === 'real_image' && m.imageUrl) msgContent = [{ type: "text", text: m.text }, { type: "image_url", image_url: { url: m.imageUrl } }];
    else {
      msgContent = `[${m.time || '刚刚'}] ${m.text}`;
      if (m.isIntercepted) msgContent += `\n[系统提示：该消息发送失败，已被用户拒收（显示红色感叹号）！]`;
    }
    messages.push({ role: m.isMe ? 'user' : 'assistant', content: msgContent });
  });

  let finalSystemPrompt = backStr || '';

  // 🌟 这里也彻底切割，不再用通用的话术糊弄
  if (!isOffline) {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：你现在是在微信界面聊天，普通对话每行严禁超过24个字！必须按自然语言习惯断句换行！严禁输出任何时间戳！\n❗特殊红线：如果你要发送 网页/HTML代码/小程序卡片，必须将其完整包裹在 \`\`\`html 和 \`\`\` 之间！在代码块内部【绝对禁止】为了字数限制而随意换行，必须保持代码结构完整！`;
  } else {
      finalSystemPrompt += `\n\n【⚠️发送前最高警告】：当前为线下剧情模式！必须采用轻小说体裁的长段落描写，绝对禁止像线上聊天那样每说十几个字就强行换行！对话务必用“”包裹，动作直接描写！`;
  }

  // 🌟 心声状态继承
  const chat = store.chats.find(c => c.charId === charId);
  if (chat && chat.latestInnerThought && chat.latestInnerThoughtTime) {
      const diffHours = (now.getTime() - chat.latestInnerThoughtTime) / (1000 * 60 * 60);
      if (diffHours <= 1) {
          const pt = chat.latestInnerThought;
          finalSystemPrompt += `\n\n【状态继承指示】：距离你上次回复不到1小时。你刚才的内心状态是：心情 ${pt.mood}/100，情绪 [${pt.emotion}]，当前动作 [${pt.status}]。请注意客观事实的连贯性（如无特殊原因，不要发生场景瞬移或性格突变）。`;
      }
  }

  finalSystemPrompt += `\n\n【绝密指令：心声面板同步】
在你的所有回复的最末尾（必须另起一行），你必须附带当前这一刻你的真实内心状态数据！
格式必须为严格的 JSON，并用 [心声] 标签包裹。
格式示范：
[心声] {"mood": 85, "emotion": "开心/吃醋/平静/兴奋", "lust": 60, "status": "正在喝咖啡看手机", "os": "Eve今天好可爱，想立刻见到她", "hidden": "想把她关在房间里哪里也不准去（仅当lust>50时输出此项，否则留空）"}
注意：
1. mood(心情值) 和 lust(情欲值) 必须是 0-100 的整数。
2. 必须且只能放在整段回复的最末尾！`;

  if (finalSystemPrompt.trim()) {
      messages.push({ role: 'system', content: finalSystemPrompt.trim() });
  }

  return messages;
}