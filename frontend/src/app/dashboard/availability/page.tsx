'use client';

import { useState, useEffect } from 'react';
import * as api from '@/lib/api';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function AvailabilityPage() {
  const [availabilities, setAvailabilities] = useState<api.Availability[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const load = () => {
    api.listAvailabilities().then(setAvailabilities).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const addSlot = async (day: number) => {
    try {
      await api.createAvailability({
        day_of_week: day,
        start_time: '09:00',
        end_time: '17:00',
      });
      notify('Créneau ajouté');
      load();
    } catch {
      notify('Erreur');
    }
  };

  const updateSlot = async (id: string, day: number, field: 'start_time' | 'end_time', value: string) => {
    const slot = availabilities.find((a) => a.id === id);
    if (!slot) return;
    try {
      await api.updateAvailability(id, {
        day_of_week: day,
        start_time: field === 'start_time' ? value : slot.start_time,
        end_time: field === 'end_time' ? value : slot.end_time,
      });
      load();
    } catch {
      notify('Erreur');
    }
  };

  const removeSlot = async (id: string) => {
    try {
      await api.deleteAvailability(id);
      notify('Créneau supprimé');
      load();
    } catch {
      notify('Erreur');
    }
  };

  const byDay = DAYS.map((_, i) => availabilities.filter((a) => a.day_of_week === i));

  return (
    <div>
      <h1 className="text-2xl font-medium mb-6">Disponibilités</h1>
      <p className="text-sm text-neutral-500 mb-8">Définissez vos créneaux de disponibilité pour les rendez-vous.</p>

      <div className="space-y-4">
        {DAYS.map((day, i) => {
          const slots = byDay[i];
          return (
            <div key={i} className="border border-neutral-200 rounded-sm p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-sm">{day}</span>
                <button
                  onClick={() => addSlot(i)}
                  className="text-xs text-neutral-500 hover:text-black transition-colors border border-neutral-200 px-3 py-1 rounded-sm"
                >
                  + Ajouter
                </button>
              </div>
              {slots.length === 0 ? (
                <p className="text-xs text-neutral-300">Pas de créneau</p>
              ) : (
                <div className="space-y-2">
                  {slots.map((s) => (
                    <div key={s.id} className="flex items-center gap-3">
                      <input
                        type="time"
                        value={s.start_time.slice(0, 5)}
                        onChange={(e) => updateSlot(s.id, i, 'start_time', e.target.value + ':00')}
                        className="border border-neutral-200 px-3 py-1.5 rounded-sm text-sm"
                      />
                      <span className="text-xs text-neutral-400">à</span>
                      <input
                        type="time"
                        value={s.end_time.slice(0, 5)}
                        onChange={(e) => updateSlot(s.id, i, 'end_time', e.target.value + ':00')}
                        className="border border-neutral-200 px-3 py-1.5 rounded-sm text-sm"
                      />
                      <button
                        onClick={() => removeSlot(s.id)}
                        className="text-xs text-red-400 hover:text-red-600 ml-2 transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {notification && (
        <div className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm z-50">
          {notification}
        </div>
      )}
    </div>
  );
}
