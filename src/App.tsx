import React, { useEffect, useMemo, useState } from 'react';
import { Bell, LogOut, Menu, Smartphone } from 'lucide-react';
import { useS, act, go, logout, switchRole, curUser } from './store';
import { ROLE_META, can } from './perms';
import { Toaster, Select, DemoTag, cx } from './ui';
import { visibleWh, liveAlerts } from './calc';
import { Login } from './pages/login';
import { Home } from './pages/home';
import { Overview, Activity } from './pages/dashboard';
import { Warehouses, Locations, Racks } from './pages/warehouse';
import { Products, Labels } from './pages/products';
import { Inward, QC, Putaway } from './pages/inbound';
import { Inventory, Transfers, Counting, Adjustments } from './pages/inventory';
import { Customers, PriceLists, Orders, Allocation } from './pages/sales';
import { Picking, Packing, Gate, Dispatch, Deliveries, Returns } from './pages/fulfil';
import { Suppliers, Requisitions, POs, SupplierInvoices } from './pages/procure';
import { Invoices, Payments, Ledger, CreditNotes, Outstanding } from './pages/finance';
import { Employees, Tasks, Shifts, Productivity } from './pages/people';
import { Reports, Analytics, AIAssistant, Forecasting } from './pages/intel';
import { UsersPage, Roles, Notifications, Integrations, Approvals, Audit, Settings } from './pages/admin';
import { MobileApp } from './pages/mobile';
import { Portal } from './pages/portal';

const PAGES: Record<string, React.ComponentType> = { home: Home, overview: Overview, activity: Activity, warehouses: Warehouses, locations: Locations, racks: Racks, products: Products, labels: Labels, inward: Inward, qc: QC, putaway: Putaway, inventory: Inventory, transfers: Transfers, counting: Counting, adjustments: Adjustments, customers: Customers, pricelists: PriceLists, orders: Orders, allocation: Allocation, picking: Picking, packing: Packing, gate: Gate, dispatch: Dispatch, deliveries: Deliveries, returns: Returns, suppliers: Suppliers, requisitions: Requisitions, pos: POs, supplierinv: SupplierInvoices, invoices: Invoices, payments: Payments, ledger: Ledger, creditnotes: CreditNotes, outstanding: Outstanding, employees: Employees, tasks: Tasks, shifts: Shifts, productivity: Productivity, reports: Reports, analytics: Analytics, ai: AIAssistant, forecasting: Forecasting, users: UsersPage, roles: Roles, notifications: Notifications, integrations: Integrations, approvals: Approvals, audit: Audit, settings: Settings };

