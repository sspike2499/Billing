const docTypes = [
  ['quote','ใบเสนอราคา','QT','#24476f'], ['invoice','ใบแจ้งหนี้','INV','#17324d'], ['cash','บิลเงินสด','CS','#475569'], ['tax','ใบกำกับภาษี','TAX','#14532d'], ['delivery','ใบส่งของ','DN','#7c2d12'], ['receipt','ใบเสร็จรับเงิน','RC','#4c1d95'], ['purchase','ใบสั่งซื้อ','PO','#7f1d1d']
].map(([key,label,code,color]) => ({key,label,code,color}));
const storageKey = 'billing-atelier-products';
const companyStorageKey = 'billing-atelier-company-settings';
const customerStorageKey = 'billing-atelier-customers';
const documentStorageKey = 'billing-atelier-documents';
const paymentStorageKey = 'billing-atelier-payments';
const paymentSequenceStorageKey = 'billing-atelier-payment-sequences';
const documentSchemaVersion = 1;
const documentStatuses = [
  ['draft', 'Draft'], ['sent', 'Sent'], ['approved', 'Approved'], ['waiting_payment', 'Waiting for payment'], ['partially_paid', 'Partially paid'], ['paid', 'Paid'], ['cancelled', 'Cancelled']
];
const defaultDocumentPrefixes = Object.fromEntries(docTypes.map(d => [d.key, d.code]));
let documentStore = loadDocuments();
let paymentStore = loadPayments();
let activeDocumentId = null;
let documentQuery = '';
let documentStatusFilter = 'all';
let documentSort = 'newest';
let documentMessage = '';
let documentErrors = {};
let paymentMessage = '';
let paymentErrors = {};
let editingPaymentId = null;
let viewingPaymentId = null;
let paymentQuery = '';
let paymentMethodFilter = 'all';
let paymentStatusFilter = 'active';
let paymentDateFilter = '';
let paymentCustomerFilter = 'all';
let isSavingPayment = false;
let receiptViewPaymentId = null;
let paymentForm = createEmptyPaymentForm();
let isSavingDocument = false;


