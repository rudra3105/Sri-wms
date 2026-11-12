import { State, Product, Order, OLine, Task, TaskLine, Inward, InLine, StockRec, Gate, Dispatch, Invoice, InvLine, Pkg, Ret, Role } from './types';
import { now, dayStart, round2, pad, DAY, addDays } from './util';
import * as C from './core';
import { fail, nextNo, nextId, audit, notify, mv, prod, prodOrFail, cust, sup, whOf, stockOf, orderOf, avail, isExpired, binParts, canStore, suggestBin, requestApproval, priceFor, calcOrder, outstanding, parseCode, qrK, actorName, actorEmp, fyOf, cleanupStock, canApprove, me } from './core';

const int = (v: any, name: string, min = 0) => { const n = Number(v); if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) fail(`${name} must be a whole number ≥ ${min}`); return n; };
const hist = (o: Order, status: string, d: State, note?: string) => { o.history.push({ at: now(), status, by: actorName(d), note }); };

/* =========================================================
   PRODUCTS
   ========================================================= */
export function saveProduct(d: State, i: Partial<Product>, isNew: boolean): string {
  const name = (i.name || '').trim(); const sku = (i.sku || '').trim().toUpperCase();
  if (!name) fail('Product name is required'); if (!sku) fail('SKU is required');
  if (!i.uom) fail('Unit of measurement is required');
  if (!(Number(i.price) > 0)) fail('Standard sales price must be greater than 0');
  if (!(Number(i.cost) >= 0)) fail('Purchase price is required');
  if (!i.cat) fail('Select a category');
  if (isNew && d.products.some(p => p.sku === sku)) fail(`SKU ${sku} already exists`);
  if (i.barcode && d.products.some(p => p.barcode === i.barcode && p.sku !== sku)) fail('Barcode already used by another product');
  if (i.min != null && i.max != null && Number(i.max) < Number(i.min)) fail('Maximum stock must be ≥ minimum stock');
  const base: Product = {
    id: 'P' + pad(d.products.length + 1, 4), sku, name, cat: i.cat!, sub: i.sub || '', brand: i.brand || 'Sri Select', mfr: i.mfr || '', hsn: i.hsn || '9999', uom: i.uom!, purUom: i.purUom || i.uom!, salesUom: i.salesUom || i.uom!, conv: i.conv || 1,
    barcode: i.barcode || sku, gtin: i.gtin || '', desc: i.desc || '', weight: Number(i.weight) || 1, dims: i.dims || '30x20x20 cm', pack: i.pack || '', min: Number(i.min) || 0, max: Number(i.max) || 1000, rop: Number(i.rop) || 0, roq: Number(i.roq) || 0,
    cost: Number(i.cost) || 0, price: Number(i.price), tax: i.tax ?? 18, storage: i.storage || 'ambient', tracking: i.tracking || 'none', expiry: !!i.expiry, fragile: !!i.fragile, perishable: !!i.perishable, hazmat: i.storage === 'hazmat' || !!i.hazmat,
    slot: Number(i.slot) || 1, status: i.status || 'Active', color: i.color || ['#0f766e', '#c2410c', '#1d4ed8', '#7c3aed', '#be123c', '#4d7c0f', '#0369a1', '#a16207'][d.products.length % 8], createdAt: now(),
  };
  if (isNew) { d.products.push(base); audit(d, 'Product created', 'Product', sku, { next: `${name} @ ₹${base.price}` }); notify(d, 'New product added', `${sku} – ${name}`, 'info', 'products'); }
  else { const p = prodOrFail(d, sku); const prev = `₹${p.price}/${p.status}`; Object.assign(p, i, { sku, name }); audit(d, 'Product updated', 'Product', sku, { prev, next: `₹${p.price}/${p.status}` }); }
  return sku;
}

/* =========================================================
   INBOUND: PO -> ASN -> gate entry -> scan -> QC -> GRN -> putaway
   ========================================================= */
export function createInward(d: State, i: { poId?: string | null; supplierId?: string; wh: string; vehicle: string; driver: string; driverPhone?: string; invoiceRef?: string }): string {
  if (!i.vehicle?.trim()) fail('Vehicle number is required'); if (!i.driver?.trim()) fail('Driver name is required');
  if (!whOf(d, i.wh)) fail('Select a warehouse');
  let supplierId = i.supplierId || ''; const lines: InLine[] = []; const id = nextId(d, 'IN');
  const mk = (sku: string, expected: number): InLine => ({ id: `${id}-${lines.length + 1}`, sku, expected, received: 0, damaged: 0, rejected: 0, quarantine: 0, batch: '', mfg: null, exp: null, remarks: '', scanned: false, checklist: {}, condition: 'Good', pkgCond: 'Intact', photo: false, qc: 'Pending Inspection', scans: 0 });
  if (i.poId) {
    const po = d.pos.find(p => p.id === i.poId) ?? fail('PO not found');
    if (!['Approved', 'Sent', 'Partially Received'].includes(po.status)) fail(`PO ${po.no} is "${po.status}" – only approved POs can be received`);
    supplierId = po.supplierId; po.lines.forEach(l => { if (l.qty - l.received > 0) lines.push(mk(l.sku, l.qty - l.received)); });
    if (!lines.length) fail('Nothing pending on this PO');
  } else if (!supplierId) fail('Select a supplier');
  d.inwards.push({ id, no: nextNo(d, 'in', 'GE-'), grnNo: null, poId: i.poId || null, supplierId, wh: i.wh, vehicle: i.vehicle.trim().toUpperCase(), driver: i.driver.trim(), driverPhone: i.driverPhone || '', arrival: now(), invoiceRef: i.invoiceRef || '', status: 'Scanning', lines, operator: actorName(d), gate: 'Gate 1' });
  audit(d, 'Gate entry / receiving started', 'Inward', id, { next: `${i.vehicle} · ${i.driver}` });
  notify(d, 'Vehicle arrived', `${i.vehicle} at ${whOf(d, i.wh)?.code} – unloading`, 'info', 'inward', ['receiving', 'whmanager']);
  return id;
}
export function scanInward(d: State, inId: string, raw: string) {
  const inw = d.inwards.find(x => x.id === inId) ?? fail('Receiving not found');
  const rec = (result: string) => d.scans.push({ at: now(), code: raw, ctx: `Inward ${inw.no}`, result, by: actorName(d) });
  if (inw.status !== 'Scanning') return { ok: false, code: 'LOCKED', sev: 'red', msg: `Receiving is ${inw.status} – scanning locked` };
  const pc = parseCode(raw);
  if (pc.kind === 'INVALID') { rec('INVALID_QR'); return { ok: false, code: 'INVALID_QR', sev: 'red', msg: 'Invalid QR – not an SRI WMS code' }; }
  if (pc.kind !== 'P') { rec('WRONG_TYPE'); return { ok: false, code: 'WRONG_TYPE', sev: 'red', msg: 'This is a location/package code – scan a product QR' }; }
  const p = d.products.find(x => x.sku === pc.value || x.barcode === pc.value);
  if (!p) { rec('UNKNOWN_SKU'); return { ok: false, code: 'UNKNOWN_SKU', sev: 'red', msg: `Unknown SKU ${pc.value} – not in product master` }; }
  let l = inw.lines.find(x => x.sku === p.sku);
  if (!l) {
    if (inw.poId) { rec('NOT_ON_PO'); return { ok: false, code: 'NOT_ON_PO', sev: 'red', msg: `${p.sku} is not on the purchase order` }; }
    l = { id: `${inw.id}-${inw.lines.length + 1}`, sku: p.sku, expected: 0, received: 0, damaged: 0, rejected: 0, quarantine: 0, batch: '', mfg: null, exp: null, remarks: '', scanned: false, checklist: {}, condition: 'Good', pkgCond: 'Intact', photo: false, qc: 'Pending Inspection', scans: 0 };
    inw.lines.push(l);
  }
  l.scans += 1;
  if (l.scanned && l.received > 0) { rec('DUPLICATE'); return { ok: true, code: 'DUPLICATE', sev: 'amber', lineId: l.id, msg: `Duplicate scan – ${p.sku} already recorded (${l.received} ${p.uom}). Edit the quantity if needed.` }; }
  rec('OK'); return { ok: true, code: 'OK', sev: 'green', lineId: l.id, msg: `Scan successful – ${p.name}` };
}
export function recordLine(d: State, inId: string, lineId: string, patch: Partial<InLine>) {
  const inw = d.inwards.find(x => x.id === inId) ?? fail('Receiving not found');
  if (inw.status !== 'Scanning') fail(`Receiving is ${inw.status} – locked`);
  const l = inw.lines.find(x => x.id === lineId) ?? fail('Line not found'); const p = prodOrFail(d, l.sku);
  const received = int(patch.received ?? l.received, 'Received qty'), damaged = int(patch.damaged ?? l.damaged, 'Damaged qty'), rejected = int(patch.rejected ?? l.rejected, 'Rejected qty'), quarantine = int(patch.quarantine ?? l.quarantine, 'Quarantine qty');
  if (received <= 0) fail('Enter the received quantity');
  if (damaged + rejected + quarantine > received) fail('Damaged + rejected + quarantined cannot exceed received quantity');
  const batch = (patch.batch ?? l.batch).trim(); const mfg = patch.mfg === undefined ? l.mfg : patch.mfg; const exp = patch.exp === undefined ? l.exp : patch.exp;
  if (p.tracking !== 'none' && !batch) fail(`${p.sku}: batch number is required`);
  if (p.expiry) {
    if (!mfg) fail(`${p.sku}: manufacturing date is required`); if (!exp) fail(`${p.sku}: expiry date is required`);
    if (exp <= mfg) fail('Expiry date must be after manufacturing date');
    if (exp < dayStart(now()) && received - rejected > 0) fail(`${p.sku}: product is already expired – reject the full quantity`);
  }
  const accepted = received - damaged - rejected - quarantine;
  let qc = patch.qc ?? (rejected === received ? 'Rejected' : quarantine > 0 ? 'Quarantined' : 'Approved');
  if (patch.qc === 'Pending Inspection') qc = rejected === received ? 'Rejected' : quarantine > 0 ? 'Quarantined' : 'Approved';
  Object.assign(l, { ...patch, received, damaged, rejected, quarantine, batch, mfg, exp, qc, scanned: true });
  if (accepted < 0) fail('Quantities do not reconcile');
  return accepted;
}
export function addInwardLine(d: State, inId: string, sku: string) {
  const inw = d.inwards.find(x => x.id === inId) ?? fail('Receiving not found'); if (inw.poId) fail('Lines on a PO receipt come from the PO');
  prodOrFail(d, sku); if (inw.lines.some(l => l.sku === sku)) fail('Line already exists');
  inw.lines.push({ id: `${inw.id}-${inw.lines.length + 1}`, sku, expected: 0, received: 0, damaged: 0, rejected: 0, quarantine: 0, batch: '', mfg: null, exp: null, remarks: '', scanned: false, checklist: {}, condition: 'Good', pkgCond: 'Intact', photo: false, qc: 'Pending Inspection', scans: 0 });
}
export function submitInward(d: State, inId: string): { grnNo: string; auto: boolean } {
  const inw = d.inwards.find(x => x.id === inId) ?? fail('Receiving not found');
  if (inw.status !== 'Scanning') fail('Already submitted');
  const done = inw.lines.filter(l => l.scanned && l.received > 0); if (!done.length) fail('Scan and record at least one product before generating the GRN');
  if (done.some(l => l.qc === 'Re-inspection Required')) fail('A line requires re-inspection – complete inspection first');
  inw.lines = inw.lines.filter(l => l.scanned || l.expected > 0);
  inw.grnNo = nextNo(d, 'grn', 'GRN-'); inw.status = 'Pending Approval'; inw.receivedAt = now();
  audit(d, 'GRN generated', 'GRN', inw.grnNo, { next: `${done.length} line(s)` });
  const rule = d.approvalRules.grn;
  if (rule && !rule.required) { finalizeInward(d, inId); return { grnNo: inw.grnNo, auto: true }; }
  requestApproval(d, { type: 'grn', ref: inw.grnNo, payload: { inId }, reason: `GRN for ${inw.vehicle} (${done.reduce((a, l) => a + l.received, 0)} units)` });
  notify(d, 'New GRN awaiting approval', `${inw.grnNo} – ${whOf(d, inw.wh)?.code}`, 'warning', 'inward', ['whmanager']);
  return { grnNo: inw.grnNo, auto: false };
}
export function finalizeInward(d: State, inId: string) {
  const inw = d.inwards.find(x => x.id === inId) ?? fail('Receiving not found'); if (inw.status !== 'Pending Approval') fail(`GRN is ${inw.status}`);
  const po = inw.poId ? d.pos.find(p => p.id === inw.poId) : null; let invAmt = 0;
  for (const l of inw.lines.filter(x => x.scanned && x.received > 0)) {
    const p = prodOrFail(d, l.sku); const accepted = l.received - l.damaged - l.rejected - l.quarantine;
    const add = (status: StockRec['status'], qty: number) => { if (qty <= 0) return ''; const id = nextId(d, 'S'); d.stock.push({ id, sku: l.sku, batch: l.batch || 'NA', mfg: l.mfg, exp: l.exp, wh: inw.wh, bin: null, qty, reserved: 0, picked: 0, status, receivedAt: now(), lastMove: now(), ref: inw.grnNo! }); return id; };
    const sid = add('Received', accepted);
    if (l.damaged) { add('Damaged', l.damaged); mv(d, { type: 'DAMAGE', sku: l.sku, qty: l.damaged, delta: l.damaged, wh: inw.wh, to: 'QC-DAMAGED', batch: l.batch, ref: inw.grnNo!, reason: 'Damaged on receipt' }); }
    if (l.quarantine) { add('Quarantine', l.quarantine); mv(d, { type: 'QUARANTINE', sku: l.sku, qty: l.quarantine, delta: l.quarantine, wh: inw.wh, to: 'QC-QUARANTINE', batch: l.batch, ref: inw.grnNo!, reason: 'Quarantined on inspection' }); }
    if (l.rejected) mv(d, { type: 'REJECT', sku: l.sku, qty: l.rejected, delta: 0, wh: inw.wh, batch: l.batch, ref: inw.grnNo!, reason: 'Rejected – returned to supplier' });
    if (accepted > 0) {
      mv(d, { type: 'GRN', sku: l.sku, qty: accepted, delta: accepted, wh: inw.wh, to: 'DOCK', batch: l.batch, ref: inw.grnNo! });
      const sg = suggestBin(d, p, accepted, inw.wh);
      const tid = nextId(d, 'T');
      d.tasks.push({ id: tid, no: nextNo(d, 'pa', 'PA-'), type: 'putaway', grnId: inw.id, wh: inw.wh, status: 'Unassigned', priority: 'Normal', lines: [{ sku: l.sku, batch: l.batch || 'NA', exp: l.exp, qty: accepted, picked: 0, status: 'Pending', stockId: sid, bin: null, destBin: sg?.bin, suggested: sg?.bin, reason: sg?.reason ?? 'No compatible location free – choose manually' }], wrongScans: 0, createdAt: now(), mode: 'Single' });
      notify(d, 'Putaway task created', `${accepted} × ${p.name} awaiting assignment (${sg?.bin ?? 'manual'})`, 'info', 'putaway', ['whmanager', 'supervisor', 'putaway']);
    }
    if (po) { const pl = po.lines.find(x => x.sku === l.sku); if (pl) pl.received += l.received - l.rejected; }
    invAmt += (l.received - l.rejected) * (po?.lines.find(x => x.sku === l.sku)?.rate ?? p.cost) * (1 + p.tax / 100);
  }
  if (po) { po.status = po.lines.every(l => l.received >= l.qty) ? 'Received' : 'Partially Received'; }
  inw.status = 'Approved'; inw.approvedBy = actorName(d); inw.approvedAt = now();
  if (invAmt > 0) { const sid = nextId(d, 'SI'); d.supInvs.push({ id: sid, no: nextNo(d, 'si', 'SINV-'), supplierId: inw.supplierId, poId: inw.poId || '', grnId: inw.id, ref: inw.invoiceRef || '—', amount: round2(invAmt), date: now(), due: addDays(now(), sup(d, inw.supplierId)?.terms ?? 30), status: 'Unpaid' }); }
  audit(d, 'GRN approved – stock updated', 'GRN', inw.grnNo!, { next: `${inw.lines.reduce((a, l) => a + l.received, 0)} units received` });
  notify(d, 'GRN approved', `${inw.grnNo} posted to inventory`, 'success', 'inward');
}
export function rejectInward(d: State, inId: string, reason: string) {
  const inw = d.inwards.find(x => x.id === inId) ?? fail('Receiving not found'); if (inw.status !== 'Pending Approval') fail(`GRN is ${inw.status}`);
  if (!reason?.trim()) fail('Reason is required'); inw.status = 'Rejected'; inw.remarks = reason;
  audit(d, 'GRN rejected', 'GRN', inw.grnNo!, { reason }); notify(d, 'GRN rejected', `${inw.grnNo}: ${reason}`, 'critical', 'inward');
}

