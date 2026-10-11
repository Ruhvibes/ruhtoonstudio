/* RuhToon Studio — audio: mic recorder, device TTS, amplitude lip-sync,
   trim/volume via OfflineAudioContext, clip concatenation for export. */
(function(){
'use strict';

/* ---------- Mic recorder ---------- */
const Rec = {
  _mr:null, _stream:null, _chunks:[],
  supported(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); },
  async start(){
    if (!Rec.supported()) throw new Error(RTS.t('voice_mic_unsupport'));
    Rec._stream = await navigator.mediaDevices.getUserMedia({audio:true});
    Rec._chunks = [];
    Rec._mr = new MediaRecorder(Rec._stream);
    Rec._mr.ondataavailable = e=>{ if(e.data && e.data.size) Rec._chunks.push(e.data); };
    Rec._mr.start();
  },
  stop(){
    return new Promise(resolve=>{
      const mr = Rec._mr;
      if (!mr || mr.state!=='recording'){ Rec._cleanup(); return resolve(null); }
      mr.onstop = ()=>{
        const blob = new Blob(Rec._chunks, {type: mr.mimeType||'audio/webm'});
        Rec._cleanup(); resolve(blob);
      };
      try{ mr.stop(); }catch(e){ Rec._cleanup(); resolve(null); }
    });
  },
  _cleanup(){ try{ if(Rec._stream) Rec._stream.getTracks().forEach(t=>t.stop()); }catch(e){} Rec._stream=null; Rec._mr=null; },
  recording(){ return !!(Rec._mr && Rec._mr.state==='recording'); }
};

/* ---------- Device TTS ---------- */
const TTS = {
  supported(){ return ('speechSynthesis' in window); },
  voices(){
    if (!TTS.supported()) return [];
    try{ return speechSynthesis.getVoices()||[]; }catch(e){ return []; }
  },
  speak(text, opt){
    opt=opt||{};
    return new Promise(resolve=>{
      if (!TTS.supported()){ (opt.onerror||function(){})(new Error('nosupport')); return resolve(false); }
      try{
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text||'Hello!');
        u.lang = opt.lang||'en-US';
        if (opt.rate!=null) u.rate = opt.rate;
        if (opt.pitch!=null) u.pitch = opt.pitch;
        const vs = TTS.voices();
        if (opt.voiceIndex!=null && vs[opt.voiceIndex]) u.voice = vs[opt.voiceIndex];
        else {
          const match = vs.find(v=>v.lang===u.lang)||vs.find(v=>v.lang&&v.lang.startsWith(u.lang.slice(0,2)));
          if (match) u.voice = match;
        }
        u.onstart = ()=>{ if(opt.onstart) opt.onstart(); };
        u.onend = ()=>{ if(opt.onend) opt.onend(); resolve(true); };
        u.onerror = ()=>{ if(opt.onerror) opt.onerror(); resolve(false); };
        speechSynthesis.speak(u);
      }catch(e){ if(opt.onerror) opt.onerror(e); resolve(false); }
    });
  },
  cancel(){ try{ if(TTS.supported()) speechSynthesis.cancel(); }catch(e){} }
};

/* ---------- Amplitude lip-sync (real, via AnalyserNode) ---------- */
const LipSync = {
  _ctx:null, _analyser:null, _source:null, _data:null, _el:null,
  _ensure(){
    if (!LipSync._ctx){
      const AC = window.AudioContext||window.webkitAudioContext;
      if (!AC) return null;
      LipSync._ctx = new AC();
    }
    if (LipSync._ctx.state==='suspended') LipSync._ctx.resume().catch(()=>{});
    return LipSync._ctx;
  },
  // Attach an <audio> element. extraDest: optional MediaStreamDestination for export.
  attach(audioEl, extraDest){
    LipSync.detach();
    const ctx = LipSync._ensure(); if(!ctx) return false;
    try{
      LipSync._el = audioEl;
      LipSync._source = ctx.createMediaElementSource(audioEl);
      LipSync._analyser = ctx.createAnalyser();
      LipSync._analyser.fftSize = 512;
      LipSync._data = new Uint8Array(LipSync._analyser.fftSize);
      LipSync._source.connect(LipSync._analyser);
      LipSync._analyser.connect(ctx.destination);
      if (extraDest) LipSync._source.connect(extraDest);
      return true;
    }catch(e){ LipSync.detach(); return false; }
  },
  amplitude(){
    if (!LipSync._analyser) return 0;
    try{
      LipSync._analyser.getByteTimeDomainData(LipSync._data);
      let sum=0;
      for(let i=0;i<LipSync._data.length;i++){ const v=(LipSync._data[i]-128)/128; sum+=v*v; }
      const rms = Math.sqrt(sum/LipSync._data.length);
      return Math.max(0, Math.min(1, (rms-0.015)*6));
    }catch(e){ return 0; }
  },
  detach(){
    try{ if(LipSync._source) LipSync._source.disconnect(); }catch(e){}
    try{ if(LipSync._analyser) LipSync._analyser.disconnect(); }catch(e){}
    LipSync._source=null; LipSync._analyser=null; LipSync._data=null; LipSync._el=null;
  },
  // Drive RTS.Stage mouth from analyser each frame; call stop() when done.
  drive(){
    let alive=true;
    function tick(){
      if(!alive) return;
      RTS.Stage.setSpeaking(true, LipSync.amplitude());
      requestAnimationFrame(tick);
    }
    tick();
    return { stop(){ alive=false; RTS.Stage.setSpeaking(false,0); LipSync.detach(); } };
  }
};

