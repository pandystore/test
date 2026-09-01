/* ============================================================
   البيانات كلها على Firebase (أصناف/مستخدمين/إعدادات/سجل) — أونلاين بالكامل.
   مفيش أي localStorage في البرنامج خالص. التخزين الوحيد المؤقت هو sessionStorage
   (جلسة الدخول + هوية الجهاز) عشان تحديث الصفحة مايطلّعش المستخدم بره، وده بيتمسح
   لوحده أوتوماتيك لما تقفل التبويب/المتصفح — مفيش أي بيانات بتفضل على الجهاز بعد كده.
============================================================ */
const store = (() => {
  /* التخزين الوحيد: هوية الجهاز + جلسة الدخول، وبقى sessionStorage مش localStorage —
     يعني بيتمسح لوحده لما تقفل التبويب/المتصفح، ومفيش أي بيانات بتتخزن دائم على الجهاز.
     كل حاجة تانية (الأصناف، المستخدمين، الإعدادات) مصدرها Firebase أونلاين بس. */
  const PERSIST = { deviceId: 'jard::deviceId', sessionUser: 'jard::sessionUser', lastWipe: 'jard::lastWipe', notifEnabled: 'jard::notifEnabled', lastNotifTs: 'jard::lastNotifTs' };
  const mem = new Map(); /* ذاكرة داخلية لكل حاجة تانية */
  return {
    getItem: k => {
      if (k in PERSIST) { try { return sessionStorage.getItem(PERSIST[k]); } catch (e) { return mem.has(k) ? mem.get(k) : null; } }
      return mem.has(k) ? mem.get(k) : null;
    },
    setItem: (k, v) => {
      v = String(v);
      if (k in PERSIST) { try { sessionStorage.setItem(PERSIST[k], v); } catch (e) {} }
      mem.set(k, v);
    },
    removeItem: k => {
      if (k in PERSIST) { try { sessionStorage.removeItem(PERSIST[k]); } catch (e) {} }
      mem.delete(k);
    },
    clear: () => {
      try { Object.keys(PERSIST).forEach(k => sessionStorage.removeItem(PERSIST[k])); } catch (e) {}
      mem.clear();
    }
  };
})();
/* تنظيف لمرة واحدة لأي بقايا من نسخ قديمة كانت بتخزن على localStorage —
   البرنامج مش بيكتب على localStorage خالص بعد كده، النظافة دي بس عشان تمسح القديم */
(function purgeLegacyLS(){
  try {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      /* مفاتيح البرنامج القديمة بس — مفاتيح أي موقع تاني على نفس الدومين متتلمسش */
      if (/^jard::/.test(k) || /^(inventoryData|localRev|logBook|selectedDateTime|customLogo|adminHash|usersList|sessionUser|firebaseCfg|soundOn|lockOnOpen|syncPath|deviceId|branchesList|branch)(::.*)?$/.test(k)) kill.push(k);
    }
    kill.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
  } catch (e) {}
})();

const FIREBASE_CONFIG = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey !== undefined) ? window.FIREBASE_CONFIG : { apiKey: "", authDomain: "", databaseURL: "", projectId: "", appId: "" };

/* ---------- بوابة التحميل: على الطلب بس — مش بتظهر إلا للأدمن لما يكون البرنامج باقي محتاج كونفيج ---------- */
function bootShow(){
  if (document.getElementById('bootGate')) return;
  const d = document.createElement('div');
  d.id = 'bootGate';
  d.style.cssText = 'position:fixed;inset:0;background:#f8fafc;z-index:700;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:Cairo,Tahoma,sans-serif';
  d.innerHTML =
    '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:1.25rem;padding:2rem;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,.1)">' +
    '<div id="bootTitle" style="font-weight:800;font-size:1.05rem;color:#1f2937;margin-bottom:.4rem">جاري الاتصال بقاعدة البيانات...</div>' +
    '<div id="bootMsg" style="font-size:.75rem;color:#94a3b8;margin-bottom:1rem">بنجيب أحدث البيانات من السيرفر</div>' +
    '<div style="font-size:1.6rem" id="bootIcon">⏳</div>' +
    '<div id="bootCfgWrap" style="display:none;margin-top:1rem;text-align:right">' +
    '<div style="font-size:.72rem;font-weight:700;color:#475569;margin-bottom:.3rem">البرنامج الأول على الجهاز ده — الصق بيانات Firebase هنا (مرة واحدة):</div>' +
    '<textarea id="bootCfg" placeholder=\'{"apiKey":"...","databaseURL":"...","projectId":"..."}\' style="width:100%;min-height:100px;font-size:.68rem;direction:ltr;text-align:left;border:1px solid #e2e8f0;border-radius:.5rem;padding:.5rem;font-family:monospace"></textarea>' +
    '<button id="bootCfgBtn" style="width:100%;margin-top:.5rem;background:#2563eb;color:#fff;border:none;border-radius:.5rem;padding:.6rem;font-weight:700;cursor:pointer">ربط واستمرار</button></div>' +
    /* لو التحميل طول: زرار إعادة يدوية + نصايح تظهر تلقائي (نقطة 12 — الوقوف على بوابة التحميل) */
    '<button id="bootRetry" style="display:none;margin-top:.9rem;background:#2563eb;color:#fff;border:none;border-radius:.5rem;padding:.55rem 1.4rem;font-weight:800;cursor:pointer;font-family:inherit">🔄 إعادة المحاولة الآن</button>' +
    '<div id="bootTips" style="display:none;margin-top:.9rem;font-size:.7rem;color:#64748b;text-align:right;line-height:2;border-top:1px dashed #e2e8f0;padding-top:.7rem">' +
    '<b style="color:#334155">لو التحميل واقف كتير، جرّب بالترتيب:</b><br>' +
    '1️⃣ اتأكد إن الإنترنت شغال على الجهاز (افتح أي موقع تاني).<br>' +
    '2️⃣ لو النت شغال: افتح الرابط في متصفح تاني أو نافذة تصفح خفي.<br>' +
    '3️⃣ الأدمن يراجع Firebase Console ← Realtime Database ← Rules إنها مفتوحة (<span dir="ltr">.read / .write = true</span>).<br>' +
    '4️⃣ اتأكد إن Anonymous Auth متفعل في Firebase ← Authentication.</div>' +
    '</div>';
  const attach = () => { if (document.body) document.body.appendChild(d); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}
function bootMsg(t){ const m = document.getElementById('bootMsg'); if (m) m.textContent = t; }
function bootHide(){ const g = document.getElementById('bootGate'); if (g) g.remove(); }

/* ---------- شاشة كبيرة في النص (حجب/رفض) — للجلسات والتبويبات ---------- */
function bigBlock(icon, title, sub, btnLabel, onBtn){
  document.querySelectorAll('.big-block-ov').forEach(x => x.remove());
  const ov = document.createElement('div');
  ov.className = 'big-block-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.94);z-index:800;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:Cairo,Tahoma,sans-serif';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:1.25rem;padding:2.2rem 2rem;max-width:430px;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.5)">' +
    '<div style="font-size:3.2rem;margin-bottom:.5rem">' + icon + '</div>' +
    '<div style="font-size:1.6rem;font-weight:900;color:#b91c1c;margin-bottom:.6rem;line-height:1.5">' + title + '</div>' +
    (sub ? '<div style="font-size:.95rem;color:#475569;margin-bottom:1.3rem;line-height:2">' + sub + '</div>' : '<div style="margin-bottom:1.3rem"></div>') +
    (btnLabel ? '<button class="big-block-btn" style="background:#2563eb;color:#fff;border:none;border-radius:.6rem;padding:.8rem 1.8rem;font-weight:800;font-size:1.05rem;cursor:pointer;font-family:inherit">' + btnLabel + '</button>' : '') +
    '</div>';
  document.body.appendChild(ov);
  if (btnLabel) ov.querySelector('.big-block-btn').onclick = onBtn || (() => ov.remove());
  return ov;
}

/* ---------- قفل التبويبات: البرنامج يشتغل في تبويب واحد بس على نفس الجهاز ---------- */
function tabGuard(proceed){
  try {
    if (!('BroadcastChannel' in window)) { proceed(); return; }
    /* القناة لازم تفضل محفوظة في مكان دائم — لو ضاعت من السكوب بيتمسحها الـ GC ويموت القفل */
    if (window.__jardTabCh) { window.__jardTabCh.close(); window.__jardTabCh = null; }
    const ch = window.__jardTabCh = new BroadcastChannel('jard-tabs');
    const myId = 'tab-' + Math.random().toString(36).slice(2, 9);
    let decided = false, active = false;
    ch.onmessage = ev => {
      const m = ev.data || {};
      if (m.t === 'ping' && active && m.id !== myId) ch.postMessage({ t: 'pong', to: m.id });
      if (m.t === 'pong' && m.to === myId && !decided && !active) {
        decided = true;
        bigBlock('🖥️', 'البرنامج مفتوح بالفعل على الجهاز ده',
          'فيه تبويب أو نافذة تانية شغالة في نفس اللحظة.<br>البرنامج بيمنع التشغيل في مكانين على نفس الجهاز عشان الجرد مايتلخبطش.',
          '✋ اشتغل هنا واقفل التبويب التاني', () => {
            try { ch.postMessage({ t: 'takeover' }); } catch (e) {}
            document.querySelectorAll('.big-block-ov').forEach(x => x.remove());
            active = true;
            proceed();
          });
      }
      if (m.t === 'takeover' && active) {
        active = false;
        try { stopCameraScanner(); } catch (e) {}
        try { releaseSession(); } catch (e) {}
        bigBlock('🖥️', 'البرنامج اتقفل من هنا',
          'اتفتح من تبويب تاني على نفس الجهاز — الجلسة اتنقلت هناك.<br>عايز ترجع؟ اقفل التبويب التاني وحدّث الصفحة.',
          'حسنًا', () => {});
      }
    };
    ch.postMessage({ t: 'ping', id: myId });
    setTimeout(() => { if (!decided) { decided = true; active = true; proceed(); } }, 400);
  } catch (e) { proceed(); }
}

/* تنبيه مرئي عند أي خطأ في الصفحة بدل الفشل الصامت */
window.addEventListener('error', function (e) {
  try {
    var box = document.getElementById('toasts');
    if (!box || !e || !e.message) return;
    var t = document.createElement('div');
    t.className = 'toast error';
    t.textContent = 'خطأ في الصفحة: ' + e.message;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 7000);
  } catch (err) {}
});

const LOGO_URI = "data:image/png;base64,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";
const NOTE_SVG = '<svg class="ic" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>';

/* ---------- الحالة العامة ---------- */
/* مفيش فروع — قاعدة واحدة jard */
function fbRoot(){ return 'jard'; }
function fbPath(){ return 'jard'; }
function S(k){ return k; }

/* رجوع قطع من ::jard للمفاتيح النظيفة (كان فيه ترميم كاش قديم) */
(function fixStorageKeys(){
  ['inventoryData','localRev','logBook','selectedDateTime','customLogo','adminHash','usersList'].forEach(k => {
    const withSuffix = store.getItem(k + '::jard');
    if (withSuffix !== null && store.getItem(k) === null) store.setItem(k, withSuffix);
  });
})();

let inventoryData = []; /* يبدأ فاضي - البيانات من Firebase فقط */
let currentCategory = 'all';
let currentStatus = 'all';
let workbookData = null, sheetNames = [], isCsvSource = false, csvRows = [];
let selectedSerials = new Set();
let undoHistory = [];
let logBook = JSON.parse(store.getItem(S('logBook')) || '[]');
let soundOn = store.getItem('soundOn') !== '0';
let adminHash = store.getItem(S('adminHash')) || '';
let lockOnOpen = store.getItem('lockOnOpen') !== '0';
let usersList = JSON.parse(store.getItem(S('usersList')) || '[]');
let sessionUser = JSON.parse(store.getItem('sessionUser') || 'null');
let userFilter = '';
let qrScanner = null, qrScanCount = 0, qrCamOn = false;
let firebaseCfgLS = JSON.parse(store.getItem('firebaseCfg') || 'null');
/* ملحوظة: المرجع الفعلي لمسار المزامنة = fbPath() — متغير syncPath القديم اتحذف */
let db = null, syncOn = false, refOff = null, pushTimer = null;
let lastPushRev = 0, lastRemoteRev = 0;
let editingCount = 0, pendingRemote = false;
let failCount = 0, lockUntil = 0;
/* نقطة 3: حماية شاشة الدخول الرئيسية من التخمين — 5 محاولات غلط = قفل دقيقة */
let loginFails = 0, loginLockUntil = 0;
/* نقطة 4: صلاحية الأدمن متتصدّقش من التخزين — لازم باسورد متكتوب صح في تحميل الصفحة ده */
let adminAuthedLive = false;
let pendingOfflinePush = false;
let pendingMetaPush = false;
/* ختم نسخة المستخدمين: الأحدث على السيرفر هو القانون — كده الحذف بينفّد ومفيش مستخدم محذوف يرجع لوحده */
let lastUsersRev = 0;
let lastWipeRev = 0; /* بيتظبط أول ما نتصل بـ Firebase من meta.lastWipeRev — مفيش تخزين محلي دائم */
/* null = لسه منعرفش | true/false = آخر حالة اتصال حقيقية من فايربيس */
let fbConnected = null;
let lastSyncErr = '';
let accessDenied = false; /* السيرفر رفض الوصول فعليًا — مش بس انقطاع نت */
let connectRetryTimer = null;
/* ---------- نظام الإشعارات الفورية (Desktop Notifications) للمسؤول ---------- */
let nextFullReplace = false;
let notifRef = null;
let notifOff = null;
let lastNotifTs = parseInt(store.getItem('lastNotifTs') || '0') || 0;
let notifPrompted = false;
/* رقم إصدار بياناتنا محليًا — عشان لو النت رجع ما يستبدلش شغل الأوفلاين بالقديم */
let localRev = parseInt(store.getItem(S('localRev')) || '0');
const deviceId = store.getItem('deviceId') || (() => { const id = 'dev-' + Math.random().toString(36).slice(2, 9); store.setItem('deviceId', id); return id; })();

/* ---------- أدوات عامة ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
/* يجبر الكود إنجليزي بس: يحوّل الأرقام العربية ٠١٢٣ لإنجليزية ويمنع أي حروف غير لاتينية */
function sanitizeCode(s){
  const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
  s = String(s == null ? '' : s);
  let out = '';
  for (const ch of s) {
    let i = AR.indexOf(ch); if (i !== -1) { out += String(i); continue; }
    i = FA.indexOf(ch); if (i !== -1) { out += String(i); continue; }
    if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) out += ch; /* ASCII بس */
  }
  return out.trim();
}
function fmtQ(n){ n = Number(n) || 0; return Number.isInteger(n) ? n : +n.toFixed(2); }
function parseQty(v){ const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }
function pad2(n){ return String(n).padStart(2, '0'); }
function nowLocalDT(){ const d = new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'T'+pad2(d.getHours())+':'+pad2(d.getMinutes()); }
function stamp(){ const d = new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'_'+pad2(d.getHours())+pad2(d.getMinutes()); }
function normData(arr){
  if (!Array.isArray(arr)) return [];
  return arr.map(i => ({
    serial: Number(i.serial) || 0,
    code: String(i.code == null ? '' : i.code),
    name: String(i.name == null ? '' : i.name),
    group: String(i.group || 'غير مصنف'),
    systemQuantity: Number(i.systemQuantity) || 0,
    actualQuantity: Number(i.actualQuantity) || 0,
    isJarded: !!i.isJarded,
    difference: Number(i.difference) || 0,
    status: String(i.status || 'متساوي'),
    note: String(i.note || ''),
    countedBy: String(i.countedBy || ''),
    counts: (i.counts && typeof i.counts === 'object') ? i.counts : {},
    conflict: !!i.conflict,
    editedAt: Number(i.editedAt) || 0,
    log: Array.isArray(i.log) ? i.log.slice(0, 10) : []
  }));
}
async function hashPass(p){
  try {
    if (crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bjrd::' + p));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  let h = 5381; const s = 'bjrd::' + p;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'fb' + h.toString(16);
}

/* ---------- الأصوات (بصمة زيبرا/UPOS الحقيقية) ---------- */
let AC = null, masterGain = null;
function audioCtx(){
  AC = AC || new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  if (!masterGain) {
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -4; comp.knee.value = 0; comp.ratio.value = 12;
    comp.attack.value = .001; comp.release.value = .08;
    masterGain = AC.createGain(); masterGain.gain.value = 1;
    masterGain.connect(comp); comp.connect(AC.destination);
  }
  return AC;
}
/* نغمة بظرف حاد: هجوم 2ms + قطع مفاجئ — سر صوت الـ piezo الحقيقي */
function tone(freq, start, dur, type, vol, sweepTo){
  const t0 = AC.currentTime + start;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur); /* الارتفاع السريع Zebra chirp */
  g.gain.setValueAtTime(.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + .002);
  g.gain.setValueAtTime(vol, t0 + dur - .004);
  g.gain.linearRampToValueAtTime(.0001, t0 + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t0); o.stop(t0 + dur + .02);
}
function beep(kind){
  if (!soundOn) return;
  try {
    audioCtx();
    if (kind === 'ok') {
      /* ✅ صوت السوبر ماركت — نغمة نقية 2093Hz (C7) قصيرة وواضحة + توافقية رابعة خفيفة للمعان */
      tone(2093, 0, .09, 'sine', 1);
      tone(2093 * 2, 0, .09, 'sine', .18);    /* لمعة علوية */
      tone(2093, 0, .09, 'square', .25);      /* جسم خفيف للنغمة */
    } else if (kind === 'unk') {
      /* ⚠️ كود غير معروف — chirp منخفض ثم عالي */
      tone(1300, 0, .06, 'square', .9, 2000);
      tone(2000, .08, .06, 'square', .9, 3100);
    } else if (kind === 'bad') {
      /* ❌ صوت الخطأ — هبوط سريع */
      tone(600, 0, .12, 'square', .75, 300);
      tone(1200, .13, .1, 'square', .4, 400);
    }
  } catch (e) {}
}
/* فك قفل الصوت على iOS/Chrome من أول لمسة */
function primeAudio(){
  if (!soundOn) return;
  try { audioCtx(); } catch (e) {}
}

/* ---------- التوست ---------- */
function toast(msg, type, opts){
  opts = opts || {};
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  const span = document.createElement('span'); span.textContent = msg;
  t.appendChild(span);
  let life = 3000, killed = false;
  const kill = () => { if (!killed) { killed = true; t.remove(); } };
  if (opts.actionLabel) {
    life = 10000;
    const b = document.createElement('button');
    b.className = 'act'; b.textContent = opts.actionLabel;
    b.onclick = () => { kill(); opts.onAction && opts.onAction(); };
    t.appendChild(b);
  }
  $('toasts').appendChild(t);
  setTimeout(kill, life);
}

/* ---------- مودالات عامة ---------- */
function closeModal(id){ $(id).style.display = 'none'; }
function showModal(title, bodyHTML, buttons, onDismiss){
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.style.zIndex = 150;
  const box = document.createElement('div'); box.className = 'modal-box';
  const h = document.createElement('h3'); h.className = 'modal-title'; h.textContent = title;
  const body = document.createElement('div'); body.innerHTML = bodyHTML;
  const foot = document.createElement('div'); foot.className = 'modal-foot';
  let closed = false;
  const close = () => { if (closed) return; closed = true; ov.remove(); if (onDismiss) onDismiss(); };
  (buttons || []).forEach(bd => {
    const b = document.createElement('button');
    b.className = 'mbtn ' + (bd.kind || 'ghost'); b.textContent = bd.label;
    b.onclick = () => { bd.onClick && bd.onClick(body, close); if (bd.autoClose !== false) close(); };
    foot.appendChild(b);
  });
  box.appendChild(h); box.appendChild(body); if (buttons && buttons.length) box.appendChild(foot);
  ov.appendChild(box);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  return { body, close };
}
function confirmDlg(title, text, okLabel, danger){
  return new Promise(res => {
    showModal(title, '<div style="font-size:.9rem;color:#475569;line-height:1.7">' + esc(text) + '</div>', [
      { label: okLabel || 'تأكيد', kind: danger ? 'danger' : 'primary', onClick: () => res(true) },
      { label: 'إلغاء', kind: 'ghost', onClick: () => res(false) }
    ], () => res(false));
  });
}
function inputDlg(title, ph, isPass){
  return new Promise(res => {
    const m = showModal(title, '<div class="fld"><input id="_dlgInp" type="' + (isPass ? 'password' : 'text') + '" placeholder="' + esc(ph || '') + '"></div>', [
      { label: 'تأكيد', kind: 'primary', onClick: (body) => res(body.querySelector('#_dlgInp').value || '') },
      { label: 'إلغاء', kind: 'ghost', onClick: () => res(null) }
    ], () => res(null));
    const inp = m.body.querySelector('#_dlgInp');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { res(inp.value || ''); m.close(); } });
    setTimeout(() => inp.focus(), 50);
  });
}

/* ---------- التحقق من كلمة المرور ---------- */
async function ensureAdmin(){
  if (!adminHash) {
    const p1 = await inputDlg('إنشاء كلمة مرور admin', 'أول مرة — اختر كلمة مرور', true);
    if (p1 === null) return false;
    if (p1.length < 3) { toast('كلمة المرور قصيرة (3 أحرف على الأقل)', 'error'); return false; }
    const p2 = await inputDlg('تأكيد كلمة المرور', 'أعد كتابة كلمة المرور', true);
    if (p1 !== p2) { toast('كلمتا المرور غير متطابقتين', 'error'); return false; }
    adminHash = await hashPass(p1);
    store.setItem(S('adminHash'), adminHash);
    pushMeta(false); /* اللوجو/الباسورد بس — مش بنلمس المستخدمين */
    addLog('تم إنشاء كلمة مرور admin');
    adminAuthedLive = true; /* نقطة 4: باسورد اتكتب صح */
    toast('تم إنشاء كلمة المرور بنجاح', 'success');
    return true;
  }
  if (Date.now() < lockUntil) { toast('محاولات كثيرة — انتظر 30 ثانية', 'error'); return false; }
  const p = await inputDlg('كلمة المرور', 'أدخل كلمة المرور', true);
  if (p === null) return false;
  if (await hashPass(p) === adminHash) { failCount = 0; adminAuthedLive = true; return true; }
  failCount++;
  if (failCount >= 5) { lockUntil = Date.now() + 30000; failCount = 0; }
  toast('كلمة مرور غير صحيحة', 'error');
  return false;
}

/* ---------- بيانات الدخول الافتراضية ---------- */
const DEFAULT_ADMIN = { user: 'admin', pass: '123456' };
/* يزرع مستخدم admin الافتراضي أول تشغيل — وبيتزامن على كل الأجهزة */
async function seedDefaultAdmin(){
  if (usersList.length) return;
  /* 🛡️ سؤال أخير للسيرفر قبل الزرع — لو فيه مستخدمين هناك خالص ناخدهم بدل ما نركب فوقهم */
  try {
    if (syncOn && db) {
      const snap = await db.ref(fbPath() + '/meta/users').get();
      const rv = snap.val();
      const arr = rv ? (Array.isArray(rv) ? rv : Object.values(rv)).filter(u => u && u.name) : [];
      if (arr.length) {
        usersList = arr;
        store.setItem(S('usersList'), JSON.stringify(usersList));
        addLog('استرجاع المستخدمين من السيرفر بدل الزرع: ' + arr.length + ' مستخدم');
        return;
      }
    }
  } catch (e) {}
  usersList = [{ name: DEFAULT_ADMIN.user, hash: await hashPass(DEFAULT_ADMIN.pass), role: 'admin', active: true }];
  store.setItem(S('usersList'), JSON.stringify(usersList));
  pushMeta(true);
  addLog('تم إنشاء المستخدم الافتراضي: admin');
}
/* هل اليوزر الافتراضي هو الوحيد الموجود؟ (لعرض تلميح الدخول) */
function isOnlyDefaultAdmin(){ return usersList.length === 1 && usersList[0].name === DEFAULT_ADMIN.user; }

