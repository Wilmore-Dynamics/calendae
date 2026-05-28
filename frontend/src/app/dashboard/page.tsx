'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';
import Avatar from '@/components/Avatar';
import { CalendarDays, Users, Clock, ListOrdered } from 'lucide-react';

export default function DashboardHome() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [company, setCompany] = useState<api.Company | null>(null);
  const [members, setMembers] = useState<api.Member[]>([]);
  const [eventTypes, setEventTypes] = useState<api.EventType[]>([]);
  const [availabilities, setAvailabilities] = useState<api.Availability[]>([]);
  const [bookings, setBookings] = useState<api.Booking[]>([]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/auth/login');
  }, [user, isLoading, router]);

  useEffect(() => {
    api.getCompany().then(setCompany).catch(() => {});
    api.listMembers().then(setMembers).catch(() => {});
    api.listEventTypes().then(setEventTypes).catch(() => {});
    api.listAvailabilities().then(setAvailabilities).catch(() => {});
    api.listMyBookings().then(setBookings).catch(() => {});
  }, []);

  if (!company) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-medium mb-4">Bienvenue sur Calendae</h2>
        <p className="text-neutral-500 mb-8">Créez votre entreprise pour commencer à utiliser le tableau de bord.</p>
        <Link
          href="/dashboard/settings"
          className="bg-neutral-900 text-white px-8 py-3 rounded-sm text-sm no-underline inline-block"
        >
          Créer mon entreprise
        </Link>
      </div>
    );
  }

  const stats = [
    { label: 'Membres', value: members.length, icon: Users, color: 'bg-pastel-blue' },
    { label: 'Types de rendez-vous', value: eventTypes.length, icon: ListOrdered, color: 'bg-pastel-green' },
    { label: 'Disponibilités', value: availabilities.length, icon: Clock, color: 'bg-pastel-purple' },
    { label: 'Réservations', value: bookings.filter(b => b.status === 'confirmed').length, icon: CalendarDays, color: 'bg-pastel-pink' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-medium mb-2">{company.name}</h1>
      {user?.slug && (
        <p className="text-sm text-neutral-400 mb-8">
          Page de réservation publique :{' '}
          <a
            href={`/${user.slug}`}
            target="_blank"
            className="underline hover:text-neutral-700"
          >
            /{user.slug}
          </a>
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 mb-10">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="border border-neutral-200 rounded-sm p-5 bg-white">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full ${s.color} flex items-center justify-center`}>
                  <Icon size={18} />
                </div>
                <span className="text-2xl font-medium">{s.value}</span>
              </div>
              <p className="text-sm text-neutral-500">{s.label}</p>
            </div>
          );
        })}
      </div>

      {bookings.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-4">Dernières réservations</h2>
          <div className="space-y-2">
            {bookings.slice(0, 5).map((b) => (
              <div key={b.id} className="border border-neutral-200 rounded-sm p-4 bg-white flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{b.booker_name}</p>
                  <p className="text-xs text-neutral-400">
                    {new Date(b.start_time).toLocaleDateString('fr-FR')} {new Date(b.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${b.status === 'confirmed' ? 'bg-pastel-green text-green-800' : 'bg-neutral-100 text-neutral-400'}`}>
                  {b.status === 'confirmed' ? 'Confirmé' : 'Annulé'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
