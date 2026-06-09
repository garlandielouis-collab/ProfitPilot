'use client';

import { useLanguage } from './LanguageWrapper';
import { Button } from './Button';

type SubscriptionCardProps = {
  plan: {
    key: string;
    description: string;
    priceG: number;
    features: string[];
    highlight: string;
  };
  selected?: boolean;
  onSelect: (key: string) => void;
};

export function SubscriptionCard({ plan, selected, onSelect }: SubscriptionCardProps) {
  const { t } = useLanguage();
  return (
    <div className={`rounded-[28px] border p-6 shadow-sm transition ${selected ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/90">{plan.key}</p>
          <p className="mt-3 text-sm text-anthracite/80">{plan.description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-anthracite">{plan.highlight}</span>
      </div>

      <div className="mt-6">
        <p className="text-sm text-anthracite/70">{t({ fr: 'Prix', ht: 'Pri' })}</p>
        <p className="mt-2 text-4xl font-bold text-primary">G {plan.priceG.toLocaleString('fr-FR')}</p>
      </div>

      <div className="mt-6 space-y-3">
        {plan.features.map((feature) => (
          <div key={feature} className="flex items-start gap-3 text-sm text-anthracite/90">
            <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <Button type="button" onClick={() => onSelect(plan.key)} className="mt-6 w-full bg-primary text-white hover:bg-[#004799]">
        {selected ? t({ fr: 'Plan choisi', ht: 'Plan chwazi' }) : t({ fr: 'Sélectionner', ht: 'Seleksyone' })}
      </Button>
    </div>
  );
}
