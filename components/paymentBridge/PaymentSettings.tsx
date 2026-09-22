'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les réglages de Payment Bridge — « sur quel numéro mes clients me paient-ils ? »
//
// Deux sections, dans l'ordre où le marchand en a besoin :
//
//   1. ses NUMÉROS — sans eux, rien ne marche ;
//   2. ses TÉLÉPHONES compagnons — facultatifs : tout fonctionne sans, le
//      marchand confirme à la main (§39).
//
// Le numéro complet n'est affiché qu'au propriétaire et à l'administrateur, qui
// peuvent le modifier. Les autres membres voient `•••• 4521` : assez pour le
// reconnaître, pas assez pour le recopier ailleurs.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Smartphone, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, BottomSheet, Button, Card, Field, PhoneField, Section, Stack, Switch, TextField,
} from '../ds';
import {
  enrollDevice,
  listDevices,
  listPaymentMethods,
  removePaymentMethod,
  revokeMerchantDevice,
  savePaymentMethod,
  setDefaultPaymentMethod,
  type MerchantDevice,
  type MerchantMethod,
} from '../../app/actions/paymentBridge';
import { METHOD_LABEL, type BridgeMethod } from '../../lib/paymentBridge/types';

type Editing = { method: MerchantMethod | null; kind: 'moncash' | 'natcash' } | null;

