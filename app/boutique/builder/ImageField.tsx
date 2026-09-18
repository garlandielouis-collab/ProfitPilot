'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Mettre une photo dans sa vitrine
//
// L'éditeur ne savait demander qu'une ADRESSE : « https://… ». Un marchand dont
// la photo de bannière est dans la pellicule de son téléphone n'a pas d'adresse
// à coller — il lui faudrait d'abord ouvrir un compte chez un hébergeur
// d'images, y téléverser sa photo, en copier le lien, revenir. Personne ne le
// fait. Résultat observé : des vitrines qui gardent la photo d'illustration de
// leur gabarit, et un marchand convaincu qu'on ne peut mettre qu'un titre.
//
// Le stockage existait déjà pourtant : le bucket public `store-assets`, créé
// par la migration du 03/09, écrit sous `<business_id>/…` et lu par tout le
// monde. Seul l'écran manquait.
//
// ── Pourquoi un `fetch` nu plutôt que `supabase.storage` ───────────────────
//
// Le client de `lib/supabaseClient.ts` porte un `fetch` borné à 8 secondes avec
// une nouvelle tentative. C'est le bon réglage pour une requête de données —
// et le pire pour un envoi de fichier : une photo de 2 Mo sur une connexion
// mobile haïtienne dépasse 8 secondes, l'envoi est coupé net, puis RECOMMENCÉ,
// ce qui consomme deux fois les données du marchand avant d'échouer. On parle
// donc directement à l'API de stockage, avec le jeton de la session : pas de
// délai imposé, et un vrai code HTTP à traduire.
//
// ── Ce qui part n'est jamais la photo d'origine ────────────────────────────
//
// Une photo de téléphone fait 3 000 pixels de large et 4 Mo. Envoyée telle
// quelle, elle coûte la connexion du marchand à l'envoi, et celle de CHAQUE
// visiteur au chargement. Elle est donc réduite dans le navigateur avant de
// partir — 1 600 pixels de côté au maximum, en WebP quand le navigateur sait
// l'écrire. Un fichier de 4 Mo tombe autour de 200 Ko sans différence visible
// sur un écran.
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Trash2, X } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { Button } from '../../../components/ds/Button';
import { Field } from '../../../components/ds/Field';

const BUCKET     = 'store-assets';
const MAX_SIDE   = 1600;
/** La limite du bucket. Vérifiée ici pour le dire en français plutôt qu'en 413. */
const MAX_BYTES  = 10 * 1024 * 1024;
/** En dessous, une photo est déjà légère : la recompresser ne gagnerait rien. */
const SMALL_ENOUGH = 300 * 1024;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Le stockage n'est pas configuré sur ce site.");
  return url.replace(/\/$/, '');
}

export function publicImageUrl(path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * La photo, réduite, prête à partir.
 *
 * Rend le fichier d'origine quand il est déjà petit ou quand le navigateur ne
 * sait pas le décoder : mieux vaut envoyer 4 Mo que refuser la photo.
 */
async function shrink(file: File): Promise<{ blob: Blob; ext: string }> {
  const extOf = (type: string) =>
    type.includes('webp') ? 'webp' : type.includes('png') ? 'png'
      : type.includes('avif') ? 'avif' : 'jpg';

  if (file.size <= SMALL_ENOUGH) return { blob: file, ext: extOf(file.type) };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, ext: extOf(file.type) };
  }

  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width  = Math.round(bitmap.width  * ratio);
  const height = Math.round(bitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: file, ext: extOf(file.type) };
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Le PNG garde sa transparence — un logo découpé ne doit pas repartir sur un
  // fond noir. Les photos passent en WebP, et en JPEG là où il manque.
  const transparent = file.type.includes('png');
  const target = transparent ? 'image/webp' : 'image/webp';

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, target, 0.82);
  });

  if (blob && blob.type === target && blob.size < file.size) {
    return { blob, ext: 'webp' };
  }

  // `toBlob` d'un navigateur qui ne sait pas écrire du WebP rend du PNG : pour
  // une photo, c'est plus lourd que l'original. On repasse par le JPEG, sauf
  // s'il y a de la transparence à préserver.
  if (!transparent) {
    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82);
    });
    if (jpeg && jpeg.size < file.size) return { blob: jpeg, ext: 'jpg' };
  }

  return blob && blob.size < file.size
    ? { blob, ext: extOf(blob.type) }
    : { blob: file, ext: extOf(file.type) };
}

