// js/utils/imageCacheDB.js
// 图片缓存模块：双层（内存 + 独立 IndexedDB），仅本地，永不进备份。
//
// 用途：
//   - 用户发图：先入 cache 立即渲染（无需等上传），后台静默上传 R2
//   - 渲染：memCache 命中 → 用 Base64（无 flicker），否则用 msg.imageUrl 兜底
//   - LLM 视觉：buildLLMPayload 先查 cache，未命中再 urlToBase64ForAI（顺手回填）
//
// 键：消息 id（chat msg id / 朋友圈 id / 论坛媒体 id）
// 容量：MAX_ENTRIES 条 LRU；超出按 lastAccess 淘汰最旧

const DB_NAME = 'NekoPhoneCacheDB';
const DB_VERSION = 1;
const STORE = 'images';
const MAX_ENTRIES = 100;

// 内存层：渲染要同步读，所以必须有
const memCache = new Map(); // id(string) -> base64

let _dbPromise = null;
function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const os = db.createObjectStore(STORE, { keyPath: 'id' });
                os.createIndex('lastAccess', 'lastAccess', { unique: false });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target?.error || e);
    });
    return _dbPromise;
}

async function tx(mode) {
    const db = await openDB();
    return db.transaction(STORE, mode).objectStore(STORE);
}

export const ImageCacheDB = {
    /**
     * 启动时调用：把 IndexedDB 里的所有条目加载进 memCache。
     * 量级 100 条 × 平均 300KB ≈ 30MB，加载快且一次性。
     */
    async init() {
        try {
            const os = await tx('readonly');
            await new Promise((resolve) => {
                const req = os.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const v = cursor.value;
                        if (v && v.id && v.base64) memCache.set(String(v.id), v.base64);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = () => resolve();
            });
            console.log(`[imageCache] 启动加载 ${memCache.size} 条`);
        } catch (e) {
            console.error('[imageCache] init 失败', e);
        }
    },

    /** 同步读：渲染管线专用 */
    getSync(id) {
        if (!id) return null;
        return memCache.get(String(id)) || null;
    },

    /** 异步写：先写 memCache（同步），再 fire-and-forget 写 IndexedDB */
    async set(id, base64) {
        if (!id || !base64 || typeof base64 !== 'string') return;
        const key = String(id);
        memCache.set(key, base64);
        try {
            const os = await tx('readwrite');
            os.put({ id: key, base64, lastAccess: Date.now() });
            this._evictIfNeeded(); // 不 await，后台执行
        } catch (e) {
            console.error('[imageCache] set 失败', e);
        }
    },

    /** 命中 lastAccess 更新（异步，渲染读时调用，不阻塞） */
    async touch(id) {
        if (!id || !memCache.has(String(id))) return;
        try {
            const os = await tx('readwrite');
            const req = os.get(String(id));
            req.onsuccess = () => {
                const v = req.result;
                if (v) {
                    v.lastAccess = Date.now();
                    os.put(v);
                }
            };
        } catch (_) {}
    },

    async delete(id) {
        if (!id) return;
        const key = String(id);
        memCache.delete(key);
        try {
            const os = await tx('readwrite');
            os.delete(key);
        } catch (e) {
            console.error('[imageCache] delete 失败', e);
        }
    },

    /** 删除一批 id（消息批量删除时用） */
    async deleteMany(ids) {
        if (!Array.isArray(ids)) return;
        for (const id of ids) await this.delete(id);
    },

    /** 整库清空（factoryReset 时调用） */
    async clear() {
        memCache.clear();
        try {
            // 关掉当前连接才能 deleteDatabase
            if (_dbPromise) {
                const db = await _dbPromise;
                db.close();
                _dbPromise = null;
            }
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(DB_NAME);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
            });
        } catch (e) {
            console.error('[imageCache] clear 失败', e);
        }
    },

    /** LRU 淘汰：超过 MAX_ENTRIES 时按 lastAccess 升序删最旧的 */
    async _evictIfNeeded() {
        try {
            const os = await tx('readwrite');
            const countReq = os.count();
            countReq.onsuccess = () => {
                const total = countReq.result;
                const overflow = total - MAX_ENTRIES;
                if (overflow <= 0) return;
                const idx = os.index('lastAccess');
                const cursorReq = idx.openCursor(); // 默认升序：lastAccess 最小的在最前
                let removed = 0;
                cursorReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && removed < overflow) {
                        memCache.delete(String(cursor.value.id));
                        cursor.delete();
                        removed++;
                        cursor.continue();
                    }
                };
            };
        } catch (e) {
            console.error('[imageCache] evict 失败', e);
        }
    },

    /** 调试 */
    debug() {
        return {
            memSize: memCache.size,
            keys: [...memCache.keys()],
        };
    },
};

// 全局挂载，html 里的 onclick 用得到
if (typeof window !== 'undefined') {
    window.imageCache = ImageCacheDB;
}
