/* ============================================================
   نظام جرد الأصناف — النسخة الجديدة
   أهم فرق جوهري عن النسخة القديمة: العدّ بيتم بـ Firebase transaction
   على كل مخزن لوحده، مش بقراءة الرقم محليًا وكتابته تاني.
   ده معناه لو الأدمن واليوزر ضغطوا "جرد" لنفس الكود في نفس اللحظة،
   السيرفر بيعيد المحاولة تلقائيًا (retry) ويجمع الاتنين صح، من غير
   ما حد "يمسح" تعديل التاني. ولو نفس الكود موجود في مخزنين مختلفين،
   كل مخزن ليه رقمه المستقل تمامًا (items/{code}/warehouses/{whId}).
============================================================ */

let db, auth, currentApp;
let profile = null;          // { uid, name, role, warehouses, active }
let syncPath = localStorage.getItem('syncPath') || 'jard2';
let itemsData = {};          // { code: { name, group, warehouses:{whId:{system,actual,counts,lastBy,lastAt}} } }
let usersData = {};
let warehousesData = {};
let currentWarehouse = localStorage.getItem('currentWarehouse') || '';
let currentFilter = 'all';
let searchTerm = '';
let itemsListenerAttached = false;
let qrScanner = null;
let lastScanCode = '', lastScanTime = 0;

function $(id){ return document.getElementById(id); }
function fmtQ(n){ n = Number(n)||0; return (Math.round(n*100)/100).toString(); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sanitizeCode(c){ return String(c||'').trim().replace(/[.#$\[\]\/]/g, '_'); }
function toast(msg, type){
  const box = $('toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast t-' + (type||'info');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 300); }, 3200);
}
function loadScript(src){
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="'+src+'"]')) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('فشل تحميل: ' + src));
    document.head.appendChild(s);
  });
}
function openModal(id){ const m = $(id); if (m) m.style.display = 'flex'; }
function closeModal(id){ const m = $(id); if (m) m.style.display = 'none'; }

/* ============================================================
   1) تحميل Firebase وتهيئته
============================================================ */
async function bootFirebase(){
  try {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey) {
      showBootError('لازم تحط إعدادات Firebase الأول (FIREBASE_CONFIG داخل index.html)');
      return;
    }
    await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
    await Promise.all([
      loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js'),
      loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-database-compat.js')
    ]);
    currentApp = firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.database();
    auth.onAuthStateChanged(onAuthChanged, (err) => showBootError('خطأ في المصادقة: ' + err.message));
  } catch (e) {
    showBootError('تعذر تحميل مكتبات Firebase — تأكد من الاتصال بالإنترنت. (' + (e.message||e) + ')');
  }
}
function showBootError(msg){
  const lock = $('initialLock');
  lock.innerHTML = '<div class="il-card"><h2>حصل خطأ</h2><div style="color:#b91c1c;font-size:.85rem;margin:.8rem 0">' + esc(msg) + '</div><div class="il-sub">افتح أدوات المطوّر (F12) → تبويب Console لمزيد من التفاصيل</div></div>';
}

function authEmail(username){
  return String(username).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@jard.local';
}

async function onAuthChanged(user){
  if (!user) {
    profile = null;
    $('initialLock').style.display = 'none';
    $('loginScreen').style.display = 'flex';
    $('appRoot').style.display = 'none';
    return;
  }
  try {
    const snap = await db.ref(syncPath + '/users/' + user.uid).once('value');
    let p = snap.val();
    if (!p) {
      // أول مستخدم يسجل دخول على قاعدة فاضية بيبقى أدمن تلقائيًا
      const usersSnap = await db.ref(syncPath + '/users').once('value');
      const isFirst = !usersSnap.exists();
      p = { name: user.email.split('@')[0], role: isFirst ? 'admin' : 'user', active: true, warehouses: 'all', createdAt: Date.now() };
      await db.ref(syncPath + '/users/' + user.uid).set(p);
    }
    if (!p.active) {
      toast('حسابك متوقف — كلم الأدمن', 'error');
      await auth.signOut();
      return;
    }
    profile = Object.assign({ uid: user.uid }, p);
    startSession();
    attachDataListeners();
    $('initialLock').style.display = 'none';
    $('loginScreen').style.display = 'none';
    $('appRoot').style.display = 'block';
    renderShell();
  } catch (e) {
    console.error(e);
    toast('تعذر تحميل بيانات المستخدم: ' + e.message, 'error');
  }
}

