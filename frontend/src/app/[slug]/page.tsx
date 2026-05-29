'use client';

import { useState, useEffect, use } from 'react';
import * as api from '@/lib/api';
import Avatar from '@/components/Avatar';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [profile, setProfile] = useState<api.PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<api.EventType | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [bookerName, setBookerName] = useState('');
  const [bookerEmail, setBookerEmail] = useState('');
  const [bookerPhone, setBookerPhone] = useState('');
  const [booking, setBooking] = useState<api.Booking | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    api.getPublicProfile(slug)
      .then(setProfile)
      .catch(() => setError('Page non trouvée'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!selectedType || !selectedDate) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    api.getAvailableSlots(slug, selectedDate)
      .then((data) => setSlots(data.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
    }, [selectedType, selectedDate, slug]);

  const handleBook = async () => {
    if (!selectedType || !selectedSlot) return;
    const start = new Date(selectedSlot);
    const end = new Date(start.getTime() + selectedType.duration_minutes * 60000);
    setSubmitting(true);
    try {
      const result = await api.createBooking(slug, {
        event_type_id: selectedType.id,
        booker_name: bookerName,
        booker_email: bookerEmail,
        booker_phone: bookerPhone || undefined,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      setBooking(result);
      notify('Rendez-vous confirmé !');
    } catch {
      notify('Erreur lors de la réservation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="max-w-lg mx-auto px-6 py-20 text-center text-neutral-400">Chargement...</div>;
  if (error) return <div className="max-w-lg mx-auto px-6 py-20 text-center text-neutral-500">{error}</div>;
  if (!profile) return null;

  const brandColor = profile.company.brand_color || '#B8D4E3';

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      {/* Company header */}
      <div className="text-center mb-10">
        {profile.company.logo_url && (
          <img src={profile.company.logo_url} alt={profile.company.name} className="h-10 mx-auto mb-4 object-contain" />
        )}
        <div className="flex items-center justify-center gap-3 mb-2">
          <Avatar name={profile.user.display_name} url={profile.user.avatar_url} size="lg" />
          <div className="text-left">
            <h1 className="text-xl font-medium">{profile.user.display_name}</h1>
            <p className="text-sm text-neutral-500">{profile.company.name}</p>
          </div>
        </div>
      </div>

      {booking ? (
        <div className="border border-neutral-200 rounded-sm p-8 bg-white text-center">
          <div className="w-16 h-16 rounded-full bg-pastel-green flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-medium mb-2">Rendez-vous confirmé</h2>
          <p className="text-neutral-500 mb-4">
            {new Date(booking.start_time).toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
          <p className="text-sm text-neutral-400 mb-6">
            {new Date(booking.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} —{' '}
            {new Date(booking.end_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          {booking.manage_token && (
            <a
              href={`/booked/${booking.manage_token}`}
              className="text-sm text-neutral-900 underline hover:text-neutral-600"
            >
              Gérer ce rendez-vous (annulation, report)
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Step 1: Choose event type */}
          <div className="mb-8">
            <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wider">1. Type de rendez-vous</h2>
            <div className="space-y-2">
              {profile.event_types.map((et) => (
                <button
                  key={et.id}
                  onClick={() => { setSelectedType(et); setSelectedSlot(null); }}
                  className={`w-full text-left border rounded-sm p-4 transition-all ${
                    selectedType?.id === et.id
                      ? 'border-neutral-900 bg-white shadow-sm'
                      : 'border-neutral-200 bg-white/50 hover:bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: et.color || brandColor }} />
                    <div>
                      <p className="font-medium text-sm">{et.title}</p>
                      <p className="text-xs text-neutral-400">{et.duration_minutes} min</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedType && (
            <>
              {/* Step 2: Pick date */}
              <div className="mb-8">
                <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wider">2. Date</h2>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                  min={todayString()}
                  className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-full"
                />
              </div>

              {/* Step 3: Pick time */}
              <div className="mb-8">
                <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wider">3. Créneau</h2>
                {loadingSlots ? (
                  <p className="text-sm text-neutral-400">Chargement des créneaux...</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-neutral-400">Aucun créneau disponible pour cette date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => {
                      const time = new Date(slot).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <button
                          key={slot}
                          onClick={() => setSelectedSlot(slot)}
                          className={`border rounded-sm py-2.5 text-sm transition-all ${
                            selectedSlot === slot
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-200 hover:border-neutral-400'
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedSlot && (
                <>
                  {/* Step 4: Your info */}
                  <div className="mb-8">
                    <h2 className="text-sm font-medium text-neutral-500 mb-3 uppercase tracking-wider">4. Vos informations</h2>
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-neutral-400">Nom</label>
                        <input value={bookerName} onChange={(e) => setBookerName(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-neutral-400">Email</label>
                        <input type="email" value={bookerEmail} onChange={(e) => setBookerEmail(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-neutral-400">Téléphone (optionnel)</label>
                        <input type="tel" value={bookerPhone} onChange={(e) => setBookerPhone(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleBook}
                    disabled={submitting || !bookerName || !bookerEmail}
                    className="w-full bg-neutral-900 text-white py-3 rounded-sm font-medium hover:bg-black transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Réservation...' : 'Confirmer le rendez-vous'}
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}

      {notification && (
        <div className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm z-50">
          {notification}
        </div>
      )}
    </div>
  );
}
