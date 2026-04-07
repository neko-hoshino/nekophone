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
        isGeneratingPost: false, // 🌟 新增：AI 生成状态锁定
        postData: { title: '', content: '', mediaDesc: '', hasShowcase: false, topics: [], commercialInfo: '' } // 预留商单字段
    };
}

if (!window.bloggerActions) {
    window.bloggerActions = {
        openCreateModal: () => { window.bloggerState.showCreateModal = true; window.render(); },
        closeCreateModal: () => { window.bloggerState.showCreateModal = false; window.render(); },
        
        sendSyncInvite: (charId) => {
            const chat = store.chats.find(c => c.charId === charId);
            const char = store.contacts.find(c => c.id === charId);
            if (store.syncAccounts?.find(a => a.charId === charId)) return window.actions.showToast('你们已经有共同账号啦！');
            if (chat && char) {
                const pId = chat.isGroup ? chat.boundPersonaId : (char?.boundPersonaId || store.personas[0].id);
                const boundPersona = store.personas.find(p => p.id === pId) || store.personas[0];
                chat.messages.push({
                    id: Date.now(), sender: boundPersona.name, isMe: true, msgType: 'sync_invite_card',
                    text: '[Sync博主共创邀请]', timestamp: Date.now(), time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})
                });
                if (typeof window.scheduleCloudTask === 'function') window.scheduleCloudTask(charId, "(系统指令：用户向你发送了[Sync]情侣博主账号的共同运营邀请函。这是一款类似小红书的社交软件。请回复[接受Sync邀请]，并表达我们要一起狂秀恩爱、成为大博主的期待！[接受Sync邀请]须单独成行。)");
                if (window.actions?.showToast) window.actions.showToast('邀请函已发送！等 TA 同意后即可建号~');
            }
            window.bloggerState.showCreateModal = false; window.render();
        },
        
        enterAccount: (accId) => {
            window.bloggerState.currentAccountId = accId;
            window.bloggerState.view = 'dashboard';
            window.bloggerState.currentTab = 'profile'; 
            window.render();
        },
        
        goBack: () => {
            if (window.bloggerState.view === 'dashboard') {
                window.bloggerState.view = 'account_select';
                window.bloggerState.currentAccountId = null;
                window.render();
            } else { window.actions.setCurrentApp(null); }
        },

        switchTab: (tab) => { window.bloggerState.currentTab = tab; window.render(); },
        updateProfile: (accId, field, value) => {
            const acc = store.syncAccounts.find(a => a.id === accId);
            if (acc) { acc[field] = value.trim(); if (window.actions?.saveStore) window.actions.saveStore(); }
        },

        // ==========================================
        // 🌟 发帖交互逻辑
        // ==========================================
        openPublishMenu: () => { window.bloggerState.showPublishMenu = true; window.render(); },
        closePublishMenu: () => { window.bloggerState.showPublishMenu = false; window.render(); },
        openLive: () => { window.actions.showToast('直播间搭建中，敬请期待...'); window.bloggerState.showPublishMenu = false; window.render(); },
        
        openCreatePost: () => {
            window.bloggerState.showPublishMenu = false;
            window.bloggerState.showCreatePostModal = true;
            window.bloggerState.postData = { title: '', content: '', mediaDesc: '', hasShowcase: false, topics: [], commercialInfo: '' };
            window.render();
        },
        closeCreatePost: () => { window.bloggerState.showCreatePostModal = false; window.render(); },
        
        // 注意：输入框触发的更新绝不能调用 window.render()，否则光标会跳回开头！
        updatePostField: (field, value) => { window.bloggerState.postData[field] = value; },
        
        toggleShowcase: () => {
            window.bloggerState.postData.hasShowcase = !window.bloggerState.postData.hasShowcase;
            if (window.bloggerState.postData.hasShowcase) window.actions.showToast('✅ 橱窗已挂载！');
            window.render();
        },
        addTopic: () => {
            const topic = prompt("请输入你要添加的话题（无需输入#号）：");
            if (topic && topic.trim() !== '') { window.bloggerState.postData.topics.push(topic.trim()); window.render(); }
        },
        removeTopic: (index) => { window.bloggerState.postData.topics.splice(index, 1); window.render(); },

        // ==========================================
        // 🌟 核心：AI 智能续写/生成帖文引擎
        // ==========================================
        generatePostContent: async () => {
            const state = window.bloggerState;
            if (state.isGeneratingPost) return;

            const acc = store.syncAccounts.find(a => a.id === state.currentAccountId);
            if (!acc) return;
            const charId = acc.charId;
            const chat = store.chats.find(c => c.charId === charId);
            const char = store.contacts.find(c => c.id === charId);
            const boundP = store.personas.find(p => p.id === (chat.isGroup ? chat.boundPersonaId : char?.boundPersonaId)) || store.personas[0];
            
            state.isGeneratingPost = true;
            window.render();

            try {
                // 1. 组装环境记忆与世界观
                const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
                const boundPrompt = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';
                const basePrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【用户】\n当前化名：${boundP.name}${globalP}${boundPrompt}`;

                const coreMem = (store.memories || []).filter(m => m.charId === charId && m.type === 'core').map(m=>m.content).join('；');
                const coreMemStr = coreMem ? `\n\n【核心记忆】\n${coreMem}` : '';

                // 当前草稿提取（用于匹配碎片记忆）
                const currentDraft = state.postData.content.replace(/<[^>]+>/g, '').trim(); 

                let fragMemStr = '';
                if (currentDraft) {
                    const frags = (store.memories || []).filter(m => m.charId === charId && m.type === 'fragment').filter(m => {
                        const kws = (m.keywords || '').split(',').map(k=>k.trim()).filter(k=>k);
                        return kws.some(k => currentDraft.includes(k));
                    }).map(m=>m.content).join('；');
                    if (frags) fragMemStr = `\n\n【触发的回忆片段】\n${frags}`;
                }

                // 🌟 Blogger 专属世界书挂载引擎
                let frontWb = [], middleWb = [], backWb = [];
                (store.worldbooks || []).forEach(wbItem => {
                    if (!wbItem.enabled) return;
                    let shouldInject = false;
                    if (wbItem.type === 'global') shouldInject = true;
                    else if (wbItem.type === 'local') {
                        if (char.mountedWorldbooks && char.mountedWorldbooks.includes(wbItem.id)) shouldInject = true;
                        if (char.bloggerWorldbooks && char.bloggerWorldbooks.includes(wbItem.id)) shouldInject = true; // 预留接口
                    }
                    if (shouldInject) {
                        const entryStr = `【${wbItem.title}】：${wbItem.content}`;
                        if (wbItem.position === 'front') frontWb.push(entryStr);
                        else if (wbItem.position === 'back') backWb.push(entryStr);
                        else middleWb.push(entryStr);
                    }
                });

                const frontStr = frontWb.length > 0 ? `\n\n[前置世界观设定]\n${frontWb.join('\n')}` : '';
                const middleStr = middleWb.length > 0 ? `\n\n[当前环境/场景设定]\n${middleWb.join('\n')}` : '';
                const backStr = backWb.length > 0 ? `\n\n[最新世界书指令]\n${backWb.join('\n')}` : '';

                // 🌟 提取近30回合（60条）聊天记录，抓取情侣日常氛围
                let historyStr = '';
                if (chat && chat.messages) {
                    const recentMsgs = chat.messages.filter(m => m.msgType === 'text').slice(-60);
                    if (recentMsgs.length > 0) {
                        historyStr = `\n\n【最近微信聊天记录(请深层分析你们的互动日常和当前正在发生的事)】\n` + recentMsgs.map(m => `[${m.sender}]: ${m.text}`).join('\n');
                    }
                }

                // 商单预留
                const commercialStr = state.postData.commercialInfo ? `\n\n【本次需植入的商单信息】\n${state.postData.commercialInfo}` : '';

                // 动态任务指令
                let task = '';
                if (currentDraft) {
                    task = `你和伴侣正在共同编辑情侣博主账号的最新帖子。伴侣已经写了草稿：“${currentDraft}”。\n请你紧密结合上面的微信聊天记录，顺着ta的话题往下补充，将日常的甜腻、搞笑或恩爱细节展现给粉丝看。只输出你续写的纯文本正文内容（可含emoji），不要重复ta的话，不需要任何格式和前缀！`;
                } else {
                    task = `你需要为你们的情侣博主账号写一篇新的日常帖子。请立刻结合上方的“最近微信聊天记录”，总结你们最近经历的趣事或浪漫瞬间，写一段发在主页的分享文案。语气自然不做作，充满情侣间的宠溺或打闹，适当加emoji。只输出纯文本正文内容，不需要前缀！`;
                }

                const finalPrompt = `${basePrompt}${coreMemStr}${frontStr}\n${middleStr}${fragMemStr}${backStr}${historyStr}${commercialStr}\n\n【系统任务】\n${task}`;

                // 🌟 调用大模型 (这里对接你现有的 baseUrl 和 API Key，也可以接 Neko 服务器)
                const apiKey = localStorage.getItem('api-key') || '';
                const baseUrl = (localStorage.getItem('api-url') || 'https://api.openai.com').replace(/\/$/, '') + '/v1/chat/completions';
                const model = localStorage.getItem('api-model') || 'gpt-4o-mini';
                
                let aiGeneratedText = '';
                
                if (apiKey) {
                    const res = await fetch(baseUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({ model: model, messages: [{ role: 'user', content: finalPrompt }], temperature: 0.75 })
                    });
                    const jsonRes = await res.json();
                    if (jsonRes.choices && jsonRes.choices[0]) {
                        aiGeneratedText = jsonRes.choices[0].message.content.trim();
                    }
                } else {
                    // 没有配置 API 时的本地兜底模拟
                    await new Promise(r => setTimeout(r, 1500));
                    aiGeneratedText = currentDraft 
                        ? '我也超级享受和你在一起的时光！看到这条的粉丝宝宝们要监督他以后多洗碗哦～🙈' 
                        : '偷偷记录一下今天和宝宝的完美约会！希望我们的快乐也能传递给屏幕前的你们！✨💖';
                }

                // 🌟 魔法拼合：原有的黑色文字 + 专属的灰色 AI 字体区！
                const formattedAiText = aiGeneratedText.replace(/\n/g, '<br>');
                // 加入 &nbsp; 保护罩，防止用户接下来打字时被吞进灰色区域里
                const newHtml = state.postData.content + (state.postData.content ? '<br><br>' : '') + `<span class="text-gray-400 font-medium">${formattedAiText}</span><span class="text-gray-900">&nbsp;</span>`;
                
                state.postData.content = newHtml;

            } catch (e) {
                console.error(e);
                window.actions.showToast('AI 获取灵感失败，请检查网络或 API 设置');
            } finally {
                state.isGeneratingPost = false;
                window.render();
            }
        },

        publishPost: () => {
            const data = window.bloggerState.postData;
            // 获取纯文本判断是否为空
            const pureContent = data.content.replace(/<[^>]+>/g, '').trim();

            if (!data.mediaDesc) return window.actions.showToast('⚠️ 请描述一下你要发布的虚拟照片或视频哦！');
            if (!data.title && !pureContent) return window.actions.showToast('⚠️ 标题和正文不能都为空！');

            const acc = store.syncAccounts.find(a => a.id === window.bloggerState.currentAccountId);
            if (acc) {
                acc.posts = acc.posts || [];
                const heightArr = ['h-[180px]', 'h-[200px]', 'h-[240px]', 'h-[160px]'];
                const colorArr = ['bg-gray-100', 'bg-gray-200', 'bg-gray-300'];
                
                acc.posts.unshift({
                    id: Date.now(),
                    title: data.title || '记录日常 📸',
                    desc: pureContent, // 列表展示只需要纯文本
                    htmlContent: data.content, // 详情页展示保留灰/黑双色富文本
                    mediaDesc: data.mediaDesc,
                    hasShowcase: data.hasShowcase,
                    topics: data.topics,
                    likes: 0,
                    height: heightArr[Math.floor(Math.random() * heightArr.length)],
                    color: colorArr[Math.floor(Math.random() * colorArr.length)]
                });
                if (window.actions.saveStore) window.actions.saveStore();
            }
            
            window.actions.showToast('✨ 动态发布成功！');
            window.bloggerState.showCreatePostModal = false;
            window.render();
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
        const targetChar = store.contacts.find(c => c.id === acc.charId);
        const partnerAvatar = targetChar ? targetChar.avatar : acc.avatar;

        const displayPosts = (acc.posts && acc.posts.length > 0) ? acc.posts : [
            { id: 1, title: '周末碎片 ☕️ | 我们的探店日常', desc: 'OUR WEEKEND VLOG', likes: 128, height: 'h-[180px]', color: 'bg-gray-100' },
            { id: 2, title: 'OOTD | 晚风与你 💙', desc: 'CAPTURE THE MOMENT', likes: 342, height: 'h-[240px]', color: 'bg-gray-200' },
            { id: 3, title: '终于买到情侣水杯！', desc: 'NEW IN OUR LIFE', likes: 89, height: 'h-[160px]', color: 'bg-gray-100' },
            { id: 4, title: '纪念日 Vlog 🎞️ | 浪漫的夜晚', desc: 'ANNIVERSARY', likes: 520, height: 'h-[200px]', color: 'bg-gray-200' }
        ];

        return `
            <div class="w-full h-full flex flex-col relative animate-in fade-in duration-300" style="background-color: #ffffff !important;">
                
                <div class="pt-8 pb-3 px-5 flex items-center justify-between z-40 relative shrink-0 border-b border-gray-50" style="background-color: #ffffff !important;">
                    <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.goBack()">
                        <i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i>
                    </div>
                    <div class="font-black text-gray-900 text-[18px] tracking-[0.2em] font-serif uppercase">Sync.</div>
                    <div class="w-10 flex justify-end text-gray-900">
                        <i data-lucide="more-horizontal" class="w-5 h-5 cursor-pointer active:opacity-50"></i>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto hide-scrollbar pb-24 relative">
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
                                    <input type="text" value="${acc.name}" onchange="window.bloggerActions.updateProfile('${acc.id}', 'name', this.value)" class="w-full bg-transparent font-bold font-serif tracking-widest uppercase text-white outline-none placeholder-gray-500" style="font-size: 15px !important;" placeholder="ACCOUNT NAME">
                                    <input type="text" value="${acc.desc || 'SYNC OUR LIFESTYLE'}" onchange="window.bloggerActions.updateProfile('${acc.id}', 'desc', this.value)" class="w-full bg-transparent text-gray-400 mt-0.5 tracking-[0.2em] uppercase outline-none placeholder-gray-600" style="font-size: 9px !important; line-height: 1.2 !important;" placeholder="SIGNATURE / BIO">
                                </div>
                            </div>
                            <div class="w-[95px] bg-[#e5e5e5] text-gray-800 py-3 flex flex-col justify-center space-y-3.5 shadow-md items-start pl-4 shrink-0 rounded-l-[4px]">
                                <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity group">
                                    <i data-lucide="mail" class="w-3.5 h-3.5 mr-2 opacity-80"></i>
                                    <span class="text-[10px] font-bold tracking-widest font-serif border-b border-gray-400 pb-[1px] group-hover:border-gray-800">私信</span>
                                </div>
                                <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity group">
                                    <i data-lucide="inbox" class="w-3.5 h-3.5 mr-2 opacity-80"></i>
                                    <span class="text-[10px] font-bold tracking-widest font-serif border-b border-gray-400 pb-[1px] group-hover:border-gray-800">提问</span>
                                </div>
                                <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity group">
                                    <i data-lucide="shopping-bag" class="w-3.5 h-3.5 mr-2 opacity-80"></i>
                                    <span class="text-[10px] font-bold tracking-widest font-serif border-b border-gray-400 pb-[1px] group-hover:border-gray-800">橱窗</span>
                                </div>
                            </div>
                        </div>

                        <div class="px-2 pt-12 pb-4 w-full">
                            ${displayPosts.map((post, index) => {
                                const isLeft = index % 2 === 0;
                                const frameHtml = isLeft ? 
                                    `<div class="absolute left-3 top-3 w-[140px] h-[180px] border border-gray-300 z-0"></div><div class="absolute left-16 top-10 w-[100px] h-[120px] bg-white/80 backdrop-blur-md shadow-sm border border-gray-100 z-0"></div>` :
                                    `<div class="absolute right-3 top-3 w-[140px] h-[180px] border border-gray-300 z-0"></div><div class="absolute right-16 top-10 w-[100px] h-[120px] bg-white/80 backdrop-blur-md shadow-sm border border-gray-100 z-0"></div>`;
                                const contentClass = isLeft ?
                                    `ml-20 -mt-10 bg-white/95 pt-3 pr-2 pb-2 pl-4 border-l-[3px] border-[#1a1a1a] shadow-sm backdrop-blur-md` :
                                    `mr-20 -mt-10 bg-white/95 pt-3 pl-2 pb-2 pr-4 border-r-[3px] border-[#1a1a1a] text-right shadow-sm backdrop-blur-md`;

                                return `
                                <div class="mb-14 relative w-full ${isLeft ? 'pl-5 pr-8' : 'pr-5 pl-8 flex flex-col items-end'}">
                                    ${frameHtml}
                                    <div class="relative w-[140px] ${post.height} ${post.color} z-10 shadow-md flex items-center justify-center cursor-pointer active:scale-[0.98] transition-transform overflow-hidden border border-gray-100">
                                        ${post.mediaDesc ? `<div class="absolute inset-0 p-3 overflow-y-auto text-[10px] text-gray-600 bg-white leading-relaxed"><span class="font-bold text-gray-400 block mb-1 text-[9px] uppercase"><i data-lucide="image" class="w-3 h-3 inline-block -mt-0.5"></i> VIRTUAL SCENE</span>${post.mediaDesc}</div>` : `<i data-lucide="image" class="w-6 h-6 text-gray-400 opacity-40"></i>`}
                                        ${post.hasShowcase ? `<div class="absolute top-2 right-2 bg-orange-500/90 text-white p-1 rounded-full shadow-sm backdrop-blur-sm"><i data-lucide="shopping-bag" class="w-3 h-3"></i></div>` : ''}
                                    </div>
                                    <div class="relative z-20 ${contentClass}">
                                        <h4 class="font-bold text-gray-900 text-[14px] leading-snug font-serif tracking-[0.1em] mb-1 line-clamp-2">${post.title}</h4>
                                        <p class="text-[9px] text-gray-500 tracking-[0.1em] uppercase mb-1 font-mono opacity-80 line-clamp-1">${post.desc || ''}</p>
                                        ${post.topics && post.topics.length > 0 ? `<div class="flex flex-wrap gap-1 mb-1.5 ${!isLeft ? 'justify-end' : ''}">${post.topics.slice(0,2).map(t => `<span class="text-[9px] text-blue-500 font-bold">#${t}</span>`).join('')}</div>` : ''}
                                        <span class="text-[11px] text-gray-400 tracking-widest uppercase font-serif">${isLeft ? `<i data-lucide="heart" class="w-3.5 h-3.5 inline-block -mt-0.5 mr-1"></i>${post.likes}` : `${post.likes} <i data-lucide="heart" class="w-3.5 h-3.5 inline-block -mt-0.5 ml-1"></i>`}</span>
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <div class="flex flex-col items-center justify-center pt-32 text-gray-400">
                            <i data-lucide="bar-chart-2" class="w-12 h-12 mb-4 opacity-30 text-gray-900"></i>
                            <p class="text-[12px] tracking-[0.2em] font-serif uppercase text-gray-500">Author Studio</p>
                            <p class="text-[10px] mt-2 tracking-widest">商单与数据中心建设中</p>
                        </div>
                    `}
                </div>

                <div class="absolute bottom-0 left-0 w-full h-[75px] bg-white/95 backdrop-blur-xl border-t border-gray-100 flex justify-between items-start pt-3 px-10 pb-safe z-50 shadow-sm" style="background-color: #ffffff !important;">
                    <div class="flex flex-col items-center cursor-pointer transition-opacity ${state.currentTab==='profile' ? 'opacity-100 text-gray-900' : 'opacity-40 text-gray-500'}" onclick="window.bloggerActions.switchTab('profile')">
                        <i data-lucide="layout-grid" class="w-6 h-6 mb-1"></i>
                        <span class="text-[9px] font-bold uppercase tracking-[0.1em] font-serif">Profile</span>
                    </div>
                    <div class="relative -top-7 w-14 h-14 bg-[#1a1a1a] rounded-full flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.2)] cursor-pointer active:scale-90 transition-transform" onclick="window.bloggerActions.openPublishMenu()">
                        <i data-lucide="plus" class="w-6 h-6"></i>
                    </div>
                    <div class="flex flex-col items-center cursor-pointer transition-opacity ${state.currentTab==='studio' ? 'opacity-100 text-gray-900' : 'opacity-40 text-gray-500'}" onclick="window.bloggerActions.switchTab('studio')">
                        <i data-lucide="bar-chart-2" class="w-6 h-6 mb-1"></i>
                        <span class="text-[9px] font-bold uppercase tracking-[0.1em] font-serif">Studio</span>
                    </div>
                </div>

                ${state.showPublishMenu ? `
                    <div class="absolute inset-0 z-[99]" onclick="window.bloggerActions.closePublishMenu()"></div>
                    
                    <div class="absolute bottom-[90px] left-1/2 transform -translate-x-1/2 z-[100] bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 px-6 py-3 flex items-center space-x-5 whitespace-nowrap animate-in slide-in-from-bottom-2 fade-in duration-200">
                        <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity" onclick="window.bloggerActions.openCreatePost()">
                            <i data-lucide="pen-tool" class="w-4 h-4 mr-1.5 text-gray-900"></i>
                            <span class="text-[13px] font-bold text-gray-900 font-serif tracking-widest uppercase">发帖</span>
                        </div>
                        <div class="text-gray-300 mx-1">|</div>
                        <div class="flex items-center cursor-pointer active:opacity-50 transition-opacity" onclick="window.bloggerActions.openLive()">
                            <i data-lucide="video" class="w-4 h-4 mr-1.5 text-gray-900"></i>
                            <span class="text-[13px] font-bold text-gray-900 font-serif tracking-widest uppercase">直播</span>
                        </div>
                    </div>
                ` : ''}

                ${state.showCreatePostModal ? `
                    <div class="absolute inset-0 z-[101] flex flex-col animate-in slide-in-from-bottom-full duration-300" style="background-color: #ffffff !important;">
                        
                        <div class="pt-8 pb-3 px-5 flex items-center justify-between border-b border-gray-50 shrink-0 relative">
                            <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.closeCreatePost()">
                                <i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i>
                            </div>
                            <div class="absolute left-1/2 transform -translate-x-1/2 font-black text-[16px] font-serif tracking-[0.2em] uppercase text-gray-900">
                                New Post
                            </div>
                            <div class="w-10"></div>
                        </div>

                        <div class="flex-1 overflow-y-auto p-6 flex flex-col hide-scrollbar">
                            
                            <div class="w-full aspect-[4/5] bg-[#f9fafb] rounded-[16px] border border-gray-100 overflow-hidden mb-6 relative shadow-inner p-4 flex flex-col">
                                <div class="flex items-center text-gray-400 mb-3">
                                    <i data-lucide="image-plus" class="w-5 h-5 mr-2"></i>
                                    <span class="text-[12px] font-bold tracking-widest font-serif uppercase">Virtual Media</span>
                                </div>
                                <textarea oninput="window.bloggerActions.updatePostField('mediaDesc', this.value)" class="w-full flex-1 bg-transparent resize-none outline-none text-[14px] text-gray-700 leading-relaxed placeholder-gray-400" placeholder="描述你想发布的照片/视频画面 (如：海边牵手看日出的唯美合照)...">${state.postData.mediaDesc}</textarea>
                            </div>

                            <input type="text" value="${state.postData.title}" oninput="window.bloggerActions.updatePostField('title', this.value)" class="w-full text-[20px] font-black font-serif mb-4 outline-none bg-transparent placeholder-gray-300 text-gray-900 border-b border-gray-50 pb-3" style="font-size: 18px !important;" placeholder="填写一个抓人的标题...">
                            
                            <style>
                                /* CSS魔法：让空的 contenteditable 显示 placeholder */
                                #blogger-content-input:empty:before {
                                    content: attr(data-placeholder);
                                    color: #9ca3af;
                                    pointer-events: none;
                                    display: block;
                                }
                            </style>
                            <div id="blogger-content-input" contenteditable="true"
                                 oninput="window.bloggerActions.updatePostField('content', this.innerHTML)"
                                 class="w-full text-[15px] outline-none bg-transparent min-h-[120px] leading-relaxed flex-1 overflow-y-auto text-gray-900"
                                 style="font-size: 15px !important;"
                                 data-placeholder="分享你们的神仙日常...">${state.postData.content}</div>

                            <div class="flex flex-wrap gap-2 mb-4 mt-2">
                                ${state.postData.topics.map((t, idx) => `
                                    <div class="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full text-[12px] font-bold flex items-center border border-gray-200">
                                        # ${t} <i data-lucide="x" class="w-3 h-3 ml-1.5 cursor-pointer opacity-70" onclick="window.bloggerActions.removeTopic(${idx})"></i>
                                    </div>
                                `).join('')}
                            </div>

                            <div class="flex justify-between items-center border-t border-gray-100 pt-4 pb-safe mt-auto">
                                <div class="flex space-x-5">
                                    <div class="flex items-center text-[13px] font-bold text-gray-600 cursor-pointer active:scale-95 transition-transform" onclick="window.bloggerActions.addTopic()">
                                        <i data-lucide="hash" class="w-4 h-4 mr-1"></i>话题
                                    </div>
                                    <div class="flex items-center text-[13px] font-bold ${state.postData.hasShowcase ? 'text-orange-500' : 'text-gray-600'} cursor-pointer active:scale-95 transition-transform" onclick="window.bloggerActions.toggleShowcase()">
                                        <i data-lucide="shopping-bag" class="w-4 h-4 mr-1 ${state.postData.hasShowcase ? 'fill-current' : ''}"></i>橱窗
                                    </div>
                                    <div class="flex items-center text-[13px] font-bold text-purple-600 cursor-pointer active:scale-95 transition-transform" onclick="window.bloggerActions.generatePostContent()">
                                        ${state.isGeneratingPost 
                                            ? `<i data-lucide="loader" class="w-4 h-4 mr-1 animate-spin"></i>创作中` 
                                            : `<i data-lucide="sparkles" class="w-4 h-4 mr-1"></i>让他写`}
                                    </div>
                                </div>
                                <button class="bg-[#1a1a1a] text-white px-5 py-2.5 rounded-full text-[13px] font-bold tracking-widest active:scale-95 transition-transform font-serif shadow-md flex items-center shrink-0 ml-2" onclick="window.bloggerActions.publishPost()">
                                    发布 <i data-lucide="send" class="w-3.5 h-3.5 ml-1.5"></i>
                                </button>
                            </div>

                        </div>
                    </div>
                ` : ''}

            </div>
        `;
    }

    // ==========================================
    // 🌟 视图 1：账号选择墙 
    // ==========================================
    return `
        <div class="w-full h-full flex flex-col relative animate-in zoom-in-95 duration-300" style="background-color: #ffffff !important;">
            <div class="pt-8 pb-3 px-5 flex items-center justify-between z-40 relative shrink-0 border-b border-gray-50" style="background-color: #ffffff !important;">
                <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-900" onclick="window.bloggerActions.goBack()">
                    <i data-lucide="chevron-left" class="w-6 h-6 -ml-2"></i>
                </div>
                <div class="font-black text-gray-900 text-[18px] tracking-[0.2em] font-serif uppercase">Sync.</div>
                <div class="w-10 flex justify-end">
                    <div class="w-8 h-8 bg-transparent text-gray-900 flex items-center justify-center cursor-pointer active:scale-90 transition-transform" onclick="window.bloggerActions.openCreateModal()">
                        <i data-lucide="plus" class="w-5 h-5"></i>
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto px-6 pt-8 pb-10 hide-scrollbar flex flex-col items-center">
                <div class="text-[10px] text-gray-400 font-bold tracking-[0.3em] uppercase mb-10 opacity-60">Select Account</div>
                
                ${accounts.length === 0 ? `
                    <div class="mt-20 flex flex-col items-center justify-center opacity-50">
                        <i data-lucide="infinity" class="w-12 h-12 mb-6 text-gray-300"></i>
                        <p class="text-[12px] tracking-[0.1em] text-gray-500 font-serif uppercase">No Active Accounts</p>
                    </div>
                ` : `
                    <div class="w-full space-y-6">
                        ${accounts.map(acc => {
                            const tChar = store.contacts.find(c => c.id === acc.charId);
                            const pAvatar = tChar ? tChar.avatar : acc.avatar;
                            return `
                            <div class="w-full flex items-center cursor-pointer active:scale-[0.98] transition-all pb-4 border-b border-gray-100" onclick="window.bloggerActions.enterAccount('${acc.id}')">
                                <div class="w-14 h-14 overflow-hidden mr-5 shrink-0 border border-gray-100 shadow-sm rounded-full">
                                    <img src="${pAvatar}" class="w-full h-full object-cover filter grayscale-[10%]">
                                </div>
                                <div class="flex-1 flex flex-col justify-center min-w-0 pr-2">
                                    <span class="text-[16px] font-bold text-gray-900 truncate mb-1 font-serif tracking-widest uppercase">${acc.name}</span>
                                    <span class="text-[10px] text-gray-500 tracking-[0.2em] uppercase font-serif">
                                        ${acc.followers.toLocaleString()} FLWR
                                    </span>
                                </div>
                                <i data-lucide="arrow-right" class="w-4 h-4 text-gray-400"></i>
                            </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>

            ${state.showCreateModal ? `
                <div class="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200" onclick="window.bloggerActions.closeCreateModal()">
                    <div class="w-full max-w-[300px] bg-[#fff] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300" onclick="event.stopPropagation()">
                        <div class="px-6 pt-8 pb-6 relative flex flex-col items-center bg-[#1a1a1a] text-white">
                            <i data-lucide="infinity" class="w-6 h-6 text-white mb-4 opacity-80"></i>
                            <span class="font-bold text-[16px] tracking-[0.2em] font-serif uppercase mb-2">Co-Creator</span>
                            <span class="text-[9px] text-gray-400 tracking-widest uppercase text-center opacity-70">Select Partner</span>
                        </div>
                        <div class="px-6 py-6 max-h-[40vh] overflow-y-auto space-y-5 hide-scrollbar bg-[#f9fafb]">
                            ${store.contacts.map(c => `
                                <div class="flex items-center group cursor-pointer active:opacity-50 transition-opacity" onclick="window.bloggerActions.sendSyncInvite('${c.id}')">
                                    <img src="${c.avatar}" class="w-10 h-10 object-cover shadow-sm mr-4 shrink-0 filter grayscale-[10%] rounded-full" />
                                    <span class="flex-1 font-bold text-gray-900 text-[14px] font-serif tracking-widest uppercase truncate">${c.name}</span>
                                    <i data-lucide="arrow-up-right" class="w-4 h-4 text-gray-400 group-hover:text-gray-900 transition-colors"></i>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}