'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';

type BarcodeScannerProps = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html5QrcodeRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted || !containerRef.current) return;

        const html5Qrcode = new Html5Qrcode(containerRef.current.id);
        html5QrcodeRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: 250,
          },
          (decodedText: string) => {
            if (!mounted) return;
            onDetected(decodedText);
          },
          (errorMessage: string) => {
            // ignore transient scan errors
          }
        );
      } catch (err: any) {
        setError(err?.message ?? 'Impossible d\'accéder à la caméra.');
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current
          .stop()
          .catch(() => undefined)
          .finally(() => html5QrcodeRef.current?.clear().catch(() => undefined));
      }
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-lg font-semibold text-anthracite">
            <Camera className="h-5 w-5" /> Scanner de code-barres
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-anthracite transition hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[360px] bg-black">
          {error ? (
            <div className="flex h-80 items-center justify-center p-8 text-center text-sm text-danger">
              {error}
            </div>
          ) : (
            <div id="barcode-scanner" ref={containerRef} className="h-[360px] w-full" />
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-4 text-sm text-anthracite/80">
          Pointez la caméra vers le code-barres du produit. Si le produit existe, il sera ajouté automatiquement au panier.
        </div>
      </div>
    </div>
  );
}
