// js/apps/forum.js

window.forumState = {
    view: 'list',
    activePostId: null,
    mainTab: 'home',       
    homeSubTab: 'discover',
    meSubTab: 'posts',
    showPostModal: false,
    shareModalPostId: null, 
    isLoadingComments: false,
    isRefreshingPosts: false, 
    
    activeForumId: 'default',
    showSidebar: false,
    showForumSettingsModal: false,
    editingForumDraft: null, 
    settingsScrollTop: 0,
    replyingToCommentId: null, 
    
    followPageSize: 10,
    
    draft: {
        title: '', text: '', mediaList: [], topic: '', poll: null 
    }
};

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

export const renderForumApp = (store) => {
    const state = window.forumState;
    
    let contentHtml = '';
    let postModalHtml = '';
    let detailViewHtml = '';
    let bottomNavHtml = '';
    let shareModalHtml = '';
    let sidebarHtml = '';
    let forumSettingsModalHtml = '';

    if (!store.forumProfile) store.forumProfile = { name: '', signature: '这里是我的个性签名，很高兴认识世界。', avatar: '', bgUrl: '' };
    if (!store.forumPosts) store.forumPosts = []; 
    if (!store.forumBookmarks) store.forumBookmarks = []; 
    
    if (!store.forums || store.forums.length === 0) {
        store.forums = [{ id: 'default', name: 'little univers', topic: '综合闲聊日常', userPersonaId: store.personas?.[0]?.id || null, includedCharIds: store.contacts?.map(c => c.id) || [], mountedWorldbookIds: [] }];
    }
    if (!store.forums.find(f => f.id === state.activeForumId)) state.activeForumId = store.forums[0].id;
    const activeForum = store.forums.find(f => f.id === state.activeForumId);

    const profile = store.forumProfile;
    const forumPersona = store.personas?.find(p => p.id === activeForum.userPersonaId) || store.personas?.[0] || { name: 'User', avatar: '' };
    const displayName = profile.name || forumPersona.name;
    const displayAvatar = profile.avatar || forumPersona.avatar || 'https://api.dicebear.com/7.x/lorelei/svg?seed=Eve';

    // 🌟 在这里更改路人头像的风格！把 lorelei 换成你喜欢的库名
    const getCommentAvatar = (author) => {
        const char = store.contacts?.find(c => c.name === author);
        if (char && char.avatar) return char.avatar.length > 10 ? `<img src="${char.avatar}" class="w-full h-full object-cover">` : char.avatar; 
        return `<img src="https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(author)}&backgroundColor=ffffff" class="w-full h-full object-cover border border-gray-100">`;
    };

    const scrollToDetailBottom = () => { setTimeout(() => { const el = document.getElementById('forum-detail-scroll'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, 100); };

    // ==========================================
    // 🧠 AI 全量刷帖引擎 
    // ==========================================
    const generateAIPosts = async (targetForumId) => {
        const forum = store.forums.find(f => f.id === targetForumId);
        if (!forum || !store.apiConfig?.apiKey) return;

        store.forumPosts = store.forumPosts.filter(p => {
            if (p.forumId !== targetForumId) return true; 
            if (p.type === 'discover' && !p.isMine && !store.forumBookmarks.includes(p.id)) return false; 
            return true;
        });

        try {
            const globalWb = (store.worldbooks || []).filter(w => w.type === 'global' && w.enabled).map(w => w.content).join('\n');
            const localWb = (store.worldbooks || []).filter(w => w.type === 'local' && forum.mountedWorldbookIds?.includes(w.id)).map(w => w.content).join('\n');
            
            let validContacts = store.contacts || [];
            if (forum.includedCharIds && forum.includedCharIds.length > 0) validContacts = validContacts.filter(c => forum.includedCharIds.includes(c.id));
            const charProfiles = validContacts.map(c => `名字：${c.name}\n设定：${c.prompt}`).join('\n\n');

            const prompt = `你是一个真实社交平台的模拟引擎。
【频道主题/世界观】
${forum.topic || '综合闲聊'}
【全局与局部世界书】
${globalWb}\n${localWb}
【参与的已知角色】
${charProfiles || '无'}

【任务】
为该频道生成一批全新的帖子，总数 = ${10 + validContacts.length} 篇。
要求：
1. 其中 ${validContacts.length} 篇由上述“已知角色”发布（每人必须发1篇，"type"填"follow"）。
2. 另外 10 篇由“随机路人”（自拟真实网名）发布（"type"填"discover"）。
3. 这批帖子中必须混合出现【纯文字帖】、【附带虚拟照片】、【附带虚拟视频】、【投票调查贴】！
4. 绝不要输出思考过程，直接输出纯 JSON 数组！
5. 每篇帖子的正文(content)必须不少于100字！极其符合人设和频道主题！

格式：
[
  {
     "author": "名字",
     "type": "follow" (角色) 或 "discover" (路人),
     "title": "帖子标题 (投票贴须加【投票】前缀)",
     "content": "正文内容不少于100字...",
     "mediaList": [ {"type": "virtual_image"或"virtual_video", "desc": "描述"} ],
     "topic": "话题标签",
     "poll": { "question": "问题", "options": ["选项1", "选项2"] }
  }
]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            reply = reply.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

            const parsedPosts = JSON.parse(reply);
            if (Array.isArray(parsedPosts)) {
                let baseTime = Date.now();
                const newPosts = parsedPosts.map((p, i) => {
                    const char = store.contacts?.find(c => c.name === p.author);
                    const avatarUrl = (char && char.avatar) ? char.avatar : `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(p.author)}&backgroundColor=ffffff`;
                    
                    const post = {
                        ...p,
                        id: baseTime - i * 100 + Math.floor(Math.random() * 100),
                        timestamp: baseTime - Math.floor(Math.random() * 7200000), 
                        forumId: targetForumId,
                        avatar: avatarUrl,
                        likes: Math.floor(Math.random() * 100),
                        comments: [], 
                        isMine: false
                    };
                    
                    if (post.poll && Array.isArray(post.poll.options)) {
                        post.poll.votes = post.poll.options.map(() => Math.floor(Math.random() * 50));
                        post.poll.totalVotes = post.poll.votes.reduce((a,b)=>a+b, 0);
                        post.poll.hasVoted = false;
                    } else post.poll = null;
                    if (!Array.isArray(post.mediaList)) post.mediaList = [];
                    
                    return post;
                });

                store.forumPosts.unshift(...newPosts);
                if (window.actions?.saveStore) window.actions.saveStore();
                if (window.actions?.showToast) window.actions.showToast(`🎉 频道 [${forum.name}] 刷新了 ${newPosts.length} 条新帖！`);
            }
        } catch (e) {
            if (window.actions?.showToast) window.actions.showToast('刷新帖子失败');
        } finally { window.forumState.isRefreshingPosts = false; window.render(); }
    };

    // ==========================================
    // 🧠 AI 评论生成引擎
    // ==========================================
    const generateAIReactions = async (postId, isAppend = false) => {
        const post = store.forumPosts.find(p => p.id === postId);
        if (!post || !store.apiConfig?.apiKey) return;
        window.forumState.isLoadingComments = true; window.render();

        try {
            const charProfiles = (store.contacts || []).map(c => `名字：${c.name}\n设定：${c.prompt}`).join('\n\n');
            const coreMemories = (store.memories || []).filter(m => m.type === 'core').map(m => m.content).join('；');
            const globalWb = store.worldbook || '';
            const forumWb = store.forumWorldbook || '';

            let postInfo = `【发帖人】${post.author}\n【标题】${post.title}\n【正文】${post.content}\n`;
            if (post.mediaList && post.mediaList.length > 0) postInfo += `【附件】${post.mediaList.map(m => m.type + (m.desc ? ':'+m.desc : '')).join('; ')}\n`;

            let existingCommentsText = '';
            if (post.comments && post.comments.length > 0) {
                existingCommentsText = post.comments.map(c => `[${c.author}] ${c.replyTo ? '回复@'+c.replyTo+'：' : '评论：'}${c.content}`).join('\n');
            }

            const prompt = `你是一个真实社交平台的模拟引擎。
【世界观基础】
全局世界书：${globalWb}
论坛专有世界书：${forumWb}
核心记忆：${coreMemories}
【已知角色列表】
${charProfiles}
【当前帖子】
${postInfo}
${existingCommentsText ? `\n【目前已有评论记录】\n${existingCommentsText}\n` : ''}

【任务】
为这篇帖子${isAppend ? '补充生成 10 条全新的评论。' : '生成 10 条不同用户的评论。'}
1. 可包含已知角色（每人最多1条）。剩下由随机路人（自拟网名）发布。
2. 如果上方提供了已有评论，新评论必须针对这些评论进行部分点评、反驳或互怼！
3. 绝不要输出思考过程，直接输出 JSON 数组！绝对不要生成头像！
格式：[ { "author": "网名或角色名", "content": "评论内容" } ]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.88 })
            });

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
                
                if (post.poll && post.poll.options.length > 0) {
                    const votesToAdd = comments.length * 2 + Math.floor(Math.random() * 10);
                    for (let i = 0; i < votesToAdd; i++) {
                        const rIdx = Math.floor(Math.random() * post.poll.options.length);
                        post.poll.votes[rIdx]++; post.poll.totalVotes++;
                    }
                }
                if (window.actions?.saveStore) window.actions.saveStore();
            }
        } catch (e) {} finally { window.forumState.isLoadingComments = false; window.render(); scrollToDetailBottom(); }
    };

    const generateAICommentReply = async (postId, targetComment, userReplyText) => {
        const post = store.forumPosts.find(p => p.id === postId);
        if (!post || !store.apiConfig?.apiKey) return;
        window.forumState.isLoadingComments = true; window.render(); scrollToDetailBottom();
        
        try {
            const globalP = store.globalPrompt || '';
            const char = store.contacts?.find(c => c.name === targetComment.author);
            let targetContext = char ? `【你的身份】你是已知角色：${char.name}。你的设定：${char.prompt}\n` : `【你的身份】你是论坛里的路人网友“${targetComment.author}”。请保持路人/杠精/沙雕网友人设。\n`;
            
            let actionContext = targetComment.isPost 
                ? `用户(${displayName})刚才在你的帖子里评论了你：${userReplyText}` 
                : `你在帖子下评论说：${targetComment.content}\n用户(${displayName})刚才回复你：${userReplyText}`;

            const prompt = `你是一个社交平台的模拟引擎。\n【论坛主题】${activeForum.topic || '综合闲聊日常'}\n【用户人设】名字：${displayName}\n全局性格：${globalP}\n${targetContext}\n【帖子内容】标题：${post.title||'无'} 正文：${post.content}\n【对话上下文】\n${actionContext}\n\n【任务】\n给出你对用户的回复！符合身份，50字内口语化。不包含<think>，只输出纯文本！`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();

            post.comments.push({ id: Date.now(), timestamp: Date.now(), author: targetComment.author, content: reply, replyTo: displayName });
            if (window.actions?.saveStore) window.actions.saveStore();
        } catch (e) {} finally { window.forumState.isLoadingComments = false; window.render(); scrollToDetailBottom(); }
    };

    window.forumActions = {
        goBack: () => { window.actions.setCurrentApp(null); },
        
        refreshPosts: (forumId) => {
            if (window.forumState.isRefreshingPosts) return window.actions?.showToast('正在拉取最新帖子，请稍候...');
            window.forumState.isRefreshingPosts = true;
            window.render();
            if (window.actions?.showToast) window.actions.showToast('正在拉取最新帖子，请稍候...');
            generateAIPosts(forumId);
        },
        
        deletePost: (postId) => {
            if (confirm("确定要删除这条帖子吗？")) {
                store.forumPosts = store.forumPosts.filter(p => p.id !== postId);
                const bIdx = store.forumBookmarks.indexOf(postId);
                if (bIdx > -1) store.forumBookmarks.splice(bIdx, 1);
                if (window.forumState.activePostId === postId) { window.forumState.view = 'list'; window.forumState.activePostId = null; }
                if (window.actions?.saveStore) window.actions.saveStore();
                window.render();
            }
        },
        deleteComment: (postId, commentId) => {
            if (!confirm("确定要删除这条评论吗？")) return;
            const post = store.forumPosts.find(p => p.id === postId);
            if (post) {
                post.comments = post.comments.filter(c => c.id !== commentId);
                if (window.actions?.saveStore) window.actions.saveStore();
                window.render();
            }
        },
        
        // 🌟 频道删除逻辑
        deleteForum: (forumId) => {
            if (forumId === 'default') return window.actions?.showToast('默认频道不可删除哦！');
            if (confirm("确定要删除这个频道吗？里面的所有帖子和数据都将被永久清空！")) {
                store.forums = store.forums.filter(f => f.id !== forumId);
                store.forumPosts = store.forumPosts.filter(p => p.forumId !== forumId);
                // 同步清理已失效的收藏贴
                const validPostIds = store.forumPosts.map(p => p.id);
                store.forumBookmarks = store.forumBookmarks.filter(id => validPostIds.includes(id));
                
                if (window.forumState.activeForumId === forumId) {
                    window.forumState.activeForumId = 'default';
                    window.forumState.mainTab = 'home';
                }
                if (window.actions?.saveStore) window.actions.saveStore();
                window.render();
            }
        },

        loadMoreFollow: () => { window.forumState.followPageSize += 10; window.render(); },

        toggleSidebar: () => { window.forumState.showSidebar = !window.forumState.showSidebar; window.render(); },
        switchForum: (forumId) => { window.forumState.activeForumId = forumId; window.forumState.showSidebar = false; window.forumState.mainTab = 'home'; window.render(); },
        openForumSettings: (forumId) => {
            const isNew = forumId === null;
            if (isNew) window.forumState.editingForumDraft = { id: null, name: '', topic: '', userPersonaId: store.personas?.[0]?.id || null, includedCharIds: store.contacts?.map(c => c.id) || [], mountedWorldbookIds: [] };
            else window.forumState.editingForumDraft = JSON.parse(JSON.stringify(store.forums.find(x => x.id === forumId)));
            window.forumState.showForumSettingsModal = true; window.render();
        },
        closeForumSettings: () => { window.forumState.showForumSettingsModal = false; window.forumState.editingForumDraft = null; window.render(); },
        saveForumSettings: () => {
            const d = window.forumState.editingForumDraft;
            if (!d.name.trim()) return window.actions?.showToast('频道名字不能为空哦！');
            if (d.id === null) { d.id = 'forum_' + Date.now(); store.forums.push(d); window.forumState.activeForumId = d.id; }
            else { const idx = store.forums.findIndex(x => x.id === d.id); if (idx > -1) store.forums[idx] = d; }
            if (window.actions?.saveStore) window.actions.saveStore();
            window.forumActions.closeForumSettings();
        },
        updateDraftField: (field, val) => { window.forumState.editingForumDraft[field] = val; },
        toggleDraftArray: (field, val) => {
            if (!window.forumState.editingForumDraft[field]) window.forumState.editingForumDraft[field] = [];
            const arr = window.forumState.editingForumDraft[field];
            const parsedVal = isNaN(Number(val)) || val.trim() === '' ? val : Number(val);
            const idx = arr.findIndex(item => String(item) === String(val));
            if (idx > -1) arr.splice(idx, 1); else arr.push(parsedVal);
            window.render();
        },

        switchMainTab: (tab) => { window.forumState.mainTab = tab; window.render(); },
        switchHomeSubTab: (tab) => { window.forumState.homeSubTab = tab; window.render(); },
        switchMeSubTab: (tab) => { window.forumState.meSubTab = tab; window.render(); },
        openPrivateMessages: () => { window.actions?.showToast('进入私信列表...'); },
        saveName: (val) => { store.forumProfile.name = val.trim(); if (window.actions?.saveStore) window.actions.saveStore(); },
        saveSignature: (val) => { store.forumProfile.signature = val.trim(); if (window.actions?.saveStore) window.actions.saveStore(); },
        uploadAvatar: (e) => { const file = e.target.files[0]; if (!file) return; if (window.actions?.compressImage) { window.actions.compressImage(file, (b) => { store.forumProfile.avatar = b; window.render(); }, true); } },
        uploadBg: (e) => { const file = e.target.files[0]; if (!file) return; if (window.actions?.compressImage) { window.actions.compressImage(file, (b) => { store.forumProfile.bgUrl = b; window.render(); }, false); } },

        openPostDetail: (id) => { 
            window.forumState.activePostId = id; window.forumState.view = 'detail'; window.forumState.replyingToCommentId = null; window.render(); 
            const post = store.forumPosts.find(p => p.id === id);
            if (post && (!post.comments || post.comments.length === 0)) generateAIReactions(post.id, false); 
        },
        closePostDetail: () => { window.forumState.view = 'list'; window.forumState.activePostId = null; window.render(); },
        loadMoreComments: (id) => { generateAIReactions(id, true); },
        
        openReplyInput: (commentId) => {
            window.forumState.replyingToCommentId = window.forumState.replyingToCommentId === commentId ? null : commentId;
            window.render();
            if (window.forumState.replyingToCommentId) {
                setTimeout(() => { const el = document.getElementById(`forum-reply-input-${commentId}`); if (el) el.focus(); }, 50);
            }
        },
        submitReply: (postId, commentId) => {
            const input = document.getElementById(`forum-reply-input-${commentId}`);
            if (!input || !input.value.trim()) return;
            const replyText = input.value.trim();

            const post = store.forumPosts.find(p => p.id === postId);
            if (!post) return;
            const target = post.comments.find(c => c.id === commentId);
            if (!target) return;

            post.comments.push({ id: Date.now(), timestamp: Date.now(), author: displayName, content: replyText, replyTo: target.author });
            window.forumState.replyingToCommentId = null;
            window.render(); scrollToDetailBottom();
            generateAICommentReply(postId, target, replyText);
        },
        commentOnPost: (postId) => {
            const input = document.getElementById(`forum-post-comment-input-${postId}`);
            if (!input || !input.value.trim()) return;
            const replyText = input.value.trim();

            const post = store.forumPosts.find(p => p.id === postId);
            if (!post) return;

            post.comments.push({ id: Date.now(), timestamp: Date.now(), author: displayName, content: replyText.trim() });
            window.render(); scrollToDetailBottom();
            
            if (!post.isMine) {
                generateAICommentReply(postId, { author: post.author, content: post.title || post.content, isPost: true }, replyText.trim());
            }
        },

        votePoll: (postId, optIdx) => {
            const post = store.forumPosts.find(p => p.id === postId);
            if (!post || !post.poll || post.poll.hasVoted) return;
            post.poll.votes[optIdx]++; post.poll.totalVotes++; post.poll.hasVoted = true;
            if (window.actions?.saveStore) window.actions.saveStore(); window.render();
        },

        toggleBookmark: (postId) => {
            const idx = store.forumBookmarks.indexOf(postId);
            if (idx > -1) store.forumBookmarks.splice(idx, 1); else store.forumBookmarks.unshift(postId);
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(idx > -1 ? '已取消收藏' : '已添加到我的收藏');
            window.render();
        },
        openShareModal: (postId) => { window.forumState.shareModalPostId = postId; window.render(); },
        closeShareModal: () => { window.forumState.shareModalPostId = null; window.render(); },
        shareToChat: (chatId) => {
            const chat = store.chats.find(c => c.charId === chatId);
            const post = store.forumPosts.find(p => p.id === window.forumState.shareModalPostId);
            if (chat && post) {
                chat.messages.push({
                    id: Date.now(), sender: store.personas[0].name, isMe: true, msgType: 'forum_post_card',
                    cardData: { title: post.title || '无标题笔记', contentSnippet: post.content ? post.content.substring(0, 30) + '...' : '分享了一篇笔记', author: post.author, postId: post.id },
                    text: `[分享帖子] ${post.title || post.content.substring(0, 15) + '...'}`, timestamp: Date.now()
                });
                if(window.actions?.saveStore) window.actions.saveStore();
                if(window.actions?.showToast) window.actions.showToast('已转发到微信！');
            }
            window.forumState.shareModalPostId = null; window.render();
        },

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
            if (!draft.title && !draft.text && draft.mediaList.length === 0) return window.actions?.showToast('写点什么再发布吧~');

            let finalTitle = draft.title;
            if (draft.poll && !finalTitle.startsWith('【投票】')) finalTitle = `【投票】${finalTitle || '参与调查'}`;

            const now = Date.now();
            const newPost = {
                id: now, timestamp: now, forumId: state.activeForumId, author: displayName, avatar: displayAvatar, 
                title: finalTitle, content: draft.text,
                mediaList: JSON.parse(JSON.stringify(draft.mediaList)), topic: draft.topic,
                poll: draft.poll ? { ...JSON.parse(JSON.stringify(draft.poll)), votes: draft.poll.options.map(()=>0), totalVotes: 0, hasVoted: false } : null,
                type: 'discover', likes: 0, comments: [], isMine: true
            };

            store.forumPosts.unshift(newPost);
            if (window.actions?.saveStore) window.actions.saveStore();

            window.forumState.showPostModal = false;
            window.forumState.draft = { title: '', text: '', mediaList: [], topic: '', poll: null };
            window.forumState.mainTab = 'home';
            window.forumState.homeSubTab = 'discover';
            window.render();
            
            if (window.actions?.showToast) window.actions.showToast('笔记发布成功！网友正在火速赶来...');
            generateAIReactions(newPost.id, false);
        }
    };

    // ==========================================
    // 🧱 列表卡片组件
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
                    <div class="cursor-pointer p-1 active:scale-90" onclick="event.stopPropagation(); window.forumActions.deletePost(${post.id})">
                        <i data-lucide="trash-2" class="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors"></i>
                    </div>
                </div>
                ${displayTitle ? `<div class="text-[16px] font-black text-gray-900 mb-1.5 leading-snug line-clamp-2">${displayTitle}</div>` : ''}
                ${mediaHtml}
                ${post.topic ? `<div class="mt-1 mb-3 inline-flex"><span class="bg-blue-50 text-blue-500 text-[12px] font-bold px-2.5 py-1 rounded-full"><span class="mr-0.5 opacity-80">#</span>${post.topic.replace(/^#+/, '').trim()}</span></div>` : ''}
                <div class="flex items-center text-gray-400 space-x-6 mt-3">
                    <div class="flex items-center space-x-1.5"><i data-lucide="heart" class="w-5 h-5 text-gray-400"></i><span class="text-[12px] font-bold text-gray-500">${post.likes || 0}</span></div>
                    <div class="flex items-center space-x-1.5"><i data-lucide="message-circle" class="w-5 h-5 text-gray-400"></i><span class="text-[12px] font-bold text-gray-500">${post.comments ? post.comments.length : 0}</span></div>
                </div>
            </div>
        `;
    };

    // ==========================================
    // 📖 视图路由：主列表
    // ==========================================
    if (state.view === 'list') {
        const currentForumPosts = store.forumPosts.filter(p => p.forumId === state.activeForumId);

        if (state.mainTab === 'home') {
            let postsToRender = [];
            let loadMoreHtml = '';

            if (state.homeSubTab === 'discover') {
                let allDiscover = currentForumPosts.filter(p => p.type === 'discover' && !p.isMine);
                postsToRender = allDiscover.filter(p => !store.forumBookmarks.includes(p.id));
            } else {
                const allFollow = currentForumPosts.filter(p => p.type === 'follow');
                postsToRender = allFollow.slice(0, state.followPageSize);
                if (allFollow.length > state.followPageSize) {
                    loadMoreHtml = `<div class="flex justify-center mt-6 mb-8"><button class="px-5 py-2 bg-white border border-gray-200 rounded-full text-gray-500 text-[12px] font-bold shadow-sm active:bg-gray-50 transition-colors" onclick="window.forumActions.loadMoreFollow()">加载更早帖子</button></div>`;
                } else if (postsToRender.length > 0) {
                    loadMoreHtml = `<div class="text-center text-gray-400 mt-6 mb-8 text-[12px] font-bold">没有更多了</div>`;
                }
            }

            contentHtml = `
                <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 transition-colors bg-white/90">
                    <div class="cursor-pointer active:scale-90 p-1 -ml-1 text-gray-800" onclick="window.forumActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8"></i></div>
                    <div class="flex space-x-6 items-center">
                        <div onclick="window.forumActions.switchHomeSubTab('follow')" class="relative cursor-pointer transition-colors pb-1 text-[15px] ${state.homeSubTab === 'follow' ? 'text-gray-900 font-black' : 'text-gray-500 font-bold hover:text-gray-700'}">关注${state.homeSubTab === 'follow' ? '<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-gray-900 rounded-full"></div>' : ''}</div>
                        <div onclick="window.forumActions.switchHomeSubTab('discover')" class="relative cursor-pointer transition-colors pb-1 text-[15px] ${state.homeSubTab === 'discover' ? 'text-gray-900 font-black' : 'text-gray-500 font-bold hover:text-gray-700'}">发现${state.homeSubTab === 'discover' ? '<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-gray-900 rounded-full"></div>' : ''}</div>
                    </div>
                    <div class="cursor-pointer active:scale-90 p-1 -mr-1 text-gray-800" onclick="window.forumActions.toggleSidebar()"><i data-lucide="menu" class="w-7 h-7"></i></div>
                </div>
                <div id="forum-home-scroll" class="flex-1 overflow-y-auto bg-[#f4f5f7] p-3 pb-24 hide-scrollbar relative">
                    <div class="px-2 pt-1 pb-3 flex items-center justify-between opacity-50">
                        <span class="text-[12px] font-black tracking-widest text-gray-500">当前频道：${activeForum.name}</span>
                    </div>
                    <div class="space-y-3">
                        ${postsToRender.length > 0 ? postsToRender.map(post => renderPostCard(post)).join('') : `<div class="flex flex-col items-center justify-center text-gray-400 mt-20"><i data-lucide="inbox" class="w-12 h-12 mb-3 opacity-50 text-gray-300"></i><span class="text-[13px] font-bold">这里空空如也，点右下角刷新看看吧~</span></div>`}
                    </div>
                    ${loadMoreHtml}
                </div>
                
                <div class="absolute bottom-24 right-5 z-40">
                    <div onclick="window.forumActions.refreshPosts('${state.activeForumId}')" class="w-12 h-12 bg-white rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.1)] border border-gray-100 flex items-center justify-center cursor-pointer active:scale-90 transition-transform ${state.isRefreshingPosts ? 'opacity-50 pointer-events-none' : ''}">
                        <i data-lucide="refresh-cw" class="w-5 h-5 text-gray-800 ${state.isRefreshingPosts ? 'animate-spin' : ''}"></i>
                    </div>
                </div>
            `;
        } 
        else if (state.mainTab === 'me') {
            const myPosts = currentForumPosts.filter(p => p.isMine); 
            const myBookmarks = store.forumBookmarks.map(id => store.forumPosts.find(p => p.id === id)).filter(p => p && p.forumId === state.activeForumId);
            
            contentHtml = `
                <div class="absolute top-8 left-4 z-30 cursor-pointer active:scale-90 p-1 text-white drop-shadow-md" onclick="window.forumActions.goBack()"><i data-lucide="chevron-left" class="w-8 h-8"></i></div>
                <div id="forum-me-scroll" class="flex-1 overflow-y-auto bg-[#f4f5f7] pb-24 hide-scrollbar relative">
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
                        ${state.meSubTab === 'posts' ? (myPosts.length > 0 ? myPosts.map(p => renderPostCard(p)).join('') : `<div class="flex flex-col items-center justify-center text-gray-400 mt-10"><i data-lucide="inbox" class="w-12 h-12 mb-3 opacity-50 text-gray-300"></i><span class="text-[13px] font-bold">你还没有发过帖子哦</span></div>`) : (myBookmarks.length > 0 ? myBookmarks.map(p => renderPostCard(p)).join('') : `<div class="flex flex-col items-center justify-center text-gray-400 mt-10"><i data-lucide="inbox" class="w-12 h-12 mb-3 opacity-50 text-gray-300"></i><span class="text-[13px] font-bold">没有收藏内容</span></div>`)}
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
    // 📖 渲染：帖子详情页 (折叠回复、原位评论、纸飞机统一)
    // ==========================================
    else if (state.view === 'detail') {
        const post = store.forumPosts.find(p => p.id === state.activePostId);
        if (post) {
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
                const isVoted = post.poll.hasVoted;
                pollHtml = `
                    <div class="mt-5 bg-[#f8f9fa] border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div class="text-[15px] font-black text-gray-800 mb-3 flex items-center"><i data-lucide="bar-chart-2" class="w-4 h-4 mr-2 text-indigo-500"></i>${post.poll.question || '参与投票'}</div>
                        <div class="space-y-2.5">
                            ${post.poll.options.map((opt, idx) => {
                                const pct = isVoted && post.poll.totalVotes > 0 ? Math.round((post.poll.votes[idx] / post.poll.totalVotes) * 100) : 0;
                                return `
                                <div class="w-full bg-white border ${isVoted ? 'border-indigo-100' : 'border-gray-200'} rounded-[8px] overflow-hidden relative text-[14px] font-medium text-gray-700 cursor-pointer ${!isVoted ? 'active:bg-indigo-50 active:border-indigo-200' : ''} transition-colors shadow-sm" ${!isVoted ? `onclick="window.forumActions.votePoll(${post.id}, ${idx})"` : ''}>
                                    ${isVoted ? `<div class="absolute top-0 left-0 bottom-0 bg-indigo-50" style="width: ${pct}%"></div>` : ''}
                                    <div class="relative px-4 py-2.5 flex justify-between">
                                        <span>${opt}</span>
                                        ${isVoted ? `<span class="text-indigo-500 font-black">${pct}%</span>` : ''}
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                        ${isVoted ? `<div class="text-[11px] text-gray-400 mt-3 text-center font-bold tracking-widest">${post.poll.totalVotes} 人参与了投票</div>` : ''}
                    </div>
                `;
            }

            let commentsHtml = '';
            if (post.comments && post.comments.length > 0) {
                post.comments.forEach(c => { if (!c.timestamp) c.timestamp = Date.now(); });
                const sortedComments = post.comments.slice().sort((a,b) => a.timestamp - b.timestamp);
                commentsHtml = sortedComments.map(c => {
                    const isReplying = state.replyingToCommentId === c.id;
                    
                    // 🌟 统一为蓝色的纸飞机按钮
                    const replyInputHtml = isReplying ? `
                        <div class="mt-3 mb-1 flex items-center animate-in slide-in-from-top-2 duration-200" onclick="event.stopPropagation()">
                            <input type="text" id="forum-reply-input-${c.id}" autofocus class="flex-1 bg-[#f4f5f7] border border-transparent rounded-full px-3 py-1.5 text-[13px] outline-none text-gray-800 placeholder-gray-400 transition-colors focus:bg-white focus:border-gray-200 shadow-inner" placeholder="回复 @${c.author}..." onkeydown="if(event.key==='Enter') window.forumActions.submitReply(${post.id}, ${c.id})">
                            <div class="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform shadow-sm shrink-0 ml-2" onclick="window.forumActions.submitReply(${post.id}, ${c.id})">
                                <i data-lucide="send" class="w-4 h-4 mr-0.5 mt-0.5"></i>
                            </div>
                        </div>
                    ` : '';

                    return `
                    <div class="flex items-start space-x-3 mt-5 cursor-pointer active:bg-gray-50 transition-colors p-2 -mx-2 rounded-xl" onclick="window.forumActions.openReplyInput(${c.id})">
                        <div class="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-gray-100 bg-white shadow-sm">${getCommentAvatar(c.author)}</div>
                        <div class="flex-1 border-b border-gray-100/60 pb-4">
                            <div class="flex items-center justify-between">
                                <div class="text-[13px] font-extrabold text-gray-500">${c.author}</div>
                            </div>
                            <div class="text-[15px] text-gray-800 mt-1.5 leading-relaxed break-words font-medium">
                                ${c.replyTo ? `回复 <span class="text-blue-500">@${c.replyTo}</span>：` : ''}${c.content}
                            </div>
                            ${replyInputHtml}
                            <div class="flex items-center justify-between mt-2">
                                <div class="text-[11px] font-bold text-gray-400">${formatForumTime(c.timestamp)}</div>
                                <div class="flex items-center">
                                    <i data-lucide="message-square" class="w-3.5 h-3.5 text-gray-300 mr-4"></i>
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5 text-gray-300 hover:text-red-500 active:scale-90 transition-colors" onclick="event.stopPropagation(); window.forumActions.deleteComment(${post.id}, ${c.id})"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                `}).join('');
            }

            const avatarHtml = post.avatar.length > 10 ? `<img src="${post.avatar}" class="w-full h-full object-cover">` : post.avatar;
            const isBookmarked = store.forumBookmarks.includes(post.id);

            detailViewHtml = `
                <div class="absolute inset-0 bg-white z-[65] flex flex-col animate-in slide-in-from-right-4 duration-200">
                    <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 bg-white/90 relative">
                        <div class="cursor-pointer active:opacity-50 text-gray-600 w-8" onclick="window.forumActions.closePostDetail()"><i data-lucide="chevron-left" class="w-7 h-7"></i></div>
                        <span class="text-[16px] font-black text-gray-800 absolute left-1/2 -translate-x-1/2">详情</span>
                        <div class="w-8"></div>
                    </div>
                    <div id="forum-detail-scroll" class="flex-1 overflow-y-auto hide-scrollbar bg-white">
                        <div class="p-5">
                            <div class="flex items-center mb-5">
                                <div class="w-11 h-11 bg-gray-50 rounded-full flex items-center justify-center text-lg border border-gray-100 overflow-hidden shrink-0">${avatarHtml}</div>
                                <div class="ml-3 flex-1 flex flex-col justify-center">
                                    <div class="text-[15px] font-extrabold text-gray-800">${post.author}</div>
                                    <div class="text-[11px] font-bold text-gray-400 mt-0.5">${formatForumTime(post.timestamp)}</div>
                                </div>
                                <div class="flex space-x-3 items-center ml-auto">
                                    <i data-lucide="trash-2" class="w-5 h-5 cursor-pointer active:scale-90 transition-transform text-gray-400 hover:text-red-500" onclick="window.forumActions.deletePost(${post.id})"></i>
                                    <i data-lucide="star" class="w-5 h-5 cursor-pointer active:scale-90 transition-transform ${isBookmarked ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-gray-600'}" onclick="window.forumActions.toggleBookmark(${post.id})"></i>
                                    <i data-lucide="share" class="w-5 h-5 cursor-pointer active:scale-90 transition-transform text-gray-400 hover:text-gray-600" onclick="window.forumActions.openShareModal(${post.id})"></i>
                                </div>
                            </div>
                            
                            ${post.title ? `<div class="text-[18px] font-black text-gray-900 mb-3 leading-snug">${post.title}</div>` : ''}
                            ${post.content ? `<div class="text-[16px] text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">${post.content}</div>` : ''}
                            ${fullMediaHtml}
                            ${pollHtml}
                            ${post.topic ? `<div class="mt-4 inline-flex"><span class="bg-blue-50 text-blue-500 text-[13px] font-bold px-3 py-1.5 rounded-full"><span class="mr-0.5 opacity-80">#</span>${post.topic.replace(/^#+/, '').trim()}</span></div>` : ''}
                        </div>
                        <div class="w-full h-2 bg-[#f4f5f7]"></div>
                        <div class="p-5 pb-10">
                            <div class="text-[15px] font-black text-gray-800 mb-2">共 ${post.comments ? post.comments.length : 0} 条评论</div>
                            ${commentsHtml}
                            <div class="mt-8 flex justify-center">
                                <button onclick="window.forumActions.loadMoreComments(${post.id})" class="px-6 py-2.5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-bold active:bg-gray-50 flex items-center shadow-sm transition-colors">
                                    <i data-lucide="loader" class="w-4 h-4 mr-1.5 ${state.isLoadingComments ? 'animate-spin' : 'hidden'}"></i>
                                    ${state.isLoadingComments ? '加载评论中...' : '加载更多评论'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="border-t border-gray-100 bg-white px-4 py-2.5 pb-safe flex items-center space-x-3 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] z-30">
                        <input type="text" id="forum-post-comment-input-${post.id}" class="flex-1 bg-[#f4f5f7] rounded-full px-4 py-2 text-[14px] text-gray-800 outline-none placeholder-gray-400 transition-colors focus:bg-gray-100 border border-transparent focus:border-gray-200" placeholder="留下你的评论..." onkeydown="if(event.key==='Enter') window.forumActions.commentOnPost(${post.id})">
                        <div class="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform shadow-sm shrink-0" onclick="window.forumActions.commentOnPost(${post.id})">
                            <i data-lucide="send" class="w-4 h-4 mr-0.5 mt-0.5"></i>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // ==========================================
    // 📖 渲染：多论坛侧滑抽屉与设置模态框
    // ==========================================
    if (state.showSidebar) {
        const forumsListHtml = store.forums.map(f => `
            <div class="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${state.activeForumId === f.id ? 'bg-gray-100 border border-gray-200 shadow-sm' : 'hover:bg-gray-50'}" onclick="window.forumActions.switchForum('${f.id}')">
                <div class="flex items-center space-x-3 overflow-hidden">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 ${state.activeForumId === f.id ? 'bg-blue-500' : 'bg-gray-400'}"><i data-lucide="hash" class="w-5 h-5"></i></div>
                    <div class="flex flex-col overflow-hidden">
                        <span class="text-[15px] font-black truncate ${state.activeForumId === f.id ? 'text-gray-900' : 'text-gray-600'}">${f.name}</span>
                        <span class="text-[11px] text-gray-400 mt-0.5 truncate max-w-[80px]">${f.topic}</span>
                    </div>
                </div>
                <div class="flex items-center shrink-0">
                    ${f.id !== 'default' ? `<div class="p-2 cursor-pointer active:scale-90" onclick="event.stopPropagation(); window.forumActions.deleteForum('${f.id}')"><i data-lucide="trash-2" class="w-5 h-5 text-gray-400 hover:text-red-500 transition-colors"></i></div>` : ''}
                    <div class="p-2 -mr-2 cursor-pointer active:scale-90" onclick="event.stopPropagation(); window.forumActions.openForumSettings('${f.id}')"><i data-lucide="settings" class="w-5 h-5 text-gray-400 hover:text-gray-700 transition-colors"></i></div>
                </div>
            </div>
        `).join('');

        sidebarHtml = `
            <div class="absolute inset-0 bg-black/40 z-[80] flex justify-end animate-in fade-in duration-200" onclick="window.forumActions.toggleSidebar()">
                <div class="w-[75%] max-w-[300px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onclick="event.stopPropagation()">
                    <div class="px-5 pt-12 pb-4 border-b border-gray-100 flex items-center justify-between">
                        <span class="text-[18px] font-black text-gray-800">我的频道</span>
                    </div>
                    <div id="forum-sidebar-scroll" class="flex-1 overflow-y-auto p-3 space-y-2 hide-scrollbar">
                        ${forumsListHtml}
                        <div class="flex items-center justify-center p-3 rounded-xl cursor-pointer border-2 border-dashed border-gray-300 hover:bg-gray-50 text-gray-400 transition-colors h-[64px] active:scale-95 mt-2" onclick="window.forumActions.openForumSettings(null)">
                            <i data-lucide="plus" class="w-5 h-5 mr-1"></i>
                            <span class="text-[14px] font-bold tracking-widest">新建频道</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    if (state.showForumSettingsModal && state.editingForumDraft) {
        const d = state.editingForumDraft;
        const isDefault = d.id === 'default';
        const mountedWbStrs = (d.mountedWorldbookIds || []).map(String); 
        const includedCharsStrs = (d.includedCharIds || []).map(String);

        const personasOptions = (store.personas || []).map(p => `<option value="${p.id}" ${d.userPersonaId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
        const charsChecks = (store.contacts || []).map(c => `<label class="flex items-center space-x-2 text-[13px] font-bold text-gray-600"><input type="checkbox" ${includedCharsStrs.includes(String(c.id)) ? 'checked' : ''} ${isDefault ? 'disabled' : ''} onchange="window.forumActions.toggleDraftArray('includedCharIds', '${c.id}')" class="rounded text-blue-500"><span class="truncate max-w-[100px]">${c.name}</span></label>`).join('');
        const wbChecks = (store.worldbooks || []).filter(w => w.type === 'local').map(w => `<label class="flex items-center space-x-2 text-[13px] font-bold text-gray-600"><input type="checkbox" ${mountedWbStrs.includes(String(w.id)) ? 'checked' : ''} onchange="window.forumActions.toggleDraftArray('mountedWorldbookIds', '${w.id}')" class="rounded text-blue-500"><span class="truncate max-w-[150px]">${w.title}</span></label>`).join('');

        forumSettingsModalHtml = `
            <div class="absolute inset-0 bg-black/50 z-[90] flex items-center justify-center animate-in fade-in duration-200">
                <div class="w-[85%] max-h-[80%] bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <span class="text-[16px] font-black text-gray-800">${d.id ? '频道设置' : '新建频道'}</span>
                        <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.forumActions.closeForumSettings()"></i>
                    </div>
                    <div id="forum-settings-scroll" onscroll="window.forumState.settingsScrollTop = this.scrollTop" class="flex-1 overflow-y-auto p-5 space-y-5 hide-scrollbar">
                        <div>
                            <label class="block text-[12px] font-black text-gray-500 mb-1.5">频道名称</label>
                            <input type="text" value="${d.name}" onchange="window.forumActions.updateDraftField('name', this.value)" ${isDefault ? 'disabled' : ''} class="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] font-bold text-gray-800 outline-none focus:border-blue-500 disabled:bg-gray-100" placeholder="如：王者荣耀开黑吧">
                        </div>
                        <div>
                            <label class="block text-[12px] font-black text-gray-500 mb-1.5">频道主题 / 世界观 (最高权重)</label>
                            <textarea rows="3" onchange="window.forumActions.updateDraftField('topic', this.value)" ${isDefault ? 'disabled' : ''} class="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-medium text-gray-700 outline-none focus:border-blue-500 resize-none disabled:bg-gray-100" placeholder="给 AI 描述频道的氛围和背景...">${d.topic}</textarea>
                        </div>
                        <div>
                            <label class="block text-[12px] font-black text-gray-500 mb-1.5">身份</label>
                            <select onchange="window.forumActions.updateDraftField('userPersonaId', this.value)" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] font-bold text-gray-800 outline-none focus:border-blue-500 bg-white">
                                <option value="">默认全局身份</option>
                                ${personasOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-[12px] font-black text-gray-500 mb-1.5">角色 (未勾不出场)</label>
                            <div class="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">${charsChecks || '<span class="text-gray-400 text-[12px]">暂无</span>'}</div>
                        </div>
                        <div>
                            <label class="block text-[12px] font-black text-gray-500 mb-1.5">局部世界书</label>
                            <div class="flex flex-col space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-100">${wbChecks || '<span class="text-gray-400 text-[12px]">暂无</span>'}</div>
                        </div>
                    </div>
                    <div class="p-4 border-t border-gray-100 bg-white">
                        <button onclick="window.forumActions.saveForumSettings()" class="w-full py-3 bg-blue-500 text-white font-bold rounded-full active:scale-95 transition-transform shadow-md">保存设置</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 🔗 渲染：转发弹窗 (Share Modal)
    // ==========================================
    if (state.shareModalPostId) {
        const chatsListHtml = store.chats.map(chat => {
            const char = store.contacts.find(c => c.id === chat.charId);
            let name = chat.isGroup ? chat.groupName : (char ? char.name : '未知');
            let avatarHtml = chat.isGroup ? `<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0 border border-gray-100"><i data-lucide="users" class="w-5 h-5 text-gray-500"></i></div>` : `<img src="${char?.avatar}" class="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-100">`;
            return `
                <div class="flex items-center space-x-3 p-3 active:bg-gray-50 cursor-pointer rounded-xl transition-colors" onclick="window.forumActions.shareToChat('${chat.charId}')">
                    ${avatarHtml}
                    <div class="flex flex-col overflow-hidden">
                       <span class="text-[15px] font-bold text-gray-800 truncate">${name}</span>
                       <span class="text-[12px] text-gray-400 mt-0.5 truncate">点击转发帖子</span>
                    </div>
                </div>
            `;
        }).join('');

        shareModalHtml = `
            <div class="absolute inset-0 bg-black/40 z-[80] flex items-center justify-center animate-in fade-in duration-200" onclick="window.forumActions.closeShareModal()">
                <div class="bg-white rounded-[20px] p-5 w-[85%] max-h-[70%] flex flex-col animate-in zoom-in-95 duration-200 shadow-xl" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                        <span class="text-[16px] font-black text-gray-800">发送给...</span>
                        <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.forumActions.closeShareModal()"></i>
                    </div>
                    <div id="forum-share-scroll" class="flex-1 overflow-y-auto hide-scrollbar space-y-1">
                        ${chatsListHtml || `<div class="text-center text-gray-400 mt-10 text-[13px] font-bold">微信列表为空哦</div>`}
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 📝 渲染：发帖弹窗
    // ==========================================
    if (state.showPostModal) {
        postModalHtml = `
        <div class="absolute inset-0 bg-white z-[70] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            <div class="backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 bg-white/90 relative">
                <div class="cursor-pointer active:opacity-50 text-gray-600 w-8" onclick="window.forumActions.closePostModal()"><i data-lucide="chevron-left" class="w-7 h-7"></i></div>
                <span class="text-[16px] font-black text-gray-800 absolute left-1/2 -translate-x-1/2">发帖子</span>
                <div class="w-8"></div>
            </div>
            
            <div id="forum-post-scroll" class="flex-1 overflow-y-auto flex flex-col hide-scrollbar bg-white pb-32">
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
                    ${state.draft.topic ? `<div class="flex items-center mt-3"><span class="bg-blue-50 text-blue-500 text-[13px] font-bold px-3 py-1.5 rounded-full flex items-center shadow-sm"><span class="mr-0.5 opacity-80">#</span>${state.draft.topic.replace(/^#+/, '').trim()}<i data-lucide="x" class="w-3 h-3 ml-2 cursor-pointer opacity-50 hover:opacity-100" onclick="window.forumActions.clearTopic()"></i></span></div>` : ''}
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
                    <button class="w-full bg-gray-900 hover:bg-black text-white text-[16px] font-bold py-3.5 rounded-full active:scale-[0.98] transition-transform shadow-lg shadow-gray-900/30" onclick="window.forumActions.submitPost()">发布帖子</button>
                </div>
            </div>
        </div>
        `;
    }

    if (state.showForumSettingsModal) {
        setTimeout(() => {
            const el = document.getElementById('forum-settings-scroll');
            if (el && state.settingsScrollTop) el.scrollTop = state.settingsScrollTop;
        }, 0);
    }

    return `
        <div class="w-full h-full flex flex-col relative overflow-hidden bg-white animate-in slide-in-from-right-4 duration-300 z-[60]">
            ${contentHtml}
            ${detailViewHtml}
            ${bottomNavHtml}
            ${postModalHtml}
            ${shareModalHtml}
            ${sidebarHtml}
            ${forumSettingsModalHtml}
        </div>
    `;
};

window.renderForum = () => { if(window.render) window.render(); };