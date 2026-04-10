// js/apps/phone.js
import { store } from '../store.js';

window.phoneState = {
    view: 'select_char', // 'select_char' | 'auth_prompt' | 'desktop' | 等等
    charId: null,    
    accessMode: 'hacked', // 核心状态：'authorized' (合法同步) | 'hacked' (强制黑入)
    appData: {},     
    isGenerating: false, 
    generatingApp: null, 
    
    activeMemoIndex: null, 
    memoScrollTop: 0,
    
    // 🌟 行程安排专属状态
    activeCalendarIndex: null,
    calendarScrollTop: 0,
    
    // 🌟 抖音专属状态
    tiktokTab: 'profile', // 'messages' | 'profile'
    tiktokSubTab: 'liked', // 'works' | 'liked'  (默认让他一进来就看到最刺激的喜欢列表)
    tiktokSubView: 'list', // 'list' | 'detail'
    activeTiktokMsgIndex: null,
    
    // 🌟 番茄小说专属状态
    activeNovelIndex: null,
    novelScrollTop: 0,
    // 🌟 淘宝专属状态
    taobaoTab: 'orders', // 'cart' (购物车) | 'orders' (我的订单)
    // 🌟 携程专属状态
    ctripTab: 'upcoming', // 'upcoming' (未出行) | 'past' (已出行)
    // 🌟 私密文件夹专属状态
    galleryTab: 'photos', // 'photos' | 'voices'
    // 🌟 搜索记录专属状态
    activeSearchIndex: null,
    searchScrollTop: 0,
    
    // 🌟 微信克隆版专属状态
    wechatTab: 'chats', // 'chats' | 'moments'
    activeWechatRoom: null // 记录点开了哪个聊天室
};

if (!window.phoneActions) {
    window.phoneActions = {
        exitPhone: () => { 
            window.phoneState.charId = null; 
            window.phoneState.view = 'select_char'; 
            window.actions.setCurrentApp(null); 
        },
        
        // 🌟 选定目标：智能分流 (判断是否有合法权限)
        selectTarget: (id) => { 
            const char = store.contacts?.find(c => c.id === id);
            if (char && char.hasPhonePermission) {
                // 有永久权限，直接走合法通道
                window.phoneState.charId = id; 
                window.phoneState.accessMode = 'authorized';
                window.phoneState.view = 'desktop'; 
            } else {
                // 没权限，拦截并弹出警告页
                window.phoneState.charId = id; 
                window.phoneState.view = 'auth_prompt'; 
            }
            window.render(); 
        },
        
        // 🌟 动作 A：发送征求同意请求
        askPermission: () => {
            const charId = window.phoneState.charId;
            const chat = store.chats.find(c => c.charId === charId);
            if (chat) {
                // 发送绝美权限卡片
                chat.messages.push({
                    id: Date.now(),
                    sender: 'me',
                    isMe: true, 
                    msgType: 'phone_invite_card',
                    text: '[手机访问权限请求]',
                    timestamp: Date.now()
                });

                // 挂载云端潜意识指令，逼迫大模型做出回应
                if (typeof window.scheduleCloudTask === 'function') {
                    window.scheduleCloudTask(charId, "(系统指令：用户向你发送了[手机访问权限请求]。请结合你的性格决定是否同意。如果同意，请在回复中包含[同意]；如果拒绝，请包含[拒绝]。必须带上中括号。)");
                }
                
                if (window.actions && window.actions.showToast) {
                    window.actions.showToast('请求已发送，请去微信等待 TA 的回信~');
                }
                if (window.actions?.saveStore) window.actions.saveStore();
            }
            window.phoneActions.exitPhone(); // 退回微信等消息
        },

        // 🌟 动作 B：强制黑入 (伴随 25% 的暴露风险！)
        hackInto: () => {
            const charId = window.phoneState.charId;
            const isDiscovered = Math.random() < 0.25; // 💣 25% 的踩雷概率

            if (isDiscovered) {
                // 被抓包了！触发 AI 愤怒质问，强制踢出系统
                if (typeof window.scheduleCloudTask === 'function') {
                    window.scheduleCloudTask(charId, "(系统指令：紧急状态！你刚刚察觉到用户正在试图非法黑入、偷看你的手机！请立即发消息疯狂质问TA！)");
                }
                if (window.actions && window.actions.showToast) {
                    window.actions.showToast('⚠️ 警告：黑客行踪暴露！连接被目标强制切断！');
                }
                window.phoneActions.exitPhone();
            } else {
                // 骇客潜入成功
                window.phoneState.accessMode = 'hacked';
                window.phoneState.view = 'desktop';
                window.render();
            }
        },

        switchTarget: () => { 
            window.phoneState.charId = null; 
            window.phoneState.view = 'select_char'; 
            window.render(); 
        },
        backToDesktop: () => { window.phoneState.view = 'desktop'; window.render(); },
        openMemoDetail: (idx) => { window.phoneState.activeMemoIndex = idx; window.render(); },
        closeMemoDetail: () => { window.phoneState.activeMemoIndex = null; window.render(); },
        // 🌟 转发备忘录
        forwardMemo: () => {
            const state = window.phoneState;
            if (!state.charId || state.activeMemoIndex === null) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const memoData = store.hackedData?.[state.charId]?.memo?.items || [];
            const note = memoData[state.activeMemoIndex];
            
            if (!char || !chat || !note) return;

            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#fffdf5; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #fef08a; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#fef9c3; color:#a16207; outline:none; font-size:14px;">
                  <span style="font-weight:800;">📝 ${char.name} 的备忘录</span>
                  <span style="font-size:12px; opacity:0.8;">${note.date}</span>
                </summary>
                <div style="padding:15px; background:#fffdf5; color:#333; border-top: 1px solid #fef08a;">
                  <div style="font-weight:bold; font-size:16px; margin-bottom:8px; color:#1f2937;">${note.title}</div>
                  <div style="font-size:14px; line-height:1.6; color:#4b5563; white-space:pre-wrap; word-break:break-word;">${note.content}</div>
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('✅ 备忘录已转发至微信，快去质问TA吧！');
        },
        // 🌟 转发行程安排
        forwardCalendar: () => {
            const state = window.phoneState;
            if (!state.charId || state.activeCalendarIndex === null) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const calData = store.hackedData?.[state.charId]?.calendar?.items || [];
            const item = calData[state.activeCalendarIndex];
            
            if (!char || !chat || !item) return;

            const statusIcon = item.status === 'completed' ? '✅ 已完成' : (item.status === 'cancelled' ? '❌ 已取消' : '⏳ 待办');
            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#f8fafc; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #cbd5e1; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#e2e8f0; color:#334155; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🗓️ ${char.name} 的行程提取</span>
                  <span style="font-size:12px; opacity:0.8;">${item.datetime}</span>
                </summary>
                <div style="padding:15px; background:#f8fafc; color:#333; border-top: 1px solid #cbd5e1;">
                  <div style="font-weight:bold; font-size:15px; margin-bottom:8px; color:#0f172a; display:flex; align-items:center; justify-content:space-between;">
                    <span style="${item.status === 'completed' || item.status === 'cancelled' ? 'text-decoration:line-through; opacity:0.6;' : ''}">${item.title}</span>
                    <span style="font-size:11px; font-weight:normal; padding:3px 6px; border-radius:6px; background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; flex-shrink:0; margin-left:8px;">${statusIcon}</span>
                  </div>
                  ${item.trace_note ? `<div style="font-size:13px; line-height:1.5; color:#64748b; margin-top:10px; padding-top:10px; border-top:1px dashed #cbd5e1;">📝 备注与变动痕迹：<br><span style="color:#475569;">${item.trace_note}</span></div>` : ''}
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('✅ 行程记录已转发，快去当面对质！');
        },
        openCalendarDetail: (idx) => { window.phoneState.activeCalendarIndex = idx; window.render(); },
        closeCalendarDetail: () => { window.phoneState.activeCalendarIndex = null; window.render(); },

        switchTiktokTab: (tab) => { window.phoneState.tiktokTab = tab; window.render(); },
        switchTiktokSubTab: (tab) => { window.phoneState.tiktokSubTab = tab; window.render(); },
        // 🌟 切换抖音视图
        openTiktokMsg: (idx) => { 
            window.phoneState.tiktokSubView = 'detail'; 
            window.phoneState.activeTiktokMsgIndex = idx; 
            window.render(); 
        },
        closeTiktokMsg: () => { 
            window.phoneState.tiktokSubView = 'list'; 
            window.phoneState.activeTiktokMsgIndex = null; 
            window.render(); 
        },
        // 🌟 升级版转发：自动识别当前所在页面
        forwardTiktok: () => {
            const state = window.phoneState;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const tkData = store.hackedData?.[state.charId]?.tiktok?.items;
            if (!char || !chat || !tkData) return;

            let title = '', contentRows = '', note = '';

            if (state.tiktokTab === 'messages') {
                if (state.tiktokSubView === 'detail' && state.activeTiktokMsgIndex !== null) {
                    // 🌟 私信详情页的转发：加入红色的拉黑警告标！
                    const m = tkData.messages[state.activeTiktokMsgIndex];
                    title = `与 ${m.name} 的私信`;
                    const blockedHtml = m.status === 'blocked' ? `<div style="margin-top:12px; text-align:center; font-size:11px; color:#f87171; background:#3f1212; border:1px solid #7f1d1d; padding:5px 0; border-radius:6px; font-weight:bold; letter-spacing:1px;">⚠️ 对方已被拉黑</div>` : '';
                    contentRows = `<div style="color:#d1d5db; line-height:1.7;">对方：${m.content}<br><span style="color:#60a5fa;">TA回：${m.reply || '未回复'}</span>${blockedHtml}</div>`;
                } else {
                    title = '抖音私信列表';
                    contentRows = tkData.messages.map(m => `▸ ${m.name}: ${m.content}`).join('<br>');
                }
            } else {
                const isWorks = state.tiktokSubTab === 'works';
                title = isWorks ? '抖音发布作品' : '抖音点赞列表';
                const items = isWorks ? tkData.works : tkData.liked;
                contentRows = items.map(i => `▸ ${i.desc}`).join('<br>');
            }

            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif;">
              <details style="background:#111; border-radius:12px; border: 1px solid #333; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#1c1c1e; color:#fff; outline:none;">
                  <span style="font-weight:800; font-size:14px;">🎵 ${char.name}的${title}</span>
                  <span style="font-size:10px; color:#fe2c55; border:1px solid #fe2c55; padding:1px 4px; border-radius:4px;">EVIDENCE</span>
                </summary>
                <div style="padding:15px; background:#111; color:#eee; font-size:13px; line-height:1.6; border-top: 1px solid #333;">${contentRows}</div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('✅ 证据已发送至微信');
        },

        // 🌟 小说页面控制与转发
        openNovelDetail: (idx) => { window.phoneState.activeNovelIndex = idx; window.render(); },
        closeNovelDetail: () => { window.phoneState.activeNovelIndex = null; window.render(); },
        
        forwardNovel: () => {
            const state = window.phoneState;
            if (!state.charId || state.activeNovelIndex === null) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const nvData = store.hackedData?.[state.charId]?.novel?.items || [];
            const nv = nvData[state.activeNovelIndex];
            
            if (!char || !chat || !nv) return;

            // 🌟 专属 UI：番茄红配色的折叠转发卡片
            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#fffcfc; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #fecdd3; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#ffe4e6; color:#be123c; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">📖 ${char.name} 的书架提取</span>
                  <span style="font-size:12px; opacity:0.8;">阅读记录</span>
                </summary>
                <div style="padding:15px; background:#fffcfc; color:#333; border-top: 1px solid #fecdd3;">
                  <div style="font-weight:bold; font-size:16px; margin-bottom:4px; color:#1f2937;">《${nv.title}》</div>
                  <div style="font-size:12px; color:#881337; margin-bottom:10px;">作者：${nv.author} | 进度：${nv.progress}</div>
                  <div style="font-size:13px; line-height:1.5; color:#64748b; padding:8px; background:#f8fafc; border-radius:6px; margin-bottom:10px;">
                    <span style="font-weight:bold; color:#475569;">简介：</span>${nv.synopsis}
                  </div>
                  <div style="font-size:13px; line-height:1.5; color:#be123c; border-top:1px dashed #fecdd3; padding-top:10px;">
                    <span style="font-weight:bold;">📝 TA的私密书评：</span><br>${nv.comment}
                  </div>
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(`✅ 阅读记录《${nv.title}》已转发，快去嘲笑TA吧！`);
        },

        switchTaobaoTab: (tab) => { window.phoneState.taobaoTab = tab; window.render(); },
        
        // 🌟 转发整个购物记录列表
        forwardTaobao: () => {
            const state = window.phoneState;
            if (!state.charId) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const tbData = store.hackedData?.[state.charId]?.taobao?.items;
            if (!char || !chat || !tbData) return;

            const isCart = state.taobaoTab === 'cart';
            const title = isCart ? '购物车待结算商品' : '已购订单明细';
            const list = isCart ? tbData.cart : tbData.orders;
            
            if (!list || list.length === 0) {
                if (window.actions?.showToast) window.actions.showToast('列表为空，无法转发！');
                return;
            }

            // 🌟 拼装整个列表的明细，进行连环处刑！
            const contentRows = list.map(item => `
                <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px dashed ${isCart ? '#fed7aa' : '#e5e7eb'};">
                    <div style="font-weight:bold; color:#1f2937;">${item.name}</div>
                    <div style="font-size:12px; color:#6b7280; margin:4px 0;">规格：${item.params} | 数量：x${item.count}</div>
                    <div style="font-size:13px; color:#ea580c; font-weight:bold;">实付：¥${String(item.price).replace(/[¥￥]/g, '')}</div>
                    ${!isCart ? `<div style="font-size:12px; color:#94a3b8; margin-top:6px; line-height:1.5;">收件人：${item.recipient}<br>时间：${item.time}<br>物流：${item.logistics}</div>` : ''}
                </div>
            `).join('');

            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#fffcf9; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #ffedd5; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#ffedd5; color:#9a3412; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🛍️ ${char.name}的${title}</span>
                  <span style="font-size:11px; color:#ea580c; font-weight:bold;">共 ${list.length} 件</span>
                </summary>
                <div style="padding:15px; background:#fffcf9; color:#333; border-top: 1px solid #ffedd5;">
                  ${contentRows}
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(`✅ ${isCart?'购物车':'订单'}列表已完整打包转发，准备开炮！`);
        },

        // 🌟 携程控制与转发
        switchCtripTab: (tab) => { window.phoneState.ctripTab = tab; window.render(); },
        
        forwardCtrip: () => {
            const state = window.phoneState;
            if (!state.charId) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const ctData = store.hackedData?.[state.charId]?.ctrip?.items;
            if (!char || !chat || !ctData) return;

            const isUpcoming = state.ctripTab === 'upcoming';
            const title = isUpcoming ? '未出行行程单' : '历史出行订单';
            const list = isUpcoming ? ctData.upcoming : ctData.past;
            
            if (!list || list.length === 0) {
                if (window.actions?.showToast) window.actions.showToast('列表为空，无法转发！');
                return;
            }

            // 拼装列表进行连环处刑
            const contentRows = list.map(item => {
                const typeLabel = item.type === 'flight' ? '✈️ 机票' : (item.type === 'train' ? '🚄 动车' : (item.type === 'hotel' ? '🏨 酒店' : '🎫 演出'));
                return `
                <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px dashed #bfdbfe;">
                    <div style="font-weight:bold; color:#1e3a8a; font-size:15px; margin-bottom:4px;">${typeLabel}：${item.name}</div>
                    <div style="font-size:12px; color:#475569; margin-bottom:2px;">📍 ${item.location} | 时间：${item.time}</div>
                    <div style="font-size:13px; color:#1d4ed8; font-weight:bold; margin-bottom:4px;">明细：${item.details}</div>
                    <div style="font-size:13px; color:#b91c1c; font-weight:bold; background:#fee2e2; padding:2px 6px; border-radius:4px; display:inline-block;">出行/入住人：${item.persons}</div>
                    ${!isUpcoming && item.review ? `<div style="font-size:12px; color:#64748b; margin-top:6px; padding:6px; background:#f1f5f9; border-radius:6px; border-left:3px solid #3b82f6;">📝 TA的点评：${item.review}</div>` : ''}
                </div>`;
            }).join('');

            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#eff6ff; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #bfdbfe; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#dbeafe; color:#1e40af; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🧳 ${char.name}的${title}</span>
                  <span style="font-size:11px; color:#2563eb; font-weight:bold;">共 ${list.length} 个订单</span>
                </summary>
                <div style="padding:15px; background:#eff6ff; color:#333; border-top: 1px solid #bfdbfe;">
                  ${contentRows}
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(`✅ ${isUpcoming?'未出行':'历史'}订单已完整打包，准备开炮！`);
        },

        // 🌟 文件夹控制与转发
        switchGalleryTab: (tab) => { window.phoneState.galleryTab = tab; window.render(); },
        
        forwardGallery: () => {
            const state = window.phoneState;
            if (!state.charId) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const galData = store.hackedData?.[state.charId]?.gallery?.items;
            if (!char || !chat || !galData) return;

            const isPhotos = state.galleryTab === 'photos';
            const title = isPhotos ? '隐藏相册数据' : '私密语音备忘录';
            const list = isPhotos ? galData.photos : galData.voices;
            
            if (!list || list.length === 0) {
                if (window.actions?.showToast) window.actions.showToast('列表为空，无法转发！');
                return;
            }

            // 拼装列表进行处刑
            let contentRows = '';
            if (isPhotos) {
                contentRows = list.map(item => `
                    <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #3f3f46;">
                        <span style="color:#a1a1aa; font-size:11px;">[${item.date}] ${item.isVideo ? '🎥 视频' : '🖼️ 照片'}</span><br>
                        <span style="color:#f4f4f5; font-size:13px; line-height:1.5;">${item.desc}</span>
                    </div>`).join('');
            } else {
                contentRows = list.map(item => `
                    <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #3f3f46;">
                        <span style="color:#a1a1aa; font-size:11px;">[${item.date}] 🎤 ${item.title} (${item.duration})</span><br>
                        <span style="color:#f4f4f5; font-size:13px; line-height:1.5;">录音内容：${item.desc}</span>
                    </div>`).join('');
            }

            // 🌟 极密黑客风格的折叠警告卡片
            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#18181b; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border: 1px solid #3f3f46; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#27272a; color:#f4f4f5; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🔒 ${char.name}的${title}</span>
                  <span style="font-size:11px; color:#ef4444; font-weight:bold; border:1px solid #ef4444; padding:1px 4px; border-radius:4px;">CONFIDENTIAL</span>
                </summary>
                <div style="padding:15px; background:#18181b; color:#d4d4d8; border-top: 1px solid #3f3f46;">
                  ${contentRows}
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(`✅ ${isPhotos?'相册':'语音'}记录已转发，快去拷问TA！`);
        },

        // 🌟 转发私密浏览记录
        forwardAV: () => {
            const state = window.phoneState;
            if (!state.charId) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const avData = store.hackedData?.[state.charId]?.av?.items;
            if (!char || !chat || !avData || !avData.videos) return;

            const contentRows = avData.videos.map(v => `
                <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px dashed #374151;">
                    <span style="color:#f97316; font-weight:bold; font-size:14px;">▶ ${v.title || v.desc}</span><br>
                    <span style="color:#9ca3af; font-size:11px;">时间：${v.time} | 时长：${v.duration}</span><br>
                    <span style="color:#f3f4f6; font-size:13px; line-height:1.6; margin-top:6px; display:inline-block;">💭 TA的点评：${v.review}</span>
                </div>`).join('');

            const keywordHtml = avData.keywords && avData.keywords.length > 0 
                ? `<div style="margin-bottom:12px; font-size:13px; color:#f97316; font-weight:bold;">🔍 搜索关键词：${avData.keywords.join(', ')}</div>` 
                : '';

            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#111827; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.3); border: 1px solid #f97316; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#1f2937; color:#f3f4f6; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🔞 ${char.name} 的私密浏览</span>
                  <span style="font-size:11px; color:#f97316; font-weight:bold; border:1px solid #f97316; padding:1px 4px; border-radius:4px; letter-spacing:1px;">NSFW</span>
                </summary>
                <div style="padding:15px; background:#111827; color:#d1d5db; border-top: 1px solid #374151;">
                  ${keywordHtml}
                  ${contentRows}
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('✅ 私密浏览记录已转发，准备欣赏TA的破防吧！');
        },

        // 🌟 转发网易云私密歌单
        forwardNetease: () => {
            const state = window.phoneState;
            if (!state.charId) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const neData = store.hackedData?.[state.charId]?.netease?.items;
            if (!char || !chat || !neData) return;

            const contentRows = neData.map((s, idx) => `
                <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px dashed #ef4444;">
                    <div style="font-weight:bold; color:#1f2937; font-size:14px;">${idx + 1}. ${s.title}</div>
                    <div style="font-size:12px; color:#6b7280; margin:2px 0;">歌手：${s.artist} | 专辑：${s.album}</div>
                    <div style="font-size:13px; color:#b91c1c; font-weight:bold; margin-top:6px; font-style:italic;">💭 私密乐评：${s.comment}</div>
                </div>`).join('');

            // 🌟 经典的网易云红折叠卡片
            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif;">
              <details style="background:#fffafa; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #fecaca; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#fee2e2; color:#b91c1c; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🎵 ${char.name} 的私密歌单提取</span>
                  <span style="font-size:11px; color:#ef4444; font-weight:bold;">共 ${neData.length} 首</span>
                </summary>
                <div style="padding:15px; background:#fffafa; color:#333; border-top: 1px solid #fecaca;">
                  ${contentRows}
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('✅ 乐评证据已打包发送，快去戳穿TA的深情吧！');
        },

        // 🌟 搜索记录控制与转发
        openSearchDetail: (idx) => { window.phoneState.activeSearchIndex = idx; window.render(); },
        closeSearchDetail: () => { window.phoneState.activeSearchIndex = null; window.render(); },
        
        forwardSearch: () => {
            const state = window.phoneState;
            if (!state.charId || state.activeSearchIndex === null) return;
            const char = store.contacts.find(c => c.id === state.charId);
            const chat = store.chats.find(c => c.charId === state.charId);
            const searchData = store.hackedData?.[state.charId]?.search?.items || [];
            const item = searchData[state.activeSearchIndex];
            
            if (!char || !chat || !item) return;

            // 🌟 知乎/论坛风的折叠警告卡片
            const cardHtml = `
            <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
              <details style="background:#f8fafc; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #cbd5e1; overflow:hidden;">
                <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#e2e8f0; color:#0f172a; outline:none; font-size:14px;">
                  <span style="font-weight:800; display:flex; align-items:center;">🔍 搜索与浏览记录</span>
                  <span style="font-size:11px; color:#2563eb; font-weight:bold;">Safari</span>
                </summary>
                <div style="padding:15px; background:#f8fafc; color:#333; border-top: 1px solid #cbd5e1;">
                  <div style="font-weight:bold; font-size:14px; margin-bottom:10px; color:#1e40af;">搜了啥：<span style="color:#ef4444;">${item.query}</span></div>
                  <div style="font-size:12px; line-height:1.6; color:#475569; margin-bottom:12px; padding:10px; background:#fff; border-radius:8px; border:1px solid #e2e8f0;">
                    <span style="font-weight:bold; color:#0f172a;">论坛热帖：${item.forum.title}</span><br>
                    <span style="color:#64748b;">${item.forum.content.substring(0, 50)}...</span>
                  </div>
                  <div style="font-size:13px; font-weight:bold; color:#b91c1c; padding-top:12px; border-top:1px dashed #cbd5e1;">
                    💭 TA的看完后的感悟：<br>
                    <span style="font-weight:normal; font-style:italic; line-height:1.6;">“${item.thought}”</span>
                  </div>
                </div>
              </details>
            </div>`.trim();

            chat.messages.push({ id: Date.now(), sender: 'me', isMe: true, msgType: 'html_card', text: cardHtml, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('✅ 搜索记录与内心独白已转发，快去拷问TA！');
        },

        // 🌟 微信克隆版控制
        switchWechatTab: (tab) => { 
            window.phoneState.wechatTab = tab; 
            window.phoneState.activeWechatRoom = null; 
            window.render(); 
        },
        openWechatChat: (id) => {
            window.phoneState.activeWechatRoom = id;
            window.render();
        },
        closeWechatChat: () => {
            window.phoneState.activeWechatRoom = null;
            window.render();
        },
        // 🌟 假冒 TA 的身份发送微信消息
        sendFakeMessage: () => {
            const input = document.getElementById('fake-wx-input');
            if (!input || !input.value.trim()) return;
            const text = input.value.trim();
            const state = window.phoneState;
            const targetCharId = state.charId;
            
            if (state.activeWechatRoom === 'user') {
                // 1. 如果是在和“你(玩家)”的聊天室，直接把消息塞入真实的聊天记录！
                const chat = store.chats.find(c => c.charId === targetCharId);
                const char = store.contacts.find(c => c.id === targetCharId);
                if (chat && char) {
                    chat.messages.push({
                        id: Date.now(),
                        sender: char.name,
                        text: text,
                        isMe: false, // 🌟 核心：在真实世界里，这是“他”发给你的话，所以在总数据里 isMe 是 false！
                        source: 'wechat',
                        msgType: 'text',
                        time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}),
                        timestamp: Date.now()
                    });
                }
            } else {
                // 2. 如果是在和 AI 假好友的聊天室
                const wcNode = store.hackedData?.[targetCharId]?.wechat;
                const fakeChat = wcNode?.items?.fakeChats?.find(c => c.id === state.activeWechatRoom);
                if (fakeChat) {
                    if (!fakeChat.messages) fakeChat.messages = [];
                    fakeChat.messages.push({
                        text: text,
                        isChar: true, // 标记这是“他”发的话（绿色气泡）
                        type: 'text'
                    });
                }
            }
            
            if (window.actions?.saveStore) window.actions.saveStore();
            input.value = '';
            window.render();
            
            // 自动滚动到底部
            setTimeout(() => {
                const scroll = document.getElementById('fake-chat-scroll');
                if(scroll) scroll.scrollTop = scroll.scrollHeight;
            }, 50);
        },

        getFakeReply: async () => {
            const state = window.phoneState;
            const targetCharId = state.charId;
            const char = store.contacts.find(c => c.id === targetCharId);
            const boundP = store.personas[0]; 

            const wcNode = store.hackedData?.[targetCharId]?.wechat;
            const fakeChat = wcNode?.items?.fakeChats?.find(c => c.id === state.activeWechatRoom);
            if (!fakeChat) return;

            if(window.actions?.showToast) window.actions.showToast(fakeChat.isGroup ? '群友们正在输入...' : '对方正在输入...');

            const recentMsgs = fakeChat.messages.slice(-8).map(m => `[${m.sender || (m.isChar ? char.name : fakeChat.name)}]: ${m.text}`).join('\n');
            const lastMyMsg = fakeChat.messages.slice().reverse().find(m => m.isChar)?.text || '';

            const prompt = `扮演微信对话方。当前背景：用户(${boundP.name})正冒充角色(${char.name})发消息。
聊天室：${fakeChat.name} ${fakeChat.isGroup ? '(群聊)' : '(单聊)'}
上下文：
${recentMsgs}

要求：
1. 如果是群聊，请生成 2-3 条不同成员的回复！每条回复占一行，格式为：名字:内容
2. 如果是单聊，生成 1 条回复。
你的语气要完全符合你在列表里的身份（如果是群聊，可以扮演群里的兄弟起哄；如果是单聊，就是对方本人）。
3. 注意！现在其实是 ${boundP.name} 偷偷拿了 ${char.name} 的手机在发消息！如果你觉得刚刚 ${char.name} 发的最后那句话语气很像 ${boundP.name}，或者特别反常（比如突然表白、发神经），你极大概率会产生怀疑！（比如吐槽：“卧槽，你是嫂子吧？”、“你被盗号了？”、“你今天吃错药了？”）。
4. 严格只输出你的回复文本内容，绝不要任何前缀、解释、换行或引号！`;

            try {
                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9 })
                });
                const data = await res.json();
                let fullReply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();

                // 判断是否为群聊
