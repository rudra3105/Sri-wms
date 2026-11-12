import React, { useMemo } from 'react';
import { useS, go, act, curUser } from '../store';
import { can } from '../perms';
import { summary, lowStock, whFilter } from '../calc';
import { canApprove, actorRole, isExpired, nearExpiry } from '../core';
import { Btn, Card, cx } from '../ui';
import { inr, inrC, num, ftime, now } from '../util';

type Item = { n: number; text: string; to: string; label: string; params?: any; tone?: 'red' | 'amber' | 'normal' };

const STAGES: { label: string; to: string; match: string[] }[] = [
  { label: 'Draft', to: 'orders', match: ['Draft', 'Confirmed'] },
  { label: 'Reserved', to: 'orders', match: ['Reserved'] },
  { label: 'Picking', to: 'picking', match: ['Picking', 'In Progress'] },
  { label: 'To pack', to: 'packing', match: ['Picked'] },
  { label: 'At gate', to: 'gate', match: ['Packed', 'Gate Verification'] },
  { label: 'On the road', to: 'deliveries', match: ['Dispatched', 'Partially Fulfilled'] },
  { label: 'Delivered', to: 'orders', match: ['Delivered'] },
];

export function Home() {
  const s = useS(); const u = curUser(s)!; const role = actorRole(s as any); const wh = s.session.wh; const ok = whFilter(s);
  const sm = useMemo(() => summary(s, wh), [s, wh]);
  const items = useMemo(() => {
    const L: Item[] = []; const add = (i: Item) => { if (i.n > 0 && can(s, 'view:' + i.to)) L.push(i); };
    const orders = s.orders.filter(o => ok(o.wh)); const by = (...st: string[]) => orders.filter(o => st.includes(o.status)).length;
    const tasks = s.tasks.filter(t => ok(t.wh));
    add({ n: s.approvals.filter(a => a.status === 'Pending' && canApprove(s as any, role as any, a.type) && a.by !== u.name).length, text: 'requests are waiting for your approval', to: 'approvals', label: 'Review', tone: 'amber' });
    add({ n: tasks.filter(t => ['Assigned', 'In Progress'].includes(t.status) && t.deadline && t.deadline < now()).length, text: 'tasks are past their deadline', to: 'tasks', label: 'See tasks', tone: 'red' });
    add({ n: s.gates.filter(g => g.status === 'Blocked').length, text: 'dispatches are blocked at the gate', to: 'gate', label: 'Resolve', tone: 'red' });
    add({ n: orders.filter(o => o.status === 'On Hold').length, text: 'orders are on hold', to: 'orders', label: 'Open orders', tone: 'amber' });
    add({ n: tasks.filter(t => t.type === 'putaway' && t.status === 'Unassigned').length, text: 'received pallets need a putaway operator', to: 'putaway', label: 'Assign' });
    add({ n: s.inwards.filter(i => ok(i.wh) && i.status === 'Scanning').length, text: 'goods receipts are in progress', to: 'inward', label: 'Continue' });
    add({ n: by('Draft'), text: 'draft orders are not confirmed yet', to: 'orders', label: 'Confirm' });
    add({ n: tasks.filter(t => t.type === 'pick' && t.status === 'Unassigned').length, text: 'orders are waiting for a picker', to: 'picking', label: 'Assign' });
    add({ n: by('Picked'), text: 'orders are picked and ready to pack', to: 'packing', label: 'Pack' });
    add({ n: by('Packed', 'Gate Verification'), text: 'orders are packed and need a gate check', to: 'gate', label: 'Check' });
    add({ n: s.gates.filter(g => g.status === 'Dispatch Approved').length, text: 'orders are approved and need a vehicle', to: 'dispatch', label: 'Dispatch' });
    add({ n: s.dispatches.filter(d => d.status === 'In Transit').length, text: 'shipments are on the road', to: 'deliveries', label: 'Track' });
    add({ n: s.returns.filter(r => ['Received'].includes(r.status)).length, text: 'returns are waiting for inspection', to: 'returns', label: 'Inspect' });
    add({ n: lowStock(s, wh).length, text: 'products are at or below reorder level', to: 'inventory', label: 'View', params: { filter: 'low' } });
    add({ n: s.stock.filter(k => ok(k.wh) && k.status === 'Available' && (isExpired(k) || nearExpiry(k, s.settings.nearExpiryDays)) && k.qty > 0).length, text: 'batches are expired or close to expiry', to: 'inventory', label: 'View' });
    add({ n: s.invoices.filter(i => ['Issued', 'Partially Paid'].includes(i.status) && i.due < now()).length, text: 'invoices are overdue', to: 'outstanding', label: 'Follow up' });
    return L;
  }, [s, wh, role]);
  const mine = s.tasks.filter(t => t.assignee === u.empId && ['Assigned', 'In Progress'].includes(t.status)).length;
  const orders = s.orders.filter(o => ok(o.wh)); const first = u.name.split(' ')[0]; const hr = new Date(now()).getHours();
  const actions = [['New order', 'orders', { create: true }, 'order.write'], ['Receive goods', 'inward', { create: true }, 'inward.write'], ['Add product', 'products', { create: true }, 'product.write'], ['Check at the gate', 'gate', undefined, 'gate.scan'], ['Record a payment', 'payments', undefined, 'invoice.write'], ['Count stock', 'counting', undefined, 'count.write']] as const;
  const figs = [['Stock value', inrC(sm.value)], ['Units available', num(sm.avail)], ['Space used', sm.util.toFixed(0) + '%'], ['Sales today', inrC(sm.today)], ['To collect', inrC(sm.receivables)]];
  return <div className="max-w-5xl">
    <h1 className="text-[26px] font-semibold tracking-tight leading-tight">{hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}, {first}.</h1>
    <p className="text-mute mt-1">{items.length ? `${items.length} thing${items.length > 1 ? 's' : ''} need attention${wh === 'ALL' ? '' : ' in ' + (s.warehouses.find(w => w.id === wh)?.name || wh)}.` : 'Nothing is waiting on you right now.'}{mine > 0 && <> You also have <button className="text-brand-teal font-medium underline underline-offset-2" onClick={() => act(d => { d.session.mode = 'mobile'; })}>{mine} assigned task{mine > 1 ? 's' : ''}</button> on mobile.</>}</p>

    <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-y border-line py-3">{figs.map(([l, v]) => <div key={l}><div className="text-xs text-mute">{l}</div><div className="text-xl font-semibold tabular-nums">{v}</div></div>)}</div>

    <div className="grid lg:grid-cols-5 gap-8 mt-7">
      <section className="lg:col-span-3">
        <h2 className="font-semibold mb-2">To do</h2>
        {items.length === 0 ? <p className="text-sm text-mute py-6">All clear. New work shows up here as it arrives.</p> :
          <ul className="divide-y divide-line border-y border-line">{items.map((i, k) => <li key={k} className="flex items-center gap-3 py-2.5"><span className={cx('w-9 text-right text-lg font-semibold tabular-nums', i.tone === 'red' ? 'text-red-600' : i.tone === 'amber' ? 'text-amber-700' : 'text-ink')}>{i.n}</span><span className="flex-1 text-[15px]">{i.text}</span><Btn size="sm" variant="secondary" onClick={() => go(i.to, i.params)}>{i.label}</Btn></li>)}</ul>}
      </section>
      <section className="lg:col-span-2">
        <h2 className="font-semibold mb-2">Start something</h2>
        <ul className="border-y border-line divide-y divide-line">{actions.filter(a => can(s, a[3]) && can(s, 'view:' + a[1])).map(a => <li key={a[0]}><button onClick={() => go(a[1], a[2] as any)} className="w-full text-left py-2.5 text-[15px] hover:text-brand-teal flex justify-between"><span>{a[0]}</span><span className="text-mute">›</span></button></li>)}
          <li><button onClick={() => act(d => { d.session.mode = 'mobile'; })} className="w-full text-left py-2.5 text-[15px] hover:text-brand-teal flex justify-between"><span>Open the mobile app</span><span className="text-mute">›</span></button></li></ul>
      </section>
    </div>

    {can(s, 'view:orders') && <section className="mt-9"><h2 className="font-semibold mb-3">Where orders are right now</h2>
      <div className="flex">{STAGES.map((st, i) => { const n = orders.filter(o => st.match.includes(o.status)).length; return <button key={st.label} onClick={() => go(st.to)} className="group flex-1 min-w-0 text-left"><div className="flex items-center"><span className={cx('h-2.5 w-2.5 rounded-full shrink-0', n ? 'bg-brand-teal' : 'bg-slate-300')} /><span className={cx('h-px flex-1', i === STAGES.length - 1 ? 'bg-transparent' : 'bg-slate-300')} /></div><div className="mt-1.5 text-2xl font-semibold tabular-nums group-hover:text-brand-teal">{n}</div><div className="text-xs text-mute truncate pr-2">{st.label}</div></button>; })}</div></section>}

    <section className="mt-9 mb-6"><div className="flex items-baseline justify-between"><h2 className="font-semibold mb-2">Latest activity</h2>{can(s, 'view:activity') && <button className="text-sm text-brand-teal" onClick={() => go('activity')}>See all</button>}</div>
      <ul className="divide-y divide-line border-y border-line text-sm">{[...s.audit].reverse().slice(0, 7).map(a => <li key={a.id} className="py-2 flex gap-3"><span className="w-40 shrink-0 text-mute whitespace-nowrap">{ftime(a.at)}</span><span className="flex-1"><b className="font-medium">{a.user}</b> {a.action.toLowerCase()} {a.ref ? <span className="text-mute">{a.ref}</span> : null}</span></li>)}</ul></section>
  </div>;
}