/* ---------- QC on held stock ---------- */
export function qcDecision(d: State, stockId: string, decision: 'Release' | 'Reject' | 'Reinspect', note: string) {
  const s = stockOf(d, stockId) ?? fail('Stock not found'); if (!['Quarantine', 'Damaged', 'Returned'].includes(s.status)) fail('Only quarantined/damaged stock can be reviewed');
  if (!note?.trim()) fail('Remarks are required');
  if (decision === 'Reinspect') { audit(d, 'Re-inspection requested', 'Stock', s.id, { reason: note }); return 'Re-inspection requested'; }
  if (decision === 'Reject') { const id = requestApproval(d, { type: 'qc_reject', ref: `${s.sku}/${s.batch}`, payload: { stockId }, reason: note, prev: `${s.qty} ${s.status}`, next: 'Removed (reject)' }); return id; }
  if (s.status === 'Damaged') fail('Damaged stock cannot be released – write it off or return to supplier');
  const p = prodOrFail(d, s.sku); s.status = 'Received'; s.lastMove = now();
  const sg = suggestBin(d, p, s.qty, s.wh);
  d.tasks.push({ id: nextId(d, 'T'), no: nextNo(d, 'pa', 'PA-'), type: 'putaway', grnId: s.ref, wh: s.wh, status: 'Unassigned', priority: 'Normal', lines: [{ sku: s.sku, batch: s.batch, exp: s.exp, qty: s.qty, picked: 0, status: 'Pending', stockId: s.id, bin: null, destBin: sg?.bin, suggested: sg?.bin, reason: sg?.reason ?? 'Choose manually' }], wrongScans: 0, createdAt: now(), mode: 'Single' });
  audit(d, 'QC released – awaiting putaway', 'Stock', s.id, { prev: 'Quarantine', next: 'Received', reason: note });
  return 'Released to putaway';
}
function applyQcReject(d: State, stockId: string) {
  const s = stockOf(d, stockId); if (!s) return; mv(d, { type: 'QC_REJECT', sku: s.sku, qty: s.qty, delta: -s.qty, wh: s.wh, batch: s.batch, reason: 'QC rejected – returned to supplier/disposed' }); s.qty = 0; cleanupStock(d);
}

/* =========================================================
   PUTAWAY
   ========================================================= */
export function assignTask(d: State, taskId: string, a: { empId: string; deadlineMin: number; priority?: Task['priority']; destBin?: string; mode?: string }) {
  const t = d.tasks.find(x => x.id === taskId) ?? fail('Task not found');
  if (!['Unassigned', 'Assigned'].includes(t.status)) fail(`Task is ${t.status} – cannot reassign`);
  const e = d.employees.find(x => x.id === a.empId) ?? fail('Select an employee'); if (e.status !== 'Active') fail('Employee is inactive');
  const mins = Number(a.deadlineMin); if (!(mins > 0)) fail('Set a deadline in minutes');
  if (t.type === 'putaway' && a.destBin) {
    const l = t.lines[0]; const err = canStore(d, prodOrFail(d, l.sku), a.destBin, l.qty, l.stockId); if (err) fail(err); l.destBin = a.destBin;
  }
  if (t.type === 'putaway' && !t.lines[0].destBin) fail('Choose a destination location first');
  t.assignee = e.id; t.assignedBy = actorName(d); t.assignedAt = now(); t.deadline = now() + mins * 60000; t.status = 'Assigned'; if (a.priority) t.priority = a.priority; if (a.mode) t.mode = a.mode;
  if (t.type === 'pick' && t.orderId) { const o = orderOf(d, t.orderId); if (o.status === 'Reserved') { o.status = 'Picking'; hist(o, 'Picking', d, `Assigned to ${e.name}`); } }
  audit(d, `${t.type === 'pick' ? 'Picking' : 'Putaway'} task assigned`, 'Task', t.no, { next: `${e.name} · ${mins} min` });
  notify(d, `${t.type === 'pick' ? 'Picking' : 'Putaway'} assignment`, `${t.no} → ${e.name}, due in ${mins} min`, 'info', t.type === 'pick' ? 'picking' : 'putaway', [e.role, 'supervisor']);
}
export function startTask(d: State, taskId: string) { const t = d.tasks.find(x => x.id === taskId) ?? fail('Task not found'); if (t.status === 'Assigned') { t.status = 'In Progress'; t.startedAt = now(); } }
const scanLog = (d: State, code: string, ctx: string, result: string) => d.scans.push({ at: now(), code, ctx, result, by: actorName(d) });
function checkEmp(d: State, t: Task) {
  const role = C.actorRole(d); const emp = actorEmp(d);
  if (['picker', 'putaway', 'packer'].includes(role) && t.assignee !== emp) fail('This task is assigned to another employee');
}
export function completePutaway(d: State, taskId: string, sc: { product: string; location: string }) {
  const t = d.tasks.find(x => x.id === taskId) ?? fail('Task not found'); if (t.type !== 'putaway') fail('Not a putaway task');
  if (!['Assigned', 'In Progress'].includes(t.status)) return { ok: false, msg: `Task is ${t.status} – it must be assigned first` };
  checkEmp(d, t); const l = t.lines[0]; const s = stockOf(d, l.stockId) ?? fail('Staged stock not found'); const p = prodOrFail(d, l.sku); const dest = l.destBin!;
  startTask(d, taskId);
  const pc = parseCode(sc.product);
  if (pc.kind === 'INVALID') { t.wrongScans++; scanLog(d, sc.product, t.no, 'INVALID_QR'); return { ok: false, msg: 'Invalid product QR' }; }
  if (pc.kind !== 'P' || pc.value !== l.sku) { t.wrongScans++; scanLog(d, sc.product, t.no, 'WRONG_PRODUCT'); return { ok: false, msg: `Wrong product scanned. Expected ${l.sku}` }; }
  const lc = parseCode(sc.location); const dp = binParts(dest);
  if (lc.kind === 'INVALID') { t.wrongScans++; return { ok: false, msg: 'Invalid location QR' }; }
  if (!((lc.kind === 'L' && lc.value === dest) || (lc.kind === 'R' && lc.value === dp.rack))) { t.wrongScans++; scanLog(d, sc.location, t.no, 'WRONG_LOCATION'); return { ok: false, msg: `Wrong destination. Expected rack ${dp.rack} / shelf ${pad(dp.shelf, 2)} / bin ${pad(dp.bin, 2)}` }; }
  const err = canStore(d, p, dest, l.qty, s.id); if (err) return { ok: false, msg: err };
  const twin = d.stock.find(x => x.id !== s.id && x.sku === s.sku && x.batch === s.batch && x.bin === dest && x.status === 'Available');
  if (twin) { twin.qty += s.qty; twin.lastMove = now(); s.qty = 0; cleanupStock(d); } else { s.bin = dest; s.status = 'Available'; s.lastMove = now(); }
  mv(d, { type: 'PUTAWAY', sku: l.sku, qty: l.qty, delta: 0, wh: s.wh, from: 'DOCK', to: dest, batch: l.batch, ref: t.no });
  l.picked = l.qty; l.status = 'Done'; l.bin = dest; t.status = 'Completed'; t.completedAt = now();
  audit(d, 'Putaway completed', 'Task', t.no, { next: `${l.qty} × ${l.sku} → ${dest}` });
  notify(d, 'Putaway complete', `${l.qty} × ${p.name} stored at ${dest}`, 'success', 'putaway');
  return { ok: true, msg: `Stored ${l.qty} × ${p.name} at ${dest}`, bin: dest };
}

