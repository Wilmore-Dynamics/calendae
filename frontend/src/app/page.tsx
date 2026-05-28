'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from '@/components/Calendar';
import { API_BASE } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/setup/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.setup_required) {
          router.replace('/setup');
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) return null;

  return (
    <div className="bg-sand-cream min-h-screen p-8 max-w-7xl mx-auto">
      <section>
        <h1 className="text-5xl font-medium tracking-tight mb-16">
          Le calendrier souverain.
        </h1>
      </section>
      <Calendar />
    </div>
  );
}
