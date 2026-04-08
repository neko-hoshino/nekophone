// js/apps/blogger.js
import { store } from '../store.js';

if (!window.bloggerState) {
    window.bloggerState = {
        view: 'account_select', 
        showCreateModal: false, 
        currentAccountId: null,
        currentTab: 'profile',
        showPublishMenu: false,
        showCreatePostModal: false,
        isGeneratingPost: false,
        postData: { content: '', mediaDesc: '', showcaseProduct: null, topics: [] },
        expandedPosts: {},
        isFetchingComments: false,
        showSettingsModal: false,
        settingsTemp: { platformStyle: '', positioning: '', mountedWbs: [] },
        isGeneratingStudio: false,
        showShowcaseModal: false,
        showProductSelector: false,
        // 🌟 新增私信与提问箱状态
        showInboxModal: false,
        inboxChatId: null,
        showQAModal: false,
        isFetchingInbox: false,
        isFetchingQA: false,
        qaDrafts: {} 
    };
}

// ==========================================
// 🌟 辅助引擎：账号等级与财务计算器 
// ==========================================
const bloggerUtils = {
    calcLevel: (followers) => {
        let major = 0, rank = 1;
        const levels = ['萌新', '新星', '达人', '大V', '顶流'];
        if (followers < 1000) { major = 0; rank = Math.max(1, Math.ceil(followers / 100)); }
        else if (followers < 10000) { major = 1; rank = Math.max(1, Math.ceil(followers / 1000)); }
        else if (followers < 100000) { major = 2; rank = Math.max(1, Math.ceil(followers / 10000)); }
        else if (followers < 1000000) { major = 3; rank = Math.max(1, Math.ceil(followers / 100000)); }
        else { major = 4; rank = Math.max(1, Math.min(10, Math.ceil(followers / 1000000))); }
        return { name: levels[major], rank: rank, index: major };
    },
    calcIncome: (acc) => {
        const flow = (acc.totalLikes || 0) * 0.01;
        let shop = 0;
        if(acc.showcase) acc.showcase.forEach(p => shop += (p.sales || 0) * (p.commission || 0));
        const live = acc.followers * 0.1;
        const extra = acc.extraIncome || 0; 
        return { flow: flow.toFixed(2), shop: shop.toFixed(2), live: live.toFixed(2), total: (flow + shop + live + extra).toFixed(2) };
    }
};

