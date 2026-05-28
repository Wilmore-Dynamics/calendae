'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import { API_BASE } from '@/lib/api';

export default function SetupPage() {
  const router = useRouter();
  const { login: authLogin } = useAuth();
  const [checking, setChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/setup/status`)
      .then((r) => r.json())
      .then((data) => {
        setSetupRequired(data.setup_required);
        setChecking(false);
        if (!data.setup_required) router.push('/');
      })
      .catch(() => {
        setChecking(false);
        setSetupRequired(true);
      });
  }, [router]);

  const suggestSlug = (name: string) => {
    setCompanyName(name);
    if (slugManuallyEdited) return;
    setCompanySlug(
      name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !companySlug || !email || !password) return;

    setSubmitting(true);
    setError(null);

    const params = new URLSearchParams({ company_name: companyName, company_slug: companySlug });
    try {
      const res = await fetch(`${API_BASE}/api/setup?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'Erreur lors de la configuration');
      }

      const data: api.TokenResponse = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      await authLogin(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-sand-cream flex items-center justify-center">
        <p className="text-neutral-400">Vérification...</p>
      </div>
    );
  }

  if (!setupRequired) return null;

  return (
    <div className="min-h-screen bg-sand-cream flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-medium tracking-tight mb-2">Bienvenue sur Calendae</h1>
          <p className="text-neutral-500 text-sm">Configurez votre espace de travail pour commencer.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-neutral-200 rounded-sm p-8">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Nom de l&apos;entreprise</label>
            <input
              value={companyName}
              onChange={(e) => suggestSlug(e.target.value)}
              className="border border-neutral-200 px-4 py-2.5 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
              placeholder="Ma Super Entreprise"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Identifiant (slug)</label>
            <input
              value={companySlug}
              onChange={(e) => {
                setCompanySlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              className="border border-neutral-200 px-4 py-2.5 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors font-mono text-sm"
              placeholder="mon-entreprise"
              required
            />
          </div>

          <hr className="border-neutral-100" />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Votre email (admin)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-neutral-200 px-4 py-2.5 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
              placeholder="admin@exemple.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-neutral-200 px-4 py-2.5 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Votre nom (optionnel)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border border-neutral-200 px-4 py-2.5 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
              placeholder="Jean Dupont"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-sm px-4 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-neutral-900 text-white py-3 rounded-sm font-medium hover:bg-black transition-colors disabled:opacity-50"
          >
            {submitting ? 'Configuration...' : 'Créer mon espace'}
          </button>
        </form>
      </div>
    </div>
  );
}
