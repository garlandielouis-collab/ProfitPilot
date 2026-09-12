'use client';

// ─────────────────────────────────────────────────────────────────────────────
// File d'attente hors-ligne — Bonus 4
//
// « Un outil qui s'arrête dès que le réseau coupe est vite abandonné. » En
// Haïti la coupure est la règle, pas l'exception : une vente saisie sans
// connexion doit être conservée localement puis rejouée à la reconnexion.
//
// Le point critique est l'idempotence : chaque vente en file porte un
// `client_ref` (UUID) généré à la saisie. Le serveur reconnaît ce ref et ne
// crée jamais deux ventes pour un même rejeu — sans quoi une synchronisation
// partielle gonflerait le chiffre d'affaires.
//
// IndexedDB plutôt que localStorage : la file doit survivre à un onglet fermé,
// tenir plusieurs milliers d'entrées, et s'écrire de façon transactionnelle.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'profitpilot-offline';
const DB_VERSION = 1;
const STORE = 'pending_sales';

export type PendingSale = {
  /** Clé d'idempotence, aussi la clé primaire de la file. */
  clientRef: string;
  /** Payload exact attendu par `createSaleAction`. */
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
  lastError?: string;
  /**
   * Refus définitif tant que le marchand n'a pas agi : le serveur a refusé la
   * vente faute de taux USD/HTG saisi. Ne consomme pas d'essai ; la vente est
   * rejouée à chaque passage et sort de la file dès que le taux existe.
   */
  waitingFor?: 'exchange_rate';
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientRef' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error ?? new Error('IndexedDB inaccessible'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror   = () => reject(request.error ?? new Error('Écriture impossible'));
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** UUID v4 — `crypto.randomUUID` n'existe pas sur tous les WebView Android. */
export function newClientRef(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function queueSale(clientRef: string, payload: Record<string, unknown>): Promise<void> {
  await tx('readwrite', (store) =>
    store.put({ clientRef, payload, queuedAt: new Date().toISOString(), attempts: 0 } as PendingSale),
  );
}

export async function listPendingSales(): Promise<PendingSale[]> {
  try {
    const all = await tx<PendingSale[]>('readonly', (store) => store.getAll() as IDBRequest<PendingSale[]>);
    return all ?? [];
  } catch {
    return [];
  }
}

export async function countPendingSales(): Promise<number> {
  try {
    return await tx<number>('readonly', (store) => store.count());
  } catch {
    return 0;
  }
}

export async function removePendingSale(clientRef: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(clientRef) as unknown as IDBRequest<undefined>);
}

export async function markAttempt(entry: PendingSale, error: string): Promise<void> {
  // Un échec d'une autre nature : la vente n'attend plus (seulement) le taux.
  const { waitingFor: _waiting, ...rest } = entry;
  await tx('readwrite', (store) =>
    store.put({ ...rest, attempts: entry.attempts + 1, lastError: error } as PendingSale),
  );
}

/** Refus « taux de change manquant » : la vente reste en file, sans user d'essai. */
export async function markWaitingForRate(entry: PendingSale, error: string): Promise<void> {
  await tx('readwrite', (store) =>
    store.put({ ...entry, waitingFor: 'exchange_rate', lastError: error } as PendingSale),
  );
}