/* =========================================================
   ORDERS
   ========================================================= */
export function createOrder(d: State, i: { id?: string; customerId: string; wh: string; lines: { sku: string; qty: number; discPct?: number }[]; freight?: number; packing?: number; deliveryDate?: number | null; priority?: string; instructions?: string; source?: 'Internal' | 'Portal'; allowBackorder?: boolean }): string {
  const c = cust(d, i.customerId) ?? fail('Select a customer'); if (c.status === 'Inactive') fail('Customer is inactive');
  if (!whOf(d, i.wh)) fail('Select a warehouse'); if (!i.lines.length) fail('Add at least one product');
  const merged: Record<string, { qty: number; disc: number }> = {};
  for (const l of i.lines) { prodOrFail(d, l.sku); const q = int(l.qty, `${l.sku} quantity`, 1); const m = (merged[l.sku] ||= { qty: 0, disc: 0 }); m.qty += q; m.disc = Math.max(m.disc, Number(l.discPct) || 0); if (m.disc < 0 || m.disc > 90) fail('Discount must be between 0 and 90%'); }
  const lines: OLine[] = Object.entries(merged).map(([sku, m]) => { const p = prodOrFail(d, sku); if (p.status !== 'Active') fail(`${sku} is inactive`); const pr = priceFor(d, i.customerId, sku, m.qty); return { sku, qty: m.qty, rate: pr.rate, source: pr.source, discPct: m.disc, tax: p.tax, reserved: 0, picked: 0, packed: 0, shipped: 0, backorder: 0, alloc: [] }; });
  const fields = { customerId: i.customerId, wh: i.wh, lines, freight: Number(i.freight) || 0, packing: Number(i.packing) || 0, deliveryDate: i.deliveryDate ?? null, priority: i.priority || 'Normal', instructions: i.instructions || '', allowBackorder: !!i.allowBackorder };
  if (i.id) { const o = orderOf(d, i.id); if (o.status !== 'Draft') fail('Only draft orders can be modified'); const prev = o.total; Object.assign(o, fields); calcOrder(d, o); audit(d, 'Order modified', 'Order', o.no, { prev, next: o.total }); return o.id; }
  const o: Order = { id: nextId(d, 'O'), no: nextNo(d, 'so', d.settings.soPrefix), status: 'Draft', ...fields, subtotal: 0, taxTotal: 0, total: 0, createdAt: now(), createdBy: actorName(d), source: i.source || 'Internal', history: [], dispatchIds: [], invoiceIds: [], pkgIds: [] };
  calcOrder(d, o); hist(o, 'Draft', d); d.orders.push(o); audit(d, 'Order created', 'Order', o.no, { next: `${c.name} · ₹${o.total}` });
  notify(d, i.source === 'Portal' ? 'New portal order' : 'Order drafted', `${o.no} – ${c.name} (₹${o.total.toLocaleString('en-IN')})`, 'info', 'orders', ['sales', 'whmanager']);
  return o.id;
}
export const syncLines = (o: Order) => o.lines.forEach(l => { l.reserved = l.alloc.reduce((a, x) => a + x.qty, 0); l.picked = l.alloc.reduce((a, x) => a + x.picked, 0); l.backorder = Math.max(0, l.qty - l.shipped - l.reserved); });
function sortRoute(d: State, rows: { bin: string | null }[]) { return rows.sort((a, b) => (a.bin || '~').localeCompare(b.bin || '~')); }
function allocate(d: State, o: Order) {
  const policy = d.settings.alloc;
  for (const l of o.lines) {
    let need = l.qty - l.shipped - l.alloc.reduce((a, x) => a + x.qty, 0); if (need <= 0) continue; const p = prodOrFail(d, l.sku);
    const cands = d.stock.filter(s => s.sku === l.sku && s.wh === o.wh && avail(s) > 0);
    cands.sort((a, b) => policy === 'LIFO' ? b.receivedAt - a.receivedAt : (p.expiry && policy === 'FEFO' ? (a.exp ?? 9e15) - (b.exp ?? 9e15) || a.receivedAt - b.receivedAt : a.receivedAt - b.receivedAt));
    for (const s of cands) {
      if (need <= 0) break; const take = Math.min(need, avail(s)); if (take <= 0) continue;
      s.reserved += take; need -= take; const ex = l.alloc.find(x => x.stockId === s.id); if (ex) ex.qty += take; else l.alloc.push({ stockId: s.id, qty: take, picked: 0 });
      l.resv = (l.resv || 0) + take; mv(d, { type: 'RESERVE', sku: l.sku, qty: take, delta: 0, wh: o.wh, from: s.bin, batch: s.batch, ref: o.no });
    }
    if (need > 0 && !o.allowBackorder) fail(`Insufficient stock for ${l.sku} – short by ${need} ${p.uom}. Enable partial/backorder to continue.`);
  }
  syncLines(o);
}
function buildPickTask(d: State, o: Order) {
  const lines: TaskLine[] = [];
  o.lines.forEach((l, li) => l.alloc.forEach((a, ai) => { if (a.picked > 0 || a.qty <= 0) return; const s = stockOf(d, a.stockId)!; lines.push({ sku: l.sku, batch: s.batch, exp: s.exp, qty: a.qty, picked: 0, status: 'Pending', stockId: s.id, bin: s.bin, li, ai }); }));
  if (!lines.length) return; sortRoute(d, lines);
  const pr = ({ Low: 'Low', Normal: 'Normal', High: 'High', Urgent: 'Urgent' } as any)[o.priority] || 'Normal';
  const id = nextId(d, 'T'); d.tasks.push({ id, no: nextNo(d, 'pk', 'PK-'), type: 'pick', orderId: o.id, wh: o.wh, status: 'Unassigned', priority: pr, lines, wrongScans: 0, createdAt: now(), mode: 'Single' }); o.taskId = id;
  notify(d, 'Picking task created', `${o.no} – ${lines.length} line(s) ready to assign`, 'info', 'picking', ['supervisor', 'whmanager']);
}
export function confirmOrder(d: State, id: string): { pending?: boolean; msg?: string } {
  const o = orderOf(d, id); const c = cust(d, o.customerId)!;
  if (!['Draft', 'On Hold'].includes(o.status)) fail(`Order is ${o.status}`);
  if (c.status !== 'Active') fail(`Customer is ${c.status}`);
  const maxDisc = Math.max(0, ...o.lines.map(l => l.discPct));
  if (maxDisc > d.settings.discountApprovalPct && !o.discountApproved) {
    requestApproval(d, { type: 'discount', ref: o.no, payload: { orderId: o.id }, reason: `Special discount ${maxDisc}% exceeds ${d.settings.discountApprovalPct}% limit`, next: `${maxDisc}%` });
    o.prevStatus = o.status; o.status = 'On Hold'; o.hold = { reason: 'Awaiting discount approval', type: 'discount' }; hist(o, 'On Hold', d, 'Discount approval'); return { pending: true, msg: 'Discount approval requested – order on hold' };
  }
  const exposure = outstanding(d, c.id) + o.total;
  if (exposure > c.creditLimit && !o.creditApproved) {
    requestApproval(d, { type: 'credit_override', ref: o.no, payload: { orderId: o.id }, reason: `Credit limit ₹${c.creditLimit.toLocaleString('en-IN')} exceeded (exposure ₹${Math.round(exposure).toLocaleString('en-IN')})`, prev: String(c.creditLimit), next: String(Math.round(exposure)) });
    o.prevStatus = o.status; o.status = 'On Hold'; o.hold = { reason: 'Awaiting credit-limit override', type: 'credit' }; hist(o, 'On Hold', d, 'Credit limit'); return { pending: true, msg: 'Credit limit exceeded – override requested, order on hold' };
  }
  o.hold = null; hist(o, 'Confirmed', d); allocate(d, o);
  const any = o.lines.some(l => l.reserved > 0); o.partial = o.lines.some(l => l.backorder > 0);
  if (any) { o.status = 'Reserved'; hist(o, 'Reserved', d, o.partial ? 'Partial reservation – backorder created' : 'Stock reserved'); buildPickTask(d, o); } else { o.status = 'Confirmed'; hist(o, 'Confirmed', d, 'Backordered – no stock'); }
  audit(d, 'Order confirmed – stock reserved', 'Order', o.no, { next: o.lines.map(l => `${l.sku}×${l.reserved}`).join(', ') });
  notify(d, 'Order confirmed', `${o.no} reserved${o.partial ? ' (partial)' : ''}`, 'success', 'orders'); return { msg: `Order ${o.no} confirmed${o.partial ? ' with backorder' : ''}` };
}
export function releaseAlloc(d: State, o: Order) {
  for (const l of o.lines) { for (const a of l.alloc) { const s = stockOf(d, a.stockId); if (s) { s.reserved -= a.qty - a.picked; s.picked -= a.picked; if (s.reserved < 0) s.reserved = 0; if (s.picked < 0) s.picked = 0; } } l.alloc = []; l.packed = 0; }
  syncLines(o);
}
export function reallocateOrder(d: State, id: string) {
  const o = orderOf(d, id); const t = o.taskId ? d.tasks.find(x => x.id === o.taskId) : null;
  if (!['Reserved', 'Partially Fulfilled', 'Confirmed'].includes(o.status)) fail(`Cannot re-allocate an order in "${o.status}"`);
  if (t && t.status !== 'Unassigned') fail('Picking has already been assigned – cancel or complete it first');
  if (t) { t.status = 'Cancelled'; o.taskId = undefined; } releaseAlloc(d, o); allocate(d, o);
  o.partial = o.lines.some(l => l.backorder > 0); if (o.lines.some(l => l.reserved > 0)) { o.status = 'Reserved'; buildPickTask(d, o); hist(o, 'Reserved', d, 'Re-allocated'); }
  audit(d, 'Order re-allocated', 'Order', o.no);
}
export function holdOrder(d: State, id: string, reason: string) { const o = orderOf(d, id); if (!reason?.trim()) fail('Reason required'); if (['Dispatched', 'Delivered', 'Cancelled', 'On Hold'].includes(o.status)) fail(`Cannot hold – ${o.status}`); o.prevStatus = o.status; o.status = 'On Hold'; o.hold = { reason, type: 'manual' }; hist(o, 'On Hold', d, reason); audit(d, 'Order held', 'Order', o.no, { reason }); }
export function resumeOrder(d: State, id: string) { const o = orderOf(d, id); if (o.status !== 'On Hold') fail('Order is not on hold'); if (o.hold?.type !== 'manual') fail('This hold is released through approval'); o.status = o.prevStatus || 'Draft'; o.hold = null; hist(o, o.status, d, 'Resumed'); }
export function duplicateOrder(d: State, id: string) { const o = orderOf(d, id); return createOrder(d, { customerId: o.customerId, wh: o.wh, lines: o.lines.map(l => ({ sku: l.sku, qty: l.qty, discPct: l.discPct })), freight: o.freight, packing: o.packing, priority: o.priority, instructions: o.instructions }); }
export function cancelOrder(d: State, id: string, reason: string): { pending?: boolean } {
  const o = orderOf(d, id); if (!reason?.trim()) fail('Cancellation reason is required');
  if (['Dispatched', 'Delivered', 'Cancelled', 'Partially Fulfilled'].includes(o.status)) fail(`Cannot cancel – order is ${o.status}`);
  if (['Draft', 'Confirmed', 'Reserved', 'On Hold'].includes(o.status)) { doCancel(d, o, reason); return {}; }
  requestApproval(d, { type: 'order_cancel', ref: o.no, payload: { orderId: id, reason }, reason, prev: o.status, next: 'Cancelled' }); return { pending: true };
}
function doCancel(d: State, o: Order, reason: string) {
  releaseAlloc(d, o); d.tasks.filter(t => t.orderId === o.id && !['Completed', 'Short Completed'].includes(t.status)).forEach(t => (t.status = 'Cancelled'));
  const g = d.gates.find(x => x.orderId === o.id && x.status !== 'Dispatched'); if (g) g.status = 'Blocked';
  const prev = o.status; o.status = 'Cancelled'; o.hold = null; hist(o, 'Cancelled', d, reason); audit(d, 'Order cancelled', 'Order', o.no, { prev, next: 'Cancelled', reason }); notify(d, 'Order cancelled', `${o.no}: ${reason}`, 'warning', 'orders');
}

