import { useId, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/design-system';
import { Headline, Reveal, Wrap } from '../ui';

const QA: [string, string][] = [
  ['What can I host on Fortless?', 'Game servers (Minecraft first), Discord bots, Node.js apps and APIs, with domains to match.'],
  ['Do I need technical skills?', 'No. Setup is guided in plain words, and the console, files and settings are there when you want them. You do not need to know what a daemon is.'],
  ['How does billing work?', 'One account for everything: orders, renewals and invoices live in the same place, and you see the price before you pay.'],
  ['Can I add teammates?', 'Yes. Invite people by email and give each one only the permissions they need. The audit log shows who changed what.'],
  ['What if something goes wrong?', 'Take a backup before you change anything and restore it with one click. If you are stuck, open a ticket from your dashboard; the status page shows the health of every part of the platform.'],
  ['Can I move my existing project here?', 'Yes. Upload your files, or connect Git for bots and apps, then set the start command and launch.'],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  const uid = useId();
  return (
    <section id="faq" aria-label="Questions and answers" className="py-28">
      <Wrap className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div className="grid content-start gap-4"><Headline lines={['A few things,', 'cleared up.']} className="text-[clamp(40px,5.2vw,76px)] leading-[0.92]" /><Reveal delay={200}><p className="max-w-sm text-[18px] text-ink2">Straight answers about how Fortless works.</p></Reveal></div>
        <ul className="grid gap-2.5">
          {QA.map(([q, a], i) => (
            <Reveal as="li" key={q} delay={i * 60}>
              <div className={cn('rounded-[24px] bg-s1 transition-colors duration-300', open === i && 'bg-s1')}>
                <h3><button type="button" id={`${uid}-q${i}`} aria-expanded={open === i} aria-controls={`${uid}-a${i}`} onClick={() => setOpen(open === i ? -1 : i)} className="flex min-h-16 w-full items-center justify-between gap-4 rounded-[24px] px-6 py-4 text-left text-[18px] font-extrabold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-accent">{q}<span className={cn('grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-300', open === i ? 'rotate-45 bg-ink text-on-ink' : 'bg-s3')}><Icon name="add-01" size={18} /></span></button></h3>
                <div id={`${uid}-a${i}`} role="region" aria-labelledby={`${uid}-q${i}`} className={cn('grid transition-[grid-template-rows] duration-400 ease-petal', open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}><div className="overflow-hidden"><p className="px-6 pb-6 text-[16.5px] text-ink2">{a}</p></div></div>
              </div>
            </Reveal>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