export function PaymentSettings() {
  const [methods, setMethods] = useState<MerchantMethod[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [devices, setDevices] = useState<MerchantDevice[] | null>(null);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    const [m, d] = await Promise.all([listPaymentMethods(), listDevices()]);
    if (!m.ok) { setError(m.message); return; }
    setMethods(m.data.methods);
    setCanEdit(m.data.canEdit);
    setDevices(d.ok ? d.data : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="rounded-surface bg-danger-sub p-4 text-body text-danger">{error}</p>;
  if (!methods) return <div className="pp-skeleton h-40 rounded-surface" aria-busy />;

  const mobile = methods.filter((m) => m.method === 'moncash' || m.method === 'natcash');

  return (
    <Stack>
      <Section title="Vos numéros d'encaissement">
        <p className="text-note text-muted dark:text-dark-muted">
          Vos clients envoient l'argent directement sur ces numéros. ProfitPilot l'affiche sur la page de paiement
          de votre boutique, avec le montant et une référence — il ne touche jamais à l'argent.
        </p>

        {(['moncash', 'natcash'] as const).map((kind) => {
          const rows = mobile.filter((m) => m.method === kind);
          return (
            <Card key={kind} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-body font-bold text-primary dark:text-dark-text">{METHOD_LABEL[kind].fr}</h3>
                {canEdit && (
                  <Button size="sm" variant="quiet" icon={<Plus className="h-4 w-4" aria-hidden />}
                          onClick={() => setEditing({ method: null, kind })}>
                    {rows.length ? 'Autre numéro' : 'Ajouter'}
                  </Button>
                )}
              </div>
              {rows.length === 0 ? (
                <p className="mt-2 text-note text-muted dark:text-dark-muted">Aucun numéro {METHOD_LABEL[kind].fr}.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border dark:divide-dark-border">
                  {rows.map((m) => (
                    <MethodRow key={m.id} m={m} canEdit={canEdit}
                               onEdit={() => setEditing({ method: m, kind })} onChanged={load} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
        {!canEdit && (
          <p className="text-note text-muted dark:text-dark-muted">
            Seul le propriétaire ou un administrateur peut modifier ces numéros.
          </p>
        )}
      </Section>

      <Section title="Téléphones compagnons">
        <p className="text-note text-muted dark:text-dark-muted">
          Facultatif. Un téléphone enrôlé pourra, avec la future application ProfitPilot Pay Link, signaler
          automatiquement les paiements reçus par SMS. Sans lui, vous confirmez les paiements depuis l'écran
          « Paiements ».
        </p>
        <Card className="p-4">
          {devices && devices.length > 0 ? (
            <ul className="divide-y divide-border dark:divide-dark-border">
              {devices.map((d) => (
                <DeviceRow key={d.id} d={d} canEdit={canEdit} onChanged={load} />
              ))}
            </ul>
          ) : (
            <p className="text-note text-muted dark:text-dark-muted">Aucun téléphone enrôlé.</p>
          )}
          {canEdit && (
            <Button className="mt-3" size="sm" variant="quiet" icon={<Smartphone className="h-4 w-4" aria-hidden />}
                    onClick={() => setEnrolling(true)}>
              Enrôler un téléphone
            </Button>
          )}
        </Card>
      </Section>

      {editing && (
        <MethodSheet editing={editing} onClose={() => setEditing(null)}
                     onSaved={async () => { setEditing(null); toast.success('Numéro enregistré.'); await load(); }} />
      )}
      {enrolling && (
        <EnrollSheet onClose={() => { setEnrolling(false); void load(); }} />
      )}
    </Stack>
  );
}

function MethodRow({
  m, canEdit, onEdit, onChanged,
}: { m: MerchantMethod; canEdit: boolean; onEdit: () => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    const res = await savePaymentMethod({
      id: m.id, method: m.method, destination: m.destination, displayLabel: m.displayLabel,
      instructions: m.instructions, isEnabled: next,
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    await onChanged();
  }

  async function makeDefault() {
    setBusy(true);
    const res = await setDefaultPaymentMethod(m.id);
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    await onChanged();
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="amount text-body font-bold text-primary dark:text-dark-text">
            {m.destination ?? m.masked}
          </p>
          {m.displayLabel && <p className="text-note text-muted dark:text-dark-muted">{m.displayLabel}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {m.isDefault && <Badge tone="accent"><Star className="h-3 w-3" aria-hidden /> Par défaut</Badge>}
          {!m.isEnabled && <Badge>Désactivé</Badge>}
        </div>
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1">
            <Switch checked={m.isEnabled} onChange={toggle} disabled={busy} label="Activé" />
          </div>
          {!m.isDefault && m.isEnabled && (
            <Button size="sm" variant="link" onClick={makeDefault} disabled={busy}>Définir par défaut</Button>
          )}
          <Button size="sm" variant="link" onClick={onEdit}>Modifier</Button>
        </div>
      )}
    </li>
  );
}

function MethodSheet({
  editing, onClose, onSaved,
}: { editing: NonNullable<Editing>; onClose: () => void; onSaved: () => Promise<void> }) {
  const m = editing.method;
  const [phone, setPhone]   = useState(m?.destination?.replace(/^\+509\s?/, '') ?? '');
  const [label, setLabel]   = useState(m?.displayLabel ?? '');
  const [notes, setNotes]   = useState(m?.instructions ?? '');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const name = METHOD_LABEL[editing.kind as BridgeMethod].fr;

  async function save() {
    setBusy(true);
    setError('');
    const res = await savePaymentMethod({
      id: m?.id ?? null, method: editing.kind, destination: phone,
      displayLabel: label || null, instructions: notes || null, isEnabled: m?.isEnabled ?? true,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onSaved();
  }

  async function remove() {
    if (!m) return;
    setBusy(true);
    const res = await removePaymentMethod(m.id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    await onSaved();
  }

  return (
    <BottomSheet open onClose={onClose} title={m ? `Numéro ${name}` : `Ajouter un numéro ${name}`}
      footer={<Button block onClick={save} loading={busy}>Enregistrer</Button>}>
      <div className="space-y-4">
        <PhoneField label={`Numéro ${name}`} value={phone} onChange={(e) => setPhone(e.target.value)}
                    hint="Le numéro qui REÇOIT l'argent. Vérifiez-le : vos clients paieront dessus." />
        <Field label="Nom affiché (facultatif)" value={label} maxLength={80}
               placeholder="Numéro de la boutique" onChange={(e) => setLabel(e.target.value)} />
        <TextField label="Précision pour vos clients (facultatif)" value={notes} rows={2} maxLength={300}
                   placeholder="Le nom du compte est Marie Joseph." onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-note text-danger" role="alert">{error}</p>}
        {m && (
          <Button variant="link" size="sm" onClick={remove} disabled={busy} className="text-danger">
            Retirer ce numéro
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

function DeviceRow({ d, canEdit, onChanged }: { d: MerchantDevice; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const revoked = d.status === 'revoked';

  async function revoke() {
    if (!window.confirm(`Révoquer « ${d.name} » ? Ce téléphone ne pourra plus signaler de paiements.`)) return;
    setBusy(true);
    const res = await revokeMerchantDevice(d.id);
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success('Téléphone révoqué.');
    await onChanged();
  }

  const seen = d.lastSeenAt
    ? new Intl.DateTimeFormat('fr-HT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d.lastSeenAt))
    : 'jamais';

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-body font-bold text-primary dark:text-dark-text">{d.name}</p>
        <p className="text-note text-muted dark:text-dark-muted">
          <span className="amount">{d.tokenPrefix}…</span> · dernier contact : {seen}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Badge tone={revoked ? 'neutral' : d.status === 'active' ? 'success' : 'warning'}>
          {revoked ? 'Révoqué' : d.status === 'active' ? 'Actif' : d.status === 'offline' ? 'Hors ligne' : 'En attente'}
        </Badge>
        {canEdit && !revoked && (
          <Button size="sm" variant="quiet" onClick={revoke} loading={busy}>Révoquer</Button>
        )}
      </div>
    </li>
  );
}

/**
 * L'enrôlement. Le jeton est montré UNE fois : il n'est stocké que haché, et la
 * feuille le dit pour que le marchand ne la ferme pas avant de l'avoir copié.
 */
function EnrollSheet({ onClose }: { onClose: () => void }) {
  const [name, setName]   = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    const res = await enrollDevice({ name });
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setToken(res.data.token);
  }

  return (
    <BottomSheet open onClose={onClose} title="Enrôler un téléphone"
      footer={token
        ? <Button block onClick={onClose}>J'ai copié le code</Button>
        : <Button block onClick={go} loading={busy}>Créer le code d'accès</Button>}>
      {token ? (
        <div className="space-y-3">
          <p className="text-body text-text2 dark:text-dark-text2">
            Saisissez ce code dans l'application du téléphone. <strong>Il ne sera plus jamais affiché</strong> :
            s'il est perdu, révoquez le téléphone et enrôlez-le à nouveau.
          </p>
          <div className="flex items-center gap-2 rounded-control bg-surface2 p-3 dark:bg-dark-surface2">
            <code className="min-w-0 flex-1 select-all break-all text-note">{token}</code>
            <Button size="sm" variant="quiet" icon={<Copy className="h-4 w-4" aria-hidden />}
                    onClick={() => navigator.clipboard?.writeText(token).then(() => toast.success('Copié.')).catch(() => {})}>
              Copier
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-body text-text2 dark:text-dark-text2">
            Choisissez le téléphone qui reçoit les SMS MonCash ou NatCash de la boutique.
          </p>
          <Field label="Nom du téléphone" value={name} maxLength={80} placeholder="Téléphone de la boutique"
                 onChange={(e) => setName(e.target.value)} />
          {error && <p className="text-note text-danger" role="alert">{error}</p>}
        </div>
      )}
    </BottomSheet>
  );
}
