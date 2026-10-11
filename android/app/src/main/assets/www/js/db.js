/* RuhToon Studio — IndexedDB: projects metadata + audio assets.
   Falls back to in-memory maps if IndexedDB is unavailable. */
(function(){
'use strict';
const DB_NAME = 'ruhtoon_studio', DB_VER = 1;
let db = null, memFallback = null;

function mem(){ if(!memFallback) memFallback = {projects:new Map(), assets:new Map()}; return memFallback; }

function open(){
  return new Promise(resolve => {
    if (db) return resolve(db);
    if (!('indexedDB' in window)) return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', {keyPath:'id'});
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', {keyPath:'id'});
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch(e){ resolve(null); }
  });
}

function tx(store, mode, fn){
  return open().then(d => {
    if (!d) { // memory fallback
      const m = mem()[store];
      return fn({
        get: k => Promise.resolve(m.get(k)),
        put: v => { m.set(v.id, v); return Promise.resolve(); },
        delete: k => { m.delete(k); return Promise.resolve(); },
        all: () => Promise.resolve(Array.from(m.values())),
        clear: () => { m.clear(); return Promise.resolve(); }
      });
    }
    return new Promise((resolve, reject) => {
      try {
        const t = d.transaction(store, mode), s = t.objectStore(store);
        const wrap = {
          get: k => new Promise((res,rej)=>{ const r=s.get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }),
          put: v => new Promise((res,rej)=>{ const r=s.put(v); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }),
          delete: k => new Promise((res,rej)=>{ const r=s.delete(k); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }),
          all: () => new Promise((res,rej)=>{ const r=s.getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }),
          clear: () => new Promise((res,rej)=>{ const r=s.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); })
        };
        Promise.resolve(fn(wrap)).then(resolve, reject);
      } catch(e){ reject(e); }
    });
  });
}

window.RTS = window.RTS || {};
RTS.DB = {
  getProject: id => tx('projects','readonly', s => s.get(id)),
  putProject: p => tx('projects','readwrite', s => s.put(p)),
  delProject: id => tx('projects','readwrite', s => s.delete(id)),
  allProjects: () => tx('projects','readonly', s => s.all()),
  clearProjects: () => tx('projects','readwrite', s => s.clear()),
  getAsset: id => tx('assets','readonly', s => s.get(id)),
  putAsset: a => tx('assets','readwrite', s => s.put(a)),
  delAsset: id => tx('assets','readwrite', s => s.delete(id)),
  allAssets: () => tx('assets','readonly', s => s.all()),
  clearAssets: () => tx('assets','readwrite', s => s.clear()),
  usingFallback: () => { return open().then(d => !d); }
};
})();
