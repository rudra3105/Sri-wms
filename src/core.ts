import { State, Product, StockRec, Order, Customer, Role, Rack, Zone } from './types';
import { now, dayStart, pad, hash, round2, DAY, SHELVES, BINS } from './util';

export class WmsError extends Error {}
export const fail = (m: string): never => { throw new WmsError(m); };

/* ---------- QR payloads ---------- */
export const qrP = (sku: string) => `SRI|P|${sku}`;
export const qrL = (bin: string) => `SRI|L|${bin}`;
export const qrR = (rack: string) => `SRI|R|${rack}`;
export const qrK = (pkg: string) => `SRI|K|${pkg}`;
export const qrO = (no: string) => `SRI|O|${no}`;
export const qrB = (sku: string, batch: string) => `SRI|B|${sku}|${batch}`;
export type Parsed = { kind: 'P' | 'L' | 'R' | 'K' | 'O' | 'B' | 'INVALID'; value: string; extra?: string; manual?: boolean };
export function parseCode(raw: string): Parsed {
  const s = (raw || '').trim();
  let m = /^SRI\|([PLRKOB])\|(.+)$/i.exec(s);
  if (m) { const parts = m[2].split('|'); return { kind: m[1].toUpperCase() as any, value: parts[0], extra: parts[1] }; }
  const u = s.toUpperCase();
  if (/^[A-Z]{2,4}-\d{3,5}$/.test(u)) return { kind: 'P', value: u, manual: true };
  if (/^[A-Z]-\d{2}-\d{2}-\d{2}$/.test(u)) return { kind: 'L', value: u, manual: true };
  if (/^[A-Z]-\d{2}$/.test(u)) return { kind: 'R', value: u, manual: true };
  if (/^SO-\d{4}-\d+-P\d+$/.test(u)) return { kind: 'K', value: u, manual: true };
  return { kind: 'INVALID', value: s };
}

/* ---------- actor, numbering, audit, notify, ledger ---------- */
export const me = (d: State) => d.users.find(u => u.id === d.session.userId);
export const actorName = (d: State) => me(d)?.name ?? 'System';
export const actorRole = (d: State): Role | 'system' => me(d)?.role ?? 'system';
export const actorEmp = (d: State) => me(d)?.empId;
export function nextNo(d: State, key: string, prefix: string, width = 4, year = true) {
  const n = (d.counters[key] || 0) + 1; d.counters[key] = n;
  return `${prefix}${year ? new Date(now()).getFullYear() + '-' : ''}${pad(n, width)}`;
}
export function nextId(d: State, key: string) { const n = (d.counters['id_' + key] || 0) + 1; d.counters['id_' + key] = n; return `${key}${n}`; }
export function audit(d: State, action: string, entity: string, ref: string, x: { prev?: any; next?: any; reason?: string } = {}) {
  const prevHash = d.audit.length ? d.audit[d.audit.length - 1].hash : 'GENESIS';
  const rec: any = { id: d.audit.length + 1, at: now(), user: actorName(d), role: actorRole(d), action, entity, ref, prev: x.prev == null ? undefined : String(x.prev), next: x.next == null ? undefined : String(x.next), reason: x.reason };
  rec.hash = hash(prevHash + JSON.stringify([rec.id, rec.at, rec.user, action, entity, ref, rec.prev, rec.next, rec.reason]));
  d.audit.push(rec);
}
export function notify(d: State, title: string, body: string, sev: 'info' | 'success' | 'warning' | 'critical', module: string, roles?: Role[]) {
  d.notifs.push({ id: (d.notifs[d.notifs.length - 1]?.id ?? 0) + 1, at: now(), title, body, sev, module, roles, read: false });
  if (d.notifs.length > 400) d.notifs.splice(0, d.notifs.length - 400);
}
export function mv(d: State, m: { type: string; sku: string; qty: number; delta: number; wh: string; from?: string | null; to?: string | null; batch?: string; ref?: string; reason?: string }) {
  d.ledger.push({ id: (d.ledger[d.ledger.length - 1]?.id ?? 0) + 1, at: now(), by: actorName(d), ...m });
}

