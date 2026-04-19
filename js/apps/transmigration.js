// js/apps/transmigration.js — 快穿系统：无限流玩家终端（全网联机版）

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { store } from '../store.js';

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
};

// ─── 商城道具库 ──────────────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'disguise',  name: '身份伪装卡',        icon: '🎭', price: 100,  tag: '消耗品', desc: '完美伪装在副本中的身份，令宿主识破概率降低50%，仅限当次任务。' },
  { id: 'charm',     name: '魅力值增幅剂',       icon: '💊', price: 200,  tag: '增益',   desc: '临时提升好感值获取速度×1.5，持续一个副本周期。' },
  { id: 'memory',    name: '记忆闪回丹',         icon: '🔮', price: 150,  tag: '情报',   desc: '可查看任意NPC的核心记忆片段，获取关键情报，一次性使用。' },
  { id: 'skip',      name: '剧情快进券',         icon: '⚡', price: 300,  tag: '效率',   desc: '跳过枯燥铺垫直达核心冲突节点，省下大量时间成本。' },
  { id: 'shield',    name: 'OOC警报屏蔽器',      icon: '🛡️', price: 250,  tag: '保险',   desc: '本次OOC行为不触发任务失败判定，给你一次宝贵机会。' },
  { id: 'plotpack',  name: '隐藏剧情解锁包',     icon: '📦', price: 500,  tag: '稀有',   desc: '解锁当前副本全部隐藏支线，任务奖励翻倍结算。' },
  { id: 'expcard',   name: '经验值加倍卡',       icon: '🌟', price: 400,  tag: '增益',   desc: '本次任务完成后经验值×2结算，快速突破等级瓶颈。' },
  { id: 'target',    name: '攻略对象追加券',     icon: '💌', price: 800,  tag: '稀有',   desc: '在当前副本额外追加一名隐藏攻略对象，大幅提升副本趣味性。' },
  { id: 'godmode',   name: '系统权限临时提升',   icon: '👑', price: 1000, tag: '传说',   desc: '暂时获得S级系统辅助，判定成功率大幅提升，限时使用。' },
  { id: 'rewind',    name: '时间回溯卡',         icon: '⏪', price: 600,  tag: '稀有',   desc: '将副本进度回溯至任意存档点，代价是消耗当前持有积分的20%。' },
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
    target: '存活至故事结局，朝堂势力值≥70', reward: { points: 480, exp: 120 }, limit: '无限制' },
  { id: 'w005', name: '星际联邦叛逃者',    world: '科幻星际',   diff: 4,
    tags: ['科幻', '星际', '间谍'],
    briefing: '化身联邦叛逃情报员，在星际追杀与政治阴谋中寻找真相，与冷酷的联邦执法官展开生死猫鼠游戏。',
    target: '完成情报交割，在联邦追捕下存活并揭露幕后黑手', reward: { points: 700, exp: 180 }, limit: '无限制' },
  { id: 'w006', name: '修仙界之逆天改命',  world: '玄幻修仙',   diff: 2,
    tags: ['修仙', '玄幻', '成长'],
    briefing: '穿越成废灵根的炮灰弟子，在宗门险境中存活，拜入传说中的魔道大佬门下，改写被注定的悲剧结局。',
    target: '突破筑基期，与攻略对象订立契约', reward: { points: 300, exp: 80 }, limit: '无限制' },
];

