'use client';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const STEPS = [
  { n: '01', title: 'Kreye Kont Ou', desc: 'Ale sou app.profitpilot.ht, klike "Kreye Kont", ranpli non ak email ou. Kont lan aktive imedyatman — pa gen kat bankè nesesè.', time: '2 min' },
  { n: '02', title: 'Konfigire Biznis Ou', desc: 'Antre non biznis ou, deviz (HTG/USD), ak to chanj. Sa a pral afekte tout rapò finansye ou yo.', time: '3 min' },
  { n: '03', title: 'Ajoute Pwodui Ou Yo', desc: 'Ale nan seksyon Pwodui, klike "+ Nouvo Pwodui". Antre non, pri acha, pri vant ak kantite stock la. Ou ka ajoute yon foto pou chak pwodui.', time: '5-10 min' },
  { n: '04', title: 'Ajoute Fournisè Ou Yo', desc: 'Ale nan seksyon Fournisè, antre non, telefòn ak escompte chak fournisè. Sa a pral ede w jwenn done acha pi fasil.', time: '3 min' },
  { n: '05', title: 'Anrejistre Premye Vant Ou', desc: 'Ale nan Ventes > Point de Vente. Chwazi pwodui yo, kantite, mòd peman. Klike "Anrejistre Vant". Fakti otomatikman kreye.', time: '1 min' },
  { n: '06', title: 'Suiv Depans Ou', desc: 'Chak depans (lwaye, salè, reaprovizionman) dwe antre nan seksyon Depans. Sa pèmèt kalkil profit reyèl la.', time: '2 min' },
  { n: '07', title: 'Pale ak Pilot AI', desc: 'Ale nan "Pilot AI", poze nenpòt kesyon sou biznis ou: "Ki pwodui ki pi ranntab?", "Poukisa profit mwen bese?". AI a ap repon imedyatman.', time: '5 min' },
  { n: '08', title: 'Wè Rapò Finansye Ou', desc: 'Ale nan Rapò pou wè bilan, eta rezilta, fliks trezoreri. Ou ka enprime oswa telechaje yo an PDF.', time: '2 min' },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-4xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> Retounen lakay
        </Link>
        <div className="mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Dokimantasyon</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">Gid Kòmanse</h1>
          <p className="mt-3 text-slate-500">Yon gid pa-a-pa pou konfigire ProfitPilot pou biznis ou nan mwens pase 30 minit.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#50c878]/10 px-4 py-2 text-sm font-semibold text-[#50c878]">
            <CheckCircle size={14} /> Tan total estimé: ~30 minit
          </div>
        </div>
        <div className="space-y-4">
          {STEPS.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
              className="flex gap-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm hover:border-[#50c878]/30 transition-colors">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#001f3f] text-lg font-black text-[#50c878]">
                {s.n}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-bold text-[#001f3f]">{s.title}</h3>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{s.time}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link href="/onboarding" className="flex-1 rounded-2xl bg-[#001f3f] px-6 py-3.5 text-center text-sm font-bold text-white hover:bg-[#001f3f]/90 transition">
            Kòmanse kounye a <ArrowRight size={14} className="inline ml-1" />
          </Link>
          <a href="https://wa.me/50935045946" target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-2xl border border-[#E2E8F0] bg-white px-6 py-3.5 text-center text-sm font-semibold text-[#001f3f] hover:bg-slate-50 transition">
            💬 Bezwen Èd? WhatsApp nou
          </a>
        </div>
      </div>
    </div>
  );
}
