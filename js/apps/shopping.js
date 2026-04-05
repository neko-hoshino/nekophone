// ==========================================
// 🛍️ 专属购物与送礼 App (淘宝 + 美团架构)
// ==========================================

// 1. 初始化独立的作用域状态
let currentStore = null; // 缓存当前 store 实例，供全局动作调用

if (!window.shoppingState) {
    window.shoppingState = {
        tab: 'home',         // 'home' | 'cart' | 'me'
        homeTab: 'shop',     // 'shop' (购物) | 'food' (外卖)
        searchQuery: '',
        searchResults: null,
        isSearching: false,
        customLocation: '',
    };
}

// 2. 初始化全局动作 (挂载到 window 供 onclick 调用)
if (!window.shoppingActions) {
    window.shoppingActions = {
        // 切换页面底栏和顶栏
        switchTab: (tab) => { 
            window.shoppingState.tab = tab; 
            if (window.render) window.render(); 
        },
        switchHomeTab: (tab) => { 
            window.shoppingState.homeTab = tab; 
            window.shoppingState.searchResults = null; 
            window.shoppingState.searchQuery = '';
            if (window.render) window.render(); 
        },
        updateSearch: (val) => { 
            window.shoppingState.searchQuery = val; 
        },
        setLocation: () => {
            const loc = prompt("请输入你要定位的城市或区域（如：北京市朝阳区，或 纽约市）。\n留空则自动使用您当前的真实网络 IP 定位：");
            if (loc !== null) {
                window.shoppingState.customLocation = loc.trim();
                if (window.render) window.render();
                if(window.actions?.showToast) window.actions.showToast(loc ? `📍 定位已切换至：${loc}` : '📍 已恢复为自动获取真实定位');
            }
        },
        // 🧠 AI + 真实后端 双通道搜索引擎
        searchItems: async () => {
            const state = window.shoppingState;
            const query = state.searchQuery.trim();
            if (!query) return;

            state.isSearching = true;
            if (window.render) window.render();

            const isFood = state.homeTab === 'food';

            // 🍔 通道一：外卖走真实高德后端！
            if (isFood) {
                let finalLocation = state.customLocation;
                // 如果没有手动设置，自动获取真实 IP 城市
                if (!finalLocation) {
                    if (window.actions?.showToast) window.actions.showToast('正在获取真实定位...');
                    try {
                        const ipRes = await fetch('https://ipapi.co/json/');
                        const ipJson = await ipRes.json();
                        if (ipJson && ipJson.city) finalLocation = ipJson.city;
                    } catch (e) {
                        finalLocation = '上海市'; // 获取失败兜底
                    }
                }

                try {
                    // 🌟 直接调用你的专属域名接口！
                    const serverUrl = 'https://neko-hoshino.duckdns.org/search-food';
                    const res = await fetch(serverUrl, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-secret-token': 'EAAF99' // 对应你服务器的口令
                        },
                        body: JSON.stringify({ keyword: query, location: finalLocation })
                    });
                    const realData = await res.json();
                    if (realData.items) {
                        state.searchResults = realData.items.slice(0, 4); // 取前4个展示
                    }
                } catch (e) {
                    console.error(e);
                    if(window.actions?.showToast) window.actions.showToast('连接外卖服务器失败，请检查后端');
                } finally {
                    state.isSearching = false;
                    if (window.render) window.render();
                }

            } 
            // 🛒 通道二：淘宝继续走纯净大模型脑补！
            else {
                const prompt = `用户在淘宝购物搜索了"${query}"。
请生成 4 个极其逼真的商品结果。
返回格式：[{"name": "商品标题(尽量长且真实)", "price": "价格(纯数字)", "sales": "已售1万+", "desc": "发货地/参数", "type": "shop"}]
只返回 JSON 数组，绝不输出其他文字或markdown符号！`;

                try {
                    const res = await fetch(`${currentStore.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentStore.apiConfig.apiKey}` },
                        body: JSON.stringify({ model: currentStore.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
                    });
                    const data = await res.json();
                    const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
                    state.searchResults = JSON.parse(reply);
                } catch (e) {
                    if(window.actions?.showToast) window.actions.showToast('淘宝搜索超时');
                } finally {
                    state.isSearching = false;
                    if (window.render) window.render();
                }
            }
        },

        // 🧠 AI 引擎：解析购物车分享链接
        importCartLink: async () => {
            const link = prompt("请在此粘贴 TA 发给你的【淘宝购物车分享链接】或【淘口令】：\n(如果没有，随便输入一段文字，AI 会自动为你脑补 3 件神奇的商品)");
            if (!link) return;
            
            const state = window.shoppingState;
            state.isSearching = true; 
            if (window.render) window.render();

            const prompt = `用户输入了一段淘宝购物车分享链接或口令："${link}"。
请基于这段文本（如果太短或毫无意义，请自己发挥脑补），解析出 3 件有意思的商品放入购物车。
返回格式：[{"name": "商品标题", "price": "价格(纯数字)", "sales": "规格/颜色", "desc": "来源: 购物车分享", "type": "shop"}]
只返回 JSON 数组，绝不输出思考过程！`;

            try {
                const res = await fetch(`${currentStore.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentStore.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: currentStore.apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.8 })
                });
                const data = await res.json();
                const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
                const items = JSON.parse(reply);
                
                if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
                currentStore.shoppingData.cart = [...currentStore.shoppingData.cart, ...items];
                if (window.actions?.saveStore) window.actions.saveStore();
                if(window.actions?.showToast) window.actions.showToast('✅ 购物车链接解析成功！');
            } catch (e) {
                console.error('解析失败:', e);
                if(window.actions?.showToast) window.actions.showToast('解析失败，链接格式可能不正确');
            } finally {
                state.isSearching = false;
                if (window.render) window.render();
            }
        },

        // 加入购物车
        addToCart: (itemStr) => {
            const item = JSON.parse(decodeURIComponent(itemStr));
            if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
            currentStore.shoppingData.cart.push(item);
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(`✅ 已加入购物车`);
            if (window.render) window.render();
        },

        // 🌟 结账下单并触发微信连动
        checkoutCart: () => {
            if (!currentStore.shoppingData || !currentStore.shoppingData.cart || currentStore.shoppingData.cart.length === 0) return;
            const items = currentStore.shoppingData.cart;
            
            // 移入订单
            const newOrders = items.map(item => ({
                ...item,
                time: new Date().toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}),
                status: item.type === 'food' ? '骑手赶往中' : '卖家已发货'
            }));
            currentStore.shoppingData.orders = [...newOrders, ...(currentStore.shoppingData.orders || [])];
            currentStore.shoppingData.cart = []; // 清空购物车
            if (window.actions?.saveStore) window.actions.saveStore();
            
            if (window.actions?.showToast) window.actions.showToast('✅ 支付成功！商品已在路上！');
            window.shoppingActions.switchTab('me');

            // 🌟 核心彩蛋：联动微信，给他发消息！
            // 寻找第一个联系人作为目标角色
            const chat = currentStore.chats && currentStore.chats[0];
            if (chat) {
                const char = currentStore.contacts.find(c => c.id === chat.charId);
                const itemNames = items.map(i => i.name).join('和');
                setTimeout(() => {
                    chat.messages.push({
                        id: Date.now(), sender: char?.name || 'TA', isMe: false, msgType: 'text',
                        text: `老婆！！我刚刚看手机，发现你给我买了【${itemNames}】？！你也太好了吧！！！亲亲亲亲亲！😘`,
                        time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}), timestamp: Date.now()
                    });
                    if (window.actions?.saveStore) window.actions.saveStore();
                    // 强制刷新主界面提醒用户
                    if(document.getElementById('wechat-screen') || document.getElementById('desktop-screen')) {
                        if (window.render) window.render();
                    }
                    if(window.actions?.showToast) window.actions.showToast(`📩 ${char?.name || 'TA'} 给你发了一条微信新消息！`);
                }, 3000);
            }
        }
    };
}

// 3. 核心渲染函数
export function renderShoppingApp(store) {
    currentStore = store; // 刷新全局缓存
    const state = window.shoppingState;
    if (!store.shoppingData) store.shoppingData = { cart: [], orders: [] };
    const shopData = store.shoppingData;

    const isHome = state.tab === 'home';
    const isCart = state.tab === 'cart';
    const isMe = state.tab === 'me';
    
    let pageContentHtml = '';

    // 🛍️ 1. 首页区域
    if (isHome) {
        const isFood = state.homeTab === 'food';
        pageContentHtml = `
            <div class="pt-12 pb-3 px-4 flex items-center bg-[#fff] z-40 relative shadow-sm shrink-0">
                <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-800" onclick="window.actions.setCurrentApp(null)">
                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                </div>
                <div class="flex-1 flex justify-center space-x-8 font-bold text-[16px]">
                    <div class="cursor-pointer pb-1 px-1 transition-all ${!isFood ? 'text-[#ff5000] border-b-[3px] border-[#ff5000]' : 'text-gray-500 hover:text-gray-800'}" onclick="window.shoppingActions.switchHomeTab('shop')">淘宝购物</div>
                    <div class="cursor-pointer pb-1 px-1 transition-all ${isFood ? 'text-[#ff5000] border-b-[3px] border-[#ff5000]' : 'text-gray-500 hover:text-gray-800'}" onclick="window.shoppingActions.switchHomeTab('food')">同城外卖</div>
                </div>
                <div class="w-10 flex justify-end">
                    ${isFood ? `<i data-lucide="map-pin" class="w-5 h-5 cursor-pointer active:scale-90 transition-transform ${state.customLocation ? 'text-[#ff5000]' : 'text-gray-600'}" onclick="window.shoppingActions.setLocation()" title="更改定位"></i>` : ''}
                </div>
            </div>
            
            <div class="bg-[#fff] px-4 py-2 pb-4 shadow-sm z-10 relative shrink-0">
                <div class="flex items-center bg-[#f4f4f4] rounded-full border-2 border-[#ff5000] overflow-hidden pr-1">
                    <i data-lucide="search" class="w-5 h-5 text-gray-400 ml-3"></i>
                    <input type="text" value="${state.searchQuery}" oninput="window.shoppingActions.updateSearch(this.value)" onkeydown="if(event.key==='Enter') window.shoppingActions.searchItems()" placeholder="${isFood ? '搜附近美食、奶茶...' : '搜索你要给 TA 买的礼物...'}" class="flex-1 bg-transparent h-10 px-2 outline-none text-[14px] text-gray-800" />
                    <button class="bg-gradient-to-r from-[#ff9000] to-[#ff5000] text-white px-4 h-8 rounded-full text-[13px] font-bold active:scale-95 transition-transform" onclick="window.shoppingActions.searchItems()">搜索</button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto bg-[#f4f4f4] px-3 pt-3 pb-20 hide-scrollbar">
                ${state.isSearching ? `
                    <div class="flex flex-col items-center justify-center pt-20 text-gray-400">
                        <i data-lucide="loader" class="w-8 h-8 animate-spin text-[#ff5000] mb-3"></i>
                        <span class="text-[13px]">正在寻找目标...</span>
                    </div>
                ` : (state.searchResults && state.searchResults.length > 0 ? `
                    <div class="${isFood ? 'flex flex-col space-y-3' : 'grid grid-cols-2 gap-3'}">
                        ${state.searchResults.map(item => {
                            const encodedItem = encodeURIComponent(JSON.stringify(item));
                            if (isFood) {
                                return `
                                <div class="bg-[#fff] rounded-[12px] p-3 flex shadow-sm border border-gray-100">
                                    <div class="w-20 h-20 bg-orange-50 rounded-[8px] flex items-center justify-center flex-shrink-0 text-orange-400"><i data-lucide="store" class="w-8 h-8"></i></div>
                                    <div class="ml-3 flex-1 flex flex-col justify-between overflow-hidden">
                                        <div class="font-bold text-gray-900 text-[15px] truncate">${item.name}</div>
                                        <div class="text-[11px] text-gray-500 truncate mt-1">${item.desc}</div>
                                        <div class="flex justify-between items-end mt-2">
                                            <span class="text-[14px] font-black text-[#ff5000]"><span class="text-[10px]">¥</span>${item.price}</span>
                                            <div class="w-7 h-7 bg-[#ff5000] rounded-full flex items-center justify-center text-white cursor-pointer active:scale-90 shadow-sm" onclick="window.shoppingActions.addToCart('${encodedItem}')"><i data-lucide="plus" class="w-4 h-4"></i></div>
                                        </div>
                                    </div>
                                </div>`;
                            } else {
                                return `
                                <div class="bg-[#fff] rounded-[12px] overflow-hidden shadow-sm border border-gray-100 flex flex-col">
                                    <div class="w-full aspect-square bg-gray-50 flex items-center justify-center text-gray-300"><i data-lucide="image" class="w-10 h-10"></i></div>
                                    <div class="p-2 flex flex-col flex-1">
                                        <div class="text-[13px] text-gray-800 font-medium line-clamp-2 leading-snug mb-1 flex-1">${item.name}</div>
                                        <div class="text-[10px] text-gray-400 mb-1">${item.sales}</div>
                                        <div class="flex justify-between items-end">
                                            <span class="text-[15px] font-black text-[#ff5000]"><span class="text-[11px]">¥</span>${item.price}</span>
                                            <div class="w-6 h-6 border border-[#ff5000] text-[#ff5000] rounded-full flex items-center justify-center cursor-pointer active:bg-[#ff5000] active:text-white transition-colors" onclick="window.shoppingActions.addToCart('${encodedItem}')"><i data-lucide="shopping-cart" class="w-3 h-3"></i></div>
                                        </div>
                                    </div>
                                </div>`;
                            }
                        }).join('')}
                    </div>
                ` : `
                    <div class="flex flex-col items-center justify-center pt-32 text-gray-400 opacity-60">
                        <i data-lucide="search" class="w-12 h-12 mb-3"></i>
                        <span class="text-[13px] font-medium tracking-widest">搜点什么惊喜吧</span>
                    </div>
                `)}
            </div>
        `;
    } 
    // 🛒 2. 购物车区域
    else if (isCart) {
        pageContentHtml = `
            <div class="pt-12 pb-3 px-4 flex items-center bg-[#fff] z-40 relative shadow-sm shrink-0">
                <div class="w-16 flex items-center cursor-pointer active:opacity-50 text-gray-800" onclick="window.actions.setCurrentApp(null)">
                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                </div>
                <div class="flex-1 text-center text-[18px] font-black text-gray-900">购物车 (${shopData.cart.length})</div>
                <div class="w-16 flex justify-end items-center">
                    <span class="text-[14px] text-gray-600 font-bold">管理</span>
                </div>
            </div>
            
            <div class="flex-1 overflow-y-auto bg-[#f4f4f4] px-3 pt-3 pb-24 hide-scrollbar relative">
                <div class="bg-gradient-to-r from-orange-100 to-[#ffedd5] border border-orange-200 rounded-[12px] p-4 mb-4 flex justify-between items-center shadow-sm cursor-pointer active:scale-95 transition-transform" onclick="window.shoppingActions.importCartLink()">
                    <div class="flex flex-col">
                        <span class="text-[15px] font-black text-[#ff5000] mb-0.5">帮 TA 清空购物车？</span>
                        <span class="text-[11px] text-orange-600 font-medium">点击此处，粘贴 TA 的购物车口令或链接</span>
                    </div>
                    <div class="w-10 h-10 bg-[#ff5000] rounded-full text-white flex items-center justify-center shadow-md ${state.isSearching ? 'animate-spin' : ''}">
                        <i data-lucide="${state.isSearching ? 'loader' : 'link'}" class="w-5 h-5"></i>
                    </div>
                </div>

                ${shopData.cart.length > 0 ? shopData.cart.map(item => `
                    <div class="bg-[#fff] rounded-[12px] p-3 mb-3 flex items-center shadow-sm border border-gray-100">
                        <i data-lucide="check-circle-2" class="w-5 h-5 text-[#ff5000] mr-3 shrink-0"></i>
                        <div class="w-16 h-16 bg-gray-50 rounded-[8px] flex items-center justify-center shrink-0 mr-3 text-gray-300 border border-gray-100"><i data-lucide="${item.type==='food'?'store':'image'}" class="w-6 h-6"></i></div>
                        <div class="flex-1 flex flex-col min-w-0">
                            <div class="text-[14px] font-bold text-gray-800 line-clamp-1 mb-1">${item.name}</div>
                            <div class="text-[11px] text-gray-400 bg-gray-50 self-start px-1.5 py-0.5 rounded truncate max-w-full">${item.desc || item.sales || '默认规格'}</div>
                            <div class="text-[15px] font-black text-[#ff5000] mt-1">¥${item.price}</div>
                        </div>
                    </div>
                `).join('') : '<div class="text-center text-gray-400 mt-20 text-[13px] font-medium">购物车空空如也</div>'}
            </div>

            ${shopData.cart.length > 0 ? `
                <div class="absolute bottom-[52px] left-0 right-0 bg-[#fff] border-t border-gray-200 px-4 py-2 flex justify-between items-center shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
                    <div class="flex items-center text-[12px] text-gray-500 font-bold"><i data-lucide="check-circle-2" class="w-5 h-5 text-[#ff5000] mr-1.5"></i>全选</div>
                    <div class="flex items-center">
                        <div class="flex flex-col items-end mr-3">
                            <span class="text-[12px] text-gray-800 font-bold">合计: <span class="font-black text-[#ff5000] text-[16px]">¥${shopData.cart.reduce((a,b)=>a+(parseFloat(b.price)||0), 0).toFixed(2)}</span></span>
                        </div>
                        <button class="bg-gradient-to-r from-[#ff9000] to-[#ff5000] text-white px-6 py-2.5 rounded-full text-[14px] font-bold active:scale-95 transition-transform shadow-md" onclick="window.shoppingActions.checkoutCart()">结算下单</button>
                    </div>
                </div>
            ` : ''}
        `;
    } 
    // 👤 3. 我的(订单)区域
    else if (isMe) {
        pageContentHtml = `
            <div class="pt-12 pb-3 px-4 bg-[#fff] z-40 relative shadow-sm border-b border-gray-100 flex items-center shrink-0">
                <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-800" onclick="window.actions.setCurrentApp(null)">
                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="w-14 h-14 rounded-full border border-gray-200 overflow-hidden shrink-0"><img src="${store.personas[0].avatar}" class="w-full h-full object-cover"></div>
                    <div class="flex flex-col">
                        <span class="text-[18px] font-black text-gray-900">${store.personas[0].name}</span>
                    </div>
                </div>
            </div>
            
            <div class="flex-1 overflow-y-auto bg-[#f4f4f4] px-3 pt-4 pb-20 hide-scrollbar">
                <div class="text-[14px] font-bold text-gray-800 mb-3 ml-1 flex items-center"><i data-lucide="file-text" class="w-4 h-4 mr-1.5 text-[#ff5000]"></i>全部订单</div>
                ${shopData.orders.length > 0 ? shopData.orders.map(item => `
                    <div class="bg-[#fff] rounded-[12px] p-4 mb-3 shadow-sm border border-gray-100">
                        <div class="flex justify-between items-center border-b border-gray-50 pb-2 mb-3">
                            <span class="text-[11px] text-gray-400 font-mono">${item.time}</span>
                            <span class="text-[12px] font-bold text-[#ff5000]">${item.status}</span>
                        </div>
                        <div class="flex items-center">
                            <div class="w-14 h-14 bg-gray-50 rounded-[8px] flex items-center justify-center shrink-0 mr-3 text-gray-300 border border-gray-100"><i data-lucide="${item.type==='food'?'store':'image'}" class="w-5 h-5"></i></div>
                            <div class="flex-1 min-w-0">
                                <div class="text-[13px] font-bold text-gray-800 line-clamp-2 leading-snug">${item.name}</div>
                                <div class="text-[11px] text-gray-400 mt-1 truncate">${item.desc || item.sales || '默认规格'}</div>
                            </div>
                            <div class="ml-3 text-[14px] font-black text-gray-800">¥${item.price}</div>
                        </div>
                    </div>
                `).join('') : '<div class="text-center text-gray-400 mt-20 text-[13px] font-medium">暂时没有为 TA 买过东西哦</div>'}
            </div>
        `;
    }

    // 🌟 外层剥离 absolute，使用 Flex 流式布局让 pt-12 直接暴露给 CSS
    return `
        <div class="w-full h-full relative overflow-hidden animate-in fade-in duration-300 select-none bg-[#fff] flex flex-col">
            
            ${pageContentHtml}

            <div class="h-[52px] bg-[#fff] border-t border-gray-200 flex items-center justify-around pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] shrink-0">
                <div class="flex flex-col items-center justify-center cursor-pointer w-16 transition-colors ${isHome ? 'text-[#ff5000]' : 'text-gray-400 hover:text-gray-600'}" onclick="window.shoppingActions.switchTab('home')">
                    <i data-lucide="home" class="w-[22px] h-[22px] mb-0.5 ${isHome ? 'fill-current' : ''}"></i>
                    <span class="text-[10px] font-bold">首页</span>
                </div>
                <div class="flex flex-col items-center justify-center cursor-pointer w-16 transition-colors ${isCart ? 'text-[#ff5000]' : 'text-gray-400 hover:text-gray-600'}" onclick="window.shoppingActions.switchTab('cart')">
                    <div class="relative">
                        <i data-lucide="shopping-cart" class="w-[22px] h-[22px] mb-0.5 ${isCart ? 'fill-current' : ''}"></i>
                        ${shopData.cart.length > 0 ? `<div class="absolute -top-1.5 -right-2 bg-[#ff5000] text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center border border-white shadow-sm">${shopData.cart.length}</div>` : ''}
                    </div>
                    <span class="text-[10px] font-bold">购物车</span>
                </div>
                <div class="flex flex-col items-center justify-center cursor-pointer w-16 transition-colors ${isMe ? 'text-[#ff5000]' : 'text-gray-400 hover:text-gray-600'}" onclick="window.shoppingActions.switchTab('me')">
                    <i data-lucide="user" class="w-[22px] h-[22px] mb-0.5 ${isMe ? 'fill-current' : ''}"></i>
                    <span class="text-[10px] font-bold">我的</span>
                </div>
            </div>
        </div>
    `;
}