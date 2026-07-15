const STORAGE_KEY = 'billing-atelier-v2';
const docTypes = [
  ['quote', 'ใบเสนอราคา', 'QT'], ['invoice', 'ใบแจ้งหนี้', 'INV'], ['receipt', 'ใบเสร็จรับเงิน', 'RC'],
  ['tax', 'ใบกำกับภาษี', 'TAX'], ['delivery', 'ใบส่งของ', 'DN'], ['purchase', 'ใบสั่งซื้อ', 'PO'],
];
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const blankProduct = { id: '', sku: '', name: '', category: '', unit: 'ชิ้น', cost: 0, price: 0, qty: 0, min: 0 };
const blankCustomer = { id: '', name: '', address: '', taxId: '', phone: '', email: '' };
const blankLine = { productId: '', name: '', qty: 1, price: 0, discount: 0 };
const seed = {
  products: [
    { id: uid('prd'), sku: 'BRG-001', name: 'กล่องของขวัญ Burgundy Signature', category: 'แพ็กเกจ', unit: 'กล่อง', cost: 520, price: 890, qty: 48, min: 15 },
    { id: uid('prd'), sku: 'NAV-204', name: 'สมุดแพ็กเกจ Blue Navy Premium', category: 'เครื่องเขียน', unit: 'เล่ม', cost: 240, price: 450, qty: 23, min: 20 },
    { id: uid('prd'), sku: 'RSG-118', name: 'เซ็ตการ์ด Rose Gold Foil', category: 'พรีเมียม', unit: 'ชุด', cost: 760, price: 1290, qty: 9, min: 12 },
  ],
  customers: [
    { id: uid('cus'), name: 'บริษัท ตัวอย่าง อินเตอร์เทรด จำกัด', address: '88 ถนนธุรกิจ แขวงสาทร กรุงเทพฯ 10120', taxId: '0105566000000', phone: '02-000-2026', email: 'billing@example.co.th' },
  ],
  documents: [], stockLogs: [], counters: {}, settings: { vatRate: 0.07 },
};
const storage = {
  load() { try { return { ...seed, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') }; } catch { return structuredClone(seed); } },
  save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },
  // Swap these methods with Supabase calls later; all UI code talks through this adapter.
};
let state = storage.load();
let active = 'dashboard';
let productQuery = '';
let customerQuery = '';
let documentQuery = '';
let editingProduct = { ...blankProduct };
let editingCustomer = { ...blankCustomer };
let draft = newDocument('invoice');
let toastTimer;

function persist(message = 'บันทึกข้อมูลสำเร็จ') { storage.save(state); render(); toast(message, 'success'); }
function toast(message, type = 'success') { const el = document.querySelector('#toast'); if (!el) return; el.textContent = message; el.className = `toast show ${type}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', 2800); }
function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function num(value) { return Number(value || 0); }
function docMeta(type) { return docTypes.find(([key]) => key === type) || docTypes[1]; }
function nextDocNumber(type) { const [, , code] = docMeta(type); const ym = today().slice(0, 7).replace('-', ''); const key = `${code}-${ym}`; const next = (state.counters[key] || 0) + 1; state.counters[key] = next; return `${code}-${ym}-${String(next).padStart(4, '0')}`; }
function newDocument(type = 'invoice') { return { id: '', type, number: '', customerId: '', date: today(), dueDate: today(), status: 'draft', lines: [{ ...blankLine }], note: '', paid: false }; }
function calcDoc(doc) { const subtotal = doc.lines.reduce((s, l) => s + (num(l.qty) * num(l.price)) - num(l.discount), 0); const vat = Math.max(0, subtotal) * state.settings.vatRate; return { subtotal, vat, total: subtotal + vat }; }
function customerName(id) { return state.customers.find((c) => c.id === id)?.name || 'ยังไม่เลือกลูกค้า'; }
function logStock(product, delta, reason) { state.stockLogs.unshift({ id: uid('log'), productId: product.id, sku: product.sku, name: product.name, delta, qty: product.qty, reason, at: new Date().toLocaleString('th-TH') }); }

function render() {
  const root = document.querySelector('#root'); if (!root) return;
  root.innerHTML = `<main>
    <section class="hero"><nav><div class="brand">✦ Billing Atelier</div><div class="nav-tabs">${['dashboard:ภาพรวม','products:สินค้า','customers:ลูกค้า','documents:เอกสาร','backup:สำรองข้อมูล'].map((item) => { const [key, label] = item.split(':'); return `<button class="${active === key ? 'active' : ''}" data-tab="${key}">${label}</button>`; }).join('')}</div><button data-print>พิมพ์ / PDF</button></nav>
      <div class="hero-grid"><div><p class="eyebrow">Burgundy · Blue Navy · Rose Gold</p><h1>ระบบบิลและสต็อกสินค้า ที่ใช้งานได้จริง</h1><p>จัดการสินค้า ลูกค้า เอกสารขาย สต็อก ประวัติ และสำรองข้อมูลด้วย localStorage พร้อมโครงสร้างที่ย้ายไป Supabase ได้ภายหลัง</p></div><div class="glass-card"><strong>ข้อมูลคงอยู่หลัง Refresh</strong><span>นำเข้า/ส่งออก JSON ได้ และทุกปุ่มหลักทำงานจริง</span></div></div></section>
    <section class="stats">${stats().map((s) => `<article><span>${s.label}</span><strong>${s.value}</strong></article>`).join('')}</section>
    <section class="app-shell">${renderPanel()}</section><div id="toast" class="toast"></div></main>`;
}
function stats() { const docs = state.documents; const sales = docs.filter((d) => d.type !== 'purchase').reduce((s, d) => s + calcDoc(d).total, 0); const unpaid = docs.filter((d) => !d.paid && d.type !== 'purchase').reduce((s, d) => s + calcDoc(d).total, 0); return [
  { label: 'ยอดขายรวม', value: money.format(sales) }, { label: 'เอกสารทั้งหมด', value: `${docs.length} ฉบับ` },
  { label: 'ยอดรอชำระ', value: money.format(unpaid) }, { label: 'สินค้าใกล้หมด', value: `${state.products.filter((p) => p.qty <= p.min).length} รายการ` },
]; }
function renderPanel() { return ({ dashboard: renderDashboard, products: renderProducts, customers: renderCustomers, documents: renderDocuments, backup: renderBackup }[active] || renderDashboard)(); }
function renderDashboard() { return `<section class="lower-grid"><article class="panel"><h2>รายการล่าสุด</h2>${state.documents.slice(0, 8).map(docRow).join('') || '<p class="empty">ยังไม่มีเอกสาร</p>'}</article><article class="panel"><h2>สินค้าใกล้หมด</h2>${state.products.filter((p) => p.qty <= p.min).map((p) => `<div class="stock"><div><strong>${esc(p.name)}</strong><span>${esc(p.sku)} · คงเหลือ ${p.qty} ${esc(p.unit)} / ขั้นต่ำ ${p.min}</span></div><b class="low">ใกล้หมด</b></div>`).join('') || '<p class="empty">ไม่มีสินค้าใกล้หมด</p>'}</article></section>`; }
function renderProducts() { const list = state.products.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(productQuery.toLowerCase())); return `<section class="workspace"><article class="panel"><h2>${editingProduct.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>${productForm()}</article><article class="panel"><div class="section-head"><h2>ระบบสินค้า</h2><input data-product-search placeholder="ค้นหา SKU หรือชื่อสินค้า" value="${esc(productQuery)}"></div>${list.map(productRow).join('') || '<p class="empty">ไม่พบสินค้า</p>'}<h3>ประวัติสต็อก</h3>${state.stockLogs.slice(0, 8).map((l) => `<div class="activity"><div><strong>${esc(l.sku)} ${esc(l.name)}</strong><span>${l.at} · ${esc(l.reason)}</span></div><b class="${l.delta < 0 ? 'low' : ''}">${l.delta > 0 ? '+' : ''}${l.delta}</b></div>`).join('') || '<p class="empty">ยังไม่มีประวัติสต็อก</p>'}</article></section>`; }
function productForm() { return `<form data-product-form class="form-grid compact"><input name="sku" required placeholder="SKU*" value="${esc(editingProduct.sku)}"><input name="name" required placeholder="ชื่อสินค้า*" value="${esc(editingProduct.name)}"><input name="category" placeholder="หมวดหมู่" value="${esc(editingProduct.category)}"><input name="unit" required placeholder="หน่วยนับ*" value="${esc(editingProduct.unit)}"><input name="cost" type="number" min="0" step="0.01" placeholder="ราคาทุน" value="${editingProduct.cost}"><input name="price" type="number" min="0" step="0.01" required placeholder="ราคาขาย*" value="${editingProduct.price}"><input name="qty" type="number" min="0" step="1" placeholder="คงเหลือ" value="${editingProduct.qty}"><input name="min" type="number" min="0" step="1" placeholder="ขั้นต่ำ" value="${editingProduct.min}"><button type="submit">บันทึกสินค้า</button><button type="button" data-reset-product>ล้างฟอร์ม</button></form>`; }
function productRow(p) { return `<div class="stock"><div><strong>${esc(p.name)}</strong><span>${esc(p.sku)} · ${esc(p.category)} · ${money.format(p.price)} / ${esc(p.unit)} · คงเหลือ ${p.qty}</span></div><b class="${p.qty <= p.min ? 'low' : ''}">${p.qty <= p.min ? 'ใกล้หมด' : 'พร้อมขาย'}</b><button data-stock="${p.id}" data-delta="1">+ สต็อก</button><button data-stock="${p.id}" data-delta="-1">- สต็อก</button><button data-edit-product="${p.id}">แก้ไข</button><button data-delete-product="${p.id}">ลบ</button></div>`; }
function renderCustomers() { const list = state.customers.filter((c) => `${c.name} ${c.taxId}`.toLowerCase().includes(customerQuery.toLowerCase())); return `<section class="workspace"><article class="panel"><h2>${editingCustomer.id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</h2>${customerForm()}</article><article class="panel"><div class="section-head"><h2>ระบบลูกค้า</h2><input data-customer-search placeholder="ค้นหาชื่อลูกค้าหรือเลขภาษี" value="${esc(customerQuery)}"></div>${list.map(customerRow).join('') || '<p class="empty">ไม่พบลูกค้า</p>'}</article></section>`; }
function customerForm() { return `<form data-customer-form class="form-grid compact"><input name="name" required placeholder="ชื่อลูกค้า*" value="${esc(editingCustomer.name)}"><input name="taxId" placeholder="เลขประจำตัวผู้เสียภาษี" value="${esc(editingCustomer.taxId)}"><input name="phone" placeholder="โทรศัพท์" value="${esc(editingCustomer.phone)}"><input name="email" type="email" placeholder="อีเมล" value="${esc(editingCustomer.email)}"><textarea name="address" placeholder="ที่อยู่">${esc(editingCustomer.address)}</textarea><button type="submit">บันทึกลูกค้า</button><button type="button" data-reset-customer>ล้างฟอร์ม</button></form>`; }
function customerRow(c) { return `<div class="activity"><div><strong>${esc(c.name)}</strong><span>${esc(c.taxId)} · ${esc(c.phone)} · ${esc(c.email)}<br>${esc(c.address)}</span></div><button data-edit-customer="${c.id}">แก้ไข</button><button data-delete-customer="${c.id}">ลบ</button></div>`; }
function renderDocuments() { return `<section class="workspace docs"><article class="panel"><h2>${draft.id ? 'แก้ไขเอกสาร' : 'สร้างเอกสาร'}</h2>${documentForm()}</article><article class="panel"><div class="section-head"><h2>เอกสารย้อนหลัง</h2><input data-document-search placeholder="ค้นหาเลขที่/ลูกค้า" value="${esc(documentQuery)}"></div>${state.documents.filter((d) => `${d.number} ${customerName(d.customerId)}`.toLowerCase().includes(documentQuery.toLowerCase())).map(docRow).join('') || '<p class="empty">ยังไม่มีเอกสาร</p>'}</article></section>`; }
function documentForm() { const totals = calcDoc(draft); return `<form data-document-form><div class="form-grid compact"><select name="type">${docTypes.map(([k, l]) => `<option value="${k}" ${draft.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select><select name="customerId" required><option value="">เลือกลูกค้า*</option>${state.customers.map((c) => `<option value="${c.id}" ${draft.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><input name="date" type="date" value="${draft.date}"><input name="dueDate" type="date" value="${draft.dueDate}"><select name="paid"><option value="false" ${!draft.paid ? 'selected' : ''}>รอชำระ</option><option value="true" ${draft.paid ? 'selected' : ''}>ชำระแล้ว</option></select></div><table><thead><tr><th>สินค้า</th><th>จำนวน</th><th>ราคา</th><th>ส่วนลด</th><th></th></tr></thead><tbody>${draft.lines.map(lineRow).join('')}</tbody></table><button type="button" data-add-line>+ เพิ่มรายการ</button><textarea name="note" placeholder="หมายเหตุ">${esc(draft.note)}</textarea><div class="totals"><p><span>ยอดก่อน VAT</span><b>${money.format(totals.subtotal)}</b></p><p><span>VAT 7%</span><b>${money.format(totals.vat)}</b></p><p class="grand"><span>ยอดสุทธิ</span><b>${money.format(totals.total)}</b></p></div><button type="submit">บันทึกเอกสาร</button><button type="button" data-new-document>เอกสารใหม่</button><button type="button" data-print>พิมพ์ / PDF</button></form>`; }
function lineRow(line, i) { return `<tr><td><select data-line="${i}" data-key="productId"><option value="">เลือกรายการ</option>${state.products.map((p) => `<option value="${p.id}" ${line.productId === p.id ? 'selected' : ''}>${esc(p.sku)} · ${esc(p.name)}</option>`).join('')}</select><input data-line="${i}" data-key="name" value="${esc(line.name)}" placeholder="ชื่อรายการ"></td><td><input data-line="${i}" data-key="qty" type="number" min="1" value="${line.qty}"></td><td><input data-line="${i}" data-key="price" type="number" min="0" step="0.01" value="${line.price}"></td><td><input data-line="${i}" data-key="discount" type="number" min="0" step="0.01" value="${line.discount}"></td><td><button type="button" data-remove-line="${i}">ลบ</button></td></tr>`; }
function docRow(d) { const [, label] = docMeta(d.type); return `<div class="activity"><div><strong>${esc(d.number || '(ยังไม่บันทึก)')} · ${label}</strong><span>${esc(customerName(d.customerId))} · ${d.date} · ${d.paid ? 'ชำระแล้ว' : 'รอชำระ'}</span></div><b>${money.format(calcDoc(d).total)}</b><button data-edit-document="${d.id}">แก้ไข</button><button data-delete-document="${d.id}">ลบ</button></div>`; }
function renderBackup() { return `<section class="panel backup"><h2>สำรองข้อมูล JSON</h2><p>ส่งออกเพื่อเก็บสำรอง หรือนำเข้าข้อมูลกลับมาใช้งานในเครื่องนี้</p><button data-export-json>ส่งออก JSON</button><label class="importer">นำเข้า JSON<input type="file" accept="application/json" data-import-json></label><button data-reset-demo>รีเซ็ตข้อมูลเริ่มต้น</button></section>`; }

function productFromForm(form) { const data = Object.fromEntries(new FormData(form)); return { id: editingProduct.id || uid('prd'), sku: data.sku.trim(), name: data.name.trim(), category: data.category.trim(), unit: data.unit.trim(), cost: num(data.cost), price: num(data.price), qty: num(data.qty), min: num(data.min) }; }
function customerFromForm(form) { const data = Object.fromEntries(new FormData(form)); return { id: editingCustomer.id || uid('cus'), name: data.name.trim(), address: data.address.trim(), taxId: data.taxId.trim(), phone: data.phone.trim(), email: data.email.trim() }; }
function syncDraft(form) { const data = Object.fromEntries(new FormData(form)); Object.assign(draft, { type: data.type, customerId: data.customerId, date: data.date, dueDate: data.dueDate, paid: data.paid === 'true', note: data.note }); }

document.addEventListener('click', (e) => { const t = e.target.closest('button, [data-tab], [data-export-json]'); if (!t) return;
  if (t.dataset.tab) { active = t.dataset.tab; render(); }
  if (t.dataset.resetProduct !== undefined) { editingProduct = { ...blankProduct }; render(); }
  if (t.dataset.resetCustomer !== undefined) { editingCustomer = { ...blankCustomer }; render(); }
  if (t.dataset.editProduct) { editingProduct = { ...state.products.find((p) => p.id === t.dataset.editProduct) }; render(); }
  if (t.dataset.deleteProduct && confirm('ยืนยันลบสินค้า?')) { state.products = state.products.filter((p) => p.id !== t.dataset.deleteProduct); persist('ลบสินค้าแล้ว'); }
  if (t.dataset.stock) { const p = state.products.find((x) => x.id === t.dataset.stock); if (p) { p.qty = Math.max(0, p.qty + num(t.dataset.delta)); logStock(p, num(t.dataset.delta), 'ปรับสต็อกจากปุ่ม'); persist('ปรับสต็อกแล้ว'); } }
  if (t.dataset.editCustomer) { editingCustomer = { ...state.customers.find((c) => c.id === t.dataset.editCustomer) }; render(); }
  if (t.dataset.deleteCustomer && confirm('ยืนยันลบลูกค้า?')) { state.customers = state.customers.filter((c) => c.id !== t.dataset.deleteCustomer); persist('ลบลูกค้าแล้ว'); }
  if (t.dataset.addLine !== undefined) { draft.lines.push({ ...blankLine }); render(); }
  if (t.dataset.removeLine !== undefined) { draft.lines.splice(num(t.dataset.removeLine), 1); if (!draft.lines.length) draft.lines.push({ ...blankLine }); render(); }
  if (t.dataset.newDocument !== undefined) { draft = newDocument(draft.type); render(); }
  if (t.dataset.editDocument) { draft = structuredClone(state.documents.find((d) => d.id === t.dataset.editDocument)); active = 'documents'; render(); }
  if (t.dataset.deleteDocument && confirm('ยืนยันลบเอกสาร?')) { state.documents = state.documents.filter((d) => d.id !== t.dataset.deleteDocument); persist('ลบเอกสารแล้ว'); }
  if (t.dataset.print !== undefined) window.print();
  if (t.dataset.exportJson !== undefined) { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `billing-backup-${today()}.json` }); a.click(); URL.revokeObjectURL(a.href); toast('ส่งออก JSON แล้ว'); }
  if (t.dataset.resetDemo !== undefined && confirm('รีเซ็ตข้อมูลทั้งหมด?')) { state = structuredClone(seed); storage.save(state); render(); }
});
document.addEventListener('input', (e) => { const t = e.target;
  if (t.matches('[data-product-search]')) { productQuery = t.value; render(); }
  if (t.matches('[data-customer-search]')) { customerQuery = t.value; render(); }
  if (t.matches('[data-document-search]')) { documentQuery = t.value; render(); }
  if (t.matches('[data-line]')) { const line = draft.lines[num(t.dataset.line)]; line[t.dataset.key] = ['qty', 'price', 'discount'].includes(t.dataset.key) ? num(t.value) : t.value; if (t.dataset.key === 'productId') { const p = state.products.find((x) => x.id === t.value); if (p) Object.assign(line, { productId: p.id, name: p.name, price: p.price }); } render(); }
});
document.addEventListener('submit', (e) => { e.preventDefault(); const form = e.target;
  if (form.matches('[data-product-form]')) { const item = productFromForm(form); if (!item.sku || !item.name || !item.unit) return toast('กรุณากรอก SKU ชื่อสินค้า และหน่วยนับ', 'error'); const old = state.products.find((p) => p.id === item.id); if (old && old.qty !== item.qty) logStock(item, item.qty - old.qty, 'แก้ไขจำนวนจากฟอร์ม'); state.products = old ? state.products.map((p) => p.id === item.id ? item : p) : [item, ...state.products]; editingProduct = { ...blankProduct }; persist('บันทึกสินค้าแล้ว'); }
  if (form.matches('[data-customer-form]')) { const item = customerFromForm(form); if (!item.name) return toast('กรุณากรอกชื่อลูกค้า', 'error'); state.customers = state.customers.some((c) => c.id === item.id) ? state.customers.map((c) => c.id === item.id ? item : c) : [item, ...state.customers]; editingCustomer = { ...blankCustomer }; persist('บันทึกลูกค้าแล้ว'); }
  if (form.matches('[data-document-form]')) { syncDraft(form); if (!draft.customerId) return toast('กรุณาเลือกลูกค้า', 'error'); if (!draft.lines.some((l) => l.name && num(l.qty) > 0)) return toast('กรุณาเพิ่มรายการสินค้า', 'error'); if (!draft.id) { draft.id = uid('doc'); draft.number = nextDocNumber(draft.type); state.documents.unshift(structuredClone(draft)); } else { state.documents = state.documents.map((d) => d.id === draft.id ? structuredClone(draft) : d); } persist('บันทึกเอกสารแล้ว'); }
});
document.addEventListener('change', (e) => { const input = e.target; if (!input.matches('[data-import-json]') || !input.files[0]) return; const reader = new FileReader(); reader.onload = () => { try { state = { ...seed, ...JSON.parse(reader.result) }; storage.save(state); render(); toast('นำเข้า JSON สำเร็จ'); } catch { toast('ไฟล์ JSON ไม่ถูกต้อง', 'error'); } }; reader.readAsText(input.files[0]); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
