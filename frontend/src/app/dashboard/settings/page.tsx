'use client';

import { useState, useEffect } from 'react';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features';

export default function SettingsPage() {
  const features = useFeatures();
  const { user } = useAuth();
  const [company, setCompany] = useState<api.Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [reminderSms, setReminderSms] = useState(false);
  const [reminderEmail, setReminderEmail] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState(10);
  const [maxBookingsPerDay, setMaxBookingsPerDay] = useState(0);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarSyncing, setCalendarSyncing] = useState(false);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const isNew = !company;

  useEffect(() => {
    api.getCompany()
      .then((c) => {
        setCompany(c);
        setName(c.name);
        setSlug(c.slug);
        setCustomDomain(c.custom_domain || '');
        setBrandColor(c.brand_color || '');
        setLogoUrl(c.logo_url || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    if (user) {
      setDisplayName(user.display_name || '');
      setPhone(user.phone || '');
      setTimezone(user.timezone);
      setReminderSms(user.reminder_sms);
      setReminderEmail(user.reminder_email);
      setReminderMinutes(user.reminder_minutes);
      setMaxBookingsPerDay(user.max_bookings_per_day);
    }
  }, [user]);

  useEffect(() => {
    fetch('/api/auth/google/status')
      .then(r => r.json())
      .then(data => {
        setCalendarConnected(data.connected);
        setCalendarSyncing(data.sync_enabled);
      })
      .catch(() => {});
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const res = await fetch('/api/auth/google/authorize');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      notify('Erreur lors de la connexion Google Calendar');
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await fetch('/api/auth/google/disconnect', { method: 'POST' });
      setCalendarConnected(false);
      setCalendarSyncing(false);
      notify('Google Calendar déconnecté');
    } catch {
      notify('Erreur lors de la déconnexion');
    }
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isNew) {
        const c = await api.createCompany(name, slug);
        setCompany(c);
        notify('Entreprise créée');
      } else {
        await api.updateCompany({
          name: name || undefined,
          slug: slug || undefined,
          custom_domain: customDomain || undefined,
          brand_color: brandColor || undefined,
          logo_url: logoUrl || undefined,
          webhook_url: webhookUrl || undefined,
          stripe_publishable_key: stripePublishableKey || undefined,
          stripe_secret_key: stripeSecretKey || undefined,
          smtp_host: smtpHost || undefined,
          smtp_port: smtpPort || undefined,
          smtp_user: smtpUser || undefined,
          smtp_password: smtpPassword || undefined,
        });
        notify('Paramètres sauvegardés');
      }
    } catch {
      notify('Erreur');
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateMe({
        display_name: displayName || undefined,
        phone: phone || undefined,
        timezone: timezone || undefined,
        reminder_sms: reminderSms,
        reminder_email: reminderEmail,
        reminder_minutes: reminderMinutes,
        max_bookings_per_day: maxBookingsPerDay,
      });
      notify('Profil mis à jour');
    } catch {
      notify('Erreur');
    }
  };

  if (loading) return <div className="text-neutral-400 py-20 text-center">Chargement...</div>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-medium mb-8">Paramètres</h1>

      <form onSubmit={handleCompanySubmit} className="space-y-5 mb-12">
        <h2 className="text-lg font-medium border-b border-neutral-200 pb-2">
          {isNew ? 'Créer mon entreprise' : 'Entreprise'}
        </h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Nom</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Identifiant (slug)</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors font-mono text-sm" required placeholder="mon-entreprise" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Domaine personnalisé (optionnel)</label>
          <input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors font-mono text-sm" placeholder="rendez-vous.votre-entreprise.com" />
        </div>

        {!isNew && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-500">Couleur de marque</label>
              <div className="flex items-center gap-3">
                <input type="color" value={brandColor || '#B8D4E3'} onChange={(e) => setBrandColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                <span className="text-xs text-neutral-400">{brandColor || '#B8D4E3'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-500">URL du logo</label>
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" placeholder="https://..." />
            </div>

            {features.webhooks && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-500">Webhook URL</label>
                <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors font-mono text-sm" placeholder="https://votre-serveur.com/webhook" />
                <p className="text-xs text-neutral-400">Recevez les événements booking.created et booking.cancelled</p>
              </div>
            )}

            {features.payments && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-neutral-500">Clé publique Stripe</label>
                  <input value={stripePublishableKey} onChange={(e) => setStripePublishableKey(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors font-mono text-sm" placeholder="pk_live_..." />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-neutral-500">Clé secrète Stripe</label>
                  <input type="password" value={stripeSecretKey} onChange={(e) => setStripeSecretKey(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors font-mono text-sm" placeholder="sk_live_..." />
                </div>
              </>
            )}

            <div className="pt-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-3">Configuration SMTP</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-400">Hôte</label>
                  <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-400">Port</label>
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 mt-4">
                <label className="text-xs text-neutral-400">Utilisateur</label>
                <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
              </div>
              <div className="flex flex-col gap-1.5 mt-4">
                <label className="text-xs text-neutral-400">Mot de passe</label>
                <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
              </div>
            </div>

            <button className="bg-neutral-900 text-white px-6 py-2 rounded-sm text-sm hover:bg-black transition-colors">
              Sauvegarder
            </button>
          </>
        )}
      </form>

      <div className="space-y-5 mb-12">
        <h2 className="text-lg font-medium border-b border-neutral-200 pb-2">Calendrier</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {calendarConnected
                ? 'Connecté — les événements Google Calendar sont pris en compte comme occupés'
                : 'Connectez votre Google Calendar pour bloquer les créneaux déjà occupés'}
            </p>
          </div>
          {calendarConnected ? (
            <button onClick={handleDisconnectGoogle} className="px-4 py-2 text-sm border border-neutral-200 rounded-sm hover:bg-neutral-100 transition-colors">
              Déconnecter
            </button>
          ) : (
            <button onClick={handleConnectGoogle} className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-sm hover:bg-black transition-colors">
              Connecter
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleProfileSubmit} className="space-y-5">
        <h2 className="text-lg font-medium border-b border-neutral-200 pb-2">Mon profil</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Nom d&apos;affichage</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Téléphone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors" placeholder="+33612345678" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Fuseau horaire</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors bg-white">
            <option value="Europe/Paris">Europe/Paris (UTC+1/+2)</option>
            <option value="Europe/London">Europe/London (UTC+0/+1)</option>
            <option value="America/New_York">America/New_York (UTC-5/-4)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (UTC-8/-7)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
            <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
            <option value="Australia/Sydney">Australia/Sydney (UTC+10/+11)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm text-neutral-500">Rappels</label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reminderEmail} onChange={(e) => setReminderEmail(e.target.checked)} className="rounded border-neutral-300" />
            Rappel par email
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reminderSms} onChange={(e) => setReminderSms(e.target.checked)} className="rounded border-neutral-300" />
            Rappel par SMS
          </label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">Minutes avant :</span>
            <input type="number" value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))} className="border border-neutral-200 px-3 py-1.5 rounded-sm w-20 text-sm" min={1} />
          </div>
        </div>

        {features.max_bookings && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-500">Max réservations par jour (0 = illimité)</label>
            <input type="number" value={maxBookingsPerDay} onChange={(e) => setMaxBookingsPerDay(Number(e.target.value))} min={0} className="border border-neutral-200 px-3 py-1.5 rounded-sm w-24 text-sm" />
          </div>
        )}

        <button className="bg-neutral-900 text-white px-6 py-2 rounded-sm text-sm hover:bg-black transition-colors">
          Sauvegarder
        </button>
      </form>

      {notification && (
        <div className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm z-50">
          {notification}
        </div>
      )}
    </div>
  );
}