/** Ten sections, each with a few tabs. A page key is the same one the rest of the app navigates with. */
const SECTIONS: { id: string; label: string; pages: [string, string][] }[] = [
  { id: 'home', label: 'Home', pages: [['home', 'Today'], ['approvals', 'Approvals'], ['notifications', 'Notifications']] },
  { id: 'receiving', label: 'Receiving', pages: [['inward', 'Goods inward'], ['qc', 'Quality check'], ['putaway', 'Putaway']] },
  { id: 'stock', label: 'Stock', pages: [['inventory', 'Inventory'], ['products', 'Products'], ['labels', 'Labels and scan'], ['transfers', 'Transfers'], ['counting', 'Stock count'], ['adjustments', 'Adjustments']] },
  { id: 'sales', label: 'Sales', pages: [['orders', 'Orders'], ['customers', 'Customers'], ['pricelists', 'Price lists'], ['allocation', 'Allocation'], ['returns', 'Returns']] },
  { id: 'shipping', label: 'Shipping', pages: [['picking', 'Picking'], ['packing', 'Packing'], ['gate', 'Gate check'], ['dispatch', 'Dispatch'], ['deliveries', 'Deliveries']] },
  { id: 'finance', label: 'Finance', pages: [['invoices', 'Invoices'], ['payments', 'Payments'], ['ledger', 'Customer ledger'], ['creditnotes', 'Credit notes'], ['outstanding', 'Overdue']] },
  { id: 'purchasing', label: 'Purchasing', pages: [['suppliers', 'Suppliers'], ['requisitions', 'Requests'], ['pos', 'Purchase orders'], ['supplierinv', 'Supplier bills']] },
  { id: 'team', label: 'Team', pages: [['employees', 'People'], ['tasks', 'Tasks'], ['shifts', 'Shifts'], ['productivity', 'Productivity']] },
  { id: 'insights', label: 'Insights', pages: [['overview', 'Dashboard'], ['reports', 'Reports'], ['analytics', 'Analytics'], ['forecasting', 'Forecast'], ['ai', 'Assistant'], ['activity', 'Activity']] },
  { id: 'setup', label: 'Setup', pages: [['warehouses', 'Warehouses'], ['locations', 'Locations'], ['racks', 'Rack map'], ['users', 'Users'], ['roles', 'Roles'], ['integrations', 'Integrations'], ['audit', 'Audit log'], ['settings', 'Settings']] },
];
const allowed = (s: any, k: string) => k === 'home' || (!!PAGES[k] && can(s, 'view:' + k));
const sectionOf = (k: string) => SECTIONS.find(x => x.pages.some(p => p[0] === k)) || SECTIONS[0];

