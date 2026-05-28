'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listEvents, createEvent, updateEvent, deleteEvent, type CalendaeEvent, type EventInput } from '@/lib/api';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const EVENT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-lime-500', 'bg-fuchsia-500',
];

function getEventColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

function toLocalDatetimeString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

interface EventForm {
  title: string;
  start_time: string;
  end_time: string;
}

const emptyForm: EventForm = { title: '', start_time: '', end_time: '' };

export default function Calendar() {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [events, setEvents] = useState<CalendaeEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendaeEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const fetchEvents = useCallback(async () => {
    const startOfMonth = new Date(viewYear, viewMonth, 1);
    const endOfMonth = new Date(viewYear, viewMonth + 1, 1);
    startOfMonth.setHours(0, 0, 0, 0);
    endOfMonth.setHours(0, 0, 0, 0);
    try {
      const data = await listEvents(startOfMonth.toISOString(), endOfMonth.toISOString());
      setEvents(data);
    } catch {
      // silent
    }
  }, [viewMonth, viewYear]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToday = () => {
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
  };

  const openCreateModal = (day?: number) => {
    const date = new Date(viewYear, viewMonth, day || 1);
    const defaultStart = new Date(date);
    defaultStart.setHours(9, 0, 0, 0);
    const defaultEnd = new Date(date);
    defaultEnd.setHours(10, 0, 0, 0);
    setForm({
      title: '',
      start_time: toLocalDatetimeString(defaultStart),
      end_time: toLocalDatetimeString(defaultEnd),
    });
    setEditingEvent(null);
    setModalOpen(true);
  };

  const openEditModal = (event: CalendaeEvent) => {
    setForm({
      title: event.title,
      start_time: toLocalDatetimeString(new Date(event.start_time)),
      end_time: toLocalDatetimeString(new Date(event.end_time)),
    });
    setEditingEvent(event);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.start_time || !form.end_time) return;
    const input: EventInput = {
      title: form.title,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
    };
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, input);
        notify('Événement mis à jour');
      } else {
        await createEvent(input);
        notify('Événement créé');
      }
      setModalOpen(false);
      setForm(emptyForm);
      fetchEvents();
    } catch {
      notify("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    try {
      await deleteEvent(editingEvent.id);
      notify('Événement supprimé');
      setModalOpen(false);
      setForm(emptyForm);
      setEditingEvent(null);
      fetchEvents();
    } catch {
      notify('Erreur lors de la suppression');
    }
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }
  while (days.length % 7 !== 0) {
    days.push(null);
  }

  const eventsByDay = new Map<number, CalendaeEvent[]>();
  events.forEach((ev) => {
    const d = new Date(ev.start_time);
    if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
      const day = d.getDate();
      if (!eventsByDay.has(day)) eventsByDay.set(day, []);
      eventsByDay.get(day)!.push(ev);
    }
  });

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const isCurrentMonth = viewMonth === today.getMonth() && viewYear === today.getFullYear();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-medium tracking-tight">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm border border-neutral-200 rounded-sm hover:bg-neutral-100 transition-colors"
          >
            Aujourd'hui
          </button>
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 text-sm border border-neutral-200 rounded-sm hover:bg-neutral-100 transition-colors"
          >
            ←
          </button>
          <button
            onClick={nextMonth}
            className="px-3 py-1.5 text-sm border border-neutral-200 rounded-sm hover:bg-neutral-100 transition-colors"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px border border-neutral-200 bg-neutral-100 rounded-sm overflow-hidden">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="bg-white px-3 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider"
          >
            {name}
          </div>
        ))}
        {weeks.flat().map((day, i) => {
          const isToday = isCurrentMonth && day === today.getDate();
          const isPadding = day === null;
          const dayEvents = day ? eventsByDay.get(day) || [] : [];
          const maxVisible = Math.min(dayEvents.length, 2);

          return (
            <div
              key={i}
              onClick={() => day && openCreateModal(day)}
              className={`min-h-[100px] bg-white p-1.5 cursor-pointer hover:bg-neutral-50 transition-colors ${
                isPadding ? 'text-neutral-300' : ''
              }`}
            >
              {day && (
                <>
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full ${
                      isToday ? 'bg-neutral-900 text-white' : ''
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, maxVisible).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(ev);
                        }}
                        className={`w-full text-left ${getEventColor(ev.title)} text-white text-[11px] px-1.5 py-0.5 rounded-sm truncate block hover:opacity-80 transition-opacity`}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayEvents.length > maxVisible && (
                      <span className="text-[11px] text-neutral-400 px-1">
                        +{dayEvents.length - maxVisible} autres
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-sm shadow-xl w-full max-w-md mx-4 p-6"
            >
              <h3 className="text-lg font-medium mb-4">
                {editingEvent ? "Modifier l'événement" : 'Nouvel événement'}
              </h3>
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="modal-title" className="text-sm text-neutral-500">Titre</label>
                  <input
                    id="modal-title"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="modal-start" className="text-sm text-neutral-500">Début</label>
                    <input
                      id="modal-start"
                      type="datetime-local"
                      value={form.start_time}
                      onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                      className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="modal-end" className="text-sm text-neutral-500">Fin</label>
                    <input
                      id="modal-end"
                      type="datetime-local"
                      value={form.end_time}
                      onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                      className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center mt-6">
                <div>
                  {editingEvent && (
                    <button
                      onClick={handleDelete}
                      className="text-red-500 text-sm hover:text-red-600 transition-colors"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setModalOpen(false);
                      setForm(emptyForm);
                      setEditingEvent(null);
                    }}
                    className="px-4 py-2 text-sm border border-neutral-200 rounded-sm hover:bg-neutral-100 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!form.title || !form.start_time || !form.end_time}
                    className="px-6 py-2 text-sm bg-neutral-900 text-white rounded-sm hover:bg-black transition-colors disabled:opacity-50"
                  >
                    {editingEvent ? 'Enregistrer' : 'Créer'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm z-50"
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