/* ---------- تسجيل الدخول (مستخدمين) ---------- */
let loginRequiredExplicit = null; /* null = مفيش قرار صريح لسه (يرجع للسلوك القديم) | true/false = قرار الأدمن الصريح، متزامن على كل الأجهزة */
function loginRequired(){
  if (loginRequiredExplicit !== null) return loginRequiredExplicit;
  /* fallback قديم: الدخول مطلوب بس لما يكون فيه مستخدمين إضافيين فوق الـ admin الافتراضي */
  const extras = usersList.filter(u => u.name !== DEFAULT_ADMIN.user);
  return extras.length > 0 || (lockOnOpen && !!adminHash);
}
function isAdmin(){
  /* مفيش نظام مستخدمين مفعل = الكل مسؤول */
  if (!loginRequired()) return true;
  return sessionUser && sessionUser.role === 'admin';
}
/* مشرف أو أدمن: يقدر يستورد/يحذف/يطبع لكن مايديرش المستخدمين ولا الإعدادات الحساسة */
function isElevated(){
  if (!loginRequired()) return true;
  return sessionUser && (sessionUser.role === 'admin' || sessionUser.role === 'supervisor');
}
function currentUserName(){ return sessionUser ? sessionUser.name : 'بدون مستخدم'; }
function getUserRole(name){
  if (!name || name === 'بدون مستخدم') return '';
  if (name === 'admin') return 'admin';
  const u = usersList.find(x=> x.name === name);
  return u ? (u.role||'user') : 'user';
}
/* حارس العمليات شبه الإدارية (استيراد/حذف/طباعة): أدمن أو مشرف بس، مستخدم عادي ممنوع */
function needAdmin(){
  if (loginRequired() && !isElevated()) { toast('⛔ الصلاحية دي للمسؤول أو المشرف فقط', 'error'); return true; }
  return false;
}
/* حارس العمليات الحساسة جداً (مستخدمين/إعدادات أمان/مصنع): admin بس، حتى المشرف ممنوع */
function needFullAdmin(){
  if (loginRequired() && !isAdmin()) { toast('⛔ الصلاحية دي للمسؤول (admin) فقط', 'error'); return true; }
  return false;
}
function applyUserUI(){
  const line = $('userLine');
  const sb = $('settingsBtn');
  const lbl = $('currentUserLabel');
  if (sessionUser && loginRequired()) {
    if (line) line.style.display = 'flex';
    if (lbl) {
      const roleTxt = sessionUser.role === 'admin' ? ' (admin)' : (sessionUser.role === 'supervisor' ? ' (مشرف)' : '');
      lbl.textContent = '👤 ' + sessionUser.name + roleTxt;
    }
  } else if (line) line.style.display = 'none';
  const adm = isAdmin();
  const elev = isElevated();
  if (sb) sb.style.display = adm ? '' : 'none';
  ['btnExport', 'btnPrint', 'btnUpload', 'btnImport', 'btnClearAll', 'btnClearSel', 'btnUndoHist'].forEach(id => {
    const b = $(id); if (b) b.style.display = elev ? '' : 'none';
  });
  try {
    if (adm && sessionUser && syncOn) {
      if (store.getItem('notifEnabled') === '1' && window.Notification && Notification.permission === 'granted') {
        attachNotifListener();
      }
    } else {
      detachNotifListener();
    }
  } catch(e){}
}

function logoutUser(){
  if (sessionUser) addLog('خروج المستخدم: ' + sessionUser.name);
  releaseSession();
  sessionUser = null;
  adminAuthedLive = false;
  userFilter = '';
  store.removeItem('sessionUser');
  /* رجوع لشاشة الدخول مباشرة — من غير reload ومن غير شاشة "جاري الاتصال"، لأن البيانات لسه شغالة ومتزامنة */
  try { stopCameraScanner(); } catch (e) {}
  document.querySelectorAll('.modal-overlay, .big-block-ov, .lock-overlay').forEach(x => x.remove());
  applyUserUI();
  showLock();
}
/* ---------- خروج تلقائي بعد 10 دقائق خمول ---------- */
let idleTimer = null;
const IDLE_LIMIT = 30 * 60 * 1000; /* 30 دقيقة بدل 10 - طلب المستخدم */
function resetIdleTimer(){
  if (idleTimer) clearTimeout(idleTimer);
  if (!sessionUser) return;
  idleTimer = setTimeout(autoLogout, IDLE_LIMIT);
}
function autoLogout(){
  if (!sessionUser) return;
  addLog('خروج تلقائي للخمول: ' + sessionUser.name);
  releaseSession();
  sessionUser = null;
  adminAuthedLive = false;
  userFilter = '';
  store.removeItem('sessionUser');
  try { stopCameraScanner(); } catch (e) {}
  document.querySelectorAll('.modal-overlay, .big-block-ov, .lock-overlay').forEach(x => x.remove());
  applyUserUI();
  toast('⏱️ تم تسجيل الخروج تلقائيًا بعد 10 دقائق خمول', 'warning');
  showLock();
}
function setupIdleWatch(){
  /* أي نقرة/كتابة/لمس/مسح كاميرا بيصفّر عداد الـ 10 دقائق */
  ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'scroll', 'input', 'wheel'].forEach(ev =>
    document.addEventListener(ev, resetIdleTimer, { passive: true })
  );
  resetIdleTimer();
}
let mySessionRef = null;
function sessionKey(u){ return u.replace(/[.#$\[\]\/]/g, '_'); }
/* يمنع فتح نفس المستخدم من جهازين — يحجز الجلسة على Firebase */
async function claimSession(u){
  /* 📡 أوفلاين؟ دخول فوري من غير انتظار الشبكة خالص — المستخدم يشتغل،
     والحجز الحقيقي على السيرفر بيتم لوحده أول ما النت يرجع (connectFirebase بيعيد claimSession) */
  if (navigator && navigator.onLine === false) return { ok: true, soft: true };
  /* لو فيه كونفيج ومش متصل لسه: حاول تتصل بس بحد أقصى 2.5 ثانية — منحبسش اليوزر */
  if ((!syncOn || !db) && effectiveCfg() && effectiveCfg().apiKey) {
    await Promise.race([
      connectFirebase(true).catch(() => {}),
      new Promise(r => setTimeout(r, 2500))
    ]);
  }
  if (!syncOn || !db) return { ok: true, soft: true }; /* الاتصال متعذر → دخول مؤقت، والتشديد عند أول اتصال */
  /* الجلسة على مستوى الجذر — المستخدم مقفول لجهاز واحد حتى لو الفروع مختلفة */
  const ref = db.ref(fbRoot() + '/sessions/' + sessionKey(u.name));
  try {
    const snap = await ref.get();
    const v = snap.val();
    const now = Date.now();
    /* لو فيه جلسة نشطة (آخر نبضة قبل أقل من دقيقة وعشرين) على جهاز تاني → امنع */
    if (v && v.deviceId !== deviceId && v.ts && (now - v.ts) < 80000) {
      return { ok: false, since: v.ts, name: u.name };
    }
    await ref.set({ deviceId: deviceId, ts: firebase.database.ServerValue.TIMESTAMP, name: u.name });
    /* لو الصفحة اتقفلت/النت قطع: السيرفر بيمسح حجز الجلسة بنفسه — مفيش قفل معلق */
    try { ref.onDisconnect().remove(); } catch (e) {}
    /* نبضة كل 20 ثانية — بس لو الجلسة لسه موجودة؛ لو admin مسحها (طردني) أخرج على طول */
    if (window.__sessBeat) clearInterval(window.__sessBeat);
    const forceOut = () => {
      if (!sessionUser || !loginRequired()) return;
      addLog('تم طرد الجلسة بواسطة admin: ' + sessionUser.name);
      sessionUser = null;
      store.removeItem('sessionUser');
      bigBlock('⛔', 'تم إنهاء جلستك',
        'الأدمن سجّل خروجك من الجهاز ده.<br>لو ده حصل بالخطأ، كلم المسؤول وادخل من جديد.',
        'حسنًا — دخول من جديد', () => logoutUser());
    };
    window.__sessBeat = setInterval(async () => {
      try {
        const s = await ref.get();
        if (s.val() === null) { clearInterval(window.__sessBeat); window.__sessBeat = null; forceOut(); return; }
        await ref.update({ ts: firebase.database.ServerValue.TIMESTAMP });
      } catch (e) {}
    }, 20000);
    /* مراقبة فورية: لو الجلسة اتمسحت دلوقتي → شيك فورًا */
    try { if (window.__sessWatch) window.__sessWatch(); } catch (e) {}
    window.__sessWatch = ref.on('value', snap => {
      if (snap.val() !== null) return;
      if (!sessionUser || !loginRequired()) return;
      setTimeout(() => { ref.get().then(c => { if (c.val() === null) forceOut(); }).catch(() => {}); }, 1200);
    });
    mySessionRef = ref;
    return { ok: true };
  } catch (e) { return { ok: true }; } /* فشل الاتصال = نسمح */
}
function releaseSession(){
  if (window.__sessBeat) { clearInterval(window.__sessBeat); window.__sessBeat = null; }
  if (window.__sessWatch) { try { window.__sessWatch(); } catch (e) {} window.__sessWatch = null; }
  if (mySessionRef) {
    try { mySessionRef.onDisconnect().cancel(); } catch (e) {}
    mySessionRef.remove().catch(() => {});
    mySessionRef = null;
  }
}
/* نقطة 9+4: استرجاع الجلسة بعد تحديث الصفحة — بس بعد ما السيرفر يأكد:
   (1) المستخدم لسه موجود ومش موقوف (2) مفيش جهاز تاني ماسك الحساب دلوقتي */
async function validateSavedSession(){
  if (!sessionUser) return false;
  let live = null;
  if (sessionUser.name === DEFAULT_ADMIN.user && sessionUser.role === 'admin') {
    live = { name: DEFAULT_ADMIN.user, role: 'admin' }; /* حساب الأدمن الافتراضي */
  } else {
    live = usersList.find(x => x.name === sessionUser.name) || null;
  }
  if (!live || live.active === false) {
    sessionUser = null; store.removeItem('sessionUser');
    return false;
  }
  /* جدّد الصلاحية من نسخة السيرفر — التخزين المحلي مش مصدر ثقة (نقطة 4) */
  sessionUser = { name: live.name, role: live.role || 'user' };
  store.setItem('sessionUser', JSON.stringify(sessionUser));
  const claim = await claimSession(sessionUser);
  if (!claim.ok) {
    const takenName = sessionUser.name;
    sessionUser = null; store.removeItem('sessionUser');
    return 'taken:' + takenName;
  }
  return true;
}
/* ---------- طرد مستخدم من جهازه (للمسؤول) ---------- */
async function kickUserOut(userName){
  if (!syncOn || !db) { toast('لازم تكون متصل بالإنترنت عشان تطرد مستخدم', 'error'); return false; }
  try {
    await db.ref(fbRoot() + '/sessions/' + sessionKey(userName)).remove();
    toast('✅ اتطرد ' + userName + ' — جهازه هيسجل خروج خلال ثواني', 'success');
    addLog('طرد يدوي: ' + userName);
    return true;
  } catch (e) {
    toast('فشل الطرد: ' + (e.message || 'خطأ'), 'error');
    return false;
  }
}
async function getOnlineSessions(){
  if (!syncOn || !db) return [];
  try {
    const snap = await db.ref(fbRoot() + '/sessions').get();
    const v = snap.val() || {};
    const now = Date.now();
    return Object.entries(v)
      .filter(([, s]) => s && s.ts && (now - s.ts) < 80000)
      .map(([k, s]) => ({ key: k, name: s.name || k, ts: s.ts, deviceId: s.deviceId }));
  } catch (e) { return []; }
}


/* ---------- نظام الإشعارات الفورية للمسؤول (Desktop - WhatsApp style) ---------- */
function tellSW(msg){
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(reg=>{
        if (reg.active) reg.active.postMessage(msg);
      }).catch(()=>{});
    }
  } catch(e){}
}
let swPingTimer = null;
function startSwPing(){
  if (swPingTimer) clearInterval(swPingTimer);
  swPingTimer = setInterval(()=>{ tellSW({type:'JARD_PING'}); }, 15000);
}
function stopSwPing(){
  if (swPingTimer) { clearInterval(swPingTimer); swPingTimer=null; }
}
function canShowNotif(){ return ('Notification' in window); }
function updateNotifUI(){
  const buttons = [document.getElementById('notifBtn'), document.getElementById('notifBtnSettings')].filter(Boolean);
  const hints = [document.getElementById('notifHint'), document.getElementById('notifHintSettings')].filter(Boolean);
  if (!buttons.length && !hints.length) return;
  if (!canShowNotif()) {
    buttons.forEach(b=>{ if(b){ b.textContent='🚫 المتصفح لا يدعم الإشعارات'; b.disabled=true; }});
    hints.forEach(h=>{ if(h) h.textContent='جرب Chrome أو Edge'; });
    return;
  }
  const perm = Notification.permission;
  const enabled = store.getItem('notifEnabled') === '1';
  buttons.forEach(btn=>{
    if(!btn) return;
    if (perm === 'granted' && enabled) {
      btn.textContent='🔔 الإشعارات مفعّلة ✅';
      btn.style.background='#16a34a';
    } else if (perm === 'denied') {
      btn.textContent='🚫 الإشعارات محظورة';
      btn.style.background='#ef4444';
    } else {
      btn.textContent='🔔 فعّل إشعارات الجرد على سطح المكتب';
      btn.style.background='#2563eb';
    }
  });
  hints.forEach(hint=>{
    if (!hint) return;
    if (perm === 'granted' && enabled) {
      hint.textContent='شغال ✅ - إشعار زي الواتساب حتى لو الصفحة متصغرة';
    } else if (perm === 'denied') {
      hint.textContent='مقفولة - افتح القفل 🔒 فوق واسمح بالإشعارات';
    } else {
      hint.textContent='اضغط الزر واسمح - هتظهر على الديسكتوب';
    }
  });
}
async function toggleNotif(){
  if (!canShowNotif()) { toast('المتصفح لا يدعم الإشعارات', 'error'); return; }
  if (Notification.permission === 'granted' && store.getItem('notifEnabled') === '1') {
    toast('✅ الإشعارات مفعّلة - سيب الصفحة مفتوحة', 'success');
    attachNotifListener();
    updateNotifUI();
    showJardNotification({by:'اختبار', role:'user', code:'TEST', name:'إشعار تجريبي - لو شفته على الديسكتوب يبقى تمام ✅', qty:1, ts:Date.now()}, true);
    return;
  }
  if (Notification.permission === 'denied') {
    toast('🚫 مانع الإشعارات من المتصفح - افتح القفل 🔒 فوق', 'error');
    updateNotifUI();
    return;
  }
  try {
    const p = await Notification.requestPermission();
    updateNotifUI();
    if (p === 'granted') {
      store.setItem('notifEnabled','1');
      toast('✅ تم تفعيل الإشعارات - هتوصلك حتى لو minimize', 'success');
      attachNotifListener();
      showJardNotification({by:'النظام', role:'user', code:'TEST', name:'الإشعارات شغالة ✅', qty:1, ts:Date.now()}, true);
    } else {
      store.setItem('notifEnabled','0');
    }
  } catch(e){ toast('تعذر طلب الإشعارات', 'error'); }
}
function showJardNotification(ev, isTest){
  if (!isTest && !isAdmin()) return;
  if (!canShowNotif()) return;
  if (Notification.permission !== 'granted') return;
  if (!isTest) {
    if (ev.by === (sessionUser && sessionUser.name)) return;
    if (ev.role === 'admin') return;
  }
  const title = isTest ? '🔔 بيمبو ستور - الجرد' : ('📦 جرد جديد — ' + ev.by);
  const body = isTest ? ev.name : ((ev.name || 'صنف') + ' \nالكود: ' + (ev.code||'') + ' | الكمية: ' + (ev.qty||'') + '\nبواسطة: ' + ev.by);
  const opts = { body: body, tag: 'jard-'+(ev.ts||Date.now()), renotify: true, requireInteraction: false, vibrate: [200,100,200], data: {url:'./'} };
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification(title, opts).catch(()=>{
          try { const n=new Notification(title, opts); n.onclick=()=>{window.focus(); n.close();}; setTimeout(()=>{try{n.close();}catch(e){}},8000);} catch(e){}
        });
      }).catch(()=>{
        try { const n=new Notification(title, opts); n.onclick=()=>{window.focus(); n.close();}; } catch(e){}
      });
    } else {
      const n=new Notification(title, opts);
      n.onclick=()=>{window.focus(); n.close();};
    }
  } catch(e){
    try { const n=new Notification(title, opts); n.onclick=()=>{window.focus(); n.close();}; } catch(e2){}
  }
  try { if (soundOn) beep('ok'); } catch(e){}
  if (!isTest) toast('🔔 ' + ev.by + ' جرد: ' + (ev.name||ev.code) + ' ×' + (ev.qty||1), 'info');
}
function pushCountNotif(item, delta, action){
  try {
    if (!syncOn || !db) return;
    if (!sessionUser) return;
    if (navigator && navigator.onLine === false) return;
    // حتى الأدمن يتتبع في سجل الجرد، لكن الإشعار الديسكتوب للجرد فقط
    const ev = {
      by: sessionUser.name,
      role: sessionUser.role || 'user',
      code: item.code,
      name: item.name,
      qty: item.actualQuantity,
      delta: delta || 1,
      action: action || 'count',
      ts: firebase.database.ServerValue.TIMESTAMP
    };
    db.ref(fbPath() + '/notifs').push(ev).catch(()=>{});
    // لو أدمن، احتفظ بآخر 150 حدث فقط
    if (isAdmin()) {
      try {
        db.ref(fbPath() + '/notifs').get().then(all=>{
          const v = all.val(); if (!v) return;
          const keys = Object.keys(v);
          if (keys.length > 200) {
            const sorted = Object.entries(v).sort((a,b)=> (a[1].ts||0)-(b[1].ts||0));
            const toDel = sorted.slice(0, keys.length - 150);
            toDel.forEach(([k])=>{ db.ref(fbPath() + '/notifs/' + k).remove().catch(()=>{}); });
          }
        });
      } catch(e){}
    }
  } catch(e){}
}
function attachNotifListener(){
  if (!isAdmin()) return;
  if (!syncOn || !db) return;
  if (store.getItem('notifEnabled') !== '1') return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (notifOff) { try{ notifOff(); }catch(e){} notifOff=null; }
  if (!lastNotifTs) { lastNotifTs = Date.now(); store.setItem('lastNotifTs', String(lastNotifTs)); }
  const ref = db.ref(fbPath() + '/notifs').orderByKey().limitToLast(30);
  const cb = ref.on('child_added', snap=>{
    const ev = snap.val(); if (!ev) return;
    const ts = Number(ev.ts) || Date.now();
    if (ts <= lastNotifTs) return;
    lastNotifTs = Math.max(lastNotifTs, ts);
    store.setItem('lastNotifTs', String(lastNotifTs));
    showJardNotification(ev, false);
  });
  notifOff = ()=>{ try{ ref.off('child_added', cb); }catch(e){} };
  tellSW({type:'JARD_NOTIF', enabled:true, lastTs:lastNotifTs});
  startSwPing();
}
function clearAllLocalCaches(){
  /* مبنمسحش sessionStorage كله عشان مش نطرد الأدمن من جلسته وهو بيمسح البيانات —
     الكاش الوحيد اللي محتاج ينمسح فعلياً هو كاش الـ Service Worker */
  try {
    if ('caches' in window) {
      caches.keys().then(keys=>{ keys.forEach(k=>{ if(k.startsWith('jard-')) caches.delete(k); }); });
    }
  } catch(e){}
  try { tellSW({type:'JARD_WIPE_CACHE'}); } catch(e){}
}
function detachNotifListener(){
  if (notifOff) { try{ notifOff(); }catch(e){} notifOff=null; }
  tellSW({type:'JARD_NOTIF', enabled:false});
  stopSwPing();
}


