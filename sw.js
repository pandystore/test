/* بيمبو جرد — Service Worker (jard-v10) - مسح نهائي حقيقي + أونلاين فقط
   - البرنامج أونلاين فقط بدون حفظ بيانات محلية
   - المسح يمسح الكاش في كل المتصفحات
   - الإشعارات شغالة حتى مع minimize
*/
const CACHE = 'jard-v10';
const CORE = [
  './',
  './index.html'
];

let swNotifEnabled = false;
let swLastTs = Date.now();
let pollTimer = null;
const POLL_MIN = 8000, POLL_MAX = 60000;
let pollInterval = POLL_MIN;

function startPolling(){
  if (pollTimer) clearTimeout(pollTimer);
  pollInterval = POLL_MIN;
  scheduleNextPoll();
  pollNotifs();
}
function stopPolling(){
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}
function scheduleNextPoll(){
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => { await pollNotifs(); scheduleNextPoll(); }, pollInterval);
}

async function pollNotifs(){
  if (!swNotifEnabled) return;
  try {
    const res = await fetch('https://jard-86baf-default-rtdb.firebaseio.com/jard/notifs.json?orderBy="$key"&limitToLast=15', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data) { pollInterval = Math.min(POLL_MAX, Math.round(pollInterval * 1.5)); return; }
    const items = Object.values(data).filter(Boolean);
    items.sort((a,b)=> (a.ts||0)-(b.ts||0));
    let gotNew = false;
    for (const ev of items) {
      const ts = Number(ev.ts)||0;
      if (ts && ts <= swLastTs) continue;
      if (ev.role === 'admin') continue;
      if (ts) swLastTs = Math.max(swLastTs, ts);
      gotNew = true;
      try {
        await self.registration.showNotification(
          '📦 جرد جديد — ' + (ev.by||'مستخدم'),
          {
            body: (ev.name||'صنف') + '\nالكود: ' + (ev.code||'') + ' | الكمية: ' + (ev.qty||'') + '\nبواسطة: ' + (ev.by||''),
            tag: 'jard-' + (ts||Date.now()),
            renotify: true,
            requireInteraction: false,
            data: { url: './' }
          }
        );
      } catch(e){}
    }
    pollInterval = gotNew ? POLL_MIN : Math.min(POLL_MAX, Math.round(pollInterval * 1.3));
  } catch(e){
    pollInterval = Math.min(POLL_MAX, Math.round(pollInterval * 1.5));
  }
}

self.addEventListener('install', e => {
  e.waitUntil(
    (async ()=>{
      const c = await caches.open(CACHE);
      for (const u of CORE) {
        try { await c.add(u); } catch(err){}
      }
      await self.skipWaiting();
    })()
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('firebasedatabase.app') || url.hostname.includes('googleapis.com')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res=>{ try{ caches.open(CACHE).then(c=>c.put('./index.html', res.clone())); }catch(err){} return res; }).catch(()=>caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit=> hit || fetch(req))
  );
});

self.addEventListener('message', e => {
  const d = e.data||{};
  if (d.type === 'JARD_NOTIF') {
    swNotifEnabled = !!d.enabled;
    if (typeof d.lastTs === 'number' && d.lastTs > swLastTs) swLastTs = d.lastTs;
    if (swNotifEnabled) startPolling();
    else stopPolling();
  } else if (d.type === 'JARD_PING') {
    if (swNotifEnabled) pollNotifs();
  } else if (d.type === 'JARD_WIPE_CACHE') {
    caches.keys().then(keys=>{ keys.forEach(k=>{ if(k.startsWith('jard-')) caches.delete(k); }); });
  } else if (d.type === 'JARD_TEST') {
    self.registration.showNotification('🔔 بيمبو - اختبار', { body: 'الإشعارات شغالة ✅', tag: 'jard-test-'+Date.now() });
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list=>{
      for (let i=0;i<list.length;i++){ const c=list[i]; if(c.url.includes('/jard') && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
