'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le haut de la page d'accueil — le message commun (étude de marché inversée, §8)
//
//   Message principal : « Konnen sa w FÈ vre, chak swa. »
//   Positionnement    : « ProfitPilot ranplase kaye a, pa kontab la. »
//   Signature         : « Kaye ou, nan telefòn ou. »
//
// L'illustration n'est plus un tableau de bord à graphiques : c'est l'angle
// même du produit (§10) — le marchand ne va pas chercher son rapport, c'est le
// bilan du soir qui vient à lui sur WhatsApp, avec trois chiffres et un conseil.
// Les montants sont ceux d'une illustration, comme le dit sa légende : cette
// page s'adresse à quelqu'un qui n'a pas encore de compte.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle, Mic } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';
import { PLANS, TRIAL_DAYS, pricePerDay } from '../../lib/plans';

const FROM_PER_DAY = pricePerDay(PLANS[0].priceG);

// ── Le bilan du soir, tel qu'il arrive sur WhatsApp ──────────────────────────

function EveningMessageMockup() {
  const { t } = useLanguage();
  const lines = [
    { label: t({ fr: 'Vendu', ht: 'Sa w vann' }),        value: '20 000 G' },
    { label: t({ fr: 'Dépensé', ht: 'Sa w depanse' }),    value: '13 400 G' },
    { label: t({ fr: 'Gagné', ht: 'Pwofi' }),             value: '6 600 G', strong: true },
    { label: t({ fr: 'Caisse attendue', ht: 'Kès atandi' }), value: '9 200 G' },
    { label: t({ fr: 'On vous doit', ht: 'Sa yo dwe w' }), value: '7 500 G' },
  ];

  return (
    <div className="relative w-full max-w-[360px]">
      <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="overflow-hidden rounded-[28px] border border-border bg-[#ECE5DD] shadow-[0_32px_80px_rgba(0,31,63,0.14)]"
      >
        {/* En-tête de conversation */}
        <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">PP</span>
          <div>
            <p className="text-sm font-semibold">ProfitPilot</p>
            <p className="text-note text-white/70">{t({ fr: 'ce soir, 19 h', ht: 'aswè a, 7è' })}</p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* La vente dite à voix haute, plus tôt dans la journée */}
          <div className="ml-auto flex w-fit max-w-[85%] items-center gap-2 rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2 text-sm text-slate-700">
            <Mic size={16} className="flex-shrink-0 text-[#075E54]" aria-hidden />
            « M vann 2 kola 150 goud »
          </div>

          {/* Le bilan */}
          <div className="w-fit max-w-[92%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-semibold text-primary">{t({ fr: 'Votre journée', ht: 'Jounen ou' })}</p>
            <dl className="mt-2 space-y-1">
              {lines.map((line) => (
                <div key={line.label} className="flex justify-between gap-6">
                  <dt className="text-slate-500">{line.label}</dt>
                  <dd className={`amount ${line.strong ? 'font-bold text-success' : 'font-semibold text-primary'}`}>{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-slate-100 pt-2 text-slate-600">
              {t({
                fr: 'Conseil : Jean vous doit 2 500 G depuis 12 jours. Envoyez-lui un rappel ?',
                ht: 'Konsèy : Jean dwe w 2 500 G depi 12 jou. Ou vle voye yon rapèl ba li ?',
              })}
            </p>
          </div>
        </div>
      </motion.div>

      <p className="mt-3 text-center text-note text-slate-400">
        {t({ fr: 'Illustration : chaque soir, vos vrais chiffres.', ht: 'Egzanp : chak swa, vrè chif ou yo.' })}
      </p>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as any } },
};

export function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-white px-5 pb-24 pt-20 md:px-10 lg:px-16">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#001f3f 1px, transparent 1px), linear-gradient(90deg, #001f3f 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-accent/8 blur-[120px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-7"
        >
          {/* La signature */}
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent">
              <MessageCircle size={16} aria-hidden />
              {t({ fr: 'Votre cahier, dans votre téléphone.', ht: 'Kaye ou, nan telefòn ou.' })}
            </span>
          </motion.div>

          {/* Le message principal */}
          <motion.h1
            variants={fadeUp}
            className="text-4xl font-extrabold leading-[1.1] tracking-tight text-primary sm:text-5xl"
          >
            {t({ fr: 'Savoir ce que vous gagnez vraiment,', ht: 'Konnen sa w FÈ vre,' })}
            <br />
            <span className="text-accent">{t({ fr: 'chaque soir.', ht: 'chak swa.' })}</span>
          </motion.h1>

          {/* Le positionnement, puis la mécanique */}
          <motion.div variants={fadeUp} className="max-w-lg space-y-3">
            <p className="text-lg font-semibold text-primary">
              {t({ fr: 'ProfitPilot remplace le cahier, pas le comptable.', ht: 'ProfitPilot ranplase kaye a, pa kontab la.' })}
            </p>
            <p className="text-lg leading-8 text-slate-500">
              {t({
                fr: 'Vous notez en 3 secondes, d’un bouton ou de la voix, en kreyòl. Chaque soir, ProfitPilot vient à vous sur WhatsApp avec 3 chiffres et 1 conseil.',
                ht: 'Ou note an 3 segonn, ak yon bouton oswa ak vwa w, an kreyòl. Chak swa, ProfitPilot vin jwenn ou sou WhatsApp ak 3 chif ak 1 konsèy.',
              })}
            </p>
          </motion.div>

          {/* Les deux métiers, dans leurs propres mots */}
          <motion.ul variants={fadeUp} className="flex flex-col gap-2 text-sm text-primary">
            <li className="rounded-xl border border-border bg-surface px-4 py-3">
              {t({ fr: '« Vous avez vendu 20 000 gourdes aujourd’hui. Combien sont à vous ? »', ht: '« Ou vann 20 000 goud jodi a. Konbyen ki pou ou ? »' })}
            </li>
            <li className="rounded-xl border border-border bg-surface px-4 py-3">
              {t({ fr: '« Vous avez fait 8 têtes aujourd’hui. Combien reste-t-il après les produits et votre aide ? »', ht: '« Ou fè 8 tèt jodi a. Konbyen ki rete apre pwodui yo ak èd ou ? »' })}
            </li>
          </motion.ul>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
            <Link
              href="/onboarding"
              className="group inline-flex min-h-touch items-center gap-3 rounded-2xl bg-primary px-7 py-4 text-base font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95"
            >
              {t({ fr: `Essayer ${TRIAL_DAYS} jours gratuitement`, ht: `Eseye l gratis ${TRIAL_DAYS} jou` })}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-touch items-center gap-2 rounded-2xl border border-border bg-white px-7 py-4 text-base font-semibold text-primary transition hover:border-accent/40 hover:bg-accent/5 active:scale-95"
            >
              {t({ fr: `Voir les prix : dès ${FROM_PER_DAY} HTG par jour`, ht: `Wè pri yo : apati ${FROM_PER_DAY} goud pa jou` })}
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center lg:justify-end"
        >
          <EveningMessageMockup />
        </motion.div>
      </div>
    </section>
  );
}
