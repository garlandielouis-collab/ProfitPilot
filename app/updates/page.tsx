'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const UPDATES = [
  { version: 'v2.4', date: 'Jen 2026', badge: 'Nouvo', color: 'bg-[#50c878] text-[#001f3f]', items: ['Paj Envantè redesign konplè', 'Top pwodui pa vant ajoute', 'Upload foto pwodui fonksyonèl', 'Vitès chajman amelyore 3x'] },
  { version: 'v2.3', date: 'Me 2026', badge: 'Amelyorasyon', color: 'bg-blue-100 text-blue-700', items: ['Dashboard prann done reyèl', 'Section CRM Kliyan nan Ventes', 'Mouvman stock retrase otomatikman', 'Fakti ofisyèl gen non biznis reyèl'] },
  { version: 'v2.2', date: 'Avr 2026', badge: 'Korekson', color: 'bg-amber-100 text-amber-700', items: ['Coreksyon permission denied products', 'Dèt fournisè kounye a mete ajou', 'Paj Dèt montre done reyèl', 'Page achats korekson enum statut'] },
  { version: 'v2.1', date: 'Mas 2026', badge: 'Fonksyon', color: 'bg-purple-100 text-purple-700', items: ['Pilot AI v2 ak konsèy finansye', 'Rapò finansye (Bilan, Eta Rezilta)', 'Jesyon multimoney HTG/USD', 'Notifikasyon stock fèb otomatik'] },
  { version: 'v2.0', date: 'Fev 2026', badge: 'Majè', color: 'bg-red-100 text-red-700', items: ['Refonte konplè entèfas', 'Nouvo sistèm otantifikasyon', 'Architecture Server Components', 'Supabase RLS politik refait'] },
];

export default function UpdatesPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> Retounen lakay
        </Link>
        <div className="mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Changelog</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">Dènye Mizajou</h1>
          <p className="mt-3 text-slate-500">Tout nouvo fonksyon ak korekson ProfitPilot.</p>
        </div>
        <div className="space-y-6">
          {UPDATES.map((u, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xl font-black text-[#001f3f]">{u.version}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${u.color}`}>{u.badge}</span>
                <span className="ml-auto text-xs text-slate-400">{u.date}</span>
              </div>
              <ul className="space-y-2">
                {u.items.map((item, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-slate-600">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#50c878] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
