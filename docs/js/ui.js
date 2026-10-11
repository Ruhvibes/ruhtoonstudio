/* RuhToon Studio — screens + shared UI helpers. */
(function(){
'use strict';

/* ---------- helpers ---------- */
function h(tag, attrs, kids){
  const el = document.createElement(tag);
  attrs = attrs||{};
  Object.keys(attrs).forEach(k=>{
    if (k==='text') el.textContent = attrs[k];
    else if (k==='html') el.innerHTML = attrs[k];
    else if (k==='on' ) Object.keys(attrs.on).forEach(ev=>el.addEventListener(ev, attrs.on[ev]));
    else if (k==='value') el.value = attrs[k];
    else el.setAttribute(k, attrs[k]);
  });
  (kids||[]).forEach(c=>{ if(c==null) return; el.appendChild(typeof c==='string'?document.createTextNode(c):c); });
  return el;
}
function btn(label, fn, cls){ return h('button',{class:'btn '+(cls||''), text:label, on:{click:fn}}); }
function row(){ return h('div',{class:'row'}); }
function label(text, input){ return h('label',{class:'fld'},[h('span',{text:text}), input]); }
function toast(msg){
  const t = document.querySelector('#toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(()=>t.classList.remove('show'), 2200);
}
function offerDownload(blob, filename){
  try{
    if (window.Android && typeof window.Android.saveVideo==='function'){
      const r = new FileReader();
      // Native bridge shows its own result toast.
      r.onload = ()=>{ try{ window.Android.saveVideo(String(r.result), filename); }catch(e){ fallbackAnchor(blob,filename); } };
      r.onerror = ()=>fallbackAnchor(blob,filename);
      r.readAsDataURL(blob); return;
    }
  }catch(e){}
  fallbackAnchor(blob,filename);
}
function fallbackAnchor(blob, filename){
  const a = document.querySelector('#dlAnchor');
  const u = URL.createObjectURL(blob);
  a.href=u; a.download=filename||'ruhtoon-scene.webm';
  a.textContent = RTS.t('exp_download'); a.classList.remove('hidden');
}
function fmtDate(ts){ try{ return new Date(ts).toLocaleDateString(); }catch(e){ return ''; } }

RTS.UI = { h:h, btn:btn, row:row, label:label, toast:toast, offerDownload:offerDownload, fmtDate:fmtDate };

/* ---------- stage sync ---------- */
function activeScene(){
  const p = RTS.Project.current();
  if (!p || !p.scenes.length) return null;
  return p.scenes[Math.min(p.activeScene||0, p.scenes.length-1)];
}
async function applyProjectToStage(){
  const p = RTS.Project.current(); if(!p) return;
  const sc = activeScene();
  const ch = p.character;
  // character (glb needs asset -> object URL; revoke the previous one)
  if (RTS._glbUrl){ try{ URL.revokeObjectURL(RTS._glbUrl); }catch(e){} RTS._glbUrl=null; }
  let cfg = Object.assign({}, ch);
  if (ch.mode==='glb' && ch.glbAssetId){
    try{
      const a = await RTS.DB.getAsset(ch.glbAssetId);
      if (a && a.blob){ cfg.glbUrl = URL.createObjectURL(a.blob); RTS._glbUrl = cfg.glbUrl; }
      else { cfg.mode='procedural'; }
    }catch(e){ cfg.mode='procedural'; }
  }
  const info = await RTS.Stage.loadCharacter(cfg).catch(()=>null);
  RTS.Stage.setColors(ch);
  RTS.Stage.setExpression(ch.expression||'happy');
  if (sc){
    RTS.Stage.setBackground(sc.bg); RTS.Stage.setCamera(sc.camera); RTS.Stage.setCharPos(sc.charPos);
  }
  RTS.Stage.setAspect(p.exportAspect||'16:9');
  RTS._glbInfo = info;
  const bar = document.querySelector('#stageBar');
  if (bar) bar.textContent = (sc?sc.name+' · ':'') + RTS.t('stage_ready');
}
RTS.applyProjectToStage = applyProjectToStage;

/* ================= HOME ================= */
function renderHome(el){
  el.innerHTML='';
  el.appendChild(h('h2',{text:RTS.t('home_title')}));
  const rec = document.querySelector('#recoverNote'); if(rec) rec.classList.add('hidden');
  const listWrap = h('div',{class:'proj-list'});
  el.appendChild(listWrap);
  el.appendChild(btn(RTS.t('home_new'), ()=>{
    const name = prompt(RTS.t('home_new_name'), 'My Cartoon');
    if (name==null) return;
    RTS.Project.create(name||'Untitled').then(()=>{ applyProjectToStage(); RTS.go('character'); });
  }, 'primary'));
  function refresh(){
    listWrap.innerHTML='';
    RTS.Project.list().then(projects=>{
      if (!projects.length) listWrap.appendChild(h('p',{class:'hint', text:RTS.t('home_empty')}));
      const cur = RTS.Project.current();
      projects.forEach(p=>{
        const card = h('div',{class:'proj-card'});
        card.appendChild(h('div',{class:'proj-name', text:p.name}));
        card.appendChild(h('div',{class:'proj-meta', text:
          RTS.t('home_updated')+': '+fmtDate(p.updatedAt)+' · '+
          (p.scenes||[]).length+' '+RTS.t('home_scenes')+' · '+(p.clips||[]).length+' '+RTS.t('home_clips')}));
        const br = row();
        br.appendChild(btn(RTS.t('home_open'), ()=>{ RTS.Project.open(p.id).then(()=>{ applyProjectToStage(); RTS.go('character'); }); }, 'primary'));
        br.appendChild(btn(RTS.t('home_rename'), ()=>{
          const n = prompt(RTS.t('home_new_name'), p.name); if(n==null) return;
          RTS.Project.rename(p.id, n||p.name).then(refresh);
        }));
        br.appendChild(btn(RTS.t('home_duplicate'), ()=>{ RTS.Project.duplicate(p.id).then(refresh); }));
        br.appendChild(btn(RTS.t('home_delete'), ()=>{
          if(!confirm(RTS.t('home_delete_confirm',{name:p.name}))) return;
          RTS.Project.remove(p.id).then(refresh);
        }, 'danger'));
        if (cur && cur.id===p.id) card.classList.add('active');
        card.appendChild(br); listWrap.appendChild(card);
      });
    });
  }
  refresh();
}

/* ================= CHARACTER ================= */
function renderCharacter(el){
  const p = RTS.Project.current();
  el.innerHTML='';
  if(!p){ el.appendChild(h('p',{class:'hint',text:RTS.t('home_empty')})); return; }
  const ch = p.character;
  el.appendChild(h('h2',{text:RTS.t('char_title')}));
  const upd = ()=>{ RTS.Project.markDirty(); };

  el.appendChild(label(RTS.t('char_skin'), h('input',{type:'color', value:ch.skin||'#ffc58f', on:{input:e=>{ch.skin=e.target.value; RTS.Stage.setColors(ch); upd();}}})));
  el.appendChild(label(RTS.t('char_shirt'), h('input',{type:'color', value:ch.shirt||'#7c5cff', on:{input:e=>{ch.shirt=e.target.value; RTS.Stage.setColors(ch); upd();}}})));
  el.appendChild(label(RTS.t('char_hair'), h('input',{type:'color', value:ch.hair||'#3a2a1a', on:{input:e=>{ch.hair=e.target.value; RTS.Stage.setColors(ch); upd();}}})));
  const exprSel = h('select',{on:{change:e=>{ch.expression=e.target.value; RTS.Stage.setExpression(ch.expression); upd();}}},
    ['happy','surprised','serious'].map(v=>h('option',{value:v, text:RTS.t('expr_'+v)})));
  exprSel.value = ch.expression||'happy';
  el.appendChild(label(RTS.t('char_expression'), exprSel));
  const hatCb = h('input',{type:'checkbox', on:{change:e=>{ch.hat=e.target.checked; RTS.Stage.setHat(ch.hat); upd();}}});
  hatCb.checked=!!ch.hat; el.appendChild(label(RTS.t('char_hat'), hatCb));
  const glCb = h('input',{type:'checkbox', on:{change:e=>{ch.glasses=e.target.checked; RTS.Stage.setGlasses(ch.glasses); upd();}}});
  glCb.checked=!!ch.glasses; el.appendChild(label(RTS.t('char_glasses'), glCb));

  // transforms
  el.appendChild(h('h3',{text:RTS.t('char_pos')}));
  function slider(min,max,step,get,set){
    const s=h('input',{type:'range',min:min,max:max,step:step,value:String(get()),on:{input:e=>{set(parseFloat(e.target.value));upd();}}});
    return s;
  }
  el.appendChild(label('X', slider(-4,4,.1,()=>ch.pos[0],v=>{ch.pos[0]=v; RTS.Stage.applyTransform(ch);})));
  el.appendChild(label('Y', slider(-2,3,.1,()=>ch.pos[1],v=>{ch.pos[1]=v; RTS.Stage.applyTransform(ch);})));
  el.appendChild(label(RTS.t('char_rot')+' Y', slider(-3.14,3.14,.05,()=>ch.rot[1],v=>{ch.rot[1]=v; RTS.Stage.applyTransform(ch);})));
  el.appendChild(label(RTS.t('char_scale'), slider(.4,2.2,.05,()=>ch.scale||1,v=>{ch.scale=v; RTS.Stage.applyTransform(ch);})));

  // GLB import
  el.appendChild(h('h3',{text:RTS.t('char_import_glb')}));
  const glbStatus = h('p',{class:'status', text: ch.mode==='glb' ? (RTS.t('char_glb_loaded')+(ch.glbName||'')) : RTS.t('char_glb_hint')});
  const fileInp = h('input',{type:'file', accept:'.glb,.gltf', class:'hidden'});
  fileInp.addEventListener('change', ()=>{
    const f=fileInp.files&&fileInp.files[0]; if(!f) return;
    glbStatus.textContent = RTS.t('char_glb_loading');
    const aid='a'+Date.now().toString(36);
    RTS.DB.putAsset({id:aid, blob:f, name:f.name, createdAt:Date.now()}).then(()=>{
      ch.mode='glb'; ch.glbAssetId=aid; ch.glbName=f.name; upd();
      return applyProjectToStage();
    }).then(()=>{
      const info=RTS._glbInfo||{clips:[],morphs:[]};
      glbStatus.textContent = RTS.t('char_glb_loaded')+f.name;
      renderGlbInfo(infoWrap, info);
      toast(RTS.t('saved'));
    }).catch(e=>{ glbStatus.textContent=RTS.t('char_glb_error')+(e.message||e); });
  });
  const impBtn = btn(RTS.t('char_import_glb'), ()=>fileInp.click());
  el.appendChild(impBtn); el.appendChild(fileInp); el.appendChild(glbStatus);
  const infoWrap = h('div',{class:'glb-info'});
  el.appendChild(infoWrap);
  if (RTS._glbInfo) renderGlbInfo(infoWrap, RTS._glbInfo);
  el.appendChild(btn(RTS.t('char_use_procedural'), ()=>{
    ch.mode='procedural'; ch.glbAssetId=''; ch.glbName=''; upd(); applyProjectToStage();
    infoWrap.innerHTML=''; glbStatus.textContent=RTS.t('char_glb_hint');
  }, 'secondary'));
  el.appendChild(btn(RTS.t('char_reset'), ()=>{
    const d={mode:'procedural',skin:'#ffc58f',shirt:'#7c5cff',hair:'#3a2a1a',expression:'happy',hat:false,glasses:false,glbName:'',glbAssetId:'',glbUrl:'',pos:[0,0,0],rot:[0,0,0],scale:1};
    p.character=d; upd(); applyProjectToStage(); renderCharacter(el); RTS.go('character');
  }, 'secondary'));

  function renderGlbInfo(wrapEl, info){
    wrapEl.innerHTML='';
    wrapEl.appendChild(h('h4',{text:RTS.t('char_anim_clips')}));
    if(info.clips.length){
      info.clips.forEach(c=>{
        const r=row();
        r.appendChild(h('span',{text:c, class:'chip'}));
        r.appendChild(btn('▶', ()=>RTS.Stage.playGlbClip(c), 'secondary'));
        wrapEl.appendChild(r);
      });
    } else wrapEl.appendChild(h('p',{class:'hint',text:RTS.t('char_none')}));
    wrapEl.appendChild(h('h4',{text:RTS.t('char_morphs')}));
    wrapEl.appendChild(h('p',{class:'hint',text: info.morphs.length? info.morphs.join(', ') : RTS.t('char_none')}));
  }
}

/* ================= SCENE ================= */
function renderSceneEditor(el){
  const p=RTS.Project.current(); el.innerHTML='';
  if(!p){ el.appendChild(h('p',{class:'hint',text:RTS.t('home_empty')})); return; }
  el.appendChild(h('h2',{text:RTS.t('scene_title')}));
  const upd=()=>{RTS.Project.markDirty();};
  const list=h('div',{class:'scene-list'}); el.appendChild(list);
  el.appendChild(btn(RTS.t('scene_add'), ()=>{
    p.scenes.push({id:'s'+Date.now().toString(36), name:'Scene '+(p.scenes.length+1), bg:'sky', camera:'medium', charPos:'center', duration:5});
    p.activeScene=p.scenes.length-1; upd(); applyProjectToStage(); refresh();
  },'primary'));
  function refresh(){
    list.innerHTML='';
    p.scenes.forEach((s,i)=>{
      const c=h('div',{class:'scene-card'+(i===(p.activeScene||0)?' active':'')});
      c.appendChild(h('strong',{text:s.name}));
      const br=row();
      br.appendChild(btn('✎',()=>{ const sc=s; sc.name=prompt('Name',sc.name)||sc.name; upd(); refresh(); },'secondary'));
      br.appendChild(btn(RTS.t('scene_delete'),()=>{
        if(p.scenes.length<=1) return;
        if(!confirm(RTS.t('scene_delete_confirm'))) return;
        p.clips=p.clips.filter(cl=>cl.sceneId!==s.id);
        p.scenes.splice(i,1); p.activeScene=0; upd(); applyProjectToStage(); refresh();
      },'danger'));
      c.appendChild(br);
      c.addEventListener('click',e=>{ if(e.target.tagName!=='BUTTON'){ p.activeScene=i; upd(); applyProjectToStage(); refresh(); } });
      list.appendChild(c);
    });
    renderControls();
  }
  const ctl=h('div'); el.appendChild(ctl);
  function renderControls(){
    ctl.innerHTML='';
    const s=p.scenes[Math.min(p.activeScene||0,p.scenes.length-1)]; if(!s) return;
    ctl.appendChild(h('h3',{text:s.name}));
    ctl.appendChild(h('div',{class:'seg-label',text:RTS.t('scene_bg')}));
    const bgRow=row();
    ['sky','night','sunset','studio'].forEach(b=>{
      const bbtn=btn(RTS.t('bg_'+b),()=>{s.bg=b;upd();RTS.Stage.setBackground(b);renderControls();}, b===s.bg?'primary':'secondary');
      bgRow.appendChild(bbtn);
    });
    ctl.appendChild(bgRow);
    ctl.appendChild(h('div',{class:'seg-label',text:RTS.t('scene_camera')}));
    const camRow=row();
    ['closeup','medium','wide'].forEach(c=>{
      camRow.appendChild(btn(RTS.t('cam_'+c),()=>{s.camera=c;upd();RTS.Stage.setCamera(c);renderControls();}, c===s.camera?'primary':'secondary'));
    });
    ctl.appendChild(camRow);
    ctl.appendChild(h('div',{class:'seg-label',text:RTS.t('scene_charpos')}));
    const posRow=row();
    [['left','pos_left'],['center','pos_center'],['right','pos_right']].forEach(pr=>{
      posRow.appendChild(btn(RTS.t(pr[1]),()=>{s.charPos=pr[0];upd();RTS.Stage.setCharPos(pr[0]);renderControls();}, pr[0]===s.charPos?'primary':'secondary'));
    });
    ctl.appendChild(posRow);
    ctl.appendChild(label(RTS.t('scene_duration'), h('input',{type:'range',min:'2',max:'30',step:'1',value:String(s.duration||5),on:{input:e=>{s.duration=parseInt(e.target.value,10);upd();}}})));
  }
  refresh();
}

/* ================= VOICE ================= */
function renderVoice(el){
  const p=RTS.Project.current(); el.innerHTML='';
  if(!p){ el.appendChild(h('p',{class:'hint',text:RTS.t('home_empty')})); return; }
  const v=p.voice; el.appendChild(h('h2',{text:RTS.t('voice_title')}));
  const upd=()=>RTS.Project.markDirty();

  el.appendChild(label(RTS.t('voice_dialogue'), h('textarea',{rows:'3', value:v.dialogue||'', on:{input:e=>{v.dialogue=e.target.value;upd();}}})));
  const langSel=h('select',{on:{change:e=>{v.lang=e.target.value;upd();loadVoices();}}},
    [['en-US','English (US)'],['en-IN','English (India)'],['hi-IN','Hindi']].map(o=>h('option',{value:o[0],text:o[1]})));
  langSel.value=v.lang||'en-US';
  el.appendChild(label(RTS.t('voice_language'), langSel));
  const voiceSel=h('select',{on:{change:()=>{ v.voiceIndex = voiceSel.value==='' ? null : parseInt(voiceSel.value,10); upd(); }}});
  el.appendChild(label(RTS.t('voice_voice'), voiceSel));
  function loadVoices(){
    voiceSel.innerHTML='';
    voiceSel.appendChild(h('option',{value:'',text:RTS.t('voice_default_voice')}));
    RTS.TTS.voices().forEach((vc,i)=>{
      if(!v.lang || vc.lang===v.lang || vc.lang.indexOf(v.lang.slice(0,2))===0)
        voiceSel.appendChild(h('option',{value:String(i),text:vc.name+' ('+vc.lang+')'}));
    });
    if (v.voiceIndex!=null) voiceSel.value=String(v.voiceIndex);
  }
  loadVoices();
  if (RTS.TTS.supported()){ try{ speechSynthesis.onvoiceschanged=loadVoices; }catch(e){} }
  el.appendChild(label(RTS.t('voice_rate'), h('input',{type:'range',min:'0.5',max:'2',step:'0.1',value:String(v.rate||1),on:{input:e=>{v.rate=parseFloat(e.target.value);upd();}}})));
  el.appendChild(label(RTS.t('voice_pitch'), h('input',{type:'range',min:'0.5',max:'2',step:'0.1',value:String(v.pitch||1),on:{input:e=>{v.pitch=parseFloat(e.target.value);upd();}}})));
  const pvRow=row();
  pvRow.appendChild(btn(RTS.t('voice_preview'), ()=>{
    if(!RTS.TTS.supported()){ alert(RTS.t('voice_nosupport')); return; }
    const vi = v.voiceIndex!=null ? v.voiceIndex : (voiceSel.value==='' ? null : parseInt(voiceSel.value,10));
    RTS.Stage.setSpeaking(true, .5);
    RTS.TTS.speak(v.dialogue, {lang:v.lang, rate:v.rate, pitch:v.pitch, voiceIndex:vi,
      onend:()=>RTS.Stage.setSpeaking(false,0), onerror:()=>RTS.Stage.setSpeaking(false,0)});
  },'primary'));
  pvRow.appendChild(btn(RTS.t('voice_stop'), ()=>{ RTS.TTS.cancel(); RTS.Stage.setSpeaking(false,0); },'secondary'));
  el.appendChild(pvRow);
  el.appendChild(h('p',{class:'hint',text:RTS.t('voice_ai_note')}));

  // Recording
  el.appendChild(h('h3',{text:RTS.t('voice_record')}));
  const recRow=row();
  const recBtn=btn(RTS.t('voice_rec_start'), async ()=>{
    try{
      await RTS.Rec.start();
      recBtn.disabled=true; stopBtn.disabled=false;
      recStatus.textContent=RTS.t('voice_recording');
    }catch(e){
      const n = e && e.name;
      recStatus.textContent = (n==='NotAllowedError'||n==='SecurityError') ? RTS.t('voice_mic_denied')
        : (n==='NotFoundError'||n==='OverconstrainedError') ? RTS.t('voice_mic_nodevice')
        : (e.message||RTS.t('err_generic'));
    }
  },'danger');
  const stopBtn=btn(RTS.t('voice_rec_stop'), async ()=>{
    const blob=await RTS.Rec.stop();
    recBtn.disabled=false; stopBtn.disabled=true;
    if(blob){ setWorkAudio(blob, 'recording-'+Date.now()+'.webm'); recStatus.textContent=RTS.t('voice_saved'); }
  },'secondary');
  stopBtn.disabled=true;
  recRow.appendChild(recBtn); recRow.appendChild(stopBtn); el.appendChild(recRow);
  const recStatus=h('p',{class:'status',text:RTS.t('voice_noaudio')}); el.appendChild(recStatus);

  // Playback + import
  const audioEl=h('audio',{controls:'', class:'audio-play'}); el.appendChild(audioEl);
  const impRow=row();
  const fileBtn=h('label',{class:'btn secondary file-btn', text:RTS.t('voice_import')});
  const fileInp=h('input',{type:'file', accept:'audio/*', class:'hidden'});
  fileInp.addEventListener('change',()=>{
    const f=fileInp.files&&fileInp.files[0]; if(!f) return;
    setWorkAudio(f, f.name); recStatus.textContent=f.name;
  });
  fileBtn.appendChild(fileInp); impRow.appendChild(fileBtn);
  impRow.appendChild(btn(RTS.t('voice_clear'), ()=>{ setWorkAudio(null); recStatus.textContent=RTS.t('voice_noaudio'); },'secondary'));
  el.appendChild(impRow);

  function setWorkAudio(blob, name){
    if (RTS._workAudioUrl){ try{ URL.revokeObjectURL(RTS._workAudioUrl); }catch(e){} RTS._workAudioUrl=null; }
    RTS._workAudio = blob?{blob:blob, name:name||'audio'}:null;
    if(blob){ const u=URL.createObjectURL(blob); RTS._workAudioUrl=u; audioEl.src=u; }
    else audioEl.removeAttribute('src');
    volSlider.disabled=!blob; trimApply.disabled=!blob; addClipBtn.disabled=!blob;
  }
  // volume + trim
  const volSlider=h('input',{type:'range',min:'0',max:'1.5',step:'0.05',value:'1',disabled:''});
  volSlider.addEventListener('input',()=>{ audioEl.volume=Math.min(1,parseFloat(volSlider.value)); });
  el.appendChild(label(RTS.t('voice_volume'), volSlider));
  el.appendChild(h('div',{class:'seg-label',text:RTS.t('voice_trim')}));
  const tS=h('input',{type:'number',min:'0',step:'0.5',value:'0',class:'num'}), tE=h('input',{type:'number',min:'0',step:'0.5',value:'0',class:'num'});
  const trimRow=row();
  trimRow.appendChild(label(RTS.t('voice_trim_start'), tS));
  trimRow.appendChild(label(RTS.t('voice_trim_end'), tE));
  el.appendChild(trimRow);
  const trimApply=btn(RTS.t('voice_apply_trim'), async ()=>{
    if(!RTS._workAudio) return;
    try{
      const buf=await RTS.Mixer.process(RTS._workAudio.blob, parseFloat(tS.value)||0, parseFloat(tE.value)||0, parseFloat(volSlider.value)||1);
      // encode back via MediaRecorder? Simpler: keep AudioBuffer and re-render on add.
      RTS._workAudio.processed=buf;
      toast(RTS.t('saved'));
    }catch(e){ toast(RTS.t('err_generic')+(e.message||e)); }
  },'secondary');
  trimApply.disabled=true; el.appendChild(trimApply);

  const addClipBtn=btn(RTS.t('voice_add_clip'), async ()=>{
    if(!RTS._workAudio) return;
    const aid='a'+Date.now().toString(36);
    let blob=RTS._workAudio.blob;
    if (RTS._workAudio.processed){
      // render processed buffer to wav blob
      blob = bufferToWavBlob(RTS._workAudio.processed);
    }
    await RTS.DB.putAsset({id:aid, blob:blob, name:RTS._workAudio.name, createdAt:Date.now()});
    const clip=RTS.Project.newClip('audio');
    const sc=activeScene(); clip.sceneId=sc?sc.id:null;
    clip.audioId=aid; clip.expression=p.character.expression||'happy';
    clip.volume=Math.min(1,parseFloat(volSlider.value)||1);
    p.clips.push(clip); RTS.Project.markDirty();
    toast(RTS.t('voice_clip_added'));
  },'primary');
  addClipBtn.disabled=true; el.appendChild(addClipBtn);

  // TTS clip button
  el.appendChild(btn('+ '+RTS.t('tl_kind_tts'), ()=>{
    const clip=RTS.Project.newClip('tts');
    const sc=activeScene(); clip.sceneId=sc?sc.id:null;
    clip.text=v.dialogue||''; clip.lang=v.lang; clip.rate=v.rate; clip.pitch=v.pitch;
    clip.voiceIndex=(v.voiceIndex!=null?v.voiceIndex:null);
    clip.expression=p.character.expression||'happy';
    p.clips.push(clip); RTS.Project.markDirty();
    toast(RTS.t('voice_clip_added'));
  },'secondary'));

  // AI voice (optional, user HF token)
  el.appendChild(h('h3',{text:RTS.t('voice_ai_title')}));
  const aiStatus=h('p',{class:'status',text:''}); 
  if(!RTS.AI.hasToken()){
    el.appendChild(h('p',{class:'hint',text:RTS.t('voice_ai_no_token')}));
  }
  const aiBtn=btn('🤖 '+RTS.t('voice_ai_label')+' — '+RTS.t('voice_ai_generate'), async ()=>{
    if(!RTS.AI.hasToken()){ aiStatus.textContent=RTS.t('voice_ai_no_token'); return; }
    const text=(v.dialogue||'').trim();
    if(!text){ aiStatus.textContent='…'; return; }
    aiBtn.disabled=true; aiStatus.textContent=RTS.t('voice_ai_working');
    try{
      const blob=await RTS.AI.synthesize(text);
      setWorkAudio(blob, 'ai-voice-'+Date.now()+'.wav');
      aiStatus.textContent=RTS.t('voice_ai_done');
    }catch(e){
      const m=e.message||'';
      aiStatus.textContent = m==='no-token'||m==='bad-token' ? RTS.t('voice_ai_err_token')
        : m==='model-loading' ? RTS.t('voice_ai_err_loading')
        : RTS.t('voice_ai_err')+m;
    }
    aiBtn.disabled=false;
  },'secondary');
  el.appendChild(aiBtn); el.appendChild(aiStatus);
}

function bufferToWavBlob(buffer){
  const nCh=Math.min(2,buffer.numberOfChannels), sr=buffer.sampleRate, len=buffer.length;
  const bytes=44+len*nCh*2, ab=new ArrayBuffer(bytes), dv=new DataView(ab);
  function ws(o,s){ for(let i=0;i<s.length;i++) dv.setUint8(o+i,s.charCodeAt(i)); }
  ws(0,'RIFF'); dv.setUint32(4,bytes-8,true); ws(8,'WAVE'); ws(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,nCh,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*nCh*2,true); dv.setUint16(32,nCh*2,true);
  dv.setUint16(34,16,true); ws(36,'data'); dv.setUint32(40,len*nCh*2,true);
  let off=44;
  for(let i=0;i<len;i++) for(let c=0;c<nCh;c++){
    const s=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]));
    dv.setInt16(off, s<0?s*0x8000:s*0x7FFF, true); off+=2;
  }
  return new Blob([ab],{type:'audio/wav'});
}
RTS.bufferToWavBlob=bufferToWavBlob;

