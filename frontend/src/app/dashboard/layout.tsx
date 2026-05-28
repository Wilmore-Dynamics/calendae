'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { CalendarDays, Users, Settings, Clock, ListOrdered } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Vue d\'ensemble', icon: CalendarDays },
  { href: '/dashboard/event-types', label: 'Types de rendez-vous', icon: ListOrdered },
  { href: '/dashboard/availability', label: 'Disponibilités', icon: Clock },
  { href: '/dashboard/team', label: 'Équipe', icon: Users },
  { href: '/dashboard/settings', label: 'Paramètres', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {isLoading ? (
        <div className="text-center text-neutral-400 py-20">Chargement...</div>
      ) : !user ? (
        <div className="text-center py-20">
          <p className="text-neutral-500 mb-4">Connectez-vous pour accéder au tableau de bord.</p>
          <Link href="/auth/login" className="bg-neutral-900 text-white px-6 py-2 rounded-sm text-sm no-underline">
            Connexion
          </Link>
        </div>
      ) : !user.company_id && pathname !== '/dashboard/settings' && pathname !== '/dashboard' ? (
        <div className="text-center py-20">
          <p className="text-neutral-500 mb-4">Vous n&apos;avez pas encore d&apos;entreprise.</p>
          <Link href="/dashboard/settings" className="bg-neutral-900 text-white px-6 py-2 rounded-sm text-sm no-underline">
            Créer une entreprise
          </Link>
        </div>
      ) : (
        <div className="flex gap-8">
          <nav className="w-56 shrink-0 flex flex-col gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-sm text-sm no-underline transition-colors ${
                    active
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-black'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      )}
    </div>
  );
}
