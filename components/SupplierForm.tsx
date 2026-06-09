'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { useLanguage } from './LanguageWrapper';
import { supabase } from '../lib/supabaseClient';

type SupplierFormProps = {
  onSaved?: () => void;
};

export function SupplierForm({ onSaved }: SupplierFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const { t } = useLanguage();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setOwnerId(uid);

      if (uid) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', uid)
          .maybeSingle();
        if (biz) setBusinessId(biz.id);
      }
    }

    loadUser();
  }, []);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus('submitting');
    setMessage('');

    const { error } = await supabase.from('suppliers').insert({
      owner_id: ownerId || undefined,
      business_id: businessId || undefined,
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }

    setStatus('success');
    setMessage(t({ fr: 'Fournisseur enregistré avec succès.', ht: 'Founisè anrejistre avèk siksè.' }));
    setName('');
    setPhone('');
    setEmail('');
    onSaved?.();
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-anthracite">{t({ fr: 'Ajouter un fournisseur', ht: 'Ajoute yon founisè' })}</h2>
        <p className="mt-1 text-sm text-anthracite/70">{t({ fr: 'Créez un fournisseur pour vos achats à crédit et achats fournisseurs.', ht: 'Kreye yon founisè pou acha a kredi ak acha founisè yo.' })}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium text-anthracite/90">{t({ fr: 'Nom', ht: 'Non' })}</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t({ fr: 'Ex: Founisè S.A.', ht: 'Eg: Founisè S.A.' })}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">{t({ fr: 'Téléphone', ht: 'Telefòn' })}</label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Ex: +509 34 12 34 56"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-anthracite/90">{t({ fr: 'Email', ht: 'Imèl' })}</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="contact@fournisseur.com"
            className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" className={canSubmit ? '' : 'bg-slate-200 text-anthracite cursor-not-allowed'} disabled={!canSubmit || status === 'submitting'}>
            {t({ fr: 'Enregistrer le fournisseur', ht: 'Anrejistre founisè a' })}
          </Button>
        </div>

        {status !== 'idle' && (
          <div className={`rounded-3xl px-4 py-3 text-sm ${status === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
            {message}
          </div>
        )}
      </form>
    </section>
  );
}
