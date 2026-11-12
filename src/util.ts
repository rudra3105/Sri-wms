let clockOverride: number | null = null;
export const setClock = (t: number | null) => { clockOverride = t; };
export const now = () => clockOverride ?? Date.now();
export const DAY = 864e5;
export const addDays = (t: number, n: number) => t + n * DAY;
export const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const inrF = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const numF = new Intl.NumberFormat('en-IN');
export const inr = (n: number) => inrF.format(n || 0);
export const num = (n: number) => numF.format(Math.round((n || 0) * 100) / 100);
export const inrC = (n: number) => { n = n || 0; const a = Math.abs(n); if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`; if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`; if (a >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`; return `₹${Math.round(n)}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fdate = (t?: number | null) => { if (!t) return '—'; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
export const ftime = (t?: number | null) => { if (!t) return '—'; const d = new Date(t); return `${fdate(t)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const fshort = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export const toInputDate = (t?: number | null) => (t ? dayKey(t) : '');
export const fromInputDate = (s: string) => (s ? new Date(s + 'T00:00:00').getTime() : null);
export const pad = (n: number, w = 4) => String(n).padStart(w, '0');
export function hash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const SHELVES = 3, BINS = 6;
export function download(name: string, content: string | Blob, type = 'text/plain') {
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch { /* sandbox may block downloads */ }
}
export const csvEsc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