function startSession(){
  const ref = db.ref(syncPath + '/sessions/' + profile.uid);
  ref.set({ ts: firebase.database.ServerValue.TIMESTAMP, name: profile.name });
  ref.onDisconnect().remove();
  setInterval(() => { if (profile) ref.update({ ts: firebase.database.ServerValue.TIMESTAMP }); }, 60000);
}

function logAction(action, detail){
  if (!profile) return;
  db.ref(syncPath + '/auditLog').push({
    uid: profile.uid, name: profile.name, action, detail: detail || '',
    ts: firebase.database.ServerValue.TIMESTAMP
  }).catch(()=>{});
}

/* ============================================================
   2) تسجيل الدخول / الخروج
============================================================ */
async function doLogin(){
  const u = $('loginUser').value.trim();
  const p = $('loginPass').value;
  $('loginErr').style.display = 'none';
  if (!u || !p) return;
  try {
    await auth.signInWithEmailAndPassword(authEmail(u), p);
  } catch (e) {
    $('loginErr').textContent = 'خطأ في اسم المستخدم أو كلمة المرور';
    $('loginErr').style.display = 'block';
  }
}
function doLogout(){
  if (profile) db.ref(syncPath + '/sessions/' + profile.uid).remove().catch(()=>{});
  auth.signOut();
}

/* ============================================================
   3) الاستماع للبيانات (أصناف / مخازن / مستخدمين)
============================================================ */
function attachDataListeners(){
  if (itemsListenerAttached) return;
  itemsListenerAttached = true;

  db.ref(syncPath + '/warehouses').on('value', snap => {
    warehousesData = snap.val() || {};
    if (!currentWarehouse || !warehousesData[currentWarehouse]) {
      const keys = Object.keys(warehousesData);
      currentWarehouse = keys[0] || '';
    }
    renderWarehouseBar();
    renderTable();
    renderWarehouseSettings();
  });

  db.ref(syncPath + '/items').on('value', snap => {
    itemsData = snap.val() || {};
    renderTable();
    renderStats();
  });

  if (profile.role === 'admin') {
    db.ref(syncPath + '/users').on('value', snap => {
      usersData = snap.val() || {};
      renderUsersSettings();
    });
    db.ref(syncPath + '/sessions').on('value', snap => {
      renderSessionsBadges(snap.val() || {});
    });
    db.ref(syncPath + '/auditLog').limitToLast(80).on('value', snap => {
      renderAuditLog(snap.val() || {});
    });
  }
}

/* ============================================================
   4) العدّ الآمن للتعارض (الجزء الأهم)
============================================================ */
async function scanIncrement(code, delta){
  code = sanitizeCode(code);
  if (!code || !currentWarehouse) { toast('اختار مخزن الأول', 'error'); return null; }
  const base = syncPath + '/items/' + code + '/warehouses/' + currentWarehouse;
  const uid = profile.uid;

  // 1) عدّاد الفعلي: transaction بيعيد المحاولة تلقائيًا لو حصل تعارض،
  //    فمينفعش يضيع تحديث حصل في نفس اللحظة من جهاز تاني.
  const res = await db.ref(base + '/actual').transaction(cur => {
    const next = (Number(cur) || 0) + delta;
    return next < 0 ? 0 : Math.round(next * 100) / 100;
  });

  // 2) حصة المستخدم نفسه (لمعرفة مين عدّ قد إيه) — كل مستخدم بيكتب في مفتاحه
  //    هو بس، فمفيش أي تعارض ممكن يحصل بين مستخدمين مختلفين هنا أصلاً.
  await db.ref(base + '/counts/' + uid).transaction(cur => {
    const next = (Number(cur) || 0) + delta;
    return next < 0 ? 0 : next;
  });
  await db.ref(base).update({ lastBy: profile.name, lastAt: firebase.database.ServerValue.TIMESTAMP });

  // تأكد إن بيانات الاسم/المجموعة موجودة لو الصنف جديد كليًا
  const meta = await db.ref(syncPath + '/items/' + code).child('name').once('value');
  if (!meta.exists()) {
    await db.ref(syncPath + '/items/' + code).update({ name: 'صنف جديد', group: 'غير معروف', code, editedAt: Date.now() });
  }
  logAction(delta > 0 ? 'scan+1' : 'scan-1', code + ' @ ' + (warehousesData[currentWarehouse]?.name || currentWarehouse));
  return res.committed ? res.snapshot.val() : null;
}

