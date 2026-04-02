// js/apps/forum.js

window.forumState = {
    view: 'list',
    activePostId: null,
    mainTab: 'home',       
    homeSubTab: 'discover',
    meSubTab: 'posts',
    showPostModal: false,
    isLoadingComments: false,
    draft: {
        title: '', text: '', mediaList: [], topic: '', 
        poll: null // { question: '', options: ['',''] }
    }
};

// 🌟 真实社交时间轴引擎
const formatForumTime = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}小时前`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}-${d.getDate()}`;
};

// 🌟 动态刷新假数据的时间，让其看起来像真实的
const dummyPosts = [
    { id: Date.now() - 600000, timestamp: Date.now() - 600000, author: '系统NPC·咖啡店长', avatar: '☕', title: '秋日上新啦，焦糖玛奇朵', content: '今天新研制的焦糖玛奇朵，采用了特选的哥伦比亚咖啡豆，不知道有没有人喜欢呢？', mediaList: [], type: 'discover', likes: 12, comments: [{id:1, timestamp: Date.now()-300000, author: '路人甲', content:'看着就很好喝！'}], isMine: false },
    { id: Date.now() - 3600000, timestamp: Date.now() - 3600000, author: '微信好友·张三', avatar: '👱‍♂️', title: '', content: '今天的天气也太好了吧！太适合出去爬山了！', mediaList: [], type: 'follow', likes: 5, comments: [], isMine: false },
];

