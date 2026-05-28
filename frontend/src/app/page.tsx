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

  if (isLoading || !user) return null;

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
