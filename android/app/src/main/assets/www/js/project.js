/* RuhToon Studio — project model: CRUD, autosave, recovery. */
(function(){
'use strict';

function uid(){ return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function defaultCharacter(){
  return { mode:'procedural', skin:'#ffc58f', shirt:'#7c5cff', hair:'#3a2a1a',
    expression:'happy', hat:false, glasses:false,
    glbName:'', glbAssetId:'', glbUrl:'',
    pos:[0,0,0], rot:[0,0,0], scale:1 };
}
function defaultScene(i){
  return { id:uid(), name:'Scene '+(i+1), bg:'sky', camera:'medium', charPos:'center', duration:5 };
}
function blankProject(name){
  return { id:uid(), name:name||'Untitled', updatedAt:Date.now(),
    character:defaultCharacter(), scenes:[defaultScene(0)], activeScene:0,
    clips:[], exportAspect:'16:9',
    voice:{ dialogue:'Hello! Welcome to my cartoon world.', lang:'en-US', rate:1, pitch:1 } };
}

let current=null, saveTimer=null, dirty=false;

function markDirty(){ dirty=true; scheduleSave(); }
function scheduleSave(){
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ if(dirty && current) saveNow(); }, 1200);
}
function saveNow(){
  if (!current) return Promise.resolve();
  current.updatedAt=Date.now(); dirty=false;
  return RTS.DB.putProject(JSON.parse(JSON.stringify(current))).catch(()=>{});
}

const P = {
  blank: blankProject,
  current(){ return current; },
  markDirty: markDirty, saveNow: saveNow,
  async create(name){
    await P.persistCurrent();
    current = blankProject(name);
    await saveNow();
    try{localStorage.setItem('rts_current', current.id);}catch(e){}
    return current;
  },
  async open(id){
    await P.persistCurrent();
    const p = await RTS.DB.getProject(id);
    if (p){ current=p; try{localStorage.setItem('rts_current', id);}catch(e){} }
    return current;
  },
  async persistCurrent(){ if (current && dirty) await saveNow(); },
  async list(){
    const all = await RTS.DB.allProjects();
    all.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    return all;
  },
  async rename(id, name){
    const p = await RTS.DB.getProject(id); if(!p) return;
    p.name=name; p.updatedAt=Date.now(); await RTS.DB.putProject(p);
    if (current && current.id===id) current.name=name;
  },
  async duplicate(id){
    const p = await RTS.DB.getProject(id); if(!p) return null;
    const c = JSON.parse(JSON.stringify(p));
    c.id=uid(); c.name=p.name+' (copy)'; c.updatedAt=Date.now();
    // duplicate audio assets referenced by clips
    const map={};
    for (const clip of (c.clips||[])){
      if (clip.audioId && !map[clip.audioId]){
        const a = await RTS.DB.getAsset(clip.audioId);
        if (a){ const nid=uid(); map[clip.audioId]=nid;
          await RTS.DB.putAsset({id:nid, blob:a.blob, name:a.name, createdAt:Date.now()}); }
      }
    }
    c.clips.forEach(cl=>{ if(cl.audioId&&map[cl.audioId]) cl.audioId=map[cl.audioId]; });
    await RTS.DB.putProject(c);
    return c;
  },
  // Delete with asset cleanup; returns true if deleted
  async remove(id){
    const p = await RTS.DB.getProject(id); if(!p) return false;
    const ids={};
    (p.clips||[]).forEach(c=>{ if(c.audioId) ids[c.audioId]=1; });
    if (p.character && p.character.glbAssetId) ids[p.character.glbAssetId]=1;
    await RTS.DB.delProject(id);
    for (const aid of Object.keys(ids)){
      // only delete asset if no other project uses it
      const all = await RTS.DB.allProjects();
      const used = all.some(q=>q.id!==id && (
        (q.clips||[]).some(c=>c.audioId===aid) ||
        (q.character&&q.character.glbAssetId===aid)));
      if (!used){ try{ await RTS.DB.delAsset(aid); }catch(e){} }
    }
    if (current && current.id===id){
      current=null; try{localStorage.removeItem('rts_current');}catch(e){}
    }
    return true;
  },
  // Autosave recovery: last current project id
  async recover(){
    let id=null; try{ id=localStorage.getItem('rts_current'); }catch(e){}
    if (id){ const p=await RTS.DB.getProject(id); if(p){ current=p; return {recovered:true, project:p}; } }
    return {recovered:false};
  },
  newClip(kind){
    return { id:uid(), sceneId:null, kind:kind, text:'', audioId:'',
      expression:'happy', volume:1, trimStart:0, trimEnd:0, keys:[] };
  }
};

window.RTS = window.RTS || {};
RTS.Project = P;
})();
