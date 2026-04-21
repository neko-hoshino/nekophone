// js/apps/transmigration.js — 快穿系统：无限流玩家终端（全网联机版）

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { store } from '../store.js';
import { cloudFetch } from '../utils/llm.js';

// ─── Supabase 客户端（走反向代理）────────────────────────────────
const SUPABASE_ANON_KEY = 'sb_publishable_3YUfNGRez8K78PeNh3GVpA_nz-hT_xL';
const supabase = createClient('https://neko-hoshino.duckdns.org/supabase', SUPABASE_ANON_KEY);

// ─── 全局状态 ─────────────────────────────────────────────────────
window.transState = {
  tab: 'terminal',
  missionModal: null,
  forumSub: 'hot',
  cloudPlayers:   null,
  cloudPosts:     null,
  loadingPlayers: false,
  loadingPosts:   false,
  isAdmin:        false,   // 当前玩家是否为管理员
  isBanned:       false,   // 当前玩家是否被封号
  adminTarget:    null,    // 排名页点击的目标玩家 { id, name, is_banned }
  forumDetail:    null,    // 当前查看的帖子对象
  forumComments:  null,    // 当前帖子评论列表（null=未加载，[]=加载完）
  loadingComments: false,
  replyTarget:    null,    // { commentId, authorName, rootId, isSubReply }
  likedPosts:     new Set(),
  likedComments:  new Set(),
  // ── 自定义副本 ────────────────────────────────────────────────
  customModal:    false,
  customForm:     { world: '', name: '', briefing: '', target: '', selectedChars: [], difficulty: 2 },
  customScript:   null,
  generatingScript: false,
  // ── 副本文游 ──────────────────────────────────────────────────
  activeDungeon:  null,   // 进行中的文游副本（仅 session，不持久化）
  generatingTurn: false,
  dungeonInvOpen: false,
  dungeonAffOpen: false,
  missionModalChars: [],   // 预设副本弹窗选择的角色
  missionModalGen:   false,
  missionScript:     null, // 预设副本预生成的脚本
  dungeonSettingsOpen: false,
  // ── 死亡回溯与 TE 提取 ────────────────────────────────────────
  rewindModalOpen: false,     // 死亡面板是否打开（BE 出现时自动打开）
  rewindTargetTurn: '',       // 用户输入的回溯目标回合
  teModalOpen: false,         // TE 提取弹窗
  teNpcChoice: null,          // 用户选择要带回的 NPC name
  teExtracting: false,        // TE 提取请求中
};

// ─── 难度奖励表 ───────────────────────────────────────────────────
const DIFF_REWARDS = { 1: { points: 200, exp: 50 }, 2: { points: 350, exp: 90 }, 3: { points: 500, exp: 130 }, 4: { points: 700, exp: 180 } };

// ─── 商城道具库 ──────────────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'compass',   name: '厄运预知罗盘',       icon: '🧭', price: 280,  tag: '情报',   desc: '使用后，本回合选项中属于 [陷阱] 的致命错误将被高亮标红，助你避开危险。' },
  { id: 'contract',  name: '灵魂印记契约',       icon: '📜', price: 1200, tag: '传说',   desc: '达成 True Ending 结算时消耗，将副本中的原创 NPC 永久带回主神空间通讯录。' },
  { id: 'rewind',    name: '时间回溯卡',         icon: '⏪', price: 600,  tag: '稀有',   desc: '死亡/BE 时使用，可回溯到副本任意已完成回合重新开始。每张消耗一张。' },
  { id: 'memory',    name: '记忆闪回丹',         icon: '🔮', price: 150,  tag: '情报',   desc: '可查看任意NPC的核心记忆片段，获取关键情报，一次性使用。' },
  { id: 'charm',     name: '魅力值增幅剂',       icon: '💊', price: 200,  tag: '增益',   desc: '临时提升好感值获取速度×1.5，持续一个副本周期。' },
  { id: 'expcard',   name: '经验值加倍卡',       icon: '🌟', price: 400,  tag: '增益',   desc: '本次任务完成后经验值×2结算，快速突破等级瓶颈。' },
];

// ─── 副本库 ───────────────────────────────────────────────────────
const MISSIONS = [
  { id: 'w001', name: '豪门恩怨录',        world: '都市豪门',   diff: 1,
    tags: ['都市', '甜宠', '逆袭'],
    briefing: '你将穿越成被豪门家族遗弃的嫡女，在错综复杂的家族争斗中完成身份认同，获得真正的归属感。攻略对象：冷漠的家族长兄。',
    target: '与攻略对象好感度≥90，家族认可度≥80', reward: { points: 200, exp: 50 }, limit: '30天' },
  { id: 'w002', name: '偏执大佬的白月光', world: '都市悬疑',   diff: 2,
    tags: ['偏执', '救赎', '甜虐'],
    briefing: '你成为某位偏执狂总裁亡妻的完美替身，必须在真相与谎言的漩涡中活下去，并让他从执念中彻底解脱。',
    target: '解开前任死亡真相，攻略对象好感度突破100', reward: { points: 350, exp: 90 }, limit: '45天' },
  { id: 'w003', name: '末世孤城',          world: '末世废土',   diff: 3,
    tags: ['末世', '生存', '强强CP'],
    briefing: '丧尸爆发第三年。你穿越为孤城唯一女医生，需与冷漠的幸存者头领共同守住最后基地，资源极度匮乏。',
    target: '基地存活率保持≥80%持续30天，与头领建立信任', reward: { points: 500, exp: 130 }, limit: '60天' },
  { id: 'w004', name: '古言皇权争霸',      world: '古代宫廷',   diff: 3,
    tags: ['古言', '权谋', '虐恋'],
    briefing: '穿越成即将被赐死的失宠宠妃，在尔虞我诈的后宫与庙堂之上谋一条生路，并搅动整个朝局的走向。',
    target: '存活至故事结局，朝堂势力值≥70', reward: { points: 500, exp: 120 }, limit: '无限制' },
  { id: 'w005', name: '星际联邦叛逃者',    world: '科幻星际',   diff: 4,
    tags: ['科幻', '星际', '间谍'],
    briefing: '化身联邦叛逃情报员，在星际追杀与政治阴谋中寻找真相，与冷酷的联邦执法官展开生死猫鼠游戏。',
    target: '完成情报交割，在联邦追捕下存活并揭露幕后黑手', reward: { points: 700, exp: 180 }, limit: '无限制' },
  { id: 'w006', name: '修仙界之逆天改命',  world: '玄幻修仙',   diff: 2,
    tags: ['修仙', '玄幻', '成长'],
    briefing: '穿越成废灵根的炮灰弟子，在宗门险境中存活，拜入传说中的魔道大佬门下，改写被注定的悲剧结局。',
    target: '突破筑基期，与攻略对象订立契约', reward: { points: 350, exp: 80 }, limit: '无限制' },
];

// ─── Mock 降级数据（对齐 SQL 字段名）────────────────────────────
const MOCK_POSTS = [
  { id: 'mock-p1', author_name: '无限流退休人员', author_level: 99,
    title: '老玩家忠告：OOC屏蔽器才是命根子',
    content: '通关100+副本的老玩家忠告：积分别全存着，关键时刻一张OOC屏蔽器能救你的命。我在星际副本舍不得买，被系统警告三次差点强退。',
    likes: 2890, comments: 678, created_at: new Date(Date.now() - 86400000 * 2).toISOString(), tag: '经验' },
  { id: 'mock-p2', author_name: 'NPC_觉醒者', author_level: 88,
    title: '偏执系副本的底层逻辑',
    content: '所有偏执男主在爱上你之前，其实只是把你当棋子。先被利用，再被独占。这才是偏执系副本的正确打法。',
    likes: 1203, comments: 445, created_at: new Date(Date.now() - 86400000).toISOString(), tag: '理论' },
  { id: 'mock-p3', author_name: '穿越老司机', author_level: 42,
    title: '偏执男主通关心得分享',
    content: '千万别在第一周就主动示好。让他觉得你随时可能离开，占有欲才会被激活。',
    likes: 234, comments: 67, created_at: new Date(Date.now() - 3600000 * 2).toISOString(), tag: '攻略' },
  { id: 'mock-p4', author_name: '系统幽灵', author_level: 7,
    title: '救命！系统给我分配了个离谱身份',
    content: '我进了末世副本结果系统给我分配的身份是丧尸BOSS的随从，有没有大佬带飞？？',
    likes: 891, comments: 203, created_at: new Date(Date.now() - 3600000 * 5).toISOString(), tag: '求助' },
  { id: 'mock-p5', author_name: '泡面侠', author_level: 15,
    title: '古代宫廷副本：被赐婚给将军但目标是太子',
    content: '问一下古代宫廷世界的前辈：我被皇上赐婚给冷面将军，但任务攻略对象是太子。是先和离还是先让太子来救我？',
    likes: 156, comments: 89, created_at: new Date(Date.now() - 3600000 * 8).toISOString(), tag: '求助' },
];

const MOCK_PLAYERS = [
  { id: 'mock1', name: '天道宠儿',        level: 99, points: 98800, worlds: 102, is_admin: false, is_banned: false },
  { id: 'mock2', name: '无限流大佬',      level: 87, points: 76200, worlds: 89,  is_admin: false, is_banned: false },
  { id: 'mock3', name: '剧情破坏者',      level: 76, points: 64100, worlds: 71,  is_admin: false, is_banned: false },
  { id: 'mock4', name: 'NPC觉醒协会会长', level: 88, points: 58900, worlds: 85,  is_admin: false, is_banned: false },
  { id: 'mock5', name: '穿越老司机',      level: 42, points: 43200, worlds: 48,  is_admin: false, is_banned: false },
  { id: 'mock6', name: '系统幽灵',        level: 7,  points: 12800, worlds: 9,   is_admin: false, is_banned: false },
  { id: 'mock7', name: '泡面侠',          level: 15, points: 10600, worlds: 12,  is_admin: false, is_banned: false },
];

// ─── 工具函数 ─────────────────────────────────────────────────────
function getTitle(lv) {
  if (lv >= 50) return '系统宠儿';
  if (lv >= 20) return '传奇穿越者';
  if (lv >= 10) return '资深穿越者';
  if (lv >= 5)  return '初阶穿越者';
  return '迷途旅人';
}

function getDiffStars(d) {
  const colors = ['', '#3fb950', '#58d4f5', '#ffa64d', '#f85149'];
  const labels = ['', '新手', '进阶', '困难', '地狱'];
  return `<span style="color:${colors[d]};font-size:11px;font-weight:700;">${'★'.repeat(d)}${'☆'.repeat(4 - d)} ${labels[d]}</span>`;
}

function fmtPts(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

function tsAgo(ts) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + '分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '小时前';
  return Math.floor(h / 24) + '天前';
}

function npcAvatar(name, sizeClass = 'w-7 h-7', fontSize = '13px') {
  const bgs = ['#1c3a5e','#2a3d1c','#3d1c3d','#1c3d2e','#3d2e1c','#1c2a3d','#3d1c1c','#2e1c3d'];
  const bg = bgs[(name.charCodeAt(0) || 0) % bgs.length];
  return `<div class="${sizeClass} rounded-full flex items-center justify-center font-bold shrink-0" style="background:${bg};color:#e6edf3;font-size:${fontSize};">${name[0] || '?'}</div>`;
}

function myAvatar(pAvatar, pName, sizeClass = 'w-7 h-7', fontSize = '13px') {
  if (pAvatar) return `<img src="${pAvatar}" class="${sizeClass} rounded-full object-cover shrink-0" />`;
  return npcAvatar(pName, sizeClass, fontSize);
}

function tagStyle(tag) {
  const m = {
    '消耗品':'background:rgba(88,212,245,0.1);color:#58d4f5;border:1px solid rgba(88,212,245,0.2);',
    '增益':  'background:rgba(63,185,80,0.1);color:#3fb950;border:1px solid rgba(63,185,80,0.2);',
    '情报':  'background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.2);',
    '效率':  'background:rgba(255,166,77,0.1);color:#ffa64d;border:1px solid rgba(255,166,77,0.2);',
    '保险':  'background:rgba(88,212,245,0.1);color:#58d4f5;border:1px solid rgba(88,212,245,0.2);',
    '稀有':  'background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.2);',
    '传说':  'background:rgba(255,196,0,0.1);color:#ffc400;border:1px solid rgba(255,196,0,0.3);',
    '分享':  'background:rgba(63,185,80,0.1);color:#3fb950;border:1px solid rgba(63,185,80,0.2);',
    '经验':  'background:rgba(255,166,77,0.1);color:#ffa64d;border:1px solid rgba(255,166,77,0.2);',
    '理论':  'background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.2);',
    '攻略':  'background:rgba(88,212,245,0.1);color:#58d4f5;border:1px solid rgba(88,212,245,0.2);',
    '求助':  'background:rgba(248,81,73,0.1);color:#f85149;border:1px solid rgba(248,81,73,0.2);',
  };
  return m[tag] || 'background:rgba(255,255,255,0.06);color:#8b949e;border:1px solid rgba(255,255,255,0.1);';
}

function loadingSkeleton(rows = 3) {
  return Array.from({ length: rows }, () => `
    <div class="rounded-xl p-4 space-y-2" style="background:#161b22;border:1px solid rgba(255,255,255,0.05);">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full shrink-0" style="background:rgba(255,255,255,0.06);"></div>
        <div class="h-3 w-24 rounded" style="background:rgba(255,255,255,0.06);"></div>
      </div>
      <div class="h-3 w-full rounded" style="background:rgba(255,255,255,0.04);"></div>
      <div class="h-3 w-4/5 rounded" style="background:rgba(255,255,255,0.04);"></div>
    </div>`).join('');
}

function initData() {
  if (!store.transData) {
    store.transData = {
      player: {
        name: null, avatar: null,
        level: 1, exp: 0, expToNext: 100,
        points: 1888, completedWorlds: 0,
        activeWorldId: null, inventory: [],
        joinedAt: Date.now(),
      },
      dungeonSettings: { mountedWorldbooks: [] },
    };
  }
  if (!store.transData.dungeonSettings) {
    store.transData.dungeonSettings = { mountedWorldbooks: [] };
  }
  // 修复旧存档中 joinedAt 缺失导致 pId 每次变化的问题
  if (!store.transData.player.joinedAt) {
    store.transData.player.joinedAt = Date.now();
  }
}

// ─── 云端函数 ─────────────────────────────────────────────────────
let _syncTimer = null;
async function syncPlayerToCloud(immediate = false) {
  // immediate=true 时：清除防抖、立即执行并等待完成（用于发帖前的强制同步）
  clearTimeout(_syncTimer);

  const doSync = async () => {
    try {
      initData();
      const player = store.transData.player;
      const defaultPersona = store.personas?.[0] || {};
      const pName   = player.name || defaultPersona.name || '旅行者';
      const pId     = 'TRV-' + String(player.joinedAt).slice(-8);
      const pAvatar = player.avatar || (defaultPersona.avatar?.startsWith?.('http') ? defaultPersona.avatar : null);

      const { error } = await supabase.from('players').upsert({
        id:         pId,
        name:       pName,
        avatar:     pAvatar,
        level:      player.level,
        points:     player.points,
        worlds:     player.completedWorlds,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) console.warn('[Trans] 同步玩家失败:', error.message);
    } catch (e) {
      console.warn('[Trans] 同步玩家异常:', e.message);
    }
  };

  if (immediate) {
    await doSync();
  } else {
    _syncTimer = setTimeout(doSync, 1500);
  }
}

async function checkAdminStatus(pId) {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('is_admin, is_banned')
      .eq('id', pId)
      .maybeSingle();
    if (!error && data) {
      const newAdmin  = data.is_admin  === true;
      const newBanned = data.is_banned === true;
      const changed = newAdmin !== window.transState.isAdmin || newBanned !== window.transState.isBanned;
      window.transState.isAdmin  = newAdmin;
      window.transState.isBanned = newBanned;
      return changed;
    }
  } catch (e) {
    // 网络失败不改变现有状态
  }
  return false;
}

async function loadRanking() {
  if (window.transState.loadingPlayers) return;
  window.transState.loadingPlayers = true;
  window.render();
  try {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, avatar, level, points, worlds, is_admin, is_banned')
      .order('points', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    window.transState.cloudPlayers = data ?? [];   // 成功：有数据用数据，没数据用空数组
  } catch (e) {
    console.warn('[Trans] 排行榜拉取失败:', e.message);
    window.transState.cloudPlayers = null;          // 失败：null = 未连通
  } finally {
    window.transState.loadingPlayers = false;
    window.render();
  }
}

async function loadForum() {
  if (window.transState.loadingPosts) return;
  window.transState.loadingPosts = true;
  window.render();
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, author_id, author_name, author_level, author_avatar, content, tag, likes, comments, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    window.transState.cloudPosts = data ?? [];      // 成功：有数据用数据，没数据用空数组
  } catch (e) {
    console.warn('[Trans] 论坛拉取失败:', e.message);
    window.transState.cloudPosts = null;            // 失败：null = 未连通
  } finally {
    window.transState.loadingPosts = false;
    window.render();
  }
}

async function loadComments(postId) {
  window.transState.loadingComments = true;
  window.render();
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, parent_id, author_id, author_name, content, likes, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    window.transState.forumComments = data ?? [];
  } catch (e) {
    console.warn('[Trans] 评论拉取失败:', e.message);
    window.transState.forumComments = [];
  } finally {
    window.transState.loadingComments = false;
    window.render();
  }
}

// ─── 副本文游：工具函数 ───────────────────────────────────────────
async function callLLMDungeon(messages, maxTokens = 2500) {
  const cfg = store.apiConfig || {};
  if (!cfg.baseUrl) throw new Error('请先在「设置」中配置 API 地址');
  const resp = await cloudFetch({
    model: cfg.model || 'gpt-4o-mini',
    messages,
    max_tokens: maxTokens,
    temperature: 0.9,
  });
  if (!resp.ok) throw new Error(`API 错误 ${resp.status}`);
  const json = await resp.json();
  return json.choices?.[0]?.message?.content || '';
}

function parseJSONSafe(str) {
  try {
    const s = str.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(s);
  } catch (_) {
    const m = str.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('JSON 解析失败');
  }
}

function scrollDungeonLog() {
  // 🌟 纯同步置底，同时锁死 globalScrollStates，防止 main.js rAF 回滚
  const el = document.getElementById('dungeon-log-scroll');
  if (el) {
    el.style.scrollBehavior = 'auto';
    el.scrollTop = el.scrollHeight;
    if (window.globalScrollStates) {
      window.globalScrollStates['dungeon-log-scroll'] = { top: el.scrollHeight, left: 0 };
    }
  }
}

