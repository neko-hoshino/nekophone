// js/apps/home.js
import { store } from '../store.js';

// 初始化弹窗控制状态
if (!window.homeState) window.homeState = { showAddAudioModal: false, showPlaylistModal: false, showTodoModal: false, showPeriodModal: false };

if (!window.homeActions) {
  window.homeActions = {
    updateAvatar: (e) => {
      const file = e.target.files[0]; if(!file) return;
      window.actions.compressImage(file, (base64) => { store.personas[0].avatar = base64; window.render(); });
      e.target.value = '';
    },
    updateName: (val) => { store.personas[0].name = val; window.render(); },
    // 🌟 日历组件与月经期动作引擎
    openTodoModal: () => { window.homeState.showTodoModal = true; window.render(); },
    closeTodoModal: () => { window.homeState.showTodoModal = false; window.render(); },
    saveTodo: () => {
        const text = document.getElementById('todo-text-input').value.trim();
        const date = document.getElementById('todo-date-input').value; // 🌟 获取用户选择的日期
        if (!text) return window.actions.showToast('请输入待办内容哦');
        if (!store.calendarData) store.calendarData = { todos: [], lastPeriod: '' };
        if (!store.calendarData.todos) store.calendarData.todos = [];
        
        store.calendarData.todos.push({ 
            id: Date.now(), 
            text, 
            targetDate: date || new Date().toISOString().split('T')[0] // 默认今天
        });
        
        window.homeState.showTodoModal = false;
        if (window.render) window.render(); 
        if (window.actions.showToast) window.actions.showToast('✅ 事项已安排');
    },
    deleteTodo: (id) => {
        if(!store.calendarData || !store.calendarData.todos) return;
        store.calendarData.todos = store.calendarData.todos.filter(t => t.id !== id);
        if (window.render) window.render();
    },
    openPeriodModal: () => { window.homeState.showPeriodModal = true; window.render(); },
    closePeriodModal: () => { window.homeState.showPeriodModal = false; window.render(); },
    savePeriod: () => {
        const date = document.getElementById('period-date-input').value;
        if (!date) return window.actions.showToast('请选择日期');
        if (!store.calendarData) store.calendarData = { todos: [], lastPeriod: '' };
        store.calendarData.lastPeriod = date;
        window.homeState.showPeriodModal = false;
        if (window.render) window.render();
        if (window.actions.showToast) window.actions.showToast('🩸 月经记录已更新'); // 修正名词
    },
    
    // 音频控制基础动作
    togglePlay: () => {
        if(window.audioPlaylist && window.audioPlaylist.length === 0) return window.homeActions.openAddAudioModal();
        if (window.audioState.isPlaying) window.audioPlayer.pause(); else window.audioPlayer.play();
    },
    nextMusic: () => { if(window.audioPlayer) window.audioPlayer.next(); },
    prevMusic: () => { if(window.audioPlayer) window.audioPlayer.prev(); },
    toggleLoop: () => { if(window.audioPlayer) window.audioPlayer.toggleLoop(); },
    
    // 弹窗开关控制
    openAddAudioModal: () => { window.homeState.showAddAudioModal = true; window.render(); },
    closeAddAudioModal: () => { window.homeState.showAddAudioModal = false; window.render(); },
    openPlaylist: () => { window.homeState.showPlaylistModal = true; window.render(); },
    closePlaylist: () => { window.homeState.showPlaylistModal = false; window.render(); },

    // 加号管理
    triggerLocalUpload: () => { document.getElementById('upload-bg-audio').click(); window.homeState.showAddAudioModal = false; window.render(); },
    confirmUrlAudio: () => {
        let url = document.getElementById('audio-url-input').value.trim();
        let name = document.getElementById('audio-name-input').value.trim() || '网络音频';
        let artist = document.getElementById('audio-artist-input').value.trim() || '未知歌手';
        
        if (!url) return window.actions.showToast('请输入有效的音频直链 URL');
        if (!url.startsWith('http')) return window.actions.showToast('URL必须以 http(s) 开头');
        
        if (url.includes('raw.githubusercontent.com')) url = url.replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/').replace('/main/', '@main/').replace('/master/', '@master/');
        else if (url.includes('github.com') && url.includes('/blob/')) url = url.replace('https://github.com/', 'https://cdn.jsdelivr.net/gh/').replace('/blob/main/', '@main/').replace('/blob/master/', '@master/');

        store.customAudio = store.customAudio || []; 
        store.customAudio.push({ name: name, artist: artist, src: url });
        
        window.actions.showToast('网络音频添加成功！');
        if (window.updateAudioPlaylist) window.updateAudioPlaylist();
        window.audioState.currentIndex = store.customAudio.length - 1; 
        window.audioPlayer.loadAndPlay();
        window.homeState.showAddAudioModal = false; window.render();
    },

    // 本地上传管理
    uploadBgAudio: (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 15 * 1024 * 1024) return window.actions.showToast('音频太大啦，请选择 15MB 以内的音乐！'); 
        window.actions.showToast('正在解析，请稍候...');
        const reader = new FileReader();
        reader.onload = (event) => {
            const resultStr = event.target.result;
            if (!resultStr) return window.actions.showToast('读取失败，文件可能已损坏');
            store.customAudio = store.customAudio || [];
            store.customAudio.push({ name: file.name.replace(/\.[^/.]+$/, ""), artist: '本地导入', src: resultStr });
            window.actions.showToast('本地音乐导入成功！');
            if (window.updateAudioPlaylist) window.updateAudioPlaylist(); 
            window.audioState.currentIndex = store.customAudio.length - 1; 
            window.audioPlayer.loadAndPlay();
        };
        reader.onerror = () => window.actions.showToast('音频读取发生错误！');
        reader.readAsDataURL(file); e.target.value = '';
    },
    
    // 播放列表管理
    playTrackFromList: (idx) => {
        window.audioState.currentIndex = idx;
        window.audioPlayer.loadAndPlay();
        window.render();
    },
    deleteTrackFromList: (idx, e) => {
        e.stopPropagation();
        if (!confirm('确定删除这首音乐吗？')) return;
        store.customAudio.splice(idx, 1);
        if (window.updateAudioPlaylist) window.updateAudioPlaylist();
        
        if (window.audioPlaylist.length === 0) {
            window.audioState.isPlaying = false;
            window.audioPlayer.loadAndPlay();
        } else {
            if (window.audioState.currentIndex >= window.audioPlaylist.length) window.audioState.currentIndex = 0;
            window.audioPlayer.loadAndPlay();
        }
        window.render();
    },
    
    // 动态小圆点计算引擎
    updateDots: (e) => {
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

function createAppIcon(iconName, label, actionStr, mcClass, isDark) {
  const bgClass = isDark ? 'bg-black/50 border-black/20' : 'bg-white/50 border-white/20';
  const iconClass = isDark ? 'text-white opacity-90' : 'text-gray-900 opacity-60';
  const textClass = isDark ? 'text-white drop-shadow-md' : 'text-gray-800 opacity-80';

  return `
    <div class="flex flex-col items-center justify-center space-y-2 cursor-pointer group" onclick="${actionStr}">
      <div class="${mcClass} w-[4.25rem] h-[4.25rem] flex items-center justify-center ${bgClass} rounded-[20px] group-active:scale-95 transition-transform duration-200 shadow-sm border">
        <i data-lucide="${iconName}" class="${iconClass}" style="width: 32px; height: 32px;"></i>
      </div>
      <span class="${textClass} text-[12px] font-bold tracking-wider">${label}</span>
    </div>
  `;
}

function createDockIcon(iconName, label, actionStr, mcClass, isDark) {
  const bgClass = isDark ? 'bg-black/30 border-black/20' : 'bg-white/30 border-white/20';
  const iconClass = isDark ? 'text-white opacity-90' : 'text-gray-900 opacity-60';
  const textClass = isDark ? 'text-white drop-shadow-md' : 'text-gray-800 opacity-80';

  return `
    <div class="flex flex-col items-center justify-center cursor-pointer group active:scale-95 transition-transform" onclick="${actionStr}">
      <div class="${mcClass} flex items-center justify-center w-[3.5rem] h-[3.5rem] ${bgClass} rounded-[16px] mb-1.5 shadow-sm border">
        <i data-lucide="${iconName}" class="${iconClass} group-active:opacity-100 transition-opacity" style="width: 26px; height: 26px;"></i>
      </div>
      <span class="${textClass} text-[10px] font-bold tracking-widest">${label}</span>
    </div>
  `;
}

export function renderHomeApp(store) {
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
  const txtSub = isDark ? 'text-white/70' : 'text-gray-500';
  const inputBg = isDark ? 'bg-black/30 border-black/20 text-white placeholder-white/40' : 'bg-white/20 border-white/20 text-gray-800 placeholder-gray-800/40';

  return `
    <div class="w-full h-full relative flex flex-col overflow-hidden animate-in fade-in duration-300" style="${bgStyle}">
      <input type="file" id="home-avatar-upload" accept="image/*" class="hidden" onchange="window.homeActions.updateAvatar(event)" />

      <div id="home-swiper-scroll" class="flex-1 w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar" onscroll="window.homeActions.updateDots(event)">
        
        <div class="w-full h-full flex-shrink-0 snap-center flex flex-col pt-12 px-5 pb-4 overflow-y-auto hide-scrollbar relative">
          
          ${(() => {
              if (!store.calendarData) store.calendarData = { todos: [], lastPeriod: '' };
              const now = new Date();
              const currentMonth = now.getMonth() + 1;
              const currentYear = now.getFullYear();
              const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              const currentMonthEng = monthNames[now.getMonth()];
              
              const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); 
              const monday = new Date(now);
              monday.setDate(now.getDate() - dayOfWeek + 1);
              
              const eventsList = [];
              
              // 统一将本周的周一和周日界限算准，避免时分秒导致的跨天漏算
              const monZero = new Date(monday); monZero.setHours(0,0,0,0);
              const sunEnd = new Date(monday); sunEnd.setDate(monday.getDate() + 6); sunEnd.setHours(23,59,59,999);

              // 🌟 1. 真实纪念日联动 (支持每年同月同日自动匹配！)
              const activeAnniversaries = store.anniversaries || [];
              activeAnniversaries.forEach(a => {
                  if (!a.date) return;
                  const aMonthDay = a.date.substring(5, 10); // 取出 MM-DD
                  
                  // 遍历本周的每一天，看有没有对得上的日子
                  for (let i = 0; i < 7; i++) {
                      const d = new Date(monZero);
                      d.setDate(monZero.getDate() + i);
                      const dMonthDay = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                      
                      if (aMonthDay === dMonthDay) {
                          const char = (store.contacts || []).find(c => String(c.id) === String(a.charId));
                          const charName = char ? char.name : 'TA';
                          const dStr = d.getFullYear() + '-' + dMonthDay;
                          // 插入到事件池：角色名 | 纪念日名称
                          eventsList.push({ date: dStr, text: `${charName} | ${a.name}`, dotColor: "bg-orange-400" });
                      }
                  }
              });

              // 🌟 2. 真实待办事项
              const activeTodos = store.calendarData.todos || [];
              activeTodos.forEach(t => {
                  const tDateStr = t.targetDate || t.date.split('T')[0];
                  const tDate = new Date(tDateStr);
                  
                  if (tDate >= monZero && tDate <= sunEnd) {
                      eventsList.push({ date: tDateStr, text: t.text, dotColor: "bg-purple-400" });
                  }
              });

              // 月经期状态计算 (无emoji纯净版)
              let periodText = '';
              let periodDot = '';
              if (store.calendarData.lastPeriod) {
                  const lastP = new Date(store.calendarData.lastPeriod); lastP.setHours(0,0,0,0);
                  const todayZero = new Date(now); todayZero.setHours(0,0,0,0);
                  const daysSince = Math.floor((todayZero - lastP) / (1000 * 60 * 60 * 24));
                  if (daysSince >= 0) {
                      const cycleDay = daysSince % 28;
                      const daysToNext = 28 - cycleDay;
                      if (cycleDay < 5) {
                          periodText = daysSince < 28 ? '月经期中，注意保暖' : '预测月经期，注意身体';
                          periodDot = daysSince < 28 ? 'bg-rose-400' : 'bg-rose-200';
                      } else if (daysToNext <= 3) {
                          periodText = `距预测月经期约 ${daysToNext} 天`;
                          periodDot = 'bg-rose-200';
                      }
                  }
              }
              if (periodText) eventsList.unshift({ date: 'general', text: periodText, dotColor: periodDot, isGeneral: true });
              if (eventsList.length === 0) eventsList.push({ text: "本周暂无特殊安排", dotColor: "bg-gray-400", isGeneral: true });

              const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
              const weekHtml = weekDays.map((dayName, idx) => {
                  const d = new Date(monday);
                  d.setDate(monday.getDate() + idx);
                  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
                  const dateNum = d.getDate();
                  const dStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

                  let periodType = null;
                  let isStart = false; let isEnd = false;
                  if (store.calendarData.lastPeriod) {
                      const lastP = new Date(store.calendarData.lastPeriod); lastP.setHours(0,0,0,0);
                      const currentD = new Date(d); currentD.setHours(0,0,0,0);
                      const diffDays = Math.floor((currentD - lastP) / (1000 * 60 * 60 * 24));
                      if (diffDays >= 0) {
                          const cycleDay = diffDays % 28;
                          if (cycleDay >= 0 && cycleDay < 5) {
                              periodType = diffDays < 28 ? 'actual' : 'predicted';
                              if (cycleDay === 0) isStart = true;
                              if (cycleDay === 4) isEnd = true;
                          }
                      }
                  }

                  let radiusClass = '';
                  if (isStart && isEnd) radiusClass = 'rounded-md';
                  else if (isStart) radiusClass = 'rounded-l-md';
                  else if (isEnd) radiusClass = 'rounded-r-md';
                  
                  // 🌟 修复：荧光笔高亮只包裹内部，不再延伸到星期几和小圆点！
                  let highlightHtml = '';
                  if (periodType === 'actual') highlightHtml = `<div class="absolute inset-y-0 -inset-x-0 bg-rose-200/80 z-0 ${radiusClass}"></div>`;
                  else if (periodType === 'predicted') highlightHtml = `<div class="absolute inset-y-0 -inset-x-0 bg-rose-100/50 z-0 ${radiusClass}"></div>`;

                  const dotsForDay = eventsList.filter(e => !e.isGeneral && e.date === dStr);
                  // 🌟 修复：减小 mt 的数值，让点离数字更近
                  const dotsHtml = dotsForDay.length > 0 
                      ? `<div class="flex space-x-0.5 mt-0.5 h-1 justify-center z-10 relative">` + dotsForDay.map(e => `<div class="w-1 h-1 rounded-full ${e.dotColor}"></div>`).join('') + `</div>`
                      : `<div class="mt-0.5 h-1 z-10 relative"></div>`;

                  let dateDisplay = '';
                  if (isToday) {
                      dateDisplay = `
                      <div class="relative flex items-center justify-center z-10 w-full h-7">
                          <div class="bg-white/60 border border-white/50 rounded-full w-7 h-7 flex items-center justify-center text-[14px] font-bold shadow-sm backdrop-blur-sm text-gray-900">${dateNum}</div>
                      </div>`;
                  } else {
                      dateDisplay = `<span class="text-[14px] font-bold opacity-80 relative z-10 h-7 flex items-center justify-center w-full">${dateNum}</span>`;
                  }

                  return `
                  <div class="flex flex-col items-center py-1 w-full">
                    <span class="text-[10px] font-bold opacity-50 z-10 mb-1">${dayName}</span>
                    <div class="relative w-full flex flex-col items-center justify-center">
                        ${highlightHtml}
                        ${dateDisplay}
                    </div>
                    ${dotsHtml}
                  </div>`;
              }).join('');

              // 🌟 修复：紧凑行距的一行一条事件列表
              const eventsHtml = eventsList.map(e => `
                  <div class="flex items-start space-x-2">
                      <div class="w-1.5 h-1.5 rounded-full ${e.dotColor} shrink-0 mt-1"></div>
                      <span class="text-[11px] font-bold tracking-wide leading-snug line-clamp-2">${e.text}</span>
                  </div>
              `).join('');

              // 将生成的内容返回给全局，用于分离排版
              return `
              <div class="w-full pt-2 shrink-0 ${txtMain}">
                 <div class="flex justify-between items-end mb-3 px-1">
                    <div class="flex items-baseline space-x-2">
                        <span class="font-extrabold text-4xl tracking-wider opacity-90">${currentMonth}月</span>
                        <span class="text-xs font-bold opacity-50 uppercase tracking-widest">${currentMonthEng} ${currentYear}</span>
                    </div>
                    <div class="flex space-x-3 mb-1">
                        <i data-lucide="calendar-plus" class="w-[22px] h-[22px] cursor-pointer active:scale-90 transition-transform opacity-70 hover:opacity-100 ${isDark ? 'text-white' : 'text-gray-800'}" onclick="window.homeActions.openTodoModal()" title="记事项"></i>
                        <i data-lucide="droplet" class="w-[22px] h-[22px] cursor-pointer active:scale-90 transition-transform opacity-70 hover:opacity-100 text-rose-400" onclick="window.homeActions.openPeriodModal()" title="月经记录"></i>
                    </div>
                 </div>
                 
                 <div class="grid grid-cols-7 gap-0 px-1 mb-0">
                   ${weekHtml}
                 </div>
              </div>

              <div class="flex-1 grid grid-cols-2 gap-3 mt-1.5">
                 
                 <div class="flex flex-col h-full min-w-0">
                    <div class="px-1 pt-0.5 pb-2 flex flex-col space-y-1 overflow-hidden cursor-pointer active:opacity-70 transition-opacity ${isDark ? 'text-white/90 drop-shadow-md' : 'text-gray-800/90 drop-shadow-sm'}" onclick="window.homeActions.openTodoModal()">
                        ${eventsHtml}
                    </div>
                    
                    <div class="flex-1"></div> 
                    <div class="grid grid-cols-2 gap-y-4 gap-x-4 pb-24 mt-2">
                       ${createAppIcon('message-circle', '微信', "window.actions.setCurrentApp('wechat')", 'mc-icon-wechat', isDark)}
                       ${createAppIcon('messages-square', '论坛', "window.actions.setCurrentApp('forum')", 'mc-icon-forum', isDark)}
                       ${createAppIcon('twitter', 'X', "window.actions.showToast('打开X')", 'mc-icon-x', isDark)}
                       ${createAppIcon('book-heart', '情侣空间', "window.actions.setCurrentApp('couple')", 'mc-icon-diary', isDark)}
                    </div>
                 </div>

                 <div class="flex flex-col pt-2 h-full min-w-0">
                    <div class="flex flex-col items-end text-right shrink-0">
                       <div class="w-[4.5rem] h-[4.5rem] rounded-full overflow-hidden ${isDark?'bg-black/30 border-black/20':'bg-white/30 border-white/20'} mb-3 cursor-pointer active:scale-95 transition-transform shadow-sm border" onclick="document.getElementById('home-avatar-upload').click()">
                         ${avatarHtml}
                       </div>
                       <input type="text" value="${my.name}" onchange="window.homeActions.updateName(this.value)" class="font-medium ${txtMain} text-2xl tracking-wide bg-transparent outline-none text-right w-full ${isDark?'placeholder-white/30':'placeholder-gray-800/40'}" placeholder="点击编辑" />
                    </div>
                    <div class="flex flex-col items-end space-y-4 mt-2 w-full shrink-0">
                       <input type="text" value="正在进入..." class="w-[70%] ${inputBg} backdrop-blur-md px-3 py-1 text-[11px] font-serif rounded-full outline-none text-right shadow-sm border" onclick="event.stopPropagation()" />
                       <input type="text" value="梦之旅途" class="w-[80%] mr-[20%] ${inputBg} backdrop-blur-md px-3 py-1 text-[11px] font-serif rounded-full outline-none text-center shadow-sm border" onclick="event.stopPropagation()" />
                    </div>
                    <div class="flex-1"></div> 

                    <div class="flex justify-end space-x-4 pb-0 mt-4 animate-in fade-in duration-500">
                       ${createAppIcon('shopping-bag', '购物', "window.actions.setCurrentApp('shopping')", 'mc-icon-shop', isDark)}
                       ${createAppIcon('smartphone', '查手机', "window.actions.setCurrentApp('phone')", 'mc-icon-phone', isDark)}
                    </div>
                 </div>
              </div>
              `;
          })()}

        </div>

        <div class="w-full h-full flex-shrink-0 snap-center flex flex-col pt-12 px-5 pb-4 relative justify-end">
              <div id="keep-alive-status" class="flex flex-row items-center justify-between py-4 px-5 rounded-[24px] border relative ${isDark?'bg-black/10 border-white/5':'bg-white/40 border-white/10 shadow-lg'} mb-6 relative z-10 font-serif leading-relaxed">
                 
                 <div class="absolute top-4 right-4 z-10 p-1 cursor-pointer active:scale-90 transition-transform opacity-80" onclick="window.homeActions.openAddAudioModal()" title="添加音乐">
                     <i data-lucide="plus" class="w-5 h-5 text-green-500 drop-shadow-sm"></i>
                 </div>

                 ${(() => {
                    const hasTrack = window.audioPlaylist && window.audioPlaylist.length > 0;
                    const trackName = hasTrack ? window.audioPlayer.getTrackName() : "暂无音乐";
                    const artistName = hasTrack ? window.audioPlayer.getArtistName() : "请点击右上角 + 添加音乐";
                    const isPlaying = window.audioState ? window.audioState.isPlaying : false;
                    const loopMode = window.audioState ? window.audioState.loopMode : 'list';
                    const loopIcon = loopMode === 'list' ? 'repeat' : 'repeat-1';
                    const isSilent = trackName.includes('静音');
                    
                    return `
                    <div id="mc-audio-record" class="w-[84px] h-[84px] rounded-full bg-[#1a1a1a] shadow-[0_5px_15px_rgba(0,0,0,0.3)] flex items-center justify-center relative overflow-hidden flex-shrink-0 animate-spin ${!isPlaying ? '[animation-play-state:paused]' : ''}" style="animation-duration: 8s;">
                        <div class="absolute inset-1 rounded-full border-[6px] border-[#222]"></div>
                        <div class="absolute inset-2 rounded-full border-[2px] border-[#333]"></div>
                        <div class="absolute inset-3 rounded-full border-[2px] border-[#222]"></div>
                        <div id="mc-audio-cover" class="w-[50px] h-[50px] rounded-full bg-gray-700 bg-cover bg-center overflow-hidden" style="background-image: url('${!hasTrack ? 'https://api.dicebear.com/7.x/shapes/svg?seed=empty' : (isSilent ? 'https://api.dicebear.com/7.x/shapes/svg?seed=silent' : 'https://api.dicebear.com/7.x/shapes/svg?seed='+encodeURIComponent(trackName))}')"></div>
                        <div class="absolute w-3 h-3 bg-[#111] rounded-full border border-black shadow-inner"></div>
                    </div>

                    <div class="flex-1 ml-5 flex flex-col justify-between pt-1">
                       <div class="flex flex-col pr-6">
                          <span id="mc-audio-name" class="text-[17px] font-bold tracking-wide truncate mb-0.5">${trackName}</span>
                          <span id="mc-audio-artist" class="text-[12px] opacity-60 truncate">${artistName}</span>
                       </div>

                       <div class="flex items-center mt-3 mb-1 relative">
                          <i data-lucide="skip-back" class="w-5 h-5 cursor-pointer active:scale-90 fill-current opacity-90 transition-transform" onclick="window.homeActions.prevMusic()"></i>
                          
                          <div onclick="window.homeActions.togglePlay()" class="cursor-pointer active:scale-90 transition-transform mx-5">
                             <i id="mc-audio-play-icon" data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-6 h-6 fill-current"></i>
                          </div>
                          
                          <i data-lucide="skip-forward" class="w-5 h-5 cursor-pointer active:scale-90 fill-current opacity-90 transition-transform" onclick="window.homeActions.nextMusic()"></i>
                          
                          <div class="absolute right-0 flex items-center space-x-3">
                             <i id="mc-audio-loop-icon" data-lucide="${loopIcon}" class="w-4 h-4 cursor-pointer active:scale-90 opacity-70 transition-opacity hover:opacity-100" onclick="window.homeActions.toggleLoop()" title="切换循环模式"></i>
                             <i data-lucide="list-music" class="w-4 h-4 cursor-pointer active:scale-90 opacity-70 transition-opacity hover:opacity-100" onclick="window.homeActions.openPlaylist()" title="播放列表"></i>
                          </div>
                       </div>
                    </div>
                    `;
                 })()}
              </div>
              
              <input type="file" id="upload-bg-audio" accept=".mp3,.wav,.m4a,audio/*" class="hidden" onchange="window.homeActions.uploadBgAudio(event)" />
        </div>

      </div> <div class="flex justify-center items-center space-x-2 mb-2 pb-4 mt-2 ${isDark ? 'text-white' : 'text-gray-800'} shrink-0 z-20 pointer-events-none">
         <div id="home-dot-0" class="w-1.5 h-1.5 rounded-full bg-current transition-opacity duration-300" style="opacity: 1;"></div>
         <div id="home-dot-1" class="w-1.5 h-1.5 rounded-full bg-current transition-opacity duration-300" style="opacity: 0.3;"></div>
      </div>

      <div class="mx-4 mb-6 px-3 py-3 ${isDark?'bg-black/10 border-black/10':'bg-white/10 border-white/10'} backdrop-blur-xl rounded-[28px] flex justify-between items-center shadow-sm border shrink-0 z-20">
         ${createDockIcon('book-open', '世界书', "window.actions.setCurrentApp('worldbook')", 'mc-icon-worldbook', isDark)}
         ${createDockIcon('brain', '记忆库', "window.actions.setCurrentApp('memory')", 'mc-icon-memory', isDark)}
         ${createDockIcon('palette', '外观', "window.actions.setCurrentApp('appearance')", 'mc-icon-appearance', isDark)}
         ${createDockIcon('settings', '设置', "window.actions.setCurrentApp('settings')", 'mc-icon-settings', isDark)}
      </div>

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
                    
                    <button onclick="window.homeActions.confirmUrlAudio()" class="w-full py-3.5 bg-white border border-gray-200 text-gray-800 font-bold rounded-[14px] active:bg-gray-50 transition-colors mt-2 shadow-sm">添加网络音频</button>
                </div>
            </div>
        </div>
        ` : ''}

        ${window.homeState?.showPlaylistModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closePlaylist()">
            <div class="bg-[#f6f6f6] w-full max-h-[70vh] rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                    <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="list-music" class="w-5 h-5 mr-2 text-gray-800"></i>播放列表 (${window.audioPlaylist?.length || 0})</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closePlaylist()"></i>
                </div>
                <div class="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
                    ${(window.audioPlaylist || []).map((track, idx) => `
                        <div class="bg-white rounded-[16px] p-3 flex items-center justify-between shadow-sm border ${window.audioState.currentIndex === idx ? 'border-gray-800 bg-gray-50' : 'border-gray-100'} cursor-pointer active:scale-[0.98] transition-all" onclick="window.homeActions.playTrackFromList(${idx})">
                            <div class="w-10 h-10 rounded-lg bg-gray-200 mr-3 overflow-hidden bg-cover bg-center shrink-0" style="background-image: url('${track.name.includes('静音') ? 'https://api.dicebear.com/7.x/shapes/svg?seed=silent' : 'https://api.dicebear.com/7.x/shapes/svg?seed='+encodeURIComponent(track.name)}')"></div>
                            <div class="flex flex-col flex-1 overflow-hidden pr-3">
                                <span class="text-[14px] font-bold ${window.audioState.currentIndex === idx ? 'text-gray-900' : 'text-gray-600'} truncate">${track.name}</span>
                                <span class="text-[11px] text-gray-400 mt-0.5 truncate">${track.artist || '未知歌手'}</span>
                            </div>
                            ${window.audioState.currentIndex === idx && window.audioState.isPlaying ? `<div class="flex space-x-1 mr-4 opacity-80"><div class="w-1 h-3 bg-gray-800 rounded-full animate-pulse"></div><div class="w-1 h-4 bg-gray-800 rounded-full animate-pulse" style="animation-delay: 0.2s"></div><div class="w-1 h-2 bg-gray-800 rounded-full animate-pulse" style="animation-delay: 0.4s"></div></div>` : ''}
                            <div class="p-2 cursor-pointer active:scale-90 opacity-30 hover:opacity-100 hover:text-red-500 transition-colors" onclick="window.homeActions.deleteTrackFromList(${idx}, event)">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </div>
                        </div>
                    `).join('')}
                    ${(!window.audioPlaylist || window.audioPlaylist.length === 0) ? `<div class="text-center py-10 text-gray-400 text-[13px] tracking-widest">列表空空如也，快去添加吧</div>` : ''}
                </div>
            </div>
        </div>
        ` : ''}
        ${window.homeState?.showTodoModal ? `
        <div class="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-5 backdrop-blur-sm animate-in fade-in" onclick="window.homeActions.closeTodoModal()">
            <div class="bg-[#f9fafb] w-full rounded-[24px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onclick="event.stopPropagation()">
                <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <span class="font-bold text-gray-800 text-[16px] flex items-center"><i data-lucide="calendar-plus" class="w-5 h-5 mr-2 text-[#ff5000]"></i>安排新事项</span>
                    <i data-lucide="x" class="w-5 h-5 text-gray-400 cursor-pointer active:scale-90 bg-gray-50 p-1 rounded-full" onclick="window.homeActions.closeTodoModal()"></i>
                </div>
                <div class="p-5 flex flex-col space-y-4">
                    <div>
                        <label class="block text-[11px] font-bold text-gray-400 mb-1 ml-1">安排在哪一天？</label>
                        <input id="todo-date-input" type="date" value="${new Date().toISOString().split('T')[0]}" class="w-full bg-white border border-gray-200 rounded-[12px] p-3 outline-none text-[14px] text-gray-800 shadow-sm focus:border-[#ff5000] transition-colors">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-gray-400 mb-1 ml-1">事项内容</label>
                        <input id="todo-text-input" type="text" placeholder="比如：纪念日、全栈开发..." class="w-full bg-white border border-gray-200 rounded-[12px] p-3 outline-none text-[14px] text-gray-800 shadow-sm focus:border-[#ff5000] transition-colors">
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
                    <button onclick="window.homeActions.saveTodo()" class="w-full py-3.5 bg-gradient-to-r from-[#ff9000] to-[#ff5000] text-white font-bold rounded-[14px] active:scale-95 transition-transform shadow-md">保存安排</button>
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
                        <input id="period-date-input" type="date" value="${store.calendarData?.lastPeriod || ''}" class="w-full bg-white border border-gray-200 rounded-[12px] p-3 outline-none text-[14px] text-gray-800 shadow-sm focus:border-rose-400 transition-colors">
                    </div>
                    <p class="text-[11px] text-gray-400 leading-relaxed px-1">记录后，系统将使用粉色荧光带连续高亮您的预测或真实月经期，方便您直观掌握生理周期。</p>
                    <button onclick="window.homeActions.savePeriod()" class="w-full py-3.5 bg-rose-500 text-white font-bold rounded-[14px] active:scale-95 transition-transform shadow-md">更新记录</button>
                </div>
            </div>
        </div>
        ` : ''}

    </div>
  `;
}