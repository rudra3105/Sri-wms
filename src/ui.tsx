import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { X, Search, ChevronUp, ChevronDown, ScanLine, Inbox, Camera } from 'lucide-react';
import { useS, useToasts } from './store';
import { can } from './perms';
import { Product } from './types';
import { now } from './util';

export const cx = (...a: any[]) => a.filter(Boolean).join(' ');

/* ---------- tones ---------- */
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'teal' | 'orange' | 'navy';
const TONE: Record<Tone, string> = { green: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-700', blue: 'bg-sky-50 text-sky-800', gray: 'bg-slate-100 text-slate-600', teal: 'bg-teal-50 text-teal-800', orange: 'bg-orange-50 text-orange-800', navy: 'bg-navy/90 text-white' };
const DOT: Record<Tone, string> = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-sky-500', gray: 'bg-slate-400', teal: 'bg-teal-500', orange: 'bg-orange-500', navy: 'bg-navy' };
export const Badge = ({ tone = 'gray', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) => <span className={cx('inline-flex items-center rounded px-1.5 py-px text-xs font-medium whitespace-nowrap', TONE[tone], className)}>{children}</span>;
export const statusTone = (s: string): Tone => {
  const x = (s || '').toLowerCase();
  if (/(reject|cancel|block|damag|fail|expired|short|overdue|critical|invalid|excess|mismatch|critical|incorrect|unpaid)/.test(x)) return 'red';
  if (/(deliver|approved|complete|paid|active|available|verified|closed|posted|converted|done|^ok|success|dispatched|received$|ready)/.test(x)) return 'green';
  if (/(pending|hold|quarantine|open|assigned|progress|partial|re-inspection|transit|reserved|picking|scanning|requested|awaiting|rma issued|low|near)/.test(x)) return 'amber';
  if (/(draft|confirmed|sent|packed|picked|gate|issued|unassigned|inactive|new)/.test(x)) return 'blue';
  return 'gray';
};
export const Status = ({ s }: { s: string }) => { const t = statusTone(s); return <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap"><span className={cx('h-1.5 w-1.5 rounded-full', DOT[t])} />{s}</span>; };

/* ---------- buttons ---------- */
type BtnProps = { children?: React.ReactNode; onClick?: (e: any) => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'success'; size?: 'sm' | 'md' | 'lg'; perm?: string | null; icon?: any; disabled?: boolean; title?: string; className?: string; type?: 'button' | 'submit' };
export function Btn({ children, onClick, variant = 'primary', size = 'md', perm, icon: Icon, disabled, title, className, type = 'button' }: BtnProps) {
  const s = useS(); const allowed = can(s, perm); const off = disabled || !allowed;
  const v = { primary: 'bg-navy text-white hover:bg-navy-700', accent: 'bg-brand-orange text-white hover:bg-orange-600', success: 'bg-emerald-600 text-white hover:bg-emerald-700', secondary: 'bg-white text-ink border border-slate-300 hover:bg-slate-50', ghost: 'text-slate-600 hover:bg-slate-100', danger: 'bg-red-600 text-white hover:bg-red-700' }[variant];
  const z = { sm: 'px-2.5 py-1 text-[13px] gap-1', md: 'px-3.5 py-1.5 text-sm gap-1.5', lg: 'px-5 py-2.5 text-sm gap-2' }[size];
  return <button type={type} title={!allowed ? `Your role does not have permission (${perm})` : title} disabled={off} onClick={onClick} className={cx('inline-flex items-center justify-center rounded-md font-medium transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal', v, z, className)}>{Icon && <Icon size={size === 'sm' ? 13 : 15} />}{children}</button>;
}

/* ---------- layout ---------- */
export const Card = ({ title, sub, actions, children, className, pad = true }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; pad?: boolean }) => (
  <section className={cx('bg-white rounded-md border border-line', className)}>
    {(title || actions) && <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-1"><div><h3 className="font-semibold text-sm text-ink">{title}</h3>{sub && <p className="text-xs text-mute mt-0.5">{sub}</p>}</div><div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div></header>}
    <div className={pad ? 'px-4 pb-4 pt-2' : ''}>{children}</div>
  </section>
);
export const PageHeader = ({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode; icon?: any }) => (
  <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
    <div><h1 className="text-[22px] font-semibold text-ink leading-tight tracking-tight">{title}</h1>{sub && <p className="text-sm text-mute mt-1 max-w-2xl">{sub}</p>}</div>
    <div className="flex items-center gap-2 flex-wrap">{actions}</div>
  </div>
);
const STAT_C: Record<string, string> = { red: 'text-red-600', green: 'text-emerald-700', amber: 'text-amber-700', orange: 'text-orange-600', teal: 'text-teal-700', navy: 'text-ink' };
export const Stat = ({ label, value, sub, tone = 'navy', onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: any; tone?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={cx('bg-white rounded-md border border-line px-4 py-3', onClick && 'cursor-pointer hover:border-slate-400')}><div className="text-[13px] text-mute">{label}</div><div className={cx('text-2xl font-semibold tabular-nums leading-tight mt-0.5', STAT_C[tone] || 'text-ink')}>{value}</div>{sub && <div className="text-xs text-mute mt-0.5">{sub}</div>}</div>
);
export const Empty = ({ title, sub, action }: { title: string; sub?: string; icon?: any; action?: React.ReactNode }) => <div className="text-center py-10"><div className="font-medium text-ink">{title}</div>{sub && <div className="text-sm text-mute mt-1 max-w-sm mx-auto">{sub}</div>}{action && <div className="mt-3">{action}</div>}</div>;
export const Tabs = ({ tabs, value, onChange }: { tabs: { k: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void }) => (
  <div className="flex gap-5 border-b border-line mb-4 overflow-x-auto">{tabs.map(t => <button key={t.k} onClick={() => onChange(t.k)} className={cx('py-2 text-sm whitespace-nowrap border-b-2 -mb-px', value === t.k ? 'border-ink text-ink font-semibold' : 'border-transparent text-mute hover:text-ink')}>{t.label}{t.count != null && <span className="ml-1.5 text-xs text-mute font-normal tabular-nums">{t.count}</span>}</button>)}</div>
);
export const ProgressBar = ({ pct, tone }: { pct: number; tone?: string }) => { const p = Math.max(0, Math.min(100, pct)); const c = tone || (p > 90 ? 'bg-red-500' : p > 75 ? 'bg-amber-500' : 'bg-teal-500'); return <div className="h-1.5 rounded-sm bg-slate-100 overflow-hidden"><div className={cx('h-full', c)} style={{ width: p + '%' }} /></div>; };
export const KV = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 text-sm"><span className="text-mute">{k}</span><span className="font-medium text-right">{v}</span></div>;
export const DemoTag = ({ children = 'DEMO MODE · simulated' }: { children?: React.ReactNode }) => <span className="inline-flex items-center rounded bg-amber-100 text-amber-900 text-[11px] font-medium px-1.5 py-px">{children}</span>;

/* ---------- forms ---------- */
const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal disabled:bg-slate-50';
export const Field = ({ label, children, hint, error, className }: { label?: string; children: React.ReactNode; hint?: string; error?: string; className?: string }) => <label className={cx('block', className)}>{label && <span className="block text-[13px] text-slate-600 mb-1">{label}</span>}{children}{hint && !error && <span className="block text-[11px] text-mute mt-1">{hint}</span>}{error && <span className="block text-[11px] text-red-600 mt-1">{error}</span>}</label>;
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(inputCls, className)} />);
export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, 'pr-8', className)}>{children}</select>;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'min-h-[70px]', className)} />;
export const Check = ({ label, checked, onChange, disabled }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => <label className="flex items-center gap-2 text-sm cursor-pointer select-none"><input type="checkbox" disabled={disabled} checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-teal focus:ring-brand-teal" />{label}</label>;
export const Toggle = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => <button type="button" disabled={disabled} onClick={() => onChange(!on)} className={cx('relative h-5 w-9 rounded-full transition disabled:opacity-40', on ? 'bg-brand-teal' : 'bg-slate-300')}><span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} /></button>;