/* ---------- Trim / volume / concat (OfflineAudioContext) ---------- */
async function decodeBlob(blob){
  const AC = window.OfflineAudioContext||window.webkitOfflineAudioContext;
  const buf = await blob.arrayBuffer();
  // Use a temp offline ctx just for decoding
  const tmp = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1, 1, 44100);
  return tmp.decodeAudioData(buf);
}

const Mixer = {
  // Apply trim (seconds) + volume gain -> new WAV-ish blob (webm/opus via MediaRecorder not needed; return AudioBuffer)
  async process(blob, trimStart, trimEnd, volume){
    const src = await decodeBlob(blob);
    trimStart=Math.max(0,trimStart||0); trimEnd=trimEnd||src.duration;
    trimEnd=Math.min(src.duration, Math.max(trimStart+0.05, trimEnd));
    const sr=src.sampleRate, ch=Math.min(2,src.numberOfChannels||1);
    const len=Math.floor((trimEnd-trimStart)*sr);
    const AC = window.OfflineAudioContext||window.webkitOfflineAudioContext;
    const ctx = new AC(ch, Math.max(1,len), sr);
    const out = ctx.createBuffer(ch, Math.max(1,len), sr);
    for(let c=0;c<ch;c++){
      const d=src.getChannelData(Math.min(c,src.numberOfChannels-1));
      const o=out.getChannelData(c);
      const off=Math.floor(trimStart*sr), v=(volume==null?1:volume);
      for(let i=0;i<o.length && off+i<d.length;i++) o[i]=d[off+i]*v;
    }
    return out;
  },
  // Concatenate decoded buffers -> single AudioBuffer
  async concat(buffers){
    if(!buffers.length) return null;
    const sr=buffers[0].sampleRate, ch=Math.max.apply(null,buffers.map(b=>b.numberOfChannels));
    let total=0; buffers.forEach(b=>{ total+=Math.floor(b.duration*sr); });
    const AC = window.OfflineAudioContext||window.webkitOfflineAudioContext;
    const ctx = new AC(Math.min(2,ch), Math.max(1,total), sr);
    const out = ctx.createBuffer(Math.min(2,ch), Math.max(1,total), sr);
    let off=0;
    buffers.forEach(b=>{
      const n=Math.floor(b.duration*sr);
      for(let c=0;c<out.numberOfChannels;c++){
        const src=b.getChannelData(Math.min(c,b.numberOfChannels-1));
        out.getChannelData(c).set(src.subarray(0,Math.min(n,src.length)), off);
      }
      off+=n;
    });
    return out;
  },
  // Play an AudioBuffer through a MediaStreamDestination (for export). Returns {source, stop}.
  playToStream(audioBuffer, streamDest){
    const ctx = LipSync._ensure(); if(!ctx||!audioBuffer) return null;
    const src = ctx.createBufferSource(); src.buffer=audioBuffer;
    const analyser = ctx.createAnalyser(); analyser.fftSize=512;
    src.connect(analyser); analyser.connect(streamDest);
    try{ analyser.connect(ctx.destination); }catch(e){} // user hears it during export too
    // also drive mouth
    const data=new Uint8Array(analyser.fftSize);
    let alive=true;
    src.start();
    (function tick(){
      if(!alive) return;
      try{
        analyser.getByteTimeDomainData(data);
        let s=0; for(let i=0;i<data.length;i++){const v=(data[i]-128)/128;s+=v*v;}
        const rms=Math.sqrt(s/data.length);
        RTS.Stage.setSpeaking(true, Math.max(0,Math.min(1,(rms-0.015)*6)));
      }catch(e){}
      requestAnimationFrame(tick);
    })();
    src.onended=()=>{ alive=false; RTS.Stage.setSpeaking(false,0); };
    return { source:src, stop(){ alive=false; try{src.stop();}catch(e){} RTS.Stage.setSpeaking(false,0); } };
  },
  decodeBlob: decodeBlob
};

/* ---------- AI voice provider (optional, user token — zero budget) ----------
   Abstraction: device TTS is the default. If the user pastes their own
   HuggingFace token in Settings, an "AI (needs your HF token)" voice becomes
   available via the HF Inference API (free tier). No keys are shipped. */
const AI = {
  TOKEN_KEY: 'rts_hf_token',
  MODEL: 'suno/bark-small',
  getToken(){ try{ return localStorage.getItem(AI.TOKEN_KEY)||''; }catch(e){ return ''; } },
  setToken(t){ try{ if(t) localStorage.setItem(AI.TOKEN_KEY,t); else localStorage.removeItem(AI.TOKEN_KEY); }catch(e){} },
  hasToken(){ return AI.getToken().length>10; },
  // Returns Promise<Blob> of synthesized speech. Throws honest errors.
  async synthesize(text){
    const token = AI.getToken();
    if (!token) throw new Error('no-token');
    const ctrl = new AbortController();
    const to = setTimeout(()=>ctrl.abort(), 90000);
    try{
      const res = await fetch('https://api-inference.huggingface.co/models/'+AI.MODEL, {
        method:'POST',
        headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json' },
        body: JSON.stringify({inputs: text}),
        signal: ctrl.signal
      });
      if (res.status===503) throw new Error('model-loading');
      if (res.status===401 || res.status===403) throw new Error('bad-token');
      if (!res.ok) throw new Error('http-'+res.status);
      const blob = await res.blob();
      if (!blob || !blob.size) throw new Error('empty');
      return blob;
    } finally { clearTimeout(to); }
  }
};

window.RTS = window.RTS || {};
RTS.Rec=Rec; RTS.TTS=TTS; RTS.LipSync=LipSync; RTS.Mixer=Mixer; RTS.AI=AI;
})();
