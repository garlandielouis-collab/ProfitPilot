import type { StoreSettings } from '../../actions/store-public';

export function StoreFooter({ store }: { store: StoreSettings }) {
  return (
    <footer className="border-t border-slate-200 bg-white mt-16">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--store-primary)' }}>
              {store.store_name ?? 'Boutique'}
            </p>
            {store.tagline && <p className="mt-1 text-xs text-slate-500">{store.tagline}</p>}
          </div>
          <div className="text-xs text-slate-500 space-y-1">
            {store.contact_email   && <p>✉ {store.contact_email}</p>}
            {store.contact_phone   && <p>📞 {store.contact_phone}</p>}
            {store.contact_address && <p>📍 {store.contact_address}</p>}
          </div>
          <div className="text-xs text-slate-400">
            <p>Propulsé par <span className="font-semibold text-slate-600">ProfitPilot</span></p>
            <p className="mt-1">© {new Date().getFullYear()} {store.store_name ?? 'Boutique'}. Tous droits réservés.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