async function manualSetSystemQty(code, whId, value){
  const v = Math.max(0, Number(value) || 0);
  await db.ref(syncPath + '/items/' + sanitizeCode(code) + '/warehouses/' + whId + '/system').set(v);
  logAction('تعديل رقم السيستم', code + ' = ' + v);
}
async function manualSetActualQty(code, whId, value){
  // تعديل يدوي مباشر (بيستخدمه الأدمن غالبًا للتصحيح) — مش زيادة، ده "تثبيت" رقم.
  const v = Math.max(0, Number(value) || 0);
  await db.ref(syncPath + '/items/' + sanitizeCode(code) + '/warehouses/' + whId).update({
    actual: v, lastBy: profile.name + ' (تعديل يدوي)', lastAt: firebase.database.ServerValue.TIMESTAMP
  });
  logAction('تعديل يدوي للفعلي', code + ' = ' + v + ' في ' + (warehousesData[whId]?.name||whId));
}

/* ============================================================
   5) واجهة المسح: كاميرا QR أو إدخال يدوي
============================================================ */
async function openScanner(){
  if (!currentWarehouse) { toast('لازم تختار مخزن الأول من الأعلى', 'error'); return; }
  openModal('scanModal');
  $('scanWhName').textContent = warehousesData[currentWarehouse]?.name || '';
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js');
    qrScanner = new Html5Qrcode('qrReaderBox');
    await qrScanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 230, height: 230 } },
      onScanSuccess,
      () => {}
    );
  } catch (e) {
    $('qrReaderBox').innerHTML = '<div style="color:#fca5a5;padding:1rem;text-align:center;font-size:.8rem">تعذر فتح الكاميرا — استخدم الإدخال اليدوي تحت</div>';
  }
}
async function closeScanner(){
  closeModal('scanModal');
  if (qrScanner) { try { await qrScanner.stop(); qrScanner.clear(); } catch(e){} qrScanner = null; }
}
async function onScanSuccess(text){
  const code = sanitizeCode(text);
  const now = Date.now();
  if (code === lastScanCode && (now - lastScanTime) < 900) return; // منع تكرار نفس اللقطة
  lastScanCode = code; lastScanTime = now;
  const after = await scanIncrement(code, +1);
  $('scanResult').textContent = code + (after ? ' — الرصيد الحالي: ' + fmtQ(after.actual) : '');
  if (navigator.vibrate) navigator.vibrate(60);
}
async function manualScanSubmit(){
  const inp = $('manualCodeInput');
  const code = inp.value.trim();
  if (!code) return;
  const after = await scanIncrement(code, +1);
  $('scanResult').textContent = code + (after ? ' — الرصيد الحالي: ' + fmtQ(after.actual) : '');
  inp.value = ''; inp.focus();
}

/* ============================================================
   6) رسم الواجهة
============================================================ */
function renderShell(){
  $('userNameTag').textContent = profile.name;
  $('userRoleTag').innerHTML = '<span class="badge ' + (profile.role==='admin'?'admin':'user') + '">' + (profile.role==='admin'?'أدمن':'مستخدم') + '</span>';
  $('adminOnlyBtns').style.display = profile.role === 'admin' ? 'flex' : 'none';
  renderWarehouseBar();
}

function visibleWarehouseIds(){
  const all = Object.keys(warehousesData);
  if (profile.role === 'admin' || profile.warehouses === 'all') return all;
  const allowed = profile.warehouses || {};
  return all.filter(id => allowed[id]);
}

