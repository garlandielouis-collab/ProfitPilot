'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store Builder — l'onglet Contenu
//
// Le gabarit décide de la mise en page ; cet onglet décide de ce qu'il y a
// dedans. Sans lui, un marchand qui choisit « Prestataire de services » obtient
// une page où la moitié des sections ne s'affichent pas — puisque la règle du
// moteur est « rien à saisir, rien d'affiché » — et il conclut que le gabarit
// est cassé.
//
// ── L'ordre des blocs suit l'ordre de SA page ──────────────────────────────
//
// Pas un ordre alphabétique, pas l'ordre du schéma : celui dans lequel le
// visiteur verra les sections. Le marchand remplit sa vitrine de haut en bas,
// comme il la lira. Les sections que son gabarit n'affiche pas sont reléguées
// en bas, dépliables, avec la mention qui va bien — les retirer complètement
// ferait perdre un texte déjà saisi le jour où il change de gabarit.
//
// ── Ce que cet écran ne fait pas ───────────────────────────────────────────
//
// Il ne propose aucun texte d'exemple à recopier, aucun chiffre de départ,
// aucune question fréquente pré-remplie. Un « 98 % de satisfaction » suggéré
// par nous se retrouverait publié tel quel sur la vitrine d'un commerçant, sous
// son nom, devant ses clients. Les seuls repères donnés sont des exemples DANS
// l'aide du champ, jamais dans sa valeur.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash2, EyeOff } from 'lucide-react';
import { saveContent, type BuilderState } from '../../actions/storeBuilder';
import { SECTIONS, type SectionKey } from '../../../lib/storeSections';
import type { ThemeConfig } from '../../../lib/storeTheme';
import { Button } from '../../../components/ds/Button';
import { Card } from '../../../components/ds/Surface';
import { Field, TextField, SelectField } from '../../../components/ds/Field';
import { Switch } from '../../../components/ds/Switch';
import { ImageField, ImageListField } from './ImageField';

/** Les sections dont le CONTENU se saisit. Les autres lisent le catalogue. */
const EDITABLE: SectionKey[] = [
  'announcement', 'hero', 'benefits', 'stats', 'process', 'gallery',
  'order_form', 'cta_band', 'promotion', 'brand_story', 'testimonials',
  'faq', 'newsletter', 'social',
  // Les neuf sections qui répondent (§36). Deux d'entre elles se remplissent
  // presque seules : « Livraison » et « Comment payer » affichent les modes
  // réels de la boutique, et n'attendent ici qu'une précision facultative.
  'shipping', 'payments', 'contact', 'countdown', 'video', 'partners',
  'size_guide', 'ingredients', 'team',
  // Les six sections des gabarits métier (§34). « Disponibles actuellement »
  // n'a presque rien à saisir : les quantités viennent du stock réel, et c'est
  // tout l'intérêt d'une liste de disponibilités.
  'availability', 'wholesale', 'packages', 'case_studies', 'journal',
  'video_wall',
];

/**
 * Une adresse d'image utilisable, ou `null`.
 *
 * Le schéma du thème remplace silencieusement une adresse invalide par `null` :
 * le marchand collerait « www.monsite.com/photo.jpg », enregistrerait, et son
 * image aurait disparu sans un mot. Autant la refuser ici, où l'on peut le lui
 * dire.
 */
function cleanUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : null;
}