async function buildBloggerPrompt(acc, char, chat, boundP, options = {}) {
    const { recentText = '', task = '' } = options;
    const now = new Date();
    const timeString = now.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const globalP = store.globalPrompt ? `\n【通用人设】\n${store.globalPrompt}` : '';
    const boundPrompt = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';
    const basePrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【用户】\n化名：${boundP.name}${globalP}${boundPrompt}`;
    const coreMem = (store.memories || []).filter(m => m.charId === char.id && m.type === 'core').map(m=>m.content).join('；');
    const coreMemStr = coreMem ? `\n\n【核心记忆】\n${coreMem}` : '';
    let fragMemStr = '';
    if (recentText) {
        const frags = (store.memories || []).filter(m => m.charId === char.id && m.type === 'fragment').filter(m => {
            const kws = (m.keywords || '').split(',').map(k=>k.trim()).filter(k=>k);
            return kws.some(k => recentText.includes(k));
        }).map(m=>m.content).join('；');
        if (frags) fragMemStr = `\n\n【触发的回忆】\n${frags}`;
    }
    let historyStr = '';
    if (chat && chat.messages) {
        const recentMsgs = chat.messages.filter(m => m.msgType === 'text').slice(-60);
        if (recentMsgs.length > 0) historyStr = `\n\n【近期聊天参考】\n` + recentMsgs.map(m => `[${m.sender}]: ${m.text}`).join('\n');
    }
    const platformStyle = acc.platformStyle || '普通社交平台';
    const positioning = acc.positioning || '生活记录';
    let wbStr = '';
    const activeWbs = (store.worldbooks || []).filter(wb => wb.enabled && (wb.type === 'global' || (wb.type === 'local' && acc.mountedWbs?.some(x => String(x) === String(wb.id)))));
    if (activeWbs.length > 0) wbStr = `\n\n【世界观设定】\n` + activeWbs.map(wb => `[${wb.title}]: ${wb.content}`).join('\n');
    const styleRule = `\n【核心铁律】：行文风格需契合角色人设和性格。严禁使用任何 Emoji ！`;
    return `${basePrompt}${coreMemStr}${wbStr}${fragMemStr}${historyStr}\n\n【时间】：${timeString}\n【平台风控】：${platformStyle}\n【账号定位】：${positioning}${styleRule}\n\n【系统任务】\n${task}`;
}

if (!window.bloggerActions) {
    window.bloggerActions = {
        openCreateModal: () => { window.bloggerState.showCreateModal = true; window.render(); },
        closeCreateModal: () => { window.bloggerState.showCreateModal = false; window.render(); },
        sendSyncInvite: (charId) => {
            const chat = store.chats.find(c => c.charId === charId);
            const char = store.contacts.find(c => c.id === charId);
            if (store.syncAccounts?.find(a => a.charId === charId)) return window.actions.showToast('已经有共同账号啦！');
            if (chat && char) {
                const pId = chat.isGroup ? chat.boundPersonaId : (char?.boundPersonaId || store.personas[0].id);
                const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
                chat.messages.push({
                    id: Date.now(), sender: boundPersona.name, isMe: true, msgType: 'sync_invite_card',
                    text: '[Sync博主共创邀请]', timestamp: Date.now(), time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})
                });
                if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(charId, "(系统指令：用户向你发送了[Sync]情侣博主账号的共同运营邀请函。这是一款类似小红书的社交软件。请回复[接受Sync邀请]，并表达我们要一起狂秀恩爱、成为大博主的期待！[接受Sync邀请]须单独成行。)");
                window.actions?.showToast('邀请已发送');
            }
            window.bloggerState.showCreateModal = false; window.render();
        },
        enterAccount: (accId) => { window.bloggerState.currentAccountId = accId; window.bloggerState.view = 'dashboard'; window.bloggerState.currentTab = 'profile'; window.render(); },
        goBack: () => { if (window.bloggerState.view === 'dashboard') { window.bloggerState.view = 'account_select'; window.bloggerState.currentAccountId = null; window.render(); } else { window.actions.setCurrentApp(null); } },
        switchTab: (tab) => { window.bloggerState.currentTab = tab; window.render(); },
        updateProfile: (accId, field, value) => { const acc = store.syncAccounts.find(a => a.id === accId); if (acc) { acc[field] = value.trim(); if (window.actions?.saveStore) window.actions.saveStore(); } },

        openShowcase: () => { window.bloggerState.showShowcaseModal = true; window.render(); },
        closeShowcase: () => { window.bloggerState.showShowcaseModal = false; window.render(); },
        deleteShowcaseItem: (prodId) => {
            if(!confirm("确定要下架该商品吗？")) return;
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            if(acc && acc.showcase) {
                acc.showcase = acc.showcase.filter(p => p.id !== prodId);
                if(window.bloggerState.postData.showcaseProduct?.id === prodId) window.bloggerState.postData.showcaseProduct = null;
                if (window.actions.saveStore) window.actions.saveStore(); window.render();
            }
        },
        openProductSelector: () => {
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            if(!acc?.showcase || acc.showcase.length === 0) return window.actions?.showToast("橱窗空空如也，请先去后台接取商单");
            window.bloggerState.showProductSelector = true; window.render();
        },
        closeProductSelector: () => { window.bloggerState.showProductSelector = false; window.render(); },
        selectProduct: (prodId) => {
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            const prod = acc.showcase?.find(p => p.id === prodId);
            window.bloggerState.postData.showcaseProduct = prod || null;
            window.bloggerState.showProductSelector = false; window.render();
        },

        acceptCommercial: () => {
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            if (acc && acc.studioData && acc.studioData.commercial) {
                acc.studioData.commercial.status = 'accepted';
                acc.showcase = acc.showcase || [];
                const price = Math.floor(Math.random() * 300 + 50); 
                const commission = Math.floor(price * (Math.random() * 0.2 + 0.1)); 
                acc.showcase.unshift({
                    id: 'prod_' + Date.now(),
                    name: acc.studioData.commercial.product,
                    specs: '精选规格',
                    price: price,
                    commission: commission,
                    sales: 0
                });
                if (window.actions.saveStore) window.actions.saveStore(); window.render();
                if (window.actions?.showToast) window.actions.showToast('✅ 商单已接取！商品已自动上架【个人橱窗】');
            }
        },

        openSettings: () => {
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            if (acc) {
                window.bloggerState.settingsTemp = { platformStyle: acc.platformStyle || '', positioning: acc.positioning || '', mountedWbs: acc.mountedWbs || [] };
                window.bloggerState.showSettingsModal = true; window.render();
            }
        },
        closeSettings: () => { window.bloggerState.showSettingsModal = false; window.render(); },
        updateSettingsTemp: (field, value) => { window.bloggerState.settingsTemp[field] = value; },
        toggleSettingsWb: (id) => {
            let wbs = window.bloggerState.settingsTemp.mountedWbs || [];
            if (wbs.some(x => String(x) === String(id))) window.bloggerState.settingsTemp.mountedWbs = wbs.filter(x => String(x) !== String(id));
            else { const target = store.worldbooks.find(w => String(w.id) === String(id)); if (target) window.bloggerState.settingsTemp.mountedWbs.push(target.id); }
            window.render();
        },
        saveSettings: () => {
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            if (acc) {
                acc.platformStyle = window.bloggerState.settingsTemp.platformStyle;
                acc.positioning = window.bloggerState.settingsTemp.positioning;
                acc.mountedWbs = [...window.bloggerState.settingsTemp.mountedWbs];
                if (window.actions.saveStore) window.actions.saveStore();
                window.actions.showToast('设置已保存');
            }
            window.bloggerState.showSettingsModal = false; window.render();
        },

        openPublishMenu: () => { window.bloggerState.showPublishMenu = true; window.render(); },
        closePublishMenu: () => { window.bloggerState.showPublishMenu = false; window.render(); },
        openCreatePost: () => { window.bloggerState.showPublishMenu = false; window.bloggerState.showCreatePostModal = true; window.bloggerState.postData = { content: '', mediaDesc: '', showcaseProduct: null, topics: [] }; window.render(); },
        closeCreatePost: () => { window.bloggerState.showCreatePostModal = false; window.render(); },
        updatePostField: (field, value) => { window.bloggerState.postData[field] = value; },
        addTopic: () => { const t = prompt("话题："); if (t) { window.bloggerState.postData.topics.push(t.trim()); window.render(); } },
        removeTopic: (i) => { window.bloggerState.postData.topics.splice(i, 1); window.render(); },
        openLive: () => { window.actions.showToast('直播功能调试中...'); window.bloggerState.showPublishMenu = false; window.render(); },

        generatePostContent: async () => {
            const state = window.bloggerState;
            if (state.isGeneratingPost || !store.apiConfig?.apiKey) return window.actions.showToast('⚠️ 请先配置 API！');
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            const char = store.contacts.find(c => c.id === acc.charId);
            const chat = store.chats.find(c => c.charId === acc.charId);
            const boundP = store.personas.find(p => p.id === (chat?.isGroup ? chat.boundPersonaId : char?.boundPersonaId)) || store.personas[0];
            state.isGeneratingPost = true; window.render();
            try {
                const currentDraft = state.postData.content.replace(/<[^>]+>/g, '').trim();
                const draftMedia = state.postData.mediaDesc.trim();
                const task = `请协助完成一篇社交图文的创作。
【草稿状态】
画面: ${draftMedia || '(空，请构思符合角色设定的画面描述)'}
正文: ${currentDraft || '(空，请基于近期经历与回忆，以角色口吻进行创作)'}
【要求】
1. 内容需贴合当前平台定位。
2. 正文必须控制在 80 字以内，精简、克制、有留白感！绝不要长篇大论！
3. 严格输出 JSON 格式：{"mediaDesc": "画面描述", "content_addon": "补充的正文内容"}`;
                const promptStr = await buildBloggerPrompt(acc, char, chat, boundP, { recentText: currentDraft, task: task });
                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const data = await res.json();
                let text = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json|```/gi, '').trim();
                let json = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
                if (json.mediaDesc && !state.postData.mediaDesc) state.postData.mediaDesc = json.mediaDesc;
                if (json.content_addon) state.postData.content += (state.postData.content ? '<br>' : '') + `<span class="text-gray-500">${json.content_addon}</span>`;
            } catch (e) { console.error(e); window.actions.showToast('生成失败'); } finally { state.isGeneratingPost = false; window.render(); }
        },

        publishPost: () => {
            const state = window.bloggerState;
            const pure = state.postData.content.replace(/<[^>]+>/g, '').trim();
            if (!state.postData.mediaDesc || !pure) return window.actions.showToast('请填写完整');
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            if (acc) {
                let virality = Math.random() * 0.5 + 0.8;
                
                if (acc.studioData?.activity?.topic && state.postData.topics.includes(acc.studioData.activity.topic)) {
                    virality *= 1.5;
                    acc.studioData.activity.status = 'completed'; // 🌟 标记完成
                    setTimeout(() => window.actions?.showToast(`成功带话题参与活动，流量加成 1.5 倍！`), 500);
                }

                if (acc.studioData?.commercial?.status === 'accepted' && state.postData.showcaseProduct && state.postData.showcaseProduct.name === acc.studioData.commercial.product) {
                    acc.extraIncome = (acc.extraIncome || 0) + (acc.studioData.commercial.payout || 0);
                    acc.studioData.commercial.status = 'completed';
                    setTimeout(() => window.actions?.showToast(`商单完成！基础酬金 ￥${acc.studioData.commercial.payout} 已入账！`), 1500);
                }

                if (state.postData.showcaseProduct) {
                    const prod = acc.showcase.find(p => p.id === state.postData.showcaseProduct.id);
                    if (prod) {
                        const newSales = Math.floor(acc.followers * 0.005 * virality) + Math.floor(Math.random() * 10);
                        prod.sales = (prod.sales || 0) + newSales;
                    }
                }

                const likes = Math.floor(acc.followers * 0.1 * virality + 10);
                const commentsCount = Math.floor(likes * (Math.random() * 0.15 + 0.05));
                
                acc.followers += Math.floor(likes * 0.15);
                acc.totalLikes = (acc.totalLikes || 0) + likes;
                acc.posts = acc.posts || [];
                
                const newPost = { 
                    id: 'post_' + Date.now(), 
                    desc: pure, 
                    htmlContent: state.postData.content, 
                    mediaDesc: state.postData.mediaDesc, 
                    showcaseProduct: state.postData.showcaseProduct, 
                    topics: state.postData.topics || [],
                    stats: { likes, commentsCount, saves: Math.floor(likes/4), shares: Math.floor(likes/10) }, 
                    comments: [], 
                    hasFetchedComments: false 
                };
                acc.posts.unshift(newPost);

                if (acc.posts.length > 1) {
                    const prevPost = acc.posts[1];
                    const boostLikes = Math.floor(likes * 0.05) + 1;
                    const boostComments = Math.floor(commentsCount * 0.05) + 1;
                    prevPost.stats.likes += boostLikes;
                    prevPost.stats.commentsCount += boostComments;
                    acc.totalLikes += boostLikes;
                }

                if (window.actions.saveStore) window.actions.saveStore();
            }
            state.showCreatePostModal = false; window.render();
        },

        togglePostDetail: (postId) => {
            const state = window.bloggerState;
            state.expandedPosts[postId] = !state.expandedPosts[postId];
            if (state.expandedPosts[postId]) {
                const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
                const post = acc?.posts?.find(p => p.id === postId);
                if (post && !post.hasFetchedComments) window.bloggerActions.fetchComments(postId, false);
            }
            window.render();
        },

        fetchComments: async (postId, isLoadMore = false) => {
            const state = window.bloggerState;
            if (state.isFetchingComments || !store.apiConfig?.apiKey) return;
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            const post = acc?.posts?.find(p => p.id === postId);
            state.isFetchingComments = true; window.render();
            try {
                let context = "";
                if (isLoadMore) context = "\n已有评论参考：\n" + post.comments.slice(-10).map(c => `[${c.author}]: ${c.content}`).join('\n');
                const task = `请根据以下帖子生成评论。
帖子标题: "${post.title}" | 正文: "${post.desc}"

【要求】
1. 生成 10 条多样化的野生网友评论，展现真实的互联网生态。
2. 评论态度必须混合：嗑CP的狂欢、真诚的羡慕、酸言酸语(judge)、拉踩对比、无厘头玩梗或求同款等。
3. 不要头像，严禁使用任何 Emoji！
4. 严格输出 JSON 数组格式：
[
  { "author": "网名", "content": "评论内容" }
]`;
                const char = store.contacts.find(c => c.id === acc.charId);
                const promptStr = await buildBloggerPrompt(acc, char, null, store.personas[0], { task: task + context });
                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const data = await res.json();
                let text = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json|```/gi, '').trim();
                let cms = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
                
                const maxLikes = Math.max(10, Math.floor(post.stats.likes * 2));
                const newCms = cms.map(c => ({ 
                    id: 'cmt_'+Math.random().toString(36).substr(2,9), 
                    author: c.author, 
                    content: c.content, 
                    likes: Math.floor(Math.random() * maxLikes),
                    replies: [] 
                })).sort((a,b) => b.likes - a.likes);

                post.comments = isLoadMore ? [...post.comments, ...newCms] : newCms;
                post.hasFetchedComments = true;
                post.stats.commentsCount = Math.max(post.stats.commentsCount, post.comments.length + Math.floor(Math.random()*20));
                if (window.actions.saveStore) window.actions.saveStore();
            } catch (e) { console.error(e); } finally { state.isFetchingComments = false; window.render(); }
        },

        replyToComment: async (postId, commentId) => {
            const text = prompt("回复该网友：");
            if (!text) return;
            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            const post = acc?.posts?.find(p => p.id === postId);
            const comment = post?.comments?.find(c => c.id === commentId);
            if (comment) {
                const char = store.contacts.find(c => c.id === acc.charId);
                const chat = store.chats.find(c => c.id === acc.charId);
                const boundP = store.personas.find(p => p.id === (chat?.isGroup ? chat.boundPersonaId : char?.boundPersonaId)) || store.personas[0];
                
                comment.replies.push({ author: acc.name, content: text, isAuthor: true });
                comment.isWaitingReply = true;
                
                post.stats.commentsCount += 1;
                const boostLikes = Math.floor(Math.random() * 5) + 1;
                post.stats.likes += boostLikes;
                acc.totalLikes += boostLikes;
                acc.followers += 2;
                if(post.showcaseProduct) {
                    const prod = acc.showcase?.find(p => p.id === post.showcaseProduct.id);
                    if(prod) prod.sales += 1;
                }
                window.render();

                if (store.apiConfig?.apiKey) {
                    try {
                        const task = `你是网友 [${comment.author}]。你之前的评论是：“${comment.content}”。
博主（网名：${acc.name}）刚刚亲自回复了你：“${text}”。
请基于你的网民性格，写一条简短的追评（惊叹被翻牌了/继续争论/开心互动等）。严禁Emoji。直接输出文字，不要前缀。`;
                        const promptStr = await buildBloggerPrompt(acc, char, null, store.personas[0], { task });
                        const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                            body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                        });
                        const data = await res.json();
                        const reaction = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
                        if (reaction) comment.replies.push({ author: comment.author, content: reaction });
                    } catch(e) { console.error(e); }
                }
                
                comment.isWaitingReply = false;
                if (window.actions.saveStore) window.actions.saveStore();
                window.render();
            }
        },

        deletePost: (postId) => {
            if (confirm("删除记忆？")) {
                const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
                acc.posts = acc.posts.filter(p => p.id !== postId);
                if (window.actions.saveStore) window.actions.saveStore(); window.render();
            }
        },
        // --- 🌟 提问箱逻辑 ---
        openQA: () => { window.bloggerState.showQAModal = true; window.bloggerState.qaDrafts = {}; window.render(); if (!(store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId)?.qaBox?.length > 0)) window.bloggerActions.fetchQA(); },
        closeQA: () => { window.bloggerState.showQAModal = false; window.render(); },
        updateQADraft: (id, val) => { window.bloggerState.qaDrafts[id] = val; },
        fetchQA: async () => {
            const state = window.bloggerState;
            if (state.isFetchingQA || !store.apiConfig?.apiKey) return;
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            state.isFetchingQA = true; window.render();
            try {
                const char = store.contacts.find(c => c.id === acc.charId);
                const recent = (acc.posts||[]).slice(0,10).map(p => p.desc).join('；');
                const task = `结合近期动态[${recent}]，生成5条匿名提问。2条由【${char.name}】亲自回答，3条留空等待用户回答。严禁Emoji。输出JSON数组：[{"question":"问题","answeredByPartner":"回答内容(若无请留空)"}]`;
                const promptStr = await buildBloggerPrompt(acc, char, null, store.personas[0], { task });
                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] }) });
                const text = (await res.json()).choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json|```/gi, '').trim();
                const cms = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
                acc.qaBox = acc.qaBox || []; acc.posts = acc.posts || [];
                cms.forEach(q => {
                    if (q.answeredByPartner && q.answeredByPartner.trim() !== '') {
                        const likes = Math.floor(acc.followers * 0.05 + 10);
                        acc.totalLikes += likes;
                        acc.posts.unshift({ id: 'post_' + Date.now() + Math.random(), desc: `回答了匿名提问：${q.question}`, htmlContent: `<div class="bg-gray-100 p-3 rounded mb-2"><span class="font-bold text-gray-900">匿名提问: </span><span class="text-gray-700">${q.question}</span></div><div class="text-gray-800">${q.answeredByPartner}</div>`, mediaDesc: null, showcaseProduct: null, topics: [], stats: { likes, commentsCount: Math.floor(likes*0.1), saves: 0, shares: 0 }, comments: [], hasFetchedComments: false });
                    } else acc.qaBox.push({ id: 'qa_' + Date.now() + Math.random(), question: q.question });
                });
                if (window.actions.saveStore) window.actions.saveStore();
            } catch(e) {} finally { state.isFetchingQA = false; window.render(); }
        },
        answerQA: (id) => {
            const state = window.bloggerState;
            const ans = state.qaDrafts[id];
            if(!ans) return window.actions?.showToast('请填写回答');
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            const q = acc.qaBox.find(x => x.id === id);
            const likes = Math.floor(acc.followers * 0.08 + 10);
            acc.totalLikes += likes;
            acc.posts.unshift({ id: 'post_' + Date.now(), desc: `回答了匿名提问：${q.question}`, htmlContent: `<div class="bg-gray-100 p-3 rounded mb-2"><span class="font-bold text-gray-900">匿名提问: </span><span class="text-gray-700">${q.question}</span></div><div class="text-gray-800">${ans.replace(/\n/g, '<br>')}</div>`, mediaDesc: null, showcaseProduct: null, topics: [], stats: { likes, commentsCount: Math.floor(likes*0.1), saves: 0, shares: 0 }, comments: [], hasFetchedComments: false });
            acc.qaBox = acc.qaBox.filter(x => x.id !== id);
            if (window.actions.saveStore) window.actions.saveStore(); window.render(); window.actions?.showToast('✅ 回答已发布到主页');
        },
        
        // --- 🌟 私信逻辑 ---
        openInbox: () => { window.bloggerState.showInboxModal = true; window.render(); if (!(store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId)?.inbox?.length > 0)) window.bloggerActions.fetchInbox(); },
        closeInbox: () => { window.bloggerState.showInboxModal = false; window.bloggerState.inboxChatId = null; window.render(); },
        openInboxChat: (id) => { window.bloggerState.inboxChatId = id; window.render(); },
        closeInboxChat: () => { window.bloggerState.inboxChatId = null; window.render(); },
        fetchInbox: async () => {
            const state = window.bloggerState;
            if (state.isFetchingInbox || !store.apiConfig?.apiKey) return;
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            state.isFetchingInbox = true; window.render();
            try {
                const char = store.contacts.find(c => c.id === acc.charId);
                const recent = (acc.posts||[]).slice(0,10).map(p => p.desc).join('；');
                const task = `结合近期动态[${recent}]，生成5条私信会话（粉丝/路人/其他博主）。其中2条【${char.name}】已回复，3条未读。严禁Emoji。JSON格式：[{"author": "网名", "messages": [{"sender": "网名", "text": "内容"}, {"sender": "博主", "text": "回复(未回复则删掉此对象)"}]}]`;
                const promptStr = await buildBloggerPrompt(acc, char, null, store.personas[0], { task });
                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] }) });
                const text = (await res.json()).choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json|```/gi, '').trim();
                const cms = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
                acc.inbox = acc.inbox || [];
                cms.forEach(c => {
                    const mappedMsgs = c.messages.map(m => ({ sender: m.sender==='博主' ? acc.name : m.sender, text: m.text, isMe: m.sender==='博主' }));
                    acc.inbox.push({ id: 'msg_' + Date.now() + Math.random(), author: c.author, messages: mappedMsgs });
                });
                if (window.actions.saveStore) window.actions.saveStore();
            } catch(e) {} finally { state.isFetchingInbox = false; window.render(); }
        },
        sendInboxMsg: async (id, text) => {
            if (!text || !text.trim()) return;
            const state = window.bloggerState;
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            const chat = acc.inbox.find(x => x.id === id);
            chat.messages.push({ sender: acc.name, text: text, isMe: true });
            chat.isWaitingReply = true; // 🌟 开启输入中状态
            window.render();
            
            if (store.apiConfig?.apiKey) {
                try {
                    const promptStr = `【系统指令】：你现在扮演社交平台上的网友 [${chat.author}]。