export const renderForumApp = (store) => {
    const state = window.forumState;
    let contentHtml = '';
    let postModalHtml = '';
    let detailViewHtml = '';
    let bottomNavHtml = '';

    if (!store.forumProfile) store.forumProfile = { name: '', signature: '这里是我的个性签名，很高兴认识世界。', avatar: '', bgUrl: '' };
    if (!store.forumPosts) store.forumPosts = []; 
    if (!store.forumWorldbook) store.forumWorldbook = ''; 

    const profile = store.forumProfile;
    const defaultPersona = (store.personas && store.personas[0]) ? store.personas[0] : { name: 'User', avatar: '' };
    const displayName = profile.name || defaultPersona.name;
    const displayAvatar = profile.avatar || defaultPersona.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=Eve';

    // 🌟 头像分配引擎：角色用原生，路人用 Notion 线条随机头像
    const getCommentAvatar = (author) => {
        const char = store.contacts?.find(c => c.name === author);
        if (char && char.avatar) {
            if (char.avatar.length > 10) return `<img src="${char.avatar}" class="w-full h-full object-cover">`;
            return char.avatar; 
        }
        // 如果是路人，生成一个白底的高级线条头像
        return `<img src="https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(author)}&backgroundColor=ffffff" class="w-full h-full object-cover border border-gray-100">`;
    };

    // ==========================================
    // 🧠 AI 全局造势 & 续写引擎 (大批量评论)
    // ==========================================
    const generateAIReactions = async (postId, isAppend = false) => {
        const post = store.forumPosts.find(p => p.id === postId) || dummyPosts.find(p => p.id === postId);
        if (!post || !store.apiConfig?.apiKey) return;

        window.forumState.isLoadingComments = true; window.render();

        try {
            const charProfiles = (store.contacts || []).map(c => `名字：${c.name}\n设定：${c.prompt}`).join('\n\n');
            const coreMemories = (store.memories || []).filter(m => m.type === 'core').map(m => m.content).join('；');
            const globalWb = store.worldbook || '';
            const forumWb = store.forumWorldbook || '';

            const reqCount = isAppend ? 5 : 10;
            let postInfo = `【发帖人】${post.author}\n【标题】${post.title}\n【正文】${post.content}\n`;
            if (post.mediaList && post.mediaList.length > 0) postInfo += `【附件】${post.mediaList.map(m => m.type + (m.desc ? ':'+m.desc : '')).join('; ')}\n`;

            // ⚠️ 严禁生成 avatar，强迫 AI 只输出名字和内容
            const prompt = `你是一个真实社交平台（类似小红书/贴吧）的模拟引擎。
【世界观基础】
全局世界书：${globalWb}
论坛专有世界书：${forumWb}
核心记忆：${coreMemories}
【已知角色列表】
${charProfiles}

【当前用户发布的帖子】
${postInfo}

【任务要求】
请为这篇帖子${isAppend ? '补充生成 5 条全新的评论，绝不能与已有重复。' : '生成 10 条不同用户的评论。'}
1. 评论可包含已知角色（每人最多1条，符合其人设）。剩下由随机陌生人（自拟有趣的网名）发布，语气像真实网友。
2. 绝不要输出任何思考过程，直接输出 JSON 数组！
3. 绝对不要生成头像！严格遵循格式：[ { "author": "网名或角色名", "content": "评论内容" } ]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.88 })
            });

            if (!res.ok) throw new Error(`API报错 ${res.status}`);
            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            reply = reply.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

            const comments = JSON.parse(reply);
            if (Array.isArray(comments)) {
                let baseTime = Date.now();
                const newComments = comments.map((c, i) => ({ ...c, id: baseTime + i, timestamp: baseTime - Math.floor(Math.random() * 10000) }));
                
                if (!post.comments) post.comments = [];
                if (isAppend) post.comments.push(...newComments);
                else { post.comments = newComments; post.likes = Math.floor(Math.random() * 50) + 15; }
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {
            console.error("AI 评论生成失败:", e);
        } finally { window.forumState.isLoadingComments = false; window.render(); }
    };

    // ==========================================
    // 🧠 AI 对线引擎 (单条评论回复)
    // ==========================================
    const generateAICommentReply = async (postId, targetComment, userReplyText) => {
        const post = store.forumPosts.find(p => p.id === postId) || dummyPosts.find(p => p.id === postId);
        if (!post || !store.apiConfig?.apiKey) return;
        
        window.forumState.isLoadingComments = true; window.render();
        
        try {
            const myName = store.forumProfile.name || store.personas?.[0]?.name || '楼主';
            // 🌟 完美对齐 llm.js：使用 globalPrompt
            const globalP = store.globalPrompt || store.personas?.[0]?.prompt || '';
            const globalWb = store.worldbook || '';
            const forumWb = store.forumWorldbook || '';
            
            const char = store.contacts?.find(c => c.name === targetComment.author);
            
            let targetContext = '';
            if (char) {
                // 如果是角色，加载其专属设定和独家记忆
                const coreMemories = (store.memories || []).filter(m => m.charId === char.id && m.type === 'core').map(m => m.content).join('；');
                targetContext = `【你的身份】你是已知角色：${char.name}。你的性格设定：${char.prompt}\n【核心记忆】${coreMemories}\n`;
            } else {
                // 如果是路人，不带任何其他角色信息，死守路人人设
                targetContext = `【你的身份】你是一个论坛里的随机路人网友，网名叫做“${targetComment.author}”。请保持你之前在这个帖子里的路人/沙雕网友/杠精人设。\n`;
            }
            
            let postInfo = `【发帖人】${post.author}\n【标题】${post.title}\n【正文】${post.content}\n`;

            const prompt = `你是一个真实社交平台的模拟引擎。
【世界观基础】
全局世界书：${globalWb}
论坛专有世界书：${forumWb}

【用户人设】
名字：${myName}
设定：${globalP}

${targetContext}
【当前帖子信息】
${postInfo}

【对话上下文】
你在帖子下评论说：${targetComment.content}
用户(${myName})刚才回复你：${userReplyText}

【任务要求】
请直接给出你对用户的回复内容！
1. 必须符合你的身份设定（已知角色严守人设，路人自然像真实网友）。
2. 字数控制在50字以内，高度口语化。
3. 绝不包含任何思考过程（如<think>）或前言后语，绝不要输出JSON，直接输出回复的纯文本！`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
            });

            if (!res.ok) throw new Error(`API报错 ${res.status}`);
            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();

            const aiReplyComment = {
                id: Date.now(),
                timestamp: Date.now(),
                author: targetComment.author,
                content: reply,
                replyTo: myName
            };
            
            post.comments.push(aiReplyComment);
            if (window.actions?.saveStore) window.actions.saveStore();
        } catch (e) {
            console.error("AI 互动回复失败:", e);
        } finally { window.forumState.isLoadingComments = false; window.render(); }
    };

    // 动作引擎
    window.forumActions = {
        goBack: () => { window.actions.setCurrentApp(null); },
        openSettings: () => { window.actions?.showToast('设置面板还在开发中~'); },
        switchMainTab: (tab) => { window.forumState.mainTab = tab; window.render(); },
        switchHomeSubTab: (tab) => { window.forumState.homeSubTab = tab; window.render(); },
        switchMeSubTab: (tab) => { window.forumState.meSubTab = tab; window.render(); },
        openPrivateMessages: () => { window.actions?.showToast('进入私信列表...'); },
        
        saveName: (val) => { store.forumProfile.name = val.trim(); if (window.actions?.saveStore) window.actions.saveStore(); },
        saveSignature: (val) => { store.forumProfile.signature = val.trim(); if (window.actions?.saveStore) window.actions.saveStore(); },
        uploadAvatar: (e) => { const file = e.target.files[0]; if (!file) return; if (window.actions?.compressImage) { window.actions.compressImage(file, (b) => { store.forumProfile.avatar = b; window.render(); }, true); } },
        uploadBg: (e) => { const file = e.target.files[0]; if (!file) return; if (window.actions?.compressImage) { window.actions.compressImage(file, (b) => { store.forumProfile.bgUrl = b; window.render(); }, false); } },

        // 🌟 帖子详情与互动系统
        openPostDetail: (id) => { window.forumState.activePostId = id; window.forumState.view = 'detail'; window.render(); },
        closePostDetail: () => { window.forumState.view = 'list'; window.forumState.activePostId = null; window.render(); },
        loadMoreComments: (id) => { generateAIReactions(id, true); },
        
        // 🌟 对线系统：点击别人评论触发回复
        replyToComment: (postId, commentId) => {
            const post = store.forumPosts.find(p => p.id === postId) || dummyPosts.find(p => p.id === postId);
            if (!post) return;
            const target = post.comments.find(c => c.id === commentId);
            if (!target) return;
            
            const replyText = prompt(`回复 @${target.author}：`);
            if (!replyText || !replyText.trim()) return;

            const myName = store.forumProfile.name || store.personas?.[0]?.name || '楼主';
            post.comments.push({ id: Date.now(), timestamp: Date.now(), author: myName, content: replyText, replyTo: target.author });
            window.render();
            
            // AI 开始准备反击
            generateAICommentReply(postId, target, replyText);
        },

        // 发帖相关
        openPostModal: () => { window.forumState.showPostModal = true; window.render(); },
        closePostModal: () => { window.forumState.showPostModal = false; window.render(); },
        uploadRealImages: (e) => {
            const files = Array.from(e.target.files); if (!files.length) return;
            if (window.actions?.compressImage) { files.forEach(file => { window.actions.compressImage(file, (base64) => { window.forumState.draft.mediaList.push({ type: 'real_image', url: base64 }); window.render(); }, true); }); }
        },
        addVirtualMedia: (type) => { window.forumState.draft.mediaList.push({ type: type, desc: '' }); window.render(); },
        updateVirtualMediaDesc: (idx, val) => { window.forumState.draft.mediaList[idx].desc = val; },
        removeMedia: (idx) => { window.forumState.draft.mediaList.splice(idx, 1); window.render(); },
        addMention: () => { const name = prompt('想要 @ 谁？(输入名字)'); if(name && name.trim()) { window.forumState.draft.text += ` @${name.trim()} `; window.render(); } },
        addTopic: () => { const topic = prompt('添加话题 (无需输入#)：'); if(topic && topic.trim()) { window.forumState.draft.topic = topic.trim(); window.render(); } },
        clearTopic: () => { window.forumState.draft.topic = ''; window.render(); },
        togglePoll: () => { if (window.forumState.draft.poll) window.forumState.draft.poll = null; else window.forumState.draft.poll = { question: '', options: ['', ''] }; window.render(); },
        updatePollQuestion: (val) => { window.forumState.draft.poll.question = val; },
        addPollOption: () => { window.forumState.draft.poll.options.push(''); window.render(); },
        updatePollOption: (idx, val) => { window.forumState.draft.poll.options[idx] = val; },
        updateTitle: (val) => { window.forumState.draft.title = val; },
        updateText: (val) => { window.forumState.draft.text = val; },

        submitPost: () => {
            const draft = window.forumState.draft;
            if (!draft.title && !draft.text && draft.mediaList.length === 0) { if (window.actions?.showToast) window.actions.showToast('写点什么再发布吧~'); return; }

            const now = Date.now();
            const newPost = {
                id: now, timestamp: now, author: displayName, avatar: displayAvatar, title: draft.title, content: draft.text,
                mediaList: JSON.parse(JSON.stringify(draft.mediaList)), topic: draft.topic,
                poll: draft.poll ? JSON.parse(JSON.stringify(draft.poll)) : null,
                type: 'discover', likes: 0, comments: [], isMine: true
            };

            store.forumPosts.unshift(newPost);
            if (window.actions?.saveStore) window.actions.saveStore();

            window.forumState.showPostModal = false;
            window.forumState.draft = { title: '', text: '', mediaList: [], topic: '', poll: null };
            window.forumState.mainTab = 'home';
            window.forumState.homeSubTab = 'discover';
            window.render();
            
            if (window.actions?.showToast) window.actions.showToast('笔记发布成功！AI 网友正在火速赶来...');
            generateAIReactions(newPost.id, false);
        }
    };

    // ==========================================
    // 🧱 列表卡片组件 (首页只显示标题和图片缩略)
    // ==========================================
    const renderPostCard = (post) => {
        let mediaHtml = '';
        if (post.mediaList && post.mediaList.length > 0) {
            const covers = post.mediaList.slice(0, 2);
            const gridClass = covers.length === 2 ? 'grid grid-cols-2 gap-2' : 'w-[65%] max-w-[200px]';
            const items = covers.map(m => {
                let inner = '';
                if (m.type === 'real_image') inner = `<img src="${m.url}" class="w-full h-full object-cover" />`;
                else if (m.type === 'virtual_image') inner = `<div class="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center text-gray-400 p-2 text-center"><i data-lucide="camera" class="w-6 h-6 mb-1"></i><span class="text-[10px] leading-tight line-clamp-2">${m.desc||'照片'}</span></div>`;
                else if (m.type === 'virtual_video') inner = `<div class="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center text-gray-400 p-2 text-center"><i data-lucide="video" class="w-6 h-6 mb-1 text-blue-400"></i><span class="text-[10px] leading-tight line-clamp-2">${m.desc||'视频'}</span></div>`;
                return `<div class="relative w-full aspect-square rounded-[8px] overflow-hidden border border-gray-100 shadow-sm">${inner}</div>`;
            }).join('');
            mediaHtml = `<div class="${gridClass} mt-2 mb-3">${items}</div>`;
        }

        const avatarHtml = post.avatar.length > 10 ? `<img src="${post.avatar}" class="w-full h-full object-cover">` : post.avatar;
        const displayTitle = post.title || post.content; 

        return `
            <div class="bg-white rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 active:scale-[0.98] transition-transform cursor-pointer" onclick="window.forumActions.openPostDetail(${post.id})">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-lg border border-gray-100 overflow-hidden">${avatarHtml}</div>
                        <div><div class="text-[14px] font-extrabold text-gray-800">${post.author}</div><div class="text-[11px] font-bold text-gray-400 mt-0.5">${formatForumTime(post.timestamp)}</div></div>
                    </div>
                    ${post.isMine ? '' : `<button class="px-3 py-1 bg-gray-50 text-gray-600 text-[12px] font-extrabold rounded-full border border-gray-100 active:scale-95" onclick="event.stopPropagation()">关注</button>`}
                </div>
                ${displayTitle ? `<div class="text-[16px] font-black text-gray-900 mb-1.5 leading-snug line-clamp-2">${displayTitle}</div>` : ''}
                ${mediaHtml}
                ${post.topic ? `<div class="mt-1 mb-3 inline-flex"><span class="bg-blue-50 text-blue-500 text-[12px] font-bold px-2.5 py-1 rounded-full"><i data-lucide="hash" class="w-3 h-3 inline mr-0.5 mb-0.5"></i>${post.topic}</span></div>` : ''}
                <div class="flex items-center text-gray-400 space-x-6 mt-3">
                    <div class="flex items-center space-x-1.5"><i data-lucide="heart" class="w-5 h-5 text-gray-400"></i><span class="text-[12px] font-bold text-gray-500">${post.likes || 0}</span></div>
                    <div class="flex items-center space-x-1.5"><i data-lucide="message-circle" class="w-5 h-5 text-gray-400"></i><span class="text-[12px] font-bold text-gray-500">${post.comments ? post.comments.length : 0}</span></div>
                </div>
            </div>
        `;
    };

    // ==========================================
    // 📖 视图路由系统
    // ==========================================
    if (state.view === 'list') {
        if (state.mainTab === 'home') {
            const allDiscover = [...store.forumPosts.filter(p => p.type === 'discover'), ...dummyPosts.filter(p => p.type === 'discover')];
            const allFollow = [...store.forumPosts.filter(p => p.type === 'follow'), ...dummyPosts.filter(p => p.type === 'follow')];
            const postsToRender = state.homeSubTab === 'discover' ? allDiscover : allFollow;

            contentHtml = `
                <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 transition-colors bg-white/90">
                    <div class="cursor-pointer active:scale-90 p-1 -ml-1 text-gray-800" onclick="window.forumActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8"></i></div>
                    <div class="flex space-x-6 items-center">
                        <div onclick="window.forumActions.switchHomeSubTab('follow')" class="relative cursor-pointer transition-colors pb-1 text-[15px] ${state.homeSubTab === 'follow' ? 'text-gray-900 font-black' : 'text-gray-500 font-bold hover:text-gray-700'}">关注${state.homeSubTab === 'follow' ? '<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-gray-900 rounded-full"></div>' : ''}</div>
                        <div onclick="window.forumActions.switchHomeSubTab('discover')" class="relative cursor-pointer transition-colors pb-1 text-[15px] ${state.homeSubTab === 'discover' ? 'text-gray-900 font-black' : 'text-gray-500 font-bold hover:text-gray-700'}">发现${state.homeSubTab === 'discover' ? '<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-gray-900 rounded-full"></div>' : ''}</div>
                    </div>
                    <div class="cursor-pointer active:scale-90 p-1 -mr-1 text-gray-800" onclick="window.forumActions.openSettings()"><i data-lucide="menu" class="w-7 h-7"></i></div>
                </div>
                <div class="flex-1 overflow-y-auto bg-[#f4f5f7] p-3 space-y-3 pb-24 hide-scrollbar">
                    ${postsToRender.length > 0 ? postsToRender.map(post => renderPostCard(post)).join('') : `<div class="text-center text-gray-400 mt-10 text-[13px] font-bold">这里空空如也~</div>`}
                </div>
            `;
        } 
        else if (state.mainTab === 'me') {
            const myPosts = store.forumPosts.filter(p => p.isMine); 
            contentHtml = `
                <div class="absolute top-8 left-4 z-30 cursor-pointer active:scale-90 p-1 text-white drop-shadow-md" onclick="window.forumActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8"></i></div>
                <div class="flex-1 overflow-y-auto bg-[#f4f5f7] pb-24 hide-scrollbar relative">
                    <div class="w-full h-44 bg-gradient-to-br from-blue-50 to-indigo-100 relative cursor-pointer group" onclick="document.getElementById('forum-bg-upload').click()">${profile.bgUrl ? `<img src="${profile.bgUrl}" class="w-full h-full object-cover" />` : ''}</div>
                    <div class="bg-white px-5 pb-6 border-b border-gray-100 shadow-sm relative -mt-4 rounded-t-[20px]">
                        <div class="relative flex items-end mb-4">
                            <div class="w-20 h-20 bg-white rounded-full cursor-pointer relative z-10 -mt-10 shrink-0 shadow-sm border-2 border-white" onclick="document.getElementById('forum-avatar-upload').click()"><img src="${displayAvatar}" class="w-full h-full rounded-full object-cover bg-gray-50" /></div>
                            <div class="flex flex-col flex-1 ml-4 z-10 pb-1">
                                <input type="text" value="${displayName}" onchange="window.forumActions.saveName(this.value)" class="bg-transparent text-[20px] font-black text-gray-900 outline-none w-full placeholder-gray-400 -ml-1 transition-all focus:bg-gray-50 focus:px-2 rounded-lg" placeholder="你的昵称">
                                <input type="text" value="${profile.signature}" onchange="window.forumActions.saveSignature(this.value)" class="bg-transparent text-[12px] text-gray-500 mt-0.5 outline-none w-full placeholder-gray-400 -ml-1 transition-all focus:bg-gray-50 focus:px-2 rounded-lg" placeholder="写一句有个性的签名吧...">
                            </div>
                        </div>
                        <div class="flex items-center justify-between mt-3">
                            <div class="flex items-center space-x-6">
                                <div class="flex flex-col items-center"><span class="text-[16px] font-black text-gray-800">12</span><span class="text-[11px] font-bold text-gray-400 mt-0.5">关注</span></div>
                                <div class="flex flex-col items-center"><span class="text-[16px] font-black text-gray-800">156</span><span class="text-[11px] font-bold text-gray-400 mt-0.5">粉丝</span></div>
                                <div class="flex flex-col items-center"><span class="text-[16px] font-black text-gray-800">${myPosts.reduce((acc, p)=>acc+(p.likes||0), 0) + 3200}</span><span class="text-[11px] font-bold text-gray-400 mt-0.5">获赞</span></div>
                            </div>
                            <div onclick="window.forumActions.openPrivateMessages()" class="flex flex-col items-center justify-center w-10 h-10 bg-gray-50 rounded-full border border-gray-100 cursor-pointer active:scale-90 shadow-sm text-gray-600"><i data-lucide="mail" class="w-5 h-5"></i></div>
                        </div>
                        <input type="file" id="forum-avatar-upload" accept="image/*" class="hidden" onchange="window.forumActions.uploadAvatar(event)">
                        <input type="file" id="forum-bg-upload" accept="image/*" class="hidden" onchange="window.forumActions.uploadBg(event)">
                    </div>
                    <div class="sticky top-0 z-10 bg-white border-b border-gray-100 flex px-4 shadow-sm">
                        <div onclick="window.forumActions.switchMeSubTab('posts')" class="flex-1 py-3 text-center cursor-pointer transition-all ${state.meSubTab === 'posts' ? 'text-gray-900 font-extrabold border-b-[3px] border-gray-900' : 'text-gray-400 font-bold hover:text-gray-600'}">我的帖子</div>
                        <div onclick="window.forumActions.switchMeSubTab('bookmarks')" class="flex-1 py-3 text-center cursor-pointer transition-all ${state.meSubTab === 'bookmarks' ? 'text-gray-900 font-extrabold border-b-[3px] border-gray-900' : 'text-gray-400 font-bold hover:text-gray-600'}">我的收藏</div>
                    </div>
                    <div class="p-3 space-y-3 mt-1">
                        ${state.meSubTab === 'posts' ? (myPosts.length > 0 ? myPosts.map(p => renderPostCard(p)).join('') : `<div class="flex flex-col items-center justify-center text-gray-400 mt-10"><i data-lucide="inbox" class="w-12 h-12 mb-3 opacity-50 text-gray-300"></i><span class="text-[13px] font-bold">你还没有发过帖子哦</span></div>`) : `<div class="flex flex-col items-center justify-center text-gray-400 mt-10"><i data-lucide="inbox" class="w-12 h-12 mb-3 opacity-50 text-gray-300"></i><span class="text-[13px] font-bold">没有收藏内容</span></div>`}
                    </div>
                </div>
            `;
        }

        bottomNavHtml = `
            <div class="absolute bottom-0 left-0 right-0 h-[65px] bg-white border-t border-gray-100 flex items-center justify-around px-2 pb-safe shadow-[0_-10px_20px_rgba(0,0,0,0.02)] z-30">
                <div onclick="window.forumActions.switchMainTab('home')" class="flex flex-col items-center justify-center w-16 h-full cursor-pointer transition-colors ${state.mainTab === 'home' ? 'text-gray-900' : 'text-gray-300 hover:text-gray-500'}"><i data-lucide="home" class="w-6 h-6 mb-1 ${state.mainTab === 'home' ? 'fill-gray-900' : ''}"></i><span class="text-[10px] font-extrabold tracking-widest">首页</span></div>
                <div onclick="window.forumActions.openPostModal()" class="relative -top-4 w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shadow-xl text-white cursor-pointer active:scale-90 transition-transform border-[3px] border-white"><i data-lucide="plus" class="w-7 h-7"></i></div>
                <div onclick="window.forumActions.switchMainTab('me')" class="flex flex-col items-center justify-center w-16 h-full cursor-pointer transition-colors ${state.mainTab === 'me' ? 'text-gray-900' : 'text-gray-300 hover:text-gray-500'}"><i data-lucide="user" class="w-6 h-6 mb-1 ${state.mainTab === 'me' ? 'fill-gray-900' : ''}"></i><span class="text-[10px] font-extrabold tracking-widest">我</span></div>
            </div>
        `;
    } 
    // ==========================================
    // 📖 渲染：帖子详情页 (沉浸式+方形图库+交互评论)
    // ==========================================
    else if (state.view === 'detail') {
        const post = store.forumPosts.find(p => p.id === state.activePostId) || dummyPosts.find(p => p.id === state.activePostId);
        if (post) {
            // 🌟 核心：图片强制方形、2列并排！
            let fullMediaHtml = '';
            if (post.mediaList && post.mediaList.length > 0) {
                const items = post.mediaList.map(m => {
                    let inner = '';
                    if (m.type === 'real_image') inner = `<img src="${m.url}" class="w-full h-full object-cover rounded-[12px]" />`;
                    else if (m.type === 'virtual_image') inner = `<div class="w-full h-full bg-[#f8f9fa] rounded-[12px] flex flex-col items-center justify-center text-gray-500 border border-gray-200 p-3"><i data-lucide="camera" class="w-8 h-8 mb-2 opacity-50"></i><div class="text-[12px] font-bold line-clamp-3 text-center">${m.desc||'虚拟照片'}</div></div>`;
                    else if (m.type === 'virtual_video') inner = `<div class="w-full h-full bg-[#f8f9fa] rounded-[12px] flex flex-col items-center justify-center text-gray-500 border border-gray-200 p-3"><i data-lucide="video" class="w-8 h-8 mb-2 text-blue-400 opacity-80"></i><div class="text-[12px] font-bold line-clamp-3 text-center">${m.desc||'虚拟视频'}</div></div>`;
                    return `<div class="aspect-square shadow-sm">${inner}</div>`;
                }).join('');
                fullMediaHtml = `<div class="grid grid-cols-2 gap-2 mt-4">${items}</div>`;
            }

            let pollHtml = '';
            if (post.poll) {
                pollHtml = `
                    <div class="mt-5 bg-[#f8f9fa] border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div class="text-[15px] font-black text-gray-800 mb-3 flex items-center"><i data-lucide="bar-chart-2" class="w-4 h-4 mr-2 text-indigo-500"></i>${post.poll.question || '参与投票'}</div>
                        <div class="space-y-2.5">
                            ${post.poll.options.map(opt => `<div class="w-full bg-white border border-gray-200 rounded-[8px] px-4 py-2.5 text-[14px] font-medium text-gray-700 cursor-pointer active:bg-indigo-50 active:border-indigo-200 transition-colors shadow-sm text-center">${opt}</div>`).join('')}
                        </div>
                    </div>
                `;
            }

            // 🌟 评论交互引擎
            let commentsHtml = '';
            if (post.comments && post.comments.length > 0) {
                // 确保有时间戳
                post.comments.forEach(c => { if (!c.timestamp) c.timestamp = Date.now(); });
                // 按时间正序
                const sortedComments = post.comments.slice().sort((a,b) => a.timestamp - b.timestamp);
                
                commentsHtml = sortedComments.map(c => `
                    <div class="flex items-start space-x-3 mt-5 cursor-pointer active:bg-gray-50 transition-colors p-2 -mx-2 rounded-xl" onclick="window.forumActions.replyToComment(${post.id}, ${c.id})">
                        <div class="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-gray-100 bg-white shadow-sm">
                            ${getCommentAvatar(c.author)}
                        </div>
                        <div class="flex-1 border-b border-gray-100/60 pb-4">
                            <div class="text-[13px] font-extrabold text-gray-500">${c.author}</div>
                            <div class="text-[15px] text-gray-800 mt-1.5 leading-relaxed break-words font-medium">
                                ${c.replyTo ? `回复 <span class="text-blue-500">@${c.replyTo}</span>：` : ''}${c.content}
                            </div>
                            <div class="flex items-center justify-between mt-2">
                                <div class="text-[11px] font-bold text-gray-400">${formatForumTime(c.timestamp)}</div>
                                <i data-lucide="message-square" class="w-3.5 h-3.5 text-gray-300"></i>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            const avatarHtml = post.avatar.length > 10 ? `<img src="${post.avatar}" class="w-full h-full object-cover">` : post.avatar;

            detailViewHtml = `
                <div class="absolute inset-0 bg-white z-[65] flex flex-col animate-in slide-in-from-right-4 duration-200">
                    <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 bg-white/90">
                        <div class="cursor-pointer active:opacity-50 text-gray-600" onclick="window.forumActions.closePostDetail()"><i data-lucide="chevron-left" class="w-7 h-7"></i></div>
                        <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">${avatarHtml}</div>
                        <div class="w-7"></div>
                    </div>
                    <div class="flex-1 overflow-y-auto hide-scrollbar bg-white pb-10">
                        <div class="p-5">
                            <div class="flex items-center space-x-3 mb-5">
                                <div class="w-11 h-11 bg-gray-50 rounded-full flex items-center justify-center text-lg border border-gray-100 overflow-hidden">${avatarHtml}</div>
                                <div><div class="text-[15px] font-extrabold text-gray-800">${post.author}</div><div class="text-[11px] font-bold text-gray-400 mt-0.5">${formatForumTime(post.timestamp)}</div></div>
                                ${post.isMine ? '' : `<button class="ml-auto px-4 py-1.5 bg-white text-gray-600 border border-gray-300 text-[13px] font-extrabold rounded-full active:scale-95 shadow-sm">关注</button>`}
                            </div>
                            ${post.title ? `<div class="text-[18px] font-black text-gray-900 mb-3 leading-snug">${post.title}</div>` : ''}
                            ${post.content ? `<div class="text-[16px] text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">${post.content}</div>` : ''}
                            ${fullMediaHtml}
                            ${pollHtml}
                            ${post.topic ? `<div class="mt-4 inline-flex"><span class="bg-blue-50 text-blue-500 text-[13px] font-bold px-3 py-1.5 rounded-full"><i data-lucide="hash" class="w-3.5 h-3.5 inline mr-0.5 mb-0.5"></i>${post.topic}</span></div>` : ''}
                        </div>
                        
                        <div class="w-full h-2 bg-[#f4f5f7]"></div>
                        
                        <div class="p-5">
                            <div class="text-[15px] font-black text-gray-800 mb-2">共 ${post.comments ? post.comments.length : 0} 条评论</div>
                            ${commentsHtml}
                            <div class="mt-8 flex justify-center">
                                <button onclick="window.forumActions.loadMoreComments(${post.id})" class="px-6 py-2.5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-bold active:bg-gray-50 flex items-center shadow-sm transition-colors">
                                    <i data-lucide="loader" class="w-4 h-4 mr-1.5 ${state.isLoadingComments ? 'animate-spin' : 'hidden'}"></i>
                                    ${state.isLoadingComments ? '召唤网友中...' : '加载更多评论'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // ==========================================
    // 📝 渲染：发帖弹窗 (Post Modal)
    // ==========================================
    if (state.showPostModal) {
        postModalHtml = `
        <div class="absolute inset-0 bg-white z-[70] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 bg-white/90">
                <div class="cursor-pointer active:opacity-50 text-gray-600" onclick="window.forumActions.closePostModal()"><i data-lucide="chevron-left" class="w-7 h-7"></i></div>
                <span class="text-[16px] font-black text-gray-800 pr-2">发笔记</span>
                <div class="w-7"></div>
            </div>
            
            <div class="flex-1 overflow-y-auto flex flex-col hide-scrollbar bg-white pb-32">
                <div class="px-4 py-4 flex space-x-3 overflow-x-auto hide-scrollbar snap-x">
                    ${state.draft.mediaList.map((media, idx) => `
                        <div class="relative shrink-0 snap-center w-28 h-28 bg-gray-50 rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex-col flex items-center justify-center">
                            ${media.type === 'real_image' ? `<img src="${media.url}" class="w-full h-full object-cover" />` : media.type === 'virtual_image' ? `<i data-lucide="camera" class="w-6 h-6 text-gray-400 mb-1"></i><span class="text-[10px] text-gray-400 font-bold">虚拟照片</span><textarea onchange="window.forumActions.updateVirtualMediaDesc(${idx}, this.value)" class="absolute inset-x-0 bottom-0 h-1/2 bg-black/60 text-white text-[10px] p-1.5 outline-none resize-none placeholder-white/50 leading-tight" placeholder="描述画面...">${media.desc||''}</textarea>` : `<i data-lucide="video" class="w-6 h-6 text-blue-400 mb-1"></i><span class="text-[10px] text-gray-400 font-bold">虚拟视频</span><textarea onchange="window.forumActions.updateVirtualMediaDesc(${idx}, this.value)" class="absolute inset-x-0 bottom-0 h-1/2 bg-black/60 text-white text-[10px] p-1.5 outline-none resize-none placeholder-white/50 leading-tight" placeholder="描述运镜...">${media.desc||''}</textarea>`}
                            <div class="absolute top-1 right-1 bg-black/40 rounded-full p-1 cursor-pointer active:scale-90" onclick="window.forumActions.removeMedia(${idx})"><i data-lucide="x" class="text-white w-3 h-3"></i></div>
                        </div>
                    `).join('')}
                    <div class="shrink-0 w-28 h-28 bg-[#f8f9fa] rounded-[12px] border border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer active:bg-gray-100" onclick="document.getElementById('forum-multi-image').click()"><i data-lucide="plus" class="w-7 h-7 text-gray-400"></i></div>
                </div>

                <input type="file" id="forum-multi-image" multiple accept="image/*" class="hidden" onchange="window.forumActions.uploadRealImages(event)">

                <div class="px-4">
                    <input type="text" value="${state.draft.title}" onchange="window.forumActions.updateTitle(this.value)" class="w-full border-b border-gray-100/80 py-4 text-[18px] font-black text-gray-800 placeholder-gray-400 outline-none" placeholder="填写标题会有更多赞哦~">
                </div>
                
                <div class="px-4 pt-4 flex-1 flex flex-col">
                    <textarea rows="6" onchange="window.forumActions.updateText(this.value)" class="w-full text-[15px] text-gray-800 placeholder-gray-400 outline-none resize-none bg-transparent font-medium leading-relaxed" placeholder="添加正文">${state.draft.text}</textarea>
                    ${state.draft.topic ? `<div class="flex items-center mt-3"><span class="bg-blue-50 text-blue-500 text-[13px] font-bold px-3 py-1.5 rounded-full flex items-center shadow-sm"><i data-lucide="hash" class="w-3.5 h-3.5 mr-0.5"></i>${state.draft.topic}<i data-lucide="x" class="w-3 h-3 ml-2 cursor-pointer opacity-50 hover:opacity-100" onclick="window.forumActions.clearTopic()"></i></span></div>` : ''}
                    ${state.draft.poll ? `
                        <div class="mt-4 bg-[#f8f9fa] border border-gray-200/60 rounded-[12px] p-3 relative shadow-sm animate-in fade-in">
                            <div class="absolute top-2 right-2 bg-gray-200 rounded-full p-1 cursor-pointer hover:bg-gray-300 active:scale-90" onclick="window.forumActions.togglePoll()"><i data-lucide="x" class="text-gray-500 w-3 h-3"></i></div>
                            <span class="text-[12px] font-black text-gray-500 flex items-center mb-2"><i data-lucide="bar-chart-2" class="w-4 h-4 mr-1.5 text-indigo-500"></i>发起投票</span>
                            <input type="text" value="${state.draft.poll.question}" onchange="window.forumActions.updatePollQuestion(this.value)" placeholder="投票问题 (如：今晚吃什么？)" class="w-full bg-white border border-gray-100 px-3 py-2.5 rounded-[8px] text-[14px] font-bold outline-none mb-2 shadow-sm text-gray-800">
                            <div class="space-y-2">
                                ${state.draft.poll.options.map((opt, idx) => `<input type="text" value="${opt}" onchange="window.forumActions.updatePollOption(${idx}, this.value)" placeholder="选项 ${idx+1}" class="w-full bg-white border border-gray-100 px-3 py-2 rounded-[8px] text-[13px] outline-none font-medium shadow-sm">`).join('')}
                                <div class="text-blue-500 text-[12px] font-bold text-center mt-2 cursor-pointer py-1" onclick="window.forumActions.addPollOption()">+ 添加选项</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
                <div class="flex items-center justify-between px-6 py-3 border-b border-gray-50/50">
                    <div class="flex space-x-5 text-gray-500">
                        <i data-lucide="camera" class="w-6 h-6 cursor-pointer active:scale-90 active:text-gray-900 transition-colors" onclick="window.forumActions.addVirtualMedia('virtual_image')"></i>
                        <i data-lucide="video" class="w-6 h-6 cursor-pointer active:scale-90 active:text-gray-900 transition-colors" onclick="window.forumActions.addVirtualMedia('virtual_video')"></i>
                        <i data-lucide="at-sign" class="w-6 h-6 cursor-pointer active:scale-90 active:text-gray-900 transition-colors" onclick="window.forumActions.addMention()"></i>
                        <i data-lucide="hash" class="w-6 h-6 cursor-pointer active:scale-90 active:text-gray-900 transition-colors" onclick="window.forumActions.addTopic()"></i>
                        <i data-lucide="bar-chart-2" class="w-6 h-6 cursor-pointer active:scale-90 active:text-gray-900 transition-colors" onclick="window.forumActions.togglePoll()"></i>
                    </div>
                </div>
                <div class="px-5 py-3">
                    <button class="w-full bg-gray-900 hover:bg-black text-white text-[16px] font-bold py-3.5 rounded-full active:scale-[0.98] transition-transform shadow-lg shadow-gray-900/30" onclick="window.forumActions.submitPost()">发布笔记</button>
                </div>
            </div>
        </div>
        `;
    }

    return `
        <div class="w-full h-full flex flex-col relative overflow-hidden bg-white animate-in slide-in-from-right-4 duration-300 z-[60]">
            ${contentHtml}
            ${detailViewHtml}
            ${bottomNavHtml}
            ${postModalHtml}
        </div>
    `;
};

window.renderForum = () => { if(window.render) window.render(); };