/* ---------- تعديل مستخدم: الاسم أو كلمة المرور ---------- */
async function editUser(i){
  const u = usersList[i];
  if (!u) return;
  const action = await new Promise(res => {
    showModal('تعديل "' + u.name + '"', '<div class="hint" style="font-size:.85rem">اختار اللي عايز تغيّره:</div>', [
      { label: '✏️ تغيير الاسم', kind: 'primary', onClick: () => res('name') },
      { label: '🔑 تغيير الباسورد', kind: 'primary', onClick: () => res('pass') },
      { label: '🏷️ تغيير الصلاحية', kind: 'primary', onClick: () => res('role') },
      { label: 'إلغاء', kind: 'ghost', onClick: () => res(null) }
    ], () => res(null));
  });
  if (!action) return;
  if (action === 'role') {
    if (u.name === DEFAULT_ADMIN.user) { toast('مايتغيرش صلاحية حساب admin الافتراضي', 'error'); return; }
    const roles = [
      { label: 'مستخدم (جرد فقط)', kind: 'ghost', onClick: () => res2('user') },
      { label: 'مشرف (جرد + استيراد + حذف + طباعة)', kind: 'primary', onClick: () => res2('supervisor') },
      { label: 'admin (كل الصلاحيات)', kind: 'primary', onClick: () => res2('admin') },
      { label: 'إلغاء', kind: 'ghost', onClick: () => res2(null) }
    ];
    let res2;
    const newRole = await new Promise(r => { res2 = r; showModal('صلاحية "' + u.name + '"', '<div class="hint" style="font-size:.85rem">الصلاحية الحالية: ' + (u.role || 'user') + '</div>', roles, () => r(null)); });
    if (!newRole) return;
    u.role = newRole;
    store.setItem(S('usersList'), JSON.stringify(usersList));
    pushMeta(true);
    addLog('تعديل صلاحية مستخدم: ' + u.name + ' → ' + newRole);
    toast('تم تغيير صلاحية ' + u.name, 'success');
    return;
  }
  if (action === 'name') {
    const nn = await inputDlg('اسم جديد للمستخدم', 'الاسم الحالي: ' + u.name);
    if (nn === null) return;
    const v = nn.trim();
    if (!v || v.length < 2) { toast('الاسم قصير', 'error'); return; }
    if (usersList.find((x, ix) => ix !== i && x.name === v)) { toast('الاسم ده موجود ليوزر تاني', 'error'); return; }
    const old = u.name;
    u.name = v;
    store.setItem(S('usersList'), JSON.stringify(usersList));
    pushMeta(true);
    addLog('تعديل اسم مستخدم: ' + old + ' → ' + v);
    toast('تم تغيير الاسم', 'success');
    return;
  }
  const np = await inputDlg('كلمة مرور جديدة لـ "' + u.name + '"', '3 أحرف على الأقل', true);
  if (np === null) return;
  if (np.length < 3) { toast('كلمة المرور قصيرة', 'error'); return; }
  u.hash = await hashPass(np);
  store.setItem(S('usersList'), JSON.stringify(usersList));
  pushMeta(true);
  addLog('تعديل كلمة مرور مستخدم: ' + u.name);
  toast('تم تغيير كلمة المرور لـ ' + u.name, 'success');
}
async function tryLogin(user, pass){
  const h = await hashPass(pass);
  if (user === '__admin__' || user === '') {
    if (adminHash && h === adminHash) return { name: 'admin', role: 'admin' };
    return null;
  }
  const u = usersList.find(x => x.name === user);
  if (u && u.active === false) return { blocked: true, name: u.name }; /* مستخدم موقوف */
  if (u && u.hash === h) return { name: u.name, role: u.role || 'user' };
  return null;
}
function showLock(){
  if (sessionUser) { applyUserUI(); return; }
  if (!loginRequired()) { applyUserUI(); return; }
  /* ممنوع شاشتين دخول فوق بعض — التكرار كان بيستخبى تحت ويحبس الصفحة حتى بعد نجاح الدخول */
  if (document.querySelector('.lock-overlay')) return;
  const hasUsers = usersList.length > 0;
  const ov = document.createElement('div');
  ov.className = 'lock-overlay';
  ov.innerHTML = '<div class="lock-card">' +
    '<img src="' + getLogo() + '" alt="">' +
    '<h2 class="sb-title">تسجيل الدخول — جرد الأصناف</h2>' +
    /* 📡 تنبيه ودّي: الدخول شغال أوفلاين عادي */
    ((navigator && navigator.onLine === false)
      ? '<div style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:.6rem;padding:.55rem .7rem;font-size:.78rem;font-weight:800;margin-bottom:.8rem;line-height:1.9">📡 النت مقطوع دلوقتي — سجّل دخولك عادي وكمّل جردك، وكل حاجة هتترفع لوحدها أول ما النت يرجع ✅</div>'
      : '') +
    /* نقطة 3: بانر أخطاء كبير وواضح جوه كارت الدخول نفسه */
    '<div id="lockMsg" style="display:none;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;border-radius:.6rem;padding:.55rem .7rem;font-size:.9rem;font-weight:800;margin-bottom:.8rem;line-height:1.8"></div>' +
    (hasUsers ? '<div class="fld"><input type="text" id="lockUser" placeholder="اسم المستخدم" autocomplete="username"></div>' : '') +
    '<div class="fld"><input type="password" id="lockInp" placeholder="كلمة المرور" autocomplete="current-password"></div>' +
    '<button class="mbtn primary" style="width:100%" id="lockBtn">دخول</button></div>';
  document.body.appendChild(ov);
  const inp = ov.querySelector('#lockInp');
  const uInp = ov.querySelector('#lockUser');
  const msg = ov.querySelector('#lockMsg');
  const say = t => { if (msg) { msg.textContent = t; msg.style.display = t ? 'block' : 'none'; } };
  let lockTicker = null;
  const startLockCountdown = () => {
    if (lockTicker) clearInterval(lockTicker);
    lockTicker = setInterval(() => {
      const left = Math.ceil((loginLockUntil - Date.now()) / 1000);
      if (left <= 0) { clearInterval(lockTicker); lockTicker = null; say(''); const btn = ov.querySelector('#lockBtn'); if (btn) btn.disabled = false; return; }
      say('⛔ محاولات دخول كتير غلط — القفل مؤقت للحماية. حاول بعد ' + left + ' ثانية');
    }, 500);
  };
  const tryOpen = async () => {
    /* نقطة 3: حماية من التخمين — 5 محاولات غلط = دقيقة قفل */
    if (Date.now() < loginLockUntil) { startLockCountdown(); return; }
    const uname = uInp ? uInp.value.trim() : '__admin__';
    const u = await tryLogin(uname, inp.value);
    if (u && u.blocked) {
      say('⛔ المستخدم "' + u.name + '" موقوف — راجع الأدمن');
      const c = ov.querySelector('.lock-card');
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      inp.value = ''; inp.focus();
      return;
    }
    if (u) {
      /* قفل "جهاز واحد بس" لكل مستخدم */
      const btn = ov.querySelector('#lockBtn');
      btn.disabled = true; btn.textContent = '⏳ جاري التحقق...';
      const claim = await claimSession(u);
      btn.disabled = false; btn.textContent = 'دخول';
      if (!claim.ok) {
        /* رسالة الرفض بحجم كبير في منتصف الشاشة (طلب المستخدم) */
        bigBlock('🚫', 'الحساب ده مفتوح على جهاز تاني',
          'المستخدم "<b>' + esc(u.name) + '</b>" شغال دلوقتي على جهاز آخر.<br>سجّل خروجه من هناك الأول، أو استنى حوالي دقيقة ونص ويسيب الجلسة لوحده.',
          'حاول تاني', () => { document.querySelectorAll('.big-block-ov').forEach(x => x.remove()); inp.focus(); });
        inp.value = '';
        return;
      }
      loginFails = 0; say('');
      if (u.role === 'admin') adminAuthedLive = true; /* نقطة 4: باسورد اتكتب صح دلوقتي في الجلسة دي */
      sessionUser = u;
      store.setItem('sessionUser', JSON.stringify(u));
      ov.remove();
      applyUserUI();
      resetIdleTimer();
      addLog('دخول المستخدم: ' + u.name + (claim && claim.soft ? ' (أوفلاين)' : ''));
      if (claim && claim.soft) {
        toast('أهلًا ' + u.name + ' — دلوقتي أوفلاين: كمّل جردك عادي وهيترفع لوحده أول ما النت يرجع 📡', 'warning');
      } else {
        toast('أهلًا ' + u.name, 'success');
      }
      updateOfflineBar();

    } else {
      loginFails++;
      const c = ov.querySelector('.lock-card');
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      if (loginFails >= 5) {
        loginFails = 0;
        loginLockUntil = Date.now() + 60000;
        const btn = ov.querySelector('#lockBtn'); if (btn) btn.disabled = true;
        addLog('⚠️ قفل مؤقت لشاشة الدخول: محاولات تخمين متكررة');
        startLockCountdown();
      } else {
        say('❌ اسم المستخدم أو كلمة المرور غلط — فاضل ' + (5 - loginFails) + ' محاولات قبل القفل المؤقت');
      }
      inp.value = ''; inp.focus();
    }
  };
  ov.querySelector('#lockBtn').onclick = tryOpen;
  [inp, uInp].forEach(el => el && el.addEventListener('keydown', e => { if (e.key === 'Enter') tryOpen(); }));
  setTimeout(() => (uInp || inp).focus(), 100);
}
function getLogo(){
  return store.getItem('customLogo') || LOGO_URI;
}
/* تصغير صورة اللوجو قبل التخزين — يرجع dataURL للـ callback */
function resizeLogoFile(file, done, fail){
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      const scale = Math.min(1, 220 / Math.max(img.width, img.height));
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const dataUrl = cv.toDataURL('image/png');
      if (dataUrl.length > 250000) { fail && fail(); return; }
      done(dataUrl);
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(file);
}
function applyLogo(src){
  const s = src || getLogo();
  document.querySelectorAll('.logo-wrap img, .lock-card img').forEach(im => { im.src = s; });
}
function pickNewLogo(){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    resizeLogoFile(f, dataUrl => {
      store.setItem(S('customLogo'), dataUrl);
      applyLogo(dataUrl);
      pushMeta(false);
      addLog('تم تغيير اللوجو');
      toast('تم تغيير اللوجو — بيتزامن على كل الأجهزة', 'success');
      const lp = document.querySelector('#logoPrev'); if (lp) lp.src = dataUrl;
    }, () => toast('الصورة كبيرة — جرب صورة أصغر', 'error'));
  };
  inp.click();
}
function resetLogo(){
  store.removeItem(S('customLogo'));
  applyLogo(LOGO_URI);
  pushMeta(false);
  toast('تمت استعادة اللوجو الأصلي', 'success');
}

/* ---------- فلترة البيانات ---------- */
function groupsList(){
  return [...new Set(inventoryData.map(i => i.group))].filter(g => g && g !== 'غير مصنف' && g !== 'غير معروف');
}
function getFiltered(){
  const search = $('smartSearch').value.toLowerCase();
  return inventoryData.filter(i => {
    const ms = i.code.toLowerCase().includes(search) || i.name.toLowerCase().includes(search);
    const mc = currentCategory === 'all' || i.group === currentCategory;
    /* الفلترة بالمستخدم: أصناف اللي هو جردها فعلًا — counts الأول وبعدين countedBy لتوافق القديم */
    if (userFilter) {
      const hasCounts = i.counts && Object.keys(i.counts).length > 0;
      const hasUser = hasCounts ? (i.counts[userFilter] !== undefined && Number(i.counts[userFilter]) > 0) : (i.countedBy === userFilter);
      if (!hasUser) return false;
    }
    let st = true;
    if (currentStatus === 'زيادة') st = i.status === 'زيادة';
    else if (currentStatus === 'عجز') st = i.status === 'عجز';
    else if (currentStatus === 'hide_equal') st = i.status !== 'متساوي';
    else if (currentStatus === 'not_jarded') st = !i.isJarded;
    return ms && mc && st;
  });
}

/* ---------- عرض الجدول ---------- */
let currentPage = 1;
const PAGE_SIZE = 100;
function updateTable(){
  const filtered = getFiltered();
  const groups = groupsList();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  let html = '';
  pageItems.forEach(item => {
    /* لو فلتر بمستخدم شغال → نعرض كميته هو بس (counts أول، لو مفيش نرجع لـ countedBy للبيانات القديمة) */
    const hasUCounts = userFilter && item.counts && Object.keys(item.counts).length > 0;
    const uQty = hasUCounts ? (Number(item.counts[userFilter]) || 0) : (userFilter && item.countedBy === userFilter ? item.actualQuantity : null);
    const dispAct = uQty !== null ? uQty : item.actualQuantity;
    const dispDiff = uQty !== null ? (uQty - item.systemQuantity) : item.difference;
    const dispStatus = uQty !== null ? (dispDiff > 0 ? 'زيادة' : dispDiff < 0 ? 'عجز' : 'متساوي') : item.status;
    const cls = dispStatus === 'زيادة' ? 'row-surplus' : dispStatus === 'عجز' ? 'row-deficit' : '';
    const sel = selectedSerials.has(item.serial);
    let opts = '<option value="غير مصنف"' + (item.group === 'غير مصنف' ? ' selected' : '') + '>غير مصنف</option>';
    if (item.group === 'غير معروف') opts += '<option value="غير معروف" selected>غير معروف</option>';
    groups.forEach(g => { opts += '<option value="' + esc(g) + '"' + (item.group === g ? ' selected' : '') + '>' + esc(g) + '</option>'; });
    html += '<tr class="' + cls + (sel ? ' selected-for-print' : '') + '" data-serial="' + item.serial + '">' +
      '<td class="tc no-print"><input type="checkbox" class="item-checkbox"' + (sel ? ' checked' : '') + '></td>' +
      '<td class="p3 txs fwb tc">' + item.serial + '</td>' +
      '<td class="p3 fw6">' + esc(item.code) + '</td>' +
      '<td class="p3 tsm" contenteditable="true" data-edit="name">' + esc(item.name) + '</td>' +
      '<td class="p3 txs"><select data-gsel class="rowselect">' + opts + '</select></td>' +
      '<td class="tc fwb" contenteditable="' + (userFilter ? 'false' : 'true') + '" data-qty="systemQuantity" data-cell="sys">' + fmtQ(item.systemQuantity) + '</td>' +
      '<td class="tc fwb tblue" contenteditable="' + (userFilter ? 'false' : 'true') + '" data-qty="actualQuantity" data-cell="act">' + fmtQ(dispAct) + '</td>' +
      '<td class="tc fwb" data-cell="diff">' + fmtQ(dispDiff) + '</td>' +
      '<td class="tc txs fwb" data-cell="status">' + esc(dispStatus) + '</td>' +
      '<td class="tc no-print"><button class="notebtn' + (item.note ? ' has-note' : '') + '" data-note title="ملاحظة">' + NOTE_SVG + '</button></td>' +
    '</tr>';
  });
  const tb = $('tableBody');
  if (tb) tb.innerHTML = html;
  const selAll = $('selectAll'); if (selAll) selAll.checked = filtered.length > 0 && filtered.every(i => selectedSerials.has(i.serial));
  renderPagerUI(filtered.length, totalPages);
}
function renderPagerUI(totalCount, totalPages){
  let bar = $('pagerBar');
  const tc = document.querySelector('.table-container');
  if (!bar && tc) {
    bar = document.createElement('div');
    bar.id = 'pagerBar';
    bar.className = 'no-print';
    bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:.6rem;padding:.6rem;font-size:.8rem;flex-wrap:wrap';
    tc.parentNode.insertBefore(bar, tc.nextSibling);
  }
  if (!bar) return;
  if (totalPages <= 1) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML =
    '<button class="sbtn b-slate" style="padding:.35rem .8rem" ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="goPage(currentPage-1)">◀ السابق</button>' +
    '<span style="font-weight:700">صفحة ' + currentPage + ' من ' + totalPages + ' (' + totalCount + ' صنف)</span>' +
    '<button class="sbtn b-slate" style="padding:.35rem .8rem" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goPage(currentPage+1)">التالي ▶</button>';
}
function goPage(p){
  currentPage = p;
  updateTable();
  const tc = document.querySelector('.table-container');
  if (tc) tc.scrollTop = 0;
}
function refreshRow(tr, item){
  tr.className = (item.status === 'زيادة' ? 'row-surplus' : item.status === 'عجز' ? 'row-deficit' : '') + (selectedSerials.has(item.serial) ? ' selected-for-print' : '');
  const d = tr.querySelector('[data-cell="diff"]'); if (d) d.textContent = fmtQ(item.difference);
  const s = tr.querySelector('[data-cell="status"]'); if (s) s.textContent = item.status;
}

/* ---------- الإحصائيات ---------- */
function updateStats(){
  const total = inventoryData.length;
  const jarded = inventoryData.filter(i => i.isJarded).length;
  $('completionPercent').textContent = (total ? ((jarded / total) * 100).toFixed(1) : 0) + '%';
  $('cardJarded').textContent = jarded;
  $('cardNotJarded').textContent = total - jarded;
  $('cardDeficit').textContent = inventoryData.filter(i => i.status === 'عجز').length;
  $('cardSurplus').textContent = inventoryData.filter(i => i.status === 'زيادة').length;

  const gs = {};
  inventoryData.forEach(i => {
    if (!gs[i.group]) gs[i.group] = { d: 0, s: 0 };
    if (i.status === 'عجز') gs[i.group].d++;
    if (i.status === 'زيادة') gs[i.group].s++;
  });
  let dH = '', sH = '';
  Object.keys(gs).forEach(g => {
    if (gs[g].d > 0) dH += '<div class="analysis-row"><span>' + esc(g) + '</span><span class="fwb">' + gs[g].d + ' صنف</span></div>';
    if (gs[g].s > 0) sH += '<div class="analysis-row"><span>' + esc(g) + '</span><span class="fwb">' + gs[g].s + ' صنف</span></div>';
  });
  const dg = $('deficitGroups'); if (dg) dg.innerHTML = dH || '<div style="font-size:9px;color:#9ca3af">لا يوجد عجز</div>';
  const sg = $('surplusGroups'); if (sg) sg.innerHTML = sH || '<div style="font-size:9px;color:#9ca3af">لا يوجد زيادة</div>';

  $('summarySystemQuantity').textContent = fmtQ(inventoryData.reduce((a, i) => a + i.systemQuantity, 0));
  $('summaryActualQuantity').textContent = fmtQ(inventoryData.reduce((a, i) => a + i.actualQuantity, 0));
  $('summaryDifference').textContent = fmtQ(inventoryData.reduce((a, i) => a + i.difference, 0));
}

/* ---------- الفلاتر ---------- */
function setUserFilter(name){
  userFilter = name || '';
  currentPage = 1;
  const chip = $('userChip');
  if (userFilter) { chip.classList.add('show'); $('userChipText').textContent = 'جرد: ' + userFilter; }
  else chip.classList.remove('show');
  updateTable();
}
function setStatusFilter(s){
  currentStatus = s;
  currentPage = 1;
  document.querySelectorAll('.filter-toolbar .filter-btn').forEach(b => b.classList.remove('active'));
  const map = { 'all': 'status-all', 'زيادة': 'status-plus', 'عجز': 'status-minus', 'hide_equal': 'status-ne', 'not_jarded': 'status-nj' };
  const el = $(map[s]); if (el) el.classList.add('active');
  document.querySelectorAll('#categoryButtonsContainer .filter-btn').forEach(b => { if (b.dataset.cat === currentCategory) b.classList.add('active'); });
  updateTable();
}
function setCategoryFilter(c){ currentCategory = c; currentPage = 1; renderCategoryButtons(); updateTable(); }
function renderCategoryButtons(){
  const box = $('categoryButtonsContainer');
  if (!box) return;
  const groups = [...new Set(inventoryData.map(i => i.group))].filter(Boolean);
  let html = '<button class="filter-btn' + (currentCategory === 'all' ? ' active' : '') + '" data-cat="all">الكل</button>';
  groups.forEach(g => { html += '<button class="filter-btn' + (currentCategory === g ? ' active' : '') + '" data-cat="' + esc(g) + '">' + esc(g) + '</button>'; });
  box.innerHTML = html;
}

/* ---------- منطق الجرد ---------- */
function calculateRow(item){
  item.difference = Math.round((item.actualQuantity - item.systemQuantity) * 100) / 100;
  item.status = item.difference > 0 ? 'زيادة' : item.difference < 0 ? 'عجز' : 'متساوي';
}
/* سجل تاريخ لكل صنف: آخر 10 تعديلات (مين عدّل، إمتى، أي حقل، من إيه لإيه) */
function logItemChange(item, field, from, to){
  const who = sessionUser ? sessionUser.name : 'بدون مستخدم';
  item.log = item.log || [];
  item.log.unshift({ t: Date.now(), by: who, f: field, from: from, to: to });
  if (item.log.length > 10) item.log.length = 10;
}
const FIELD_LABELS = { name: 'الاسم', group: 'المجموعة', note: 'ملاحظة', systemQuantity: 'كمية السيستم', actualQuantity: 'الكمية الفعلية' };
function updateField(serial, field, value){
  const item = inventoryData.find(x => x.serial === serial);
  if (!item) return;
  const v = String(value).trim();
  if (item[field] === v) return;
  logItemChange(item, field, item[field], v);
  item[field] = v;
  item.editedAt = Date.now();
  saveAndRefresh(false);
  if (field === 'group') { renderCategoryButtons(); updateStats(); }
}
function updateQty(serial, field, value, tr){
  const item = inventoryData.find(x => x.serial === serial);
  if (!item) return;
  const v = parseQty(value);
  if (item[field] === v) return;
  logItemChange(item, field, item[field], v);
  const prevQty = item.actualQuantity;
  const who = sessionUser ? sessionUser.name : '';
  const whoRole = sessionUser ? (sessionUser.role||'user') : 'user';
  if (field === 'systemQuantity') {
    item[field] = v;
  } else if (field === 'actualQuantity') {
    // أي تعديل على الفعلي يسمع فوراً للكل
    item.actualQuantity = v;
    item.isJarded = true;
    if (who) item.countedBy = who;
    // حدث الـ counts عشان الدمج مايضيعش التعديل
    item.counts = item.counts || {};
    if (whoRole === 'admin') {
      // تعديل الأدمن قانوني: يمسح باقي العد ويخلي الكمية كلها باسمه
      item.counts = {};
      if (who) item.counts[who] = v;
    } else {
      // مستخدم عادي: عدّل حصته هو بس، والباقي يفضل
      if (who) {
        // احسب مجموع حصص باقي المستخدمين غيري
        let sumOthers = 0;
        Object.keys(item.counts).forEach(u=>{ if (u!==who) sumOthers += Number(item.counts[u])||0; });
        // لو أنا عدلت الفعلي ككل، اعتبر ان حصتي = الفعلي الجديد - حصص الآخرين (لا تقل عن 0)
        const myNew = Math.max(0, v - sumOthers);
        item.counts[who] = myNew;
        // لو مفيش حصص تانية، الفعلي = حصتي
        if (sumOthers===0) item.actualQuantity = myNew;
        else item.actualQuantity = sumOthers + myNew;
      } else {
        item.actualQuantity = v;
      }
    }
  } else {
    item[field] = v;
  }
  item.editedAt = Date.now();
  calculateRow(item);
  if (tr) refreshRow(tr, item);
  touchLocal();
  if (whoRole === 'admin') {
    // تعديل الأدمن يكسب أي تعارض
    localRev = Date.now() + 3000;
    store.setItem(S('localRev'), String(localRev));
  }
  localSave();
  updateStats();
  schedulePush();
  // إشعار و تتبع
  try {
    if (field === 'actualQuantity' && who && v !== prevQty) {
      pushCountNotif(item, (v - prevQty), 'edit');
    }
  } catch(e){}
}
/* فحص رقم التحقق EAN/UPC — يكشف القراءة الناقصة من الكاميرا (مثل 3007653602 بدل 6223007653602) */
function eanOk(code){
  if (!/^\d+$/.test(code) || code.length < 8) return true; /* QR أو كود فيه حروف — نقبله زي ما هو */
  const d = code.split('').map(Number);
  const chk = d.pop();
  let s = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = (w === 3 ? 1 : 3)) s += d[i] * w;
  return (10 - (s % 10)) % 10 === chk;
}

let lastScanCode = '', lastScanTime = 0;
function processCode(code){
  code = sanitizeCode(code);
  if (!code) return;
  const nowTs = Date.now();
  if (code === lastScanCode && (nowTs - lastScanTime) < 1200) {
    toast('⏱️ نفس الكود اتسجل من ثانية — اتجاهل عشان مايتحسبش مرتين', 'warning');
    return;
  }
  lastScanCode = code; lastScanTime = nowTs;
  const who = sessionUser ? sessionUser.name : '';
  const item = inventoryData.find(i => i.code === code);
  let done = null, qty = 0;
  if (item) {
    const prevBy = item.countedBy;
    if (item.isJarded && who && prevBy && prevBy !== who) {
      item.counts = item.counts || {};
      item.counts[prevBy] = item.counts[prevBy] !== undefined ? item.counts[prevBy] : item.actualQuantity;
      item.counts[who] = (item.counts[who] || 0) + 1;
      toast('⚠️ "' + item.name + '" اتجرد بواسطة ' + prevBy + ' قبل كده — كميته كانت ' + fmtQ(item.actualQuantity), 'warning');
      addLog('تنبيه تعدد جرد: ' + item.code + ' بواسطة ' + prevBy + ' ثم ' + who);
    } else {
      item.counts = item.counts || {};
      if (prevBy === who || !prevBy) item.counts[who || 'بدون مستخدم'] = item.actualQuantity + 1;
    }
    const beforeQty = item.actualQuantity;
    item.actualQuantity = Math.round((item.actualQuantity + 1) * 100) / 100;
    logItemChange(item, 'actualQuantity', beforeQty, item.actualQuantity);
    item.isJarded = true;
    item.editedAt = Date.now();
    if (who) item.countedBy = who;
    calculateRow(item);
    beep('ok');
    done = item; qty = item.actualQuantity;
    // 🔔 إشعار فوري للمسؤول: مستخدم جرد فقط عدّ صنف
    try { if (sessionUser && sessionUser.role !== 'admin') pushCountNotif(item, 1); } catch(e){}
  } else {
    const ns = inventoryData.length ? Math.max.apply(null, inventoryData.map(i => i.serial)) + 1 : 1;
    const nv = { serial: ns, code: code, name: 'صنف جديد', group: 'غير معروف', systemQuantity: 0, actualQuantity: 1, isJarded: true, difference: 1, status: 'زيادة', note: '', countedBy: who, counts: who ? { [who]: 1 } : {}, conflict: false, editedAt: Date.now() };
    inventoryData.push(nv);
    beep('ok');
    if (!eanOk(code)) toast('⚠️ كود غير معروف واحتمال قراءة غلط (checksum مش سليم) — اتسجل كزيادة: ' + code, 'warning');
    else toast('كود غير معروف — اتسجل كزيادة: ' + code, 'warning');
    done = nv; qty = 1;
    renderCategoryButtons();
    try { if (sessionUser && sessionUser.role !== 'admin') pushCountNotif(nv, 1); } catch(e){}
  }
  touchLocal();
  localSave(); updateTable(); updateStats(); schedulePush();
  const ls = $('lastScan');
  if (ls && done) {
    ls.style.display = 'block';
    ls.textContent = '✓ ' + done.name + ' — الكمية الآن: ' + fmtQ(qty) + (who ? ' — بواسطة: ' + who : '');
  }
}