function buildDungeonSysPrompt(dungeon) {
  const s       = dungeon.script;
  const st      = dungeon.status;
  const persona = dungeon.persona || {};
  // 对齐 llm.js：通用用户人设(store.globalPrompt) + 绑定用户身份(personas[0].prompt)
  const personaDesc = [store.globalPrompt, persona.prompt].filter(Boolean).join('\n') || '（无特定设定）';

  // 剧本中的角色设定（含副本身份）
  const charInfo = (s.char_settings || [])
    .map(c => `• ${c.name}${c.gender ? `（${c.gender}）` : ''}【${c.identity}】性格：${c.personality}；与玩家关系：${c.relationship_to_player}；隐藏秘密：${c.hidden_secret || '无'}`)
    .join('\n');

  // 原创 NPC（TE 可带回通讯录的关键角色）
  const origNpcInfo = (s.original_npcs || [])
    .map(n => `• ${n.name}${n.gender ? `（${n.gender}）` : ''}【${n.identity}】性格：${n.personality}；与玩家关系：${n.relationship_to_player}；在剧情中作用：${n.role_in_plot || '—'}；隐藏秘密：${n.hidden_secret || '无'}`)
    .join('\n');

  // 原始人设补充（使用与 WeChat 相同的 c.prompt 字段，防止AI忘记真实性格/性别）
  const origChars = (dungeon.chars || []);
  const origInfo = origChars.length > 0
    ? origChars.map(c => {
        const desc = c.prompt || [c.personality, c.background].filter(Boolean).join('；') || '（无记录）';
        return `• ${c.name} 原始人设：${desc}`;
      }).join('\n')
    : '';

  const affStr = Object.entries(st.affections || {})
    .map(([name, val]) => `${name}:${val}`).join('、') || '（尚无记录）';
  const recentLog = dungeon.log.slice(-20).map(e =>
    e.type === 'action'   ? `[玩家行动] ${e.text}`
    : e.type === 'narration' ? `[叙述] ${e.text.slice(0, 200)}`
    : `[系统] ${e.text}`
  ).join('\n');

  // ── 阶段锁信息 ─────────────────────────────────────────────
  const gates = s.stage_gates || [];
  const curGateIdx = gates.findIndex(g => st.progress < g.threshold);
  const curGate = curGateIdx >= 0 ? gates[curGateIdx] : null;
  const gateStr = gates.length
    ? gates.map((g, i) => {
        const done = st.progress >= g.threshold;
        const isCur = curGateIdx === i;
        return `${done ? '✅' : isCur ? '🔒' : '⬜'} 阶段${i+1}（≤${g.threshold}%）：${g.requirement}`;
      }).join('\n')
    : '（无阶段锁）';

  // ── 转折条件 ───────────────────────────────────────────────
  const twists = s.twist_triggers || [];
  const twistStr = twists.length
    ? twists.map((t, i) => `#${i+1} 条件：${t.condition} → 触发转折：${t.payload}`).join('\n')
    : '（无预设转折）';

  // ── 世界书注入（对齐 llm.js 逻辑）────────────────────────────
  const recentText = dungeon.log.slice(-5).map(e => e.text).join('\n');
  const mountedWbs = store.transData?.dungeonSettings?.mountedWorldbooks || [];
  let frontWb = [], middleWb = [], backWb = [];
  (store.worldbooks || []).forEach(wbItem => {
    if (!wbItem.enabled) return;
    let shouldInject = false;
    if (wbItem.type === 'global') {
      shouldInject = true;
    } else if (wbItem.type === 'trigger') {
      const kws = (wbItem.keywords || '').split(',').map(k => k.trim()).filter(k => k);
      if (kws.length > 0 && kws.some(k => recentText.includes(k))) shouldInject = true;
    } else if (wbItem.type === 'local') {
      if (mountedWbs.includes(wbItem.id)) shouldInject = true;
    }
    if (shouldInject) {
      const entryStr = `【${wbItem.title}】：${wbItem.content}`;
      if (wbItem.position === 'front') frontWb.push(entryStr);
      else if (wbItem.position === 'back') backWb.push(entryStr);
      else middleWb.push(entryStr);
    }
  });
  const frontStr  = frontWb.length  > 0 ? `\n[前置世界观设定]\n${frontWb.join('\n')}` : '';
  const middleStr = middleWb.length > 0 ? `\n[当前场景设定]\n${middleWb.join('\n')}` : '';
  const backStr   = backWb.length   > 0 ? `\n[最高优先级世界书指令]\n${backWb.join('\n')}` : '';

  // ── 上回合玩家选项类型（由前端强制标记）────────────────────
  const lastChoiceType = dungeon._lastChoiceType || null;
  const typeNoteMap = {
    main_plot: '玩家选择了【主线推进】选项，请按主线剧情发展；如当前阶段 requirement 已满足，可推进进度跨过阶段锁。',
    emotion:   '玩家选择了【感情互动】选项，请重点刻画 NPC 情感反应并调整好感度，主进度推进不超过3点。',
    trap:      '⚠ 玩家踩中了【陷阱】！必须在叙事中给予明确惩罚——低难度扣5-15生存值并出现负面后果；高难度(★★★★)可直接导向 BE、被囚禁或任务失败。严禁无痛放过。',
    twist:     '玩家选择了【转折】选项，必须按 twist_triggers 中对应的 payload 将剧情导向支线/隐藏剧情。',
    custom:    '玩家输入了自定义行动，请按合理性判定并给予相应反馈。',
  };
  const lastChoiceNote = lastChoiceType ? `\n【上回合玩家选择类型】${typeNoteMap[lastChoiceType] || lastChoiceType}` : '';

  // ── 转折强制触发（前端检测到条件已满足）────────────────────
  const forceTwist = !!dungeon._forceTwist;
  const twistForceNote = forceTwist
    ? '\n⚠⚠【转折触发器】检测到转折条件已满足！本回合输出的 options 必须包含一个 twist 选项（非空字符串），引出支线/隐藏剧情。'
    : '';

  // ── 阶段锁当前要求 ─────────────────────────────────────────
  const curGateInfo = curGate
    ? `当前卡在阶段${curGateIdx + 1}（进度上限 ${curGate.threshold}%）。玩家必须完成：「${curGate.requirement}」。在这之前，status_delta.progress 不得越过 ${curGate.threshold}。`
    : '所有阶段已解锁，可正常推进至通关。';

  // ── 难度反馈 ───────────────────────────────────────────────
  const diff = dungeon.mission?.diff || 2;
  const diffNote = diff >= 3
    ? '【高难副本】陷阱选项可直接触发 BE（生存清零、被反派囚禁、强制坏结局）。'
    : '【低难副本】陷阱选项主要扣生存值（-5~-15），严重时导向 BE。';

  return `你是无限流文字副本《${s.name}》的叙事AI（DM）。

【世界背景】
${s.detailed_background}

【玩家信息】
姓名：${persona.name || '旅行者'} | 人设：${personaDesc}
副本处境：${s.player_identity}
⚠ 叙述中禁止使用"你是${persona.name || '旅行者'}"/"你叫X"等直接点明身份的句式，用第二人称自然叙事即可。

【NPC角色——副本设定】
${charInfo || '（无特定NPC）'}
${origNpcInfo ? `\n【原创NPC（TE可带回）】\n${origNpcInfo}` : ''}
${origInfo ? `\n【NPC角色——原始人设参考（防OOC）】\n${origInfo}` : ''}

⚠ 角色铁律：
1. 严格保持每个NPC的原始性别，禁止性转
2. 性格必须忠于原始人设，禁止OOC
3. 原本对玩家友好/有感情的角色，即使副本中有对立情节，也要有感情突破口或救赎线

【完成条件】
${(s.completion_conditions || []).join('；')}
${s.te_conditions ? `【TE（完美通关）附加条件】${s.te_conditions}` : ''}

【阶段锁（禁止跨阶段推进）】
${gateStr}
→ ${curGateInfo}

【预设转折触发器】
${twistStr}
→ 只有当玩家最近行为满足某条 condition 时，options.twist 才应给出具体文字；否则 options.twist 必须为空字符串 ""。

【当前状态】第${dungeon.turn}回合 · ${diffNote}
- 生存值：${st.survival}/100（归零=任务失败）
- 好感度：${affStr}
- 任务进度：${st.progress}/100
- 道具：${dungeon.inventory.join('、') || '空'}
${lastChoiceNote}${twistForceNote}

${frontStr}${middleStr}${backStr}

【近期剧情】
${recentLog}

⚠️【微观叙事与慢节奏法则】（最高指令）：
1. 你的任务是“水字数”与“制造拉扯”。叙事必须锁定在【当下这一分钟】，疯狂描写角色的微表情、眼神、肢体动作、呼吸节奏和环境氛围。
2. 绝对禁止主动推进主线或提供主线捷径选项！只有当玩家明确要求推进时，才勉强推进一点。
3. 如果玩家上回合选了【感情】选项，你的叙述【必须且只能】停留在情感互动上，绝不能顺便推进哪怕一丝主线进度！

⚠️【反剧透与标签禁令】（最高指令）：
1. "system_note" 仅用于提示道具获取或好感度剧变！绝对禁止在里面输出任何“剧情提示”、“任务引导”或“通关条件”！
2. 在输出 options 时，选项的文字描述开头【绝对禁止】加上任何如【主线】、【感情】、【陷阱】、【转折】的标签或前缀！必须是纯净的剧情动作！

【输出规则】严格输出以下 JSON，不得省略任何字段：
{
  "narration": "叙述文本（200字以上，第二人称，沉浸叙事，禁止'你是X'句式；若玩家上回合踩中 trap，必须在此展现明确惩罚）",
  "options": {
    "main_plot": "推进主线的行动（必填，1个，不要带任何前缀标签）",
    "emotion": ["感情互动选项（不要带任何前缀标签）"],
    "trap": "迷惑性的致命错误选项（必填，不要带前缀标签。低难扣生存，高难直接BE）",
    "twist": "转折/隐藏剧情选项（仅当 twist_triggers 条件满足时给出文字，不要带标签，否则为空字符串）"
  },
  "status_delta": {"survival":0,"progress":0},
  "affection_deltas": {"NPC姓名": 变化值},
  "new_items": [],
  "system_note": "",
  "gate_passed": false,
  "twist_fired_index": -1,
  "is_completed": false,
  "is_true_ending": false,
  "is_bad_ending": false,
  "completion_message": ""
}

· options.emotion 数组长度根据当前场景出场的可攻略角色数量，取 0-2 个。
· 如果玩家的行动刚好完成了当前阶段锁要求，设 gate_passed=true，此时 status_delta.progress 可以跨过当前阶段 threshold。
· 如果玩家达成某条 twist_triggers 的 condition，将其 index（从0起）写入 twist_fired_index。
· is_true_ending 仅在满足 te_conditions 时为 true；普通通关仅 is_completed=true。
· is_bad_ending 为 true 表示玩家被囚禁 / 被杀 / 黑化等 BE 结局（此时 is_completed 也应为 true，completion_message 说明失败原因）。`;
}

async function generateScriptData(world, name, briefing, target, chars, persona) {
  const personaName = persona?.name || '旅行者';
  // 对齐 llm.js：通用用户人设(store.globalPrompt) + 绑定用户身份(personas[0].prompt)
  const personaDesc = [store.globalPrompt, persona?.prompt].filter(Boolean).join('\n') || '（无特定设定）';

  // 为每个角色提取人设信息（使用与 WeChat 相同的 c.prompt 字段）
  const charDetails = chars.length > 0
    ? chars.map(c => {
        const desc = c.prompt || [c.personality, c.background].filter(Boolean).join('；') || '（无特定设定）';
        return `- 【${c.name}】原始人设：${desc}`;
      }).join('\n')
    : '（无指定角色，可自由创建NPC）';

  const userPrompt = `你是专业无限流副本设计师。请为以下副本设计完整设定，严格遵守下方所有规则。

═══ 基本信息 ═══
世界观：${world || '（自由发挥）'}
副本名称：${name || '（自由命名）'}
剧情提示：${briefing || '（完全自由发挥）'}
任务目标：${target || '（自由设定）'}

═══ 固定玩家（禁止修改） ═══
玩家由用户本人扮演，姓名固定为「${personaName}」。
玩家人设：${personaDesc}
→ player_identity 字段只写玩家进入副本后的处境与遭遇，禁止在此字段写"你是XXX"这类句子。

═══ 参与角色（以下角色作为副本NPC/BOSS/队友出现） ═══
${charDetails}

═══ 角色设计强制规则 ═══
1. 【性别锁定】每个角色的生理性别必须与原始人设完全一致，男性角色在副本中仍为男性，禁止性转。
2. 【关系推断→身份分配】根据原始人设中该角色与玩家「${personaName}」的关系，按如下逻辑安排副本身份：
   - 恋人 / 暧昧对象 / 青梅竹马 → 副本中为【可攻略的爱慕对象】或【同行的关键队友】，可有复杂情感纠葛，但最终可被攻略
   - 好友 / 朋友 / 搭档 / 亲人 → 副本中为【正面NPC】或【同行队友】，偏向帮助玩家
   - 对立 / 竞争 / 敌对 → 副本中为【可被攻略的对立BOSS或反派】，有隐藏弱点或救赎线，最终可被打动
   - 无明确关系 → 根据副本氛围自由安排，但优先设计为对玩家有吸引力的角色
3. 【禁止恶毒配角】不得将任何已指定角色设计为"恶毒女配/男配"、陷害玩家的工具人或无法互动的路人。
4. 【性格忠实】角色在副本中的性格特征必须忠于原始人设，禁止OOC（不得突然变性格）。

═══ 叙述风格规则（opening_scene） ═══
- 以第二人称（"你"）自然叙事，营造沉浸感
- 严禁用"你是XXX""你叫XXX""作为XXX的你"等句式直接点明玩家身份
- 开幕应从环境感知、身体感觉或眼前场景切入，让玩家自然代入
- 字数400字以上，有张力，有悬念

═══ 阶段锁与转折条件（重要） ═══
必须规划三阶段进度锁：stage_gates 数组，每个阶段包含「threshold（进度上限，如30/60/100）、requirement（必须完成的解谜/互动要求，如"揭开XX秘密"）、unlock_hint（给玩家的暗示）」。只有玩家完成 requirement 后，进度才能越过 threshold。
必须规划至少 2 条转折（隐藏剧情）：twist_triggers 数组，每条包含「condition（触发条件，如"某NPC好感度≥70"或"获得XX道具"）、payload（触发后的转折走向描述）」。

═══ 原创 NPC（强制） ═══
除用户指定角色外，必须额外原创 1-2 名符合世界观的重要 NPC，写入 original_npcs 数组。这些原创 NPC 是副本 TE 结算后玩家可以"带回通讯录"的关键角色，需有完整的性格、身份、与玩家潜在关系。

═══ 初始选项结构（重要） ═══
initial_options 字段必须是严格分类字典，格式：
{
  "main_plot": "推进主线的行动（1个）",
  "emotion": ["感情互动选项1"...（0-2个，根据出场角色数量）],
  "trap": "极具迷惑性的致命错误（不能太蠢，要有诱惑力；低难度扣生存，高难度直接导向BE/囚禁）",
  "twist": "转折/隐藏剧情选项（仅在满足 twist_triggers 条件时才给，否则设为空字符串）"
}

以 JSON 格式输出：
{
  "name":"副本名称",
  "world":"世界观类型",
  "briefing":"简介（2-3句，点明核心冲突）",
  "target":"任务目标（1-2句，明确完成条件）",
  "detailed_background":"详细世界背景（400字以上）",
  "player_identity":"玩家在副本中的处境描述（禁止'你是X'句式，写处境不写身份标签）",
  "char_settings":[{"name":"角色名（与原始人设完全一致）","gender":"男/女（与原始人设一致）","identity":"副本中的身份定位","personality":"性格（忠于原始人设）","relationship_to_player":"与玩家的初始关系","hidden_secret":"隐藏秘密或弱点"}],
  "original_npcs":[{"name":"原创NPC姓名","gender":"性别","identity":"身份职业","personality":"性格","appearance":"容貌特征","relationship_to_player":"与玩家的关系","hidden_secret":"隐藏秘密","role_in_plot":"在副本剧情中的作用"}],
  "plot_overview":"至少包含8个极其漫长、充满阻碍与试探的剧情节点，严禁快速过渡到高潮",
  "stage_gates":[
    {"threshold":30,"requirement":"第一阶段必须完成的解谜/互动","unlock_hint":"给玩家的暗示"},
    {"threshold":60,"requirement":"第二阶段必须完成的解谜/互动","unlock_hint":"给玩家的暗示"},
    {"threshold":100,"requirement":"最终阶段必须完成的事件","unlock_hint":"给玩家的暗示"}
  ],
  "twist_triggers":[
    {"condition":"触发条件描述","payload":"触发后转折剧情"}
  ],
  "completion_conditions":["条件1","条件2"],
  "te_conditions":"达成 True Ending（完美通关）的附加条件，例如主线完成且关键NPC好感≥80",
  "hidden_plots":["暗线1","暗线2"],
  "opening_scene":"第一幕开场（400字+，第二人称，不点明身份，从感知切入）",
  "initial_options":{
    "main_plot":"主线行动",
    "emotion":["感情互动选项"],
    "trap":"致命错误选项",
    "twist":""
  }
}`;
  const text = await callLLMDungeon([
    { role: 'system', content: '你是专业无限流副本设计师，擅长沉浸式文字RPG剧本创作。你必须严格遵守用户给出的所有角色规则，尤其是性别锁定和角色身份分配规则，不得违反。输出格式严格为 JSON。' },
    { role: 'user',   content: userPrompt },
  ], 4000);
  return parseJSONSafe(text);
}

