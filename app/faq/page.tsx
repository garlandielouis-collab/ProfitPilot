'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les questions fréquentes — les objections du marchand, et nos réponses
//
// Elles suivent le §7 de l'étude de marché inversée : chaque objection reçoit
// la réponse que le produit permet VRAIMENT de tenir aujourd'hui. L'ancienne
// page affirmait « ProfitPilot ofri yon plan gratis » — il n'en existe aucun —
// et promettait « bilan, eta rezilta, fliks trezoreri » : exactement le
// vocabulaire de comptable qui fait dire « kontablite se pou gwo biznis ».
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '../../components/LanguageWrapper';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANS, TRIAL_DAYS, pricePerDay } from '../../lib/plans';
import { SUPPORT_WHATSAPP_DISPLAY, supportMessage, supportWhatsAppLink } from '../../lib/support';

type Text = { fr: string; ht: string };

const ESANSYEL_PER_DAY = pricePerDay(PLANS[0].priceG);

const FAQS: { q: Text; a: Text }[] = [
  {
    q: { fr: '« C’est trop cher. »', ht: '« Li twò chè. »' },
    a: {
      fr: `Esansyel coûte ${PLANS[0].priceG.toLocaleString('fr-FR')} HTG par mois, soit environ ${ESANSYEL_PER_DAY} gourdes par jour : moins qu’un kola. Vous payez par MonCash ou NatCash, au mois ou six mois d’avance, et vous essayez d’abord ${TRIAL_DAYS} jours sans rien payer.`,
      ht: `Esansyel koute ${PLANS[0].priceG.toLocaleString('fr-FR')} goud pa mwa, sa vle di anviwon ${ESANSYEL_PER_DAY} goud pa jou : mwens pase yon kola. Ou peye ak MonCash oswa NatCash, pa mwa oswa 6 mwa davans, epi ou eseye l ${TRIAL_DAYS} jou anvan, san peye anyen.`,
    },
  },
  {
    q: { fr: '« Je n’ai pas toujours internet. »', ht: '« M pa gen entènèt tout tan. »' },
    a: {
      fr: 'La vente rapide marche sans réseau : elle est gardée dans le téléphone et part toute seule dès que le réseau revient.',
      ht: 'Vann rapid la mache menm lè pa gen rezo : li rete nan telefòn nan, epi li pati poukont li depi rezo a tounen.',
    },
  },
  {
    q: { fr: '« Je ne sais pas me servir d’une application. »', ht: '« M pa konn sèvi ak aplikasyon. »' },
    a: {
      fr: 'Trois gros boutons : VANN, DEPANS, KREDI. Vous pouvez aussi dire la vente à voix haute, en kreyòl. Si vous savez envoyer un vocal WhatsApp, vous savez vous servir de ProfitPilot — et si vous bloquez, « Ekri nou » vous met en contact avec nous en un tap.',
      ht: 'Twa gwo bouton : VANN, DEPANS, KREDI. Ou ka di vant lan tou, an kreyòl. Si w konn voye yon vokal WhatsApp, ou konn sèvi ak ProfitPilot — e si w bloke, « Ekri nou » mete w an kontak avè n nan yon sèl tap.',
    },
  },
  {
    q: { fr: '« Mon téléphone est vieux / n’a plus de place. »', ht: '« Telefòn mwen vye / li pa gen plas. »' },
    a: {
      fr: 'ProfitPilot s’ouvre dans le navigateur du téléphone : rien de lourd à télécharger. Un Android 10 ou plus récent suffit.',
      ht: 'ProfitPilot louvri nan navigatè telefòn ou : pa gen anyen lou pou telechaje. Yon Android 10 oswa pi nouvo ase.',
    },
  },
  {
    q: { fr: '« Et si je perds mon téléphone ? »', ht: '« Si m pèdi telefòn nan ? »' },
    a: {
      fr: 'Vos chiffres ne sont pas dans le téléphone : ils sont sauvegardés. Sur un nouveau téléphone, vous vous connectez avec votre numéro et votre mot de passe, et tout est là. Le cahier peut se mouiller ; ProfitPilot, non.',
      ht: 'Chif ou yo pa nan telefòn nan : yo sove. Sou yon lòt telefòn, ou konekte ak nimewo w ak modpas ou, epi tout bagay la. Kaye a ka mouye. ProfitPilot pa ka mouye.',
    },
  },
  {
    q: { fr: '« Je n’ai pas le temps. »', ht: '« M pa gen tan. »' },
    a: {
      fr: 'Trois secondes par vente. Et vous n’allez pas chercher de rapport : c’est le bilan du soir qui vient à vous, avec trois chiffres et un conseil.',
      ht: 'Twa segonn pa vant. Epi ou pa bezwen chèche rapò : se rapò chak swa a k ap vin jwenn ou, ak twa chif ak yon konsèy.',
    },
  },
  {
    q: { fr: '« Je ne veux pas qu’on voie mes chiffres. »', ht: '« M pa vle moun wè chif mwen. »' },
    a: {
      fr: 'Vos chiffres ne sont partagés avec personne sans votre accord, et nous ne faisons aucune déclaration à votre place. Vos aides peuvent noter des ventes sans voir ni le profit ni la caisse : c’est vous seul qui voyez le profit.',
      ht: 'Chif ou yo pa pataje ak pèsonn san w pa dakò, e nou pa fè okenn deklarasyon pou ou. Èd ou yo ka anrejistre vant san yo pa wè pwofi a ni kès la : se ou sèl ki wè pwofi a.',
    },
  },
  {
    q: { fr: '« Mes clients n’aimeront pas les rappels. »', ht: '« Kliyan m yo p ap renmen rapèl. »' },
    a: {
      fr: 'Le rappel est poli, en kreyòl, avec le montant exact. Vous pouvez le modifier, et c’est vous qui l’envoyez depuis votre propre WhatsApp, quand vous le décidez. Le crédit, c’est la confiance : l’écrire, c’est la faire durer.',
      ht: 'Rapèl la poli, an kreyòl, ak montan egzak la. Ou ka chanje l, epi se ou ki voye l sou pwòp WhatsApp ou, lè w deside. Kredi se konfyans. Ekri l pou konfyans la dire.',
    },
  },
  {
    q: { fr: '« La comptabilité, c’est pour les grosses entreprises. »', ht: '« Kontablite se pou gwo biznis. »' },
    a: {
      fr: 'ProfitPilot ne fait pas de comptabilité : il remplace le cahier, pas le comptable. Il vous dit ce que vous avez vendu, ce que vous avez dépensé, ce que vous gagnez vraiment et qui vous doit.',
      ht: 'ProfitPilot pa fè kontablite : li ranplase kaye a, pa kontab la. Li di w sa w vann, sa w depanse, sa w fè vre ak kiyès ki dwe w.',
    },
  },
  {
    q: { fr: 'Gourdes, dola ayisyen et dollars ?', ht: 'Goud, dola ayisyen ak dola ameriken ?' },
    a: {
      fr: 'Oui. Vous notez dans l’unité de votre choix — gourde, dola ayisyen (5 gourdes) ou dollar — et ProfitPilot convertit avec le taux du jour, que vous pouvez corriger.',
      ht: 'Wi. Ou note nan sa w vle — goud, dola ayisyen (5 goud) oswa dola ameriken — epi ProfitPilot konvèti ak to jounen an, ou ka chanje l si w vle.',
    },
  },
  {
    q: { fr: 'À quoi sert l’assistant Pilot AI ?', ht: 'Ki sa asistan Pilot AI a fè ?' },
    a: {
      fr: 'Vous lui posez une question simple — « Ki pwodui ki ba m plis pwofi ? » — et il répond en une phrase et un chiffre, à partir de vos propres ventes. Il commence avec l’offre Kwasans.',
      ht: 'Ou poze l yon kesyon senp — « Ki pwodui ki ba m plis pwofi ? » — epi li reponn ou nan yon fraz ak yon chif, apati pwòp vant ou yo. Li kòmanse ak ofr Kwasans lan.',
    },
  },
  {
    q: { fr: 'Comment contacter le support ?', ht: 'Kijan mwen kontakte sipò a ?' },
    a: {
      fr: `Sur WhatsApp au ${SUPPORT_WHATSAPP_DISPLAY}, par écrit ou par vocal, en kreyòl. Dans l’application, le bouton « Ekri nou » ouvre directement la conversation.`,
      ht: `Sou WhatsApp nan ${SUPPORT_WHATSAPP_DISPLAY}, ekri oswa vokal, an kreyòl. Nan aplikasyon an, bouton « Ekri nou » an louvri konvèsasyon an tou dwat.`,
    },
  },
];