function renderWarehouseBar(){
  const ids = visibleWarehouseIds();
  const bar = $('whBar');
  if (!ids.length) { bar.innerHTML = '<span class="small-note">مفيش مخازن — الأدمن يقدر يضيف من الإعدادات</span>'; return; }
  if (!currentWarehouse || !ids.includes(currentWarehouse)) currentWarehouse = ids[0];
  bar.innerHTML = ids.map(id => (
    '<button class="wh-chip' + (id===currentWarehouse?' active':'') + '" onclick="selectWarehouse(\'' + id + '\')">' +
    esc(warehousesData[id].name) + '</button>'
  )).join('');
}
function selectWarehouse(id){
  currentWarehouse = id;
  localStorage.setItem('currentWarehouse', id);
  renderWarehouseBar(); renderTable(); renderStats();
}

function rowAgg(code, item){
  const wd = (item.warehouses && item.warehouses[currentWarehouse]) || {};
  const system = Number(wd.system) || 0;
  const actual = Number(wd.actual) || 0;
  const diff = Math.round((actual - system) * 100) / 100;
  const status = diff > 0 ? 'زيادة' : diff < 0 ? 'عجز' : 'متساوي';
  return { system, actual, diff, status, counts: wd.counts || {}, lastBy: wd.lastBy || '' };
}

function renderStats(){
  let sys=0, act=0;
  Object.keys(itemsData).forEach(code => { const a = rowAgg(code, itemsData[code]); sys += a.system; act += a.actual; });
  $('statSystem').textContent = fmtQ(sys);
  $('statActual').textContent = fmtQ(act);
  $('statDiff').textContent = fmtQ(act - sys);
  const pct = sys > 0 ? Math.min(100, Math.round((act/sys)*100)) : (act>0?100:0);
  $('statPct').textContent = pct + '%';
}

