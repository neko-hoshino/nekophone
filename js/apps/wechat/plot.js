// js/apps/wechat/plot.js — 随机剧情库（三层体系）

// ─── 微型剧情库 ───────────────────────────────────────────────────
// 日常小插曲，增加活人感，AI顺嘴一提即翻篇
export const MICRO_PLOTS = [
  // 小意外
  '外卖拿错了', '手机突然没电快关机了', '出门忘带钥匙', '钱包找不到了',
  '公交坐过站了', '发现衣服穿反了出门好久', '电梯坏了只能爬楼',
  '被雨淋了一下', '路上踩到奇怪的东西', '遇到了奇葩路人',
  '点餐点错了', '闹钟没响差点迟到', '买东西多买了一堆用不上的',
  '手滑把饮料洒了', '宠物闯了个无伤大雅的小祸',
  // 小趣事
  '抽奖抽到了搞笑的东西', '在街上意外碰到了熟人', '被陌生人认错了人',
  '做了个奇奇怪怪的梦顺便想分享', '突然记起忘做的某件小事',
  '看到了一个很想分享的搞笑或奇葩内容', '拍到了一张很有意思的照片想给对方看'
];

// ─── 短线剧情库 ───────────────────────────────────────────────────
// 情绪与状态突变，需要对方顺毛哄或深度互动
export const SHORT_PLOTS = [
  // 身体状态异常
  '突然发烧头很烫人很难受', '喝多了有点醉', '肠胃不舒服一直不太好', '失眠了根本睡不着',
  '崴了脚走路有点瘸', '头疼欲裂止不住', '过敏发作很难受',
  // 情绪低潮与委屈
  '莫名其妙情绪低落不想说话', '突然想哭但又不知道为什么', '今天事情太多人很累很烦',
  '被说中了心事现在很难受', '撒娇被无视了很委屈', '一不小心说错话了很懊悔',
  // 吃醋与拉扯
  '莫名吃醋了但死撑着不说', '突然变得奇怪地冷淡想被哄', '单方面闹别扭冷战',
  '无意间说出了心里话马上尬住了', '对方的某条朋友圈让自己浮想联翩',
  // 职场 / 人际挫折
  '被领导当众批评了很丢脸', '和同事起了摩擦心情很差',
  '手头的事情搞砸了压力很大', '考试或考核结果很差很受打击',
  '被人在背后说坏话', '闺蜜 / 好友起了矛盾'
];

// ─── 长线剧情库 ───────────────────────────────────────────────────
// 重大危机或设定变更，需要长期化解
export const LONG_PLOTS = [
  // 关系危机
  '面临异地分离的抉择', '家人强烈反对这段关系', '工作变动不得不搬到外地',
  '一场重大误会引发冷战', '第三者突然出现搅局', '鼓起勇气表白却被拒绝',
  '前任突然出现试图挽回', '嫉妒情绪彻底失控爆发', '因为一个谎言引发信任危机',
  '两人对未来的规划发生了严重分歧',
  // 生活危机
  '意外失业陷入低谷', '突然生病需要住院', '旅途中遭遇了意外',
  '见家长风波', '重要考试或考核彻底失败', '创业项目遭遇重大危机',
  '被卷进一场是非纠纷', '陷入严重的财务困境',
  '遭受严重的网络暴力', '青梅竹马突然重新出现',
  '家庭内部爆发了重大矛盾', '因为某件事与好友彻底决裂'
];

// ─── 时间阈值 ─────────────────────────────────────────────────────
const ACTIVE_CHAT_THRESHOLD_MIN = 120;

const MICRO_PROB = 0.20;
const SHORT_PROB = 0.15;
const LONG_PROB  = 0.08;

export function rollRandomPlot(chat) {
  if (!chat.randomPlotEnabled || chat.activeRandomPlot || chat.isGroup) return null;

  // 计算距用户上一条消息的时间（当前这条刚被 push，所以取倒数第二条 isMe 消息）
  const myMsgs = (chat.messages || []).filter(m => m.isMe && !m.isHidden);
  const prevMyMsg = myMsgs.length >= 2 ? myMsgs[myMsgs.length - 2] : null;
  const prevTime = prevMyMsg ? (prevMyMsg.timestamp || prevMyMsg.id || 0) : 0;
  const minutesSinceLast = prevTime ? (Date.now() - prevTime) / 60000 : 9999;

  let type, pool;

  if (minutesSinceLast < ACTIVE_CHAT_THRESHOLD_MIN) {
    if (Math.random() >= MICRO_PROB) return null;
    type = 'micro';
    pool = MICRO_PLOTS;
  } else {
    if (Math.random() < LONG_PROB) {
      type = 'long';
      pool = LONG_PLOTS;
    } else if (Math.random() < SHORT_PROB) {
      type = 'short';
      pool = SHORT_PLOTS;
    } else {
      return null;
    }
  }

  const keyword = pool[Math.floor(Math.random() * pool.length)];
  console.log(
    `[🎲 随机剧情触发] 类型：${type} | 距上条消息：${minutesSinceLast.toFixed(1)} min | 关键词：「${keyword}」`
  );
  return { type, keyword, triggeredAt: Date.now() };
}