export function App() {
  const s = useS(); const u = curUser(s); const [bell, setBell] = useState(false); const [navOpen, setNavOpen] = useState(false);
  const real = s.users.find(x => x.id === (s.session.impersonating || s.session.userId));
  const alertCount = useMemo(() => liveAlerts(s).filter(a => a.sev === 'critical').length, [s]);
  const page = s.session.page;
  useEffect(() => { if (u && s.session.mode === 'console' && !allowed(s, page)) go('home'); }, [page, s.session.userId]);
  if (!u) return <><Login /><Toaster /></>;
  if (u.role === 'customer' || s.session.mode === 'portal') return <><Portal /><Toaster /></>;
  if (s.session.mode === 'mobile') return <><MobileApp /><Toaster /></>;
  const sec = sectionOf(page); const tabs = sec.pages.filter(p => allowed(s, p[0])); const visibleSecs = SECTIONS.filter(x => x.pages.some(p => allowed(s, p[0])));
  const Page = PAGES[page] && allowed(s, page) ? PAGES[page] : Home; const unread = s.notifs.filter(n => !n.read).length; const isSuper = real?.role === 'superadmin';
  return <div className="min-h-screen bg-bg flex flex-col">
    {s.session.impersonating && <div className="bg-amber-300 text-navy text-sm px-4 py-1.5 flex items-center justify-between no-print"><span>You are viewing the app as <b>{u.name}</b> ({ROLE_META[u.role]?.label}).</span><button className="font-medium underline" onClick={() => switchRole(s.session.impersonating!)}>Back to Super Administrator</button></div>}
    <header className="bg-white border-b border-line no-print sticky top-0 z-30">
      <div className="max-w-[1320px] mx-auto px-4 h-12 flex items-center gap-4">
        <button onClick={() => go('home')} className="font-bold text-[17px] tracking-tight shrink-0">SRI<span className="text-brand-orange"> WMS</span></button>
        <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">{visibleSecs.map(x => <button key={x.id} onClick={() => go(x.pages.find(p => allowed(s, p[0]))![0])} className={cx('px-2 h-12 text-sm whitespace-nowrap border-b-2 -mb-px', x.id === sec.id ? 'border-brand-orange text-ink font-semibold' : 'border-transparent text-slate-500 hover:text-ink')}>{x.label}</button>)}</nav>
        <button className="md:hidden ml-auto" onClick={() => setNavOpen(!navOpen)} aria-label="Menu"><Menu size={20} /></button>
        <div className="hidden md:flex items-center gap-2 shrink-0 ml-auto">
          <Select value={s.session.wh} onChange={e => act(d => { d.session.wh = e.target.value; })} className="!w-44 !py-1 !text-[13px]"><option value="ALL">All warehouses</option>{visibleWh(s).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
          {isSuper && <Select value={s.session.impersonating ? s.session.userId! : ''} onChange={e => e.target.value && switchRole(e.target.value)} className="!w-28 !py-1 !text-[13px]"><option value="">View as…</option>{s.users.filter(x => x.id !== real?.id).map(x => <option key={x.id} value={x.id}>{ROLE_META[x.role]?.label} – {x.name}</option>)}</Select>}
          <button title="Open mobile app" onClick={() => act(d => { d.session.mode = 'mobile'; })} className="p-1.5 rounded hover:bg-slate-100"><Smartphone size={17} /></button>
          <div className="relative"><button title="Notifications" onClick={() => setBell(!bell)} className="p-1.5 rounded hover:bg-slate-100 relative"><Bell size={17} />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-1 rounded-full bg-brand-orange text-white text-[10px] font-semibold grid place-items-center">{unread > 99 ? '99+' : unread}</span>}</button>
            {bell && <div className="absolute right-0 mt-2 w-80 bg-white rounded-md border border-line shadow-lg z-50 pop"><div className="px-3 py-2 border-b border-line text-sm font-semibold flex justify-between">Notifications{alertCount > 0 && <span className="text-red-600 font-normal text-xs">{alertCount} critical</span>}</div><div className="max-h-80 overflow-auto">{[...s.notifs].reverse().slice(0, 8).map(n => <button key={n.id} onClick={() => { act(d => { const x = d.notifs.find(y => y.id === n.id); if (x) x.read = true; }); setBell(false); }} className={cx('w-full text-left px-3 py-2 border-b border-line text-sm hover:bg-slate-50', !n.read && 'bg-orange-50/60')}><b className="block font-medium">{n.title}</b><span className="text-xs text-slate-600">{n.body}</span></button>)}</div><button onClick={() => { go('notifications'); setBell(false); }} className="w-full text-center text-sm text-brand-teal py-2">See all</button></div>}</div>
          <span className="text-sm text-slate-600 pl-2 border-l border-line">{u.name.split(' ')[0]}</span>
          <button title="Sign out" onClick={logout} className="p-1.5 rounded hover:bg-slate-100"><LogOut size={17} /></button>
        </div>
      </div>
      {navOpen && <div className="md:hidden border-t border-line bg-white px-4 py-2 grid grid-cols-2 gap-1">{visibleSecs.map(x => <button key={x.id} onClick={() => { go(x.pages.find(p => allowed(s, p[0]))![0]); setNavOpen(false); }} className={cx('text-left py-2 text-sm', x.id === sec.id ? 'font-semibold' : 'text-slate-600')}>{x.label}</button>)}<button className="text-left py-2 text-sm text-slate-600" onClick={() => act(d => { d.session.mode = 'mobile'; })}>Mobile app</button><button className="text-left py-2 text-sm text-slate-600" onClick={logout}>Sign out</button></div>}
      {tabs.length > 1 && <div className="border-t border-line bg-[#FBFCFD]"><div className="max-w-[1320px] mx-auto px-4 flex gap-5 overflow-x-auto">{tabs.map(p => <button key={p[0]} onClick={() => go(p[0])} className={cx('py-2 text-[13px] whitespace-nowrap border-b-2 -mb-px', p[0] === page ? 'border-ink text-ink font-semibold' : 'border-transparent text-slate-500 hover:text-ink')}>{p[1]}</button>)}</div></div>}
    </header>
    <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 py-6" onClick={() => bell && setBell(false)}><Page /></main>
    <footer className="text-xs text-mute text-center py-4 no-print">{s.org.name} · Powered by Webrise Global™ · <DemoTag>Demo data</DemoTag></footer>
    <Toaster /></div>;
}