/* ---------- حفظ ومزامنة ---------- */
/* أي تعديل محلي بيحدث رقم الإصدار — لو النت رجع والسيرفر أقدم مننا هنتجاهله ونرفع شغلنا */
function touchLocal(){
  localRev = Date.now();
  store.setItem(S('localRev'), String(localRev));
}
function localSave(){
  // لا نحفظ بيانات الجرد محلياً - أونلاين فقط (مفيش أي تخزين محلي دائم للبرنامج)
}
/* ---------- لقطة الطوارئ: تخلي الريلود يفتح البرنامج حتى لو النت مقطوع ----------
   بتتجدد مع كل حركة (مسح/تعديل/استيراد) ومع كل تحديث يوصل من السيرفر */
let snapTimer = null;
function saveSnapshot(){
  // تم إلغاء حفظ اللقطة المحلية بناءً على طلب المستخدم - كل شيء أونلاين فقط
}
function hydrateSnapshot(){
  // تم إلغاء استرجاع اللقطة المحلية - البرنامج أونلاين فقط بدون كاش بيانات
  return false;
}
/* دمج شغل الأوفلاين مع آخر نسخة سيرفر: كل مستخدم ليه كيسه في counts،
   فمساهمتي أنا (اللي اتعملت والنت مقطوع) تفضل محلية، ومساهمات زمايلي من السيرفر الأحدث */
function mergeOfflineEdits(localItems, remoteItems, me){
  const remByCode = {};
  remoteItems.forEach(r => { remByCode[r.code] = r; });
  const out = [];
  const meRole = getUserRole(me);
  localItems.forEach(l => {
    const r = remByCode[l.code];
    delete remByCode[l.code];
    if (!r) { out.push(l); return; }
    const rRole = getUserRole(r.countedBy);
    const lRole = getUserRole(l.countedBy);
    const rTs = Number(r.editedAt) || 0;
    const lTs = Number(l.editedAt) || 0;
    // لو الريموت من أدمن واللوكال من مستخدم عادي → الريموت يكسب، لكن بس لو تعديل الأدمن فعلاً
    // نفس وقت التعديل المحلي أو أحدث منه (مش مجرد لأنه أدمن قديماً). لو مفيش وقت معروف
    // للتعديلين (بيانات قديمة قبل هذا الإصلاح) بنرجع للسلوك القديم كـ fallback آمن.
    if (rRole === 'admin' && lRole !== 'admin' && meRole !== 'admin' && (rTs >= lTs || (!rTs && !lTs))) {
      calculateRow(r);
      out.push(r);
      return;
    }
    // لو اللوكال من أدمن والريموت من مستخدم → اللوكال يكسب بنفس الشرط
    if (lRole === 'admin' && rRole !== 'admin' && meRole === 'admin' && (lTs >= rTs || (!rTs && !lTs))) {
      calculateRow(l);
      out.push(l);
      return;
    }
    // دمج عادي: كل واحد يحتفظ بحصته
    const counts = Object.assign({}, r.counts || {});
    Object.keys(l.counts || {}).forEach(u => {
      if (u === me || counts[u] === undefined) counts[u] = l.counts[u];
    });
    const m = Object.assign({}, r);
    m.counts = counts;
    if (Object.keys(counts).length) {
      const tot = Object.keys(counts).reduce((a, u) => a + (Number(counts[u]) || 0), 0);
      // لو الريموت كان تعديل يدوي من أدمن (actual != sum counts) وكان أحدث من (أو نفس وقت) تعديلي المحلي → نحترم actual بتاعه
      const remoteSum = Object.keys(r.counts||{}).reduce((a,u)=>a+(Number(r.counts[u])||0),0);
      if (rRole === 'admin' && Math.abs(r.actualQuantity - remoteSum) > 0.01 && (rTs >= lTs || (!rTs && !lTs))) {
        m.actualQuantity = r.actualQuantity;
        m.counts = r.counts;
        m.countedBy = r.countedBy;
      } else {
        m.actualQuantity = Math.round(tot * 100) / 100;
        m.isJarded = true;
        if (me) m.countedBy = me;
        // لو آخر تعديل فعلاً من أدمن وأحدث من تعديلي، خليه countedBy أدمن
        if (rRole === 'admin' && rTs >= lTs) m.countedBy = r.countedBy;
      }
      m.isJarded = true;
    } else {
      // مفيش counts، استخدم الأحدث تعديلاً فعليًا (مش بس الدور) عشان تعديل جديد ما يتبلعش من نسخة قديمة
      if (rTs && lTs) {
        if (rTs >= lTs) { m.actualQuantity = r.actualQuantity; m.countedBy = r.countedBy || l.countedBy; }
        else { m.actualQuantity = l.actualQuantity; m.countedBy = l.countedBy || r.countedBy; }
      } else if (rRole === 'admin') {
        // fallback لبيانات قديمة مفيهاش وقت تعديل مسجل
        m.actualQuantity = r.actualQuantity; m.countedBy = r.countedBy || l.countedBy;
      } else {
        m.actualQuantity = l.actualQuantity; m.countedBy = l.countedBy || r.countedBy;
      }
      m.isJarded = r.isJarded || l.isJarded;
    }
    m.editedAt = Math.max(rTs, lTs);
    if (me && l.note) m.note = l.note;
    if (r.note && rRole === 'admin') m.note = r.note;
    // دمج سجل التاريخ من الجهازين (مش سجل جانب واحد بس) وإزالة أي تكرار
    const mergedLog = (r.log || []).concat(l.log || []);
    const seenT = new Set();
    m.log = mergedLog.filter(h => { const k = h.t+'|'+h.f+'|'+h.by; if (seenT.has(k)) return false; seenT.add(k); return true; })
      .sort((a,b) => b.t - a.t).slice(0, 10);
    calculateRow(m);
    out.push(m);
  });
  Object.keys(remByCode).forEach(c => out.push(remByCode[c]));
  return out;
}
function saveAndRefresh(rebuildCats){
  touchLocal();
  localSave();
  updateTable();
  updateStats();
  if (rebuildCats !== false) renderCategoryButtons();
  schedulePush();
}