/**
 * Envoie la photo et rend son adresse publique.
 *
 * Le premier segment du chemin est l'identifiant de l'entreprise : c'est
 * exactement ce que la politique du bucket vérifie
 * (`(storage.foldername(name))[1]`). Un horodatage suit le nom du bloc, pour
 * qu'une photo remplacée ne reste pas en cache chez les visiteurs qui avaient
 * déjà vu l'ancienne.
 */
export async function uploadStoreImage(
  businessId: string,
  slot: string,
  file: File,
): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Format accepté : JPEG, PNG, WebP ou AVIF.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Cette photo pèse ${Math.round(file.size / 1024 / 1024)} Mo — la limite est de 10 Mo. `
      + 'Reprenez-la en qualité moyenne.',
    );
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Votre session a expiré. Reconnectez-vous, puis réessayez.');

  const { blob, ext } = await shrink(file);
  const path = `${businessId}/vitrine/${slot}-${Date.now()}.${ext}`;

  const res = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${session.access_token}`,
      'Content-Type': blob.type || 'application/octet-stream',
      'x-upsert':     'true',
    },
    body: blob,
  });

  if (!res.ok) {
    // 403 : la politique du bucket a dit non. C'est le seul cas où le marchand
    // ne peut rien faire lui-même, et il doit donc être nommé pour ce qu'il
    // est — pas « erreur inattendue ».
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        "Le stockage a refusé l'envoi pour cette entreprise. "
        + 'Si le problème persiste, signalez-le : les droits du dossier sont à revoir.',
      );
    }
    if (res.status === 413) {
      throw new Error('Cette photo est trop lourde pour le stockage. Reprenez-la en qualité moyenne.');
    }
    const detail = await res.text().catch(() => '');
    throw new Error(`L'envoi a échoué (${res.status}). ${detail.slice(0, 120)}`.trim());
  }

  return publicImageUrl(path);
}

