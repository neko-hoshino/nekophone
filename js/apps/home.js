// js/apps/home.js
import { store } from '../store.js';

if (!window.homeActions) {
  window.homeActions = {
    updateAvatar: (e) => {
      const file = e.target.files[0]; if(!file) return;
      const r = new FileReader(); r.onload = (ev) => { store.personas[0].avatar = ev.target.result; window.render(); }; r.readAsDataURL(file); e.target.value = '';
    },
    updateName: (val) => { store.personas[0].name = val || 'Eve'; window.render(); },
    
    // 🌟 音频控制：因为已经在 main.js 解锁过了，这里必定成功！
    playMusic: () => {
      if (window.keepAliveAudio) {
        window.keepAliveAudio.play().then(() => window.render()).catch(e => window.actions.showToast('请先在屏幕空白处点一下再播放！'));
      }
    },
    pauseMusic: () => { if (window.keepAliveAudio) { window.keepAliveAudio.pause(); window.render(); } },
    
    // 🌟 动态小圆点计算引擎
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

      <div class="flex-1 w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar" onscroll="window.homeActions.updateDots(event)">
        
        <div class="w-full h-full flex-shrink-0 snap-center flex flex-col pt-12 px-5 pb-4 overflow-y-auto hide-scrollbar relative">
          <div class="w-full pt-2 shrink-0 ${txtMain}">
             <div class="flex justify-between items-end mb-4 px-1">
                <div class="flex items-baseline space-x-2"><span class="font-extrabold text-4xl tracking-wider opacity-90">12月</span><span class="text-xs font-bold opacity-50 uppercase tracking-widest">Dec 2026</span></div>
             </div>
             
             <div class="flex justify-between items-center px-1 mb-3">
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">日</span><span class="text-[14px] font-bold opacity-70">13</span></div>
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">一</span><span class="text-[14px] font-bold opacity-70">14</span></div>
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">二</span><div class="${isDark ? 'bg-white text-black' : 'bg-white/30 text-gray-900 border-white/20'} border rounded-full w-7 h-7 flex items-center justify-center text-[14px] font-bold shadow-sm">15</div></div>
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">三</span><span class="text-[14px] font-bold opacity-70">16</span></div>
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">四</span><span class="text-[14px] font-bold opacity-70">17</span></div>
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">五</span><span class="text-[14px] font-bold opacity-70">18</span></div>
               <div class="flex flex-col items-center space-y-2"><span class="text-[10px] font-bold opacity-50">六</span><span class="text-[14px] font-bold opacity-70">19</span></div>
             </div>
          </div>

          <div class="flex-1 grid grid-cols-2 gap-3 mt-4">
             <div class="flex flex-col h-full">
                <div class="flex-1"></div> 
                <div class="grid grid-cols-2 gap-y-4 gap-x-4 pb-16 mt-4">
                   ${createAppIcon('message-circle', '微信', "window.actions.setCurrentApp('wechat')", 'mc-icon-wechat', isDark)}
                   ${createAppIcon('messages-square', '论坛', "window.actions.showToast('打开论坛')", 'mc-icon-forum', isDark)}
                   ${createAppIcon('twitter', 'X', "window.actions.showToast('打开 X')", 'mc-icon-x', isDark)}
                   ${createAppIcon('book-heart', '恋爱日记', "window.actions.showToast('打开恋爱日记')", 'mc-icon-diary', isDark)}
                </div>
             </div>

             <div class="flex flex-col pt-2 h-full">
                <div class="flex flex-col items-end text-right shrink-0">
                   <div class="w-[4.5rem] h-[4.5rem] rounded-full overflow-hidden ${isDark?'bg-black/30 border-black/20':'bg-white/30 border-white/20'} mb-3 cursor-pointer active:scale-95 transition-transform shadow-sm border" onclick="document.getElementById('home-avatar-upload').click()">
                     ${avatarHtml}
                   </div>
                   <input type="text" value="${my.name}" onchange="window.homeActions.updateName(this.value)" class="font-medium ${txtMain} text-2xl tracking-wide bg-transparent outline-none text-right w-full ${isDark?'placeholder-white/30':'placeholder-gray-800/40'}" placeholder="你的名字" />
                </div>
                <div class="flex flex-col items-end space-y-4 mt-2 w-full shrink-0">
                   <input type="text" value="正在构建AI世界..." class="w-[70%] ${inputBg} backdrop-blur-md px-3 py-2.5 text-[11px] font-serif rounded-full outline-none text-right shadow-sm border" onclick="event.stopPropagation()" />
                   <input type="text" value="向左滑动查看音乐" class="w-[80%] mr-[20%] ${inputBg} backdrop-blur-md px-3 py-2.5 text-[11px] font-serif rounded-full outline-none text-center shadow-sm border" onclick="event.stopPropagation()" />
                </div>
                <div class="flex-1"></div> 
             </div>
          </div>
        </div>

        <div class="w-full h-full flex-shrink-0 snap-center flex flex-col pt-12 px-5 pb-4 relative justify-end">
           <div class="w-full ${isDark?'bg-black/40 border-black/20':'bg-white/40 border-white/20'} backdrop-blur-2xl rounded-[32px] shadow-lg border p-6 mb-8 flex flex-col items-center">
              <div class="flex items-center space-x-2 mb-6 ${txtSub}">
                 <i data-lucide="music" class="w-4 h-4"></i>
                 <span class="text-[10px] font-bold tracking-widest uppercase">Background Engine</span>
              </div>
              
              <div class="w-28 h-28 rounded-full border-4 ${isDark?'border-white/10':'border-white/40'} shadow-2xl flex items-center justify-center relative overflow-hidden bg-gray-900 animate-spin ${window.keepAliveAudio?.paused !== false ? '[animation-play-state:paused]' : ''}" style="animation-duration: 4s;">
                 <img src="icon-192x192.png" class="w-full h-full object-cover opacity-70 scale-110" />
                 <div class="absolute w-6 h-6 bg-white/80 backdrop-blur-md rounded-full border border-gray-300 shadow-inner"></div>
              </div>
              
              <span class="mt-5 text-[16px] font-bold ${txtMain}">无声音频保活</span>
              <span class="text-[11px] ${txtSub} mt-1 mb-6">Silent_Audio.mp3</span>
              
              <div class="flex items-center space-x-8">
                 <i data-lucide="skip-back" class="w-5 h-5 opacity-30 ${txtMain}"></i>
                 ${window.keepAliveAudio?.paused !== false 
                   ? `<div class="w-14 h-14 rounded-full ${isDark?'bg-white text-black':'bg-gray-800 text-white'} flex items-center justify-center cursor-pointer active:scale-95 shadow-xl transition-transform" onclick="window.homeActions.playMusic()"><i data-lucide="play" class="w-6 h-6 ml-1"></i></div>`
                   : `<div class="w-14 h-14 rounded-full ${isDark?'bg-white text-black':'bg-gray-800 text-white'} flex items-center justify-center cursor-pointer active:scale-95 shadow-xl transition-transform" onclick="window.homeActions.pauseMusic()"><i data-lucide="pause" class="w-6 h-6"></i></div>`
                 }
                 <i data-lucide="skip-forward" class="w-5 h-5 opacity-30 ${txtMain}"></i>
              </div>
           </div>
        </div>

      </div> <div class="flex justify-center items-center space-x-2 mb-2 pb-4 mt-2 ${isDark ? 'text-white' : 'text-gray-800'} shrink-0 z-20 pointer-events-none">
         <div id="home-dot-0" class="w-1.5 h-1.5 rounded-full bg-current transition-opacity duration-300" style="opacity: 1;"></div>
         <div id="home-dot-1" class="w-1.5 h-1.5 rounded-full bg-current transition-opacity duration-300" style="opacity: 0.3;"></div>
      </div>

      <div class="mx-4 mb-6 px-3 py-3 ${isDark?'bg-black/10 border-black/10':'bg-white/10 border-white/20'} backdrop-blur-xl rounded-[28px] flex justify-between items-center shadow-sm border shrink-0 z-20">
         ${createDockIcon('book-open', '世界书', "window.actions.setCurrentApp('worldbook')", 'mc-icon-worldbook', isDark)}
         ${createDockIcon('brain', '记忆库', "window.actions.setCurrentApp('memory')", 'mc-icon-memory', isDark)}
         ${createDockIcon('palette', '外观', "window.actions.setCurrentApp('appearance')", 'mc-icon-appearance', isDark)}
         ${createDockIcon('settings', '设置', "window.actions.setCurrentApp('settings')", 'mc-icon-settings', isDark)}
      </div>

    </div>
  `;
}