function setFilter(f){ currentFilter = f; document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active', b.dataset.f===f)); renderTable(); }
function onSearch(v){ searchTerm = v.trim().toLowerCase(); renderTable(); }

function renderTable(){
  const tbody = $('itemsTbody');
  if (!currentWarehouse) { tbody.innerHTML = '<tr><td colspan="8" class="tc">اختار مخزن الأول</td></tr>'; return; }
  let rows = Object.keys(itemsData).map(code => ({ code, item: itemsData[code], agg: rowAgg(code, itemsData[code]) }));
  if (searchTerm) rows = rows.filter(r => r.code.toLowerCase().includes(searchTerm) || (r.item.name||'').toLowerCase().includes(searchTerm));
  if (currentFilter === 'surplus') rows = rows.filter(r => r.agg.diff > 0);
  else if (currentFilter === 'deficit') rows = rows.filter(r => r.agg.diff < 0);
  else if (currentFilter === 'counted') rows = rows.filter(r => r.agg.actual > 0);
  else if (currentFilter === 'notcounted') rows = rows.filter(r => r.agg.actual === 0);
  rows.sort((a,b) => a.code.localeCompare(b.code, 'ar'));

  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8" class="tc">لا توجد أصناف مطابقة</td></tr>'; return; }

  tbody.innerHTML = rows.map(r => {
    const cls = r.agg.diff > 0 ? 'row-surplus' : r.agg.diff < 0 ? 'row-deficit' : '';
    const contrib = Object.keys(r.agg.counts).length
      ? '<div class="contrib">' + Object.entries(r.agg.counts).map(([u,q]) => (usersNameOf(u) + ':' + fmtQ(q))).join(' + ') + '</div>' : '';
    const canEdit = profile.role === 'admin';
    return '<tr class="' + cls + '">' +
      '<td class="tc txs">' + esc(r.code) + '</td>' +
      '<td>' + esc(r.item.name||'') + (canEdit ? '' : '') + '</td>' +
      '<td class="txs">' + esc(r.item.group||'') + '</td>' +
      '<td class="tc">' + (canEdit
        ? '<input class="rowselect tc" style="width:4rem" type="number" value="'+r.agg.system+'" onchange="manualSetSystemQty(\''+r.code+'\',\''+currentWarehouse+'\',this.value)">'
        : fmtQ(r.agg.system)) + '</td>' +
      '<td class="tc fwb tblue">' + fmtQ(r.agg.actual) + contrib + '</td>' +
      '<td class="tc fwb">' + fmtQ(r.agg.diff) + '</td>' +
      '<td class="tc txs">' + r.agg.status + '</td>' +
      '<td class="tc"><div class="users-actions">' +
        '<button class="icon-btn b-open" onclick="quickAdjust(\''+r.code+'\',1)">+1</button>' +
        '<button class="icon-btn" style="background:#fef3c7;color:#b45309" onclick="quickAdjust(\''+r.code+'\',-1)">-1</button>' +
        (canEdit ? '<button class="icon-btn" style="background:#eef2ff;color:#4338ca" onclick="promptManualActual(\''+r.code+'\')">تثبيت</button>' : '') +
      '</div></td>' +
    '</tr>';
  }).join('');
}
function usersNameOf(uid){ return (usersData[uid] && usersData[uid].name) || (uid===profile.uid ? profile.name : 'مستخدم'); }
function quickAdjust(code, delta){ scanIncrement(code, delta); }
function promptManualActual(code){
  const v = prompt('الكمية الفعلية الجديدة لهذا المخزن؟');
  if (v === null) return;
  manualSetActualQty(code, currentWarehouse, v);
}

/* ============================================================
   7) استيراد ملف Excel
============================================================ */
let importedRows = null, importedHeaders = [];
async function handleExcelFile(inputEl){
  const file = inputEl.files[0];
  if (!file) return;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) { toast('الملف فاضي', 'error'); return; }
  importedHeaders = rows[0];
  importedRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
  const sel = (id) => {
    const el = $(id);
    el.innerHTML = importedHeaders.map((h,i) => '<option value="'+i+'">'+esc(h||('عمود '+(i+1)))+'</option>').join('');
  };
  sel('impCode'); sel('impName'); sel('impQty'); sel('impGroup');
  // خمّن الأعمدة تلقائيًا من اسم العنوان
  const guess = (keys, id) => {
    const idx = importedHeaders.findIndex(h => keys.some(k => String(h).toLowerCase().includes(k)));
    if (idx >= 0) $(id).value = idx;
  };
  guess(['code','كود'], 'impCode');
  guess(['name','اسم'], 'impName');
  guess(['qty','quantity','كمية'], 'impQty');
  guess(['group','مجموعة','فئة'], 'impGroup');
  const whSel = $('impWarehouse');
  whSel.innerHTML = Object.keys(warehousesData).map(id => '<option value="'+id+'">'+esc(warehousesData[id].name)+'</option>').join('');
  openModal('importModal');
}
async function confirmImport(){
  if (!importedRows) return;
  const ci = Number($('impCode').value), ni = Number($('impName').value), qi = Number($('impQty').value), gi = Number($('impGroup').value);
  const whId = $('impWarehouse').value;
  const mode = document.querySelector('input[name="impMode"]:checked').value;
  if (!whId) { toast('اختار مخزن للاستيراد', 'error'); return; }
  const updates = {};
  importedRows.forEach(r => {
    const code = sanitizeCode(r[ci]);
    if (!code) return;
    const name = String(r[ni] ?? '').trim() || 'بدون اسم';
    const group = String(r[gi] ?? '').trim() || 'عام';
    const qty = Number(r[qi]) || 0;
    updates[code + '/name'] = name;
    updates[code + '/group'] = group;
    updates[code + '/code'] = code;
    updates[code + '/editedAt'] = Date.now();
    updates[code + '/warehouses/' + whId + '/system'] = qty;
    if (mode === 'replace') updates[code + '/warehouses/' + whId + '/actual'] = 0;
  });
  try {
    await db.ref(syncPath + '/items').update(updates);
    logAction('استيراد إكسيل', Object.keys(importedRows).length + ' صف إلى ' + (warehousesData[whId]?.name||whId));
    toast('تم الاستيراد بنجاح', 'success');
    closeModal('importModal');
  } catch (e) { toast('فشل الاستيراد: ' + e.message, 'error'); }
}

