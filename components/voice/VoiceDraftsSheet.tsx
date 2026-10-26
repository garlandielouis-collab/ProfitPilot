'use client';

// ─────────────────────────────────────────────────────────────────────────────
// « Sa m konprann » — les brouillons d'un vocal (§2.2, « Confirmation »)
//
// Une carte par opération comprise : le type, les lignes, le montant, la
// devise, le paiement, le client. Trois gestes : Konfime (l'opération est
// créée, par les mêmes actions que la saisie tapée), Korije (la feuille de
// saisie s'ouvre, préremplie), Anile.
//
// Un montant douteux est en rouge avec « Verifye montan an » : c'est l'erreur
// qui coûte de l'argent. Rien n'est enregistré sans le tap sur Konfime.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Check } from 'lucide-react';
import { useLanguage } from '../LanguageWrapper';
import { Badge, BottomSheet, Button, Money } from '../ds';
import { cn } from '../../lib/utils';
import { notifyEntrySaved, openExpenseSheet, openSaleSheet } from '../../lib/quickSheets';
import { draftBlockers, type VoiceDraft } from '../../lib/voice/draft';
import { draftToSheet, spokenAmount } from '../../lib/voice/sheet';
import type { VoiceResponse } from '../../lib/voice/client';
import { confirmVoiceDraft } from '../../app/actions/voiceDrafts';
import { CATEGORIES as EXPENSE_CATEGORIES } from '../expenses/QuickExpenseForm';

type L = { fr: string; ht: string };

const TYPE_LABEL: Record<VoiceDraft['type'], L> = {
  sale:             { fr: 'Vente', ht: 'Vant' },
  expense:          { fr: 'Dépense', ht: 'Depans' },
  credit:           { fr: 'Crédit', ht: 'Kredi' },
  credit_payment:   { fr: 'Paiement de crédit', ht: 'Peman kredi' },
  owner_withdrawal: { fr: 'Pour la maison', ht: 'Lajan lakay' },
};

const METHOD_LABEL: Record<string, L> = {
  cash:    { fr: 'Espèces', ht: 'Kach' },
  moncash: { fr: 'MonCash', ht: 'MonCash' },
  natcash: { fr: 'NatCash', ht: 'NatCash' },
  credit:  { fr: 'À crédit', ht: 'Kredi' },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-note text-muted dark:text-dark-muted">{label}</dt>
      <dd className="min-w-0 text-right text-body text-primary dark:text-dark-text">{children}</dd>
    </div>
  );
}

