// js/apps/darkroom.js
import { store } from '../store.js';

// 初始化数据存储
if (!store.darkroomPrefs) store.darkroomPrefs = {}; // 记录角色对应的属性
if (!store.darkroomChats) store.darkroomChats = {}; // 记录小黑屋专属聊天记录

// 初始化临时状态
if (!window.darkroomState) {
    window.darkroomState = {
        view: 'char_select', // 'char_select' | 'role_select' | 'play_select' | 'chat'
        selectedCharId: null,
        selectedTags: [],
        isGenerating: false
    };
}

// 初始化动作
if (!window.darkroomActions) {
    window.darkroomActions = {
        closeApp: () => {
            window.actions.setCurrentApp(null);
            window.darkroomState.view = 'char_select';
            window.darkroomState.selectedCharId = null;
        },
        goBack: () => {
            const state = window.darkroomState;
            if (state.view === 'chat') state.view = 'play_select';
            else if (state.view === 'play_select') state.view = 'char_select';
            else if (state.view === 'role_select') state.view = 'char_select';
            window.render();
        },
        selectChar: (id) => {
            window.darkroomState.selectedCharId = id;
            window.darkroomState.selectedTags = [];
            // 如果之前选过属性了，直接跳到玩法选择
            if (store.darkroomPrefs[id]?.role) {
                window.darkroomState.view = 'play_select';
            } else {
                window.darkroomState.view = 'role_select';
            }
            window.render();
        },
        selectRole: (role) => {
            const id = window.darkroomState.selectedCharId;
            if (!store.darkroomPrefs[id]) store.darkroomPrefs[id] = {};
            store.darkroomPrefs[id].role = role;
            if (window.actions.saveStore) window.actions.saveStore();
            window.darkroomState.view = 'play_select';
            window.render();
        },
        toggleTag: (tag) => {
            const tags = window.darkroomState.selectedTags;
            if (tags.includes(tag)) {
                window.darkroomState.selectedTags = tags.filter(t => t !== tag);
            } else {
                window.darkroomState.selectedTags.push(tag);
            }
            window.render();
        },
        enterDarkroom: async () => {
            const state = window.darkroomState;
            if (state.selectedTags.length === 0) return window.actions?.showToast('请至少选择一种今天的玩法');
            if (!store.apiConfig?.apiKey) return window.actions?.showToast('请先配置API才能生成开场');

            const charId = state.selectedCharId;
            const char = store.contacts.find(c => c.id === charId);
            const myRole = store.darkroomPrefs[charId].role; // 用户的属性
            const chat = store.chats?.find(ch => ch.charId === charId);
            const boundPId = chat?.boundPersonaId || char?.boundPersonaId || store.personas[0].id;
            const boundP = store.personas.find(p => p.id === boundPId) || store.personas[0];

            if (!store.darkroomChats[charId]) store.darkroomChats[charId] = [];

            state.isGenerating = true;
            window.render();

            try {
                // 让 AI 生成极具张力的开场白
                const task = `你现在是【${char.name}】，我们正在进入小黑屋进行 BDSM / 沉浸式调教互动。
我的属性是：${myRole} (Dom/Sub/Switch)，你的属性是与我相对或契合的。
今天我们选择的玩法包含：${state.selectedTags.join(', ')}。
请你根据我们的属性关系和选定的玩法，直接生成一段极具张力、画面感和压迫感（或臣服感）的开场动作与对话。
【格式要求】：直接输出正文。使用『』包裹对话，使用（）包裹内心想法，其余为细致的动作与神态描写。字数200字左右。`;

                const promptStr = await window.buildBloggerPrompt ? await window.buildBloggerPrompt(null, char, chat, boundP, { task }) : `【角色设定】\n${char.prompt}\n\n【任务】\n${task}`;

                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] })
                });
                const text = (await res.json()).choices[0].message.content.trim();

                // 插入系统提示和 AI 开场白
                store.darkroomChats[charId].push({ id: Date.now(), msgType: 'system', text: `【系统】小黑屋已落锁。今日玩法：${state.selectedTags.join(', ')}` });
                store.darkroomChats[charId].push({ id: Date.now() + 1, sender: char.name, text: text, isMe: false, timestamp: new Date().getTime() });
                
                if (window.actions.saveStore) window.actions.saveStore();
                state.view = 'chat';
            } catch(e) {
                console.error(e);
                window.actions?.showToast('生成开场失败，请重试');
            } finally {
                state.isGenerating = false;
                window.render();
                setTimeout(() => { const el = document.getElementById('darkroom-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
            }
        },
        sendMessage: async () => {
            const input = document.getElementById('darkroom-input');
            const text = input.value.trim();
            if (!text || window.darkroomState.isGenerating) return;

            const charId = window.darkroomState.selectedCharId;
            const char = store.contacts.find(c => c.id === charId);
            const chat = store.chats?.find(ch => ch.charId === charId);
            const boundPId = chat?.boundPersonaId || char?.boundPersonaId || store.personas[0].id;
            const boundP = store.personas.find(p => p.id === boundPId) || store.personas[0];

            store.darkroomChats[charId].push({ id: Date.now(), sender: boundP.name, text: text, isMe: true, timestamp: new Date().getTime() });
            input.value = '';
            window.darkroomState.isGenerating = true;
            window.render();
            setTimeout(() => { const el = document.getElementById('darkroom-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 50);

            try {
                const history = store.darkroomChats[charId].slice(-10).map(m => m.msgType === 'system' ? m.text : `[${m.sender}]: ${m.text}`).join('\n');
                const task = `这是我们在小黑屋中的最新互动记录：\n${history}\n请作为【${char.name}】，根据之前的氛围和人设，生成接下来的回应。
【格式要求】：直接输出正文。使用『』包裹对话，使用（）包裹内心想法，其余为动作与神态描写。`;

                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: `【角色设定】\n${char.prompt}\n\n${task}` }] })
                });
                const replyText = (await res.json()).choices[0].message.content.trim();

                store.darkroomChats[charId].push({ id: Date.now(), sender: char.name, text: replyText, isMe: false, timestamp: new Date().getTime() });
                if (window.actions.saveStore) window.actions.saveStore();
            } catch(e) {
                console.error(e);
                window.actions?.showToast('生成回复失败');
            } finally {
                window.darkroomState.isGenerating = false;
                window.render();
                setTimeout(() => { const el = document.getElementById('darkroom-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
            }
        },
        continuePlay: async () => {
            if (window.darkroomState.isGenerating) return;
            const charId = window.darkroomState.selectedCharId;
            const char = store.contacts.find(c => c.id === charId);
            window.darkroomState.isGenerating = true;
            window.render();

            try {
                const history = store.darkroomChats[charId].slice(-10).map(m => m.msgType === 'system' ? m.text : `[${m.sender}]: ${m.text}`).join('\n');
                const task = `这是我们在小黑屋中的最新互动记录：\n${history}\n请作为【${char.name}】，顺着目前的氛围和动作继续往下描写，推动剧情发展。
【格式要求】：直接输出正文。使用『』包裹对话，使用（）包裹内心想法，其余为动作与神态描写。`;

                const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: `【角色设定】\n${char.prompt}\n\n${task}` }] })
                });
                const replyText = (await res.json()).choices[0].message.content.trim();

                store.darkroomChats[charId].push({ id: Date.now(), sender: char.name, text: replyText, isMe: false, timestamp: new Date().getTime() });
                if (window.actions.saveStore) window.actions.saveStore();
            } catch(e) {
                console.error(e);
                window.actions?.showToast('生成继续失败');
            } finally {
                window.darkroomState.isGenerating = false;
                window.render();
                setTimeout(() => { const el = document.getElementById('darkroom-scroll'); if(el) el.scrollTop = el.scrollHeight; }, 100);
            }
        }
    };
}