// ─── 自定义副本弹窗 ───────────────────────────────────────────────
function renderCustomMissionModal() {
  const state = window.transState;
  const form  = state.customForm;
  const contacts = store.contacts || [];
  const genBusy = state.generatingScript;

  return `
  <div class="absolute inset-0 z-50 flex items-center justify-center p-3"
    style="background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);"
    onclick="window.transActions.closeCustomModal()">
    <div class="w-full rounded-2xl flex flex-col overflow-hidden"
      style="background:#161b22;border:1px solid rgba(88,212,245,0.25);max-height:88vh;"
      onclick="event.stopPropagation()">

      <!-- 标题栏 -->
      <div class="shrink-0 px-4 py-3 flex items-center justify-between" style="border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <div class="text-[9px] font-mono" style="color:#58d4f5;letter-spacing:3px;">CUSTOM DUNGEON</div>
          <div class="text-[16px] font-black" style="color:#e6edf3;">✦ 自定义副本</div>
        </div>
        <button onclick="window.transActions.closeCustomModal()"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-[14px]"
          style="background:rgba(255,255,255,0.05);color:#8b949e;">✕</button>
      </div>

      <!-- 表单 -->
      <div id="custom-modal-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-3">
        <div>
          <div class="text-[9px] font-mono mb-1" style="color:#8b949e;letter-spacing:2px;">WORLD TYPE — 世界观</div>
          <input id="custom-world" type="text" placeholder="都市豪门 / 末世废土 / 玄幻修仙…（留空AI自由发挥）"
            value="${form.world}"
            class="w-full rounded-lg px-3 py-2 bg-transparent outline-none text-[13px]"
            style="color:#e6edf3;border:1px solid rgba(255,255,255,0.1);" />
        </div>
        <div>
          <div class="text-[9px] font-mono mb-1" style="color:#8b949e;letter-spacing:2px;">NAME — 副本名称</div>
          <input id="custom-name" type="text" placeholder="（留空AI自动命名）"
            value="${form.name}"
            class="w-full rounded-lg px-3 py-2 bg-transparent outline-none text-[13px]"
            style="color:#e6edf3;border:1px solid rgba(255,255,255,0.1);" />
        </div>
        <div>
          <div class="text-[9px] font-mono mb-1.5" style="color:#8b949e;letter-spacing:2px;">CAST — 参与角色（可多选）</div>
          ${contacts.length === 0
            ? `<div class="text-[12px]" style="color:#8b949e;">暂无联系人，AI将自行创建NPC</div>`
            : `<div class="flex flex-wrap gap-1.5">
              ${contacts.map(c => {
                const sel = form.selectedChars.includes(c.id);
                const av  = c.avatar
                  ? `<img src="${c.avatar}" class="w-5 h-5 rounded-full object-cover shrink-0" />`
                  : npcAvatar(c.name, 'w-5 h-5', '9px');
                return `
                <button onclick="window.transActions.toggleCustomChar('${c.id}')"
                  class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold active:scale-95 transition-all"
                  style="${sel
                    ? 'background:rgba(88,212,245,0.15);border:1px solid rgba(88,212,245,0.4);color:#58d4f5;'
                    : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;'}">
                  ${av}${c.name}
                </button>`;
              }).join('')}
            </div>`}
        </div>
        <div>
          <div class="text-[9px] font-mono mb-1" style="color:#8b949e;letter-spacing:2px;">BRIEFING — 剧情简介</div>
          <textarea id="custom-briefing" rows="3" placeholder="（留空AI完全自由发挥）"
            class="w-full rounded-lg px-3 py-2 bg-transparent outline-none text-[13px] resize-none hide-scrollbar"
            style="color:#e6edf3;border:1px solid rgba(255,255,255,0.1);">${form.briefing}</textarea>
        </div>
        <div>
          <div class="text-[9px] font-mono mb-1" style="color:#8b949e;letter-spacing:2px;">OBJECTIVE — 任务目标</div>
          <input id="custom-target" type="text" placeholder="（留空AI自动设定）"
            value="${form.target}"
            class="w-full rounded-lg px-3 py-2 bg-transparent outline-none text-[13px]"
            style="color:#e6edf3;border:1px solid rgba(255,255,255,0.1);" />
        </div>
        <div>
          <div class="text-[9px] font-mono mb-1.5" style="color:#8b949e;letter-spacing:2px;">DIFFICULTY — 难度</div>
          <div class="flex gap-1.5">
            ${[1,2,3,4].map(d => {
              const colors = ['#3fb950','#58d4f5','#ffa64d','#f85149'];
              const labels = ['新手','进阶','困难','地狱'];
              const sel = form.difficulty === d;
              return `<button onclick="window.transActions.setCustomDifficulty(${d})"
                class="flex-1 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                style="${sel
                  ? `background:rgba(${d===1?'63,185,80':d===2?'88,212,245':d===3?'255,166,77':'248,81,73'},0.15);border:1px solid ${colors[d-1]};color:${colors[d-1]};`
                  : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);color:#8b949e;'}">
                ${'★'.repeat(d)} ${labels[d-1]}
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-mono" style="color:#8b949e;letter-spacing:1px;">REWARD</span>
          ${(() => { const r = DIFF_REWARDS[form.difficulty] || DIFF_REWARDS[2]; return `
          <span class="text-[11px] font-mono font-bold" style="color:#3fb950;">+${r.points} pts</span>
          <span class="text-[11px] font-mono font-bold" style="color:#bc8cff;">+${r.exp} exp</span>`; })()}
        </div>
      </div>

      <!-- 按钮区 -->
      <div class="shrink-0 p-4 space-y-2" style="border-top:1px solid rgba(255,255,255,0.07);">
        <button onclick="window.transActions.generateScript()"
          class="w-full py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 ${genBusy ? 'opacity-60 pointer-events-none' : ''}"
          style="background:rgba(188,140,255,0.1);border:1px solid rgba(188,140,255,0.25);color:#bc8cff;">
          ${genBusy
            ? `<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> AI生成中...`
            : '✦ AI写剧本（自动填充空白字段）'}
        </button>
        <div class="flex gap-2">
          <button onclick="window.transActions.closeCustomModal()"
            class="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
            style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;">取消</button>
          <button onclick="window.transActions.startCustomDungeon()"
            class="flex-1 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform ${genBusy ? 'opacity-50 pointer-events-none' : ''}"
            style="background:rgba(63,185,80,0.1);border:1px solid rgba(63,185,80,0.3);color:#3fb950;">
            ${genBusy ? '请稍候...' : '接取副本 ›'}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── 副本文游主界面 ───────────────────────────────────────────────
function renderActiveDungeon() {
  const state   = window.transState;
  const dungeon = state.activeDungeon;
  const st      = dungeon.status;
  const isGen   = state.generatingTurn;

  // 状态条颜色
  const hpColor  = st.survival > 50 ? '#3fb950' : st.survival > 25 ? '#ffa64d' : '#f85149';
  const prgColor = '#58d4f5';
  const affEntries = Object.entries(st.affections || {});
  const totalAff = affEntries.length;

  // 日志渲染
  const logHtml = dungeon.log.map(e => {
    if (e.type === 'action') return `
      <div class="flex justify-end mb-2">
        <div class="max-w-[85%] px-3 py-2 rounded-xl rounded-tr-sm text-[12px]"
          style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.2);color:#58d4f5;">
          ▶ ${e.text}
        </div>
      </div>`;
    if (e.type === 'system') return `
      <div class="text-center py-1">
        <span class="text-[10px] font-mono px-2 py-0.5 rounded"
          style="color:#ffa64d;background:rgba(255,166,77,0.06);border:1px solid rgba(255,166,77,0.15);">${e.text}</span>
      </div>`;
    return `
      <div class="rounded-xl p-3.5 mb-2" style="background:#161b22;border:1px solid rgba(255,255,255,0.05);">
        <div class="text-[13px] leading-relaxed" style="color:#c9d1d9;">${e.text.replace(/\n/g, '<br/>')}</div>
      </div>`;
  }).join('');

  // 选项渲染（支持结构化 options + 厄运罗盘高亮）
  const compassActive = !!dungeon._compassHint;
  const choicesHtml = isGen
    ? `<div class="flex items-center justify-center gap-2 py-3" style="color:#8b949e;">
        <span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span>
        <span class="text-[12px]">AI正在生成剧情...</span>
       </div>`
    : dungeon.completed
      ? ''
      : dungeon.choices.map((c, i) => {
          // 兼容旧存档：字符串当 custom 处理
          const text = typeof c === 'string' ? c : (c.text || '');
          const type = typeof c === 'string' ? 'custom' : (c.type || 'custom');
          const isTrap = type === 'trap' && compassActive;
          const bg   = isTrap ? 'rgba(248,81,73,0.08)' : '#161b22';
          const brd  = isTrap ? '1px solid rgba(248,81,73,0.5)' : '1px solid rgba(255,255,255,0.07)';
          const txt  = isTrap ? '#f85149' : '#c9d1d9';
          const mark = isTrap
            ? `<span style="color:#f85149;font-weight:900;margin-right:4px;" title="罗盘警告">⚠</span>`
            : `<span style="color:#58d4f5;font-weight:700;">▸</span> `;
          return `
          <button onclick="window.transActions.dungeonChoose(${i})"
            class="w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] active:scale-[0.98] transition-transform"
            style="background:${bg};border:${brd};color:${txt};">
            ${mark}${text}
          </button>`;
        }).join('');

  // 完成覆盖层（区分 TE / 普通通关 / BE 死亡）
  let completionOverlay = '';
  if (dungeon.completed) {
    if (dungeon.isBadEnding) {
      // BE：血红色死亡面板 + 时光回溯
      const rewindCard = (store.transData?.player?.inventory || []).find(x => x.id === 'rewind');
      const rewindQty  = rewindCard?.qty || 0;
      const histAvail  = (dungeon.history || []).map(h => h.turn).filter(t => t >= 0);
      const minT = histAvail.length ? Math.min(...histAvail) : 0;
      const maxT = histAvail.length ? Math.max(...histAvail) : dungeon.turn;
      const target = state.rewindTargetTurn !== '' ? state.rewindTargetTurn : String(maxT);
      completionOverlay = `
      <div class="absolute inset-0 z-20 flex items-center justify-center p-5"
        style="background:radial-gradient(circle at 50% 45%, rgba(120,0,10,0.65), rgba(0,0,0,0.92));backdrop-filter:blur(6px);">
        <div class="w-full rounded-2xl p-6" style="background:#1a0909;border:1px solid rgba(248,81,73,0.55);box-shadow:0 0 40px rgba(248,81,73,0.25);">
          <div class="text-center mb-3">
            <div class="text-4xl mb-1">💀</div>
            <div class="text-[10px] font-mono mb-1" style="color:#f85149;letter-spacing:4px;">BAD&nbsp;ENDING</div>
            <div class="text-[18px] font-black" style="color:#ffd0cf;">任务失败 · 命运终止</div>
          </div>
          <div class="rounded-lg p-3 mb-4 text-[12px] leading-relaxed" style="background:rgba(248,81,73,0.07);border:1px solid rgba(248,81,73,0.2);color:#e6b4b2;">
            ${dungeon.completionMsg}
          </div>
          <div class="rounded-lg p-3 mb-4" style="background:rgba(0,0,0,0.35);border:1px solid rgba(248,81,73,0.25);">
            <div class="text-[10px] font-mono mb-2" style="color:#f85149;letter-spacing:2px;">⏪ 时光回溯</div>
            <div class="text-[11px] mb-2" style="color:#c9d1d9;">可回溯到：第 ${minT}–${maxT} 回合 &nbsp;·&nbsp; 回溯卡 ×${rewindQty}</div>
            <div class="flex gap-2 mb-2">
              <input id="trans-rewind-input" type="number" min="${minT}" max="${maxT}" value="${target}"
                oninput="window.transActions.setRewindTarget(this.value)"
                class="flex-1 rounded-lg px-3 py-2 bg-transparent outline-none text-[13px]"
                style="color:#ffd0cf;border:1px solid rgba(248,81,73,0.35);" />
              <button onclick="window.transActions.doRewind()"
                class="px-3 py-2 rounded-lg text-[12px] font-bold active:scale-95 transition-transform"
                style="background:rgba(248,81,73,0.14);border:1px solid rgba(248,81,73,0.4);color:#f85149;">
                ${rewindQty > 0 ? '消耗回溯卡' : '前往购买'}
              </button>
            </div>
            <div class="text-[10px]" style="color:#8b949e;">消耗 1 张【时间回溯卡】可恢复到指定回合继续游戏。</div>
          </div>
          <div class="flex gap-2">
            <button onclick="window.transActions.acceptBadEnding()"
              class="flex-1 py-2.5 rounded-xl font-bold text-[13px] active:scale-95 transition-transform"
              style="background:rgba(139,148,158,0.1);border:1px solid rgba(139,148,158,0.3);color:#c9d1d9;">接受失败结算</button>
          </div>
        </div>
      </div>`;
    } else {
      // 成功通关（含 TE）
      const isTE = !!dungeon.isTrueEnding;
      const hasContract = (store.transData?.player?.inventory || []).some(x => x.id === 'contract' && x.qty > 0);
      const hasOrigNpcs = (dungeon.script?.original_npcs || []).length > 0;
      completionOverlay = `
      <div class="absolute inset-0 z-20 flex items-center justify-center p-5"
        style="background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);">
        <div class="w-full rounded-2xl p-6 text-center" style="background:#161b22;border:1px solid ${isTE ? 'rgba(255,196,0,0.55)' : 'rgba(63,185,80,0.4)'};${isTE ? 'box-shadow:0 0 32px rgba(255,196,0,0.18);' : ''}">
          <div class="text-4xl mb-2">${isTE ? '✨' : '🎉'}</div>
          <div class="text-[9px] font-mono mb-1" style="color:${isTE ? '#ffc400' : '#3fb950'};letter-spacing:3px;">${isTE ? 'TRUE ENDING' : 'MISSION COMPLETE'}</div>
          <div class="text-[18px] font-black mb-2" style="color:#e6edf3;">${dungeon.mission.name}</div>
          <div class="text-[12px] leading-relaxed mb-4" style="color:#8b949e;">${dungeon.completionMsg}</div>
          <div class="flex justify-center gap-8 mb-5">
            <div><div class="text-[22px] font-black font-mono" style="color:#58d4f5;">+${dungeon.mission.reward?.points || 200}${isTE ? '×2' : ''}</div><div class="text-[10px]" style="color:#8b949e;">积分</div></div>
            <div><div class="text-[22px] font-black font-mono" style="color:#bc8cff;">+${dungeon.mission.reward?.exp || 50}${isTE ? '×2' : ''}</div><div class="text-[10px]" style="color:#8b949e;">经验</div></div>
          </div>
          ${isTE && hasOrigNpcs ? `
          <div class="rounded-lg p-3 mb-3 text-left" style="background:rgba(255,196,0,0.06);border:1px solid rgba(255,196,0,0.3);">
            <div class="text-[10px] font-mono mb-1" style="color:#ffc400;letter-spacing:2px;">📜 灵魂印记契约</div>
            <div class="text-[12px] leading-relaxed mb-2" style="color:#c9d1d9;">是否消耗【灵魂印记契约】带回该世界的原创人物？</div>
            <button onclick="window.transActions.openTeExtract()"
              class="w-full py-2 rounded-lg text-[12px] font-bold active:scale-95 transition-transform"
              style="background:rgba(255,196,0,0.12);border:1px solid rgba(255,196,0,0.4);color:#ffc400;">
              ${hasContract ? '✦ 选择 NPC 并签订契约' : '✦ 前往商城购买契约'}
            </button>
          </div>` : ''}
          <button onclick="window.transActions.completeDungeon()"
            class="w-full py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform"
            style="background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);color:#3fb950;">结算并退出</button>
        </div>
      </div>`;
    }
  }

  // TE 提取弹窗
  const teModal = state.teModalOpen ? (() => {
    const npcs = dungeon.script?.original_npcs || [];
    const selected = state.teNpcChoice;
    const busy = state.teExtracting;
    return `
    <div class="absolute inset-0 z-30 flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.9);backdrop-filter:blur(6px);"
      onclick="window.transActions.closeTeExtract()">
      <div class="w-full rounded-2xl flex flex-col overflow-hidden"
        style="background:#161b22;border:1px solid rgba(255,196,0,0.4);max-height:88vh;"
        onclick="event.stopPropagation()">
        <div class="shrink-0 px-4 py-3" style="border-bottom:1px solid rgba(255,255,255,0.07);">
          <div class="text-[9px] font-mono" style="color:#ffc400;letter-spacing:3px;">SOUL CONTRACT</div>
          <div class="text-[16px] font-black" style="color:#e6edf3;">📜 灵魂印记契约</div>
        </div>
        <div class="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-2">
          <div class="text-[12px] mb-2" style="color:#8b949e;">选择一位要带回主神空间的原创 NPC：</div>
          ${npcs.length === 0 ? `<div class="text-[12px]" style="color:#8b949e;">本副本没有原创 NPC 可带回。</div>` : npcs.map(n => {
            const sel = selected === n.name;
            return `
            <button onclick="window.transActions.pickTeNpc('${(n.name || '').replace(/'/g,"\\'")}')"
              class="w-full rounded-xl p-3 text-left active:scale-[0.98] transition-transform"
              style="background:${sel ? 'rgba(255,196,0,0.1)' : '#0d1117'};border:1px solid ${sel ? 'rgba(255,196,0,0.5)' : 'rgba(255,255,255,0.07)'};">
              <div class="text-[13px] font-bold mb-0.5" style="color:${sel ? '#ffc400' : '#e6edf3'};">${n.name}${n.gender ? ` · ${n.gender}` : ''}</div>
              <div class="text-[10px] mb-1" style="color:#8b949e;">${n.identity || '—'}</div>
              <div class="text-[11px] leading-relaxed" style="color:#c9d1d9;">${n.personality || ''}${n.role_in_plot ? `；${n.role_in_plot}` : ''}</div>
            </button>`;
          }).join('')}
        </div>
        <div class="shrink-0 p-3 flex gap-2" style="border-top:1px solid rgba(255,255,255,0.07);">
          <button onclick="window.transActions.closeTeExtract()"
            class="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
            style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;">取消</button>
          <button onclick="window.transActions.confirmTeExtract()"
            class="flex-1 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform ${(!selected || busy) ? 'opacity-50 pointer-events-none' : ''}"
            style="background:rgba(255,196,0,0.12);border:1px solid rgba(255,196,0,0.4);color:#ffc400;">
            ${busy ? `<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> 提取灵魂档案中...` : '消耗契约 · 带回'}
          </button>
        </div>
      </div>
    </div>`;
  })() : '';

  // 好感度面板
  const affPanel = state.dungeonAffOpen ? `
  <div class="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3 pt-2"
    style="background:#161b22;border-top:1px solid rgba(255,255,255,0.07);">
    <div class="text-[9px] font-mono mb-2" style="color:#8b949e;letter-spacing:2px;">AFFECTION — 角色好感度</div>
    ${affEntries.length === 0
      ? `<div class="text-[12px]" style="color:#8b949e;">尚未与任何角色建立好感</div>`
      : `<div class="space-y-1.5">
          ${affEntries.map(([name, val]) => {
            const pct = Math.min(100, Math.max(0, val));
            const color = val >= 60 ? '#3fb950' : val >= 30 ? '#bc8cff' : val >= 0 ? '#58d4f5' : '#f85149';
            return `
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold shrink-0" style="color:#e6edf3;min-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
              <div class="flex-1 h-1.5 rounded-full" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);">
                <div class="h-full rounded-full" style="width:${pct}%;background:${color};transition:width .3s;"></div>
              </div>
              <span class="text-[11px] font-mono shrink-0" style="color:${color};min-width:28px;text-align:right;">${val}</span>
            </div>`;
          }).join('')}
         </div>`}
  </div>` : '';

  // 道具面板
  const shopInv = (store.transData?.player?.inventory || []).filter(x => x.qty > 0);
  const invPanel = state.dungeonInvOpen ? `
  <div class="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3 pt-2 max-h-[60%] overflow-y-auto hide-scrollbar"
    style="background:#161b22;border-top:1px solid rgba(255,255,255,0.07);">
    <div class="text-[9px] font-mono mb-2" style="color:#8b949e;letter-spacing:2px;">INVENTORY — 副本获得</div>
    ${dungeon.inventory.length === 0
      ? `<div class="text-[12px] mb-3" style="color:#8b949e;">暂无副本道具</div>`
      : `<div class="flex flex-wrap gap-1.5 mb-3">
          ${dungeon.inventory.map(it => `
          <span class="text-[11px] px-2 py-0.5 rounded-lg"
            style="background:rgba(188,140,255,0.1);border:1px solid rgba(188,140,255,0.2);color:#bc8cff;">${it}</span>`).join('')}
         </div>`}
    <div class="text-[9px] font-mono mb-2" style="color:#8b949e;letter-spacing:2px;">BACKPACK — 系统背包</div>
    ${shopInv.length === 0
      ? `<div class="text-[12px]" style="color:#8b949e;">背包空空如也</div>`
      : `<div class="grid grid-cols-2 gap-1.5">
          ${shopInv.map(inv => {
            const item = SHOP_ITEMS.find(s => s.id === inv.id);
            if (!item) return '';
            return `
            <button onclick="window.transActions.useShopItem('${item.id}')"
              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left active:scale-95 transition-transform"
              style="background:rgba(88,212,245,0.06);border:1px solid rgba(88,212,245,0.2);">
              <span class="text-[14px]">${item.icon}</span>
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold truncate" style="color:#e6edf3;">${item.name}</div>
                <div class="text-[9px]" style="color:#58d4f5;">×${inv.qty} · 点击使用</div>
              </div>
            </button>`;
          }).join('')}
         </div>`}
  </div>` : '';

  return `
  <div class="w-full h-full flex flex-col relative overflow-hidden"
    style="background:#0d1117 !important;color:#e6edf3;">

    <!-- 顶部标题栏 -->
    <div class="shrink-0 pt-10 px-3 pb-2.5 flex items-center gap-2"
      style="background:#161b22;border-bottom:1px solid rgba(56,139,253,0.15);">
      <button onclick="window.transActions.exitDungeon()"
        class="flex items-center gap-0.5 text-[12px] font-bold active:scale-90 transition-transform shrink-0"
        style="color:#f85149;">
        <i data-lucide="chevron-left" style="width:15px;height:15px;"></i>退出
      </button>
      <div class="flex-1 min-w-0 text-center">
        <div class="text-[9px] font-mono" style="color:#8b949e;letter-spacing:2px;">${dungeon.mission.world || 'DUNGEON'}</div>
        <div class="text-[14px] font-black truncate" style="color:#e6edf3;">${dungeon.mission.name}</div>
      </div>
      <div class="text-[10px] font-mono shrink-0" style="color:#8b949e;">回合 ${dungeon.turn}</div>
    </div>

    <!-- 状态条 -->
    <div class="shrink-0 px-3 py-2 grid grid-cols-4 gap-1.5" style="background:#0d1f2d;border-bottom:1px solid rgba(88,212,245,0.08);">
      <div class="rounded-lg px-2 py-1 text-center" style="background:rgba(0,0,0,0.3);">
        <div class="text-[9px] font-mono" style="color:#8b949e;">生存</div>
        <div class="text-[13px] font-black font-mono" style="color:${hpColor};">${st.survival}</div>
      </div>
      <div class="rounded-lg px-2 py-1 text-center" style="background:rgba(0,0,0,0.3);">
        <div class="text-[9px] font-mono" style="color:#8b949e;">进度</div>
        <div class="text-[13px] font-black font-mono" style="color:${prgColor};">${st.progress}%</div>
      </div>
      <button onclick="window.transActions.toggleDungeonInv()"
        class="rounded-lg px-2 py-1 text-center active:scale-95 transition-transform"
        style="background:rgba(0,0,0,0.3);border:1px solid ${state.dungeonInvOpen ? 'rgba(188,140,255,0.3)' : 'transparent'};">
        <div class="text-[9px] font-mono" style="color:#8b949e;">道具</div>
        <div class="text-[13px] font-black font-mono" style="color:#bc8cff;">${dungeon.inventory.length}</div>
      </button>
      <button onclick="window.transActions.toggleDungeonAff()"
        class="rounded-lg px-2 py-1 text-center active:scale-95 transition-transform"
        style="background:rgba(0,0,0,0.3);border:1px solid ${state.dungeonAffOpen ? 'rgba(248,81,73,0.3)' : 'transparent'};">
        <div class="text-[9px] font-mono" style="color:#8b949e;">好感</div>
        <div class="text-[13px] font-black font-mono" style="color:#f85149;">${totalAff}</div>
      </button>
    </div>

    <!-- 剧情日志 -->
    <div id="dungeon-log-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-3">
      ${logHtml}
      ${isGen ? `<div class="flex justify-center py-3"><span class="text-[11px] font-mono" style="color:#58d4f5;animation:pulse 1.5s ease-in-out infinite;">▌</span></div>` : ''}
    </div>

    <!-- 行动选项 -->
    ${!dungeon.completed ? `
    <div class="shrink-0 px-3 pt-2 pb-3 space-y-1.5" style="background:#0d1117;border-top:1px solid rgba(255,255,255,0.06);">
      ${choicesHtml}
      ${!isGen ? `
      <div class="flex gap-2 mt-1">
        <input id="dungeon-custom-input" type="text" placeholder="自定义行动..."
          class="flex-1 rounded-xl px-3 py-2 bg-transparent outline-none text-[12px]"
          style="color:#e6edf3;border:1px solid rgba(255,255,255,0.08);"
          onkeydown="if(event.key==='Enter')window.transActions.dungeonCustomAction()" />
        <button onclick="window.transActions.dungeonCustomAction()"
          class="shrink-0 px-3 py-2 rounded-xl text-[12px] font-bold"
          style="background:rgba(88,212,245,0.08);border:1px solid rgba(88,212,245,0.2);color:#58d4f5;">执行</button>
      </div>` : ''}
    </div>` : ''}

    ${state.dungeonAffOpen ? affPanel : ''}
    ${state.dungeonInvOpen && !state.dungeonAffOpen ? invPanel : ''}
    ${completionOverlay}
    ${teModal}
    ${state.rewindModalOpen && !dungeon.completed ? renderRewindModal(dungeon) : ''}
  </div>`;
}

