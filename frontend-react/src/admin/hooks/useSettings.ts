import { useAdmin } from '../store';
import { useToast } from '../toast';

/** Values of one settings section from the demo store, plus a save that writes a preview audit event. Secrets here are already masked strings. */
export function useSettings(id: string) {
  const { data, patch, audit } = useAdmin();
  const toast = useToast();
  const values = data.settings.find((s) => s.id === id)?.values ?? {};
  const save = (next: Record<string, string>, action = `settings.${id}_updated`, reason?: string) => {
    patch('settings', id, { values: { ...values, ...next } });
    audit(action, { type: 'settings', id, label: id }, { ...(reason ? { reason } : {}), after: Object.fromEntries(Object.entries(next).filter(([k]) => !/secret|password|key|token/i.test(k)).slice(0, 4)) });
    toast({ tone: 'good', title: 'Settings saved (preview)', description: 'Nothing was applied to the running platform.' });
  };
  return { values, save };
}
