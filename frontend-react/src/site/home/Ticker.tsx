import { Icon, type IconName } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { useReducedMotion, useScrollY } from '../hooks';

const ROW_A: [IconName, string][] = [['terminal', 'Console'], ['folder-01', 'Files'], ['archive-01', 'Backups'], ['clock-01', 'Schedules'], ['globe-02', 'Domains'], ['wallet-01', 'Billing'], ['user-group', 'Teams'], ['message-01', 'Support']];
const ROW_B: [IconName, string][] = [['shield-01', 'Two-step sign-in'], ['key-01', 'API keys'], ['rocket-01', 'One-click deploy'], ['activity-01', 'Live metrics'], ['discord', 'Discord bots'], ['layers-01', 'Minecraft'], ['code', 'Node.js'], ['database', 'Databases']];
const TONES = ['bg-accent text-on-accent', 'bg-lime text-lime-ink', 'bg-night text-night-ink', 'bg-s1 text-ink'];

/** Two rows of chunky chips that slide in opposite directions as you scroll. Decorative. */
export function Ticker() {
  const y = useScrollY();
  const reduced = useReducedMotion();
  const row = (items: [IconName, string][], dir: 1 | -1, off: number) => (
    <div className="whitespace-nowrap will-change-transform" style={{ transform: `translate3d(${reduced ? 0 : dir * y * 0.28 + off}px,0,0)` }}>
      {[...items, ...items, ...items].map(([ic, t], i) => (
        <span key={i} className={cn('mr-3 inline-flex h-16 items-center gap-3 rounded-full px-7 text-[clamp(20px,2.4vw,30px)] font-extrabold tracking-[-0.04em] sm:mr-4', TONES[i % 4])} style={{ rotate: `${((i % 3) - 1) * 0.8}deg` }}><Icon name={ic} size={26} />{t}</span>
      ))}
    </div>
  );
  return (
    <div aria-hidden="true" data-decorative className="grid gap-3 overflow-hidden py-14 select-none">
      {row(ROW_A, -1, 0)}
      {row(ROW_B, 1, -900)}
    </div>
  );
}