function renderRewindModal(dungeon) {
  const state = window.transState;
  const histTurns = (dungeon.history || []).map(h => h.turn);
  if (!histTurns.length) return '';
  const minT = Math.min(...histTurns);
  const maxT = Math.max(...histTurns);
  const target = state.rewindTargetTurn !== '' ? state.rewindTargetTurn : String(maxT);
  const rewindSlot = (store.transData?.player?.inventory || []).find(x => x.id === 'rewind');
  const qty = rewindSlot?.qty || 0;
  return `
  <div class="absolute inset-0 z-30 flex items-center justify-center p-4"
    style="background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);"
    onclick="window.transActions.closeRewindModal()">
    <div class="w-full rounded-2xl p-5" style="background:#161b22;border:1px solid rgba(88,212,245,0.35);"
      onclick="event.stopPropagation()">
      <div class="text-[9px] font-mono mb-1" style="color:#58d4f5;letter-spacing:3px;">TIME REWIND</div>
      <div class="text-[16px] font-black mb-3" style="color:#e6edf3;">⏪ 时光回溯</div>
      <div class="text-[11px] mb-2" style="color:#c9d1d9;">可回溯到：第 ${minT}–${maxT} 回合 &nbsp;·&nbsp; 回溯卡 ×${qty}</div>
      <div class="flex gap-2 mb-3">
        <input type="number" min="${minT}" max="${maxT}" value="${target}"
          oninput="window.transActions.setRewindTarget(this.value)"
          class="flex-1 rounded-lg px-3 py-2 bg-transparent outline-none text-[13px]"
          style="color:#e6edf3;border:1px solid rgba(88,212,245,0.3);" />
        <button onclick="window.transActions.doRewind()"
          class="px-3 py-2 rounded-lg text-[12px] font-bold active:scale-95 transition-transform"
          style="background:rgba(88,212,245,0.12);border:1px solid rgba(88,212,245,0.4);color:#58d4f5;">
          ${qty > 0 ? '消耗回溯' : '前往购买'}
        </button>
      </div>
      <button onclick="window.transActions.closeRewindModal()"
        class="w-full py-2.5 rounded-xl text-[13px] font-bold"
        style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;">关闭</button>
    </div>
  </div>`;
}

// ─── 各 Tab 渲染 ──────────────────────────────────────────────────
function renderTerminal(player, pName, pAvatar, pId, title) {
  const expPct = Math.min(100, Math.round(player.exp / player.expToNext * 100));
  const activeWorld = player.activeWorldId ? MISSIONS.find(m => m.id === player.activeWorldId) : null;
  const invCount = (player.inventory || []).length;
  const savedDungeon = store.transData?.savedDungeon;

  const isBanned = window.transState.isBanned;
  return `
  <div class="p-4 space-y-3">
    ${isBanned ? `
    <div class="rounded-xl px-4 py-3 flex items-center gap-2" style="background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.4);">
      <i data-lucide="ban" style="width:16px;height:16px;color:#f85149;flex-shrink:0;"></i>
      <div>
        <div class="text-[13px] font-black" style="color:#f85149;">账号已被封禁</div>
        <div class="text-[11px]" style="color:#8b949e;">您无法发布内容，如有异议请联系管理员。</div>
      </div>
    </div>` : ''}
    <div class="rounded-2xl p-4 relative overflow-hidden" style="background:linear-gradient(135deg,#0d1f2d,#0d1117);border:1px solid ${isBanned ? 'rgba(248,81,73,0.35)' : 'rgba(88,212,245,0.35)'};box-shadow:0 0 20px ${isBanned ? 'rgba(248,81,73,0.08)' : 'rgba(88,212,245,0.08)'};">
      <div class="absolute top-0 right-0 w-32 h-32 opacity-5" style="background:radial-gradient(circle,#58d4f5,transparent);"></div>
      <div class="absolute bottom-0 left-0 w-24 h-24 opacity-5" style="background:radial-gradient(circle,#bc8cff,transparent);"></div>
      <div class="flex items-start relative z-10 gap-3">
        <div class="relative shrink-0 cursor-pointer group" onclick="document.getElementById('trans-avatar-upload').click()">
          <div class="rounded-xl overflow-hidden" style="width:72px;height:72px;border:2px solid rgba(88,212,245,0.5);box-shadow:0 0 12px rgba(88,212,245,0.3);">
            ${pAvatar
              ? `<img src="${pAvatar}" class="w-full h-full object-cover" />`
              : `<div class="w-full h-full flex items-center justify-center text-2xl font-bold" style="background:#1c2d3d;color:#58d4f5;">${pName[0] || '?'}</div>`}
          </div>
          <div class="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity" style="background:rgba(0,0,0,0.45);">
            <i data-lucide="camera" style="width:18px;height:18px;color:#fff;"></i>
          </div>
          <div class="absolute -bottom-1 -right-1 text-[10px] font-black px-1.5 rounded" style="background:#0d1f2d;border:1px solid rgba(88,212,245,0.4);color:#58d4f5;">Lv.${player.level}</div>
        </div>
        <input type="file" id="trans-avatar-upload" accept="image/*" class="hidden" onchange="window.transActions.uploadAvatar(event)" />
        <div class="flex-1 min-w-0">
          <div class="text-[9px] font-mono mb-0.5" style="color:#8b949e;letter-spacing:2px;">${pId}${window.transState.isAdmin ? ' 🔑' : ''}</div>
          <input type="text" value="${pName}"
            onkeydown="if(event.key==='Enter')this.blur()"
            onblur="window.transActions.saveName(this.value)"
            onfocus="this.style.borderBottomColor='rgba(88,212,245,0.5)'"
            class="text-[18px] font-black bg-transparent outline-none w-full mb-0.5"
            style="color:#e6edf3;border-bottom:1px solid transparent;" />
          <div class="text-[11px] font-bold mb-2" style="color:#bc8cff;">${title}</div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 rounded-full" style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.15);">
              <div class="h-full rounded-full" style="width:${expPct}%;background:linear-gradient(90deg,#58d4f5,#bc8cff);box-shadow:0 0 6px rgba(88,212,245,0.5);"></div>
            </div>
            <span class="text-[9px] font-mono shrink-0" style="color:#8b949e;">${player.exp}/${player.expToNext}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      ${[
        { label: '积分余额', val: player.points.toLocaleString(), color: '#58d4f5' },
        { label: '完成副本', val: player.completedWorlds, color: '#3fb950' },
        { label: '道具库存', val: invCount, color: '#bc8cff' },
      ].map(s => `
        <div class="rounded-xl p-3 text-center" style="background:#161b22;border:1px solid rgba(255,255,255,0.05);">
          <div class="text-lg font-black" style="color:${s.color};font-family:monospace;">${s.val}</div>
          <div class="text-[10px] mt-0.5" style="color:#8b949e;">${s.label}</div>
        </div>`).join('')}
    </div>

    ${savedDungeon ? `
    <div class="rounded-xl p-3 flex items-center gap-3" style="background:rgba(63,185,80,0.06);border:1px solid rgba(63,185,80,0.35);">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:rgba(63,185,80,0.1);border:1px solid rgba(63,185,80,0.2);">
        <i data-lucide="pause-circle" style="width:16px;height:16px;color:#3fb950;"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-[10px]" style="color:#3fb950;">副本暂停中</div>
        <div class="text-[13px] font-bold truncate" style="color:#e6edf3;">${savedDungeon.mission?.name || '未命名副本'}</div>
        <div class="text-[10px]" style="color:#8b949e;">第${savedDungeon.turn}回合 · 进度${savedDungeon.status?.progress ?? 0}%</div>
      </div>
      <button onclick="window.transActions.resumeDungeon()" class="text-[11px] font-bold px-2 py-1 rounded-lg shrink-0" style="background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);color:#3fb950;">继续</button>
    </div>` : activeWorld ? `
    <div class="rounded-xl p-3 flex items-center gap-3" style="background:#0d1f2d;border:1px solid rgba(88,212,245,0.25);">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.2);">
        <i data-lucide="zap" style="width:16px;height:16px;color:#58d4f5;"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-[10px]" style="color:#8b949e;">正在执行副本</div>
        <div class="text-[14px] font-bold truncate" style="color:#e6edf3;">${activeWorld.name}</div>
      </div>
      <button onclick="window.transActions.setTab('mission')" class="text-[11px] font-bold px-2 py-1 rounded-lg shrink-0" style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.25);color:#58d4f5;">查看</button>
    </div>` : `
    <div class="rounded-xl p-3 flex items-center gap-3" style="background:#161b22;border:1px dashed rgba(255,255,255,0.07);">
      <i data-lucide="inbox" style="width:16px;height:16px;color:#8b949e;"></i>
      <span class="text-[13px]" style="color:#8b949e;">暂无进行中的副本任务</span>
      <button onclick="window.transActions.setTab('mission')" class="ml-auto text-[11px] font-bold px-2 py-1 rounded-lg" style="background:rgba(63,185,80,0.1);border:1px solid rgba(63,185,80,0.25);color:#3fb950;">选择副本</button>
    </div>`}

    <div class="rounded-xl p-3" style="background:#161b22;border:1px solid rgba(255,255,255,0.05);">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[12px] font-bold" style="color:#8b949e;letter-spacing:1px;">▸ 道具背包</span>
        <button onclick="window.transActions.setTab('shop')" class="text-[10px] font-bold" style="color:#58d4f5;">前往商城</button>
      </div>
      ${invCount === 0
        ? `<div class="text-[12px] text-center py-2" style="color:#8b949e;">背包空空如也</div>`
        : `<div class="flex flex-wrap gap-1.5">${(player.inventory || []).map(inv => {
            const item = SHOP_ITEMS.find(i => i.id === inv.id);
            return item ? `<div class="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]" style="background:rgba(88,212,245,0.06);border:1px solid rgba(88,212,245,0.15);color:#e6edf3;">${item.icon} ${item.name} <span style="color:#58d4f5;">×${inv.qty}</span></div>` : '';
          }).join('')}</div>`}
    </div>
  </div>`;
}

