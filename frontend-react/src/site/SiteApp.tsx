import { Suspense, lazy, useEffect, useMemo } from 'react';
import { RouterProvider, useRouter } from '@/app/router';
import { SiteNav } from './Nav';
import { SiteFooter } from './Footer';
import { gameBySlug } from './fixtures/games';
import { TopicProvider } from './TopicModal';

const Home = lazy(() => import('./pages/Home'));
const Status = lazy(() => import('./pages/Status'));
const Game = lazy(() => import('./pages/Game'));

const PAGES: Record<string, { title: string; description: string }> = {
  '/': { title: 'Fortless: hosting, minus the hassle', description: 'Host game servers, Discord bots and apps from one calm control panel. Console, files, backups and billing in one account.' },
  '/status': { title: 'System status · Fortless', description: 'Current health of the Fortless platform, active incidents and incident history.' },
};

function setMeta(description: string) {
  let m = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
  m.content = description;
}

function Pages() {
  const { path } = useRouter();
  const game = path.startsWith('/games/') ? gameBySlug(path.replace('/games/', '')) : undefined;
  const page = useMemo(() => (game ? { title: `${game.name} server hosting · Fortless`, description: game.lede } : PAGES[path]), [game, path]);
  useEffect(() => { document.title = page?.title ?? 'Page not found · Fortless'; setMeta((page ?? PAGES['/']!).description); }, [page]);
  if (!page) return <div className="mx-auto grid max-w-[880px] gap-3 px-4 pb-24 pt-[140px]"><h1 className="text-[28px] font-extrabold tracking-[-0.04em]">Page not found</h1><p className="text-ink2">There is nothing at this address.</p><a href="/" className="w-fit rounded-full bg-accent px-5 py-2.5 font-bold text-on-accent">Back to home</a></div>;
  const Page = game ? Game : path === '/status' ? Status : Home;
  return <Suspense fallback={<div className="min-h-[70vh]" aria-busy="true" />}><Page /></Suspense>;
}

/** Public marketing site: home, game pages and system status. Sign-in and registration stay on the Fastify pages; the customer app lives under /app. */
export default function SiteApp() {
  return (
    <RouterProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-on-ink">Skip to content</a>
      <TopicProvider>
        <SiteNav />
        <main id="main" className="site-root overflow-x-clip">
          <Pages />
        </main>
        <SiteFooter />
      </TopicProvider>
    </RouterProvider>
  );
}