if (fakeChat.isGroup) {
    // 群聊：按行解析，每行格式 "名字:内容"
    const lines = fullReply.split('\n').filter(l => l.includes(':'));
    lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        const sName = line.substring(0, colonIndex).trim();
        const sText = line.substring(colonIndex + 1).trim();
        if (sName && sText) {
            fakeChat.messages.push({
                sender: sName,
                text: sText,
                isChar: false,
                type: 'text'
            });
        }
    });
} else {
    // 单聊：整段回复就是对方发的话（可能包含换行，我们合并为一段）
    let replyText = fullReply.trim();
    // 如果 AI 意外输出了 "名字:内容" 格式，也兼容解析
    if (replyText.includes(':')) {
        const colonIndex = replyText.indexOf(':');
        const possibleName = replyText.substring(0, colonIndex).trim();
        // 简单判断名字是否像一个人名（长度不超过 10 且不含空格过多）
        if (possibleName.length <= 10 && !possibleName.includes(' ')) {
            replyText = replyText.substring(colonIndex + 1).trim();
        }
    }
    // 直接作为对方发送的消息，发送者就是聊天室对方的名字
    fakeChat.messages.push({
        sender: fakeChat.name,   // 对方的昵称
        text: replyText,
        isChar: false,
        type: 'text'
    });
}

                if (window.actions?.saveStore) window.actions.saveStore();
                window.render();
                
                // 滚到底部
                setTimeout(() => { document.getElementById('fake-chat-scroll')?.scrollTo({top: 9999, behavior: 'smooth'}); }, 100);

                // 🌟 修复变量名：让 Aric 能够感知到这场恶搞
                if (typeof window.scheduleCloudTask === 'function') {
    // 构建真实的聊天记录历史（这些是角色本人之前与对方的对话）
    let historyContext = `【你与 ${fakeChat.name} 的聊天记录（是你本人之前的真实对话）】\n`;
    (fakeChat.messages || []).forEach(msg => {
        const sender = msg.isChar ? char.name : fakeChat.name;
        historyContext += `${sender}：${msg.text}\n`;
    });

    // 最后一条是用户冒充发出的
    const spoofedMsg = `\n【⚠️ 异常警报】最后一条消息（${char.name}：${lastMyMsg}）并不是你本人发送的！\n用户（${boundP.name}）偷偷拿了你的手机，冒充你的身份发出了这条消息。\n请根据你的人设和这条消息的影响对此进行反应（例如：震惊、愤怒、无奈或社死）！直接输出你的回复，不要重复指令。`;

    window.scheduleCloudTask(targetCharId, `(系统强制指令：严重警报！${spoofedMsg}\n\n${historyContext})`);
}
            } catch (e) {
                console.error("AI 回复出错：", e);
            }
        },
        forwardFakeChat: () => {
    const state = window.phoneState;
    if (!state.charId || !state.activeWechatRoom) return;
    const char = store.contacts.find(c => c.id === state.charId);
    const chat = store.chats.find(c => c.charId === state.charId);
    const wcNode = store.hackedData?.[state.charId]?.wechat;
    if (!char || !chat || !wcNode) return;

    // 获取当前聊天室（假聊天记录）
    let fakeChat = null;
    let chatName = '';
    let messages = [];

    if (state.activeWechatRoom === 'user') {
        // 与用户的聊天：不允许转发（因为那是真实聊天记录）
        if (window.actions?.showToast) window.actions.showToast('无法转发真实聊天记录');
        return;
    } else {
        fakeChat = wcNode.items?.fakeChats?.find(c => c.id === state.activeWechatRoom);
        if (!fakeChat) return;
        chatName = fakeChat.name;
        messages = fakeChat.messages || [];
    }

    if (!messages.length) {
        if (window.actions?.showToast) window.actions.showToast('聊天记录为空，无法转发');
        return;
    }

    // 构建 HTML 卡片
    const msgHtml = messages.map(msg => {
        const sender = msg.sender || (msg.isChar ? char.name : chatName);
        const text = msg.text || '';
        return `<div style="margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed #e2e8f0;">
                    <span style="font-weight:bold; color:#0f172a;">${sender}：</span>
                    <span style="color:#475569;">${text}</span>
                </div>`;
    }).join('');

    const cardHtml = `
    <div style="width:100%; max-width:360px; margin:5px 0; font-family:-apple-system, sans-serif; user-select:text;">
      <details style="background:#f8fafc; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.05); border: 1px solid #cbd5e1; overflow:hidden;">
        <summary style="padding:12px 15px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; background:#e2e8f0; color:#334155; outline:none; font-size:14px;">
          <span style="font-weight:800; display:flex; align-items:center;">💬 微信聊天记录导出</span>
          <span style="font-size:11px; color:#2563eb; font-weight:bold;">${fakeChat.isGroup ? '群聊' : '单聊'}</span>
        </summary>
        <div style="padding:15px; background:#f8fafc; color:#333; border-top: 1px solid #cbd5e1;">
          <div style="font-weight:bold; margin-bottom:8px;">${chatName}</div>
          <div style="font-size:13px; line-height:1.6;">${msgHtml}</div>
        </div>
      </details>
    </div>`.trim();

    chat.messages.push({
        id: Date.now(),
        sender: 'me',
        isMe: true,
        msgType: 'html_card',
        text: cardHtml,
        timestamp: Date.now()
    });

    if (window.actions?.saveStore) window.actions.saveStore();
    if (window.actions?.showToast) window.actions.showToast('✅ 聊天记录已转发至微信，快去质问TA吧！');
},

        refreshApp: (appId, charId) => {
            // 清除本地永久数据，并触发重新提取
            if (store.hackedData && store.hackedData[charId]) {
                store.hackedData[charId][appId] = null;
            }
            window.phoneActions.openApp(appId, charId);
        },
    };
}

function createPhoneAppIcon(iconName, label, appId, charId) {
    let iconHtml = `<i data-lucide="${iconName}" class="text-white opacity-90 w-8 h-8 drop-shadow-sm"></i>`;
    if (iconName === 'tiktok-svg') {
        iconHtml = `<svg class="text-white opacity-90 w-[26px] h-[26px] drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>`;
    }
    return `
        <div class="flex flex-col items-center justify-center space-y-1.5 cursor-pointer group" onclick="window.phoneActions.openApp('${appId}', '${charId}')">
            <div class="w-[3.8rem] h-[3.8rem] bg-white/20 backdrop-blur-md border border-white/20 rounded-[18px] flex items-center justify-center shadow-sm group-active:scale-90 transition-transform duration-200">
                ${iconHtml}
            </div>
            <span class="text-white text-[11px] font-bold drop-shadow-md tracking-wider">${label}</span>
        </div>
    `;
}

function createPhoneDockIcon(iconName, appId, charId) {
    return `
        <div class="flex flex-col items-center justify-center cursor-pointer group active:scale-90 transition-transform duration-200" onclick="window.phoneActions.openApp('${appId}', '${charId}')">
            <div class="w-[3.8rem] h-[3.8rem] bg-white/20 border border-white/20 rounded-[18px] flex items-center justify-center shadow-sm">
                <i data-lucide="${iconName}" class="text-white opacity-90 w-8 h-8 drop-shadow-sm"></i>
            </div>
        </div>
    `;
}