function isUrlish(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Un champ « photo » : la pellicule du téléphone d'abord, l'adresse ensuite.
 *
 * L'ordre n'est pas neutre. Le bouton d'envoi est ce que 99 % des marchands
 * utiliseront ; coller une adresse reste possible pour celui qui héberge déjà
 * ses images ailleurs, replié derrière un lien pour ne pas encombrer l'écran
 * de ceux qui n'en ont pas besoin.
 */
export function ImageField({
  label, hint, value, onChange, businessId, slot, ratio = '16 / 9',
}: {
  label:      string;
  hint?:      string;
  value:      string | null;
  onChange:   (next: string | null) => void;
  businessId: string;
  /** Le nom du bloc, qui devient le début du nom de fichier. */
  slot:       string;
  /** La forme de l'aperçu : celle que la vitrine donnera à cette image. */
  ratio?:     string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId   = useId();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadStoreImage(businessId, slot, file);
      onChange(url);
      setDraft(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    } finally {
      setBusy(false);
      // Le même fichier rechoisi doit relancer un envoi : sans cela, `change`
      // ne se déclenche pas une seconde fois.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="w-full">
      <p className="mb-2 block text-note font-bold text-primary dark:text-dark-text">{label}</p>

      {value ? (
        <div className="space-y-2">
          <div
            className="overflow-hidden rounded-surface border border-border bg-surface2 dark:border-dark-border dark:bg-dark-surface2"
            style={{ aspectRatio: ratio }}
          >
            {/* Une balise `img` nue : l'adresse peut venir d'un hébergeur
                quelconque, que `next/image` refuserait faute d'être déclaré. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={busy}
              loadingLabel="Envoi…"
              icon={<ImagePlus className="h-4 w-4" />}
              onClick={() => inputRef.current?.click()}
            >
              Remplacer
            </Button>
            <Button
              variant="quiet"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => { onChange(null); setDraft(''); }}
            >
              Retirer
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex min-h-touch w-full flex-col items-center justify-center gap-2 rounded-surface border border-dashed border-border bg-surface px-4 py-8 text-center transition hover:border-accent disabled:opacity-60 dark:border-dark-border dark:bg-dark-surface2"
          aria-describedby={helpId}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted dark:text-dark-muted" aria-hidden />
          )}
          <span className="text-body font-semibold text-primary dark:text-dark-text">
            {busy ? 'Envoi en cours…' : 'Choisir une photo'}
          </span>
          <span className="text-note text-muted dark:text-dark-muted">
            Depuis votre téléphone ou votre ordinateur · JPEG, PNG ou WebP
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); }}
      />

      {(hint || error) && (
        <p
          id={helpId}
          className={`mt-2 text-note ${error ? 'text-danger' : 'text-muted dark:text-dark-muted'}`}
        >
          {error ?? hint}
        </p>
      )}

      {showUrl ? (
        <div className="mt-3">
          <Field
            label="Ou collez l'adresse d'une image"
            hint="Elle doit commencer par http:// ou https://."
            inputMode="url"
            placeholder="https://…"
            value={draft}
            warning={
              draft.trim() && !isUrlish(draft)
                ? "L'adresse doit commencer par http:// ou https://."
                : undefined
            }
            onChange={(e) => {
              setDraft(e.target.value);
              onChange(isUrlish(e.target.value) ? e.target.value.trim() : null);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-note text-text2 underline-offset-2 hover:underline dark:text-dark-text2"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          J&apos;ai déjà mon image en ligne : coller une adresse
        </button>
      )}
    </div>
  );
}

/**
 * Plusieurs photos — la galerie, et elle seule.
 *
 * Le champ précédent demandait « une adresse par ligne, douze au maximum »
 * dans une zone de texte. Autant dire : rien, pour un marchand qui photographie
 * ses articles avec son téléphone. Ici, on choisit plusieurs fichiers d'un coup,
 * on voit ce qu'on a mis, et on retire à l'unité.
 */
export function ImageListField({
  images, onChange, businessId, slot, max = 12,
}: {
  images:     string[];
  onChange:   (next: string[]) => void;
  businessId: string;
  slot:       string;
  max?:       number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy,  setBusy]  = useState(0);
  const [error, setError] = useState<string | null>(null);

  const restant = max - images.length;

  async function send(files: FileList) {
    const lot = Array.from(files).slice(0, restant);
    setError(null);
    setBusy(lot.length);
    const ajoutees: string[] = [];
    for (const file of lot) {
      try {
        ajoutees.push(await uploadStoreImage(businessId, slot, file));
      } catch (e) {
        setError(e instanceof Error ? e.message : "L'envoi a échoué.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (ajoutees.length > 0) onChange([...images, ...ajoutees].slice(0, max));
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="w-full">
      <p className="mb-2 block text-note font-bold text-primary dark:text-dark-text">Les photos</p>

      {images.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((url, i) => (
            <li
              key={url}
              className="relative overflow-hidden rounded-surface border border-border dark:border-dark-border"
              style={{ aspectRatio: '1 / 1' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                aria-label={`Retirer la photo ${i + 1}`}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-pill bg-black/55 text-white transition hover:bg-black/75"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        block
        disabled={restant <= 0}
        loading={busy > 0}
        loadingLabel={`Envoi… (${busy})`}
        icon={<ImagePlus className="h-4 w-4" />}
        onClick={() => inputRef.current?.click()}
      >
        {restant > 0 ? 'Ajouter des photos' : 'Galerie complète'}
      </Button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => { const f = e.target.files; if (f && f.length) void send(f); }}
      />

      <p className={`mt-2 text-note ${error ? 'text-danger' : 'text-muted dark:text-dark-muted'}`}>
        {error ?? `${images.length} photo${images.length > 1 ? 's' : ''} sur ${max}.`}
      </p>
    </div>
  );
}
