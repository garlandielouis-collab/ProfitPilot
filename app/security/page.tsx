'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { listLoginSessions, revokeSession, getSecuritySettings } from '../actions/security';
import type { LoginSession, SecuritySettings } from '../actions/security';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)   return 'À l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const DEVICE_ICON: Record<string, string> = {
  mobile: '📱',
  tablet: '📟',
  desktop: '💻',
};

const BROWSER_ICON: Record<string, string> = {
  Chrome: '🌐',
  Firefox: '🦊',
  Safari: '🧭',
  Edge: '🔷',
  Opera: '🅾️',
  Autre: '🌐',
  Inconnu: '🌐',
};

// ── 2FA Section ───────────────────────────────────────────────────────────────

function TwoFactorSection({ settings, onRefresh }: { settings: SecuritySettings; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string; uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function startEnroll() {
    setLoading(true);
    setVerifyError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error || !data) { setVerifyError(error?.message ?? 'Erreur'); setLoading(false); return; }
      setEnrollData({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
      // Create challenge immediately
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (chErr || !ch) { setVerifyError(chErr?.message ?? 'Erreur challenge'); setLoading(false); return; }
      setChallengeId(ch.id);
    } catch (e: any) {
      setVerifyError(e.message ?? 'Erreur');
    }
    setLoading(false);
  }

  async function verifyEnroll() {
    if (!enrollData || !challengeId) return;
    setLoading(true);
    setVerifyError('');
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: enrollData.factorId,
        challengeId,
        code: verifyCode.replace(/\s/g, ''),
      });
      if (error) { setVerifyError(error.message); setLoading(false); return; }
      showToast('✅ 2FA activé avec succès !');
      setEnrollData(null);
      setChallengeId(null);
      setVerifyCode('');
      onRefresh();
    } catch (e: any) {
      setVerifyError(e.message ?? 'Erreur');
    }
    setLoading(false);
  }

  async function disable2FA() {
    if (!settings.factorId) return;
    setDisabling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: settings.factorId });
      if (error) { showToast('❌ ' + error.message); setDisabling(false); return; }
      showToast('2FA désactivé.');
      onRefresh();
    } catch (e: any) {
      showToast('❌ ' + (e.message ?? 'Erreur'));
    }
    setDisabling(false);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      {toast && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          {toast}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Authentification à deux facteurs (2FA)</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Sécurisez votre compte avec une application TOTP (Google Authenticator, Authy, etc.)
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
          settings.mfaEnabled
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${settings.mfaEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {settings.mfaEnabled ? 'Activé' : 'Désactivé'}
        </span>
      </div>

      {settings.mfaEnabled && !enrollData && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <span className="text-2xl">🔐</span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">2FA actif sur ce compte</p>
              <p className="text-xs text-emerald-600">Un code TOTP sera demandé à chaque connexion.</p>
            </div>
          </div>
          <button
            onClick={disable2FA}
            disabled={disabling}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
          >
            {disabling ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-600" /> : '🗑️'}
            Désactiver la 2FA
          </button>
        </div>
      )}

      {!settings.mfaEnabled && !enrollData && (
        <button
          onClick={startEnroll}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#001F3F]/80 disabled:opacity-60"
        >
          {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : '🔒'}
          Activer la 2FA
        </button>
      )}

      {enrollData && (
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">Instructions :</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Ouvrez Google Authenticator, Authy ou une application TOTP compatible</li>
              <li>Scannez le QR code ci-dessous (ou entrez le code manuellement)</li>
              <li>Saisissez le code à 6 chiffres généré par l'application</li>
            </ol>
          </div>

          <div className="flex flex-col items-center gap-4">
            {/* QR Code SVG from Supabase */}
            <div
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              dangerouslySetInnerHTML={{ __html: enrollData.qrCode }}
              style={{ width: 200, height: 200 }}
            />

            <div className="w-full max-w-sm">
              <p className="mb-1 text-xs text-slate-500 font-medium">Code secret (si scan impossible) :</p>
              <code className="block w-full rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-mono tracking-widest text-slate-700 select-all">
                {enrollData.secret}
              </code>
            </div>
          </div>

          <div className="flex flex-col gap-3 max-w-sm">
            <label className="text-sm font-semibold text-slate-700">Code de vérification</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="rounded-xl border border-slate-200 px-4 py-3 text-center text-lg font-mono tracking-widest focus:border-[#001F3F] focus:outline-none focus:ring-2 focus:ring-[#001F3F]/10"
            />
            {verifyError && <p className="text-xs text-red-600">{verifyError}</p>}
            <div className="flex gap-2">
              <button
                onClick={verifyEnroll}
                disabled={loading || verifyCode.length < 6}
                className="flex-1 rounded-xl bg-[#001F3F] py-2.5 text-sm font-semibold text-white transition hover:bg-[#001F3F]/80 disabled:opacity-60"
              >
                {loading ? 'Vérification…' : 'Confirmer'}
              </button>
              <button
                onClick={() => { setEnrollData(null); setChallengeId(null); setVerifyCode(''); setVerifyError(''); }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [sessions, setSessions]       = useState<LoginSession[]>([]);
  const [settings, setSettings]       = useState<SecuritySettings | null>(null);
  const [loading, setLoading]         = useState(true);
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(false);
  const [revoking, setRevoking]       = useState<string | null>(null);
  const [toast, setToast]             = useState('');

  const LIMIT = 15;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async (newOffset = 0) => {
    setLoading(true);
    const [sess, sec] = await Promise.all([
      listLoginSessions({ limit: LIMIT + 1, offset: newOffset }),
      getSecuritySettings(),
    ]);
    const hasMoreItems = sess.length > LIMIT;
    setSessions(sess.slice(0, LIMIT));
    setSettings(sec);
    setHasMore(hasMoreItems);
    setOffset(newOffset);
    setLoading(false);
  }, []);

  useEffect(() => { load(0); }, [load]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    const res = await revokeSession(id);
    if (res.error) {
      showToast('❌ ' + res.error);
    } else {
      showToast('Session révoquée.');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, revokedAt: new Date().toISOString() } : s));
    }
    setRevoking(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#001F3F] text-white text-lg">
            🔐
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Sécurité</h1>
            <p className="text-sm text-slate-500">Connexions récentes et authentification à deux facteurs</p>
          </div>
        </div>

        {toast && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            {toast}
          </div>
        )}

        {/* 2FA */}
        {settings && (
          <TwoFactorSection settings={settings} onRefresh={() => load(offset)} />
        )}

        {/* Sessions */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-bold text-slate-800">Historique des connexions</h2>
            <button
              onClick={() => load(0)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Actualiser
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Aucune connexion enregistrée
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-4 px-6 py-4">
                  {/* Device icon */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                    {DEVICE_ICON[s.deviceType ?? 'desktop'] ?? '💻'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">
                        {BROWSER_ICON[s.browser ?? 'Inconnu']} {s.browser ?? 'Navigateur inconnu'}
                      </span>
                      {s.os && (
                        <span className="text-xs text-slate-400">· {s.os}</span>
                      )}
                      {s.revokedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                          Révoqué
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      <span title={formatDate(s.createdAt)}>🕐 {relDate(s.createdAt)}</span>
                      {s.ip && <span>📍 {s.ip}</span>}
                      {s.country && <span>🌍 {s.country}</span>}
                    </div>
                  </div>

                  {/* Revoke */}
                  {!s.revokedAt && (
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revoking === s.id}
                      className="flex-shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      {revoking === s.id
                        ? <span className="inline-block h-3 w-3 animate-spin rounded-full border border-red-300 border-t-red-600" />
                        : 'Révoquer'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {(offset > 0 || hasMore) && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
              <button
                onClick={() => load(Math.max(0, offset - LIMIT))}
                disabled={offset === 0 || loading}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Précédent
              </button>
              <button
                onClick={() => load(offset + LIMIT)}
                disabled={!hasMore || loading}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>

        {/* Security tips */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h3 className="mb-2 text-sm font-bold text-blue-800">💡 Conseils de sécurité</h3>
          <ul className="space-y-1.5 text-xs text-blue-700">
            <li>• Activez la 2FA pour une protection maximale de votre compte</li>
            <li>• Si vous reconnaissez pas une connexion, révoquez-la immédiatement</li>
            <li>• Utilisez un mot de passe unique et fort pour ce compte</li>
            <li>• Ne partagez jamais vos identifiants de connexion</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