function renderShop(player) {
  const inv = player.inventory || [];
  return `
  <div class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <div class="text-[11px] font-mono" style="color:#8b949e;letter-spacing:2px;">SYSTEM STORE — 道具补给站</div>
      <div class="text-[13px] font-black font-mono" style="color:#58d4f5;">余额 ${player.points.toLocaleString()} pts</div>
    </div>
    <div class="grid grid-cols-2 gap-2.5">
      ${SHOP_ITEMS.map(item => {
        const owned = inv.find(i => i.id === item.id);
        const canAfford = player.points >= item.price;
        return `
        <div class="rounded-xl p-3 flex flex-col relative" style="background:#161b22;border:1px solid rgba(255,255,255,0.06);">
          ${owned ? `<div class="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded font-bold" style="background:rgba(63,185,80,0.15);color:#3fb950;border:1px solid rgba(63,185,80,0.25);">持有×${owned.qty}</div>` : ''}
          <div class="text-2xl mb-1">${item.icon}</div>
          <div class="text-[13px] font-bold leading-tight mb-1" style="color:#e6edf3;">${item.name}</div>
          <span class="self-start text-[9px] px-1.5 py-0.5 rounded-full font-bold mb-1.5" style="${tagStyle(item.tag)}">${item.tag}</span>
          <div class="text-[11px] leading-relaxed flex-1" style="color:#8b949e;">${item.desc}</div>
          <button onclick="window.transActions.buyItem('${item.id}')" class="mt-2.5 w-full py-1.5 rounded-lg text-[12px] font-bold transition-all active:scale-95 shrink-0 ${canAfford ? '' : 'opacity-40 cursor-not-allowed'}" style="${canAfford ? 'background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.3);color:#58d4f5;' : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;'}">
            ${item.price} pts ${canAfford ? '购买' : '积分不足'}
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderForumDetail(pName, pAvatar, pId) {
  const state = window.transState;
  const post  = state.forumDetail;
  const allComments  = state.forumComments || [];
  const isLoading    = state.loadingComments;
  const replyTarget  = state.replyTarget;
  const isAdmin      = state.isAdmin;
  const isMe_post    = post.author_id === pId;
  const liked        = state.likedPosts.has(post.id);

  const postAv = isMe_post
    ? myAvatar(pAvatar, pName, 'w-8 h-8', '14px')
    : post.author_avatar
      ? `<img src="${post.author_avatar}" class="w-8 h-8 rounded-full object-cover shrink-0" />`
      : npcAvatar(post.author_name, 'w-8 h-8', '14px');

  // ── 构造评论树 ──────────────────────────────────────────────────
  const roots = allComments.filter(c => !c.parent_id);
  const childrenMap = {};
  allComments.forEach(c => {
    if (c.parent_id) (childrenMap[c.parent_id] = childrenMap[c.parent_id] || []).push(c);
  });
  roots.sort((a, b) => {
    const ha = (a.likes || 0) + (childrenMap[a.id]?.length || 0);
    const hb = (b.likes || 0) + (childrenMap[b.id]?.length || 0);
    return hb - ha;
  });
  Object.values(childrenMap).forEach(arr =>
    arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  );

  function commentCard(c, isRoot, rootId) {
    const isMe   = c.author_id === pId;
    const cLiked = state.likedComments.has(c.id);
    const av     = isMe ? myAvatar(pAvatar, pName, 'w-6 h-6', '10px') : npcAvatar(c.author_name, 'w-6 h-6', '10px');
    const safeName = c.author_name.replace(/'/g, '&#39;');
    return `
    <div class="flex gap-2 py-2">
      ${av}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="text-[11px] font-bold" style="color:${isMe ? '#58d4f5' : '#c9d1d9'};">${c.author_name}</span>
          <span class="text-[9px] font-mono" style="color:#8b949e;">${tsAgo(c.created_at)}</span>
        </div>
        <div class="text-[12px] leading-relaxed" style="color:#c9d1d9;">${c.content}</div>
        <div class="flex items-center gap-3 mt-1.5">
          <button onclick="window.transActions.likeComment('${c.id}')"
            class="flex items-center gap-1 text-[10px] active:scale-90 transition-transform"
            style="color:${cLiked ? '#f85149' : '#8b949e'};">
            <i data-lucide="heart" style="width:11px;height:11px;${cLiked ? 'fill:#f85149;color:#f85149;' : ''}"></i>${c.likes || 0}
          </button>
          <button onclick="window.transActions.setReplyTarget('${c.id}','${safeName}','${rootId}',${!isRoot})"
            class="text-[10px] active:scale-90 transition-transform" style="color:#8b949e;">回复</button>
          ${(isAdmin || isMe) ? `
          <button onclick="window.transActions.deleteComment('${c.id}')"
            class="text-[10px] active:scale-90 transition-transform" style="color:rgba(248,81,73,0.7);">删除</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  const commentsHtml = isLoading
    ? loadingSkeleton(3)
    : roots.length === 0
      ? `<div class="text-center py-8 text-[12px]" style="color:#8b949e;">暂无评论，来抢沙发吧～</div>`
      : roots.map(root => {
          const children = childrenMap[root.id] || [];
          return `
          <div class="rounded-xl overflow-hidden mb-2" style="background:#161b22;border:1px solid rgba(255,255,255,0.05);">
            <div class="px-3 pt-1 pb-0">${commentCard(root, true, root.id)}</div>
            ${children.length > 0 ? `
            <div class="mx-3 mb-3 mt-0.5 rounded-lg px-2 py-0.5" style="background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.04);">
              ${children.map((ch, i) => `
                ${i > 0 ? '<div style="height:1px;background:rgba(255,255,255,0.04);"></div>' : ''}
                ${commentCard(ch, false, root.id)}`).join('')}
            </div>` : '<div class="pb-1"></div>'}
          </div>`;
        }).join('');

  const inputPlaceholder = replyTarget ? `回复 @${replyTarget.authorName}：` : '发表评论...';
  const isMockPost = post.id.startsWith('mock-');

  return `
  <div class="flex flex-col h-full">
    <!-- 顶部返回栏 -->
    <div class="shrink-0 flex items-center gap-2 px-3 py-2.5" style="background:#161b22;border-bottom:1px solid rgba(255,255,255,0.06);">
      <button onclick="window.transActions.closePostDetail()"
        class="flex items-center gap-0.5 text-[13px] font-bold active:scale-90 transition-transform" style="color:#58d4f5;">
        <i data-lucide="chevron-left" style="width:16px;height:16px;"></i>返回
      </button>
      <span class="flex-1 text-center text-[13px] font-bold truncate" style="color:#e6edf3;">帖子详情</span>
      <div class="w-12 shrink-0"></div>
    </div>

    <!-- 滚动内容区 -->
    <div id="forum-detail-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3">
      <!-- 帖子主体 -->
      <div class="rounded-xl p-4" style="background:#161b22;border:1px solid rgba(88,212,245,0.12);">
        <div class="flex items-center gap-2 mb-3">
          ${postAv}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[13px] font-bold" style="color:${isMe_post ? '#58d4f5' : '#e6edf3'};">${post.author_name}</span>
              <span class="text-[9px] px-1 rounded font-mono" style="background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.2);">Lv.${post.author_level}</span>
            </div>
            <span class="text-[10px]" style="color:#8b949e;">${tsAgo(post.created_at)}</span>
          </div>
          ${(!isMockPost && (isAdmin || isMe_post)) ? `
          <button onclick="window.transActions.deletePost('${post.id}')"
            class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded active:scale-90 transition-transform"
            style="background:rgba(248,81,73,0.12);color:#f85149;border:1px solid rgba(248,81,73,0.3);">删除</button>` : ''}
        </div>
        ${post.title ? `
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style="${tagStyle(post.tag || '分享')}">${post.tag || '分享'}</span>
          <span class="text-[17px] font-black leading-tight" style="color:#e6edf3;">${post.title}</span>
        </div>` : `
        <div class="mb-2">
          <span class="text-[9px] px-1.5 py-0.5 rounded font-bold" style="${tagStyle(post.tag || '分享')}">${post.tag || '分享'}</span>
        </div>`}
        <div class="text-[14px] leading-relaxed mb-4" style="color:#c9d1d9;">${post.content}</div>
        <div class="flex items-center gap-4" style="border-top:1px solid rgba(255,255,255,0.05);padding-top:12px;">
          <button onclick="window.transActions.likePost('${post.id}')"
            class="flex items-center gap-1.5 text-[12px] active:scale-90 transition-transform"
            style="color:${liked ? '#f85149' : '#8b949e'};">
            <i data-lucide="heart" style="width:14px;height:14px;${liked ? 'fill:#f85149;color:#f85149;' : ''}"></i>
            <span id="detail-post-likes">${post.likes}</span>
          </button>
          <span class="flex items-center gap-1.5 text-[12px]" style="color:#8b949e;">
            <i data-lucide="message-circle" style="width:14px;height:14px;"></i>${allComments.length || post.comments}
          </span>
        </div>
      </div>

      <!-- 评论区 -->
      <div class="text-[10px] font-mono px-1" style="color:#8b949e;letter-spacing:2px;">── THREAD · ${allComments.length} 条评论 ──</div>
      ${commentsHtml}
      <div class="h-1"></div>
    </div>

    <!-- 固定底部评论输入栏 -->
    <div class="shrink-0 px-3 py-2" style="background:#0d1117;border-top:1px solid rgba(255,255,255,0.07);">
      ${replyTarget ? `
      <div class="flex items-center gap-2 mb-1.5 px-0.5">
        <span class="text-[11px] font-mono truncate" style="color:#58d4f5;">↩ 回复 @${replyTarget.authorName}</span>
        <button onclick="window.transActions.clearReplyTarget()" class="shrink-0 text-[11px]" style="color:#8b949e;">✕</button>
      </div>` : ''}
      <div class="flex items-end gap-2">
        <textarea id="trans-comment-input" rows="1" placeholder="${inputPlaceholder}"
          class="flex-1 rounded-xl px-3 py-2 bg-transparent outline-none resize-none text-[13px] hide-scrollbar"
          style="color:#e6edf3;border:1px solid rgba(255,255,255,0.1);max-height:80px;line-height:1.5;"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
        <button onclick="window.transActions.submitComment()"
          class="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold mb-0.5"
          style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.3);color:#58d4f5;">发送</button>
      </div>
    </div>
  </div>`;
}

function renderForum(pName, pAvatar, pId) {
  const state = window.transState;

  // 进入详情页模式
  if (state.forumDetail) return renderForumDetail(pName, pAvatar, pId);

  const sub   = state.forumSub;
  const source = state.cloudPosts !== null ? state.cloudPosts : MOCK_POSTS;
  const isCloudData = state.cloudPosts !== null;
  const isLoading   = state.loadingPosts && state.cloudPosts === null;
  const isAdmin     = state.isAdmin;

  let allPosts;
  if (sub === 'mine')     allPosts = source.filter(p => p.author_id === pId);
  else if (sub === 'hot') allPosts = [...source].sort((a, b) => b.likes - a.likes);
  else                    allPosts = [...source].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return `
  <div class="flex flex-col h-full">
    <div class="flex gap-0 px-4 pt-3 pb-2 shrink-0" style="border-bottom:1px solid rgba(255,255,255,0.06);">
      ${[['hot','热门'],['new','最新'],['mine','我的']].map(([k,l]) => `
        <button onclick="window.transActions.setForumSub('${k}')" class="flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all" style="${sub===k ? 'background:rgba(88,212,245,0.12);color:#58d4f5;border:1px solid rgba(88,212,245,0.25);' : 'color:#8b949e;border:1px solid transparent;'}">${l}</button>
      `).join('')}
      <button onclick="window.transActions.refreshForum()" class="w-8 h-8 flex items-center justify-center ml-1 rounded-lg" style="color:#8b949e;border:1px solid rgba(255,255,255,0.06);">
        <i data-lucide="refresh-cw" style="width:13px;height:13px;${state.loadingPosts ? 'animation:spin 1s linear infinite;' : ''}"></i>
      </button>
    </div>

    <div class="text-[10px] text-center py-1 font-mono shrink-0" style="${isCloudData ? 'color:#3fb950;background:rgba(63,185,80,0.04);' : 'color:#ffa64d;background:rgba(255,166,77,0.06);'}">
      ${isCloudData ? `● 已连接云端 · ${source.length} 条帖子` : '⚠ 使用本地示例数据 · 联网后点刷新'}
    </div>

    <div id="forum-list-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-2.5">
      ${isLoading ? loadingSkeleton(3) : allPosts.length === 0
        ? `<div class="text-center py-10 text-[13px]" style="color:#8b949e;">还没有帖子，来发第一篇吧！</div>`
        : allPosts.map(p => {
          const isMe = p.author_id === pId;
          const avatarHtml = isMe
            ? myAvatar(pAvatar, pName, 'w-7 h-7')
            : p.author_avatar
              ? `<img src="${p.author_avatar}" class="w-7 h-7 rounded-full object-cover shrink-0" />`
              : npcAvatar(p.author_name, 'w-7 h-7', '12px');
          const isMockPost = p.id.startsWith('mock-');
          const liked = state.likedPosts.has(p.id);
          return `
          <div class="rounded-xl p-3.5 cursor-pointer active:opacity-80 transition-opacity"
            style="background:#161b22;border:1px solid rgba(255,255,255,0.05);"
            onclick="window.transActions.openPostDetail('${p.id}')">
            <div class="flex items-center gap-2 mb-2">
              ${avatarHtml}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-[12px] font-bold" style="color:${isMe ? '#58d4f5' : '#e6edf3'};">${p.author_name}</span>
                  <span class="text-[9px] px-1 rounded font-mono" style="background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.2);">Lv.${p.author_level}</span>
                </div>
                <span class="text-[10px]" style="color:#8b949e;">${tsAgo(p.created_at)}</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${(!isMockPost && (isAdmin || isMe)) ? `
                <button onclick="event.stopPropagation();window.transActions.deletePost('${p.id}')"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded active:scale-90 transition-transform"
                  style="background:rgba(248,81,73,0.12);color:#f85149;border:1px solid rgba(248,81,73,0.3);">删除</button>` : ''}
              </div>
            </div>
            ${p.title ? `
            <div class="flex items-center gap-1.5 mb-1">
              <span class="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style="${tagStyle(p.tag)}">${p.tag || '分享'}</span>
              <span class="text-[14px] font-black leading-tight truncate" style="color:#e6edf3;">${p.title}</span>
            </div>
            <div class="text-[12px] leading-relaxed mb-2.5" style="color:#8b949e;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${p.content}</div>
            ` : `
            <div class="flex items-center gap-1.5 mb-1.5">
              <span class="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style="${tagStyle(p.tag)}">${p.tag || '分享'}</span>
            </div>
            <div class="text-[13px] leading-relaxed mb-2.5" style="color:#c9d1d9;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${p.content}</div>
            `}
            <div class="flex items-center gap-4" style="color:#8b949e;">
              <button onclick="event.stopPropagation();window.transActions.likePost('${p.id}')"
                class="flex items-center gap-1 text-[11px] active:scale-90 transition-transform"
                style="color:${liked ? '#f85149' : '#8b949e'};">
                <i data-lucide="heart" style="width:13px;height:13px;${liked ? 'fill:#f85149;color:#f85149;' : ''}"></i>${p.likes}
              </button>
              <span class="flex items-center gap-1 text-[11px]">
                <i data-lucide="message-circle" style="width:13px;height:13px;"></i>${p.comments}
              </span>
              <span class="ml-auto text-[11px] font-bold" style="color:#58d4f5;opacity:0.7;">查看评论 ›</span>
            </div>
          </div>`;
        }).join('')}
    </div>

    <!-- 固定底部发帖框 -->
    <div class="shrink-0 px-3 py-2.5" style="background:#0d1117;border-top:1px solid rgba(255,255,255,0.06);">
      <div class="rounded-xl p-3 space-y-2" style="background:#161b22;border:1px dashed rgba(88,212,245,0.15);">
        <div class="flex gap-2">
          <select id="trans-post-tag"
            class="shrink-0 rounded-lg px-2 text-[11px] font-bold outline-none cursor-pointer"
            style="background:#0d1117;border:1px solid rgba(88,212,245,0.2);color:#58d4f5;height:30px;">
            <option value="分享">分享</option>
            <option value="经验">经验</option>
            <option value="理论">理论</option>
            <option value="攻略">攻略</option>
            <option value="求助">求助</option>
          </select>
          <input id="trans-post-title" type="text" placeholder="标题（选填）"
            class="flex-1 rounded-lg px-2.5 bg-transparent outline-none text-[13px] font-bold"
            style="color:#e6edf3;border:1px solid rgba(255,255,255,0.08);height:30px;" />
        </div>
        <textarea id="trans-post-input" rows="2" placeholder="发布你的穿越心得..."
          class="w-full bg-transparent outline-none resize-none text-[13px] hide-scrollbar" style="color:#e6edf3;"></textarea>
        <div class="flex justify-end">
          <button onclick="window.transActions.submitPost()"
            class="text-[12px] font-bold px-4 py-1.5 rounded-lg"
            style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.3);color:#58d4f5;">发布</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderRanking(player, pName, pAvatar, pId) {
  const state = window.transState;
  const players    = state.cloudPlayers !== null ? state.cloudPlayers : MOCK_PLAYERS;
  const isLoading  = state.loadingPlayers && state.cloudPlayers === null;
  const isCloudData = state.cloudPlayers !== null;
  const isAdmin    = state.isAdmin;

  // 固定使用云端排序（已按 points desc），取前 10 名展示
  const top10  = players.slice(0, 10);
  const top3   = top10.slice(0, 3);
  const rank4to10 = top10.slice(3);

  // 计算我的排名：在完整列表里按积分找位置
  const fullSorted = [...players].sort((a, b) => b.points - a.points);
  const myIdxInFull = fullSorted.findIndex(r => r.id === pId);
  // 如果自己不在云端列表中，排名 = 列表末尾 + 1
  const myRank = myIdxInFull >= 0 ? myIdxInFull + 1 : fullSorted.length + 1;

  const podiumRgb    = ['255,196,0', '192,192,192', '205,127,50'];
  const podiumLabels = ['👑', '🥈', '🥉'];
  const podiumHeights = ['h-20', 'h-28', 'h-16'];
  const podiumOrder   = [top3[1], top3[0], top3[2]];
  const podiumRankIdx = [1, 0, 2];

  function avatarForRank(r, sizeClass, fontSize) {
    const isMe = r.id === pId;
    if (isMe) return myAvatar(pAvatar, pName, sizeClass, fontSize);
    if (r.avatar) return `<img src="${r.avatar}" class="${sizeClass} rounded-full object-cover shrink-0" />`;
    return npcAvatar(r.name, sizeClass, fontSize);
  }

  function adminTapAttr(r) {
    if (!isAdmin || r.id === pId) return '';
    const payload = JSON.stringify({ id: r.id, name: r.name, is_banned: r.is_banned || false }).replace(/'/g, '&#39;');
    return `onclick='window.transActions.setAdminTarget(${payload})'`;
  }

  return `
  <div class="p-4 space-y-3">
    <div class="flex items-center justify-between mb-1">
      <div class="text-[10px] font-mono" style="color:#8b949e;letter-spacing:3px;">— GLOBAL RANKINGS —</div>
      <button onclick="window.transActions.refreshRanking()" class="w-7 h-7 flex items-center justify-center rounded-lg" style="color:#8b949e;border:1px solid rgba(255,255,255,0.06);">
        <i data-lucide="refresh-cw" style="width:12px;height:12px;${state.loadingPlayers ? 'animation:spin 1s linear infinite;' : ''}"></i>
      </button>
    </div>

    <div class="text-[10px] text-center py-1 font-mono rounded-lg" style="${isCloudData ? 'color:#3fb950;background:rgba(63,185,80,0.04);' : 'color:#ffa64d;background:rgba(255,166,77,0.06);'}">
      ${isCloudData ? `● 已连接云端 · ${players.length} 名玩家` : '⚠ 使用本地示例数据 · 联网后点刷新'}
    </div>

    ${isLoading ? loadingSkeleton(5) : `
    <!-- 前三名领奖台 -->
    <div class="flex items-end justify-center gap-3 py-4">
      ${podiumOrder.map((r, vi) => {
        if (!r) return '<div class="flex-1"></div>';
        const ri = podiumRankIdx[vi];
        const isMe = r.id === pId;
        return `
        <div class="flex flex-col items-center flex-1 ${isAdmin && !isMe ? 'cursor-pointer' : ''}" ${adminTapAttr(r)}>
          ${avatarForRank(r, 'w-12 h-12', '18px')}
          <div class="text-[11px] font-bold mt-1 mb-0.5 text-center" style="color:${isMe ? '#58d4f5' : r.is_banned ? '#8b949e' : '#e6edf3'};max-width:64px;word-break:break-all;">
            ${r.name}${r.is_banned ? ' 🚫' : ''}${isMe ? ' (你)' : ''}
          </div>
          <div class="text-[9px] font-mono mb-2" style="color:#8b949e;">${fmtPts(r.points)} pts</div>
          <div class="w-full ${podiumHeights[vi]} rounded-t-xl flex items-center justify-center text-xl font-black"
            style="background:linear-gradient(180deg,rgba(${podiumRgb[ri]},.15),rgba(${podiumRgb[ri]},.05));border:1px solid rgba(${podiumRgb[ri]},.3);border-bottom:none;">
            ${podiumLabels[ri]}
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- 第 4–10 名列表 -->
    ${rank4to10.length > 0 ? `
    <div class="rounded-xl overflow-hidden" style="border:1px solid rgba(255,255,255,0.06);">
      ${rank4to10.map((r, i) => {
        const isMe = r.id === pId;
        return `
        <div class="flex items-center gap-3 px-3 py-2.5 ${isAdmin && !isMe ? 'cursor-pointer active:opacity-70' : ''}"
          style="border-bottom:1px solid rgba(255,255,255,0.04);${isMe ? 'background:rgba(88,212,245,0.05);' : 'background:#161b22;'}"
          ${adminTapAttr(r)}>
          <div class="text-[14px] font-black w-6 text-center font-mono" style="color:${isMe ? '#58d4f5' : '#8b949e'};">${i + 4}</div>
          ${avatarForRank(r, 'w-8 h-8', '13px')}
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-bold truncate" style="color:${isMe ? '#58d4f5' : r.is_banned ? '#8b949e' : '#e6edf3'};">
              ${r.name}${isMe ? ' (你)' : ''}${r.is_banned ? ' 🚫' : ''}${r.is_admin ? ' 🔑' : ''}
            </div>
            <div class="text-[10px]" style="color:#8b949e;">Lv.${r.level} · ${getTitle(r.level)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[12px] font-mono font-bold" style="color:#e6edf3;">${fmtPts(r.points)}</div>
            <div class="text-[10px]" style="color:#8b949e;">${r.worlds ?? 0}个副本</div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- 我的排名卡（始终固定在底部） -->
    <div class="rounded-xl p-3 flex items-center gap-3" style="background:rgba(88,212,245,0.06);border:1px solid rgba(88,212,245,0.3);">
      ${myAvatar(pAvatar, pName, 'w-9 h-9', '15px')}
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-bold truncate" style="color:#58d4f5;">${pName}</div>
        <div class="text-[10px]" style="color:#8b949e;">Lv.${player.level} · ${getTitle(player.level)}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-[20px] font-black font-mono" style="color:#58d4f5;">#${myRank}</div>
        <div class="text-[10px] font-mono" style="color:#8b949e;">${player.points.toLocaleString()} pts</div>
      </div>
    </div>
    `}
  </div>`;
}

function renderMission(player) {
  const savedDungeon = store.transData?.savedDungeon;
  return `
  <div class="p-4 space-y-3">
    ${savedDungeon ? `
    <!-- 继续未完副本 -->
    <div class="rounded-2xl p-4 relative overflow-hidden"
      style="background:linear-gradient(135deg,#0d1f0d,#0d1117);border:1px solid rgba(63,185,80,0.45);box-shadow:0 0 16px rgba(63,185,80,0.08);">
      <div class="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none" style="background:radial-gradient(circle,#3fb950,transparent);"></div>
      <div class="text-[9px] font-mono mb-0.5" style="color:#3fb950;letter-spacing:3px;">SUSPENDED DUNGEON</div>
      <div class="text-[15px] font-black mb-0.5" style="color:#e6edf3;">${savedDungeon.mission?.name || '未命名副本'}</div>
      <div class="text-[11px] mb-3" style="color:#8b949e;">第${savedDungeon.turn}回合 · 生存${savedDungeon.status?.survival ?? 100} · 进度${savedDungeon.status?.progress ?? 0}%</div>
      <div class="flex gap-2">
        <button onclick="window.transActions.resumeDungeon()"
          class="flex-1 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-transform"
          style="background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.35);color:#3fb950;">▶ 继续副本</button>
        <button onclick="window.transActions.abandonDungeon()"
          class="px-4 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-transform"
          style="background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.25);color:#f85149;">放弃</button>
      </div>
    </div>` : ''}
    <!-- 自定义副本入口 -->
    <div class="rounded-2xl p-4 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style="background:linear-gradient(135deg,#0d1f2d,#1a0d2e);border:1px solid rgba(188,140,255,0.35);box-shadow:0 0 20px rgba(188,140,255,0.06);"
      onclick="window.transActions.openCustomModal()">
      <div class="absolute top-0 right-0 w-28 h-28 opacity-10" style="background:radial-gradient(circle,#bc8cff,transparent);pointer-events:none;"></div>
      <div class="flex items-center gap-3 relative z-10">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
          style="background:rgba(188,140,255,0.12);border:1px solid rgba(188,140,255,0.3);">✦</div>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-mono mb-0.5" style="color:#bc8cff;letter-spacing:2px;">CUSTOM DUNGEON</div>
          <div class="text-[15px] font-black" style="color:#e6edf3;">自定义副本</div>
          <div class="text-[11px] mt-0.5" style="color:#8b949e;">自由设定世界观 · 选择角色 · AI生成剧本 · 文字RPG</div>
        </div>
        <i data-lucide="chevron-right" style="width:18px;height:18px;color:#bc8cff;shrink-0;"></i>
      </div>
    </div>

    <div class="flex items-center justify-between">
      <div class="text-[10px] font-mono" style="color:#8b949e;letter-spacing:3px;">PRESET DUNGEONS — 预设副本</div>
      <button onclick="window.transActions.openDungeonSettings()"
        class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold active:scale-90 transition-transform"
        style="background:rgba(188,140,255,0.08);border:1px solid rgba(188,140,255,0.2);color:#bc8cff;">
        <i data-lucide="settings" style="width:11px;height:11px;"></i>设置
      </button>
    </div>
    ${MISSIONS.map(m => {
      const isActive = player.activeWorldId === m.id;
      return `
      <div class="rounded-xl p-4 relative overflow-hidden" style="background:#161b22;border:1px solid ${isActive ? 'rgba(88,212,245,0.4)' : 'rgba(255,255,255,0.06)'};">
        ${isActive ? `<div class="absolute top-2 right-2 text-[9px] px-2 py-0.5 rounded-full font-bold" style="background:rgba(88,212,245,0.15);color:#58d4f5;border:1px solid rgba(88,212,245,0.3);">进行中</div>` : ''}
        <div class="text-[10px] font-mono mb-1" style="color:#8b949e;letter-spacing:1px;">${m.world}</div>
        <div class="text-[15px] font-black mb-1" style="color:#e6edf3;">${m.name}</div>
        <div class="mb-1">${getDiffStars(m.diff)}</div>
        <div class="flex flex-wrap gap-1 mb-2">
          ${m.tags.map(t => `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold" style="background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.15);">${t}</span>`).join('')}
        </div>
        <div class="text-[12px] leading-relaxed mb-3" style="color:#8b949e;">${m.briefing}</div>
        <div class="flex items-center justify-between">
          <div class="text-[10px]" style="color:#3fb950;">+${m.reward.points} pts &nbsp;+${m.reward.exp} exp</div>
          <button onclick="window.transActions.openMission('${m.id}')" class="text-[12px] font-bold px-4 py-1.5 rounded-lg active:scale-95 transition-transform"
            style="background:${isActive ? 'rgba(88,212,245,0.12)' : 'rgba(63,185,80,0.1)'};border:1px solid ${isActive ? 'rgba(88,212,245,0.3)' : 'rgba(63,185,80,0.3)'};color:${isActive ? '#58d4f5' : '#3fb950'};">
            ${isActive ? '查看进度' : '接取副本'}
          </button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ─── 管理员 - 封号弹窗 ────────────────────────────────────────────
function renderAdminTargetModal() {
  const target = window.transState.adminTarget;
  if (!target) return '';
  return `
  <div class="absolute inset-0 z-50 flex items-end justify-center" style="background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);"
    onclick="window.transActions.setAdminTarget(null)">
    <div class="w-full rounded-t-3xl p-5 pb-8" style="background:#161b22;border-top:1px solid rgba(248,81,73,0.4);" onclick="event.stopPropagation()">
      <div class="w-10 h-1 rounded-full mx-auto mb-4" style="background:rgba(255,255,255,0.15);"></div>
      <div class="text-[10px] font-mono mb-1" style="color:#f85149;letter-spacing:2px;">⚠ 管理员操作面板</div>
      <div class="text-[18px] font-black mb-1" style="color:#e6edf3;">${target.name}</div>
      <div class="text-[12px] mb-4" style="color:#8b949e;">ID: ${target.id} &nbsp;·&nbsp; 当前状态：${target.is_banned ? '<span style="color:#f85149;">已封号</span>' : '<span style="color:#3fb950;">正常</span>'}</div>
      <div class="flex gap-3">
        <button onclick="window.transActions.setAdminTarget(null)" class="flex-1 py-3 rounded-xl font-bold text-[14px]"
          style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#8b949e;">取消</button>
        <button onclick="window.transActions.banPlayer('${target.id}', ${!target.is_banned})"
          class="flex-1 py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform"
          style="background:${target.is_banned ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)'};border:1px solid ${target.is_banned ? 'rgba(63,185,80,0.35)' : 'rgba(248,81,73,0.35)'};color:${target.is_banned ? '#3fb950' : '#f85149'};">
          ${target.is_banned ? '解除封号' : '封号'}
        </button>
      </div>
    </div>
  </div>`;
}

// ─── 副本设置弹窗（世界书挂载）────────────────────────────────────
function renderDungeonSettingsModal() {
  if (!window.transState.dungeonSettingsOpen) return '';
  const mounted  = store.transData?.dungeonSettings?.mountedWorldbooks || [];
  const localWbs = (store.worldbooks || []).filter(w => w.type === 'local' && w.enabled !== false);
  const globalWbs = (store.worldbooks || []).filter(w => w.type === 'global' && w.enabled !== false);

  return `
  <div class="absolute inset-0 z-50 flex items-center justify-center p-3"
    style="background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);"
    onclick="window.transActions.closeDungeonSettings()">
    <div class="w-full rounded-2xl flex flex-col overflow-hidden"
      style="background:#161b22;border:1px solid rgba(188,140,255,0.25);max-height:88vh;"
      onclick="event.stopPropagation()">

      <!-- 标题栏 -->
      <div class="shrink-0 px-4 py-3 flex items-center justify-between" style="border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <div class="text-[9px] font-mono" style="color:#bc8cff;letter-spacing:3px;">DUNGEON CONFIG</div>
          <div class="text-[16px] font-black" style="color:#e6edf3;">⚙ 副本全局设置</div>
        </div>
        <button onclick="window.transActions.closeDungeonSettings()"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-[14px]"
          style="background:rgba(255,255,255,0.05);color:#8b949e;">✕</button>
      </div>

      <!-- 内容 -->
      <div id="dungeon-settings-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">

        <!-- 全局世界书（只读展示） -->
        <div>
          <div class="text-[9px] font-mono mb-2" style="color:#8b949e;letter-spacing:2px;">GLOBAL WORLDBOOKS — 全局世界书（自动注入）</div>
          ${globalWbs.length === 0
            ? `<div class="text-[12px] py-2" style="color:#8b949e;">暂无启用的全局世界书</div>`
            : `<div class="flex flex-wrap gap-1.5">
                ${globalWbs.map(w => `
                <span class="text-[10px] px-2 py-0.5 rounded-lg font-bold"
                  style="background:rgba(63,185,80,0.1);border:1px solid rgba(63,185,80,0.2);color:#3fb950;">
                  ✓ ${w.title}
                </span>`).join('')}
               </div>`}
        </div>

        <!-- 局部世界书挂载 -->
        <div>
          <div class="text-[9px] font-mono mb-2" style="color:#8b949e;letter-spacing:2px;">LOCAL WORLDBOOKS — 挂载局部世界书</div>
          <div class="text-[10px] mb-2" style="color:#8b949e;">选中的世界书将在所有副本回合中持续注入提示词。</div>
          ${localWbs.length === 0
            ? `<div class="text-[12px] py-3 text-center rounded-xl" style="color:#8b949e;border:1px dashed rgba(255,255,255,0.08);">暂无可用的局部世界书</div>`
            : `<div class="space-y-2">
                ${localWbs.map(w => {
                  const sel = mounted.includes(w.id);
                  return `
                  <div onclick="window.transActions.toggleDungeonWb(${w.id})"
                    class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                    style="${sel
                      ? 'background:rgba(188,140,255,0.08);border:1px solid rgba(188,140,255,0.35);'
                      : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);'}">
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-bold truncate" style="color:${sel ? '#bc8cff' : '#c9d1d9'};">${w.title}</div>
                      ${w.group ? `<div class="text-[9px] font-mono" style="color:#8b949e;">${w.group}</div>` : ''}
                    </div>
                    <div class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
                      style="${sel
                        ? 'background:#bc8cff;border:2px solid #bc8cff;'
                        : 'background:transparent;border:2px solid rgba(255,255,255,0.2);'}">
                      ${sel ? `<i data-lucide="check" style="width:11px;height:11px;color:#0d1117;"></i>` : ''}
                    </div>
                  </div>`;
                }).join('')}
               </div>`}
        </div>
      </div>

      <!-- 底部 -->
      <div class="shrink-0 px-4 py-3" style="border-top:1px solid rgba(255,255,255,0.07);">
        <div class="text-[10px] mb-2 text-center font-mono" style="color:#8b949e;">
          已挂载 ${mounted.length} 个局部世界书 · 全局世界书自动注入
        </div>
        <button onclick="window.transActions.closeDungeonSettings()"
          class="w-full py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform"
          style="background:rgba(188,140,255,0.1);border:1px solid rgba(188,140,255,0.3);color:#bc8cff;">完成</button>
      </div>
    </div>
  </div>`;
}

// ─── 预设副本接取弹窗（居中，含角色选择 + AI生成）─────────────────
function renderMissionModal(player) {
  const state = window.transState;
  const mId   = state.missionModal;
  if (!mId) return '';
  const m = MISSIONS.find(x => x.id === mId);
  if (!m) return '';
  const contacts = store.contacts || [];
  const selected = state.missionModalChars;
  const isGen    = state.missionModalGen;

  return `
  <div class="absolute inset-0 z-50 flex items-center justify-center p-3"
    style="background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);"
    onclick="window.transActions.closeMissionModal()">
    <div class="w-full rounded-2xl flex flex-col overflow-hidden"
      style="background:#161b22;border:1px solid rgba(88,212,245,0.25);max-height:90vh;"
      onclick="event.stopPropagation()">
      <!-- 标题栏 -->
      <div class="shrink-0 px-4 py-3 flex items-center justify-between" style="border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <div class="text-[9px] font-mono" style="color:#58d4f5;letter-spacing:3px;">${m.world}</div>
          <div class="text-[16px] font-black" style="color:#e6edf3;">${m.name}</div>
        </div>
        <button onclick="window.transActions.closeMissionModal()"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-[14px]"
          style="background:rgba(255,255,255,0.05);color:#8b949e;">✕</button>
      </div>
      <!-- 滚动内容 -->
      <div id="mission-modal-scroll" class="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-3">
        <div class="rounded-xl p-3 space-y-1.5" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);">
          ${getDiffStars(m.diff)}
          <div class="flex flex-wrap gap-1 mt-1">
            ${m.tags.map(t => `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold" style="background:rgba(188,140,255,0.1);color:#bc8cff;border:1px solid rgba(188,140,255,0.15);">${t}</span>`).join('')}
          </div>
          <div class="text-[12px] leading-relaxed mt-1" style="color:#c9d1d9;">${m.briefing}</div>
          <div class="text-[11px] mt-1.5" style="color:#8b949e;">🎯 ${m.target}</div>
          <div class="flex items-center gap-4 mt-1 text-[11px]">
            <span style="color:#3fb950;">+${m.reward.points} pts</span>
            <span style="color:#bc8cff;">+${m.reward.exp} exp</span>
            <span style="color:#8b949e;">时限：${m.limit}</span>
          </div>
        </div>
        <!-- 角色选择 -->
        <div>
          <div class="text-[9px] font-mono mb-1.5" style="color:#8b949e;letter-spacing:2px;">CAST — 参与角色（可多选，作为NPC出现）</div>
          ${contacts.length === 0
            ? `<div class="text-[12px]" style="color:#8b949e;">暂无联系人，AI将自行创建NPC</div>`
            : `<div class="flex flex-wrap gap-1.5">
              ${contacts.map(c => {
                const sel = selected.includes(c.id);
                const av  = c.avatar
                  ? `<img src="${c.avatar}" class="w-5 h-5 rounded-full object-cover shrink-0" />`
                  : npcAvatar(c.name, 'w-5 h-5', '9px');
                return `
                <button onclick="window.transActions.toggleMissionChar('${c.id}')"
                  class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold active:scale-95 transition-all"
                  style="${sel
                    ? 'background:rgba(88,212,245,0.15);border:1px solid rgba(88,212,245,0.4);color:#58d4f5;'
                    : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;'}">
                  ${av}${c.name}
                </button>`;
              }).join('')}
            </div>`}
        </div>
      </div>
      <!-- 按钮区 -->
      <div class="shrink-0 p-4 space-y-2" style="border-top:1px solid rgba(255,255,255,0.07);">
        <button onclick="window.transActions.generateMissionScript('${m.id}')"
          class="w-full py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 ${isGen ? 'opacity-60 pointer-events-none' : ''}"
          style="background:rgba(188,140,255,0.1);border:1px solid rgba(188,140,255,0.25);color:#bc8cff;">
          ${isGen
            ? `<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> AI生成剧本中...`
            : `✦ AI预生成剧本${state.missionScript ? '（已生成√）' : '（可选）'}`}
        </button>
        <div class="flex gap-2">
          <button onclick="window.transActions.closeMissionModal()"
            class="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
            style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#8b949e;">取消</button>
          <button onclick="window.transActions.startPresetDungeon('${m.id}')"
            class="flex-1 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform ${isGen ? 'opacity-50 pointer-events-none' : ''}"
            style="background:rgba(63,185,80,0.1);border:1px solid rgba(63,185,80,0.3);color:#3fb950;">
            ${isGen ? '请稍候...' : '进入副本 ›'}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── 主渲染函数 ───────────────────────────────────────────────────
export const renderTransmigrationApp = (store) => {
  initData();
  const _pId = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);
  checkAdminStatus(_pId).then(changed => { if (changed) window.render(); });
  const state  = window.transState;
  const player = store.transData.player;

  // 副本文游：接管整个屏幕
  if (state.activeDungeon) {
    return `
    <style>
      .hide-scrollbar::-webkit-scrollbar{display:none}
      .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
    </style>
    <div id="trans-app-screen" class="w-full h-full flex flex-col relative overflow-hidden"
      style="background:#0d1117 !important;color:#e6edf3;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;">
      ${renderActiveDungeon()}
    </div>`;
  }

  const defaultPersona = store.personas?.[0] || {};
  const pName   = player.name || defaultPersona.name || '旅行者';
  const pAvatar = player.avatar || (defaultPersona.avatar?.startsWith?.('http') ? defaultPersona.avatar : null);
  const pId     = 'TRV-' + String(player.joinedAt || Date.now()).slice(-8);
  const title   = getTitle(player.level);

  const tabContents = {
    terminal: renderTerminal(player, pName, pAvatar, pId, title),
    shop:     renderShop(player),
    forum:    renderForum(pName, pAvatar, pId),
    ranking:  renderRanking(player, pName, pAvatar, pId),
    mission:  renderMission(player),
  };
  const content = tabContents[state.tab] || '';

  // 副本弹窗（使用居中样式的独立函数）

  const navTabs = [
    { id: 'terminal', icon: 'user',          label: '终端' },
    { id: 'shop',     icon: 'shopping-cart', label: '商城' },
    { id: 'forum',    icon: 'message-square',label: '论坛' },
    { id: 'ranking',  icon: 'bar-chart-2',   label: '排名' },
    { id: 'mission',  icon: 'zap',           label: '副本' },
  ];

  return `
  <style>
    .hide-scrollbar::-webkit-scrollbar{display:none}
    .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  </style>

  <div id="trans-app-screen" class="w-full h-full flex flex-col relative overflow-hidden"
    style="background:#0d1117 !important;color:#e6edf3;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;">

    <div class="shrink-0 pt-10 pb-3 px-4 flex items-center gap-3 relative" style="background:#161b22;border-bottom:1px solid rgba(56,139,253,0.18);">
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(135deg,transparent 60%,rgba(88,212,245,0.04));"></div>
      <button onclick="window.actions.setCurrentApp(null)" class="relative z-10 flex items-center justify-center w-8 h-8 rounded-lg shrink-0 active:scale-90 transition-transform" style="color:#58d4f5;">
        <i data-lucide="chevron-left" style="width:22px;height:22px;"></i>
      </button>
      <div class="relative z-10 flex-1">
        <div class="text-[9px] font-mono tracking-[3px] uppercase mb-0.5" style="color:#58d4f5;">NEXUS // OBSERVER_NODE</div>
        <div class="text-[17px] font-black tracking-wide" style="color:#e6edf3;">⟁ 星海枢纽 · 观测者节点</div>
      </div>
      <div class="relative z-10 text-right shrink-0">
        <div class="text-[9px]" style="color:#8b949e;">积分</div>
        <div class="text-[18px] font-black font-mono" style="color:#58d4f5;">${player.points.toLocaleString()}</div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto hide-scrollbar" id="trans-content-scroll">${content}</div>

    <div class="shrink-0 pb-6 pt-1 grid grid-cols-5" style="background:rgba(13,17,23,0.96);border-top:1px solid rgba(56,139,253,0.15);">
      ${navTabs.map(t => {
        const active = state.tab === t.id;
        return `
        <button onclick="window.transActions.setTab('${t.id}')" class="flex flex-col items-center py-1 transition-all active:scale-90 ${active ? '' : 'opacity-35'}">
          <i data-lucide="${t.icon}" style="width:19px;height:19px;color:${active ? '#58d4f5' : '#8b949e'};"></i>
          <span class="text-[9px] mt-0.5 font-bold" style="color:${active ? '#58d4f5' : '#8b949e'};">${t.label}</span>
          ${active ? `<div class="w-1 h-1 rounded-full mt-0.5" style="background:#58d4f5;box-shadow:0 0 4px #58d4f5;"></div>` : ''}
        </button>`;
      }).join('')}
    </div>

    ${renderMissionModal(player)}
    ${renderAdminTargetModal()}
    ${state.customModal ? renderCustomMissionModal() : ''}
    ${renderDungeonSettingsModal()}
  </div>`;
};

// ─── Actions ──────────────────────────────────────────────────────
window.transActions = {
  setTab(tab) {
    window.transState.tab = tab;
    window.transState.missionModal = null;
    window.transState.adminTarget  = null;
    window.render();
    if (tab === 'terminal') {
      syncPlayerToCloud();
    }
    if (tab === 'ranking') loadRanking();
    if (tab === 'forum')   loadForum();
  },

  setForumSub(sub) {
    window.transState.forumSub = sub;
    window.render();
  },

  refreshRanking() {
    window.transState.cloudPlayers = null;
    loadRanking();
  },

  refreshForum() {
    window.transState.cloudPosts = null;
    loadForum();
  },

  saveName(val) {
    const name = (val ?? '').trim();
    if (!name) return;
    store.transData.player.name = name;
    syncPlayerToCloud();
    window.render();
  },

  uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      store.transData.player.avatar = ev.target.result;
      window.actions.showToast('头像已更新');
      syncPlayerToCloud();
      window.render();
    };
    reader.readAsDataURL(file);
  },

  buyItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    const player = store.transData.player;
    if (!item || player.points < item.price) { window.actions.showToast('积分不足'); return; }
    if (!confirm(`确认花费 ${item.price} pts 购买「${item.name}」？`)) return;
    player.points -= item.price;
    const inv = player.inventory || (player.inventory = []);
    const existing = inv.find(i => i.id === itemId);
    if (existing) existing.qty += 1; else inv.push({ id: itemId, qty: 1 });
    window.actions.showToast(`已购入：${item.icon} ${item.name}`);
    syncPlayerToCloud();
    window.render();
  },

  openMission(id) {
    initData();
    if (store.transData.savedDungeon || window.transState.activeDungeon) {
      window.actions.showToast('已有副本进行中，请先完成或放弃当前副本');
      return;
    }
    window.transState.missionModal    = id;
    window.transState.missionModalChars = [];
    window.transState.missionScript   = null;
    window.render();
  },
  closeMissionModal() {
    window.transState.missionModal    = null;
    window.transState.missionModalGen = false;
    window.render();
  },

  toggleMissionChar(charId) {
    const arr = window.transState.missionModalChars;
    const idx = arr.indexOf(charId);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(charId);
    window.render();
  },

  async generateMissionScript(missionId) {
    if (window.transState.missionModalGen) return;
    const m = MISSIONS.find(x => x.id === missionId);
    if (!m) return;
    const persona = store.personas?.[0] || {};
    const chars   = (store.contacts || []).filter(c => window.transState.missionModalChars.includes(c.id));
    window.transState.missionModalGen = true;
    window.render();
    try {
      const script = await generateScriptData(m.world, m.name, m.briefing, m.target, chars, persona);
      window.transState.missionScript = script;
      window.actions.showToast('✦ 剧本预生成完毕！');
    } catch (e) {
      console.warn('[Dungeon] 剧本预生成失败:', e.message);
      window.actions.showToast('生成失败：' + e.message);
    } finally {
      window.transState.missionModalGen = false;
      window.render();
    }
  },

  async startPresetDungeon(missionId) {
    if (window.transState.missionModalGen) return;
    const m = MISSIONS.find(x => x.id === missionId);
    if (!m) return;
    const persona = store.personas?.[0] || {};
    const chars   = (store.contacts || []).filter(c => window.transState.missionModalChars.includes(c.id));
    let script    = window.transState.missionScript;

    if (!script) {
      window.transState.missionModalGen = true;
      window.render();
      try {
        script = await generateScriptData(m.world, m.name, m.briefing, m.target, chars, persona);
      } catch (e) {
        window.actions.showToast('剧本生成失败，请重试：' + e.message);
        window.transState.missionModalGen = false;
        window.render();
        return;
      }
      window.transState.missionModalGen = false;
    }

    initData();
    store.transData.player.activeWorldId = missionId;
    const initChoices = expandOptionsDict(script.initial_options)
      || (Array.isArray(script.initial_choices)
          ? script.initial_choices.map(t => ({ type: 'custom', text: String(t) }))
          : [{ type: 'custom', text: '观察四周' }, { type: 'custom', text: '谨慎前行' }, { type: 'custom', text: '寻找信息' }]);
    const dungeon = {
      mission: m,
      script,
      log:      [{ type: 'narration', text: script.opening_scene || m.briefing || '副本开始……' }],
      choices:  initChoices,
      status:   { survival: 100, affections: {}, progress: 0 },
      inventory: [],
      turn:     0,
      history:  [],
      _firedTwists: [],
      _forceTwist: false,
      _compassHint: false,
      completed: false,
      isTrueEnding: false,
      isBadEnding: false,
      completionMsg: '',
      chars,
      persona,
    };
    window.transState.activeDungeon   = dungeon;
    store.transData.savedDungeon      = dungeon;
    window.transState.missionModal    = null;
    window.transState.missionScript   = null;
    window.transState.missionModalChars = [];
    window.transState.missionModalGen = false;
    syncPlayerToCloud();
    window.render();
    scrollDungeonLog();
  },

  async likePost(postId) {
    if (window.transState.likedPosts.has(postId)) {
      window.actions.showToast('已经赞过了～'); return;
    }
    const isMock = postId.startsWith('mock-');

    const updateLocal = () => {
      if (window.transState.cloudPosts) {
        const p = window.transState.cloudPosts.find(x => x.id === postId);
        if (p) p.likes = (p.likes || 0) + 1;
      }
      if (window.transState.forumDetail?.id === postId)
        window.transState.forumDetail.likes = (window.transState.forumDetail.likes || 0) + 1;
    };

    if (isMock) {
      updateLocal();
      window.transState.likedPosts.add(postId);
      window.render(); return;
    }

    initData();
    const pId = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, player_id: pId });
    if (error) {
      if (error.code === '23505') {
        window.transState.likedPosts.add(postId);
        window.actions.showToast('已经赞过了～');
        window.render();
      } else {
        console.warn('[Trans] 点赞失败:', error.message);
        window.actions.showToast('点赞失败，请重试');
      }
      return;
    }
    updateLocal();
    window.transState.likedPosts.add(postId);
    window.render();
    const src = window.transState.cloudPosts?.find(x => x.id === postId) || window.transState.forumDetail;
    await supabase.from('posts').update({ likes: src?.likes ?? 1 }).eq('id', postId);
  },

  async submitPost() {
    const elContent = document.getElementById('trans-post-input');
    const elTitle   = document.getElementById('trans-post-title');
    const elTag     = document.getElementById('trans-post-tag');
    const text  = elContent?.value.trim();
    const title = elTitle?.value.trim() || '';
    const tag   = elTag?.value || '分享';
    if (!text) return;
    initData();
    const player = store.transData.player;

    // 发帖前实时查封号状态
    const _pId = 'TRV-' + String(player.joinedAt).slice(-8);
    try {
      const { data } = await supabase.from('players').select('is_banned').eq('id', _pId).maybeSingle();
      if (data?.is_banned) {
        window.actions.showToast('您的账号已被封禁，无法发布内容');
        return;
      }
    } catch (e) {
      // 网络异常时放行，交给后端 RLS 兜底
    }

    const defaultPersona = store.personas?.[0] || {};
    const pName = player.name || defaultPersona.name || '旅行者';
    const pId   = 'TRV-' + String(player.joinedAt || Date.now()).slice(-8);

    const pAvatarForPost = player.avatar || (store.personas?.[0]?.avatar?.startsWith?.('http') ? store.personas[0].avatar : null);
    const optimisticPost = {
      id: 'optimistic_' + Date.now(),
      author_id: pId, author_name: pName, author_level: player.level, author_avatar: pAvatarForPost,
      title, content: text, tag, likes: 0, comments: 0,
      created_at: new Date().toISOString(),
    };
    if (window.transState.cloudPosts) window.transState.cloudPosts.unshift(optimisticPost);
    window.transState.forumSub = 'mine';
    window.render();
    if (elContent) elContent.value = '';
    if (elTitle)   elTitle.value   = '';
    if (elTag)     elTag.value     = '分享';

    // 先强制同步玩家，确保 players 表中已存在当前用户（消除外键约束竞态）
    await syncPlayerToCloud(true);

    // 插入云端（不发 id，让 DB 生成 UUID）
    const { data, error } = await supabase.from('posts').insert({
      author_id:     pId,
      author_name:   pName,
      author_level:  player.level,
      author_avatar: pAvatarForPost,
      title,
      content:       text,
      tag,
      likes:         0,
      comments:      0,
    }).select().single();

    if (error) {
      console.warn('[Trans] 发帖失败:', error.message);
      window.actions.showToast('发布失败，请重试');
      if (window.transState.cloudPosts) {
        window.transState.cloudPosts = window.transState.cloudPosts.filter(p => p.id !== optimisticPost.id);
        window.render();
      }
    } else {
      // 用真实 UUID 替换临时 id
      if (window.transState.cloudPosts) {
        const idx = window.transState.cloudPosts.findIndex(p => p.id === optimisticPost.id);
        if (idx !== -1) window.transState.cloudPosts[idx] = data;
      }
      window.actions.showToast('发布成功！');
      window.render();
    }
  },

  // ── 管理员专属 ──────────────────────────────────────────────────
  setAdminTarget(target) {
    window.transState.adminTarget = target;
    window.render();
  },

  async deletePost(postId) {
    initData();
    const pId = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);
    const isAdmin = window.transState.isAdmin;
    // 权限校验：管理员 or 帖子本人
    const post = window.transState.cloudPosts?.find(p => p.id === postId)
      || (window.transState.forumDetail?.id === postId ? window.transState.forumDetail : null);
    if (!isAdmin && post?.author_id !== pId) return;
    if (!confirm('确认删除这条帖子？关联评论也将一并清除。')) return;

    // 乐观更新
    if (window.transState.cloudPosts)
      window.transState.cloudPosts = window.transState.cloudPosts.filter(p => p.id !== postId);
    if (window.transState.forumDetail?.id === postId) {
      window.transState.forumDetail = null;
      window.transState.forumComments = null;
    }
    window.render();

    try {
      // 级联删除：comment_likes → comments → post_likes → post
      const { data: cmts } = await supabase.from('comments').select('id').eq('post_id', postId);
      const cmtIds = (cmts || []).map(c => c.id);
      if (cmtIds.length) {
        await supabase.from('comment_likes').delete().in('comment_id', cmtIds);
        await supabase.from('comments').delete().eq('post_id', postId);
      }
      await supabase.from('post_likes').delete().eq('post_id', postId);
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw new Error(error.message);
      window.actions.showToast('帖子已删除');
    } catch (e) {
      console.warn('[Trans] 删除帖子失败:', e.message);
      window.actions.showToast('删除失败：' + e.message);
      window.transState.cloudPosts = null;
      loadForum();
    }
  },

  async banPlayer(targetId, banState) {
    if (!window.transState.isAdmin) return;
    const label = banState ? '封号' : '解除封号';
    if (!confirm(`确认对该玩家执行「${label}」操作？`)) return;

    const { error } = await supabase.from('players').update({ is_banned: banState }).eq('id', targetId);
    if (error) {
      console.warn('[Trans] 封号操作失败:', error.message);
      window.actions.showToast('操作失败：' + error.message);
    } else {
      window.actions.showToast(`操作成功：${label}`);
      window.transState.adminTarget  = null;
      window.transState.cloudPlayers = null;
      loadRanking();
    }
  },

  // ── 副本设置 ────────────────────────────────────────────────────
  openDungeonSettings() {
    window.transState.dungeonSettingsOpen = true;
    window.render();
  },
  closeDungeonSettings() {
    window.transState.dungeonSettingsOpen = false;
    window.render();
  },
  toggleDungeonWb(wbId) {
    initData();
    const arr = store.transData.dungeonSettings.mountedWorldbooks;
    const idx = arr.indexOf(wbId);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(wbId);
    window.render();
  },

  // ── 自定义副本 & 文游 ──────────────────────────────────────────
  openCustomModal() {
    initData();
    if (store.transData.savedDungeon || window.transState.activeDungeon) {
      window.actions.showToast('已有副本进行中，请先完成或放弃当前副本');
      return;
    }
    window.transState.customModal  = true;
    window.transState.customScript = null;
    window.transState.customForm   = { world: '', name: '', briefing: '', target: '', selectedChars: [], difficulty: 2 };
    window.render();
  },

  closeCustomModal() {
    window.transState.customModal     = false;
    window.transState.generatingScript = false;
    window.render();
  },

  setCustomDifficulty(d) {
    window.transState.customForm.difficulty = d;
    window.render();
  },

  toggleCustomChar(charId) {
    const arr = window.transState.customForm.selectedChars;
    const idx = arr.indexOf(charId);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(charId);
    window.render();
  },

  async generateScript() {
    if (window.transState.generatingScript) return;
    const world    = document.getElementById('custom-world')?.value.trim()    || '';
    const name     = document.getElementById('custom-name')?.value.trim()     || '';
    const briefing = document.getElementById('custom-briefing')?.value.trim() || '';
    const target   = document.getElementById('custom-target')?.value.trim()   || '';
    const chars    = (store.contacts || []).filter(c => window.transState.customForm.selectedChars.includes(c.id));
    const persona  = store.personas?.[0] || {};
    window.transState.generatingScript = true;
    window.render();
    try {
      const script = await generateScriptData(world, name, briefing, target, chars, persona);
      window.transState.customScript  = script;
      const f = window.transState.customForm;
      f.world    = script.world    || world;
      f.name     = script.name     || name;
      f.briefing = script.briefing || briefing;
      f.target   = script.target   || target;
      window.actions.showToast('✦ 剧本生成完毕！');
    } catch (e) {
      console.warn('[Dungeon] 剧本生成失败:', e.message);
      window.actions.showToast('生成失败：' + e.message);
    } finally {
      window.transState.generatingScript = false;
      window.render();
      // 手动回填输入框（全量渲染后 value 属性已更新，但 iOS 偶尔不刷新 .value）
      setTimeout(() => {
        const f = window.transState.customForm;
        const g = id => document.getElementById(id);
        if (g('custom-world'))    g('custom-world').value    = f.world;
        if (g('custom-name'))     g('custom-name').value     = f.name;
        if (g('custom-briefing')) g('custom-briefing').value = f.briefing;
        if (g('custom-target'))   g('custom-target').value   = f.target;
      }, 80);
    }
  },

  async startCustomDungeon() {
    if (window.transState.generatingScript) return;
    const world    = document.getElementById('custom-world')?.value.trim()    || '';
    const name     = document.getElementById('custom-name')?.value.trim()     || '';
    const briefing = document.getElementById('custom-briefing')?.value.trim() || '';
    const target   = document.getElementById('custom-target')?.value.trim()   || '';
    const chars    = (store.contacts || []).filter(c => window.transState.customForm.selectedChars.includes(c.id));
    const persona  = store.personas?.[0] || {};
    let script     = window.transState.customScript;

    if (!script) {
      window.transState.generatingScript = true;
      window.render();
      try {
        script = await generateScriptData(world, name, briefing, target, chars, persona);
      } catch (e) {
        window.actions.showToast('剧本生成失败，请重试：' + e.message);
        window.transState.generatingScript = false;
        window.render();
        return;
      }
      window.transState.generatingScript = false;
    }

    const f = window.transState.customForm;
    const initChoices = expandOptionsDict(script.initial_options)
      || (Array.isArray(script.initial_choices)
          ? script.initial_choices.map(t => ({ type: 'custom', text: String(t) }))
          : [{ type: 'custom', text: '观察四周' }, { type: 'custom', text: '谨慎前行' }, { type: 'custom', text: '寻找信息' }]);
    const dungeon = {
      mission: {
        world:    script.world    || world    || '未知世界',
        name:     script.name     || name     || '未命名副本',
        briefing: script.briefing || briefing || '',
        target:   script.target   || target   || '',
        diff:     f.difficulty || 2,
        reward:   DIFF_REWARDS[f.difficulty] || DIFF_REWARDS[2],
      },
      script,
      log:      [{ type: 'narration', text: script.opening_scene || '副本开始……' }],
      choices:  initChoices,
      status:   { survival: 100, affections: {}, progress: 0 },
      inventory: [],
      turn:     0,
      history:  [],
      _firedTwists: [],
      _forceTwist: false,
      _compassHint: false,
      completed: false,
      isTrueEnding: false,
      isBadEnding: false,
      completionMsg: '',
      chars,
      persona,
    };
    window.transState.activeDungeon    = dungeon;
    store.transData.savedDungeon       = dungeon;
    window.transState.customModal      = false;
    window.transState.customScript     = null;
    window.transState.customForm       = { world: '', name: '', briefing: '', target: '', selectedChars: [] };
    window.transState.generatingScript = false;
    window.render();
    scrollDungeonLog();
  },

  async dungeonChoose(idx) {
    const dungeon = window.transState.activeDungeon;
    if (!dungeon || window.transState.generatingTurn || dungeon.completed) return;
    const choice = dungeon.choices[idx];
    if (!choice) return;
    const text = typeof choice === 'string' ? choice : (choice.text || '');
    const type = typeof choice === 'string' ? 'custom' : (choice.type || 'custom');
    if (!text) return;
    // 消耗罗盘提示——选择完即关闭高亮
    dungeon._compassHint = false;
    await _processDungeonTurn(text, type);
  },

  async dungeonCustomAction() {
    const el = document.getElementById('dungeon-custom-input');
    const action = el?.value.trim();
    if (!action) return;
    if (el) el.value = '';
    const dungeon = window.transState.activeDungeon;
    if (dungeon) dungeon._compassHint = false;
    await _processDungeonTurn(action, 'custom');
  },

  toggleDungeonInv() {
    window.transState.dungeonInvOpen = !window.transState.dungeonInvOpen;
    if (window.transState.dungeonInvOpen) window.transState.dungeonAffOpen = false;
    window.render();
  },

  toggleDungeonAff() {
    window.transState.dungeonAffOpen = !window.transState.dungeonAffOpen;
    if (window.transState.dungeonAffOpen) window.transState.dungeonInvOpen = false;
    window.render();
  },

  useShopItem(itemId) {
    const dungeon = window.transState.activeDungeon;
    if (!dungeon || dungeon.completed) return;
    const item = SHOP_ITEMS.find(s => s.id === itemId);
    if (!item) return;
    const inv = store.transData?.player?.inventory || [];
    const slot = inv.find(x => x.id === itemId);
    if (!slot || slot.qty <= 0) { window.actions.showToast('道具不足'); return; }

    // 罗盘：不弹 confirm，直接高亮本回合 trap
    if (itemId === 'compass') {
      const hasTrap = (dungeon.choices || []).some(c => (typeof c === 'object' && c.type === 'trap'));
      if (!hasTrap) {
        window.actions.showToast('本回合未检测到陷阱选项');
        return;
      }
      if (dungeon._compassHint) { window.actions.showToast('罗盘已激活'); return; }
      slot.qty -= 1;
      if (slot.qty <= 0) {
        const idx = inv.indexOf(slot);
        if (idx >= 0) inv.splice(idx, 1);
      }
      dungeon._compassHint = true;
      dungeon.log.push({ type: 'system', text: `🧭 使用【厄运预知罗盘】：陷阱选项已被标记，请避开。` });
      store.transData.savedDungeon = dungeon;
      window.actions.showToast('罗盘生效：陷阱已标红');
      window.render();
      return;
    }

    // 契约：只在 TE 结算时可用
    if (itemId === 'contract') {
      if (!dungeon.isTrueEnding) {
        window.actions.showToast('仅在 True Ending 结算时可用');
        return;
      }
      window.transState.teModalOpen = true;
      window.render();
      return;
    }

    // 回溯卡：在副本中直接使用，可任意回溯
    if (itemId === 'rewind') {
      window.transState.rewindModalOpen = true;
      window.render();
      return;
    }

    if (!confirm(`使用【${item.name}】？\n${item.desc}`)) return;
    slot.qty -= 1;
    if (slot.qty <= 0) {
      const idx = inv.indexOf(slot);
      if (idx >= 0) inv.splice(idx, 1);
    }
    dungeon.log.push({ type: 'system', text: `🎁 使用道具【${item.name}】：${item.desc}` });
    store.transData.savedDungeon = dungeon;
    window.actions.showToast(`已使用 ${item.name}`);
    window.render();
    scrollDungeonLog();
  },

  // ── 时光回溯 ────────────────────────────────────────────────────
  setRewindTarget(val) {
    window.transState.rewindTargetTurn = val;
  },

  doRewind() {
    const dungeon = window.transState.activeDungeon;
    if (!dungeon) return;
    const inv = store.transData?.player?.inventory || [];
    const slot = inv.find(x => x.id === 'rewind');
    if (!slot || slot.qty <= 0) {
      // 快捷购买
      const item = SHOP_ITEMS.find(s => s.id === 'rewind');
      const player = store.transData.player;
      if (!item) return;
      if (player.points < item.price) {
        window.actions.showToast(`积分不足，需要 ${item.price} pts`);
        return;
      }
      if (!confirm(`背包中没有【时间回溯卡】。\n立即花费 ${item.price} pts 购买 1 张？`)) return;
      player.points -= item.price;
      const existing = inv.find(i => i.id === 'rewind');
      if (existing) existing.qty += 1; else inv.push({ id: 'rewind', qty: 1 });
      syncPlayerToCloud();
      window.actions.showToast('已购入：⏪ 时间回溯卡');
      window.render();
      return;
    }
    const raw = window.transState.rewindTargetTurn;
    const target = parseInt(raw, 10);
    const histTurns = (dungeon.history || []).map(h => h.turn);
    if (!histTurns.length) { window.actions.showToast('没有可回溯的回合'); return; }
    const minT = Math.min(...histTurns);
    const maxT = Math.max(...histTurns);
    if (isNaN(target) || target < minT || target > maxT) {
      window.actions.showToast(`请输入 ${minT}–${maxT} 之间的回合数`);
      return;
    }
    if (!confirm(`消耗 1 张【时间回溯卡】，回到第 ${target} 回合？`)) return;
    // 扣道具
    slot.qty -= 1;
    if (slot.qty <= 0) {
      const idx = inv.indexOf(slot);
      if (idx >= 0) inv.splice(idx, 1);
    }
    const ok = _rewindDungeonTo(target);
    if (!ok) {
      window.actions.showToast('回溯失败：该回合快照不存在');
      // 回滚扣卡
      const back = inv.find(i => i.id === 'rewind');
      if (back) back.qty += 1; else inv.push({ id: 'rewind', qty: 1 });
      return;
    }
    window.transState.rewindModalOpen  = false;
    window.transState.rewindTargetTurn = '';
    window.actions.showToast(`⏪ 已回溯至第 ${target} 回合`);
    store.transData.savedDungeon = dungeon;
    window.render();
    scrollDungeonLog();
  },

  acceptBadEnding() {
    // 玩家放弃回溯，直接接受失败结算
    window.transActions.completeDungeon();
  },

  closeRewindModal() {
    window.transState.rewindModalOpen  = false;
    window.transState.rewindTargetTurn = '';
    window.render();
  },

  // ── TE 原创 NPC 提取 ────────────────────────────────────────────
  openTeExtract() {
    const dungeon = window.transState.activeDungeon;
    if (!dungeon) return;
    const inv = store.transData?.player?.inventory || [];
    const hasContract = inv.some(x => x.id === 'contract' && x.qty > 0);
    if (!hasContract) {
      // 快捷购买
      const item = SHOP_ITEMS.find(s => s.id === 'contract');
      const player = store.transData.player;
      if (!item) return;
      if (!confirm(`背包中没有【灵魂印记契约】。\n立即花费 ${item.price} pts 购买 1 张？`)) return;
      if (player.points < item.price) { window.actions.showToast(`积分不足（需 ${item.price} pts）`); return; }
      player.points -= item.price;
      const existing = inv.find(i => i.id === 'contract');
      if (existing) existing.qty += 1; else inv.push({ id: 'contract', qty: 1 });
      syncPlayerToCloud();
      window.actions.showToast('已购入：📜 灵魂印记契约');
      window.render();
      return;
    }
    window.transState.teModalOpen = true;
    window.transState.teNpcChoice = null;
    window.render();
  },

  closeTeExtract() {
    if (window.transState.teExtracting) return;
    window.transState.teModalOpen = false;
    window.transState.teNpcChoice = null;
    window.render();
  },

  pickTeNpc(name) {
    window.transState.teNpcChoice = name;
    window.render();
  },

  async confirmTeExtract() {
    const dungeon = window.transState.activeDungeon;
    const state = window.transState;
    if (!dungeon || !state.teNpcChoice || state.teExtracting) return;
    const inv = store.transData?.player?.inventory || [];
    const contractSlot = inv.find(x => x.id === 'contract');
    if (!contractSlot || contractSlot.qty <= 0) {
      window.actions.showToast('灵魂印记契约不足');
      return;
    }
    const npcMeta = (dungeon.script?.original_npcs || []).find(n => n.name === state.teNpcChoice);
    if (!npcMeta) { window.actions.showToast('NPC 信息缺失'); return; }

    state.teExtracting = true;
    window.render();

    try {
      // 拼装整个副本日志
      const fullLog = dungeon.log.map(e => {
        if (e.type === 'action')    return `[玩家] ${e.text}`;
        if (e.type === 'narration') return `[叙述] ${e.text}`;
        return `[系统] ${e.text}`;
      }).join('\n');

      const meta = JSON.stringify(npcMeta, null, 2);
      const userPrompt = `以下是一个刚刚完美通关的无限流副本《${dungeon.mission.name}》的完整日志。玩家消耗【灵魂印记契约】，要求你将原创 NPC 「${npcMeta.name}」带回主神空间通讯录。请严格基于该副本中该 NPC 的真实表现与设定，补全其深层灵魂档案。

【原始剧本设定】
${meta}

【整个副本日志】
${fullLog.slice(-12000)}

请输出一段 JSON，严格按照以下结构（所有字段都必填，不得空缺）：
{
  "realName": "真实姓名",
  "identity": "年龄与职业细节",
  "appearance": "容貌/气味/穿搭（具体细节）",
  "behavior": "说话风格/口头禅/怪癖",
  "social": "社交网络与仇敌",
  "background": "出身/童年/人生拐点",
  "secret": "内心冲突与秘密",
  "optional_flaws": "失去的事物或身心缺陷",
  "nsfw_kinks": "性向/偏好与底线",
  "greeting": "TA在离开副本后对玩家说的第一句话（自然、契合性格、100字内）"
}
仅输出 JSON，不要任何多余文字。`;

      const text = await callLLMDungeon([
        { role: 'system', content: '你是专业角色灵魂档案设计师，擅长基于剧情还原人物深层内心。输出严格 JSON。' },
        { role: 'user',   content: userPrompt },
      ], 2500);

      const soul = parseJSONSafe(text);

      // 扣契约
      contractSlot.qty -= 1;
      if (contractSlot.qty <= 0) {
        const ix = inv.indexOf(contractSlot);
        if (ix >= 0) inv.splice(ix, 1);
      }

      // 拼装角色 prompt（供 WeChat 使用）
      const promptParts = [
        `真实姓名：${soul.realName || npcMeta.name}`,
        soul.identity && `身份：${soul.identity}`,
        soul.appearance && `外貌：${soul.appearance}`,
        soul.behavior && `言行：${soul.behavior}`,
        soul.social && `社交：${soul.social}`,
        soul.background && `出身：${soul.background}`,
        soul.secret && `内心与秘密：${soul.secret}`,
        soul.optional_flaws && `缺陷：${soul.optional_flaws}`,
        soul.nsfw_kinks && `性向偏好：${soul.nsfw_kinks}`,
        `——来自副本《${dungeon.mission.name}》，经【灵魂印记契约】带回主神空间。`,
      ].filter(Boolean);

      // 创建新联系人
      const newId = 'char_' + Date.now();
      const defaultGroup = (store.groups && store.groups[0]?.id) || 'default';
      const defaultPersonaId = store.personas?.[0]?.id || 'p_default';
      const greeting = soul.greeting || `（你是${soul.realName || npcMeta.name}）……终于，这次换我来找你了。`;

      const newContact = {
        id: newId,
        name: soul.realName || npcMeta.name,
        prompt: promptParts.join('\n'),
        greeting,
        avatar: '',
        videoAvatar: '',
        minimaxVoiceEnabled: false,
        minimaxVoiceId: '',
        boundPersonaId: defaultPersonaId,
        groupId: defaultGroup,
        autoMsgEnabled: false,
        autoMsgInterval: 5,
      };
      if (!store.contacts) store.contacts = [];
      store.contacts.push(newContact);

      // 创建第一条打招呼聊天
      if (!store.chats) store.chats = [];
      const nowTime = (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      })();
      const newChat = {
        id: 'chat_' + Date.now(),
        charId: newId,
        isGroup: false,
        messages: [{
          id: Date.now() + 1,
          sender: newContact.name,
          text: greeting,
          isMe: false,
          source: 'wechat',
          isOffline: false,
          msgType: 'text',
          time: nowTime,
        }],
        boundPersonaId: defaultPersonaId,
      };
      store.chats.push(newChat);

      dungeon.log.push({ type: 'system', text: `📜 契约生效！${newContact.name} 已加入主神空间通讯录。` });
      window.actions.showToast(`✦ ${newContact.name} 已带回通讯录`);
      state.teModalOpen   = false;
      state.teNpcChoice   = null;
    } catch (e) {
      console.warn('[Dungeon] TE 提取失败:', e.message);
      window.actions.showToast('提取失败：' + e.message);
    } finally {
      state.teExtracting = false;
      window.render();
    }
  },

  exitDungeon() {
    const dungeon = window.transState.activeDungeon;
    if (!dungeon) return;
    // 🌟 直接保留引用，进行中的回合完成后仍能更新同一对象
    initData();
    store.transData.savedDungeon      = dungeon;
    window.transState.activeDungeon   = null;
    window.transState.dungeonInvOpen  = false;
    window.transState.dungeonAffOpen  = false;
    // generatingTurn 不重置——若有回合在生成，完成后 finally 会更新 savedDungeon
    window.transState.tab             = 'mission';
    window.actions.showToast('副本已暂存，可随时继续');
    window.render();
  },

  abandonDungeon() {
    if (!confirm('确认放弃副本？所有进度将清除，无法恢复。')) return;
    initData();
    const dungeon = window.transState.activeDungeon || store.transData.savedDungeon;
    if (dungeon) dungeon._abandoned = true;   // 防止 in-flight 回合完成后复活副本
    store.transData.savedDungeon      = null;
    store.transData.player.activeWorldId = null;
    window.transState.activeDungeon   = null;
    window.transState.dungeonInvOpen  = false;
    window.transState.dungeonAffOpen  = false;
    window.transState.generatingTurn  = false;
    window.actions.showToast('副本已放弃');
    syncPlayerToCloud();
    window.render();
  },

  resumeDungeon() {
    initData();
    if (!store.transData.savedDungeon) return;
    window.transState.activeDungeon  = store.transData.savedDungeon;
    window.transState.dungeonInvOpen = false;
    window.transState.dungeonAffOpen = false;
    window.render();
    scrollDungeonLog();
  },

  completeDungeon() {
    const dungeon = window.transState.activeDungeon;
    if (!dungeon) return;
    initData();
    const player = store.transData.player;
    const base = dungeon.mission.reward || { points: 200, exp: 50 };
    const mult = dungeon.isTrueEnding ? 2 : 1;
    const r = { points: Math.round(base.points * mult), exp: Math.round(base.exp * mult) };
    player.points          += r.points;
    player.exp             += r.exp;
    player.completedWorlds += 1;
    player.activeWorldId   = null;
    // 经验升级简单判定
    while (player.exp >= player.expToNext) {
      player.exp      -= player.expToNext;
      player.level    += 1;
      player.expToNext = Math.floor(player.expToNext * 1.4);
    }
    window.actions.showToast(`副本结算完毕！+${r.points}pts +${r.exp}exp`);
    store.transData.savedDungeon      = null;
    syncPlayerToCloud();
    window.transState.activeDungeon   = null;
    window.transState.dungeonInvOpen  = false;
    window.transState.dungeonAffOpen  = false;
    window.transState.tab = 'mission';
    window.render();
  },

  // ── 帖子详情 & 评论系统 ─────────────────────────────────────────
  async openPostDetail(postId) {
    const source = window.transState.cloudPosts !== null ? window.transState.cloudPosts : MOCK_POSTS;
    const post   = source.find(p => p.id === postId);
    if (!post) return;
    window.transState.forumDetail   = { ...post };
    window.transState.forumComments = null;
    window.transState.replyTarget   = null;
    window.render();

    if (postId.startsWith('mock-')) {
      window.transState.forumComments = [];
      window.render(); return;
    }

    initData();
    const pId = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);
    await loadComments(postId);

    try {
      // 检查帖子是否已赞
      const { data: pl } = await supabase.from('post_likes')
        .select('post_id').eq('post_id', postId).eq('player_id', pId).maybeSingle();
      if (pl) window.transState.likedPosts.add(postId);

      // 批量检查已赞的评论
      const cIds = (window.transState.forumComments || []).map(c => c.id);
      if (cIds.length) {
        const { data: cl } = await supabase.from('comment_likes')
          .select('comment_id').eq('player_id', pId).in('comment_id', cIds);
        cl?.forEach(r => window.transState.likedComments.add(r.comment_id));
      }
      window.render();
    } catch (e) { /* 网络失败不影响主流程 */ }
  },

  closePostDetail() {
    window.transState.forumDetail   = null;
    window.transState.forumComments = null;
    window.transState.replyTarget   = null;
    window.render();
  },

  setReplyTarget(commentId, authorName, rootId, isSubReply) {
    window.transState.replyTarget = {
      commentId, authorName, rootId,
      isSubReply: isSubReply === true || isSubReply === 'true',
    };
    window.render();
    setTimeout(() => document.getElementById('trans-comment-input')?.focus(), 80);
  },

  clearReplyTarget() {
    window.transState.replyTarget = null;
    window.render();
  },

  async submitComment() {
    const el      = document.getElementById('trans-comment-input');
    const rawText = el?.value.trim();
    if (!rawText) return;

    const post = window.transState.forumDetail;
    if (!post || post.id.startsWith('mock-')) {
      window.actions.showToast('示例帖子不支持评论'); return;
    }

    initData();
    const player = store.transData.player;
    const pId    = 'TRV-' + String(player.joinedAt).slice(-8);

    // 封号拦截
    try {
      const { data } = await supabase.from('players').select('is_banned').eq('id', pId).maybeSingle();
      if (data?.is_banned) { window.actions.showToast('您的账号已被封禁，无法发表评论'); return; }
    } catch (e) { /* 网络异常放行，交给 RLS 兜底 */ }

    const defaultPersona = store.personas?.[0] || {};
    const pName = player.name || defaultPersona.name || '旅行者';
    const rt    = window.transState.replyTarget;
    const parentId = rt ? rt.rootId : null;
    const content  = rt?.isSubReply ? `回复 @${rt.authorName}：${rawText}` : rawText;

    if (el) el.value = '';
    window.transState.replyTarget = null;

    const { data, error } = await supabase.from('comments').insert({
      post_id: post.id, parent_id: parentId,
      author_id: pId, author_name: pName,
      content, likes: 0,
    }).select().single();

    if (error) {
      console.warn('[Trans] 评论失败:', error.message);
      window.actions.showToast('评论失败，请重试'); return;
    }

    if (window.transState.forumComments) window.transState.forumComments.push(data);
    const newCount = (post.comments || 0) + 1;
    window.transState.forumDetail.comments = newCount;
    if (window.transState.cloudPosts) {
      const p = window.transState.cloudPosts.find(x => x.id === post.id);
      if (p) p.comments = newCount;
    }
    window.render();
    await supabase.from('posts').update({ comments: newCount }).eq('id', post.id);
    window.actions.showToast('评论发布成功！');
  },

  async likeComment(commentId) {
    if (window.transState.likedComments.has(commentId)) {
      window.actions.showToast('已经赞过了～'); return;
    }
    initData();
    const pId = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);

    const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, player_id: pId });
    if (error) {
      if (error.code === '23505') {
        window.transState.likedComments.add(commentId);
        window.actions.showToast('已经赞过了～');
        window.render();
      } else {
        console.warn('[Trans] 评论点赞失败:', error.message);
        window.actions.showToast('点赞失败，请重试');
      }
      return;
    }

    const comment = window.transState.forumComments?.find(c => c.id === commentId);
    if (comment) comment.likes = (comment.likes || 0) + 1;
    window.transState.likedComments.add(commentId);
    window.render();
    if (comment) await supabase.from('comments').update({ likes: comment.likes }).eq('id', commentId);
  },

  async deleteComment(commentId) {
    initData();
    const pId     = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);
    const isAdmin = window.transState.isAdmin;
    const comment = window.transState.forumComments?.find(c => c.id === commentId);
    if (!isAdmin && comment?.author_id !== pId) return;
    if (!confirm('确认删除这条评论？')) return;

    // 乐观移除（同时移除其下所有子回复）
    if (window.transState.forumComments) {
      window.transState.forumComments = window.transState.forumComments.filter(
        c => c.id !== commentId && c.parent_id !== commentId
      );
      // 同步帖子评论数
      const post = window.transState.forumDetail;
      if (post) {
        const newCount = window.transState.forumComments.length;
        post.comments = newCount;
        if (window.transState.cloudPosts) {
          const p = window.transState.cloudPosts.find(x => x.id === post.id);
          if (p) p.comments = newCount;
        }
      }
    }
    window.render();

    try {
      // 先删子回复的 likes，再删子回复，再删本评论的 likes，再删本评论
      const { data: children } = await supabase.from('comments').select('id').eq('parent_id', commentId);
      const childIds = (children || []).map(c => c.id);
      if (childIds.length) {
        await supabase.from('comment_likes').delete().in('comment_id', childIds);
        await supabase.from('comments').delete().eq('parent_id', commentId);
      }
      await supabase.from('comment_likes').delete().eq('comment_id', commentId);
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw new Error(error.message);

      // 同步帖子评论数到 DB
      const post = window.transState.forumDetail;
      if (post) await supabase.from('posts').update({ comments: post.comments }).eq('id', post.id);
      window.actions.showToast('评论已删除');
    } catch (e) {
      console.warn('[Trans] 删除评论失败:', e.message);
      window.actions.showToast('删除失败：' + e.message);
      // 重新拉取评论
      if (window.transState.forumDetail)
        await loadComments(window.transState.forumDetail.id);
    }
  },
};

