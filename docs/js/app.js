/* RuhToon Studio — router, tab bar, boot. */
(function(){
'use strict';

const ORDER = ['home','character','scene','voice','timeline','export','settings'];
let currentScreen = 'home';

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
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
