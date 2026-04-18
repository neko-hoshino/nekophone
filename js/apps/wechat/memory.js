// js/apps/wechat/memory.js — 后台静默自动记忆引擎
import { store } from '../../store.js';

// ================= 2. 后台静默自动记忆引擎 =================
export async function triggerAutoMemory(charId, msgs) {
  if (!store.apiConfig?.apiKey) return;
  try {
    const char = store.contacts.find(c => c.id === charId);
    const chat = store.chats.find(c => c.charId === charId);
    const pId = (chat?.isGroup ? chat.boundPersonaId : char?.boundPersonaId) || store.personas[0].id;
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

    // 🌟 修改 Prompt：强制锁定“我”与“你”的视角！
    const promptStr = `【后台任务】请判断以下近期的对话记录中，是否包含剧情进展、情感转折或新设定。
如果只是毫无营养的日常闲聊（如早安、吃了吗等），请务必只输出"无"这一个字。
如果有重要内容，请客观简练地总结为一个记忆碎片（50字以内）。
❗【人称视角与重要性级别】（必须严格遵守！）：
1. 你必须以【${char.name}】的视角来记录！用“我”指代自己，用“你”指代用户（${myName}）。
2. 如果是影响深远的重大设定、核心人物关系改变（如表白、决裂、身世揭晓），请在开头加上 [核心] 标签。
3. 如果只是普通的剧情事件或情绪记忆，请在开头加上 [碎片] 标签。
示例输出：[核心]我向你表白了，我们确立了恋爱关系。

【对话】
${logText}`;

    const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
        body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: promptStr }], temperature: 0.3 })
    });
    const data = await res.json();
    const rawSummary = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

    if (rawSummary === '无' || rawSummary.toLowerCase().includes('none') || rawSummary.includes('无重要信息')) {
       console.log(`[系统] 本轮对话无重要进展，拒绝产生垃圾记忆。`);
       return;
    }

    let memType = 'fragment';
    let summary = rawSummary;
    if (summary.includes('核心')) { memType = 'core'; summary = summary.replace(/【?\[?核心\]?】?/g, '').trim(); }
    else if (summary.includes('碎片')) { memType = 'fragment'; summary = summary.replace(/【?\[?碎片\]?】?/g, '').trim(); }

    let kws = '';
    if (memType === 'fragment') {
        const kwRes = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'system', content: `请思考当聊到什么话题、遇到什么场景、或有什么情绪时，【${char.name}】应该回想起下面这段记忆？请提取2-3个核心名词作为触发关键词，用英文逗号分隔，不要输出多余符号。\n❗绝对禁令：触发关键词中【绝对禁止】出现具体名字（禁止使用：${myName}, ${char.name}, 我, 你, 他, 她）！\n${summary}` }], temperature: 0.3 })
        });
        const kwData = await kwRes.json();
        kws = window.cpActions.cleanAI(kwData.choices[0].message.content).replace(/^["']|["']$/g, '');
    }

    // 🌟 在存入 store 之前，给内容打上时间戳
    const dateStr = new Date().toLocaleDateString('zh-CN'); // 例如：2026/4/18
    const finalSummary = `[${dateStr}] ${summary}`;

    store.memories = store.memories || [];
    // 微信静默提取的记忆默认未整理（isOrganized: false）
    store.memories.push({ id: Date.now(), charId: charId, type: memType, content: finalSummary, keywords: kws, createdAt: Date.now(), isOrganized: false });
    console.log(`[系统] 提取到高价值 ${memType === 'core' ? '❤️核心' : '🧩碎片'} 记忆:`, finalSummary);
  } catch (e) {}
}