/* =========================================================
   PICKING
   ========================================================= */
export function pickLine(d: State, taskId: string, idx: number, x: { product: string; location: string; qty: number; reason?: string }) {
  const t = d.tasks.find(y => y.id === taskId) ?? fail('Task not found'); if (t.type !== 'pick') fail('Not a picking task');
  if (!['Assigned', 'In Progress'].includes(t.status)) return { ok: false, msg: `Task is ${t.status} – a supervisor must assign it first` };
  checkEmp(d, t); const l = t.lines[idx] ?? fail('Line not found'); if (l.status !== 'Pending') return { ok: false, msg: 'Line already processed' };
  startTask(d, taskId); const o = orderOf(d, t.orderId!); const bad = (msg: string, code: string, raw: string) => { t.wrongScans++; scanLog(d, raw, t.no, code); return { ok: false, msg }; };
  const pc = parseCode(x.product); if (pc.kind === 'INVALID') return bad('Invalid QR code', 'INVALID_QR', x.product);
  if (pc.kind !== 'P' || pc.value !== l.sku) return bad(`Wrong item – expected ${l.sku}`, 'WRONG_PRODUCT', x.product);
  const lc = parseCode(x.location); if (lc.kind === 'INVALID') return bad('Invalid location QR', 'INVALID_QR', x.location);
  const dp = binParts(l.bin!); if (!((lc.kind === 'L' && lc.value === l.bin) || (lc.kind === 'R' && lc.value === dp.rack))) return bad(`Wrong location – go to ${l.bin}`, 'WRONG_LOCATION', x.location);
  const qty = Number(x.qty); if (!Number.isInteger(qty) || qty < 0) return { ok: false, msg: 'Enter a valid quantity' }; if (qty > l.qty) return { ok: false, msg: `Cannot pick more than ${l.qty}` };
  if (qty < l.qty && !(x.reason || '').trim()) return { ok: false, msg: 'Short pick – select a reason' };
  const ol = o.lines[l.li!]; const a = ol.alloc[l.ai!]; const s = stockOf(d, l.stockId)!;
  s.reserved -= a.qty; s.picked += qty; s.lastMove = now(); const shortQ = l.qty - qty; a.qty = qty; a.picked = qty; l.picked = qty; l.status = shortQ > 0 ? 'Short' : 'Done'; l.shortReason = shortQ > 0 ? x.reason : undefined;
  syncLines(o); if (shortQ > 0) { o.partial = true; mv(d, { type: 'RELEASE', sku: l.sku, qty: shortQ, delta: 0, wh: o.wh, from: l.bin, batch: l.batch, ref: o.no, reason: `Short pick: ${x.reason}` }); notify(d, 'Short pick reported', `${t.no} ${l.sku}: ${qty}/${l.qty} (${x.reason})`, 'warning', 'picking', ['supervisor']); }
  if (qty > 0) mv(d, { type: 'PICK', sku: l.sku, qty, delta: 0, wh: o.wh, from: l.bin, to: 'STAGING', batch: l.batch, ref: o.no });
  return { ok: true, msg: `Picked ${qty} × ${l.sku}${shortQ > 0 ? ` (short ${shortQ})` : ''}` };
}
export function reportDamage(d: State, taskId: string, idx: number, qty: number, note: string) {
  const t = d.tasks.find(y => y.id === taskId) ?? fail('Task not found'); const l = t.lines[idx] ?? fail('Line not found'); if (l.status !== 'Pending') fail('Line already processed');
  qty = int(qty, 'Damaged qty', 1); if (qty > l.qty) fail('More than the line quantity'); if (!note?.trim()) fail('Describe the damage');
  const o = orderOf(d, t.orderId!); const s = stockOf(d, l.stockId)!; const a = o.lines[l.li!].alloc[l.ai!];
  s.qty -= qty; s.reserved -= qty; a.qty -= qty; l.qty -= qty; l.damaged = (l.damaged || 0) + qty;
  d.stock.push({ id: nextId(d, 'S'), sku: s.sku, batch: s.batch, mfg: s.mfg, exp: s.exp, wh: s.wh, bin: null, qty, reserved: 0, picked: 0, status: 'Damaged', receivedAt: s.receivedAt, lastMove: now(), ref: t.no });
  mv(d, { type: 'DAMAGE', sku: s.sku, qty, delta: 0, wh: s.wh, from: l.bin, to: 'QC-DAMAGED', batch: s.batch, ref: t.no, reason: note });
  if (l.qty === 0) { l.status = 'Short'; l.shortReason = 'Damaged stock'; } syncLines(o); o.partial = true;
  notify(d, 'Damaged product reported', `${t.no}: ${qty} × ${s.sku} – ${note}`, 'critical', 'picking', ['supervisor', 'whmanager']);
  audit(d, 'Damage reported during picking', 'Task', t.no, { next: `${qty} × ${s.sku}`, reason: note });
}
export function requestAssist(d: State, taskId: string, msg: string) { const t = d.tasks.find(y => y.id === taskId) ?? fail('Task not found'); t.assist = msg || 'Assistance requested'; notify(d, 'Supervisor assistance requested', `${t.no}: ${t.assist}`, 'warning', 'tasks', ['supervisor', 'whmanager']); }
export function alternatives(d: State, taskId: string, idx: number) {
  const t = d.tasks.find(y => y.id === taskId); if (!t) return []; const l = t.lines[idx]; const o = orderOf(d, t.orderId!);
  return d.stock.filter(s => s.sku === l.sku && s.wh === o.wh && s.id !== l.stockId && avail(s) > 0).sort((a, b) => (a.exp ?? 9e15) - (b.exp ?? 9e15));
}
export function addAlternative(d: State, taskId: string, idx: number, stockId: string) {
  const t = d.tasks.find(y => y.id === taskId) ?? fail('Task not found'); if (['Completed', 'Short Completed', 'Cancelled'].includes(t.status)) fail('Task is closed');
  const l = t.lines[idx]; const o = orderOf(d, t.orderId!); const ol = o.lines[l.li!]; const s = stockOf(d, stockId) ?? fail('Stock not found');
  const need = ol.qty - ol.shipped - ol.reserved; if (need <= 0) fail('Nothing left to allocate'); const take = Math.min(need, avail(s)); if (take <= 0) fail('No availability at that location');
  s.reserved += take; ol.alloc.push({ stockId, qty: take, picked: 0 }); ol.resv = (ol.resv || 0) + take; syncLines(o);
  t.lines.push({ sku: l.sku, batch: s.batch, exp: s.exp, qty: take, picked: 0, status: 'Pending', stockId, bin: s.bin, li: l.li, ai: ol.alloc.length - 1 }); o.partial = o.lines.some(x => x.backorder > 0);
  mv(d, { type: 'RESERVE', sku: l.sku, qty: take, delta: 0, wh: o.wh, from: s.bin, batch: s.batch, ref: o.no, reason: 'Alternative location' }); audit(d, 'Alternative pick location added', 'Task', t.no, { next: `${take} × ${l.sku} @ ${s.bin}` });
}
export function createWave(d: State, ids: string[], empId: string, deadlineMin: number) {
  if (ids.length < 2) fail('Select at least two unassigned picking tasks'); const wave = nextNo(d, 'wave', 'WV-', 3, false);
  for (const id of ids) { const t = d.tasks.find(x => x.id === id) ?? fail('Task not found'); if (t.status !== 'Unassigned') fail(`${t.no} is already assigned`); t.wave = wave; assignTask(d, id, { empId, deadlineMin, mode: 'Wave' }); }
  return wave;
}
export function completePick(d: State, taskId: string) {
  const t = d.tasks.find(y => y.id === taskId) ?? fail('Task not found'); if (t.type !== 'pick') fail('Not a picking task');
  if (!['Assigned', 'In Progress'].includes(t.status)) fail(`Task is ${t.status}`); if (t.lines.some(l => l.status === 'Pending')) fail('Some lines are still pending – pick or mark short');
  const o = orderOf(d, t.orderId!); const short = t.lines.some(l => l.status === 'Short'); t.status = short ? 'Short Completed' : 'Completed'; t.completedAt = now(); if (!t.startedAt) t.startedAt = now();
  const picked = t.lines.reduce((a, l) => a + l.picked, 0);
  if (picked === 0) { o.prevStatus = 'Reserved'; o.status = 'On Hold'; o.hold = { reason: 'Nothing could be picked', type: 'shortage' }; hist(o, 'On Hold', d, 'Nothing picked'); }
  else { o.status = 'Picked'; hist(o, 'Picked', d, short ? 'Short pick' : undefined); notify(d, 'Picking complete', `${o.no} ready for packing`, 'success', 'packing', ['packer', 'supervisor']); }
  audit(d, 'Picking completed', 'Task', t.no, { next: `${picked} units${short ? ' (short)' : ''}` });
  if (t.deadline && now() > t.deadline) notify(d, 'Picking deadline missed', `${t.no} completed late`, 'warning', 'picking', ['supervisor']);
}

/* =========================================================
   PACKING
   ========================================================= */
export function packOrder(d: State, orderId: string, x: { packages: { type: string; weight: number; dims: string; items: { sku: string; qty: number }[]; photo?: boolean }[]; checklist: Record<string, boolean> }) {
  const o = orderOf(d, orderId); if (o.status !== 'Picked') fail(`Order is ${o.status} – packing needs status Picked`);
  if (!x.packages.length) fail('Create at least one package');
  const need: Record<string, number> = {}; o.lines.forEach(l => { if (l.picked > 0) need[l.sku] = l.picked; }); const got: Record<string, number> = {};
  x.packages.forEach((p, i) => { if (!p.items.length) fail(`Package ${i + 1} is empty`); if (!(Number(p.weight) > 0)) fail(`Enter the weight of package ${i + 1}`); p.items.forEach(it => (got[it.sku] = (got[it.sku] || 0) + it.qty)); });
  for (const sku of new Set([...Object.keys(need), ...Object.keys(got)])) { if (!(sku in need)) fail(`${sku} is not part of this order`); if ((got[sku] || 0) < need[sku]) fail(`${sku}: packed ${got[sku] || 0} of ${need[sku]} – missing ${need[sku] - (got[sku] || 0)}`); if (got[sku] > need[sku]) fail(`${sku}: packed ${got[sku]} but only ${need[sku]} picked – excess ${got[sku] - need[sku]}`); }
  if (Object.values(x.checklist).filter(Boolean).length < 4) fail('Complete the packaging checklist');
  const ids: string[] = []; x.packages.forEach((p, i) => { const id = `${o.no}-P${i + 1}`; ids.push(id); d.packs.push({ id, orderId: o.id, type: p.type, weight: Number(p.weight), dims: p.dims, items: p.items, packedBy: actorName(d), at: now(), photo: !!p.photo }); });
  o.pkgIds = ids; o.lines.forEach(l => (l.packed = l.picked)); o.status = 'Packed'; o.packedBy = actorName(d); o.packedAt = now(); hist(o, 'Packed', d, `${ids.length} package(s)`);
  audit(d, 'Packing completed', 'Order', o.no, { next: `${ids.length} package(s)` }); notify(d, 'Packing complete', `${o.no} awaiting gate verification`, 'success', 'gate', ['gate', 'supervisor']);
  return ids;
}

/* =========================================================
   GATE VERIFICATION
   ========================================================= */
