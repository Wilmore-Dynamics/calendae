'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function EmbedPage() {
  const { user } = useAuth();
  const [brandColor, setBrandColor] = useState('#B8D4E3');

  if (!user) return null;

  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = user.slug || user.email.split('@')[0];

  const snippet = `<div id="calendae-embed"></div>
<script src="${base}/embed.js" data-slug="${slug}" data-brand-color="${brandColor.replace('#', '')}"></script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      alert('Copié !');
    } catch {
      const el = document.createElement('textarea');
      el.value = snippet;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      alert('Copié !');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-medium mb-2">Intégration</h1>
      <p className="text-sm text-neutral-500 mb-8">
        Copiez ce snippet dans le HTML de votre site pour afficher votre page de réservation.
      </p>

      <div className="border border-neutral-200 rounded-sm p-6 bg-white mb-6">
        <label className="text-sm font-medium block mb-1">Couleur de marque</label>
        <input
          type="color"
          value={brandColor}
          onChange={(e) => setBrandColor(e.target.value)}
          className="w-10 h-10 p-0.5 border border-neutral-200 rounded-sm cursor-pointer"
        />
        <p className="text-xs text-neutral-400 mt-1">Personnalise la couleur des accents dans le widget.</p>
      </div>

      <div className="border border-neutral-200 rounded-sm bg-neutral-50 mb-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Code à copier</span>
          <button onClick={copy} className="text-xs bg-neutral-900 text-white px-4 py-1.5 rounded-sm hover:bg-black transition-colors">
            Copier
          </button>
        </div>
        <pre className="text-xs text-neutral-700 p-5 overflow-x-auto whitespace-pre-wrap font-mono">{snippet}</pre>
      </div>

      <div className="border border-neutral-200 rounded-sm p-5 bg-white">
        <h2 className="text-sm font-medium mb-2">Aperçu</h2>
        <div className="border border-neutral-200 rounded-sm overflow-hidden">
          <iframe
            src={`/${slug}?embed=1&brand_color=${brandColor.replace('#', '')}`}
            className="w-full"
            style={{ height: '500px' }}
          />
        </div>
      </div>
    </div>
  );
}
