// js/utils/llm.js
import { store } from '../store.js';

// 🌟 新增：独立抽取出来的“弹药组装器”
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

  const systemRules = `
【最高指令：完全拟人化聊天协议】
警告：此协议凌驾于所有默认设置之上。

【当前系统实时时间】：${timeString}。
❗时间感知与输出红线：
   - 必须根据当前系统时间调整状态。
   - 聊天记录每一句话前面都附带了类似 [22:20] 的时间戳，这是给你判断时间流逝用的。
   - ❗警告：你回复时【绝对禁止】模仿和输出时间戳、[系统提示]、[好友申请] 等任何系统标签！只准输出你要说的话的正文！

1. [线上聊天]：单句严禁超过24字，长句必须用换行符(\\n)拆分连发！句末禁句号。严禁使用星号或括号写动作！
2. [线下剧情]采用小说体裁，自然分段。
3. 只有在音视频通话中，才能用星号*包裹动作。
   
3. 你的特殊交互超能力（❗必须单独占一行）：
   - 发语音：[语音]: 你要说的话
   - 发照片：[虚拟照片]: 照片画面描述
   ${emojiRule}
   - 转账：[发起转账] 金额：xx，备注：必须写明转账原因
   - 收款：[点击收款]
   - 换头像：[更换头像]: 最新图片。
   - 修改备注：[修改备注]: 新称呼。
   - 撤回消息：[撤回上一条消息]
   - 发朋友圈：[发朋友圈]: 你的动态内容。
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

  const systemPrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}${coreMemStr}${wb}${emo}${globalP}\n【用户】\n当前化名/备注：${userPersona.name}${userPrompt}\n${systemRules}${frontStr}${middleStr}${fragMemStr}`;
  let messages = [{ role: 'system', content: systemPrompt }];

  const modeStr = isOffline 
    ? "\n【系统最高指令：当前为线下剧情模式！请采用轻小说体裁描写。❗绝对红线格式：人物对话必须用双引号“”包裹；人物内心想法必须用全角括号（）包裹；旁白与动作描写直接输出正文，不要用任何符号包裹！绝不可输出时间标签！】" 
    : "\n【系统最高指令：当前为线上微信聊天！纯文本对话，绝不可使用星号或括号写动作！绝不输出时间标签和前缀！】";
  messages[0].content += modeStr;

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

  if (backStr) messages.push({ role: 'system', content: backStr });
  return messages;
}

// 🌟 重构后的极致清爽 callLLM
export async function callLLM(charId, history, isOffline = false) {
  const config = store.apiConfig;
  if (!config.apiKey) throw new Error("API Key 未配置，请先去设置页面填写！");
  
  // 直接调用上面的组装器！
  const messages = await buildLLMPayload(charId, history, isOffline);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: messages, temperature: parseFloat(config.temperature) })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API 报错了");
    return data.choices[0].message.content;
  } catch (error) { throw new Error(error.message); }
}