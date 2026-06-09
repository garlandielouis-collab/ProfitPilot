'use client';

import { useEffect, useRef, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building2, Globe, Phone, MapPin, DollarSign, CreditCard,
  Bell, Moon, Languages, Save, LogOut, Trash2, Download,
  Shield, Key, RefreshCw, Copy, Check, ChevronRight,
  Smartphone, Wallet, Banknote, CircleUser, Settings2,
} from 'lucide-react';

import { supabase }             from '../../lib/supabaseClient';
import { useSettings }          from '../../hooks/useSettings';
import { useTheme }             from '../../components/providers/ThemeProvider';
import { useLanguage }          from '../../components/LanguageWrapper';
import { exportUserData, deleteAccount } from '../../app/actions/settings';
import { cn } from '../../lib/utils';
import type { BusinessProfileInput, UserPreferencesInput } from '../../lib/validations';

// ── tiny helpers ───────────────────────────────────────────────────────────────

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6',
      className,
    )}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-[var(--color-muted)]">{children}</label>;
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)]',
        'placeholder:text-[var(--color-muted)] outline-none transition',
        'focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20',
        className,
      )}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-emerald-500' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition"
    >
      {copied ? <Check className="h-3 w-3 inline" /> : <Copy className="h-3 w-3 inline" />}
      <span className="ml-1">{copied ? t({ fr: 'Copié', ht: 'Kopiye' }) : t({ fr: 'Copier', ht: 'Kopiye' })}</span>
    </button>
  );
}

// ── tab config ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile' as const, label: 'Profil', labelT: { fr: 'Profil', ht: 'Pwofil' }, icon: Building2  },
  { id: 'payments' as const, label: 'Paiements', labelT: { fr: 'Paiements', ht: 'Peman' }, icon: CreditCard },
  { id: 'prefs' as const, label: 'Préférences', labelT: { fr: 'Préférences', ht: 'Preferans' }, icon: Settings2  },
  { id: 'security' as const, label: 'Sécurité', labelT: { fr: 'Sécurité', ht: 'Sekirite' }, icon: Shield     },
] as const;
type TabId = typeof TABS[number]['id'];

