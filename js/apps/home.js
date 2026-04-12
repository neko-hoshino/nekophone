// js/apps/home.js
import { store } from '../store.js';

// 🌟 核心引擎：脱离 main.js 的原生内置播放器引擎
if (!window.homeAudioEngine) {
    window.homeAudioEngine = new Audio();
    window.homeAudioEngine.setAttribute('playsinline', 'true');
    window.homeAudioEngine.setAttribute('webkit-playsinline', 'true');
    
    window.audioState = window.audioState || { currentIndex: 0, isPlaying: false, loopMode: 'list' };
    
    window.homeAudioEngine.onplay = () => { window.audioState.isPlaying = true; window.homeActions?.updateMusicUI?.(); };
    window.homeAudioEngine.onpause = () => { window.audioState.isPlaying = false; window.homeActions?.updateMusicUI?.(); };
    window.homeAudioEngine.onended = () => {
        if (window.audioState.loopMode === 'single') window.homeAudioEngine.play().catch(()=>{});
        else window.homeActions?.nextMusic?.();
    };

    window.audioPlayer = {
        audio: window.homeAudioEngine,
        getTrackName: () => {
            const list = store.customAudio || [];
            return list[window.audioState.currentIndex]?.name || '暂无音乐';
        },
        getArtistName: () => {
            const list = store.customAudio || [];
            return list[window.audioState.currentIndex]?.artist || '未知歌手';
        },
        play: () => { window.homeAudioEngine.play().catch(e=>console.log(e)); },
        pause: () => { window.homeAudioEngine.pause(); },
        next: () => {
            const list = store.customAudio || [];
            if (list.length <= 1) return;
            window.audioState.currentIndex = (window.audioState.currentIndex + 1) % list.length;
            window.audioPlayer.loadAndPlay();
        },
        prev: () => {
            const list = store.customAudio || [];
            if (list.length <= 1) return;
            window.audioState.currentIndex = (window.audioState.currentIndex - 1 + list.length) % list.length;
            window.audioPlayer.loadAndPlay();
        },
        toggleLoop: () => { 
            window.audioState.loopMode = window.audioState.loopMode === 'list' ? 'single' : 'list'; 
            window.homeActions?.updateMusicUI?.();
        },
        loadAndPlay: () => {
            const list = store.customAudio || [];
            if (list.length === 0) {
                window.homeAudioEngine.pause();
                window.homeAudioEngine.removeAttribute('src');
                return;
            }
            if (window.audioState.currentIndex >= list.length) window.audioState.currentIndex = 0; 
            let src = list[window.audioState.currentIndex].src;
            if (src.startsWith('http')) src += (src.includes('?') ? '&' : '?') + 't=' + Date.now();
            window.homeAudioEngine.setAttribute('src', src);
            window.homeAudioEngine.play().catch(e=>console.log(e));
            window.homeActions?.updateMusicUI?.();
        }
    };
}

// 🌟 初始化弹窗与开屏状态
if (!window.homeState) window.homeState = { 
    showAddAudioModal: false, showPlaylistModal: false, showTodoModal: false, showPeriodModal: false, 
    showCompanionModal: false, tempLyrics: null, isGeneratingReaction: false, isGeneratingFortune: false,
    lastScrollLeft: 0, 
    isRestoringScroll: false,
    isBooting: true // 开屏状态标志
};

// 全局歌词引擎
if (!window.lyricTimerInt) {
    window.lyricTimerInt = setInterval(() => {
        const el = document.getElementById('music-lyric-line');
        if(el && window.audioState?.isPlaying && window.audioPlayer?.audio) {
            const ct = window.audioPlayer.audio.currentTime || 0;
            let rawDuration = window.audioPlayer.audio.duration;
            if (!rawDuration || isNaN(rawDuration) || rawDuration === Infinity) rawDuration = 200; 
            const duration = rawDuration;

            const list = store.customAudio || [];
            const track = list[window.audioState.currentIndex];
            
            if(track && track.lyrics && Array.isArray(track.lyrics) && track.lyrics.length > 0) {
                let active = '🎵';
                if (typeof track.lyrics[0] === 'object') {
                    for(let i=0; i<track.lyrics.length; i++) {
                        if(ct >= track.lyrics[i].time) active = track.lyrics[i].text;
                        else break;
                    }
                } else if (typeof track.lyrics[0] === 'string') {
                    const progress = Math.max(0, Math.min(1, ct / duration));
                    const idx = Math.min(Math.floor(progress * track.lyrics.length), track.lyrics.length - 1);
                    active = track.lyrics[idx] || '🎵';
                }
                if(el.innerText !== active && active) {
                    el.style.opacity = '0';
                    setTimeout(() => { el.innerText = active; el.style.opacity = '1'; }, 150);
                }
            } else {
                if(el.innerText !== '🎵') el.innerText = '🎵';
            }
        }
    }, 200);
}