export function gateOpen(d: State, orderId: string): string {
  const o = orderOf(d, orderId); const ex = d.gates.find(g => g.orderId === orderId && !['Dispatched'].includes(g.status)); if (ex) return ex.id;
  if (!['Packed', 'Gate Verification'].includes(o.status)) fail(`Order is ${o.status} – only packed orders can be verified`);
  const id = nextId(d, 'G'); d.gates.push({ id, no: nextNo(d, 'gc', 'GV-'), orderId, operator: actorName(d), startedAt: now(), pkgScans: [], counts: {}, damaged: {}, wrongSkus: [], mismatchPkgs: [], events: [], status: 'Scanning' });
  o.status = 'Gate Verification'; o.gateId = id; hist(o, 'Gate Verification', d); return id;
}
const gev = (d: State, g: Gate, kind: string, msg: string, sev: any) => { g.events.push({ at: now(), kind, msg, sev, by: actorName(d) }); audit(d, `Gate: ${kind}`, 'Gate', g.no, { next: msg }); };
export function gateScanPackage(d: State, gid: string, raw: string) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (g.status === 'Dispatched' || g.status === 'Dispatch Approved') return { ok: false, code: 'LOCKED', sev: 'red', msg: 'Verification is locked' };
  const pc = parseCode(raw); if (pc.kind === 'INVALID') { gev(d, g, 'INVALID_QR', `Invalid package code "${raw}"`, 'red'); return { ok: false, code: 'INVALID_QR', sev: 'red', msg: 'INVALID QR' }; }
  if (pc.kind !== 'K') { gev(d, g, 'WRONG_CODE', `Non-package code scanned: ${raw}`, 'red'); return { ok: false, code: 'WRONG_CODE', sev: 'red', msg: 'Scan a package label' }; }
  const pk = d.packs.find(p => p.id === pc.value);
  if (!pk || pk.orderId !== g.orderId) { if (!g.mismatchPkgs.includes(pc.value)) g.mismatchPkgs.push(pc.value); gev(d, g, 'PACKAGE_MISMATCH', `Package ${pc.value} does not belong to ${orderOf(d, g.orderId).no}`, 'red'); return { ok: false, code: 'PACKAGE_MISMATCH', sev: 'red', msg: 'PACKAGE MISMATCH' }; }
  if (g.pkgScans.includes(pk.id)) { gev(d, g, 'DUPLICATE', `Package ${pk.id} scanned twice`, 'amber'); return { ok: true, code: 'DUPLICATE', sev: 'amber', msg: 'DUPLICATE SCAN' }; }
  g.pkgScans.push(pk.id); gev(d, g, 'PACKAGE_OK', `Package ${pk.id} scanned`, 'green'); return { ok: true, code: 'OK', sev: 'green', msg: `Package ${pk.id} verified` };
}
export function gateScanItem(d: State, gid: string, raw: string, qty: number, o: { damaged?: boolean; correct?: boolean } = {}) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (['Dispatched', 'Dispatch Approved'].includes(g.status)) return { ok: false, code: 'LOCKED', sev: 'red', msg: 'Verification is locked' };
  const order = orderOf(d, g.orderId); const pc = parseCode(raw);
  if (pc.kind === 'INVALID') { gev(d, g, 'INVALID_QR', `Invalid QR "${raw}"`, 'red'); return { ok: false, code: 'INVALID_QR', sev: 'red', msg: 'INVALID QR' }; }
  if (pc.kind !== 'P') { gev(d, g, 'WRONG_CODE', `Non-product code scanned: ${raw}`, 'red'); return { ok: false, code: 'WRONG_CODE', sev: 'red', msg: 'Scan a product QR' }; }
  const p = d.products.find(x => x.sku === pc.value);
  if (!p) { if (!g.wrongSkus.includes(pc.value)) g.wrongSkus.push(pc.value); gev(d, g, 'UNKNOWN_SKU', `Unknown SKU ${pc.value}`, 'red'); return { ok: false, code: 'UNKNOWN_SKU', sev: 'red', msg: 'UNKNOWN SKU' }; }
  if (!order.lines.some(l => l.sku === p.sku && l.packed > 0)) { if (!g.wrongSkus.includes(p.sku)) g.wrongSkus.push(p.sku); gev(d, g, 'INCORRECT_SKU', `${p.sku} is not part of ${order.no}`, 'red'); return { ok: false, code: 'INCORRECT_SKU', sev: 'red', msg: 'INCORRECT SKU' }; }
  const q = Number(qty); if (!Number.isInteger(q) || q < 1) return { ok: false, code: 'QTY', sev: 'red', msg: 'Enter a valid quantity' };
  if (g.counts[p.sku] != null && !o.correct) { gev(d, g, 'DUPLICATE', `${p.sku} already scanned (${g.counts[p.sku]}); attempted ${q}`, 'amber'); return { ok: true, code: 'DUPLICATE', sev: 'amber', msg: 'DUPLICATE SCAN', current: g.counts[p.sku] }; }
  const prev = g.counts[p.sku]; g.counts[p.sku] = q; if (o.damaged) g.damaged[p.sku] = (g.damaged[p.sku] || 0) + 1;
  gev(d, g, prev != null ? 'CORRECTED' : 'ITEM_SCAN', `${p.sku} × ${q}${prev != null ? ` (was ${prev})` : ''}${o.damaged ? ' – flagged damaged' : ''}`, o.damaged ? 'red' : 'green');
  return { ok: true, code: o.damaged ? 'DAMAGED' : 'OK', sev: o.damaged ? 'red' : 'green', msg: `${p.sku} × ${q} recorded` };
}
export function gateResolve(d: State, gid: string, kind: 'incorrect' | 'package' | 'damage', note: string) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (!note?.trim()) fail('Enter what was done to resolve it');
  if (kind === 'incorrect') g.wrongSkus = []; if (kind === 'package') g.mismatchPkgs = []; if (kind === 'damage') g.damaged = {}; g.verified = null; g.status = 'Scanning'; gev(d, g, 'RESOLVED', `${kind} issue resolved: ${note}`, 'gray');
}
export function gateReset(d: State, gid: string) { const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (['Dispatch Approved', 'Dispatched'].includes(g.status)) fail('Locked'); g.counts = {}; g.pkgScans = []; g.verified = null; g.status = 'Scanning'; gev(d, g, 'RESET', 'Scans cleared – re-scanning', 'gray'); }
export function evalGate(d: State, g: Gate) {
  const o = orderOf(d, g.orderId); const pk = d.packs.filter(p => p.orderId === o.id); const packed: Record<string, number> = {}; pk.forEach(p => p.items.forEach(i => (packed[i.sku] = (packed[i.sku] || 0) + i.qty)));
  const rows = o.lines.filter(l => packed[l.sku]).map(l => { const sc = g.counts[l.sku] || 0; const pc = packed[l.sku]; return { sku: l.sku, name: prod(d, l.sku)?.name || l.sku, ordered: l.qty, reserved: l.resv ?? l.reserved, picked: l.picked, packed: pc, scanned: sc, status: g.counts[l.sku] == null ? 'Not scanned' : sc === pc ? 'OK' : sc > pc ? 'Excess' : 'Short' }; });
  const missingPk = pk.filter(p => !g.pkgScans.includes(p.id)).map(p => p.id);
  const f = { incorrect: g.wrongSkus.length > 0, pkg: g.mismatchPkgs.length > 0, damage: Object.values(g.damaged).some(v => v > 0), excess: rows.some(r => r.scanned > r.packed), shortage: rows.some(r => r.scanned < r.packed) || missingPk.length > 0 };
  const messages: string[] = []; if (f.incorrect) messages.push(`Incorrect SKU scanned: ${g.wrongSkus.join(', ')}`); if (f.pkg) messages.push(`Package mismatch: ${g.mismatchPkgs.join(', ')}`);
  if (f.damage) messages.push(`Damage flagged: ${Object.entries(g.damaged).filter(([, v]) => v > 0).map(([k]) => k).join(', ')}`);
  rows.filter(r => r.scanned > r.packed).forEach(r => messages.push(`${r.sku}: scanned ${r.scanned}, packed ${r.packed} (+${r.scanned - r.packed})`));
  rows.filter(r => r.scanned < r.packed).forEach(r => messages.push(`${r.sku}: scanned ${r.scanned}, packed ${r.packed} (−${r.packed - r.scanned})`)); missingPk.forEach(m => messages.push(`Package ${m} not scanned`));
  const result = f.incorrect ? 'INCORRECT SKU' : f.pkg ? 'PACKAGE MISMATCH' : f.damage ? 'DAMAGE DETECTED' : f.excess ? 'EXCESS QUANTITY DETECTED' : f.shortage ? 'SHORTAGE DETECTED' : 'VERIFIED – READY FOR DISPATCH';
  return { result, ok: result.startsWith('VERIFIED'), rows, messages, missingPk, packed };
}
export function gateVerify(d: State, gid: string) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (['Dispatch Approved', 'Dispatched'].includes(g.status)) fail('Already approved'); const e = evalGate(d, g);
  g.verified = { at: now(), result: e.result, sev: e.ok ? 'green' : 'red', messages: e.messages }; g.status = e.ok ? 'Verified' : 'Blocked'; g.operator = actorName(d);
  audit(d, `Gate verification: ${e.result}`, 'Gate', g.no, { next: e.messages.join(' | ') || 'All items and packages match' });
  if (!e.ok) notify(d, 'Dispatch mismatch', `${orderOf(d, g.orderId).no}: ${e.result}`, 'critical', 'gate', ['supervisor', 'whmanager']); return e.result;
}
export function gateRequestOverride(d: State, gid: string, reason: string) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (g.status !== 'Blocked') fail('Override applies only to blocked verifications'); if (!reason?.trim()) fail('Reason is required');
  return requestApproval(d, { type: 'dispatch_discrepancy', ref: g.no, payload: { gid }, reason, prev: g.verified?.result, next: 'Override dispatch' });
}
function applyOverride(d: State, gid: string, reason: string) { const g = d.gates.find(x => x.id === gid)!; g.override = { by: actorName(d), reason, at: now() }; g.status = 'Override Approved'; gev(d, g, 'OVERRIDE', `Supervisor override by ${actorName(d)}: ${reason}`, 'amber'); }
export function gateOverride(d: State, gid: string, reason: string) { const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (g.status !== 'Blocked') fail('Override applies only to blocked verifications'); if (!reason?.trim()) fail('Reason is required'); applyOverride(d, gid, reason); }
export function gateApproveDispatch(d: State, gid: string) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (!['Verified', 'Override Approved'].includes(g.status)) fail('Dispatch is blocked until verification passes or a supervisor override is approved');
  g.approval = { by: actorName(d), at: now() }; g.status = 'Dispatch Approved'; g.dispatchRef = nextNo(d, 'dspref', 'DSP-'); gev(d, g, 'DISPATCH_APPROVED', `Dispatch ${g.dispatchRef} approved by ${actorName(d)}`, 'green');
  notify(d, 'Dispatch approved', `${orderOf(d, g.orderId).no} – assign vehicle`, 'success', 'dispatch', ['gate', 'supervisor']); return g.dispatchRef;
}

/* =========================================================
   DISPATCH / DELIVERY / INVOICE
   ========================================================= */