// ─── 副本文游：工具——结构化选项 → 打乱的渲染数组 ──────────────────
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 将 optionsDict {main_plot, emotion[], trap, twist} 展开为前端选项列表
// 返回 [{ type, text }...]，顺序随机
function expandOptionsDict(dict) {
  if (!dict || typeof dict !== 'object') return null;
  const list = [];
  if (dict.main_plot && typeof dict.main_plot === 'string' && dict.main_plot.trim())
    list.push({ type: 'main_plot', text: dict.main_plot.trim() });
  if (Array.isArray(dict.emotion)) {
    dict.emotion.forEach(t => {
      if (typeof t === 'string' && t.trim()) list.push({ type: 'emotion', text: t.trim() });
    });
  }
  if (dict.trap && typeof dict.trap === 'string' && dict.trap.trim())
    list.push({ type: 'trap', text: dict.trap.trim() });
  if (dict.twist && typeof dict.twist === 'string' && dict.twist.trim())
    list.push({ type: 'twist', text: dict.twist.trim() });
  return list.length > 0 ? shuffleArray(list) : null;
}

// 深克隆副本快照（用于历史回溯；避开不可序列化引用）
function snapshotDungeon(dungeon) {
  return {
    turn:      dungeon.turn,
    status:    JSON.parse(JSON.stringify(dungeon.status || {})),
    inventory: (dungeon.inventory || []).slice(),
    logLen:    dungeon.log.length,
    choices:   JSON.parse(JSON.stringify(dungeon.choices || [])),
  };
}

