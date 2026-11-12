// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { App } from '../src/App';
import { login, go, act as sact } from '../src/store';
import { MODULES, ROLE_META, canRole } from '../src/perms';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
(window as any).matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
const errs: string[] = []; const ce = console.error; console.error = (...a: any[]) => { const m = a.map(String).join(' '); if (!/width\(0\)|height\(0\)|not wrapped in act/.test(m)) errs.push(m.slice(0, 300)); };
describe('smoke', () => {
  it('renders every page for admin', async () => {
    await act(async () => { root.render(<App />); }); await act(async () => { login('U-superadmin'); });
    for (const m of [{ k: 'home' }, ...MODULES]) { await act(async () => { go(m.k); }); const txt = el.textContent || ''; expect(txt.length, m.k).toBeGreaterThan(50); expect(txt, m.k).not.toMatch(/Unexpected error/); }
    expect(errs).toEqual([]);
  });
  it('renders each role landing + permitted pages', async () => {
    for (const role of Object.keys(ROLE_META)) {
      const uid = `U-${role}`; await act(async () => { login(uid); });
      const pages = role === 'customer' ? [] : [{ k: 'home', label: '' }, ...MODULES].filter(m => (m.k === 'home' || canRole({}, role, 'view:' + m.k)));
      for (const m of pages) { await act(async () => { go(m.k); }); expect((el.textContent || '').length, `${role}:${m.k}`).toBeGreaterThan(30); }
      expect((el.textContent || '').length, role).toBeGreaterThan(50);
    }
    expect(errs).toEqual([]);
  });
});