const paymentMethods = [
  ['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['promptpay', 'PromptPay'], ['card', 'Credit/debit card'], ['cheque', 'Cheque'], ['other', 'Other']
];
const paymentStatuses = [['active', 'Active'], ['cancelled', 'Cancelled']];
function paymentMethodLabel(method) { return (paymentMethods.find(m => m[0] === method) || paymentMethods[5])[1]; }
function createEmptyPaymentForm(documentId = activeDocumentId) {
  return { documentId: documentId || '', paymentDate: todayISO(), paymentTime: new Date().toTimeString().slice(0,5), amount: '', method: 'bank_transfer', referenceNumber: '', bankAccountInfo: '', notes: '', attachmentName: '', attachmentType: '', attachmentSize: '' };
}
function loadPaymentSequences() {
  try { return { payment: 0, receipt: 0, ...(JSON.parse(localStorage.getItem(paymentSequenceStorageKey) || 'null') || {}) }; }
  catch { return { payment: 0, receipt: 0 }; }
}
function savePaymentSequences(sequences) { localStorage.setItem(paymentSequenceStorageKey, JSON.stringify(sequences)); }
function normalizePaymentRecord(r = {}, index = 0) {
  const createdAt = r.createdAt || new Date(Date.now() - index).toISOString();
  return { id: String(r.id || createId('pay')), paymentNumber: String(r.paymentNumber || '').trim(), receiptNumber: String(r.receiptNumber || '').trim(), documentId: String(r.documentId || ''), documentNumber: String(r.documentNumber || ''), customerId: r.customerId ? String(r.customerId) : '', customerSnapshot: r.customerSnapshot || null, companySnapshot: r.companySnapshot || null, paymentDate: String(r.paymentDate || todayISO()), paymentTime: String(r.paymentTime || '00:00').slice(0,5), amount: Math.max(0, Number(r.amount) || 0), method: paymentMethods.some(m => m[0] === r.method) ? r.method : 'other', referenceNumber: String(r.referenceNumber || ''), bankAccountInfo: String(r.bankAccountInfo || ''), notes: String(r.notes || ''), attachment: r.attachment && typeof r.attachment === 'object' ? { name: String(r.attachment.name || ''), type: String(r.attachment.type || ''), size: Number(r.attachment.size) || 0 } : null, status: r.status === 'cancelled' ? 'cancelled' : 'active', cancelledAt: r.cancelledAt || '', cancelReason: String(r.cancelReason || ''), createdAt, updatedAt: r.updatedAt || createdAt };
}
function loadPayments() {
  try {
    const raw = JSON.parse(localStorage.getItem(paymentStorageKey) || 'null');
    const records = (Array.isArray(raw) ? raw : Array.isArray(raw?.records) ? raw.records : []).filter(x => x && typeof x === 'object').map(normalizePaymentRecord);
    const sequences = loadPaymentSequences();
    records.forEach(p => { const pm = p.paymentNumber.match(/PAY-\d{4}-(\d+)$/); const rc = p.receiptNumber.match(/RCPT-\d{4}-(\d+)$/); if (pm) sequences.payment = Math.max(sequences.payment, Number(pm[1])); if (rc) sequences.receipt = Math.max(sequences.receipt, Number(rc[1])); });
    savePaymentSequences(sequences);
    return { records, sequences };
  } catch { return { records: [], sequences: loadPaymentSequences() }; }
}
function savePayments() { localStorage.setItem(paymentStorageKey, JSON.stringify({ records: paymentStore.records })); savePaymentSequences(paymentStore.sequences); }
function nextPaymentNumber(kind) { paymentStore.sequences[kind] = (Number(paymentStore.sequences[kind]) || 0) + 1; return `${kind === 'receipt' ? 'RCPT' : 'PAY'}-${new Date().getFullYear()}-${String(paymentStore.sequences[kind]).padStart(5, '0')}`; }
function paymentsForDocument(documentId, includeCancelled = true) { return paymentStore.records.filter(p => p.documentId === documentId && (includeCancelled || p.status !== 'cancelled')); }
function paymentSummary(doc) { const total = documentTotals(doc).grandTotal; const paid = paymentsForDocument(doc.id, false).reduce((s,p)=>s + Number(p.amount || 0), 0); return { total, paid, remaining: Math.max(0, total - paid) }; }
function recalcDocumentPaymentStatus(documentId) { const i = documentStore.records.findIndex(d => d.id === documentId); if (i < 0 || documentStore.records[i].status === 'cancelled') return; const s = paymentSummary(documentStore.records[i]); const status = s.paid <= 0 ? 'waiting_payment' : s.remaining <= 0.009 ? 'paid' : 'partially_paid'; documentStore.records[i] = { ...documentStore.records[i], status, updatedAt: new Date().toISOString() }; if (documentForm.id === documentId) documentForm.status = status; saveDocumentStore(); }
function filteredPayments() { const q = paymentQuery.toLowerCase(); return paymentStore.records.filter(p => { const hay = `${p.paymentNumber} ${p.receiptNumber} ${p.documentNumber} ${p.customerSnapshot?.name || ''} ${p.referenceNumber} ${p.notes}`.toLowerCase(); return hay.includes(q) && (paymentMethodFilter === 'all' || p.method === paymentMethodFilter) && (paymentStatusFilter === 'all' || p.status === paymentStatusFilter) && (!paymentDateFilter || p.paymentDate === paymentDateFilter) && (paymentCustomerFilter === 'all' || String(p.customerId) === String(paymentCustomerFilter)); }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); }
function validatePayment(data, doc) { const errors = {}; const amount = Number(data.amount); if (!doc) errors.documentId = 'กรุณาเลือกเอกสารที่บันทึกไว้'; else if (doc.status === 'cancelled') errors.documentId = 'เอกสารที่ยกเลิกแล้วไม่สามารถรับชำระเงินใหม่ได้'; if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'ยอดชำระต้องมากกว่า 0'; if (!data.paymentDate) errors.paymentDate = 'กรุณาระบุวันที่ชำระเงิน'; if (!data.paymentTime) errors.paymentTime = 'กรุณาระบุเวลาชำระเงิน'; if (!paymentMethods.some(m => m[0] === data.method)) errors.method = 'กรุณาเลือกวิธีชำระเงิน'; const remaining = doc ? paymentSummary(doc).remaining + (editingPaymentId ? Number(paymentStore.records.find(p => p.id === editingPaymentId)?.amount || 0) : 0) : 0; if (amount > remaining + 0.009 && !confirm(`ยอดชำระมากกว่ายอดคงเหลือ ${money.format(remaining)} ต้องการบันทึกต่อหรือไม่?`)) errors.amount = 'ยอดชำระเกินยอดคงเหลือ'; return errors; }
function savePayment() { if (isSavingPayment) return; isSavingPayment = true; const doc = documentStore.records.find(d => d.id === paymentForm.documentId); paymentErrors = validatePayment(paymentForm, doc); if (Object.keys(paymentErrors).length) { paymentMessage = 'กรุณาตรวจสอบข้อมูลการชำระเงิน'; isSavingPayment = false; render(); return; } const now = new Date().toISOString(); const existing = paymentStore.records.findIndex(p => p.id === editingPaymentId); const record = { ...normalizePaymentRecord(paymentForm), id: editingPaymentId || createId('pay'), paymentNumber: existing >= 0 ? paymentStore.records[existing].paymentNumber : nextPaymentNumber('payment'), receiptNumber: existing >= 0 ? paymentStore.records[existing].receiptNumber : nextPaymentNumber('receipt'), documentId: doc.id, documentNumber: doc.documentNumber, customerId: String(doc.customerId || ''), customerSnapshot: doc.customerSnapshot || snapshotCustomer(customers.find(c => String(c.id) === String(doc.customerId))), companySnapshot: doc.companySnapshot || snapshotCompany(), amount: Number(paymentForm.amount), attachment: paymentForm.attachmentName ? { name: paymentForm.attachmentName, type: paymentForm.attachmentType, size: Number(paymentForm.attachmentSize) || 0 } : null, status: 'active', createdAt: existing >= 0 ? paymentStore.records[existing].createdAt : now, updatedAt: now };
  if (existing >= 0) paymentStore.records[existing] = { ...paymentStore.records[existing], ...record }; else paymentStore.records.unshift(record); savePayments(); recalcDocumentPaymentStatus(doc.id); editingPaymentId = null; viewingPaymentId = record.id; paymentForm = createEmptyPaymentForm(doc.id); paymentMessage = 'บันทึกการชำระเงินเรียบร้อยแล้ว'; isSavingPayment = false; render(); }
function editPayment(id) { const p = paymentStore.records.find(x => x.id === id); if (!p || p.status === 'cancelled') return; editingPaymentId = id; viewingPaymentId = id; paymentForm = { documentId: p.documentId, paymentDate: p.paymentDate, paymentTime: p.paymentTime, amount: p.amount, method: p.method, referenceNumber: p.referenceNumber, bankAccountInfo: p.bankAccountInfo, notes: p.notes, attachmentName: p.attachment?.name || '', attachmentType: p.attachment?.type || '', attachmentSize: p.attachment?.size || '' }; paymentErrors = {}; paymentMessage = 'แก้ไขรายการชำระเงิน'; render(); }
function cancelPayment(id) { const p = paymentStore.records.find(x => x.id === id); if (!p || p.status === 'cancelled') return; const reason = prompt('ระบุเหตุผลการยกเลิกการชำระเงิน') || ''; Object.assign(p, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason, updatedAt: new Date().toISOString() }); savePayments(); recalcDocumentPaymentStatus(p.documentId); paymentMessage = 'ยกเลิกการชำระเงินแล้ว และคำนวณยอดใหม่เรียบร้อย'; render(); }

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(days) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function createId(prefix = 'doc') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function statusLabel(status) { return (documentStatuses.find(s => s[0] === status) || documentStatuses[0])[1]; }
function getPrefix(type = selectedDoc.key) { return String(documentStore.prefixes?.[type] || defaultDocumentPrefixes[type] || type.toUpperCase()).trim() || defaultDocumentPrefixes[type] || 'DOC'; }
function createEmptyDocumentForm(type = selectedDoc.key) {
  return {
    id: null, documentNumber: '', type, issueDate: todayISO(), dueDate: addDaysISO(14), customerId: '', customerSnapshot: null,
    vatMode: 'excluded', vatRate: 7, withholdingTax: 0, notes: '', paymentTerms: '', footerText: '',
    status: 'draft', createdAt: '', updatedAt: '', cancelledAt: '', companySnapshot: null,
    items: [{ productId: '', description: '', quantity: 1, unit: '', unitPrice: 0, discount: 0 }]
  };
}
function loadDocuments() {
  const fallback = { schemaVersion: documentSchemaVersion, sequences: {}, prefixes: { ...defaultDocumentPrefixes }, records: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(documentStorageKey) || 'null');
    if (!raw) return fallback;
    const sourceRecords = Array.isArray(raw) ? raw : Array.isArray(raw.records) ? raw.records : [];
    const records = normalizeDocuments(sourceRecords);
    const sequences = { ...(raw.sequences && typeof raw.sequences === 'object' ? raw.sequences : {}) };
    records.forEach(doc => {
      const match = String(doc.documentNumber || '').match(/-(\d+)$/);
      if (match) sequences[doc.type] = Math.max(Number(sequences[doc.type]) || 0, Number(match[1]) || 0);
    });
    return { schemaVersion: documentSchemaVersion, sequences, prefixes: { ...defaultDocumentPrefixes, ...(raw.prefixes || {}) }, records };
  } catch {
    return fallback;
  }
}
function normalizeDocuments(records) {
  return records.filter(r => r && typeof r === 'object').map((r, index) => {
    const type = docTypes.some(d => d.key === r.type) ? r.type : 'invoice';
    const base = createEmptyDocumentForm(type);
    return { ...base, ...r, id: String(r.id || createId('doc')), documentNumber: String(r.documentNumber || '').trim(), type,
      customerId: r.customerId ? String(r.customerId) : '', customerSnapshot: r.customerSnapshot || null, companySnapshot: r.companySnapshot || null,
      vatMode: ['none','included','excluded'].includes(r.vatMode) ? r.vatMode : 'excluded', vatRate: [0,7].includes(Number(r.vatRate)) ? Number(r.vatRate) : 7,
      withholdingTax: Math.max(0, Number(r.withholdingTax) || 0), status: documentStatuses.some(s => s[0] === r.status) ? r.status : 'draft',
      createdAt: r.createdAt || new Date(Date.now() - index).toISOString(), updatedAt: r.updatedAt || new Date(Date.now() - index).toISOString(),
      items: Array.isArray(r.items) && r.items.length ? r.items.map(normalizeDocumentItem) : base.items };
  });
}
function normalizeDocumentItem(item = {}) { return { productId: item.productId ? String(item.productId) : '', description: String(item.description || ''), quantity: Math.max(0, Number(item.quantity) || 0), unit: String(item.unit || ''), unitPrice: Math.max(0, Number(item.unitPrice) || 0), discount: Math.max(0, Number(item.discount) || 0) }; }
function saveDocumentStore() { localStorage.setItem(documentStorageKey, JSON.stringify(documentStore)); }
function snapshotCompany() { return normalizeCompanySettings(companySettings); }
function snapshotCustomer(customer) { return customer ? { ...createEmptyCustomer(), ...customer } : null; }
function documentTotals(doc = documentForm) {
  const subtotal = doc.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity)||0) * Math.max(0, Number(item.unitPrice)||0), 0);
  const discount = doc.items.reduce((sum, item) => sum + Math.max(0, Number(item.discount)||0), 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const rate = Number(doc.vatRate) || 0;
  const vat = doc.vatMode === 'none' ? 0 : doc.vatMode === 'included' ? afterDiscount - (afterDiscount / (1 + rate / 100)) : afterDiscount * rate / 100;
  const withholding = Math.max(0, Number(doc.withholdingTax) || 0);
  const grandTotal = doc.vatMode === 'excluded' ? afterDiscount + vat - withholding : afterDiscount - withholding;
  return { subtotal, discount, vat, withholding, grandTotal };
}
function nextDocumentNumber(type) {
  const next = (Number(documentStore.sequences[type]) || 0) + 1;
  return `${getPrefix(type)}-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;
}
function validateDocument() {
  const errors = {};
  if (!documentForm.customerId) errors.customerId = 'กรุณาเลือกลูกค้าจากระบบจัดการลูกค้า';
  if (!documentForm.issueDate) errors.issueDate = 'กรุณาระบุวันที่ออกเอกสาร';
  if (!documentForm.dueDate) errors.dueDate = 'กรุณาระบุวันครบกำหนด';
  const validItems = documentForm.items.filter(i => String(i.description || '').trim());
  if (!validItems.length) errors.items = 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ';
  documentForm.items.forEach((item, index) => { if (String(item.description || '').trim() && Number(item.quantity) <= 0) errors[`item-${index}`] = 'จำนวนต้องมากกว่า 0'; });
  return errors;
}
function saveDocument() {
  if (isSavingDocument) return;
  isSavingDocument = true;
  documentErrors = validateDocument();
  if (Object.keys(documentErrors).length) { documentMessage = 'กรุณาตรวจสอบข้อมูลเอกสาร'; isSavingDocument = false; render(); return; }
  const now = new Date().toISOString();
  const type = documentForm.type;
  const existingIndex = documentStore.records.findIndex(d => d.id === documentForm.id);
  const customer = customers.find(c => String(c.id) === String(documentForm.customerId));
  let doc = { ...documentForm, items: documentForm.items.map(normalizeDocumentItem), updatedAt: now, customerSnapshot: snapshotCustomer(customer) || documentForm.customerSnapshot, companySnapshot: documentForm.companySnapshot || snapshotCompany() };
  if (existingIndex < 0) {
    const number = nextDocumentNumber(type);
    if (documentStore.records.some(d => d.documentNumber === number)) { documentErrors.documentNumber = 'เลขเอกสารซ้ำ กรุณาลองบันทึกอีกครั้ง'; documentMessage = documentErrors.documentNumber; isSavingDocument = false; render(); return; }
    documentStore.sequences[type] = (Number(documentStore.sequences[type]) || 0) + 1;
    doc = { ...doc, id: createId('doc'), documentNumber: number, createdAt: now, companySnapshot: snapshotCompany() };
    documentStore.records.unshift(doc);
  } else {
    documentStore.records[existingIndex] = doc;
  }
  activeDocumentId = doc.id; documentForm = { ...doc, items: doc.items.map(i => ({ ...i })) };
  saveDocumentStore(); documentMessage = 'บันทึกเอกสารเรียบร้อยแล้ว'; isSavingDocument = false; render();
}
function openDocument(id) { const doc = documentStore.records.find(d => d.id === id); if (!doc) return; activeDocumentId = id; selectedDoc = docTypes.find(d => d.key === doc.type) || selectedDoc; documentForm = { ...doc, items: doc.items.map(i => ({ ...i })) }; documentErrors = {}; documentMessage = 'เปิดเอกสารที่บันทึกไว้แล้ว'; render(); }
function newDocument(type = selectedDoc.key) { activeDocumentId = null; documentForm = createEmptyDocumentForm(type); documentErrors = {}; documentMessage = 'สร้างเอกสารใหม่แล้ว กรุณาบันทึกเพื่อรับเลขเอกสาร'; render(); }
function duplicateDocument(id) { const doc = documentStore.records.find(d => d.id === id); if (!doc) return; selectedDoc = docTypes.find(d => d.key === doc.type) || selectedDoc; documentForm = { ...doc, id: null, documentNumber: '', status: 'draft', createdAt: '', updatedAt: '', cancelledAt: '', items: doc.items.map(i => ({ ...i })) }; activeDocumentId = null; documentMessage = 'คัดลอกเอกสารแล้ว กรุณาบันทึกเพื่อออกเลขใหม่'; render(); }
function cancelDocument(id = activeDocumentId) { const index = documentStore.records.findIndex(d => d.id === id); if (index < 0) return; documentStore.records[index] = { ...documentStore.records[index], status: 'cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; saveDocumentStore(); openDocument(id); documentMessage = 'ยกเลิกเอกสารแล้ว โดยยังเก็บประวัติไว้'; }
function filteredDocuments() { const q = documentQuery.toLowerCase(); return [...documentStore.records].filter(d => { const customer = d.customerSnapshot?.name || ''; const hay = `${d.documentNumber} ${customer} ${d.type} ${d.issueDate}`.toLowerCase(); return hay.includes(q) && (documentStatusFilter === 'all' || d.status === documentStatusFilter); }).sort((a,b) => documentSort === 'newest' ? String(b.createdAt).localeCompare(String(a.createdAt)) : String(a.createdAt).localeCompare(String(b.createdAt))); }

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
let documentForm = createEmptyDocumentForm(selectedDoc.key);
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
  const totals = documentTotals();
  document.querySelectorAll('[data-line-total]').forEach((cell) => {
    const item = documentForm.items[Number(cell.dataset.lineTotal)];
    if (item) cell.textContent = money.format(Math.max(0, (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0)));
  });
  const pairs = { '[data-subtotal]': totals.subtotal, '[data-discount]': totals.discount, '[data-vat]': totals.vat, '[data-withholding]': totals.withholding, '[data-total]': totals.grandTotal };
  Object.entries(pairs).forEach(([selector, value]) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = money.format(value);
  });
}


function renderPreservingInteraction() {
  const active = document.activeElement;
  const activeName = active instanceof HTMLElement ? active.getAttribute('data-search') !== null ? 'product-search' : active.getAttribute('data-customer-search') !== null ? 'customer-search' : active.getAttribute('data-document-search') !== null ? 'document-search' : '' : '';
  const selectionStart = active instanceof HTMLInputElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLInputElement ? active.selectionEnd : null;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  render();
  const next = activeName === 'product-search' ? document.querySelector('[data-search]') : activeName === 'customer-search' ? document.querySelector('[data-customer-search]') : activeName === 'document-search' ? document.querySelector('[data-document-search]') : null;
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
  const currentPaymentSummary = activeDocumentId ? paymentSummary(documentForm) : { total: documentTotals().grandTotal, paid: 0, remaining: documentTotals().grandTotal };
  const currentPayments = activeDocumentId ? paymentsForDocument(activeDocumentId, true) : [];
  const viewingPayment = paymentStore.records.find(p => p.id === viewingPaymentId);
  const receiptPayment = paymentStore.records.find(p => p.id === receiptViewPaymentId);
  root.innerHTML = `<main>
    <section class="hero"><nav><div class="brand">${icon('✦')} Billing Atelier</div><div class="nav-actions"><a href="#customers">ลูกค้า</a><a href="#products">สินค้า</a><a href="#company">ตั้งค่าบริษัท</a><button data-print>${icon('⎙')} พิมพ์ / ส่งออก PDF</button></div></nav>
      <div class="hero-grid"><div><p class="eyebrow">Burgundy · Blue Navy · Rose Gold</p><h1>ระบบบิลและสต็อกสินค้า สำหรับธุรกิจไทยที่ดูอินเตอร์</h1><p>จัดการเอกสารขาย ซื้อ ส่งของ ภาษี รายรับ สต็อก และประวัติรายการย้อนหลังในหน้าเดียว พร้อมเอกสารโทนทางการที่อ่านง่ายเมื่อสั่งพิมพ์จริง</p></div><div class="glass-card">${icon('▣')}<strong>พร้อมใช้งาน</strong><span>ใบเสนอราคา ใบแจ้งหนี้ บิลเงินสด ใบกำกับภาษี ใบส่งของ ใบเสร็จรับเงิน และใบสั่งซื้อ</span></div></div></section>
    <section class="stats">${[['รายได้เดือนนี้', money.format(638420), '▰'], ['สินค้าทั้งหมด', `${products.length} รายการ`, '◫'], ['รอชำระ', money.format(127600), '฿'], ['สินค้าใกล้หมด', `${products.filter(p=>p.qty<=p.min).length} รายการ`, '□']].map(s => `<article>${icon(s[2])}<span>${s[0]}</span><strong>${s[1]}</strong></article>`).join('')}</section>
    <section class="workspace"><aside class="panel"><h2>ชนิดเอกสาร</h2>${docTypes.map(d => `<button class="doc ${selectedDoc.key===d.key?'active':''}" style="--doc:${d.color}" data-doc="${d.key}">${icon('▤')}<span>${d.label}</span><small>${getPrefix(d.key)}</small></button>`).join('')}</aside>
      <section class="document-shell"><div class="toolbar"><div><span class="tag" style="background:${selectedDoc.color}">${getPrefix(selectedDoc.key)}</span><h2>${selectedDoc.label}</h2><p class="doc-message">${escapeAttr(documentMessage || 'เอกสารใหม่จะได้รับเลขเมื่อบันทึกครั้งแรก')}</p></div><div><button type="button" data-new-document>${icon('+')} ใหม่</button><button type="button" class="primary" data-save-document ${isSavingDocument ? 'disabled' : ''}>${icon('✓')} บันทึก Draft</button><button type="button" data-duplicate-active ${activeDocumentId ? '' : 'disabled'}>${icon('⧉')} Duplicate</button><button type="button" class="danger" data-cancel-document ${activeDocumentId && documentForm.status !== 'cancelled' ? '' : 'disabled'}>${icon('×')} Cancel</button><button type="button" data-print>${icon('⎙')} Print/PDF</button></div></div>
      <div class="document-manager"><div class="inventory-tools"><div class="search">${icon('⌕')}<input placeholder="ค้นหาเลขเอกสาร ลูกค้า ประเภท หรือวันที่" value="${escapeAttr(documentQuery)}" data-document-search></div><label>สถานะ<select data-document-status-filter><option value="all">ทั้งหมด</option>${documentStatuses.map(([key,label])=>`<option value="${key}" ${documentStatusFilter===key?'selected':''}>${label}</option>`).join('')}</select></label><label>เรียง<select data-document-sort><option value="newest" ${documentSort==='newest'?'selected':''}>ใหม่สุด</option><option value="oldest" ${documentSort==='oldest'?'selected':''}>เก่าสุด</option></select></label></div>
      <div class="document-list">${filteredDocuments().map(d=>`<article class="saved-doc ${d.id===activeDocumentId?'active':''}"><button type="button" data-open-document="${d.id}"><strong>${escapeAttr(d.documentNumber)}</strong><span>${escapeAttr(docTypes.find(t=>t.key===d.type)?.label || d.type)} · ${escapeAttr(d.customerSnapshot?.name || '-')}</span><small>${escapeAttr(d.issueDate)} · ${statusLabel(d.status)} · ${money.format(documentTotals(d).grandTotal)}</small></button><button type="button" data-duplicate-document="${d.id}">คัดลอก</button></article>`).join('') || '<p class="empty document-empty">ยังไม่มีเอกสารที่บันทึกไว้</p>'}</div></div>
      <div class="paper" style="--accent:${selectedDoc.color}"><header><div class="paper-company">${(documentForm.companySnapshot?.logo || companySettings.logo) ? `<img src="${escapeAttr(documentForm.companySnapshot?.logo || companySettings.logo)}" alt="โลโก้บริษัท" class="paper-logo">` : ''}<div><h3>${selectedDoc.label}</h3><p>${escapeAttr((documentForm.companySnapshot?.name || companySettings.name))} · ${escapeAttr(documentForm.companySnapshot?.address || companySettings.address)} ${escapeAttr(documentForm.companySnapshot?.subdistrict || companySettings.subdistrict)} ${escapeAttr(documentForm.companySnapshot?.district || companySettings.district)} ${escapeAttr(documentForm.companySnapshot?.province || companySettings.province)} ${escapeAttr(documentForm.companySnapshot?.postalCode || companySettings.postalCode)}</p><p>เลขประจำตัวผู้เสียภาษี ${escapeAttr(documentForm.companySnapshot?.taxId || companySettings.taxId || '-')} · โทร ${escapeAttr(documentForm.companySnapshot?.phone || companySettings.phone || '-')}</p></div></div><strong>${escapeAttr(documentForm.documentNumber || 'ยังไม่ออกเลข')}</strong></header>
      <div class="form-grid"><label>Prefix<input data-prefix-field="${selectedDoc.key}" value="${escapeAttr(getPrefix(selectedDoc.key))}"></label><label>ลูกค้า<select data-document-field="customerId"><option value="">เลือกลูกค้า</option>${customers.map(c=>`<option value="${c.id}" ${String(documentForm.customerId)===String(c.id)?'selected':''}>${escapeAttr(c.name)} (${escapeAttr(c.code)})</option>`).join('')}</select>${documentErrors.customerId ? `<small class="error">${documentErrors.customerId}</small>` : ''}</label><label>วันที่ออก<input data-document-field="issueDate" type="date" value="${escapeAttr(documentForm.issueDate)}">${documentErrors.issueDate ? `<small class="error">${documentErrors.issueDate}</small>` : ''}</label><label>ครบกำหนด<input data-document-field="dueDate" type="date" value="${escapeAttr(documentForm.dueDate)}">${documentErrors.dueDate ? `<small class="error">${documentErrors.dueDate}</small>` : ''}</label><label>สถานะ<select data-document-field="status">${documentStatuses.map(([key,label])=>`<option value="${key}" ${documentForm.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label>VAT<select data-document-field="vatMode"><option value="none" ${documentForm.vatMode==='none'?'selected':''}>ไม่มี VAT</option><option value="included" ${documentForm.vatMode==='included'?'selected':''}>รวม VAT แล้ว</option><option value="excluded" ${documentForm.vatMode==='excluded'?'selected':''}>ยังไม่รวม VAT</option></select></label><label>อัตรา VAT<select data-document-field="vatRate"><option value="0" ${Number(documentForm.vatRate)===0?'selected':''}>0%</option><option value="7" ${Number(documentForm.vatRate)===7?'selected':''}>7%</option></select></label><label>หัก ณ ที่จ่าย<input type="number" min="0" step="0.01" data-document-field="withholdingTax" value="${escapeAttr(documentForm.withholdingTax)}"></label></div>
      <div class="customer-snapshot"><b>ข้อมูลลูกค้าที่บันทึกในเอกสาร:</b> ${escapeAttr(documentForm.customerSnapshot?.name || customers.find(c=>String(c.id)===String(documentForm.customerId))?.name || '-')} · Tax ID ${escapeAttr(documentForm.customerSnapshot?.taxId || customers.find(c=>String(c.id)===String(documentForm.customerId))?.taxId || '-')}</div>
      <table><thead><tr><th>สินค้า</th><th>รายละเอียด</th><th>จำนวน</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>ส่วนลด</th><th>รวม</th><th class="edit-control"></th></tr></thead><tbody>${documentForm.items.map((it,i)=>`<tr><td><select data-item="${i}" data-key="productId"><option value="">เลือกรายการ</option>${products.map(p=>`<option value="${p.id}" ${String(it.productId)===String(p.id)?'selected':''}>${escapeAttr(p.name)}</option>`).join('')}</select></td><td><input data-item="${i}" data-key="description" value="${escapeAttr(it.description)}">${documentErrors[`item-${i}`] ? `<small class="error">${documentErrors[`item-${i}`]}</small>` : ''}</td><td><input type="number" min="0" step="0.01" data-item="${i}" data-key="quantity" value="${escapeAttr(it.quantity)}"></td><td><input data-item="${i}" data-key="unit" value="${escapeAttr(it.unit)}"></td><td><input type="number" min="0" step="0.01" data-item="${i}" data-key="unitPrice" value="${escapeAttr(it.unitPrice)}"></td><td><input type="number" min="0" step="0.01" data-item="${i}" data-key="discount" value="${escapeAttr(it.discount)}"></td><td data-line-total="${i}">${money.format(Math.max(0,(Number(it.quantity)||0)*(Number(it.unitPrice)||0)-(Number(it.discount)||0)))}</td><td class="edit-control"><button type="button" class="danger" data-remove-item="${i}">ลบ</button></td></tr>`).join('')}</tbody></table>${documentErrors.items ? `<small class="error">${documentErrors.items}</small>` : ''}<button type="button" class="add" data-add>+ เพิ่มรายการ</button>
      <div class="form-grid document-text"><label class="wide">หมายเหตุ<textarea data-document-field="notes">${escapeAttr(documentForm.notes)}</textarea></label><label class="wide">เงื่อนไขการชำระเงิน<textarea data-document-field="paymentTerms">${escapeAttr(documentForm.paymentTerms)}</textarea></label><label class="wide">ข้อความท้ายเอกสาร<textarea data-document-field="footerText">${escapeAttr(documentForm.footerText)}</textarea></label></div>
      <div class="totals"><p><span>มูลค่าสินค้า</span><b data-subtotal>${money.format(documentTotals().subtotal)}</b></p><p><span>ส่วนลด</span><b data-discount>${money.format(documentTotals().discount)}</b></p><p><span>VAT</span><b data-vat>${money.format(documentTotals().vat)}</b></p><p><span>หัก ณ ที่จ่าย</span><b data-withholding>${money.format(documentTotals().withholding)}</b></p><p class="grand"><span>ยอดสุทธิ</span><b data-total>${money.format(documentTotals().grandTotal)}</b></p><p><span>ชำระแล้ว</span><b data-paid>${money.format(currentPaymentSummary.paid)}</b></p><p><span>คงเหลือ</span><b data-remaining>${money.format(currentPaymentSummary.remaining)}</b></p></div>
      <section class="payment-panel"><div class="section-title"><h2>${icon('฿')} Payment Management</h2><span>${escapeAttr(paymentMessage || 'บันทึกชำระเงินและออกใบเสร็จจากเอกสารที่บันทึกแล้ว')}</span></div>
        <form class="payment-form" data-payment-form>
          <label>เอกสาร<select data-payment-field="documentId"><option value="">เลือกเอกสาร</option>${documentStore.records.filter(d=>['invoice','tax','cash','receipt'].includes(d.type)).map(d=>`<option value="${d.id}" ${paymentForm.documentId===d.id?'selected':''}>${escapeAttr(d.documentNumber)} · ${escapeAttr(d.customerSnapshot?.name || '-')} · ${statusLabel(d.status)}</option>`).join('')}</select>${paymentErrors.documentId ? `<small class="error">${paymentErrors.documentId}</small>` : ''}</label>
          <label>วันที่<input type="date" data-payment-field="paymentDate" value="${escapeAttr(paymentForm.paymentDate)}">${paymentErrors.paymentDate ? `<small class="error">${paymentErrors.paymentDate}</small>` : ''}</label><label>เวลา<input type="time" data-payment-field="paymentTime" value="${escapeAttr(paymentForm.paymentTime)}">${paymentErrors.paymentTime ? `<small class="error">${paymentErrors.paymentTime}</small>` : ''}</label><label>ยอดชำระ<input type="number" min="0.01" step="0.01" data-payment-field="amount" value="${escapeAttr(paymentForm.amount)}">${paymentErrors.amount ? `<small class="error">${paymentErrors.amount}</small>` : ''}</label>
          <label>วิธีชำระ<select data-payment-field="method">${paymentMethods.map(([k,l])=>`<option value="${k}" ${paymentForm.method===k?'selected':''}>${l}</option>`).join('')}</select></label><label>เลขอ้างอิง<input data-payment-field="referenceNumber" value="${escapeAttr(paymentForm.referenceNumber)}"></label><label>ธนาคาร/บัญชี<input data-payment-field="bankAccountInfo" value="${escapeAttr(paymentForm.bankAccountInfo)}"></label><label>หลักฐานแนบ<input placeholder="ชื่อไฟล์/URL" data-payment-field="attachmentName" value="${escapeAttr(paymentForm.attachmentName)}"></label><label class="wide">หมายเหตุ<textarea data-payment-field="notes">${escapeAttr(paymentForm.notes)}</textarea></label>
          <div class="form-actions"><button type="submit" class="primary" ${isSavingPayment || !activeDocumentId || documentForm.status==='cancelled' ? 'disabled' : ''}>${editingPaymentId ? 'บันทึกแก้ไข' : '+ เพิ่มการชำระเงิน'}</button><button type="button" data-reset-payment>ล้างฟอร์ม</button></div>
        </form>
        <div class="payment-history"><h3>ประวัติการชำระเงินในเอกสารนี้</h3>${currentPayments.map(p=>`<article class="payment-row ${p.status}"><div><strong>${escapeAttr(p.paymentNumber)}</strong><span>${escapeAttr(p.paymentDate)} ${escapeAttr(p.paymentTime)} · ${paymentMethodLabel(p.method)} · ใบเสร็จ ${escapeAttr(p.receiptNumber)}</span><small>${escapeAttr(p.referenceNumber || p.bankAccountInfo || p.notes || '')}${p.status==='cancelled' ? ` · ยกเลิก ${escapeAttr(p.cancelReason || '')}` : ''}</small></div><b>${money.format(p.amount)}</b><em>${p.status==='cancelled'?'Cancelled':'Active'}</em><button type="button" data-view-payment="${p.id}">ดู</button><button type="button" data-edit-payment="${p.id}" ${p.status==='cancelled'?'disabled':''}>แก้ไข</button><button type="button" data-receipt="${p.id}">ใบเสร็จ</button><button type="button" class="danger" data-cancel-payment="${p.id}" ${p.status==='cancelled'?'disabled':''}>ยกเลิก</button></article>`).join('') || '<p class="empty">ยังไม่มีประวัติการชำระเงิน</p>'}</div>
      </section></div></section></section>
    <section class="payment-management panel" id="payments"><div class="section-title"><h2>${icon('฿')} ค้นหาการชำระเงิน</h2><span>${filteredPayments().length} / ${paymentStore.records.length} รายการ</span></div><div class="inventory-tools payment-tools"><div class="search">${icon('⌕')}<input placeholder="ค้นหาเลขชำระ ใบเสร็จ ใบแจ้งหนี้ ลูกค้า อ้างอิง" value="${escapeAttr(paymentQuery)}" data-payment-search></div><label>วิธี<select data-payment-method-filter><option value="all">ทั้งหมด</option>${paymentMethods.map(([k,l])=>`<option value="${k}" ${paymentMethodFilter===k?'selected':''}>${l}</option>`).join('')}</select></label><label>สถานะ<select data-payment-status-filter><option value="all">ทั้งหมด</option>${paymentStatuses.map(([k,l])=>`<option value="${k}" ${paymentStatusFilter===k?'selected':''}>${l}</option>`).join('')}</select></label><label>วันที่<input type="date" data-payment-date-filter value="${escapeAttr(paymentDateFilter)}"></label><label>ลูกค้า<select data-payment-customer-filter><option value="all">ทั้งหมด</option>${customers.map(c=>`<option value="${c.id}" ${String(paymentCustomerFilter)===String(c.id)?'selected':''}>${escapeAttr(c.name)}</option>`).join('')}</select></label></div>${viewingPayment ? `<div class="customer-detail"><h3>${escapeAttr(viewingPayment.paymentNumber)} · ${escapeAttr(viewingPayment.receiptNumber)}</h3><p>${escapeAttr(viewingPayment.documentNumber)} · ${escapeAttr(viewingPayment.customerSnapshot?.name || '-')} · ${money.format(viewingPayment.amount)}</p><p>${paymentMethodLabel(viewingPayment.method)} · Ref ${escapeAttr(viewingPayment.referenceNumber || '-')} · ${escapeAttr(viewingPayment.bankAccountInfo || '-')}</p><p>${escapeAttr(viewingPayment.notes || '')}</p></div>` : ''}<div class="product-table"><table><thead><tr><th>Payment</th><th>เอกสาร</th><th>ลูกค้า</th><th>วันที่</th><th>วิธี</th><th>ยอด</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${filteredPayments().map(p=>`<tr><td><strong>${escapeAttr(p.paymentNumber)}</strong><span>${escapeAttr(p.receiptNumber)}</span></td><td>${escapeAttr(p.documentNumber)}</td><td>${escapeAttr(p.customerSnapshot?.name || '-')}</td><td>${escapeAttr(p.paymentDate)} ${escapeAttr(p.paymentTime)}</td><td>${paymentMethodLabel(p.method)}</td><td>${money.format(p.amount)}</td><td>${p.status==='cancelled'?'Cancelled':'Active'}</td><td><button data-view-payment="${p.id}">ดู</button><button data-edit-payment="${p.id}" ${p.status==='cancelled'?'disabled':''}>แก้ไข</button><button data-receipt="${p.id}">ใบเสร็จ</button><button class="danger" data-cancel-payment="${p.id}" ${p.status==='cancelled'?'disabled':''}>ยกเลิก</button></td></tr>`).join('') || '<tr><td colspan="8">ไม่พบรายการชำระเงิน</td></tr>'}</tbody></table></div></section>
    ${receiptPayment ? `<section class="receipt-sheet panel"><div class="toolbar receipt-controls"><h2>Receipt ${escapeAttr(receiptPayment.receiptNumber)}</h2><div><button data-print>${icon('⎙')} Print/PDF</button><button data-close-receipt>ปิด</button></div></div><article class="paper" style="--accent:#4c1d95"><header><div class="paper-company">${receiptPayment.companySnapshot?.logo ? `<img src="${escapeAttr(receiptPayment.companySnapshot.logo)}" class="paper-logo" alt="โลโก้บริษัท">` : ''}<div><h3>ใบเสร็จรับเงิน</h3><p>${escapeAttr(receiptPayment.companySnapshot?.name || '')} · Tax ID ${escapeAttr(receiptPayment.companySnapshot?.taxId || '-')}</p><p>${escapeAttr(receiptPayment.companySnapshot?.address || '')} ${escapeAttr(receiptPayment.companySnapshot?.province || '')}</p></div></div><strong>${escapeAttr(receiptPayment.receiptNumber)}</strong></header><div class="customer-snapshot"><b>ลูกค้า:</b> ${escapeAttr(receiptPayment.customerSnapshot?.name || '-')} · Tax ID ${escapeAttr(receiptPayment.customerSnapshot?.taxId || '-')}<br><b>อ้างอิงใบแจ้งหนี้:</b> ${escapeAttr(receiptPayment.documentNumber)}</div><table><tbody><tr><th>วันที่/เวลา</th><td>${escapeAttr(receiptPayment.paymentDate)} ${escapeAttr(receiptPayment.paymentTime)}</td></tr><tr><th>วิธีชำระเงิน</th><td>${paymentMethodLabel(receiptPayment.method)}</td></tr><tr><th>เลขอ้างอิง</th><td>${escapeAttr(receiptPayment.referenceNumber || '-')}</td></tr><tr><th>ธนาคาร/บัญชี</th><td>${escapeAttr(receiptPayment.bankAccountInfo || '-')}</td></tr><tr><th>จำนวนเงินที่รับชำระ</th><td><b>${money.format(receiptPayment.amount)}</b></td></tr></tbody></table></article></section>` : ''}

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
      if (!activeDocumentId && !documentForm.documentNumber) documentForm.type = selectedDoc.key;
      render();
      return;
    }
    if (target.closest('[data-new-document]')) { newDocument(selectedDoc.key); paymentForm = createEmptyPaymentForm(''); return; }
    if (target.closest('[data-save-document]')) { saveDocument(); return; }
    if (target.closest('[data-duplicate-active]')) { duplicateDocument(activeDocumentId); return; }
    if (target.closest('[data-cancel-document]') && confirm('ยกเลิกเอกสารนี้โดยเก็บประวัติไว้?')) { cancelDocument(activeDocumentId); return; }
    const openDoc = target.closest('[data-open-document]');
    if (openDoc) { openDocument(openDoc.dataset.openDocument); paymentForm = createEmptyPaymentForm(openDoc.dataset.openDocument); return; }
    const dupDoc = target.closest('[data-duplicate-document]');
    if (dupDoc) { duplicateDocument(dupDoc.dataset.duplicateDocument); return; }
    const removeItem = target.closest('[data-remove-item]');
    if (removeItem) { documentForm.items.splice(Number(removeItem.dataset.removeItem), 1); if (!documentForm.items.length) documentForm.items.push(normalizeDocumentItem()); render(); return; }
    if (target.closest('[data-print]')) {
      window.print();
      return;
    }
    if (target.closest('[data-reset-payment]')) { editingPaymentId = null; paymentForm = createEmptyPaymentForm(activeDocumentId); paymentErrors = {}; render(); return; }
    if (target.closest('[data-close-receipt]')) { receiptViewPaymentId = null; render(); return; }
    const viewPay = target.closest('[data-view-payment]');
    if (viewPay) { viewingPaymentId = viewPay.dataset.viewPayment; render(); return; }
    const editPay = target.closest('[data-edit-payment]');
    if (editPay) { editPayment(editPay.dataset.editPayment); return; }
    const cancelPay = target.closest('[data-cancel-payment]');
    if (cancelPay && confirm('ยืนยันยกเลิกการชำระเงินนี้โดยไม่ลบประวัติ?')) { cancelPayment(cancelPay.dataset.cancelPayment); return; }
    const receipt = target.closest('[data-receipt]');
    if (receipt) { receiptViewPaymentId = receipt.dataset.receipt; render(); setTimeout(()=>document.querySelector('.receipt-sheet')?.scrollIntoView({behavior:'smooth'}), 0); return; }
    if (target.closest('[data-add]')) {
      documentForm.items.push({ productId: '', description: '', quantity: 1, unit: '', unitPrice: 0, discount: 0 });
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
    if (target.matches('[data-document-search]')) {
      documentQuery = target.value;
      scheduleRender();
      return;
    }
    if (target.matches('[data-payment-search]')) {
      paymentQuery = target.value;
      scheduleRender();
      return;
    }
    if (target.matches('[data-payment-field]')) {
      paymentForm[target.dataset.paymentField] = target.type === 'number' ? target.value : target.value;
      paymentErrors = { ...paymentErrors, [target.dataset.paymentField]: '' };
      return;
    }
    if (target.matches('[data-prefix-field]')) {
      documentStore.prefixes[target.dataset.prefixField] = target.value.trim().toUpperCase();
      saveDocumentStore();
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
      documentForm[target.dataset.documentField] = target.type === 'number' ? Number(target.value) : target.value;
      documentErrors = { ...documentErrors, [target.dataset.documentField]: '' };
      updateDocumentTotals();
      return;
    }
    if (target.matches('[data-item]')) {
      const item = documentForm.items[Number(target.dataset.item)];
      if (!item) return;
      item[target.dataset.key] = target.type === 'number' ? Number(target.value) : target.value;
      if (target.dataset.key === 'productId') {
        const product = products.find(p => String(p.id) === String(target.value));
        if (product) Object.assign(item, { description: product.name, unit: product.unit, unitPrice: product.price });
        renderPreservingInteraction();
        return;
      }
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
    if (target.matches('[data-document-status-filter]')) { documentStatusFilter = target.value; render(); return; }
    if (target.matches('[data-document-sort]')) { documentSort = target.value; render(); return; }
    if (target.matches('[data-payment-method-filter]')) { paymentMethodFilter = target.value; render(); return; }
    if (target.matches('[data-payment-status-filter]')) { paymentStatusFilter = target.value; render(); return; }
    if (target.matches('[data-payment-date-filter]')) { paymentDateFilter = target.value; render(); return; }
    if (target.matches('[data-payment-customer-filter]')) { paymentCustomerFilter = target.value; render(); return; }
    if (target.matches('[data-payment-field]')) { paymentForm[target.dataset.paymentField] = target.value; return; }
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
      documentForm[target.dataset.documentField] = target.type === 'number' ? Number(target.value) : target.value;
      if (target.dataset.documentField === 'customerId') {
        documentForm.customerSnapshot = snapshotCustomer(customers.find(c => String(c.id) === String(target.value)));
      }
      updateDocumentTotals();
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
    if (form.matches('[data-payment-form]')) {
      e.preventDefault();
      savePayment();
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