/* ============================================================
   8) إدارة المخازن (أدمن فقط)
============================================================ */
async function addWarehouse(){
  const name = $('newWhName').value.trim();
  if (!name) return;
  const id = 'wh_' + Date.now();
  await db.ref(syncPath + '/warehouses/' + id).set({ name, createdAt: Date.now() });
  $('newWhName').value = '';
  logAction('إضافة مخزن', name);
}
async function renameWarehouse(id){
  const cur = warehousesData[id]?.name || '';
  const name = prompt('اسم المخزن الجديد؟', cur);
  if (!name || !name.trim()) return;
  await db.ref(syncPath + '/warehouses/' + id + '/name').set(name.trim());
}
async function deleteWarehouse(id){
  if (!confirm('حذف المخزن؟ (بيانات الجرد المرتبطة بيه هتفضل موجودة تحت الأصناف لكن مش هتظهر)')) return;
  await db.ref(syncPath + '/warehouses/' + id).remove();
  logAction('حذف مخزن', id);
}
function renderWarehouseSettings(){
  const box = $('whManageList'); if (!box) return;
  const ids = Object.keys(warehousesData);
  box.innerHTML = ids.length ? ids.map(id =>
    '<div class="wh-manage-row"><span>' + esc(warehousesData[id].name) + '</span>' +
    '<div class="users-actions">' +
      '<button class="icon-btn b-open" onclick="renameWarehouse(\''+id+'\')">تعديل</button>' +
      '<button class="icon-btn del" onclick="deleteWarehouse(\''+id+'\')">حذف</button>' +
    '</div></div>'
  ).join('') : '<div class="users-empty">لا توجد مخازن بعد</div>';
}

/* ============================================================
   9) إدارة المستخدمين (أدمن فقط)
   ملاحظة: إنشاء حساب Auth جديد بيتم بتطبيق Firebase ثانوي مؤقت
   عشان الأدمن يفضل مسجل دخول من غير ما يتسجل خروج.
============================================================ */
async function createUserAccount(){
  const name = $('nuName').value.trim();
  const username = $('nuUser').value.trim();
  const pass = $('nuPass').value;
  const role = $('nuRole').value;
  if (!name || !username || pass.length < 6) { toast('البيانات ناقصة أو الباسورد أقل من 6 حروف', 'error'); return; }
  const secondary = firebase.initializeApp(window.FIREBASE_CONFIG, 'secondary_' + Date.now());
  try {
    const cred = await secondary.auth().createUserWithEmailAndPassword(authEmail(username), pass);
    await db.ref(syncPath + '/users/' + cred.user.uid).set({
      name, role, active: true, warehouses: 'all', createdAt: Date.now(), createdBy: profile.name
    });
    toast('تم إنشاء المستخدم', 'success');
    logAction('إنشاء مستخدم', name);
    $('nuName').value=''; $('nuUser').value=''; $('nuPass').value='';
  } catch (e) {
    toast('فشل الإنشاء: ' + (e.message||e), 'error');
  } finally {
    await secondary.auth().signOut().catch(()=>{});
    await secondary.delete().catch(()=>{});
  }
}
async function toggleUserActive(uid){
  const u = usersData[uid]; if (!u) return;
  await db.ref(syncPath + '/users/' + uid + '/active').set(!u.active);
  logAction('تفعيل/إيقاف مستخدم', uid);
}
async function setUserRole(uid, role){
  await db.ref(syncPath + '/users/' + uid + '/role').set(role);
  logAction('تغيير صلاحية', uid + ' -> ' + role);
}
let onlineSessions = {};
function renderSessionsBadges(sessions){ onlineSessions = sessions; renderUsersSettings(); }
function renderUsersSettings(){
  const box = $('usersTableWrap'); if (!box) return;
  const ids = Object.keys(usersData);
  if (!ids.length) { box.innerHTML = '<div class="users-empty">لا يوجد مستخدمون</div>'; return; }
  const now = Date.now();
  box.innerHTML = '<table class="users-table"><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>متصل</th><th>إجراءات</th></tr></thead><tbody>' +
    ids.map(uid => {
      const u = usersData[uid];
      const online = onlineSessions[uid] && (now - onlineSessions[uid].ts) < 120000;
      return '<tr class="' + (u.active?'':'row-off') + '">' +
        '<td>' + esc(u.name) + '</td>' +
        '<td><select class="rowselect" onchange="setUserRole(\''+uid+'\',this.value)">' +
          '<option value="user"' + (u.role!=='admin'?' selected':'') + '>مستخدم</option>' +
          '<option value="admin"' + (u.role==='admin'?' selected':'') + '>أدمن</option>' +
        '</select></td>' +
        '<td><span class="badge ' + (u.active?'on':'off') + '">' + (u.active?'مفعّل':'موقوف') + '</span></td>' +
        '<td><span class="sess-dot ' + (online?'on':'') + '"></span></td>' +
        '<td class="users-actions"><button class="icon-btn utoggle ' + (u.active?'off':'on') + '" onclick="toggleUserActive(\''+uid+'\')">' + (u.active?'إيقاف':'تفعيل') + '</button></td>' +
      '</tr>';
    }).join('') + '</tbody></table>';
}
function renderAuditLog(log){
  const box = $('auditLogBox'); if (!box) return;
  const entries = Object.values(log).sort((a,b)=> (b.ts||0)-(a.ts||0));
  box.innerHTML = entries.length ? entries.map(e =>
    '<div class="log-item"><span>' + esc(e.name) + ' — ' + esc(e.action) + (e.detail?(' ('+esc(e.detail)+')'):'') + '</span>' +
    '<span class="lt">' + (e.ts ? new Date(e.ts).toLocaleString('ar-EG') : '') + '</span></div>'
  ).join('') : '<div class="users-empty">لا يوجد سجل بعد</div>';
}

