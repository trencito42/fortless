import type { StoryDef, Scenario as ScenarioDef } from './types';

/** Scenario render functions are components: they may use hooks. */
function Scenario({ render: R }: { render: ScenarioDef['render'] }) {
  return <R />;
}

/** Renders every scenario of a story. Used inside the workbench iframe and directly by tests. */
export function StoryPage({ story, scenario = 0 }: { story: StoryDef; scenario?: number }) {
  const bleed = story.scenarios.some((s) => s.fullBleed);
  const shown = bleed ? story.scenarios.slice(scenario, scenario + 1) : story.scenarios;
  return (
    <div className={bleed ? 'h-dvh' : 'mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-10 px-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] py-6'} data-story={story.id}>
      {shown.map((s) => (
        <section key={s.name} className={bleed ? 'h-full' : 'grid grid-cols-[minmax(0,1fr)] gap-3'} data-scenario={s.name} aria-label={s.name}>
          {bleed ? null : (
            <header className="grid gap-0.5">
              <h2 className="text-[15px] font-extrabold tracking-[-0.02em]">{s.name}</h2>
              {s.note ? <p className="text-[13px] text-ink3">{s.note}</p> : null}
            </header>
          )}
          <div className={bleed ? 'h-full' : 'min-w-0'}><Scenario render={s.render} /></div>
        </section>
      ))}
    </div>
  );
}
