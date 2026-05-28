'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(email, password, displayName || undefined);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur d'inscription");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-5">
        <h1 className="text-3xl font-medium tracking-tight">Créer un compte</h1>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-sm px-3 py-2">{error}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className="text-sm text-neutral-500">Nom (optionnel)</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border border-neutral-200 px-4 py-2 rounded-sm bg-white/50 focus:border-neutral-400 focus:ring-0 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm text-neutral-500">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-neutral-200 px-4 py-2 rounded-sm bg-white/50 focus:border-neutral-400 focus:ring-0 transition-colors"
            required
            autoComplete="email"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm text-neutral-500">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-neutral-200 px-4 py-2 rounded-sm bg-white/50 focus:border-neutral-400 focus:ring-0 transition-colors"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-neutral-900 text-white px-8 py-2 rounded-sm font-medium hover:bg-black transition-colors disabled:opacity-50 mt-2"
        >
          {submitting ? '...' : 'Créer mon compte'}
        </button>

        <p className="text-sm text-neutral-400 text-center">
          Déjà un compte ?{' '}
          <Link href="/auth/login" className="text-neutral-900 underline">Se connecter</Link>
        </p>
      </form>
    </div>
  );
}