/* دالى مجدول للـ meta — لو مش متصل بنعلمها وتترفع لما الاتصال يقوم */
function scheduleMetaPush(){
  if (syncOn && db) pushMeta(true);
  else pendingMetaPush = true;
}
/* ---------- Firebase ---------- */
/* قراءة الإعدادات بأمان حتى لو السكربت المعزول فيه خطأ أو المستخدم لصق const firebaseConfig كاملة */
/* تنضيف قيمة كونفيج حتى لو اتلصقت بزبالة الماركداون [x](url) */
function cleanCfgVal(v){
  v = String(v == null ? '' : v).trim();
  const m = v.match(/\[([^\]]*)\]\(([^)]*)\)/);
  if (m) v = (m[1] || '').trim() || (m[2] || '').trim();
  return v.replace(/[\[\]()]/g, '').trim();
}
function normCfg(c){
  if (!c) return null;
  const o = {};
  Object.keys(c).forEach(k => { o[k] = cleanCfgVal(c[k]); });
  return o;
}
const FIREBASE_CONFIG_BOOT = (function(){
  let c = null;
  try { if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) c = window.FIREBASE_CONFIG; } catch (e) {}
  try { if (!c && typeof firebaseConfig !== 'undefined' && firebaseConfig && firebaseConfig.apiKey) c = firebaseConfig; } catch (e) {}
  if (!c || !cleanCfgVal(c.apiKey)) return null;
  return normCfg(c);
})();
function effectiveCfg(){ return (FIREBASE_CONFIG_BOOT && FIREBASE_CONFIG_BOOT.apiKey) ? FIREBASE_CONFIG_BOOT : firebaseCfgLS; }
/* يستخرج بيانات فايربيس من أي صيغة ملصوقة: JSON أو const firebaseConfig = {...} أو نص فيه لينكات ماركداون */
function parseCfgLoose(txt){
  txt = String(txt || '').trim();
  if (!txt) return null;
  /* تنظيف لينكات الماركداون مثل [text](url) -> text — أو لو الرابط هو المطلوب ناخده */
  txt = txt.replace(/\[([^\]]*)\]\(([^)]*)\)/g, function (m, label, url) {
    label = label.trim(); url = url.trim();
    if (/^https?:\/\//.test(label)) return label;
    if (/^https?:\/\//.test(url)) return label || url;
    return label || url;
  });
  try { const c = JSON.parse(txt); if (c && c.apiKey) return c; } catch (e) {}
  try {
    let t = txt.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    /* كانون المفاتيح غير المتنصصة apiKey: -> "apiKey": */
    t = t.replace(/([{,\s])([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
    t = t.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1');
    /* التقط الجسم المحيط بـ apiKey بالظبط (يتجاهل import و const) */
    let ai = t.indexOf('"apiKey"');
    if (ai === -1) ai = t.indexOf('apiKey');
    if (ai === -1) return null;
    const start = t.lastIndexOf('{', ai);
    if (start === -1) return null;
    let depth = 0, end = -1;
    for (let i = start; i < t.length; i++) {
      if (t[i] === '{') depth++;
      else if (t[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return null;
    const c = JSON.parse(t.slice(start, end + 1));
    if (c && c.apiKey) return c;
  } catch (e) {}
  return null;
}
function loadScript(src){
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
function setSyncUI(state, txt){
  document.querySelectorAll('[data-syncdot]').forEach(d => { d.className = 'sync-dot ' + (state === 'on' ? 'on' : state === 'mid' ? 'mid' : ''); });
  if (txt) document.querySelectorAll('[data-synctext]').forEach(t => t.textContent = txt);
}function flashDot(){
  document.querySelectorAll('[data-syncdot]').forEach(d => { d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); });
  const d = new Date();
  const el = $('syncTime'); if (el) el.textContent = 'آخر مزامنة ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
/* ---------- بانر حالة الاتصال — يفرّق بين قطع نت عادي (مطمّن) ورفض السيرفر (تحذير حقيقي) ---------- */
function updateOfflineBar(){
  let bar = $('offlineBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'offlineBar';
    bar.style.cssText = 'display:none;position:fixed;bottom:1rem;right:50%;transform:translateX(50%);color:#fff;font-size:.82rem;font-weight:800;padding:.55rem 1.1rem;border-radius:999px;box-shadow:0 10px 15px -3px rgba(0,0,0,.2);z-index:390;max-width:92vw;text-align:center;line-height:1.8';
    document.body.appendChild(bar);
  }
  const midOffline = bootDone && (navigator.onLine === false || fbConnected === false);
  if (accessDenied) {
    /* السيرفر رفض الاتصال فعلياً (مش مجرد نت مقطوع) — تحذير أوضح ودائم لحد ما يتحل */
    bar.style.background = '#b91c1c';
    bar.innerHTML = '⚠️ <b>السيرفر رفض الاتصال</b> — شغلك بيتسجل عندك بس مش بيوصل السيرفر. افتح الإعدادات ← الاتصال والمزامنة';
    bar.style.display = 'block';
  } else if (midOffline) {
    bar.style.background = '#b45309';
    bar.innerHTML = '📡 النت قطع — <b>كمّل جردك عادي</b>. كل حاجة بتتسجل وهتترفع لوحدها أول ما النت يرجع ✅';
    bar.style.display = 'block';
  } else {
    bar.style.display = 'none';
  }
}
async function connectFirebase(silent, retryCount){
  const cfg = effectiveCfg();
  if (!cfg || !cfg.apiKey) { setSyncUI('off', 'وضع محلي'); return false; }
  setSyncUI('mid', 'جاري الاتصال...');
  try {
    if (typeof firebase === 'undefined') {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-database-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    /* دخول مجهول صامت — بيفتح القاعدة للأجهزة صاحبة البرنامج فقط */
    try { await firebase.auth().signInAnonymously(); } catch (e) {}
    db = firebase.database();
    try { db.setPersistenceEnabled && db.setPersistenceEnabled(true); } catch (e) {}
    try {
      db.ref('.info/connected').on('value', s => {
        const wasOff = fbConnected === false;
        if (s.val() === true) {
          fbConnected = true;
          setSyncUI('on', 'متصل — مزامنة حية');
          /* النت رجع؟ ارفع المعلّق لوحده فورًا — بس بعد ما نكون شفنا نسخة السيرفر (الدمج مسؤولية h1) */
          if (pendingOfflinePush && seenData) {
            pendingOfflinePush = false;
            pushNow();
            if (wasOff && bootDone) toast('✅ النت رجع — اترفع جردك المعلّق لوحده', 'success');
          }
          /* pendingMetaPush بيتفضّى بس بعد ما يجيلنا snapshot من السيرفر — يعني m2 هياخد باله */
        } else if (syncOn) {
          fbConnected = false;
          setSyncUI('mid', 'أوفلاين — كمّل شغلك عادي، وهيترفع لوحده أول ما النت يرجع');
        }
        updateOfflineBar();
      });
    } catch (e) {}
    /* نستنى إثبات الاتصال الحقيقي بحد أقصى 8 ثوان */
    await Promise.race([
      db.ref('.info/connected').once('value'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    attachSync();
    syncOn = true;
    accessDenied = false;
    lastSyncErr = '';
    clearTimeout(connectRetryTimer);
    setSyncUI('on', 'متصل — مزامنة حية');
    addLog('تم الاتصال بـ Firebase');
    try { if (pendingWipeTs) scheduleWipeRetry(); } catch(e){}
    /* استرجاع جلسة محفوظة؟ السيرفر يقول كلمته: لو الحساب اتخطف على جهاز تاني → اقفل هنا */
    if (sessionUser && loginRequired()) claimSession(sessionUser).then(c => {
      if (c && c.ok === false) {
        bigBlock('🚫', 'الحساب ده مفتوح على جهاز تاني',
          'اتسجل دخول "<b>' + esc(sessionUser.name) + '</b>" من جهاز آخر.<br>سجّل خروجه من هناك الأول وبعدين ادخل من جديد.',
          'حسنًا', () => logoutUser());
      }
    });
    /* ⚖️ ممنوع نرفع فورًا على العمياني — نستنى أول قراءة من السيرفر لو فيه شغل أوفلاين، عشان يحصل دمج مش استبدال */
    if (pendingOfflinePush && !seenData) { /* attachSync هيقرر بعد أول سنابشوت */ }
    else if (pendingOfflinePush || inventoryData.length) pushNow();
    /* meta: ميتفضاش هنا — لازم يوصل snapshot الأول */
    if (!silent) toast('تم الاتصال — المزامنة شغالة بين كل الأجهزة', 'success');
    return true;
  } catch (e) {
    syncOn = false;
    lastSyncErr = e && e.message ? e.message : String(e);
    /* ❗ المهم: منرجعش لوضع محلي نهائي — نعيد المحاولة كل شوية للأبد */
    setSyncUI('mid', 'بيحاول يتصل بالسيرفر...');
    clearTimeout(connectRetryTimer);
    connectRetryTimer = setTimeout(() => connectFirebase(true, (retryCount || 0) + 1), 6000);
    if (!silent) toast('لسه مفيش اتصال — هنحاول تاني تلقائيًا', 'warning');
    return false;
  }
}
function attachSync(){
  if (!db) return;
  if (refOff) { try { refOff(); } catch (e) {} }
  const ref = db.ref(fbPath());
  const h1 = ref.child('data').on('value', snap => {
    const v = snap.val();
    if (!v) {
      seenData = true;
      maybeFinishBoot();
      // السيرفر فاضي - لو فيه ختم مسح أو البيانات فاضية، امسح عندي ولا ترجع القديم أبداً
      inventoryData = [];
      selectedSerials.clear();
      updateTable(); updateStats(); renderCategoryButtons();
      pendingOfflinePush = false;
      // لا ترجع البيانات القديمة أبداً لما السيرفر فاضي
      return;
    }
    // لو السيرفر فيه items فاضية [] ولو حتى مش fullReplace → اعتبره مسح
    if (v.items && Array.isArray(v.items) && v.items.length===0) {
      seenData = true;
      maybeFinishBoot();
      inventoryData = [];
      selectedSerials.clear();
      localRev = Math.max(localRev, v.rev||0, lastWipeRev||0);
      store.setItem(S('localRev'), String(localRev));
      lastRemoteRev = v.rev||0;
      localSave();
      updateTable(); updateStats(); renderCategoryButtons();
      pendingOfflinePush = false;
      if (bootDone) toast('🔥 الجرد ممسوح نهائياً', 'warning');
      flashDot();
      return;
    }
    const rev = v.rev || 0;
    if (rev === lastPushRev) return;
    const hasUnpushed = pendingOfflinePush || (localRev > lastRemoteRev) || !!pushTimer;
    // 🔥 لو الأدمن مسح أو رفع جرد كامل جديد → قانون على الكل
    // لو السيرفر فاضي تماماً و wipe أحدث من عندي → امسح
    const serverIsEmpty = !v.items || (Array.isArray(v.items) && v.items.length===0);
    if (serverIsEmpty && lastWipeRev && lastWipeRev >= localRev) {
      inventoryData = [];
      selectedSerials.clear();
      localRev = Math.max(localRev, rev, lastWipeRev);
      store.setItem(S('localRev'), String(localRev));
      lastRemoteRev = rev;
      seenData = true;
      maybeFinishBoot();
      localSave();
      updateTable(); updateStats(); renderCategoryButtons();
      pendingOfflinePush = false;
      flashDot();
      return;
    }
    if (v.fullReplace) {
      inventoryData = normData(v.items);
      localRev = rev; store.setItem(S('localRev'), String(localRev));
      lastRemoteRev = rev;
      seenData = true;
      maybeFinishBoot();
      localSave();
      if (v.dt) { store.setItem(S('selectedDateTime'), v.dt); const dt = $('currentDateTime'); if (dt) dt.value = v.dt; }
      updateStats(); renderCategoryButtons();
      if (editingCount > 0) pendingRemote = true; else updateTable();
      pendingOfflinePush = false;
      if (bootDone) toast('✅ تم تحديث الجرد بالكامل من الأدمن — ' + inventoryData.length + ' صنف', 'success');
      flashDot();
      return;
    }
    if (hasUnpushed && inventoryData.length) {
      const me = sessionUser ? sessionUser.name : '';
      inventoryData = mergeOfflineEdits(inventoryData, normData(v.items), me);
      localRev = Math.max(localRev, rev); store.setItem(S('localRev'), String(localRev));
      lastRemoteRev = rev;
      seenData = true;
      maybeFinishBoot();
      localSave();
      if (v.dt) { store.setItem(S('selectedDateTime'), v.dt); const dt = $('currentDateTime'); if (dt) dt.value = v.dt; }
      updateStats(); renderCategoryButtons();
      if (editingCount > 0) pendingRemote = true; else updateTable();
      pendingOfflinePush = false;
      // ادفع الدمج بعد ثانية عشان مايعملش loop
      clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 800);
      if (bootDone && pendingOfflinePush) toast('✅ شغلك اتحد مع زمايلك', 'success');
      flashDot();
      return;
    }
    localRev = Math.max(localRev, rev); store.setItem(S('localRev'), String(localRev));
    lastRemoteRev = rev;
    inventoryData = normData(v.items);
    seenData = true;
    maybeFinishBoot();
    localSave();
    if (v.dt) { store.setItem(S('selectedDateTime'), v.dt); const dt = $('currentDateTime'); if (dt) dt.value = v.dt; }
    updateStats(); renderCategoryButtons();
    if (editingCount > 0) pendingRemote = true; else updateTable();
    flashDot();
  }, err => {
    syncOn = false;
    accessDenied = true;
    lastSyncErr = err && err.message ? err.message : String(err);
    setSyncUI('off', 'مرفوض من السيرفر ⚠️');
    updateOfflineBar();
    toast('السيرفر رفض المزامنة — افتح الإعدادات ← "🔌 الاتصال والمزامنة" واضغط "ربط قاعدة البيانات" عشان تشوف السبب', 'error');
  });
  const h2 = ref.child('meta').on('value', snap => {
    seenMeta = true;
    maybeFinishBoot();
    const meta = snap.val() || {};
    if (meta.adminHash && meta.adminHash !== adminHash) { adminHash = meta.adminHash; store.setItem(S('adminHash'), adminHash); }
    if (typeof meta.loginRequiredExplicit === 'boolean') loginRequiredExplicit = meta.loginRequiredExplicit;
    /* المستخدمين بيقبلوا الشكلين: array قديم أو map جديد — Object.values بتتعامل مع الاتنين */
    const rawUsers = (meta.users === undefined || meta.users === null)
      ? []
      : (Array.isArray(meta.users) ? meta.users : Object.values(meta.users));
    const incoming = rawUsers.filter(u => u && u.name);
    const uRev = meta.usersRev || 0;
    if (uRev && uRev > lastUsersRev) {
      /* 🥇 نسخة أحدث على السيرفر (بقرار صريح من أدمن: إضافة/حذف/تعديل) → هي القانون.
         كده الحذف بينفّد على كل الأجهزة ومفيش مستخدم محذوف يرجع لوحده */
      lastUsersRev = uRev;
      if (JSON.stringify(incoming) !== JSON.stringify(usersList)) {
        usersList = incoming;
        store.setItem(S('usersList'), JSON.stringify(usersList));
        applyUserUI();
        if (loginRequired() && !sessionUser && !document.querySelector('.lock-overlay')) showLock();
      }
    } else {
      /* نفس النسخة أو بيانات قديمة (من قبل ختم النسخة) → دمج اتحاد للزيادات المحلية (ممنوع فقدان حد) */
      const byName = {};
      incoming.forEach(u => { if (u && u.name) byName[u.name] = u; });
      usersList.forEach(u => { if (u && u.name && !(u.name in byName)) byName[u.name] = u; });
      const merged = Object.values(byName);
      if (JSON.stringify(merged) !== JSON.stringify(usersList)) {
        usersList = merged;
        store.setItem(S('usersList'), JSON.stringify(usersList));
        applyUserUI();
        /* جهاز جديد استلم المستخدمين من السيرفر → اعرض شاشة الدخول فورًا */
        if (loginRequired() && !sessionUser && !document.querySelector('.lock-overlay')) showLock();
      }
      if (usersList.length > incoming.length) scheduleMetaPush(); /* احنا عندنا زيادة لسه السيرفر معندوش — نرفعها */
    }
    // 🔥 ختم المسح النهائي: لو فيه مسح جديد على السيرفر أحدث من شغلي المحلي → امسح عندي فوراً حتى لو كنت أوفلاين قبل كده
    try {
      const wipeRev = meta.lastWipeRev || 0;
      const wipeTs = meta.lastWipe || 0;
      const effectiveWipe = Math.max(wipeRev, wipeTs);
      if (effectiveWipe && effectiveWipe > lastWipeRev) {
        lastWipeRev = effectiveWipe;
        store.setItem('lastWipe', String(effectiveWipe));
        if (effectiveWipe > localRev) {
          inventoryData = [];
          selectedSerials.clear();
          localRev = effectiveWipe;
          store.setItem(S('localRev'), String(localRev));
          localSave();
          try { store.setItem('snapshot', JSON.stringify({items:[], dt:'', localRev:effectiveWipe, users:usersList, adminHash:adminHash, logo:store.getItem(S('customLogo'))||'', savedAt:Date.now()})); } catch(e){}
          updateTable(); updateStats(); renderCategoryButtons();
          pendingOfflinePush = false;
          try { clearAllLocalCaches(); } catch(e){}
          if (bootDone) toast('🔥 تم مسح الجرد نهائياً من الأدمن - كل الأجهزة والكاش اتمسح', 'warning');
        }
      }
    } catch(e){}
    if (meta.logo && meta.logo !== store.getItem(S('customLogo'))) {
      store.setItem(S('customLogo'), meta.logo);
      applyLogo(meta.logo);
    }
    /* أول snapshot وصل ← دلوقتي آمن نفضي المعلّق */
    if (pendingMetaPush) { pendingMetaPush = false; pushMeta(true); /* المعلّق دايمًا بيشمل المستخدمين */ }
    saveSnapshot(); /* حدّث لقطة الطوارئ بأحدث نسخة من السيرفر */
  }, () => {});
  try { if (isAdmin() && sessionUser) attachNotifListener(); } catch(e){}
  refOff = () => { ref.child('data').off('value', h1); ref.child('meta').off('value', h2); try{ detachNotifListener(); }catch(e){} };
}
function schedulePush(){
  /* لو الاتصال لسه ما اتبنيش → علّم إن فيه شغل معلق (بدل ما يتضيع بصمت) */
  if (!syncOn || !db) { pendingOfflinePush = true; return; }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 600);
}
function pushNow(){
  if (!syncOn || !db) return;
  clearTimeout(pushTimer); pushTimer = null;
  const doWrite = () => {
    const rev = Math.max(localRev, Date.now());
    // لو رفع جرد كامل من الأدمن، نزود 5 ثواني عشان يكسب أي جهاز تاني
    const finalRev = nextFullReplace ? (rev + 5000) : rev;
    localRev = finalRev; store.setItem(S('localRev'), String(finalRev));
    lastPushRev = finalRev;
    lastRemoteRev = finalRev;
    if (navigator && navigator.onLine === false) { pendingOfflinePush = true; setSyncUI('mid', 'أوفلاين — هيترفع عند عودة النت'); updateOfflineBar(); }
    const payload = {
      rev: finalRev,
      by: deviceId,
      items: inventoryData,
      dt: store.getItem(S('selectedDateTime')) || ''
    };
    if (nextFullReplace) payload.fullReplace = true;
    nextFullReplace = false;
    db.ref(fbPath() + '/data').set(payload).then(() => { flashDot(); accessDenied = false; updateOfflineBar(); }).catch(err => {
      pendingOfflinePush = true;
      lastSyncErr = err && err.message ? err.message : String(err);
      if (String(lastSyncErr).indexOf('PERMISSION_DENIED') !== -1) {
        accessDenied = true;
        setSyncUI('off', 'مرفوض من السيرفر ⚠️');
        toast('⚠️ السيرفر رفض الكتابة — افتح الإعدادات ← "🔌 الاتصال والمزامنة" ← "ربط قاعدة البيانات"', 'error');
      } else {
        setSyncUI('mid', 'انقطع مؤقتًا — محفوظ عندك وهيترفع تلقائيًا');
      }
      updateOfflineBar();
    });
  };
  /* لو مش عملية استبدال/مسح كامل (اللي المفروض تكسب دايماً بأي حال)، اقرا آخر نسخة
     فعلية من السيرفر قبل الكتابة وادمجها لو فيها تعديل من جهاز تاني لسه ماوصلناش —
     بيقفل الفجوة الصغيرة المتبقية بين استقبال تحديثات الأجهزة التانية والكتابة، من غير
     ما نغيّر شكل تخزين البيانات (array) خالص. لو القراءة فشلت أو إحنا أوفلاين، بنكمل
     عادي بالبيانات المحلية زي ما كان السلوك قبل كده تماماً */
  if (!nextFullReplace && navigator && navigator.onLine !== false) {
    db.ref(fbPath() + '/data').once('value').then(snap => {
      const v = snap.val() || {};
      const serverIsEmpty = !v.items || (Array.isArray(v.items) && v.items.length === 0);
      if (v.rev && v.rev > lastRemoteRev && !v.fullReplace && !serverIsEmpty && !v.wiped) {
        const me = sessionUser ? sessionUser.name : '';
        inventoryData = mergeOfflineEdits(inventoryData, normData(v.items), me);
        lastRemoteRev = v.rev;
        if (editingCount > 0) pendingRemote = true; else updateTable();
        updateStats();
      }
      doWrite();
    }).catch(() => doWrite());
  } else {
    doWrite();
  }
}
function pushMeta(withUsers){
  if (!syncOn || !db) { pendingMetaPush = true; return; } /* لو الاتصال لسه ما اتبنيش، هنرفع لما يتصل */
  pendingMetaPush = false;
  const meta = {};
  if (adminHash) meta.adminHash = adminHash;
  if (loginRequiredExplicit !== null) meta.loginRequiredExplicit = loginRequiredExplicit;
  /* المستخدمين يتكتبوا بس لما التعديل فعلًا فيهم (withUsers) — تغيير اللوجو/الباسورد مش بيلمسهم */
  if (withUsers) {
    /* 🔒 تخزين كـ map بمفاتيح تبدأ بحرف (u_) — مش array:
       Firebase كان بيرجّع الـ array كـ object أحيانًا، والقارئ القديم بيتجاهلها
       → الجهاز يفتكر مفيش مستخدمين → يزرع admin الافتراضي فوقهم ويمسحهم. اتقفل للأبد */
    if (usersList.length) {
      meta.users = {};
      usersList.forEach(u => { if (u && u.name) meta.users['u_' + sessionKey(u.name)] = u; });
    } else {
      meta.users = null; /* لو القايمة فاضت فعلًا بقرار الأدمن → حذف صريح (update بـ null بيمسح العقدة) */
    }
    /* ختم النسخة: الأعلى على السيرفر هو القانون — كده حذف مستخدم ينفّد على كل الأجهزة وميرجعش لوحده */
    meta.usersRev = firebase.database.ServerValue.TIMESTAMP;
  }
  const logo = store.getItem(S('customLogo'));
  if (logo) meta.logo = logo;
  db.ref(fbPath() + '/meta').update(meta).catch(e => { lastSyncErr = e.message || String(e); });
}
/* الـ meta (مستخدمين/لوجو/إعدادات) بيتزامن على الجذر — كل الأجهزة بتشوف نفس النسخة */

/* ---------- إدخال الباركود ---------- */
function setupBarcodeInput(){
  const inp = $('addCode');
  const commit = () => {
    const v = inp.value.trim();
    if (!v) return;
    v.split(/[\n\r,;\t]+/).map(s => s.trim()).filter(Boolean).forEach(processCode);
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
  };
  /* أهم سطر: الحقل جوه <form> — زر Go/إدخال/بحث في كيبورد الموبايل بيعمل submit تلقائيًا */
  const form = document.getElementById('codeForm');
  if (form) form.addEventListener('submit', e => { e.preventDefault(); commit(); });
  /* احتياطي إضافي للوحات المفاتيح الفيزيائية */
  const keyHandler = e => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.keyCode === 13 || e.which === 13) {
      e.preventDefault();
      commit();
    }
  };
  /* تحويل فوري لإنجليزي أثناء الكتابة — لو الموبايل بيكتب بالعربي */
  inp.addEventListener('input', () => {
    const v = sanitizeCode(inp.value);
    if (v !== inp.value) inp.value = v;
  });
  inp.addEventListener('keydown', keyHandler);
  inp.addEventListener('keyup', e => { if ((e.key === 'Enter' || e.keyCode === 13) && inp.value.trim()) commit(); });
  /* اتشال listener بتاع change عشان ميعملش إضافة لما تلمس أي مكان تاني في الشاشة */
  /* لصق متعدد الأكواد */
  inp.addEventListener('paste', e => {
    const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
    if (/[\n\r\t]/.test(txt)) {
      e.preventDefault();
      txt.split(/[\n\r,;\t]+/).map(s => s.trim()).filter(Boolean).forEach(processCode);
      setTimeout(() => inp.focus(), 30);
    }
  });
  /* زر الكاميرا */
  const cb = $('camBtn'); if (cb) cb.onclick = openCameraScanner;
}

/* ---------- أحداث الجدول (Delegation) ---------- */
function setupTableEvents(){
  const tb = $('tableBody');
  document.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('td[contenteditable]')) editingCount++; });
  document.addEventListener('focusout', e => {
    if (e.target.closest && e.target.closest('td[contenteditable]')) {
      editingCount = Math.max(0, editingCount - 1);
      if (editingCount === 0 && pendingRemote) { pendingRemote = false; updateTable(); }
    }
  });
  tb.addEventListener('focusout', e => {
    const td = e.target.closest('td[contenteditable]');
    if (!td) return;
    const tr = td.closest('tr');
    const serial = parseInt(tr.dataset.serial);
    if (td.dataset.edit === 'name') updateField(serial, 'name', td.innerText);
    else if (td.dataset.qty) updateQty(serial, td.dataset.qty, td.innerText, tr);
  });
  tb.addEventListener('change', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const serial = parseInt(tr.dataset.serial);
    if (e.target.matches('select[data-gsel]')) updateField(serial, 'group', e.target.value);
    else if (e.target.classList.contains('item-checkbox')) {
      if (e.target.checked) selectedSerials.add(serial); else selectedSerials.delete(serial);
      tr.classList.toggle('selected-for-print', e.target.checked);
    }
  });
  tb.addEventListener('click', e => {
    const nb = e.target.closest('[data-note]');
    if (nb) openNote(parseInt(nb.closest('tr').dataset.serial));
  });
  $('categoryButtonsContainer').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) setCategoryFilter(b.dataset.cat);
  });
  let searchTimer = null;
  $('smartSearch').addEventListener('input', () => { clearTimeout(searchTimer); currentPage = 1; searchTimer = setTimeout(updateTable, 200); });
}
function toggleSelectAll(master){
  /* "تحديد الكل" لازم يشتغل على كل الأصناف المفلترة، مش صفحة العرض الحالية بس */
  const filtered = getFiltered();
  filtered.forEach(item => {
    if (master.checked) selectedSerials.add(item.serial); else selectedSerials.delete(item.serial);
  });
  document.querySelectorAll('#tableBody .item-checkbox').forEach(cb => {
    cb.checked = master.checked;
    const tr = cb.closest('tr');
    tr.classList.toggle('selected-for-print', master.checked);
  });
}

/* ---------- ملاحظات + سجل تاريخ الصنف ---------- */
function fmtHistTime(ts){
  const d = new Date(ts);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
async function openNote(serial){
  const item = inventoryData.find(x => x.serial === serial);
  if (!item) return;
  const log = item.log || [];
  const histHTML = log.length
    ? '<div style="margin-top:.8rem;border-top:1px solid #e2e8f0;padding-top:.6rem">' +
      '<div style="font-size:.75rem;font-weight:700;color:#64748b;margin-bottom:.4rem">🕘 آخر التعديلات على الصنف ده</div>' +
      log.map(h => '<div style="font-size:.72rem;color:#64748b;padding:.2rem 0">' +
        esc(fmtHistTime(h.t)) + ' — <b>' + esc(h.by) + '</b> غيّر ' + esc(FIELD_LABELS[h.f] || h.f) +
        ' من "' + esc(String(h.from)) + '" لـ "' + esc(String(h.to)) + '"</div>').join('') +
      '</div>'
    : '';
  const v = await new Promise(res => {
    const m = showModal('ملاحظات — ' + item.code,
      '<div class="fld"><textarea id="_dlgArea" style="min-height:110px;direction:rtl;text-align:right;font-size:.85rem"></textarea></div>' + histHTML,
      [
        { label: 'حفظ', kind: 'primary', onClick: (body) => res(body.querySelector('#_dlgArea').value) },
        { label: 'إلغاء', kind: 'ghost', onClick: () => res(null) }
      ], () => res(null));
    m.body.querySelector('#_dlgArea').value = item.note || '';
  });
  if (v === null) return;
  if (v !== item.note) logItemChange(item, 'note', item.note, v);
  item.note = v;
  saveAndRefresh(false);
  updateStats();
}

/* ---------- مسح وحذف + تراجع ---------- */
/* آخر 5 عمليات — {ts, label, snapshot} — متاحة طول الجلسة مش 10 ثواني بس */
function pushUndoHistory(label){
  undoHistory.unshift({ ts: Date.now(), label, snapshot: JSON.stringify(inventoryData) });
  if (undoHistory.length > 5) undoHistory.length = 5;
}
function withUndo(applyFn, label){
  pushUndoHistory(label);
  applyFn();
  saveAndRefresh();
  // لو عملية مسح/استبدال كاملة، ادفع فوراً كـ fullReplace عشان تتمسح من كل الأجهزة نهائياً
  if (nextFullReplace) { try { pushNow(); } catch(e){} }
  toast(label, 'success', { actionLabel: 'تراجع', onAction: () => restoreSnapshot(0) });
}
function restoreSnapshot(idx){
  const entry = undoHistory[idx];
  if (!entry) return;
  nextFullReplace = true;
  inventoryData = normData(JSON.parse(entry.snapshot));
  undoHistory.splice(0, idx + 1); /* امسح كل اللي بعد النقطة اللي رجعنالها عشان الترتيب يفضل منطقي */
  selectedSerials.clear();
  touchLocal();
  localRev = Date.now() + 5000;
  store.setItem(S('localRev'), String(localRev));
  localSave();
  updateTable(); updateStats(); renderCategoryButtons();
  pushNow();
  toast('تم التراجع بنجاح - رجعت البيانات لكل الأجهزة', 'info');
  addLog('تراجع: ' + entry.label);
}
function doUndo(){ restoreSnapshot(0); }
function openUndoHistory(){
  if (needAdmin()) return;
  if (!undoHistory.length) { toast('مفيش عمليات محفوظة للتراجع عنها في الجلسة دي', 'info'); return; }
  const body = '<div class="hint" style="font-size:.8rem;margin-bottom:.5rem">آخر العمليات في الجلسة دي — اضغط "استرجع" لأي نقطة عشان ترجع البيانات لحالتها وقتها (وكل اللي بعدها هيتلغى):</div>' +
    undoHistory.map((h, i) => {
      const d = new Date(h.ts);
      const t = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.5rem;border:1px solid #e2e8f0;border-radius:.5rem;margin-bottom:.4rem">' +
        '<div><div style="font-weight:700;font-size:.85rem">' + esc(h.label) + '</div><div style="font-size:.7rem;color:#94a3b8">' + t + '</div></div>' +
        '<button class="mbtn primary" style="padding:.3rem .8rem" onclick="restoreFromHistory(' + i + ')">استرجع</button>' +
      '</div>';
    }).join('');
  showModal('سجل التراجع (آخر ' + undoHistory.length + ' عملية)', body, [{ label: 'إغلاق', kind: 'ghost', onClick: () => {} }]);
}
function restoreFromHistory(i){
  restoreSnapshot(i);
  document.querySelectorAll('.modal-overlay').forEach(x => x.remove());
}
async function openClearModal(){
  if (needAdmin()) return;
  if (!(await ensureAdmin())) return;
  const ok = await confirmDlg('مسح كل الأصناف نهائياً؟', 'سيتم مسح كل الأصناف من السيرفر ومن كل الأجهزة نهائياً ومش هترجع إلا لما ترفع ملف جديد. حتى الأجهزة اللي كانت أوفلاين هتتمسح لما تفتح النت. متأكد؟', 'نعم - امسح نهائي', true);
  if (!ok) return;
  await doWipeAll();
}
let wipeRetryTimer = null;
let pendingWipeTs = 0; /* مسح فشل يوصل للسيرفر — بيحاول تاني تلقائياً طول ما التبويب مفتوح */
/* مسح فعلي من السيرفر + تأكيد حقيقي إنه نجح. لو فشل، امسح محلي بس وحاول تاني تلقائياً
   بدل ما نقول "تم المسح" وهو فعلياً ما اتمسحش من السيرفر (السبب الأساسي لمشكلة "أحياناً مش بتتمسح") */
async function doWipeAll(){
  const wipeTs = Date.now() + 10000;
  lastWipeRev = wipeTs;
  try { store.setItem('lastWipe', String(wipeTs)); } catch(e){}
  inventoryData = [];
  selectedSerials.clear();
  localRev = wipeTs;
  try { store.setItem(S('localRev'), String(localRev)); } catch(e){}
  try { localSave(); } catch(e){}
  updateTable(); updateStats(); renderCategoryButtons();
  let serverOk = false;
  let failReason = '';
  // محاولة 1: عن طريق SDK فايربيس (لو متصل)
  try {
    if (syncOn && db) {
      await db.ref(fbPath() + '/data').set({ rev: wipeTs, items: [], fullReplace: true, wiped: true });
      await db.ref(fbPath() + '/notifs').remove();
      await db.ref(fbPath() + '/meta').update({ lastWipe: firebase.database.ServerValue.TIMESTAMP, lastWipeRev: wipeTs });
      serverOk = true;
    }
  } catch(e){ failReason = e && e.message ? e.message : String(e); }
  // محاولة 2: REST مباشر كخطة بديلة، مع التحقق الفعلي من status كل طلب
  if (!serverOk) {
    try {
      const cfg = effectiveCfg();
      if (cfg && cfg.databaseURL) {
        const base = cfg.databaseURL.replace(/\/$/, '');
        const r1 = await fetch(base + '/' + fbPath() + '/data.json', { method: 'PUT', body: JSON.stringify({ rev: wipeTs, items: [], fullReplace: true, wiped: true }) });
        const r2 = await fetch(base + '/' + fbPath() + '/notifs.json', { method: 'DELETE' });
        const r3 = await fetch(base + '/' + fbPath() + '/meta/lastWipeRev.json', { method: 'PUT', body: JSON.stringify(wipeTs) });
        serverOk = !!(r1.ok && r2.ok && r3.ok);
        if (!serverOk) failReason = 'HTTP ' + r1.status + '/' + r2.status + '/' + r3.status;
      } else if (!failReason) {
        failReason = 'مفيش اتصال بقاعدة البيانات دلوقتي';
      }
    } catch(e){ failReason = e && e.message ? e.message : String(e); }
  }
  try { clearAllLocalCaches(); } catch(e){}
  if (serverOk) {
    pendingWipeTs = 0;
    toast('🔥 تم مسح كل البيانات نهائياً من السيرفر والكاش - البرنامج فاضي', 'success');
    addLog('مسح نهائي كامل - wipeRev:' + wipeTs);
  } else {
    // اتمسح عندك بس السيرفر لسه معاه النسخة القديمة → لازم نحاول تاني وإلا هترجع البيانات القديمة من الأجهزة التانية
    pendingWipeTs = wipeTs;
    toast('⚠️ اتمسح عندك، لكن السيرفر لم يستجب (' + (failReason || 'خطأ اتصال') + ') — هيتحاول المسح تلقائياً تاني أول ما النت يرجع. لو قفلت الصفحة قبل ما ينجح، اضغط "مسح الكل" تاني بعد ما ترجع، أو استخدم صفحة wipe.html', 'error');
    addLog('مسح محلي فقط - فشل مسح السيرفر: ' + failReason);
    scheduleWipeRetry();
  }
}
function scheduleWipeRetry(){
  clearTimeout(wipeRetryTimer);
  wipeRetryTimer = setTimeout(async () => {
    if (!pendingWipeTs) return;
    if (!syncOn || !db) { scheduleWipeRetry(); return; }
    try {
      await db.ref(fbPath() + '/data').set({ rev: pendingWipeTs, items: [], fullReplace: true, wiped: true });
      await db.ref(fbPath() + '/notifs').remove();
      await db.ref(fbPath() + '/meta').update({ lastWipe: firebase.database.ServerValue.TIMESTAMP, lastWipeRev: pendingWipeTs });
      pendingWipeTs = 0;
      toast('✅ نجح المسح المؤجل — البيانات اتمسحت من السيرفر فعلياً', 'success');
      addLog('نجح إعادة محاولة المسح - wipeRev:' + pendingWipeTs);
    } catch(e){ scheduleWipeRetry(); }
  }, 8000);
}
async function deleteSelected(){
  if (needAdmin()) return;
  const serials = [...selectedSerials];
  if (!serials.length) { toast('حدد صنفًا واحدًا على الأقل', 'warning'); return; }
  const ok = await confirmDlg('حذف المحدد نهائياً؟', 'سيتم حذف ' + serials.length + ' صنف نهائياً من السيرفر ومن كل الأجهزة ومش هيرجع إلا بملف جديد. حتى الأجهزة اللي كانت أوفلاين هتتمسح لما تفتح النت. متأكد؟', 'حذف نهائي', true);
  if (!ok) return;
  nextFullReplace = true;
  const wipeTs = Date.now() + 5000;
  lastWipeRev = wipeTs;
  store.setItem('lastWipe', String(wipeTs));
  withUndo(() => {
    inventoryData = inventoryData.filter(i => serials.indexOf(i.serial) === -1);
    inventoryData.forEach((it, ix)=>{ it.serial = ix+1; });
    serials.forEach(s => selectedSerials.delete(s));
    touchLocal();
    localRev = wipeTs;
    store.setItem(S('localRev'), String(localRev));
    localSave();
    pushNow();
    try { if (syncOn && db) db.ref(fbPath() + '/meta').update({ lastWipe: firebase.database.ServerValue.TIMESTAMP, lastWipeRev: wipeTs }).catch(()=>{}); } catch(e){}
  }, 'تم حذف ' + serials.length + ' صنف نهائياً من كل الأجهزة');
  addLog('حذف محدد نهائي - wipeRev:' + wipeTs);
}

/* ---------- استيراد إكسيل / CSV ---------- */
function loadExcelFile(){
  if (needAdmin()) { const i0 = $('systemInventoryFile'); if (i0) i0.value = ''; return; }
  const inp = $('systemInventoryFile');
  const file = inp.files[0];
  if (!file) return;
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  if (typeof XLSX === 'undefined' && !isCsv) {
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
      .then(() => readImportFile(file, inp, isCsv))
      .catch(() => { toast('لا يوجد إنترنت لقراءة xlsx — احفظ الملف كـ CSV وارفعه', 'error'); inp.value = ''; });
    return;
  }
  readImportFile(file, inp, isCsv);
}
function readImportFile(file, inp, isCsv){
  const reader = new FileReader();
  reader.onload = e => {
    try {
      if (typeof XLSX !== 'undefined' && !isCsv) {
        workbookData = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        sheetNames = workbookData.SheetNames;
        isCsvSource = false;
      } else if (typeof XLSX !== 'undefined' && isCsv) {
        workbookData = XLSX.read(new TextDecoder().decode(new Uint8Array(e.target.result)), { type: 'string' });
        sheetNames = workbookData.SheetNames;
        isCsvSource = false;
      } else {
        csvRows = parseCSV(new TextDecoder().decode(new Uint8Array(e.target.result)));
        sheetNames = ['CSV'];
        isCsvSource = true;
        if (!csvRows.length) throw new Error('empty');
      }
      toast('تم قراءة الملف — اضغط "إضافة جرد" لإتمام الاستيراد', 'success');
    } catch (err) {
      workbookData = null; csvRows = [];
      toast('تعذر قراءة الملف — جرب ملف xlsx أو csv', 'error');
    }
    inp.value = '';
  };
  reader.readAsArrayBuffer(file);
}
function parseCSV(text){
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [first.split(';').length, first.split('\t').length, first.split(',').length].indexOf(Math.max(first.split(';').length, first.split('\t').length, first.split(',').length));
  const d = [';', '\t', ','][delim];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some(x => String(x).trim() !== '')) rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); if (row.some(x => String(x).trim() !== '')) rows.push(row); }
  return rows;
}
function getSheetRows(idx){
  if (isCsvSource) return csvRows;
  if (!workbookData) return [];
  return XLSX.utils.sheet_to_json(workbookData.Sheets[sheetNames[idx]], { header: 1, defval: '' });
}
function openImportModal(){
  if (needAdmin()) return;
  if (!workbookData && !csvRows.length) { toast('ارفع ملف الجرد أولًا من زر "رفع جرد"', 'warning'); return; }
  const sheetSel = $('sheetSel');
  if (!sheetSel) { toast('واجهة الاستيراد غير جاهزة - حدث الصفحة', 'error'); return; }
  sheetSel.innerHTML = sheetNames.map((n, i) => '<option value="' + i + '">' + esc(n || ('شيت ' + (i + 1))) + '</option>').join('');
  const wrap = $('sheetSelWrap'); if (wrap) wrap.style.display = sheetNames.length > 1 ? '' : 'none';
  const fillCols = () => {
    const rows = getSheetRows(+sheetSel.value) || [];
    const cols = rows[0] || [];
    ['codeColumn', 'nameColumn', 'quantityColumn', 'groupColumn'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.innerHTML = cols.map((c, i) => '<option value="' + i + '">' + esc(String(c).trim() || ('عمود ' + (i + 1))) + '</option>').join('');
    });
    guessCol(cols, 'codeColumn', ['كود', 'code', 'barcode', 'باركود', 'item']);
    guessCol(cols, 'nameColumn', ['اسم', 'name', 'صنف', 'desc', 'وصف']);
    guessCol(cols, 'quantityColumn', ['كمية', 'qty', 'quantity', 'رصيد', 'stock']);
    guessCol(cols, 'groupColumn', ['مجموع', 'group', 'فئة', 'قسم', 'categ']);
  };
  sheetSel.onchange = fillCols;
  fillCols();
  const colMod = $('columnSelectors'); if (colMod) colMod.style.display = 'flex';
}

