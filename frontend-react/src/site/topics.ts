import type { IconName } from '@/design-system';

/**
 * Everything the menu and the home cards can open in a modal. Marketing copy only claims things the customer app already shows.
 * Add a topic here and it can be opened from anywhere with `useTopic().open(id)`.
 */
export type DemoKind = 'console' | 'bot' | 'app' | 'dns' | 'files' | 'backups' | 'team' | 'billing' | 'support' | 'steps' | 'security';
export interface Topic {
  id: string; icon: IconName; tone: string; title: string; blurb: string; demo: DemoKind; points: string[];
  cta?: { label: string; to: string };
  /** Pages that go deeper than the modal. */
  links?: { label: string; to: string }[];
}

export const TOPICS: Topic[] = [
  { id: 'games', icon: 'layers-01', tone: 'bg-accent-bg text-accent-ink', title: 'Game servers', blurb: 'A world for your friends or your whole community, kept running without the setup maze.', demo: 'console',
    points: ['A live console you can type into', 'CPU, memory and storage at a glance', 'Start, stop and restart in one click', 'Backups and schedules handled for you'],
    cta: { label: 'Start a game server', to: '/register' }, links: [{ label: 'Minecraft hosting', to: '/games/minecraft' }] },
  { id: 'bots', icon: 'discord', tone: 'bg-violet-bg text-violet', title: 'Discord bots', blurb: 'Host the bots your community depends on. Built for processes that never sleep.', demo: 'bot',
    points: ['Upload your code or connect Git', 'Start, stop and restart from the panel', 'Logs you can read when something breaks', 'Environment variables kept out of your code'], cta: { label: 'Host a bot', to: '/register' } },
  { id: 'apps', icon: 'package', tone: 'bg-good-bg text-good', title: 'Apps and APIs', blurb: 'Node.js services with a start command, environment variables and a deploy log you can read.', demo: 'app',
    points: ['Choose a start command and port', 'Deploy log in plain sight', 'Environment variables per service', 'Change plan later without starting over'], cta: { label: 'Deploy an app', to: '/register' } },
  { id: 'domains', icon: 'globe-02', tone: 'bg-warn-bg text-warn', title: 'Domains', blurb: 'Find a name and point it at the services it belongs to, with DNS records you can edit in one place.', demo: 'dns',
    points: ['Search whether a name is free', 'A, CNAME, MX and TXT records', 'Point a domain at any of your services', 'Nameservers visible, never hidden'], cta: { label: 'Find a domain', to: '/register' } },
  { id: 'console', icon: 'terminal', tone: 'bg-accent-bg text-accent-ink', title: 'Console and power', blurb: 'Start, stop and type into the console without leaving the page.', demo: 'console',
    points: ['Live output as it happens', 'Command history with ArrowUp', 'Start, stop, restart, kill', 'Sensitive commands are masked in history'], cta: { label: 'Open a server', to: '/register' } },
  { id: 'files', icon: 'folder-01', tone: 'bg-good-bg text-good', title: 'Files', blurb: 'Edit and upload files from the browser, no separate client needed.', demo: 'files',
    points: ['Folders and files in one tree', 'Edit text files in place', 'Upload by dropping files on the page', 'Rename, move and delete in place'], cta: { label: 'Create your account', to: '/register' } },
  { id: 'backups', icon: 'archive-01', tone: 'bg-violet-bg text-violet', title: 'Backups and schedules', blurb: 'Restore points when you need them and timed tasks when you don’t want to remember.', demo: 'backups',
    points: ['Back up now, restore in a click', 'See every restore point with its date', 'Run commands on a schedule', 'Times shown in your own time zone'], cta: { label: 'Create your account', to: '/register' } },
  { id: 'team', icon: 'user-group', tone: 'bg-info-bg text-info', title: 'Team access', blurb: 'Give people exactly the access they need and take it back just as easily.', demo: 'team',
    points: ['Invite by email', 'Roles from owner to viewer', 'Roles you can change later', 'Every change in the audit log'], cta: { label: 'Create your account', to: '/register' } },
  { id: 'billing', icon: 'wallet-01', tone: 'bg-accent-bg text-accent-ink', title: 'Billing', blurb: 'Orders, renewals and invoices in one view, with the price shown before you pay.', demo: 'billing',
    points: ['Price and total before checkout', 'Renewals and their dates', 'Invoices you can download', 'Payment methods in one place'], cta: { label: 'Create your account', to: '/register' } },
  { id: 'support', icon: 'message-01', tone: 'bg-warn-bg text-warn', title: 'Support', blurb: 'Tickets that stay with your account, so you never explain the same thing twice.', demo: 'support',
    points: ['Open a ticket from any server', 'Full history in one inbox', 'Replies land in your inbox', 'Knowledge base for quick answers'], cta: { label: 'Create your account', to: '/register' } },
  { id: 'online', icon: 'rocket-01', tone: 'bg-accent-bg text-accent-ink', title: 'Online in minutes', blurb: 'Four short steps from an idea to something running.', demo: 'steps',
    points: ['Choose what to host', 'Make it yours with clear pricing', 'Launch and watch it start', 'Manage it from one panel'], cta: { label: 'Start hosting', to: '/register' } },
  { id: 'secure', icon: 'shield-01', tone: 'bg-good-bg text-good', title: 'Secure by default', blurb: 'Two-step sign-in, scoped access and an audit log, built into the account.', demo: 'security',
    points: ['Authenticator-app codes at sign-in', 'API keys shown once, revocable', 'Access scoped per person', 'An activity log you can read'], cta: { label: 'Create your account', to: '/register' } },
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id);
