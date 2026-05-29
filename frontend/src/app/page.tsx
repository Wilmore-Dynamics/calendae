'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Calendar from '@/components/Calendar';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/auth/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) return null;
  if (!user) return null;
  if (!user.company_id) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-medium mb-3">Bienvenue sur Calendae</h1>
        <p className="text-neutral-500 mb-6 max-w-sm">
          Vous n&apos;êtes rattaché à aucune entreprise. Si vous avez reçu une invitation, vérifiez vos emails. Sinon, créez votre propre espace de travail.
        </p>
        <button onClick={() => router.push('/setup')} className="bg-neutral-900 text-white px-6 py-2.5 rounded-sm text-sm hover:bg-black transition-colors">
          Créer mon entreprise
        </button>
      </div>
    );
  }

  return (
    <div className="bg-sand-cream min-h-screen p-8 max-w-7xl mx-auto">
      <section className="mb-8">
        <h1 className="text-5xl font-medium tracking-tight mb-2">
          Le calendrier souverain.
        </h1>
        <p className="text-neutral-500">
          Connecté en tant que {user.email}
        </p>
      </section>
      <Calendar />
    </div>
  );
}
