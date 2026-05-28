'use client';

import { useState, useEffect } from 'react';
import * as api from '@/lib/api';
import Avatar from '@/components/Avatar';

export default function TeamPage() {
  const [members, setMembers] = useState<api.Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const user = null; // will get from context

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const load = () => {
    api.listMembers().then(setMembers).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      await api.inviteMember(inviteEmail);
      notify('Invitation envoyée');
      setInviteEmail('');
      load();
    } catch {
      notify("Erreur lors de l'invitation");
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await api.updateMemberRole(memberId, role);
      notify('Rôle mis à jour');
      load();
    } catch {
      notify('Erreur');
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Retirer ce membre ?')) return;
    try {
      await api.removeMember(memberId);
      notify('Membre retiré');
      load();
    } catch {
      notify('Erreur');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-medium mb-6">Équipe</h1>

      <form onSubmit={handleInvite} className="flex items-end gap-3 mb-8">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-sm text-neutral-500">Inviter un membre par email</label>
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@exemple.com"
            className="border border-neutral-200 px-4 py-2 rounded-sm focus:border-neutral-400 focus:ring-0 transition-colors"
          />
        </div>
        <button className="bg-neutral-900 text-white px-6 py-2 rounded-sm text-sm hover:bg-black transition-colors whitespace-nowrap">
          Inviter
        </button>
      </form>

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="border border-neutral-200 rounded-sm p-4 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={m.display_name || m.email} url={m.avatar_url} />
              <div>
                <p className="font-medium text-sm">{m.display_name || m.email}</p>
                <p className="text-xs text-neutral-400">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={m.role}
                onChange={(e) => handleRoleChange(m.id, e.target.value)}
                className="border border-neutral-200 px-3 py-1.5 rounded-sm text-sm bg-white"
              >
                <option value="admin">Admin</option>
                <option value="collaborator">Collaborateur</option>
              </select>
              <button
                onClick={() => handleRemove(m.id)}
                className="text-sm text-red-400 hover:text-red-600 transition-colors"
              >
                Retirer
              </button>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-neutral-400 text-sm py-8 text-center">Aucun membre pour le moment.</p>
        )}
      </div>

      {notification && (
        <div className="fixed bottom-8 right-8 bg-neutral-900 text-white px-6 py-3 rounded-sm text-sm">
          {notification}
        </div>
      )}
    </div>
  );
}
