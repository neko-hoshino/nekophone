// js/apps/wechat.js — 主入口，组织各子模块
// 执行顺序：shared → voice → memory → state → actions → cloud
// render 单独 export，供 main.js 调用

import './wechat/shared.js';
import './wechat/voice.js';
import './wechat/memory.js';
import './wechat/state.js';
import './wechat/actions.js';
import './wechat/cloud.js';
export { renderWeChatApp } from './wechat/render.js';
