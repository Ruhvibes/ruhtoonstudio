/* RuhToon Studio — offline cache for the online (GitHub Pages) version.
   Only registers on http(s); the APK WebView (file://) skips it. */
const CACHE='ruhtoon-v2';
const CORE=[
  './','./index.html','./manifest.json',
  './css/main.css',
  './js/i18n.js','./js/db.js','./js/stage.js','./js/audio.js',
  './js/project.js','./js/ui.js','./js/app.js',
  './js/lib/three.min.js','./js/lib/GLTFLoader.js'
];
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>r)));
});
