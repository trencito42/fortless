import { useCallback, useState } from 'react';

export type Rule<V> = (value: string, all: V) => string | undefined;
export const required = (label: string): Rule<Record<string, string>> => (v) => (v.trim() ? undefined : `${label} is required.`);
export const minLen = (n: number, label: string): Rule<Record<string, string>> => (v) => (v.trim().length >= n ? undefined : `${label} must be at least ${n} characters.`);
export const maxLen = (n: number, label: string): Rule<Record<string, string>> => (v) => (v.length <= n ? undefined : `${label} must be at most ${n} characters.`);
export const email: Rule<Record<string, string>> = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.');
export const intRange = (min: number, max: number, label: string): Rule<Record<string, string>> => (v) => (/^-?\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max ? undefined : `${label} must be a whole number between ${min} and ${max}.`);
export const decimal = (label: string): Rule<Record<string, string>> => (v) => (/^\d+([.,]\d{1,2})?$/.test(v.trim()) ? undefined : `${label} must be a positive amount with at most 2 decimals.`);

/** Tiny controlled-form helper: string values, per-field rules, errors shown after the first submit or blur. */
export function useForm<V extends Record<string, string>>(initial: V, rules: Partial<Record<keyof V, Rule<V>[]>> = {}) {
  const [values, setValues] = useState<V>(initial);
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const errorsFor = useCallback((v: V) => {
    const out: Partial<Record<keyof V, string>> = {};
    for (const k of Object.keys(rules) as Array<keyof V>) for (const r of rules[k] ?? []) { const m = r(v[k] ?? '', v); if (m) { out[k] = m; break; } }
    return out;
  }, [rules]);
  const all = errorsFor(values);
  const errors: Partial<Record<keyof V, string>> = {};
  for (const k of Object.keys(all) as Array<keyof V>) if (submitted || touched[k]) errors[k] = all[k]!;
  return {
    values,
    errors,
    valid: Object.keys(all).length === 0,
    set: <K extends keyof V>(k: K, val: V[K]) => setValues((s) => ({ ...s, [k]: val })),
    blur: (k: keyof V) => setTouched((t) => ({ ...t, [k]: true })),
    submit: () => { setSubmitted(true); return Object.keys(all).length === 0; },
    reset: (next?: V) => { setValues(next ?? initial); setTouched({}); setSubmitted(false); },
    dirty: JSON.stringify(values) !== JSON.stringify(initial),
  };
}
