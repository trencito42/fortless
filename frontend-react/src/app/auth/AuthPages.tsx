import { useEffect } from 'react';
import { Card, Spinner } from '@/design-system';
import { useRouter } from '../router';

const TARGETS: Record<string, string> = {
  '/auth/login': '/login',
  '/auth/register': '/register',
  '/auth/verify-email': '/verify-email',
  '/auth/reset': '/forgot-password',
  '/auth/mfa': '/mfa/challenge',
};

/** Fortless owns cookies, MFA and redirects; React delegates instead of creating a competing auth flow. */
export default function AuthPages() {
  const { path, search } = useRouter();
  const target = `${TARGETS[path] ?? '/login'}${search.size ? `?${search.toString()}` : ''}`;
  useEffect(() => { location.replace(target); }, [target]);
  return <main className="grid min-h-screen place-items-center bg-s2 p-5"><Card pad="lg" className="flex items-center gap-3"><Spinner /><span className="font-semibold">Opening secure authentication…</span></Card></main>;
}