/* ================= TIMELINE ================= */
let tlPlaying=false, tlStopFlag=false;
RTS.stopTimeline = function(){
  tlStopFlag=true;
  try{ RTS.TTS.cancel(); }catch(e){}
  try{ RTS.Stage.setSpeaking(false,0); }catch(e){}
};
function renderTimeline(el){
  const p=RTS.Project.current(); el.innerHTML='';
  if(!p){ el.appendChild(h('p',{class:'hint',text:RTS.t('home_empty')})); return; }
  el.appendChild(h('h2',{text:RTS.t('tl_title')}));
  if(!p.clips.length) el.appendChild(h('p',{class:'hint',text:RTS.t('tl_empty')}));
  const list=h('div',{class:'clip-list'}); el.appendChild(list);
  const status=h('p',{class:'status',text:''}); el.appendChild(status);
  const ctlRow=row();
  const playBtn=btn(RTS.t('tl_play'), ()=>playSequence(status, playBtn, stopBtn),'primary');
  const stopBtn=btn(RTS.t('tl_stop'), ()=>{ tlStopFlag=true; },'secondary');
  stopBtn.disabled=true; ctlRow.appendChild(playBtn); ctlRow.appendChild(stopBtn);
  el.appendChild(ctlRow);

  function refresh(){
    list.innerHTML='';
    p.clips.forEach((clip,idx)=>{
      const card=h('div',{class:'clip-card'});
      const title = clip.kind==='tts' ? '💬 '+(clip.text||'').slice(0,40) : '🎙 '+(clip.audioId||'audio');
      card.appendChild(h('div',{class:'clip-title',text:title}));
      card.appendChild(h('div',{class:'clip-kind',text: clip.kind==='tts'?RTS.t('tl_kind_tts'):RTS.t('tl_kind_audio')}));
      const er=row();
      const exSel=h('select',{on:{change:e=>{clip.expression=e.target.value;RTS.Project.markDirty();}}},
        ['happy','surprised','serious'].map(v=>h('option',{value:v,text:RTS.t('expr_'+v)})));
      exSel.value=clip.expression||'happy';
      er.appendChild(label(RTS.t('tl_expression'),exSel));
      er.appendChild(btn('↑',()=>{ if(idx>0){p.clips.splice(idx,1);p.clips.splice(idx-1,0,clip);RTS.Project.markDirty();refresh();}},'secondary'));
      er.appendChild(btn('↓',()=>{ if(idx<p.clips.length-1){p.clips.splice(idx,1);p.clips.splice(idx+1,0,clip);RTS.Project.markDirty();refresh();}},'secondary'));
      er.appendChild(btn(RTS.t('tl_remove'),()=>{p.clips.splice(idx,1);RTS.Project.markDirty();refresh();},'danger'));
      card.appendChild(er);
      // keyframes
      const kfWrap=h('div',{class:'kf-wrap'});
      const kfHead=h('div',{class:'seg-label',text:RTS.t('tl_keys')+' ('+(clip.keys||[]).length+')'});
      kfWrap.appendChild(kfHead);
      (clip.keys||[]).forEach((k,ki)=>{
        const kr=row();
        kr.appendChild(h('span',{class:'chip',text:'t='+k.t+'s'}));
        kr.appendChild(btn('✕',()=>{clip.keys.splice(ki,1);RTS.Project.markDirty();refresh();},'secondary'));
        kfWrap.appendChild(kr);
      });
      const kt=h('input',{type:'number',min:'0',step:'0.5',value:String((clip.keys&&clip.keys.length?clip.keys[clip.keys.length-1].t+1:0)),class:'num'});
      const kAdd=btn(RTS.t('tl_add_key'),()=>{
        const ch=p.character;
        clip.keys=clip.keys||[];
        clip.keys.push({t:parseFloat(kt.value)||0, pos:ch.pos.slice(), rot:ch.rot.slice(), scale:ch.scale||1});
        clip.keys.sort((a,b)=>a.t-b.t);
        RTS.Project.markDirty(); refresh();
      },'secondary');
      const kRow=row(); kRow.appendChild(kt); kRow.appendChild(kAdd); kfWrap.appendChild(kRow);
      if(!(clip.keys&&clip.keys.length)) kfWrap.appendChild(h('p',{class:'hint',text:RTS.t('tl_no_keys')}));
      card.appendChild(kfWrap);
      list.appendChild(card);
    });
  }
  refresh();

  async function playSequence(statusEl, playB, stopB){
    if(tlPlaying) return;
    tlPlaying=true; tlStopFlag=false; playB.disabled=true; stopB.disabled=false;
    statusEl.textContent=RTS.t('tl_playing');
    const ch=p.character;
    const basePos=ch.pos.slice(), baseRot=ch.rot.slice(), baseScale=ch.scale||1;
    try{
      for(const clip of p.clips){
        if(tlStopFlag) break;
        RTS.Stage.setExpression(clip.expression||'happy');
        const t0=performance.now();
        // keyframe driver
        let kfAlive=true;
        const keys=(clip.keys||[]).slice().sort((a,b)=>a.t-b.t);
        function applyKf(){
          if(!kfAlive||!keys.length) return;
          const el=(performance.now()-t0)/1000;
          let a=keys[0], b=keys[keys.length-1];
          for(let i=0;i<keys.length-1;i++){ if(el>=keys[i].t&&el<=keys[i+1].t){a=keys[i];b=keys[i+1];break;} }
          const span=Math.max(0.001,b.t-a.t), f=Math.max(0,Math.min(1,(el-a.t)/span));
          const L=(x,y)=>x+(y-x)*f;
          const pos=[L(a.pos[0],b.pos[0]),L(a.pos[1],b.pos[1]),L(a.pos[2],b.pos[2])];
          const rot=[L(a.rot[0],b.rot[0]),L(a.rot[1],b.rot[1]),L(a.rot[2],b.rot[2])];
          ch.pos=pos; ch.rot=rot; ch.scale=L(a.scale,b.scale);
          RTS.Stage.applyTransform(ch);
          requestAnimationFrame(applyKf);
        }
        if(keys.length) applyKf();
        if(clip.kind==='tts'){
          RTS.Stage.setSpeaking(true,.5);
          await RTS.TTS.speak(clip.text||'',{lang:clip.lang||'en-US',rate:clip.rate||1,pitch:clip.pitch||1,voiceIndex:(clip.voiceIndex!=null?clip.voiceIndex:null)});
          RTS.Stage.setSpeaking(false,0);
        } else if(clip.audioId){
          const asset=await RTS.DB.getAsset(clip.audioId).catch(()=>null);
          if(asset&&asset.blob){
            await playAudioClip(asset.blob, clip);
          }
        }
        kfAlive=false;
        // restore base transform
        ch.pos=basePos.slice(); ch.rot=baseRot.slice(); ch.scale=baseScale;
        RTS.Stage.applyTransform(ch);
      }
    }catch(e){ statusEl.textContent=RTS.t('err_generic')+(e.message||e); }
    tlPlaying=false; playB.disabled=false; stopB.disabled=true;
    RTS.Stage.setSpeaking(false,0);
    statusEl.textContent = tlStopFlag?RTS.t('tl_stop'):RTS.t('tl_finished');
    RTS.Project.markDirty();
  }

  function playAudioClip(blob, clip){
    return new Promise(resolve=>{
      const url=URL.createObjectURL(blob);
      const ae=new Audio();
      let driver=null, done=false;
      function fin(){ if(done) return; done=true; try{ae.pause();}catch(e){} if(driver)driver.stop(); URL.revokeObjectURL(url); resolve(); }
      ae.preload='auto'; ae.src=url;
      try{ ae.volume=Math.min(1,clip.volume==null?1:clip.volume); }catch(e){}
      const t0=clip.trimStart||0, t1=clip.trimEnd||0;
      ae.oncanplay=()=>{
        try{
          const attached=RTS.LipSync.attach(ae);
          driver = attached? RTS.LipSync.drive() : null;
          if(t0>0){ try{ae.currentTime=Math.min(t0,(ae.duration||t0+1)-0.1);}catch(e){} }
          ae.play().catch(()=>fin());
          if(t1>t0){
            ae.ontimeupdate=()=>{ if(ae.currentTime>=t1) fin(); };
          }
        }catch(e){ fin(); }
      };
      ae.onended=fin; ae.onerror=fin;
      setTimeout(()=>{ if(tlStopFlag) fin(); }, 50);
      const watch=setInterval(()=>{ if(tlStopFlag||done){clearInterval(watch); fin();} },200);
    });
  }
}

