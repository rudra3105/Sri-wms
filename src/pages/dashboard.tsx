import React, { useMemo, useState } from 'react';
import { Warehouse, Boxes, Package, Layers, CheckCircle2, Lock, AlertOctagon, ShieldAlert, IndianRupee, Gauge, Truck, PackageCheck, ClipboardList, PackageOpen, Hourglass, Timer, AlertTriangle, CalendarClock, CalendarX, Users, Factory, TrendingUp, Wallet, Plus, ScanLine, ShoppingCart, ShieldCheck, FileBarChart, Percent, Bell } from 'lucide-react';
import { useS, go, act } from '../store';
import { Card, Stat, Btn, Select, PageHeader, Badge, Status, ProgressBar, DataTable, Empty, Tabs, cx } from '../ui';
import { summary, trends, valuationByCategory, salesBy, empPerf, pickAccuracy, dispatchAccuracy, liveAlerts, capacity, slowDead, movement, visibleWh } from '../calc';
import { TrendChart, BarsChart, PAL } from '../charts';
import { inr, inrC, num, ftime } from '../util';
import { prod } from '../core';

export function Overview() {
  const s = useS(); const [days, setDays] = useState(14); const [cat, setCat] = useState('ALL'); const wh = s.session.wh;
  const sm = useMemo(() => summary(s, wh, cat), [s, wh, cat]); const tr = useMemo(() => trends(s, days, wh), [s, days, wh]);
  const val = useMemo(() => valuationByCategory(s, wh).slice(0, 8), [s, wh]); const sb = useMemo(() => salesBy(s), [s]); const perf = useMemo(() => empPerf(s), [s]);
  const alerts = useMemo(() => liveAlerts(s), [s]); const cap = useMemo(() => capacity(s), [s]); const mv = useMemo(() => movement(s, days), [s, days]); const sd = useMemo(() => slowDead(s, wh), [s, wh]);
  const fast = Object.entries(mv).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([sku, q]) => ({ name: (prod(s, sku)?.name || sku).slice(0, 22), qty: q }));
  const whData = s.warehouses.map(w => ({ name: w.code, util: Math.round(cap.per[w.id]?.cap ? (cap.per[w.id].used / cap.per[w.id].cap) * 100 : 0) }));
  const pendingTasks = ['Unassigned', 'Assigned', 'In Progress'].map(st => ({ name: st, picking: s.tasks.filter(t => t.type === 'pick' && t.status === st).length, putaway: s.tasks.filter(t => t.type === 'putaway' && t.status === st).length }));
  const recent = [...s.audit].reverse().slice(0, 9);
  return <div>
    <PageHeader title="Operations Overview" sub={`SRI WMS · ${s.org.name} · all figures derive from live transactions`} icon={Gauge} actions={<>
      <Select value={days} onChange={e => setDays(+e.target.value)} className="!w-36"><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>
      <Select value={cat} onChange={e => setCat(e.target.value)} className="!w-44"><option value="ALL">All categories</option>{s.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      <Select value={wh} onChange={e => act(d => { d.session.wh = e.target.value; })} className="!w-44"><option value="ALL">All warehouses</option>{visibleWh(s).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></>} />
    <div className="flex flex-wrap gap-2 mb-4">
      <Btn size="sm" icon={Plus} variant="accent" perm="product.write" onClick={() => go('products', { create: true })}>New product</Btn><Btn size="sm" icon={PackageOpen} variant="secondary" perm="inward.write" onClick={() => go('inward', { create: true })}>Receive goods</Btn>
      <Btn size="sm" icon={ShoppingCart} variant="secondary" perm="order.write" onClick={() => go('orders', { create: true })}>New order</Btn><Btn size="sm" icon={ShieldCheck} variant="secondary" perm="gate.scan" onClick={() => go('gate')}>Gate verification</Btn>
      <Btn size="sm" icon={ScanLine} variant="secondary" onClick={() => act(d => { d.session.mode = 'mobile'; })}>Open mobile app</Btn><Btn size="sm" icon={FileBarChart} variant="secondary" onClick={() => go('reports')}>Reports</Btn></div>

    <h2 className="text-[11px] font-bold text-mute mb-2">Inventory & capacity</h2>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
      <Stat icon={Warehouse} label="Warehouses" value={sm.warehouses} onClick={() => go('warehouses')} /><Stat icon={Boxes} label="SKUs in stock" value={sm.skus} /><Stat icon={Package} label="Total products" value={sm.products} onClick={() => go('products')} />
      <Stat icon={Layers} label="Total stock qty" value={num(sm.total)} tone="teal" onClick={() => go('inventory')} /><Stat icon={CheckCircle2} label="Available" value={num(sm.avail)} tone="green" /><Stat icon={Lock} label="Reserved" value={num(sm.reserved)} tone="orange" />
      <Stat icon={AlertOctagon} label="Damaged" value={num(sm.damaged)} tone="red" /><Stat icon={ShieldAlert} label="Quarantined" value={num(sm.quarantine)} tone="amber" onClick={() => go('qc')} /><Stat icon={IndianRupee} label="Inventory valuation" value={inrC(sm.value)} tone="teal" />
      <Stat icon={Gauge} label="Warehouse capacity" value={num(sm.capacity)} sub="storage slots" /><Stat icon={Percent} label="Utilization" value={sm.util.toFixed(1) + '%'} tone={sm.util > 85 ? 'red' : 'teal'} /><Stat icon={Users} label="Customers / Suppliers" value={`${sm.customers} / ${sm.suppliers}`} /></div>
    <h2 className="text-[11px] font-bold text-mute mb-2">Orders & logistics</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
      <Stat icon={Truck} label="Inbound shipments" value={sm.inbound} onClick={() => go('inward')} /><Stat icon={Truck} label="Outbound in transit" value={sm.outbound} tone="orange" onClick={() => go('deliveries')} /><Stat icon={ClipboardList} label="Pending orders" value={sm.pending} onClick={() => go('orders')} /><Stat icon={Timer} label="Being picked" value={sm.picking} tone="amber" onClick={() => go('picking')} />
      <Stat icon={PackageCheck} label="Awaiting packing" value={sm.awaitPack} tone="amber" onClick={() => go('packing')} /><Stat icon={ShieldCheck} label="Awaiting dispatch" value={sm.awaitDispatch} tone="amber" onClick={() => go('gate')} /><Stat icon={CheckCircle2} label="Delivered" value={sm.delivered} tone="green" /><Stat icon={Hourglass} label="Delayed orders" value={sm.delayed} tone={sm.delayed ? 'red' : 'green'} /></div>
    <h2 className="text-[11px] font-bold text-mute mb-2">Risk & business</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
      <Stat icon={AlertTriangle} label="Low-stock products" value={sm.low} tone="amber" sub={`${sm.out} out of stock`} onClick={() => go('inventory', { filter: 'low' })} /><Stat icon={CalendarClock} label="Near-expiry batches" value={sm.nearExp} tone="amber" sub={`${num(sm.nearExpUnits)} units`} /><Stat icon={CalendarX} label="Expired batches" value={sm.expired} tone="red" sub={`${num(sm.expUnits)} units`} />
      <Stat icon={Users} label="Customers" value={sm.customers} onClick={() => go('customers')} /><Stat icon={Factory} label="Suppliers" value={sm.suppliers} onClick={() => go('suppliers')} /><Stat icon={TrendingUp} label="Today's sales" value={inr(sm.today)} tone="green" /><Stat icon={Wallet} label="Receivables" value={inrC(sm.receivables)} tone="orange" onClick={() => go('outstanding')} /></div>

    <div className="grid xl:grid-cols-3 gap-4 mb-4">
      <Card className="xl:col-span-2" title="Inbound vs outbound (units)" sub="Posted GRNs, returns & transfers-in vs dispatched units"><TrendChart area data={tr} keys={[{ k: 'inbound', name: 'Inbound', color: PAL.teal }, { k: 'outbound', name: 'Outbound', color: PAL.orange }]} /></Card>
      <Card title="Alerts & notifications" actions={<Btn size="sm" variant="ghost" onClick={() => go('activity')}>View all</Btn>}>
        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">{alerts.slice(0, 8).map((a, i) => <div key={i} onClick={() => go(a.module)} className="flex gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded-lg p-1.5"><span className={cx('mt-1.5 h-2 w-2 rounded-full shrink-0', a.sev === 'critical' ? 'bg-red-500' : a.sev === 'warning' ? 'bg-amber-500' : 'bg-blue-500')} /><div><div className="font-semibold leading-tight">{a.title}</div><div className="text-xs text-mute">{a.body}</div></div></div>)}{!alerts.length && <Empty title="All clear" />}</div></Card>
    </div>
    <div className="grid lg:grid-cols-3 gap-4 mb-4">
      <Card title="Order fulfilment trend" sub="Orders created vs shipments dispatched"><BarsChart data={tr.slice(-Math.min(days, 14))} x="day" keys={[{ k: 'created', name: 'Orders created', color: PAL.navy }, { k: 'fulfilled', name: 'Dispatches', color: PAL.teal }]} /></Card>
      <Card title="Daily stock movements" sub="Transactions posted to the stock ledger"><TrendChart data={tr} keys={[{ k: 'moves', name: 'Movements', color: PAL.violet }]} /></Card>
      <Card title="Capacity utilization by warehouse" sub="% of storage slots occupied"><BarsChart data={whData} keys={[{ k: 'util', name: 'Utilization %', color: PAL.teal }]} fmt={n => n + '%'} /></Card>
    </div>
    <div className="grid lg:grid-cols-3 gap-4 mb-4">
      <Card title="Inventory valuation by category" sub="Top 8 · at cost"><BarsChart horizontal data={val} keys={[{ k: 'value', name: 'Value', color: PAL.navy }]} fmt={inrC} height={260} /></Card>
      <Card title="Fast-moving products" sub={`Units dispatched, last ${days} days`}>{fast.length ? <BarsChart horizontal data={fast} x="name" keys={[{ k: 'qty', name: 'Units', color: PAL.orange }]} height={260} /> : <Empty title="No dispatches yet" />}</Card>
      <Card title="Top-selling products" sub="By invoiced value"><BarsChart horizontal data={sb.prods.slice(0, 7).map(p => ({ name: p.name.slice(0, 22), rev: Math.round(p.rev) }))} keys={[{ k: 'rev', name: 'Revenue', color: PAL.teal }]} fmt={inrC} height={260} /></Card>
    </div>
    <div className="grid lg:grid-cols-3 gap-4 mb-4">
      <Card title="Customer sales performance" sub="Invoiced value by customer"><BarsChart horizontal data={sb.custs.slice(0, 7).map(c => ({ name: c.name.replace('Customer A – ', 'Cust. A – ').slice(0, 22), v: c.value }))} keys={[{ k: 'v', name: 'Sales', color: PAL.navy }]} fmt={inrC} height={260} /></Card>
      <Card title="Pending tasks" sub="Open picking & putaway work"><BarsChart data={pendingTasks} keys={[{ k: 'picking', name: 'Picking', color: PAL.orange }, { k: 'putaway', name: 'Putaway', color: PAL.teal }]} stack height={200} />
        <div className="grid grid-cols-2 gap-3 mt-3"><div className="rounded-lg bg-slate-50 p-2.5"><div className="text-[11px] text-mute font-semibold">Picking accuracy</div><div className="text-lg font-bold">{pickAccuracy(s)}%</div></div><div className="rounded-lg bg-slate-50 p-2.5"><div className="text-[11px] text-mute font-semibold">Dispatch accuracy</div><div className="text-lg font-bold">{dispatchAccuracy(s)}%</div></div></div></Card>
      <Card title="Employee performance" actions={<Btn size="sm" variant="ghost" onClick={() => go('productivity')}>Details</Btn>}>
        <div className="space-y-2.5">{perf.slice(0, 6).map(p => <div key={p.e.id}><div className="flex justify-between text-sm"><span className="font-medium truncate">{p.e.name}</span><span className="text-mute text-xs">{p.done} tasks · {p.accuracy}% acc.</span></div><ProgressBar pct={p.accuracy} tone="bg-brand-teal" /></div>)}</div></Card>
    </div>
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Slow-moving & dead stock" sub={`Dead: no movement > 90 days · Slow: > ${s.settings.slowDays} days`}><div className="flex gap-2 mb-2"><Badge tone="red">{sd.dead.length} dead</Badge><Badge tone="amber">{sd.slow.length} slow</Badge></div>
        <div className="space-y-1.5 text-sm max-h-48 overflow-y-auto">{[...sd.dead, ...sd.slow].slice(0, 8).map((x: any) => <div key={x.p.sku} className="flex justify-between"><span className="truncate pr-2">{x.p.name}</span><span className="text-mute tabular-nums">{inrC(x.value)}</span></div>)}</div></Card>
      <Card className="lg:col-span-2" title="Recent activity" actions={<Btn size="sm" variant="ghost" onClick={() => go('audit')}>Audit log</Btn>}><div className="divide-y divide-slate-100">{recent.map(a => <div key={a.id} className="py-1.5 flex items-center gap-3 text-sm"><span className="text-[11px] text-mute w-28 shrink-0">{ftime(a.at)}</span><span className="font-medium">{a.action}</span><span className="text-mute truncate">· {a.ref}{a.next ? ` → ${a.next}` : ''}</span><span className="ml-auto text-xs text-mute shrink-0">{a.user}</span></div>)}</div></Card>
    </div>
  </div>;
}

export function Activity() {
  const s = useS(); const [tab, setTab] = useState('alerts'); const alerts = liveAlerts(s); const notifs = [...s.notifs].reverse();
  return <div><PageHeader title="Activity Center" sub="Live alerts, notifications and operational events" icon={Bell} actions={<Btn variant="secondary" size="sm" onClick={() => act(d => { d.notifs.forEach(n => (n.read = true)); })}>Mark all read</Btn>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ k: 'alerts', label: 'Critical alerts', count: alerts.length }, { k: 'notifs', label: 'Notifications', count: s.notifs.filter(n => !n.read).length }, { k: 'scans', label: 'Scan history', count: s.scans.length }]} />
    {tab === 'alerts' && <Card pad={false}><div className="divide-y divide-slate-100">{alerts.map((a, i) => <div key={i} onClick={() => go(a.module)} className="flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer"><Badge tone={a.sev === 'critical' ? 'red' : a.sev === 'warning' ? 'amber' : 'blue'}>{a.sev}</Badge><div><div className="font-semibold text-sm">{a.title}</div><div className="text-xs text-mute">{a.body}</div></div></div>)}{!alerts.length && <Empty title="No active alerts" sub="Everything is within thresholds." />}</div></Card>}
    {tab === 'notifs' && <Card pad={false}><div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">{notifs.slice(0, 80).map(n => <div key={n.id} onClick={() => { act(d => { const x = d.notifs.find(y => y.id === n.id); if (x) x.read = true; }); go(n.module === 'putaway' || n.module === 'picking' ? n.module : n.module); }} className={cx('flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50', !n.read && 'bg-teal-50/40')}><Badge tone={n.sev === 'critical' ? 'red' : n.sev === 'warning' ? 'amber' : n.sev === 'success' ? 'green' : 'blue'}>{n.sev}</Badge><div className="flex-1"><div className="font-semibold text-sm">{n.title}</div><div className="text-xs text-mute">{n.body}</div></div><div className="text-[11px] text-mute shrink-0">{ftime(n.at)}</div></div>)}</div></Card>}
    {tab === 'scans' && <Card><DataTable rows={[...s.scans].reverse()} search={r => r.code + r.ctx + r.result} cols={[{ h: 'Time', r: r => ftime(r.at) }, { h: 'Code', r: r => <span className="font-mono text-xs">{r.code}</span> }, { h: 'Context', r: r => r.ctx }, { h: 'Result', r: r => <Status s={r.result} /> }, { h: 'By', r: r => r.by }]} /></Card>}
  </div>;
}
