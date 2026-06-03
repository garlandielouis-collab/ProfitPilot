'use client';
import Link from 'next/link';
import { ArrowLeft, Clock, Tag } from 'lucide-react';
import { motion } from 'framer-motion';

const POSTS = [
  { slug: '1', title: 'Kijan konn profit reyèl ou chak jou', excerpt: 'Anpil antreprenè panse yo fè profit, men lè yo kalkile tout depans yo, reyalite a diferan. Aprann kalkile profit reyèl ou facilement.', date: '2 Jen 2026', tag: 'Jesyon', time: '4 min' },
  { slug: '2', title: '5 erè stock ki koute w lajan chak mwa', excerpt: 'Pèdi stock, achte twòp, vann san kalkile — dekouvri 5 erè ki pi komen nan jèsyon stock ak kijan evite yo.', date: '28 Me 2026', tag: 'Envantè', time: '5 min' },
  { slug: '3', title: 'Kijan IA ka ede w pran pi bon desizyon', excerpt: 'Pilot AI analyze done biznis ou epi ba w konsèy pèsonalize. Dekouvri kijan IA ka chanje fason ou jere biznis ou.', date: '20 Me 2026', tag: 'Pilot AI', time: '6 min' },
  { slug: '4', title: 'Rapò finansye: pa sèlman pou gwo biznis', excerpt: 'Bilan, eta rezilta, fliks trezoreri — dekouvri poukisa tout antreprenè, menm ti biznis, bezwen rapò finansye.', date: '15 Me 2026', tag: 'Rapò', time: '4 min' },
  { slug: '5', title: 'Jere fournisè ou yo pi efikasman', excerpt: 'Relasyon ak fournisè, dèt ak negosyasyon — aprann estrateji pou optimize acha ou yo ak diminye kout.', date: '8 Me 2026', tag: 'Fournisè', time: '5 min' },
  { slug: '6', title: 'Konprann trésorerie ou pou pa janm manke lajan', excerpt: 'Flux de trésorerie se pouls biznis ou. Aprann kijan suiv lajan k antre ak k soti pou toujou gen liquidité.', date: '1 Me 2026', tag: 'Trezoreri', time: '7 min' },
];

const TAG_COLORS: Record<string, string> = {
  'Jesyon': 'bg-blue-100 text-blue-700',
  'Envantè': 'bg-emerald-100 text-emerald-700',
  'Pilot AI': 'bg-purple-100 text-purple-700',
  'Rapò': 'bg-amber-100 text-amber-700',
  'Fournisè': 'bg-orange-100 text-orange-700',
  'Trezoreri': 'bg-cyan-100 text-cyan-700',
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-5xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#001f3f] transition">
          <ArrowLeft size={14} /> Retounen lakay
        </Link>
        <div className="mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[#50c878]">Blog</span>
          <h1 className="mt-2 text-3xl font-extrabold text-[#001f3f]">Konsèy pou Antreprenè Ayisyen</h1>
          <p className="mt-3 text-slate-500">Gid pratik, konsèy jesyon ak istwa siksè pou devlope biznis ou.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {POSTS.map((p, i) => (
            <motion.div key={p.slug} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="group rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm hover:border-[#50c878]/30 hover:shadow-md transition-all cursor-pointer">
              <div className="mb-3 flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${TAG_COLORS[p.tag] ?? 'bg-slate-100 text-slate-600'}`}>
                  <Tag size={8} className="inline mr-1" />{p.tag}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Clock size={10} /> {p.time}
                </span>
              </div>
              <h2 className="font-bold text-[#001f3f] leading-snug group-hover:text-[#50c878] transition-colors">{p.title}</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed line-clamp-3">{p.excerpt}</p>
              <p className="mt-4 text-[11px] text-slate-400">{p.date}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-[#001f3f]/10 bg-[#001f3f] p-8 text-center">
          <p className="text-lg font-bold text-white">Resevwa konsèy chak semenn</p>
          <p className="mt-1 text-sm text-white/60">Abòne pou resevwa dènye konsèy biznis gratis.</p>
          <a href="mailto:garlandielouis178@gmail.com?subject=Abonnement Blog ProfitPilot"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#50c878] px-5 py-2.5 text-sm font-semibold text-[#001f3f] hover:bg-[#4db86e] transition">
            ✉️ Abòne gratis
          </a>
        </div>
      </div>
    </div>
  );
}
