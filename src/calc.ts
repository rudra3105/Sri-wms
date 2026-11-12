import { State, Move } from './types';
import { now, DAY, dayStart, dayKey, fshort, round2, SHELVES, BINS } from './util';
import { totals, isExpired, nearExpiry, outstanding, prod, avail } from './core';
import { empStats } from './engine';

export const scopeWh = (s: State) => { const u = s.users.find(x => x.id === s.session.userId); const sc = u?.wh ?? ['*']; return sc.includes('*') ? null : sc; };
/** warehouses visible to the current user (null = all) combined with the topbar filter */
export function whFilter(s: State): (wh: string) => boolean {
  const sc = scopeWh(s); const sel = s.session.wh;
  return (wh: string) => (sc ? sc.includes(wh) : true) && (sel === 'ALL' || sel === wh);
}
export const visibleWh = (s: State) => s.warehouses.filter(w => { const sc = scopeWh(s); return sc ? sc.includes(w.id) : true; });

export function capacity(s: State, wh?: string) {
  let cap = 0, used = 0; const per: Record<string, { cap: number; used: number }> = {};
  for (const r of s.racks) { if (wh && wh !== 'ALL' && r.wh !== wh) continue; const z = s.zones.find(z => z.id === r.zone)!; const c = z.binCap * SHELVES * BINS; cap += c; (per[r.wh] ||= { cap: 0, used: 0 }).cap += c; }
  for (const k of s.stock) { if (!k.bin) continue; if (wh && wh !== 'ALL' && k.wh !== wh) continue; const u = k.qty * (prod(s, k.sku)?.slot ?? 1); used += u; (per[k.wh] ||= { cap: 0, used: 0 }).used += u; }
  return { cap, used, pct: cap ? (used / cap) * 100 : 0, per };
}
export function rackUse(s: State, rackId: string) {
  const z = s.zones.find(z => z.id === rackId[0])!; const cap = z.binCap * SHELVES * BINS; let used = 0; for (const k of s.stock) if (k.bin && k.bin.startsWith(rackId + '-')) used += k.qty * (prod(s, k.sku)?.slot ?? 1); return { cap, used, pct: cap ? (used / cap) * 100 : 0 };
}
export function lowStock(s: State, wh = 'ALL') {
  return s.products.filter(p => p.status === 'Active').map(p => { const t = totals(s, p.sku, wh); return { p, avail: t.available, total: t.total }; }).filter(x => x.avail <= x.p.rop).sort((a, b) => a.avail / (a.p.rop || 1) - b.avail / (b.p.rop || 1));
}
export function movement(s: State, days = 30) {
  const since = now() - days * DAY; const m: Record<string, number> = {}; for (const l of s.ledger) if (l.type === 'DISPATCH' && l.at >= since) m[l.sku] = (m[l.sku] || 0) + l.qty; return m;
}
export function lastMove(s: State) { const m: Record<string, number> = {}; for (const l of s.ledger) if (l.delta !== 0 || l.type === 'DISPATCH' || l.type === 'GRN') m[l.sku] = Math.max(m[l.sku] || 0, l.at); return m; }
export function slowDead(s: State, wh = 'ALL') {
  const lm = lastMove(s); const t = now(); const out = { dead: [] as any[], slow: [] as any[] };
  for (const p of s.products) { const tt = totals(s, p.sku, wh); if (tt.total <= 0) continue; const age = (t - (lm[p.sku] || 0)) / DAY; if (age > 90) out.dead.push({ p, qty: tt.total, value: tt.total * p.cost, age }); else if (age > s.settings.slowDays) out.slow.push({ p, qty: tt.total, value: tt.total * p.cost, age }); }
  return out;
}
export function summary(s: State, wh = 'ALL', cat = 'ALL') {
  const okWh = (w: string) => wh === 'ALL' || w === wh; const okCat = (sku: string) => cat === 'ALL' || prod(s, sku)?.cat === cat;
  const st = s.stock.filter(k => okWh(k.wh) && okCat(k.sku)); const r = { total: 0, avail: 0, reserved: 0, damaged: 0, quarantine: 0, value: 0, nearExp: 0, expired: 0, nearExpUnits: 0, expUnits: 0 }; const skus = new Set<string>();
  for (const k of st) { const p = prod(s, k.sku)!; r.total += k.qty; r.value += k.qty * p.cost; if (k.qty > 0) skus.add(k.sku); if (k.status === 'Available') { r.avail += avail(k); r.reserved += k.reserved; if (isExpired(k)) { r.expired++; r.expUnits += k.qty; } else if (nearExpiry(k, s.settings.nearExpiryDays)) { r.nearExp++; r.nearExpUnits += k.qty; } } else if (k.status === 'Damaged') r.damaged += k.qty; else if (k.status === 'Quarantine') r.quarantine += k.qty; }
  const orders = s.orders.filter(o => okWh(o.wh)); const by = (...st: string[]) => orders.filter(o => st.includes(o.status)).length; const cap = capacity(s, wh); const t0 = dayStart(now());
  const delayed = orders.filter(o => !['Delivered', 'Cancelled', 'Dispatched', 'Partially Fulfilled'].includes(o.status) && ((o.deliveryDate && o.deliveryDate < t0) || s.tasks.some(t => t.orderId === o.id && t.deadline && !t.completedAt && ['Assigned', 'In Progress'].includes(t.status) && t.deadline < now()))).length;
  const ls = lowStock(s, wh).filter(x => cat === 'ALL' || x.p.cat === cat);
  return { warehouses: s.warehouses.length, skus: skus.size, products: s.products.length, ...r, capacity: cap.cap, used: cap.used, util: cap.pct,
    inbound: s.pos.filter(p => ['Approved', 'Sent', 'Partially Received'].includes(p.status) && okWh(p.wh)).length + s.inwards.filter(i => i.status !== 'Approved' && i.status !== 'Rejected' && okWh(i.wh)).length, outbound: s.dispatches.filter(x => x.status === 'In Transit').length,
    pending: by('Draft', 'Confirmed', 'On Hold', 'Reserved'), picking: by('Picking'), awaitPack: by('Picked'), awaitDispatch: by('Packed', 'Gate Verification'), delivered: by('Delivered'), delayed, low: ls.length, out: ls.filter(x => x.avail === 0).length,
    customers: s.customers.length, suppliers: s.suppliers.length, today: s.invoices.filter(i => i.date >= t0 && i.status !== 'Cancelled').reduce((a, i) => a + i.total, 0), receivables: s.customers.reduce((a, c) => a + Math.max(0, outstanding(s, c.id)), 0) };
}
export function trends(s: State, days: number, wh = 'ALL') {
  const out: { day: string; inbound: number; outbound: number; moves: number; created: number; fulfilled: number; sales: number }[] = []; const idx: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) { const t = now() - i * DAY; idx[dayKey(t)] = out.length; out.push({ day: fshort(t), inbound: 0, outbound: 0, moves: 0, created: 0, fulfilled: 0, sales: 0 }); }
  for (const l of s.ledger as Move[]) { const k = dayKey(l.at); if (!(k in idx) || (wh !== 'ALL' && l.wh !== wh)) continue; const o = out[idx[k]]; if (['GRN', 'RETURN', 'TRANSFER_IN'].includes(l.type)) o.inbound += l.qty; if (['DISPATCH'].includes(l.type)) o.outbound += l.qty; if (!['RESERVE', 'RELEASE', 'OPENING'].includes(l.type)) o.moves++; }
  for (const o of s.orders) { if (wh !== 'ALL' && o.wh !== wh) continue; const k = dayKey(o.createdAt); if (k in idx) out[idx[k]].created++; }
  for (const dp of s.dispatches) { const k = dayKey(dp.at); if (k in idx) out[idx[k]].fulfilled++; }
  for (const i of s.invoices) { const k = dayKey(i.date); if (k in idx && i.status !== 'Cancelled') out[idx[k]].sales += i.total; }
  return out;
}
export function valuationByCategory(s: State, wh = 'ALL') {
  const m: Record<string, number> = {}; for (const k of s.stock) { if (wh !== 'ALL' && k.wh !== wh) continue; const p = prod(s, k.sku)!; m[p.cat] = (m[p.cat] || 0) + k.qty * p.cost; }
  return s.categories.map(c => ({ name: c.name, value: Math.round(m[c.id] || 0) })).sort((a, b) => b.value - a.value);
}
export function salesBy(s: State) {
  const prods: Record<string, { qty: number; rev: number }> = {}; const custs: Record<string, number> = {};
  for (const i of s.invoices) { if (i.status === 'Cancelled') continue; custs[i.customerId] = (custs[i.customerId] || 0) + i.total; for (const l of i.lines) { const x = (prods[l.sku] ||= { qty: 0, rev: 0 }); x.qty += l.qty; x.rev += l.taxable; } }
  return { prods: Object.entries(prods).map(([sku, v]) => ({ sku, name: prod(s, sku)?.name || sku, ...v })).sort((a, b) => b.rev - a.rev), custs: Object.entries(custs).map(([id, v]) => ({ id, name: s.customers.find(c => c.id === id)?.name || id, value: Math.round(v) })).sort((a, b) => b.value - a.value) };
}
export function dispatchAccuracy(s: State) { const g = s.gates.filter(x => x.verified); if (!g.length) return 100; const ok = g.filter(x => !x.events.some(e => e.sev === 'red' && e.kind !== 'RESOLVED')).length; return round2((ok / g.length) * 100); }
export function pickAccuracy(s: State) { const ts = s.tasks.filter(t => t.type === 'pick' && ['Completed', 'Short Completed'].includes(t.status)); const lines = ts.reduce((a, t) => a + t.lines.length, 0); const ok = ts.reduce((a, t) => a + t.lines.filter(l => l.status === 'Done').length, 0); const w = ts.reduce((a, t) => a + t.wrongScans, 0); return lines ? round2((ok / (lines + w)) * 100) : 100; }
export function empPerf(s: State) { return s.employees.filter(e => ['picker', 'putaway', 'packer'].includes(e.role)).map(e => ({ e, ...empStats(s, e.id) })); }