if (!window.homeActions) {
  window.homeActions = {
    // 处理开屏完成
    finishBooting: () => {
      window.homeState.isBooting = false;
      window.homeActions.doRender();
    },

    doRender: () => {
        const el = document.getElementById('home-swiper-scroll');
        if (el && !window.homeState.isRestoringScroll) {
            window.homeState.lastScrollLeft = el.scrollLeft;
        }
        window.render();
        
        const newEl = document.getElementById('home-swiper-scroll');
        if (newEl && window.homeState.lastScrollLeft > 10) {
            newEl.style.scrollSnapType = 'none'; 
            newEl.scrollLeft = window.homeState.lastScrollLeft;
            requestAnimationFrame(() => {
                newEl.scrollLeft = window.homeState.lastScrollLeft;
                setTimeout(() => { newEl.style.scrollSnapType = 'x mandatory'; }, 100);
            });
        }
    },

    updateAvatar: (e) => {
      const file = e.target.files[0]; if(!file) return;
      window.actions.compressImage(file, (base64) => { store.personas[0].avatar = base64; window.homeActions.doRender(); });
      e.target.value = '';
    },
    updateName: (val) => { store.personas[0].name = val; window.homeActions.doRender(); },
    
    uploadPolaroid: (e) => {
        const file = e.target.files[0]; if(!file) return;
        window.actions.compressImage(file, (base64) => { store.homePolaroidImg = base64; window.homeActions.doRender(); });
        e.target.value = '';
    },

    openTodoModal: () => { window.homeState.showTodoModal = true; window.homeActions.doRender(); },
    closeTodoModal: () => { window.homeState.showTodoModal = false; window.homeActions.doRender(); },
    saveTodo: () => {
        const text = document.getElementById('todo-text-input').value.trim();
        const date = document.getElementById('todo-date-input').value; 
        if (!text) return window.actions.showToast('请输入待办内容哦');
        if (!store.calendarData) store.calendarData = { todos: [], lastPeriod: '' };
        if (!store.calendarData.todos) store.calendarData.todos = [];
        store.calendarData.todos.push({ id: Date.now(), text, targetDate: date || new Date().toISOString().split('T')[0] });
        window.homeState.showTodoModal = false;
        if (window.actions.saveStore) window.actions.saveStore();
        window.homeActions.doRender(); 
        window.actions?.showToast('✅ 事项已安排');
    },
    deleteTodo: (id) => {
        if(!store.calendarData || !store.calendarData.todos) return;
        store.calendarData.todos = store.calendarData.todos.filter(t => t.id !== id);
        if (window.actions.saveStore) window.actions.saveStore();
        window.homeActions.doRender();
    },
    openPeriodModal: () => { window.homeState.showPeriodModal = true; window.homeActions.doRender(); },
    closePeriodModal: () => { window.homeState.showPeriodModal = false; window.homeActions.doRender(); },
    savePeriod: () => {
        const date = document.getElementById('period-date-input').value;
        if (!date) return window.actions.showToast('请选择日期');
        if (!store.calendarData) store.calendarData = { todos: [], lastPeriod: '' };
        store.calendarData.lastPeriod = date;
        window.homeState.showPeriodModal = false;
        if (window.actions.saveStore) window.actions.saveStore();
        window.homeActions.doRender();
        window.actions?.showToast('🩸 月经记录已更新'); 
    },
    
    updateMusicUI: () => {
        const list = store.customAudio || [];
        if (list.length > 0) {
            const trackName = window.audioPlayer.getTrackName();
            const artistName = window.audioPlayer.getArtistName();
            const nameEl = document.getElementById('mc-audio-name');
            const artistEl = document.getElementById('mc-audio-artist');
            const iconEl = document.getElementById('mc-audio-play-icon');
            if (nameEl) nameEl.innerText = trackName;
            if (artistEl) artistEl.innerText = artistName;
            if (iconEl) {
                iconEl.setAttribute('data-lucide', window.audioState.isPlaying ? 'pause' : 'play');
                if (window.lucide) window.lucide.createIcons();
            }
            const loopIcon = window.audioState.loopMode === 'list' ? 'repeat' : 'repeat-1';
            const loopEl = document.getElementById('mc-audio-loop-icon');
            if (loopEl) {
                loopEl.setAttribute('data-lucide', loopIcon);
                if (window.lucide) window.lucide.createIcons();
            }
        }
    },
    triggerReaction: () => {
        if (window.audioState?.isPlaying && store.musicCompanionId) {
            window.homeActions.generateMusicReaction();
        }
    },
    togglePlay: () => {
        const list = store.customAudio || [];
        if(list.length === 0) return window.homeActions.openAddAudioModal();
        
        if (window.audioState.isPlaying) { 
            window.audioPlayer.pause(); 
        } else { 
            if (!window.homeAudioEngine.getAttribute('src')) {
                window.audioPlayer.loadAndPlay();
            } else {
                window.audioPlayer.play(); 
            }
            window.homeActions.triggerReaction(); 
        }
        window.homeActions.updateMusicUI(); 
    },
    nextMusic: () => { if(window.audioPlayer) { window.audioPlayer.next(); window.homeActions.triggerReaction(); window.homeActions.updateMusicUI(); } },
    prevMusic: () => { if(window.audioPlayer) { window.audioPlayer.prev(); window.homeActions.triggerReaction(); window.homeActions.updateMusicUI(); } },
    toggleLoop: () => { 
        if(window.audioPlayer) {
            window.audioPlayer.toggleLoop(); 
            window.homeActions.updateMusicUI();
        }
    },
    
    openAddAudioModal: () => { window.homeState.showAddAudioModal = true; window.homeState.tempLyrics = null; window.homeActions.doRender(); },
    closeAddAudioModal: () => { window.homeState.showAddAudioModal = false; window.homeActions.doRender(); },
    openPlaylist: () => { window.homeState.showPlaylistModal = true; window.homeActions.doRender(); },
    closePlaylist: () => { window.homeState.showPlaylistModal = false; window.homeActions.doRender(); },

    uploadLyricFile: (e) => {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const lines = event.target.result.split('\n');
            const result = [];
            const regex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
            let hasTimestamp = false;
            
            lines.forEach(line => {
                const match = regex.exec(line);
                if(match && match[3].trim()) {
                    hasTimestamp = true;
                    result.push({ time: parseInt(match[1])*60 + parseFloat(match[2]), text: match[3].trim() });
                }
            });
            
            if (hasTimestamp) {
                window.homeState.tempLyrics = result;
            } else {
                const pureTextLines = lines.map(l => l.trim()).filter(l => l !== '');
                window.homeState.tempLyrics = pureTextLines.length > 0 ? pureTextLines : null;
            }
            window.actions?.showToast(window.homeState.tempLyrics ? '歌词解析成功！' : '解析为空');
            window.homeActions.doRender();
        };
        reader.readAsText(file); e.target.value = '';
    },

    triggerLocalUpload: () => { document.getElementById('upload-bg-audio').click(); },
    confirmUrlAudio: () => {
        let url = document.getElementById('audio-url-input').value.trim();
        let name = document.getElementById('audio-name-input').value.trim() || '网络音频';
        let artist = document.getElementById('audio-artist-input').value.trim() || '未知歌手';
        if (!url || !url.startsWith('http')) return window.actions.showToast('请输入有效的音频直链');
        if (url.includes('raw.githubusercontent.com')) url = url.replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/').replace('/main/', '@main/').replace('/master/', '@master/');
        else if (url.includes('github.com') && url.includes('/blob/')) url = url.replace('https://github.com/', 'https://cdn.jsdelivr.net/gh/').replace('/blob/main/', '@main/').replace('/blob/master/', '@master/');

        store.customAudio = store.customAudio || []; 
        store.customAudio.push({ name: name, artist: artist, src: url, lyrics: window.homeState.tempLyrics });
        if (window.actions.saveStore) window.actions.saveStore(); 
        
        window.actions.showToast('网络音频添加成功！');
        window.audioPlaylist = store.customAudio; 
        window.audioState.currentIndex = store.customAudio.length - 1; 
        window.audioPlayer.loadAndPlay();
        window.homeState.showAddAudioModal = false; 
        window.homeActions.triggerReaction(); 
        window.homeActions.doRender();
    },

    uploadBgAudio: (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 15 * 1024 * 1024) return window.actions.showToast('音频过大！请选择 15MB 以内'); 
        window.actions.showToast('正在解析，请稍候...');
        const reader = new FileReader();
        reader.onload = (event) => {
            const resultStr = event.target.result;
            if (!resultStr) return window.actions.showToast('读取失败');
            store.customAudio = store.customAudio || [];
            store.customAudio.push({ name: file.name.replace(/\.[^/.]+$/, ""), artist: '本地导入', src: resultStr, lyrics: window.homeState.tempLyrics });
            if (window.actions.saveStore) window.actions.saveStore(); 
            
            window.actions.showToast('本地音乐导入成功！');
            window.audioPlaylist = store.customAudio;
            window.audioState.currentIndex = store.customAudio.length - 1; 
            window.audioPlayer.loadAndPlay();
            window.homeState.showAddAudioModal = false; 
            window.homeActions.triggerReaction(); 
            window.homeActions.doRender();
        };
        reader.readAsDataURL(file); e.target.value = '';
    },
    
    playTrackFromList: (idx) => {
        window.audioState.currentIndex = idx;
        window.audioPlayer.loadAndPlay();
        window.homeActions.triggerReaction();
        window.homeActions.doRender();
    },
    deleteTrackFromList: (idx, e) => {
        e.stopPropagation();
        if (!confirm('确定删除这首音乐吗？')) return;
        store.customAudio.splice(idx, 1);
        if (window.actions.saveStore) window.actions.saveStore(); 
        
        window.audioPlaylist = store.customAudio;
        if (window.audioPlaylist.length === 0) { window.audioState.isPlaying = false; window.audioPlayer.loadAndPlay(); } 
        else { if (window.audioState.currentIndex >= window.audioPlaylist.length) window.audioState.currentIndex = 0; window.audioPlayer.loadAndPlay(); }
        window.homeActions.doRender();
    },

    openCompanionSelect: () => { window.homeState.showCompanionModal = true; window.homeActions.doRender(); },
    closeCompanionSelect: () => { window.homeState.showCompanionModal = false; window.homeActions.doRender(); },
    
    removeCompanion: () => {
        store.musicCompanionId = null;
        store.musicReaction = '';
        window.homeState.showCompanionModal = false;
        window.homeActions.doRender();
    },

    selectCompanion: (id) => {
        store.musicCompanionId = id;
        store.musicReaction = '正在倾听...';
        window.homeState.showCompanionModal = false;
        window.homeActions.triggerReaction();
        window.homeActions.doRender();
    },
    
    generateMusicReaction: async () => {
        const list = store.customAudio || [];
        if (!store.apiConfig?.apiKey || !store.musicCompanionId || list.length === 0) return;
        const track = list[window.audioState.currentIndex];
        const char = store.contacts.find(c => c.id === store.musicCompanionId);
        if (!char) return;

        const chat = store.chats?.find(ch => ch.charId === char.id);
        const boundPId = chat?.isGroup ? chat.boundPersonaId : (char?.boundPersonaId || store.personas[0].id);
        const boundP = store.personas.find(p => p.id === boundPId) || store.personas[0];
        
        const globalP = store.globalPrompt ? `\n【通用用户人设】\n${store.globalPrompt}` : '';
        const boundPrompt = boundP.prompt ? `\n【当前绑定身份】\n${boundP.prompt}` : '';
        const basePrompt = `【角色卡】\n名字：${char.name}\n设定：${char.prompt}\n\n【用户】\n当前化名：${boundP.name}${globalP}${boundPrompt}`;

        const coreMem = (store.memories || []).filter(m => m.charId === char.id && m.type === 'core').map(m=>m.content).join('；');
        const coreMemStr = coreMem ? `\n\n【我们之间的核心记忆】\n${coreMem}` : '';
        
        let lyricsStr = '';
        if (track.lyrics && Array.isArray(track.lyrics)) {
            const rawLines = track.lyrics.map(l => typeof l === 'object' ? l.text : l).slice(0, 20); 
            lyricsStr = `\n\n【当前播放的歌词片段】\n` + rawLines.join('\n') + `...`;
        }
        
        window.homeState.isGeneratingReaction = true; window.homeActions.doRender();
        try {
            const task = `用户正在听歌，歌名：《${track.name}》，歌手：${track.artist}。
你扮演【${char.name}】，就坐在旁边陪用户听。
【绝对指令！！！】：请你务必先仔细阅读歌名和歌词内容，准确推断这首歌的真实情感基调（是悲伤、遗憾、痛苦、压抑，还是欢快、热烈、甜蜜）。
如果是悲伤的歌，你的反应必须是心疼、低沉、安慰或共情；如果是热烈的歌，才可以表现出激动。绝对不能把悲伤的歌词看成热烈！
请结合你的人设底色和我们的羁绊记忆，对我发表一句感想或温情陪伴。
【要求】：必须符合你的人设！15-30字以内，口语化，精简自然，像随口说的话。严禁Emoji。输出JSON格式：{"reaction": "感想内容"}`;
            
            const promptStr = `${basePrompt}${coreMemStr}${lyricsStr}\n\n【任务】\n${task}`;

            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, 
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: promptStr }] }) 
            });
            const text = (await res.json()).choices[0].message.content.match(/\{[\s\S]*\}/)[0];
            store.musicReaction = JSON.parse(text).reaction;
        } catch(e) { console.error(e); } finally { window.homeState.isGeneratingReaction = false; window.homeActions.doRender(); }
    },

    saveBirthday: (val) => {
        if (!val) return window.actions?.showToast('请选择有效的日期');
        store.birthday = val;
        if(window.actions.saveStore) window.actions.saveStore();
        window.homeActions.generateDailyFortune();
    },
    editBirthday: () => {
        store.birthday = null;
        store.dailyFortune = null; 
        window.homeActions.doRender();
    },
    
    generateDailyFortune: async () => {
        if (!store.apiConfig?.apiKey) return window.actions?.showToast('需配置API才能解析运势');
        if (!store.birthday) return window.actions?.showToast('请先设定出生日期哦');
        
        window.homeState.isGeneratingFortune = true; window.homeActions.doRender();
        const today = new Date().toISOString().split('T')[0];
        try {
            const task = `你是一个专业占星系统。用户的出生日期是：${store.birthday}。
请首先根据出生日期算出【星座】，然后结合今天的日期(${today})的真实星象走向，生成专属今日运势。
包含：综合、爱情、事业星级(1-5的整数)，以及一段60字左右的专属运势解读（语气要神秘、温柔、治愈）。严禁Emoji。
输出严格的JSON格式：{"sign": "星座名称", "comprehensive": 4, "love": 5, "career": 3, "text": "解读内容"}`;
            
            const res = await fetch(`${store.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${store.apiConfig.apiKey}` }, 
                body: JSON.stringify({ model: store.apiConfig.model, messages: [{ role: 'user', content: task }] }) 
            });
            const text = (await res.json()).choices[0].message.content.match(/\{[\s\S]*\}/)[0];
            const parsed = JSON.parse(text);
            store.dailyFortune = { date: today, ...parsed };
            if(window.actions.saveStore) window.actions.saveStore();
        } catch(e) { console.error(e); } 
        finally { window.homeState.isGeneratingFortune = false; window.homeActions.doRender(); }
    },
    
    updateDots: (e) => {
      window.homeState.lastScrollLeft = e.target.scrollLeft;
      const idx = Math.round(e.target.scrollLeft / e.target.clientWidth);
      const d0 = document.getElementById('home-dot-0');
      const d1 = document.getElementById('home-dot-1');
      if (d0 && d1) {
         d0.style.opacity = idx === 0 ? '1' : '0.3';
         d1.style.opacity = idx === 1 ? '1' : '0.3';
      }
    }
  };
}

