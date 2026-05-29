'use client';

import { useState, useEffect } from 'react';
import * as api from '@/lib/api';
import { useFeatures } from '@/lib/features';

const COLORS = ['#B8D4E3', '#C5DBCA', '#E8C4D0', '#D4C4E8', '#E8E0C4', '#E8D0C4'];

export default function EventTypesPage() {
  const features = useFeatures();
  const [types, setTypes] = useState<api.EventType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [color, setColor] = useState(COLORS[0]);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(0);
  const [minNotice, setMinNotice] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState(0);
  const [assignmentType, setAssignmentType] = useState('single');
  const [priceAmount, setPriceAmount] = useState(0);
  const [priceCurrency, setPriceCurrency] = useState('eur');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<api.FieldDef[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const load = () => {
    api.listEventTypes().then(setTypes).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setTitle('');
    setDescription('');
    setDuration(30);
    setColor(COLORS[0]);
    setBufferBefore(0);
    setBufferAfter(0);
    setMinNotice(0);
    setMaxPerDay(0);
    setAssignmentType('single');
    setPriceAmount(0);
    setPriceCurrency('eur');
    setCustomFields([]);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (t: api.EventType) => {
    setTitle(t.title);
    setDescription(t.description || '');
    setDuration(t.duration_minutes);
    setColor(t.color || COLORS[0]);
    setBufferBefore(t.buffer_before);
    setBufferAfter(t.buffer_after);
    setMinNotice(t.min_notice_minutes);
    setMaxPerDay(t.max_bookings_per_day);
    setAssignmentType(t.assignment_type);
    setPriceAmount(t.price_amount || 0);
    setPriceCurrency(t.price_currency);
    setCustomFields(t.custom_fields || []);
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    try {
      const data = {
        title,
        description: description || undefined,
        duration_minutes: duration,
        color,
        buffer_before: bufferBefore,
        buffer_after: bufferAfter,
        min_notice_minutes: minNotice,
        max_bookings_per_day: maxPerDay,
        assignment_type: assignmentType,
        price_amount: features.payments ? priceAmount : undefined,
        price_currency: priceCurrency,
        custom_fields: customFields.length > 0 ? customFields : undefined,
      };
      if (editingId) {
        await api.updateEventType(editingId, data);
        notify('Type de rendez-vous mis à jour');
      } else {
        await api.createEventType(data);
        notify('Type de rendez-vous créé');
      }
      setShowForm(false);
      load();
    } catch {
      notify('Erreur');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce type de rendez-vous ?')) return;
    try {
      await api.deleteEventType(id);
      notify('Supprimé');
      load();
    } catch {
      notify('Erreur');
    }
  };

  const hasAdvanced = features.buffer_times || features.min_notice || features.max_bookings || features.round_robin || features.collective || features.payments;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">Types de rendez-vous</h1>
        <button onClick={openNew} className="bg-neutral-900 text-white px-4 py-2 rounded-sm text-sm hover:bg-black transition-colors">
          + Nouveau
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border border-neutral-200 rounded-sm p-5 bg-white mb-6 space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" autoFocus required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Durée (minutes)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} min={5} step={5} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-32" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Couleur</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-neutral-900 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {(features.round_robin || features.collective) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-500">Type d&apos;assignation</label>
              <select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors bg-white">
                <option value="single">Assigné à un collaborateur</option>
                {features.round_robin && <option value="round_robin">Round-robin (distribution auto)</option>}
                {features.collective && <option value="collective">Collectif (tous disponibles)</option>}
              </select>
            </div>
          )}

          {features.buffer_times && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-500">Tampon avant (min)</label>
                <input type="number" value={bufferBefore} onChange={(e) => setBufferBefore(Number(e.target.value))} min={0} step={5} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-32" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-500">Tampon après (min)</label>
                <input type="number" value={bufferAfter} onChange={(e) => setBufferAfter(Number(e.target.value))} min={0} step={5} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-32" />
              </div>
            </div>
          )}

          {features.min_notice && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-500">Délai de prévenance (minutes)</label>
              <input type="number" value={minNotice} onChange={(e) => setMinNotice(Number(e.target.value))} min={0} step={5} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-32" />
            </div>
          )}

          {features.max_bookings && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-500">Max réservations par jour (0 = illimité)</label>
              <input type="number" value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} min={0} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-32" />
            </div>
          )}

          {features.payments && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-500">Prix (en centimes)</label>
                <input type="number" value={priceAmount} onChange={(e) => setPriceAmount(Number(e.target.value))} min={0} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors w-32" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-500">Devise</label>
                <select value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors bg-white">
                  <option value="eur">EUR</option>
                  <option value="usd">USD</option>
                </select>
              </div>
            </div>
          )}

          <div className="border-t border-neutral-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-neutral-700">Champs personnalisés (formulaires)</label>
              <button type="button" onClick={() => setCustomFields([...customFields, { id: crypto.randomUUID(), label: '', type: 'text', required: false }])} className="text-xs text-neutral-500 hover:text-black transition-colors">
                + Ajouter un champ
              </button>
            </div>
            {customFields.length === 0 && <p className="text-xs text-neutral-400">Aucun champ personnalisé. Les visiteurs ne verront que le formulaire de réservation par défaut.</p>}
            <div className="space-y-3">
              {customFields.map((field, i) => (
                <div key={field.id} className="border border-neutral-200 rounded-sm p-3 bg-neutral-50 grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <input value={field.label} onChange={(e) => { const f = [...customFields]; f[i] = { ...f[i], label: e.target.value }; setCustomFields(f); }} placeholder="Label du champ" className="w-full border border-neutral-200 px-2 py-1.5 text-xs rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                  </div>
                  <div className="col-span-3">
                    <select value={field.type} onChange={(e) => { const f = [...customFields]; f[i] = { ...f[i], type: e.target.value as api.FieldDef['type'], options: e.target.value === 'select' || e.target.value === 'radio' || e.target.value === 'checkbox' ? f[i].options || [''] : undefined }; setCustomFields(f); }} className="w-full border border-neutral-200 px-2 py-1.5 text-xs rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors bg-white">
                      <option value="text">Texte</option>
                      <option value="textarea">Zone de texte</option>
                      <option value="select">Sélection</option>
                      <option value="radio">Choix unique</option>
                      <option value="checkbox">Cases à cocher</option>
                      <option value="phone">Téléphone</option>
                      <option value="number">Nombre</option>
                    </select>
                  </div>
                  <div className="col-span-4 flex items-center gap-2">
                    {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                      <input value={field.options?.join(', ') || ''} onChange={(e) => { const f = [...customFields]; f[i] = { ...f[i], options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCustomFields(f); }} placeholder="Options (séparées par des virgules)" className="w-full border border-neutral-200 px-2 py-1.5 text-xs rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                    )}
                  </div>
                  <div className="col-span-1 flex items-center gap-1">
                    <label className="text-xs text-neutral-400 flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={!!field.required} onChange={(e) => { const f = [...customFields]; f[i] = { ...f[i], required: e.target.checked }; setCustomFields(f); }} className="w-3 h-3" />
                      Oblig.
                    </label>
                    <button type="button" onClick={() => setCustomFields(customFields.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 transition-colors text-xs ml-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="bg-neutral-900 text-white px-6 py-2 rounded-sm text-sm hover:bg-black transition-colors">{editingId ? 'Enregistrer' : 'Créer'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-neutral-200 px-6 py-2 rounded-sm text-sm hover:bg-neutral-100 transition-colors">Annuler</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {types.map((t) => {
          const tags: string[] = [];
          if (t.buffer_before || t.buffer_after) tags.push(`Tampon ${t.buffer_before}/${t.buffer_after}min`);
          if (t.min_notice_minutes) tags.push(`${t.min_notice_minutes}min prévenance`);
          if (t.max_bookings_per_day) tags.push(`Max ${t.max_bookings_per_day}/jour`);
          if (t.assignment_type === 'round_robin') tags.push('Round-robin');
          if (t.assignment_type === 'collective') tags.push('Collectif');
          if (t.price_amount) tags.push(`${(t.price_amount / 100).toFixed(2)} ${t.price_currency.toUpperCase()}`);
          if (t.custom_fields && t.custom_fields.length > 0) tags.push(`${t.custom_fields.length} champ${t.custom_fields.length > 1 ? 's' : ''} formulaire`);

          return (
            <div key={t.id} className="border border-neutral-200 rounded-sm p-4 bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color || COLORS[0] }} />
                <div>
                  <p className="font-medium text-sm">{t.title}</p>
                  <p className="text-xs text-neutral-400">{t.duration_minutes} min{t.description ? ` — ${t.description}` : ''}</p>
                  {tags.length > 0 && <p className="text-xs text-neutral-300 mt-0.5">{tags.join(' · ')}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(t)} className="text-xs text-neutral-500 hover:text-black transition-colors">Modifier</button>
                <button onClick={() => handleDelete(t.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Supprimer</button>
              </div>
            </div>
          );
        })}
        {types.length === 0 && !showForm && (
          <p className="text-neutral-400 text-sm py-8 text-center">Aucun type de rendez-vous. Créez-en un !</p>
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
