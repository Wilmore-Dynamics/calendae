'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import Avatar from './Avatar';

const Header = () => {
  const { user, isLoading, logout } = useAuth();

  return (
    <header className="border-b border-neutral-200 flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl tracking-tight font-medium no-underline">
          CALENDAE
        </Link>
        {user?.company_id && (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-neutral-500 hover:text-black transition-colors no-underline">
              Tableau de bord
            </Link>
          </nav>
        )}
      </div>
      <div className="flex items-center gap-4">
        {isLoading ? null : user ? (
          <>
            <Link href="/dashboard" className="flex items-center gap-2 no-underline group">
              <Avatar name={user.display_name || user.email} url={user.avatar_url} size="sm" />
              <span className="text-sm text-neutral-500 group-hover:text-black transition-colors">
                {user.display_name || user.email}
              </span>
            </Link>
            <button
              onClick={logout}
              className="border border-neutral-200 px-4 py-1.5 rounded-sm hover:bg-neutral-100 transition-colors text-sm"
            >
              Déconnexion
            </button>
          </>
        ) : (
          <Link
            href="/auth/login"
            className="border border-neutral-200 px-4 py-1.5 rounded-sm hover:bg-neutral-100 transition-colors no-underline text-inherit text-sm"
          >
            Connexion
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;
