const docTypes = [
  ['quote','ใบเสนอราคา','QT','#24476f'], ['invoice','ใบแจ้งหนี้','INV','#17324d'], ['cash','บิลเงินสด','CS','#475569'], ['tax','ใบกำกับภาษี','TAX','#14532d'], ['delivery','ใบส่งของ','DN','#7c2d12'], ['receipt','ใบเสร็จรับเงิน','RC','#4c1d95'], ['purchase','ใบสั่งซื้อ','PO','#7f1d1d']
].map(([key,label,code,color]) => ({key,label,code,color}));
const storageKey = 'billing-atelier-products';
const companyStorageKey = 'billing-atelier-company-settings';
const customerStorageKey = 'billing-atelier-customers';
const acceptedLogoTypes = ['image/png', 'image/jpeg', 'image/webp'];
const defaultProducts = [
  { id: 1, sku: 'BRG-001', barcode: '8850001000011', name: 'กล่องของขวัญ Burgundy Signature', category: 'แพ็กเกจจิ้ง', unit: 'กล่อง', cost: 520, price: 890, qty: 48, min: 15 },
  { id: 2, sku: 'NAV-204', barcode: '8850001002046', name: 'สมุดแพ็กเกจ Blue Navy Premium', category: 'เครื่องเขียน', unit: 'เล่ม', cost: 250, price: 450, qty: 23, min: 20 },
  { id: 3, sku: 'RSG-118', barcode: '8850001001186', name: 'เซ็ตการ์ด Rose Gold Foil', category: 'การ์ดพรีเมียม', unit: 'ชุด', cost: 760, price: 1290, qty: 9, min: 12 },
  { id: 4, sku: 'OFF-515', barcode: '8850001005153', name: 'บริการออกแบบเอกสารองค์กร', category: 'บริการ', unit: 'งาน', cost: 1800, price: 3500, qty: 999, min: 50 },
];
const activity = [
  ['INV-2026-0714-001','ใบแจ้งหนี้','บริษัท อมรินทร์ กรุ๊ป จำกัด',42800,'รอชำระ','14 ก.ค. 2026'],
  ['RC-2026-0713-014','ใบเสร็จรับเงิน','Navy Studio',17900,'ชำระแล้ว','13 ก.ค. 2026'],
  ['PO-2026-0712-009','ใบสั่งซื้อ','Rose Supply Co.',93500,'สั่งซื้อ','12 ก.ค. 2026'],
  ['DN-2026-0711-005','ใบส่งของ','Burgundy Cafe',12150,'จัดส่งแล้ว','11 ก.ค. 2026'],
];
let selectedDoc = docTypes[1];
let documentForm = { customer: 'บริษัท ตัวอย่าง อินเตอร์เทรด จำกัด', taxId: '0105566000000', date: '2026-07-14', dueDate: '2026-07-28' };
let items = [{ name: 'กล่องของขวัญ Burgundy Signature', qty: 8, price: 890 }, { name: 'เซ็ตการ์ด Rose Gold Foil', qty: 5, price: 1290 }];
let query = '';
let categoryFilter = 'all';
let editingProductId = null;
let productForm = createEmptyProduct();
let productErrors = {};
let companySettings = loadCompanySettings();
let companyErrors = {};
const customers = loadCustomers();
let customerQuery = '';
let customerTypeFilter = 'all';
let editingCustomerId = null;
let viewingCustomerId = null;
let customerForm = createEmptyCustomer();
let customerErrors = {};
let deferredRenderId = 0;
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const icon = (name) => `<span class="icon">${name}</span>`;
const products = loadProducts();

function createEmptyProduct() {
  return { sku: '', barcode: '', name: '', category: '', unit: '', cost: '', price: '', qty: '', min: '' };
}


function createEmptyCustomer() {
  return { code: '', type: 'company', name: '', taxId: '', branch: '', address: '', province: '', district: '', subdistrict: '', postalCode: '', phone: '', email: '', contactPerson: '', notes: '' };
}