export function confirmDispatch(d: State, gid: string, info: { vehicle: string; driver: string; driverPhone?: string; transporter: string; method: string; etaDays?: number }) {
  const g = d.gates.find(x => x.id === gid) ?? fail('Gate check not found'); if (g.status === 'Dispatched') fail('Already dispatched'); if (!g.approval) fail('Supervisor dispatch approval is required');
  if (!info.vehicle?.trim()) fail('Vehicle registration is required'); if (!info.driver?.trim()) fail('Driver name is required'); if (!info.transporter?.trim()) fail('Transporter is required');
  const o = orderOf(d, g.orderId); const shipped: { sku: string; qty: number }[] = [];
  for (const l of o.lines) {
    if (l.picked <= 0) continue; const ship = Math.min(l.picked, g.counts[l.sku] ?? 0); let left = ship;
    for (const a of l.alloc) { const s = stockOf(d, a.stockId); if (!s) continue; const take = Math.min(a.picked, left); if (s.qty < take) fail(`Negative stock prevented for ${l.sku}`); s.qty -= take; s.picked -= a.picked; s.lastMove = now(); left -= take; if (take > 0) mv(d, { type: 'DISPATCH', sku: l.sku, qty: take, delta: -take, wh: o.wh, from: s.bin, batch: s.batch, ref: o.no }); }
    l.shipped += ship; l.alloc = []; l.packed = 0; if (ship > 0) shipped.push({ sku: l.sku, qty: ship });
  }
  syncLines(o); cleanupStock(d); if (!shipped.length) fail('Nothing verified to ship');
  const id = nextId(d, 'D'); const n = d.dispatches.length + 1; const otp = String(1000 + ((n * 7919) % 9000));
  const disp: Dispatch = { id, no: g.dispatchRef || nextNo(d, 'dspref', 'DSP-'), orderId: o.id, gateId: g.id, status: 'In Transit', vehicle: info.vehicle.toUpperCase(), driver: info.driver, driverPhone: info.driverPhone || '', transporter: info.transporter, method: info.method || 'Road – FTL', tracking: `TRK${String(now()).slice(-8)}${pad(n, 2)}`, at: now(), eta: addDays(now(), info.etaDays ?? 1), otp, pkgIds: [...o.pkgIds], challanNo: nextNo(d, 'dc', 'DC-'), invoiceId: '', shipped, pod: null, dispatchedBy: actorName(d) };
  d.dispatches.push(disp); o.dispatchIds.push(id);
  const inv = generateInvoice(d, o, disp); disp.invoiceId = inv; o.partial = o.lines.some(l => l.backorder > 0); o.status = o.partial ? 'Partially Fulfilled' : 'Dispatched'; hist(o, o.status, d, `${disp.no} · ${disp.vehicle}`);
  g.status = 'Dispatched'; gev(d, g, 'DISPATCHED', `${disp.no} left on ${disp.vehicle}`, 'green');
  audit(d, 'Dispatch confirmed', 'Dispatch', disp.no, { next: shipped.map(s => `${s.sku}×${s.qty}`).join(', ') });
  notify(d, 'Dispatch confirmed', `${o.no} on ${disp.vehicle}; invoice generated`, 'success', 'dispatch'); notify(d, 'Invoice generated', `${d.invoices.find(i => i.id === inv)?.no} for ${o.no}`, 'info', 'invoices', ['accounts']);
  return id;
}
export function generateInvoice(d: State, o: Order, disp: Dispatch): string {
  const c = cust(d, o.customerId)!; const inter = c.state !== d.org.state; const lines: InvLine[] = []; let taxable = 0, cg = 0, sg = 0, ig = 0;
  const addTax = (base: number, rate: number) => { const t = round2((base * rate) / 100); if (inter) ig += t; else { cg += t / 2; sg += t / 2; } return t; };
  for (const s of disp.shipped) { const l = o.lines.find(x => x.sku === s.sku)!; const p = prodOrFail(d, s.sku); const tv = round2(s.qty * l.rate * (1 - l.discPct / 100)); taxable += tv; const t = addTax(tv, l.tax); lines.push({ sku: s.sku, name: p.name, hsn: p.hsn, qty: s.qty, rate: l.rate, discPct: l.discPct, taxable: tv, taxRate: l.tax, cgst: inter ? 0 : round2(t / 2), sgst: inter ? 0 : round2(t / 2), igst: inter ? t : 0 }); }
  const first = o.invoiceIds.length === 0; const fr = first ? o.freight : 0, pk = first ? o.packing : 0; taxable += fr + pk; addTax(fr + pk, d.settings.freightTax);
  const total = round2(taxable + cg + sg + ig); const id = nextId(d, 'INV');
  d.invoices.push({ id, no: `${d.settings.invPrefix}${fyOf(now())}/${pad((d.counters.inv = (d.counters.inv || 0) + 1), 4)}`, type: 'Tax Invoice', orderId: o.id, customerId: c.id, date: now(), due: addDays(now(), c.terms), lines, freight: fr, packing: pk, taxable: round2(taxable), cgst: round2(cg), sgst: round2(sg), igst: round2(ig), total, paid: 0, credited: 0, status: 'Issued', dispatchId: disp.id, interstate: inter, challanNo: disp.challanNo });
  o.invoiceIds.push(id); audit(d, 'Invoice generated', 'Invoice', id, { next: `₹${total}` }); return id;
}
export function deliver(d: State, dispId: string, x: { otp: string; receivedBy: string; signature: boolean; photo: boolean }) {
  const dp = d.dispatches.find(y => y.id === dispId) ?? fail('Dispatch not found'); if (dp.status !== 'In Transit') fail(`Dispatch is ${dp.status}`);
  if (!x.receivedBy?.trim()) fail('Enter the receiver name'); if ((x.otp || '').trim() !== dp.otp) fail('Incorrect delivery OTP');
  dp.status = 'Delivered'; dp.pod = { at: now(), by: x.receivedBy, signature: x.signature, photo: x.photo }; const o = orderOf(d, dp.orderId);
  if (o.dispatchIds.every(id => d.dispatches.find(z => z.id === id)?.status === 'Delivered') && o.status === 'Dispatched') { o.status = 'Delivered'; hist(o, 'Delivered', d, `POD by ${x.receivedBy}`); }
  audit(d, 'Delivery confirmed', 'Dispatch', dp.no, { next: `Received by ${x.receivedBy}` }); notify(d, 'Delivery confirmed', `${o.no} delivered to ${x.receivedBy}`, 'success', 'deliveries');
}
export function failDelivery(d: State, dispId: string, reason: string) {
  const dp = d.dispatches.find(y => y.id === dispId) ?? fail('Dispatch not found'); if (dp.status !== 'In Transit') fail(`Dispatch is ${dp.status}`); if (!reason?.trim()) fail('Reason required');
  dp.status = 'Failed'; dp.failReason = reason; notify(d, 'Delivery failed', `${dp.no}: ${reason}`, 'critical', 'deliveries', ['supervisor', 'whmanager', 'sales']); audit(d, 'Delivery failed', 'Dispatch', dp.no, { reason });
}
export function returnToWarehouse(d: State, dispId: string) {
  const dp = d.dispatches.find(y => y.id === dispId) ?? fail('Dispatch not found'); if (dp.status !== 'Failed') fail('Only failed deliveries can be returned'); const o = orderOf(d, dp.orderId);
  dp.status = 'Returned'; const rid = nextId(d, 'R'); d.returns.push({ id: rid, no: nextNo(d, 'rma', 'RMA-'), kind: 'Customer', orderId: o.id, customerId: o.customerId, lines: dp.shipped.map(s => ({ sku: s.sku, qty: s.qty, reason: `Failed delivery: ${dp.failReason}`, cond: 'Unknown' })), status: 'In Transit', at: now(), by: actorName(d), refund: false, replacement: false, history: [{ at: now(), status: 'In Transit', by: actorName(d) }] });
  hist(o, 'Return Initiated', d, 'Failed delivery'); o.status = 'Return Initiated'; return rid;
}

/* =========================================================
   FINANCE
   ========================================================= */
const invStatus = (i: Invoice) => { if (i.status === 'Cancelled') return; const due = i.total - i.paid - i.credited; i.status = due <= 0.009 ? 'Paid' : i.paid + i.credited > 0 ? 'Partially Paid' : 'Issued'; };
export function recordPayment(d: State, x: { customerId: string; amount: number; mode: string; ref: string; invoiceId?: string }) {
  const c = cust(d, x.customerId) ?? fail('Select a customer'); const amt = Number(x.amount); if (!(amt > 0)) fail('Enter a valid amount'); if (!x.mode) fail('Select payment mode');
  const open = d.invoices.filter(i => i.customerId === c.id && ['Issued', 'Partially Paid'].includes(i.status) && i.type === 'Tax Invoice').sort((a, b) => (a.id === x.invoiceId ? -1 : b.id === x.invoiceId ? 1 : a.date - b.date));
  let left = amt; const alloc: { invoiceId: string; amount: number }[] = [];
  for (const i of open) { if (left <= 0) break; const due = round2(i.total - i.paid - i.credited); const t = Math.min(due, left); if (t <= 0) continue; i.paid = round2(i.paid + t); invStatus(i); left = round2(left - t); alloc.push({ invoiceId: i.id, amount: t }); }
  if (left > 0) c.advance = round2(c.advance + left);
  const id = nextId(d, 'PAY'); d.payments.push({ id, no: nextNo(d, 'pay', 'RCPT-'), customerId: c.id, date: now(), amount: amt, mode: x.mode, ref: x.ref || '', alloc, by: actorName(d) });
  audit(d, 'Payment recorded', 'Payment', id, { next: `₹${amt} from ${c.name}` }); return id;
}
export function createNote(d: State, x: { kind: 'Credit' | 'Debit'; customerId: string; invoiceId?: string; amount: number; reason: string; refId?: string }) {
  const c = cust(d, x.customerId) ?? fail('Select a customer'); const amt = Number(x.amount); if (!(amt > 0)) fail('Enter a valid amount'); if (!x.reason?.trim()) fail('Reason required');
  if (x.kind === 'Credit') { if (x.invoiceId) { const i = d.invoices.find(y => y.id === x.invoiceId)!; const due = i.total - i.paid - i.credited; const t = Math.min(due, amt); i.credited = round2(i.credited + t); invStatus(i); if (amt - t > 0) c.advance = round2(c.advance + amt - t); } else c.advance = round2(c.advance + amt); }
  const id = nextId(d, 'CN'); d.notes.push({ id, no: nextNo(d, x.kind === 'Credit' ? 'cn' : 'dn', x.kind === 'Credit' ? 'CN-' : 'DN-'), kind: x.kind, customerId: c.id, invoiceId: x.invoiceId, amount: amt, reason: x.reason, date: now(), refId: x.refId, by: actorName(d) });
  audit(d, `${x.kind} note issued`, 'Note', id, { next: `₹${amt}`, reason: x.reason }); return id;
}
export function cancelInvoice(d: State, id: string, reason: string) {
  const i = d.invoices.find(y => y.id === id) ?? fail('Invoice not found'); if (i.status === 'Cancelled') fail('Already cancelled'); if (i.paid > 0) fail('Invoice has payments – issue a credit note instead'); if (!reason?.trim()) fail('Reason required');
  return requestApproval(d, { type: 'invoice_cancel', ref: i.no, payload: { id }, reason, prev: i.status, next: 'Cancelled' });
}

/* =========================================================
   INVENTORY OPERATIONS
   ========================================================= */
