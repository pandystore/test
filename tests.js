/* ============================================================
   اختبارات آلية أساسية — بيمبو جرد
   شغّلها بـ: node tests.js

   ملاحظة مهمة: الاختبارات دي بتستخرج نص الدوال الحقيقي من app.js
   وتشغّله في بيئة معزولة (مش نسخة منقولة بإيد) — يعني لو حد غيّر
   منطق الدالة في app.js وماحدّثش نتيجة متوقعة هنا، الاختبار هيفشل
   ويقولك بالظبط مين الدالة اللي اتغيّر سلوكها.

   الدوال دي مختارة لأنها "نقية" (pure) — مالهاش علاقة بالـ DOM
   ولا بـ Firebase، فتقدر تتاختبر لوحدها من غير أي تجهيز معقد.
   الدوال اللي متشابكة مع الشاشة أو المزامنة الحية (زي updateTable
   أو pushNow) محتاجة اختبارات تكامل حقيقية (Cypress/Playwright)
   مش unit tests، وده شغل تاني لو حبيت نعمله لاحقاً.
============================================================ */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');

function extractFn(name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('مالقتش الدالة: ' + name);
  let depth = 0, i = start, bodyStart = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') { if (depth === 0) bodyStart = i; depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function loadFns(names) {
  const code = names.map(extractFn).join('\n') + '\nmodule.exports = {' + names.join(',') + '};';
  const Module = require('module');
  const m = new Module();
  m._compile(code, 'extracted.js');
  return m.exports;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + ' — المتوقع: ' + JSON.stringify(expected) + ' | النتيجة: ' + JSON.stringify(actual)); }
}

console.log('== sanitizeCode / parseQty / fmtQ ==');
{
  const { sanitizeCode, parseQty, fmtQ } = loadFns(['sanitizeCode', 'parseQty', 'fmtQ']);
  eq(sanitizeCode('١٢٣٤'), '1234', 'أرقام عربية تتحول لإنجليزية');
  eq(sanitizeCode('  ABC123  '), 'ABC123', 'مسافات بتتشال من الطرفين');
  eq(sanitizeCode('كود'), '', 'حروف عربية غير أرقام بتتشال');
  eq(parseQty('12.5'), 12.5, 'رقم عشري عادي');
  eq(parseQty('  7 قطعة'), 7, 'رقم مع نص عربي حواليه');
  eq(parseQty('abc'), 0, 'نص غير رقمي = صفر');
  eq(fmtQ(5.0), 5, 'رقم صحيح من غير كسور عشرية');
  eq(fmtQ(5.126), 5.13, 'تقريب لمنزلتين عشريتين');
}

console.log('== calculateRow ==');
{
  const { calculateRow } = loadFns(['calculateRow']);
  const surplus = { actualQuantity: 12, systemQuantity: 10 };
  calculateRow(surplus);
  eq(surplus.status, 'زيادة', 'فعلي أكبر من سيستم = زيادة');
  eq(surplus.difference, 2, 'الفرق بيتحسب صح');

  const deficit = { actualQuantity: 3, systemQuantity: 10 };
  calculateRow(deficit);
  eq(deficit.status, 'عجز', 'فعلي أقل من سيستم = عجز');

  const equal = { actualQuantity: 10, systemQuantity: 10 };
  calculateRow(equal);
  eq(equal.status, 'متساوي', 'فعلي = سيستم = متساوي');
}

console.log('== eanOk (فحص checksum الباركود) ==');
{
  const { eanOk } = loadFns(['eanOk']);
  eq(eanOk('6291041500213'), true, 'باركود EAN-13 صحيح الـ checksum');
  eq(eanOk('6291041500219'), false, 'نفس الباركود برقم أخير غلط');
  eq(eanOk('ABC-123'), true, 'كود فيه حروف بيتقبل زي ما هو (مش EAN رقمي)');
  eq(eanOk('123'), true, 'كود أقصر من 8 أرقام بيتقبل زي ما هو');
}

console.log('== getUserRole ==');
{
  const code = extractFn('getUserRole');
  const wrapped = code + '\nmodule.exports = { getUserRole, usersList: typeof usersList !== "undefined" ? usersList : [] };';
  const Module = require('module');
  const m = new Module();
  // getUserRole بيعتمد على usersList العام — بنجهزها هنا زي ما البرنامج بيعملها
  m._compile('let usersList = [{name:"ahmed",role:"supervisor"}];\n' + wrapped, 'extracted2.js');
  const { getUserRole } = m.exports;
  eq(getUserRole('admin'), 'admin', 'اسم "admin" دايماً أدمن');
  eq(getUserRole('ahmed'), 'supervisor', 'مستخدم موجود بصلاحية مشرف');
  eq(getUserRole('غير موجود'), 'user', 'مستخدم مش موجود بالقايمة = user افتراضي');
  eq(getUserRole('بدون مستخدم'), '', '"بدون مستخدم" مالوش صلاحية عالية (إصلاح باج قديم)');
  eq(getUserRole(''), '', 'اسم فاضي = مفيش صلاحية');
}

console.log('== logItemChange (سجل تاريخ الصنف) ==');
{
  const code = extractFn('logItemChange');
  const Module = require('module');
  const m = new Module();
  m._compile('let sessionUser = {name:"sara"};\n' + code + '\nmodule.exports = { logItemChange };', 'extracted3.js');
  const { logItemChange } = m.exports;
  const item = { log: [] };
  logItemChange(item, 'actualQuantity', 5, 8);
  eq(item.log.length, 1, 'أول تعديل بيتسجل');
  eq(item.log[0].by, 'sara', 'اسم المستخدم بيتسجل صح');
  eq(item.log[0].from, 5, 'القيمة القديمة بتتسجل');
  eq(item.log[0].to, 8, 'القيمة الجديدة بتتسجل');
  for (let i = 0; i < 15; i++) logItemChange(item, 'note', 'a', 'b');
  eq(item.log.length, 10, 'السجل بيتقفل عند آخر 10 تعديلات بس');
}

console.log('\n' + '='.repeat(50));
console.log('النتيجة: ' + pass + ' نجح، ' + fail + ' فشل');
if (fail > 0) process.exit(1);