// ─── 副本文游：回合处理（模块级，供 actions 调用）─────────────────
async function _processDungeonTurn(actionText, choiceType = 'custom') {
  const dungeon = window.transState.activeDungeon;
  if (!dungeon || window.transState.generatingTurn || dungeon.completed) return;

  // 进入新回合前：把上一回合的快照存入 history（用于回溯）
  if (!dungeon.history) dungeon.history = [];
  dungeon.history.push(snapshotDungeon(dungeon));
  if (dungeon.history.length > 30) dungeon.history.shift();   // 上限保护

  dungeon.log.push({ type: 'action', text: actionText });
  dungeon.choices = [];
  dungeon.turn++;
  dungeon._lastChoiceType = choiceType;
  window.transState.generatingTurn = true;
  window.render();
  scrollDungeonLog();

  try {
    const sysPrompt = buildDungeonSysPrompt(dungeon);
    const userPrompt = `玩家行动：${actionText}\n玩家选择类型：[${choiceType}]${
      choiceType === 'trap' ? '（请在本回合叙事中强制给予惩罚）' : ''
    }`;
    const text = await callLLMDungeon([
      { role: 'system', content: sysPrompt },
      { role: 'user',   content: userPrompt },
    ], 2500);

    const result = parseJSONSafe(text);

    dungeon.log.push({ type: 'narration', text: result.narration || '（叙述生成失败）' });

    // 优先处理结构化 options；兼容老格式 choices
    const optsDict = result.options || null;
    const expanded = expandOptionsDict(optsDict);
    if (expanded && expanded.length) {
      dungeon.choices = expanded;
    } else if (Array.isArray(result.choices) && result.choices.length) {
      dungeon.choices = result.choices.map(t => ({ type: 'custom', text: String(t) }));
    } else {
      dungeon.choices = [
        { type: 'custom', text: '继续' },
        { type: 'custom', text: '观察' },
        { type: 'custom', text: '等待' },
      ];
    }

    const d = result.status_delta || {};
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    dungeon.status.survival = clamp(dungeon.status.survival + (d.survival || 0), 0, 100);

    // 阶段锁：如果 AI 未标记 gate_passed，进度不得越过当前阶段 threshold
    const gates = dungeon.script?.stage_gates || [];
    const curGate = gates.find(g => dungeon.status.progress < g.threshold);
    const progressDelta = Math.min(d.progress || 0, 5); // 强制限速：一回合最多涨5点进度
    let progTarget = clamp(dungeon.status.progress + progressDelta, 0, 100);
    if (curGate && !result.gate_passed && progTarget >= curGate.threshold) {
      progTarget = curGate.threshold - 1;
      dungeon.log.push({ type: 'system', text: `🔒 阶段锁：${curGate.requirement} 尚未完成，进度被卡在 ${curGate.threshold - 1}%` });
    }
    dungeon.status.progress = Math.max(0, progTarget);

    if (result.gate_passed && curGate) {
      dungeon.log.push({ type: 'system', text: `✅ 阶段突破：完成「${curGate.requirement}」` });
    }

    // 按角色名更新好感度
    if (!dungeon.status.affections) dungeon.status.affections = {};
    const aff = result.affection_deltas || {};
    Object.entries(aff).forEach(([name, delta]) => {
      dungeon.status.affections[name] = clamp((dungeon.status.affections[name] || 0) + (delta || 0), -100, 200);
    });

    if (result.new_items?.length) {
      dungeon.inventory.push(...result.new_items);
      dungeon.log.push({ type: 'system', text: `获得道具：${result.new_items.join('、')}` });
    }
    if (result.system_note) {
      dungeon.log.push({ type: 'system', text: result.system_note });
    }

    // 记录已触发的 twist
    if (typeof result.twist_fired_index === 'number' && result.twist_fired_index >= 0) {
      dungeon._firedTwists = dungeon._firedTwists || [];
      if (!dungeon._firedTwists.includes(result.twist_fired_index))
        dungeon._firedTwists.push(result.twist_fired_index);
    }

    // 下一回合的 forceTwist 判断：AI 自检 + 前端条件检测
    dungeon._forceTwist = _detectTwistReady(dungeon);

    // 判定完成
    const isTE = result.is_true_ending === true;
    const isBE = result.is_bad_ending === true || dungeon.status.survival <= 0;

    if (result.is_completed || isTE || dungeon.status.progress >= 100) {
      dungeon.completed     = true;
      dungeon.isTrueEnding  = isTE;
      dungeon.isBadEnding   = isBE && !isTE;
      dungeon.completionMsg = result.completion_message || (isTE
        ? '你以完美姿态完成了这个世界的故事。'
        : '你成功完成了副本任务，系统为你结算奖励。');
    } else if (isBE) {
      // 中途 BE（如被囚禁、黑化）：标记死亡流程而非直接结算
      dungeon.completed     = true;
      dungeon.isBadEnding   = true;
      dungeon.completionMsg = result.completion_message || '生存值归零 / 陷入 BE——但这也是一段珍贵的经历。';
      dungeon.mission.reward = { points: 20, exp: 10 };
    }

  } catch (e) {
    console.warn('[Dungeon] 回合生成失败:', e.message);
    dungeon.log.push({ type: 'system', text: `[错误] ${e.message}` });
    dungeon.choices = [
      { type: 'custom', text: '重试本回合' },
      { type: 'custom', text: '尝试其他行动' },
      { type: 'custom', text: '观察四周' },
    ];
  } finally {
    window.transState.generatingTurn = false;
    // 每回合自动存档（仅当副本未被放弃时）
    if (dungeon && !dungeon._abandoned) {
      initData();
      store.transData.savedDungeon = dungeon;   // 🌟 保留引用，保证退出/重进时数据一致
    }
    window.render();
    scrollDungeonLog();
  }
}