export function renderPhoneApp(store) {
    const state = window.phoneState;
    
    // 安全拦截：如果没有 charId，强制回到选人界面
    if (!state.charId) state.view = 'select_char';
    const targetCharId = state.charId;

    // ==========================================
    // 🧠 终极 Prompt 组装流水线 
    // ==========================================
    const getQContext = (charId) => {
        const char = store.contacts?.find(c => c.id === charId);
        const chat = store.chats?.find(c => c.charId === charId);
        const boundP = store.personas?.find(p => p.id === char?.boundPersonaId) || store.personas?.[0] || { name: 'User', prompt: '' };
        return { char, chat, boundP };
    };

    const buildMasterPrompt = (charId, options = {}) => {
        const { char, chat, boundP } = getQContext(charId);
        if (!char) return '';

        const { history = '', task = '', recentText = '', scenario = 'phone' } = options;

        // 🌟 注入当前时间，增强 AI 时间感知
    const now = new Date();
    const currentTimeStr = now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'long'
    });
    const timeContext = `\n\n【当前时间】\n${currentTimeStr}。请严格以此时间为基准判断事件的发生时间、状态（例如：只有时间早于或等于当前时间的行程才能标记为已完成）。\n`;

        const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
        const boundPrompt = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';
        const basePrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【潜入用户】\n当前化名：${boundP.name}${globalP}${boundPrompt}`;

        const coreMem = (store.memories || []).filter(m => m.charId === charId && m.type === 'core').map(m=>m.content).join('；');
        const coreMemStr = coreMem ? `\n\n【核心记忆】\n${coreMem}` : '';

        let fragMemStr = '';
        if (recentText) {
            const frags = (store.memories || []).filter(m => m.charId === charId && m.type === 'fragment').filter(m => {
                const kws = (m.keywords || '').split(',').map(k=>k.trim()).filter(k=>k);
                return kws.some(k => recentText.includes(k));
            }).map(m=>m.content).join('；');
            if (frags) fragMemStr = `\n\n【触发的回忆片段】\n${frags}`;
        }

        let frontWb = [], middleWb = [], backWb = [];
        (store.worldbooks || []).forEach(wbItem => {
            if (!wbItem.enabled) return;
            let shouldInject = (wbItem.type === 'global');
            if (wbItem.type === 'local') {
                if (char.mountedWorldbooks && char.mountedWorldbooks.includes(wbItem.id)) shouldInject = true;
                if (char.offlineWorldbooks && char.offlineWorldbooks.includes(wbItem.id)) shouldInject = true; 
            }
            if (shouldInject) {
                const entryStr = `【${wbItem.title}】：${wbItem.content}`;
                if (wbItem.position === 'front') frontWb.push(entryStr);
                else if (wbItem.position === 'back') backWb.push(entryStr);
                else middleWb.push(entryStr);
            }
        });

        const frontStr = frontWb.length > 0 ? `\n\n[前置世界观设定]\n${frontWb.join('\n')}` : '';
        const middleStr = middleWb.length > 0 ? `\n\n[当前环境设定]\n${middleWb.join('\n')}` : '';
        const backStr = backWb.length > 0 ? `\n\n[最高优先级指令]\n${backWb.join('\n')}` : '';
        const historyStr = history ? `\n\n【相关聊天记录】\n${history}` : '';
        
        return `${basePrompt}${coreMemStr}${frontStr}\n${middleStr}${fragMemStr}${backStr}${historyStr}${timeContext}\n\n【系统任务】\n${task}`;
    };

    // ==========================================
    // 🧠 AI 黑客引擎：提取备忘录
    // ==========================================
    const extractAppMemo = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'memo';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的本地备忘录(Notes)。
请基于角色的性格、核心记忆，以及最近和用户的聊天记录，生成 6 条备忘录。
要求：
1. 包含 2 条日常或工作相关的记录（展现生活碎片）。
2. 包含 3 条极度私密、情绪化，甚至带有病态/阴暗面，且与用户(${boundP.name})强相关的记录。
3. 包含 1 条像是密码、暗号或谜语一样的备忘录。
4. 绝不要输出思考过程，严格输出 JSON 数组格式！

格式要求：
[
  {
    "title": "备忘录标题(第一行)",
    "date": "例如：2026/04/02 或 昨天 23:14",
    "snippet": "正文前10个字的摘要...",
    "content": "完整的备忘录内容，支持多行，越真实越有张力越好。"
  }
]`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let memos = JSON.parse(reply);
            if (memos.memos) memos = memos.memos;

            if (Array.isArray(memos)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                // 🌟 打上时间戳，永久存储！
                store.hackedData[charId].memo = { items: memos, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解备忘录失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };

    // ==========================================
    // 🧠 AI 黑客引擎：提取行程安排 (日历/提醒事项)
    // ==========================================
    const extractAppCalendar = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'calendar';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的本地行程安排(iOS提醒事项/日历)。
请基于角色的性格、职业背景、以及最近和用户的聊天记录，生成 5-7 条本周的行程。
要求：
1. 状态必须包含：【completed】(已完成/打勾)、【cancelled】(已取消/划线划掉)、【pending】(待办)。
2. 标题(title)必须简明扼要（如“下午3点部门会议”或“去买纪念日礼物”）。
3. 重点突破：在 trace_note (痕迹/备注) 中，写出角色修改行程的真实心路历程！例如：“原本要去开会，因为收到她的一条消息直接翘班了”。越能暴露他内心真实的偏爱、占有欲或苦衷越好！
4. 必须有 2-3 条行程与用户(${boundP.name})产生极强的情感关联或暗中关注。
5. 绝不要输出思考过程，严格输出 JSON 数组！

格式要求：
[
  {
    "title": "行程简述",
    "datetime": "如：昨天 14:00 或 本周五 20:00",
    "status": "completed 或 cancelled 或 pending",
    "trace_note": "备忘信息或变动痕迹(如：~~原计划XX~~，已改为XX...)"
  }
]`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let cals = JSON.parse(reply);
            if (cals.calendar) cals = cals.calendar; 

            if (Array.isArray(cals)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].calendar = { items: cals, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解行程失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取抖音数据 (私信/作品/喜欢)
    // ==========================================
    const extractAppTiktok = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'tiktok';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的本地抖音数据。
请生成三个列表：私信(messages)、作品(works)、喜欢(liked)。
要求：
1. 【私信】：生成5条。每条必须包含：name(对方名字), content(对方发来的话), reply(角色的回复/吐槽。❗直接输出回复，禁止使用（）进行动作描述或心理描写！), status(状态: "normal" 或 "blocked"表示已拉黑)。
2. 【作品】与【喜欢】：基于角色XP和秘密生成，每条包含desc描述。
3. 必须包含与用户(${boundP.name})相关的私密私信或吐槽。
4. 绝不输出思考过程，严格输出 JSON！

格式：
{
  "messages": [{"name": "...", "content": "...", "reply": "...", "status": "normal/blocked", "time": "..."}],
  "works": [{"desc": "..."}],
  "liked": [{"desc": "..."}]
}`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.88 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let tk = JSON.parse(reply);
            if (tk.tiktok) tk = tk.tiktok;

            if (tk && tk.liked) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].tiktok = { items: tk, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解抖音失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取番茄小说数据
    // ==========================================
    const extractAppNovel = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'novel';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的本地阅读软件(番茄小说)数据。
请基于角色的性格、亲密偏好(XP)、以及最近和用户(${boundP.name})的关系，生成 4-6 本书架上的网文小说。
要求：
1. 书名(title)和作者(author)：必须是典型的网文风格（比如《偏执大佬的掌心娇》、《全职法师》、《重生之我要搞钱》等，越符合角色反差感越好）。
2. 简介(synopsis)：写一段极其狗血或带感的网文简介（约150字）。
3. 进度(progress)如"第128章(85%)"，时长(duration)如"14小时20分钟"。
4. 重点突破：在 comment (私密书评/心理活动) 中，写出角色看这本书的真实想法！比如在霸总文里学怎么讨好用户、或者对某段擦边剧情的真实心理反应。这是最能暴露TA内心的核心证据！
5. 绝不输出思考过程，严格输出 JSON 数组格式！

格式要求：
[
  {
    "title": "书名", "author": "作者", "synopsis": "简介", "progress": "...", "duration": "...", "comment": "私密评论或心得"
  }
]`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.88 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let novels = JSON.parse(reply);
            if (novels.novels) novels = novels.novels;

            if (Array.isArray(novels)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].novel = { items: novels, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解小说失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取淘宝数据 (购物车与订单)
    // ==========================================
    const extractAppTaobao = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'taobao';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的淘宝数据。
请基于角色的性格、隐藏的秘密(Kinks/职业秘密)、以及最近和用户(${boundP.name})的关系，生成两个列表：购物车(cart)和我的订单(orders)。
要求：
1. 【购物车】：生成4-6件。包含：name(商品名), params(规格), count(数量), price(单价)。商品应体现角色当前的某种渴望或纠结。
2. 【我的订单】：生成4-6件。包含：name, params, count, price, time(下单时间), recipient(收件人名字), logistics(物流状态)。
3. 重点突破：订单中必须包含一件“送给用户(${boundP.name})”或者“为了用户偷偷购买”的物品；也可以包含一件极其符合角色阴暗面/反差萌的奇葩物品。
4. 绝不输出思考过程，严格输出 JSON 格式！

格式要求：
{
  "cart": [{"name": "...", "params": "...", "count": 1, "price": "..."}],
  "orders": [{"name": "...", "params": "...", "count": 1, "price": "...", "time": "2026-04-01", "recipient": "...", "logistics": "..."}]
}`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let tb = JSON.parse(reply);
            if (tb.taobao) tb = tb.taobao;

            if (tb && (tb.cart || tb.orders)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].taobao = { items: tb, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解淘宝失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取携程旅行数据
    // ==========================================
    const extractAppCtrip = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'ctrip';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的携程旅行数据。
请基于角色的性格、秘密、以及最近和用户(${boundP.name})的关系，生成两个列表：未出行(upcoming)和已出行(past)。
要求：
1. 包含4种类型(type)："flight"(机票)、"train"(车票)、"hotel"(酒店)、"show"(演出)。
2. 【upcoming】生成3-4个，【past】生成4-6个。
3. 字段要求：
   - name: 航班号/列车号/酒店名称/演出名称
   - location: 起降地(如:北京-上海)/酒店地址/演出场馆
   - details: 座位号(如:头等舱1A) / 房型(如:行政大床房) / 票档数量
   - persons: 乘机人/入住人/观演人 (非常重要！可能是TA自己，可能是和别人，也可能是偷偷为用户订的。❗必须直接输出具体名字，禁止用（）进行任何补充说明！)
   - time: 订单时间(精确到日月和钟点)
   - review: (仅已出行past需要) 角色写下的私密点评，吐槽或隐藏的心思。
4. 绝不输出思考过程，严格输出 JSON 格式！

格式要求：
{
  "upcoming": [{"type": "hotel", "name": "...", "location": "...", "details": "...", "persons": "...", "time": "..."}],
  "past": [{"type": "flight", "name": "...", "location": "...", "details": "...", "persons": "...", "time": "...", "review": "..."}]
}`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let ct = JSON.parse(reply);
            if (ct.ctrip) ct = ct.ctrip;

            if (ct && (ct.upcoming || ct.past)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].ctrip = { items: ct, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解携程失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取私密文件夹 (照片与语音)
    // ==========================================
    const extractAppGallery = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'gallery';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的【隐藏私密文件夹】(包含被上锁的照片/视频、以及私密语音备忘录)。
请基于角色的性格、亲密偏好(XP/癖好)、以及最近和用户(${boundP.name})的关系，生成两个列表：photos(相册)和voices(语音)。
要求：
1. 【photos】：生成6-9条。包含：desc(画面描述), isVideo(布尔值,是否视频), date(如:昨天 23:14)。这应该是不能发朋友圈的东西(如偷偷保存的用户照片、暴露XP的私密记录、不可见人的自拍等)。
2. 【voices】：生成3-4条。包含：title(录音标题), duration(如:03:15), desc(录音转文字/喘息描述), date。这应该是不可告人的东西(如喝醉后的胡言乱语、哭泣、想对用户说却不敢发的语音留言、想着用户自慰时的喘息等)。
3. 绝不输出思考过程，严格输出 JSON 格式！

格式要求：
{
  "photos": [{"desc": "...", "isVideo": false, "date": "..."}],
  "voices": [{"title": "...", "duration": "...", "desc": "...", "date": "..."}]
}`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.88 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let gal = JSON.parse(reply);
            if (gal.gallery) gal = gal.gallery;

            if (gal && (gal.photos || gal.voices)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].gallery = { items: gal, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解私密相册失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取成人网站浏览数据
    // ==========================================
    const extractAppAV = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'av';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的【成人网站(P站)私密浏览记录】。
请基于角色的性格、隐藏的性偏好(XP/癖好)、以及最近和用户(${boundP.name})的关系，生成浏览数据。
要求：
1. 【keywords】: 生成3-5个搜索关键词。极大概率暴露出他内心深处的渴望、反差XP，或者是关于用户(${boundP.name})的代餐词汇。
2. 【videos】: 生成3-4个视频记录。必须包含 title(视频的抓人眼球的标题), content(视频具体画面的露骨的文字描述，剧情内容，谁操了谁、怎么操的，约160字), duration(时长), time(观看时间), review(最让自己湿/硬的片段、为什么兴奋、看的时候有没有摸自己、角色看这个视频时的真实心理活动（比如代入用户、或者是自我吐槽），不少于300字。)。
3. 绝不输出思考过程，严格输出 JSON 格式！

格式要求：
{
  "keywords": ["关键词1", "关键词2"],
  "videos": [{"title": "...", "content": "...", "duration": "...", "time": "...", "review": "..."}]
}`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.9 }) // 稍微调高温度，让答案更狂野
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let av = JSON.parse(reply);
            if (av.av) av = av.av;

            if (av && av.videos) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].av = { items: av, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解AV数据失败", e);
            if (window.actions?.showToast) window.actions.showToast('防火墙拦截，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取网易云音乐私密数据
    // ==========================================
    const extractAppNetease = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'netease';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的【网易云音乐私密年度歌单】。
请基于角色的性格、最近的心情、以及和用户(${boundP.name})的关系，生成 6-8 首歌曲。
要求：
1. 歌曲信息：title(歌名), artist(歌手), album(专辑名)。必须是符合角色审美的真实歌曲或极具质感的虚构歌曲。
2. 重中之重：comment (私密乐评)。这是角色写给自己看的、不对外公开的心声。必须包含：
   - 这首歌让TA想起了和用户(${boundP.name})的哪个瞬间？
   - 或者是TA在那一刻真实的情绪爆发（占有欲、卑微、狂喜或心碎）。
   - 字数控制在 50 字左右，要有那种“云村”特有的伤感或深情氛围。
3. 绝不输出思考过程，严格输出 JSON 数组格式！

格式要求：
[
  {"title": "...", "artist": "...", "album": "...", "comment": "..."}
]`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let ne = JSON.parse(reply);
            if (ne.netease) ne = ne.netease;

            if (Array.isArray(ne)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].netease = { items: ne, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解网易云失败", e);
            if (window.actions?.showToast) window.actions.showToast('网络波动，提取歌单失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取浏览器搜索记录
    // ==========================================
    const extractAppSearch = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'search';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的【浏览器搜索记录】。
请基于角色的性格、记忆、以及最近和用户(${boundP.name})的聊天记录，生成 5 条搜索记录。
要求：
1. query (搜索词/句)：必须极具暴露性。比如"惹她生气了怎么哄"、"男生说这话是暗示吗"、"某种特殊的疾病/XP"等。
2. forum (论坛结果)：模拟知乎/贴吧等论坛。包含：
   - title: 搜索点进去看到的论坛帖子标题
   - content: 帖子的正文或高赞回答的摘要 (至少200字)
   - comments: 包含2条路人网友的评论 (可以是一针见血的吐槽、亲身经历、或反驳)。
3. thought (核心看点)：看完这个帖子和网友评论后，角色内心的真实感悟或破防瞬间！(比如觉得网友说得太扎心了，或者因此做出了某个决定)。❗必须直接输出内心想法，不要用（）进行任何动作描述或补充说明！
4. 绝不输出思考过程，严格输出 JSON 数组格式！

格式要求：
[
  {
    "query": "...",
    "forum": {
      "title": "...",
      "content": "...",
      "comments": [
        {"author": "热心网友A", "text": "..."},
        {"author": "路人甲", "text": "..."}
      ]
    },
    "thought": "..."
  }
]`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.88 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let sr = JSON.parse(reply);
            if (sr.search) sr = sr.search;

            if (Array.isArray(sr)) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].search = { items: sr, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解搜索记录失败", e);
            if (window.actions?.showToast) window.actions.showToast('网络波动，提取记录失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };
    // ==========================================
    // 🧠 AI 黑客引擎：提取微信 (消息列表 + 朋友圈)
    // ==========================================
    const extractAppWechat = async (charId) => {
        window.phoneState.isGenerating = true;
        window.phoneState.generatingApp = 'wechat';
        window.render();

        try {
            const { chat, boundP, char } = getQContext(charId);
            const historyStr = (chat?.messages || []).slice(-15).map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`).join('\n');
            
            // 🌟 获取TA最近发的3条真实朋友圈，喂给大模型让它造假评论！
            const realMoments = (store.moments || []).filter(m => m.senderId === charId).slice(-3);
            const realMomentsContext = realMoments.map((m, i) => `【真实动态 ${i}】内容: "${m.text || m.virtualImageText || '分享了图片'}"`).join('\n');

            const task = `你现在正在被黑客协议抽取该角色的【微信社交数据】。
请基于角色的性格、社交圈、以及和用户(${boundP.name})的关系，生成以下内容：
1. 【fakeChats】: 生成3-4个其他人的聊天列表。必须同时包含【单聊】和至少一个【3人及以上群聊】。包含: id, name, preview, time, unreadCount, isGroup(是否为群聊)。
   - 重点：每个 fakeChat 必须包含一个 messages 数组（长度8-12条的完整对话）。
   - messages 包含：sender(发送者名字。如果是群聊，请务必给出不同群友的名字，如"大刘","老王"；单聊写对方名字即可), text(内容), isChar(true代表角色本人发的话，false代表对方发的话), type("text")。
   - 内容极大概率暴露出他不为人知的一面。
2. 【fakeMoments】: 生成2-3条其他人发的朋友圈。包含: senderName, text, time, likes, comments。
3. 【realMomentInteractions】: 针对以下TA发过的真实朋友圈，生成TA好友的点赞和评论。
真实朋友圈列表：
${realMomentsContext || '暂无真实朋友圈。'}

严格输出 JSON 格式！绝不输出思考过程！

格式要求：
{
  "fakeChats": [
    {
      "id": "fc1", "name": "...", "preview": "...", "time": "...", "unreadCount": 0, "isGroup": true,
      "messages": [
        {"sender": "大刘", "text": "...", "isChar": false, "type": "text"}, 
        {"sender": "角色名字", "text": "...", "isChar": true, "type": "text"}
      ]
    }
  ],
  "fakeMoments": [{"id": "fm1", "senderName": "...", "text": "...", "time": "...", "likes": ["..."], "comments": [{"senderName": "...", "text": "..."}]}],
  "realMomentInteractions": [{"likes": ["..."], "comments": [{"senderName": "...", "text": "..."}]}]
}`;

            const masterPrompt = buildMasterPrompt(charId, { history: historyStr, task: task, scenario: 'phone' });
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: masterPrompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let wc = JSON.parse(reply);
            if (wc.wechat) wc = wc.wechat;

            if (wc && wc.fakeChats) {
                if (!store.hackedData) store.hackedData = {};
                if (!store.hackedData[charId]) store.hackedData[charId] = {};
                store.hackedData[charId].wechat = { items: wc, timestamp: Date.now() };
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("破解微信失败", e);
            if (window.actions?.showToast) window.actions.showToast('数据加密过强，提取失败');
            window.phoneState.view = 'desktop'; 
        } finally {
            window.phoneState.isGenerating = false;
            window.phoneState.generatingApp = null;
            window.render();
        }
    };

    // 🌟 在原有的 openApp 里，加上日历的触发器
    window.phoneActions.openApp = (appId, charId) => {
        window.phoneState.view = appId;
        window.phoneState.activeMemoIndex = null;
        window.phoneState.activeCalendarIndex = null;
        window.render();
        
        // 使用本地永久存储校验
        const hasMemo = store.hackedData?.[charId]?.memo;
        if (appId === 'memo' && !hasMemo) extractAppMemo(charId);
        
        const hasCalendar = store.hackedData?.[charId]?.calendar;
        if (appId === 'calendar' && !hasCalendar) extractAppCalendar(charId);

        const hasTiktok = store.hackedData?.[charId]?.tiktok;
        if (appId === 'tiktok' && !hasTiktok) extractAppTiktok(charId);

        const hasNovel = store.hackedData?.[charId]?.novel;
        if (appId === 'novel' && !hasNovel) extractAppNovel(charId);

        const hasTaobao = store.hackedData?.[charId]?.taobao;
        if (appId === 'taobao' && !hasTaobao) extractAppTaobao(charId);

        const hasCtrip = store.hackedData?.[charId]?.ctrip;
        if (appId === 'ctrip' && !hasCtrip) extractAppCtrip(charId);

        const hasGallery = store.hackedData?.[charId]?.gallery;
        if (appId === 'gallery' && !hasGallery) extractAppGallery(charId);

        const hasAV = store.hackedData?.[charId]?.av;
        if (appId === 'av' && !hasAV) extractAppAV(charId);

        const hasNetease = store.hackedData?.[charId]?.netease;
        if (appId === 'netease' && !hasNetease) extractAppNetease(charId);

        const hasSearch = store.hackedData?.[charId]?.search;
        if (appId === 'search' && !hasSearch) extractAppSearch(charId);

        const hasWechat = store.hackedData?.[charId]?.wechat;
        if (appId === 'wechat' && !hasWechat) extractAppWechat(charId);
    };

    // ==========================================
    // 🎨 UI 渲染区
    // ==========================================
    let bgHtml = '';
    let contentHtml = '';

    // 📱 【目标选择视图】(骇客潜入风)
    if (state.view === 'select_char') {
        const contactsList = (store.contacts || []).map(c => `
            <div class="flex items-center p-4 bg-gray-900/60 hover:bg-gray-800/80 border border-gray-700/50 rounded-[20px] cursor-pointer transition-colors backdrop-blur-md mb-4 shadow-lg shadow-black/20 active:scale-95" onclick="window.phoneActions.selectTarget('${c.id}')">
                <img src="${c.avatar}" class="w-14 h-14 rounded-full object-cover border-2 border-gray-600 shrink-0 bg-[#fff]">
                <div class="flex-col ml-4">
                    <div class="text-white text-[17px] font-black tracking-wider">${c.name}</div>
                    <div class="text-green-400/80 text-[11px] font-mono mt-1">> Status: Online | Tap to intercept</div>
                </div>
                ${c.hasPhonePermission ? `<i data-lucide="unlock" class="w-5 h-5 text-green-500 absolute right-6 opacity-60"></i>` : `<i data-lucide="lock" class="w-5 h-5 text-gray-500 absolute right-6 opacity-40"></i>`}
            </div>
        `).join('');

        contentHtml = `
            <div class="absolute inset-0 bg-[#0f0f13] z-50 flex flex-col px-6 py-12 animate-in fade-in zoom-in-95 duration-300">
                <div class="flex justify-between items-start mb-8">
                    <div>
                        <h1 class="text-white text-3xl font-black tracking-widest drop-shadow-md">TARGET</h1>
                        <h1 class="text-white text-3xl font-black tracking-widest drop-shadow-md mt-1">DEVICE</h1>
                        <p class="text-green-500/80 text-[10px] font-mono mt-3">> SELECT A CONTACT TO INFILTRATE</p>
                    </div>
                    <div class="w-11 h-11 bg-white/10 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-transform" onclick="window.phoneActions.exitPhone()">
                        <i data-lucide="x" class="text-white w-5 h-5"></i>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto hide-scrollbar pb-10">
                    ${contactsList || '<div class="text-gray-500 font-mono text-xs mt-10">> NO TARGETS FOUND IN DATABASE.</div>'}
                </div>
            </div>
        `;
    } 
    // 📱 【无权限拦截页】(二选一博弈)
    else if (state.view === 'auth_prompt') {
        contentHtml = `
            <div class="absolute inset-0 bg-[#0f0f13] z-50 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300 px-6">
                <div class="bg-gray-900/80 border border-gray-700/50 backdrop-blur-xl rounded-[28px] p-8 w-full max-w-sm flex flex-col items-center shadow-2xl">
                    <i data-lucide="shield-alert" class="w-16 h-16 text-yellow-500 mb-5 animate-pulse"></i>
                    <h2 class="text-white text-[18px] font-black mb-2 tracking-wider">未授权设备访问</h2>
                    <p class="text-gray-400 text-center text-[13px] mb-8 leading-relaxed font-medium">系统检测到您尚未获得该手机的长期访问权限。请选择潜入方式：</p>
                    
                    <div class="w-full space-y-3.5">
                        <button class="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-[16px] py-4 font-bold text-[15px] flex items-center justify-center transition-colors shadow-lg shadow-indigo-600/20 active:scale-95" onclick="window.phoneActions.askPermission()">
                            <i data-lucide="mail" class="w-5 h-5 mr-2"></i> 征求同意并发送请求 (安全)
                        </button>
                        
                        <button class="w-full bg-red-900/30 border border-red-700/50 hover:bg-red-900/50 text-red-400 rounded-[16px] py-4 font-bold text-[15px] flex items-center justify-center transition-colors active:scale-95" onclick="window.phoneActions.hackInto()">
                            <i data-lucide="terminal" class="w-5 h-5 mr-2"></i> 强制黑入设备 (25%暴露风险)
                        </button>
                    </div>
                    
                    <button class="w-full text-gray-500 rounded-[16px] py-3 font-bold text-[13px] flex items-center justify-center transition-colors active:scale-95 mt-4" onclick="window.phoneActions.switchTarget()">
                        返回重选
                    </button>
                </div>
            </div>
        `;
    }
    // 📱 【已有目标的手机视图】
    else {
        if (!state.appData[targetCharId]) state.appData[targetCharId] = {};
        const { chat, boundP, char } = getQContext(targetCharId);
        
        // 🌟 恢复为极简护眼的浅蓝纯色壁纸
        bgHtml = `<div class="absolute inset-0 bg-[#aed2eb] z-0"></div>`;

        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        const dayStr = days[now.getDay()];

        if (state.view === 'desktop') {
            contentHtml = `
                <div class="absolute top-12 left-6 z-20 cursor-pointer p-2 active:scale-90 opacity-60 hover:opacity-100 transition-opacity" onclick="window.phoneActions.switchTarget()">
                    <div class="bg-black/30 backdrop-blur-md rounded-full p-1.5 border border-white/20">
                        <i data-lucide="users" class="w-5 h-5 text-white"></i>
                    </div>
                </div>
                <div class="absolute top-12 right-6 z-20 cursor-pointer p-2 active:scale-90 opacity-60 hover:opacity-100 transition-opacity" onclick="window.phoneActions.exitPhone()">
                    <div class="bg-black/30 backdrop-blur-md rounded-full p-1.5 border border-white/20">
                        <i data-lucide="power" class="w-5 h-5 text-white"></i>
                    </div>
                </div>

                <div class="absolute top-24 left-0 right-0 flex flex-col items-center z-10 text-white drop-shadow-lg">
                    <div class="text-[80px] font-extralight tracking-tight leading-none opacity-95">${hours}:${minutes}</div>
                    <div class="text-[18px] font-medium tracking-widest mt-2 opacity-90">${month}月${date}日 星期${dayStr}</div>
                </div>

                <div class="absolute bottom-32 left-0 right-0 px-5 z-10 animate-in slide-in-from-bottom-4 duration-300">
                    <div class="grid grid-cols-4 gap-y-6 justify-items-center">
                        ${createPhoneAppIcon('calendar', '行程安排', 'calendar', targetCharId)}
                        ${createPhoneAppIcon('file-text', '备忘录', 'memo', targetCharId)}
                        ${createPhoneAppIcon('tiktok-svg', '抖音', 'tiktok', targetCharId)}
                        ${createPhoneAppIcon('book-open', '番茄小说', 'novel', targetCharId)}
                        ${createPhoneAppIcon('shopping-bag', '淘宝', 'taobao', targetCharId)}
                        ${createPhoneAppIcon('plane', '携程', 'ctrip', targetCharId)}
                        ${createPhoneAppIcon('folder-lock', '文件夹', 'gallery', targetCharId)}
                        ${createPhoneAppIcon('flame', 'Porn', 'av', targetCharId)}
                    </div>
                </div>

                <div class="absolute bottom-6 left-0 right-0 flex justify-center z-20 animate-in slide-in-from-bottom-8 duration-300">
                    <div class="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[28px] py-4 px-5 flex items-center space-x-6 shadow-lg">
                        ${createPhoneDockIcon('message-circle', 'wechat', targetCharId)}
                        ${createPhoneDockIcon('music', 'netease', targetCharId)}
                        ${createPhoneDockIcon('compass', 'search', targetCharId)}
                    </div>
                </div>
            `;
        } 
        else if (state.view === 'memo') {
            if (state.isGenerating && state.generatingApp === 'memo') {
                // 🌟 双轨动画：判断当前是通过哪种方式进来的！
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-gray-300 animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">iCloud 数据同步中...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-green-500 p-6 animate-in fade-in">
                            <i data-lucide="terminal" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90">
                                <div class="typing-effect">> Bypassing local encryption...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Accessing com.apple.Notes.sqlite...</div>
                                <div class="typing-effect" style="animation-delay: 1s">> Decrypting secure blobs...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1.5s">EXTRACTING DATA [||||||||||||||||||  ] 85%</div>
                            </div>
                            <style>
                                .typing-effect { overflow: hidden; white-space: nowrap; width: 0; animation: typing 1s steps(30, end) forwards; }
                                @keyframes typing { from { width: 0 } to { width: 100% } }
                            </style>
                        </div>
                    `;
                }
            } else {
                // 🌟 读取永久存储与时间格式化
                const memoNode = store.hackedData?.[targetCharId]?.memo;
                const memoData = memoNode ? memoNode.items : [];
                const memoTime = memoNode ? new Date(memoNode.timestamp).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}).replace(/\//g, '-') : '';

                if (state.activeMemoIndex !== null && memoData[state.activeMemoIndex]) {
                    const note = memoData[state.activeMemoIndex];
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="pt-12 pb-3 px-4 flex items-center justify-between bg-[#fff] z-40">
                                <div class="cursor-pointer active:opacity-50 text-[#d4af37] w-20 flex items-center" onclick="window.phoneActions.closeMemoDetail()">
                                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                                    <span class="text-[17px] font-medium">备忘录</span>
                                </div>
                                <div class="flex space-x-4 text-[#d4af37]">
                                    <i data-lucide="share" class="w-6 h-6 cursor-pointer active:scale-90 hover:opacity-80 transition-all" onclick="window.phoneActions.forwardMemo()"></i>
                                    <i data-lucide="more-horizontal" class="w-6 h-6 opacity-50 cursor-not-allowed"></i>
                                </div>
                            </div>
                            <div class="flex-1 overflow-y-auto px-5 pb-10 bg-[#fff] hide-scrollbar">
                                <div class="text-center text-[12px] text-gray-400 font-medium mb-6">${note.date}</div>
                                <div class="text-[22px] font-bold text-gray-900 mb-4 leading-tight">${note.title}</div>
                                <div class="text-[16px] text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">${note.content}</div>
                            </div>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f4f5f7] z-30 flex flex-col animate-in zoom-in-95 duration-200">
                            <div class="pt-12 pb-2 px-5 flex items-center justify-between bg-[#f4f5f7] z-40">
                                <div class="cursor-pointer active:opacity-50 text-[#d4af37] flex items-center" onclick="window.phoneActions.backToDesktop()">
                                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                                    <span class="text-[17px] font-medium">返回</span>
                                </div>
                                <div class="flex items-center space-x-3">
                                    ${memoTime ? `<span class="text-[10px] text-gray-400 font-medium tracking-wide">上次刷新：${memoTime}</span>` : ''}
                                    <div class="text-gray-900 cursor-pointer active:rotate-180 transition-transform" onclick="window.phoneActions.refreshApp('memo', '${targetCharId}')">
                                        <i data-lucide="refresh-cw" class="w-5 h-5 opacity-40 hover:opacity-100"></i>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="px-5 pt-2 pb-4 bg-[#f4f5f7] z-40">
                                <h1 class="text-[34px] font-bold text-gray-900 tracking-tight">备忘录</h1>
                                <div class="mt-4 bg-gray-200/60 rounded-[12px] p-2 flex items-center text-gray-500">
                                    <i data-lucide="search" class="w-5 h-5 mx-1"></i>
                                    <span class="text-[15px] font-medium">搜索</span>
                                </div>
                            </div>

                            <div class="flex-1 overflow-y-auto px-5 pb-6 bg-[#f4f5f7] hide-scrollbar" onscroll="window.phoneState.memoScrollTop = this.scrollTop" id="phone-memo-scroll">
                                <div class="bg-[#fff] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                                    ${memoData.map((m, idx) => `
                                        <div class="p-4 border-b border-gray-100 last:border-0 cursor-pointer active:bg-[#f9fafb] transition-colors" onclick="window.phoneActions.openMemoDetail(${idx})">
                                            <div class="text-[16px] font-bold text-gray-900 mb-1 truncate">${m.title}</div>
                                            <div class="flex items-center text-[14px]">
                                                <span class="text-gray-500 font-medium mr-3 shrink-0">${m.date}</span>
                                                <span class="text-gray-400 truncate">${m.snippet}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div class="text-center text-[12px] text-gray-400 font-medium mt-6">${memoData.length} 个备忘录</div>
                            </div>
                        </div>
                    `;
                }
            }
        } 
        // 📅 【行程安排视图 (iOS提醒事项风格)】
        else if (state.view === 'calendar') {
            if (state.isGenerating && state.generatingApp === 'calendar') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-blue-500 animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步 iCloud 日历...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-blue-400 p-6 animate-in fade-in">
                            <i data-lucide="calendar" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90">
                                <div class="typing-effect">> Intercepting calendar sync...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Reading EventStore.sqlitedb...</div>
                                <div class="typing-effect" style="animation-delay: 1s">> Analyzing modified traces...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1.5s">EXTRACTING [||||||||||||||||||  ] 92%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                // 🌟 读取永久存储与时间格式化
                const calNode = store.hackedData?.[targetCharId]?.calendar;
                const calData = calNode ? calNode.items : [];
                const calTime = calNode ? new Date(calNode.timestamp).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}).replace(/\//g, '-') : '';
                
                if (state.activeCalendarIndex !== null && calData[state.activeCalendarIndex]) {
                    const item = calData[state.activeCalendarIndex];
                    
                    // 动态渲染状态UI
                    let statusHtml = '';
                    if (item.status === 'completed') statusHtml = `<div class="bg-blue-500 rounded-full p-1"><i data-lucide="check" class="w-4 h-4 text-white"></i></div><span class="text-blue-500 font-bold ml-2">已完成</span>`;
                    else if (item.status === 'cancelled') statusHtml = `<div class="bg-red-500 rounded-full p-1"><i data-lucide="x" class="w-4 h-4 text-white"></i></div><span class="text-red-500 font-bold ml-2">已取消</span>`;
                    else statusHtml = `<div class="border-2 border-gray-300 rounded-full w-6 h-6"></div><span class="text-gray-500 font-bold ml-2">待办事项</span>`;

                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f9fafb] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="pt-12 pb-3 px-4 flex items-center justify-between bg-[#f9fafb] z-40 border-b border-gray-200">
                                <div class="cursor-pointer active:opacity-50 text-blue-500 w-24 flex items-center" onclick="window.phoneActions.closeCalendarDetail()">
                                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                                    <span class="text-[17px] font-medium">提醒事项</span>
                                </div>
                                <div class="text-[16px] font-bold text-gray-900">详细信息</div>
                                <div class="w-24 flex justify-end">
                                    <i data-lucide="share" class="w-6 h-6 text-blue-500 cursor-pointer active:scale-90 hover:opacity-80 transition-all" onclick="window.phoneActions.forwardCalendar()"></i>
                                </div>
                            </div>
                            <div class="flex-1 overflow-y-auto px-5 pt-6 pb-10 bg-[#f9fafb] hide-scrollbar">
                                <div class="bg-[#fff] rounded-[12px] p-5 border border-gray-200 shadow-sm mb-6">
                                    <div class="flex items-center mb-4 pb-4 border-b border-gray-100">${statusHtml}</div>
                                    <div class="text-[20px] font-bold text-gray-900 mb-2 leading-tight ${item.status==='completed'||item.status==='cancelled'?'line-through opacity-50':''}">${item.title}</div>
                                    <div class="text-[14px] text-gray-400 font-medium flex items-center mt-2"><i data-lucide="clock" class="w-4 h-4 mr-1.5"></i>${item.datetime}</div>
                                </div>
                                
                                ${item.trace_note ? `
                                <div class="text-[13px] font-bold text-gray-500 ml-2 mb-2 uppercase tracking-wider">Notes & Traces</div>
                                <div class="bg-[#fff] rounded-[12px] p-5 border border-gray-200 shadow-sm text-[15px] text-gray-700 leading-relaxed font-medium">
                                    ${item.trace_note.replace(/~~(.*?)~~/g, '<del class="text-red-400 opacity-80">$1</del>')}
                                </div>` : ''}
                            </div>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in zoom-in-95 duration-200">
                            <div class="pt-12 pb-2 px-5 flex items-center justify-between bg-[#fff] z-40">
                                <div class="cursor-pointer active:opacity-50 text-blue-500 flex items-center" onclick="window.phoneActions.backToDesktop()">
                                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                                    <span class="text-[17px] font-medium">返回</span>
                                </div>
                                <div class="flex items-center space-x-3">
                                    ${calTime ? `<span class="text-[10px] text-blue-400/70 font-medium tracking-wide">上次同步：${calTime}</span>` : ''}
                                    <div class="text-blue-500 cursor-pointer active:rotate-180 transition-transform" onclick="window.phoneActions.refreshApp('calendar', '${targetCharId}')">
                                        <i data-lucide="refresh-cw" class="w-5 h-5 opacity-80 hover:opacity-100"></i>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="px-5 pt-2 pb-3 bg-[#fff] z-40 border-b border-gray-100">
                                <h1 class="text-[34px] font-bold text-blue-600 tracking-tight">本周行程</h1>
                            </div>

                            <div class="flex-1 overflow-y-auto pl-5 pr-2 bg-[#fff] hide-scrollbar" onscroll="window.phoneState.calendarScrollTop = this.scrollTop" id="phone-calendar-scroll">
                                <div class="mt-4">
                                    ${calData.map((m, idx) => {
                                        let iconHtml = m.status === 'completed' ? `<div class="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center border border-blue-500"><i data-lucide="check" class="w-3.5 h-3.5 text-white"></i></div>` : 
                                                       (m.status === 'cancelled' ? `<div class="w-[22px] h-[22px] rounded-full bg-red-100 flex items-center justify-center border border-red-200"><i data-lucide="x" class="w-3.5 h-3.5 text-red-500"></i></div>` :
                                                       `<div class="w-[22px] h-[22px] rounded-full border-2 border-gray-300"></div>`);
                                        let titleClass = m.status === 'completed' || m.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-800';
                                        
                                        return `
                                        <div class="flex items-start py-3.5 pr-4 border-b border-gray-100 last:border-0 cursor-pointer active:bg-[#f9fafb] transition-colors" onclick="window.phoneActions.openCalendarDetail(${idx})">
                                            <div class="mr-3 mt-0.5 flex-shrink-0">${iconHtml}</div>
                                            <div class="flex-1 overflow-hidden">
                                                <div class="text-[16px] font-medium ${titleClass} mb-1">${m.title}</div>
                                                ${m.trace_note ? `<div class="text-[13px] text-gray-400 truncate mb-1"><i data-lucide="edit-3" class="w-3 h-3 inline mr-1 opacity-70"></i>${m.trace_note.replace(/~~/g, '')}</div>` : ''}
                                                <div class="text-[12px] font-bold ${m.status === 'pending' ? 'text-blue-500' : 'text-gray-400'}">${m.datetime}</div>
                                            </div>
                                        </div>
                                    `}).join('')}
                                </div>
                                <div class="text-center text-[12px] text-gray-400 font-medium my-6">${calData.length} 个提醒事项</div>
                            </div>
                        </div>
                    `;
                }
            }
        }
        // 🎵 【抖音视图 (沉浸式暗黑风格)】
        else if (state.view === 'tiktok') {
            if (state.isGenerating && state.generatingApp === 'tiktok') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#121212] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#fe2c55] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-300 tracking-wider">正在加载数据...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#fe2c55] p-6 animate-in fade-in">
                            <i data-lucide="music-2" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90">
                                <div class="typing-effect">> Bypassing Aweme network...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Fetching user profile & likes...</div>
                                <div class="typing-effect" style="animation-delay: 1s">> Decrypting private messages...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1.5s">EXTRACTING [||||||||||||||||||  ] 98%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const tkNode = store.hackedData?.[targetCharId]?.tiktok;
                const tkData = tkNode ? tkNode.items : { messages: [], works: [], liked: [] };
                const tkTime = tkNode ? new Date(tkNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

                // 核心组件：生成单个抖音视频格子（吸收了你提供的反转卡片代码！）
                const createVideoGrid = (list) => {
                    return list.map(m => `
                        <div class="relative w-full aspect-[3/4] bg-[#fff] cursor-pointer select-none overflow-hidden" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');">
                            <div class="absolute inset-0 p-2.5 overflow-y-auto text-[11px] text-gray-800 leading-relaxed text-left bg-[#fff] hide-scrollbar border border-gray-200">
                                <span class="font-bold text-gray-400 block mb-1.5 flex items-center"><i data-lucide="video" class="w-3.5 h-3.5 mr-1 text-[#fe2c55]"></i>视频内容</span>
                                ${m.desc}
                            </div>
                            <div class="img-overlay absolute inset-0 bg-[#252632] flex flex-col items-center justify-center text-gray-400 transition-opacity duration-300 z-10 border border-[#161823]">
                                <i data-lucide="play" class="w-8 h-8 mb-1 text-white opacity-80"></i>
                                <div class="absolute bottom-1.5 left-2 flex items-center space-x-1 text-white opacity-80 text-[10px]">
                                    <i data-lucide="heart" class="w-3 h-3"></i><span>${Math.floor(Math.random()*100)+1}w</span>
                                </div>
                            </div>
                        </div>
                    `).join('');
                };

                let pageContent = '';

                // 📨 消息页
                if (state.tiktokTab === 'messages') {
                    if (state.tiktokSubView === 'detail' && state.activeTiktokMsgIndex !== null) {
                        // 🌟 场景 A：私信详情页 (聊天记录流)
                        const m = tkData.messages[state.activeTiktokMsgIndex];
                        pageContent = `
                            <div class="flex-1 flex flex-col bg-[#fff]">
                                <div class="flex-1 overflow-y-auto p-4 space-y-6 hide-scrollbar">
                                    
                                    <div class="flex flex-col items-start max-w-[85%]">
                                        <div class="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none text-[14px] text-gray-800 shadow-sm border border-gray-100">
                                            ${m.content}
                                        </div>
                                        <span class="text-[10px] text-gray-400 mt-1.5 ml-1">${m.time}</span>
                                    </div>
                                    
                                    <div class="flex flex-col items-end max-w-[85%] ml-auto">
                                        <div class="bg-blue-500 px-4 py-2.5 rounded-2xl rounded-tr-none text-[14px] text-white shadow-sm">
                                            ${m.reply || '（已读未回）'}
                                        </div>
                                    </div>

                                    ${m.status === 'blocked' ? `
                                    <div class="flex justify-center pt-2 pb-4">
                                        <span class="text-[11px] text-red-400 font-medium tracking-wider bg-gray-50 px-3 py-1.5 rounded-md">
                                            对方已被拉黑
                                        </span>
                                    </div>
                                    ` : ''}

                                </div>
                            </div>
                        `;
                    } else {
                        // 🌟 场景 B：消息列表
                        pageContent = `
                            <div class="flex-1 overflow-y-auto bg-[#fff] hide-scrollbar">
                                ${tkData.messages.map((m, idx) => `
                                    <div class="flex items-center px-4 py-4 active:bg-gray-50 cursor-pointer border-b border-gray-50/50" onclick="window.phoneActions.openTiktokMsg(${idx})">
                                        <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex-shrink-0 flex items-center justify-center text-white font-black">
                                            ${m.name.substring(0,1)}
                                        </div>
                                        <div class="ml-4 flex-1 overflow-hidden">
                                            <div class="flex justify-between items-center mb-1">
                                                <span class="text-[15px] font-bold text-gray-900 truncate">${m.name}</span>
                                                <span class="text-[11px] text-gray-400">${m.time}</span>
                                            </div>
                                            <div class="text-[13px] text-gray-400 truncate flex items-center">
                                                ${m.status === 'blocked' ? '<i data-lucide="ban" class="w-3 h-3 mr-1 text-red-300"></i>' : ''}
                                                ${m.content}
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }
                }
                // 👤 个人主页
                else {
                    const isWorks = state.tiktokSubTab === 'works';
                    pageContent = `
                        <div class="flex-1 overflow-y-auto bg-[#fff] hide-scrollbar">
                            <div class="px-5 pt-6 pb-4">
                                <div class="flex items-center space-x-5 mb-5">
                                    <img src="${char.avatar}" class="w-20 h-20 rounded-full border border-gray-200 object-cover p-0.5">
                                    <div class="flex-1 flex justify-around text-center">
                                        <div><div class="font-bold text-[16px] text-gray-900">${Math.floor(Math.random()*500)}</div><div class="text-[11px] text-gray-500">获赞</div></div>
                                        <div><div class="font-bold text-[16px] text-gray-900">${Math.floor(Math.random()*200)}</div><div class="text-[11px] text-gray-500">朋友</div></div>
                                        <div><div class="font-bold text-[16px] text-gray-900">${Math.floor(Math.random()*100)}</div><div class="text-[11px] text-gray-500">关注</div></div>
                                        <div><div class="font-bold text-[16px] text-gray-900">${Math.floor(Math.random()*1000)}</div><div class="text-[11px] text-gray-500">粉丝</div></div>
                                    </div>
                                </div>
                                <div class="font-bold text-[18px] text-gray-900 mb-1">${char.name}</div>
                                <div class="text-[12px] text-gray-500 mb-4">抖音号：tk_${char.id.substring(0,8)}</div>
                                <div class="text-[13px] text-gray-800 mb-4 whitespace-pre-wrap">${char.identity || '这个人很懒，什么都没留下'}</div>
                                <div class="flex space-x-2">
                                    <button class="flex-1 bg-[#f9fafb] border border-gray-200 text-gray-800 font-bold py-2 rounded-lg text-[13px]">编辑资料</button>
                                    <button class="flex-1 bg-[#f9fafb] border border-gray-200 text-gray-800 font-bold py-2 rounded-lg text-[13px]">添加朋友</button>
                                </div>
                            </div>
                            
                            <div class="flex border-b border-gray-100 relative">
                                <div class="flex-1 py-3 text-center text-[15px] cursor-pointer ${isWorks ? 'font-bold text-gray-900' : 'text-gray-500'}" onclick="window.phoneActions.switchTiktokSubTab('works')">作品 ${tkData.works.length}</div>
                                <div class="flex-1 py-3 text-center text-[15px] cursor-pointer ${!isWorks ? 'font-bold text-gray-900' : 'text-gray-500'}" onclick="window.phoneActions.switchTiktokSubTab('liked')">喜欢 ${tkData.liked.length}</div>
                                <div class="absolute bottom-0 h-[2px] bg-gray-900 transition-all duration-300 w-8" style="left: ${isWorks ? '25%' : '75%'}; transform: translateX(-50%);"></div>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-[1px] bg-gray-100">
                                ${createVideoGrid(isWorks ? tkData.works : tkData.liked)}
                            </div>
                        </div>
                    `;
                }

                contentHtml = `
                    <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                        <div class="pt-12 pb-2 px-4 flex items-center bg-[#fff] border-b border-gray-100 z-40 relative">
                            <div class="w-20">
                                <div class="cursor-pointer active:opacity-50 text-gray-800 flex items-center" 
                                     onclick="${state.tiktokSubView === 'detail' ? 'window.phoneActions.closeTiktokMsg()' : 'window.phoneActions.backToDesktop()'}">
                                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                                </div>
                            </div>

                            <div class="flex-1 flex flex-col items-center overflow-hidden">
                                <span class="text-[17px] font-bold text-gray-900 truncate w-full text-center">
                                    ${state.tiktokTab === 'messages' ? (state.tiktokSubView === 'detail' ? tkData.messages[state.activeTiktokMsgIndex].name : '消息') : char.name}
                                </span>
                                ${tkTime ? `<span class="text-[9px] text-gray-400 font-medium tracking-tighter mt-0.5">同步于 ${tkTime}</span>` : ''}
                            </div>

                            <div class="w-20 flex justify-end items-center space-x-3.5 text-gray-800">
                                <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-40 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('tiktok', '${targetCharId}')"></i>
                                ${(state.tiktokTab === 'profile' || (state.tiktokTab === 'messages' && state.tiktokSubView === 'detail')) ? `<i data-lucide="share" class="w-[18px] h-[18px] cursor-pointer active:scale-90 opacity-40 hover:opacity-100 transition-all" onclick="window.phoneActions.forwardTiktok()"></i>` : `<div class="w-[18px]"></div>`}
                            </div>
                        </div>

                        ${pageContent}

                        <div class="h-[52px] bg-[#fff] border-t border-gray-100 flex items-center justify-around pb-safe">
                            <div class="flex flex-col items-center justify-center opacity-40">
                                <i data-lucide="home" class="w-6 h-6 mb-0.5"></i>
                                <span class="text-[10px]">首页</span>
                            </div>
                            <div class="flex flex-col items-center justify-center opacity-40">
                                <i data-lucide="users" class="w-6 h-6 mb-0.5"></i>
                                <span class="text-[10px]">朋友</span>
                            </div>
                            <div class="w-11 h-8 bg-gradient-to-r from-cyan-400 via-gray-900 to-[#fe2c55] rounded-xl flex items-center justify-center shadow-sm opacity-40">
                                <i data-lucide="plus" class="w-5 h-5 text-white"></i>
                            </div>
                            <div class="flex flex-col items-center justify-center cursor-pointer ${state.tiktokTab === 'messages' ? 'text-gray-900 font-bold' : 'text-gray-400 opacity-60'}" onclick="window.phoneActions.switchTiktokTab('messages')">
                                <i data-lucide="message-square" class="w-6 h-6 mb-0.5"></i>
                                <span class="text-[10px]">消息</span>
                            </div>
                            <div class="flex flex-col items-center justify-center cursor-pointer ${state.tiktokTab === 'profile' ? 'text-gray-900 font-bold' : 'text-gray-400 opacity-60'}" onclick="window.phoneActions.switchTiktokTab('profile')">
                                <i data-lucide="user" class="w-6 h-6 mb-0.5"></i>
                                <span class="text-[10px]">我</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        // 📚 【番茄小说视图 (拟真书架风格)】
        else if (state.view === 'novel') {
            if (state.isGenerating && state.generatingApp === 'novel') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#ff4b3b] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步云书架...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#ff4b3b] p-6 animate-in fade-in">
                            <i data-lucide="book-open" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90">
                                <div class="typing-effect">> Decrypting reader_history.db...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Extracting reading progress...</div>
                                <div class="typing-effect" style="animation-delay: 1s">> Analyzing private annotations...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1.5s">EXTRACTING [||||||||||||||||||  ] 95%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const nvNode = store.hackedData?.[targetCharId]?.novel;
                const nvData = nvNode ? nvNode.items : [];
                const nvTime = nvNode ? new Date(nvNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

                // 🌟 CSS 随机渐变书封生成器 (高级莫兰蒂/低饱和度色系)
                const coverGradients = [
                    'from-[#7b8b9a] to-[#5c6b7a]', // 雾霾蓝
                    'from-[#9bad93] to-[#7a8c72]', // 灰豆绿
                    'from-[#c8a6a6] to-[#a68585]', // 枯玫瑰/藕粉
                    'from-[#b5a397] to-[#968478]', // 奶茶褐
                    'from-[#9b90a2] to-[#7c7183]', // 灰芋紫
                    'from-[#8c9296] to-[#6d7377]'  // 暗岩灰
                ];

                if (state.activeNovelIndex !== null && nvData[state.activeNovelIndex]) {
                    // 🌟 详情页
                    const nv = nvData[state.activeNovelIndex];
                    const gradient = coverGradients[state.activeNovelIndex % coverGradients.length];
                    
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="pt-12 pb-2 px-4 flex items-center bg-[#fff] z-40 relative">
                                <div class="w-20"><div class="cursor-pointer active:opacity-50 text-gray-800 flex items-center" onclick="window.phoneActions.closeNovelDetail()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                                <div class="flex-1 flex flex-col items-center overflow-hidden"><span class="text-[17px] font-bold text-gray-900 truncate w-full text-center">书籍详情</span></div>
                                <div class="w-20 flex justify-end items-center text-gray-800">
                                    <i data-lucide="share" class="w-[20px] h-[20px] cursor-pointer active:scale-90 text-[#ff4b3b] opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.forwardNovel()"></i>
                                </div>
                            </div>

                            <div class="flex-1 overflow-y-auto px-5 pt-4 pb-10 hide-scrollbar bg-[#f8f9fa]">
                                <div class="flex bg-[#fff] p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
                                    <div class="w-24 h-32 rounded-md shadow-md bg-gradient-to-br ${gradient} flex items-center justify-center p-3 text-white text-center font-black text-[15px] leading-tight shrink-0">
                                        <div class="drop-shadow-md">${nv.title}</div>
                                    </div>
                                    <div class="ml-4 flex-1 flex flex-col justify-center">
                                        <div class="text-[18px] font-bold text-gray-900 mb-1 leading-tight">${nv.title}</div>
                                        <div class="text-[13px] text-gray-500 mb-3">${nv.author}</div>
                                        <div class="flex items-center space-x-3 text-[12px]">
                                            <div class="flex flex-col"><span class="text-gray-400">阅读进度</span><span class="font-bold text-[#ff4b3b]">${nv.progress}</span></div>
                                            <div class="w-[1px] h-6 bg-gray-200"></div>
                                            <div class="flex flex-col"><span class="text-gray-400">共读时长</span><span class="font-bold text-gray-700">${nv.duration}</span></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="bg-[#fff] p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
                                    <div class="text-[14px] font-bold text-gray-900 mb-2 flex items-center"><i data-lucide="book-open" class="w-4 h-4 mr-1 text-gray-400"></i>内容简介</div>
                                    <div class="text-[13px] text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">${nv.synopsis}</div>
                                </div>

                                <div class="bg-red-50 p-4 rounded-xl border border-red-100 relative overflow-hidden">
                                    <div class="absolute -right-2 -top-2 opacity-5"><i data-lucide="message-square" class="w-24 h-24 text-red-500"></i></div>
                                    <div class="text-[14px] font-black text-[#be123c] mb-2 flex items-center relative z-10"><i data-lucide="pen-tool" class="w-4 h-4 mr-1"></i>TA 的私密短评</div>
                                    <div class="text-[13px] text-[#881337] leading-relaxed font-bold relative z-10 italic">
                                        “${nv.comment}”
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    // 🌟 书架列表页 (3栏网格)
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in zoom-in-95 duration-200">
                            <div class="pt-12 pb-2 px-4 flex items-center bg-[#fff] z-40 relative">
                                <div class="w-20"><div class="cursor-pointer active:opacity-50 text-gray-800 flex items-center" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                                <div class="flex-1 flex flex-col items-center overflow-hidden">
                                    <span class="text-[17px] font-bold text-gray-900 truncate w-full text-center">我的书架</span>
                                    ${nvTime ? `<span class="text-[9px] text-gray-400 font-medium tracking-tighter mt-0.5">同步于 ${nvTime}</span>` : ''}
                                </div>
                                <div class="w-20 flex justify-end items-center text-gray-800">
                                    <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-40 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('novel', '${targetCharId}')"></i>
                                </div>
                            </div>
                            
                            <div class="flex-1 overflow-y-auto px-5 pt-6 pb-6 bg-[#fff] hide-scrollbar" onscroll="window.phoneState.novelScrollTop = this.scrollTop" id="phone-novel-scroll">
                                <div class="grid grid-cols-3 gap-x-4 gap-y-6">
                                    ${nvData.map((nv, idx) => {
                                        const gradient = coverGradients[idx % coverGradients.length];
                                        return `
                                        <div class="flex flex-col cursor-pointer active:scale-95 transition-transform group" onclick="window.phoneActions.openNovelDetail(${idx})">
                                            <div class="w-full aspect-[3/4] rounded-md shadow-md bg-gradient-to-br ${gradient} flex items-center justify-center p-2 text-white text-center font-bold text-[12px] leading-tight mb-2 border border-black/5 relative overflow-hidden">
                                                <div class="drop-shadow-md z-10">${nv.title}</div>
                                                <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-r from-black/20 to-transparent"></div>
                                            </div>
                                            <div class="text-[13px] font-bold text-gray-900 truncate w-full group-hover:text-[#ff4b3b] transition-colors">${nv.title}</div>
                                            <div class="text-[11px] text-gray-400 truncate w-full mt-0.5">${nv.author}</div>
                                        </div>
                                    `}).join('')}
                                </div>
                                <div class="text-center text-[11px] text-gray-400 font-medium mt-10">已到底部</div>
                            </div>
                        </div>
                    `;
                }
            }
        }
        // 🛒 【淘宝视图 (简约购物风格)】
        else if (state.view === 'taobao') {
            if (state.isGenerating && state.generatingApp === 'taobao') {
                if (state.accessMode === 'authorized') {
                    // 🌟 授权模式：正规同步 UI
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f4f4f4] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#ff5000] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步淘宝账单...</span>
                        </div>
                    `;
                } else {
                    // 💀 黑客模式：红色骇客入侵 UI
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#ff5000] p-6 animate-in fade-in">
                            <i data-lucide="shopping-cart" class="w-16 h-16 mb-6 animate-bounce opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Bypassing Alipay security...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Intercepting trade_history...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1s">DUMPING ORDERS [||||||||||||||||||  ] 94%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const tbNode = store.hackedData?.[targetCharId]?.taobao;
                const tbData = tbNode ? tbNode.items : { cart: [], orders: [] };
                const tbTime = tbNode ? new Date(tbNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';
                const isCart = state.taobaoTab === 'cart';

                contentHtml = `
                    <div class="absolute inset-0 bg-[#f4f4f4] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                        <div class="pt-12 pb-2 px-4 flex items-center bg-[#fff] z-40 relative">
                            <div class="w-20"><div class="cursor-pointer active:opacity-50 text-gray-800 flex items-center" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                            <div class="flex-1 flex flex-col items-center">
                                <span class="text-[17px] font-bold text-gray-900 text-center">手机淘宝</span>
                                ${tbTime ? `<span class="text-[9px] text-gray-400 font-medium mt-0.5 tracking-tighter">同步于 ${tbTime}</span>` : ''}
                            </div>
                            <div class="w-20 flex justify-end items-center space-x-3.5 text-gray-800">
                                <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-40 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('taobao', '${targetCharId}')"></i>
                                <i data-lucide="share" class="w-[18px] h-[18px] cursor-pointer active:scale-90 opacity-60 hover:opacity-100 transition-all text-[#ff5000]" onclick="window.phoneActions.forwardTaobao()"></i>
                            </div>
                        </div>

                        <div class="flex bg-[#fff] border-b border-gray-200">
                            <div class="flex-1 py-3 text-center text-[15px] cursor-pointer transition-all ${isCart ? 'text-[#ff5000] font-black border-b-2 border-[#ff5000]' : 'text-gray-500'}" onclick="window.phoneActions.switchTaobaoTab('cart')">购物车 ${tbData.cart.length}</div>
                            <div class="flex-1 py-3 text-center text-[15px] cursor-pointer transition-all ${!isCart ? 'text-[#ff5000] font-black border-b-2 border-[#ff5000]' : 'text-gray-500'}" onclick="window.phoneActions.switchTaobaoTab('orders')">我的订单</div>
                        </div>

                        <div class="flex-1 overflow-y-auto px-3 pt-3 pb-6 hide-scrollbar">
                            ${(isCart ? tbData.cart : tbData.orders).map((item) => `
                                <div class="bg-[#fff] rounded-2xl p-3.5 mb-3 shadow-sm border border-gray-100 relative group animate-in fade-in slide-in-from-bottom-2">
                                    <div class="flex items-center text-[13px] font-bold text-gray-800 mb-3">
                                        <i data-lucide="store" class="w-4 h-4 mr-1.5 text-gray-500"></i> ${item.name.substring(0,3)}...旗舰店 <i data-lucide="chevron-right" class="w-3.5 h-3.5 ml-0.5 text-gray-400"></i>
                                        ${!isCart ? `<span class="ml-auto text-[#ff5000] font-normal text-[12px]">${item.logistics.includes('签收') ? '交易成功' : '卖家已发货'}</span>` : ''}
                                    </div>
                                    
                                    <div class="flex items-stretch">
                                        <div class="w-[85px] h-[85px] bg-gray-50/80 rounded-lg flex-shrink-0 border border-gray-100 flex items-center justify-center overflow-hidden">
                                            <i data-lucide="image" class="w-7 h-7 text-gray-300"></i>
                                        </div>
                                        
                                        <div class="ml-3 flex-1 flex flex-col justify-between">
                                            <div class="text-[13px] font-medium text-gray-900 leading-snug line-clamp-2">${item.name}</div>
                                            <div class="text-[11px] text-gray-500 bg-gray-50 rounded px-1.5 py-1 inline-block self-start mt-1.5 truncate max-w-[150px] border border-gray-100">
                                                ${item.params} <i data-lucide="chevron-down" class="w-3 h-3 inline"></i>
                                            </div>
                                            <div class="flex justify-between items-end mt-2">
                                                <div class="text-[16px] font-black text-[#ff5000]"><span class="text-[11px] mr-0.5">¥</span>${String(item.price).replace(/[¥￥]/g, '')}</div>
                                                <div class="text-[12px] text-gray-500">x${item.count}</div>
                                            </div>
                                        </div>
                                    </div>

                                    ${!isCart ? `
                                        <div class="mt-4 pt-3 border-t border-gray-100 flex flex-col space-y-2 text-[12px] text-gray-500 bg-gray-50/80 p-2.5 rounded-xl">
                                            <div class="flex justify-between"><span class="text-gray-400">下单时间</span><span>${item.time}</span></div>
                                            <div class="flex justify-between"><span class="text-gray-400">收件人</span><span class="font-bold text-gray-700">${item.recipient}</span></div>
                                            <div class="flex justify-between"><span class="text-gray-400">物流状态</span><span class="text-green-500 font-bold">${item.logistics}</span></div>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                            ${(isCart ? tbData.cart : tbData.orders).length === 0 ? `<div class="text-center text-gray-400 mt-20 text-[13px]">暂无相关记录</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        // 🧳 【携程旅行视图 (商务风行程单)】
        else if (state.view === 'ctrip') {
            if (state.isGenerating && state.generatingApp === 'ctrip') {
                if (state.accessMode === 'authorized') {
                    // 🌟 授权模式：正规同步 UI
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f5f7fa] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#0086F6] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步携程订单...</span>
                        </div>
                    `;
                } else {
                    // 💀 黑客模式：蓝色骇客入侵 UI
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#0086F6] p-6 animate-in fade-in">
                            <i data-lucide="plane" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Accessing Ctrip databases...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Intercepting flight & hotel logs...</div>
                                <div class="typing-effect text-blue-800 font-bold mt-4" style="animation-delay: 1s">EXTRACTING ITINERARY [||||||||||||||||||  ] 96%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const ctNode = store.hackedData?.[targetCharId]?.ctrip;
                const ctData = ctNode ? ctNode.items : { upcoming: [], past: [] };
                const ctTime = ctNode ? new Date(ctNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';
                const isUpcoming = state.ctripTab === 'upcoming';
                const currentList = isUpcoming ? ctData.upcoming : ctData.past;

                contentHtml = `
                    <div class="absolute inset-0 bg-[#f5f7fa] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                        <div class="pt-12 pb-2 px-4 flex items-center bg-[#0086F6] text-white z-40 relative shadow-sm">
                            <div class="w-20"><div class="cursor-pointer active:opacity-50 flex items-center" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                            <div class="flex-1 flex flex-col items-center">
                                <span class="text-[17px] font-bold text-center">全部订单</span>
                                ${ctTime ? `<span class="text-[9px] text-white/70 font-medium mt-0.5 tracking-tighter">同步于 ${ctTime}</span>` : ''}
                            </div>
                            <div class="w-20 flex justify-end items-center space-x-3.5">
                                <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('ctrip', '${targetCharId}')"></i>
                                <i data-lucide="share" class="w-[18px] h-[18px] cursor-pointer active:scale-90 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.forwardCtrip()"></i>
                            </div>
                        </div>

                        <div class="flex bg-[#fff] border-b border-gray-200">
                            <div class="flex-1 py-3 text-center text-[15px] cursor-pointer transition-all ${isUpcoming ? 'text-[#0086F6] font-bold border-b-2 border-[#0086F6]' : 'text-gray-500'}" onclick="window.phoneActions.switchCtripTab('upcoming')">未出行</div>
                            <div class="flex-1 py-3 text-center text-[15px] cursor-pointer transition-all ${!isUpcoming ? 'text-[#0086F6] font-bold border-b-2 border-[#0086F6]' : 'text-gray-500'}" onclick="window.phoneActions.switchCtripTab('past')">已出行</div>
                        </div>

                        <div class="flex-1 overflow-y-auto px-3 pt-3 pb-6 hide-scrollbar">
                            ${currentList.map((item) => {
                                // 动态配置图标与标签
                                let iconName = 'navigation', tagColor = 'bg-blue-100 text-blue-600', tagText = '行程';
                                if (item.type === 'flight') { iconName = 'plane'; tagColor = 'bg-blue-100 text-blue-600'; tagText = '机票'; }
                                else if (item.type === 'train') { iconName = 'train'; tagColor = 'bg-indigo-100 text-indigo-600'; tagText = '火车票'; }
                                else if (item.type === 'hotel') { iconName = 'building'; tagColor = 'bg-amber-100 text-amber-600'; tagText = '酒店'; }
                                else if (item.type === 'show') { iconName = 'ticket'; tagColor = 'bg-rose-100 text-rose-600'; tagText = '演出'; }

                                return `
                                <div class="bg-[#fff] rounded-xl p-4 mb-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 relative group animate-in fade-in slide-in-from-bottom-2">
                                    <div class="flex justify-between items-center mb-3 pb-3 border-b border-gray-50">
                                        <div class="flex items-center space-x-2">
                                            <div class="${tagColor} px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider">${tagText}</div>
                                            <div class="text-[14px] font-bold text-gray-900">${item.name}</div>
                                        </div>
                                        <div class="text-[12px] font-bold ${isUpcoming ? 'text-[#0086F6]' : 'text-gray-400'}">${isUpcoming ? '待出行/待入住' : '已完成'}</div>
                                    </div>
                                    
                                    <div class="flex items-start mb-3">
                                        <div class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mr-3 shrink-0">
                                            <i data-lucide="${iconName}" class="w-4 h-4 text-gray-500"></i>
                                        </div>
                                        <div class="flex-1 overflow-hidden">
                                            <div class="text-[14px] font-bold text-gray-800 mb-1 leading-snug">${item.location}</div>
                                            <div class="text-[12px] text-gray-500 mb-1 flex items-center"><i data-lucide="clock" class="w-3 h-3 mr-1"></i>${item.time}</div>
                                            <div class="text-[12px] text-gray-500">明细：${item.details}</div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-[#f8fafc] p-2.5 rounded-lg border border-gray-100 mb-2">
                                        <span class="text-[12px] text-gray-500">出行/入住人：</span>
                                        <span class="text-[13px] font-black text-gray-800">${item.persons}</span>
                                    </div>

                                    ${!isUpcoming && item.review ? `
                                        <div class="mt-2 text-[12px] text-gray-600 bg-blue-50/50 p-2.5 rounded-lg border-l-2 border-[#0086F6] italic">
                                            <span class="font-bold text-[#0086F6] not-italic">点评：</span>${item.review}
                                        </div>
                                    ` : ''}
                                </div>
                            `}).join('')}
                            ${currentList.length === 0 ? `<div class="text-center text-gray-400 mt-20 text-[13px]">暂无相关订单</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        // 🔒 【私密文件夹视图 (深色模式)】
        else if (state.view === 'gallery') {
            if (state.isGenerating && state.generatingApp === 'gallery') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#000] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="scan-face" class="w-14 h-14 text-green-500 animate-pulse mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-300 tracking-wider">正在验证 Face ID...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-red-500 p-6 animate-in fade-in">
                            <i data-lucide="folder-lock" class="w-16 h-16 mb-6 animate-pulse opacity-80 text-red-600"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Bypassing Biometric Security...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Decrypting HiddenAlbum.sqlite...</div>
                                <div class="typing-effect text-red-400 font-bold mt-4" style="animation-delay: 1s">EXTRACTING MEDIA [||||||||||||||||||  ] 99%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const galNode = store.hackedData?.[targetCharId]?.gallery;
                const galData = galNode ? galNode.items : { photos: [], voices: [] };
                const galTime = galNode ? new Date(galNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';
                const isPhotos = state.galleryTab === 'photos';

                contentHtml = `
                    <div class="absolute inset-0 bg-[#000] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                        <div class="pt-12 pb-2 px-4 flex items-center bg-[#1c1c1e] text-white z-40 relative shadow-sm border-b border-white/10">
                            <div class="w-20"><div class="cursor-pointer active:opacity-50 flex items-center text-blue-500" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                            <div class="flex-1 flex flex-col items-center">
                                <span class="text-[17px] font-bold text-center flex items-center"><i data-lucide="lock" class="w-3.5 h-3.5 mr-1.5 opacity-60"></i>已隐藏</span>
                                ${galTime ? `<span class="text-[9px] text-gray-400 font-medium mt-0.5 tracking-tighter">验证于 ${galTime}</span>` : ''}
                            </div>
                            <div class="w-20 flex justify-end items-center space-x-3.5 text-blue-500">
                                <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('gallery', '${targetCharId}')"></i>
                                <i data-lucide="share" class="w-[18px] h-[18px] cursor-pointer active:scale-90 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.forwardGallery()"></i>
                            </div>
                        </div>

                        <div class="bg-[#1c1c1e] px-16 py-3 border-b border-white/5">
                            <div class="flex bg-[#2c2c2e] rounded-lg p-0.5">
                                <div class="flex-1 py-1.5 text-center text-[13px] rounded-md cursor-pointer transition-all ${isPhotos ? 'bg-[#636366] text-white font-bold shadow' : 'text-gray-400'}" onclick="window.phoneActions.switchGalleryTab('photos')">相片与视频</div>
                                <div class="flex-1 py-1.5 text-center text-[13px] rounded-md cursor-pointer transition-all ${!isPhotos ? 'bg-[#636366] text-white font-bold shadow' : 'text-gray-400'}" onclick="window.phoneActions.switchGalleryTab('voices')">语音备忘录</div>
                            </div>
                        </div>

                        <div class="flex-1 overflow-y-auto hide-scrollbar bg-black pb-6">
                            ${isPhotos ? `
                                <div class="grid grid-cols-3 gap-[2px]">
                                    ${galData.photos.map(p => `
                                        <div class="relative w-full aspect-square bg-[#1c1c1e] cursor-pointer select-none overflow-hidden group" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');">
                                            <div class="absolute inset-0 p-3 overflow-y-auto text-[12px] text-gray-200 leading-relaxed text-left bg-[#1c1c1e] hide-scrollbar border border-gray-800">
                                                <span class="font-bold text-gray-400 block mb-1.5 flex items-center"><i data-lucide="${p.isVideo ? 'video' : 'image'}" class="w-4 h-4 mr-1 text-blue-400"></i>${p.isVideo ? '视频内容' : '相片描述'}</span>
                                                ${p.desc}
                                            </div>
                                            <div class="img-overlay absolute inset-0 bg-[#2c2c2e] flex flex-col items-center justify-center text-gray-500 transition-opacity duration-300 z-10 border border-[#3a3a3c]">
                                                <i data-lucide="${p.isVideo ? 'play-circle' : 'image'}" class="w-10 h-10 mb-1.5 ${p.isVideo ? 'text-blue-400 opacity-80' : 'text-gray-400 opacity-50'}"></i>
                                                ${p.isVideo ? `<div class="absolute bottom-1 right-1.5 text-[10px] font-bold text-white opacity-90">${p.date.split(' ')[1] || '0:15'}</div>` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                ${galData.photos.length === 0 ? `<div class="text-center text-gray-500 mt-20 text-[13px]">相册为空</div>` : ''}
                            ` : `
                                    <div class="px-4 pt-4">
                                    ${galData.voices.map(v => `
                                        <div class="bg-[#1c1c1e] rounded-xl p-4 mb-3 border border-[#3a3a3c] cursor-pointer transition-colors active:bg-[#2c2c2e]" onclick="const detail = this.querySelector('.voice-detail'); detail.classList.toggle('hidden');">
                                            
                                            <div class="flex justify-between items-center mb-2.5">
                                                <div class="text-[16px] font-bold text-white">${v.title}</div>
                                                <div class="text-[12px] text-gray-500">${v.date}</div>
                                            </div>
                                            
                                            <div class="flex items-center mb-5">
                                                <div class="text-[12px] text-gray-400 font-mono w-10 shrink-0">${v.duration}</div>
                                                <div class="flex-1 mx-3 h-1.5 bg-[#3a3a3c] rounded-full relative">
                                                    <div class="absolute left-0 top-0 bottom-0 w-0 bg-gray-500 rounded-full"></div>
                                                </div>
                                                <div class="text-[12px] text-gray-500 font-mono w-10 shrink-0 text-right">-0:00</div>
                                            </div>
                                            
                                            <div class="flex justify-center items-center text-blue-500 mb-1" onclick="event.stopPropagation()">
                                                <div class="flex items-center space-x-12">
                                                    <div class="active:opacity-50 cursor-pointer flex items-center justify-center">
                                                        <i data-lucide="rotate-ccw" class="w-[22px] h-[22px]"></i>
                                                    </div>
                                                    <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center active:scale-95 cursor-pointer shadow-sm">
                                                        <i data-lucide="play" class="w-4 h-4 text-white ml-0.5"></i>
                                                    </div>
                                                    <div class="active:opacity-50 cursor-pointer flex items-center justify-center">
                                                        <i data-lucide="rotate-cw" class="w-[22px] h-[22px]"></i>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div class="voice-detail hidden mt-4 pt-3 border-t border-[#3a3a3c] cursor-default" onclick="event.stopPropagation()">
                                                <div class="text-[13px] text-gray-300 leading-relaxed bg-[#000] p-3.5 rounded-lg border border-[#2c2c2e]">
                                                    <span class="text-blue-400 font-bold mb-1 block"><i data-lucide="mic" class="w-3.5 h-3.5 inline mr-1"></i>录音转写：</span>
                                                    ${v.desc}
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                    ${galData.voices.length === 0 ? `<div class="text-center text-gray-500 mt-20 text-[13px]">无录音记录</div>` : ''}
                                </div>
                            `}
                        </div>
                    </div>
                `;
            }
        }
        // 🔞 【AV 网站视图 (黑橙深色模式)】
        else if (state.view === 'av') {
            if (state.isGenerating && state.generatingApp === 'av') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#121212] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#f97316] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在加载私密空间...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#f97316] p-6 animate-in fade-in">
                            <i data-lucide="flame" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Bypassing incognito mode...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Intercepting network traffic...</div>
                                <div class="typing-effect text-red-500 font-bold mt-4" style="animation-delay: 1s">EXTRACTING CONTENT [||||||||||||||||||  ] 99%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const avNode = store.hackedData?.[targetCharId]?.av;
                const avData = avNode ? avNode.items : { keywords: [], videos: [] };
                const avTime = avNode ? new Date(avNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

                contentHtml = `
                    <div class="absolute inset-0 bg-[#0a0a0a] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                        <div class="pt-12 pb-2 px-4 flex items-center bg-[#111111] text-white z-40 relative shadow-sm border-b border-gray-800">
                            <div class="w-20"><div class="cursor-pointer active:opacity-50 flex items-center text-gray-400" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                            <div class="flex-1 flex flex-col items-center">
                                <span class="text-[17px] font-black text-center tracking-wider"><span class="text-white">私密</span><span class="bg-[#f97316] text-black px-1.5 rounded ml-1">浏览</span></span>
                                ${avTime ? `<span class="text-[9px] text-gray-500 font-medium mt-0.5 tracking-tighter">同步于 ${avTime}</span>` : ''}
                            </div>
                            <div class="w-20 flex justify-end items-center space-x-3.5 text-gray-400">
                                <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-80 hover:opacity-100 hover:text-[#f97316] transition-all" onclick="window.phoneActions.refreshApp('av', '${targetCharId}')"></i>
                                <i data-lucide="share" class="w-[18px] h-[18px] cursor-pointer active:scale-90 opacity-80 hover:opacity-100 hover:text-[#f97316] transition-all" onclick="window.phoneActions.forwardAV()"></i>
                            </div>
                        </div>

                        <div class="flex-1 overflow-y-auto hide-scrollbar bg-[#0a0a0a] px-4 pt-5 pb-6">
                            
                            ${avData.keywords && avData.keywords.length > 0 ? `
                                <div class="mb-6">
                                    <div class="text-[12px] font-bold text-gray-500 mb-3 flex items-center uppercase tracking-widest"><i data-lucide="search" class="w-3.5 h-3.5 mr-1.5"></i>最近搜索 (History)</div>
                                    <div class="flex flex-wrap gap-2">
                                        ${avData.keywords.map(kw => `<div class="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f97316] px-3 py-1.5 rounded-md text-[13px] font-bold">${kw}</div>`).join('')}
                                    </div>
                                </div>
                            ` : ''}

                            <div class="text-[12px] font-bold text-gray-500 mb-3 flex items-center uppercase tracking-widest"><i data-lucide="eye" class="w-3.5 h-3.5 mr-1.5"></i>浏览记录 (Videos)</div>
                            
                            <div class="space-y-6">
                                ${avData.videos.map(v => {
                                    // 兼容旧数据，防止报错
                                    const vTitle = v.title || v.desc;
                                    const vContent = v.content || '一段不可描述的私密视频画面...';
                                    return `
                                    <div class="bg-[#111111] rounded-xl overflow-hidden border border-gray-800">
                                        
                                        <div class="relative w-full aspect-video bg-[#1a1a1a] cursor-pointer select-none group" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');">
                                            
                                            <div class="absolute inset-0 p-4 overflow-y-auto text-[13px] text-gray-300 leading-relaxed text-left bg-[#1a1a1a] hide-scrollbar border-b border-gray-800 flex items-center justify-center font-medium">
                                                ${vContent}
                                            </div>
                                            
                                            <div class="img-overlay absolute inset-0 bg-[#0f0f0f] flex flex-col items-center justify-center text-gray-500 transition-opacity duration-300 z-10">
                                                <div class="w-14 h-10 bg-[#f97316] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 opacity-90 group-hover:opacity-100 transition-opacity">
                                                    <i data-lucide="play" class="w-6 h-6 text-black ml-1"></i>
                                                </div>
                                                <div class="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[11px] font-bold text-white tracking-wide border border-white/10">${v.duration}</div>
                                                <div class="absolute bottom-2 left-2 text-[11px] font-bold text-gray-500 tracking-wide">${v.time}</div>
                                            </div>
                                        </div>
                                        
                                        <div class="p-3.5 bg-[#111111]">
                                            <div class="text-[14px] font-bold text-gray-200 mb-2.5 leading-snug">
                                                ${vTitle}
                                            </div>
                                            <div class="text-[13px] text-gray-300 leading-relaxed bg-[#1a1a1a] p-2.5 rounded border border-gray-800">
                                                <span class="text-[#f97316] font-bold mb-1 flex items-center"><i data-lucide="message-square" class="w-3.5 h-3.5 mr-1.5"></i>TA 的私密心理：</span>
                                                ${v.review}
                                            </div>
                                        </div>
                                    </div>
                                `}).join('')}
                                ${avData.videos.length === 0 ? `<div class="text-center text-gray-600 mt-10 text-[13px]">暂无浏览记录</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        // 🎵 【网易云音乐视图 (经典歌单风)】
        else if (state.view === 'netease') {
            if (state.isGenerating && state.generatingApp === 'netease') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#C20C0C] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步云端歌单...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#C20C0C] p-6 animate-in fade-in">
                            <i data-lucide="music" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Bypassing CloudMusic authentication...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Intercepting private_playlist.json...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1s">DUMPING MUSIC LOGS [||||||||||||||||||  ] 97%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const neNode = store.hackedData?.[targetCharId]?.netease;
                const neData = neNode ? neNode.items : [];
                const neTime = neNode ? new Date(neNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

                contentHtml = `
                    <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200 overflow-hidden">
                        <div class="pt-12 pb-2 px-4 flex items-center bg-[#C20C0C] text-white z-50 relative shadow-md">
                            <div class="w-20"><div class="cursor-pointer active:opacity-50 flex items-center" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                            <div class="flex-1 flex flex-col items-center overflow-hidden">
                                <span class="text-[17px] font-bold truncate w-full text-center">歌单详情</span>
                                ${neTime ? `<span class="text-[9px] text-white/60 font-medium mt-0.5 tracking-tighter">更新于 ${neTime}</span>` : ''}
                            </div>
                            <div class="w-20 flex justify-end items-center space-x-3.5">
                                <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('netease', '${targetCharId}')"></i>
                                <i data-lucide="share" class="w-[18px] h-[18px] cursor-pointer active:scale-90 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.forwardNetease()"></i>
                            </div>
                        </div>

                        <div class="bg-gradient-to-b from-[#C20C0C] to-[#8c0808] px-5 pt-6 pb-8 flex items-center text-white shrink-0">
                            <div class="w-28 h-28 bg-white/20 rounded-lg shadow-2xl flex items-center justify-center p-4 border border-white/10 relative overflow-hidden shrink-0">
                                <div class="absolute inset-0 bg-gradient-to-tr from-black/40 to-transparent"></div>
                                <i data-lucide="music" class="w-12 h-12 text-white/80"></i>
                            </div>
                            <div class="ml-5 flex-1">
                                <div class="text-[18px] font-bold leading-tight mb-2">我最喜欢的音乐</div>
                                <div class="flex items-center space-x-2 opacity-80 mb-4">
                                    <img src="${char.avatar}" class="w-6 h-6 rounded-full border border-white/20">
                                    <span class="text-[12px] font-medium">${char.name}</span>
                                    <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                                </div>
                                <div class="text-[11px] opacity-60 line-clamp-1">编辑简介：藏在耳机里的秘密...</div>
                            </div>
                        </div>

                        <div class="flex-1 overflow-y-auto bg-white rounded-t-[20px] -mt-4 relative z-10 px-1 pb-10 hide-scrollbar">
                            <div class="sticky top-0 bg-white py-3 px-4 flex items-center border-b border-gray-50 z-20">
                                <i data-lucide="play-circle" class="w-6 h-6 text-[#C20C0C] mr-3"></i>
                                <span class="text-[15px] font-bold text-gray-900">播放全部</span>
                                <span class="text-[12px] text-gray-400 ml-2">(${neData.length})</span>
                            </div>
                            
                            ${neData.map((s, idx) => `
                                <div class="px-4 py-4 border-b border-gray-50 active:bg-gray-50 transition-colors">
                                    <div class="flex items-center">
                                        <span class="w-6 text-[14px] text-gray-400 font-mono">${idx + 1}</span>
                                        <div class="flex-1 overflow-hidden ml-1">
                                            <div class="text-[16px] font-bold text-gray-900 truncate">${s.title}</div>
                                            <div class="text-[12px] text-gray-400 truncate mt-0.5">${s.artist} - ${s.album}</div>
                                        </div>
                                        <i data-lucide="more-vertical" class="w-5 h-5 text-gray-300"></i>
                                    </div>
                                    <div class="mt-3 bg-red-50/50 border-l-2 border-[#C20C0C] p-2.5 rounded-r-lg">
                                        <div class="text-[12px] text-[#C20C0C] font-bold mb-1 flex items-center">
                                            <i data-lucide="quote" class="w-3 h-3 mr-1"></i>私密乐评
                                        </div>
                                        <div class="text-[13px] text-gray-600 leading-relaxed italic font-medium">
                                            “${s.comment}”
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                            ${neData.length === 0 ? `<div class="text-center text-gray-400 mt-20 text-[13px]">暂无音乐记录</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        // 🔍 【浏览器搜索视图 (Safari与论坛风)】
        else if (state.view === 'search') {
            if (state.isGenerating && state.generatingApp === 'search') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f8f9fa] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-blue-500 animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步 Safari 数据...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-blue-500 p-6 animate-in fade-in">
                            <i data-lucide="compass" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Bypassing WebKit sandbox...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Decrypting History.db...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1s">EXTRACTING QUERIES [||||||||||||||||||  ] 93%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const sNode = store.hackedData?.[targetCharId]?.search;
                const sData = sNode ? sNode.items : [];
                const sTime = sNode ? new Date(sNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

                if (state.activeSearchIndex !== null && sData[state.activeSearchIndex]) {
                    // 🌟 详情页：沉浸式论坛吃瓜体验
                    const item = sData[state.activeSearchIndex];
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f4f5f7] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="pt-12 pb-2 px-4 flex items-center bg-[#fff] z-40 relative shadow-sm">
                                <div class="w-20"><div class="cursor-pointer active:opacity-50 text-blue-500 flex items-center" onclick="window.phoneActions.closeSearchDetail()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                                <div class="flex-1 flex flex-col items-center overflow-hidden"><span class="text-[15px] font-bold text-gray-900 truncate w-full text-center">网页浏览</span></div>
                                <div class="w-20 flex justify-end items-center text-blue-500">
                                    <i data-lucide="share" class="w-[20px] h-[20px] cursor-pointer active:scale-90 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.forwardSearch()"></i>
                                </div>
                            </div>

                            <div class="flex-1 overflow-y-auto hide-scrollbar">
                                <div class="bg-white px-5 pt-6 pb-5 mb-2 shadow-sm">
                                    <div class="text-[18px] font-black text-gray-900 mb-4 leading-snug">${item.forum.title}</div>
                                    <div class="flex items-center mb-4">
                                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 mr-2"><i data-lucide="user" class="w-4 h-4"></i></div>
                                        <div><div class="text-[13px] font-bold text-gray-800">匿名用户</div><div class="text-[11px] text-gray-400">题主 / 楼主</div></div>
                                    </div>
                                    <div class="text-[14px] text-gray-700 leading-relaxed">${item.forum.content}</div>
                                </div>

                                <div class="bg-white px-5 py-4 shadow-sm mb-4">
                                    <div class="text-[14px] font-bold text-gray-900 mb-4 flex items-center"><i data-lucide="message-circle" class="w-4 h-4 mr-1.5 text-gray-400"></i>网友评论</div>
                                    ${item.forum.comments.map(c => `
                                        <div class="mb-4 last:mb-0 pb-4 border-b border-gray-50 last:border-0">
                                            <div class="text-[12px] font-bold text-blue-600 mb-1">${c.author}</div>
                                            <div class="text-[13px] text-gray-600 leading-relaxed">${c.text}</div>
                                        </div>
                                    `).join('')}
                                </div>

                                <div class="mx-4 mb-6 relative">
                                    <div class="absolute -left-2 -top-3 text-[40px] text-red-100 italic font-serif z-0">"</div>
                                    <div class="bg-red-50/80 border border-red-100 rounded-xl p-4 relative z-10 shadow-sm">
                                        <div class="text-[12px] font-black text-red-500 mb-2 flex items-center">TA 的感悟</div>
                                        <div class="text-[14px] text-red-800 leading-relaxed font-medium italic">
                                            ${item.thought}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    // 🌟 列表页：Safari 搜索历史风
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in zoom-in-95 duration-200">
                            <div class="pt-12 pb-2 px-4 flex items-center bg-[#f8f9fa] z-40 relative border-b border-gray-200 shadow-sm">
                                <div class="w-20"><div class="cursor-pointer active:opacity-50 text-blue-500 flex items-center" onclick="window.phoneActions.backToDesktop()"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div></div>
                                <div class="flex-1 flex flex-col items-center overflow-hidden">
                                    <span class="text-[17px] font-bold text-gray-900 truncate w-full text-center">搜索历史</span>
                                    ${sTime ? `<span class="text-[9px] text-gray-400 font-medium mt-0.5 tracking-tighter">同步于 ${sTime}</span>` : ''}
                                </div>
                                <div class="w-20 flex justify-end items-center text-blue-500">
                                    <i data-lucide="refresh-cw" class="w-[18px] h-[18px] cursor-pointer active:rotate-180 opacity-80 hover:opacity-100 transition-all" onclick="window.phoneActions.refreshApp('search', '${targetCharId}')"></i>
                                </div>
                            </div>
                            
                            <div class="flex-1 overflow-y-auto bg-[#fff] hide-scrollbar pt-2" onscroll="window.phoneState.searchScrollTop = this.scrollTop" id="phone-search-scroll">
                                <div class="px-4 py-2 text-[12px] font-bold text-gray-400 uppercase tracking-widest">今天 (Today)</div>
                                <div class="border-t border-b border-gray-100">
                                    ${sData.map((s, idx) => `
                                        <div class="flex items-center px-4 py-3.5 bg-white border-b border-gray-100 last:border-0 cursor-pointer active:bg-gray-50 transition-colors group" onclick="window.phoneActions.openSearchDetail(${idx})">
                                            <i data-lucide="search" class="w-4 h-4 text-gray-400 mr-3 shrink-0"></i>
                                            <div class="flex-1 overflow-hidden">
                                                <div class="text-[15px] font-bold text-gray-800 truncate group-hover:text-blue-500 transition-colors">${s.query}</div>
                                            </div>
                                            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 ml-2"></i>
                                        </div>
                                    `).join('')}
                                </div>
                                <div class="text-center text-[12px] text-gray-400 font-medium mt-10 flex flex-col items-center">
                                    <i data-lucide="history" class="w-6 h-6 mb-2 opacity-50"></i>
                                    暂无更早记录
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
        }
        // 💬 【微信视图 (像素级克隆)】
        else if (state.view === 'wechat') {
            if (state.isGenerating && state.generatingApp === 'wechat') {
                if (state.accessMode === 'authorized') {
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#EDEDED] z-30 flex flex-col items-center justify-center animate-in fade-in">
                            <i data-lucide="loader" class="w-10 h-10 text-[#07C160] animate-spin mb-4"></i>
                            <span class="text-[14px] font-bold text-gray-400 tracking-wider">正在同步微信数据...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center font-mono text-[#07C160] p-6 animate-in fade-in">
                            <i data-lucide="message-circle" class="w-16 h-16 mb-6 animate-pulse opacity-80"></i>
                            <div class="w-full max-w-[80%] space-y-3 text-[13px] opacity-90 text-center">
                                <div class="typing-effect">> Bypassing Tencent MMKV...</div>
                                <div class="typing-effect" style="animation-delay: 0.5s">> Decrypting EnMicroMsg.db...</div>
                                <div class="typing-effect text-white font-bold mt-4" style="animation-delay: 1s">EXTRACTING CHATS [||||||||||||||||||  ] 92%</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                const wcNode = store.hackedData?.[targetCharId]?.wechat;
const wcTime = wcNode ? new Date(wcNode.timestamp).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';
                const wcData = wcNode ? wcNode.items : { fakeChats: [], fakeMoments: [], realMomentInteractions: [] };
                
                const { chat: myChat, boundP } = getQContext(targetCharId);
                const char = store.contacts.find(c => c.id === targetCharId);

                // 🌟 如果点进了某个聊天室 (完美复刻原生聊天室与特殊气泡 UI)
                if (state.activeWechatRoom) {
                    let displayMsgs = [];
                    let chatName = '';
                    let otherAvatar = '';
                    
                    // 🌟 身份反转魔法：在 TA 的手机里，TA 是右边的绿色气泡 (isMe: true)
                    if (state.activeWechatRoom === 'user') {
                        chatName = boundP.name;
                        otherAvatar = boundP.avatar;
                        // 提取真实记录，并反转 isMe
                        let rawMsgs = (myChat?.messages || []).filter(m => !m.isHidden).slice(-30).map(m => ({
                            ...m,
                            isMe: !m.isMe // 反转身份！
                        }));
                        // 过滤掉标记为离线的消息
    displayMsgs = rawMsgs.filter(m => !m.isOffline);
                    } else {
                        // 提取 AI 生成的假聊天记录
                        const fakeChat = wcData.fakeChats.find(c => c.id === state.activeWechatRoom);
                        if (fakeChat) {
                            chatName = fakeChat.name;
                            displayMsgs = (fakeChat.messages || []).map((m, idx) => ({
                                id: 'fake_' + idx,
                                text: m.text,
                                msgType: m.type || 'text',
                                isMe: m.isChar, // isChar 为 true 时是角色发的 (绿色)
                                sender: m.sender || '群友', // 🌟 把缺失的 sender 补回来！
                                isGroup: fakeChat.isGroup // 🌟 标记是否为群聊
                            }));
                        }
                    }

                    // 在 renderPhoneApp 函数内，wechat 视图的聊天室消息渲染部分
const messagesHtml = displayMsgs.map((msg) => {
    const isFromChar = msg.isMe; // isMe 为 true 就是右边的绿气泡
    
    // 🌟 修改点：根据是否是“与用户的单聊”来决定对方头像
    let avatar = char.avatar;
    if (!isFromChar) {
        if (msg.isGroup) {
            avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${msg.sender}&backgroundColor=e5e7eb`;
        } else {
            // ✅ 新增判定：如果当前打开的聊天室是“与用户的单聊”，则对方头像使用用户绑定的头像
            if (state.activeWechatRoom === 'user') {
                avatar = myChat?.myAvatar || boundP.avatar;   
            } else {
                avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${chatName}&backgroundColor=e5e7eb`;
            }
        }
    }
                        
                        let contentHtml = '', bubbleClass = '', bubbleStyle = '', maxWidthClass = 'max-w-[75%]';
                        
                        // 🌟 核心：群聊且不是自己发的消息，在气泡顶上显示名字！
                        const senderNameHtml = (msg.isGroup && !isFromChar) 
                            ? `<span class="text-[11px] font-bold text-gray-400 mb-0.5 ml-1 block">${msg.sender}</span>` : '';

                        if (msg.msgType === 'virtual_image') {
                            maxWidthClass = 'max-w-[70%]';
                            bubbleClass = 'mc-bubble-vimg rounded-xl shadow-sm overflow-hidden border border-gray-200'; 
                            contentHtml = `<div class="relative w-48 min-h-[12rem] bg-white cursor-pointer select-none"><div class="absolute inset-0 p-4 overflow-y-auto text-[13px] text-gray-700 leading-relaxed text-left bg-white"><span class="font-bold text-gray-400 block mb-1 flex items-center"><i data-lucide="image" class="mr-1 w-3.5 h-3.5"></i>照片内容：</span>${msg.text}</div></div>`;
                        } else if (msg.msgType === 'voice') {
                            bubbleClass = `mc-bubble-voice px-4 py-2.5 rounded-xl shadow-sm leading-relaxed overflow-hidden text-[15px] ${isFromChar ? 'bg-[#95ec69] text-black rounded-tr-sm' : 'bg-white text-black rounded-tl-sm'}`; 
                            contentHtml = `<div class="flex items-center space-x-3 ${isFromChar ? 'flex-row-reverse space-x-reverse' : ''}"><div class="flex items-center gap-[2px] ${isFromChar ? 'text-green-800' : 'text-gray-800'}"><div class="w-[2px] h-3 bg-current rounded-full"></div><div class="w-[2px] h-5 bg-current rounded-full"></div><div class="w-[2px] h-2 bg-current rounded-full"></div></div><span class="text-[13px] opacity-80">语音</span></div>`;
                            if (msg.text && msg.text !== '[特殊消息]') {
                                contentHtml += `<div class="mt-1.5 text-[12px] text-gray-500 pt-1 border-t ${isFromChar ? 'border-green-600/20' : 'border-gray-200'}">${msg.text}</div>`;
                            }
                        } else if (msg.msgType === 'html_card' || msg.msgType === 'invite_card' || msg.msgType === 'accept_card' || msg.msgType === 'anniversary_card') {
                            maxWidthClass = 'max-w-[85%]';
                            bubbleClass = 'mc-bubble-html bg-white rounded-[16px] shadow-sm border border-gray-100 overflow-hidden w-full flex flex-col';
                            contentHtml = `<div class="w-full p-4 mc-html-render-box relative text-[14px] text-gray-800 leading-relaxed">${msg.text}</div>`;
                        } else if (msg.msgType === 'transfer') {
                            maxWidthClass = ''; 
                            bubbleClass = 'mc-bubble-transfer w-[230px] h-[95px] rounded-xl shadow-sm overflow-hidden flex flex-col'; 
                            contentHtml = `
                              <div class="flex-1 flex items-center p-3.5 space-x-3 text-white bg-[#fbab66]">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center border border-white opacity-90"><i data-lucide="arrow-right-left" class="w-5 h-5"></i></div>
                                <div class="flex flex-col"><span class="text-[15px] font-bold">¥${msg.transferData?.amount || '0.00'}</span><span class="text-[11px] opacity-90 truncate">${msg.transferData?.note || '转账'}</span></div>
                              </div>
                              <div class="h-[26px] bg-white px-3 flex items-center justify-between text-[10px] text-gray-400 font-bold border-t border-gray-100">微信转账</div>
                            `;
                        } else if (msg.msgType === 'real_image') {
                            maxWidthClass = 'max-w-[40%]';
                            bubbleClass = 'mc-bubble-img bg-white p-1 rounded-xl shadow-sm border border-gray-100'; 
                            contentHtml = `<img src="${msg.imageUrl || msg.text}" class="w-full h-auto rounded-lg object-cover max-h-[200px]" alt="照片" />`;
                        } else if (msg.msgType === 'emoji') {
                            maxWidthClass = 'max-w-[25%]';
                            bubbleClass = 'bg-transparent shadow-none'; 
                            contentHtml = `<img src="${msg.imageUrl || msg.text}" class="w-full h-auto object-contain drop-shadow-md" />`;
                        } else {
                            bubbleClass = `mc-bubble-text px-4 py-2.5 rounded-xl shadow-sm leading-relaxed overflow-wrap break-words whitespace-pre-wrap text-[15px] ${isFromChar ? 'bg-[#95ec69] text-black rounded-tr-sm' : 'bg-white text-black rounded-tl-sm'}`;
                            contentHtml = msg.text || '[空白消息]';
                        }

                        return `
                        <div class="flex ${isFromChar ? 'flex-row-reverse' : 'flex-row'} items-start w-full mb-4">
                            <img src="${avatar}" class="w-10 h-10 rounded-[8px] shrink-0 border border-black/5 ${isFromChar ? 'ml-3' : 'mr-3'}" />
                            <div class="relative inline-flex flex-col ${isFromChar ? 'items-end' : 'items-start'} ${maxWidthClass}">
                                ${senderNameHtml}
                                <div class="${bubbleClass}" style="${bubbleStyle}">${contentHtml}</div>
                            </div>
                        </div>`;
                    }).join('');

                    // 🌟 渲染：原味顶栏 + 气泡列表 + 完美复刻的底栏！
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#f3f3f3] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="mc-topbar backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-10 sticky top-0 bg-gray-100/90">
                                <div class="mc-btn-back flex items-center cursor-pointer text-gray-800 w-1/4" onclick="window.phoneActions.closeWechatChat()">
                                    <i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i>
                                </div>
                                <span class="mc-title flex-1 font-bold text-gray-800 text-[17px] text-center truncate px-2">${chatName}</span>
                                <div class="mc-btn-more w-1/4 flex justify-end">
    <i data-lucide="share" class="text-gray-800 cursor-pointer active:scale-90" style="width: 22px; height: 22px;" onclick="window.phoneActions.forwardFakeChat()"></i>
</div>
                            </div>
                            
                            <div id="fake-chat-scroll" class="flex-1 overflow-y-auto p-4 hide-scrollbar">
                                ${messagesHtml || '<div class="text-center text-gray-400 mt-10 text-[12px]">暂无聊天记录</div>'}
                                <div class="h-4"></div>
                            </div>

                            <div class="mc-bottombar bg-gray-50 px-3 py-2 pb-6 border-t border-gray-200/60 z-20 relative">
                                <div class="flex items-center space-x-3 mb-2 px-1">
                                    <div class="flex-1 bg-white rounded-[20px] flex items-center border border-gray-200/60 px-2 py-0.5 shadow-sm">
                                        <input type="text" id="fake-wx-input" onkeydown="if(event.key==='Enter') window.phoneActions.sendFakeMessage()" class="mc-input flex-1 h-[38px] py-1.5 px-2 outline-none text-[15px] bg-transparent text-gray-800 placeholder-gray-400" placeholder="以 ${char.name} 的身份回复..." />
                                    </div>
                                    <button class="mc-btn-ai w-[40px] h-[40px] flex items-center justify-center bg-transparent rounded-full text-gray-500 active:scale-90 transition-transform flex-shrink-0" title="获取回复" onclick="window.phoneActions.getFakeReply()">
                                        <i data-lucide="sparkles" style="width: 25px; height: 25px;"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    // 🌟 主界面 (列表/朋友圈)
                    let pageContent = '';
                    
                    if (state.wechatTab === 'chats') {
                        // 1. 组装真实用户列表
                        const validMsgs = (myChat?.messages || []).filter(m => !m.isHidden);
                        let realPreview = '暂无消息';
                        let realTime = '刚刚';
                        if (validMsgs.length > 0) {
                            const rawText = validMsgs[validMsgs.length - 1].text || '';
                            realPreview = rawText.replace(/<[^>]+>/g, '').trim().split('\n')[0] || '[图片/卡片]';
                        }
                        
                        const realChatHtml = `
                            <div onclick="window.phoneActions.openWechatChat('user')" class="flex items-center px-4 py-3 border-b border-gray-100 bg-white cursor-pointer hover:bg-gray-50 active:bg-gray-100">
                                <div class="relative mr-3">
                                    <div class="w-12 h-12 bg-gray-100 rounded-[14px] flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl shadow-sm border border-gray-200/50">
                                        <img src="${myChat?.myAvatar || boundP.avatar}" class="w-full h-full object-cover">
                                    </div>
                                </div>
                                <div class="flex-1 overflow-hidden">
                                    <div class="flex justify-between items-center mb-1"><span class="font-bold text-gray-800 text-[16px]">${boundP.name}</span><span class="text-xs text-gray-500">${realTime}</span></div>
                                    <p class="text-sm text-gray-500 truncate">${realPreview}</p>
                                </div>
                            </div>
                        `;

                        // 2. 组装 AI 假列表 (预览对齐最后一条消息)
                        const fakeChatsHtml = wcData.fakeChats.map(c => {
                            // 🌟 自动获取最后一条消息作为预览，确保一致性
                            const lastMsg = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
                            const dynamicPreview = lastMsg ? (lastMsg.text || '[图片/语音]') : c.preview;
                            
                            const iconHtml = c.isGroup 
                                ? `<div class="w-full h-full bg-gray-200 text-gray-500 flex items-center justify-center"><i data-lucide="users" class="w-6 h-6"></i></div>`
                                : `<div class="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-400 font-bold flex items-center justify-center text-lg">${c.name.substring(0,1)}</div>`;
                            
                            return `
                            <div onclick="window.phoneActions.openWechatChat('${c.id}')" class="flex items-center px-4 py-3 border-b border-gray-100 bg-white cursor-pointer active:bg-gray-50">
                                <div class="relative mr-3">
                                    <div class="w-12 h-12 bg-gray-100 rounded-[8px] flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-200/50">${iconHtml}</div>
                                </div>
                                <div class="flex-1 overflow-hidden">
                                    <div class="flex justify-between items-center mb-1"><span class="font-bold text-gray-800 text-[16px]">${c.name}</span><span class="text-xs text-gray-400">${c.time}</span></div>
                                    <p class="text-sm text-gray-500 truncate">${dynamicPreview}</p>
                                </div>
                            </div>`;
                        }).join('');

                        pageContent = `<div class="flex-1 overflow-y-auto bg-white hide-scrollbar">${realChatHtml}${fakeChatsHtml}</div>`;
                    } 
                    else if (state.wechatTab === 'moments') {
                        // 1. 组装带 AI 评论的真实朋友圈
                        const realMoments = (store.moments || []).filter(m => m.senderId === targetCharId).slice(-3);
                        const realMomentsHtml = realMoments.map((m, idx) => {
                            const interactions = wcData.realMomentInteractions?.[idx] || { likes: [], comments: [] };
                            const hasLikes = interactions.likes && interactions.likes.length > 0;
                            const hasComments = interactions.comments && interactions.comments.length > 0;
                            let interactHtml = '';
                            if (hasLikes || hasComments) {
                                interactHtml = '<div class="bg-gray-50 mt-2.5 rounded-[6px] px-3 py-2 text-[13px] relative before:content-[\'\'] before:absolute before:bottom-full before:left-3 before:border-4 before:border-transparent before:border-b-[#f0f0f0]">';
                                if (hasLikes) interactHtml += `<div class="flex items-start text-[#576b95] font-medium ${hasComments?'border-b border-gray-300/50 pb-1.5 mb-1.5':''}"><i data-lucide="heart" class="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0"></i><span class="leading-relaxed">${interactions.likes.join(', ')}</span></div>`;
                                if (hasComments) interactHtml += interactions.comments.map(c => `<div class="py-0.5 leading-relaxed break-words"><span class="text-[#576b95] font-medium">${c.senderName}：</span><span class="text-gray-800">${c.text}</span></div>`).join('');
                                interactHtml += '</div>';
                            }
                            return `
                            <div class="flex items-start p-4 border-b border-gray-100/60 bg-white">
                                <div class="w-10 h-10 rounded-[8px] overflow-hidden bg-gray-100 flex-shrink-0 mr-3 shadow-sm border border-gray-100"><img src="${char.avatar}" class="w-full h-full object-cover"></div>
                                <div class="flex-1 min-w-0">
                                    <span class="text-[#576b95] font-medium text-[15px] mb-1 block">${char.name}</span>
                                    <span class="text-gray-800 text-[15px] leading-relaxed break-words whitespace-pre-wrap">${m.text || m.virtualImageText || '[分享了图片]'}</span>
                                    <div class="flex items-center justify-between mt-3 relative">
                                        <div class="text-[12px] text-gray-400">刚刚</div>
                                        <div class="bg-gray-100 rounded-[4px] px-2 py-0.5"><i data-lucide="more-horizontal" class="text-[#576b95] w-4 h-4"></i></div>
                                    </div>
                                    ${interactHtml}
                                </div>
                            </div>`;
                        }).join('');

                        // 2. 组装 AI 生成的假朋友圈
                        const fakeMomentsHtml = wcData.fakeMoments.map(m => {
                            const hasLikes = m.likes && m.likes.length > 0;
                            const hasComments = m.comments && m.comments.length > 0;
                            let interactHtml = '';
                            if (hasLikes || hasComments) {
                                interactHtml = '<div class="bg-gray-50 mt-2.5 rounded-[6px] px-3 py-2 text-[13px] relative before:content-[\'\'] before:absolute before:bottom-full before:left-3 before:border-4 before:border-transparent before:border-b-[#f0f0f0]">';
                                if (hasLikes) interactHtml += `<div class="flex items-start text-[#576b95] font-medium ${hasComments?'border-b border-gray-300/50 pb-1.5 mb-1.5':''}"><i data-lucide="heart" class="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0"></i><span class="leading-relaxed">${m.likes.join(', ')}</span></div>`;
                                if (hasComments) interactHtml += m.comments.map(c => `<div class="py-0.5 leading-relaxed break-words"><span class="text-[#576b95] font-medium">${c.senderName}：</span><span class="text-gray-800">${c.text}</span></div>`).join('');
                                interactHtml += '</div>';
                            }
                            return `
                            <div class="flex items-start p-4 border-b border-gray-100/60 bg-white">
                                <div class="w-10 h-10 rounded-[8px] overflow-hidden bg-gradient-to-br from-green-100 to-teal-100 text-teal-500 font-bold flex flex-shrink-0 items-center justify-center mr-3 shadow-sm border border-gray-100">${m.senderName.substring(0,1)}</div>
                                <div class="flex-1 min-w-0">
                                    <span class="text-[#576b95] font-medium text-[15px] mb-1 block">${m.senderName}</span>
                                    <span class="text-gray-800 text-[15px] leading-relaxed break-words whitespace-pre-wrap">${m.text}</span>
                                    <div class="flex items-center justify-between mt-3 relative">
                                        <div class="text-[12px] text-gray-400">${m.time}</div>
                                        <div class="bg-gray-100 rounded-[4px] px-2 py-0.5"><i data-lucide="more-horizontal" class="text-[#576b95] w-4 h-4"></i></div>
                                    </div>
                                    ${interactHtml}
                                </div>
                            </div>`;
                        }).join('');

                        pageContent = `
                            <div class="flex-1 overflow-y-auto bg-white hide-scrollbar pb-10">
                                <div class="relative h-60 bg-gray-200 flex items-center justify-center overflow-visible">
                                    <img src="${char.momentBg || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80'}" class="w-full h-full object-cover" />
                                    <div class="absolute inset-x-0 bottom-[-20px] flex justify-end items-end px-4">
                                        <span class="text-white font-bold text-[20px] mr-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] pb-6">${char.name}</span>
                                        <div class="w-16 h-16 rounded-[12px] overflow-hidden border-2 border-white shadow-md bg-white flex items-center justify-center z-10"><img src="${char.avatar}" class="w-full h-full object-cover" /></div>
                                    </div>
                                </div>
                                <div class="h-10 bg-white"></div>
                                <div class="flex flex-col">${realMomentsHtml}${fakeMomentsHtml}</div>
                            </div>
                        `;
                    }

                    // 🌟 完美复刻原生的顶栏与底栏
                    contentHtml = `
                        <div class="absolute inset-0 bg-white z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200 z-10 sticky top-0 bg-[rgba(243,244,246,0.9)]">
                                <div class="text-gray-800 cursor-pointer w-1/4 active:opacity-50 transition-opacity" onclick="window.phoneActions.backToDesktop()">
                                    <i data-lucide="chevron-left" style="width: 28px; height: 28px;"></i>
                                </div>
                                <div class="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
    <span class="font-bold text-gray-800 text-[17px] tracking-wide">${state.wechatTab === 'chats' ? '微信' : '朋友圈'}</span>
    ${wcTime ? `<span class="text-[9px] text-gray-400 font-medium tracking-tighter mt-0.5">同步于 ${wcTime}</span>` : ''}
</div>
                                <div class="w-1/4 flex justify-end space-x-3 text-gray-800">
                                    <i data-lucide="refresh-cw" class="cursor-pointer active:scale-90 transition-transform opacity-60 hover:opacity-100" style="width: 20px; height: 20px;" onclick="window.phoneActions.refreshApp('wechat', '${targetCharId}')"></i>
                                </div>
                            </div>

                            ${pageContent}

                            <div class="backdrop-blur-md border-t border-gray-200 flex items-center justify-around pb-6 pt-2 z-10 bg-[rgba(249,250,251,0.9)]">
                                <div onclick="window.phoneActions.switchWechatTab('chats')" class="flex flex-col items-center space-y-1 cursor-pointer w-16 ${state.wechatTab === 'chats' ? 'text-[#07c160]' : 'text-gray-500'}">
                                    <i data-lucide="message-circle" class="${state.wechatTab === 'chats' ? 'fill-current' : ''}" style="width: 24px; height: 24px;"></i>
                                    <span class="text-[10px] font-bold">微信</span>
                                </div>
                                <div onclick="window.phoneActions.switchWechatTab('moments')" class="flex flex-col items-center space-y-1 cursor-pointer w-16 ${state.wechatTab === 'moments' ? 'text-[#07c160]' : 'text-gray-500'}">
                                    <i data-lucide="aperture" style="width: 24px; height: 24px;"></i>
                                    <span class="text-[10px] font-bold">发现</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        if (state.view === 'memo' && state.activeMemoIndex === null) {
            setTimeout(() => { const el = document.getElementById('phone-memo-scroll'); if (el && state.memoScrollTop) el.scrollTop = state.memoScrollTop; }, 0);
        }
    }

    // 🌟 核心防御：独立的语义化 ID + 全局防线 + 黑客动画引擎注入
    return `
        <div id="cyber-phone-screen" class="w-full h-full relative overflow-hidden animate-in fade-in duration-300 select-none" style="background-color: #000 !important; background-image: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;">
            ${bgHtml}
            <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-0 pointer-events-none"></div>
            ${contentHtml}
            <style>
                .typing-effect { overflow: hidden; white-space: nowrap; width: 0; animation: typing 1s steps(30, end) forwards; }
                @keyframes typing { from { width: 0 } to { width: 100% } }
            </style>
        </div>
    `;
}