export function adjustStock(d: State, x: { stockId: string; kind: 'Correction' | 'Write-off' | 'Damage' | 'Quarantine'; qty?: number; newQty?: number; reason: string; cycle?: boolean }): { pending?: boolean } {
  const s = stockOf(d, x.stockId) ?? fail('Stock record not found'); const p = prodOrFail(d, s.sku); if (!x.reason?.trim()) fail('A reason is mandatory for every stock adjustment');
  let delta = 0; if (x.kind === 'Correction') { const n = int(x.newQty, 'New quantity'); delta = n - s.qty; if (delta === 0) fail('Quantity unchanged'); if (n < s.reserved + s.picked) fail(`Cannot go below committed stock (${s.reserved + s.picked} reserved/picked)`); }
  else { const q = int(x.qty, 'Quantity', 1); const free = s.status === 'Available' ? s.qty - s.reserved - s.picked : s.qty; if (q > free) fail(`Only ${free} units are free to ${x.kind.toLowerCase()}`); delta = x.kind === 'Write-off' ? -q : 0; }
  const amountQty = x.kind === 'Correction' ? Math.abs(delta) : Number(x.qty);
  const value = amountQty * p.cost; const rule = d.approvalRules[x.kind === 'Write-off' ? 'writeoff' : 'adjust'];
  const direct = C.actorRole(d) === 'system' || !rule?.required || (x.kind !== 'Write-off' && value <= (d.settings.adjustApprovalValue));
  if (!direct) { requestApproval(d, { type: x.kind === 'Write-off' ? 'writeoff' : 'adjust', ref: `${s.sku}/${s.batch}`, payload: { ...x, by: actorName(d) }, reason: x.reason, prev: String(s.qty), next: x.kind === 'Correction' ? String(x.newQty) : `${x.kind} ${x.qty}` }); return { pending: true }; }
  applyAdjust(d, x); return {};
}
function applyAdjust(d: State, x: any) {
  const s = stockOf(d, x.stockId) ?? fail('Stock record not found'); const prev = s.qty;
  if (x.kind === 'Correction') { const delta = x.newQty - s.qty; if (x.newQty < s.reserved + s.picked) fail('Cannot go below committed stock'); s.qty = x.newQty; mv(d, { type: x.cycle ? 'COUNT' : 'ADJUST', sku: s.sku, qty: Math.abs(delta), delta, wh: s.wh, from: s.bin, batch: s.batch, reason: x.reason }); }
  else if (x.kind === 'Write-off') { if (x.qty > s.qty - s.reserved - s.picked) fail('Insufficient free stock'); s.qty -= x.qty; mv(d, { type: 'WRITEOFF', sku: s.sku, qty: x.qty, delta: -x.qty, wh: s.wh, from: s.bin, batch: s.batch, reason: x.reason }); }
  else { if (s.status === 'Available' && x.qty > s.qty - s.reserved - s.picked) fail('Insufficient free stock'); s.qty -= x.qty; const st = x.kind === 'Damage' ? 'Damaged' : 'Quarantine'; const ex = d.stock.find(y => y.sku === s.sku && y.batch === s.batch && y.wh === s.wh && y.status === st && !y.bin); if (ex) ex.qty += x.qty; else d.stock.push({ id: nextId(d, 'S'), sku: s.sku, batch: s.batch, mfg: s.mfg, exp: s.exp, wh: s.wh, bin: null, qty: x.qty, reserved: 0, picked: 0, status: st, receivedAt: s.receivedAt, lastMove: now(), ref: 'ADJ' }); mv(d, { type: x.kind.toUpperCase(), sku: s.sku, qty: x.qty, delta: 0, wh: s.wh, from: s.bin, to: `QC-${st.toUpperCase()}`, batch: s.batch, reason: x.reason }); }
  s.lastMove = now(); audit(d, `Stock ${x.kind.toLowerCase()}`, 'Stock', `${s.sku}/${s.batch}@${s.bin ?? s.status}`, { prev, next: s.qty, reason: x.reason }); cleanupStock(d);
}
export function moveBin(d: State, x: { stockId: string; qty: number; toBin: string; reason: string }) {
  const s = stockOf(d, x.stockId) ?? fail('Stock not found'); const p = prodOrFail(d, s.sku); if (s.status !== 'Available' || !s.bin) fail('Only stored, available stock can be moved'); if (!x.reason?.trim()) fail('Reason required');
  const q = int(x.qty, 'Quantity', 1); if (q > s.qty - s.reserved - s.picked) fail(`Only ${s.qty - s.reserved - s.picked} units are free to move (rest is reserved/picked)`);
  if (x.toBin === s.bin) fail('Destination is the same location'); if (C.binParts(x.toBin) && !C.binValid(d, x.toBin)) fail(`Invalid location ${x.toBin}`);
  const dr = C.rackOf(d, binParts(x.toBin).rack)!; if (dr.wh !== s.wh) fail('Destination is in another warehouse – use an inter-warehouse transfer');
  const err = canStore(d, p, x.toBin, q); if (err) fail(err);
  const from = s.bin; const twin = d.stock.find(y => y.id !== s.id && y.sku === s.sku && y.batch === s.batch && y.bin === x.toBin && y.status === 'Available');
  s.qty -= q; if (twin) twin.qty += q; else d.stock.push({ ...s, id: nextId(d, 'S'), bin: x.toBin, qty: q, reserved: 0, picked: 0, lastMove: now() });
  mv(d, { type: 'TRANSFER', sku: s.sku, qty: q, delta: 0, wh: s.wh, from, to: x.toBin, batch: s.batch, reason: x.reason }); audit(d, 'Bin-to-bin transfer', 'Stock', s.sku, { prev: from, next: x.toBin, reason: x.reason }); cleanupStock(d);
}
export function createTransfer(d: State, x: { stockId: string; qty: number; toWh: string; toBin: string; reason: string }) {
  const s = stockOf(d, x.stockId) ?? fail('Stock not found'); const p = prodOrFail(d, s.sku); if (s.status !== 'Available' || !s.bin) fail('Only stored, available stock can be transferred');
  if (x.toWh === s.wh) fail('Choose a different warehouse (use bin transfer inside a warehouse)'); const q = int(x.qty, 'Quantity', 1); if (q > s.qty - s.reserved - s.picked) fail('Quantity exceeds free stock'); if (!x.reason?.trim()) fail('Reason required');
  if (!C.binValid(d, x.toBin) || C.rackOf(d, binParts(x.toBin).rack)!.wh !== x.toWh) fail('Destination bin must be in the destination warehouse'); const err = canStore(d, p, x.toBin, q); if (err) fail(err);
  const id = nextId(d, 'TR'); d.transfers.push({ id, no: nextNo(d, 'tr', 'TRF-'), stockId: s.id, sku: s.sku, qty: q, fromWh: s.wh, toWh: x.toWh, fromBin: s.bin, toBin: x.toBin, status: 'Pending Approval', at: now(), by: actorName(d), reason: x.reason });
  requestApproval(d, { type: 'transfer', ref: d.transfers[d.transfers.length - 1].no, payload: { id }, reason: x.reason, next: `${q} × ${s.sku} → ${x.toWh}` }); return id;
}
function startTransfer(d: State, id: string) {
  const t = d.transfers.find(x => x.id === id)!; const s = stockOf(d, t.stockId) ?? fail('Source stock no longer exists'); if (t.qty > s.qty - s.reserved - s.picked) fail('Source stock is no longer free');
  s.qty -= t.qty; const nid = nextId(d, 'S'); d.stock.push({ ...s, id: nid, wh: t.toWh, bin: null, qty: t.qty, reserved: 0, picked: 0, status: 'InTransit', lastMove: now(), ref: t.no }); t.newStockId = nid; t.status = 'In Transit';
  mv(d, { type: 'TRANSFER_OUT', sku: t.sku, qty: t.qty, delta: -t.qty, wh: t.fromWh, from: t.fromBin, to: 'IN-TRANSIT', ref: t.no }); cleanupStock(d); notify(d, 'Stock in transit', `${t.no}: ${t.qty} × ${t.sku} → ${t.toWh}`, 'info', 'transfers');
}
export function receiveTransfer(d: State, id: string) {
  const t = d.transfers.find(x => x.id === id) ?? fail('Transfer not found'); if (t.status !== 'In Transit') fail(`Transfer is ${t.status}`); const s = stockOf(d, t.newStockId!) ?? fail('In-transit stock missing'); const p = prodOrFail(d, t.sku);
  const err = canStore(d, p, t.toBin, t.qty, s.id); if (err) fail(err); s.bin = t.toBin; s.status = 'Available'; s.lastMove = now(); t.status = 'Completed';
  mv(d, { type: 'TRANSFER_IN', sku: t.sku, qty: t.qty, delta: t.qty, wh: t.toWh, from: 'IN-TRANSIT', to: t.toBin, ref: t.no }); audit(d, 'Inter-warehouse transfer received', 'Transfer', t.no, { next: t.toBin });
}
export function createCount(d: State, x: { rack: string }) {
  const rk = C.rackOf(d, x.rack) ?? fail('Select a rack'); const lines = d.stock.filter(s => s.bin && binParts(s.bin).rack === rk.id && s.status === 'Available').map(s => ({ stockId: s.id, sku: s.sku, bin: s.bin, batch: s.batch, system: s.qty, counted: null as number | null }));
  if (!lines.length) fail('That rack holds no stock to count'); const id = nextId(d, 'CC'); d.counts.push({ id, no: nextNo(d, 'cc', 'CC-'), scope: 'Rack', ref: rk.id, wh: rk.wh, status: 'Open', lines, at: now(), by: actorName(d) }); return id;
}
export function submitCount(d: State, id: string, counted: Record<string, number>) {
  const c = d.counts.find(x => x.id === id) ?? fail('Count not found'); if (c.status !== 'Open') fail('Already posted'); let pend = 0, applied = 0;
  for (const l of c.lines) { const v = counted[l.stockId]; if (v == null || Number.isNaN(v)) fail(`Enter a count for ${l.sku} @ ${l.bin}`); l.counted = int(v, 'Counted qty'); }
  for (const l of c.lines) if (l.counted !== l.system) { const r = adjustStock(d, { stockId: l.stockId, kind: 'Correction', newQty: l.counted!, reason: `Cycle count ${c.no} variance (system ${l.system}, counted ${l.counted})`, cycle: true }); r.pending ? pend++ : applied++; }
  c.status = 'Posted'; c.postedAt = now(); audit(d, 'Cycle count posted', 'Count', c.no, { next: `${applied} adjusted, ${pend} pending approval` }); return { applied, pend };
}

/* =========================================================
   RETURNS
   ========================================================= */
export function createReturn(d: State, x: { orderId: string; lines: { sku: string; qty: number; reason: string; cond: string }[]; refund: boolean; replacement: boolean; note?: string }) {
  const o = orderOf(d, x.orderId); if (!['Delivered', 'Dispatched', 'Partially Fulfilled'].includes(o.status)) fail('Returns can be raised only for dispatched/delivered orders');
  const lines = x.lines.filter(l => l.qty > 0); if (!lines.length) fail('Enter a return quantity');
  for (const l of lines) { const ol = o.lines.find(y => y.sku === l.sku); if (!ol || l.qty > ol.shipped) fail(`${l.sku}: return quantity exceeds shipped quantity`); if (!l.reason?.trim()) fail('Select a return reason'); }
  const id = nextId(d, 'R'); const no = nextNo(d, 'rma', 'RMA-'); d.returns.push({ id, no, kind: 'Customer', orderId: o.id, customerId: o.customerId, lines, status: 'Requested', at: now(), by: actorName(d), refund: x.refund, replacement: x.replacement, note: x.note, history: [{ at: now(), status: 'Requested', by: actorName(d) }] });
  requestApproval(d, { type: 'return', ref: no, payload: { id }, reason: lines.map(l => `${l.qty}×${l.sku} (${l.reason})`).join(', ') }); notify(d, 'Customer return requested', `${no} for ${o.no}`, 'warning', 'returns', ['sales', 'whmanager']); return id;
}
const rhist = (r: Ret, s: string, d: State) => { r.status = s; r.history.push({ at: now(), status: s, by: actorName(d) }); };
export function returnReceive(d: State, id: string) { const r = d.returns.find(x => x.id === id) ?? fail('Return not found'); if (!['RMA Issued', 'In Transit'].includes(r.status)) fail(`Return is ${r.status}`); rhist(r, 'Received', d); }
export function returnInspect(d: State, id: string, disp: Record<number, string>) {
  const r = d.returns.find(x => x.id === id) ?? fail('Return not found'); if (r.status !== 'Received') fail('Receive the goods first'); const o = r.orderId ? orderOf(d, r.orderId) : null; let value = 0;
  r.lines.forEach((l, i) => { const dp = disp[i] ?? fail(`Select a disposition for ${l.sku}`); l.disposition = dp; const p = prodOrFail(d, l.sku); const wh = o?.wh || d.warehouses[0].id; const rate = o?.lines.find(x => x.sku === l.sku)?.rate ?? p.price; value += l.qty * rate * (1 + p.tax / 100);
    if (dp === 'Scrap') { mv(d, { type: 'RETURN_SCRAP', sku: l.sku, qty: l.qty, delta: 0, wh, ref: r.no, reason: 'Scrapped after inspection' }); return; }
    const st: any = dp === 'Restock' ? 'Received' : dp === 'Damaged' ? 'Damaged' : 'Quarantine'; const sid = nextId(d, 'S'); const src = o?.lines.find(x => x.sku === l.sku);
    d.stock.push({ id: sid, sku: l.sku, batch: l.batch || 'RET-' + r.no.slice(-4), mfg: null, exp: null, wh, bin: null, qty: l.qty, reserved: 0, picked: 0, status: st, receivedAt: now(), lastMove: now(), ref: r.no }); l.stockId = sid;
    mv(d, { type: 'RETURN', sku: l.sku, qty: l.qty, delta: l.qty, wh, to: dp === 'Restock' ? 'DOCK' : `QC-${st.toUpperCase()}`, ref: r.no, reason: `Customer return (${dp})` });
    if (dp === 'Restock') { const sg = suggestBin(d, p, l.qty, wh); d.tasks.push({ id: nextId(d, 'T'), no: nextNo(d, 'pa', 'PA-'), type: 'putaway', grnId: r.no, wh, status: 'Unassigned', priority: 'Normal', lines: [{ sku: l.sku, batch: d.stock[d.stock.length - 1].batch, exp: null, qty: l.qty, picked: 0, status: 'Pending', stockId: sid, bin: null, destBin: sg?.bin, suggested: sg?.bin, reason: sg?.reason ?? 'Choose manually' }], wrongScans: 0, createdAt: now(), mode: 'Single' }); }
    void src; });
  rhist(r, 'Closed', d); if (r.refund && r.customerId) { const nid = createNote(d, { kind: 'Credit', customerId: r.customerId, amount: round2(value), reason: `Return ${r.no}`, refId: r.id }); r.creditNoteId = nid; }
  if (r.replacement && o) { createOrder(d, { customerId: o.customerId, wh: o.wh, lines: r.lines.filter(l => l.disposition !== 'Scrap' || true).map(l => ({ sku: l.sku, qty: l.qty, discPct: 100 })), instructions: `Replacement for ${r.no}`, priority: 'High' }); }
  audit(d, 'Return inspected & closed', 'Return', r.no, { next: r.lines.map(l => `${l.sku}:${l.disposition}`).join(', ') });
}
export function createSupplierReturn(d: State, x: { stockId: string; qty: number; reason: string }) {
  const s = stockOf(d, x.stockId) ?? fail('Stock not found'); if (!['Damaged', 'Quarantine'].includes(s.status)) fail('Supplier returns are raised from damaged/quarantined stock'); const q = int(x.qty, 'Quantity', 1); if (q > s.qty) fail('Quantity exceeds stock'); if (!x.reason?.trim()) fail('Reason required');
  const po = d.pos.find(p => p.lines.some(l => l.sku === s.sku)); const sid = po?.supplierId || d.suppliers[0].id; s.qty -= q; mv(d, { type: 'SUPPLIER_RETURN', sku: s.sku, qty: q, delta: -q, wh: s.wh, batch: s.batch, reason: x.reason }); cleanupStock(d);
  const id = nextId(d, 'R'); const no = nextNo(d, 'rma', 'RMA-'); d.returns.push({ id, no, kind: 'Supplier', supplierId: sid, lines: [{ sku: s.sku, qty: q, reason: x.reason, cond: s.status, batch: s.batch, disposition: 'Returned to supplier' }], status: 'Closed', at: now(), by: actorName(d), refund: true, replacement: false, history: [{ at: now(), status: 'Closed', by: actorName(d) }] });
  d.notes.push({ id: nextId(d, 'CN'), no: nextNo(d, 'dn', 'DN-'), kind: 'Debit', supplierId: sid, amount: round2(q * (prod(d, s.sku)?.cost ?? 0)), reason: `Supplier return ${no}`, date: now(), by: actorName(d) }); audit(d, 'Supplier return', 'Return', no, { next: `${q} × ${s.sku}`, reason: x.reason }); return id;
}

