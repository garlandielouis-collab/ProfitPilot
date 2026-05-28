'use client';

import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { Button } from './Button';
import { uploadProductImageAction } from '../app/actions/storage';

type ProductImageUploaderProps = {
  onUpload?: (url: string) => void;
};

export function ProductImageUploader({ onUpload }: ProductImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setUploadedUrl('');
    setStatus('idle');
    setMessage('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setMessage('Upload en cours...');

    try {
      const publicUrl = await uploadProductImageAction(file);
      setUploadedUrl(publicUrl);
      setStatus('success');
      setMessage('Image téléchargée avec succès.');
      onUpload?.(publicUrl);
    } catch (error) {
      setStatus('error');
      setMessage((error as Error)?.message ?? 'Erreur lors de l\'upload');
    }
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-anthracite">Upload d'image produit</h2>
        <p className="mt-1 text-sm text-anthracite/70">Importez une photo et récupérez l'URL stockée dans Supabase Storage.</p>
      </div>

      <div className="space-y-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-anthracite file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />

        {previewUrl ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <img src={previewUrl} alt="Preview produit" className="h-40 w-full object-cover" />
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" onClick={handleUpload} className={file ? 'bg-primary text-white' : 'bg-slate-200 text-anthracite cursor-not-allowed'} disabled={!file || status === 'uploading'}>
            {status === 'uploading' ? 'Téléversement...' : 'Uploader l\'image'}
          </Button>
        </div>

        {message ? (
          <div className={`rounded-3xl px-4 py-3 text-sm ${status === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
            {message}
          </div>
        ) : null}

        {uploadedUrl ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-anthracite">
            <p className="font-semibold text-anthracite">URL publique</p>
            <a href={uploadedUrl} target="_blank" rel="noreferrer" className="break-words text-primary hover:underline">
              {uploadedUrl}
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
