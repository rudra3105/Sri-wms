import { buildSeed } from '../src/seed';
import * as E from '../src/engine';
import { qrP, qrL, qrK, totals, outstanding, priceFor } from '../src/core';
import { addDays, now } from '../src/util';
import { produce } from 'immer';
import assert from 'node:assert';

const t0 = Date.now();
let d = buildSeed();
console.log(`seed ok in ${Date.now() - t0}ms`, {
  wh: d.warehouses.length, zones: d.zones.length, racks: d.racks.length, products: d.products.length, cats: d.categories.length, customers: d.customers.length, suppliers: d.suppliers.length, emps: d.employees.length,
  orders: d.orders.length, pos: d.pos.length, inwards: d.inwards.length, tasks: d.tasks.length, picks: d.tasks.filter(t => t.type === 'pick').length, dispatches: d.dispatches.length, invoices: d.invoices.length, stock: d.stock.length, ledger: d.ledger.length, audit: d.audit.length, notifs: d.notifs.length, approvals: d.approvals.filter(a => a.status === 'Pending').length,
});
console.log('order status:', Object.entries(d.orders.reduce((a: any, o) => ((a[o.status] = (a[o.status] || 0) + 1), a), {})));
// invariants
for (const s of d.stock) { assert(s.qty >= 0 && s.reserved >= 0 && s.picked >= 0, 'neg ' + s.id); assert(s.reserved + s.picked <= s.qty, `over-commit ${s.id} ${s.sku} q${s.qty} r${s.reserved} p${s.picked}`); }
const as = (r: string) => { d = produce(d, (x: any) => { x.session.userId = 'U-' + r; }); };
const run = <T>(fn: () => T): T => { let out: any; d = produce(d, (x: any) => { const keep = d; void keep; const save = d; d = x; try { out = fn(); } finally { d = save; } }); return out; };
// NOTE: fn closes over `d`; run() swaps d for the draft during the call
const step = (n: number, msg: string) => console.log(`STEP ${n}: ${msg}`);