/* ---------- lookups ---------- */
export const prod = (d: State, sku: string) => d.products.find(p => p.sku === sku);
export const prodOrFail = (d: State, sku: string) => prod(d, sku) ?? fail(`Unknown SKU ${sku}`);
export const cust = (d: State, id: string) => d.customers.find(c => c.id === id);
export const sup = (d: State, id: string) => d.suppliers.find(c => c.id === id);
export const whOf = (d: State, id: string) => d.warehouses.find(w => w.id === id);
export const stockOf = (d: State, id: string) => d.stock.find(s => s.id === id);
export const orderOf = (d: State, id: string) => d.orders.find(o => o.id === id) ?? fail('Order not found');
export const empName = (d: State, id?: string) => d.employees.find(e => e.id === id)?.name ?? '—';
export const custName = (d: State, id?: string) => cust(d, id || '')?.name ?? '—';
export const supName = (d: State, id?: string) => sup(d, id || '')?.name ?? '—';
export const prodName = (d: State, sku: string) => prod(d, sku)?.name ?? sku;

/* ---------- stock helpers ---------- */
export const isExpired = (s: { exp: number | null }, t = now()) => s.exp != null && s.exp < dayStart(t);
export const nearExpiry = (s: { exp: number | null }, days: number, t = now()) => s.exp != null && !isExpired(s, t) && s.exp <= dayStart(t) + days * DAY;
export const avail = (s: StockRec) => (s.status === 'Available' && s.bin && !isExpired(s) ? Math.max(0, s.qty - s.reserved - s.picked) : 0);
export function totals(d: State, sku?: string, wh?: string) {
  const r = { total: 0, available: 0, reserved: 0, picked: 0, damaged: 0, quarantine: 0, transit: 0, staged: 0, expired: 0, value: 0 };
  const cost: Record<string, number> = {}; d.products.forEach(p => (cost[p.sku] = p.cost));
  for (const s of d.stock) {
    if ((sku && s.sku !== sku) || (wh && wh !== 'ALL' && s.wh !== wh)) continue;
    r.total += s.qty; r.value += s.qty * (cost[s.sku] || 0);
    if (s.status === 'Available') { r.available += avail(s); r.reserved += s.reserved; r.picked += s.picked; if (isExpired(s)) r.expired += s.qty; }
    else if (s.status === 'Damaged') r.damaged += s.qty; else if (s.status === 'Quarantine') r.quarantine += s.qty;
    else if (s.status === 'InTransit') r.transit += s.qty; else r.staged += s.qty;
  }
  return r;
}
export function cleanupStock(d: State) { d.stock = d.stock.filter(s => s.qty > 0 || s.reserved > 0 || s.picked > 0); }

/* ---------- locations ---------- */
export const binParts = (bin: string) => { const [z, n, sh, b] = bin.split('-'); return { zone: z, rack: `${z}-${n}`, shelf: +sh, bin: +b }; };
export const rackOf = (d: State, id: string): Rack | undefined => d.racks.find(r => r.id === id);
export const zoneOf = (d: State, id: string): Zone | undefined => d.zones.find(z => z.id === id);
export const binCap = (d: State, bin: string) => zoneOf(d, binParts(bin).zone)?.binCap ?? 0;
export function binUsed(d: State, bin: string, excludeId?: string) {
  let u = 0; for (const s of d.stock) if (s.bin === bin && s.id !== excludeId) u += s.qty * (prod(d, s.sku)?.slot ?? 1); return u;
}
export const binValid = (d: State, bin: string) => { if (!/^[A-Z]-\d{2}-\d{2}-\d{2}$/.test(bin)) return false; const p = binParts(bin); return !!rackOf(d, p.rack) && p.shelf >= 1 && p.shelf <= SHELVES && p.bin >= 1 && p.bin <= BINS; };
export function canStore(d: State, p: Product, bin: string, qty: number, excludeId?: string): string | null {
  if (!binValid(d, bin)) return `Invalid location ${bin}`;
  const bp = binParts(bin); const rk = rackOf(d, bp.rack)!; const z = zoneOf(d, rk.zone)!;
  if (rk.blocked) return `Rack ${rk.id} is blocked`;
  if (rk.maint) return `Rack ${rk.id} is under maintenance`;
  if (d.blockedBins.includes(bin)) return `Bin ${bin} is blocked`;
  if (z.storage !== p.storage) return `${p.name} needs ${p.storage} storage – ${bin} is in a ${z.storage} zone`;
  const other = d.stock.find(s => s.bin === bin && s.sku !== p.sku && s.id !== excludeId);
  if (other) return `Bin ${bin} already holds ${other.sku} – mixed SKUs are not allowed in one bin`;
  const need = qty * p.slot, used = binUsed(d, bin, excludeId), cap = z.binCap;
  if (used + need > cap) return `Capacity exceeded at ${bin}: ${used + need} > ${cap} (free ${cap - used} slots)`;
  return null;
}
export function suggestBin(d: State, p: Product, qty: number, wh: string): { bin: string; reason: string } | null {
  const same = d.stock.find(s => s.sku === p.sku && s.bin && s.wh === wh && s.status === 'Available' && !canStore(d, p, s.bin, qty));
  if (same?.bin) return { bin: same.bin, reason: 'Consolidate with existing stock of the same SKU' };
  const zones = d.zones.filter(z => z.wh === wh && z.storage === p.storage).sort((a, b) => a.id.localeCompare(b.id));
  for (const z of zones) for (const r of d.racks.filter(r => r.zone === z.id && !r.blocked && !r.maint).sort((a, b) => a.id.localeCompare(b.id)))
    for (let sh = 1; sh <= SHELVES; sh++) for (let b = 1; b <= BINS; b++) {
      const bin = `${r.id}-${pad(sh, 2)}-${pad(b, 2)}`;
      if (d.stock.some(s => s.bin === bin)) continue;
      if (!canStore(d, p, bin, qty)) return { bin, reason: `First compatible empty bin in ${z.name} (${p.storage}); capacity fits ${qty * p.slot}/${z.binCap}` };
    }
  return null;
}