// 🌟 核心原版图标生成器
function createAppIcon(iconName, label, actionStr, mcClass, isDark) {
  const bgClass = isDark ? 'bg-black/50 border-black/20' : 'bg-white/50 border-white/20';
  const iconClass = isDark ? 'text-white opacity-90' : 'text-gray-900 opacity-60';
  const textClass = isDark ? 'text-white drop-shadow-md' : 'text-gray-800 opacity-80';

  return `
    <div class="flex flex-col items-center justify-start cursor-pointer group w-full min-h-0 overflow-hidden space-y-1.5" onclick="${actionStr}">
      <div class="${mcClass} w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center ${bgClass} rounded-[14px] sm:rounded-[16px] group-active:scale-95 transition-transform duration-200 shadow-sm border shrink-0">
        <i data-lucide="${iconName}" class="${iconClass} w-6 h-6 sm:w-7 sm:h-7"></i>
      </div>
      <span class="${textClass} text-[10px] font-bold tracking-wider text-center w-full truncate px-0.5 shrink-0">${label}</span>
    </div>
  `;
}

function createDockIcon(iconName, label, actionStr, mcClass, isDark) {
  const bgClass = isDark ? 'bg-black/30 border-black/20' : 'bg-white/30 border-white/20';
  const iconClass = isDark ? 'text-white opacity-90' : 'text-gray-900 opacity-60';
  const textClass = isDark ? 'text-white drop-shadow-md' : 'text-gray-800 opacity-80';

  return `
    <div class="flex flex-col items-center justify-center cursor-pointer group active:scale-95 transition-transform w-[22%] shrink-0 min-h-0" onclick="${actionStr}">
      <div class="${mcClass} flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 ${bgClass} rounded-[14px] sm:rounded-[16px] mb-1.5 shadow-sm border shrink-0">
        <i data-lucide="${iconName}" class="${iconClass} w-6 h-6 sm:w-7 sm:h-7 group-active:opacity-100 transition-opacity"></i>
      </div>
      <span class="${textClass} text-[10px] font-bold tracking-widest truncate w-full text-center shrink-0">${label}</span>
    </div>
  `;
}

