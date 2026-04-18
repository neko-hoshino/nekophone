// js/apps/wechat/shared.js — 工具函数、滚动管理、通话语音队列

// 🌟 升级：原生生成包含年月日的完整时间（供系统底层存储使用）
export const getNowTime = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${year}-${month}-${day} ${time}`;
};

window.formatSmartTime = (ts, fallbackTimeStr, msgId) => {
    // 🌟 核心修复：如果没有 timestamp，但 msgId 是一个长串纯数字时间戳，就直接征用 msgId！
    let finalTs = ts;
    if (!finalTs && typeof msgId === 'number' && msgId > 1000000000000) {
        finalTs = msgId;
    }

    if (!finalTs) return fallbackTimeStr || '';
    const date = new Date(finalTs);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (isToday) {
        return timeStr; // 今天只显示时分
    } else {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${timeStr}`; // 跨天显示完整日期
    }
};

// 🌟 新增：专门给 AI 喂上下文用的格式化函数 (强行带上日期，杜绝 AI 串戏)
window.formatFullTimeForAI = (ts, fallbackTimeStr) => {
    if (!ts) return fallbackTimeStr || '';
    const date = new Date(ts);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// 🌟 修复8：解析时间距离的引擎
export const formatTimeElapsed = (ts) => {
  if (!ts) return '最新';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
};

// 🌟 修复6 & 7：真正的全局滚动记忆系统 (终极防跳版)
let savedScrollPositions = {};
export const saveScroll = () => {
  ['chat-scroll', 'offline-scroll', 'wechat-group-scroll', 'wechat-favorites-scroll', 'moments-scroll', 'book-read-scroll'].forEach(id => {
    const el = document.getElementById(id);
    // 🌟 核心：同时记录距离顶部的距离，和距离【底部】的距离！
    if (el) savedScrollPositions[id] = { top: el.scrollTop, bottom: el.scrollHeight - el.scrollTop };
  });
};
// 通话语音播放队列
let callAudioQueue = [];
let isCallAudioPlaying = false;
/**
 * 通话模式下的语音顺序播放器
 * @param {string} url - 语音音频的 Blob URL
 */
export function playCallAudio(url) {
    if (!url) return;
    // 如果当前有音频正在播放，则推入队列等待
    if (isCallAudioPlaying) {
        callAudioQueue.push(url);
        return;
    }
    isCallAudioPlaying = true;
    const audio = new Audio(url);
    audio.onended = () => {
        // 当前播放结束，标记为空闲
        isCallAudioPlaying = false;
        // 如果队列中还有待播放的音频，继续播放
        if (callAudioQueue.length > 0) {
            const nextUrl = callAudioQueue.shift();
            playCallAudio(nextUrl);
        }
    };
    audio.play().catch(e => {
        console.error('通话语音播放失败', e);
        // 播放失败也要标记空闲，继续处理队列
        isCallAudioPlaying = false;
        if (callAudioQueue.length > 0) {
            const nextUrl = callAudioQueue.shift();
            playCallAudio(nextUrl);
        }
    });
}

export const restoreScroll = () => {
  Object.keys(savedScrollPositions).forEach(id => {
    const el = document.getElementById(id);
    if (el && savedScrollPositions[id]) {
      el.style.scrollBehavior = 'auto';
      // 🌟 致命一击：聊天列表强制以底部为参照物进行恢复，哪怕底栏高度变了也绝对不跳！
      if (id === 'chat-scroll' || id === 'offline-scroll') {
          el.scrollTop = el.scrollHeight - savedScrollPositions[id].bottom;
      } else {
          el.scrollTop = savedScrollPositions[id].top;
      }
      if (window.globalScrollStates && window.globalScrollStates[id]) {
          window.globalScrollStates[id].top = el.scrollTop;
      }
    }
  });
};
