import { defineStory } from '../types';
import { Button, IconButton, Badge, StatusBadge, Card, CardHeader, Skeleton, EmptyState, Avatar, Kbd, Tooltip } from '@/design-system';
import { Row, Stack, Cap } from '../layout';

export const primitiveStories = [
  defineStory({
    id: 'button',
    title: 'Button',
    category: 'Primitives',
    layer: 'A: primitive',
    purpose: 'The base action. Every other action component (groups, split, menus) is built from it.',
    source: 'Fortless.html and Fortless Views.html: .btn variants (pri, ghost, ink, lime, danger)',
    variants: ['primary', 'secondary', 'ghost', 'ink', 'lime', 'subtle', 'danger', 'danger-subtle', 'sm / md / lg', 'block', 'loading', 'disabled', 'with icons'],
    props: ['variant: ButtonVariant', 'size: sm | md | lg', 'loading?: boolean', 'loadingLabel?: string', 'leadingIcon? / trailingIcon?: IconName', 'block?: boolean'],
    a11y: 'Native button semantics via Base UI. Loading sets aria-busy, keeps focus and ignores clicks. Disabled buttons stay reachable with focusableWhenDisabled when loading.',
    responsive: 'Heights follow --ctl-sm/md/lg tokens (44px default touch target). Density compact reduces them.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Variants',
        render: () => (
          <Row>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="ink">Ink</Button>
            <Button variant="lime">Lime</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="danger-subtle">Danger subtle</Button>
          </Row>
        ),
      },
      {
        name: 'Sizes and icons',
        render: () => (
          <Row>
            <Button size="sm" variant="primary" leadingIcon="add-01">Small</Button>
            <Button size="md" variant="primary" leadingIcon="rocket-01">Medium</Button>
            <Button size="lg" variant="primary" trailingIcon="arrow-up-right-01">Large</Button>
            <IconButton label="Settings" icon="settings-01" variant="secondary" />
          </Row>
        ),
      },
      {
        name: 'States',
        render: () => (
          <Row>
            <Button variant="primary" loading loadingLabel="Saving">Saving</Button>
            <Button variant="secondary" disabled>Disabled</Button>
            <Button variant="primary" disabled>Disabled primary</Button>
          </Row>
        ),
      },
      { name: 'Block', render: () => <div className="max-w-sm"><Button block size="lg" variant="primary">Continue</Button></div> },
    ],
  }),
  defineStory({
    id: 'badge-status',
    title: 'Badge and StatusBadge',
    category: 'Primitives',
    layer: 'A: primitive',
    purpose: 'Badge labels static things. StatusBadge shows state that changes: one look for server, invoice, domain, job and ticket state, with caller-supplied meaning.',
    source: 'Fortless Views.html: .pill and status pills',
    variants: ['neutral', 'accent', 'good', 'warn', 'bad', 'info', 'violet', 'lime', 'ink', 'live dot'],
    props: ['tone: BadgeTone', 'dot?: boolean', 'live?: boolean'],
    a11y: 'State is always carried by the text label; the dot is decorative. Live ping respects reduced motion.',
    responsive: 'Never wraps; truncate the surrounding text instead.',
    status: 'implemented',
    scenarios: [
      { name: 'Badges', render: () => <Row><Badge>Neutral</Badge><Badge tone="accent">Accent</Badge><Badge tone="good">Good</Badge><Badge tone="warn">Warn</Badge><Badge tone="bad">Bad</Badge><Badge tone="info">Info</Badge><Badge tone="violet">Violet</Badge><Badge tone="lime">New</Badge></Row> },
      {
        name: 'Status across domains',
        note: 'Same primitive, different meaning. Domain mappings live in features/status.ts.',
        render: () => (
          <Stack>
            <Row><Cap>Server</Cap><StatusBadge tone="good" live>Running</StatusBadge><StatusBadge tone="neutral">Offline</StatusBadge><StatusBadge tone="warn" live>Starting</StatusBadge></Row>
            <Row><Cap>Invoice</Cap><StatusBadge tone="good">Paid</StatusBadge><StatusBadge tone="warn">Unpaid</StatusBadge><StatusBadge tone="bad">Overdue</StatusBadge></Row>
            <Row><Cap>Domain</Cap><StatusBadge tone="info">Pending registration</StatusBadge><StatusBadge tone="good">Active</StatusBadge></Row>
            <Row><Cap>Ticket</Cap><StatusBadge tone="accent">Open</StatusBadge><StatusBadge tone="violet">Awaiting you</StatusBadge><StatusBadge tone="neutral">Closed</StatusBadge></Row>
          </Stack>
        ),
      },
    ],
  }),
  defineStory({
    id: 'card-surfaces',
    title: 'Card and surfaces',
    category: 'Primitives',
    layer: 'A: primitive',
    purpose: 'Flat color-block containers. Hierarchy comes from surface tone (bg, s1, s2, s3), never borders or shadows.',
    source: 'Fortless.html: surface hierarchy',
    variants: ['raised', 'sunken', 'accent', 'ink', 'lime', 'pad none/sm/md/lg'],
    props: ['surface', 'pad', 'as'],
    a11y: 'Use as="section" with a heading for landmarks. Cards are not interactive by themselves.',
    responsive: 'Min-width 0 so content truncates instead of overflowing grids.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Surfaces',
        render: () => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card><CardHeader title="Raised" description="Default surface on the page background." /></Card>
            <Card surface="sunken"><CardHeader title="Sunken" description="Nested inside a raised card." /></Card>
            <Card surface="accent"><CardHeader title="Accent" description="Highlight one thing per screen." /></Card>
            <Card surface="ink"><CardHeader title="Ink" description="Strong contrast block." /></Card>
            <Card surface="lime"><CardHeader title="Lime" description="Brand moment, sparingly." /></Card>
          </div>
        ),
      },
    ],
  }),
  defineStory({
    id: 'feedback-primitives',
    title: 'Skeleton, EmptyState, Avatar, Kbd, Tooltip',
    category: 'Primitives',
    layer: 'A: primitive',
    purpose: 'Small building blocks: loading placeholders, empty and error states, identity and keyboard hints.',
    source: 'Fortless Views.html: empty/loading/error states',
    variants: ['skeleton', 'empty', 'error', 'avatar sizes', 'tooltip'],
    props: ['EmptyState: icon, title, description, action, tone', 'Tooltip: content, side, delay'],
    a11y: 'EmptyState tone=error uses role=alert. Skeleton is aria-hidden; mark the loading region aria-busy. Tooltip opens on hover and keyboard focus.',
    responsive: 'EmptyState centers and limits line length to 44ch.',
    status: 'implemented',
    scenarios: [
      { name: 'Skeleton', render: () => <div aria-busy="true" className="grid max-w-md gap-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div> },
      { name: 'Empty and error', render: () => <div className="grid gap-3 md:grid-cols-2"><EmptyState icon="server" title="No services yet" description="Deploy your first server, bot or app to see it here." action={<Button variant="primary" leadingIcon="rocket-01">Deploy new</Button>} /><EmptyState tone="error" title="Couldn't load services" description="The request failed. Your services are unchanged." action={<Button variant="secondary" leadingIcon="refresh">Try again</Button>} /></div> },
      { name: 'Avatar, Kbd, Tooltip', render: () => <Row><Avatar initials="AM" /><Avatar initials="OP" tone="violet" /><Avatar initials="FL" tone="ink" size="lg" /><Kbd>⌘K</Kbd><Tooltip content="Copy server address"><IconButton label="Copy" icon="copy-01" variant="secondary" /></Tooltip></Row> },
    ],
  }),
];
