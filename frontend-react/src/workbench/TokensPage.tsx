import { COLOR_TOKENS, RADII } from '@/design-system';

export function TokensPage() {
  return (
    <div className="mx-auto grid w-full max-w-[1000px] content-start gap-6">
      {COLOR_TOKENS.map((g) => (
        <section key={g.group} className="grid gap-3">
          <h2 className="text-[15px] font-extrabold tracking-[-0.02em]">{g.group}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {g.tokens.map((t) => (
              <div key={t} className="grid gap-2 rounded-lg bg-s1 p-3">
                <span className="h-14 rounded-md" style={{ background: `var(--${t})` }} />
                <span className="font-mono text-[12px] font-bold">--{t}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="grid gap-3">
        <h2 className="text-[15px] font-extrabold tracking-[-0.02em]">Radii</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {RADII.map((r) => (
            <div key={r.name} className="grid gap-2 rounded-lg bg-s1 p-3">
              <span className="h-14 bg-accent-bg" style={{ borderRadius: r.px }} />
              <span className="text-[13px] font-bold">{r.name} · {r.px === 999 ? 'full' : `${r.px}px`}</span>
              <span className="text-[12px] text-ink3">{r.use}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="text-[15px] font-extrabold tracking-[-0.02em]">Typography</h2>
        <div className="grid gap-2 rounded-lg bg-s1 p-5">
          <p className="text-[46px] leading-none font-extrabold tracking-[-0.05em]">Hosting, minus the hassle.</p>
          <p className="text-[22px] font-extrabold tracking-[-0.04em]">Page heading, 22 / 800</p>
          <p className="text-[14.5px]">Body 14.5 / 500. Servers, bots and apps in one list.</p>
          <p className="font-mono text-[13px]">JetBrains Mono 13 · [14:02:11] Done (2.1s)! For help, type "help"</p>
        </div>
      </section>
    </div>
  );
}