/* ---------- approvals (request side) ---------- */
export function approverRoles(d: State, type: string): Role[] { return d.approvalRules[type]?.roles ?? ['whmanager']; }
export function canApprove(d: State, role: Role | string, type: string) { return role === 'superadmin' || !!d.approvalRules[type]?.roles.includes(role as Role); }
export function requestApproval(d: State, a: { type: string; ref: string; payload: any; reason: string; prev?: string; next?: string }) {
  const id = nextId(d, 'APR');
  d.approvals.push({ id, no: nextNo(d, 'apr', 'APR-', 4, false), type: a.type, ref: a.ref, payload: a.payload, reason: a.reason, status: 'Pending', by: actorName(d), at: now(), prev: a.prev, next: a.next });
  audit(d, 'Approval requested', a.type, a.ref, { prev: a.prev, next: a.next, reason: a.reason });
  notify(d, `Approval needed: ${d.approvalRules[a.type]?.label ?? a.type}`, `${a.ref} – ${a.reason}`, 'warning', 'approvals', approverRoles(d, a.type));
  return id;
}

/* ---------- pricing & order maths ---------- */
export function priceFor(d: State, customerId: string, sku: string, qty: number, at = now()) {
  const p = prodOrFail(d, sku); const c = cust(d, customerId);
  const es = d.prices.filter(e => e.customerId === customerId && e.sku === sku && e.approved && e.from <= at && (e.to == null || e.to >= at) && e.minQty <= qty);
  if (es.length) { es.sort((a, b) => b.minQty - a.minQty || a.rate - b.rate); const e = es[0]; return { rate: e.rate, source: `${e.type} rate${e.minQty > 1 ? ` (≥${e.minQty})` : ''}`, std: p.price }; }
  const disc = c?.baseDiscount || 0; let rate = p.price * (1 - disc / 100); let source = disc ? `Customer discount ${disc}%` : 'Standard rate';
  if (qty >= 500) { rate *= 0.96; source += ' + volume −4%'; } else if (qty >= 100) { rate *= 0.98; source += ' + volume −2%'; }
  return { rate: round2(rate), source, std: p.price };
}
export function calcOrder(d: State, o: Order) {
  let sub = 0, tax = 0;
  for (const l of o.lines) { const amt = l.qty * l.rate * (1 - l.discPct / 100); sub += amt; tax += (amt * l.tax) / 100; }
  tax += ((o.freight + o.packing) * d.settings.freightTax) / 100;
  o.subtotal = round2(sub); o.taxTotal = round2(tax); o.total = round2(sub + tax + o.freight + o.packing);
}
export const outstanding = (d: State, cid: string) => round2(d.invoices.filter(i => i.customerId === cid && i.status !== 'Cancelled' && i.type === 'Tax Invoice').reduce((a, i) => a + i.total - i.paid - i.credited, 0) + d.notes.filter(n => n.kind === 'Debit' && n.customerId === cid).reduce((a, n) => a + n.amount, 0) - (cust(d, cid)?.advance || 0));
export const fyOf = (t: number) => { const dt = new Date(t); const y = dt.getFullYear() % 100; return dt.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
