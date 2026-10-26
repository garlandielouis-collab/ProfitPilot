'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Prix d'achat suivis — l'écran (F21, Elit, commerce)
//
// Les produits dont la marge a fondu passent en tête, avec le prix de vente
// qui rendrait la marge visée. Le marchand décide ; l'écran montre le calcul.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { Card, FirstRun, ScreenHeader, Stack } from '../../components/ds';
import { listPurchasePriceTrends, type ProductPriceTrend } from '../actions/purchasePrices';
import { formatMoney } from '../../lib/eveningReport';
import { cn } from '../../lib/utils';

function PrixAchatInner() {
  const { t } = useLanguage();
  const [list, setList] = useState<ProductPriceTrend[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPurchasePriceTrends()
      .then((r) => { if (r.ok) setList(r.data); else { setList([]); setError(r.message); } })
      .catch(() => setList([]));
  }, []);

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Stack>
        <ScreenHeader
          title={t({ fr: 'Prix d’achat suivis', ht: 'Pri acha yo' })}
          subtitle={t({ fr: 'Le dollar monte ? Vos prix doivent monter aussi.', ht: 'Dola a monte ? Pri w dwe monte tou.' })}
        />
        {error && <p className="text-body text-danger">{error}</p>}
        {list === null ? (
          <span className="pp-skeleton block h-32 rounded-surface" aria-hidden />
        ) : list.length === 0 ? (
          <FirstRun
            illustration={<TrendingUp className="h-10 w-10 text-muted" aria-hidden />}
            title={t({ fr: 'Aucun achat enregistré', ht: 'Pa gen acha ki anrejistre' })}
            hint={t({ fr: 'Notez vos achats chez le fournisseur : ProfitPilot suivra chaque prix d’achat.', ht: 'Note acha ou fè lakay founisè a : ProfitPilot ap swiv chak pri acha.' })}
            action={<Link href="/purchases" className="text-body font-bold text-primary underline underline-offset-4">{t({ fr: 'Noter un achat', ht: 'Note yon acha' })}</Link>}
          />
        ) : (
          <div className="space-y-3">
            {list.map((p) => {
              const last = p.history[0]?.cost ?? 0;
              const neededPrice = last > 0 ? Math.ceil(last / (1 - p.targetMarginPct / 100)) : null;
              return (
                <Card key={p.productId} className={cn('space-y-2 p-4', p.alert && 'border-danger/50')}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-card font-bold text-primary dark:text-dark-text">{p.name}</span>
                      <span className="block text-note text-muted">
                        {t({ fr: `Achat ${formatMoney(last, 'HTG')} · vente ${formatMoney(p.salePrice, 'HTG')}`, ht: `Acha ${formatMoney(last, 'HTG')} · vant ${formatMoney(p.salePrice, 'HTG')}` })}
                      </span>
                    </span>
                    <span className="text-right">
                      {p.changePct !== null && (
                        <span className={cn('block text-note font-bold', p.changePct > 0 ? 'text-danger' : 'text-success')}>
                          {p.changePct > 0 ? '+' : ''}{p.changePct} %
                        </span>
                      )}
                      {p.marginPct !== null && (
                        <span className={cn('block text-body font-bold', p.marginPct < p.targetMarginPct ? 'text-danger' : 'text-primary dark:text-dark-text')}>
                          {t({ fr: `marge ${p.marginPct} %`, ht: `maj ${p.marginPct} %` })}
                        </span>
                      )}
                    </span>
                  </div>
                  {p.alert && neededPrice && neededPrice > p.salePrice && (
                    <p className="text-body text-danger">
                      {t({
                        fr: `Pour garder ${p.targetMarginPct} % de marge, vendez à ${formatMoney(neededPrice, 'HTG')}.`,
                        ht: `Pou w kenbe ${p.targetMarginPct} % maj, vann li ${formatMoney(neededPrice, 'HTG')}.`,
                      })}
                    </p>
                  )}
                  <ol className="flex flex-wrap gap-x-4 gap-y-1 text-note text-muted">
                    {p.history.map((h, i) => (
                      <li key={i}>{h.date} · {formatMoney(h.cost, 'HTG')}{h.supplier ? ` · ${h.supplier}` : ''}</li>
                    ))}
                  </ol>
                </Card>
              );
            })}
          </div>
        )}
      </Stack>
    </div>
  );
}

export default function PrixAchatPage() {
  return (
    <ProtectedRoute>
      <PrixAchatInner />
    </ProtectedRoute>
  );
}