以下是你和博主 [${acc.name}] 的私信聊天记录：
${chat.messages.map(m => `[${m.sender}]: ${m.text}`).join('\n')}
博主刚刚回复了你。请你站在网友 [${chat.author}] 的立场和性格，继续回复博主一句。严禁Emoji。直接输出回复的纯文本内容，不要输出你的名字前缀。`;
                    
                    const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, 
                        body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] }) 
                    });
                    const reply = (await res.json()).choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
                    if (reply) chat.messages.push({ sender: chat.author, text: reply, isMe: false });
                } catch(e) { console.error("私信回复失败", e); }
            }
            chat.isWaitingReply = false; // 🌟 关闭输入中状态
            if (window.actions.saveStore) window.actions.saveStore(); 
            window.render();
        },

        refreshStudio: async () => {
            const state = window.bloggerState;
            if (state.isGeneratingStudio) return;
            if (!store.apiConfig?.apiKey) return window.actions.showToast('⚠️ 配置 API 后即可获取商单与活动');
            
            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            const lv = bloggerUtils.calcLevel(acc.followers);
            state.isGeneratingStudio = true; window.render();
            try {
                const task = `你是社交平台后台引擎。基于当前账号：等级[${lv.name} ${lv.rank}]，定位[${acc.positioning}]。
生成以下内容：
1. 平台活动：符合平台风格、适合当前等级的任务，包含具体的【参与话题词(topic)】。
2. 商单邀约：符合定位的品牌推广，包含具体的【商品名】和【酬金(纯数字)】。
3. 公关事件：戏剧性突发事件。
严禁Emoji。必须严格输出以下 JSON 格式：
{"activity": {"title": "活动标题", "desc": "描述", "topic": "话题词(不要带#)"}, "commercial": {"title": "商单标题", "desc": "描述", "product": "商品名称", "payout": 5000}, "pr": {"title": "事件标题", "desc": "描述"}}`;
                const char = store.contacts.find(c => c.id === acc.charId);
                const promptStr = await buildBloggerPrompt(acc, char, null, store.personas[0], { task });
                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const data = await res.json();
                let text = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json|```/gi, '').trim();
                let parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
                parsed.commercial.status = 'pending';
                acc.studioData = parsed;
                if (window.actions.saveStore) window.actions.saveStore();
            } catch (e) { console.error(e); window.actions.showToast('网络波动，获取失败'); } finally { state.isGeneratingStudio = false; window.render(); }
        }
    };
}

