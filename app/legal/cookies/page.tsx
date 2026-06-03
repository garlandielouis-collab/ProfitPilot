import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> Retounen lakay
        </Link>
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Legal</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">Politik Cookies</h1>
          <p className="mt-2 text-sm text-slate-400">Dènye mizajou: 1 Jen 2026</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm space-y-6 text-sm leading-7 text-slate-600">
          <section><h2 className="font-bold text-[#001f3f] mb-2">Ki sa Cookies ye?</h2><p>Cookies se ti fichye ki estoke nan navigatè ou pou kenbe sesyon ou ak preferans ou yo.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">Cookies Nou Itilize</h2>
            <ul className="space-y-2 mt-2">
              {[['sb-*-auth-token', 'Sesyon otantifikasyon Supabase', 'Nesesè'],
                ['user-preferences', 'Lang ak preferans entèfas', 'Fonksyonèl'],
                ['__vercel_live_token', 'Pèfòmans Vercel', 'Teknik']].map(([name, desc, type]) => (
                <li key={name} className="rounded-xl border border-[#E2E8F0] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-xs font-mono text-[#001f3f]">{name}</code>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{type}</span>
                  </div>
                  <p className="text-xs text-slate-500">{desc}</p>
                </li>
              ))}
            </ul>
          </section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">Kontwole Cookies</h2><p>Ou ka efase cookies nan paramèt navigatè ou. Atansyon: sa ka dekonekte ou nan ProfitPilot.</p></section>
        </div>
      </div>
    </div>
  );
}