/* ============================================================
   10) الإعدادات: مسار المزامنة / نسخ احتياطي / إعادة ضبط
============================================================ */
function saveSyncPath(){
  const v = $('syncPathInput').value.trim();
  if (!v) return;
  syncPath = v;
  localStorage.setItem('syncPath', v);
  toast('اتغيّر مسار المزامنة — إعادة تحميل الصفحة...', 'success');
  setTimeout(()=>location.reload(), 800);
}
async function exportBackup(){
  const snap = await db.ref(syncPath).once('value');
  const blob = new Blob([JSON.stringify(snap.val(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jard-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  logAction('نسخ احتياطي', 'تصدير');
}
async function importBackupFile(inputEl){
  const file = inputEl.files[0]; if (!file) return;
  if (!confirm('استيراد النسخة الاحتياطية هيستبدل كل البيانات الحالية. متأكد؟')) { inputEl.value=''; return; }
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    await db.ref(syncPath).set(data);
    toast('تم الاسترجاع بنجاح', 'success');
    logAction('نسخ احتياطي', 'استرجاع');
  } catch (e) { toast('ملف غير صالح', 'error'); }
}
async function factoryReset(){
  if (profile.role !== 'admin') { toast('للأدمن فقط', 'error'); return; }
  const sure = confirm('هيتم مسح كل الأصناف والجرد نهائيًا (المستخدمون والمخازن هيفضلوا زي ما هم). متأكد؟');
  if (!sure) return;
  const pass = prompt('اكتب كلمة مرورك للتأكيد:');
  if (!pass) return;
  try {
    await auth.signInWithEmailAndPassword(auth.currentUser.email, pass);
    await db.ref(syncPath + '/items').set(null);
    logAction('إعادة ضبط المصنع', 'مسح كل الأصناف');
    toast('تم المسح', 'success');
  } catch (e) { toast('كلمة المرور غير صحيحة', 'error'); }
}

/* ============================================================
   11) تبويبات الإعدادات + تشغيل
============================================================ */
function openSettingsTab(name){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id==='tab-'+name));
}

document.addEventListener('DOMContentLoaded', () => {
  $('syncPathInput').value = syncPath;
  bootFirebase();
});
