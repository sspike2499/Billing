const docTypes = [
  ['quote','ใบเสนอราคา','QT','#24476f'], ['invoice','ใบแจ้งหนี้','INV','#17324d'], ['cash','บิลเงินสด','CS','#475569'], ['tax','ใบกำกับภาษี','TAX','#14532d'], ['delivery','ใบส่งของ','DN','#7c2d12'], ['receipt','ใบเสร็จรับเงิน','RC','#4c1d95'], ['purchase','ใบสั่งซื้อ','PO','#7f1d1d']
].map(([key,label,code,color]) => ({key,label,code,color}));
const products = [
  { id: 1, sku: 'BRG-001', name: 'กล่องของขวัญ Burgundy Signature', qty: 48, min: 15, unit: 'กล่อง', price: 890 },
  { id: 2, sku: 'NAV-204', name: 'สมุดแพ็กเกจ Blue Navy Premium', qty: 23, min: 20, unit: 'เล่ม', price: 450 },
  { id: 3, sku: 'RSG-118', name: 'เซ็ตการ์ด Rose Gold Foil', qty: 9, min: 12, unit: 'ชุด', price: 1290 },
  { id: 4, sku: 'OFF-515', name: 'บริการออกแบบเอกสารองค์กร', qty: 999, min: 50, unit: 'งาน', price: 3500 },
];
const activity = [
  ['INV-2026-0714-001','ใบแจ้งหนี้','บริษัท อมรินทร์ กรุ๊ป จำกัด',42800,'รอชำระ','14 ก.ค. 2026'],
  ['RC-2026-0713-014','ใบเสร็จรับเงิน','Navy Studio',17900,'ชำระแล้ว','13 ก.ค. 2026'],
  ['PO-2026-0712-009','ใบสั่งซื้อ','Rose Supply Co.',93500,'สั่งซื้อ','12 ก.ค. 2026'],
  ['DN-2026-0711-005','ใบส่งของ','Burgundy Cafe',12150,'จัดส่งแล้ว','11 ก.ค. 2026'],
];
let selectedDoc = docTypes[1];
let items = [{ name: 'กล่องของขวัญ Burgundy Signature', qty: 8, price: 890 }, { name: 'เซ็ตการ์ด Rose Gold Foil', qty: 5, price: 1290 }];
let query = '';
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const icon = (name) => `<span class="icon">${name}</span>`;

