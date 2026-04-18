// js/apps/wechat/voice.js — Minimax 语音请求引擎
import { store } from '../../store.js';

// =================  1. Minimax 语音请求引擎 (纯净稳定版) =================
export async function fetchMinimaxVoice(text, voiceId) {
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