function FAQItem({ q, a }: { q: Text; a: Text }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-touch w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-semibold text-primary">{t(q)}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="shrink-0 text-slate-400" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <p className="pb-5 text-sm leading-7 text-slate-500">{t(a)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10">
        <Link href="/" className="mb-8 inline-flex min-h-touch items-center gap-2 text-sm text-slate-500 hover:text-primary transition">
          <ArrowLeft size={16} /> {t({ fr: 'Retour à l’accueil', ht: 'Retounen lakay' })}
        </Link>
        <div className="mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-accent">{t({ fr: 'Questions', ht: 'Kesyon' })}</span>
          <h1 className="mt-2 text-3xl font-extrabold text-primary">{t({ fr: 'Ce que les marchands nous demandent', ht: 'Sa machann yo konn mande nou' })}</h1>
          <p className="mt-3 text-slate-500">{t({ fr: 'Les vraies questions, avec des réponses honnêtes.', ht: 'Vrè kesyon yo, ak repons onèt.' })}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white px-6">
          {FAQS.map((f) => <FAQItem key={f.q.ht} q={f.q} a={f.a} />)}
        </div>
        <div className="mt-10 rounded-2xl border border-accent/20 bg-accent/5 p-6 text-center">
          <p className="font-semibold text-primary">{t({ fr: 'Vous n’avez pas trouvé votre réponse ?', ht: 'Ou pa jwenn repons ou a ?' })}</p>
          <p className="mt-1 text-sm text-slate-500">{t({ fr: 'Écrivez-nous, ou envoyez un vocal.', ht: 'Ekri nou, oswa voye yon vokal.' })}</p>
          <a href={supportWhatsAppLink(supportMessage('FAQ'))} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-touch items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition">
            {t({ fr: 'Ekri nou sur WhatsApp', ht: 'Ekri nou sou WhatsApp' })}
          </a>
        </div>
      </div>
    </div>
  );
}