function render() {
  const root = document.querySelector('#root');
  if (!root) return;
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const vat = subtotal * 0.07;
  const total = subtotal + vat;
  const filtered = products.filter(p => `${p.sku} ${p.name}`.toLowerCase().includes(query.toLowerCase()));
  root.innerHTML = `<main>
    <section class="hero"><nav><div class="brand">${icon('✦')} Billing Atelier</div><button data-print>${icon('⎙')} พิมพ์ / ส่งออก PDF</button></nav>
      <div class="hero-grid"><div><p class="eyebrow">Burgundy · Blue Navy · Rose Gold</p><h1>ระบบบิลและสต็อกสินค้า สำหรับธุรกิจไทยที่ดูอินเตอร์</h1><p>จัดการเอกสารขาย ซื้อ ส่งของ ภาษี รายรับ สต็อก และประวัติรายการย้อนหลังในหน้าเดียว พร้อมเอกสารโทนทางการที่อ่านง่ายเมื่อสั่งพิมพ์จริง</p></div><div class="glass-card">${icon('▣')}<strong>พร้อมใช้งาน</strong><span>ใบเสนอราคา ใบแจ้งหนี้ บิลเงินสด ใบกำกับภาษี ใบส่งของ ใบเสร็จรับเงิน และใบสั่งซื้อ</span></div></div></section>
    <section class="stats">${[['รายได้เดือนนี้', money.format(638420), '▰'], ['เอกสารทั้งหมด', '186 ฉบับ', '◫'], ['รอชำระ', money.format(127600), '฿'], ['สินค้าใกล้หมด', `${products.filter(p=>p.qty<=p.min).length} รายการ`, '□']].map(s => `<article>${icon(s[2])}<span>${s[0]}</span><strong>${s[1]}</strong></article>`).join('')}</section>
    <section class="workspace"><aside class="panel"><h2>ชนิดเอกสาร</h2>${docTypes.map(d => `<button class="doc ${selectedDoc.key===d.key?'active':''}" style="--doc:${d.color}" data-doc="${d.key}">${icon('▤')}<span>${d.label}</span><small>${d.code}</small></button>`).join('')}</aside>
      <section class="document-shell"><div class="toolbar"><div><span class="tag" style="background:${selectedDoc.color}">${selectedDoc.code}</span><h2>${selectedDoc.label}</h2></div><div><button data-print>${icon('⇩')} PDF</button><button data-print>${icon('⎙')} Print</button></div></div>
      <div class="paper" style="--accent:${selectedDoc.color}"><header><div><h3>${selectedDoc.label}</h3><p>Billing Atelier Co., Ltd. · 88 ถนนธุรกิจ แขวงสาทร กรุงเทพฯ 10120</p><p>เลขประจำตัวผู้เสียภาษี 0105566999999 · โทร 02-000-2026</p></div><strong>${selectedDoc.code}-2026-0714-001</strong></header>
      <div class="form-grid"><label>ลูกค้า<input value="บริษัท ตัวอย่าง อินเตอร์เทรด จำกัด"></label><label>เลขผู้เสียภาษี<input value="0105566000000"></label><label>วันที่<input value="14/07/2026" readonly></label><label>ครบกำหนด<input value="28/07/2026" readonly></label></div>
      <table><thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead><tbody>${items.map((it,i)=>`<tr><td><input data-item="${i}" data-key="name" value="${it.name}"></td><td><input type="number" data-item="${i}" data-key="qty" value="${it.qty}"></td><td><input type="number" data-item="${i}" data-key="price" value="${it.price}"></td><td>${money.format(it.qty*it.price)}</td></tr>`).join('')}</tbody></table><button class="add" data-add>+ เพิ่มรายการ</button>
      <div class="totals"><p><span>มูลค่าสินค้า</span><b>${money.format(subtotal)}</b></p><p><span>VAT 7%</span><b>${money.format(vat)}</b></p><p class="grand"><span>ยอดสุทธิ</span><b>${money.format(total)}</b></p></div></div></section></section>
    <section class="lower-grid"><article class="panel inventory"><h2>${icon('▦')} ระบบสต็อกสินค้า</h2><div class="search">${icon('⌕')}<input placeholder="ค้นหา SKU หรือชื่อสินค้า" value="${query}" data-search></div>${filtered.map(p=>`<div class="stock"><div><strong>${p.name}</strong><span>${p.sku} · ${money.format(p.price)} / ${p.unit}</span></div><meter min="0" max="100" low="20" value="${Math.min(100,p.qty)}"></meter><b class="${p.qty<=p.min?'low':''}">${p.qty} ${p.unit}</b><button data-stock="${p.id}" data-delta="-1">-</button><button data-stock="${p.id}" data-delta="1">+</button></div>`).join('')}</article>
    <article class="panel"><h2>${icon('◷')} ประวัติการทำรายการ</h2>${activity.map(a=>`<div class="activity">${icon('▸')}<div><strong>${a[0]}</strong><span>${a[1]} · ${a[2]}</span></div><b>${money.format(a[3])}</b><em>${a[4]}</em><small>${a[5]}</small></div>`).join('')}</article></section></main>`;
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const doc = target.closest('[data-doc]');
    if (doc) selectedDoc = docTypes.find(d => d.key === doc.dataset.doc) || selectedDoc;
    if (target.closest('[data-print]')) window.print();
    if (target.closest('[data-add]')) items.push({ name: 'รายการใหม่', qty: 1, price: 0 });
    const stock = target.closest('[data-stock]');
    if (stock) {
      const p = products.find(x => x.id === Number(stock.dataset.stock));
      if (p) p.qty = Math.max(0, p.qty + Number(stock.dataset.delta));
    }
    render();
  });

  document.addEventListener('input', (e) => {
    const target = e.target instanceof HTMLInputElement ? e.target : null;
    if (!target) return;
    if (target.matches('[data-search]')) query = target.value;
    if (target.matches('[data-item]')) {
      const value = target.dataset.key === 'name' ? target.value : Number(target.value);
      items[Number(target.dataset.item)][target.dataset.key] = value;
    }
    render();
  });
}

function startApp() {
  bindEvents();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
  startApp();
}
