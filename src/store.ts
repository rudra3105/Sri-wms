import { produce } from 'immer';
import { useSyncExternalStore } from 'react';
import { State } from './types';
import { buildSeed } from './seed';
import { can } from './perms';
import { WmsError } from './core';

const KEY = 'sri-wms-state-v3';
function load(): State | null {
  try { const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (s) { const o = JSON.parse(s); if (o && o.v === 3) return o; } } catch { /* storage unavailable */ }
  return null;
}
let state: State = load() ?? buildSeed();
const subs = new Set<() => void>();
let timer: any;
const persist = () => { if (typeof localStorage === 'undefined') return; clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota / sandbox */ } }, 350); };
const emit = () => subs.forEach(f => f());
export const getState = () => state;
export const useS = (): State => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, getState);

/* ---------- toasts ---------- */
export type Toast = { id: number; kind: 'success' | 'error' | 'info'; msg: string };
let toasts: Toast[] = []; let tid = 0; const tsubs = new Set<() => void>();
export const toast = (kind: Toast['kind'], msg: string) => { const t = { id: ++tid, kind, msg }; toasts = [...toasts, t].slice(-4); tsubs.forEach(f => f()); setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); tsubs.forEach(f => f()); }, kind === 'error' ? 6000 : 3200); };
export const useToasts = () => useSyncExternalStore(cb => { tsubs.add(cb); return () => tsubs.delete(cb); }, () => toasts);

export type Res<T> = { ok: true; v: T } | { ok: false; v?: any };
/** Transactional action: runs fn on a draft; on any error nothing is committed. Enforces role permission. */
export function exec<T>(perm: string | null, fn: (d: State) => T, ok?: string | ((r: T) => string)): Res<T> {
  if (!can(state, perm)) { toast('error', `Permission denied – your role is not allowed to do this${perm ? ` (${perm})` : ''}.`); return { ok: false }; }
  try {
    let out: any;
    state = produce(state, d => { out = fn(d); if (out && typeof out === 'object') out = JSON.parse(JSON.stringify(out)); });
    persist(); emit();
    if (out && typeof out === 'object' && out.ok === false) { toast('error', out.msg || 'Action failed'); return { ok: false, v: out }; }
    if (ok) toast('success', typeof ok === 'function' ? ok(out) : ok);
    return { ok: true, v: out };
  } catch (e: any) { toast('error', e instanceof WmsError ? e.message : 'Unexpected error: ' + e?.message); if (!(e instanceof WmsError)) console.error(e); return { ok: false }; }
}
/** UI-state change (navigation, session) – no permission/audit. */
export function act(fn: (d: State) => void) { state = produce(state, fn); persist(); emit(); }
export const go = (page: string, params?: any) => act(d => { d.session.page = page; d.session.params = params; });
export function resetDemo() { const s = state.session; const fresh = buildSeed(); fresh.session = { ...s, page: 'overview', params: undefined }; state = fresh; persist(); emit(); toast('success', 'Demo data reset to the original scenario'); }

const HOME: Record<string, 'console' | 'mobile' | 'portal'> = { customer: 'portal', picker: 'mobile', putaway: 'mobile' };
export function login(userId: string, note = 'Demo sign-in') {
  const u = state.users.find(x => x.id === userId); if (!u || !u.active) { toast('error', 'Account is inactive'); return; }
  act(d => { d.session.userId = userId; d.session.impersonating = null; d.session.mode = HOME[u.role] || 'console'; d.session.page = u.role === 'customer' ? 'portal-home' : 'home'; d.session.params = undefined; d.session.wh = 'ALL'; const uu = d.users.find(x => x.id === userId)!; uu.lastLogin = Date.now(); d.loginLog.push({ at: Date.now(), user: u.name, role: u.role, ok: true, note }); });
}
export function logout() { act(d => { const u = d.users.find(x => x.id === (d.session.impersonating || d.session.userId)); if (u) d.loginLog.push({ at: Date.now(), user: u.name, role: u.role, ok: true, note: 'Sign-out' }); d.session.userId = null; d.session.impersonating = null; }); }
export function switchRole(userId: string) { const s = state.session; const real = s.impersonating || s.userId; const ru = state.users.find(u => u.id === real); if (ru?.role !== 'superadmin') { toast('error', 'Only the Super Administrator can switch demo roles'); return; } const u = state.users.find(x => x.id === userId)!; act(d => { d.session.impersonating = userId === real ? null : real; d.session.userId = userId; d.session.mode = HOME[u.role] || 'console'; d.session.page = u.role === 'customer' ? 'portal-home' : 'home'; d.session.params = undefined; }); toast('info', `Viewing SRI WMS as ${u.name}`); }
export const curUser = (s: State) => s.users.find(u => u.id === s.session.userId);
