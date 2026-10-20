import { useState } from 'react';
import { Field, type FieldProps } from './Field';
import { Popover } from '../overlays/Popover';
import { Icon } from '../icons/Icon';
import { cn } from '@/lib/utils/cn';
import { controlBox, controlHeight } from './control-styles';
import { Button } from '../primitives/Button';
import { Calendar, addDays, fromIso, toIso, type IsoDate } from './Calendar';

const fmt = (s: IsoDate, locale: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(fromIso(s));

interface Common extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  min?: IsoDate;
  max?: IsoDate;
  disabled?: boolean;
  required?: boolean;
  locale?: string;
  placeholder?: string;
  className?: string;
}

const triggerCls = (invalid: boolean, empty: boolean) => cn(controlBox, controlHeight.md, 'w-full cursor-pointer gap-2 text-left', empty && 'text-ink3', invalid && 'ring-2 ring-bad');

export interface DatePickerProps extends Common {
  value: IsoDate | null;
  onValueChange: (value: IsoDate | null) => void;
}

/** Single date with a calendar popover. Value is `YYYY-MM-DD`. For a plain form where the platform picker is enough, DateField stays available. */
export function DatePicker({ label, description, error, hideLabel, value, onValueChange, min, max, disabled, required, locale = 'en-GB', placeholder = 'Choose a date', className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} className={className}>
      <Popover open={open} onOpenChange={setOpen} title={undefined} className="w-auto"
        trigger={<button type="button" disabled={disabled} aria-haspopup="dialog" aria-label={`${typeof label === 'string' ? label : 'Date'}: ${value ? fmt(value, locale) : 'none chosen'}`} className={triggerCls(!!error, !value)}><Icon name="calendar-01" size={18} /><span className="flex-1 truncate">{value ? fmt(value, locale) : placeholder}</span></button>}>
        <Calendar value={value} min={min} max={max} locale={locale} label={typeof label === 'string' ? label : 'Date'} onSelect={(d) => { onValueChange(d); setOpen(false); }} />
        {!required && value ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => { onValueChange(null); setOpen(false); }}>Clear date</Button> : null}
      </Popover>
    </Field>
  );
}

export interface DateRange { start: IsoDate | null; end: IsoDate | null }
export interface DateRangePreset { label: string; range: () => { start: IsoDate; end: IsoDate } }

const days = (n: number): DateRangePreset['range'] => () => { const end = toIso(new Date()); return { start: addDays(end, -(n - 1)), end }; };
export const DEFAULT_RANGE_PRESETS: DateRangePreset[] = [
  { label: 'Last 7 days', range: days(7) },
  { label: 'Last 30 days', range: days(30) },
  { label: 'Last 90 days', range: days(90) },
  { label: 'This month', range: () => { const t = new Date(); return { start: toIso(new Date(t.getFullYear(), t.getMonth(), 1)), end: toIso(t) }; } },
];

export interface DateRangePickerProps extends Common {
  value: DateRange;
  onValueChange: (value: DateRange) => void;
  presets?: DateRangePreset[];
}

/**
 * Date range: first click sets the start, second the end (swapped if earlier). Presets fill both ends in one step.
 * The popover stays open until the range is complete.
 */
export function DateRangePicker({ label, description, error, hideLabel, value, onValueChange, min, max, disabled, required, locale = 'en-GB', placeholder = 'Choose a range', presets = DEFAULT_RANGE_PRESETS, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const text = value.start && value.end ? `${fmt(value.start, locale)} – ${fmt(value.end, locale)}` : value.start ? `${fmt(value.start, locale)} – …` : placeholder;
  const pick = (d: IsoDate) => {
    if (!picking || !value.start) { onValueChange({ start: d, end: null }); setPicking(true); return; }
    const [s, e] = d < value.start ? [d, value.start] : [value.start, d];
    onValueChange({ start: s, end: e });
    setPicking(false);
    setOpen(false);
  };
  const name = typeof label === 'string' ? label : 'Date range';
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} className={className}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPicking(false); }} className="w-auto"
        trigger={<button type="button" disabled={disabled} aria-haspopup="dialog" aria-label={`${name}: ${value.start && value.end ? text : 'none chosen'}`} className={triggerCls(!!error, !value.start)}><Icon name="calendar-01" size={18} /><span className="flex-1 truncate">{text}</span></button>}>
        <div className="grid w-[19.5rem] max-w-full gap-3">
          {presets.length ? (
            <div role="group" aria-label="Quick ranges" className="grid grid-cols-2 gap-1.5">
              {presets.map((p) => <Button key={p.label} size="sm" variant="secondary" className="w-full" onClick={() => { onValueChange(p.range()); setPicking(false); setOpen(false); }}>{p.label}</Button>)}
            </div>
          ) : null}
          <p className="text-[13px] font-semibold text-ink3" aria-live="polite">{picking ? 'Now choose the last day.' : value.start && value.end ? `Selected: ${text}. Choose a new first day to change it.` : 'Choose the first day.'}</p>
          <Calendar range={value} min={min} max={max} locale={locale} label={name} onSelect={pick} />
        </div>
      </Popover>
    </Field>
  );
}
