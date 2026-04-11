// js/apps/ao3.js
import { store } from '../store.js';

// 初始化永久存储空间
if (!store.ao3Fics) store.ao3Fics = [];
if (!store.ao3Bookmarks) store.ao3Bookmarks = [];

// 初始化 AO3 临时状态
if (!window.ao3State) {
    window.ao3State = {
        currentTab: 'home', 
        currentFicId: null, 
        searchQuery: '',
        isSearching: false,
        isGeneratingChapter: false,
        isGeneratingComments: false,
        chapterError: false 
    };
}

// 初始化 AO3 动作
if (!window.ao3Actions) {
    window.ao3Actions = {
        closeApp: () => {
            window.actions.setCurrentApp(null);
        },
        switchTab: (tab) => {
            window.ao3State.currentTab = tab;
            window.ao3State.currentFicId = null; 
            window.render();
        },
        toggleBookmark: (id, e) => {
            if (e) e.stopPropagation();
            let fic = store.ao3Fics.find(f => f.id === id) || store.ao3Bookmarks.find(f => f.id === id);
            if (!fic) return;

            const isSaved = store.ao3Bookmarks.some(b => b.id === id);
            if (isSaved) {
                store.ao3Bookmarks = store.ao3Bookmarks.filter(b => b.id !== id);
                window.actions?.showToast('已取消收藏');
            } else {
                store.ao3Bookmarks.unshift({ ...fic });
                window.actions?.showToast('已加入收藏');
            }
            if (window.actions.saveStore) window.actions.saveStore();
            window.render();
        },
        openFic: (id) => {
            window.ao3State.currentFicId = id;
            window.render();
            setTimeout(() => { const el = document.getElementById('ao3-detail-scroll'); if(el) el.scrollTop = 0; }, 50);

            let fic = store.ao3Fics.find(f => f.id === id) || store.ao3Bookmarks.find(f => f.id === id);
            if (fic && !fic.comments) {
                window.ao3Actions.generateComments(id);
            }
        },
        closeFic: () => {
            window.ao3State.currentFicId = null;
            window.render();
        },
        toggleSearchTag: (tag) => {
            let currentQuery = window.ao3State.searchQuery || '';
            let tags = currentQuery.split(/[,，]+/).map(t => t.trim()).filter(t => t !== '');
            if (tags.includes(tag)) {
                tags = tags.filter(t => t !== tag);
            } else {
                tags.push(tag);
            }
            window.ao3State.searchQuery = tags.join(', ');
            const input = document.getElementById('ao3-search-input');
            if (input) input.value = window.ao3State.searchQuery;
            window.render();
        },

        // 🌟 核心引擎：组装 AO3 专属的带感防 OOC Prompt
        buildAO3Prompt: (charId, task) => {
            const char = store.contacts.find(c => c.id === charId) || store.contacts[0];
            if (!char) return task; // 兜底
            
            const chat = store.chats?.find(ch => ch.charId === char.id);
            const boundPId = chat?.boundPersonaId || char?.boundPersonaId || store.personas[0].id;
            const boundP = store.personas.find(p => p.id === boundPId) || store.personas[0];

            const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
            const boundPrompt = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';
            const basePrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【用户】\n当前化名：${boundP.name}${globalP}${boundPrompt}`;

            const coreMem = (store.memories || []).filter(m => m.charId === char.id && m.type === 'core').map(m=>m.content).join('；');
            const coreMemStr = coreMem ? `\n\n【核心记忆】\n${coreMem}` : '';

            let frontWb = [], middleWb = [], backWb = [];
            (store.worldbooks || []).forEach(wbItem => {
                if (!wbItem.enabled) return;
                let shouldInject = false;
                if (wbItem.type === 'global') shouldInject = true;
                else if (wbItem.type === 'local' && char.mountedWorldbooks && char.mountedWorldbooks.includes(wbItem.id)) {
                    shouldInject = true;
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
            const backStr = backWb.length > 0 ? `\n\n[最新/最高优先级世界书指令]\n${backWb.join('\n')}` : '';

            // 组装最终防 OOC 指令
            return `${basePrompt}${coreMemStr}${frontStr}\n${middleStr}${backStr}\n\n【系统任务(AO3产粮/互动)】\n${task}`;
        },

        executeSearch: async () => {
            const state = window.ao3State;
            const input = document.getElementById('ao3-search-input');
            const q = input ? input.value.trim() : state.searchQuery.trim();
            state.searchQuery = q;

            if (!q) return window.actions?.showToast('请输入或选择搜索关键词');
            if (!store.apiConfig?.apiKey) return window.actions?.showToast('需配置API才能产粮');

            state.isSearching = true;
            window.render();

            try {
                const task = `用户在同人文网站AO3的搜索框输入了关键词：【${q}】。
请你根据这些关键词和上方给定的人物设定，发挥强大的同人创作能力，生成 3 篇符合人设的同人文搜索结果。（绝对不要偏离人设底色）
【分级规则】：如果搜索词包含了分级(Explicit, Mature, Teen, General, Not Rated)，必须严格按照所选分级输出；否则随机。
【生成要求】：
1. title: 吸引人的英文或中文标题
2. author: 随机一个同人圈网名
3. rating: 分级标签
4. fandoms: 对应的作品圈子
5. warnings: 预警标签
6. relationships: CP名称
7. characters: 出场角色
8. freeforms: 各种设定的Tag。必须包含用户的搜索词，并【额外补充 10 到 15 个】符合网文设定的扩展Tag！
9. summary: 作为正文的【开头部分】！至少200字，要有画面感、张力或细腻的情感描写。

严格输出为 JSON 数组格式：
[{"title": "...", "author": "...", "rating": "...", "fandoms": ["..."], "warnings": ["..."], "relationships": ["..."], "characters": ["..."], "freeforms": ["..."], "summary": "正文开头段落..."}]`;

                // 智能识别搜索词中包含的 CP 对象，找不到则默认第一个联系人
                let targetChar = (store.contacts || []).find(c => q.includes(c.name));
                let charId = targetChar ? targetChar.id : (store.contacts[0]?.id);
                const promptStr = window.ao3Actions.buildAO3Prompt(charId, task);

                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const text = (await res.json()).choices[0].message.content.match(/\[[\s\S]*\]/)[0];
                const generatedFics = JSON.parse(text).map(f => ({
                    id: 'fic_' + Date.now() + Math.floor(Math.random()*1000),
                    language: "中文", 
                    words: Math.floor(Math.random()*5000+1000), 
                    chapters: "1/?", 
                    kudos: Math.floor(Math.random()*5000+100).toLocaleString(), 
                    bookmarks: Math.floor(Math.random()*1000+10).toLocaleString(), 
                    hits: Math.floor(Math.random()*20000+500).toLocaleString(),
                    content: `<p class="mb-4">${f.summary}</p>`,
                    chapterCount: 1, 
                    ...f
                }));
                
                store.ao3Fics = generatedFics;
                if (window.actions.saveStore) window.actions.saveStore();
                state.currentTab = 'home'; 
            } catch(e) {
                console.error(e);
                window.actions?.showToast('产粮失败，脑细胞烧坏了，请重试');
            } finally {
                state.isSearching = false;
                window.render();
            }
        },
        generateNextChapter: async (id) => {
            if (!store.apiConfig?.apiKey) return window.actions?.showToast('请先配置API');
            let fic = store.ao3Fics.find(f => f.id === id) || store.ao3Bookmarks.find(f => f.id === id);
            if (!fic) return;
            
            window.ao3State.isGeneratingChapter = true;
            window.ao3State.chapterError = false; 
            window.render();
            
            try {
                const contextText = fic.content.replace(/<[^>]+>/g, '').slice(-1500); 
                
                const task = `请作为作者【${fic.author}】，为同人文《${fic.title}》续写下一章（第${fic.chapterCount + 1}章）。
【前情提要/现有内容】：${contextText}
【CP与Tag】：${fic.relationships.join(', ')} | ${fic.freeforms.join(', ')} | 分级：${fic.rating}
【要求】：根据提供的人物设定（OOC绝对禁止！），续写300-500字的连贯正文。剧情推动要符合之前的基调和Tag。
直接输出正文，不要带有任何多余的解释或Markdown标记。每段之间用换行符隔开。`;

                let targetChar = (store.contacts || []).find(c => fic.relationships.join(',').includes(c.name) || fic.characters.join(',').includes(c.name));
                let charId = targetChar ? targetChar.id : (store.contacts[0]?.id);
                const promptStr = window.ao3Actions.buildAO3Prompt(charId, task);

                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const newText = (await res.json()).choices[0].message.content.trim();
                
                const formattedText = newText.split('\n').filter(p=>p.trim()!=='').map(p=>`<p class="mb-4">${p}</p>`).join('');
                
                fic.content += `<h3 class="text-[16px] font-bold font-serif mt-10 mb-5 text-center text-gray-800 border-t border-dashed border-gray-300 pt-6">Chapter ${fic.chapterCount + 1}</h3>` + formattedText;
                fic.chapterCount += 1;
                fic.chapters = `${fic.chapterCount}/?`;
                fic.words += newText.length;
                
                if (window.actions.saveStore) window.actions.saveStore();
            } catch(e) {
                console.error(e);
                window.ao3State.chapterError = true; 
                window.actions?.showToast('催更失败，太太跑路了');
            } finally {
                window.ao3State.isGeneratingChapter = false;
                window.render();
            }
        },
        generateComments: async (id) => {
            if (!store.apiConfig?.apiKey) return;
            let fic = store.ao3Fics.find(f => f.id === id) || store.ao3Bookmarks.find(f => f.id === id);
            if (!fic) return;

            window.ao3State.isGeneratingComments = true;
            window.render();

            try {
                const task = `请为这篇涉及上述角色的 AO3 同人文生成 10 条真实、带有强烈情感的读者评论。
【文章信息】：标题《${fic.title}》, 作者：${fic.author}, Tags：${fic.freeforms.join(', ')}
【正文开头预览】：${fic.summary}
【要求】：
1. 结合角色设定，彻底模仿同人女/读者的发疯语气（尖叫、嗑到了原著里的梗、角色性格神还原分析、或者求更新）。
2. 生成正好 10 条评论，每条评论的用户名是符合同人圈习惯的网名。
严格输出为 JSON 格式：{"comments": [{"user": "网名", "content": "评论内容"}]}`;

                let targetChar = (store.contacts || []).find(c => fic.relationships.join(',').includes(c.name) || fic.characters.join(',').includes(c.name));
                let charId = targetChar ? targetChar.id : (store.contacts[0]?.id);
                const promptStr = window.ao3Actions.buildAO3Prompt(charId, task);

                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const text = (await res.json()).choices[0].message.content.match(/\{[\s\S]*\}/)[0];
                fic.comments = JSON.parse(text).comments;
                if (window.actions.saveStore) window.actions.saveStore();
            } catch (e) {
                console.error(e);
                window.actions?.showToast('评论区加载失败，网络可能开小差了');
            } finally {
                window.ao3State.isGeneratingComments = false;
                window.render();
            }
        }
    };
}

export function renderAo3App(store) {
    const state = window.ao3State;
    const isDark = store.appearance?.darkMode || false;

    const bgClass = isDark ? 'bg-[#1a1a1a]' : 'bg-[#EDECE8]';
    const headerBg = '#900000'; 
    const cardBg = isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-white border-[#ddd]';
    const textMain = isDark ? 'text-[#eee]' : 'text-[#2a2a2a]';
    const textMuted = isDark ? 'text-[#aaa]' : 'text-[#666]';
    const linkClass = 'text-[#900000] hover:underline cursor-pointer';
    const tagClass = 'text-[#1e3c5a] hover:underline cursor-pointer';

    const cps = [];
    if (store.contacts && store.personas) {
        store.contacts.forEach(c => {
            const chat = store.chats?.find(ch => ch.charId === c.id);
            const pId = chat?.boundPersonaId || c.boundPersonaId || store.personas[0].id;
            const p = store.personas.find(x => x.id === pId) || store.personas[0];
            if (p && c.name) cps.push(`${c.name} x ${p.name}`);
        });
    }
    const uniqueCps = [...new Set(cps)];

    const tropes = ["ABO", "哨向", "末世", "古代架空", "现代都市", "娱乐圈", "破镜重圆", "追妻火葬场", "先婚后爱", "双向暗恋", "日常甜饼", "强强", "无限流", "星际科幻", "西方幻言", "吸血鬼", "人鱼", "BDSM", "校园AU", "职场", "宿敌变情人", "灵魂伴侣", "带球跑"];
    const ratings = ["Explicit", "Mature", "Teen And Up Audiences", "General Audiences", "Not Rated"];

    const currentTags = state.searchQuery.split(/[,，]+/).map(t => t.trim()).filter(t => t !== '');

    const renderTags = (tags, style) => {
        if(!tags || !Array.isArray(tags)) return '';
        return tags.map(t => `<span class="${style} mr-1 after:content-[','] last:after:content-['']">${t}</span>`).join('');
    };

    const isBookmarked = (id) => store.ao3Bookmarks.some(b => b.id === id);

    const renderFicList = (fics) => {
        if (fics.length === 0) return '';
        return fics.map(fic => `
            <div class="w-full ${cardBg} border rounded-[4px] mb-4 shadow-sm relative cursor-pointer" onclick="window.ao3Actions.openFic('${fic.id}')">
                <div class="absolute top-0 left-0 flex flex-col p-1.5 pointer-events-none">
                    <div class="w-[30px] h-[30px] bg-white border border-gray-300 flex flex-wrap content-start">
                        <div class="w-1/2 h-1/2 bg-green-500 border-[0.5px] border-white"></div>
                        <div class="w-1/2 h-1/2 bg-yellow-400 border-[0.5px] border-white"></div>
                        <div class="w-1/2 h-1/2 bg-orange-500 border-[0.5px] border-white"></div>
                        <div class="w-1/2 h-1/2 bg-blue-500 border-[0.5px] border-white"></div>
                    </div>
                </div>

                <div class="pl-12 pr-3 pt-2.5 pb-12">
                    <div class="flex justify-between items-start mb-1.5">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-[17px] font-bold ${linkClass} truncate mb-0.5 leading-tight">${fic.title}</h3>
                            <span class="text-[12px] ${textMuted}">by <span class="${linkClass}">${fic.author || 'Anonymous'}</span></span>
                        </div>
                    </div>

                    <div class="text-[12px] leading-snug mb-3">
                        <div class="font-bold ${textMuted}">Fandoms: <span class="${tagClass} font-normal">${renderTags(fic.fandoms, '')}</span></div>
                    </div>

                    <div class="bg-[#f5f5f5] border border-[#ddd] p-2.5 rounded-[4px] text-[12px] leading-relaxed mb-3 ${isDark ? 'bg-[#333] border-[#555]' : ''}">
                        <div class="mb-0.5"><span class="font-bold text-[#2a2a2a] ${isDark?'text-[#ddd]':''}">Rating:</span> <span class="font-bold text-[#1e3c5a]">${fic.rating || 'Not Rated'}</span></div>
                        <div class="mb-0.5"><span class="font-bold text-[#2a2a2a] ${isDark?'text-[#ddd]':''}">Warnings:</span> <span class="font-bold text-[#900000]">${renderTags(fic.warnings, '')}</span></div>
                        <div class="mb-0.5"><span class="font-bold text-[#2a2a2a] ${isDark?'text-[#ddd]':''}">Relationships:</span> <span class="${tagClass}">${renderTags(fic.relationships, '')}</span></div>
                        <div class="mb-0.5"><span class="font-bold text-[#2a2a2a] ${isDark?'text-[#ddd]':''}">Characters:</span> <span class="${tagClass}">${renderTags(fic.characters, '')}</span></div>
                        <div><span class="font-bold text-[#2a2a2a] ${isDark?'text-[#ddd]':''}">Additional Tags:</span> <span class="${tagClass}">${renderTags(fic.freeforms, '')}</span></div>
                    </div>

                    <div class="text-[13px] ${textMain} leading-relaxed mb-4 border-l-[3px] border-[#ddd] pl-3 py-1 ${isDark?'border-[#555]':''} line-clamp-2 overflow-hidden">
                        ${fic.summary}
                    </div>

                    <div class="text-[11px] ${textMuted} flex flex-wrap gap-x-3 gap-y-1 mb-1">
                        <span>Language: ${fic.language}</span>
                        <span>Words: ${fic.words}</span>
                        <span>Chapters: ${fic.chapters}</span>
                        <span>Kudos: <span class="${linkClass}">${fic.kudos}</span></span>
                        <span>Bookmarks: <span class="${linkClass}">${fic.bookmarks}</span></span>
                        <span>Hits: ${fic.hits}</span>
                    </div>
                    
                    <div class="absolute bottom-3 right-3 flex items-center space-x-2">
                        <button class="px-2.5 py-1.5 bg-[#f5f5f5] border border-[#ccc] rounded shadow-sm text-[11px] font-bold text-[#333] active:bg-[#e0e0e0] transition-colors" onclick="window.ao3Actions.toggleBookmark('${fic.id}', event)">
                            ${isBookmarked(fic.id) ? 'Unbookmark' : 'Bookmark'}
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    };

    let mainContentHtml = '';

    if (state.currentFicId) {
        const fic = store.ao3Fics.find(f => f.id === state.currentFicId) || store.ao3Bookmarks.find(f => f.id === state.currentFicId);
        if (fic) {
            mainContentHtml = `
            <div id="ao3-detail-scroll" class="flex-1 overflow-y-auto w-full hide-scrollbar bg-white ${isDark?'bg-[#1a1a1a]':''}">
                
                <div class="p-4 border-b border-[#ddd] ${isDark?'border-[#444]':''}">
                    <h2 class="text-[22px] font-bold font-serif mb-1 ${textMain} leading-tight">${fic.title}</h2>
                    <div class="text-[14px] ${textMuted} mb-4">by <span class="${linkClass}">${fic.author || 'Anonymous'}</span></div>
                    
                    <div class="bg-[#f5f5f5] border border-[#ddd] p-3 rounded-[4px] text-[13px] leading-relaxed mb-4 ${isDark ? 'bg-[#333] border-[#555]' : ''}">
                        <div class="mb-1"><span class="font-bold ${isDark?'text-[#ddd]':'text-[#2a2a2a]'}">Rating:</span> <span class="font-bold text-[#1e3c5a]">${fic.rating || 'Not Rated'}</span></div>
                        <div class="mb-1"><span class="font-bold ${isDark?'text-[#ddd]':'text-[#2a2a2a]'}">Warnings:</span> <span class="font-bold text-[#900000]">${renderTags(fic.warnings, '')}</span></div>
                        <div class="mb-1"><span class="font-bold ${isDark?'text-[#ddd]':'text-[#2a2a2a]'}">Relationships:</span> <span class="${tagClass}">${renderTags(fic.relationships, '')}</span></div>
                        <div class="mb-1"><span class="font-bold ${isDark?'text-[#ddd]':'text-[#2a2a2a]'}">Characters:</span> <span class="${tagClass}">${renderTags(fic.characters, '')}</span></div>
                        <div><span class="font-bold ${isDark?'text-[#ddd]':'text-[#2a2a2a]'}">Additional Tags:</span> <span class="${tagClass}">${renderTags(fic.freeforms, '')}</span></div>
                    </div>

                    <div class="text-[12px] ${textMuted} flex flex-wrap gap-x-4 gap-y-1">
                        <span>Language: ${fic.language}</span>
                        <span>Words: ${fic.words}</span>
                        <span>Chapters: ${fic.chapters}</span>
                        <span>Kudos: <span class="${linkClass}">${fic.kudos}</span></span>
                        <span>Bookmarks: <span class="${linkClass}">${fic.bookmarks}</span></span>
                        <span>Hits: ${fic.hits}</span>
                    </div>
                </div>

                <div class="px-5 pt-6 pb-6">
                    <h3 class="text-[16px] font-bold font-serif mb-6 text-center ${textMain}">Chapter 1</h3>
                    <div class="text-[15px] leading-loose ${textMain} font-serif text-justify break-words">
                        ${fic.content}
                    </div>
                    
                    <div class="mt-12 flex justify-center pt-4">
                        <button class="px-5 py-2.5 ${state.chapterError ? 'bg-red-50 border-red-200 text-red-600' : 'bg-[#f5f5f5] border-[#ccc] text-[#333]'} rounded shadow-sm text-[13px] font-bold active:scale-95 flex items-center transition-transform" onclick="window.ao3Actions.generateNextChapter('${fic.id}')">
                            ${state.isGeneratingChapter ? '<i data-lucide="loader" class="w-4 h-4 animate-spin mr-2"></i> 太太正在爆肝码字中...' : (state.chapterError ? '<i data-lucide="refresh-cw" class="w-4 h-4 mr-2"></i> 续写失败，重新催更' : '<i data-lucide="pen-tool" class="w-4 h-4 mr-2"></i> 催更 (AI续写下一章)')}
                        </button>
                    </div>
                </div>

                <div class="px-5 pb-24 border-t border-[#ddd] pt-8 ${isDark?'border-[#444] bg-[#222]':'bg-[#f9f9f9]'}">
                    <h3 class="text-[16px] font-bold font-serif mb-5 ${textMain}">Comments (${fic.comments ? fic.comments.length : 0})</h3>
                    
                    ${!fic.comments ? (
                        state.isGeneratingComments ? `
                            <div class="flex flex-col items-center justify-center py-10 opacity-60 ${textMain}">
                                <i data-lucide="loader" class="w-8 h-8 animate-spin mb-3 text-[#900000]"></i>
                                <span class="text-[12px] font-bold tracking-widest">正在加载读者评论...</span>
                            </div>
                        ` : `
                            <div class="flex flex-col items-center justify-center py-10 opacity-60 ${textMain}">
                                <i data-lucide="alert-circle" class="w-8 h-8 mb-3 text-red-500"></i>
                                <span class="text-[12px] font-bold tracking-widest mb-3">网络波动，评论加载失败</span>
                                <button class="px-4 py-2 bg-[#f5f5f5] border border-[#ccc] rounded shadow-sm text-[11px] font-bold text-[#333] active:scale-95 flex items-center transition-transform" onclick="window.ao3Actions.generateComments('${fic.id}')">
                                    <i data-lucide="refresh-cw" class="w-3 h-3 mr-1.5"></i> 重新加载
                                </button>
                            </div>
                        `
                    ) : (fic.comments || []).map(c => `
                        <div class="mb-4 border border-[#ddd] rounded-[4px] shadow-sm overflow-hidden ${isDark?'border-[#555]':''}">
                            <div class="bg-[#e8e8e8] px-3 py-2 border-b border-[#ddd] flex items-center ${isDark?'bg-[#333] border-[#555]':''}">
                                <div class="w-6 h-6 rounded-full bg-[#ccc] mr-2 flex items-center justify-center ${isDark?'bg-[#555]':''}">
                                    <i data-lucide="user" class="w-4 h-4 ${isDark?'text-[#aaa]':'text-white'}"></i>
                                </div>
                                <span class="text-[13px] font-bold ${linkClass}">${c.user}</span>
                            </div>
                            <div class="px-4 py-3 text-[13px] leading-relaxed ${textMain} bg-white ${isDark?'bg-[#2a2a2a]':''} whitespace-pre-wrap">${c.content}</div>
                        </div>
                    `).join('')}
                </div>

            </div>

            <div class="absolute bottom-8 right-5 z-50">
                <button class="w-[50px] h-[50px] bg-[#900000] rounded-full shadow-[0_4px_15px_rgba(144,0,0,0.5)] flex items-center justify-center text-white active:scale-90 transition-transform" onclick="window.ao3Actions.toggleBookmark('${fic.id}', event)">
                    <i data-lucide="bookmark" class="w-6 h-6 ${isBookmarked(fic.id) ? 'fill-current' : ''}"></i>
                </button>
            </div>
            `;
        }
    } else if (state.currentTab === 'search') {
        mainContentHtml = `
            <div class="w-full flex flex-col h-full">
                <div class="p-3 bg-[#e8e8e8] border-b border-[#ccc] flex flex-col space-y-2 shrink-0 ${isDark?'bg-[#222] border-[#444]':''}">
                    <div class="flex items-center space-x-2 w-full">
                        <input type="text" id="ao3-search-input" value="${state.searchQuery}" class="flex-1 bg-white border border-[#ccc] rounded px-3 py-2 text-[13px] outline-none focus:border-[#900000] ${isDark?'bg-[#333] border-[#555] text-white':''}" placeholder="输入关键词，请用逗号分隔..." oninput="window.ao3State.searchQuery = this.value">
                        <button onclick="window.ao3Actions.executeSearch()" class="bg-[#900000] text-white px-4 py-2 rounded text-[13px] font-bold shadow-sm active:scale-95 shrink-0 flex items-center">
                            ${state.isSearching ? '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>' : 'Search'}
                        </button>
                    </div>
                    <span class="text-[10px] ${textMuted}">Tip: 点击下方标签自动填入，多个关键词请用逗号(,)分隔。</span>
                </div>

                <div id="ao3-search-results" class="flex-1 overflow-y-auto px-2 pt-3 pb-20 hide-scrollbar">
                    ${state.isSearching ? `
                        <div class="flex flex-col items-center justify-center mt-20 opacity-60 ${textMain}">
                            <i data-lucide="loader" class="w-10 h-10 mb-3 animate-spin text-[#900000]"></i>
                            <span class="text-[13px] font-bold tracking-widest animate-pulse">结合记忆生成专属同人中...</span>
                        </div>
                    ` : `
                        <div class="px-2 py-2 space-y-6">
                            <div>
                                <h4 class="font-bold text-[#900000] text-[14px] border-b border-[#ccc] pb-1.5 mb-3 ${isDark?'border-[#555]':''}">Relationships (CP)</h4>
                                <div class="flex flex-wrap gap-2">
                                    ${uniqueCps.map(cp => {
                                        const isActive = currentTags.includes(cp);
                                        return `<span class="px-2.5 py-1.5 rounded text-[12px] cursor-pointer transition-colors border ${isActive ? 'bg-[#900000] text-white border-[#900000] shadow-sm' : (isDark?'bg-[#333] text-[#ddd] border-[#555] hover:bg-[#444]':'bg-white text-[#333] border-[#ccc] hover:bg-gray-100')}" onclick="window.ao3Actions.toggleSearchTag('${cp}')">${cp}</span>`;
                                    }).join('')}
                                </div>
                            </div>
                            
                            <div>
                                <h4 class="font-bold text-[#900000] text-[14px] border-b border-[#ccc] pb-1.5 mb-3 ${isDark?'border-[#555]':''}">Additional Tags (设定/画风)</h4>
                                <div class="flex flex-wrap gap-2">
                                    ${tropes.map(t => {
                                        const isActive = currentTags.includes(t);
                                        return `<span class="px-2.5 py-1.5 rounded text-[12px] cursor-pointer transition-colors border ${isActive ? 'bg-[#1e3c5a] text-white border-[#1e3c5a] shadow-sm' : (isDark?'bg-[#333] text-[#ddd] border-[#555] hover:bg-[#444]':'bg-white text-[#333] border-[#ccc] hover:bg-gray-100')}" onclick="window.ao3Actions.toggleSearchTag('${t}')">${t}</span>`;
                                    }).join('')}
                                </div>
                            </div>

                            <div>
                                <h4 class="font-bold text-[#900000] text-[14px] border-b border-[#ccc] pb-1.5 mb-3 ${isDark?'border-[#555]':''}">Ratings (分级)</h4>
                                <div class="flex flex-wrap gap-2">
                                    ${ratings.map(r => {
                                        const isActive = currentTags.includes(r);
                                        return `<span class="px-2.5 py-1.5 rounded text-[12px] cursor-pointer transition-colors border ${isActive ? 'bg-green-700 text-white border-green-700 shadow-sm' : (isDark?'bg-[#333] text-[#ddd] border-[#555] hover:bg-[#444]':'bg-white text-[#333] border-[#ccc] hover:bg-gray-100')}" onclick="window.ao3Actions.toggleSearchTag('${r}')">${r}</span>`;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            </div>
        `;
    } else {
        const displayFics = state.currentTab === 'home' ? store.ao3Fics : store.ao3Bookmarks;
        mainContentHtml = `
            <div id="ao3-search-results" class="flex-1 overflow-y-auto pb-20 px-2 pt-3 hide-scrollbar">
                ${displayFics.length === 0 ? `
                    <div class="flex flex-col items-center justify-center mt-32 opacity-50 ${textMain}">
                        <i data-lucide="${state.currentTab === 'home' ? 'book-open' : 'bookmark'}" class="w-12 h-12 mb-3 opacity-60"></i>
                        <span class="text-[14px] tracking-widest">${state.currentTab === 'home' ? '首页空空如也，快去点击右上角搜索产粮吧' : '暂无收藏的文章'}</span>
                    </div>
                ` : renderFicList(displayFics)}
            </div>
        `;
    }

    return `
    <div class="w-full h-full flex flex-col ${bgClass} font-sans relative animate-in fade-in duration-300">
        
        <div class="w-full flex items-center justify-between px-4 pt-10 pb-3 shrink-0 shadow-md relative z-20" style="background-color: ${headerBg};">
            <div class="flex items-center space-x-2">
                <i data-lucide="chevron-left" class="w-6 h-6 text-white cursor-pointer active:scale-90 transition-transform -ml-1" onclick="${state.currentFicId ? 'window.ao3Actions.closeFic()' : 'window.ao3Actions.closeApp()'}"></i>
                <span class="text-white font-bold text-[18px] tracking-wide font-serif -ml-1">Archive of Our Own</span>
                <span class="text-white/80 text-[10px] align-top relative -top-2 hidden sm:inline">beta</span>
            </div>
            <div class="flex space-x-4 text-white">
                <i data-lucide="search" class="w-5 h-5 opacity-90 cursor-pointer active:scale-90 transition-transform ${state.currentTab === 'search' && !state.currentFicId ? 'text-yellow-300' : ''}" onclick="window.ao3Actions.switchTab('search')"></i>
            </div>
        </div>

        ${mainContentHtml}

        ${!state.currentFicId ? `
        <div class="absolute bottom-0 left-0 w-full h-[65px] bg-white border-t border-gray-200 flex justify-around items-center px-6 pb-safe z-50 ${isDark ? 'bg-[#222] border-[#444]' : ''} shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <div class="flex flex-col items-center justify-center w-16 cursor-pointer opacity-100 ${state.currentTab === 'home' ? 'text-[#900000]' : (isDark?'text-gray-400':'text-gray-500')} active:scale-95 transition-transform" onclick="window.ao3Actions.switchTab('home')">
                <i data-lucide="home" class="w-[22px] h-[22px] mb-1 ${state.currentTab === 'home' ? 'fill-current' : ''}"></i>
                <span class="text-[10px] font-bold tracking-wider">首页</span>
            </div>
            <div class="flex flex-col items-center justify-center w-16 cursor-pointer opacity-100 ${state.currentTab === 'bookmarks' ? 'text-[#900000]' : (isDark?'text-gray-400':'text-gray-500')} active:scale-95 transition-transform" onclick="window.ao3Actions.switchTab('bookmarks')">
                <i data-lucide="bookmark" class="w-[22px] h-[22px] mb-1 ${state.currentTab === 'bookmarks' ? 'fill-current' : ''}"></i>
                <span class="text-[10px] font-bold tracking-wider">收藏</span>
            </div>
        </div>
        ` : ''}

    </div>
    `;
}