function generateCustomerCode(records = customers) {
  const max = records.reduce((highest, customer) => {
    const match = String(customer.code || '').match(/^CUS-(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `CUS-${String(max + 1).padStart(4, '0')}`;
}

function normalizeCustomers(records) {
  return records.map((customer, index) => ({
    ...createEmptyCustomer(),
    ...customer,
    id: Number(customer.id) || index + 1,
    code: String(customer.code || `CUS-${String(index + 1).padStart(4, '0')}`).trim(),
    type: customer.type === 'person' ? 'person' : 'company',
    name: String(customer.name || '').trim(),
    taxId: String(customer.taxId || '').trim(),
    branch: String(customer.branch || '').trim(),
    address: String(customer.address || '').trim(),
    province: String(customer.province || '').trim(),
    district: String(customer.district || '').trim(),
    subdistrict: String(customer.subdistrict || '').trim(),
    postalCode: String(customer.postalCode || '').trim(),
    phone: String(customer.phone || '').trim(),
    email: String(customer.email || '').trim(),
    contactPerson: String(customer.contactPerson || '').trim(),
    notes: String(customer.notes || '').trim(),
  }));
}

function loadCustomers() {
  try {
    const saved = JSON.parse(localStorage.getItem(customerStorageKey) || 'null');
    if (Array.isArray(saved)) return normalizeCustomers(saved);
  } catch {
    localStorage.removeItem(customerStorageKey);
  }
  return [];
}

function saveCustomers() {
  localStorage.setItem(customerStorageKey, JSON.stringify(customers));
}

function validateCustomer(data) {
  const errors = {};
  if (!String(data.code || '').trim()) errors.code = 'กรุณาระบุรหัสลูกค้า';
  if (!String(data.name || '').trim()) errors.name = 'กรุณากรอกชื่อลูกค้า';
  if (!String(data.taxId || '').trim()) errors.taxId = 'กรุณากรอกเลขประจำตัวผู้เสียภาษี';
  if (!String(data.address || '').trim()) errors.address = 'กรุณากรอกที่อยู่';
  if (!String(data.province || '').trim()) errors.province = 'กรุณากรอกจังหวัด';
  if (!String(data.district || '').trim()) errors.district = 'กรุณากรอกอำเภอ/เขต';
  if (!String(data.subdistrict || '').trim()) errors.subdistrict = 'กรุณากรอกตำบล/แขวง';
  if (!String(data.postalCode || '').trim()) errors.postalCode = 'กรุณากรอกรหัสไปรษณีย์';
  else if (!/^\d{5}$/.test(String(data.postalCode).trim())) errors.postalCode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
  if (String(data.email || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  const code = String(data.code || '').trim().toLowerCase();
  const taxId = String(data.taxId || '').trim().toLowerCase();
  if (customers.some(c => c.id !== editingCustomerId && c.code.toLowerCase() === code)) errors.code = 'รหัสลูกค้านี้มีอยู่แล้ว';
  if (taxId && customers.some(c => c.id !== editingCustomerId && c.taxId.toLowerCase() === taxId)) errors.taxId = 'เลขประจำตัวผู้เสียภาษีนี้มีอยู่แล้ว';
  return errors;
}

function formToCustomer() {
  return Object.fromEntries(Object.entries(customerForm).map(([key, value]) => [key, String(value || '').trim()]));
}

function resetCustomerForm() {
  editingCustomerId = null;
  viewingCustomerId = null;
  customerForm = { ...createEmptyCustomer(), code: generateCustomerCode() };
  customerErrors = {};
}

function submitCustomer() {
  const data = formToCustomer();
  customerErrors = validateCustomer(data);
  if (Object.keys(customerErrors).length) return false;
  if (editingCustomerId) {
    const index = customers.findIndex(c => c.id === editingCustomerId);
    if (index >= 0) customers[index] = { ...customers[index], ...data };
  } else {
    customers.push({ id: Math.max(0, ...customers.map(c => c.id)) + 1, ...data });
  }
  saveCustomers();
  resetCustomerForm();
  return true;
}

function customerField(field, label, type = 'text') {
  const readonly = field === 'code' ? 'readonly' : '';
  return `<label>${label}<input ${readonly} type="${type}" data-customer-field="${field}" value="${escapeAttr(customerForm[field])}">${customerErrors[field] ? `<small class="error">${customerErrors[field]}</small>` : ''}</label>`;
}

function customerTextarea(field, label) {
  return `<label class="wide">${label}<textarea data-customer-field="${field}">${escapeAttr(customerForm[field])}</textarea>${customerErrors[field] ? `<small class="error">${customerErrors[field]}</small>` : ''}</label>`;
}

function createDefaultCompanySettings() {
  return {
    logo: '',
    logoName: '',
    name: 'Billing Atelier Co., Ltd.',
    branch: 'สำนักงานใหญ่',
    taxId: '0105566999999',
    registrationNumber: '',
    address: '88 ถนนธุรกิจ แขวงสาทร',
    province: 'กรุงเทพมหานคร',
    district: 'สาทร',
    subdistrict: 'ทุ่งมหาเมฆ',
    postalCode: '10120',
    phone: '02-000-2026',
    email: 'hello@billing-atelier.example',
    website: 'www.billing-atelier.example',
    authorizedPerson: '',
    footerText: 'ขอบคุณที่ไว้วางใจใช้บริการ',
    paymentInstructions: 'กรุณาชำระเงินตามรายละเอียดบัญชีด้านล่าง และส่งหลักฐานการชำระเงินกลับมายังบริษัท',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    promptPayName: '',
    promptPayNumber: '',
  };
}

function escapeAttr(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function normalizeProducts(records) {
  return records.map((product, index) => ({
    id: Number(product.id) || index + 1,
    sku: String(product.sku || '').trim(),
    barcode: String(product.barcode || '').trim(),
    name: String(product.name || '').trim(),
    category: String(product.category || 'ทั่วไป').trim(),
    unit: String(product.unit || '').trim(),
    cost: Number(product.cost) || 0,
    price: Number(product.price) || 0,
    qty: Number(product.qty) || 0,
    min: Number(product.min) || 0,
  }));
}

function normalizeCompanySettings(settings) {
  return { ...createDefaultCompanySettings(), ...(settings && typeof settings === 'object' ? settings : {}) };
}

function loadCompanySettings() {
  try {
    return normalizeCompanySettings(JSON.parse(localStorage.getItem(companyStorageKey) || 'null'));
  } catch {
    localStorage.removeItem(companyStorageKey);
    return createDefaultCompanySettings();
  }
}

function saveCompanySettings() {
  localStorage.setItem(companyStorageKey, JSON.stringify(companySettings));
}

function updateCompanyField(field, value) {
  companySettings = { ...companySettings, [field]: value };
  companyErrors = { ...companyErrors, [field]: '' };
}

function readCompanyForm(form) {
  const nextSettings = { ...companySettings };
  form.querySelectorAll('[data-company-field]').forEach((field) => {
    nextSettings[field.dataset.companyField] = field.value;
  });
  companySettings = normalizeCompanySettings(nextSettings);
}

function saveCompanyForm(form) {
  readCompanyForm(form);
  saveCompanySettings();
  render();
}

function cancelCompanyChanges() {
  companySettings = loadCompanySettings();
  companyErrors = {};
  render();
}

function resetCompanySettings() {
  companySettings = createDefaultCompanySettings();
  companyErrors = {};
  saveCompanySettings();
  render();
}

function deleteCompanyLogo() {
  companySettings = { ...companySettings, logo: '', logoName: '' };
  companyErrors.logo = '';
  saveCompanySettings();
}

function handleLogoUpload(file) {
  if (!file) return;
  if (!acceptedLogoTypes.includes(file.type)) {
    companyErrors.logo = 'กรุณาอัปโหลดไฟล์รูปภาพ PNG, JPG, JPEG หรือ WEBP เท่านั้น';
    render();
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    companyErrors.logo = 'ขนาดไฟล์โลโก้ต้องไม่เกิน 2MB';
    render();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    companySettings = { ...companySettings, logo: String(reader.result || ''), logoName: file.name };
    companyErrors.logo = '';
    saveCompanySettings();
    render();
  };
  reader.onerror = () => {
    companyErrors.logo = 'ไม่สามารถอ่านไฟล์โลโก้ได้ กรุณาลองใหม่';
    render();
  };
  reader.readAsDataURL(file);
}

function companyField(field, label, type = 'text') {
  return `<label>${label}<input type="${type}" data-company-field="${field}" value="${escapeAttr(companySettings[field])}">${companyErrors[field] ? `<small class="error">${companyErrors[field]}</small>` : ''}</label>`;
}

function loadProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved)) return normalizeProducts(saved);
  } catch {
    localStorage.removeItem(storageKey);
  }
  return normalizeProducts(defaultProducts);
}

function saveProducts() {
  localStorage.setItem(storageKey, JSON.stringify(products));
}

function validateProduct(data) {
  const errors = {};
  ['sku', 'barcode', 'name', 'category', 'unit'].forEach((field) => {
    if (!String(data[field] || '').trim()) errors[field] = 'จำเป็นต้องกรอก';
  });
  ['cost', 'price', 'qty', 'min'].forEach((field) => {
    const value = Number(data[field]);
    if (String(data[field]).trim() === '') errors[field] = 'จำเป็นต้องกรอก';
    else if (!Number.isFinite(value) || value < 0) errors[field] = 'ต้องเป็นตัวเลข 0 ขึ้นไป';
  });
  const normalizedSku = String(data.sku || '').trim().toLowerCase();
  const normalizedBarcode = String(data.barcode || '').trim().toLowerCase();
  if (products.some(p => p.id !== editingProductId && p.sku.toLowerCase() === normalizedSku)) errors.sku = 'SKU ซ้ำในระบบ';
  if (products.some(p => p.id !== editingProductId && p.barcode.toLowerCase() === normalizedBarcode)) errors.barcode = 'Barcode ซ้ำในระบบ';
  return errors;
}

function formToProduct() {
  return {
    sku: productForm.sku.trim(),
    barcode: productForm.barcode.trim(),
    name: productForm.name.trim(),
    category: productForm.category.trim(),
    unit: productForm.unit.trim(),
    cost: Number(productForm.cost),
    price: Number(productForm.price),
    qty: Number(productForm.qty),
    min: Number(productForm.min),
  };
}

function resetProductForm() {
  editingProductId = null;
  productForm = createEmptyProduct();
  productErrors = {};
}

function submitProduct() {
  const data = formToProduct();
  productErrors = validateProduct(productForm);
  if (Object.keys(productErrors).length) return false;
  if (editingProductId) {
    const index = products.findIndex(p => p.id === editingProductId);
    if (index >= 0) products[index] = { ...products[index], ...data };
  } else {
    products.push({ id: Math.max(0, ...products.map(p => p.id)) + 1, ...data });
  }
  saveProducts();
  resetProductForm();
  return true;
}

function productField(field, label, type = 'text') {
  return `<label>${label}<input ${type === 'number' ? 'min="0" step="0.01"' : ''} type="${type}" data-product-field="${field}" value="${escapeAttr(productForm[field])}">${productErrors[field] ? `<small class="error">${productErrors[field]}</small>` : ''}</label>`;
}


function updateDocumentTotals() {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
  const vat = subtotal * 0.07;
  const total = subtotal + vat;
  document.querySelectorAll('[data-line-total]').forEach((cell) => {
    const item = items[Number(cell.dataset.lineTotal)];
    if (item) cell.textContent = money.format((Number(item.qty) || 0) * (Number(item.price) || 0));
  });
  const subtotalEl = document.querySelector('[data-subtotal]');
  const vatEl = document.querySelector('[data-vat]');
  const totalEl = document.querySelector('[data-total]');
  if (subtotalEl) subtotalEl.textContent = money.format(subtotal);
  if (vatEl) vatEl.textContent = money.format(vat);
  if (totalEl) totalEl.textContent = money.format(total);
}

function renderPreservingInteraction() {
  const active = document.activeElement;
  const activeName = active instanceof HTMLElement ? active.getAttribute('data-search') !== null ? 'product-search' : active.getAttribute('data-customer-search') !== null ? 'customer-search' : '' : '';
  const selectionStart = active instanceof HTMLInputElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLInputElement ? active.selectionEnd : null;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  render();
  const next = activeName === 'product-search' ? document.querySelector('[data-search]') : activeName === 'customer-search' ? document.querySelector('[data-customer-search]') : null;
  if (next instanceof HTMLInputElement) {
    next.focus({ preventScroll: true });
    if (selectionStart !== null && selectionEnd !== null) next.setSelectionRange(selectionStart, selectionEnd);
  }
  window.scrollTo(scrollX, scrollY);
}

function scheduleRender() {
  window.clearTimeout(deferredRenderId);
  deferredRenderId = window.setTimeout(renderPreservingInteraction, 180);
}

function render() {
  const root = document.querySelector('#root');
  if (!root) return;
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const vat = subtotal * 0.07;
  const total = subtotal + vat;
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const filtered = products.filter(p => {
    const haystack = `${p.sku} ${p.barcode} ${p.name} ${p.category}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (categoryFilter === 'all' || p.category === categoryFilter);
  });
  if (!customerForm.code && !editingCustomerId) customerForm.code = generateCustomerCode();
  const filteredCustomers = customers.filter(c => {
    const haystack = `${c.code} ${c.name} ${c.taxId} ${c.branch} ${c.phone} ${c.email} ${c.contactPerson}`.toLowerCase();
    return haystack.includes(customerQuery.toLowerCase()) && (customerTypeFilter === 'all' || c.type === customerTypeFilter);
  });
  const viewingCustomer = customers.find(c => c.id === viewingCustomerId);
  root.innerHTML = `<main>
    <section class="hero"><nav><div class="brand">${icon('✦')} Billing Atelier</div><div class="nav-actions"><a href="#customers">ลูกค้า</a><a href="#products">สินค้า</a><a href="#company">ตั้งค่าบริษัท</a><button data-print>${icon('⎙')} พิมพ์ / ส่งออก PDF</button></div></nav>
      <div class="hero-grid"><div><p class="eyebrow">Burgundy · Blue Navy · Rose Gold</p><h1>ระบบบิลและสต็อกสินค้า สำหรับธุรกิจไทยที่ดูอินเตอร์</h1><p>จัดการเอกสารขาย ซื้อ ส่งของ ภาษี รายรับ สต็อก และประวัติรายการย้อนหลังในหน้าเดียว พร้อมเอกสารโทนทางการที่อ่านง่ายเมื่อสั่งพิมพ์จริง</p></div><div class="glass-card">${icon('▣')}<strong>พร้อมใช้งาน</strong><span>ใบเสนอราคา ใบแจ้งหนี้ บิลเงินสด ใบกำกับภาษี ใบส่งของ ใบเสร็จรับเงิน และใบสั่งซื้อ</span></div></div></section>
    <section class="stats">${[['รายได้เดือนนี้', money.format(638420), '▰'], ['สินค้าทั้งหมด', `${products.length} รายการ`, '◫'], ['รอชำระ', money.format(127600), '฿'], ['สินค้าใกล้หมด', `${products.filter(p=>p.qty<=p.min).length} รายการ`, '□']].map(s => `<article>${icon(s[2])}<span>${s[0]}</span><strong>${s[1]}</strong></article>`).join('')}</section>
    <section class="workspace"><aside class="panel"><h2>ชนิดเอกสาร</h2>${docTypes.map(d => `<button class="doc ${selectedDoc.key===d.key?'active':''}" style="--doc:${d.color}" data-doc="${d.key}">${icon('▤')}<span>${d.label}</span><small>${d.code}</small></button>`).join('')}</aside>
      <section class="document-shell"><div class="toolbar"><div><span class="tag" style="background:${selectedDoc.color}">${selectedDoc.code}</span><h2>${selectedDoc.label}</h2></div><div><button data-print>${icon('⇩')} PDF</button><button data-print>${icon('⎙')} Print</button></div></div>
      <div class="paper" style="--accent:${selectedDoc.color}"><header><div class="paper-company">${companySettings.logo ? `<img src="${escapeAttr(companySettings.logo)}" alt="โลโก้บริษัท" class="paper-logo">` : ''}<div><h3>${selectedDoc.label}</h3><p>${companySettings.name} · ${companySettings.address} ${companySettings.subdistrict} ${companySettings.district} ${companySettings.province} ${companySettings.postalCode}</p><p>เลขประจำตัวผู้เสียภาษี ${companySettings.taxId || '-'} · โทร ${companySettings.phone || '-'}</p></div></div><strong>${selectedDoc.code}-2026-0714-001</strong></header>
      <div class="form-grid"><label>ลูกค้า<input data-document-field="customer" value="${escapeAttr(documentForm.customer)}"></label><label>เลขผู้เสียภาษี<input data-document-field="taxId" value="${escapeAttr(documentForm.taxId)}"></label><label>วันที่<input data-document-field="date" type="date" value="${escapeAttr(documentForm.date)}"></label><label>ครบกำหนด<input data-document-field="dueDate" type="date" value="${escapeAttr(documentForm.dueDate)}"></label></div>
      <table><thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead><tbody>${items.map((it,i)=>`<tr><td><input data-item="${i}" data-key="name" value="${it.name}"></td><td><input type="number" data-item="${i}" data-key="qty" value="${it.qty}"></td><td><input type="number" data-item="${i}" data-key="price" value="${it.price}"></td><td data-line-total="${i}">${money.format(it.qty*it.price)}</td></tr>`).join('')}</tbody></table><button class="add" data-add>+ เพิ่มรายการ</button>
      <div class="totals"><p><span>มูลค่าสินค้า</span><b data-subtotal>${money.format(subtotal)}</b></p><p><span>VAT 7%</span><b data-vat>${money.format(vat)}</b></p><p class="grand"><span>ยอดสุทธิ</span><b data-total>${money.format(total)}</b></p></div></div></section></section>

    <section class="company-settings panel" id="company"><div class="section-title"><h2>${icon('◈')} ตั้งค่าบริษัท</h2><span>บันทึกอัตโนมัติในเครื่องนี้</span></div>
      <div class="company-layout">
        <div class="logo-card">
          <div class="logo-preview">${companySettings.logo ? `<img src="${escapeAttr(companySettings.logo)}" alt="ตัวอย่างโลโก้บริษัท">` : `<span>${icon('▧')}</span><b>ยังไม่มีโลโก้</b>`}</div>
          <div class="logo-actions">
            <label class="upload-button">${companySettings.logo ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้'}<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" data-logo-upload></label>
            <button type="button" class="danger ghost" data-delete-logo ${companySettings.logo ? '' : 'disabled'}>ลบโลโก้</button>
          </div>
          <small>${companySettings.logoName ? `ไฟล์: ${escapeAttr(companySettings.logoName)}` : 'รองรับ PNG, JPG, JPEG, WEBP ขนาดไม่เกิน 2MB'}</small>
          ${companyErrors.logo ? `<small class="error">${companyErrors.logo}</small>` : ''}
        </div>
        <form class="company-form" data-company-form>
          ${companyField('name', 'ชื่อบริษัท')}${companyField('branch', 'สาขา')}${companyField('taxId', 'เลขประจำตัวผู้เสียภาษี')}${companyField('registrationNumber', 'เลขทะเบียนบริษัท')}
          ${companyField('address', 'ที่อยู่')}${companyField('province', 'จังหวัด')}${companyField('district', 'อำเภอ / เขต')}${companyField('subdistrict', 'ตำบล / แขวง')}${companyField('postalCode', 'รหัสไปรษณีย์')}
          ${companyField('phone', 'โทรศัพท์')}${companyField('email', 'อีเมล', 'email')}${companyField('website', 'เว็บไซต์')}${companyField('authorizedPerson', 'ผู้มีอำนาจลงนาม')}
          <label class="wide">ข้อความท้ายเอกสาร<textarea data-company-field="footerText">${escapeAttr(companySettings.footerText)}</textarea></label>
          <label class="wide">คำแนะนำการชำระเงิน<textarea data-company-field="paymentInstructions">${escapeAttr(companySettings.paymentInstructions)}</textarea></label>
          ${companyField('bankName', 'ธนาคาร')}${companyField('bankAccountName', 'ชื่อบัญชี')}${companyField('bankAccountNumber', 'เลขที่บัญชี')}${companyField('promptPayName', 'ชื่อพร้อมเพย์')}${companyField('promptPayNumber', 'หมายเลขพร้อมเพย์')}
          <div class="company-actions"><button type="button" class="primary" data-save-company>บันทึกข้อมูลบริษัท</button><button type="button" data-cancel-company>ยกเลิก</button><button type="button" class="danger" data-reset-company>รีเซ็ต</button></div>
        </form>
      </div>
    </section>
    <section class="customer-management panel" id="customers"><div class="section-title"><h2>${icon('☷')} จัดการลูกค้า</h2><span>${filteredCustomers.length} / ${customers.length} รายการ</span></div>
      <form class="customer-form" data-customer-form>
        <label>ประเภทลูกค้า<select data-customer-field="type"><option value="company" ${customerForm.type === 'company' ? 'selected' : ''}>นิติบุคคล / บริษัท</option><option value="person" ${customerForm.type === 'person' ? 'selected' : ''}>บุคคลธรรมดา</option></select></label>
        ${customerField('code', 'รหัสลูกค้า')}${customerField('name', 'ชื่อลูกค้า')}${customerField('taxId', 'เลขประจำตัวผู้เสียภาษี')}${customerField('branch', 'สาขา')}${customerField('phone', 'โทรศัพท์')}${customerField('email', 'อีเมล', 'email')}${customerField('contactPerson', 'ผู้ติดต่อ')}${customerField('province', 'จังหวัด')}${customerField('district', 'อำเภอ / เขต')}${customerField('subdistrict', 'ตำบล / แขวง')}${customerField('postalCode', 'รหัสไปรษณีย์')}${customerTextarea('address', 'ที่อยู่')}${customerTextarea('notes', 'หมายเหตุ')}
        <div class="form-actions"><button type="submit" class="primary">${editingCustomerId ? 'บันทึกการแก้ไข' : '+ เพิ่มลูกค้า'}</button><button type="button" data-reset-customer>ล้างฟอร์ม</button></div>
      </form>
      ${viewingCustomer ? `<div class="customer-detail"><h3>ข้อมูลลูกค้า: ${escapeAttr(viewingCustomer.name)}</h3><p><b>${escapeAttr(viewingCustomer.code)}</b> · ${viewingCustomer.type === 'company' ? 'บริษัท' : 'บุคคล'} · Tax ID ${escapeAttr(viewingCustomer.taxId)}</p><p>${escapeAttr(viewingCustomer.address)} ${escapeAttr(viewingCustomer.subdistrict)} ${escapeAttr(viewingCustomer.district)} ${escapeAttr(viewingCustomer.province)} ${escapeAttr(viewingCustomer.postalCode)}</p><p>โทร ${escapeAttr(viewingCustomer.phone || '-')} · อีเมล ${escapeAttr(viewingCustomer.email || '-')} · ผู้ติดต่อ ${escapeAttr(viewingCustomer.contactPerson || '-')}</p><p>${escapeAttr(viewingCustomer.notes || '')}</p></div>` : ''}
      <div class="inventory-tools"><div class="search">${icon('⌕')}<input placeholder="ค้นหารหัส ชื่อ Tax ID โทรศัพท์ อีเมล หรือผู้ติดต่อ" value="${escapeAttr(customerQuery)}" data-customer-search></div><label>ประเภท<select data-customer-type-filter><option value="all">ทั้งหมด</option><option value="company" ${customerTypeFilter==='company'?'selected':''}>บริษัท</option><option value="person" ${customerTypeFilter==='person'?'selected':''}>บุคคล</option></select></label></div>
      <div class="product-table customer-table"><table><thead><tr><th>ลูกค้า</th><th>ประเภท</th><th>Tax ID</th><th>สาขา</th><th>ที่อยู่</th><th>ติดต่อ</th><th>จัดการ</th></tr></thead><tbody>${filteredCustomers.map(c=>`<tr><td><strong>${escapeAttr(c.name)}</strong><span>${escapeAttr(c.code)}</span></td><td>${c.type === 'company' ? 'บริษัท' : 'บุคคล'}</td><td>${escapeAttr(c.taxId)}</td><td>${escapeAttr(c.branch || '-')}</td><td>${escapeAttr(c.subdistrict)} ${escapeAttr(c.district)} ${escapeAttr(c.province)} ${escapeAttr(c.postalCode)}</td><td>${escapeAttr(c.phone || '-')}<br><span>${escapeAttr(c.email || '')}</span></td><td><button data-view-customer="${c.id}">ดู</button><button data-edit-customer="${c.id}">แก้ไข</button><button class="danger" data-delete-customer="${c.id}">ลบ</button></td></tr>`).join('') || '<tr><td colspan="7">ไม่พบลูกค้า</td></tr>'}</tbody></table></div>
    </section>
    <section class="product-management panel" id="products"><div class="section-title"><h2>${icon('▦')} จัดการสินค้า</h2><span>${filtered.length} / ${products.length} รายการ</span></div>
      <form class="product-form" data-product-form>
        ${productField('sku', 'SKU')}${productField('barcode', 'Barcode')}${productField('name', 'ชื่อสินค้า')}${productField('category', 'หมวดหมู่')}${productField('unit', 'หน่วย')}${productField('cost', 'ต้นทุน', 'number')}${productField('price', 'ราคาขาย', 'number')}${productField('qty', 'สต็อกปัจจุบัน', 'number')}${productField('min', 'สต็อกขั้นต่ำ', 'number')}
        <div class="form-actions"><button type="submit" class="primary">${editingProductId ? 'บันทึกการแก้ไข' : '+ เพิ่มสินค้า'}</button><button type="button" data-reset-product>ล้างฟอร์ม</button></div>
      </form>
      <div class="inventory-tools"><div class="search">${icon('⌕')}<input placeholder="ค้นหา SKU, Barcode, ชื่อสินค้า หรือหมวดหมู่" value="${escapeAttr(query)}" data-search></div><label>หมวดหมู่<select data-category-filter><option value="all">ทั้งหมด</option>${categories.map(c=>`<option value="${escapeAttr(c)}" ${categoryFilter===c?'selected':''}>${c}</option>`).join('')}</select></label></div>
      <div class="product-table"><table><thead><tr><th>สินค้า</th><th>Barcode</th><th>หมวดหมู่</th><th>ต้นทุน</th><th>ราคาขาย</th><th>สต็อก</th><th>จัดการ</th></tr></thead><tbody>${filtered.map(p=>`<tr><td><strong>${p.name}</strong><span>${p.sku} · ${p.unit}</span></td><td>${p.barcode}</td><td>${p.category}</td><td>${money.format(p.cost)}</td><td>${money.format(p.price)}</td><td><b class="${p.qty<=p.min?'low':''}">${p.qty} / ${p.min}</b></td><td><button data-edit-product="${p.id}">แก้ไข</button><button class="danger" data-delete-product="${p.id}">ลบ</button></td></tr>`).join('') || '<tr><td colspan="7">ไม่พบสินค้า</td></tr>'}</tbody></table></div>
    </section>
    <section class="lower-grid"><article class="panel inventory"><h2>${icon('▦')} ระบบสต็อกสินค้า</h2>${filtered.map(p=>`<div class="stock"><div><strong>${p.name}</strong><span>${p.sku} · ${p.barcode} · ${money.format(p.price)} / ${p.unit}</span></div><meter min="0" max="100" low="20" value="${Math.min(100,p.qty)}"></meter><b class="${p.qty<=p.min?'low':''}">${p.qty} ${p.unit}</b><button data-stock="${p.id}" data-delta="-1">-</button><button data-stock="${p.id}" data-delta="1">+</button></div>`).join('') || '<p class="empty">ไม่พบสินค้าตามเงื่อนไข</p>'}</article>
    <article class="panel"><h2>${icon('◷')} ประวัติการทำรายการ</h2>${activity.map(a=>`<div class="activity">${icon('▸')}<div><strong>${a[0]}</strong><span>${a[1]} · ${a[2]}</span></div><b>${money.format(a[3])}</b><em>${a[4]}</em><small>${a[5]}</small></div>`).join('')}</article></section></main>`;
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const doc = target.closest('[data-doc]');
    if (doc) {
      selectedDoc = docTypes.find(d => d.key === doc.dataset.doc) || selectedDoc;
      render();
      return;
    }
    if (target.closest('[data-print]')) {
      window.print();
      return;
    }
    if (target.closest('[data-add]')) {
      items.push({ name: 'รายการใหม่', qty: 1, price: 0 });
      render();
      return;
    }
    if (target.closest('[data-reset-product]')) {
      resetProductForm();
      render();
      return;
    }
    if (target.closest('[data-reset-customer]')) {
      resetCustomerForm();
      render();
      return;
    }
    const companyForm = target.closest('[data-company-form]');
    if (target.closest('[data-save-company]') && companyForm) {
      saveCompanyForm(companyForm);
      return;
    }
    if (target.closest('[data-cancel-company]')) {
      cancelCompanyChanges();
      return;
    }
    if (target.closest('[data-reset-company]') && confirm('รีเซ็ตข้อมูลบริษัทเป็นค่าเริ่มต้น?')) {
      resetCompanySettings();
      return;
    }
    if (target.closest('[data-delete-logo]')) {
      deleteCompanyLogo();
      render();
      return;
    }
    if (companyForm) return;
    const viewCustomer = target.closest('[data-view-customer]');
    if (viewCustomer) {
      viewingCustomerId = Number(viewCustomer.dataset.viewCustomer);
      render();
      return;
    }
    const editCustomer = target.closest('[data-edit-customer]');
    if (editCustomer) {
      const customer = customers.find(c => c.id === Number(editCustomer.dataset.editCustomer));
      if (customer) {
        editingCustomerId = customer.id;
        viewingCustomerId = customer.id;
        customerForm = { ...createEmptyCustomer(), ...customer };
        customerErrors = {};
        render();
      }
      return;
    }
    const removeCustomer = target.closest('[data-delete-customer]');
    if (removeCustomer && confirm('ลบลูกค้านี้ออกจากระบบ?')) {
      const index = customers.findIndex(c => c.id === Number(removeCustomer.dataset.deleteCustomer));
      if (index >= 0) {
        customers.splice(index, 1);
        saveCustomers();
        resetCustomerForm();
        render();
      }
      return;
    }
    const edit = target.closest('[data-edit-product]');
    if (edit) {
      const product = products.find(p => p.id === Number(edit.dataset.editProduct));
      if (product) {
        editingProductId = product.id;
        productForm = {
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          category: product.category,
          unit: product.unit,
          cost: String(product.cost),
          price: String(product.price),
          qty: String(product.qty),
          min: String(product.min),
        };
        productErrors = {};
        render();
      }
      return;
    }
    const remove = target.closest('[data-delete-product]');
    if (remove && confirm('ลบสินค้านี้ออกจากระบบ?')) {
      const index = products.findIndex(p => p.id === Number(remove.dataset.deleteProduct));
      if (index >= 0) {
        products.splice(index, 1);
        saveProducts();
        resetProductForm();
        render();
      }
      return;
    }
    const stock = target.closest('[data-stock]');
    if (stock) {
      const product = products.find(x => x.id === Number(stock.dataset.stock));
      if (product) {
        product.qty = Math.max(0, product.qty + Number(stock.dataset.delta));
        saveProducts();
        render();
      }
    }
  });

  document.addEventListener('input', (e) => {
    const target = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ? e.target : null;
    if (!target) return;
    if (target.matches('[data-search]')) {
      query = target.value;
      scheduleRender();
      return;
    }
    if (target.matches('[data-customer-search]')) {
      customerQuery = target.value;
      scheduleRender();
      return;
    }
    if (target.matches('[data-company-field]')) {
      updateCompanyField(target.dataset.companyField, target.value);
      return;
    }
    if (target.matches('[data-customer-field]')) {
      customerForm[target.dataset.customerField] = target.value;
      customerErrors = { ...customerErrors, [target.dataset.customerField]: '' };
      return;
    }
    if (target.matches('[data-product-field]')) {
      productForm[target.dataset.productField] = target.value;
      productErrors = { ...productErrors, [target.dataset.productField]: '' };
      return;
    }
    if (target.matches('[data-document-field]')) {
      documentForm[target.dataset.documentField] = target.value;
      return;
    }
    if (target.matches('[data-item]')) {
      const item = items[Number(target.dataset.item)];
      if (!item) return;
      item[target.dataset.key] = target.dataset.key === 'name' ? target.value : target.value;
      updateDocumentTotals();
    }
  });

  document.addEventListener('change', (e) => {
    const target = e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement ? e.target : null;
    if (!target) return;
    if (target.matches('[data-logo-upload]')) {
      handleLogoUpload(target.files?.[0]);
      return;
    }
    if (target.matches('[data-category-filter]')) {
      categoryFilter = target.value;
      render();
      return;
    }
    if (target.matches('[data-customer-type-filter]')) {
      customerTypeFilter = target.value;
      render();
      return;
    }
    if (target.matches('[data-customer-field]')) {
      customerForm[target.dataset.customerField] = target.value;
      return;
    }
    if (target.matches('[data-product-field]')) {
      productForm[target.dataset.productField] = target.value;
      return;
    }
    if (target.matches('[data-document-field]')) {
      documentForm[target.dataset.documentField] = target.value;
    }
  });

  document.addEventListener('keydown', (e) => {
    const editable = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if (editable && e.key === 'Enter' && !e.target.matches('textarea')) e.preventDefault();
  });

  document.addEventListener('submit', (e) => {
    const form = e.target instanceof HTMLFormElement ? e.target : null;
    if (!form) return;
    if (form.matches('[data-company-form]')) {
      e.preventDefault();
      return;
    }
    if (form.matches('[data-customer-form]')) {
      e.preventDefault();
      submitCustomer();
      render();
      return;
    }
    if (!form.matches('[data-product-form]')) return;
    e.preventDefault();
    submitProduct();
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
