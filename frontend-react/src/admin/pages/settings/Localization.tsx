import { useState } from 'react';
import { Badge, Button, Notice, Select, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { PreviewNote } from '../../components/PreviewNote';
import { useSettings } from '../../hooks/useSettings';
import { useSession } from '../../session';
import { ADMIN_NOW } from '../../lib/format';

export default function Localization() {
  const { values, save } = useSettings('localization');
  const { can } = useSession();
  const [v, setV] = useState(values);
  const dirty = JSON.stringify(v) !== JSON.stringify(values);
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const enabled = ['langEn', 'langRo', 'langDe'].filter((k) => v[k] === 'true');
  const defKey = { en: 'langEn', ro: 'langRo', de: 'langDe' }[v['defaultLanguage'] ?? 'en'] ?? 'langEn';
  const problem = v[defKey] !== 'true' ? 'The default language must be enabled.' : !['currencyEur', 'currencyUsd', 'currencyRon'].some((k) => v[k] === 'true') ? 'Enable at least one currency.' : undefined;
  const sample = new Intl.DateTimeFormat(v['defaultLanguage'] === 'ro' ? 'ro-RO' : v['defaultLanguage'] === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: v['timeFormat'] === '12h', timeZone: 'UTC' }).format(ADMIN_NOW);
  return (
    <AdminPage title="Localization" description="Languages, currencies and formats offered to customers." actions={<><Button variant="ghost" disabled={!dirty} onClick={() => setV(values)}>Discard</Button><Button variant="primary" disabled={!dirty || !!problem || !can('admin:access')} onClick={() => save(v)}>Save</Button></>}>
      {problem ? <Notice tone="bad" title="Cannot save">{problem}</Notice> : null}
      <Columns>
        <Section title="Languages"><div className="grid gap-3"><Select label="Default language" value={v['defaultLanguage']} onValueChange={(x) => set('defaultLanguage', x ?? 'en')} options={[{ value: 'en', label: 'English' }, { value: 'ro', label: 'Română' }, { value: 'de', label: 'Deutsch' }]} /><Switch label="English" checked={v['langEn'] === 'true'} onCheckedChange={(x) => set('langEn', String(x))} /><Switch label="Română" checked={v['langRo'] === 'true'} onCheckedChange={(x) => set('langRo', String(x))} /><Switch label="Deutsch" checked={v['langDe'] === 'true'} onCheckedChange={(x) => set('langDe', String(x))} description="No translations exist yet: customers would see English." /><p className="text-[13px] font-semibold text-ink3">{enabled.length} language(s) enabled · translation coverage is not tracked by the backend.</p></div></Section>
        <Section title="Currencies"><div className="grid gap-3"><Switch label="Euro (EUR)" checked={v['currencyEur'] === 'true'} onCheckedChange={(x) => set('currencyEur', String(x))} /><Switch label="US dollar (USD)" checked={v['currencyUsd'] === 'true'} onCheckedChange={(x) => set('currencyUsd', String(x))} /><Switch label="Romanian leu (RON)" checked={v['currencyRon'] === 'true'} onCheckedChange={(x) => set('currencyRon', String(x))} /><Switch label="Pound sterling (GBP)" checked={false} disabled description="No plan prices exist in GBP; add prices first." /><Select label="RON rounding" value={v['roundRon']} onValueChange={(x) => set('roundRon', x ?? 'whole')} options={[{ value: 'whole', label: 'Whole lei' }, { value: 'bani', label: 'Two decimals' }]} /></div><p className="mt-3 text-[13px] text-ink2">A currency can only be sold if every active plan has a price in it. Disabling one does not change existing subscriptions.</p></Section>
      </Columns>
      <Section title="Formats"><div className="grid gap-4 sm:grid-cols-3"><Select label="Date format" value={v['dateFormat']} onValueChange={(x) => set('dateFormat', x ?? '')} options={[{ value: 'dd MMM yyyy', label: '21 Oct 2026' }, { value: 'yyyy-MM-dd', label: '2026-10-21' }]} /><Select label="Time" value={v['timeFormat']} onValueChange={(x) => set('timeFormat', x ?? '24h')} options={[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }]} /><Select label="Week starts on" value={v['firstDay']} onValueChange={(x) => set('firstDay', x ?? 'monday')} options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} /></div><p className="mt-3 flex items-center gap-2 text-[14px]"><Badge>Preview</Badge> {sample}</p></Section>
      <PreviewNote />
    </AdminPage>
  );
}