function guessCol(cols, id, keys){
  const sel = $(id);
  for (let i = 0; i < cols.length; i++) {
    const h = String(cols[i]).toLowerCase();
    if (keys.some(k => h.indexOf(k) !== -1)) { sel.value = i; return; }
  }
}
async function confirmImport(){
  const allRows = getSheetRows(+$('sheetSel').value) || [];
  if (!allRows.length) { toast('الملف فاضي', 'error'); return; }
  // --- كشف صف الرأس تلقائيا: ندور على أول صف فيه كلمات م/الكود/الصنف/الكمية/الرصيد/المجموعة/الوحدة ---
  const headerKeys = ['م','مسلسل','الكود','كود','barcode','باركود','code','الصنف','اسم الصنف','الاسم','name','الوحدة','وحدة','unit','الكمية','كمية','الرصيد','رصيد','quantity','qty','stock','المجموعة','مجموعة','group','فئة','قسم'];
  function isHeaderCell(v){
    const s = String(v||'').trim().toLowerCase();
    return headerKeys.some(k=> s === k.toLowerCase() || s.includes(k.toLowerCase()));
  }
  /* تسجيل نقاط لكل صف: تطابق كامل (الخلية = الكلمة بالظبط) نقطتين، تطابق جزئي نقطة واحدة —
     عشان صف بيانات فيه كلمة شبيهة بالصدفة (زي "وحدة تخزين") ما يتلخبطش مع صف الرأس الحقيقي */
  function headerScore(row){
    let score = 0;
    for (const c of row) {
      const s = String(c||'').trim().toLowerCase();
      if (!s) continue;
      if (headerKeys.some(k => s === k.toLowerCase())) score += 2;
      else if (headerKeys.some(k => s.includes(k.toLowerCase()))) score += 1;
    }
    return score;
  }
  let headerIdx = -1, bestScore = 1; /* لازم نقطتين على الأقل (زي ما كان قبل كده) عشان نعتبره رأس */
  for (let i=0;i<Math.min(allRows.length, 15);i++){
    const sc = headerScore(allRows[i]||[]);
    if (sc > bestScore) { bestScore = sc; headerIdx = i; }
  }
  const dataRows = headerIdx >=0 ? allRows.slice(headerIdx+1) : allRows.slice(1);
  const ci = +$('codeColumn').value, ni = +$('nameColumn').value, qi = +$('quantityColumn').value, gi = +$('groupColumn').value;
  const mode = document.querySelector('input[name="imode"]:checked').value;
  const incoming = [];
  const headerSkipSet = new Set(headerKeys.map(k=>k.toLowerCase()));
  let skippedEmpty = 0, skippedHeader = 0;
  dataRows.forEach(r=>{
    if (!r) { skippedEmpty++; return; }
    // تجاهل صفوف فاضية تماما
    const allEmpty = r.every(cell=> String(cell==null?'':cell).trim() === '');
    if (allEmpty) { skippedEmpty++; return; }
    const codeRaw = String(r[ci] == null ? '' : r[ci]).trim();
    if (!codeRaw) { skippedEmpty++; return; }
    const codeLow = codeRaw.toLowerCase();
    // تجاهل لو الكود نفسه هو اسم رأس جدول
    if (headerSkipSet.has(codeLow)) { skippedHeader++; return; }
    // تجاهل لو الصف كله عبارة عن رؤوس (مثل م / الكود / الصنف ...)
    let headerCells = 0;
    for (const cell of r) {
      if (isHeaderCell(cell)) headerCells++;
    }
    if (headerCells >= 2 && r.length <= 8) { skippedHeader++; return; }
    // تجاهل أعمدة فاضية: لو الاسم والكمية فاضيين والكود فاضي يعتبر فاضي (اتغطى فوق)
    const nameRaw = String(r[ni] == null ? '' : r[ni]).trim();
    const qtyRaw = r[qi];
    const groupRaw = String(r[gi] == null ? '' : r[gi]).trim();
    // لو الصف فيه كود بس بدون اسم وبدون كمية وبدون مجموعة -> نتجاهله لو شكله مش كود حقيقي (مثل رقم مسلسل)
    // لكن لو الكود موجود حتى لو الاسم فاضي نقبله (هيتسمى صنف غير مسمى)
    incoming.push({
      code: codeRaw,
      name: nameRaw || 'صنف غير مسمى',
      group: groupRaw || 'عام',
      sys: parseQty(qtyRaw)
    });
  });
  if (!incoming.length) { toast('لم يتم العثور على بيانات بعد تجاهل الرؤوس والفارغ', 'error'); return; }
  if (mode === 'replace') {
    if (needAdmin()) return;
    const ok = await confirmDlg('استبدال البيانات', 'سيتم استبدال كل البيانات الحالية (' + inventoryData.length + ' صنف) بمحتوى الملف (' + incoming.length + ' صنف). تم تجاهل ' + (skippedEmpty+skippedHeader) + ' صف فاضي/رأس. سيتم إرسال الجرد الجديد لكل الأجهزة فوراً.', 'استبدال', true);
    if (!ok) return;
    nextFullReplace = true;
    withUndo(() => {
      let s = 1;
      inventoryData = incoming.map(r => {
        const item = { serial: s++, code: r.code, name: r.name, group: r.group, systemQuantity: r.sys, actualQuantity: 0, isJarded: false, difference: -r.sys, status: r.sys === 0 ? 'متساوي' : 'عجز', note: '', countedBy: '', counts: {}, editedAt: Date.now() };
        return item;
      });
      selectedSerials.clear();
      touchLocal();
      localRev = Date.now() + 5000;
      store.setItem(S('localRev'), String(localRev));
      localSave();
      pushNow();
    }, 'تم استيراد ' + incoming.length + ' صنف (تجاهل ' + (skippedEmpty+skippedHeader) + ' فارغ/رأس) - اتبعت لكل الأجهزة');
    addLog('استيراد باستبدال — ' + incoming.length + ' صنف (تجاهل رؤوس/فارغ)');
  } else {
    if (needAdmin()) return;
    const resetActual = !!($('resetActualOnMerge') && $('resetActualOnMerge').checked);
    const existingMatches = incoming.filter(r => inventoryData.some(i => i.code === r.code)).length;
    const msg = 'هيتم تحديث اسم/مجموعة/كمية السيستم لـ ' + existingMatches + ' صنف موجود، وإضافة الباقي كجديد (' + incoming.length + ' صنف بالملف). ' +
      (resetActual ? 'هيتصفّر الجرد الفعلي للأصناف الموجودة (عدّ جديد).' : 'الجرد الفعلي الحالي للأصناف الموجودة هيفضل زي ما هو.') +
      ' تم تجاهل ' + (skippedEmpty+skippedHeader) + ' صف فاضي/رأس.';
    const ok = await confirmDlg('دمج البيانات', msg, 'دمج', true);
    if (!ok) return;
    let added = 0, updated = 0;
    pushUndoHistory('تراجع عن دمج ملف');
    const now = Date.now();
    incoming.forEach(r => {
      const ex = inventoryData.find(i => i.code === r.code);
      if (ex) {
        ex.name = r.name; ex.group = r.group; ex.systemQuantity = r.sys;
        if (resetActual) { ex.actualQuantity = 0; ex.isJarded = false; ex.counts = {}; ex.countedBy = ''; }
        ex.editedAt = now;
        calculateRow(ex); updated++;
      } else {
        const ns = inventoryData.length ? Math.max.apply(null, inventoryData.map(i => i.serial)) + 1 : 1;
        inventoryData.push({ serial: ns, code: r.code, name: r.name, group: r.group, systemQuantity: r.sys, actualQuantity: 0, isJarded: false, difference: -r.sys, status: r.sys === 0 ? 'متساوي' : 'عجز', note: '', countedBy: '', counts: {}, editedAt: now });
        added++;
      }
    });
    inventoryData.forEach((it, ix) => { it.serial = ix + 1; });
    saveAndRefresh();
    toast('تم الدمج: ' + added + ' جديد + ' + updated + ' محدّث (تجاهل ' + (skippedEmpty+skippedHeader) + ' فارغ/رأس)', 'success', { actionLabel: 'تراجع', onAction: () => restoreSnapshot(0) });
    addLog('دمج ملف — ' + added + ' جديد / ' + updated + ' محدّث');
  }
  closeModal('columnSelectors');
}