// 🆕 开屏动画 CSS
const bootStyle = document.createElement('style');
bootStyle.innerHTML = `
@keyframes catRun { to { stroke-dashoffset: 0; } }
@keyframes textFadeIn { to { opacity: 1; transform: translateY(0); } }
@keyframes bootOut { to { opacity: 0; visibility: hidden; } }

.nekophone-boot-screen {
  position: absolute; inset: 0; z-index: 9999;
  background-color: #F8F7F3; 
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  overflow: hidden;
  transition: opacity 1s ease, visibility 1s ease;
}
.nekophone-boot-screen.fade-out { animation: bootOut 1s ease forwards; animation-delay: 1.5s; }

.cat-outline {
  width: 140px; height: 140px;
  stroke: #1A1A1A; 
  stroke-width: 2.5; 
  stroke-linecap: round; stroke-linejoin: round;
  fill: none;
  stroke-dasharray: 400; stroke-dashoffset: 400; 
  animation: catRun 3s ease-in-out forwards;
}

.boot-text {
  margin-top: 25px;
  font-family: 'Playfair Display', serif; 
  font-weight: 300; font-size: 20px; color: #1A1A1A;
  letter-spacing: 0.35em; text-transform: lowercase;
  opacity: 0; transform: translateY(10px);
  animation: textFadeIn 1s ease forwards; animation-delay: 2.5s;
}
`;
document.head.appendChild(bootStyle);

if(!document.getElementById('playfair-font')) {
    const link = document.createElement('link');
    link.id = 'playfair-font'; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;1,300&display=swap';
    document.head.appendChild(link);
}

