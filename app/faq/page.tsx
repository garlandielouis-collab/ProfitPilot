'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FAQS = [
  { q: 'ProfitPilot se gratis?', a: 'Wi, ProfitPilot ofri yon plan gratis pou kòmanse. Ou ka kreye kont ou san oken kat bankè.' },
  { q: 'Kijan Pilot AI travay?', a: 'Pilot AI analyze done biznis ou an tan reyèl — vant, depans, stock — epi li ba w konsèy pèsonalize pou ede w grandi.' },
  { q: 'Eske done mwen yo an sekirite?', a: 'Wi. Tout done yo kriptografye ak Supabase, yon platfòm sekirite nivo antrepriz. Nou pa janm pataje done ou ak tiye pati.' },
  { q: 'Kijan mwen ka antre done mwen yo?', a: 'Ou ka antre vant, acha, depans ak pwodui you pa you, oswa enpòte yo an vrac. Epi aplikasyon an ap met ajou tout done yo otomatikman.' },
  { q: 'Eske ProfitPilot fonksyone sou telefòn?', a: 'Wi. ProfitPilot optimaze pou mobil — w ka jere tout biznis ou a depi nenpòt kote, menm san entènèt (sinkronizasyon otomatik).' },
  { q: 'Kijan mwen kontakte sipò a?', a: 'Ou ka kontakte nou via WhatsApp au +50935045946, pa email garlandielouis178@gmail.com, oswa via chatbot Pilot AI a.' },
  { q: 'Eske li sipòte HTG ak USD?', a: 'Wi. ProfitPilot jere toulède HTG ak USD, ak konvèsyon otomatik ak to chanj ou defini ou menm.' },
  { q: 'Kijan rapò finansye yo travay?', a: 'ProfitPilot jenere bilan, eta rezilta, fliks trezoreri ak kapitò pwòp otomatikman baze sou done ou antre chak jou.' },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E2E8F0] last:border-0">
      <button onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between gap-4 py-5 text-left">
        <span className="font-semibold text-[#001f3f]">{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="shrink-0 text-slate-400" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <p className="pb-5 text-sm leading-7 text-slate-500">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> Retounen lakay
        </Link>
        <div className="mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Sipò</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">Kesyon Souvan Poze</h1>
          <p className="mt-3 text-slate-500">Tout repon ou bezwen sou ProfitPilot.</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-6 shadow-sm">
          {FAQS.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
        </div>
        <div className="mt-10 rounded-2xl border border-[#50c878]/20 bg-[#50c878]/5 p-6 text-center">
          <p className="font-semibold text-[#001f3f]">Ou pa jwenn repon ou a?</p>
          <p className="mt-1 text-sm text-slate-500">Kontakte nou dirèkteman.</p>
          <a href="https://wa.me/50935045946" target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#001f3f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#001f3f]/90 transition">
            💬 WhatsApp +50935045946
          </a>
        </div>
      </div>
    </div>
  );
}