function DraftCard({
  draft, noteId, transcription, recordedAt, onDone, onCorrect,
}: {
  draft: VoiceDraft;
  noteId: string;
  transcription: string;
  recordedAt: string;
  onDone: () => void;
  onCorrect: () => void;
}) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const blockers = draftBlockers(draft);
  const spoken = spokenAmount(draft);
  const category = EXPENSE_CATEGORIES.find((c) => c.value === draft.expenseCategory);
  const method = draft.type === 'credit' ? 'credit' : draft.paymentMethod ?? 'cash';

  async function confirm() {
    setSaving(true);
    try {
      const res = await confirmVoiceDraft({ noteId, draft, transcription, recordedAt });
      if (!res.ok) { toast.error(res.message); return; }
      setSaved(true);
      notifyEntrySaved();
      toast.success(res.data.alreadyDone
        ? t({ fr: 'Déjà noté.', ht: 'Sa te deja note.' })
        : t({ fr: `${TYPE_LABEL[draft.type].fr} notée.`, ht: `${TYPE_LABEL[draft.type].ht} note.` }));
      setTimeout(onDone, 600);
    } catch {
      toast.error(t({ fr: 'Pas de réseau : rien n’a été noté. Réessayez.', ht: 'Pa gen rezo : anyen pa note. Eseye ankò.' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="space-y-3 rounded-surface border border-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={draft.type === 'expense' || draft.type === 'owner_withdrawal' ? 'neutral' : 'accent'}>
          {t(TYPE_LABEL[draft.type])}
        </Badge>
        {draft.needsReview && (
          <Badge tone="warning">{t({ fr: 'À vérifier', ht: 'Tcheke l byen' })}</Badge>
        )}
      </div>

      {draft.lines.length > 0 && (
        <ul className="space-y-1">
          {draft.lines.map((l, i) => (
            <li key={i} className="flex items-baseline gap-2 text-body text-primary dark:text-dark-text">
              <span className="amount w-8 flex-shrink-0 text-right font-bold">{l.quantity}×</span>
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              {l.isNewProduct && (
                <span className="text-note text-muted dark:text-dark-muted">{t({ fr: 'pas au catalogue', ht: 'pa nan katalòg la' })}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={cn('rounded-control p-3', draft.amountNeedsCheck ? 'bg-danger/10' : 'bg-surface dark:bg-dark-surface2')}>
        {draft.amountMinor === null ? (
          <p className="text-card font-bold text-danger">{t({ fr: 'Montant non entendu', ht: 'M pa tande montan an' })}</p>
        ) : (
          <Money
            value={draft.amountMinor / 100}
            currency={draft.currency}
            size="amount"
            decimals={draft.amountMinor % 100 === 0 ? 0 : 2}
            className={draft.amountNeedsCheck ? 'text-danger' : undefined}
          />
        )}
        {spoken.unit === 'DOLA' && spoken.amount !== undefined && (
          <p className="text-note text-text2 dark:text-dark-text2">
            {t({ fr: `${spoken.amount} dollars haïtiens`, ht: `${spoken.amount} dola` })}
          </p>
        )}
        {draft.currency === 'USD' && draft.usdRate && (
          <p className="text-note text-text2 dark:text-dark-text2">
            {t({ fr: `Dollars US, taux ${draft.usdRate}`, ht: `Dola ameriken, to ${draft.usdRate}` })}
          </p>
        )}
        {draft.amountNeedsCheck && draft.amountMinor !== null && (
          <p className="mt-1 flex items-center gap-1 text-note font-bold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {t({ fr: 'Vérifiez le montant', ht: 'Verifye montan an' })}
          </p>
        )}
      </div>

      <dl className="space-y-1">
        {draft.customerLabel && <Row label={t({ fr: 'Client', ht: 'Kliyan' })}>{draft.customerLabel}</Row>}
        {draft.type !== 'owner_withdrawal' && (
          <Row label={t({ fr: 'Paiement', ht: 'Peman' })}>{t(METHOD_LABEL[method] ?? METHOD_LABEL.cash)}</Row>
        )}
        {draft.type === 'expense' && (
          <Row label={t({ fr: 'Pour quoi', ht: 'Pou kisa' })}>{category ? t(category.label) : draft.expenseCategory}</Row>
        )}
      </dl>

      {draft.totalMismatch && draft.catalogTotalMinor !== null && (
        <p className="text-note text-warning">
          {t({
            fr: `Au prix du catalogue, cela ferait ${draft.catalogTotalMinor / 100} goud. Le montant dit est gardé.`,
            ht: `Ak pri katalòg la, sa t ap fè ${draft.catalogTotalMinor / 100} goud. Nou kenbe montan ou di a.`,
          })}
        </p>
      )}
      {draft.clarification && (
        <p className="text-note font-bold text-primary dark:text-dark-text">{draft.clarification}</p>
      )}
      {blockers.length > 0 && (
        <ul className="space-y-1">
          {blockers.map((b, i) => (
            <li key={i} className="text-note text-danger">{t(b)}</li>
          ))}
        </ul>
      )}

      {/* Konfime en entier, sous le pouce ; les deux autres en dessous. */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="accent"
          size="lg"
          className="col-span-2"
          onClick={confirm}
          disabled={blockers.length > 0 || saved}
          loading={saving}
          confirmed={saved}
          loadingLabel={t({ fr: 'Enregistrement…', ht: 'M ap anrejistre…' })}
          icon={<Check className="h-5 w-5" aria-hidden />}
        >
          {t({ fr: 'Confirmer', ht: 'Konfime' })}
        </Button>
        <Button variant="quiet" size="md" onClick={onCorrect} disabled={saving || saved}>
          {t({ fr: 'Corriger', ht: 'Korije' })}
        </Button>
        <Button variant="quiet" size="md" onClick={onDone} disabled={saving || saved}>
          {t({ fr: 'Annuler', ht: 'Anile' })}
        </Button>
      </div>
    </article>
  );
}

export function VoiceDraftsSheet({
  result,
  onClose,
}: {
  result: VoiceResponse | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  // Les brouillons écartés (confirmés ou annulés), préfixés par le vocal :
  // un nouveau vocal repart avec toutes ses cartes.
  const [closed, setClosed] = useState<string[]>([]);
  const id = (d: VoiceDraft) => `${result?.noteId}:${d.key}`;
  const remaining = result ? result.drafts.filter((d) => !closed.includes(id(d))) : [];
  // La dernière carte traitée referme la feuille.
  const allDone = Boolean(result && result.drafts.length > 0 && remaining.length === 0);

  useEffect(() => { if (allDone) onClose(); }, [allDone, onClose]);

  if (!result) return null;
  const empty = result.manual || result.drafts.length === 0;

  function done(d: VoiceDraft) {
    setClosed((prev) => [...prev, id(d)]);
  }

  function correct(d: VoiceDraft) {
    const target = draftToSheet(d);
    onClose();
    if (target.sheet === 'sale') openSaleSheet(target.preset);
    else if (target.sheet === 'expense') openExpenseSheet(target.preset);
    else router.push('/creances');
  }

  const note = result.transcription.slice(0, 120) || undefined;

  return (
    <BottomSheet open onClose={onClose} title={t({ fr: 'Ce que j’ai compris', ht: 'Sa m konprann' })}>
      <div className="space-y-4">
        {result.transcription && (
          <p className="text-body italic text-text2 dark:text-dark-text2">« {result.transcription} »</p>
        )}

        {empty ? (
          <div className="space-y-3">
            <p className="text-body text-primary dark:text-dark-text">
              {t({
                fr: 'Je n’ai pas su en tirer une opération. Notez-la à la main :',
                ht: 'M pa t ka fè yon operasyon ak sa. Tape l pou kont ou :',
              })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="accent" size="lg" onClick={() => { onClose(); openSaleSheet({ amountOnly: true, note }); }}>
                {t({ fr: 'Vente', ht: 'Vant' })}
              </Button>
              <Button variant="quiet" size="lg" onClick={() => { onClose(); openExpenseSheet({ note }); }}>
                {t({ fr: 'Dépense', ht: 'Depans' })}
              </Button>
            </div>
          </div>
        ) : (
          remaining.map((d) => (
            <DraftCard
              key={d.key}
              draft={d}
              noteId={result.noteId}
              transcription={result.transcription}
              recordedAt={result.recordedAt}
              onDone={() => done(d)}
              onCorrect={() => correct(d)}
            />
          ))
        )}

        {result.usage && result.usage.limit - result.usage.used <= 5 && (
          <p className="text-note text-muted dark:text-dark-muted">
            {t({
              fr: `Encore ${Math.max(0, result.usage.limit - result.usage.used)} vocaux aujourd’hui.`,
              ht: `Ou rete ${Math.max(0, result.usage.limit - result.usage.used)} vokal jodi a.`,
            })}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
