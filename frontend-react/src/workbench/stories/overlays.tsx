import { defineStory } from '../types';
import { Button, Dialog, DialogClose, AlertDialog, Popover, HoverCard, Tooltip, IconButton, TextField, Avatar } from '@/design-system';
import { Row, Stack } from '../layout';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const overlayStories = [
  defineStory({
    id: 'dialog',
    title: 'Dialog',
    category: 'Overlays',
    layer: 'A: primitive',
    purpose: 'Modal surface for forms and detail. Becomes a bottom sheet below md. Also covers the drawer placement.',
    source: 'Fortless Views.html: modal and drawer overlays',
    variants: ['dialog (centered)', 'drawer (right side)', 'sizes sm/md/lg/xl', 'controlled'],
    props: ['title: string', 'description?: ReactNode', 'trigger? / open? / onOpenChange?', 'footer?: ReactNode', 'placement: dialog | drawer', 'size', 'hideClose?'],
    a11y: 'Focus trap, focus returns to the trigger, Escape and outside press dismiss, scroll lock, labelled by title (Base UI).',
    responsive: 'Bottom sheet below md with full-width stacked actions.',
    status: 'partial',
    gaps: 'No swipe-to-dismiss on the bottom sheet. Not yet tested on a real touch device.',
    scenarios: [
      {
        name: 'Dialog with form',
        render: () => (
          <Dialog
            trigger={<Button variant="primary">Rename server</Button>}
            title="Rename server"
            description="The name is only shown in your panel."
            footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><DialogClose render={<Button variant="primary">Save name</Button>} /></>}
          >
            <TextField label="Server name" defaultValue="survival-eu" />
          </Dialog>
        ),
      },
      {
        name: 'Drawer',
        render: () => (
          <Dialog trigger={<Button variant="secondary">Open details</Button>} title="Server details" placement="drawer" description="Right-side panel on desktop, sheet on mobile.">
            <Stack><p className="text-ink2">Plan: Standard · Region: Frankfurt</p></Stack>
          </Dialog>
        ),
      },
    ],
  }),
  defineStory({
    id: 'alert-dialog',
    title: 'AlertDialog',
    category: 'Overlays',
    layer: 'A: primitive',
    purpose: 'Interrupting confirmation for destructive or irreversible actions, with optional typed confirmation.',
    source: 'Fortless Views.html: delete server confirmation',
    variants: ['default', 'danger', 'requireText', 'async confirm with error'],
    props: ['trigger', 'title', 'description', 'confirmLabel', 'tone', 'requireText?', 'onConfirm: () => void | Promise<void>'],
    a11y: 'role=alertdialog, cannot be dismissed by outside press, focus starts on the safe choice.',
    responsive: 'Same bottom sheet behavior as Dialog.',
    status: 'implemented',
    gaps: 'Not yet tested on a real touch device.',
    scenarios: [
      {
        name: 'Typed confirmation',
        render: () => (
          <AlertDialog trigger={<Button variant="danger-subtle" leadingIcon="delete-02">Delete server</Button>} title="Delete survival-eu?" description="The server and its files are removed. This cannot be undone." confirmLabel="Delete server" tone="danger" requireText="survival-eu" onConfirm={() => wait(600)} />
        ),
      },
      {
        name: 'Failing action',
        note: 'The simulated request fails, the dialog stays open and shows the error.',
        render: () => (
          <AlertDialog trigger={<Button variant="secondary">Suspend (fails)</Button>} title="Suspend server?" description="Players are disconnected." confirmLabel="Suspend" onConfirm={async () => { await wait(500); throw new Error('The node did not respond. Try again.'); }} />
        ),
      },
    ],
  }),
  defineStory({
    id: 'popover-tooltip',
    title: 'Popover, HoverCard and Tooltip',
    category: 'Overlays',
    layer: 'A: primitive',
    purpose: 'Anchored floating content: Popover for interactive content, HoverCard for previews, Tooltip for short labels.',
    source: 'new (Petal floating layer: hairline ring, no shadow)',
    variants: ['Popover', 'HoverCard', 'Tooltip sides'],
    props: ['trigger', 'children', 'side / align', 'Tooltip: content, delay'],
    a11y: 'Popover is focus-managed and closes on Escape. Tooltip appears on hover and keyboard focus. HoverCard is a hover enhancement only; its content must exist elsewhere for touch.',
    responsive: 'Collision-aware positioning. Never the only place critical information lives on touch.',
    status: 'partial',
    gaps: 'Not yet tested on touch devices.',
    scenarios: [
      {
        name: 'Anchored',
        render: () => (
          <Row>
            <Popover trigger={<Button variant="secondary">Popover</Button>} title="Share access"><p className="text-ink2">Invite a teammate by email.</p></Popover>
            <HoverCard trigger={<Button variant="ghost">Hover card</Button>}>
              <div className="flex items-center gap-3"><Avatar initials="AM" /><div><b>Alex Morgan</b><p className="text-ink2">Owner</p></div></div>
            </HoverCard>
            <Tooltip content="Restart server"><IconButton label="Restart" icon="refresh" variant="secondary" /></Tooltip>
          </Row>
        ),
      },
    ],
  }),
];
