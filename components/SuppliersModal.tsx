'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { useLanguage } from './LanguageWrapper';

type Supplier = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
};

type SuppliersModalProps = {
  open: boolean;
  onClose: () => void;
};

const STORAGE_KEY = 'profitpilot-suppliers';

export function SuppliersModal({ open, onClose }: SuppliersModalProps) {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSuppliers(JSON.parse(stored));
      } catch {
        setSuppliers([]);
      }
    }
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers));
  }, [suppliers]);

  const handleAddSupplier = () => {
    if (!formData.name.trim() || !formData.email.trim()) return;

    const newSupplier: Supplier = {
      id: `${Date.now()}`,
      ...formData,
    };

    setSuppliers((current) => [newSupplier, ...current]);
    setFormData({ name: '', email: '', phone: '', address: '' });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setSuppliers((current) => current.filter((s) => s.id !== id));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white shadow-lg">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 sm:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-anthracite sm:text-2xl">
                {t({ fr: 'Gestion des Fournisseurs', ht: 'Jesyon Founisè yo' })}
              </h2>
              <p className="mt-1 text-sm text-anthracite/70">
                {t({ fr: 'Gérez vos contacts fournisseurs', ht: 'Jesyone kontak founise ou yo' })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-2xl text-anthracite/60 hover:text-anthracite"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-6 sm:px-8">
          {/* Form */}
          {showForm && (
            <div className="mb-6 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 font-semibold text-anthracite">
                {t({ fr: 'Ajouter un fournisseur', ht: 'Ajoute yon founise' })}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-anthracite/90">
                    {t({ fr: 'Nom', ht: 'Non' })}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-anthracite outline-none transition focus:border-primary focus:bg-slate-50"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-anthracite/90">
                      {t({ fr: 'Email', ht: 'Imèl' })}
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-anthracite outline-none transition focus:border-primary focus:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-anthracite/90">
                      {t({ fr: 'Téléphone', ht: 'Telefòn' })}
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-1 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-anthracite outline-none transition focus:border-primary focus:bg-slate-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-anthracite/90">
                    {t({ fr: 'Adresse', ht: 'Adrès' })}
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="mt-1 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-anthracite outline-none transition focus:border-primary focus:bg-slate-50"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={handleAddSupplier}
                    className="flex-1 bg-primary text-white hover:bg-primary/90"
                  >
                    {t({ fr: 'Ajouter', ht: 'Ajoute' })}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ name: '', email: '', phone: '', address: '' });
                    }}
                    className="flex-1 bg-slate-100 text-anthracite hover:bg-slate-200"
                  >
                    {t({ fr: 'Annuler', ht: 'Anile' })}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Suppliers List */}
          {suppliers.length === 0 && !showForm ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-anthracite/80">
              {t({ fr: 'Aucun fournisseur enregistré. Cliquez sur le bouton pour en ajouter.', ht: 'Pa gen okenn founise anrejistre.' })}
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-anthracite">{supplier.name}</h4>
                      <div className="mt-2 space-y-1 text-sm text-anthracite/70">
                        {supplier.email && (
                          <p>
                            📧 <span className="font-medium">{supplier.email}</span>
                          </p>
                        )}
                        {supplier.phone && (
                          <p>
                            📱 <span className="font-medium">{supplier.phone}</span>
                          </p>
                        )}
                        {supplier.address && (
                          <p>
                            📍 <span className="font-medium">{supplier.address}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(supplier.id)}
                      className="text-lg text-danger hover:opacity-80"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 sm:px-8 flex gap-3">
          {!showForm && (
            <Button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex-1 bg-primary text-white hover:bg-primary/90"
            >
              {t({ fr: '+ Ajouter un fournisseur', ht: '+ Ajoute yon founise' })}
            </Button>
          )}
          <Button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 text-anthracite hover:bg-slate-200"
          >
            {t({ fr: 'Fermer', ht: 'Fèmen' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
