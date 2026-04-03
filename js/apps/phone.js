// js/apps/phone.js

window.phoneState = {
    view: 'select_char', // 🌟 默认进入选人界面
    charId: null,    
    appData: {},     
    isGenerating: false, 
    generatingApp: null, 
    
    activeMemoIndex: null, 
    memoScrollTop: 0
};

if (!window.phoneActions) {
    window.phoneActions = {
        // 退出查手机，回到主页
        exitPhone: () => { 
            window.phoneState.charId = null; 
            window.phoneState.view = 'select_char'; 
            window.actions.setCurrentApp(null); 
        },
        // 🌟 选定潜入目标
        selectTarget: (id) => { 
            window.phoneState.charId = id; 
            window.phoneState.view = 'desktop'; 
            window.render(); 
        },
        // 🌟 切换目标（返回选人界面）
        switchTarget: () => { 
            window.phoneState.charId = null; 
            window.phoneState.view = 'select_char'; 
            window.render(); 
        },
        
        backToDesktop: () => { window.phoneState.view = 'desktop'; window.render(); },
        openMemoDetail: (idx) => { window.phoneState.activeMemoIndex = idx; window.render(); },
        closeMemoDetail: () => { window.phoneState.activeMemoIndex = null; window.render(); },
        refreshApp: (appId, charId) => {
            if (window.phoneState.appData[charId]) {
                window.phoneState.appData[charId][appId] = null;
            }
            window.phoneActions.openApp(appId, charId);
        }
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
        
        return `${basePrompt}${coreMemStr}${frontStr}\n${middleStr}${fragMemStr}${backStr}${historyStr}\n\n【系统任务】\n${task}`;
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
请基于角色的性格、核心记忆、不为人知的秘密，以及最近和用户的聊天记录，生成 6 条备忘录。
要求：
1. 包含 2 条日常或工作相关的记录（展现生活碎片）。
2. 包含 3 条极度私密、情绪化，甚至带有病态/阴暗面，且与用户(${boundP.name})强相关的记录。
3. 包含 1 条像是密码、暗号或谜语一样的备忘录。
4. 当前时间参考：2026年4月。请生成符合情理的日期。
5. 绝不要输出思考过程，严格输出 JSON 数组格式！

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
                window.phoneState.appData[charId].memo = memos;
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

    window.phoneActions.openApp = (appId, charId) => {
        window.phoneState.view = appId;
        window.phoneState.activeMemoIndex = null;
        window.render();
        
        if (appId === 'memo' && (!state.appData[charId] || !state.appData[charId].memo)) {
            extractAppMemo(charId);
        }
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
                <img src="${c.avatar}" class="w-14 h-14 rounded-full object-cover border-2 border-gray-600 shrink-0 bg-white">
                <div class="flex-col ml-4">
                    <div class="text-white text-[17px] font-black tracking-wider">${c.name}</div>
                    <div class="text-green-400/80 text-[11px] font-mono mt-1">> Status: Online | Tap to intercept</div>
                </div>
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
    // 📱 【已有目标的手机视图】
    else {
        if (!state.appData[targetCharId]) state.appData[targetCharId] = {};
        const { chat, boundP } = getQContext(targetCharId);
        const wallpaperUrl = chat?.myAvatar || boundP?.avatar || '[https://api.dicebear.com/7.x/lorelei/svg?seed=Eve&backgroundColor=ffffff](https://api.dicebear.com/7.x/lorelei/svg?seed=Eve&backgroundColor=ffffff)';
        
        if (wallpaperUrl.startsWith('http') || wallpaperUrl.startsWith('data:')) {
            bgHtml = `<div class="absolute inset-0 bg-cover bg-center z-0" style="background-image: url('${wallpaperUrl}');"></div>`;
        } else {
            bgHtml = `<div class="absolute inset-0 flex items-center justify-center text-9xl bg-gray-900 z-0">${wallpaperUrl}</div>`;
        }

        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        const dayStr = days[now.getDay()];

        // 📱 【桌面视图】
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
                        ${createPhoneAppIcon('folder-lock', '私密相册', 'gallery', targetCharId)}
                        ${createPhoneAppIcon('flame', 'P站', 'av', targetCharId)}
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
        // 📝 【备忘录视图】
        else if (state.view === 'memo') {
            if (state.isGenerating && state.generatingApp === 'memo') {
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
            } else {
                const memoData = state.appData[targetCharId]?.memo || [];
                
                if (state.activeMemoIndex !== null && memoData[state.activeMemoIndex]) {
                    const note = memoData[state.activeMemoIndex];
                    // 🌟 隐身魔法：将所有的 bg-white 替换为 bg-[#fff]，完美避开全局 CSS 污染！
                    contentHtml = `
                        <div class="absolute inset-0 bg-[#fff] z-30 flex flex-col animate-in slide-in-from-right-4 duration-200">
                            <div class="pt-12 pb-3 px-4 flex items-center justify-between bg-[#fff] z-40">
                                <div class="cursor-pointer active:opacity-50 text-[#d4af37] w-20 flex items-center" onclick="window.phoneActions.closeMemoDetail()">
                                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                                    <span class="text-[17px] font-medium">备忘录</span>
                                </div>
                                <div class="flex space-x-4 text-[#d4af37]">
                                    <i data-lucide="share" class="w-6 h-6"></i>
                                    <i data-lucide="more-horizontal" class="w-6 h-6"></i>
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
                                    <span class="text-[17px] font-medium">文件夹</span>
                                </div>
                                <div class="text-gray-900 cursor-pointer active:rotate-180 transition-transform" onclick="window.phoneActions.refreshApp('memo', '${targetCharId}')">
                                    <i data-lucide="refresh-cw" class="w-5 h-5 opacity-40 hover:opacity-100"></i>
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
        // 🚧 【其他 App 预留框架】
        else {
            const appNames = {
                'taobao': '淘宝', 'ctrip': '携程旅行', 'calendar': '行程安排',
                'gallery': '私密保险箱', 'novel': '番茄免费小说', 'av': '私密浏览',
                'wechat': '微信', 'tiktok': '抖音', 'netease': '网易云音乐', 'search': 'Safari 浏览器'
            };
            const currentAppName = appNames[state.view] || 'App';

            contentHtml = `
                <div class="absolute inset-0 bg-[#f4f5f7] z-30 flex flex-col animate-in zoom-in-95 duration-200">
                    <div class="pt-12 pb-3 px-4 flex items-center justify-between border-b border-gray-200/60 bg-white/90 backdrop-blur-md z-40 shadow-sm">
                        <div class="cursor-pointer active:opacity-50 text-gray-600 w-8 flex items-center" onclick="window.phoneActions.backToDesktop()">
                            <i data-lucide="chevron-left" class="w-7 h-7"></i>
                        </div>
                        <span class="text-[16px] font-black text-gray-800 absolute left-1/2 -translate-x-1/2">${currentAppName}</span>
                        <div class="w-8"></div>
                    </div>
                    
                    <div class="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <i data-lucide="terminal" class="w-12 h-12 mb-4 text-indigo-400 opacity-50"></i>
                        <span class="text-[14px] font-bold tracking-widest text-gray-500">等待协议接入...</span>
                    </div>
                </div>
            `;
        }

        if (state.view === 'memo' && state.activeMemoIndex === null) {
            setTimeout(() => { const el = document.getElementById('phone-memo-scroll'); if (el && state.memoScrollTop) el.scrollTop = state.memoScrollTop; }, 0);
        }
    }

    // 🌟 核心防御：独立的语义化 ID + 你提议的 !important 内联样式绝对防线！
    return `
        <div id="cyber-phone-screen" class="w-full h-full relative overflow-hidden animate-in fade-in duration-300 select-none" style="background-color: #000 !important; background-image: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;">
            ${bgHtml}
            <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-0 pointer-events-none"></div>
            ${contentHtml}
        </div>
    `;
}