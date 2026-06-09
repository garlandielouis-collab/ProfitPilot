'use client';
import { useLanguage } from '../../../components/LanguageWrapper';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> {t({ fr: "Retour à l'accueil", ht: 'Retounen lakay' })}
        </Link>
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Legal</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">{t({ fr: "Conditions d'Utilisation", ht: 'Kondisyon Itilizasyon' })}</h1>
          <p className="mt-2 text-sm text-slate-400">Dènye mizajou: 1 Jen 2026</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm space-y-6 text-sm leading-7 text-slate-600">
          <section><h2 className="font-bold text-[#001f3f] mb-2">{t({ fr: '1. Acceptation des Conditions', ht: '1. Akseptasyon Kondisyon yo' })}</h2><p>Lè ou itilize ProfitPilot, ou aksepte kondisyon sa yo. Si ou pa dakò, tanpri pa itilize sèvis la.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">{t({ fr: '2. Description du Service', ht: '2. Deskripsyon Sèvis la' })}</h2><p>ProfitPilot se yon aplikasyon jèsyon biznis pou antreprenè ayisyen. Li ofri jesyon envantè, vant, acha, depans ak rapò finansye.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">3. Kont Itilizatè</h2><p>Ou responsab pou pwoteje kont ou ak modpas ou. ProfitPilot p ap janm mande modpas ou pa SMS oswa email.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">4. Pwopriete Entèlèktyèl</h2><p>Tout kontni ProfitPilot (logo, kòd, konsèp) se pwopriyete ProfitPilot. Done ou yo rès pwopriyete pa w.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">5. Limit Responsablite</h2><p>ProfitPilot pa responsab pou okenn pèt finansye ki rezilte de itilizasyon aplikasyon an. Done yo bay pou enfòmasyon sèlman.</p></section>
          <section><h2 className="font-bold text-[#001f3f] mb-2">6. Kontakte Nou</h2><p>Pou nenpòt kesyon legal: <a href="mailto:garlandielouis178@gmail.com" className="text-[#50c878] hover:underline">garlandielouis178@gmail.com</a></p></section>
        </div>
      </div>
    </div>
  );
}
