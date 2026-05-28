'use client';

type ReportCardProps = {
  label: string;
  value: string;
  accent: 'primary' | 'success' | 'warning';
  description?: string;
};

const accentStyles = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-orange-100 text-orange-800',
};

export function ReportCard({ label, value, accent, description }: ReportCardProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-anthracite">{value}</p>
      {description ? <p className="mt-3 text-sm text-slate-600">{description}</p> : null}
      <div className={`mt-5 inline-flex rounded-full px-3 py-2 text-xs font-semibold ${accentStyles[accent]}`}>Statut</div>
    </div>
  );
}