// ── PAYMENT METHODS ───────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  {
    key: 'moncash',
    label: 'MonCash',
    labelT: { fr: 'MonCash', ht: 'MonCash' },
    description: 'Peman mobil via Digicel Haiti',
    descriptionT: { fr: 'Paiement mobile via Digicel Haïti', ht: 'Peman mobil via Digicel Haiti' },
    icon: Smartphone,
    gradient: 'from-pink-50 to-rose-50',
    accent: 'text-pink-600',
    border: 'border-pink-200',
    apiLink: 'https://moncashbutton.digicelhaiti.com/Moncash-business/Login',
  },
  {
    key: 'natcash',
    label: 'NatCash',
    labelT: { fr: 'NatCash', ht: 'NatCash' },
    description: 'Peman mobil via Natcom Haiti',
    descriptionT: { fr: 'Paiement mobile via Natcom Haïti', ht: 'Peman mobil via Natcom Haiti' },
    icon: Smartphone,
    gradient: 'from-purple-50 to-violet-50',
    accent: 'text-purple-600',
    border: 'border-purple-200',
    apiLink: null,
  },
  {
    key: 'visa',
    label: 'Carte Visa / Mastercard',
    labelT: { fr: 'Carte Visa / Mastercard', ht: 'Kat Visa / Mastercard' },
    description: 'Peman pa kat kredi ou debi',
    descriptionT: { fr: 'Paiement par carte de crédit ou débit', ht: 'Peman pa kat kredi ou debi' },
    icon: Wallet,
    gradient: 'from-blue-50 to-sky-50',
    accent: 'text-blue-600',
    border: 'border-blue-200',
    apiLink: null,
  },
  {
    key: 'cash',
    label: 'Espèces (Kach)',
    labelT: { fr: 'Espèces (Kach)', ht: 'Espès (Kach)' },
    description: 'Peman an lajan kach dirèkteman',
    descriptionT: { fr: 'Paiement en espèces directement', ht: 'Peman an lajan kach dirèkteman' },
    icon: Banknote,
    gradient: 'from-emerald-50 to-teal-50',
    accent: 'text-emerald-600',
    border: 'border-emerald-200',
    apiLink: null,
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileTab({ userId }: { userId: string | undefined }) {
  const { t } = useLanguage();
  const { profile } = useSettings();
  const dbData = profile.query.data;

  const [form, setForm] = useState<BusinessProfileInput>({
    name:             '',
    sector:           '',
    phone:            '',
    address:          '',
    website:          '',
    tax_id:           '',
    exchange_rate:    130,
    default_currency: 'HTG',
  });
  const [rateLoading, setRateLoading] = useState(false);

  // Sync form when DB data arrives
  useEffect(() => {
    if (dbData) {
      setForm({
        name:             dbData.name             ?? '',
        sector:           dbData.sector           ?? '',
        phone:            dbData.phone            ?? '',
        address:          dbData.address          ?? '',
        website:          dbData.website          ?? '',
        tax_id:           dbData.tax_id           ?? '',
        exchange_rate:    Number(dbData.exchange_rate ?? 130),
        default_currency: (dbData.default_currency as 'HTG' | 'USD') ?? 'HTG',
      });
    }
  }, [dbData]);

  const set = (field: keyof BusinessProfileInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const fetchLiveRate = async () => {
    setRateLoading(true);
    try {
      // Primary: open.er-api.com (free, no key)
      const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
      if (!res.ok) throw new Error('API error');
      const json = await res.json();
      const rate = Number(json?.rates?.HTG ?? 0);
      if (!rate || isNaN(rate)) throw new Error('Rate not found');
      setForm(prev => ({ ...prev, exchange_rate: parseFloat(rate.toFixed(2)) }));
      toast.success(`${t({ fr: 'Taux actualisé :', ht: 'To mete ajou :' })} 1 USD = ${rate.toFixed(2)} HTG`);
    } catch {
      // Fallback to Frankfurter API
      try {
        const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=HTG', { cache: 'no-store' });
        const json2 = await res2.json();
        const rate2 = Number(json2?.rates?.HTG ?? 0);
        if (rate2 && !isNaN(rate2)) {
          setForm(prev => ({ ...prev, exchange_rate: parseFloat(rate2.toFixed(2)) }));
          toast.success(`${t({ fr: 'Taux actualisé :', ht: 'To mete ajou :' })} 1 USD = ${rate2.toFixed(2)} HTG`);
          return;
        }
      } catch { /* ignore */ }
      toast.error(t({ fr: 'Impossible de récupérer le taux. Vérifiez votre connexion.', ht: 'Enposib rekipere to a. Verifye koneksyon ou.' }));
    } finally {
      setRateLoading(false);
    }
  };

  const handleSave = () => profile.mutation.mutate(form);

  const fields: Array<{
    key: keyof BusinessProfileInput;
    label: string;
    labelT: { fr: string; ht: string };
    placeholder: string;
    placeholderT: { fr: string; ht: string };
    icon: React.ElementType;
    type?: string;
  }> = [
    { key: 'name',    label: 'Nom de l\'entreprise', labelT: { fr: 'Nom de l\'entreprise', ht: 'Non antrepriz la' }, placeholder: 'Mon Entreprise', placeholderT: { fr: 'Mon Entreprise', ht: 'Mon Antrepriz' }, icon: Building2 },
    { key: 'sector',  label: 'Secteur d\'activité', labelT: { fr: 'Secteur d\'activité', ht: 'Sektè aktivite' }, placeholder: 'Commerce, BTP…', placeholderT: { fr: 'Commerce, BTP…', ht: 'Komès, BTP…' }, icon: Globe },
    { key: 'phone',   label: 'Téléphone', labelT: { fr: 'Téléphone', ht: 'Telefòn' }, placeholder: '+509 ___-____', placeholderT: { fr: '+509 ___-____', ht: '+509 ___-____' }, icon: Phone },
    { key: 'address', label: 'Adresse', labelT: { fr: 'Adresse', ht: 'Adrès' }, placeholder: 'Port-au-Prince…', placeholderT: { fr: 'Port-au-Prince…', ht: 'Pòtoprens…' }, icon: MapPin },
    { key: 'website', label: 'Site web', labelT: { fr: 'Site web', ht: 'Sit wèb' }, placeholder: 'https://…', placeholderT: { fr: 'https://…', ht: 'https://…' }, icon: Globe, type: 'url' },
    { key: 'tax_id',  label: 'NIF / TIN', labelT: { fr: 'NIF / TIN', ht: 'NIF / TIN' }, placeholder: 'Numéro fiscal', placeholderT: { fr: 'Numéro fiscal', ht: 'Nimewo fiskal' }, icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <GlassCard>
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <Building2 className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Profil de l\'entreprise', ht: 'Pwofil antrepriz la' })}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, labelT, placeholder, placeholderT, icon: Icon, type }) => (
            <div key={key}>
              <Label>{t(labelT)}</Label>
              <div className="relative">
                <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                <Input
                  type={type ?? 'text'}
                  placeholder={t(placeholderT)}
                  value={String(form[key] ?? '')}
                  onChange={set(key)}
                  className="pl-9"
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <DollarSign className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Devise & Taux de change', ht: 'Lajan & To chanj' })}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t({ fr: 'Devise par défaut', ht: 'Lajan defo' })}</Label>
            <select
              value={form.default_currency}
              onChange={set('default_currency')}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="HTG">{t({ fr: 'HTG — Gourde haïtienne', ht: 'HTG — Goud ayisyen' })}</option>
              <option value="USD">{t({ fr: 'USD — Dollar américain', ht: 'USD — Dola ameriken' })}</option>
            </select>
          </div>

          <div>
            <Label>{t({ fr: 'Taux USD → HTG', ht: 'To USD → HTG' })}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={form.exchange_rate}
                onChange={(e) => setForm(prev => ({ ...prev, exchange_rate: Number(e.target.value) }))}
              />
              <button
                type="button"
                onClick={fetchLiveRate}
                disabled={rateLoading}
                className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-muted)] hover:text-emerald-400 transition disabled:opacity-50"
                title={t({ fr: 'Taux en direct', ht: 'To an dirèk' })}
              >
                <RefreshCw className={cn('h-4 w-4', rateLoading && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={profile.mutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {profile.mutation.isPending ? t({ fr: 'Sauvegarde…', ht: 'Sovgad…' }) : t({ fr: 'Enregistrer le profil', ht: 'Anrejistre pwofil la' })}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentsTab() {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <CreditCard className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Méthodes de paiement configurées', ht: 'Metòd peman konfigire' })}
        </h2>
        <p className="mb-5 text-xs text-[var(--color-muted)]">
          {t({ fr: 'Numéros et intégrations actifs pour recevoir les paiements de vos clients.', ht: 'Nimewo ak entegrasyon aktif pou resevwa peman kliyan ou yo.' })}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {PAYMENT_METHODS.map((pm) => {
            const Icon = pm.icon;
            return (
              <div
                key={pm.key}
                className={cn(
                  'rounded-xl border bg-gradient-to-br p-4',
                  pm.gradient, pm.border,
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={cn('rounded-lg bg-slate-100 p-1.5', pm.accent)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{t(pm.labelT)}</p>
                      <p className="text-xs text-[var(--color-muted)]">{t(pm.descriptionT)}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {t({ fr: 'Actif', ht: 'Aktif' })}
                  </span>
                </div>

                <p className="mt-3 rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
                  {pm.key === 'cash' ? t({ fr: 'Paiement physique — pas besoin de configuration.', ht: 'Peman fizik — pa bezwen konfigirasyon.' }) : t({ fr: 'Paiement mobile — accepté directement.', ht: 'Peman mobil — aksepte dirèkteman.' })}
                </p>

                {pm.key === 'moncash' && pm.apiLink && (
                  <a
                    href={pm.apiLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'mt-3 flex items-center gap-1.5 text-xs font-medium hover:underline transition',
                      pm.accent,
                    )}
                  >
                    {t({ fr: 'Portail Moncash Business', ht: 'Portal Moncash Business' })}
                    <ChevronRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

function PreferencesTab({ userId }: { userId: string | undefined }) {
  const { prefs } = useSettings();
  const { isDark, setTheme } = useTheme();
  const { language: currentLang, setLanguage, t } = useLanguage();
  const raw = prefs.query.data;

  const [form, setForm] = useState<UserPreferencesInput>({
    language:              'fr',
    currency:              'HTG',
    dark_mode:             false,
    notifications_enabled: true,
    auto_save:             true,
  });

  useEffect(() => {
    if (raw) setForm(prev => ({ ...prev, ...raw }));
  }, [raw]);

  // Sync current app language into form on first load
  useEffect(() => {
    setForm(prev => ({ ...prev, language: currentLang as 'fr' | 'ht' }));
  }, [currentLang]);

  // Keep form in sync with actual theme state
  useEffect(() => {
    setForm(prev => ({ ...prev, dark_mode: isDark }));
  }, [isDark]);

  const handleDarkModeToggle = (v: boolean) => {
    setTheme(v ? 'dark' : 'light');
    setForm(prev => ({ ...prev, dark_mode: v }));
  };

  const handleSave = () => {
    // Apply language change immediately in the UI
    if (form.language !== currentLang) {
      setLanguage(form.language as 'fr' | 'ht');
    }
    prefs.mutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <GlassCard>
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <Languages className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Langue & Devise', ht: 'Lang & Lajan' })}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t({ fr: 'Langue de l\'interface', ht: 'Lang entèfas la' })}</Label>
            <select
              value={form.language}
              onChange={(e) => setForm(prev => ({ ...prev, language: e.target.value as 'fr' | 'ht' }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="fr">{t({ fr: '🇫🇷 Français', ht: '🇫🇷 Fransè' })}</option>
              <option value="ht">{t({ fr: '🇭🇹 Kreyòl ayisyen', ht: '🇭🇹 Kreyòl ayisyen' })}</option>
            </select>
          </div>
          <div>
            <Label>{t({ fr: 'Devise d\'affichage', ht: 'Lajan afichaj' })}</Label>
            <select
              value={form.currency}
              onChange={(e) => setForm(prev => ({ ...prev, currency: e.target.value as 'HTG' | 'USD' }))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="HTG">{t({ fr: 'HTG — Gourde haïtienne', ht: 'HTG — Goud ayisyen' })}</option>
              <option value="USD">{t({ fr: 'USD — Dollar américain', ht: 'USD — Dola ameriken' })}</option>
            </select>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <Bell className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Interface & Notifications', ht: 'Entèfas & Notifikasyon' })}
        </h2>
        <div className="divide-y divide-[var(--color-border)]">
          <Toggle
            label={t({ fr: 'Mode sombre', ht: 'Mòd fè nwa' })}
            checked={isDark}
            onChange={handleDarkModeToggle}
          />
          <Toggle
            label={t({ fr: 'Notifications activées', ht: 'Notifikasyon aktive' })}
            checked={form.notifications_enabled}
            onChange={(v) => setForm(prev => ({ ...prev, notifications_enabled: v }))}
          />
          <Toggle
            label={t({ fr: 'Sauvegarde automatique des formulaires', ht: 'Sovodòt otomatik fòm yo' })}
            checked={form.auto_save}
            onChange={(v) => setForm(prev => ({ ...prev, auto_save: v }))}
          />
        </div>
      </GlassCard>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={prefs.mutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {prefs.mutation.isPending ? t({ fr: 'Sauvegarde…', ht: 'Sovgad…' }) : t({ fr: 'Enregistrer les préférences', ht: 'Anrejistre preferans yo' })}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: SECURITY
// ═══════════════════════════════════════════════════════════════════════════════

function SecurityTab({ userId, userEmail }: { userId: string | undefined; userEmail: string | undefined }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [pw,    setPw]    = useState('');
  const [pw2,   setPw2]   = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/auth/login');
  };

  const handleChangePassword = async () => {
    if (!pw || pw !== pw2) {
      toast.error(t({ fr: 'Les mots de passe ne correspondent pas', ht: 'Modpas yo pa koresponn' }));
      return;
    }
    if (pw.length < 8) {
      toast.error(t({ fr: 'Minimum 8 caractères', ht: 'Minimòm 8 karaktè' }));
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t({ fr: 'Mot de passe mis à jour ✓', ht: 'Modpas mete ajou ✓' }));
      setPw(''); setPw2('');
    }
  };

  const handleExport = async () => {
    setExportBusy(true);
    try {
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `profitpilot-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t({ fr: 'Export téléchargé ✓', ht: 'Ekspòtasyon telechaje ✓' }));
    } catch (e: any) {
      toast.error(e.message ?? t({ fr: 'Export échoué', ht: 'Ekspòtasyon echwe' }));
    } finally {
      setExportBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'SUPPRIMER') return;
    setDeleteBusy(true);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      router.replace('/auth/login');
    } catch (e: any) {
      toast.error(e.message ?? t({ fr: 'Suppression échouée', ht: 'Efase echwe' }));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account info */}
      <GlassCard>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <CircleUser className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Compte connecté', ht: 'Kont konekte' })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--color-surface)] px-4 py-3">
            <p className="text-xs text-[var(--color-muted)]">{t({ fr: 'Email', ht: 'Imèl' })}</p>
            <p className="mt-1 font-mono text-sm text-[var(--color-text)]">{userEmail ?? '—'}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface)] px-4 py-3">
            <p className="text-xs text-[var(--color-muted)]">{t({ fr: 'ID utilisateur', ht: 'ID itilizatè' })}</p>
            <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted)]">{userId ?? '—'}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition"
          >
            <LogOut className="h-4 w-4" />
            {t({ fr: 'Se déconnecter', ht: 'Dekonekte' })}
          </button>
        </div>
      </GlassCard>

      {/* Change password */}
      <GlassCard>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <Key className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Changer de mot de passe', ht: 'Chanje modpas' })}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t({ fr: 'Nouveau mot de passe', ht: 'Nouvo modpas' })}</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div>
            <Label>{t({ fr: 'Confirmer le mot de passe', ht: 'Konfime modpas la' })}</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={pwBusy || !pw || pw !== pw2}
            className="flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] hover:bg-slate-200 transition disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            {pwBusy ? t({ fr: 'Mise à jour…', ht: 'Ap mete ajou…' }) : t({ fr: 'Mettre à jour', ht: 'Mete ajou' })}
          </button>
        </div>
      </GlassCard>

      {/* Demo data generator */}
      {/* Data export */}
      <GlassCard>
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
          <Download className="h-4 w-4 text-emerald-400" />
          {t({ fr: 'Exporter vos données', ht: 'Ekspòte done ou yo' })}
        </h2>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          {t({ fr: 'Téléchargez toutes vos données (ventes, dépenses, produits, clients…) au format JSON.', ht: 'Telechaje tout done ou yo (vant, depans, pwodwi, kliyan…) nan fòma JSON.' })}
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportBusy}
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          {exportBusy ? t({ fr: 'Export en cours…', ht: 'Ekspòtasyon an kou…' }) : t({ fr: 'Télécharger mes données', ht: 'Telechaje done m yo' })}
        </button>
      </GlassCard>

      {/* Danger zone */}
      <GlassCard className="border-red-500/20 bg-red-50">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-red-400">
          <Trash2 className="h-4 w-4" />
          {t({ fr: 'Zone dangereuse — Supprimer le compte', ht: 'Zòn danjere — Efase kont la' })}
        </h2>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          {t({ fr: 'Cette action supprime définitivement toutes vos données. Tapez', ht: 'Aksyon sa a efase tout done ou yo definitivman. Tape' })} <strong className="text-red-400 font-mono">SUPPRIMER</strong> {t({ fr: 'pour confirmer.', ht: 'pou konfime.' })}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="SUPPRIMER"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="sm:w-56"
          />
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleteBusy || deleteConfirm !== 'SUPPRIMER'}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            {deleteBusy ? t({ fr: 'Suppression…', ht: 'Efase…' }) : t({ fr: 'Supprimer définitivement', ht: 'Efase definitivman' })}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE ROOT
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsPage() {
  const { t } = useLanguage();
  const { userId, userEmail, loading } = useSettings();
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const tabContent: Record<TabId, React.ReactNode> = {
    profile:  <ProfileTab  userId={userId} />,
    payments: <PaymentsTab />,
    prefs:    <PreferencesTab userId={userId} />,
    security: <SecurityTab userId={userId} userEmail={userEmail} />,
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-8 md:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y:  0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-emerald-500">
            {t({ fr: 'Paramètres', ht: 'Anviwònman' })}
          </p>
          <h1 className="text-2xl font-bold text-[#001F3F] md:text-3xl">
            {t({ fr: 'Compte & Préférences', ht: 'Kont & Preferans' })}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {t({ fr: 'Gérez votre profil d\'entreprise, vos paiements et vos préférences de l\'application.', ht: 'Jere pwofil antrepriz ou, peman ou ak preferans aplikasyon an.' })}
          </p>
        </motion.div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          {TABS.map(({ id, label, labelT, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  active
                    ? 'bg-[#EAF1F8] text-[#001F3F] shadow-sm'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t(labelT)}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab content ───────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tabContent[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function SettingsPageWrapper() {
  return (
    <ProtectedRoute>
      <SettingsPage />
    </ProtectedRoute>
  );
}
