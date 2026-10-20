import { Menu } from '@base-ui/react/menu';
import { ContextMenu } from '@base-ui/react/context-menu';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Kbd } from '../primitives/Kbd';
import { menuItemStyles, menuLabelStyles, menuSeparatorStyles, popupSurface } from '../overlays/popup-styles';
import type { MenuEntry } from './menu-types';

/** Shared renderer so ActionMenu, DropdownButton, SplitButton and ContextMenu all behave and look the same. */
type Primitive = typeof Menu | typeof ContextMenu;

export function MenuEntries({ entries, parts = Menu }: { entries: MenuEntry[]; parts?: Primitive }) {
  const P = parts as typeof Menu;
  return (
    <>
      {entries.map((e) => {
        switch (e.kind) {
          case 'separator':
            return <P.Separator key={e.id} className={menuSeparatorStyles} />;
          case 'checkbox':
            return (
              <P.CheckboxItem key={e.id} checked={e.checked} onCheckedChange={e.onCheckedChange} disabled={e.disabled} closeOnClick={false} className={menuItemStyles}>
                <span className="grid size-5 place-items-center rounded-xs bg-s3 data-[checked]:bg-accent">
                  <P.CheckboxItemIndicator className="text-on-accent"><Icon name="tick-02" size={14} /></P.CheckboxItemIndicator>
                </span>
                {e.label}
              </P.CheckboxItem>
            );
          case 'radio-group':
            return (
              <P.RadioGroup key={e.id} value={e.value} onValueChange={(v) => e.onValueChange(String(v))}>
                {e.label ? <P.GroupLabel className={menuLabelStyles}>{e.label}</P.GroupLabel> : null}
                {e.options.map((o) => (
                  <P.RadioItem key={o.value} value={o.value} closeOnClick={false} className={menuItemStyles}>
                    <span className="grid size-5 place-items-center text-accent"><P.RadioItemIndicator><Icon name="tick-02" size={16} /></P.RadioItemIndicator></span>
                    {o.label}
                  </P.RadioItem>
                ))}
              </P.RadioGroup>
            );
          case 'group':
            return (
              <P.Group key={e.id}>
                <P.GroupLabel className={menuLabelStyles}>{e.label}</P.GroupLabel>
                <MenuEntries entries={e.items} parts={parts} />
              </P.Group>
            );
          case 'submenu':
            return (
              <P.SubmenuRoot key={e.id}>
                <P.SubmenuTrigger className={cn(menuItemStyles, 'data-[popup-open]:bg-s2')}>
                  {e.icon ? <Icon name={e.icon} size={18} /> : null}
                  <span className="flex-1">{e.label}</span>
                  <Icon name="arrow-right-01" size={16} />
                </P.SubmenuTrigger>
                <P.Portal>
                  <P.Positioner sideOffset={6} alignOffset={-6} className="z-[70]">
                    <P.Popup className={cn(popupSurface, 'min-w-[200px]')}>
                      <MenuEntries entries={e.items} parts={parts} />
                    </P.Popup>
                  </P.Positioner>
                </P.Portal>
              </P.SubmenuRoot>
            );
          default:
            return (
              <P.Item
                key={e.id}
                disabled={e.disabled}
                onClick={e.onSelect}
                title={e.disabled ? e.disabledReason : undefined}
                className={cn(menuItemStyles, e.tone === 'danger' && 'text-bad data-[highlighted]:bg-bad-bg data-[highlighted]:text-bad')}
              >
                {e.icon ? <Icon name={e.icon} size={18} /> : null}
                <span className="flex-1">{e.label}</span>
                {e.shortcut ? <Kbd>{e.shortcut}</Kbd> : null}
              </P.Item>
            );
        }
      })}
    </>
  );
}