export type Alert = { sev: 'critical' | 'warning' | 'info'; title: string; body: string; module: string };
export function liveAlerts(s: State): Alert[] {
  const a: Alert[] = []; const ls = lowStock(s); ls.filter(x => x.avail === 0).slice(0, 3).forEach(x => a.push({ sev: 'critical', title: 'Out of stock', body: `${x.p.name} (${x.p.sku})`, module: 'inventory' }));
  ls.filter(x => x.avail > 0).slice(0, 4).forEach(x => a.push({ sev: 'warning', title: 'Low stock', body: `${x.p.name}: ${x.avail} available ≤ reorder point ${x.p.rop}`, module: 'inventory' }));
  const sm = summary(s); if (sm.expired) a.push({ sev: 'critical', title: 'Expired stock on hand', body: `${sm.expired} batch(es) / ${sm.expUnits} units expired – blocked from allocation`, module: 'inventory' }); if (sm.nearExp) a.push({ sev: 'warning', title: 'Near-expiry stock', body: `${sm.nearExp} batch(es) expire within ${s.settings.nearExpiryDays} days`, module: 'inventory' });
  s.tasks.filter(t => t.type === 'pick' && t.deadline && !t.completedAt && ['Assigned', 'In Progress'].includes(t.status)).forEach(t => { const m = (t.deadline! - now()) / 60000; if (m < 0) a.push({ sev: 'critical', title: 'Picking task overdue', body: `${t.no} overdue by ${Math.ceil(-m)} min`, module: 'picking' }); else if (m < 5) a.push({ sev: 'warning', title: 'Picking deadline approaching', body: `${t.no} due in ${Math.ceil(m)} min`, module: 'picking' }); });
  s.gates.filter(g => g.status === 'Blocked').forEach(g => a.push({ sev: 'critical', title: 'Dispatch blocked', body: `${g.no}: ${g.verified?.result}`, module: 'gate' }));
  const pend = s.approvals.filter(x => x.status === 'Pending').length; if (pend) a.push({ sev: 'warning', title: 'Approvals waiting', body: `${pend} request(s) need a decision`, module: 'approvals' });
  s.tasks.filter(t => t.assist && !['Completed', 'Cancelled'].includes(t.status)).forEach(t => a.push({ sev: 'warning', title: 'Assistance requested', body: `${t.no}: ${t.assist}`, module: 'tasks' }));
  const un = s.tasks.filter(t => t.status === 'Unassigned').length; if (un) a.push({ sev: 'info', title: 'Unassigned tasks', body: `${un} putaway/picking task(s) waiting for assignment`, module: 'tasks' });
  s.customers.forEach(c => { const o = outstanding(s, c.id); if (o > c.creditLimit * 0.9 && o > 0) a.push({ sev: 'warning', title: 'Credit limit nearly used', body: `${c.name}: ₹${Math.round(o).toLocaleString('en-IN')} of ₹${c.creditLimit.toLocaleString('en-IN')}`, module: 'outstanding' }); });
  return a;
}
export function forecast(s: State) {
  const days = 30; const mv = movement(s, days); const t = now();
  return s.products.filter(p => p.status === 'Active').map(p => {
    const sold = mv[p.sku] || 0; const daily = sold / days; const tt = totals(s, p.sku); const cover = daily > 0 ? tt.available / daily : Infinity; const onOrder = s.pos.filter(po => ['Approved', 'Sent', 'Partially Received'].includes(po.status)).reduce((a, po) => a + (po.lines.find(l => l.sku === p.sku) ? po.lines.find(l => l.sku === p.sku)!.qty - po.lines.find(l => l.sku === p.sku)!.received : 0), 0);
    const lead = 7; const target = Math.ceil(daily * (lead + 14)); const suggest = Math.max(0, target - tt.available - onOrder);
    return { p, sold, daily, avail: tt.available, cover, onOrder, suggest: tt.available + onOrder <= Math.max(p.rop, daily * lead) ? Math.max(p.roq, suggest) : 0, risk: cover < lead ? 'Stock-out risk' : cover < 14 ? 'Watch' : 'Healthy', t };
  });
}