/* ---------- التصدير ---------- */
function exportToExcel(){
  if (needAdmin()) return;
  if (!inventoryData.length) { toast('لا توجد بيانات للتصدير', 'warning'); return; }
  const totalS = inventoryData.reduce((a, i) => a + i.systemQuantity, 0);
  const totalA = inventoryData.reduce((a, i) => a + i.actualQuantity, 0);
  let rows = '';
  inventoryData.forEach(i => {
    const bg = i.difference > 0 ? '#dcfce7' : i.difference < 0 ? '#fee2e2' : '#ffffff';
    rows += '<tr style="background:' + bg + '">' +
      '<td>' + i.serial + '</td><td>' + esc(i.code) + '</td><td>' + esc(i.name) + '</td><td>' + esc(i.group) + '</td>' +
      '<td>' + fmtQ(i.systemQuantity) + '</td><td>' + fmtQ(i.actualQuantity) + '</td><td><b>' + fmtQ(i.difference) + '</b></td>' +
      '<td>' + esc(i.status) + '</td><td>' + esc(i.countedBy || '—') + '</td><td>' + esc(i.note) + '</td></tr>';
  });
  const html = '<html dir="rtl"><head><meta charset="utf-8"></head><body>' +
    '<h3 style="font-family:tahoma">تقرير جرد الأصناف — بيمبو ستور</h3>' +
    '<table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;font-family:tahoma;font-size:11pt">' +
    '<thead><tr style="background:#1e293b;color:#fff"><th>م</th><th>الكود</th><th>اسم الصنف</th><th>المجموعة</th><th>السيستم</th><th>الفعلي</th><th>الفرق</th><th>الحالة</th><th>بواسطة</th><th>ملاحظات</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '<tfoot><tr style="background:#f1f5f9;font-weight:bold"><td colspan="4">الإجماليات</td><td>' + fmtQ(totalS) + '</td><td>' + fmtQ(totalA) + '</td><td>' + fmtQ(totalA - totalS) + '</td><td colspan="2">' + inventoryData.length + ' صنف</td></tr></tfoot>' +
    '</table></body></html>';
  downloadBlob(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }), 'Jard-' + stamp() + '.xls');
  addLog('تصدير إكسيل — ' + inventoryData.length + ' صنف');
  toast('تم التصدير بنجاح', 'success');
}
function downloadBlob(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function backupJSON(){
  const payload = { app: 'jard', v: 2, exportedAt: new Date().toISOString(), dt: store.getItem(S('selectedDateTime')) || '', items: inventoryData };
  downloadBlob(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), 'Bimbo-Backup-' + stamp() + '.json');
  addLog('تنزيل نسخة احتياطية');
}
function restoreJSON(){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        const items = normData(data.items || data);
        if (!items.length && !confirm('النسخة فارغة — استعادة فارغة؟')) return;
        const ok = await confirmDlg('استعادة نسخة احتياطية', 'سيتم استبدال البيانات الحالية بمحتوى النسخة (' + items.length + ' صنف).', 'استعادة', true);
        if (!ok) return;
        withUndo(() => {
          inventoryData = items;
          if (data.dt) { store.setItem(S('selectedDateTime'), data.dt); $('currentDateTime').value = data.dt; }
          selectedSerials.clear();
        }, 'تمت الاستعادة (' + items.length + ' صنف)');
        addLog('استعادة نسخة احتياطية — ' + items.length + ' صنف');
      } catch (err) { toast('ملف النسخة غير صالح', 'error'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ---------- الطباعة ---------- */
function prepareAndPrint(){
  if (needAdmin()) return;
  const anySel = document.querySelectorAll('#tableBody .item-checkbox:checked').length > 0;
  document.body.classList.toggle('print-selection', anySel);
  $('printDate').textContent = 'تاريخ الجرد: ' + (($('currentDateTime').value || '').replace('T', ' ')) + (userFilter ? ' — المستخدم: ' + userFilter : '');
  const rows = anySel ? inventoryData.filter(i => selectedSerials.has(i.serial)) : getFiltered();
  /* لو فلتر بمستخدم → الإجماليات على كمياته هو */
  const q = i => (userFilter && i.counts ? (Number(i.counts[userFilter]) || 0) : i.actualQuantity);
  $('footSys').textContent = fmtQ(rows.reduce((a, i) => a + i.systemQuantity, 0));
  $('footAct').textContent = fmtQ(rows.reduce((a, i) => a + q(i), 0));
  $('footDiff').textContent = fmtQ(rows.reduce((a, i) => a + (q(i) - i.systemQuantity), 0));
  $('footCount').textContent = rows.length + ' صنف';
  $('tableFoot').style.display = '';
  // الطباعة لازم تشمل كل الصفوف مش صفحة واحدة بس من الترقيم — نعرض الكل مؤقتاً وقت الطباعة بس
  const restorePage = currentPage;
  currentPage = 1;
  renderFullTableForPrint(rows);
  const restore = () => { currentPage = restorePage; updateTable(); window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  // fallback لو المتصفح مادعمش afterprint (نادر)
  setTimeout(restore, 2000);
}
function renderFullTableForPrint(rows){
  const groups = groupsList();
  let html = '';
  rows.forEach(item => {
    const hasUCounts = userFilter && item.counts && Object.keys(item.counts).length > 0;
    const uQty = hasUCounts ? (Number(item.counts[userFilter]) || 0) : (userFilter && item.countedBy === userFilter ? item.actualQuantity : null);
    const dispAct = uQty !== null ? uQty : item.actualQuantity;
    const dispDiff = uQty !== null ? (uQty - item.systemQuantity) : item.difference;
    const dispStatus = uQty !== null ? (dispDiff > 0 ? 'زيادة' : dispDiff < 0 ? 'عجز' : 'متساوي') : item.status;
    const cls = dispStatus === 'زيادة' ? 'row-surplus' : dispStatus === 'عجز' ? 'row-deficit' : '';
    const sel = selectedSerials.has(item.serial);
    let opts = '<option value="غير مصنف"' + (item.group === 'غير مصنف' ? ' selected' : '') + '>غير مصنف</option>';
    if (item.group === 'غير معروف') opts += '<option value="غير معروف" selected>غير معروف</option>';
    groups.forEach(g => { opts += '<option value="' + esc(g) + '"' + (item.group === g ? ' selected' : '') + '>' + esc(g) + '</option>'; });
    html += '<tr class="' + cls + (sel ? ' selected-for-print' : '') + '" data-serial="' + item.serial + '">' +
      '<td class="tc no-print"><input type="checkbox" class="item-checkbox"' + (sel ? ' checked' : '') + '></td>' +
      '<td class="p3 txs fwb tc">' + item.serial + '</td>' +
      '<td class="p3 fw6">' + esc(item.code) + '</td>' +
      '<td class="p3 tsm" contenteditable="true" data-edit="name">' + esc(item.name) + '</td>' +
      '<td class="p3 txs"><select data-gsel class="rowselect">' + opts + '</select></td>' +
      '<td class="tc fwb" contenteditable="' + (userFilter ? 'false' : 'true') + '" data-qty="systemQuantity" data-cell="sys">' + fmtQ(item.systemQuantity) + '</td>' +
      '<td class="tc fwb tblue" contenteditable="' + (userFilter ? 'false' : 'true') + '" data-qty="actualQuantity" data-cell="act">' + fmtQ(dispAct) + '</td>' +
      '<td class="tc fwb" data-cell="diff">' + fmtQ(dispDiff) + '</td>' +
      '<td class="tc txs fwb" data-cell="status">' + esc(dispStatus) + '</td>' +
      '<td class="tc no-print"><button class="notebtn' + (item.note ? ' has-note' : '') + '" data-note title="ملاحظة">' + NOTE_SVG + '</button></td>' +
    '</tr>';
  });
  const tb = $('tableBody');
  if (tb) tb.innerHTML = html;
}

/* ---------- السجل ---------- */
function addLog(action){
  const d = new Date();
  logBook.unshift({ a: action, t: d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+' '+pad2(d.getHours())+':'+pad2(d.getMinutes()) });
  if (logBook.length > 50) logBook.length = 50;
  store.setItem(S('logBook'), JSON.stringify(logBook));
}
function showLog(){
  const html = logBook.length
    ? logBook.map(l => '<div class="log-item"><span>' + esc(l.a) + '</span><span class="lt">' + esc(l.t) + '</span></div>').join('')
    : '<div style="color:#94a3b8;font-size:.85rem;text-align:center;padding:1rem">لا يوجد سجل بعد</div>';
  showModal('سجل العمليات (آخر 50)', '<div style="max-height:50vh;overflow-y:auto">' + html + '</div>', [{ label: 'إغلاق', kind: 'ghost' }]);
}

/* ---------- تقرير الجرد بالمستخدمين ---------- */
function showUserReport(){
  const byUser = {};
  inventoryData.forEach(i => {
    const cs = i.counts || {};
    const users = Object.keys(cs).length ? Object.keys(cs) : (i.isJarded ? [i.countedBy || 'بدون مستخدم'] : []);
    users.forEach(w => {
      const q = cs[w] !== undefined ? Number(cs[w]) : (i.countedBy === w ? Number(i.actualQuantity) : 0);
      if (!q && q !== 0) return;
      byUser[w] = byUser[w] || { count: 0, qty: 0 };
      byUser[w].count++;
      byUser[w].qty += Math.abs(q || 0);
    });
  });
  const names = Object.keys(byUser);
  let html;
  if (!names.length) {
    html = '<div style="color:#94a3b8;font-size:.85rem;text-align:center;padding:1rem">لم يتم جرد أي صنف بعد</div>';
  } else {
    html = names.sort((a, b) => byUser[b].count - byUser[a].count).map(n =>
      '<div class="urep-row">' +
      '<span class="who">👤 ' + esc(n) + '<div class="meta">إجمالي القطع: ' + fmtQ(byUser[n].qty) + '</div></span>' +
      '<span style="display:flex;align-items:center;gap:.4rem">' +
      '<span class="cnt">' + byUser[n].count + ' صنف</span>' +
      '<button class="view" data-u="' + esc(n) + '">عرض الأصناف</button>' +
      '</span></div>'
    ).join('');
  }
  const m = showModal('📊 تقرير الجرد حسب المستخدم', '<div style="max-height:55vh;overflow-y:auto">' + html + '</div>', [{ label: 'إغلاق', kind: 'ghost' }]);
  m.body.querySelectorAll('.view').forEach(b => b.onclick = () => {
    const u = b.dataset.u === 'بدون مستخدم' ? '' : b.dataset.u;
    if (u) {
      setUserFilter(u);
      m.close();
      closeSidebar();
      toast('يعرض الآن أصناف "' + u + '" فقط — اضغط الشريط البرتقالي لإلغاء الفلتر', 'info');
      updateStatsForUser(u);
    }
  });
}
function updateStatsForUser(name){
  /* عدّاد مؤقت للمستخدم في التوست */
  setTimeout(() => {
    const items = inventoryData.filter(i => i.countedBy === name && i.isJarded);
    toast(name + ' جرد ' + items.length + ' صنف من أصل ' + inventoryData.length, 'info');
  }, 50);
}
/* ---------- سجل تتبع الجرد (آخر جرد بالوقت) ---------- */
async function loadCountLog(){
  const box = document.getElementById('countLogBox');
  if (!box) return;
  box.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:1rem">⏳ جاري التحميل...</div>';
  if (!syncOn || !db) { box.innerHTML = '<div style="text-align:center;color:#ef4444;padding:1rem">لازم تكون متصل بالإنترنت</div>'; return; }
  try {
    const snap = await db.ref(fbPath() + '/notifs').orderByKey().limitToLast(100).get();
    const data = snap.val() || {};
    const items = Object.values(data).filter(Boolean).sort((a,b)=> (b.ts||0)-(a.ts||0));
    if (!items.length) { box.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:1rem">لا يوجد سجل جرد بعد</div>'; return; }
    let html = '<table style="width:100%;font-size:.75rem;border-collapse:collapse"><thead><tr style="background:#1e293b;color:#fff"><th style="padding:6px">الوقت</th><th style="padding:6px">المستخدم</th><th style="padding:6px">الكود</th><th style="padding:6px">الصنف</th><th style="padding:6px">الكمية</th><th style="padding:6px">نوع</th></tr></thead><tbody>';
    items.forEach(ev=>{
      const d = ev.ts ? new Date(ev.ts) : new Date();
      const time = d.toLocaleString('ar-EG', { hour12:false });
      const roleTag = ev.role === 'admin' ? '<span style="background:#fee2e2;color:#b91c1c;border-radius:.3rem;padding:1px 4px;font-size:.65rem">admin</span>' : '<span style="background:#dcfce7;color:#166534;border-radius:.3rem;padding:1px 4px;font-size:.65rem">جرد</span>';
      html += '<tr style="border-bottom:1px dashed #e2e8f0"><td style="padding:5px;direction:ltr">' + time + '</td><td style="padding:5px">👤 ' + esc(ev.by||'') + ' ' + roleTag + '</td><td style="padding:5px;font-family:monospace">' + esc(ev.code||'') + '</td><td style="padding:5px">' + esc(ev.name||'') + '</td><td style="padding:5px;font-weight:800;text-align:center">' + fmtQ(ev.qty||0) + '</td><td style="padding:5px">' + esc(ev.action||'count') + '</td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
  } catch(e){ box.innerHTML = '<div style="color:#ef4444">خطأ: ' + esc(e.message||'') + '</div>'; }
}
async function clearCountLog(){
  if (needAdmin()) return;
  const ok = await confirmDlg('مسح سجل الجرد؟', 'سيتم مسح سجل التتبع (jard/notifs) نهائياً من السيرفر. بيانات الجرد نفسها مش هتتمسح.', 'مسح السجل', true);
  if (!ok) return;
  let okServer = false, failReason = '';
  try {
    if (syncOn && db) {
      await db.ref(fbPath() + '/notifs').remove();
      okServer = true;
    } else {
      const cfg = effectiveCfg();
      if (cfg && cfg.databaseURL) {
        const base = cfg.databaseURL.replace(/\/$/, '');
        const r = await fetch(base + '/' + fbPath() + '/notifs.json', { method: 'DELETE' });
        okServer = r.ok;
        if (!okServer) failReason = 'HTTP ' + r.status;
      } else {
        failReason = 'مفيش اتصال بقاعدة البيانات دلوقتي';
      }
    }
  } catch(e) { failReason = e && e.message ? e.message : String(e); }
  if (okServer) {
    toast('تم مسح سجل الجرد فعلياً من السيرفر', 'success');
    addLog('مسح سجل الجرد');
  } else {
    toast('⚠️ فشل مسح السجل من السيرفر (' + (failReason || 'خطأ اتصال') + ') — حاول تاني لما النت يرجع', 'error');
  }
  loadCountLog();
}
function exportCountLog(){
  if (!syncOn || !db) return;
  db.ref(fbPath() + '/notifs').orderByKey().limitToLast(200).get().then(snap=>{
    const data = snap.val()||{};
    const items = Object.values(data).sort((a,b)=> (a.ts||0)-(b.ts||0));
    let csv = 'الوقت,المستخدم,الدور,الكود,الصنف,الكمية,النوع\n';
    items.forEach(ev=>{
      const d = ev.ts ? new Date(ev.ts).toISOString() : '';
      csv += '"' + d + '","' + (ev.by||'') + '","' + (ev.role||'') + '","' + (ev.code||'') + '","' + (ev.name||'').replace(/"/g,'""') + '",' + (ev.qty||0) + ',"' + (ev.action||'') + '"\n';
    });
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='jard-log-' + stamp() + '.csv'; a.click();
  });
}



/* ---------- إعادة ضبط المصنع ---------- */
async function factoryReset(){
  const c1 = await confirmDlg('إعادة ضبط مصنع', '⚠️ دي عملية نهائية — هيتم مسح كل بيانات البرنامج من على السيرفر (الأصناف + المستخدمين + الجلسات + سجل الجرد) + كل الإعدادات من الجهاز ده. مفيش تراجع. متأكد؟', 'نعم — امسح كل حاجة', true);
  if (!c1) return;
  const okPass = await inputDlg('تأكيد كلمة مرور admin', 'اكتب كلمة المرور للمتابعة', true);
  if (okPass === null) return;
  const h = await hashPass(okPass);
  /* باسورد الأدمن الافتراضي بيشتغل بس لو الأدمن لسه ما غيّرش الباسورد (مفيش adminHash محفوظ)،
     مش backdoor دايم — بعد أول تغيير حقيقي للباسورد، الباسورد الافتراضي بطل يشتغل خالص */
  const defaultStillActive = !adminHash || adminHash === (await hashPass(DEFAULT_ADMIN.pass));
  const okDefault = defaultStillActive && h === (await hashPass(DEFAULT_ADMIN.pass));
  if (!okDefault && h !== adminHash) { toast('كلمة مرور غلط — مفيش إعادة ضبط', 'error'); return; }
  const wipeTs = Date.now() + 10000;
  lastWipeRev = wipeTs;
  try { store.setItem('lastWipe', String(wipeTs)); } catch(e){}
  // 1) حاول تمسح السيرفر عن طريق SDK، مع تأكيد حقيقي من النجاح
  try { releaseSession(); } catch(e){}
  let serverOk = false, failReason = '';
  if (syncOn && db) {
    try {
      await db.ref(fbRoot()).remove();
      // بعد المسح، ازرع ختم المسح تاني عشان أي جهاز قديم أوفلاين ما يرجعش البيانات
      await db.ref(fbPath() + '/meta').set({ lastWipe: firebase.database.ServerValue.TIMESTAMP, lastWipeRev: wipeTs });
      serverOk = true;
    } catch(e){ failReason = e && e.message ? e.message : String(e); }
  }
  if (!serverOk) {
    // جرب REST مباشر مع فحص status فعلي
    try {
      const cfg = effectiveCfg();
      if (cfg && cfg.databaseURL) {
        const base = cfg.databaseURL.replace(/\/$/, '');
        const r1 = await fetch(base + '/' + fbRoot() + '.json', { method: 'DELETE' });
        const r2 = await fetch(base + '/' + fbRoot() + '/meta.json', { method: 'PUT', body: JSON.stringify({ lastWipe: wipeTs, lastWipeRev: wipeTs }) });
        serverOk = !!(r1.ok && r2.ok);
        if (!serverOk) failReason = 'HTTP ' + r1.status + '/' + r2.status;
      } else if (!failReason) {
        failReason = 'مفيش اتصال بقاعدة البيانات دلوقتي';
      }
    } catch(e){ failReason = e && e.message ? e.message : String(e); }
  }
  // 2) امسح كل حاجة محلية نهائياً (مفيش localStorage خالص — كله sessionStorage عن طريق store)
  try {
    inventoryData = [];
    usersList = [];
    adminHash = '';
    selectedSerials.clear();
    logBook = [];
    localRev = wipeTs;
    store.clear();
    store.setItem('deviceId', deviceId);
    store.setItem('lastWipe', String(wipeTs));
  } catch(e){}
  if (serverOk) {
    toast('💥 تمت إعادة ضبط المصنع - اتمسح كل شيء من السيرفر والكاش', 'success');
  } else {
    toast('⚠️ اتمسح عندك بس السيرفر لم يستجب (' + (failReason || 'خطأ اتصال') + ') — البيانات القديمة ممكن ترجع من أي جهاز تاني متصل. جرب تاني لما النت يرجع', 'error');
  }
  setTimeout(() => location.reload(), 1000);
}

function setHead(icon, color, title, sub){
  return '<div class="set-card-head"><span class="set-icon" style="background:' + color + '">' + icon + '</span>' +
    '<div><div class="set-card-title">' + title + '</div>' + (sub ? '<div class="set-card-sub">' + sub + '</div>' : '') + '</div></div>';
}
const IC = {
  cloud: '<svg viewBox="0 0 24 24"><path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 6 6 0 0 0-11.7-1.62A4 4 0 0 0 6 19z"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  office: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M9 14h1M14 10h1M14 14h1M10 21v-4h4v4"/></svg>'
};

/* ---------- الإعدادات ---------- */
async function openSettings(){
  if (loginRequired()) {
    if (!isAdmin()) {
      const ok = await ensureAdmin();
      if (!ok) { toast('الإعدادات للمسؤول فقط', 'error'); return; }
    } else if (!adminAuthedLive) {
      /* نقطة 4: الجلسة ممكن تكون مرمّمة — الأدمن يأكد الباسورد مرة واحدة في كل تحميل صفحة.
         كده أي تلاعب بالتخزين/DevTools مش هيفتح الإعدادات من غير الباسورد الحقيقي. */
      const ok = await ensureAdmin();
      if (!ok) { toast('لازم تأكيد كلمة مرور admin قبل فتح الإعدادات', 'error'); return; }
    }
  }
  const cfg = effectiveCfg();
  const body =
    '<div class="set-tabs">' +
    '<button class="set-tab active" data-tab="users">👥 المستخدمون</button>' +
    '<button class="set-tab" data-tab="notifs">🔔 الإشعارات</button>' +
    '<button class="set-tab" data-tab="sync">🔌 الاتصال</button>' +
    '<button class="set-tab" data-tab="log">📜 سجل الجرد</button><button class="set-tab" data-tab="security">🛠️ النظام</button>' +
    '</div>' +

    /* ============ المستخدمون ============ */
    '<div class="set-pane active" data-pane="users"><div class="set-card">' +
    setHead(IC.users, '#16a34a', 'المستخدمون وكلمات المرور', 'كل واحد يدخل بيوزر وباسورد خاصين به — وبحساب واحد بس على جهاز واحد في نفس الوقت') +
    '<div id="usersBox"></div>' +
    '<div class="sec-title" style="margin-top:.9rem">➕ إضافة مستخدم جديد</div>' +
    '<div class="modal-2col" style="margin-top:.3rem">' +
    '<div class="fld"><label>اسم المستخدم الجديد</label><input id="newUserName" placeholder="مثال: ahmed" autocomplete="off"></div>' +
    '<div class="fld"><label>كلمة المرور</label><input id="newUserPass" type="password" placeholder="••••" autocomplete="new-password"></div>' +
    '</div>' +
    '<div class="fld"><label>الصلاحية</label><select id="newUserRole"><option value="user">مستخدم (جرد فقط)</option><option value="supervisor">مشرف (جرد + استيراد + حذف + طباعة، بدون إدارة مستخدمين/إعدادات)</option><option value="admin">admin (كل الصلاحيات)</option></select></div>' +
    '<div class="modal-foot"><button class="mbtn primary" id="addUserBtn">➕ إضافة مستخدم</button><button class="mbtn ghost" id="urepBtn">📊 تقرير الجرد بالمستخدمين</button></div>' +
    '</div></div>' +

    /* ============ الإشعارات ============ */
    '<div class="set-pane" data-pane="notifs"><div class="set-card">' +
    setHead('<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-6 9-6 9h18s-6-2-6-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>', '#f59e0b', 'إشعارات سطح المكتب', 'إشعارات فورية زي الواتساب - حتى لو الصفحة minimized') +
    '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:.75rem;padding:.7rem .9rem;margin-bottom:.8rem">' +
    '<div style="font-size:.8rem;font-weight:800;color:#92400e">🔔 ازاي تشتغل؟</div>' +
    '<div style="font-size:.72rem;color:#78350f;line-height:1.9">1️⃣ اضغط تفعيل واسمح<br>2️⃣ سيب صفحة الأدمن مفتوحة وممكن minimize<br>3️⃣ أي جرد من موظف → إشعار على الديسكتوب فوراً</div></div>' +
    '<div class="fld" style="text-align:center"><button class="mbtn primary" id="notifBtnSettings" style="padding:.8rem">🔔 تفعيل الإشعارات على سطح المكتب</button><div id="notifHintSettings" style="font-size:.7rem;color:#64748b;margin-top:.5rem"></div></div>' +
    '<div style="display:flex;gap:.5rem;margin-top:.8rem"><button class="mbtn ghost" id="testNotifBtn">🧪 جرّب الإشعار</button><button class="mbtn ghost" id="resetNotifCnt">🔄 تصفير</button></div>' +
    '</div></div>' +

    /* ============ الاتصال ============ */
    '<div class="set-pane" data-pane="sync"><div class="set-card">' +
    setHead(IC.cloud, '#2563eb', 'الاتصال بقاعدة البيانات (Firebase)', 'اربط هنا مرة واحدة — وبعد ما ينجح الاتصال ابعت اللينك لكل المستخدمين') +
    '<div class="fld"><label>بيانات الاتصال (الصق الكود كاملًا من Firebase)</label>' +
    '<textarea id="cfgText" placeholder=\'{"apiKey":"...","databaseURL":"..."}\'>' + esc(cfg && cfg.apiKey ? JSON.stringify(cfg, null, 1) : '') + '</textarea></div>' +
    '<div class="fld"><label>جذر قاعدة البيانات</label>' +
    '<input id="pathInp" value="' + esc(fbRoot()) + '" style="direction:ltr;text-align:left"></div>' +
    '<div class="modal-foot"><button class="mbtn primary" id="saveFb" style="flex:2">🔗 ربط قاعدة البيانات</button></div>' +
    '<div id="connResult" style="display:none;margin-top:.6rem;padding:.6rem .8rem;border-radius:.6rem;font-size:.78rem;font-weight:700;text-align:center"></div>' +
    '</div></div>' +

    /* ============ النظام ============ */
    '<div class="set-pane" data-pane="log"><div class="set-card">' +
    setHead('<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', '#0ea5e9', 'سجل تتبع الجرد لحظياً', 'يعرض آخر 100 عملية جرد بالوقت والمستخدم والكمية') +
    '<div style="display:flex;gap:.5rem;margin-bottom:.7rem"><button class="mbtn primary" id="refreshLogBtn">🔄 تحديث السجل</button><button class="mbtn ghost" id="clearLogBtn">🗑️ مسح سجل الجرد</button><button class="mbtn ghost" id="exportLogBtn">⬇️ تصدير السجل</button></div>' +
    '<div id="countLogBox" style="max-height:55vh;overflow-y:auto;border:1px solid #e2e8f0;border-radius:.75rem;padding:.5rem;background:#f8fafc"><div style="text-align:center;color:#94a3b8;padding:1rem">جاري تحميل السجل...</div></div>' +
    '</div></div>' +
    '<div class="set-pane" data-pane="security"><div class="set-card">' +    setHead(IC.shield, '#dc2626', 'النظام والأمان', 'القفل وأصوات المسح واللوجو والنسخ الاحتياطي') +
    '<div class="sec-title">🔐 القفل والصوت</div>' +
    '<label class="check-row"><input type="checkbox" id="loginReqChk"' + (loginRequired() ? ' checked' : '') + '> تفعيل نظام تسجيل الدخول (يتزامن على كل الأجهزة)</label>' +
    '<div style="font-size:.65rem;color:#94a3b8;margin:-.3rem 0 .6rem">لو مطفي: أي حد يفتح البرنامج بيشتغل مباشرة من غير تسجيل دخول ومن غير قفل.</div>' +
    '<label class="check-row"><input type="checkbox" id="lockChk"' + (lockOnOpen ? ' checked' : '') + '> طلب كلمة المرور عند فتح البرنامج</label>' +
    '<label class="check-row"><input type="checkbox" id="soundChk"' + (soundOn ? ' checked' : '') + '> أصوات المسح</label>' +
    '<div class="sec-title" style="margin-top:.9rem">لوجو البرنامج</div>' +
    '<div style="display:flex;align-items:center;gap:.7rem;background:#f8fafc;border:1px dashed var(--border);border-radius:.75rem;padding:.55rem .8rem;margin-bottom:.6rem">' +
    '<img id="logoPrev" style="width:44px;height:44px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;padding:2px">' +
    '<div style="flex:1"><div style="font-size:.75rem;font-weight:800;color:#1e293b">اللوجو الحالي</div>' +
    '<div style="font-size:.65rem;color:#94a3b8">يتزامن على كل الأجهزة</div></div>' +
    '<button class="mbtn ghost" id="chgLogoBtn" style="flex:0;padding:.45rem .7rem">تغيير</button>' +
    '<button class="mbtn ghost" id="rstLogoBtn" style="flex:0;padding:.45rem .7rem">↩️</button>' +
    '</div>' +
    '<div class="modal-foot"><button class="mbtn ghost" id="chgPass">🔑 تغيير كلمة مرور admin</button></div>' +
    '<div class="sec-title" style="margin-top:.9rem">💾 النسخ الاحتياطي والسجل</div>' +
    '<div class="modal-foot" style="flex-wrap:wrap;margin-top:.2rem">' +
    '<button class="mbtn ghost" id="bkpBtn">⬇️ تنزيل نسخة JSON</button>' +
    '<button class="mbtn ghost" id="rstBtn">⬆️ استعادة نسخة</button>' +
    '<button class="mbtn ghost" id="logBtn">🕘 عرض السجل</button></div>' +
    '<div class="sec-title" style="margin-top:.9rem;color:#b91c1c">منطقة الخطر</div>' +
    '<div class="modal-foot"><button class="mbtn danger" id="factoryResetBtn">💥 إعادة ضبط المصنع (مسح كل حاجة)</button></div>' +
    '</div></div>';

  const m = showModal('⚙️ شاشة الإعدادات', body, [{ label: 'إغلاق', kind: 'ghost' }]);

  /* ---------- تفعيل التبويبات ---------- */
  m.body.querySelectorAll('.set-tab').forEach(tab => {
    tab.onclick = () => {
      m.body.querySelectorAll('.set-tab').forEach(t => t.classList.remove('active'));
      m.body.querySelectorAll('.set-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = m.body.querySelector('[data-pane="' + tab.dataset.tab + '"]');
      if (pane) pane.classList.add('active');
    };
  });

  /* ---------- إدارة المستخدمين ---------- */
  let onlineSess = [];
  const renderUsers = () => {
    const box = m.body.querySelector('#usersBox');
    if (!usersList.length) { box.innerHTML = '<div class="hint">لا يوجد مستخدمون — أضف أول مستخدم بالأسفل</div>'; return; }
    box.innerHTML = usersList.map((u, i) => {
      const on = u.active !== false;
      const online = onlineSess.find(s => s.name === u.name || sessionKey(s.name) === sessionKey(u.name));
      return '<div class="user-manage-row' + (on ? '' : ' off') + '">' +
        '<span class="who-name">' + (online ? '<span class="sess-dot on" title="متصل الآن على جهاز"></span> ' : '<span class="sess-dot" title="مش متصل"></span> ') + '👤 ' + esc(u.name) + '<span class="role-tag">' + esc(u.role === 'admin' ? 'مسؤول' : 'مستخدم') + '</span>' + (on ? '' : '<span class="role-tag" style="background:#fee2e2;color:#b91c1c">موقوف</span>') + (online ? '<span class="role-tag" style="background:#dcfce7;color:#166534">متصل الآن 🟢</span>' : '') + '</span>' +
        '<span style="display:flex;gap:.35rem;align-items:center">' +
        (online && sessionUser && online.name !== sessionUser.name ? '<button class="kick" data-kick="' + esc(u.name) + '" title="طرده من جهازه فورًا">🥾 طرد</button>' : '') +
        '<button class="b-open" data-editu="' + i + '" title="تعديل الاسم/الباسورد" style="background:#2563eb;padding:.25rem .5rem">✏️</button>' +
        '<button class="utoggle ' + (on ? 'on' : 'off') + '" data-tg="' + i + '" title="' + (on ? 'إيقاف مؤقت' : 'تشغيل') + '">' + (on ? '✅ شغّال' : '⛔ موقوف') + '</button>' +
        '<button class="del" data-i="' + i + '">حذف</button>' +
        '</span></div>';
    }).join('');
    /* زرار التعديل */
    box.querySelectorAll('[data-editu]').forEach(b => b.onclick = async () => { await editUser(+b.dataset.editu); renderUsers(); });
    /* زر الطرد — للمسؤول */
    box.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
      const name = b.dataset.kick;
      const ok = await confirmDlg('طرد مستخدم', 'هيتسجل خروجه من جهازه فورًا: "' + name + '"', 'طرد', true);
      if (!ok) return;
      await kickUserOut(name);
      onlineSess = onlineSess.filter(s => s.name !== name);
      renderUsers();
    });
    /* مفتاح تشغيل/إيقاف للمستخدم */
    box.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => {
      const u = usersList[+b.dataset.tg];
      u.active = u.active === false ? true : false;
      store.setItem(S('usersList'), JSON.stringify(usersList));
      pushMeta(true);
      addLog((u.active ? 'تشغيل المستخدم: ' : 'إيقاف المستخدم: ') + u.name);
      toast(u.active ? '✅ ' + u.name + ' شغّال تاني' : '⛔ ' + u.name + ' اتوقف — هيقدرش يدخل', u.active ? 'success' : 'warning');
      renderUsers();
    });
    box.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      const u = usersList[+b.dataset.i];
      const ok = await confirmDlg('حذف مستخدم', 'سيتم حذف "' + u.name + '" ولن يستطيع الدخول بعدها.', 'حذف', true);
      if (!ok) return;
      usersList.splice(+b.dataset.i, 1);
      store.setItem(S('usersList'), JSON.stringify(usersList));
      pushMeta(true);
      addLog('حذف مستخدم: ' + u.name);
      renderUsers();
    });
  };
  renderUsers();
  /* تحميل قائمة المتصلين لعرض حالة كل مستخدم + زر الطرد */
  getOnlineSessions().then(list => { onlineSess = list; renderUsers(); });
  m.body.querySelector('#addUserBtn').onclick = async () => {
    const name = m.body.querySelector('#newUserName').value.trim();
    const pass = m.body.querySelector('#newUserPass').value.trim();
    const role = m.body.querySelector('#newUserRole').value;
    if (!name || name.length < 2) { toast('اكتب اسم مستخدم صحيح', 'error'); return; }
    if (usersList.find(u => u.name === name)) { toast('الاسم موجود بالفعل', 'error'); return; }
    if (!pass || pass.length < 3) { toast('كلمة المرور 3 أحرف على الأقل', 'error'); return; }
    /* أول مستخدم = لازم تكون في كلمة مرور مسؤول */
    if (!usersList.length && !adminHash) {
      toast('الخطوة الأخيرة: أنشئ كلمة مرور admin (هتدخل بها على الإعدادات)', 'info');
      const ok = await ensureAdmin();
      if (!ok) { toast('لازم تنشئ كلمة مرور admin الأول', 'error'); return; }
    }
    usersList.push({ name, hash: await hashPass(pass), role });
    store.setItem(S('usersList'), JSON.stringify(usersList));
    pushMeta(true);
    m.body.querySelector('#newUserName').value = '';
    m.body.querySelector('#newUserPass').value = '';
    addLog('إضافة مستخدم: ' + name);
    toast('تمت إضافة ' + name + ' — يقدر يدخل بيها من أي جهاز', 'success');
    renderUsers();
  };

  /* ---------- اللوجو ---------- */
  /* اللوجو ممكن يتغير من مكان واحد ويمثل البرنامج كله */
  const logoCard = m.body.querySelector('#chgLogoBtn');
  if (logoCard) logoCard.onclick = pickNewLogo;
  const logoRst = m.body.querySelector('#rstLogoBtn');
  if (logoRst) logoRst.onclick = resetLogo;

  /* ---------- تقرير المستخدمين ---------- */
  m.body.querySelector('#urepBtn').onclick = () => { m.close(); showUserReport(); };

  m.body.querySelector('#saveFb').onclick = async () => {
    const txt = m.body.querySelector('#cfgText').value.trim();
    const path = m.body.querySelector('#pathInp').value.trim() || 'jard';
    const resultBox = m.body.querySelector('#connResult');
    const showRes = (ok, msg) => {
      if (!resultBox) return;
      resultBox.style.display = 'block';
      resultBox.style.background = ok ? '#f0fdf4' : '#fef2f2';
      resultBox.style.color = ok ? '#166534' : '#b91c1c';
      resultBox.style.border = '1px solid ' + (ok ? '#86efac' : '#fca5a5');
      resultBox.textContent = msg;
    };
    if (txt) {
      const cfg2 = parseCfgLoose(txt);
      if (!cfg2) { showRes(false, '❌ فشل — الكود اللي اتلصق مش مفهوم'); toast('تعذّر فهم الكود — انسخه كاملًا من Firebase كما هو والصقه هنا', 'error'); return; }
      firebaseCfgLS = cfg2;
      store.setItem('firebaseCfg', JSON.stringify(cfg2));
    }
    /* الجذر بيتحفظ على المفتاح syncPath، والفرع الرئيسي بيرثه تلقائيًا */
    store.setItem('syncPath', path);
    const btn = m.body.querySelector('#saveFb');
    btn.disabled = true; btn.textContent = '⏳ جاري الاتصال...';
    showRes(true, '🔄 جاري الاتصال واختبار الكتابة والقراءة...');
    const ok = await connectFirebase(true);
    btn.disabled = false; btn.textContent = '🔗 ربط قاعدة البيانات';
    if (!ok) { showRes(false, '❌ فشل الاتصال — راجع بيانات Firebase أو الإنترنت'); return; }
    /* اختبار حقيقي فوري: كتابة + قراءة */
    try {
      const probe = { t: 'ok', at: Date.now(), by: deviceId };
      await db.ref(fbRoot() + '/probe-test').set(probe);
      const snap = await db.ref(fbRoot() + '/probe-test').get();
      await db.ref(fbRoot() + '/probe-test').remove().catch(() => {});
      const v = snap.val();
      if (v && v.by === deviceId) {
        showRes(true, '✅ نجح الاتصال — الكتابة والقراءة شغالين تمام. ابعت لينك البرنامج لكل المستخدمين دلوقتي 📲');
        toast('✅ نجح الاتصال والمزامنة شغالة — ابعت اللينك للمستخدمين', 'success');
        addLog('اختبار الاتصال نجح');
      } else {
        showRes(false, '❌ فشل — القراءة رجعت بيانات غير متوقعة');
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (msg.indexOf('PERMISSION_DENIED') !== -1) {
        showRes(false, '❌ فشل — القواعد رافضة: اكتب ".read": true ".write": true في Rules');
      } else if (msg.indexOf('auth') !== -1) {
        showRes(false, '❌ فشل — فعّل Anonymous Auth في Firebase Console');
      } else {
        showRes(false, '❌ فشل — ' + msg);
      }
    }
  };
  m.body.querySelector('#loginReqChk').onchange = async e => {
    if (e.target.checked && !adminHash) {
      const ok = await ensureAdmin();
      if (!ok) { e.target.checked = false; return; }
    }
    loginRequiredExplicit = e.target.checked;
    pushMeta(false);
    toast(loginRequiredExplicit ? '🔒 نظام الدخول اتفعّل على كل الأجهزة' : '🔓 نظام الدخول اتلغى — البرنامج هيشتغل من غير تسجيل دخول', 'success');
    applyUserUI();
  };
  m.body.querySelector('#lockChk').onchange = async e => {
    if (e.target.checked && !adminHash) {
      const ok = await ensureAdmin();
      if (!ok) { e.target.checked = false; return; }
    }
    lockOnOpen = e.target.checked;
    store.setItem('lockOnOpen', lockOnOpen ? '1' : '0');
  };
  m.body.querySelector('#soundChk').onchange = e => {
    soundOn = e.target.checked;
    store.setItem('soundOn', soundOn ? '1' : '0');
    if (soundOn) beep('ok');
  };
  m.body.querySelector('#chgPass').onclick = async () => {
    if (adminHash) {
      const old = await inputDlg('كلمة المرور الحالية', 'أدخل كلمة المرور الحالية', true);
      if (old === null) return;
      if (await hashPass(old) !== adminHash) { toast('كلمة المرور الحالية غير صحيحة', 'error'); return; }
    }
    const p1 = await inputDlg('كلمة مرور جديدة', '3 أحرف على الأقل', true);
    if (p1 === null) return;
    if (p1.length < 3) { toast('كلمة المرور قصيرة', 'error'); return; }
    const p2 = await inputDlg('تأكيد كلمة المرور الجديدة', '', true);
    if (p1 !== p2) { toast('غير متطابقتين', 'error'); return; }
    adminHash = await hashPass(p1);
    store.setItem(S('adminHash'), adminHash);
    pushMeta(false);
    addLog('تغيير كلمة المرور');
    toast('تم تغيير كلمة المرور', 'success');
  };
  m.body.querySelector('#bkpBtn').onclick = backupJSON;
  m.body.querySelector('#rstBtn').onclick = () => { m.close(); restoreJSON(); };
  m.body.querySelector('#logBtn').onclick = () => { m.close(); showLog(); };

  try {
    const nb = m.body.querySelector('#notifBtnSettings');
    if (nb) nb.onclick = () => toggleNotif();
    const tb = m.body.querySelector('#testNotifBtn');
    if (tb) tb.onclick = () => showJardNotification({by:'اختبار', role:'user', code:'TEST', name:'إشعار تجريبي - لو ظهر على الديسكتوب يبقى تمام ✅', qty:1, ts:Date.now()}, true);
    const rb = m.body.querySelector('#resetNotifCnt');
    if (rb) rb.onclick = () => { store.setItem('lastNotifTs', String(Date.now())); lastNotifTs = Date.now(); toast('تم تصفير العداد', 'success'); };
    updateNotifUI();
  } catch(e){}
  try {
    const rBtn = m.body.querySelector('#refreshLogBtn');
    if (rBtn) rBtn.onclick = () => loadCountLog();
    const cBtn = m.body.querySelector('#clearLogBtn');
    if (cBtn) cBtn.onclick = () => clearCountLog();
    const eBtn = m.body.querySelector('#exportLogBtn');
    if (eBtn) eBtn.onclick = () => exportCountLog();
    // حمل السجل تلقائي لما تفتح تبويب السجل
    setTimeout(()=>{ loadCountLog(); }, 300);
  } catch(e){}
  const frBtn = m.body.querySelector('#factoryResetBtn');
  if (frBtn) frBtn.onclick = () => { m.close(); factoryReset(); };
}

/* ---------- ماسح الكاميرا (كل أنواع الباركود + QR) ---------- */
let lastCamCode = '', lastCamTime = 0, camBusy = false;
async function openCameraScanner(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('الكاميرا غير مدعومة على هذا الجهاز/المتصفح', 'error');
    return;
  }
  primeAudio();
  const bodyHTML =
    '<div class="cam-stage">' +
    '<div id="qrReader"></div>' +
    '<div class="scan-flash" id="scanFlash">' +
    '<div class="big" id="scanFlashTitle">✓ تم الجرد</div>' +
    '<div class="code" id="scanFlashCode"></div>' +
    '<div class="small" id="scanFlashItem"></div>' +
    '</div></div>' +
    '<div class="scan-count" id="scanCount">وجّه الكاميرا نحو الباركود أو QR — المسح شغال باستمرار</div>' +
    /* 🔍 سلايدر الزوم الرقمي — بيظهر بس لو الكاميرا بتدعمه (الباركود الصغير بيتلقط فورًا) */
    '<div id="zoomWrap" style="display:none;align-items:center;gap:.6rem;padding:.35rem .2rem 0;direction:ltr">' +
    '<span style="font-size:.85rem">🔍➖</span>' +
    '<input type="range" id="camZoom" style="flex:1;accent-color:#2563eb" min="1" max="1" step="0.1" value="1">' +
    '<span style="font-size:.85rem">➕🔍</span>' +
    '<span id="camZoomVal" style="font-size:.8rem;font-weight:800;min-width:36px;text-align:center;color:#2563eb">1×</span>' +
    '</div>' +
    '<div class="cam-actions no-print">' +
    '<button class="mbtn ghost" id="camTorch" style="display:none">🔦 فلاش</button>' +
    '<button class="mbtn danger" id="camClose">إغلاق الكاميرا</button>' +
    '</div>';
  const m = showModal('📷 مسح بالكاميرا', bodyHTML, [], () => stopCameraScanner());
  qrScanCount = 0; lastCamCode = ''; lastCamTime = 0; camBusy = false;
  try {
    if (typeof Html5Qrcode === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js');
    }
  } catch (e) {
    m.close();
    toast('تعذر تحميل مكتبة الكاميرا — تحتاج إنترنت في أول مرة فقط', 'error');
    return;
  }
  if (!document.getElementById('qrReader')) return; // المستخدم قفل النافذة
  try {
    qrScanner = new Html5Qrcode('qrReader', {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION, Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR, Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.PDF_417, Html5QrcodeSupportedFormats.AZTEC
      ]
    });
    const cams = await Html5Qrcode.getCameras();
    const camId = cams && cams.length ? (cams.find(c => /back|rear|environment/i.test(c.label)) || cams[cams.length - 1]).id : undefined;
    await qrScanner.start(
      camId ? { deviceId: { exact: camId } } : { facingMode: 'environment' },
      { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(h * 0.5) }), aspectRatio: 1.6 },
      txt => {
        const now = Date.now();
        /* تجاهل: لو الشاشة واقفة على الفلاش، أو نفس الكود اتقرا قبل 2.5 ثانية */
        if (camBusy) return;
        if (txt === lastCamCode && now - lastCamTime < 2500) return;

        const f = $('scanFlash'), ft = $('scanFlashTitle'), fc = $('scanFlashCode'), fi = $('scanFlashItem');
        const sc = $('scanCount');

        /* 🛡️ فحص رقم التحقق — لو الباركود اتقرأ ناقص بيرفضه ويطلب إعادة المسح */
        if (!eanOk(txt)) {
          beep('bad');
          camBusy = true;
          if (ft) ft.textContent = '✗ قراءة ناقصة';
          if (fc) fc.textContent = txt;
          if (fi) fi.textContent = 'الباركود اتقص — وجّه الكاميرا صح وامسح تاني';
          if (f) {
            f.classList.add('show', 'err');
            setTimeout(() => { f.classList.remove('show', 'err'); camBusy = false; }, 1200);
          }
          if (sc) sc.textContent = '⚠️ قراءة مرفوضة — الكود ناقص: ' + txt;
          return;
        }

        lastCamCode = txt; lastCamTime = now; camBusy = true;
        qrScanCount++;
        resetIdleTimer(); // المسح بالكاميرا = نشاط، بيصفّر عداد الخمول
        const before = inventoryData.find(i => i.code === txt);
        processCode(txt);
        const after = inventoryData.find(i => i.code === txt);
        if (ft) ft.textContent = '✓ تم الجرد';
        if (fc) fc.textContent = txt;
        if (fi) fi.textContent = (after ? after.name : txt) + ' — الكمية: ' + (after ? fmtQ(after.actualQuantity) : '1');
        if (f) {
          f.classList.add('show');
          setTimeout(() => { f.classList.remove('show'); camBusy = false; }, 1000);
        } else camBusy = false;
        if (sc) sc.textContent = '✅ تم مسح ' + qrScanCount + (before ? '' : ' — (كود جديد)');
      },
      () => {}
    );
    qrCamOn = true;
    /* 🎯 سر التقاط الباركود الصغير: (1) رفع الدقة لـ 1080p (ideal مش exact — مفيش فشل) */
    try { await qrScanner.applyVideoConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } }); } catch (e) {}
    /* (2) الفوكس المستمر — الموبايل يفضل مظبط على الباركود حتى وهو قريب جدًا */
    try { await qrScanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    const closeBtn = $('camClose');
    if (closeBtn) closeBtn.onclick = () => { stopCameraScanner(); m.close(); };
    /* زر الفلاش لو مدعوم */
    try {
      const caps = qrScanner.getRunningTrackCapabilities && qrScanner.getRunningTrackCapabilities();
      if (caps && caps.torch) {
        const tb = $('camTorch');
        tb.style.display = '';
        let on = false;
        tb.onclick = () => {
          on = !on;
          qrScanner.applyVideoConstraints({ advanced: [{ torch: on }] }).catch(() => {});
          tb.textContent = on ? '🔦 إطفاء الفلاش' : '🔦 فلاش';
        };
      }
      /* (3) سلايدر الزوم — بيتفعل لو الكاميرا بتدعم التقريب الرقمي/البصري */
      if (caps && caps.zoom && caps.zoom.max > caps.zoom.min) {
        const zw = $('zoomWrap');
        if (zw && zw.style) {
          zw.style.display = 'flex';
          const zr = $('camZoom'), zv = $('camZoomVal');
          zr.min = String(caps.zoom.min); zr.max = String(caps.zoom.max); zr.step = String(caps.zoom.step || 0.1);
          let cur = 1;
          try {
            const st = qrScanner.getRunningTrackSettings && qrScanner.getRunningTrackSettings();
            if (st && st.zoom) cur = st.zoom;
          } catch (e) {}
          zr.value = String(cur);
          if (zv) zv.textContent = (Math.round(cur * 10) / 10) + '×';
          zr.oninput = () => {
            const z = parseFloat(zr.value) || 1;
            if (zv) zv.textContent = (Math.round(z * 10) / 10) + '×';
            qrScanner.applyVideoConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
          };
        }
      }
    } catch (e) {}
  } catch (e) {
    m.close();
    toast('تعذر فتح الكاميرا — تأكد من السماح بالوصول للكاميرا', 'error');
  }
}
function stopCameraScanner(){
  if (qrScanner && qrCamOn) {
    qrCamOn = false;
    qrScanner.stop().then(() => { try { qrScanner.clear(); } catch (e) {} }).catch(() => {});
  }
}

