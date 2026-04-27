// js/apps/wechat/voice.js — Minimax 语音请求引擎
import { store } from '../../store.js';

// =================  1. Minimax 语音请求引擎 (纯净稳定版) =================
// 🌟 onCloudReady(cloudUrl)：可选回调，仅供"语音条消息"使用。
//    工作流：本函数立刻返回 blob URL（让 UI 不卡顿先播放），同时在后台静默上传到云端。
//    上传成功后通过此回调把云端 URL 交给调用方（用于覆盖 msg.audioUrl 实现跨刷新持久）。
//    通话 / 听书等转瞬即逝场景不传此回调，blob URL 用完即丢，不耗云空间。
export async function fetchMinimaxVoice(text, voiceId, onCloudReady = null) {
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
      const blobUrl = URL.createObjectURL(blob);

      // 🌟 后台异步上云（仅当调用方传了回调，即语音条消息场景）
      // 不 await — 用户立刻拿到 blob URL 能马上播；云端 URL 准备好之后通过回调交付。
      if (typeof onCloudReady === 'function') {
        (async () => {
          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(fr.result);
              fr.onerror = reject;
              fr.readAsDataURL(blob);
            });
            const cloudUrl = await window.uploadMediaToCloud(dataUrl, 'mp3'); // 每条独立保留，无 fixedKey
            if (cloudUrl && typeof cloudUrl === 'string' && cloudUrl.startsWith('http')) {
              onCloudReady(cloudUrl);
            }
          } catch (err) {
            console.error('[uploadMediaToCloud] minimax voice (background)', err);
          }
        })();
      }

      return blobUrl;
    }
  } catch (e) {
    console.error('语音网络请求崩溃:', e);
  }
  return null;
}