/* ================= EXPORT ================= */
let expCancel=false, expRunning=false;
function renderExport(el){
  const p=RTS.Project.current(); el.innerHTML='';
  if(!p){ el.appendChild(h('p',{class:'hint',text:RTS.t('home_empty')})); return; }
  el.appendChild(h('h2',{text:RTS.t('exp_title')}));
  const upd=()=>RTS.Project.markDirty();

  el.appendChild(h('div',{class:'seg-label',text:RTS.t('exp_aspect')}));
  const aRow=row();
  [['16:9','exp_landscape'],['9:16','exp_portrait']].forEach(a=>{
    aRow.appendChild(btn(RTS.t(a[1]),()=>{p.exportAspect=a[0];upd();RTS.Stage.setAspect(a[0]);refreshSel();}, (p.exportAspect||'16:9')===a[0]?'primary':'secondary'));
  });
  el.appendChild(aRow);

  el.appendChild(h('div',{class:'seg-label',text:RTS.t('exp_clips')}));
  const selWrap=h('div'); el.appendChild(selWrap);
  const selected={};
  function refreshSel(){
    selWrap.innerHTML='';
    const audioClips=p.clips.filter(c=>c.kind==='audio');
    if(!audioClips.length) selWrap.appendChild(h('p',{class:'hint',text:RTS.t('exp_no_audio')}));
    audioClips.forEach(c=>{
      if(!(c.id in selected)) selected[c.id]=true;
      const cb=h('input',{type:'checkbox',on:{change:e=>{selected[c.id]=e.target.checked;}}});
      cb.checked=!!selected[c.id];
      selWrap.appendChild(label((c.audioId||'audio').slice(0,18), cb));
    });
    const ttsN=p.clips.filter(c=>c.kind==='tts').length;
    if(ttsN) selWrap.appendChild(h('p',{class:'hint',text:RTS.t('exp_tts_note')}));
  }
  refreshSel();

  const prog=h('progress',{max:'100',value:'0',class:'hidden'}); el.appendChild(prog);
  const status=h('p',{class:'status',text:RTS.t('exp_mp4_note')}); el.appendChild(status);
  const dl=h('a',{id:'dlAnchor',class:'download hidden',text:RTS.t('exp_download')}); el.appendChild(dl);
  const bRow=row();
  const startBtn=btn(RTS.t('exp_start'), ()=>doExport(status,prog,startBtn,cancelBtn,selected),'primary');
  const cancelBtn=btn(RTS.t('exp_cancel'), ()=>{expCancel=true;},'secondary');
  cancelBtn.disabled=true; bRow.appendChild(startBtn); bRow.appendChild(cancelBtn);
  el.appendChild(bRow);

  async function doExport(statusEl, progEl, sBtn, cBtn, sel){
    if(expRunning) return;
    expRunning=true; expCancel=false; sBtn.disabled=true; cBtn.disabled=false;
    dl.classList.add('hidden');
    progEl.classList.remove('hidden'); progEl.value=0;
    statusEl.textContent=RTS.t('exp_progress');
    let rec=null, player=null, stream=null;
    try{
      const canvas=RTS.Stage.getCanvas();
      if(!canvas.captureStream||!window.MediaRecorder) throw new Error('MediaRecorder/captureStream unsupported');
      const useClips=p.clips.filter(c=>c.kind==='audio'&&sel[c.id]);
      let audioBuffer=null, totalSec=5;
      if(useClips.length){
        statusEl.textContent=RTS.t('exp_progress')+' (audio)';
        const bufs=[];
        for(const c of useClips){
          if(expCancel) throw new Error('cancelled');
          const a=await RTS.DB.getAsset(c.audioId).catch(()=>null);
          if(a&&a.blob) bufs.push(await RTS.Mixer.process(a.blob, c.trimStart||0, c.trimEnd||0, c.volume==null?1:c.volume));
        }
        audioBuffer=await RTS.Mixer.concat(bufs);
        totalSec=audioBuffer?audioBuffer.duration:5;
      }
      stream=canvas.captureStream(30);
      let combined=stream;
      if(audioBuffer){
        const actx = RTS.LipSync._ensure();
        if(!actx) throw new Error('Web Audio unavailable');
        const dest=actx.createMediaStreamDestination();
        player=RTS.Mixer.playToStream(audioBuffer, dest);
        if(!player) throw new Error('Web Audio unavailable');
        combined=new MediaStream(stream.getVideoTracks().concat(dest.stream.getAudioTracks()));
      } else {
        RTS.Stage.setSpeaking(true,.4);
      }
      const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')?'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')?'video/webm':'' ;
      if(!mime) throw new Error('webm unsupported');
      rec=new MediaRecorder(combined,{mimeType:mime, videoBitsPerSecond:2500000});
      const out=[];
      rec.ondataavailable=e=>{if(e.data&&e.data.size)out.push(e.data);};
      const done=new Promise(res=>{ rec.onstop=res; });
      rec.start(500);
      const t0=Date.now();
      await new Promise((resolve,reject)=>{
        const iv=setInterval(()=>{
          if(expCancel){clearInterval(iv);reject(new Error('cancelled'));return;}
          const el=(Date.now()-t0)/1000;
          progEl.value=Math.min(99,Math.round(el/totalSec*100));
          if(el>=totalSec){clearInterval(iv);resolve();}
        },200);
      });
      if(rec.state!=='inactive') rec.stop();
      await done;
      const blob=new Blob(out,{type:mime});
      RTS.UI.offerDownload(blob, 'ruhtoon-'+(p.name||'scene').replace(/[^\w\-]+/g,'_')+'.webm');
      statusEl.textContent=RTS.t('exp_done');
    }catch(e){
      statusEl.textContent = (e.message==='cancelled')?RTS.t('exp_cancelled'):RTS.t('exp_failed')+(e.message||e);
    }
    try{ if(player)player.stop(); }catch(e){}
    try{ if(stream)stream.getTracks().forEach(t=>t.stop()); }catch(e){}
    RTS.Stage.setSpeaking(false,0);
    progEl.classList.add('hidden');
    expRunning=false; sBtn.disabled=false; cBtn.disabled=true;
  }
}