/* =========================================================
   PROCUREMENT
   ========================================================= */
export function createReq(d: State, x: { wh: string; lines: { sku: string; qty: number }[]; reason: string }) {
  if (!x.lines.length) fail('Add at least one item'); x.lines.forEach(l => { prodOrFail(d, l.sku); int(l.qty, 'Quantity', 1); }); const id = nextId(d, 'REQ');
  d.reqs.push({ id, no: nextNo(d, 'req', 'PR-'), wh: x.wh, lines: x.lines, status: 'Pending Approval', by: actorName(d), at: now(), reason: x.reason || 'Replenishment', quotes: [] }); return id;
}
export function addQuote(d: State, reqId: string, q: { supplierId: string; rate: number; leadDays: number }) { const r = d.reqs.find(x => x.id === reqId) ?? fail('Requisition not found'); if (!q.supplierId) fail('Select supplier'); if (!(q.rate > 0)) fail('Enter a quoted rate'); r.quotes = r.quotes.filter(y => y.supplierId !== q.supplierId); r.quotes.push(q); }
export function decideReq(d: State, id: string, approve: boolean) { const r = d.reqs.find(x => x.id === id) ?? fail('Requisition not found'); if (r.status !== 'Pending Approval') fail(`Already ${r.status}`); r.status = approve ? 'Approved' : 'Rejected'; audit(d, `Requisition ${r.status.toLowerCase()}`, 'Requisition', r.no); }
export function createPO(d: State, x: { supplierId: string; wh: string; lines: { sku: string; qty: number; rate: number }[]; expected: number; reqId?: string; notes?: string }) {
  const s = sup(d, x.supplierId) ?? fail('Select a supplier'); if (!x.lines.length) fail('Add at least one line'); x.lines.forEach(l => { prodOrFail(d, l.sku); int(l.qty, 'Quantity', 1); if (!(l.rate > 0)) fail(`Rate for ${l.sku} is required`); });
  if (!x.expected || x.expected < dayStart(now())) fail('Expected delivery must be today or later'); const id = nextId(d, 'PO');
  d.pos.push({ id, no: nextNo(d, 'po', 'PO-'), supplierId: s.id, wh: x.wh, status: 'Pending Approval', lines: x.lines.map(l => ({ ...l, received: 0 })), expected: x.expected, terms: s.terms, createdAt: now(), createdBy: actorName(d), reqId: x.reqId, notes: x.notes });
  if (x.reqId) { const r = d.reqs.find(y => y.id === x.reqId); if (r) { r.status = 'Converted'; r.poId = id; } } notify(d, 'New purchase order', `${d.pos[d.pos.length - 1].no} – ${s.name}`, 'info', 'pos', ['procurement', 'whmanager']); return id;
}
export function poAction(d: State, id: string, act: 'approve' | 'send' | 'cancel' | 'close' | 'asn', x?: { vehicle?: string; driver?: string }) {
  const p = d.pos.find(y => y.id === id) ?? fail('PO not found');
  if (act === 'approve') { if (p.status !== 'Pending Approval') fail(`PO is ${p.status}`); p.status = 'Approved'; }
  else if (act === 'send') { if (p.status !== 'Approved') fail('Approve the PO first'); p.status = 'Sent'; }
  else if (act === 'asn') { if (!['Sent', 'Approved'].includes(p.status)) fail('PO must be approved/sent'); if (!x?.vehicle?.trim()) fail('Vehicle number required'); p.asn = { at: now(), vehicle: x.vehicle!, driver: x.driver || '' }; notify(d, 'Advance shipment notice', `${p.no} dispatched by supplier (${x.vehicle})`, 'info', 'inward', ['receiving']); }
  else if (act === 'cancel') { if (p.lines.some(l => l.received > 0)) fail('PO has receipts – close it instead'); p.status = 'Cancelled'; } else { p.status = 'Closed'; }
  audit(d, `PO ${act}`, 'PO', p.no);
}
export function paySupplierInvoice(d: State, id: string) { const i = d.supInvs.find(x => x.id === id) ?? fail('Invoice not found'); if (i.status === 'Paid') fail('Already paid'); i.status = 'Paid'; i.paidAt = now(); audit(d, 'Supplier invoice paid', 'SupplierInvoice', i.no, { next: `₹${i.amount}` }); }

/* =========================================================
   APPROVAL DECISIONS
   ========================================================= */
export function decideApproval(d: State, id: string, approve: boolean, note: string) {
  const a = d.approvals.find(x => x.id === id) ?? fail('Approval not found'); if (a.status !== 'Pending') fail(`Already ${a.status.toLowerCase()}`);
  const role = C.actorRole(d); if (!canApprove(d, role, a.type)) fail(`Your role cannot approve "${d.approvalRules[a.type]?.label ?? a.type}"`);
  if (a.by === actorName(d) && role !== 'superadmin') fail('Maker-checker: you cannot approve your own request');
  if (!approve && !note?.trim()) fail('Enter a reason for rejection');
  const p = a.payload;
  if (approve) {
    switch (a.type) {
      case 'grn': finalizeInward(d, p.inId); break; case 'qc_reject': applyQcReject(d, p.stockId); break;
      case 'adjust': case 'writeoff': applyAdjust(d, p); break; case 'transfer': startTransfer(d, p.id); break;
      case 'discount': { const o = orderOf(d, p.orderId); o.discountApproved = true; o.status = o.prevStatus || 'Draft'; o.hold = null; confirmOrder(d, o.id); break; }
      case 'credit_override': { const o = orderOf(d, p.orderId); o.creditApproved = true; o.status = o.prevStatus || 'Draft'; o.hold = null; confirmOrder(d, o.id); break; }
      case 'order_cancel': doCancel(d, orderOf(d, p.orderId), p.reason); break; case 'dispatch_discrepancy': applyOverride(d, p.gid, a.reason); break;
      case 'invoice_cancel': { const i = d.invoices.find(x => x.id === p.id)!; i.status = 'Cancelled'; break; }
      case 'return': { const r = d.returns.find(x => x.id === p.id)!; rhist(r, 'RMA Issued', d); break; }
      case 'price': { const e = d.prices.find(x => x.id === p.id); if (e) e.approved = true; break; }
    }
  } else {
    switch (a.type) {
      case 'grn': rejectInward(d, p.inId, note); break; case 'transfer': { const t = d.transfers.find(x => x.id === p.id); if (t) t.status = 'Rejected'; break; }
      case 'return': { const r = d.returns.find(x => x.id === p.id); if (r) rhist(r, 'Rejected', d); break; }
      case 'price': d.prices = d.prices.filter(x => x.id !== p.id); break;
      case 'discount': case 'credit_override': { const o = orderOf(d, p.orderId); o.hold = { reason: `Rejected: ${note}`, type: 'manual' }; break; }
    }
  }
  a.status = approve ? 'Approved' : 'Rejected'; a.decidedBy = actorName(d); a.decidedAt = now(); a.note = note; audit(d, `Approval ${a.status.toLowerCase()}`, a.type, a.ref, { prev: a.prev, next: a.next, reason: note || a.reason });
}

/* ---------- price list ---------- */
export function savePrice(d: State, x: { customerId: string; sku: string; rate: number; minQty: number; from: number; to: number | null; type: any }) {
  const p = prodOrFail(d, x.sku); cust(d, x.customerId) ?? fail('Select a customer'); if (!(x.rate > 0)) fail('Enter a valid rate'); if (x.to && x.to < x.from) fail('Expiry must be after effective date');
  const disc = ((p.price - x.rate) / p.price) * 100; const needs = disc > d.settings.discountApprovalPct; const id = nextId(d, 'PL');
  d.prices.push({ id, customerId: x.customerId, sku: x.sku, rate: x.rate, minQty: Math.max(1, x.minQty || 1), from: x.from, to: x.to, type: x.type, approved: !needs }); audit(d, 'Customer rate saved', 'PriceList', `${x.customerId}/${x.sku}`, { prev: p.price, next: x.rate });
  if (needs) { requestApproval(d, { type: 'price', ref: `${x.customerId}/${x.sku}`, payload: { id }, reason: `Special rate ${disc.toFixed(1)}% below standard`, prev: String(p.price), next: String(x.rate) }); return { pending: true }; } return {};
}

/* ---------- stats ---------- */
export function empStats(d: State, empId: string) {
  const ts = d.tasks.filter(t => t.assignee === empId && t.type === 'pick'); const done = ts.filter(t => ['Completed', 'Short Completed'].includes(t.status));
  const lines = done.reduce((a, t) => a + t.lines.length, 0); const ok = done.reduce((a, t) => a + t.lines.filter(l => l.status === 'Done').length, 0); const wrong = done.reduce((a, t) => a + t.wrongScans, 0);
  const mins = done.filter(t => t.startedAt && t.completedAt).map(t => (t.completedAt! - t.startedAt!) / 60000); const late = ts.filter(t => (t.deadline && t.completedAt && t.completedAt > t.deadline) || (t.deadline && !t.completedAt && !['Cancelled'].includes(t.status) && now() > t.deadline)).length;
  const pa = d.tasks.filter(t => t.assignee === empId && t.type === 'putaway' && t.status === 'Completed').length; const packs = d.packs.filter(p => p.packedBy === d.employees.find(e => e.id === empId)?.name).length;
  const hrs = mins.reduce((a, b) => a + b, 0) / 60;
  return { tasks: ts.length, done: done.length, putaway: pa, packs, accuracy: lines ? Math.round((ok / (lines + wrong)) * 1000) / 10 : 100, avgMin: mins.length ? Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 10) / 10 : 0, late, lph: hrs > 0 ? Math.round(lines / hrs) : 0 };
}
export const userRole = (d: State): Role => (me(d)?.role ?? 'auditor');
export { me as currentUser };