/**
 * Une date ISO ↔ la valeur d'un champ « datetime-local ».
 *
 * Le champ HTML parle en heure LOCALE et sans fuseau ; le thème stocke de
 * l'ISO en UTC. Sans ces deux conversions, un marchand à Port-au-Prince qui
 * saisit « 18 h » verrait « 14 h » en rouvrant son éditeur, et son compte à
 * rebours se terminerait quatre heures trop tôt.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isUrlish(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function ContentTab({
  state, run, pending,
}: {
  state:   BuilderState;
  run:     (fn: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const [theme, setTheme] = useState<ThemeConfig>(state.theme);

  function patch<K extends keyof ThemeConfig>(key: K, value: Partial<ThemeConfig[K]>) {
    setTheme((t) => ({ ...t, [key]: { ...t[key], ...value } }));
  }

  // Les blocs, dans l'ordre de la page du marchand ; puis ceux que son gabarit
  // n'affiche pas.
  const { shown, hidden } = useMemo(() => {
    const inPage = state.sections
      .map((s) => s.key)
      .filter((k) => EDITABLE.includes(k));
    return {
      shown:  inPage,
      hidden: EDITABLE.filter((k) => !inPage.includes(k)),
    };
  }, [state.sections]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-text2 dark:text-dark-text2">
        Une section vide ne s'affiche pas sur votre boutique. Remplissez ce qui
        vous concerne, laissez le reste de côté.
      </p>

      {shown.map((key) => (
        <div key={key}>{renderEditor(key, theme, patch, state.businessId)}</div>
      ))}

      {hidden.length > 0 && (
        <details className="rounded-surface border border-border p-4 dark:border-dark-border">
          <summary className="flex min-h-action cursor-pointer items-center gap-2 text-body font-semibold text-primary dark:text-dark-text">
            <EyeOff className="h-4 w-4 text-muted" strokeWidth={1.8} aria-hidden />
            Sections que ce gabarit n'affiche pas ({hidden.length})
          </summary>
          <p className="mt-2 text-note text-muted dark:text-dark-muted">
            Elles restent enregistrées. Elles reviendront si vous changez de
            gabarit ou si vous les ajoutez depuis l'onglet Sections.
          </p>
          <div className="mt-4 flex flex-col gap-6">
            {hidden.map((key) => (
              <div key={key}>{renderEditor(key, theme, patch, state.businessId)}</div>
            ))}
          </div>
        </details>
      )}

      <Button
        variant="accent"
        size="lg"
        block
        loading={pending}
        loadingLabel="Enregistrement…"
        onClick={() => run(() => saveContent(theme))}
      >
        Enregistrer le contenu
      </Button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Les blocs
// ═════════════════════════════════════════════════════════════════════════════

type Patch = <K extends keyof ThemeConfig>(key: K, value: Partial<ThemeConfig[K]>) => void;

function renderEditor(
  key: SectionKey,
  theme: ThemeConfig,
  patch: Patch,
  /** L'entreprise : le premier segment du chemin de stockage des photos. */
  businessId: string,
): ReactNode {
  const label = SECTIONS[key].label;
  const hint  = SECTIONS[key].hint;

  switch (key) {
    case 'announcement':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.announcement.enabled}
          onChange={(enabled) => patch('announcement', { enabled })}
        >
          <Field
            label="Le message"
            hint="Une phrase. « Livraison gratuite à Port-au-Prince cette semaine. »"
            maxLength={120}
            value={theme.announcement.text}
            onChange={(e) => patch('announcement', { text: e.target.value })}
          />
        </Group>
      );

    case 'hero':
      return (
        <Block title="Bannière" hint={hint}>
          <Field
            label="Le surtitre"
            hint="Facultatif. Quelques mots au-dessus de l'accroche : « Nouvelle collection »."
            maxLength={40}
            value={theme.hero.eyebrow}
            onChange={(e) => patch('hero', { eyebrow: e.target.value })}
          />
          <Field
            label="L'accroche"
            hint="Ce que vous vendez, en une ligne. Vide : le nom de votre boutique."
            maxLength={120}
            value={theme.hero.headline}
            onChange={(e) => patch('hero', { headline: e.target.value })}
          />
          <TextField
            label="La phrase de soutien"
            hint="Une précision : votre zone de livraison, votre spécialité."
            rows={2}
            maxLength={240}
            value={theme.hero.subheadline}
            onChange={(e) => patch('hero', { subheadline: e.target.value })}
          />
          <Field
            label="Le bouton"
            hint="Vide : « Découvrir la boutique »."
            maxLength={40}
            value={theme.hero.ctaLabel}
            onChange={(e) => patch('hero', { ctaLabel: e.target.value })}
          />
          <ImageField
            label="La photo de bannière"
            hint={
              "Sans photo, votre boutique affiche l'image de départ de votre gabarit — "
              + "une photo d'illustration, pas la vôtre. Mettez la vôtre dès que vous en avez "
              + "une : c'est le premier écran que vos clients voient."
            }
            value={theme.hero.imageUrl}
            onChange={(imageUrl) => patch('hero', { imageUrl })}
            businessId={businessId}
            slot="banniere"
            ratio="16 / 9"
          />
          <div>
            <p className="text-body font-semibold text-primary dark:text-dark-text">
              Assombrissement de la photo
            </p>
            <p className="mt-0.5 text-note text-muted dark:text-dark-muted">
              Plus la photo est claire, plus il en faut pour que le texte reste
              lisible. {theme.hero.overlay} %.
            </p>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={theme.hero.overlay}
              onChange={(e) => patch('hero', { overlay: Number(e.target.value) })}
              aria-label="Assombrissement de la photo, en pourcentage"
              className="mt-3 h-touch w-full cursor-pointer accent-accent"
            />
          </div>
        </Block>
      );

    case 'benefits':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.trust.enabled}
          onChange={(enabled) => patch('trust', { enabled })}
        >
          <Rows
            items={theme.trust.badges}
            max={4}
            blank={{ icon: 'shield' as const, label: '', note: '' }}
            addLabel="Ajouter une garantie"
            onChange={(badges) => patch('trust', { badges })}
            render={(badge, set) => (
              <>
                <Field
                  label="La garantie"
                  hint="« Livraison en 24 h », « Paiement MonCash »."
                  maxLength={40}
                  value={badge.label}
                  onChange={(e) => set({ ...badge, label: e.target.value })}
                />
                <Field
                  label="La précision"
                  hint="Facultatif. « Port-au-Prince et Pétion-Ville »."
                  maxLength={80}
                  value={badge.note}
                  onChange={(e) => set({ ...badge, note: e.target.value })}
                />
                <SelectField
                  label="L'icône"
                  options={[
                    { value: 'truck',   label: 'Camion — livraison' },
                    { value: 'shield',  label: 'Bouclier — garantie' },
                    { value: 'refresh', label: 'Flèches — retours' },
                    { value: 'phone',   label: 'Téléphone — contact' },
                    { value: 'card',    label: 'Carte — paiement' },
                    { value: 'clock',   label: 'Horloge — délai' },
                  ]}
                  value={badge.icon}
                  onChange={(e) => set({ ...badge, icon: e.target.value as typeof badge.icon })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'stats':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.stats.enabled}
          onChange={(enabled) => patch('stats', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            Ces chiffres seront lus comme des engagements. N'y mettez que ce que
            vous pouvez tenir.
          </p>
          <Rows
            items={theme.stats.items}
            max={4}
            blank={{ value: '', label: '', note: '' }}
            addLabel="Ajouter un chiffre"
            onChange={(items) => patch('stats', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Le chiffre"
                  hint="« +200 », « 8 ans », « 98 % »."
                  maxLength={16}
                  value={item.value}
                  onChange={(e) => set({ ...item, value: e.target.value })}
                />
                <Field
                  label="Ce qu'il compte"
                  hint="« clients accompagnés », « d'expérience »."
                  maxLength={40}
                  value={item.label}
                  onChange={(e) => set({ ...item, label: e.target.value })}
                />
                <Field
                  label="La précision"
                  hint="Facultatif. « depuis 2018 »."
                  maxLength={40}
                  value={item.note}
                  onChange={(e) => set({ ...item, note: e.target.value })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'process':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.process.enabled}
          onChange={(enabled) => patch('process', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.process.title}
            onChange={(e) => patch('process', { title: e.target.value })}
          />
          <Rows
            items={theme.process.steps}
            max={4}
            blank={{ title: '', body: '' }}
            addLabel="Ajouter une étape"
            onChange={(steps) => patch('process', { steps })}
            render={(step, set) => (
              <>
                <Field
                  label="L'étape"
                  hint="« Vous choisissez », « On livre »."
                  maxLength={60}
                  value={step.title}
                  onChange={(e) => set({ ...step, title: e.target.value })}
                />
                <TextField
                  label="Ce qui se passe"
                  rows={2}
                  maxLength={240}
                  value={step.body}
                  onChange={(e) => set({ ...step, body: e.target.value })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'gallery':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.gallery.enabled}
          onChange={(enabled) => patch('gallery', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.gallery.title}
            onChange={(e) => patch('gallery', { title: e.target.value })}
          />
          <Field
            label="La légende"
            hint="Facultatif. Une ligne sous le titre."
            maxLength={160}
            value={theme.gallery.caption}
            onChange={(e) => patch('gallery', { caption: e.target.value })}
          />
          <ImageListField
            images={theme.gallery.images}
            onChange={(images) => patch('gallery', { images })}
            businessId={businessId}
            slot="galerie"
          />
        </Group>
      );

    case 'order_form':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.orderForm.enabled}
          onChange={(enabled) => patch('orderForm', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            La demande part sur votre WhatsApp, déjà rédigée. Sans numéro
            WhatsApp, la section ne s'affiche pas.
          </p>
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.orderForm.title}
            onChange={(e) => patch('orderForm', { title: e.target.value })}
          />
          <TextField
            label="Ce que vous demandez au client"
            hint="« Dites-nous la date, le nombre de parts et vos préférences. »"
            rows={2}
            maxLength={240}
            value={theme.orderForm.body}
            onChange={(e) => patch('orderForm', { body: e.target.value })}
          />
          <Field
            label="Le bouton"
            maxLength={40}
            value={theme.orderForm.ctaLabel}
            onChange={(e) => patch('orderForm', { ctaLabel: e.target.value })}
          />
          <Switch
            checked={theme.orderForm.askDate}
            onChange={(askDate) => patch('orderForm', { askDate })}
            label="Demander une date et une heure"
            hint="Indispensable pour un gâteau, un buffet, un événement."
          />
        </Group>
      );

    case 'cta_band':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.ctaBand.enabled}
          onChange={(enabled) => patch('ctaBand', { enabled })}
        >
          <Field
            label="La phrase"
            hint="« Prêt à démarrer ? »"
            maxLength={100}
            value={theme.ctaBand.title}
            onChange={(e) => patch('ctaBand', { title: e.target.value })}
          />
          <TextField
            label="La précision"
            rows={2}
            maxLength={200}
            value={theme.ctaBand.body}
            onChange={(e) => patch('ctaBand', { body: e.target.value })}
          />
          <Field
            label="Le bouton"
            hint="Vide : aucun bouton n'est affiché."
            maxLength={40}
            value={theme.ctaBand.ctaLabel}
            onChange={(e) => patch('ctaBand', { ctaLabel: e.target.value })}
          />
          <Field
            label="Où il mène"
            hint="Vide : votre catalogue."
            maxLength={200}
            value={theme.ctaBand.ctaHref}
            onChange={(e) => patch('ctaBand', { ctaHref: e.target.value })}
          />
        </Group>
      );

    case 'promotion':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.promotion.enabled}
          onChange={(enabled) => patch('promotion', { enabled })}
        >
          <Field
            label="Le titre de l'offre"
            maxLength={80}
            value={theme.promotion.title}
            onChange={(e) => patch('promotion', { title: e.target.value })}
          />
          <TextField
            label="Les conditions"
            hint="Ce qui est inclus, jusqu'à quand."
            rows={2}
            maxLength={160}
            value={theme.promotion.subtitle}
            onChange={(e) => patch('promotion', { subtitle: e.target.value })}
          />
          <Field
            label="Le bouton"
            maxLength={40}
            value={theme.promotion.ctaLabel}
            onChange={(e) => patch('promotion', { ctaLabel: e.target.value })}
          />
          <Field
            label="Où il mène"
            hint="Vide : votre catalogue."
            maxLength={200}
            value={theme.promotion.ctaHref}
            onChange={(e) => patch('promotion', { ctaHref: e.target.value })}
          />
          <ImageField
            label="La photo de l'encart"
            value={theme.promotion.imageUrl}
            onChange={(imageUrl) => patch('promotion', { imageUrl })}
            businessId={businessId}
            slot="encart"
            ratio="16 / 9"
          />
        </Group>
      );

    case 'brand_story':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.brandStory.enabled}
          onChange={(enabled) => patch('brandStory', { enabled })}
        >
          <Field
            label="Le titre"
            maxLength={80}
            value={theme.brandStory.title}
            onChange={(e) => patch('brandStory', { title: e.target.value })}
          />
          <TextField
            label="Votre histoire"
            hint="Deux paragraphes suffisent. Qui vous êtes, depuis quand, pourquoi."
            rows={6}
            maxLength={1200}
            value={theme.brandStory.body}
            onChange={(e) => patch('brandStory', { body: e.target.value })}
          />
          <ImageField
            label="Une photo"
            hint="Votre atelier, votre boutique, vous au travail."
            value={theme.brandStory.imageUrl}
            onChange={(imageUrl) => patch('brandStory', { imageUrl })}
            businessId={businessId}
            slot="histoire"
            ratio="15 / 14"
          />
          {/* Les points viennent de l'ancienne section « Présentation », que
              ce bloc a absorbée : ils restent rangés dans `presentation.items`
              pour que ceux déjà saisis ne se perdent pas. */}
          <Rows
            items={theme.presentation.items.slice(0, 3)}
            max={3}
            blank={{ title: '', body: '' }}
            addLabel="Ajouter un engagement"
            onChange={(items) => patch('presentation', { items, enabled: true })}
            render={(item, set) => (
              <Field
                label="Un engagement, en quelques mots"
                hint="« Sélection soignée », « Prix affichés clairement », « Service humain sur WhatsApp »."
                maxLength={70}
                value={item.title}
                onChange={(e) => set({ ...item, title: e.target.value })}
              />
            )}
          />
        </Group>
      );

    case 'testimonials':
      return (
        <Group
          title="Avis clients"
          hint="Les avis déposés sur vos fiches produit s'affichent dès que vous les publiez. Ceux saisis ici viennent en complément."
          checked={theme.socialProof.enabled}
          onChange={(enabled) => patch('socialProof', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            N'y recopiez que des avis réellement reçus. Un avis inventé engage
            votre commerce, pas ProfitPilot.
          </p>
          <Field
            label="Le titre de la section"
            maxLength={60}
            value={theme.socialProof.title}
            onChange={(e) => patch('socialProof', { title: e.target.value })}
          />
          <Rows
            items={theme.socialProof.items}
            max={6}
            blank={{ author: '', text: '', rating: 0 }}
            addLabel="Ajouter un avis"
            onChange={(items) => patch('socialProof', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Qui l'a dit"
                  maxLength={60}
                  value={item.author}
                  onChange={(e) => set({ ...item, author: e.target.value })}
                />
                <TextField
                  label="Ce qu'il a dit"
                  rows={3}
                  maxLength={280}
                  value={item.text}
                  onChange={(e) => set({ ...item, text: e.target.value })}
                />
                <SelectField
                  label="La note"
                  hint="« Sans note » n'affiche aucune étoile."
                  options={[
                    { value: '0', label: 'Sans note' },
                    { value: '5', label: '5 étoiles' },
                    { value: '4', label: '4 étoiles' },
                    { value: '3', label: '3 étoiles' },
                    { value: '2', label: '2 étoiles' },
                    { value: '1', label: '1 étoile' },
                  ]}
                  value={String(item.rating)}
                  onChange={(e) => set({ ...item, rating: Number(e.target.value) })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'faq':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.faq.enabled}
          onChange={(enabled) => patch('faq', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            C'est la section la plus rentable de la page : chaque réponse écrite
            ici est un message de moins à écrire sur WhatsApp.
          </p>
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.faq.title}
            onChange={(e) => patch('faq', { title: e.target.value })}
          />
          <Rows
            items={theme.faq.items}
            max={12}
            blank={{ question: '', answer: '' }}
            addLabel="Ajouter une question"
            onChange={(items) => patch('faq', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="La question"
                  hint="« Livrez-vous en province ? »"
                  maxLength={160}
                  value={item.question}
                  onChange={(e) => set({ ...item, question: e.target.value })}
                />
                <TextField
                  label="Votre réponse"
                  rows={3}
                  maxLength={800}
                  value={item.answer}
                  onChange={(e) => set({ ...item, answer: e.target.value })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'newsletter':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.newsletter.enabled}
          onChange={(enabled) => patch('newsletter', { enabled })}
        >
          <Field
            label="Le titre"
            maxLength={80}
            value={theme.newsletter.title}
            onChange={(e) => patch('newsletter', { title: e.target.value })}
          />
          <TextField
            label="Ce que le client y gagne"
            hint="« Vous serez prévenu des arrivages avant tout le monde. »"
            rows={2}
            maxLength={200}
            value={theme.newsletter.body}
            onChange={(e) => patch('newsletter', { body: e.target.value })}
          />
        </Group>
      );

    case 'social':
      return (
        <Block title="Réseaux sociaux" hint={hint}>
          <Field
            label="Instagram"
            hint="L'adresse complète de votre page."
            maxLength={200}
            value={theme.social.instagram}
            onChange={(e) => patch('social', { instagram: e.target.value })}
          />
          <Field
            label="Facebook"
            maxLength={200}
            value={theme.social.facebook}
            onChange={(e) => patch('social', { facebook: e.target.value })}
          />
          <Field
            label="TikTok"
            maxLength={200}
            value={theme.social.tiktok}
            onChange={(e) => patch('social', { tiktok: e.target.value })}
          />
          <Field
            label="YouTube"
            maxLength={200}
            value={theme.social.youtube}
            onChange={(e) => patch('social', { youtube: e.target.value })}
          />
          <Field
            label="WhatsApp"
            hint="Le lien wa.me de votre numéro."
            maxLength={200}
            value={theme.social.whatsapp}
            onChange={(e) => patch('social', { whatsapp: e.target.value })}
          />
        </Block>
      );

    // ── Les dix sections qui répondent (§36) ─────────────────────────────


    case 'shipping':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.shipping.enabled}
          onChange={(enabled) => patch('shipping', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            Vos modes de livraison, leurs délais et leurs prix viennent de
            Réglages → Livraison. Ils s'afficheront ici tels que votre caisse
            les appliquera : rien à retaper.
          </p>
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.shipping.title}
            onChange={(e) => patch('shipping', { title: e.target.value })}
          />
          <TextField
            label="La précision"
            hint="Ce que vos modes ne disent pas. « Nous livrons dans le grand Port-au-Prince, du lundi au samedi. »"
            rows={2}
            maxLength={240}
            value={theme.shipping.note}
            onChange={(e) => patch('shipping', { note: e.target.value })}
          />
          <TextField
            label="Vos retours"
            hint="Vide : aucune promesse de retour n'est affichée. N'écrivez ici que ce que vous accepterez."
            rows={3}
            maxLength={400}
            value={theme.shipping.returns}
            onChange={(e) => patch('shipping', { returns: e.target.value })}
          />
        </Group>
      );

    case 'payments':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.payments.enabled}
          onChange={(enabled) => patch('payments', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            Les modes affichés sont ceux que votre caisse accepte, réglés dans
            Réglages → Paiement. Un mode ajouté là apparaît ici tout seul.
          </p>
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.payments.title}
            onChange={(e) => patch('payments', { title: e.target.value })}
          />
          <TextField
            label="La précision"
            hint="« Le paiement à la livraison est réservé à Port-au-Prince. »"
            rows={2}
            maxLength={240}
            value={theme.payments.note}
            onChange={(e) => patch('payments', { note: e.target.value })}
          />
        </Group>
      );

    case 'contact':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.contact.enabled}
          onChange={(enabled) => patch('contact', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            Votre téléphone, votre WhatsApp, votre courriel et votre adresse
            viennent de vos réglages de boutique. Seuls les horaires se
            saisissent ici : ils n'existent nulle part ailleurs.
          </p>
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.contact.title}
            onChange={(e) => patch('contact', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'accueil"
            hint="Facultatif. « Un doute sur une taille ? Écrivez-nous, on répond dans l'heure. »"
            rows={2}
            maxLength={240}
            value={theme.contact.body}
            onChange={(e) => patch('contact', { body: e.target.value })}
          />
          <Rows
            items={theme.contact.hours}
            max={7}
            blank={{ days: '', hours: '' }}
            addLabel="Ajouter une ligne d'horaire"
            onChange={(hours) => patch('contact', { hours })}
            render={(row, set) => (
              <>
                <Field
                  label="Les jours"
                  hint="« Lundi au vendredi », « Samedi », « Dimanche »."
                  maxLength={40}
                  value={row.days}
                  onChange={(e) => set({ ...row, days: e.target.value })}
                />
                <Field
                  label="Les heures"
                  hint="« 8 h – 17 h ». Vide : la ligne affichera « Fermé »."
                  maxLength={40}
                  value={row.hours}
                  onChange={(e) => set({ ...row, hours: e.target.value })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'countdown':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.urgency.enabled}
          onChange={(enabled) => patch('urgency', { enabled })}
        >
          <p className="text-note text-muted dark:text-dark-muted">
            Le compte s'arrête à la date choisie et la bande disparaît. Elle ne
            se réarme pas toute seule : un client qui revient le lendemain et
            retrouve les mêmes heures restantes sait qu'on lui a menti — et il
            ne croira plus vos prix non plus.
          </p>
          <Field
            label="Le message"
            hint="« Promotion de rentrée », « Dernier jour de livraison offerte »."
            maxLength={80}
            value={theme.urgency.message}
            onChange={(e) => patch('urgency', { message: e.target.value })}
          />
          <div>
            <p className="text-body font-semibold text-primary dark:text-dark-text">
              La fin de l'offre
            </p>
            <p className="mt-0.5 text-note text-muted dark:text-dark-muted">
              Sans date, rien ne s'affiche.
            </p>
            <input
              type="datetime-local"
              value={toLocalInput(theme.urgency.deadline)}
              onChange={(e) => patch('urgency', { deadline: fromLocalInput(e.target.value) })}
              aria-label="La fin de l'offre"
              className="mt-2 min-h-touch w-full rounded-control border border-border bg-transparent px-3 text-body text-primary dark:border-dark-border dark:text-dark-text"
            />
          </div>
        </Group>
      );

    case 'video':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.video.enabled}
          onChange={(enabled) => patch('video', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.video.title}
            onChange={(e) => patch('video', { title: e.target.value })}
          />
          <TextField
            label="Ce que la vidéo montre"
            hint="Facultatif. Une phrase avant de lancer la lecture."
            rows={2}
            maxLength={240}
            value={theme.video.body}
            onChange={(e) => patch('video', { body: e.target.value })}
          />
          <UrlField
            label="Le lien de la vidéo"
            hint="YouTube, Vimeo ou Facebook. La vidéo ne se charge qu'au clic du visiteur."
            value={theme.video.url}
            onChange={(url) => patch('video', { url })}
          />
        </Group>
      );

    case 'partners':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.partners.enabled}
          onChange={(enabled) => patch('partners', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.partners.title}
            onChange={(e) => patch('partners', { title: e.target.value })}
          />
          <Rows
            items={theme.partners.items}
            max={8}
            blank={{ name: '', logoUrl: null }}
            addLabel="Ajouter un partenaire"
            onChange={(items) => patch('partners', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Le nom"
                  hint="Il s'affichera en toutes lettres si vous n'avez pas de logo."
                  maxLength={60}
                  value={item.name}
                  onChange={(e) => set({ ...item, name: e.target.value })}
                />
                <ImageField
                  label="Le logo"
                  hint="Facultatif."
                  value={item.logoUrl}
                  onChange={(logoUrl) => set({ ...item, logoUrl })}
                  businessId={businessId}
                  slot="partenaire"
                  ratio="3 / 2"
                />
              </>
            )}
          />
        </Group>
      );

    case 'size_guide':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.sizeGuide.enabled}
          onChange={(enabled) => patch('sizeGuide', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.sizeGuide.title}
            onChange={(e) => patch('sizeGuide', { title: e.target.value })}
          />
          <Field
            label="L'en-tête du tableau"
            hint="Les colonnes, séparées par des virgules : « Taille, Poitrine, Tour de taille, Hanches »."
            maxLength={160}
            value={theme.sizeGuide.columns}
            onChange={(e) => patch('sizeGuide', { columns: e.target.value })}
          />
          <TextField
            label="La précision"
            hint="Facultatif. « Mesures en centimètres, prises à plat. »"
            rows={2}
            maxLength={240}
            value={theme.sizeGuide.note}
            onChange={(e) => patch('sizeGuide', { note: e.target.value })}
          />
          <Rows
            items={theme.sizeGuide.rows}
            max={14}
            blank={{ cells: '' }}
            addLabel="Ajouter une ligne"
            onChange={(rows) => patch('sizeGuide', { rows })}
            render={(row, set) => (
              <Field
                label="La ligne"
                hint="Les valeurs dans l'ordre des colonnes, séparées par des virgules : « S, 86, 68, 92 »."
                maxLength={160}
                value={row.cells}
                onChange={(e) => set({ ...row, cells: e.target.value })}
              />
            )}
          />
        </Group>
      );

    case 'ingredients':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.ingredients.enabled}
          onChange={(enabled) => patch('ingredients', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.ingredients.title}
            onChange={(e) => patch('ingredients', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'introduction"
            hint="Facultatif."
            rows={2}
            maxLength={240}
            value={theme.ingredients.body}
            onChange={(e) => patch('ingredients', { body: e.target.value })}
          />
          <Rows
            items={theme.ingredients.items}
            max={8}
            blank={{ name: '', role: '' }}
            addLabel="Ajouter un composant"
            onChange={(items) => patch('ingredients', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Le nom"
                  hint="« Beurre de karité », « Vitamine C », « Farine locale »."
                  maxLength={60}
                  value={item.name}
                  onChange={(e) => set({ ...item, name: e.target.value })}
                />
                <TextField
                  label="À quoi il sert"
                  hint="Ce que vous pouvez tenir. Une promesse de santé vous engage, vous."
                  rows={2}
                  maxLength={160}
                  value={item.role}
                  onChange={(e) => set({ ...item, role: e.target.value })}
                />
              </>
            )}
          />
        </Group>
      );

    case 'team':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.team.enabled}
          onChange={(enabled) => patch('team', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.team.title}
            onChange={(e) => patch('team', { title: e.target.value })}
          />
          <Rows
            items={theme.team.members}
            max={6}
            blank={{ name: '', role: '', photoUrl: null }}
            addLabel="Ajouter une personne"
            onChange={(members) => patch('team', { members })}
            render={(member, set) => (
              <>
                <Field
                  label="Le nom"
                  maxLength={60}
                  value={member.name}
                  onChange={(e) => set({ ...member, name: e.target.value })}
                />
                <Field
                  label="Le rôle"
                  hint="« Fondatrice », « Chef pâtissier », « Conseiller »."
                  maxLength={60}
                  value={member.role}
                  onChange={(e) => set({ ...member, role: e.target.value })}
                />
                <ImageField
                  label="La photo"
                  hint="Facultatif. Sans photo, une silhouette neutre s'affiche."
                  value={member.photoUrl}
                  onChange={(photoUrl) => set({ ...member, photoUrl })}
                  businessId={businessId}
                  slot="equipe"
                  ratio="1 / 1"
                />
              </>
            )}
          />
        </Group>
      );

    case 'availability':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.availability.enabled}
          onChange={(enabled) => patch('availability', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.availability.title}
            onChange={(e) => patch('availability', { title: e.target.value })}
          />
          <TextField
            label="La précision"
            hint={
              "Facultatif. Ce que les quantités ne disent pas : vos jours d'arrivage, "
              + 'la façon de réserver un lot.'
            }
            rows={2}
            maxLength={240}
            value={theme.availability.note}
            onChange={(e) => patch('availability', { note: e.target.value })}
          />
          <p className="text-note text-muted dark:text-dark-muted">
            Les quantités affichées viennent de votre inventaire, article par
            article. Vous n'avez rien à saisir ici, et rien à tenir à jour :
            la section suit vos stocks. Elle ne s'affiche que si vos stocks
            sont visibles sur la boutique.
          </p>
        </Group>
      );

    case 'wholesale':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.wholesale.enabled}
          onChange={(enabled) => patch('wholesale', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.wholesale.title}
            onChange={(e) => patch('wholesale', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'introduction"
            hint="Facultatif. « À partir de 20 têtes, le prix baisse. »"
            rows={2}
            maxLength={240}
            value={theme.wholesale.body}
            onChange={(e) => patch('wholesale', { body: e.target.value })}
          />
          <Rows
            items={theme.wholesale.tiers}
            max={6}
            blank={{ quantity: '', price: '', note: '' }}
            addLabel="Ajouter un palier"
            onChange={(tiers) => patch('wholesale', { tiers })}
            render={(tier, set) => (
              <>
                <Field
                  label="La quantité"
                  hint="« 1 à 20 », « 21 à 50 », « 51 et plus »."
                  maxLength={40}
                  value={tier.quantity}
                  onChange={(e) => set({ ...tier, quantity: e.target.value })}
                />
                <Field
                  label="Le prix"
                  hint={
                    'Écrivez-le comme vous le dites : « 1 300 HTG / tête », '
                    + "« Sur devis ». C'est du texte, pas un calcul."
                  }
                  maxLength={40}
                  value={tier.price}
                  onChange={(e) => set({ ...tier, price: e.target.value })}
                />
                <Field
                  label="La précision"
                  hint="Facultatif. « Livraison incluse », « Enlèvement à la ferme »."
                  maxLength={60}
                  value={tier.note}
                  onChange={(e) => set({ ...tier, note: e.target.value })}
                />
              </>
            )}
          />
          <Field
            label="Le bouton"
            hint={
              "Il mène à votre formulaire de demande sur mesure. Il ne s'affiche "
              + "que si cette section-là est activée : un bouton qui ne mène nulle "
              + 'part fait croire que la boutique est cassée.'
            }
            maxLength={40}
            value={theme.wholesale.ctaLabel}
            onChange={(e) => patch('wholesale', { ctaLabel: e.target.value })}
          />
        </Group>
      );

    case 'packages':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.packages.enabled}
          onChange={(enabled) => patch('packages', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.packages.title}
            onChange={(e) => patch('packages', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'introduction"
            hint="Facultatif. Ce qui distingue vos formules les unes des autres."
            rows={2}
            maxLength={240}
            value={theme.packages.body}
            onChange={(e) => patch('packages', { body: e.target.value })}
          />
          <Rows
            items={theme.packages.items}
            max={4}
            blank={{
              name: '', price: '', period: '', body: '', features: '',
              ctaLabel: '', ctaHref: '', featured: false,
            }}
            addLabel="Ajouter une formule"
            onChange={(items) => patch('packages', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Le nom de la formule"
                  hint="« Découverte », « Accompagnement », « Sur mesure »."
                  maxLength={60}
                  value={item.name}
                  onChange={(e) => set({ ...item, name: e.target.value })}
                />
                <Field
                  label="Le prix"
                  hint="Comme vous le dites : « 5 000 HTG », « Sur devis »."
                  maxLength={40}
                  value={item.price}
                  onChange={(e) => set({ ...item, price: e.target.value })}
                />
                <Field
                  label="Ce que le prix couvre"
                  hint="« par séance », « par mois », « pour 3 séances »."
                  maxLength={30}
                  value={item.period}
                  onChange={(e) => set({ ...item, period: e.target.value })}
                />
                <TextField
                  label="À qui elle s'adresse"
                  hint="Facultatif. Une ou deux phrases."
                  rows={2}
                  maxLength={200}
                  value={item.body}
                  onChange={(e) => set({ ...item, body: e.target.value })}
                />
                <TextField
                  label="Ce qui est inclus"
                  hint="Un avantage par ligne. Appuyez sur Entrée entre chaque."
                  rows={5}
                  maxLength={600}
                  value={item.features}
                  onChange={(e) => set({ ...item, features: e.target.value })}
                />
                <Field
                  label="Le bouton"
                  hint="Vide : la formule s'affiche sans bouton."
                  maxLength={40}
                  value={item.ctaLabel}
                  onChange={(e) => set({ ...item, ctaLabel: e.target.value })}
                />
                <Field
                  label="Le lien du bouton"
                  hint="Votre WhatsApp, votre page de réservation, votre courriel."
                  maxLength={200}
                  value={item.ctaHref}
                  onChange={(e) => set({ ...item, ctaHref: e.target.value })}
                />
                <Switch
                  checked={item.featured}
                  onChange={(featured) => set({ ...item, featured })}
                  label="Mettre cette formule en avant"
                  hint={
                    "Une seule le sera, même si vous en cochez plusieurs : trois "
                    + 'formules toutes recommandées ne recommandent rien.'
                  }
                />
              </>
            )}
          />
        </Group>
      );

    case 'case_studies':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.caseStudies.enabled}
          onChange={(enabled) => patch('caseStudies', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.caseStudies.title}
            onChange={(e) => patch('caseStudies', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'introduction"
            hint="Facultatif."
            rows={2}
            maxLength={240}
            value={theme.caseStudies.body}
            onChange={(e) => patch('caseStudies', { body: e.target.value })}
          />
          <Rows
            items={theme.caseStudies.items}
            max={4}
            blank={{ client: '', before: '', after: '', quote: '', imageUrl: null }}
            addLabel="Ajouter un résultat"
            onChange={(items) => patch('caseStudies', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Le client"
                  hint={
                    'Facultatif. Son nom, son métier, ou rien du tout — beaucoup '
                    + 'ne veulent pas être nommés.'
                  }
                  maxLength={60}
                  value={item.client}
                  onChange={(e) => set({ ...item, client: e.target.value })}
                />
                <TextField
                  label="La situation de départ"
                  hint="Le problème, tel qu'il vous l'a présenté."
                  rows={3}
                  maxLength={240}
                  value={item.before}
                  onChange={(e) => set({ ...item, before: e.target.value })}
                />
                <TextField
                  label="Le résultat"
                  hint={
                    "Ce qui a changé. N'écrivez que des chiffres que vous pouvez "
                    + 'montrer : votre client les lira aussi.'
                  }
                  rows={3}
                  maxLength={240}
                  value={item.after}
                  onChange={(e) => set({ ...item, after: e.target.value })}
                />
                <TextField
                  label="Sa phrase"
                  hint="Facultatif. Ce qu'il en a dit, avec ses mots."
                  rows={3}
                  maxLength={280}
                  value={item.quote}
                  onChange={(e) => set({ ...item, quote: e.target.value })}
                />
                <ImageField
                  label="Une photo"
                  hint="Facultatif."
                  value={item.imageUrl}
                  onChange={(imageUrl) => set({ ...item, imageUrl })}
                  businessId={businessId}
                  slot="etude"
                  ratio="4 / 3"
                />
              </>
            )}
          />
        </Group>
      );

    case 'journal':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.journal.enabled}
          onChange={(enabled) => patch('journal', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.journal.title}
            onChange={(e) => patch('journal', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'introduction"
            hint="Facultatif."
            rows={2}
            maxLength={240}
            value={theme.journal.body}
            onChange={(e) => patch('journal', { body: e.target.value })}
          />
          <Rows
            items={theme.journal.items}
            max={6}
            blank={{ title: '', excerpt: '', imageUrl: null, href: '', date: '' }}
            addLabel="Ajouter un article"
            onChange={(items) => patch('journal', { items })}
            render={(item, set) => (
              <>
                <Field
                  label="Le titre"
                  hint="« Comment choisir un poulet de qualité », « L'histoire de notre atelier »."
                  maxLength={120}
                  value={item.title}
                  onChange={(e) => set({ ...item, title: e.target.value })}
                />
                <TextField
                  label="Le résumé"
                  hint="Deux ou trois lignes, celles qui donnent envie de lire."
                  rows={3}
                  maxLength={280}
                  value={item.excerpt}
                  onChange={(e) => set({ ...item, excerpt: e.target.value })}
                />
                <Field
                  label="Le lien"
                  hint={
                    "Où l'article est déjà publié : une publication Facebook, une "
                    + 'vidéo, un billet. Vide : le résumé seul est affiché.'
                  }
                  maxLength={200}
                  value={item.href}
                  onChange={(e) => set({ ...item, href: e.target.value })}
                />
                <Field
                  label="La date"
                  hint="Facultatif, et libre : « Mars 2026 », « la semaine dernière »."
                  maxLength={40}
                  value={item.date}
                  onChange={(e) => set({ ...item, date: e.target.value })}
                />
                <ImageField
                  label="L'image"
                  hint="Facultatif."
                  value={item.imageUrl}
                  onChange={(imageUrl) => set({ ...item, imageUrl })}
                  businessId={businessId}
                  slot="journal"
                  ratio="16 / 9"
                />
              </>
            )}
          />
        </Group>
      );

    case 'video_wall':
      return (
        <Group
          title={label} hint={hint}
          checked={theme.videoWall.enabled}
          onChange={(enabled) => patch('videoWall', { enabled })}
        >
          <Field
            label="Le titre de la section"
            maxLength={80}
            value={theme.videoWall.title}
            onChange={(e) => patch('videoWall', { title: e.target.value })}
          />
          <TextField
            label="La phrase d'introduction"
            hint="Facultatif."
            rows={2}
            maxLength={240}
            value={theme.videoWall.body}
            onChange={(e) => patch('videoWall', { body: e.target.value })}
          />
          <Rows
            items={theme.videoWall.items}
            max={6}
            blank={{ url: '', label: '', productId: '', posterUrl: null }}
            addLabel="Ajouter une vidéo"
            onChange={(items) => patch('videoWall', { items })}
            render={(item, set) => (
              <>
                <UrlField
                  label="Le lien de la vidéo"
                  hint={
                    'Sa page chez son hébergeur : TikTok, Instagram, YouTube, '
                    + "Facebook. La vidéo s'ouvre chez eux — rien n'est chargé sur "
                    + 'votre boutique.'
                  }
                  value={item.url ? item.url : null}
                  onChange={(url) => set({ ...item, url: url ?? '' })}
                />
                <Field
                  label="L'identifiant de l'article montré"
                  hint={
                    "Collez-le depuis l'adresse de la fiche produit. C'est ce qui "
                    + 'transforme la vidéo en vente : le visiteur qui a vu le '
                    + "produit peut l'ouvrir. Vide : la vignette n'ouvre que la vidéo."
                  }
                  maxLength={60}
                  value={item.productId}
                  onChange={(e) => set({ ...item, productId: e.target.value.trim() })}
                />
                <Field
                  label="Le texte sous la vignette"
                  hint="Facultatif. Sans article relié, c'est lui qui s'affiche."
                  maxLength={60}
                  value={item.label}
                  onChange={(e) => set({ ...item, label: e.target.value })}
                />
                <ImageField
                  label="La vignette"
                  hint={
                    "Facultatif. Sans elle, la photo de l'article relié est "
                    + 'utilisée.'
                  }
                  value={item.posterUrl}
                  onChange={(posterUrl) => set({ ...item, posterUrl })}
                  businessId={businessId}
                  slot="video"
                  ratio="9 / 16"
                />
              </>
            )}
          />
        </Group>
      );

    default:
      return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Les briques
// ═════════════════════════════════════════════════════════════════════════════

/** Une section qui s'active. Repliée quand elle est éteinte : rien à régler. */
function Group({
  title, hint, checked, onChange, children,
}: {
  title:    string;
  hint:     string;
  checked:  boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <Switch checked={checked} onChange={onChange} label={title} hint={hint} />
      {checked && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 dark:border-dark-border">
          {children}
        </div>
      )}
    </Card>
  );
}

/** Une section qui n'a pas d'interrupteur : la bannière, les réseaux. */
function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-card font-semibold text-primary dark:text-dark-text">{title}</h2>
      <p className="mt-0.5 text-note text-muted dark:text-dark-muted">{hint}</p>
      <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 dark:border-dark-border">
        {children}
      </div>
    </Card>
  );
}

/**
 * Une liste d'éléments qu'on ajoute et qu'on retire.
 *
 * Le bouton « Ajouter » disparaît au plafond au lieu de se griser : un bouton
 * grisé fait chercher ce qui manque, alors que la limite est atteinte et qu'il
 * n'y a rien à corriger.
 */
function Rows<T>({
  items, max, blank, addLabel, onChange, render,
}: {
  items:    T[];
  max:      number;
  blank:    T;
  addLabel: string;
  onChange: (next: T[]) => void;
  render:   (item: T, set: (next: T) => void) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="rounded-control border border-border p-3 dark:border-dark-border"
        >
          <div className="flex flex-col gap-3">
            {render(item, (next) => onChange(items.map((x, j) => (j === index ? next : x))))}
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== index))}
            className="mt-3 flex min-h-touch items-center gap-2 text-note font-semibold text-danger"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Retirer
          </button>
        </div>
      ))}

      {items.length < max && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, blank])}
          icon={<Plus className="h-4 w-4" strokeWidth={2} aria-hidden />}
        >
          {addLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Les photos de la galerie : une adresse par ligne.
 *
 * La saisie brute reste locale, et seules les lignes valides remontent au
 * thème. Sans ce dédoublement, la zone de texte se relirait depuis la liste
 * filtrée : taper le « h » de « https » produirait une ligne invalide,
 * aussitôt écartée, et le caractère disparaîtrait sous les doigts.
 *
 * Le compte des lignes ignorées est affiché. Le schéma du thème remplace un
 * tableau contenant UNE adresse invalide par un tableau VIDE — le marchand
 * perdrait ses douze photos à cause d'une ligne mal collée, sans un mot.
 */
function UrlListField({
  images, onChange,
}: {
  images:   string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState(images.join('\n'));

  const lines   = draft.split('\n').map((l) => l.trim()).filter(Boolean);
  const ignored = lines.filter((l) => !isUrlish(l)).length;

  return (
    <TextField
      label="Les photos"
      hint="Une adresse par ligne, douze au maximum."
      warning={
        ignored > 0
          ? `${ignored} ligne${ignored > 1 ? 's' : ''} ignorée${ignored > 1 ? 's' : ''} : une adresse doit commencer par http:// ou https://.`
          : undefined
      }
      rows={5}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(
          e.target.value
            .split('\n')
            .map((l) => l.trim())
            .filter(isUrlish)
            .slice(0, 12),
        );
      }}
    />
  );
}

/**
 * Un champ d'adresse d'image.
 *
 * Il tient sa propre saisie plutôt que d'écrire directement dans le thème :
 * sinon, taper « h » de « https » remplacerait aussitôt la valeur par `null` —
 * l'adresse serait invalide à chaque frappe, et le champ s'effacerait sous les
 * doigts du marchand.
 */
function UrlField({
  label, hint, value, onChange,
}: {
  label:    string;
  hint?:    string;
  value:    string | null;
  onChange: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const invalid = draft.trim().length > 0 && !isUrlish(draft);

  return (
    <Field
      label={label}
      hint={hint}
      warning={invalid ? "L'adresse doit commencer par http:// ou https://." : undefined}
      inputMode="url"
      placeholder="https://…"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(cleanUrl(e.target.value));
      }}
    />
  );
}
