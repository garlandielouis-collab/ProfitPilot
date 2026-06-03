import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> Retounen lakay
        </Link>
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Legal</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">Politik Konfidansyalite</h1>
          <p className="mt-2 text-sm text-slate-400">Dènye mizajou: 1 Jen 2026</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm space-y-6 text-sm leading-7 text-slate-600">
          <section><h2 className="font-bold text-[#001f3f] mb-2">Done Nou Kolekte</h2><p>Nou kolekte: non, email, done biznis ou antre (vant, acha, depans, pwodui). Nou pa kolekte enfòmasyon finansye pèsonèl (nimewo kont, etc.).</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">Kijan Nou Itilize Done Ou</h2><p>Done yo sèlman itilize pou ba w sèvis ProfitPilot. Nou pa vann, pataje oswa komèsyalize done ou ak tiye pati.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">Sekirite</h2><p>Tout done yo kriptografye ak Supabase (AES-256). Koneksyon yo pwoteje pa HTTPS. Bakòp otomatik chak jou.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">Dwa Ou</h2><p>Ou ka mande nou efase kont ou ak tout done ou nenpòt ki lè. Kontakte nou pa email pou demann sa.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">Kontakte Nou</h2><p>Pou kesyon sou konfidansyalite: <a href="mailto:garlandielouis178@gmail.com" className="text-[#50c878] hover:underline">garlandielouis178@gmail.com</a></p></section>
        </div>
      </div>
    </div>
  );
}