export function renderDarkroomApp(store) {
    const state = window.darkroomState;
    const actions = window.darkroomActions;

    // 🌟 全局暗黑主题配置
    const bgClass = 'bg-[#0f0f11]';
    const textMain = 'text-gray-200';
    const accentColor = '#900000'; // 迷离的暗红色

    // 预设 BDSM 玩法 Tags
    const playTags = [
        "视觉剥夺", "捆绑束缚", "温和支配", "严厉惩罚", "语言羞辱", "赞美服从",
        "感官刺激", "冰火交替", "边缘控制", "高潮拒绝", "强迫指令", "宠物扮演",
        "情境扮演", "玩具放置", "体罚(Spanking)", "滴蜡(Wax)"
    ];

    let contentHtml = '';

    if (state.view === 'char_select') {
        contentHtml = `
            <div class="px-6 pt-6 flex-1 overflow-y-auto hide-scrollbar">
                <h2 class="text-[24px] font-black font-serif text-white tracking-widest mb-2">Darkroom</h2>
                <p class="text-[12px] text-gray-500 mb-8 tracking-widest">请选择你要共度小黑屋时光的伴侣。</p>
                <div class="grid grid-cols-2 gap-4 pb-20">
                    ${(store.contacts || []).map(c => `
                        <div class="bg-[#1a1a1c] border border-[#2a2a2c] rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-[#900000] active:scale-95 transition-all shadow-lg" onclick="window.darkroomActions.selectChar('${c.id}')">
                            <img src="${c.avatar}" class="w-16 h-16 rounded-full object-cover mb-3 border-2 border-[#333] grayscale-[30%]">
                            <span class="text-[14px] font-bold ${textMain}">${c.name}</span>
                            ${store.darkroomPrefs[c.id]?.role ? `<span class="text-[10px] text-red-900/60 mt-1 font-bold border border-red-900/30 px-2 py-0.5 rounded-full">已设属性</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else if (state.view === 'role_select') {
        const char = store.contacts.find(c => c.id === state.selectedCharId);
        contentHtml = `
            <div class="px-6 pt-6 flex-1 flex flex-col hide-scrollbar relative">
                <i data-lucide="chevron-left" class="absolute top-6 left-4 w-6 h-6 text-gray-400 cursor-pointer active:scale-90" onclick="window.darkroomActions.goBack()"></i>
                <h2 class="text-[20px] font-black font-serif text-white tracking-widest mt-12 mb-2 text-center">属性确立</h2>
                <p class="text-[12px] text-gray-500 mb-10 tracking-widest text-center leading-relaxed">在这个绝对私密的空间里，<br/>你希望在 ${char.name} 面前展现怎样的自己？</p>
                
                <div class="flex flex-col space-y-4">
                    <div class="bg-[#1a1a1c] border border-[#2a2a2c] rounded-2xl p-5 flex flex-col items-center cursor-pointer active:scale-95 transition-all hover:border-gray-500" onclick="window.darkroomActions.selectRole('Dom (支配方)')">
                        <span class="text-[18px] font-bold text-gray-300 font-serif tracking-widest mb-1">Dom</span>
                        <span class="text-[11px] text-gray-500">支配 / 控制 / 掌控全局</span>
                    </div>
                    <div class="bg-[#1a1a1c] border border-[#2a2a2c] rounded-2xl p-5 flex flex-col items-center cursor-pointer active:scale-95 transition-all hover:border-[#900000]" onclick="window.darkroomActions.selectRole('Sub (臣服方)')">
                        <span class="text-[18px] font-bold text-red-800 font-serif tracking-widest mb-1">Sub</span>
                        <span class="text-[11px] text-gray-500">臣服 / 顺从 / 交出控制权</span>
                    </div>
                    <div class="bg-[#1a1a1c] border border-[#2a2a2c] rounded-2xl p-5 flex flex-col items-center cursor-pointer active:scale-95 transition-all hover:border-blue-900" onclick="window.darkroomActions.selectRole('Switch (双修属性)')">
                        <span class="text-[18px] font-bold text-blue-800 font-serif tracking-widest mb-1">Switch</span>
                        <span class="text-[11px] text-gray-500">双修 / 视情况切换立场</span>
                    </div>
                </div>
            </div>
        `;
    } else if (state.view === 'play_select') {
        const char = store.contacts.find(c => c.id === state.selectedCharId);
        contentHtml = `
            <div class="px-6 pt-6 flex-1 flex flex-col overflow-y-auto hide-scrollbar relative pb-24">
                <i data-lucide="chevron-left" class="absolute top-6 left-4 w-6 h-6 text-gray-400 cursor-pointer active:scale-90" onclick="window.darkroomActions.goBack()"></i>
                <h2 class="text-[20px] font-black font-serif text-white tracking-widest mt-12 mb-2 text-center">Play Menu</h2>
                <p class="text-[12px] text-gray-500 mb-8 tracking-widest text-center">今晚，想和 ${char.name} 体验些什么？</p>
                
                <div class="flex flex-wrap gap-3 justify-center">
                    ${playTags.map(tag => {
                        const isActive = state.selectedTags.includes(tag);
                        return `<span class="px-4 py-2 border rounded-lg text-[13px] tracking-widest cursor-pointer transition-colors active:scale-95 ${isActive ? 'bg-[#900000] text-white border-[#900000] shadow-[0_0_10px_rgba(144,0,0,0.4)]' : 'bg-[#1a1a1c] text-gray-400 border-[#333] hover:border-gray-500'}" onclick="window.darkroomActions.toggleTag('${tag}')">${tag}</span>`;
                    }).join('')}
                </div>
            </div>

            <div class="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0f0f11] via-[#0f0f11] to-transparent z-20 flex flex-col items-center">
                <button class="w-full max-w-[280px] py-4 bg-[#900000] text-white font-bold tracking-widest rounded-full shadow-[0_0_20px_rgba(144,0,0,0.3)] active:scale-95 transition-transform flex justify-center items-center font-serif text-[15px]" onclick="window.darkroomActions.enterDarkroom()">
                    ${state.isGenerating ? '<i data-lucide="loader" class="w-5 h-5 animate-spin mr-2"></i> 推开门...' : '进入小黑屋'}
                </button>
            </div>
        `;
    } else if (state.view === 'chat') {
        const char = store.contacts.find(c => c.id === state.selectedCharId);
        const msgs = store.darkroomChats[state.selectedCharId] || [];

        // 🌟 完美移植并黑化的线下模式引擎
        contentHtml = `
        <div class="absolute inset-0 w-full h-full flex flex-col font-serif z-[60] bg-[#0f0f11]">
            <style>
                .mc-darkroom-dialogue { color: #a30000; font-family: inherit; } /* 暗红色对话 */
                .mc-darkroom-thought { color: #6b7280; font-family: inherit; } /* 灰色内心 */
                .mc-darkroom-desc { color: #d1d5db; font-family: inherit; } /* 浅灰动作 */
            </style>

            <div class="bg-[#151518]/90 backdrop-blur-md pt-10 pb-3 px-4 flex items-center justify-between border-b border-[#222] z-10 shadow-sm shrink-0">
                <div class="flex items-center cursor-pointer text-gray-400 w-1/4 active:opacity-50" onclick="window.darkroomActions.goBack()">
                    <i data-lucide="chevron-left" class="w-6 h-6"></i>
                </div>
                <span class="flex-1 text-center font-bold text-[14px] tracking-widest text-gray-200 uppercase font-serif ${state.isGenerating ? 'animate-pulse text-red-800' : ''}">
                    ${state.isGenerating ? '沉浸编织中...' : `Darkroom · ${char.name}`}
                </span>
                <div class="w-1/4 flex justify-end"></div>
            </div>
            
            <div id="darkroom-scroll" class="flex-1 p-5 overflow-y-auto hide-scrollbar flex flex-col pb-6 bg-[#0f0f11]">
                ${msgs.map((msg, idx) => {
                    if (msg.msgType === 'system') {
                        return `
                        <div class="flex items-center justify-center py-2 mb-6 mt-4">
                            <span class="text-[11px] text-gray-500 font-bold tracking-widest bg-[#1a1a1c] border border-[#333] px-5 py-1.5 rounded-full">${msg.text}</span>
                        </div>`;
                    }

                    let cleanText = msg.text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
                    let preProcessedText = cleanText
                        .replace(/(『[^』]*』)/g, '\n$1\n')
                        .replace(/(「[^」]*」)/g, '\n$1\n')
                        .replace(/[（(]([^）)]*)[）)]/g, '\n（$1）\n');

                    const formattedLines = preProcessedText.split('\n').filter(l=>l.trim()).map(l => {
                        let line = l.trim();
                        if (line.startsWith('『') && line.endsWith('』')) {
                            return `<p class="mc-darkroom-dialogue my-2.5 leading-relaxed">${line}</p>`;
                        } else if (line.startsWith('（') && line.endsWith('）')) {
                            const pureThought = line.slice(1, -1);
                            return `<p class="mc-darkroom-thought my-2.5 leading-relaxed italic">（${pureThought}）</p>`;
                        } else {
                            return `<p class="mc-darkroom-desc my-1.5 leading-relaxed">${line}</p>`;
                        }
                    }).join('');

                    return `
                    <div class="flex justify-center my-4 w-full ${idx === msgs.length - 1 ? 'animate-in slide-in-from-bottom-4 duration-300' : ''}">
                        <div class="w-full bg-[#151518] border border-[#262628] rounded-[14px] p-5 relative flex flex-col shadow-lg">
                            <div class="mb-3 text-[11px] font-black tracking-widest uppercase ${msg.isMe ? 'text-gray-500' : 'text-[#900000]'}">${msg.sender}</div>
                            <div class="text-[14px] leading-loose font-serif text-justify pb-2">${formattedLines}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            
            <div class="bg-[#151518] px-4 py-3 pb-8 border-t border-[#222] flex flex-col shadow-2xl z-20 shrink-0">
                <div class="relative w-full bg-[#1a1a1c] border border-[#333] rounded-[16px] p-1 flex items-end transition-all focus-within:border-gray-500">
                    <textarea id="darkroom-input" placeholder="回应或下达指令..." class="flex-1 min-h-[80px] max-h-[150px] bg-transparent text-gray-200 p-3 outline-none text-[14px] resize-none placeholder-gray-600 font-serif leading-relaxed hide-scrollbar"></textarea>
                    <div class="flex flex-col items-center justify-end pb-2 pr-2 space-y-4 shrink-0">
                        <button onclick="window.darkroomActions.continuePlay()" class="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-300 active:scale-90 transition-all" title="让AI接着往下写"><i data-lucide="feather" class="w-5 h-5"></i></button>
                        <button onmousedown="event.preventDefault();" onclick="window.darkroomActions.sendMessage()" class="w-9 h-9 flex items-center justify-center text-[#900000] active:scale-90 transition-all hover:text-red-500"><i data-lucide="send" class="w-5 h-5 ml-0.5"></i></button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    return `
    <div class="w-full h-full flex flex-col ${bgClass} font-sans relative animate-in fade-in duration-300">
        ${state.view !== 'chat' ? `
            <div class="absolute top-10 right-6 z-50 cursor-pointer active:scale-90" onclick="window.darkroomActions.closeApp()">
                <i data-lucide="x" class="w-6 h-6 text-gray-500"></i>
            </div>
        ` : ''}
        ${contentHtml}
    </div>
    `;
}