// 前端检测：基于 twist_triggers 的关键词粗略匹配当前状态，决定下回合是否强制下发 twist 选项。
// 只做字符串层面的"好感度≥N/持有XX道具"模式匹配，匹配不到交由 AI 自行判断。
function _detectTwistReady(dungeon) {
  const triggers = dungeon.script?.twist_triggers || [];
  if (!triggers.length) return false;
  const fired = new Set(dungeon._firedTwists || []);
  const status = dungeon.status || {};
  const inv = (dungeon.inventory || []).map(x => String(x));

  for (let i = 0; i < triggers.length; i++) {
    if (fired.has(i)) continue;
    const cond = String(triggers[i].condition || '');
    // 好感度阈值：形如「XXX 好感度 ≥ 70」或「好感度大于70」
    const affMatch = cond.match(/好感[度]?\s*[≥>=＞≧]\s*(-?\d+)/);
    if (affMatch) {
      const need = parseInt(affMatch[1], 10);
      const affs = Object.values(status.affections || {});
      if (affs.some(v => v >= need)) return true;
    }
    // 道具持有：形如「获得/持有 XXX」
    const itemMatch = cond.match(/(?:获得|持有|拥有)\s*[「『【《]?([^」』】》，,。；;\s]+)/);
    if (itemMatch) {
      const kw = itemMatch[1];
      if (inv.some(it => it.includes(kw))) return true;
    }
  }
  return false;
}

// ─── 时光回溯：从历史快照恢复 ─────────────────────────────────────
function _rewindDungeonTo(targetTurn) {
  const dungeon = window.transState.activeDungeon;
  if (!dungeon || !dungeon.history?.length) return false;
  const snap = dungeon.history.find(h => h.turn === targetTurn);
  if (!snap) return false;
  dungeon.turn      = snap.turn;
  dungeon.status    = JSON.parse(JSON.stringify(snap.status));
  dungeon.inventory = snap.inventory.slice();
  dungeon.choices   = JSON.parse(JSON.stringify(snap.choices));
  dungeon.log       = dungeon.log.slice(0, snap.logLen);
  // 截断 history：保留到 targetTurn 为止
  dungeon.history   = dungeon.history.filter(h => h.turn < targetTurn);
  dungeon.completed = false;
  dungeon.isBadEnding = false;
  dungeon.isTrueEnding = false;
  dungeon.completionMsg = '';
  dungeon.log.push({ type: 'system', text: `⏪ 时光回溯至第 ${targetTurn} 回合，命运重新展开。` });
  return true;
}
