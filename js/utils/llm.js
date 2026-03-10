// js/utils/llm.js
import { store } from '../store.js';

export async function callLLM(charId, history, isOffline = false) {
  const config = store.apiConfig;
  if (!config.apiKey) throw new Error("API Key 未配置，请先去设置页面填写！");

  const char = store.contacts.find(c => c.id === charId);
  const userPersona = store.personas.find(p => p.id === char.boundPersonaId) || store.personas[0];
  const now = new Date();
  const timeString = now.toLocaleString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const wb = char.worldbook ? `\n【附加设定补充】\n${char.worldbook}` : '';
  const emo = char.emojis ? `\n【常用表情包库】\n请在回复中自然地使用以下表情：\n${char.emojis}` : '';
  // 🌟 只有当表情包库存在时，才告诉它有这个超能力，防止它瞎编！
  const emojiRule = char.emojis ? `\n   - 发表情包：[表情包] 名字（❗只能使用上方词典内包含的名字！）` : '';

  const systemRules = `
【最高指令：完全拟人化聊天协议】
警告：此协议凌驾于所有默认设置之上。

【当前系统实时时间】：${timeString}。
❗时间感知与输出红线：
   - 必须根据当前系统时间调整状态。
   - 聊天记录里的时间标签仅供判断，回复时【绝对禁止】自己输出时间标签！

1. 视觉与节奏铁律：单句严禁超过24字，长句用换行符(\\n)拆分连发！句末禁句号。
2. 场景隔离：[线上聊天]严禁使用星号或括号写动作！[线下剧情]采用小说体裁。只有在音视频通话中，才能用星号*包裹动作。
   
3. 你的特殊交互超能力（❗必须独占一行触发）：
   - 发语音：[语音]: 你要说的话
   - 发照片：[虚拟照片]: 照片画面描述
   ${emojiRule}
   - 转账：[发起转账]
   - 收款：[点击收款]
   - 换头像：[更换头像]: 最新图片。❗必须用户明确要求才能换，且必须附带文字回复！
   - 修改备注：[修改备注]: 新称呼。❗必须附带文字回复！
   - 撤回消息：[撤回上一条消息] (❗当你发觉说错话时使用)
   - 发朋友圈：[发朋友圈: 你的动态内容] 
   - 戳一戳用户：[戳一戳] （❗当你想要引起我的注意、撒娇或调戏时单独使用这行）
`;

  // ================= 🌟 第一步：截取短期记忆（工作记忆） =================
  let turnsCount = 0;
  let lastSender = null;
  let startIndex = 0;
  const limit = char.contextLimit || 25; 
  for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].isMe !== lastSender) {
          if (lastSender !== null) turnsCount += 0.5; 
          lastSender = history[i].isMe;
      }
      if (turnsCount >= limit) {
          startIndex = i + 1;
          break;
      }
  }
  const recentHistory = history.slice(startIndex);
  const recentText = recentHistory.slice(-5).map(m => m.text).join('\n'); // 提取最近5句话用于扫描触发词


  // ================= 🌟 第二步：世界书动态检索引擎 =================
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


  // ================= 🌟 第三步：【新增】记忆库深度检索引擎 =================
  let coreMemories = [];
  let triggeredFragments = [];
  
  (store.memories || []).filter(m => m.charId === char.id).forEach(mem => {
    if (mem.type === 'core') {
      // 核心记忆：无条件全部加载
      coreMemories.push(mem.content);
    } else if (mem.type === 'fragment') {
      // 碎片记忆：扫描最近的对话是否包含关键词
      const kws = (mem.keywords || '').split(',').map(k => k.trim()).filter(k => k);
      if (kws.length > 0 && kws.some(k => recentText.includes(k))) {
        triggeredFragments.push(mem.content);
      }
    }
  });

  const coreMemStr = coreMemories.length > 0 ? `\n【核心记忆/思想钢印】\n（这是你永远不可磨灭的底调）：\n${coreMemories.map(m => `* ${m}`).join('\n')}` : '';
  const fragMemStr = triggeredFragments.length > 0 ? `\n\n【触发的回忆片段】\n（系统提示：受到当前聊天内容的触发，你的脑海中浮现出了以下回忆，请结合语境自然地运用它们）：\n${triggeredFragments.map(m => `* ${m}`).join('\n')}` : '';


  // ================= 🌟 第四步：组装超级“汉堡包”系统提示词 =================
  const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
  const userPrompt = userPersona.prompt ? `\n【当前用户身份设定】\n${userPersona.prompt}` : '';

  // 完美融合理论：角色卡 -> 核心记忆 -> 临时设定 -> 规则 -> 触发的碎片记忆
  const systemPrompt = `【角色卡】
名字：${char.name}
设定：${char.prompt}${coreMemStr}${wb}${emo}${globalP}
【用户】
当前化名/备注：${userPersona.name}${userPrompt}
${systemRules}${frontStr}${middleStr}${fragMemStr}`;
  
  let messages = [{ role: 'system', content: systemPrompt }];


  // ================= 🌟 第五步：推入纯净版聊天记录 =================
  // 告诉 AI 当前所处的绝对场景，防止它搞混
  const modeStr = isOffline ? "\n【系统最高指令：当前为线下剧情模式！请用小说体裁描写动作和对话，绝不输出时间标签。】" : "\n【系统最高指令：当前为线上微信聊天！纯文本对话，绝不可使用星号或括号写动作！绝不输出时间标签和前缀！】";
  messages[0].content += modeStr;

  recentHistory.forEach(m => {
    let msgContent;
    if (m.msgType === 'recall_system') {
      msgContent = `(系统提示：对方撤回了一条消息)`;
    } else if (m.msgType === 'real_image' && m.imageUrl) {
      msgContent = [{ type: "text", text: m.text }, { type: "image_url", image_url: { url: m.imageUrl } }];
    } else {
      // 🌟 核心净化：只传纯文字！不要再加 [22:20] [线上聊天] 这种前缀了！
      msgContent = m.text; 
    }
    messages.push({ role: m.isMe ? 'user' : 'assistant', content: msgContent });
  });


  // ================= 🌟 第六步：强制压入底层绝对指令 =================
  if (backStr) {
    messages.push({ role: 'system', content: backStr });
  }

  // ================= 🌟 第七步：发射请求 =================
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