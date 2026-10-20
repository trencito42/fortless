/** Shared look of every text-like control, so fields line up across forms. */
export const controlBox =
  'flex w-full min-w-0 items-center gap-2 rounded-md bg-s2 px-4 text-ink transition-shadow duration-150 focus-within:ring-2 focus-within:ring-accent data-[invalid]:ring-2 data-[invalid]:ring-bad data-[disabled]:opacity-50 data-[readonly]:bg-s3';

export const controlHeight = { sm: 'h-ctl-sm', md: 'h-ctl-md', lg: 'h-ctl-lg' } as const;

export const bareInput =
  'min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink3 disabled:cursor-not-allowed read-only:cursor-default';

export type ControlSize = keyof typeof controlHeight;