/* ================= SETTINGS ================= */
function renderSettings(el){
  el.innerHTML='';
  el.appendChild(h('h2',{text:RTS.t('set_title')}));
  el.appendChild(h('div',{class:'seg-label',text:RTS.t('set_language')}));
  const lRow=row();
  [['en','English'],['hi','हिन्दी']].forEach(l=>{
    lRow.appendChild(btn(l[1],()=>{RTS.setLang(l[0]);RTS.go('settings');}, RTS.lang===l[0]?'primary':'secondary'));
  });
  el.appendChild(lRow);
  // HuggingFace token (optional, user-owned)
  el.appendChild(h('div',{class:'seg-label',text:RTS.t('set_hf_token')}));
  const tokInp=h('input',{type:'password', value:RTS.AI.getToken(), placeholder:'hf_…'});
  el.appendChild(tokInp);
  el.appendChild(h('p',{class:'hint',text:RTS.t('set_hf_hint')}));
  el.appendChild(btn(RTS.t('saved'), ()=>{ RTS.AI.setToken(tokInp.value.trim()); toast(RTS.t('set_hf_saved')); },'secondary'));
  // Online
  el.appendChild(h('h3',{text:RTS.t('set_online_title')}));
  el.appendChild(h('p',{class:'hint',text:RTS.t('set_online_hint')}));
  el.appendChild(btn('🌐 '+RTS.t('set_online_open'), ()=>{ window.open(RTS.ONLINE_URL,'_blank'); },'secondary'));
  const upStatus=h('p',{class:'status',text:''});
  el.appendChild(btn('🔄 '+RTS.t('set_check_update'), ()=>{ RTS.checkForUpdates(upStatus); },'secondary'));
  el.appendChild(upStatus);
  el.appendChild(h('h3',{text:RTS.t('set_about')}));
  el.appendChild(h('p',{class:'hint',text:RTS.t('set_about_text')}));
  el.appendChild(h('h3',{text:RTS.t('set_help')}));
  el.appendChild(h('p',{class:'hint',text:RTS.t('set_help_text')}));
  const stInfo=h('p',{class:'status',text:'…'}); el.appendChild(stInfo);
  RTS.DB.usingFallback().then(fb=>{
    RTS.Project.list().then(pl=>{
      stInfo.textContent=RTS.t('set_storage')+': '+pl.length+' projects'+(fb?' (memory mode)':'');
    });
  });
  el.appendChild(btn(RTS.t('set_clear_all'), ()=>{
    if(!confirm(RTS.t('set_clear_confirm'))) return;
    RTS.DB.clearProjects().then(()=>RTS.DB.clearAssets()).then(()=>location.reload());
  },'danger'));
}

RTS.Screens = {
  home:{title:'nav_home', icon:'🏠', needsStage:false, render:renderHome},
  character:{title:'nav_character', icon:'🎭', needsStage:true, render:renderCharacter},
  scene:{title:'nav_scene', icon:'🎬', needsStage:true, render:renderSceneEditor},
  voice:{title:'nav_voice', icon:'🎙', needsStage:true, render:renderVoice},
  timeline:{title:'nav_timeline', icon:'🎞', needsStage:true, render:renderTimeline},
  export:{title:'nav_export', icon:'📤', needsStage:true, render:renderExport},
  settings:{title:'nav_settings', icon:'⚙', needsStage:false, render:renderSettings}
};
})();