export function renderBloggerApp(store) {
    const state = window.bloggerState;
    store.syncAccounts = store.syncAccounts || [];
    const accounts = store.syncAccounts;
    const my = (store.personas && store.personas.length > 0) ? store.personas[0] : { name: '我', avatar: '' };

    if (state.view === 'dashboard') {
        const acc = accounts.find(a => a.id === state.currentAccountId);
        if (!acc) return window.bloggerActions.goBack();
        
        if (acc.posts) {
            acc.posts.forEach(p => {
                if (!p.id) p.id = 'post_' + Math.random().toString(36).substr(2, 9);
                if (!p.stats) p.stats = { likes: p.likes || 0, commentsCount: p.comments?.length || 0, saves: 0, shares: 0 };
            });
        }
        
        const targetChar = store.contacts.find(c => c.id === acc.charId);
        const partnerAvatar = targetChar ? targetChar.avatar : acc.avatar;
        const lv = bloggerUtils.calcLevel(acc.followers);
        const inc = bloggerUtils.calcIncome(acc);

        const displayPosts = acc.posts || [];

        return `
            <div class="w-full h-full flex flex-col relative animate-in fade-in duration-300 bg-[#ffffff]">
                
                <div class="pt-8 pb-3 px-5 flex items-center justify-between z-40 relative shrink-0 border-b border-gray-50 bg-[#ffffff]">
                    <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.goBack()">
                        <i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i>
                    </div>
                    <div class="font-black text-gray-900 text-[18px] tracking-[0.2em] font-serif uppercase">Sync.</div>
                    <div class="w-10 flex justify-end text-gray-900">
                        <i data-lucide="more-horizontal" class="w-5 h-5 cursor-pointer active:opacity-50" onclick="window.bloggerActions.openSettings()"></i>
                    </div>
                </div>

                <div id="blogger-home-scroll" class="flex-1 overflow-y-auto hide-scrollbar pb-24 relative">
                    ${state.currentTab === 'profile' ? `
                        <div class="flex w-full pl-0 pr-5 mt-10 space-x-1.5 shrink-0">
                            <div class="flex-1 bg-[#1a1a1a] text-white pt-2 pb-3 pl-6 pr-4 flex flex-col justify-between min-h-[110px] shadow-lg rounded-r-[4px]">
                                <div class="flex justify-between items-start">
                                    <div class="flex -space-x-4 relative -mt-8">
                                        <img src="${my.avatar}" class="w-16 h-16 rounded-full border-[3px] border-[#1a1a1a] object-cover filter grayscale-[10%] shadow-md" />
                                        <img src="${partnerAvatar}" class="w-16 h-16 rounded-full border-[3px] border-[#1a1a1a] object-cover filter grayscale-[10%] shadow-md" />
                                    </div>
                                    <div class="flex space-x-4 text-right pt-2">
                                        <div class="flex flex-col items-center">
                                            <span class="font-bold text-[14px] font-serif">${acc.followers.toLocaleString()}</span>
                                            <span class="text-[8px] text-gray-400 uppercase tracking-widest">FLW</span>
                                        </div>
                                        <div class="flex flex-col items-center">
                                            <span class="font-bold text-[14px] font-serif">${acc.posts?.length || 0}</span>
                                            <span class="text-[8px] text-gray-400 uppercase tracking-widest">PST</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-3 flex flex-col">
                                    <input type="text" value="${acc.name}" onchange="window.bloggerActions.updateProfile('${acc.id}', 'name', this.value)" class="w-full bg-transparent font-bold font-serif tracking-widest uppercase text-white outline-none" style="font-size: 15px !important;" placeholder="ACCOUNT NAME">
                                    <input type="text" value="${acc.desc || 'SYNC OUR LIFESTYLE'}" onchange="window.bloggerActions.updateProfile('${acc.id}', 'desc', this.value)" class="w-full bg-transparent text-gray-400 mt-0.5 tracking-[0.2em] uppercase outline-none" style="font-size: 9px !important; line-height: 1.2 !important;" placeholder="SIGNATURE">
                                </div>
                            </div>
                            <div class="w-[95px] bg-[#e5e5e5] text-gray-800 py-3 flex flex-col justify-center space-y-3.5 shadow-md items-start pl-4 shrink-0 rounded-l-[4px]">
                                <div class="flex items-center cursor-pointer active:opacity-50 group" onclick="window.bloggerActions.openInbox()"><i data-lucide="mail" class="w-3.5 h-3.5 mr-2 opacity-80"></i><span class="text-[10px] font-bold border-b border-gray-400 pb-[1px]">私信</span></div>
                                <div class="flex items-center cursor-pointer active:opacity-50 group" onclick="window.bloggerActions.openQA()"><i data-lucide="inbox" class="w-3.5 h-3.5 mr-2 opacity-80"></i><span class="text-[10px] font-bold border-b border-gray-400 pb-[1px]">提问</span></div>
                                <div class="flex items-center cursor-pointer active:opacity-50 group" onclick="window.bloggerActions.openShowcase()"><i data-lucide="shopping-bag" class="w-3.5 h-3.5 mr-2 opacity-80"></i><span class="text-[10px] font-bold border-b border-gray-400 pb-[1px]">橱窗</span></div>
                            </div>
                        </div>

                        <div class="pt-12 pb-4 w-full">
                            ${displayPosts.length === 0 ? `<div class="flex flex-col items-center justify-center py-32 opacity-40"><i data-lucide="camera" class="w-10 h-10 mb-4 text-gray-300"></i><p class="text-[10px] font-serif tracking-widest uppercase">No Posts Yet</p></div>` : displayPosts.map((post, index) => {
                                const isLeft = index % 2 === 0;
                                const isExpanded = state.expandedPosts[post.id];
                                const isNoImg = post.mediaDesc === null; // 🌟 判断是否为无图短文（提问箱）
                                const showcaseTag = post.showcaseProduct ? `<div class="absolute top-2 right-2 bg-orange-500 text-white p-1 rounded-full shadow-md z-30"><i data-lucide="shopping-bag" class="w-3 h-3"></i></div>` : '';
                                
                                // 🌟 提纯出来的手风琴评论区
                                const commentsHtml = isExpanded ? `<div class="w-full mt-2 mb-14 animate-in fade-in slide-in-from-top-4 duration-300"><div class="w-full bg-[#F9F7EF] p-5 shadow-sm"><div class="text-[12px] font-bold mb-4 tracking-widest border-b border-gray-300 pb-1.5 font-serif flex justify-between items-end"><span>精选高赞评论 (Top 10)</span><span class="text-[9px] text-gray-400 font-normal tracking-normal">总评: ${post.stats.commentsCount}</span></div><div class="space-y-4">${state.isFetchingComments && !post.hasFetchedComments ? `<div class="py-4 text-center text-gray-400 text-[10px]">加载中...</div>` : (post.comments||[]).map(cmt => `<div class="flex justify-between items-start mb-3 group"><div class="text-[11px] text-gray-800 leading-relaxed font-serif flex-1 pr-3"><span class="font-bold text-gray-900 cursor-pointer" onclick="event.stopPropagation(); window.bloggerActions.replyToComment('${post.id}', '${cmt.id}')">${cmt.author}: </span><span class="tracking-wide">${cmt.content}</span><span class="text-[9px] text-gray-400 ml-1 font-sans"><i data-lucide="heart" class="w-2.5 h-2.5 inline -mt-0.5"></i> ${cmt.likes || 0}</span>${(cmt.replies||[]).map(r => `<div class="mt-1.5 pl-3 border-l-[1.5px] border-gray-400 text-gray-600"><span class="font-bold text-gray-800">${r.author} ${r.isAuthor ? '<span class="bg-gray-200 text-gray-600 px-1 rounded-[2px] text-[8px] ml-1">作者</span>' : ''}: </span>${r.content}</div>`).join('')}${cmt.isWaitingReply ? `<div class="mt-1.5 pl-3 border-l-[1.5px] border-gray-300 text-gray-400 text-[10px] flex items-center font-serif"><i data-lucide="loader" class="w-3 h-3 mr-1 animate-spin"></i>对方正在输入...</div>` : ''}</div><i data-lucide="corner-down-left" class="w-3.5 h-3.5 text-gray-400 cursor-pointer mt-0.5 shrink-0" onclick="event.stopPropagation(); window.bloggerActions.replyToComment('${post.id}', '${cmt.id}')"></i></div>`).join('')}</div>${post.hasFetchedComments ? (state.isFetchingComments ? `<div class="mt-6 text-[10px] text-gray-400 flex items-center justify-center border-t border-gray-200 pt-3"><i data-lucide="loader" class="w-3 h-3 mr-1 animate-spin"></i>加载中...</div>` : `<div class="mt-6 text-[10px] text-gray-400 text-center border-t border-gray-200 pt-3 cursor-pointer" onclick="event.stopPropagation(); window.bloggerActions.fetchComments('${post.id}', true)">换一批评论 ﹀</div>`) : ''}</div></div>` : '<div class="mb-14"></div>';

                                // 🌟 分别渲染：无图版、左图右文、右图左文
                                const noImgHtml = `<div class="relative w-full px-6 pt-4 cursor-pointer" onclick="window.bloggerActions.togglePostDetail('${post.id}')"><div class="relative flex w-full">${isLeft ? '' : '<div class="absolute left-0 bottom-0 w-[6px] bg-[#1a1a1a] h-[66%] z-10"></div>'}<div class="flex-1 bg-[#F9F7EF] p-5 z-10 shadow-sm min-h-[100px] flex flex-col justify-center ${isLeft ? 'mr-4' : 'ml-4'}"><div class="text-[12px] text-gray-800 leading-loose mb-4 w-full break-words font-serif text-left">${post.htmlContent || post.desc}</div><div class="flex space-x-3 text-[9px] text-gray-400 font-serif tracking-widest ${isLeft ? 'justify-end' : 'justify-start'} shrink-0 pt-3 border-t border-gray-200 mt-auto items-center"><span class="flex items-center">赞 ${post.stats.likes}</span><span>评 ${post.stats.commentsCount}</span>${post.id.toString().startsWith('post_') ? `<span class="text-rose-400 font-bold ml-2 cursor-pointer" onclick="event.stopPropagation(); window.bloggerActions.deletePost('${post.id}')">删除</span>` : ''}</div></div>${isLeft ? '<div class="absolute right-0 bottom-0 w-[6px] bg-[#1a1a1a] h-[66%] z-10"></div>' : ''}</div>${commentsHtml}</div>`;
                                const imgLeftHtml = `<div class="relative w-full pl-[56px] pr-6 pt-4 cursor-pointer" onclick="window.bloggerActions.togglePostDetail('${post.id}')"><div class="absolute left-4 top-0 w-[120px] h-[160px] bg-[#a8a8a8] -rotate-3 z-20 shadow-md p-4 overflow-hidden flex flex-col"><div class="rotate-3 h-full flex flex-col"><span class="text-[11px] font-bold text-gray-800 mb-2 tracking-widest font-serif">图片描述：</span><div class="text-[10px] text-gray-700 leading-relaxed overflow-y-auto hide-scrollbar flex-1">${post.mediaDesc || '...'}</div></div></div><div class="relative flex w-full"><div class="flex-1 bg-[#F9F7EF] p-5 pl-[85px] mr-4 z-10 shadow-sm min-h-[145px] flex flex-col justify-center"><div class="text-[12px] text-gray-800 leading-loose mb-4 w-full text-left break-words font-serif">${post.htmlContent || post.desc}</div><div class="flex space-x-3 text-[9px] text-gray-400 font-serif tracking-widest justify-end shrink-0 pt-3 border-t border-gray-200 mt-auto items-center"><span class="flex items-center">${post.showcaseProduct ? '<i data-lucide="shopping-bag" class="w-3 h-3 text-orange-500 mr-4"></i>' : ''}赞 ${post.stats.likes}</span><span>评 ${post.stats.commentsCount}</span>${post.id.toString().startsWith('post_') ? `<span class="text-rose-400 font-bold ml-2 cursor-pointer" onclick="event.stopPropagation(); window.bloggerActions.deletePost('${post.id}')">删除</span>` : ''}</div></div><div class="absolute right-0 bottom-0 w-[6px] bg-[#1a1a1a] h-[66%] z-10"></div></div>${commentsHtml}</div>`;
                                const imgRightHtml = `<div class="relative w-full pr-[56px] pl-6 pt-4 cursor-pointer" onclick="window.bloggerActions.togglePostDetail('${post.id}')"><div class="relative flex w-full"><div class="absolute left-0 bottom-0 w-[6px] bg-[#1a1a1a] h-[66%] z-10"></div><div class="flex-1 bg-[#F9F7EF] p-5 pr-[85px] ml-4 z-10 shadow-sm min-h-[145px] flex flex-col justify-center"><div class="text-[12px] text-gray-800 leading-loose mb-4 w-full text-left break-words font-serif">${post.htmlContent || post.desc}</div><div class="flex space-x-3 text-[9px] text-gray-400 font-serif tracking-widest justify-start shrink-0 pt-3 border-t border-gray-200 mt-auto items-center"><span class="flex items-center">${post.showcaseProduct ? '<i data-lucide="shopping-bag" class="w-3 h-3 text-orange-500 mr-4"></i>' : ''}赞 ${post.stats.likes}</span><span>评 ${post.stats.commentsCount}</span>${post.id.toString().startsWith('post_') ? `<span class="text-rose-400 font-bold ml-2 cursor-pointer" onclick="event.stopPropagation(); window.bloggerActions.deletePost('${post.id}')">删除</span>` : ''}</div></div></div><div class="absolute right-4 top-0 w-[120px] h-[160px] bg-[#a8a8a8] rotate-3 z-20 shadow-md p-4 overflow-hidden flex flex-col"><div class="-rotate-3 h-full flex flex-col"><span class="text-[11px] font-bold text-gray-800 mb-2 tracking-widest font-serif">图片描述：</span><div class="text-[10px] text-gray-700 leading-relaxed overflow-y-auto hide-scrollbar flex-1">${post.mediaDesc || '...'}</div></div></div>${commentsHtml}</div>`;
                                
                                return isNoImg ? noImgHtml : (isLeft ? imgLeftHtml : imgRightHtml);
                            }).join('')}
                        </div>
                    ` : `
                        <div class="p-6 space-y-6 animate-in slide-in-from-right-4 duration-300">
                            
                            <div class="bg-[#1a1a1a] text-white px-5 py-3 rounded-none shadow-md flex items-center justify-between">
                                <span class="text-[11px] tracking-[0.2em] font-serif uppercase">Account Level</span>
                                <span class="text-[14px] font-black font-serif uppercase">${lv.name} <span class="text-orange-400">LV.${lv.rank}</span></span>
                            </div>

                            <div class="bg-[#F9F7EF] p-6 shadow-sm border border-gray-100">
                                <div class="flex justify-between items-center border-b border-gray-200 pb-5 mb-5">
                                    <div class="flex flex-col items-center flex-1">
                                        <span class="text-[10px] text-gray-400 font-serif tracking-widest uppercase mb-1.5">Views</span>
                                        <span class="text-[18px] font-black font-serif text-gray-900">${((acc.totalLikes || 0) * 12).toLocaleString()}</span>
                                    </div>
                                    <div class="w-[1px] h-8 bg-gray-200"></div>
                                    <div class="flex flex-col items-center flex-1">
                                        <span class="text-[10px] text-gray-400 font-serif tracking-widest uppercase mb-1.5">Likes</span>
                                        <span class="text-[18px] font-black font-serif text-gray-900">${(acc.totalLikes || 0).toLocaleString()}</span>
                                    </div>
                                    <div class="w-[1px] h-8 bg-gray-200"></div>
                                    <div class="flex flex-col items-center flex-1">
                                        <span class="text-[10px] text-gray-400 font-serif tracking-widest uppercase mb-1.5">Flwrs</span>
                                        <span class="text-[18px] font-black font-serif text-gray-900">${acc.followers.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div class="h-[50px] w-full flex items-end justify-between space-x-1.5 opacity-80 px-2">
                                    ${[0.3, 0.5, 0.4, 0.8, 0.6, 0.9, 1.0, 0.7, 0.4].map(h => `<div class="w-full bg-[#1a1a1a] hover:bg-orange-400 transition-colors rounded-t-[2px]" style="height: ${h * 100}%"></div>`).join('')}
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-[#F9F7EF] p-4 border-l-4 border-gray-900 shadow-sm">
                                    <span class="text-[9px] text-gray-500 uppercase block mb-1 font-serif">Total Income</span>
                                    <span class="text-[16px] font-bold font-serif">￥${inc.total}</span>
                                </div>
                                <div class="bg-[#F9F7EF] p-4 border-l-4 border-orange-400 shadow-sm">
                                    <span class="text-[9px] text-gray-500 uppercase block mb-1 font-serif">Showcase AD</span>
                                    <span class="text-[16px] font-bold font-serif">￥${inc.shop}</span>
                                </div>
                            </div>

                            <div class="pt-4 border-t border-gray-200">
                                <div class="flex justify-between items-center mb-4">
                                    <span class="text-[12px] font-bold font-serif uppercase tracking-widest text-gray-900">Studio Events</span>
                                    <i data-lucide="refresh-cw" class="w-4 h-4 text-gray-400 cursor-pointer active:rotate-180 transition-transform ${state.isGeneratingStudio ? 'animate-spin text-gray-900' : ''}" onclick="window.bloggerActions.refreshStudio()"></i>
                                </div>
                                
                                ${!acc.studioData && !state.isGeneratingStudio ? `
                                    <div class="bg-[#F9F7EF] py-10 flex flex-col items-center justify-center border border-gray-100 shadow-sm cursor-pointer active:opacity-50" onclick="window.bloggerActions.refreshStudio()">
                                        <i data-lucide="inbox" class="w-6 h-6 text-gray-300 mb-2"></i>
                                        <span class="text-[10px] font-serif text-gray-500 tracking-widest uppercase">Click refresh to scan events</span>
                                    </div>
                                ` : state.isGeneratingStudio ? `
                                    <div class="bg-[#F9F7EF] py-10 flex flex-col items-center justify-center border border-gray-100 shadow-sm">
                                        <i data-lucide="loader" class="w-6 h-6 text-gray-400 mb-2 animate-spin"></i>
                                        <span class="text-[10px] font-serif text-gray-500 tracking-widest uppercase">Fetching Network...</span>
                                    </div>
                                ` : `
                                    <div class="space-y-4 pb-8">
                                        <div class="bg-[#F9F7EF] p-5 shadow-sm border border-gray-100 flex flex-col">
                                            <div class="flex items-center mb-3 border-b border-gray-200 pb-2">
                                                <i data-lucide="flag" class="w-4 h-4 mr-2 text-gray-800"></i>
                                                <span class="text-[14px] font-black uppercase tracking-widest font-serif text-gray-900">${acc.studioData?.activity?.title || 'Platform Activity'}</span>
                                            </div>
                                            <p class="text-[11px] text-gray-700 leading-relaxed font-serif mb-4">${acc.studioData?.activity?.desc || '暂无描述'}</p>
                                            <div class="mt-auto flex flex-col pt-2 space-y-2">
                                                <div class="bg-white/60 p-2.5 border border-gray-200 text-[10px] text-gray-500 font-serif w-full">
                                                    参与方式：发文携带话题 <span class="text-blue-500 font-bold">#${acc.studioData?.activity?.topic || '日常'}</span>，可获得 <span class="text-orange-500 font-bold">1.5倍</span> 流量曝光加成。
                                                </div>
                                                <div class="flex justify-end">
                                                    ${acc.studioData?.activity?.status === 'completed' ? `<span class="text-[10px] font-bold text-gray-400 font-serif uppercase tracking-widest">Completed</span>` : `<span class="text-[10px] font-bold text-orange-500 font-serif uppercase tracking-widest">In Progress</span>`}
                                                </div>
                                            </div>
                                        </div>

                                        <div class="bg-[#F9F7EF] p-5 shadow-sm border border-gray-100 flex flex-col">
                                            <div class="flex items-center mb-3 border-b border-gray-200 pb-2"><i data-lucide="award" class="w-4 h-4 mr-2 text-gray-800"></i><span class="text-[14px] font-black uppercase tracking-widest font-serif text-gray-900">${acc.studioData?.commercial?.title || 'Commercial Deal'}</span></div>
                                            <p class="text-[11px] text-gray-700 leading-relaxed font-serif mb-4">${acc.studioData?.commercial?.desc || '暂无描述'}</p>
                                            <div class="flex justify-between items-end mt-auto pt-2">
                                                <div class="flex flex-col space-y-1.5"><span class="text-[10px] text-gray-500 font-serif">指定商品：<span class="text-gray-800 font-bold border-b border-gray-300 pb-[1px]">${acc.studioData?.commercial?.product || '无'}</span></span><span class="text-[10px] text-gray-500 font-serif">结案酬金：<span class="text-orange-500 font-bold">￥${acc.studioData?.commercial?.payout || 0}</span></span></div>
                                                ${acc.studioData?.commercial?.status === 'pending' ? `<span class="text-[11px] font-bold text-gray-900 font-serif uppercase cursor-pointer active:opacity-50 underline underline-offset-4 decoration-[1.5px]" onclick="window.bloggerActions.acceptCommercial()">Accept</span>` : acc.studioData?.commercial?.status === 'accepted' ? `<span class="text-[10px] font-bold text-orange-500 font-serif uppercase tracking-widest">In Progress</span>` : `<span class="text-[10px] font-bold text-gray-400 font-serif uppercase tracking-widest">Completed</span>`}
                                            </div>
                                        </div>

                                        <div class="bg-[#F9F7EF] p-5 shadow-sm border border-gray-100 flex flex-col">
                                            <div class="flex items-center mb-3 border-b border-gray-200 pb-2"><i data-lucide="zap" class="w-4 h-4 mr-2 text-gray-800"></i><span class="text-[14px] font-black uppercase tracking-widest font-serif text-gray-900">${acc.studioData?.pr?.title || 'PR Drama'}</span></div>
                                            <p class="text-[11px] text-gray-700 leading-relaxed font-serif mt-auto">${acc.studioData?.pr?.desc || '暂无描述'}</p>
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `}
                </div>

                <div class="absolute bottom-0 left-0 w-full h-[75px] bg-[#ffffff] border-t border-gray-100 flex justify-between items-start pt-3 px-10 pb-safe z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
                    <div class="flex flex-col items-center cursor-pointer transition-opacity ${state.currentTab==='profile' ? 'opacity-100 text-gray-900' : 'opacity-40 text-gray-500'}" onclick="window.bloggerActions.switchTab('profile')">
                        <i data-lucide="layout-grid" class="w-6 h-6 mb-1"></i>
                    </div>
                    <div class="relative -top-7 w-14 h-14 bg-[#1a1a1a] rounded-full flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.2)] cursor-pointer active:scale-90 transition-transform" onclick="window.bloggerActions.openPublishMenu()">
                        <i data-lucide="plus" class="w-6 h-6"></i>
                    </div>
                    <div class="flex flex-col items-center cursor-pointer transition-opacity ${state.currentTab==='studio' ? 'opacity-100 text-gray-900' : 'opacity-40 text-gray-500'}" onclick="window.bloggerActions.switchTab('studio')">
                        <i data-lucide="bar-chart-2" class="w-6 h-6 mb-1"></i>
                    </div>
                </div>

                ${state.showPublishMenu ? `
                    <div class="absolute inset-0 z-[100]" onclick="window.bloggerActions.closePublishMenu()"></div>
                    <div class="absolute bottom-[90px] left-1/2 transform -translate-x-1/2 z-[101] bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 px-6 py-3 flex items-center space-x-5 whitespace-nowrap animate-in slide-in-from-bottom-2 fade-in duration-200">
                        <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity" onclick="window.bloggerActions.openCreatePost()"><i data-lucide="pen-tool" class="w-4 h-4 mr-1.5 text-gray-900"></i><span class="text-[13px] font-bold text-gray-900 font-serif tracking-widest uppercase">发帖</span></div>
                        <div class="text-gray-300 mx-1">|</div>
                        <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity" onclick="window.bloggerActions.openLive()"><i data-lucide="video" class="w-4 h-4 mr-1.5 text-gray-900"></i><span class="text-[13px] font-bold text-gray-900 font-serif tracking-widest uppercase">直播</span></div>
                    </div>
                ` : ''}

                ${state.showShowcaseModal ? `
                    <div class="absolute inset-0 z-[100] bg-[#F9F7EF] animate-in slide-in-from-right duration-300 flex flex-col pb-safe">
                        <div class="pt-8 pb-3 px-5 flex items-center justify-between border-b border-gray-200 shrink-0">
                            <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.closeShowcase()"><i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i></div>
                            <div class="font-black text-gray-900 text-[16px] tracking-[0.2em] font-serif uppercase">Showcase</div>
                            <div class="w-10"></div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-5">
                            <div class="grid grid-cols-2 gap-4">
                                ${(acc.showcase || []).length === 0 ? '<div class="col-span-2 flex flex-col items-center text-gray-400 py-20 opacity-50"><i data-lucide="shopping-bag" class="w-8 h-8 mb-3"></i><span class="text-[12px] font-serif tracking-widest uppercase">橱窗空空如也</span></div>' : 
                                (acc.showcase || []).map(p => `
                                    <div class="bg-white p-3 shadow-sm border border-gray-100 flex flex-col relative group">
                                        <div class="absolute top-2 right-2 text-rose-400 cursor-pointer active:scale-90 opacity-70 hover:opacity-100" onclick="window.bloggerActions.deleteShowcaseItem('${p.id}')"><i data-lucide="x-circle" class="w-4 h-4"></i></div>
                                        <div class="w-full aspect-square bg-gray-50 mb-3 flex items-center justify-center text-gray-300 border border-gray-100"><i data-lucide="image" class="w-8 h-8 opacity-50"></i></div>
                                        <span class="font-bold text-[12px] text-gray-900 line-clamp-1 font-serif mb-0.5">${p.name}</span>
                                        <span class="text-[10px] text-gray-500 mb-2 border-b border-gray-100 pb-1.5">${p.specs}</span>
                                        <div class="flex justify-between items-end mt-auto pt-1">
                                            <span class="font-bold text-[14px] text-orange-500 font-serif">￥${p.price}</span>
                                            <div class="flex flex-col items-end text-[9px] text-gray-400 font-serif tracking-wide">
                                                <span>销量: <span class="text-gray-900">${p.sales || 0}</span></span>
                                                <span>提成: <span class="text-gray-900">￥${p.commission || 0}</span></span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${state.showProductSelector ? `
                    <div class="absolute inset-0 z-[110] bg-black/40 backdrop-blur-sm flex flex-col justify-end" onclick="window.bloggerActions.closeProductSelector()">
                        <div class="w-full bg-[#F9F7EF] rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] max-h-[60vh] flex flex-col animate-in slide-in-from-bottom duration-300 pb-safe" onclick="event.stopPropagation()">
                            <div class="p-5 text-center font-black text-[14px] border-b border-gray-200 font-serif uppercase tracking-widest text-gray-900">Select Product</div>
                            <div class="flex-1 overflow-y-auto p-5 space-y-3">
                                ${(acc.showcase || []).map(p => `
                                    <div class="flex items-center p-3 border border-gray-200 bg-white shadow-sm cursor-pointer active:bg-gray-50 ${state.postData.showcaseProduct?.id === p.id ? 'border-orange-400 bg-orange-50/20' : ''}" onclick="window.bloggerActions.selectProduct('${p.id}')">
                                        <div class="w-12 h-12 bg-gray-100 mr-4 flex items-center justify-center text-gray-300 shrink-0"><i data-lucide="image" class="w-5 h-5 opacity-50"></i></div>
                                        <div class="flex-1 flex flex-col">
                                            <span class="font-bold text-[12px] text-gray-900 font-serif mb-0.5">${p.name}</span>
                                            <span class="text-[10px] text-gray-500 font-serif">售价: ￥${p.price} | 佣金: ￥${p.commission}</span>
                                        </div>
                                        ${state.postData.showcaseProduct?.id === p.id ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-orange-500"></i>' : ''}
                                    </div>
                                `).join('')}
                                <div class="p-3 mt-2 text-center text-[12px] text-gray-400 font-bold font-serif tracking-widest uppercase cursor-pointer active:opacity-50 border border-dashed border-gray-300" onclick="window.bloggerActions.selectProduct(null)">Cancel Mount</div>
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${state.showInboxModal && !state.inboxChatId ? `
                    <div class="absolute inset-0 z-[100] bg-[#F9F7EF] animate-in slide-in-from-right duration-300 flex flex-col pb-safe">
                        <div class="pt-8 pb-3 px-5 flex items-center justify-between border-b border-gray-200 shrink-0 bg-[#F9F7EF]">
                            <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.closeInbox()"><i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i></div>
                            <div class="font-black text-gray-900 text-[16px] tracking-[0.2em] font-serif uppercase">Inbox</div>
                            <div class="w-10 flex justify-end">
                                <i data-lucide="refresh-cw" class="w-4 h-4 text-gray-900 cursor-pointer active:rotate-180 transition-transform ${state.isFetchingInbox ? 'animate-spin' : ''}" onclick="window.bloggerActions.fetchInbox()"></i>
                            </div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-5 space-y-4">
                            ${state.isFetchingInbox ? '<div class="text-center text-gray-400 py-10 flex flex-col items-center"><i data-lucide="loader" class="w-6 h-6 mb-2 animate-spin"></i><span class="text-[10px] font-serif tracking-widest uppercase">Fetching Messages...</span></div>' : (acc.inbox||[]).map(c => `
                                <div class="bg-white p-4 shadow-sm border border-gray-100 flex items-center cursor-pointer active:opacity-50" onclick="window.bloggerActions.openInboxChat('${c.id}')">
                                    <div class="w-10 h-10 bg-gray-100 rounded-full mr-4 flex items-center justify-center shrink-0 text-gray-400"><i data-lucide="user" class="w-5 h-5"></i></div>
                                    <div class="flex-1 flex flex-col min-w-0">
                                        <span class="font-bold text-[14px] text-gray-900 font-serif mb-1 truncate">${c.author}</span>
                                        <span class="text-[11px] text-gray-500 truncate">${c.messages[c.messages.length-1].text}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                ${state.showInboxModal && state.inboxChatId ? `
                    <div class="absolute inset-0 z-[110] bg-[#F9F7EF] animate-in slide-in-from-right duration-300 flex flex-col pb-safe">
                        <div class="pt-8 pb-3 px-5 flex items-center justify-between border-b border-gray-200 shrink-0 bg-white">
                            <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.closeInboxChat()"><i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i></div>
                            <div class="font-black text-gray-900 text-[16px] font-serif">${(acc.inbox||[]).find(x=>x.id===state.inboxChatId)?.author}</div>
                            <div class="w-10"></div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-5 space-y-4">
                            ${(acc.inbox||[]).find(x=>x.id===state.inboxChatId)?.messages.map(m => `
                                <div class="flex flex-col ${m.isMe ? 'items-end' : 'items-start'} w-full">
                                    <span class="text-[9px] text-gray-400 mb-1 font-serif">${m.sender}</span>
                                    <div class="${m.isMe ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-gray-200 text-gray-800'} p-3 max-w-[80%] shadow-sm text-[12px] leading-relaxed break-words">${m.text}</div>
                                </div>
                            `).join('')}
                            ${(acc.inbox||[]).find(x=>x.id===state.inboxChatId)?.isWaitingReply ? `
                                <div class="flex flex-col items-start w-full animate-in fade-in duration-200">
                                    <span class="text-[9px] text-gray-400 mb-1 font-serif">${(acc.inbox||[]).find(x=>x.id===state.inboxChatId)?.author}</span>
                                    <div class="bg-white border border-gray-200 text-gray-400 p-3 max-w-[80%] shadow-sm text-[12px] flex items-center font-serif"><i data-lucide="loader" class="w-3 h-3 mr-1.5 animate-spin"></i>正在输入...</div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="p-3 bg-white border-t border-gray-200 flex items-center shrink-0">
                            <input type="text" id="inbox-reply-input" class="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[12px] outline-none placeholder-gray-400 font-serif" placeholder="Message..." onkeypress="if(event.key==='Enter') { const val = this.value; this.value = ''; window.bloggerActions.sendInboxMsg('${state.inboxChatId}', val); }">
                            <div class="w-8 h-8 bg-[#1a1a1a] text-white rounded-full flex items-center justify-center ml-3 cursor-pointer active:scale-90 transition-transform shrink-0" onclick="const ipt=document.getElementById('inbox-reply-input'); const val = ipt.value; ipt.value = ''; window.bloggerActions.sendInboxMsg('${state.inboxChatId}', val);">
                                <i data-lucide="send" class="w-3.5 h-3.5 -ml-0.5"></i>
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${state.showQAModal ? `
                    <div class="absolute inset-0 z-[100] bg-[#F9F7EF] animate-in slide-in-from-right duration-300 flex flex-col pb-safe">
                        <div class="pt-8 pb-3 px-5 flex items-center justify-between border-b border-gray-200 shrink-0 bg-[#F9F7EF]">
                            <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.closeQA()"><i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i></div>
                            <div class="font-black text-gray-900 text-[16px] tracking-[0.2em] font-serif uppercase">Q&A Box</div>
                            <div class="w-10 flex justify-end">
                                <i data-lucide="refresh-cw" class="w-4 h-4 text-gray-900 cursor-pointer active:rotate-180 transition-transform ${state.isFetchingQA ? 'animate-spin' : ''}" onclick="window.bloggerActions.fetchQA()"></i>
                            </div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-5 space-y-4">
                            ${state.isFetchingQA ? '<div class="text-center text-gray-400 py-10 flex flex-col items-center"><i data-lucide="loader" class="w-6 h-6 mb-2 animate-spin"></i><span class="text-[10px] font-serif tracking-widest uppercase">Fetching Questions...</span></div>' : (acc.qaBox||[]).length === 0 ? '<div class="text-center text-gray-400 py-10 text-[11px] font-serif">提问箱目前空空如也</div>' : (acc.qaBox||[]).map(q => `
                                <div class="bg-white p-4 shadow-sm border border-gray-100 flex flex-col">
                                    <div class="flex items-start mb-3"><div class="w-6 h-6 bg-gray-900 text-white flex items-center justify-center font-bold text-[12px] shrink-0 mr-3">Q</div><div class="text-[13px] text-gray-900 font-bold leading-relaxed pt-0.5">${q.question}</div></div>
                                    <textarea oninput="window.bloggerActions.updateQADraft('${q.id}', this.value)" class="w-full bg-gray-50 border border-gray-200 text-[12px] p-3 outline-none resize-none min-h-[60px] placeholder-gray-400 mb-3" placeholder="写下你的回答...">${state.qaDrafts[q.id] || ''}</textarea>
                                    <div class="flex justify-end"><span class="text-[11px] font-bold text-orange-500 font-serif tracking-widest uppercase cursor-pointer active:opacity-50 underline underline-offset-4" onclick="window.bloggerActions.answerQA('${q.id}')">Publish</span></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${state.showSettingsModal ? `
                    <div class="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" onclick="window.bloggerActions.closeSettings()">
                        <div class="w-full max-w-[320px] bg-[#F9F7EF] rounded-none shadow-2xl p-7 flex flex-col" onclick="event.stopPropagation()">
                            <h3 class="text-[16px] font-black font-serif text-gray-900 mb-6 tracking-widest text-center uppercase border-b border-gray-300 pb-3">SETTING</h3>
                            <div class="space-y-6 overflow-y-auto max-h-[50vh] hide-scrollbar mb-8">
                                <div><label class="text-[9px] font-bold text-gray-500 uppercase block mb-2 font-serif">Platform Style</label><textarea oninput="window.bloggerActions.updateSettingsTemp('platformStyle', this.value)" class="w-full bg-transparent border-b border-gray-400 text-[12px] font-serif text-gray-900 outline-none pb-1 resize-none min-h-[50px] placeholder-gray-400">${state.settingsTemp.platformStyle}</textarea></div>
                                <div><label class="text-[9px] font-bold text-gray-500 uppercase block mb-2 font-serif">Positioning</label><input type="text" value="${state.settingsTemp.positioning}" oninput="window.bloggerActions.updateSettingsTemp('positioning', this.value)" class="w-full bg-transparent border-b border-gray-400 text-[12px] font-serif text-gray-900 outline-none pb-1" placeholder="如：高颜值情侣"></div>
                                <div><label class="text-[9px] font-bold text-gray-500 uppercase block mb-3 font-serif">Worldbook</label><div class="space-y-3 border border-gray-300 p-3">${(store.worldbooks || []).filter(wb => wb.type === 'local').map(wb => `<div class="flex items-center cursor-pointer group" onclick="window.bloggerActions.toggleSettingsWb('${wb.id}')"><div class="w-3 h-3 border border-gray-500 mr-3 flex items-center justify-center ${state.settingsTemp.mountedWbs.some(x => String(x) === String(wb.id)) ? 'bg-[#1a1a1a] border-[#1a1a1a]' : ''}">${state.settingsTemp.mountedWbs.some(x => String(x) === String(wb.id)) ? '<i data-lucide="check" class="w-2 h-2 text-white"></i>' : ''}</div><span class="text-[12px] text-gray-800 font-serif flex-1">${wb.title}</span></div>`).join('')}</div></div>
                            </div>
                            <div class="flex justify-center"><span class="text-[12px] font-bold text-[#1a1a1a] font-serif tracking-[0.2em] uppercase cursor-pointer underline underline-offset-4 decoration-[1.5px]" onclick="window.bloggerActions.saveSettings()">Save</span></div>
                        </div>
                    </div>
                ` : ''}

                ${state.showCreatePostModal ? `
                    <div class="absolute inset-0 z-[70] flex flex-col animate-in slide-in-from-bottom-full duration-300 bg-[#ffffff]">
                        <div class="pt-8 pb-3 px-5 flex items-center justify-between border-b border-gray-50 shrink-0 relative bg-[#ffffff]"><div class="w-16 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.closeCreatePost()"><i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i></div><div class="absolute left-1/2 transform -translate-x-1/2 font-black text-[16px] font-serif tracking-[0.2em] uppercase text-gray-900">New Post</div><div class="w-20 flex justify-end"><div class="flex items-center text-[11px] font-bold text-gray-600 cursor-pointer active:scale-95 px-2.5 py-1.5 rounded-full" onclick="window.bloggerActions.generatePostContent()">${state.isGeneratingPost ? `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i>` : `<i data-lucide="sparkles" class="w-3.5 h-3.5 mr-1"></i>让ta写`}</div></div></div>
                        <div class="flex-1 overflow-y-auto p-6 flex flex-col hide-scrollbar"><div class="w-full aspect-[4/5] bg-[#f9fafb] rounded-[16px] border border-gray-100 overflow-hidden mb-6 relative shadow-inner p-4 flex flex-col"><div class="flex items-center text-gray-400 mb-3"><i data-lucide="image-plus" class="w-5 h-5 mr-2"></i><span class="text-[12px] font-bold tracking-widest font-serif uppercase">Virtual Media</span></div><textarea oninput="window.bloggerActions.updatePostField('mediaDesc', this.value)" class="w-full flex-1 bg-transparent resize-none outline-none text-[14px] text-gray-700 leading-relaxed placeholder-gray-400" placeholder="描述画面...">${state.postData.mediaDesc}</textarea></div><style>#blogger-content-input:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; display: block; }</style><div id="blogger-content-input" contenteditable="true" oninput="window.bloggerActions.updatePostField('content', this.innerHTML)" class="w-full text-[15px] outline-none bg-transparent min-h-[120px] leading-relaxed flex-1 overflow-y-auto text-gray-900" style="font-size: 15px !important;" data-placeholder="随心写下生活碎片...">${state.postData.content}</div>
                        <div class="flex flex-wrap gap-2 mb-2 mt-2">
                            ${state.postData.topics.map((t, idx) => `
                                <div class="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full text-[12px] font-bold flex items-center border border-gray-200">
                                    # ${t} <i data-lucide="x" class="w-3 h-3 ml-1.5 cursor-pointer opacity-70" onclick="window.bloggerActions.removeTopic(${idx})"></i>
                                </div>
                            `).join('')}
                        </div>
                        <div class="flex justify-between items-center border-t border-gray-100 pt-4 pb-safe mt-auto"><div class="flex space-x-6"><div class="flex items-center text-[13px] font-bold text-gray-600 cursor-pointer active:scale-95" onclick="window.bloggerActions.addTopic()"><i data-lucide="hash" class="w-4 h-4 mr-1"></i>话题</div><div class="flex items-center text-[13px] font-bold ${state.postData.showcaseProduct ? 'text-orange-500' : 'text-gray-600'} cursor-pointer active:scale-95" onclick="window.bloggerActions.openProductSelector()"><i data-lucide="shopping-bag" class="w-4 h-4 mr-1 ${state.postData.showcaseProduct ? 'fill-current' : ''}"></i>${state.postData.showcaseProduct ? '已挂载' : '橱窗'}</div></div><button class="bg-[#1a1a1a] text-white px-6 py-2.5 rounded-full text-[13px] font-bold tracking-widest active:scale-95 font-serif shadow-md flex items-center" onclick="window.bloggerActions.publishPost()">发布 <i data-lucide="send" class="w-3.5 h-3.5 ml-1.5"></i></button></div></div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    return `
        <div class="w-full h-full flex flex-col relative animate-in zoom-in-95 duration-300 bg-[#ffffff]" style="background-color: #ffffff !important;">
            <div class="pt-8 pb-3 px-5 flex items-center justify-between z-40 relative shrink-0 border-b border-gray-50" style="background-color: #ffffff !important;">
                <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.goBack()"><i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i></div>
                <div class="font-black text-gray-900 text-[18px] tracking-[0.2em] font-serif uppercase">Sync.</div>
                <div class="w-10 flex justify-end"><div class="w-8 h-8 bg-transparent text-gray-900 flex items-center justify-center cursor-pointer active:scale-90 transition-transform" onclick="window.bloggerActions.openCreateModal()"><i data-lucide="plus" class="w-5 h-5"></i></div></div>
            </div>
            <div class="flex-1 overflow-y-auto px-6 pt-8 pb-10 hide-scrollbar flex flex-col items-center">
                <div class="text-[10px] text-gray-400 font-bold tracking-[0.3em] uppercase mb-10 opacity-60">Select Account</div>
                ${accounts.length === 0 ? `<div class="mt-20 flex flex-col items-center justify-center opacity-50"><i data-lucide="infinity" class="w-12 h-12 mb-6 text-gray-300"></i><p class="text-[12px] tracking-[0.1em] text-gray-500 font-serif uppercase">No Active Accounts</p></div>` : `
                    <div class="w-full space-y-6">
                        ${accounts.map(acc => {
                            const tChar = store.contacts.find(c => c.id === acc.charId);
                            const pAvatar = tChar ? tChar.avatar : acc.avatar;
                            return `
                            <div class="w-full flex items-center cursor-pointer active:scale-[0.98] transition-all pb-4 border-b border-gray-100" onclick="window.bloggerActions.enterAccount('${acc.id}')">
                                <div class="w-14 h-14 overflow-hidden mr-5 shrink-0 border border-gray-100 shadow-sm rounded-full"><img src="${pAvatar}" class="w-full h-full object-cover grayscale-[10%]"></div>
                                <div class="flex-1 flex flex-col justify-center min-w-0 pr-2">
                                    <span class="text-[16px] font-bold text-gray-900 truncate mb-1 font-serif tracking-widest uppercase">${acc.name}</span>
                                    <span class="text-[10px] text-gray-500 tracking-[0.2em] uppercase font-serif">${acc.followers.toLocaleString()} FLWR</span>
                                </div>
                                <i data-lucide="arrow-right" class="w-4 h-4 text-gray-400"></i>
                            </div>`;
                        }).join('')}
                    </div>
                `}
            </div>
            ${state.showCreateModal ? `<div class="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in" onclick="window.bloggerActions.closeCreateModal()"><div class="w-full max-w-[300px] bg-[#fff] overflow-hidden flex flex-col shadow-2xl" onclick="event.stopPropagation()"><div class="px-6 pt-8 pb-6 relative flex flex-col items-center bg-[#1a1a1a] text-white"><i data-lucide="infinity" class="w-6 h-6 text-white mb-4 opacity-80"></i><span class="font-bold text-[16px] tracking-[0.2em] font-serif uppercase mb-2">Co-Creator</span></div><div class="px-6 py-6 max-h-[40vh] overflow-y-auto space-y-5 hide-scrollbar bg-[#f9fafb]">${store.contacts.filter(c => !accounts.some(a => a.charId === c.id)).length > 0 ? store.contacts.filter(c => !accounts.some(a => a.charId === c.id)).map(c => `<div class="flex items-center group cursor-pointer active:opacity-50" onclick="window.bloggerActions.sendSyncInvite('${c.id}')"><img src="${c.avatar}" class="w-10 h-10 object-cover shadow-sm mr-4 shrink-0 grayscale-[10%] rounded-full" /><span class="flex-1 font-bold text-gray-900 text-[14px] font-serif tracking-widest uppercase truncate">${c.name}</span><i data-lucide="arrow-up-right" class="w-4 h-4 text-gray-300"></i></div>`).join('') : '<div class="text-center text-[11px] text-gray-400 font-serif">无可用联系人</div>'}</div></div></div>` : ''}
        </div>
    `;
}