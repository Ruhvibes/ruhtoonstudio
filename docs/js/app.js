/* RuhToon Studio — router, tab bar, boot. */
(function(){
'use strict';

const ORDER = ['home','character','scene','voice','timeline','export','settings'];
let currentScreen = 'home';
RTS.APP_VERSION_CODE = 1;
RTS.ONLINE_URL = 'https://ruhvibes.github.io/ruhtoonstudio/';
RTS.APK_URL = 'https://github.com/Ruhvibes/ruhtoonstudio/releases/download/v1/RuhToonStudio.apk';

function updateNetDot(){
  const d = document.querySelector('#netDot'); if(!d) return;
  const on = navigator.onLine !== false;
  d.textContent = on ? '🟢' : '🔴';
  d.title = RTS.t(on ? 'net_online' : 'net_offline');
}

function buildTabbar(){
  const bar = document.querySelector('#tabbar');
  bar.innerHTML='';
  ORDER.forEach(id=>{
    const s = RTS.Screens[id];
    const b = document.createElement('button');
    b.innerHTML = '<span class="ic">'+s.icon+'</span><span>'+RTS.t(s.title)+'</span>';
    b.addEventListener('click', ()=>RTS.go(id));
    b.dataset.screen=id;
    bar.appendChild(b);
  });
}

function applyI18n(){
  document.querySelector('#appTag').textContent = RTS.t('app_tag');
  document.querySelector('#langBtn').textContent = RTS.lang==='hi' ? 'हिं' : 'EN';
  document.querySelectorAll('#tabbar button').forEach(b=>{
    const s = RTS.Screens[b.dataset.screen];
    b.innerHTML = '<span class="ic">'+s.icon+'</span><span>'+RTS.t(s.title)+'</span>';
    b.classList.toggle('active', b.dataset.screen===currentScreen);
  });
}

RTS.go = function(id){
  if (!RTS.Screens[id]) id='home';
  if (id!==currentScreen && typeof RTS.stopTimeline==='function'){ try{ RTS.stopTimeline(); }catch(e){} }
  currentScreen=id;
  applyI18n();
  const s=RTS.Screens[id];
  const wrap=document.querySelector('#stageWrap');
  wrap.style.display = s.needsStage? '' : 'none';
  if (s.needsStage && RTS.Project.current()) RTS.applyProjectToStage().catch(()=>{});
  const el=document.querySelector('#screen');
  try{ s.render(el); }
  catch(e){
    el.innerHTML='';
    const p=document.createElement('p'); p.className='status';
    p.textContent=RTS.t('err_generic')+(e.message||e); el.appendChild(p);
  }
  document.querySelectorAll('#tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.screen===id));
  window.scrollTo(0,0);
};

async function boot(){
  buildTabbar();
  document.querySelector('#langBtn').addEventListener('click', ()=>{
    RTS.setLang(RTS.lang==='hi'?'en':'hi');
    applyI18n(); RTS.go(currentScreen);
  });
  // init 3D stage
  try{
    RTS.Stage.init(document.querySelector('#stage'), document.querySelector('#stageWrap'));
    document.querySelector('#stageFallback').classList.add('hidden');
  }catch(e){
    document.querySelector('#stageFallback').textContent = '3D unavailable: '+(e.message||e);
  }
  // recover last project
  const rec = await RTS.Project.recover().catch(()=>({recovered:false}));
  if (rec.recovered){
    const note=document.querySelector('#recoverNote');
    note.textContent=RTS.t('home_recover'); note.classList.remove('hidden');
    await RTS.applyProjectToStage().catch(()=>{});
    applyI18n();
    RTS.go('character');
  } else {
    applyI18n();
    RTS.go('home');
  }
  // service worker (http(s) only; file:// in WebView skips gracefully)
  if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  // online/offline indicator
  updateNetDot(); applyI18n();
  window.addEventListener('online', updateNetDot);
  window.addEventListener('offline', updateNetDot);
}

RTS.checkForUpdates = async function(statusEl){
  const set = (k)=>{ if(statusEl) statusEl.textContent = RTS.t(k); };
  set('set_update_checking');
  try{
    const ctrl = new AbortController();
    const to = setTimeout(()=>ctrl.abort(), 15000);
    const res = await fetch('https://raw.githubusercontent.com/Ruhvibes/ruhtoonstudio/main/version.json?t='+Date.now(), {signal:ctrl.signal, cache:'no-store'});
    clearTimeout(to);
    if(!res.ok) throw new Error('http-'+res.status);
    const j = await res.json();
    const remote = parseInt(j.versionCode||0, 10);
    if(remote > RTS.APP_VERSION_CODE){
      if(statusEl){
        statusEl.innerHTML='';
        const b=document.createElement('button');
        b.className='btn primary'; b.textContent=RTS.t('set_update_available')+' '+RTS.t('set_update_apk');
        b.addEventListener('click',()=>window.open(RTS.APK_URL,'_blank'));
        statusEl.appendChild(b);
      }
      return 'available';
    }
    set('set_update_latest');
    return 'latest';
  }catch(e){ set('set_update_error'); return 'error'; }
};

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