as('superadmin');
step(2, 'create product');
run(() => E.saveProduct(d, { sku: 'SRI-0001', name: 'Sri Premium Basmati 5kg', cat: 'C01', uom: 'Bag', price: 650, cost: 480, tax: 5, tracking: 'batch', expiry: true, storage: 'ambient', hsn: '1006', rop: 50, roq: 200 }, true));
assert(d.products.length === 101);
step(3, 'receiving'); as('receiving');
const inId = run(() => E.createInward(d, { supplierId: 'S01', wh: 'WH1', vehicle: 'TN 10 AB 1234', driver: 'Selvam' }));
step(4, 'scan'); let r: any = run(() => E.scanInward(d, inId, qrP('SRI-0001'))); assert(r.ok && r.code === 'OK', JSON.stringify(r));
r = run(() => E.scanInward(d, inId, 'garbage')); assert(r.code === 'INVALID_QR'); r = run(() => E.scanInward(d, inId, 'SRI|P|ZZZ-999')); assert(r.code === 'UNKNOWN_SKU');
const lid = d.inwards.find(x => x.id === inId)!.lines[0].id;
step(5, '100 units'); run(() => E.recordLine(d, inId, lid, { received: 100, batch: 'B2611-001', mfg: addDays(now(), -30), exp: addDays(now(), 335) }));
r = run(() => E.scanInward(d, inId, qrP('SRI-0001'))); assert(r.code === 'DUPLICATE');
step(6, 'GRN'); const g = run(() => E.submitInward(d, inId)); console.log('  GRN', g.grnNo);
const before = totals(d, 'SRI-0001').total; assert(before === 0, 'inventory must not update before approval');
step(7, 'approve GRN'); as('whmanager'); const ap = d.approvals.find(a => a.type === 'grn' && a.status === 'Pending' && a.payload.inId === inId)!;
as('receiving'); try { run(() => E.decideApproval(d, ap.id, true, '')); assert.fail('should not approve'); } catch (e: any) { console.log('  non-approver blocked:', e.message); }
as('whmanager'); run(() => E.decideApproval(d, ap.id, true, 'ok'));
step(8, 'putaway task'); const task = d.tasks.find(t => t.type === 'putaway' && t.lines[0].sku === 'SRI-0001')!; console.log('  suggestion:', task.lines[0].suggested); assert(task.lines[0].suggested === 'A-01-02-05', 'suggested ' + task.lines[0].suggested);
assert(totals(d, 'SRI-0001').total === 100 && totals(d, 'SRI-0001').available === 0, 'staged not available');
step(9, 'assign'); as('supervisor'); run(() => E.assignTask(d, task.id, { empId: 'E105', deadlineMin: 30, destBin: 'A-01-02-05' }));
step(10, 'scan product + wrong rack then right'); as('putaway');
r = run(() => E.completePutaway(d, task.id, { product: qrP('SRI-0001'), location: qrL('A-01-02-04') })); assert(!r.ok); console.log('  wrong loc:', r.msg);
r = run(() => E.completePutaway(d, task.id, { product: qrP('SRI-0001'), location: qrL('A-01-02-05') })); assert(r.ok, r.msg);
step(11, 'inventory'); let tt = totals(d, 'SRI-0001'); assert(tt.total === 100 && tt.available === 100, JSON.stringify(tt)); assert(d.stock.find(s => s.sku === 'SRI-0001')!.bin === 'A-01-02-05');
step(12, 'customer A'); as('sales');
step(13, 'price'); const pr = priceFor(d, 'C01', 'SRI-0001', 20); console.log('  price', pr); assert(Math.abs(pr.rate - 650 * 0.93) < 0.01);
step(14, 'order 20'); const oid = run(() => E.createOrder(d, { customerId: 'C01', wh: 'WH1', lines: [{ sku: 'SRI-0001', qty: 20 }] }));
step(15, 'confirm/reserve'); run(() => E.confirmOrder(d, oid)); tt = totals(d, 'SRI-0001'); assert(tt.reserved === 20 && tt.available === 80 && tt.total === 100, JSON.stringify(tt));
const o = () => d.orders.find(x => x.id === oid)!; assert(o().status === 'Reserved');
step(16, 'assign pick 10min'); as('supervisor'); run(() => E.assignTask(d, o().taskId!, { empId: 'E106', deadlineMin: 10 })); assert(o().status === 'Picking');
step(18, 'pick'); as('picker'); const pt = () => d.tasks.find(t => t.id === o().taskId)!;
r = run(() => E.pickLine(d, pt().id, 0, { product: qrP('RIC-001'), location: qrL('A-01-02-05'), qty: 20 })); assert(!r.ok); console.log('  wrong item:', r.msg);
r = run(() => E.pickLine(d, pt().id, 0, { product: qrP('SRI-0001'), location: qrL('A-01-02-05'), qty: 20 })); assert(r.ok, r.msg); run(() => E.completePick(d, pt().id)); assert(o().status === 'Picked');
as('picker2'); try { run(() => E.startTask(d, pt().id)); } catch { }
step(19, 'pack'); as('packer'); run(() => E.packOrder(d, oid, { packages: [{ type: 'Carton', weight: 12, dims: '40x30x30', items: [{ sku: 'SRI-0001', qty: 20 }] }], checklist: { a: true, b: true, c: true, d: true } })); assert(o().status === 'Packed');
step(20, 'gate'); as('gate'); const gid = run(() => E.gateOpen(d, oid)); const gt = () => d.gates.find(x => x.id === gid)!;
run(() => E.gateScanPackage(d, gid, qrK(o().pkgIds[0])));
step(21, 'scan 21'); r = run(() => E.gateScanItem(d, gid, qrP('SRI-0001'), 21)); run(() => E.gateVerify(d, gid)); console.log('  ', gt().verified!.result); assert(gt().verified!.result === 'EXCESS QUANTITY DETECTED');
step(22, 'blocked'); assert(gt().status === 'Blocked'); try { as('supervisor'); run(() => E.gateApproveDispatch(d, gid)); assert.fail('must block'); } catch (e: any) { console.log('  ', e.message); }
step(23, 'correct to 20'); as('gate'); r = run(() => E.gateScanItem(d, gid, qrP('SRI-0001'), 20)); assert(r.code === 'DUPLICATE'); r = run(() => E.gateScanItem(d, gid, qrP('SRI-0001'), 20, { correct: true })); assert(r.ok);
step(24, 'verified'); run(() => E.gateVerify(d, gid)); assert(gt().verified!.result.startsWith('VERIFIED') && gt().status === 'Verified');
step(25, 'supervisor approves'); as('supervisor'); const ref = run(() => E.gateApproveDispatch(d, gid)); console.log('  ref', ref);
step(26, 'dispatch'); as('gate'); const did = run(() => E.confirmDispatch(d, gid, { vehicle: 'TN 01 ZZ 9999', driver: 'Ramesh', transporter: 'Demo Logistics', method: 'Road' }));
step(27, 'inventory 80'); tt = totals(d, 'SRI-0001'); assert(tt.total === 80 && tt.available === 80 && tt.reserved === 0 && tt.picked === 0, JSON.stringify(tt)); assert(o().status === 'Dispatched');
step(28, 'invoice'); const inv = d.invoices.find(i => i.id === d.dispatches.find(x => x.id === did)!.invoiceId)!; console.log('  ', inv.no, inv.total, 'CGST', inv.cgst, 'SGST', inv.sgst, 'challan', inv.challanNo); assert(inv.lines[0].qty === 20 && inv.total > 0);
step(29, 'deliver'); const dp = d.dispatches.find(x => x.id === did)!; try { run(() => E.deliver(d, did, { otp: '0000', receivedBy: 'x', signature: true, photo: false })); assert.fail(); } catch (e: any) { console.log('  ', e.message); }
run(() => E.deliver(d, did, { otp: dp.otp, receivedBy: 'Anand Raj', signature: true, photo: true })); assert(o().status === 'Delivered');
// invariants again
for (const s of d.stock) { assert(s.qty >= 0 && s.reserved >= 0 && s.picked >= 0); assert(s.reserved + s.picked <= s.qty, 'overcommit'); }
// negative stock / double allocation test
as('sales'); const big = run(() => E.createOrder(d, { customerId: 'C02', wh: 'WH1', lines: [{ sku: 'SRI-0001', qty: 500 }] }));
try { run(() => E.confirmOrder(d, big)); assert.fail('should fail'); } catch (e: any) { console.log('insufficient stock blocked:', e.message); }
assert(totals(d, 'SRI-0001').reserved === 0, 'rollback');
// audit chain
import { hash } from '../src/util';
let prev = 'GENESIS'; for (const a of d.audit) { const h = hash(prev + JSON.stringify([a.id, a.at, a.user, a.action, a.entity, a.ref, a.prev, a.next, a.reason])); assert(h === a.hash, 'audit chain broken at ' + a.id); prev = a.hash; }
console.log('audit chain OK,', d.audit.length, 'entries');
console.log('ALL SCENARIO CHECKS PASSED');