/* ---------- خدمة الأوفلاين (Service Worker) ---------- */
function registerSW(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  /* sw.js ملف بجوار index.html في الريبو — لو مش موجود بيتجاهل بهدوء */
  navigator.serviceWorker.register('sw.js')
    .then(reg => { if (reg && reg.update) reg.update().catch(() => {}); })
    .catch(() => {});
}

/* ---------- عام ---------- */
function saveDateTime(){
  store.setItem(S('selectedDateTime'), $('currentDateTime').value);
  schedulePush();
}
function toggleFullScreen(){
  try {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  } catch (e) {}
}
function openSidebar(){ $('sidebar').classList.add('open'); $('sidebarOverlay').classList.add('show'); }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('sidebarOverlay').classList.remove('show'); }

/* ---------- التشغيل ---------- */
let bootDone = false, seenData = false, seenMeta = false;
function maybeFinishBoot(){
  if (bootDone) return;
  if (!seenData || !seenMeta) return;
  bootDone = true;
  const done = () => { bootHide(); finalize(); };
  /* لو السيرفر نفسه مفيش فيه مستخدمين (يعني أول مرة خلص) → ازرع admin/123456 */
  if (usersList.length === 0) {
    seedDefaultAdmin().then(done);
    return;
  }
  /* نقطة 9: فيه جلسة محفوظة من قبل الريفريش؟ → السيرفر يأكدها الأول (نقطة 4) */
  if (sessionUser && loginRequired()) {
    bootMsg('بنراجع جلستك المحفوظة مع السيرفر...');
    validateSavedSession().then(res => {
      if (typeof res === 'string' && res.indexOf('taken:') === 0) {
        const takenName = res.slice(6);
        bootHide();
        updateTable(); updateStats(); renderCategoryButtons(); applyLogo(); /* جهّز الواجهة ورا الرسالة */
        /* رسالة كبيرة في منتصف الشاشة — الحساب اتفتح على جهاز تاني */
        bigBlock('🚫', 'الحساب ده مفتوح على جهاز تاني',
          'اتسجل دخول "<b>' + esc(takenName) + '</b>" من جهاز آخر بعد آخر مرة اشتغلت هنا.<br>سجّل خروجه من هناك الأول — أو استنى دقيقة ونص والجلسة القديمة هتقفل لوحدها وبعدين ادخل من هنا.',
          '🔑 تسجيل الدخول', () => { document.querySelectorAll('.big-block-ov').forEach(x => x.remove()); showLock(); });
        return;
      }
      if (res === true) {
        done();
        toast('رجعناك تاني يا ' + sessionUser.name + ' 👋', 'success');
        return;
      }
      done(); /* الجلسة باطلة (مستخدم اتمسح/اتوقف) → finalize هيعرض شاشة الدخول */
    }).catch(() => done());
    return;
  }
  done();
}
function finalize(){
  updateTable(); updateStats(); renderCategoryButtons(); applyLogo();
  if (loginRequired()) showLock(); else applyUserUI();
  try { if (isAdmin() && syncOn) attachNotifListener(); } catch(e){}
}
// لو الرابط فيه ?clear=1 أو ?wipe=1 → امسح الكاش المحلي فوراً (عشان تشوف الملف فاضي)
try {
  const qs = location.search||'';
  if (qs.includes('clear=1') || qs.includes('wipe=1') || qs.includes('factory=1')) {
    store.clear();
  }
} catch(e){}
window.addEventListener('load', () => {
  try {
    const man = { name: 'جرد الأصناف — بيمبو ستور', short_name: 'جرد بيمبو', start_url: '.', display: 'standalone', background_color: '#f8fafc', theme_color: '#2563eb', icons: [{ src: LOGO_URI, sizes: '220x200', type: 'image/png' }] };
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(man));
    document.head.appendChild(l);
  } catch (e) {}
  const dt = $('currentDateTime');
  dt.value = nowLocalDT();
  setupBarcodeInput();
  setupTableEvents();
  $('userChip').addEventListener('click', () => setUserFilter(''));
  setupIdleWatch();
  registerSW();
  bootMsg('جاري الاتصال بقاعدة البيانات...');
  /* فك قفل الصوت على iOS/Chrome من أول لمسة */
  document.addEventListener('pointerdown', primeAudio, { once: true });
  document.addEventListener('keydown', primeAudio, { once: true });
  window.addEventListener('offline', () => { setSyncUI('mid', 'انقطع الاتصال — كمّل جردك عادي وهيترفع لوحده'); updateOfflineBar(); });
  window.addEventListener('online', () => {
    if (!syncOn) connectFirebase(true);
    else if (pendingOfflinePush) { pendingOfflinePush = false; pushNow(); }
    updateOfflineBar();
  });
  /* ⛔ تحذير قبل قفل/تحديث الصفحة لو فيه جرد لسه مترفعش والنت مقطوع */
  window.addEventListener('beforeunload', e => {
    if ((pendingOfflinePush || pendingMetaPush) && (navigator.onLine === false || fbConnected === false)) {
      e.preventDefault();
      e.returnValue = ''; /* المتصفح بيظهر تحذير "التغييرات مترفعتش — متأكد إنك عايز تخرج؟" */
    }
  });
  /* ضمانة رفع المعلّق: كل 10 ثواني، لو النت راجع وفيه حاجة معلقة → ارفعها لوحدك */
  setInterval(() => {
    if (navigator && navigator.onLine === false) return;
    if (syncOn && pendingOfflinePush) { pendingOfflinePush = false; pushNow(); }
    if (syncOn && seenMeta && pendingMetaPush) { pendingMetaPush = false; pushMeta(true); }
  }, 10000);

  /* ---- منطق الإقلاع الجديد: أونلاين 100% ----
     ⛔ ممنوع تشغيل البرنامج في أكتر من تبويب/متصفح على نفس الجهاز في نفس الوقت */
  function startApp(){
    const cfg = effectiveCfg();
    if (!cfg || !cfg.apiKey) {
      /* مفيش إعدادات أصلًا → بوابة إعداد إلزامية (الحالة الوحيدة اللي بتظهر فيها شاشة الاتصال) */
      bootShow();
      const wrap = document.getElementById('bootCfgWrap');
      if (wrap) wrap.style.display = 'block';
      bootMsg('مفيش قاعدة بيانات متوصلة. الأدمن لازم يلصق بيانات Firebase هنا مرة واحدة.');
      const btn = document.getElementById('bootCfgBtn');
      if (btn) btn.onclick = async () => {
        const v = document.getElementById('bootCfg').value.trim();
        const c = parseCfgLoose(v);
        if (!c) { toast('الكود مش مفهوم — الصق كود Firebase كامل', 'error'); return; }
        firebaseCfgLS = c;
        bootMsg('جاري الربط...');
        const ok = await connectFirebase(true);
        if (ok) { wrap.style.display = 'none'; bootHide(); }
      };
      return;
    }
    /* ⚡ لقطة طوارئ محفوظة؟ البرنامج يفتح فورًا — حتى لو النت مقطوع — والمزامنة تكمّل لوحدها في الخلفية */
    if (false && hydrateSnapshot()) {
      bootDone = true; seenData = true; seenMeta = true;
      updateTable(); updateStats(); renderCategoryButtons(); applyLogo();
      if (loginRequired()) {
        if (sessionUser) applyUserUI();
        else showLock();
      } else applyUserUI();
      updateOfflineBar();
      if (navigator && navigator.onLine === false && sessionUser) {
        toast('📡 أوفلاين دلوقتي — كمّل من حيث وقفت، وكل حاجة هتترفع لوحدها أول ما النت يرجع', 'warning');
      }
      connectFirebase(true);
      return;
    }
    /* أول تشغيل على الجهاز ده خالص (ولا لقطة): البرنامج يشتغل لحاله لما البيانات توصل — من غير أي شاشة انتظار */
    updateTable(); updateStats(); renderCategoryButtons(); applyLogo();
    updateOfflineBar();
    connectFirebase(true);
  }
  /* نقطة 12: بوابة التحميل مش حبس — زرار إعادة يدوية بعد 8 ثواني + نصايح بعد 20 ثانية */
  const bootT0 = Date.now();
  const bootTick = setInterval(() => {
    if (bootDone || !document.getElementById('bootGate')) { clearInterval(bootTick); return; }
    const el = Math.floor((Date.now() - bootT0) / 1000);
    if (el >= 8) { const r = document.getElementById('bootRetry'); if (r) r.style.display = 'inline-block'; }
    if (el >= 20) { const tp = document.getElementById('bootTips'); if (tp) tp.style.display = 'block'; }
  }, 1000);
  const retryBtn = document.getElementById('bootRetry');
  if (retryBtn) retryBtn.onclick = () => {
    bootMsg('جاري الاتصال بقاعدة البيانات...');
    const ic = document.getElementById('bootIcon');
    if (ic) ic.textContent = '⏳';
    connectFirebase(true).then(ok => {
      if (!ok) {
        bootMsg(lastSyncErr ? ('تعذر الاتصال: ' + lastSyncErr) : 'تعذر الاتصال بالسيرفر — بيحاول تاني برضه...');
        if (ic) ic.textContent = '🔁';
      }
    });
  };
  tabGuard(startApp);
});