export function renderHomeApp(store) {
  if (window.homeState?.isBooting) {
    setTimeout(() => { window.homeActions?.finishBooting(); }, 3500);

    return `
      <div class="nekophone-boot-screen ${window.homeState.isBooting ? '' : 'fade-out'}">
        <svg class="cat-outline" viewBox="0 0 100 100">
          <path d="M 80 65 
                   C 95 65, 95 90, 70 90 
                   L 35 90 
                   C 10 90, 15 50, 35 40 
                   L 32 20 
                   Q 32 14, 37 18 
                   L 47 28 
                   C 52 25, 58 25, 63 28 
                   L 75 17 
                   Q 80 13, 79 21 
                   L 75 40 
                   C 85 55, 80 85, 55 85" />
        </svg>
        <span class="boot-text">nekophone</span>
      </div>
    `;
  }

  const list = store.customAudio || [];
  if (list.length > 0 && window.homeAudioEngine && !window.homeAudioEngine.getAttribute('src')) {
      window.audioState.currentIndex = Math.min(window.audioState.currentIndex || 0, list.length - 1);
      window.homeAudioEngine.setAttribute('src', list[window.audioState.currentIndex].src);
  }

  const my = (store.personas && store.personas.length > 0) ? store.personas[0] : { name: '', avatar: '' };
  let avatarHtml = `<div class="w-full h-full flex items-center justify-center text-4xl">${my.avatar}</div>`;
  if (my.avatar && (my.avatar.startsWith('http') || my.avatar.startsWith('data:'))) {
    avatarHtml = `<img src="${my.avatar}" class="w-full h-full object-cover" />`;
  }

  const ap = store.appearance || {};
  const activeBg = ap.wallpaper || store.wallpaper;
  const isDark = ap.darkMode || false; 
  const bgStyle = activeBg ? `background-image: url('${activeBg}'); background-size: cover; background-position: center;` : `background-color: #dbeafe;`;

  const txtMain = isDark ? 'text-white drop-shadow-md' : 'text-gray-800';
  const inputBg = isDark ? 'bg-black/30 border-black/20 text-white placeholder-white/40' : 'bg-white/20 border-white/20 text-gray-800 placeholder-gray-800/40';

  const polaroidImg = store.homePolaroidImg || '';
  const polaroidHtml = `
      <div class="w-full flex justify-end transform scale-[0.85] sm:scale-90 origin-right shrink-0">
          <div class="relative w-32 h-40 cursor-pointer group active:scale-95 transition-transform" onclick="document.getElementById('home-polaroid-upload').click()">
              <div class="absolute top-1 -left-2 w-full h-full bg-white/70 rounded-sm shadow-md border border-white/40 transform -rotate-6 flex flex-col p-1.5 z-0 transition-transform group-hover:-rotate-12 duration-300">
                  <div class="w-full flex-1 bg-gray-300/30 rounded-sm"></div>
                  <div class="h-6"></div>
              </div>
              <div class="absolute top-0 right-0 w-full h-full bg-[#fdfdfd] rounded-sm shadow-xl border border-white/60 transform rotate-3 flex flex-col p-1.5 z-10 transition-transform group-hover:rotate-6 duration-300">
                  <div class="w-full flex-1 bg-gray-100 rounded-sm overflow-hidden flex items-center justify-center relative">
                      ${polaroidImg ? `<img src="${polaroidImg}" class="w-full h-full object-cover" />` : `<i data-lucide="image-plus" class="w-6 h-6 text-gray-300"></i>`}
                      <div class="absolute inset-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.1)] pointer-events-none"></div>
                  </div>
                  <div class="h-7 flex items-center justify-center"><span class="text-[9px] font-cursive text-gray-500 opacity-70 tracking-widest uppercase">Memories</span></div>
              </div>
          </div>
      </div>
  `;

  setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      if(store.apiConfig?.apiKey && store.birthday && (!store.dailyFortune || store.dailyFortune.date !== today)) {
          if(!window.homeState.isGeneratingFortune) window.homeActions.generateDailyFortune();
      }
  }, 500);

  const initPageIdx = window.homeState?.lastScrollLeft > 50 ? 1 : 0;

  return `
    <div class="w-full h-full relative flex flex-col overflow-hidden animate-in fade-in duration-300" style="${bgStyle}">
      
      <input type="file" id="upload-bg-audio" accept="audio/*, .mp3, .wav, .m4a, .aac, audio/mpeg, audio/mp4" class="hidden" onchange="window.homeActions.uploadBgAudio(event)" />
      <input type="file" id="home-avatar-upload" accept="image/*" class="hidden" onchange="window.homeActions.updateAvatar(event)" />
      <input type="file" id="home-polaroid-upload" accept="image/*" class="hidden" onchange="window.homeActions.uploadPolaroid(event)" />

      <div id="home-swiper-scroll" class="flex-1 w-full flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory hide-scrollbar relative z-10 min-h-0" onscroll="if(!window.homeState.isRestoringScroll) window.homeActions.updateDots(event)">
        
        <div class="w-full h-full flex-shrink-0 snap-center overflow-hidden flex flex-col pt-12 sm:pt-14 px-4 sm:px-5 pb-0 relative">
              
              <div class="flex flex-col w-full shrink-0">
                  <div class="flex justify-between items-end pb-1 shrink-0 ${txtMain}">
                      ${(() => {
                          if (!store.calendarData) store.calendarData = { todos: [], lastPeriod: '' };
                          const now = new Date();
                          const currentMonthEng = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()];
                          
                          const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); 
                          const monday = new Date(now); monday.setDate(now.getDate() - dayOfWeek + 1);
                          const eventsList = [];
                          const monZero = new Date(monday); monZero.setHours(0,0,0,0);
                          const sunEnd = new Date(monday); sunEnd.setDate(monday.getDate() + 6); sunEnd.setHours(23,59,59,999);

                          const activeAnniversaries = store.anniversaries || [];
                          activeAnniversaries.forEach(a => {
                              if (!a.date) return;
                              const aMonthDay = a.date.substring(5, 10); 
                              for (let i = 0; i < 7; i++) {
                                  const d = new Date(monZero); d.setDate(monZero.getDate() + i);
                                  if (aMonthDay === (String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))) {
                                      const charName = (store.contacts || []).find(c => String(c.id) === String(a.charId))?.name || 'TA';
                                      eventsList.push({ date: d.getFullYear() + '-' + aMonthDay, text: `${charName} | ${a.name}`, dotColor: "bg-orange-400" });
                                  }
                              }
                          });

                          const activeTodos = store.calendarData.todos || [];
                          activeTodos.forEach(t => {
                              const tDate = new Date(t.targetDate || t.date.split('T')[0]);
                              if (tDate >= monZero && tDate <= sunEnd) eventsList.push({ date: t.targetDate || t.date.split('T')[0], text: t.text, dotColor: "bg-purple-400" });
                          });

                          let periodText = ''; let periodDot = '';
                          if (store.calendarData.lastPeriod) {
                              const daysSince = Math.floor((new Date(now).setHours(0,0,0,0) - new Date(store.calendarData.lastPeriod).setHours(0,0,0,0)) / 86400000);
                              if (daysSince >= 0) {
                                  if (daysSince % 28 < 5) { periodText = daysSince < 28 ? '月经期中' : '预测月经期'; periodDot = daysSince < 28 ? 'bg-rose-400' : 'bg-rose-200'; }
                                  else if (28 - (daysSince % 28) <= 3) { periodText = `距预测月经 ${28 - (daysSince % 28)} 天`; periodDot = 'bg-rose-200'; }
                              }
                          }
                          if (periodText) eventsList.unshift({ date: 'general', text: periodText, dotColor: periodDot, isGeneral: true });
                          if (eventsList.length === 0) eventsList.push({ text: "本周暂无特殊安排", dotColor: "bg-gray-400", isGeneral: true });

                          window.tempEventsList = eventsList;

                          return `
                             <div class="flex justify-between items-end mb-1 w-full">
                                <div class="flex items-baseline space-x-2">
                                    <span class="font-monospace text-4xl tracking-wider opacity-90 uppercase leading-none">${currentMonthEng}</span>
                                    <span class="text-sm font-bold opacity-50 uppercase tracking-widest">${now.getFullYear()}</span>
                                </div>
                                <div class="flex space-x-3 mb-0.5">
                                    <i data-lucide="calendar-plus" class="w-[20px] h-[20px] sm:w-[22px] sm:h-[22px] cursor-pointer active:scale-90 transition-transform opacity-70 hover:opacity-100 ${isDark ? 'text-white' : 'text-gray-800'}" onclick="window.homeActions.openTodoModal()"></i>
                                    <i data-lucide="droplet" class="w-[20px] h-[20px] sm:w-[22px] sm:h-[22px] cursor-pointer active:scale-90 transition-transform opacity-70 hover:opacity-100 text-rose-400" onclick="window.homeActions.openPeriodModal()"></i>
                                </div>
                             </div>
                          `;
                      })()}
                  </div>
                  
                  <div class="grid grid-cols-7 gap-0 w-full mb-2 shrink-0 ${txtMain}">
                      ${(() => {
                          const now = new Date();
                          const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); 
                          const monday = new Date(now); monday.setDate(now.getDate() - dayOfWeek + 1);
                          return ['一', '二', '三', '四', '五', '六', '日'].map((dayName, idx) => {
                              const d = new Date(monday); d.setDate(monday.getDate() + idx);
                              const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
                              const dStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                              const dotsForDay = (window.tempEventsList || []).filter(e => !e.isGeneral && e.date === dStr);
                              const dotsHtml = dotsForDay.length > 0 ? `<div class="flex space-x-0.5 mt-0.5 h-1 justify-center z-10 relative">` + dotsForDay.map(e => `<div class="w-1 h-1 rounded-full ${e.dotColor}"></div>`).join('') + `</div>` : `<div class="mt-0.5 h-1 z-10 relative"></div>`;

                              let pType = null, isS = false, isE = false;
                              if (store.calendarData?.lastPeriod) {
                                  const diffDays = Math.floor((new Date(d).setHours(0,0,0,0) - new Date(store.calendarData.lastPeriod).setHours(0,0,0,0)) / 86400000);
                                  if (diffDays >= 0 && diffDays % 28 < 5) { pType = diffDays < 28 ? 'actual' : 'predicted'; if (diffDays % 28 === 0) isS = true; if (diffDays % 28 === 4) isE = true; }
                              }
                              let rClass = (isS && isE) ? 'rounded-md' : isS ? 'rounded-l-md' : isE ? 'rounded-r-md' : '';
                              let hHtml = pType === 'actual' ? `<div class="absolute inset-y-0 -inset-x-0 bg-rose-200/80 z-0 ${rClass}"></div>` : pType === 'predicted' ? `<div class="absolute inset-y-0 -inset-x-0 bg-rose-100/50 z-0 ${rClass}"></div>` : '';

                              return `
                              <div class="flex flex-col items-center w-full">
                                <span class="text-[9px] font-bold opacity-50 z-10 mb-1">${dayName}</span>
                                <div class="relative w-full flex flex-col items-center justify-center">
                                    ${hHtml}
                                    ${isToday ? `<div class="relative flex items-center justify-center z-10 w-full h-6"><div class="bg-white/60 border border-white/50 rounded-full w-6 h-6 flex items-center justify-center text-[12px] font-bold shadow-sm backdrop-blur-sm text-gray-900">${d.getDate()}</div></div>` : `<span class="text-[13px] font-bold opacity-80 relative z-10 h-6 flex items-center justify-center w-full">${d.getDate()}</span>`}
                                </div>
                                ${dotsHtml}
                              </div>`;
                          }).join('');
                      })()}
                  </div>

                  <div class="flex flex-row w-full shrink-0 pt-1 mb-2">
                      <div class="w-[55%] flex flex-col justify-start space-y-1.5 overflow-hidden cursor-pointer active:opacity-70 transition-opacity ${isDark ? 'text-white/90 drop-shadow-md' : 'text-gray-800/90 drop-shadow-sm'}" onclick="window.homeActions.openTodoModal()">
                          ${(window.tempEventsList || []).slice(0, 3).map(e => `
                              <div class="flex items-start space-x-2 w-full"><div class="w-1.5 h-1.5 rounded-full ${e.dotColor} shrink-0 mt-1"></div><span class="text-[11px] font-bold tracking-wide leading-snug truncate w-full pr-2">${e.text}</span></div>
                          `).join('')}
                      </div>
                      <div class="w-[45%] flex flex-col items-end justify-start">
                          <div class="w-[4rem] h-[4rem] sm:w-[4.5rem] sm:h-[4.5rem] rounded-full overflow-hidden ${isDark?'bg-black/30 border-black/20':'bg-white/30 border-white/20'} mb-1.5 cursor-pointer active:scale-95 transition-transform shadow-sm border shrink-0" onclick="document.getElementById('home-avatar-upload').click()">
                             ${avatarHtml}
                          </div>
                          <input type="text" value="${my.name}" onchange="window.homeActions.updateName(this.value)" class="font-bold ${txtMain} text-xl sm:text-2xl tracking-wide bg-transparent outline-none text-right w-full ${isDark?'placeholder-white/30':'placeholder-gray-800/40'} shrink-0" placeholder="点击编辑" />
                      </div>
                  </div>
              </div>

              <div class="flex flex-row w-full shrink-0 mt-4 sm:mt-5 mb-2">
                  <div class="w-[50%] grid grid-cols-2 grid-rows-2 gap-2 items-start justify-items-center">
                     ${createAppIcon('message-circle', '微信', "window.actions.setCurrentApp('wechat')", 'mc-icon-wechat', isDark)}
                     ${createAppIcon('messages-square', '论坛', "window.actions.setCurrentApp('forum')", 'mc-icon-forum', isDark)}
                     ${createAppIcon('infinity', 'Sync', "window.actions.setCurrentApp('blogger')", 'mc-icon-sync', isDark)}
                     ${createAppIcon('book-heart', '情侣空间', "window.actions.setCurrentApp('couple')", 'mc-icon-diary', isDark)}
                  </div>
                  <div class="w-[50%] flex items-center justify-end pl-2">
                     ${polaroidHtml}
                  </div>
              </div>

              <div class="flex flex-row w-full shrink-0 mt-3 sm:mt-4 mb-2">
                  <div class="w-[50%] flex flex-col justify-end space-y-2 pr-2">
                     <input type="text" value="正在进入..." class="w-[85%] ${inputBg} backdrop-blur-2xl px-3 py-1.5 text-[11px] font-cursive rounded-full outline-none text-center shadow-sm shrink-0" onclick="event.stopPropagation()" />
                     <input type="text" value="梦之旅途" class="w-[85%] ml-[15%] ${inputBg} backdrop-blur-2xl px-3 py-1.5 text-[11px] font-cursive rounded-full outline-none text-center shadow-sm shrink-0" onclick="event.stopPropagation()" />
                  </div>
                  <div class="w-[50%] grid grid-cols-2 gap-2 items-end justify-items-center pl-2">
                     ${createAppIcon('shopping-bag', '购物', "window.actions.setCurrentApp('shopping')", 'mc-icon-shop', isDark)}
                     ${createAppIcon('smartphone', '查手机', "window.actions.setCurrentApp('phone')", 'mc-icon-phone', isDark)}
                  </div>
              </div>
              
              <div class="flex-1 min-h-0 w-full pointer-events-none"></div>
        </div>

        <div class="w-full h-full flex-shrink-0 snap-center overflow-hidden flex flex-col pt-12 sm:pt-14 px-4 sm:px-5 pb-0 relative">
                 
                 <div id="keep-alive-status" class="w-full shrink-0 flex flex-col rounded-[28px] ${isDark?'bg-black/30':'bg-white/30'} relative z-10 p-4 backdrop-blur-md shadow-sm border ${isDark?'border-white/10':'border-white/40'} mb-4">
                      
                      ${(() => {
                          const hasTrack = list && list.length > 0;
                          const trackName = hasTrack ? window.audioPlayer.getTrackName() : "暂无音乐";
                          const artistName = hasTrack ? window.audioPlayer.getArtistName() : "上传歌词让AI陪你听歌";
                          const isPlaying = window.audioState ? window.audioState.isPlaying : false;
                          const loopMode = window.audioState ? window.audioState.loopMode : 'list';
                          const loopIcon = loopMode === 'list' ? 'repeat' : 'repeat-1';
                          const compChar = store.musicCompanionId ? store.contacts.find(c=>c.id===store.musicCompanionId) : null;
                          
                          const currentTrack = hasTrack ? list[window.audioState.currentIndex] : null;
                          const hasLyrics = currentTrack?.lyrics;
                          const isRawText = hasLyrics && Array.isArray(hasLyrics) && typeof hasLyrics[0] === 'string';
                          const lyricPlaceholder = isRawText ? '🎵 已挂载纯文本歌词' : (hasLyrics ? '🎵' : '暂无歌词数据');

                          return `
                          <div class="flex flex-col justify-center shrink-0 mb-3">
                              <div class="flex justify-between items-center w-full ${isDark?'text-white':'text-gray-800'} mb-1.5">
                                  <div class="w-10 flex items-center justify-start"><i data-lucide="plus" class="w-4 h-4 cursor-pointer opacity-60 hover:opacity-100 transition-opacity" onclick="window.homeActions.openAddAudioModal()" title="添加音乐"></i></div>
                                  <div class="flex items-center space-x-5">
                                      <i data-lucide="skip-back" class="w-3.5 h-3.5 cursor-pointer active:scale-90 transition-transform" onclick="window.homeActions.prevMusic()"></i>
                                      <div onclick="window.homeActions.togglePlay()" class="cursor-pointer active:scale-90 transition-transform">
                                          <i id="mc-audio-play-icon" data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-5 h-5 fill-current"></i>
                                      </div>
                                      <i data-lucide="skip-forward" class="w-3.5 h-3.5 cursor-pointer active:scale-90 transition-transform" onclick="window.homeActions.nextMusic()"></i>
                                  </div>
                                  <div class="w-10 flex items-center justify-end space-x-3">
                                      <i id="mc-audio-loop-icon" data-lucide="${loopIcon}" class="w-4 h-4 cursor-pointer opacity-60 hover:opacity-100 transition-opacity" onclick="window.homeActions.toggleLoop()" title="切换循环模式"></i>
                                      <i data-lucide="list-music" class="w-4 h-4 cursor-pointer opacity-60 hover:opacity-100 transition-opacity" onclick="window.homeActions.openPlaylist()" title="播放列表"></i>
                                  </div>
                              </div>
                              <div class="flex flex-col items-start w-full px-1 ${isDark?'text-white':'text-gray-900'}">
                                  <span id="mc-audio-name" class="text-[13px] sm:text-[14px] font-black tracking-wide truncate w-full font-serif">${trackName}</span>
                                  <span id="mc-audio-artist" class="text-[9px] opacity-60 truncate tracking-widest mt-0.5">${artistName}</span>
                              </div>
                          </div>

                          <div class="flex flex-col justify-center shrink-0 mb-3">
                              <div class="flex flex-col items-center justify-center w-full min-h-[14px] overflow-hidden px-1 mb-1.5">
                                  <span id="music-lyric-line" class="text-[10px] font-bold text-center w-full truncate transition-all duration-300 ${isDark?'text-white/80 drop-shadow-sm':'text-gray-600'}">${lyricPlaceholder}</span>
                              </div>
                              <div class="flex items-center w-full space-x-2 px-1">
                                  <div class="w-8 h-8 rounded-full overflow-hidden border ${isDark?'border-white/20 bg-black/40':'border-gray-200 bg-white'} flex items-center justify-center cursor-pointer shadow-sm shrink-0 active:scale-95 transition-transform" onclick="window.homeActions.openCompanionSelect()">
                                      ${compChar ? `<img src="${compChar.avatar}" class="w-full h-full object-cover grayscale-[20%]">` : `<i data-lucide="plus" class="w-4 h-4 ${isDark?'text-white/40':'text-gray-400'}"></i>`}
                                  </div>
                                  <div class="flex-1 ${isDark?'bg-[#262628] text-white':'bg-[#E9E9EB] text-gray-800'} rounded-2xl rounded-tl-[4px] px-3 py-1.5 relative shadow-sm flex items-center justify-start min-w-0">
                                      <span class="text-[10px] leading-snug font-medium ${window.homeState.isGeneratingReaction ? 'animate-pulse' : ''} line-clamp-1 sm:line-clamp-2 w-full">${store.musicReaction || (compChar ? '正在陪你听歌...' : '点击选人')}</span>
                                  </div>
                              </div>
                          </div>
                          
                          <div class="border-t ${isDark?'border-white/10':'border-gray-300/40'} pt-2 flex flex-col relative px-1 justify-center shrink-0">
                              <div class="text-[9px] font-bold opacity-40 tracking-widest uppercase mb-1.5 font-serif flex items-center justify-between ${isDark?'text-white':'text-gray-600'} shrink-0">
                                  <div class="flex items-center space-x-2">
                                      <span>Daily Fortune</span>
                                      ${store.birthday ? `<i data-lucide="edit-2" class="w-3 h-3 cursor-pointer hover:opacity-100" onclick="window.homeActions.editBirthday()" title="修改出生日期"></i>` : ''}
                                  </div>
                                  ${(store.dailyFortune && store.dailyFortune.date === new Date().toISOString().split('T')[0]) ? `<i data-lucide="refresh-cw" class="w-3 h-3 cursor-pointer hover:opacity-100 ${window.homeState.isGeneratingFortune ? 'animate-spin' : ''}" onclick="window.homeActions.generateDailyFortune()"></i>` : ''}
                              </div>
                              
                              ${!store.birthday ? `
                                  <div class="flex flex-col items-center justify-center opacity-80 z-20 py-2">
                                      <span class="text-[10px] tracking-widest font-bold mb-2 ${isDark?'text-white/60':'text-gray-500'}">设定生辰，开启星盘</span>
                                      <div class="flex items-center space-x-2">
                                          <input id="fortune-bday-input" type="date" class="bg-transparent border ${isDark?'border-white/20 text-white':'border-gray-300 text-gray-700'} rounded-lg px-2 py-1 text-[11px] outline-none shadow-sm cursor-pointer">
                                          <button onclick="window.homeActions.saveBirthday(document.getElementById('fortune-bday-input').value)" class="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm active:scale-95 transition-transform">确定</button>
                                      </div>
                                  </div>
                              ` : (store.dailyFortune && store.dailyFortune.date === new Date().toISOString().split('T')[0]) ? `
                                  <div class="flex flex-col w-full pt-0.5">
                                      <div class="text-[11px] sm:text-[12px] font-black tracking-widest text-center w-full mb-1 shrink-0 ${isDark?'text-white':'text-gray-800'}">✨ ${store.dailyFortune.sign || '专属'}运势 ✨</div>
                                      <div class="flex justify-between items-center px-2 sm:px-4 w-full shrink-0 mb-1">
                                          <div class="flex flex-col items-center space-y-0.5">
                                              <span class="text-[8px] ${isDark?'text-white/50':'text-gray-500'} font-bold">综合</span>
                                              <div class="flex space-x-[1px] text-yellow-400">${Array(5).fill(0).map((_,i)=>`<i data-lucide="star" class="w-2.5 h-2.5 ${i<store.dailyFortune.comprehensive?'fill-current':''}"></i>`).join('')}</div>
                                          </div>
                                          <div class="w-px h-3 ${isDark?'bg-white/10':'bg-gray-300/50'}"></div>
                                          <div class="flex flex-col items-center space-y-0.5">
                                              <span class="text-[8px] ${isDark?'text-white/50':'text-gray-500'} font-bold">爱情</span>
                                              <div class="flex space-x-[1px] text-rose-400">${Array(5).fill(0).map((_,i)=>`<i data-lucide="star" class="w-2.5 h-2.5 ${i<store.dailyFortune.love?'fill-current':''}"></i>`).join('')}</div>
                                          </div>
                                          <div class="w-px h-3 ${isDark?'bg-white/10':'bg-gray-300/50'}"></div>
                                          <div class="flex flex-col items-center space-y-0.5">
                                              <span class="text-[8px] ${isDark?'text-white/50':'text-gray-500'} font-bold">事业</span>
                                              <div class="flex space-x-[1px] text-blue-400">${Array(5).fill(0).map((_,i)=>`<i data-lucide="star" class="w-2.5 h-2.5 ${i<store.dailyFortune.career?'fill-current':''}"></i>`).join('')}</div>
                                          </div>
                                      </div>
                                      <p class="text-[9px] sm:text-[10px] leading-snug ${isDark?'text-white/80':'text-gray-700'} font-serif line-clamp-3 mt-1">${store.dailyFortune.text}</p>
                                  </div>
                              ` : `
                                  <div class="flex flex-col items-center justify-center opacity-60 z-20 py-3">
                                      <i data-lucide="loader" class="w-5 h-5 sm:w-6 sm:h-6 mb-1.5 animate-spin ${isDark?'text-white/60':'text-gray-400'}"></i>
                                      <span class="text-[10px] tracking-widest font-bold ${isDark?'text-white/60':'text-gray-500'}">正在为您观测今日星象...</span>
                                  </div>
                              `}
                          </div>
                          `;
                      })()}
                 </div>
                 
                 <div class="grid grid-cols-4 gap-2 w-full shrink-0 justify-items-center mt-2 mb-2">
                     ${createAppIcon('feather', 'AO3', "window.actions.setCurrentApp('ao3')", 'mc-icon-ao3', isDark)}
                     ${createAppIcon('film', '番外剧场', "window.actions.setCurrentApp('darkroom')", 'mc-icon-darkroom', isDark)}
                     ${createAppIcon('zap', '快穿系统', "window.actions.setCurrentApp('transmigrate')", 'mc-icon-transmigrate', isDark)}
                     ${createAppIcon('clapperboard', '占位', "window.actions.setCurrentApp('jubensha')", 'mc-icon-jubensha', isDark)}
                 </div>

                 <div class="flex-1 min-h-0 w-full pointer-events-none"></div>
        </div>

      </div> 
      
      <div class="h-4 w-full flex justify-center items-center space-x-2 shrink-0 z-20 pointer-events-none mb-1.5 ${isDark ? 'text-white' : 'text-gray-800'}">
         <div id="home-dot-0" class="w-1.5 h-1.5 rounded-full bg-current transition-opacity duration-300" style="opacity: ${initPageIdx === 0 ? '1' : '0.3'};"></div>
         <div id="home-dot-1" class="w-1.5 h-1.5 rounded-full bg-current transition-opacity duration-300" style="opacity: ${initPageIdx === 1 ? '1' : '0.3'};"></div>
      </div>

      <div class="w-full px-4 pb-6 sm:pb-4 z-20 shrink-0">
         <div class="w-full h-[72px] sm:h-[80px] ${isDark?'bg-black/10 border-black/10':'bg-white/10 border-white/10'} backdrop-blur-xl rounded-[24px] sm:rounded-[28px] flex justify-around items-center shadow-sm border px-2 sm:px-3">
             ${createDockIcon('book-open', '世界书', "window.actions.setCurrentApp('worldbook')", 'mc-icon-worldbook', isDark)}
             ${createDockIcon('brain', '记忆库', "window.actions.setCurrentApp('memory')", 'mc-icon-memory', isDark)}
             ${createDockIcon('palette', '外观', "window.actions.setCurrentApp('appearance')", 'mc-icon-appearance', isDark)}
             ${createDockIcon('settings', '设置', "window.actions.setCurrentApp('settings')", 'mc-icon-settings', isDark)}
         </div>
      </div>

        ${window.homeState?.showCompanionModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-end justify-center backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closeCompanionSelect()">
            <div class="bg-[#f9fafb] w-full rounded-t-[24px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 pb-safe" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <span class="font-bold text-gray-800 text-[14px] font-serif uppercase tracking-widest">选择音乐陪伴角色</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closeCompanionSelect()"></i>
                </div>
                <div class="p-5 flex flex-col space-y-3 max-h-[50vh] overflow-y-auto">
                    <div class="flex items-center p-3 bg-red-50 rounded-xl shadow-sm border border-red-100 cursor-pointer active:scale-95 transition-transform mb-1" onclick="window.homeActions.removeCompanion()">
                        <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-4 text-red-500">
                            <i data-lucide="user-x" class="w-5 h-5"></i>
                        </div>
                        <span class="font-bold text-[14px] text-red-600">独自听歌 (不再调用 AI)</span>
                    </div>

                    ${(store.contacts || []).map(c => `
                        <div class="flex items-center p-3 bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform" onclick="window.homeActions.selectCompanion('${c.id}')">
                            <img src="${c.avatar}" class="w-10 h-10 rounded-full object-cover mr-4">
                            <span class="font-bold text-[14px] text-gray-800">${c.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        ` : ''}

        ${window.homeState?.showAddAudioModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closeAddAudioModal()">
            <div class="bg-[#f6f6f6] w-full rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="music" class="w-5 h-5 mr-2 text-gray-800"></i>添加音乐</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closeAddAudioModal()"></i>
                </div>
                <div class="p-5 flex flex-col space-y-4">
                    <button onclick="window.homeActions.triggerLocalUpload()" class="w-full py-4 bg-gray-800 text-white font-bold rounded-[14px] active:scale-95 transition-transform flex items-center justify-center shadow-md"><i data-lucide="folder-up" class="w-5 h-5 mr-2"></i>从本地相册/文件导入 (极速首选)</button>
                    
                    <div class="flex items-center space-x-3 my-2 opacity-50">
                        <div class="flex-1 h-px bg-gray-400"></div>
                        <span class="text-[11px] text-gray-500 font-bold tracking-widest">或者使用 URL 直链导入</span>
                        <div class="flex-1 h-px bg-gray-400"></div>
                    </div>

                    <div class="space-y-3">
                        <input id="audio-url-input" type="text" placeholder="音频 URL (支持 http/https)" class="w-full bg-white border border-gray-200 rounded-xl p-3 outline-none text-[13px] text-gray-800 shadow-sm focus:border-gray-400 transition-colors">
                        <div class="flex space-x-3">
                            <input id="audio-name-input" type="text" placeholder="歌名 (选填)" class="w-1/2 bg-white border border-gray-200 rounded-xl p-3 outline-none text-[13px] text-gray-800 shadow-sm focus:border-gray-400 transition-colors">
                            <input id="audio-artist-input" type="text" placeholder="歌手 (选填)" class="w-1/2 bg-white border border-gray-200 rounded-xl p-3 outline-none text-[13px] text-gray-800 shadow-sm focus:border-gray-400 transition-colors">
                        </div>
                    </div>
                    
                    <div class="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3 shadow-sm mt-2">
                        <div class="flex items-center text-[12px] font-bold text-gray-600"><i data-lucide="subtitles" class="w-4 h-4 mr-2"></i>${window.homeState.tempLyrics ? '<span class="text-green-500">已解析歌词数据</span>' : '挂载 TXT/LRC 歌词'}</div>
                        <input type="file" id="audio-lyric-upload" accept=".lrc,.txt,text/plain" class="hidden" onchange="window.homeActions.uploadLyricFile(event)" />
                        <button class="bg-gray-100 px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-700 active:scale-95" onclick="document.getElementById('audio-lyric-upload').click()">${window.homeState.tempLyrics ? '重新上传' : '点击上传'}</button>
                    </div>

                    <button onclick="window.homeActions.confirmUrlAudio()" class="w-full py-3.5 bg-white border border-gray-200 text-gray-800 font-bold rounded-[14px] active:bg-gray-50 transition-colors mt-2 shadow-sm">添加网络音频</button>
                </div>
            </div>
        </div>
        ` : ''}

        ${window.homeState?.showPlaylistModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closePlaylist()">
            <div class="bg-[#f6f6f6] w-full max-h-[70vh] rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                    <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="list-music" class="w-5 h-5 mr-2 text-gray-800"></i>播放列表 (${list.length || 0})</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closePlaylist()"></i>
                </div>
                <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
                    ${list.map((track, idx) => `
                        <div class="bg-white rounded-[16px] p-3 flex items-center justify-between shadow-sm border ${window.audioState.currentIndex === idx ? 'border-gray-800 bg-gray-50' : 'border-gray-100'} cursor-pointer active:scale-[0.98] transition-all" onclick="window.homeActions.playTrackFromList(${idx})">
                            <div class="w-10 h-10 rounded-lg bg-gray-200 mr-3 overflow-hidden bg-cover bg-center shrink-0 flex items-center justify-center text-gray-400 font-bold">${idx + 1}</div>
                            <div class="flex flex-col flex-1 overflow-hidden pr-3">
                                <div class="flex items-center space-x-2">
                                    <span class="text-[14px] font-bold ${window.audioState.currentIndex === idx ? 'text-gray-900' : 'text-gray-600'} truncate">${track.name}</span>
                                    ${track.lyrics ? `<span class="bg-blue-100 text-blue-500 text-[8px] px-1 rounded-sm border border-blue-200">${Array.isArray(track.lyrics) && typeof track.lyrics[0] === 'object' ? 'LRC' : 'TXT'}</span>` : ''}
                                </div>
                                <span class="text-[11px] text-gray-400 mt-0.5 truncate">${track.artist || '未知歌手'}</span>
                            </div>
                            ${window.audioState.currentIndex === idx && window.audioState.isPlaying ? `<div class="flex space-x-1 mr-4 opacity-80"><div class="w-1 h-3 bg-gray-800 rounded-full animate-pulse"></div><div class="w-1 h-4 bg-gray-800 rounded-full animate-pulse" style="animation-delay: 0.2s"></div><div class="w-1 h-2 bg-gray-800 rounded-full animate-pulse" style="animation-delay: 0.4s"></div></div>` : ''}
                            <div class="p-2 cursor-pointer active:scale-90 opacity-30 hover:opacity-100 hover:text-red-500 transition-colors" onclick="window.homeActions.deleteTrackFromList(${idx}, event)">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </div>
                        </div>
                    `).join('')}
                    ${list.length === 0 ? `<div class="text-center py-10 text-gray-400 text-[13px] tracking-widest">列表空空如也，快去添加吧</div>` : ''}
                </div>
            </div>
        </div>
        ` : ''}
        
        ${window.homeState?.showTodoModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closeTodoModal()">
            <div class="bg-[#f9fafb] w-full rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="calendar-plus" class="w-5 h-5 mr-2 text-blue-500"></i>安排新事项</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closeTodoModal()"></i>
                </div>
                <div class="p-5 flex flex-col space-y-4">
                    <div>
                        <label class="block text-[11px] font-bold text-gray-400 mb-1 ml-1">安排在哪一天？</label>
                        <input id="todo-date-input" type="date" value="${new Date().toISOString().split('T')[0]}" class="w-80% bg-white border border-gray-200 rounded-[12px] p-3 outline-none text-[14px] text-gray-800 shadow-sm focus:border-[#ff5000] transition-colors">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-gray-400 mb-1 ml-1">事项内容</label>
                        <input id="todo-text-input" type="text" placeholder="比如：会议、考试..." class="w-full bg-white border border-gray-200 rounded-[12px] p-3 outline-none text-[14px] text-gray-800 shadow-sm focus:border-[#ff5000] transition-colors">
                    </div>
                    
                    <div class="max-h-[120px] overflow-y-auto space-y-2 hide-scrollbar">
                        ${(store.calendarData?.todos || []).map(t => `
                            <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm">
                                <div class="flex flex-col flex-1 truncate mr-2">
                                    <span class="text-[12px] font-bold text-gray-700 truncate">${t.text}</span>
                                    <span class="text-[10px] text-gray-400 mt-0.5">${t.targetDate || t.date.split('T')[0]}</span>
                                </div>
                                <i data-lucide="trash-2" class="w-4 h-4 text-rose-400 cursor-pointer active:scale-90" onclick="window.homeActions.deleteTodo(${t.id})"></i>
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="window.homeActions.saveTodo()" class="w-full py-3.5 bg-blue-400 text-white font-bold rounded-[14px] active:scale-95 transition-transform shadow-md">保存安排</button>
                </div>
            </div>
        </div>
        ` : ''}

        ${window.homeState?.showPeriodModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closePeriodModal()">
            <div class="bg-[#f9fafb] w-full rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="droplet" class="w-5 h-5 mr-2 text-rose-500"></i>月经周期管理</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closePeriodModal()"></i>
                </div>
                <div class="p-5 flex flex-col space-y-4">
                    <div>
                        <label class="block text-[12px] font-bold text-gray-600 mb-1.5 ml-1">上次月经开始日期是？</label>
                        <input id="period-date-input" type="date" value="${store.calendarData?.lastPeriod || ''}" class="w-80% bg-white border border-gray-200 rounded-[12px] p-3 outline-none text-[14px] text-gray-800 shadow-sm focus:border-rose-400 transition-colors">
                    </div>
                    <p class="text-[11px] text-gray-400 leading-relaxed px-1">记录后，系统将高亮您的预测或真实月经期，方便您直观掌握生理周期。</p>
                    <button onclick="window.homeActions.savePeriod()" class="w-full py-3.5 bg-rose-300 text-white font-bold rounded-[14px] active:scale-95 transition-transform shadow-md">更新记录</button>
                </div>
            </div>
        </div>
        ` : ''}

        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="display:none;" onload="
            const el = document.getElementById('home-swiper-scroll');
            if (el && window.homeState && window.homeState.lastScrollLeft > 10) {
                el.style.scrollSnapType = 'none';
                el.scrollLeft = window.homeState.lastScrollLeft;
                requestAnimationFrame(() => {
                    el.scrollLeft = window.homeState.lastScrollLeft;
                    setTimeout(() => { el.style.scrollSnapType = 'x mandatory'; }, 100);
                });
            }
            this.remove();
        " />
    </div>
  `;
}