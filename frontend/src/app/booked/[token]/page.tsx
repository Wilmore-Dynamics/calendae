'use client';

import { useState, useEffect, use } from 'react';
import * as api from '@/lib/api';

export default function BookingManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [booking, setBooking] = useState<api.Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    fetch(`/api/bookings/manage/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setBooking)
      .catch(() => setError('Réservation introuvable'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!confirm('Êtes-vous sûr de vouloir annuler ce rendez-vous ?')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/bookings/manage/${token}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setCancelled(true);
      notify('Rendez-vous annulé');
    } catch {
      notify("Erreur lors de l'annulation");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="max-w-lg mx-auto px-6 py-20 text-center text-neutral-400">Chargement...</div>;
  if (error) return <div className="max-w-lg mx-auto px-6 py-20 text-center text-neutral-500">{error}</div>;
  if (!booking) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (cancelled || booking.status === 'cancelled') {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✕</span>
        </div>
        <h1 className="text-xl font-medium mb-2">Rendez-vous annulé</h1>
        <p className="text-neutral-500">Ce rendez-vous a été annulé. Vous pouvez en reprendre un nouveau.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="border border-neutral-200 rounded-sm p-8 bg-white text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-pastel-green flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✓</span>
        </div>
        <h1 className="text-xl font-medium mb-2">Rendez-vous confirmé</h1>
        {booking.event_type_title && (
          <p className="text-sm text-neutral-500 mb-4">{booking.event_type_title}</p>
        )}
        <p className="font-medium">{formatDate(booking.start_time)}</p>
        <p className="text-sm text-neutral-400 mt-1">
          {formatTime(booking.start_time)} — {formatTime(booking.end_time)}
        </p>
        {booking.video_conference_url && (
          <a href={booking.video_conference_url} target="_blank" className="mt-4 inline-block px-6 py-2.5 text-sm bg-neutral-900 text-white rounded-sm hover:bg-black transition-colors">
            Rejoindre la visioconférence
          </a>
        )}
        <div className="mt-6 text-sm text-neutral-400 space-y-1">
          <p>{booking.booker_name}</p>
          <p>{booking.booker_email}</p>
          {booking.booker_phone && <p>{booking.booker_phone}</p>}
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <a
          href={`/${booking.event_type_id ? window.location.pathname.split('/booked/')[0].split('/').slice(0, -1).join('/') || '/' : '/'}`}
          className="px-6 py-2.5 text-sm border border-neutral-200 rounded-sm hover:bg-neutral-100 transition-colors"
        >
          Reporter
        </a>
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="px-6 py-2.5 text-sm border border-red-200 text-red-600 rounded-sm hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {cancelling ? 'Annulation...' : 'Annuler ce rendez-vous'}
        </button>
      </div>

      {notification && (
        <div className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm z-50">
          {notification}
        </div>
      )}
    </div>
  );
}