/* ---------- modal ---------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-6 bg-navy/40 overflow-y-auto" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={cx('w-full bg-white rounded-lg shadow-2xl pop my-auto', w)}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200"><h2 className="font-semibold text-ink">{title}</h2><button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500"><X size={18} /></button></div>
      <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">{footer}</div>}
    </div></div>;
}
export function ReasonModal({ open, onClose, title, label = 'Reason', confirmLabel = 'Confirm', onSubmit, variant = 'primary', note }: { open: boolean; onClose: () => void; title: string; label?: string; confirmLabel?: string; onSubmit: (reason: string) => boolean | void; variant?: 'primary' | 'danger' | 'success'; note?: React.ReactNode }) {
  const [v, setV] = useState(''); useEffect(() => { if (open) setV(''); }, [open]);
  return <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant={variant} onClick={() => { if (onSubmit(v) !== false) onClose(); }}>{confirmLabel}</Btn></>}>{note && <div className="text-sm text-slate-600 mb-3">{note}</div>}<Field label={label}><Textarea autoFocus value={v} onChange={e => setV(e.target.value)} placeholder="Required – recorded in the audit trail" /></Field></Modal>;
}

/* ---------- data table ---------- */
export type Col<T> = { h: string; r: (row: T, i: number) => React.ReactNode; sort?: (row: T) => any; w?: string; right?: boolean; csv?: (row: T) => any };
export function DataTable<T>({ rows, cols, search, pageSize = 10, onRow, toolbar, empty = 'No records', dense, id }: { rows: T[]; cols: Col<T>[]; search?: (r: T) => string; pageSize?: number; onRow?: (r: T) => void; toolbar?: React.ReactNode; empty?: string; dense?: boolean; id?: string }) {
  const [q, setQ] = useState(''); const [page, setPage] = useState(0); const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const filtered = useMemo(() => { let r = rows; if (q && search) { const s = q.toLowerCase(); r = r.filter(x => search(x).toLowerCase().includes(s)); } if (sort) { const f = cols[sort.i].sort!; r = [...r].sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; }); } return r; }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const pg = Math.min(page, pages - 1); const view = filtered.slice(pg * pageSize, pg * pageSize + pageSize);
  return <div id={id}>
    {(search || toolbar) && <div className="flex items-center gap-2 mb-2 flex-wrap">{search && <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><Input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Search…" className="pl-8 w-56" /></div>}<div className="flex items-center gap-2 flex-wrap ml-auto">{toolbar}</div></div>}
    <div className="overflow-x-auto">
      <table className={cx('tbl w-full text-sm', dense && 'text-[13px]')}><thead><tr>{cols.map((c, i) => <th key={i} style={{ width: c.w }} className={cx(c.right && '!text-right', c.sort && 'cursor-pointer select-none')} onClick={() => c.sort && setSort(sort?.i === i ? { i, dir: (sort.dir * -1) as any } : { i, dir: 1 })}><span className="inline-flex items-center gap-1">{c.h}{sort?.i === i && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span></th>)}</tr></thead>
        <tbody>{view.map((r, ri) => <tr key={ri} onClick={() => onRow?.(r)} className={onRow ? 'cursor-pointer' : ''}>{cols.map((c, ci) => <td key={ci} className={c.right ? 'text-right tabular-nums' : ''}>{c.r(r, pg * pageSize + ri)}</td>)}</tr>)}
          {!view.length && <tr><td colSpan={cols.length}><div className="py-8 text-center text-mute text-sm">{empty}</div></td></tr>}</tbody></table>
    </div>
    {filtered.length > pageSize && <div className="flex items-center justify-between mt-2 text-xs text-mute"><span>{filtered.length} records · page {pg + 1} of {pages}</span><div className="flex gap-1"><Btn size="sm" variant="secondary" disabled={pg === 0} onClick={() => setPage(pg - 1)}>Prev</Btn><Btn size="sm" variant="secondary" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next</Btn></div></div>}
  </div>;
}

/* ---------- codes & images ---------- */
export const QR = ({ value, size = 96 }: { value: string; size?: number }) => <QRCodeSVG value={value} size={size} level="M" marginSize={1} />;
export const Bar = ({ value, height = 44 }: { value: string; height?: number }) => <Barcode value={value} height={height} width={1.4} fontSize={11} margin={2} background="transparent" />;
export function ProductImg({ p, size = 40 }: { p?: Pick<Product, 'name' | 'color'>; size?: number }) {
  if (!p) return <div style={{ width: size, height: size }} className="rounded-lg bg-slate-200" />;
  const ini = p.name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <div style={{ width: size, height: size, background: `linear-gradient(135deg, ${p.color}, ${p.color}bb)`, fontSize: size * 0.34 }} className="rounded-lg grid place-items-center text-white font-bold shrink-0 select-none">{ini}</div>;
}

/* ---------- scanning ---------- */
export type Hint = { label: string; code: string; tone?: 'ok' | 'bad' | 'warn' };
export function ScanBox({ onScan, hints = [], placeholder = 'Scan QR / barcode or type SKU / location and press Enter', disabled, big }: { onScan: (code: string) => void; hints?: Hint[]; placeholder?: string; disabled?: boolean; big?: boolean }) {
  const [v, setV] = useState(''); const ref = useRef<HTMLInputElement>(null);
  const submit = (c: string) => { const x = c.trim(); if (!x) return; onScan(x); setV(''); ref.current?.focus(); };
  return <div className="rounded-lg border-2 border-dashed border-brand-teal/50 bg-teal-50/40 p-3">
    <div className="flex items-center gap-2"><ScanLine className="text-brand-teal shrink-0" size={big ? 26 : 20} />
      <Input ref={ref} disabled={disabled} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit(v)} placeholder={placeholder} className={big ? 'py-3 text-base' : ''} />
      <Btn disabled={disabled} onClick={() => submit(v)} variant="accent">Scan</Btn></div>
    <div className="flex items-center gap-1.5 flex-wrap mt-2"><span className="text-[10px] font-bold text-mute flex items-center gap-1"><Camera size={11} />Simulate scan <DemoTag>DEMO</DemoTag></span>
      {hints.map((h, i) => <button key={i} disabled={disabled} onClick={() => submit(h.code)} className={cx('text-[11px] px-2 py-1 rounded-full ring-1 ring-inset transition disabled:opacity-40', h.tone === 'bad' ? 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100' : h.tone === 'warn' ? 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100')}>{h.label}</button>)}</div>
    <p className="text-[10px] text-mute mt-1.5">USB / Bluetooth scanners work here as keyboard input. Camera scanning is architecture-ready (not enabled in this prototype).</p>
  </div>;
}
export const ScanResult = ({ sev, msg }: { sev: string; msg: string }) => <div className={cx('rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2 pop', sev === 'green' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : sev === 'amber' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300' : 'bg-red-50 text-red-800 ring-1 ring-red-300')}><span className={cx('h-2.5 w-2.5 rounded-full', sev === 'green' ? 'bg-emerald-500' : sev === 'amber' ? 'bg-amber-500' : 'bg-red-500')} />{msg}</div>;

/* ---------- time ---------- */
export function useNow(ms = 1000) { const [t, setT] = useState(now()); useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]); return t; }
export function Countdown({ deadline, done }: { deadline?: number; done?: boolean }) {
  const t = useNow(1000); if (!deadline) return <span className="text-mute">—</span>;
  const diff = deadline - t; const a = Math.abs(diff); const m = Math.floor(a / 60000), s = Math.floor((a % 60000) / 1000); const hh = Math.floor(m / 60);
  const txt = `${diff < 0 ? '−' : ''}${hh ? hh + 'h ' : ''}${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (done) return <span className="text-mute tabular-nums">{txt}</span>;
  return <Badge tone={diff < 0 ? 'red' : diff < 3 * 60000 ? 'amber' : 'teal'} className="tabular-nums">{diff < 0 ? 'OVERDUE ' : ''}{txt}</Badge>;
}

/* ---------- toasts ---------- */
export function Toaster() {
  const ts = useToasts();
  return <div className="fixed top-3 right-3 z-[60] flex flex-col gap-2 w-[min(92vw,380px)] no-print">{ts.map(t => <div key={t.id} className={cx('pop rounded-lg shadow-lg px-3.5 py-2.5 text-sm font-medium text-white', t.kind === 'success' ? 'bg-emerald-600' : t.kind === 'error' ? 'bg-red-600' : 'bg-navy')}>{t.msg}</div>)}</div>;
}
export const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-[12px] bg-slate-100 rounded px-1.5 py-0.5">{children}</span>;
export const Link = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => <button onClick={e => { e.stopPropagation(); onClick(); }} className="text-brand-teal hover:underline font-medium">{children}</button>;
export function Timeline({ items }: { items: { at: number; title: string; sub?: string; tone?: Tone }[] }) {
  return <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">{items.map((it, i) => <li key={i} className="ml-4"><span className={cx('absolute -left-[7px] mt-1 h-3 w-3 rounded-full ring-2 ring-white', it.tone === 'red' ? 'bg-red-500' : it.tone === 'amber' ? 'bg-amber-500' : it.tone === 'green' ? 'bg-emerald-500' : 'bg-brand-teal')} /><div className="text-sm font-medium">{it.title}</div><div className="text-[11px] text-mute">{new Date(it.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{it.sub ? ` · ${it.sub}` : ''}</div></li>)}</ol>;
}