// ─── Mock 降级数据（对齐 SQL 字段名）────────────────────────────
const MOCK_POSTS = [
  { id: 'mock-p1', author_name: '无限流退休人员', author_level: 99,
    content: '通关100+副本的老玩家忠告：积分别全存着，关键时刻一张OOC屏蔽器能救你的命。我在星际副本舍不得买，被系统警告三次差点强退。',
    likes: 2890, comments: 678, created_at: new Date(Date.now() - 86400000 * 2).toISOString(), tag: '经验' },
  { id: 'mock-p2', author_name: 'NPC_觉醒者', author_level: 88,
    content: '【深度理论】所有偏执男主在爱上你之前，其实只是把你当棋子。先被利用，再被独占。这才是偏执系副本的正确打法。',
    likes: 1203, comments: 445, created_at: new Date(Date.now() - 86400000).toISOString(), tag: '理论' },
  { id: 'mock-p3', author_name: '穿越老司机', author_level: 42,
    content: '偏执男主世界通关心得：千万别在第一周就主动示好。让他觉得你随时可能离开，占有欲才会被激活。',
    likes: 234, comments: 67, created_at: new Date(Date.now() - 3600000 * 2).toISOString(), tag: '攻略' },
  { id: 'mock-p4', author_name: '系统幽灵', author_level: 7,
    content: '救命！我进了末世副本结果系统给我分配的身份是丧尸BOSS的随从，有没有大佬带飞？？',
    likes: 891, comments: 203, created_at: new Date(Date.now() - 3600000 * 5).toISOString(), tag: '求助' },
  { id: 'mock-p5', author_name: '泡面侠', author_level: 15,
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
    };
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

// ─── 各 Tab 渲染 ──────────────────────────────────────────────────
function renderTerminal(player, pName, pAvatar, pId, title) {
  const expPct = Math.min(100, Math.round(player.exp / player.expToNext * 100));
  const activeWorld = player.activeWorldId ? MISSIONS.find(m => m.id === player.activeWorldId) : null;
  const invCount = (player.inventory || []).length;

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

    ${activeWorld ? `
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

function renderForum(pName, pAvatar, pId) {
  const state = window.transState;
  const sub   = state.forumSub;
  const source = state.cloudPosts !== null ? state.cloudPosts : MOCK_POSTS;
  const isCloudData = state.cloudPosts !== null;    // null=未连通，[]或有数据=已连通
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

    <div class="text-[10px] text-center py-1 font-mono" style="${isCloudData ? 'color:#3fb950;background:rgba(63,185,80,0.04);' : 'color:#ffa64d;background:rgba(255,166,77,0.06);'}">
      ${isCloudData ? `● 已连接云端 · ${source.length} 条帖子` : '⚠ 使用本地示例数据 · 联网后点刷新'}
    </div>

    <div class="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-2.5">
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
          return `
          <div class="rounded-xl p-3.5" style="background:#161b22;border:1px solid rgba(255,255,255,0.05);">
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
                <span class="text-[9px] px-1.5 py-0.5 rounded font-bold" style="${tagStyle(p.tag)}">${p.tag || '分享'}</span>
                ${isAdmin && !isMockPost ? `
                <button onclick="window.transActions.deletePost('${p.id}')"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded active:scale-90 transition-transform"
                  style="background:rgba(248,81,73,0.12);color:#f85149;border:1px solid rgba(248,81,73,0.3);">删除</button>
                ` : ''}
              </div>
            </div>
            <div class="text-[13px] leading-relaxed mb-2.5" style="color:#c9d1d9;">${p.content}</div>
            <div class="flex items-center gap-4" style="color:#8b949e;">
              <button onclick="window.transActions.likePost('${p.id}')" class="flex items-center gap-1 text-[11px] active:scale-90 transition-transform">
                <i data-lucide="heart" style="width:13px;height:13px;"></i>${p.likes}
              </button>
              <span class="flex items-center gap-1 text-[11px]">
                <i data-lucide="message-circle" style="width:13px;height:13px;"></i>${p.comments}
              </span>
            </div>
          </div>`;
        }).join('')}

      <div class="rounded-xl p-3" style="background:#161b22;border:1px dashed rgba(88,212,245,0.15);">
        <textarea id="trans-post-input" rows="3" placeholder="发布你的穿越心得..." class="w-full bg-transparent outline-none resize-none text-[13px] hide-scrollbar" style="color:#e6edf3;"></textarea>
        <div class="flex justify-end mt-2">
          <button onclick="window.transActions.submitPost()" class="text-[12px] font-bold px-4 py-1.5 rounded-lg" style="background:rgba(88,212,245,0.1);border:1px solid rgba(88,212,245,0.3);color:#58d4f5;">发布</button>
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
  return `
  <div class="p-4 space-y-3">
    <div class="text-[10px] font-mono mb-1" style="color:#8b949e;letter-spacing:3px;">AVAILABLE DUNGEONS — 可接取副本</div>
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

// ─── 主渲染函数 ───────────────────────────────────────────────────
export const renderTransmigrationApp = (store) => {
  initData();
  // 每次渲染都异步刷新管理员权限，结果回来后触发重渲染
  const _pId = 'TRV-' + String(store.transData.player.joinedAt).slice(-8);
  checkAdminStatus(_pId).then(changed => { if (changed) window.render(); });
  const state  = window.transState;
  const player = store.transData.player;

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

  // 副本弹窗
  let missionModal = '';
  if (state.missionModal) {
    const m = MISSIONS.find(x => x.id === state.missionModal);
    if (m) {
      const isActive = player.activeWorldId === m.id;
      missionModal = `
      <div class="absolute inset-0 z-50 flex items-end justify-center" style="background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);"
        onclick="window.transActions.closeMissionModal()">
        <div class="w-full rounded-t-3xl p-5 pb-8" style="background:#161b22;border-top:1px solid rgba(88,212,245,0.3);" onclick="event.stopPropagation()">
          <div class="w-10 h-1 rounded-full mx-auto mb-4" style="background:rgba(255,255,255,0.15);"></div>
          <div class="text-[10px] font-mono mb-1" style="color:#8b949e;letter-spacing:2px;">${m.world}</div>
          <div class="text-[20px] font-black mb-1" style="color:#e6edf3;">${m.name}</div>
          <div class="mb-2">${getDiffStars(m.diff)}</div>
          <div class="text-[13px] leading-relaxed mb-3" style="color:#c9d1d9;">${m.briefing}</div>
          <div class="rounded-xl p-3 mb-4 space-y-1.5" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);">
            <div class="text-[11px] font-bold mb-1" style="color:#8b949e;letter-spacing:1px;">▸ 任务目标</div>
            <div class="text-[13px]" style="color:#e6edf3;">${m.target}</div>
            <div class="flex items-center gap-4 mt-2 text-[12px]">
              <span style="color:#3fb950;">+${m.reward.points} pts</span>
              <span style="color:#bc8cff;">+${m.reward.exp} exp</span>
              <span style="color:#8b949e;">时限：${m.limit}</span>
            </div>
          </div>
          <div class="flex gap-3">
            <button onclick="window.transActions.closeMissionModal()" class="flex-1 py-3 rounded-xl font-bold text-[14px]"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#8b949e;">取消</button>
            <button onclick="window.transActions.acceptMission('${m.id}')" class="flex-1 py-3 rounded-xl font-bold text-[14px]"
              style="background:${isActive ? 'rgba(248,81,73,0.1)' : 'rgba(63,185,80,0.12)'};border:1px solid ${isActive ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.35)'};color:${isActive ? '#f85149' : '#3fb950'};">
              ${isActive ? '放弃该副本' : '确认接取'}
            </button>
          </div>
        </div>
      </div>`;
    }
  }

  const navTabs = [
    { id: 'terminal', icon: 'user',          label: '终端' },
    { id: 'shop',     icon: 'shopping-cart', label: '商城' },
    { id: 'forum',    icon: 'message-square',label: '论坛' },
    { id: 'ranking',  icon: 'bar-chart-2',   label: '排名' },
    { id: 'mission',  icon: 'zap',           label: '副本' },
  ];

  return `
  <style>
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
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

    <div class="flex-1 overflow-y-auto hide-scrollbar" id="trans-content">${content}</div>

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

    ${missionModal}
    ${renderAdminTargetModal()}
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

  openMission(id)       { window.transState.missionModal = id; window.render(); },
  closeMissionModal()   { window.transState.missionModal = null; window.render(); },

  acceptMission(id) {
    const player = store.transData.player;
    if (player.activeWorldId === id) {
      player.activeWorldId = null;
      window.transState.missionModal = null;
      window.actions.showToast('已放弃当前副本');
    } else {
      player.activeWorldId = id;
      const m = MISSIONS.find(x => x.id === id);
      window.transState.missionModal = null;
      window.actions.showToast(`已接取副本：${m?.name}`);
    }
    syncPlayerToCloud();
    window.render();
  },

  likePost(postId) {
    const posts = window.transState.cloudPosts;
    if (!posts) return;
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    p.likes += 1;
    window.render();
    supabase.from('posts').update({ likes: p.likes }).eq('id', postId)
      .then(({ error }) => { if (error) console.warn('[Trans] 点赞同步失败:', error.message); });
  },

  async submitPost() {
    const el = document.getElementById('trans-post-input');
    const text = el?.value.trim();
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
      content: text, tag: '分享', likes: 0, comments: 0,
      created_at: new Date().toISOString(),
    };
    if (window.transState.cloudPosts) window.transState.cloudPosts.unshift(optimisticPost);
    window.transState.forumSub = 'mine';
    window.render();
    if (el) el.value = '';

    // 先强制同步玩家，确保 players 表中已存在当前用户（消除外键约束竞态）
    await syncPlayerToCloud(true);

    // 插入云端（不发 id，让 DB 生成 UUID）
    const { data, error } = await supabase.from('posts').insert({
      author_id:     pId,
      author_name:   pName,
      author_level:  player.level,
      author_avatar: pAvatarForPost,
      content:       text,
      tag:           '分享',
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
    if (!window.transState.isAdmin) return;
    if (!confirm('确认删除这条帖子？')) return;

    if (window.transState.cloudPosts) {
      window.transState.cloudPosts = window.transState.cloudPosts.filter(p => p.id !== postId);
      window.render();
    }
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      console.warn('[Trans] 删除帖子失败:', error.message);
      window.actions.showToast('删除失败：' + error.message);
      // 失败则重新拉取
      window.transState.cloudPosts = null;
      loadForum();
    } else {
      window.actions.showToast('帖子已删除');
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
      window.transState.cloudPlayers = null; // 刷新排名
      loadRanking();
    }
  },
};
