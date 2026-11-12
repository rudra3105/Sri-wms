import React from 'react';
import { useS, login } from '../store';
import { ROLE_META } from '../perms';
import { DemoTag } from '../ui';

export function Login() {
  const s = useS(); const order = Object.keys(ROLE_META);
  const users = [...s.users].filter(u => u.active).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  return <div className="min-h-screen grid lg:grid-cols-[minmax(320px,2fr)_3fr]">
    <div className="bg-navy text-white px-8 py-10 lg:px-12 lg:py-14 flex flex-col">
      <div className="text-3xl font-bold tracking-tight">SRI<span className="text-brand-orange"> WMS</span></div>
      <div className="text-slate-300 mt-1">{s.org.name}</div>
      <p className="text-2xl lg:text-[28px] leading-snug font-medium mt-10 lg:mt-24 max-w-sm">Complete warehouse control. Smarter business operations.</p>
      <p className="text-slate-300 mt-4 max-w-sm text-[15px]">Receive, store, pick, check and ship, with every step scanned and recorded.</p>
      <div className="mt-auto pt-10 text-sm text-slate-400">Powered by Webrise Global™</div>
    </div>
    <div className="bg-bg px-6 py-10 lg:px-14 lg:py-14">
      <h1 className="text-xl font-semibold">Choose who to sign in as</h1>
      <p className="text-sm text-mute mt-1 max-w-lg">This is a demo with sample data stored only in your browser. There are no passwords. Each person sees only the screens their role allows.</p>
      <div className="mt-2"><DemoTag>Demo data</DemoTag></div>
      <ul className="mt-5 divide-y divide-line border-y border-line bg-white rounded-md max-w-2xl">{users.map(u => <li key={u.id}><button onClick={() => login(u.id)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50"><span className="h-8 w-8 rounded-full bg-navy text-white grid place-items-center text-sm font-semibold shrink-0">{u.name[0]}</span><span className="flex-1 min-w-0"><span className="block font-medium leading-tight">{u.name}</span><span className="block text-[13px] text-mute truncate">{ROLE_META[u.role]?.label}: {ROLE_META[u.role]?.desc}</span></span><span className="text-mute">›</span></button></li>)}</ul>
      <p className="text-xs text-mute mt-4 max-w-xl">Prototype only. Real sign-in, server-side permission checks and live integrations come in a production build.</p>
    </div></div>;
}
