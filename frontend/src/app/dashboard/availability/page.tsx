'use client';

import { useState, useEffect } from 'react';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function AvailabilityPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [members, setMembers] = useState<api.Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const [availabilities, setAvailabilities] = useState<api.Availability[]>([]);
  const [daysOff, setDaysOff] = useState<api.DayOff[]>([]);
  const [newDayOff, setNewDayOff] = useState('');
  const [newDayOffReason, setNewDayOffReason] = useState('');

  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const targetUserId = selectedMember || user?.id;

  const loadAvailabilities = () => {
    if (!targetUserId) return;
    if (selectedMember && isAdmin) {
      fetch(`/api/companies/members/${selectedMember}/availability`)
        .then(r => r.ok ? r.json() : [])
        .then(setAvailabilities)
        .catch(() => {});
    } else {
      api.listAvailabilities().then(setAvailabilities).catch(() => {});
    }
  };

  const loadDaysOff = () => {
    if (!targetUserId) return;
    if (selectedMember && isAdmin) {
      fetch(`/api/companies/members/${selectedMember}/days-off`)
        .then(r => r.ok ? r.json() : [])
        .then(setDaysOff)
        .catch(() => {});
    } else {
      api.listMyDaysOff().then(setDaysOff).catch(() => {});
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/companies/members')
        .then(r => r.ok ? r.json() : [])
        .then(setMembers)
        .catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => { loadAvailabilities(); }, [targetUserId]);
  useEffect(() => { loadDaysOff(); }, [targetUserId]);

  const addSlot = async (day: number) => {
    try {
      if (selectedMember && isAdmin) {
        await fetch(`/api/companies/members/${selectedMember}/availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day_of_week: day, start_time: '09:00', end_time: '17:00' }),
        });
      } else {
        await api.createAvailability({ day_of_week: day, start_time: '09:00', end_time: '17:00' });
      }
      notify('Créneau ajouté');
      loadAvailabilities();
    } catch {
      notify('Erreur');
    }
  };

  const updateSlot = async (id: string, day: number, field: 'start_time' | 'end_time', value: string) => {
    const slot = availabilities.find((a) => a.id === id);
    if (!slot) return;
    try {
      if (selectedMember && isAdmin) {
        await fetch(`/api/companies/members/${selectedMember}/availability/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day_of_week: day, start_time: field === 'start_time' ? value : slot.start_time, end_time: field === 'end_time' ? value : slot.end_time }),
        });
      } else {
        await api.updateAvailability(id, { day_of_week: day, start_time: field === 'start_time' ? value : slot.start_time, end_time: field === 'end_time' ? value : slot.end_time });
      }
      loadAvailabilities();
    } catch {
      notify('Erreur');
    }
  };

  const removeSlot = async (id: string) => {
    try {
      if (selectedMember && isAdmin) {
        await fetch(`/api/companies/members/${selectedMember}/availability/${id}`, { method: 'DELETE' });
      } else {
        await api.deleteAvailability(id);
      }
      notify('Créneau supprimé');
      loadAvailabilities();
    } catch {
      notify('Erreur');
    }
  };

  const handleAddDayOff = async () => {
    if (!newDayOff) return;
    try {
      if (selectedMember && isAdmin) {
        await fetch(`/api/companies/members/${selectedMember}/days-off`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: newDayOff, reason: newDayOffReason || undefined }),
        });
      } else {
        await api.createDayOff(newDayOff, newDayOffReason || undefined);
      }
      notify('Jour ajouté');
      setNewDayOff('');
      setNewDayOffReason('');
      loadDaysOff();
    } catch {
      notify('Erreur');
    }
  };

  const handleRemoveDayOff = async (id: string) => {
    try {
      if (selectedMember && isAdmin) {
        await fetch(`/api/companies/members/${selectedMember}/days-off/${id}`, { method: 'DELETE' });
      } else {
        await api.deleteDayOff(id);
      }
      notify('Jour supprimé');
      loadDaysOff();
    } catch {
      notify('Erreur');
    }
  };

  const byDay = DAYS.map((_, i) => availabilities.filter((a) => a.day_of_week === i));

  return (
    <div>
      <h1 className="text-2xl font-medium mb-6">Disponibilités</h1>

      {isAdmin && members.length > 0 && (
        <div className="mb-6">
          <label className="text-sm text-neutral-500 block mb-1.5">Membre</label>
          <select
            value={selectedMember || ''}
            onChange={(e) => setSelectedMember(e.target.value || null)}
            className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors bg-white text-sm"
          >
            <option value="">Mes disponibilités</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.email}</option>
            ))}
          </select>
        </div>
      )}

      <p className="text-sm text-neutral-500 mb-8">Définissez les créneaux de disponibilité pour les rendez-vous.</p>

      <div className="space-y-4 mb-10">
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

      <h2 className="text-lg font-medium mb-4">Absences & jours non disponibles</h2>
      <p className="text-sm text-neutral-500 mb-4">Ajoutez des dates où vous (ou le membre) n'êtes pas disponible (congés, jours fériés...).</p>

      <div className="border border-neutral-200 rounded-sm p-4 bg-white mb-6">
        <div className="flex items-end gap-3 mb-4">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-neutral-400">Date</label>
            <input type="date" value={newDayOff} onChange={(e) => setNewDayOff(e.target.value)} className="border border-neutral-200 px-3 py-1.5 text-sm rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-neutral-400">Raison (optionnelle)</label>
            <input value={newDayOffReason} onChange={(e) => setNewDayOffReason(e.target.value)} className="border border-neutral-200 px-3 py-1.5 text-sm rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" placeholder="Congés, RTT..." />
          </div>
          <button onClick={handleAddDayOff} disabled={!newDayOff} className="bg-neutral-900 text-white px-4 py-1.5 text-sm rounded-sm hover:bg-black transition-colors disabled:opacity-50 shrink-0">
            Ajouter
          </button>
        </div>
        {daysOff.length === 0 ? (
          <p className="text-xs text-neutral-400">Aucune absence planifiée.</p>
        ) : (
          <div className="space-y-1.5">
            {daysOff.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm bg-neutral-50 rounded-sm px-3 py-2">
                <span>
                  {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {d.reason && <span className="text-neutral-400 ml-2">— {d.reason}</span>}
                </span>
                <button onClick={() => handleRemoveDayOff(d.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Supprimer</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {notification && (
        <div className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm z-50">
          {notification}
        </div>
      )}
    </div>
  );
}
