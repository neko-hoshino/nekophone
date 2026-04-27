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
    detailScrollTop: 0, 
    replyingToCommentId: null, 
    followPageSize: 10,
    
    // 🌟 私信与盲盒系统状态
    messageTab: 'contacts', // 'contacts' (联系人) | 'discover' (匹配盲盒)
    strangers: [],          // 存放刷出来的盲盒
    activeStrangerId: null, // 当前查看的盲盒详细
    isGeneratingStrangers: false,
    isGeneratingProfile: false,
    activeForumChatId: null, 
    isRefreshingContacts: false, 
    isReplyingForumChat: false,

    draft: { title: '', text: '', mediaList: [], topic: '', poll: null }
};

// 🌟 盲盒基础骨架词库 (终极扩容版)
const strangerBanks = {
    orientations: [
        'BG', 'GB', 'BL', 'GL', '泛性恋', '智性恋', '柏拉图式', '无性恋', '双性恋', 'BDSM', 'ABO', '哨向'
    ],
    relationships: [
        '青梅竹马', '死对头', '天降系', '久别重逢', '年上爹系', '年下小狗', '前任', '人机恋',
        '危险的甲方', '合租室友', '契约恋人', '强取豪夺', '破镜重圆', '救赎与被救赎', 
        '替身白月光', '伪骨科', '网恋奔现', '假戏真做', '蓄谋已久', '欢喜冤家', '相爱相杀', '金主与雀鸟', '先婚后爱', '人夫', '有妇之夫', '母子', '父女', '兄妹', '姐弟',
        '师生', '师徒', '同学', '同事', '邻居', '网友', '素未谋面', '一夜情', '被迫同居', '假扮情侣', '暗恋多年', '失忆后重逢', '跨国恋人', '时空错位', '灵魂交换', '前世今生'
    ],
    jobs: [
        '重案组法医', '白帽黑客', '财阀继承人', '地下乐队贝斯手', '心理医生', '赛车手', '午夜电台主播', '异国雇佣兵', '纹身师', '犯罪心理学教授', , '学霸', '体育生', '艺术家', '技术宅', '社交达人', '职场精英', '学渣', '网红主播', '图书管理员', '咖啡师', '酒吧调酒师', '健身教练', '瑜伽老师', '宠物美容师',
        '顶级刑辩律师', '颓废画家', '天文台研究员', '殡仪馆入殓师', '深夜调酒师', '急诊科主刀医生', '神秘学塔罗占卜师', '卧底探员', '破产前总裁', '战地摄影师', 
        '独立游戏开发者', '地下拳击手', '夜店老板', '流浪诗人', '黑帮老大', '特种兵退役军人', '跨国间谍', '失业的前科技公司高管', '神秘的图书管理员', '未来世界的时间警察', '末世幸存者', '虚拟偶像', 'AI人格', '异世界冒险者', '仿生人'
    ],
    personas: [
        '疯批', '傲娇', '高岭之花', '病娇', '清冷腹黑', '社恐', '白切黑', '毒舌', 
        '斯文败类', '顶级绿茶', '钓系高手', '厌世脸', '偏执狂', '爹系控制狂', 
        '笨蛋美人', '温柔冷血', '暴躁老哥/老姐', '缺爱小可怜', '禁欲系', '伪善者', '直球', '逗比', '天然呆'
    ]
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
    if (!store.forumChats) store.forumChats = []; 
    
    if (!store.forums || store.forums.length === 0) {
        store.forums = [{ id: 'default', name: 'little universe', topic: '综合闲聊日常', userPersonaId: store.personas?.[0]?.id || null, includedCharIds: store.contacts?.map(c => c.id) || [], mountedWorldbookIds: [] }];
    }
    if (!store.forums.find(f => f.id === state.activeForumId)) state.activeForumId = store.forums[0].id;
    const activeForum = store.forums.find(f => f.id === state.activeForumId);

    const profile = store.forumProfile;
    const forumPersona = store.personas?.find(p => p.id === activeForum.userPersonaId) || store.personas?.[0] || { name: 'User', avatar: '' };
    const displayName = profile.name || forumPersona.name;
    const displayAvatar = profile.avatar || forumPersona.avatar || 'https://api.dicebear.com/7.x/notionists-neutral/svg?seed=Eve&backgroundColor=ffffff';

    // 🌟 修复1：判定如果是当前用户（displayName），就渲染用户的真实头像
    const getCommentAvatar = (author) => {
        if (author === displayName) return displayAvatar.length > 10 ? `<img src="${displayAvatar}" class="w-full h-full object-cover">` : displayAvatar;
        const char = store.contacts?.find(c => c.name === author);
        if (char && char.avatar) return char.avatar.length > 10 ? `<img src="${char.avatar}" class="w-full h-full object-cover">` : char.avatar; 
        return `<img src="https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(author)}&backgroundColor=ffffff" class="w-full h-full object-cover border border-gray-100">`;
    };

    // 🌟 专门用于用户发评论或AI对线时的拉到底部动作
    const scrollToDetailBottom = () => { setTimeout(() => { const el = document.getElementById('forum-detail-scroll'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, 150); };

    // 获取指定角色绑定的用户人设
const getBoundPersonaForChar = (char, store, defaultDisplayName) => {
    if (!char) return { name: defaultDisplayName, prompt: '' };
    const bound = store.personas?.find(p => String(p.id) === String(char.boundPersonaId));
    if (bound) return bound;
    return store.personas?.[0] || { name: defaultDisplayName, prompt: '' };
};

// 获取指定角色与用户的最近N回合聊天记录（按发送者切换计算回合）
const getRecentChatHistoryForChar = (char, store, defaultDisplayName, limit = 20) => {
    if (!char) return '';
    const boundP = getBoundPersonaForChar(char, store, defaultDisplayName);
    const chat = store.chats?.find(c => c.charId === char.id);
    if (!chat?.messages) return '';
    
    let baseHistory = chat.messages.filter(m => m.msgType === 'text' && !m.isOffline);
    let turnsCount = 0;
    let lastSender = null;
    let startIndex = 0;
    for (let i = baseHistory.length - 1; i >= 0; i--) {
        const isMe = baseHistory[i].isMe;
        if (isMe !== lastSender) {
            if (lastSender !== null) turnsCount += 0.5;
            lastSender = isMe;
        }
        if (turnsCount >= limit) {
            startIndex = i + 1;
            break;
        }
    }
    const recentMsgs = baseHistory.slice(startIndex);
    if (recentMsgs.length === 0) return '';
    const lines = recentMsgs.map(m => `[${m.isMe ? boundP.name : char.name}]: ${m.text}`);
    return `\n【与用户 ${boundP.name} 的最近对话记录】\n${lines.join('\n')}`;
};

// 构建单个角色的完整上下文（人设 + 核心记忆 + 聊天记录）
const buildCharContext = (char, store, defaultDisplayName, includeChatHistory = true, limit = 20) => {
    if (!char) return '';
    const boundP = getBoundPersonaForChar(char, store, defaultDisplayName);
    const coreMemories = (store.memories || []).filter(m => m.charId === char.id && m.type === 'core').map(m => m.content).join('；');
    let context = `角色名称：${char.name}\n角色设定：${char.prompt}`;
    if (coreMemories) context += `\n核心记忆：${coreMemories}`;
    if (includeChatHistory) {
        const historyStr = getRecentChatHistoryForChar(char, store, defaultDisplayName, limit);
        if (historyStr) context += historyStr;
    }
    // 额外附上绑定的用户人设信息，方便AI理解用户身份
    context += `\n【与该角色对话的用户身份】\n名字：${boundP.name}\n用户设定：${boundP.prompt}`;
    return context;
};

    // ==========================================
    // 🧠 AI 全量刷帖引擎
    // ==========================================
    const generateAIPosts = async (targetForumId) => {
        if (window.forumState.isRefreshingPosts) return; 
        const forum = store.forums.find(f => f.id === targetForumId);
        if (!forum || !store.apiConfig?.apiKey) return;

        window.forumState.isRefreshingPosts = true;
        window.render();
        if (window.actions?.showToast) window.actions.showToast('正在全网搜罗新帖...');

        // 🌟 修复3：先给所有发现页帖子打上隐藏标记，然后彻底删除那些没用的路人旧贴释放内存！
        store.forumPosts.forEach(p => {
            if (p.forumId === targetForumId && p.type === 'discover') p.hiddenFromDiscover = true;
        });
        store.forumPosts = store.forumPosts.filter(p => !p.hiddenFromDiscover || p.isMine || store.forumBookmarks.includes(p.id));

        try {
            const globalWb = (store.worldbooks || []).filter(w => w.type === 'global' && w.enabled).map(w => w.content).join('\n');
            const localWb = (store.worldbooks || []).filter(w => w.type === 'local' && forum.mountedWorldbookIds?.includes(w.id)).map(w => w.content).join('\n');
            
            let validContacts = store.contacts || [];
if (forum.includedCharIds && forum.includedCharIds.length > 0) validContacts = validContacts.filter(c => forum.includedCharIds.includes(c.id));
const charProfiles = validContacts.map(c => buildCharContext(c, store, displayName, true, 20)).join('\n\n---\n\n');

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
3. 必须混合出现【纯文字帖】、【附带虚拟照片】、【附带虚拟视频】、【投票调查贴】！
4. 绝不要输出思考过程，直接输出纯 JSON 数组！
5. 每篇正文(content)必须不少于100字！极其符合人设和频道主题！
6. ⚠️当前系统用户叫“${displayName}”，不要以这个名字发帖。

格式：[ { "author": "名字", "type": "follow" 或 "discover", "title": "标题", "content": "正文不少于100字", "mediaList": [ {"type": "virtual_image"或"virtual_video", "desc": "描述"} ], "topic": "话题", "poll": { "question": "问题", "options": ["选项1", "选项2"] } } ]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            reply = reply.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

            let parsedPosts = JSON.parse(reply);
            if (parsedPosts.posts) parsedPosts = parsedPosts.posts; // 容错处理

            if (Array.isArray(parsedPosts)) {
                let baseTime = Date.now();
                const newPosts = parsedPosts.map((p, i) => {
                    const char = store.contacts?.find(c => c.name === p.author);
                    const avatarUrl = (char && char.avatar) ? char.avatar : `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(p.author)}&backgroundColor=ffffff`;
                    
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
                if (window.actions?.showToast) window.actions.showToast(`频道刷新了 ${newPosts.length} 条新帖！`);
            }
        } catch (e) {
            if (window.actions?.showToast) window.actions.showToast('刷新帖子格式错误，请重试');
        } finally { window.forumState.isRefreshingPosts = false; window.render(); }
    };

    // ==========================================
    // 🧠 AI 评论生成引擎 (加入强力并发锁与报错机制)
    // ==========================================
    const generateAIReactions = async (postId, isAppend = false) => {
        if (window.forumState.isLoadingComments) return; // 🌟 核心防御：正在加载时，完全无视新的请求！
        
        const post = store.forumPosts.find(p => p.id === postId);
        if (!post || !store.apiConfig?.apiKey) return;
        
        window.forumState.isLoadingComments = true; 
        window.render();

        try {
            const charProfiles = (store.contacts || []).map(c => buildCharContext(c, store, displayName, true, 20)).join('\n\n---\n\n');

            const globalWb = store.worldbook || '';
            const forumWb = store.forumWorldbook || '';

            const nextFloor = (post.comments && post.comments.length > 0) ? Math.max(...post.comments.map(c => c.floor || 0)) + 1 : 1;
            const authorTag = post.author === displayName ? '(★当前用户本体)' : '(发帖人)';
            
            let postInfo = `【发帖人】${post.author} ${authorTag}\n【标题】${post.title}\n【正文】${post.content}\n`;
            if (post.mediaList && post.mediaList.length > 0) postInfo += `【附件】${post.mediaList.map(m => m.type + (m.desc ? ':'+m.desc : '')).join('; ')}\n`;

            let existingCommentsText = '';
            if (post.comments && post.comments.length > 0) {
                existingCommentsText = post.comments.map(c => {
                    const cAuthorTag = c.author === displayName ? '(★当前用户本体)' : '';
                    return `[${c.floor||0}楼] [${c.author}${cAuthorTag}] ${c.replyTo ? '回复@'+c.replyTo+'：' : '评论：'}${c.content}`;
                }).join('\n');
            }

            const prompt = `你是一个真实社交平台的模拟引擎。
【世界观基础】
全局世界书：${globalWb}
论坛专有世界书：${forumWb}
【已知角色列表】
${charProfiles}
【当前帖子】
${postInfo}
${existingCommentsText ? `\n【目前已有评论记录】\n${existingCommentsText}\n` : ''}

【重要：用户身份说明】
系统用户在论坛中的显示名（网名）是"${displayName}"。已知角色各自绑定了用户的不同身份（见各角色上下文中的【与该角色对话的用户身份】），但无论绑定的身份名称叫什么，在论坛里这个人统一显示为"${displayName}"。只要帖子作者或评论中出现了"${displayName}"，那就是用户本体，所有已知角色都应当能认出ta，并用符合自己人设的方式回应ta。

【任务】
为这篇帖子${isAppend ? `补充生成 10 条全新的评论，从第 ${nextFloor} 楼开始递增。` : `生成 10 条不同用户的评论，从第 1 楼开始递增。`}
1. 可包含已知角色（每人最多1条）。剩下由随机路人发布。
2. 如果上方提供了【已有评论记录】，新评论必须针对前面的评论进行部分点评、反驳或提及！（如：同意2楼）
3. ⚠️绝对不要把路人错认成当前用户(${displayName})！
4. ⚠️【绝对禁令】：绝对禁止以“${displayName}”的名字发表任何评论！你只能扮演已知角色或路人，生成的 JSON 中 "author" 字段绝对不能是 "${displayName}"！
5. 绝不要输出思考过程，直接输出 JSON 数组！

格式：[ { "floor": 楼层数字, "author": "网名或角色名", "content": "评论内容" } ]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.88 })
            });

            if (!res.ok) throw new Error(`API HTTP Error`);
            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            reply = reply.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

            let comments = JSON.parse(reply);
            if (comments.comments) comments = comments.comments; // 🌟 强力容错

            if (Array.isArray(comments)) {
                let baseTime = Date.now();
                const newComments = comments.map((c, i) => ({ 
                    ...c, id: baseTime + i, timestamp: baseTime + (i * 1000), floor: c.floor || (nextFloor + i)
                }));
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
            } else {
                throw new Error("AI没有返回标准的数组格式");
            }
        } catch (e) {
            console.error("评论加载详细错误：", e);
            if (window.actions?.showToast) window.actions.showToast('加载评论失败，请再试一次'); // 🌟 明确报错提醒
        } finally { 
            window.forumState.isLoadingComments = false; 
            window.render(); 
        }
    };

    // ==========================================
    // 🧠 AI 针对用户对线引擎
    // ==========================================
    const generateAICommentReply = async (postId, targetComment, userReplyText) => {
        const post = store.forumPosts.find(p => p.id === postId);
        if (!post || !store.apiConfig?.apiKey) return;
        // 注意：不锁死主评论加载锁，允许并发回复
        
        try {
            const globalP = store.globalPrompt || '';
            const char = store.contacts?.find(c => c.name === targetComment.author);
            let targetContext = char ? `【你的身份】你是已知角色：${char.name}。你的设定：${char.prompt}\n` : `【你的身份】你是论坛里的路人网友“${targetComment.author}”。请保持路人/杠精/沙雕网友人设。\n`;
            
            let actionContext = targetComment.isPost 
                ? `用户(${displayName})刚才在你的帖子里评论了你：${userReplyText}` 
                : `你在帖子下评论说：${targetComment.content}\n用户(${displayName})刚才回复你：${userReplyText}`;

            const prompt = `你是一个社交平台的模拟引擎。\n【论坛主题】${activeForum.topic || '综合闲聊日常'}\n【当前对话用户】论坛网名：${displayName}（这就是用户本体，即使你绑定的用户身份名字不同，这里的"${displayName}"也是同一个人）\n全局性格：${globalP}\n\n${targetContext}\n【帖子内容】标题：${post.title||'无'} 正文：${post.content}\n【对话上下文】\n${actionContext}\n\n【任务】\n给出你对用户的直接回复！符合身份，50字内口语化。不包含<think>，只输出纯文本！`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            const nextFloor = (post.comments && post.comments.length > 0) ? Math.max(...post.comments.map(c => c.floor || 0)) + 1 : 1;

            post.comments.push({ id: Date.now(), timestamp: Date.now(), floor: nextFloor, author: targetComment.author, content: reply, replyTo: displayName });
            if (window.actions?.saveStore) window.actions.saveStore();
        } catch (e) {
            if (window.actions?.showToast) window.actions.showToast('对方没理你，回复失败');
        } finally { 
            window.render(); 
            scrollToDetailBottom(); 
        }
    };
    // ==========================================
    // 🧠 AI 论坛私信引擎 (一次性打包输出版，彻底告别 429！)
    // ==========================================
    const generateContactsReactions = async () => {
        if (window.forumState.isRefreshingContacts) return;
        
        // 获取最新的一篇帖子
        const myPosts = store.forumPosts.filter(p => p.isMine);
        const myBookmarks = store.forumBookmarks.map(id => store.forumPosts.find(p => p.id === id)).filter(Boolean);
        const allRecent = [...myPosts, ...myBookmarks].sort((a, b) => b.timestamp - a.timestamp);
        const latestPost = allRecent[0];
        
        if (!latestPost) return window.actions?.showToast('你还没有发帖或收藏任何内容哦~');
        
        const contacts = store.contacts || [];
        if (contacts.length === 0) return window.actions?.showToast('通讯录还没有人哦，去匹配几个吧！');

        window.forumState.isRefreshingContacts = true; window.render();
        if (window.actions?.showToast) window.actions.showToast('正在刷新私信，请稍候...');

        try {
            const globalWb = (store.worldbooks || []).filter(w => w.type === 'global' && w.enabled).map(w => w.content).join('\n');
            
            // 🌟 核心：将所有联系人的核心记忆和专属用户设定打包压缩！
            const contactsProfiles = contacts.map(char => {
    const context = buildCharContext(char, store, displayName, true, 20);
    // 不需要再单独加用户设定，因为 buildCharContext 已经包含了
    return context;
}).join('\n\n---\n\n');

            const isMineStr = latestPost.isMine ? '发布' : '收藏';
            const postContext = `用户最近${isMineStr}了这篇帖子：\n【标题】${latestPost.title||'无'}\n【正文】${latestPost.content}`;
            
            // 🌟 核心：命令 AI 以 JSON 数组形式一次性吐出所有人的反应
            const prompt = `你是一个社交平台的模拟引擎。\n【全局世界书】${globalWb}\n\n【任务】\n${postContext}\n\n你需要同时扮演以下多个角色，主动发一条私信给用户，对这篇帖子发表看法、吐槽或关心。
要求：
1. 必须为列表中的【每一个角色】生成一条专属回复！
2. 每个角色的回复必须严格符合其人设和核心记忆，且必须针对他绑定的【用户设定】来调整语气。
3. 50字以内，高度口语化。
4. 绝不要输出思考过程，直接输出纯 JSON 数组！

【需要扮演的角色列表】
${contactsProfiles}

格式要求（必须是严格的JSON数组）：
[
  { "author": "角色名", "reply": "私信内容" }
]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
            });
            
            if (!res.ok) throw new Error(`API HTTP Error: ${res.status}`);
            
            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            reply = reply.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            let reactions = JSON.parse(reply);
            if (reactions.reactions) reactions = reactions.reactions; // 强力容错
            
            if (Array.isArray(reactions)) {
                // 清除所有联系人的旧论坛私信，再写入新的
                reactions.forEach(reaction => {
                    const char = contacts.find(c => c.name === reaction.author);
                    if (char) {
                        let fChat = store.forumChats.find(c => c.charId === char.id);
                        if (!fChat) { fChat = { charId: char.id, messages: [] }; store.forumChats.push(fChat); }
                        fChat.messages = []; // 清除旧消息
                        fChat.messages.push({ id: Date.now() + Math.random(), sender: char.name, isMe: false, text: reaction.reply, timestamp: Date.now() });
                    }
                });

                if (window.actions?.saveStore) window.actions.saveStore();
                if (window.actions?.showToast) window.actions.showToast('私信刷新成功！');
            } else {
                throw new Error("JSON 格式不正确");
            }
        } catch (e) {
            console.error("获取反应失败:", e);
            if (window.actions?.showToast) window.actions.showToast('私信刷新失败，请重试');
        } finally { 
            window.forumState.isRefreshingContacts = false; 
            window.render(); 
        }
    };

    const generateForumChatReply = async (charId) => {
        if (window.forumState.isReplyingForumChat) return;
        const char = store.contacts.find(c => c.id === charId);
        const fChat = store.forumChats.find(c => c.charId === charId);
        if (!char || !fChat || fChat.messages.length === 0) return;

        window.forumState.isReplyingForumChat = true; window.render();

        try {
            const globalWb = (store.worldbooks || []).filter(w => w.type === 'global' && w.enabled).map(w => w.content).join('\n');
            const boundPersona = getBoundPersonaForChar(char, store, displayName);
const wechatHistory = getRecentChatHistoryForChar(char, store, displayName, 20);
const forumHistory = fChat.messages.slice(-10).map(m => `[${m.isMe ? boundPersona.name : char.name}]: ${m.text}`).join('\n');
const fullHistory = forumHistory + (wechatHistory ? `\n\n${wechatHistory}` : '');

// 构建角色上下文
const charContext = buildCharContext(char, store, displayName, false, 20);

            const prompt = `你是一个社交平台的模拟引擎。\n【全局世界书】${globalWb}\n【你的设定】${charContext}\n\n【最近聊天记录】\n${fullHistory}\n\n【任务】\n给出你对用户的回复！符合身份，50字内，单行纯文本，不包含！`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
            });
            const data = await res.json();
            const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            
            fChat.messages.push({ id: Date.now(), sender: char.name, isMe: false, text: reply, timestamp: Date.now() });
            if (window.actions?.saveStore) window.actions.saveStore();
        } catch (e) {
            if (window.actions?.showToast) window.actions.showToast('消息发送失败');
        } finally { 
            window.forumState.isReplyingForumChat = false; window.render(); 
            setTimeout(() => { const el = document.getElementById('forum-chat-scroll'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, 100); 
        }
    };
    // ==========================================
    // 🧠 AI 陌生人盲盒系统 (生成列表与深度人设)
    // ==========================================
    const generateStrangers = async () => {
        if (state.isGeneratingStrangers) return;
        window.forumState.isGeneratingStrangers = true; window.render();
        
        try {
            // 从词库随机抽3组骨架
            let combos = '';
            for(let i=0; i<3; i++) {
                const ori = strangerBanks.orientations[Math.floor(Math.random()*strangerBanks.orientations.length)];
                const rel = strangerBanks.relationships[Math.floor(Math.random()*strangerBanks.relationships.length)];
                const job = strangerBanks.jobs[Math.floor(Math.random()*strangerBanks.jobs.length)];
                const per = strangerBanks.personas[Math.floor(Math.random()*strangerBanks.personas.length)];
                combos += `人物${i+1}基础：[${ori}] [与用户的关系:${rel}] [职业:${job}] [性格:${per}]\n`;
            }

            const prompt = `你是一个盲盒交友APP的模拟器。请根据以下3组基础设定，为每个角色生成【1个化名】、【2个带有强烈反差感/怪癖的补充Tag】、【1句极具张力的开场白搭讪词(Hook)】。
基础设定：
${combos}
任务：
1. 搭讪词必须立刻让人产生好奇心或心跳加速，严禁俗套的“你好”。
2. 补充Tag必须展现不为人知的一面，要有反差感、独特性。
3. 绝不输出思考过程，只输出严格的 JSON 数组！
格式：[{"baseTags": ["保留传给你的4个基础词"], "mutatedTags": ["变异词1", "变异词2"], "name": "化名", "hook": "搭讪词"}]`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            const parsed = JSON.parse(reply);
            window.forumState.strangers = parsed.map((s, i) => ({
                id: 'stranger_' + Date.now() + i,
                ...s,
                avatar: `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(s.name)}&backgroundColor=ffffff`,
                profile: null // 初始为空，点击后再生成深度资料
            }));
        } catch (e) {
            if (window.actions?.showToast) window.actions.showToast('盲盒加载失败，请重试');
        } finally { window.forumState.isGeneratingStrangers = false; window.render(); }
    };

    const generateStrangerProfile = async (strangerId) => {
        const stranger = window.forumState.strangers.find(s => s.id === strangerId);
        if (!stranger) return;
        
        window.forumState.isGeneratingProfile = true; window.render();

        try {
            const prompt = `你正在为一个沉浸式模拟系统生成人物档案。
【已知标签】：${stranger.baseTags.join(', ')}，${stranger.mutatedTags.join(', ')}
【第一句话】：${stranger.hook}

请严格按以下 JSON 结构输出。每个字段的值必须是【纯文本字符串】，绝对禁止嵌套数组或对象：
{
  "realName": "真实姓名",
  "identity": "年龄与职业细节",
  "appearance": "容貌(Face/Body)、气味(Scent)与穿搭(Attire)",
  "behavior": "说话风格(Speech style)、口头禅与怪癖(Tics)",
  "social": "社交网络(Anchors)与仇敌(Enemies)",
  "background": "出身(Origin)、童年(Childhood)与人生拐点(Turning Point)",
  "secret": "内心冲突(Conflict)与不为人知的秘密(Secret)",
  "optional_flaws": "失去的事物(Lost)或身心缺陷(Pain/flaws)，若无填无",
  "nsfw_kinks": "性向(Orientation)、偏好(Kinks/Zones)与底线(Bottom line)"
}`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.8 })
            });

            const data = await res.json();
            let reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            
            // 🌟 强力纠错：处理 AI 意外生成的非字符串字段
            const rawProfile = JSON.parse(reply);
            const sanitized = {};
            Object.keys(rawProfile).forEach(key => {
                const val = rawProfile[key];
                sanitized[key] = (typeof val === 'object') ? JSON.stringify(val).replace(/[\[\]"{}]/g, '') : String(val);
            });
            
            stranger.profile = sanitized;
        } catch (e) {
            console.error("档案生成失败:", e);
            if (window.actions?.showToast) window.actions.showToast('档案生成失败，请重试');
        } finally { window.forumState.isRefreshingPosts = false; window.forumState.isGeneratingProfile = false; window.render(); }
    };

    window.forumActions = {
        goBack: () => { window.actions.setCurrentApp(null); },
        refreshPosts: (forumId) => generateAIPosts(forumId),
        
        deletePost: (postId) => {
            if (confirm("确定要删除这条帖子吗？")) {
                // 🌟 云端 GC：清理帖子真实图片
                const target = store.forumPosts.find(p => p.id === postId);
                (target?.mediaList || []).forEach(item => {
                    if (item?.type === 'real_image' && item.url) window.deleteMediaFromCloud(item.url);
                });
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
        deleteForum: (forumId) => {
            if (forumId === 'default') return window.actions?.showToast('默认频道不可删除');
            if (confirm("确定要删除这个频道吗？所有数据都将被永久清空！")) {
                // 🌟 云端 GC：批量清理频道下所有帖子的真实图片
                store.forumPosts.filter(p => p.forumId === forumId).forEach(p => {
                    (p.mediaList || []).forEach(item => {
                        if (item?.type === 'real_image' && item.url) window.deleteMediaFromCloud(item.url);
                    });
                });
                store.forums = store.forums.filter(f => f.id !== forumId);
                store.forumPosts = store.forumPosts.filter(p => p.forumId !== forumId);
                const validIds = store.forumPosts.map(p => p.id);
                store.forumBookmarks = store.forumBookmarks.filter(id => validIds.includes(id));
                if (window.forumState.activeForumId === forumId) { window.forumState.activeForumId = 'default'; window.forumState.mainTab = 'home'; }
                if (window.actions?.saveStore) window.actions.saveStore(); window.render();
            }
        },

        loadMoreFollow: () => { window.forumState.followPageSize += 10; window.render(); },
        toggleSidebar: () => { window.forumState.showSidebar = !window.forumState.showSidebar; window.render(); },
        switchForum: (forumId) => { window.forumState.activeForumId = forumId; window.forumState.showSidebar = false; window.forumState.mainTab = 'home'; window.render(); },
        openForumSettings: (forumId) => {
            if (forumId === null) window.forumState.editingForumDraft = { id: null, name: '', topic: '', userPersonaId: store.personas?.[0]?.id || null, includedCharIds: store.contacts?.map(c => c.id) || [], mountedWorldbookIds: [] };
            else window.forumState.editingForumDraft = JSON.parse(JSON.stringify(store.forums.find(x => x.id === forumId)));
            window.forumState.showForumSettingsModal = true; window.render();
        },
        closeForumSettings: () => { window.forumState.showForumSettingsModal = false; window.forumState.editingForumDraft = null; window.render(); },
        saveForumSettings: () => {
            const d = window.forumState.editingForumDraft;
            if (!d.name.trim()) return window.actions?.showToast('频道名字不能为空哦！');
            if (d.id === null) { d.id = 'forum_' + Date.now(); store.forums.push(d); window.forumState.activeForumId = d.id; }
            else { const idx = store.forums.findIndex(x => x.id === d.id); if (idx > -1) store.forums[idx] = d; }
            if (window.actions?.saveStore) window.actions.saveStore(); window.forumActions.closeForumSettings();
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
        // 🌟 私信与盲盒动作
        openPrivateMessages: () => { 
            window.forumState.view = 'messages'; 
            window.forumState.messageTab = 'contacts'; 
            window.render(); 
        },
        closePrivateMessages: () => { window.forumState.view = 'list'; window.render(); },
        // 🌟 论坛独立单聊动作
        refreshContactsReactions: () => generateContactsReactions(),
        openForumChat: (charId) => { window.forumState.activeForumChatId = charId; window.forumState.view = 'forum_chat'; window.render(); setTimeout(() => { const el = document.getElementById('forum-chat-scroll'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' }); }, 50); },
        closeForumChat: () => { window.forumState.view = 'messages'; window.forumState.activeForumChatId = null; window.render(); },
        sendForumChatMsg: (charId) => {
            const input = document.getElementById(`forum-chat-input`);
            if (!input || !input.value.trim()) return;
            const text = input.value.trim();
            let fChat = store.forumChats.find(c => c.charId === charId);
            if (!fChat) { fChat = { charId, messages: [] }; store.forumChats.push(fChat); }
            fChat.messages.push({ id: Date.now(), sender: displayName, isMe: true, text, timestamp: Date.now() });
            input.value = '';
            if (window.actions?.saveStore) window.actions.saveStore();
            window.render();
            setTimeout(() => { const el = document.getElementById('forum-chat-scroll'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, 100);
        },
        getForumChatReply: (charId) => { generateForumChatReply(charId); },
        forwardForumChatToWeChat: (charId) => {
            const char = store.contacts.find(c => c.id === charId);
            const fChat = store.forumChats.find(c => c.charId === charId);
            if (!char || !fChat || fChat.messages.length === 0) return window.actions?.showToast('没有可转发的私信');
            const wChat = store.chats?.find(c => c.charId === charId);
            if (!wChat) return window.actions?.showToast('微信中找不到对应聊天室');
            const nowTs = Date.now();
            const d = new Date(nowTs);
            const nowTimeStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}`;
            fChat.messages.forEach((m, i) => {
                wChat.messages.push({ id: nowTs + i, sender: m.sender, isMe: m.isMe, msgType: 'text', text: m.text, timestamp: nowTs + i, time: nowTimeStr });
            });
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast('已转发到微信！');
        },
        switchMessageTab: (tab) => { 
            window.forumState.messageTab = tab; 
            window.render(); 
            // 🌟 拔除自动触发引线，不再强迫系统自动生成，完全由用户手动点击触发
        },
        refreshStrangers: () => { generateStrangers(); },
        openStrangerDetail: (id) => { 
            window.forumState.activeStrangerId = id; window.forumState.view = 'stranger_detail'; window.render();
            generateStrangerProfile(id); // 触发深度解析
        },
        // 🌟 重 Roll 动作：清除当前 profile 并重新调用生成
        rerollStrangerProfile: (id) => {
            const stranger = window.forumState.strangers.find(s => s.id === id);
            if (stranger) {
                stranger.profile = null;
                window.forumActions.openStrangerDetail(id);
            }
        },
        closeStrangerDetail: () => { window.forumState.view = 'messages'; window.forumState.activeStrangerId = null; window.render(); },
        rejectStranger: (id) => {
            window.forumState.strangers = window.forumState.strangers.filter(s => s.id !== id);
            window.forumActions.closeStrangerDetail();
        },
        acceptStranger: (id) => {
            const stranger = window.forumState.strangers.find(s => s.id === id);
            if (!stranger || !stranger.profile) return;
            
            const p = stranger.profile;
            // 🌟 将深度信息拼装为提示词
            const fullPrompt = `【表象设定】\n真实姓名：${p.realName}\n身份：${p.identity}\n外貌：${p.appearance}\n行为习惯：${p.behavior}\n人际社交：${p.social}\n\n【深度机密】\n过往经历：${p.background}\n内心创伤与秘密：${p.secret}\n缺失与瑕疵：${p.optional_flaws}\n亲密关系偏好：${p.nsfw_kinks}`;
            
            const newCharId = 'char_' + Date.now();
            
            // 🌟 核心：以真名（p.realName）存入微信通讯录！
            store.contacts.push({ id: newCharId, name: p.realName, avatar: stranger.avatar, prompt: fullPrompt });
            
            // 🌟 核心：用真名作为 sender 创建聊天室并发第一句话
            store.chats.push({
                charId: newCharId, isGroup: false,
                messages: [{ id: Date.now(), sender: p.realName, isMe: false, msgType: 'text', text: stranger.hook, timestamp: Date.now() }]
            });
            
            if (window.actions?.saveStore) window.actions.saveStore();
            window.forumState.strangers = window.forumState.strangers.filter(s => s.id !== id);
            window.forumActions.closeStrangerDetail();
            window.actions.setCurrentApp('wechat');
        },
        openPostDetail: (id) => { 
            window.forumState.activePostId = id; window.forumState.view = 'detail'; window.forumState.replyingToCommentId = null; window.render(); 
            const post = store.forumPosts.find(p => p.id === id);
            // 🌟 加上并发锁判断！如果正在加载，绝不再发请求！
            if (post && (!post.comments || post.comments.length === 0) && !window.forumState.isLoadingComments) {
                generateAIReactions(post.id, false); 
            }
        },
        closePostDetail: () => { window.forumState.view = 'list'; window.forumState.activePostId = null; window.render(); },
        loadMoreComments: (id) => { generateAIReactions(id, true); },
        
        openReplyInput: (commentId) => {
            window.forumState.replyingToCommentId = window.forumState.replyingToCommentId === commentId ? null : commentId; window.render();
            if (window.forumState.replyingToCommentId) setTimeout(() => { const el = document.getElementById(`forum-reply-input-${commentId}`); if (el) el.focus(); }, 50);
        },
        submitReply: (postId, commentId) => {
            const input = document.getElementById(`forum-reply-input-${commentId}`);
            if (!input || !input.value.trim()) return;
            const replyText = input.value.trim();
            const post = store.forumPosts.find(p => p.id === postId);
            if (!post) return;
            const target = post.comments.find(c => c.id === commentId);
            if (!target) return;

            const nextFloor = (post.comments && post.comments.length > 0) ? Math.max(...post.comments.map(c => c.floor || 0)) + 1 : 1;
            post.comments.push({ id: Date.now(), timestamp: Date.now(), floor: nextFloor, author: displayName, content: replyText, replyTo: target.author });
            window.forumState.replyingToCommentId = null; window.render(); scrollToDetailBottom();
            generateAICommentReply(postId, target, replyText);
        },
        commentOnPost: (postId) => {
            const input = document.getElementById(`forum-post-comment-input-${postId}`);
            if (!input || !input.value.trim()) return;
            const replyText = input.value.trim();
            const post = store.forumPosts.find(p => p.id === postId);
            if (!post) return;

            const nextFloor = (post.comments && post.comments.length > 0) ? Math.max(...post.comments.map(c => c.floor || 0)) + 1 : 1;
            post.comments.push({ id: Date.now(), timestamp: Date.now(), floor: nextFloor, author: displayName, content: replyText });
            input.value = ''; window.render(); scrollToDetailBottom();
            
            if (!post.isMine) generateAICommentReply(postId, { author: post.author, content: post.title || post.content, isPost: true }, replyText);
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
            if (window.actions?.compressImage) {
                files.forEach(file => {
                    window.actions.compressImage(file, async (base64) => {
                        try {
                            window.actions?.showToast('上传中…');
                            const url = await window.uploadMediaToCloud(base64, 'webp');
                            window.forumState.draft.mediaList.push({ type: 'real_image', url });
                            window.render();
                        } catch (err) {
                            console.error('[uploadMediaToCloud] forum image', err);
                            window.actions?.showToast('上传失败，请重试');
                        }
                    }, true);
                });
            }
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
            
            if (window.actions?.showToast) window.actions.showToast('帖子发布成功！网友正在火速赶来...');
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
                // 🌟 修复2：不再粗暴屏蔽自己的帖子，而是屏蔽被打上“隐藏标记”的旧帖子！
                let allDiscover = currentForumPosts.filter(p => p.type === 'discover' && !p.hiddenFromDiscover);
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
    // 📖 渲染：帖子详情页 
    // ==========================================
    else if (state.view === 'detail') {
        const post = store.forumPosts.find(p => p.id === state.activePostId);
        if (post) {
            let fullMediaHtml = '';
            if (post.mediaList && post.mediaList.length > 0) {
                const items = post.mediaList.map(m => {
                    if (m.type === 'real_image') return `<img src="${m.url}" class="w-full mt-3 object-cover rounded-xl shadow-sm border border-gray-100" />`;
                    const isImg = m.type === 'virtual_image';
                    return `
                    <div class="relative w-full min-h-[12rem] bg-white cursor-pointer select-none rounded-xl border border-gray-200 overflow-hidden shadow-sm mt-3" onclick="const overlay = this.querySelector('.img-overlay'); overlay.classList.toggle('opacity-0'); overlay.classList.toggle('pointer-events-none');">
                        <div class="absolute inset-0 p-4 overflow-y-auto text-[13px] text-gray-700 leading-relaxed text-left bg-white hide-scrollbar">
                            <span class="font-bold text-gray-400 block mb-2 flex items-center"><i data-lucide="${isImg ? 'image' : 'video'}" class="w-4 h-4 mr-1 ${!isImg ? 'text-blue-400' : ''}"></i>${isImg ? '照片内容：' : '视频内容：'}</span>
                            ${m.desc || (isImg ? '一张虚拟照片' : '一段虚拟视频')}
                        </div>
                        <div class="img-overlay absolute inset-0 bg-[#f8f9fa] flex flex-col items-center justify-center text-gray-400 transition-opacity duration-300 z-10">
                            <i data-lucide="${isImg ? 'image' : 'video'}" class="w-10 h-10 mb-2 ${!isImg ? 'text-blue-400 opacity-80' : 'opacity-50'}"></i>
                            <span class="text-[12px] font-bold tracking-widest animate-pulse">点击查看${isImg ? '照片' : '视频'}</span>
                        </div>
                    </div>`;
                }).join('');
                fullMediaHtml = `<div class="flex flex-col">${items}</div>`;
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
                const sortedComments = post.comments.slice().sort((a,b) => (a.floor || 0) - (b.floor || 0) || a.timestamp - b.timestamp);
                
                commentsHtml = sortedComments.map(c => {
                    const isReplying = state.replyingToCommentId === c.id;
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
                            <div class="text-[13px] font-extrabold text-gray-500">${c.author}</div>
                            <div class="text-[15px] text-gray-800 mt-1.5 leading-relaxed break-words font-medium">
                                ${c.replyTo ? `回复 <span class="text-blue-500">@${c.replyTo}</span>：` : ''}${c.content}
                            </div>
                            ${replyInputHtml}
                            <div class="flex items-center justify-between mt-2">
                                <div class="text-[11px] font-bold text-gray-400">${c.floor ? c.floor+'楼 · ' : ''}${formatForumTime(c.timestamp)}</div>
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
                                <button onclick="if(!window.forumState.isLoadingComments) window.forumActions.loadMoreComments(${post.id})" class="px-6 py-2.5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-bold flex items-center shadow-sm transition-colors ${state.isLoadingComments ? 'opacity-50 bg-gray-100 cursor-not-allowed' : 'active:bg-gray-50'}">
                                    <i data-lucide="loader" class="w-4 h-4 mr-1.5 ${state.isLoadingComments ? 'animate-spin inline-block' : 'hidden'}"></i>
                                    ${state.isLoadingComments ? '评论加载中...' : '加载更多评论'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="border-t border-gray-100 bg-white px-4 py-2.5 pb-safe flex items-center space-x-3 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] z-30">
                        <input type="text" id="forum-post-comment-input-${post.id}" class="flex-1 bg-[#f4f5f7] rounded-full px-4 py-2 text-[14px] text-gray-800 outline-none placeholder-gray-400 transition-colors focus:bg-white border border-transparent focus:border-gray-200 shadow-inner" placeholder="留下你的评论..." onkeydown="if(event.key==='Enter') window.forumActions.commentOnPost(${post.id})">
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
    // ==========================================
    // 📖 视图路由：私信列表 / 盲盒匹配
    // ==========================================
    if (state.view === 'messages') {
        let tabsHtml = `
            <div class="flex p-1 bg-gray-100 rounded-full mx-16 mt-2 mb-4">
                <div class="flex-1 py-1.5 text-center text-[13px] font-bold rounded-full cursor-pointer transition-all ${state.messageTab === 'contacts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}" onclick="window.forumActions.switchMessageTab('contacts')">好友私信</div>
                <div class="flex-1 py-1.5 text-center text-[13px] font-bold rounded-full cursor-pointer transition-all ${state.messageTab === 'discover' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}" onclick="window.forumActions.switchMessageTab('discover')">陌生人私信</div>
            </div>
        `;

        let listHtml = '';
        if (state.messageTab === 'contacts') {
            const contactsListHtml = (store.contacts || []).map(char => {
                const fChat = store.forumChats.find(c => c.charId === char.id);
                const lastMsg = fChat && fChat.messages.length > 0 ? fChat.messages[fChat.messages.length - 1] : null;
                return `
                    <div class="flex items-center space-x-3 p-4 active:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors" onclick="window.forumActions.openForumChat('${char.id}')">
                        <img src="${char.avatar}" class="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-100 shadow-sm">
                        <div class="flex flex-col flex-1 overflow-hidden">
                           <div class="flex justify-between items-center"><span class="text-[15px] font-black text-gray-800 truncate">${char.name}</span></div>
                           <span class="text-[13px] text-gray-500 mt-1 truncate">${lastMsg ? lastMsg.text : '暂无反应'}</span>
                        </div>
                    </div>`;
            }).join('');
            
            listHtml = `
                <div class="px-4 pb-20">
                    ${contactsListHtml || `<div class="text-center text-gray-400 mt-20 text-[13px] font-bold">暂无联系人</div>`}
                    <div class="flex justify-center mt-6">
                        <button class="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-full text-[13px] font-bold shadow-sm active:bg-gray-50 flex items-center transition-colors" onclick="window.forumActions.refreshContactsReactions()">
                            <i data-lucide="refresh-cw" class="w-4 h-4 mr-2 ${state.isRefreshingContacts ? 'animate-spin' : ''}"></i>
                            ${state.isRefreshingContacts ? '正在获取反应...' : '获取好友对最新帖子的反应'}
                        </button>
                    </div>
                </div>`;
        } else {
            // 🌟 盲盒卡片流 (增加了极其精美的空状态启动 UI)
            if (state.isGeneratingStrangers) {
                listHtml = `<div class="flex flex-col items-center justify-center mt-20 text-gray-400"><i data-lucide="loader" class="w-8 h-8 animate-spin mb-3 text-indigo-400"></i><span class="text-[13px] font-bold tracking-widest">获取中...</span></div>`;
            } else if (state.strangers.length === 0) {
                // 🌟 当没有任何陌生人时，展示这个巨大的召唤按钮
                listHtml = `
                    <div class="flex flex-col items-center justify-center mt-24 text-gray-400 animate-in fade-in zoom-in-95 duration-300">
                        <div class="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4 shadow-inner border border-indigo-100">
                            <i data-lucide="radar" class="w-10 h-10 text-indigo-400"></i>
                        </div>
                        <span class="text-[15px] font-black text-gray-600 mb-1">茫茫人海，还未相遇</span>
                        <span class="text-[12px] font-bold text-gray-400 mb-8">打捞几个漂流瓶，看看会有怎样的羁绊</span>
                        <button class="px-8 py-3.5 bg-gray-900 text-white rounded-full text-[14px] font-black shadow-lg shadow-gray-900/20 active:scale-95 flex items-center transition-transform" onclick="window.forumActions.refreshStrangers()">
                            <i data-lucide="radar" class="w-4 h-4 mr-2"></i>开始打捞
                        </button>
                    </div>
                `;
            } else {
                const strangersHtml = state.strangers.map(s => {
                    const allTags = [...s.baseTags, ...s.mutatedTags];
                    const tagsHtml = allTags.map(t => `<span class="bg-indigo-50 text-indigo-500 text-[10px] font-extrabold px-2 py-1 rounded-md mr-1.5 mb-1.5 whitespace-nowrap">#${t}</span>`).join('');
                    return `
                        <div class="bg-white rounded-[20px] p-5 shadow-sm border border-gray-100 mb-4 cursor-pointer active:scale-[0.98] transition-transform" onclick="window.forumActions.openStrangerDetail('${s.id}')">
                            <div class="flex items-start space-x-4">
                                <img src="${s.avatar}" class="w-14 h-14 rounded-full object-cover shrink-0 border border-gray-100 shadow-sm bg-gray-50">
                                <div class="flex flex-col flex-1">
                                    <div class="text-[16px] font-black text-gray-900 mb-1 select-none">${s.name}</div>
                                    <div class="flex flex-wrap mb-3">${tagsHtml}</div>
                                    <div class="bg-gray-50 p-3 rounded-xl text-[14px] text-gray-700 font-medium italic border-l-2 border-indigo-300">"${s.hook}"</div>
                                </div>
                            </div>
                        </div>`;
                }).join('');
                listHtml = `<div class="px-4 pb-20">${strangersHtml}<div class="flex justify-center mt-6"><button class="px-6 py-2.5 bg-gray-900 text-white rounded-full text-[13px] font-bold shadow-lg shadow-gray-900/20 active:scale-95 flex items-center transition-transform" onclick="window.forumActions.refreshStrangers()"><i data-lucide="refresh-cw" class="w-4 h-4 mr-2"></i>换一批</button></div></div>`;
            }
        }

        contentHtml = `
            <div class="absolute inset-0 bg-white z-[65] flex flex-col animate-in slide-in-from-right-4 duration-200">
                <div class="pt-8 pb-2 px-4 flex items-center justify-between border-b border-gray-100/50 sticky top-0 bg-white/90 backdrop-blur-md z-10">
                    <div class="cursor-pointer active:opacity-50 text-gray-600 w-8" onclick="window.forumActions.closePrivateMessages()"><i data-lucide="chevron-left" class="w-7 h-7"></i></div>
                    <span class="text-[16px] font-black text-gray-800">我的私信</span>
                    <div class="w-8"></div>
                </div>
                ${tabsHtml}
                <div class="flex-1 overflow-y-auto hide-scrollbar bg-[#f8f9fa]">${listHtml}</div>
            </div>
        `;
    }

    // ==========================================
    // 📖 视图路由：盲盒深度资料卡 (防雷折叠)
    // ==========================================
    else if (state.view === 'stranger_detail') {
        const s = state.strangers.find(x => x.id === state.activeStrangerId);
        if (s) {
            let detailContent = '';
            if (state.isGeneratingProfile) {
                detailContent = `<div class="flex flex-col items-center justify-center py-20 text-gray-400"><i data-lucide="loader" class="w-8 h-8 animate-spin mb-4 text-indigo-400"></i><span class="text-[13px] font-bold tracking-widest animate-pulse">正在深度解析人物灵魂...</span></div>`;
            } else if (s.profile) {
                const p = s.profile;
                detailContent = `
                    <div class="space-y-4 animate-in fade-in duration-300">
                        <div class="bg-white rounded-[20px] p-5 border border-gray-100 shadow-sm relative">
                            <div class="absolute top-4 right-4 text-gray-300 hover:text-indigo-400 cursor-pointer active:rotate-180 transition-transform duration-500" onclick="window.forumActions.rerollStrangerProfile('${s.id}')">
                                <i data-lucide="refresh-ccw" class="w-4 h-4"></i>
                            </div>

                            <div class="text-[12px] font-black text-indigo-400 mb-3 flex items-center"><i data-lucide="user" class="w-4 h-4 mr-1"></i>表面设定与社交档案</div>
                            <div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3"><span class="text-gray-400 font-bold">真实姓名：</span>${p.realName}</div>
                            <div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3"><span class="text-gray-400 font-bold">社会身份：</span>${p.identity}</div>
                            <div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3"><span class="text-gray-400 font-bold">外貌气味：</span>${p.appearance}</div>
                            <div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3"><span class="text-gray-400 font-bold">行为特征：</span>${p.behavior}</div>
                            <div class="text-[14px] text-gray-800 leading-relaxed font-medium"><span class="text-gray-400 font-bold">人际社交：</span>${p.social}</div>
                        </div>
                        
                        <details class="bg-white rounded-[20px] border border-gray-100 shadow-sm group">
                            <summary class="p-5 text-[12px] font-black text-rose-400 flex items-center justify-between cursor-pointer outline-none select-none list-none">
                                <div class="flex items-center"><i data-lucide="lock" class="w-4 h-4 mr-1.5"></i>点击解锁：过往档案与私密偏好</div>
                                <i data-lucide="chevron-down" class="w-4 h-4 transition-transform group-open:rotate-180"></i>
                            </summary>
                            <div class="px-5 pb-5 pt-1 border-t border-gray-50">
                                <div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3 mt-2"><span class="text-rose-300 font-bold">过往经历：</span>${p.background}</div>
                                <div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3"><span class="text-rose-300 font-bold">秘密冲突：</span>${p.secret}</div>
                                ${p.optional_flaws && !p.optional_flaws.includes('无') ? `<div class="text-[14px] text-gray-800 leading-relaxed font-medium mb-3"><span class="text-rose-300 font-bold">缺失病痛：</span>${p.optional_flaws}</div>` : ''}
                                <div class="text-[14px] text-gray-800 leading-relaxed font-medium"><span class="text-rose-300 font-bold">亲密偏好：</span>${p.nsfw_kinks}</div>
                            </div>
                        </details>
                    </div>
                `;
            }

            contentHtml = `
                <div class="absolute inset-0 bg-[#f4f5f7] z-[70] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
                    <div class="h-40 bg-gray-900 relative">
                        <div class="absolute top-8 left-4 cursor-pointer active:opacity-50 text-white z-10" onclick="window.forumActions.closeStrangerDetail()"><i data-lucide="chevron-down" class="w-8 h-8"></i></div>
                    </div>
                    <div class="flex-1 overflow-y-auto hide-scrollbar px-5 pb-32 -mt-10 z-10">
                        <div class="flex flex-col items-center mb-6">
                            <img src="${s.avatar}" class="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md bg-white">
                            <span class="text-[22px] font-black text-gray-900 mt-3">${s.name}</span>
                            <div class="flex flex-wrap justify-center mt-3 gap-1.5 max-w-[80%]">${[...s.baseTags, ...s.mutatedTags].map(t => `<span class="bg-indigo-100/50 text-indigo-600 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-indigo-100">#${t}</span>`).join('')}</div>
                        </div>
                        <div class="bg-gray-900 text-white p-4 rounded-[16px] text-[15px] font-medium italic text-center mb-5 shadow-lg shadow-gray-900/20 leading-relaxed">"${s.hook}"</div>
                        ${detailContent}
                    </div>
                    
                    ${!state.isGeneratingProfile ? `
                    <div class="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe pt-3 px-5 flex space-x-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-20">
                        <button class="flex-1 py-3.5 bg-gray-100 text-gray-500 rounded-full font-black text-[15px] active:scale-95 transition-transform" onclick="window.forumActions.rejectStranger('${s.id}')">不感兴趣</button>
                        <button class="flex-[2] py-3.5 bg-indigo-500 text-white rounded-full font-black text-[15px] active:scale-95 transition-transform shadow-md shadow-indigo-500/30 flex items-center justify-center" onclick="window.forumActions.acceptStranger('${s.id}')"><i data-lucide="user-plus" class="w-4 h-4 mr-1.5"></i>通过验证，开聊</button>
                    </div>` : ''}
                </div>
            `;
        }
    }
    // ==========================================
    // 📖 视图路由：论坛独立私信单聊页 (原生控制)
    // ==========================================
    else if (state.view === 'forum_chat') {
        const char = store.contacts.find(c => c.id === state.activeForumChatId);
        if (char) {
            const fChat = store.forumChats.find(c => c.charId === char.id);
            const messagesHtml = (fChat ? fChat.messages : []).map(m => {
                const isMe = m.isMe;
                const avatar = isMe ? displayAvatar : char.avatar;
                return `
                    <div class="flex items-start mb-4 ${isMe ? 'flex-row-reverse' : ''}">
                        <img src="${avatar}" class="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-100 shadow-sm ${isMe ? 'ml-3' : 'mr-3'}">
                        <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]">
                            <div class="text-[11px] text-gray-400 mb-1 mx-1">${m.sender}</div>
                            <div class="px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed shadow-sm ${isMe ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'}">
                                ${m.text}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div class="absolute inset-0 bg-[#f4f5f7] z-[70] flex flex-col animate-in slide-in-from-right-4 duration-200">
                    <div class="pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-200/50 z-20 sticky top-0 bg-white/90 backdrop-blur-md shadow-sm">
                        <div class="cursor-pointer active:opacity-50 text-gray-600 w-8" onclick="window.forumActions.closeForumChat()"><i data-lucide="chevron-left" class="w-7 h-7"></i></div>
                        <span class="text-[16px] font-black text-gray-800 absolute left-1/2 -translate-x-1/2">${char.name}</span>
                        <div class="w-8 flex justify-end">
                            <div class="cursor-pointer active:opacity-50 text-gray-500 p-1" onclick="window.forumActions.forwardForumChatToWeChat('${char.id}')"><i data-lucide="forward" class="w-5 h-5"></i></div>
                        </div>
                    </div>
                    
                    <div id="forum-chat-scroll" class="flex-1 overflow-y-auto p-4 hide-scrollbar">
                        ${messagesHtml || '<div class="text-center text-gray-400 mt-10 text-[12px] font-bold">还没有聊天记录</div>'}
                    </div>

                    <div class="border-t border-gray-200 bg-white p-3 pb-safe flex items-center space-x-2 shadow-[0_-5px_15px_rgba(0,0,0,0.03)] z-30">
                        <input type="text" id="forum-chat-input" class="flex-1 bg-[#f8f9fa] border border-gray-200 rounded-full px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:bg-white focus:border-indigo-300 transition-colors shadow-inner" placeholder="发消息..." onkeydown="if(event.key==='Enter') window.forumActions.sendForumChatMsg('${char.id}')">
                        
                        <button class="px-3.5 py-2.5 bg-transparent text-gray-600 rounded-full text-[13px] font-extrabold flex items-center cursor-pointer active:scale-95 transition-transform disabled:opacity-50 shrink-0" onclick="window.forumActions.getForumChatReply('${char.id}')" ${state.isReplyingForumChat ? 'disabled' : ''}>
                            <i data-lucide="sparkles" class="w-6 h-6 ml-1 ${state.isReplyingForumChat ? 'animate-pulse' : ''}"></i>
                        </button>
                    </div>
                </div>
            `;
        }
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
                <div class="w-[85%] max-h-[80%] bg-[#fff] rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <span class="text-[16px] font-black text-gray-800">${d.id ? '频道设置' : '新建频道'}</span>
                        <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.forumActions.closeForumSettings()"></i>
                    </div>
                    <div id="forum-settings-scroll" class="flex-1 overflow-y-auto p-5 space-y-5 hide-scrollbar">
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
        // 加上 (store.chats || []) 的安全后备，防止空列表导致报错卡死！
        const chatsListHtml = (store.chats || []).map(chat => {
            const char = (store.contacts || []).find(c => c.id === chat.charId);
            let name = chat.isGroup ? chat.groupName : (char ? char.name : '未知');
            let avatarHtml = chat.isGroup 
                ? `<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0 border border-gray-100"><i data-lucide="users" class="w-5 h-5 text-gray-500"></i></div>` 
                : `<img src="${char?.avatar || 'https://api.dicebear.com/7.x/notionists-neutral/svg?seed=user'}" class="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-100">`;
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
                <div style="background: #ffffff !important;" class="rounded-[20px] p-5 w-[85%] max-h-[70%] flex flex-col animate-in zoom-in-95 duration-200 shadow-xl" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                        <span class="text-[16px] font-black text-gray-800">发送给...</span>
                        <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.forumActions.closeShareModal()"></i>
                    </div>
                    <div class="flex-1 overflow-y-auto hide-scrollbar space-y-1">
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
                <span class="text-[16px] font-black text-gray-800 absolute left-1/2 -translate-x-1/2">发贴</span>
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