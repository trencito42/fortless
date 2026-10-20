import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { Field, type FieldProps } from './Field';
import { Popover } from '../overlays/Popover';
import { Icon } from '../icons/Icon';
import { Button } from '../primitives/Button';
import { controlBox, controlHeight } from './control-styles';
import { DatePicker } from './DatePicker';
import type { IsoDate } from './Calendar';

const pad = (n: number) => String(n).padStart(2, '0');

function Column({ label, values, current, onPick }: { label: string; values: number[]; current: number | null; onPick: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const opts = [...(ref.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])];
    const i = opts.indexOf(document.activeElement as HTMLElement);
    opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };
  return (
    <div ref={ref} role="listbox" aria-label={label} onKeyDown={onKey} className="grid max-h-56 w-16 content-start gap-0.5 overflow-y-auto pr-1">
      {values.map((v) => (
        <button key={v} type="button" role="option" aria-selected={v === current} tabIndex={v === current || (current === null && v === values[0]) ? 0 : -1} onClick={() => onPick(v)}
          className={cn('h-9 rounded-md text-[14px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent', v === current ? 'bg-accent text-on-accent' : 'text-ink hover:bg-s2')}>{pad(v)}</button>
      ))}
    </div>
  );
}

export interface TimePickerProps extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  /** `HH:mm` (24 hour) or null. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Minute step shown in the list. Default 5. */
  minuteStep?: 1 | 5 | 10 | 15 | 30;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

/** Time of day in 24-hour format. Two listboxes (hours, minutes) in a popover; the value is `HH:mm`. */
export function TimePicker({ label, description, error, hideLabel, value, onValueChange, minuteStep = 5, disabled, required, placeholder = 'Choose a time', className }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [h, m] = value ? value.split(':').map(Number) : [null, null];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep);
  const set = (nh: number | null, nm: number | null) => onValueChange(`${pad(nh ?? 0)}:${pad(nm ?? 0)}`);
  const name = typeof label === 'string' ? label : 'Time';
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} className={className}>
      <Popover open={open} onOpenChange={setOpen} className="w-auto"
        trigger={<button type="button" disabled={disabled} aria-haspopup="dialog" aria-label={`${name}: ${value ?? 'none chosen'}`} className={cn(controlBox, controlHeight.md, 'w-full cursor-pointer gap-2 text-left tabular-nums', !value && 'text-ink3', error && 'ring-2 ring-bad')}><Icon name="clock-01" size={18} /><span className="flex-1">{value ?? placeholder}</span></button>}>
        <div className="grid gap-3">
          <div className="flex gap-2">
            <Column label="Hours" values={hours} current={h ?? null} onPick={(x) => set(x, m ?? 0)} />
            <Column label="Minutes" values={minutes} current={m ?? null} onPick={(x) => set(h ?? 0, x)} />
          </div>
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => { const n = new Date(); onValueChange(`${pad(n.getHours())}:${pad(Math.floor(n.getMinutes() / minuteStep) * minuteStep)}`); }}>Now</Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </Popover>
    </Field>
  );
}

export interface DateTimePickerProps extends Pick<FieldProps, 'description' | 'error'> {
  legend: string;
  /** `YYYY-MM-DDTHH:mm` (local to `timeZone`) or null. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Shown as text so people know which clock this uses. Defaults to the browser time zone. */
  timeZone?: string;
  min?: IsoDate;
  max?: IsoDate;
  minuteStep?: TimePickerProps['minuteStep'];
  locale?: string;
}

/** Date and time as one value. The time zone is stated, never implied. */
export function DateTimePicker({ legend, description, error, value, onValueChange, timeZone, min, max, minuteStep, locale }: DateTimePickerProps) {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [date, time] = value ? value.split('T') : [null, null];
  const join = (d: string | null, t: string | null) => (d ? `${d}T${t ?? '00:00'}` : null);
  return (
    <fieldset className="grid gap-2">
      <legend className="font-extrabold">{legend}</legend>
      <p className="text-[13px] text-ink3">{description ?? `Times are in ${tz}.`}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]">
        <DatePicker label="Date" value={date ?? null} min={min} max={max} locale={locale} onValueChange={(d) => onValueChange(join(d, time ?? null))} />
        <TimePicker label="Time" value={time ?? null} minuteStep={minuteStep} onValueChange={(t) => onValueChange(date ? join(date, t) : null)} />
      </div>
      {error ? <p role="alert" className="font-semibold text-bad">{error}</p> : null}
    </fieldset>
  );
}
