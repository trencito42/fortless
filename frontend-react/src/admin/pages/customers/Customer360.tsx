import { useMemo } from 'react';
import { Badge, Button, DescriptionList, EmptyState, Notice, Select, TextField, Timeline, type TimelineEvent, type MenuEntry, ActionMenu } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { DetailTabs } from '../../components/DetailTabs';
import { Columns, Fact, FactGrid, Section, Split } from '../../components/Cards';
import { Status, accountStatus, invoiceKey, invoiceStatus, lifecycle, orderStatus, riskLevel, runtime, subscriptionStatus, ticketStatus, priority } from '../../components/status';
import { RelatedTable } from '../../components/RelatedTable';
import { col } from '../../components/cols';
import { InvoiceLink, OrderLink, ServiceLink, TicketLink, NodeLink } from '../../components/entities';
import { MoneyByCurrency, MoneyText } from '../../components/Money';
import { NotesPanel } from '../../components/NotesPanel';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useCustomerStats } from '../../hooks/useStats';
import { date, dateTime, intervalLabel, relative } from '../../lib/format';
import type { AccountStatus, Customer, Invoice, Member, Order, SecurityEvent, Service, Subscription, Ticket } from '../../types';

const TABS = [
  { value: 'overview', label: 'Overview' }, { value: 'services', label: 'Services' }, { value: 'orders', label: 'Orders' }, { value: 'billing', label: 'Billing' }, { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'support', label: 'Support' }, { value: 'members', label: 'Members' }, { value: 'security', label: 'Security' }, { value: 'activity', label: 'Activity' }, { value: 'notes', label: 'Internal notes' },
];
const RESTRICTION_PRESETS = ['New orders blocked', 'Under payment dispute review', 'Awaiting verification documents', 'Support-only access', 'Outbound traffic limited'];

export default function Customer360({ id, tab = 'overview' }: { id: string; tab?: string }) {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const stats = useCustomerStats();
  const act = useActionDialog();
  const c = data.customers.find((x) => x.id === id);
  const st = stats.get(id);
  const services = useMemo(() => data.services.filter((s) => s.customerId === id), [data.services, id]);
  const orders = useMemo(() => data.orders.filter((o) => o.customerId === id), [data.orders, id]);
  const invoices = useMemo(() => data.invoices.filter((i) => i.customerId === id), [data.invoices, id]);
  const subs = useMemo(() => data.subscriptions.filter((s) => s.customerId === id), [data.subscriptions, id]);
  const tickets = useMemo(() => data.tickets.filter((t) => t.customerId === id), [data.tickets, id]);
  const events = useMemo(() => data.audit.filter((a) => a.accountId === id).slice(0, 40), [data.audit, id]);
  if (!c || !st) return <AdminPage title="Customer not found"><EmptyState title="No such account" description={`There is no account ${id} in the demo data.`} action={<Button onClick={() => nav('/customers')}>Back to customers</Button>} /></AdminPage>;
  const a = { type: 'account', id: c.id, label: c.name };

  const editDetails = () => act.run({
    title: 'Edit account details', description: 'Name, country and account type. Changing the owner’s email is a sensitive change and needs an approval request.', confirmLabel: 'Save details', permission: 'accounts:manage', reasonRequired: false,
    initial: { name: c.name, country: c.country, type: c.type },
    validate: (v) => ({ ...(v['name']!.trim().length < 2 ? { name: 'Name must be at least 2 characters.' } : {}), ...(!/^[A-Z]{2}$/.test(v['country']!) ? { country: 'Use a 2-letter ISO country code, e.g. DE.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Account name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} required /><TextField label="Country (ISO code)" value={values['country']} onChange={(e) => set('country', e.target.value.toUpperCase())} error={errors['country']} maxLength={2} required /><Select label="Account type" value={values['type']} onValueChange={(v) => set('type', v ?? 'individual')} options={[{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business' }]} /></div>,
    onConfirm: ({ values }) => { patch('customers', c.id, { name: values['name']!, country: values['country']!, type: values['type'] as Customer['type'] }); audit('account.details_updated', a, { accountId: c.id, before: { name: c.name, country: c.country }, after: { name: values['name']!, country: values['country']! } }); return 'Account details saved'; },
  });
  const editBilling = () => act.run({
    title: 'Edit billing profile', description: 'Legal details printed on future invoices. Issued invoices are immutable; corrections need a credit note.', confirmLabel: 'Save billing profile', permission: 'accounts:manage', stepUp: true,
    effects: ['Update the billing profile used for new invoices', 'Write a before/after entry to the audit log (VAT ID masked)'],
    initial: { legalName: c.billingProfile.legalName, addressLine: c.billingProfile.addressLine, city: c.billingProfile.city, postalCode: c.billingProfile.postalCode, vatId: c.billingProfile.vatId },
    validate: (v) => ({ ...(v['legalName']!.trim().length < 2 ? { legalName: 'Legal name is required.' } : {}), ...(v['vatId'] && !/^[A-Z]{2}[A-Z0-9]{6,12}$/.test(v['vatId']) ? { vatId: 'VAT ID looks invalid. Example: DE123456789.' } : {}), ...(!/^[A-Z0-9 -]{3,10}$/i.test(v['postalCode']!) ? { postalCode: 'Postal code looks invalid.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2">{([['legalName', 'Legal name'], ['addressLine', 'Address'], ['city', 'City'], ['postalCode', 'Postal code'], ['vatId', 'VAT ID']] as const).map(([k, l]) => <TextField key={k} label={l} value={values[k]} onChange={(e) => set(k, k === 'vatId' ? e.target.value.toUpperCase() : e.target.value)} error={errors[k]} className={k === 'legalName' || k === 'addressLine' ? 'sm:col-span-2' : ''} />)}</div>,
    onConfirm: ({ values }) => { patch('customers', c.id, (cur) => ({ billingProfile: { ...cur.billingProfile, legalName: values['legalName']!, addressLine: values['addressLine']!, city: values['city']!, postalCode: values['postalCode']!, vatId: values['vatId']! } })); audit('billing.profile_updated', a, { accountId: c.id, before: { vatId: c.billingProfile.vatId ? `${c.billingProfile.vatId.slice(0, 3)}••••` : '—' }, after: { vatId: values['vatId'] ? `${values['vatId'].slice(0, 3)}••••` : '—' } }); return 'Billing profile saved'; },
  });
  const changeStatus = (next?: AccountStatus) => act.run({
    title: 'Change account status', description: 'Restricted blocks new orders. Suspended also suspends every service. Closed schedules termination.', confirmLabel: 'Change status', permission: 'accounts:manage', stepUp: true, tone: 'danger',
    initial: { status: next ?? c.status },
    validate: (v): Record<string, string> => (v['status'] === c.status ? { status: 'Pick a status different from the current one.' } : {}),
    effects: ['Update the account status', 'Suspended or Closed: suspend or terminate running services through the provider (separate jobs)', 'Notify the customer by email'],
    fields: ({ values, set, errors }) => <Select label="New status" value={values['status']} error={errors['status']} onValueChange={(v) => set('status', v ?? c.status)} options={(['ACTIVE', 'RESTRICTED', 'SUSPENDED', 'CLOSED'] as AccountStatus[]).map((s) => ({ value: s, label: accountStatus[s]!.label }))} />,
    onConfirm: ({ values, reason }) => { const to = values['status'] as AccountStatus; patch('customers', c.id, { status: to }); audit('account.status_changed', a, { accountId: c.id, reason, before: { status: c.status }, after: { status: to } }); return `Account is now ${accountStatus[to]!.label.toLowerCase()}`; },
  });
  const restriction = (remove?: string) => act.run({
    title: remove ? 'Lift restriction' : 'Add restriction', description: remove ? remove : 'Restrictions limit what the account can do without changing its status.', confirmLabel: remove ? 'Lift restriction' : 'Add restriction', permission: 'accounts:manage', reasonRequired: true,
    initial: { r: RESTRICTION_PRESETS.find((x) => !c.restrictions.includes(x)) ?? RESTRICTION_PRESETS[0]! },
    fields: remove ? undefined : ({ values, set }) => <Select label="Restriction" value={values['r']} onValueChange={(v) => set('r', v ?? '')} options={RESTRICTION_PRESETS.map((x) => ({ value: x, label: x, disabled: c.restrictions.includes(x) }))} />,
    onConfirm: ({ values, reason }) => { patch('customers', c.id, (cur) => ({ restrictions: remove ? cur.restrictions.filter((x) => x !== remove) : [...cur.restrictions, values['r']!] })); audit(remove ? 'account.restriction_lifted' : 'account.restriction_added', a, { accountId: c.id, reason }); return remove ? 'Restriction lifted' : 'Restriction added'; },
  });
  const addNote = (body: string) => { patch('customers', c.id, (cur) => ({ notes: [{ id: `note_${Date.now().toString(36)}`, author: 'Maria Ilie', at: new Date().toISOString(), body }, ...cur.notes] })); audit('account.note_added', a, { accountId: c.id }); };
  const verification = () => act.run({
    title: 'Request identity verification', description: 'Asks the customer for documents. Adds a restriction until a staff member clears it.', confirmLabel: 'Send request', permission: 'accounts:manage', reasonRequired: true,
    effects: ['Add restriction “Awaiting verification documents”', 'Email the customer a secure upload link', 'Open a support ticket linked to the account'],
    onConfirm: ({ reason }) => { patch('customers', c.id, (cur) => ({ restrictions: cur.restrictions.includes('Awaiting verification documents') ? cur.restrictions : [...cur.restrictions, 'Awaiting verification documents'] })); audit('account.verification_requested', a, { accountId: c.id, reason }); return 'Verification requested'; },
  });
  const resetLink = () => act.run({ title: 'Send password reset email', description: 'Staff can never read or set a customer password. This only emails the account owner a one-time reset link.', confirmLabel: 'Send reset email', permission: 'accounts:manage', stepUp: true, effects: [`Email a one-time link to ${c.email}`, 'Existing sessions stay valid until the customer completes the reset'], onConfirm: ({ reason }) => { audit('auth.reset_link_sent', a, { accountId: c.id, reason }); return 'Reset email queued'; } });
  const signOutAll = () => act.run({ title: 'Sign out all sessions', description: 'Revokes every browser session of every member of this account.', confirmLabel: 'Revoke sessions', permission: 'accounts:manage', stepUp: true, tone: 'danger', onConfirm: ({ reason }) => { audit('auth.sessions_revoked', a, { accountId: c.id, reason }); return 'Sessions revoked'; } });

  const overflow: MenuEntry[] = [
    { id: 'status', label: 'Change account status…', icon: 'shield-user', tone: c.status === 'ACTIVE' ? 'danger' : 'default', disabled: !can('accounts:manage'), disabledReason: 'Requires accounts:manage', onSelect: () => changeStatus() },
    { id: 'restrict', label: 'Add restriction…', icon: 'lock', disabled: !can('accounts:manage'), onSelect: () => restriction() },
    { id: 'verify', label: 'Request identity verification…', icon: 'finger-print-scan', disabled: !can('accounts:manage'), onSelect: verification },
    { id: 'sep', kind: 'separator' },
    { id: 'tickets', label: 'Open support inbox for this customer', icon: 'message-01', onSelect: () => nav(`/customers/${c.id}/support`) },
  ];

  const checklist: Array<[string, boolean, string]> = [['Email verified', c.emailVerified, 'Required before ordering'], ['Owner has MFA', c.mfaEnabled, 'Recommended for business accounts'], ['Billing profile complete', !!c.billingProfile.legalName && !!c.billingProfile.addressLine, 'Needed for invoices'], ['No overdue invoices', st.overdueCount === 0, `${st.overdueCount} overdue`]];
  const svcCols = [
    col<Service>('name', 'Service', (s) => <ServiceLink id={s.id} />, { sort: (s) => s.name, primary: true }), col<Service>('plan', 'Plan', (s) => `${s.productName} · ${s.planName}`, { sort: (s) => s.planName }),
    col<Service>('lifecycle', 'Contract', (s) => <Status map={lifecycle} value={s.lifecycle} />, { sort: (s) => s.lifecycle }), col<Service>('runtime', 'Runtime', (s) => <Status map={runtime} value={s.runtime} />, { sort: (s) => s.runtime }), col<Service>('node', 'Node', (s) => <NodeLink id={s.nodeId} />, { hideOnMobile: true }),
  ];
  const orderCols = [
    col<Order>('id', 'Order', (o) => <OrderLink id={o.id} />, { sort: (o) => o.id, primary: true }), col<Order>('status', 'Status', (o) => <Status map={orderStatus} value={o.status} />, { sort: (o) => o.status }), col<Order>('total', 'Total', (o) => <MoneyText value={o.total} />, { sort: (o) => o.total.amount, numeric: true }), col<Order>('at', 'Placed', (o) => date(o.createdAt), { sort: (o) => o.createdAt }),
  ];
  const invCols = [
    col<Invoice>('n', 'Invoice', (i) => <InvoiceLink id={i.id} />, { sort: (i) => i.number, primary: true }), col<Invoice>('st', 'Status', (i) => <Status map={invoiceStatus} value={invoiceKey(i)} />, { sort: (i) => i.status }), col<Invoice>('tot', 'Total', (i) => <MoneyText value={i.total} />, { sort: (i) => i.total.amount, numeric: true }),
    col<Invoice>('due', 'Due', (i) => date(i.dueAt), { sort: (i) => i.dueAt }),
  ];
  const subCols = [
    col<Subscription>('s', 'Service', (s) => <ServiceLink id={s.serviceId} />, { primary: true }), col<Subscription>('st', 'Status', (s) => <Status map={subscriptionStatus} value={s.status} />, { sort: (s) => s.status }), col<Subscription>('i', 'Cycle', (s) => intervalLabel[s.interval], { sort: (s) => s.interval }),
    col<Subscription>('p', 'Price', (s) => <MoneyText value={s.price} />, { numeric: true, sort: (s) => s.price.amount }), col<Subscription>('e', 'Renews', (s) => date(s.currentPeriodEnd), { sort: (s) => s.currentPeriodEnd }), col<Subscription>('a', 'Auto-renew', (s) => (s.autoRenew ? 'On' : 'Off')),
  ];
  const tktCols = [
    col<Ticket>('id', 'Ticket', (t) => <span className="grid"><TicketLink id={t.id} /><span className="text-[12.5px] text-ink3">{t.subject}</span></span>, { primary: true, sort: (t) => t.id }), col<Ticket>('st', 'Status', (t) => <Status map={ticketStatus} value={t.status} />, { sort: (t) => t.status }), col<Ticket>('pr', 'Priority', (t) => <Status map={priority} value={t.priority} />, { sort: (t) => t.priority }), col<Ticket>('u', 'Updated', (t) => relative(t.updatedAt), { sort: (t) => t.updatedAt }),
  ];
  const methods = [...new Map(data.payments.filter((p) => p.customerId === id).map((p) => [`${p.method.brand}${p.method.last4}`, p.method])).values()].slice(0, 4);
  const timeline: TimelineEvent[] = events.map((e) => ({ id: e.id, title: <>{e.action.replace(/[._]/g, ' ')}{e.preview ? <Badge tone="warn" className="ml-2">preview</Badge> : null}</>, description: `${e.actor.name} · ${e.resource.label}${e.reason ? ` · “${e.reason}”` : ''}`, time: relative(e.at), iso: e.at, tone: e.result === 'success' ? 'neutral' : e.result === 'denied' ? 'warn' : 'bad', icon: e.actor.type === 'STAFF' ? 'user' : e.actor.type === 'USER' ? 'user-circle' : 'activity-01' }));

  return (
    <AdminPage detail title={c.name} crumbLabel={c.name} parents={[]} status={<><Status map={accountStatus} value={c.status} /><Status map={riskLevel} value={c.risk} /><Badge tone={c.type === 'business' ? 'violet' : 'neutral'}>{c.type === 'business' ? 'Business' : 'Individual'}</Badge><span className="font-mono text-[13px] font-semibold text-ink3">{c.id}</span></>}
      description={`${c.email} · ${c.country} · customer since ${date(c.createdAt)}`}
      actions={<><Button variant="secondary" leadingIcon="edit-02" onClick={editDetails} disabled={!can('accounts:manage')}>Edit</Button><Button variant="secondary" leadingIcon="invoice-01" onClick={editBilling} disabled={!can('accounts:manage')}>Billing profile</Button><ActionMenu label="More account actions" entries={overflow} /></>}>
      <DetailTabs base={`/customers/${c.id}`} tabs={TABS.map((t) => ({ ...t, ...(t.value === 'services' ? { badge: st.totalServices } : t.value === 'support' && st.openTickets ? { badge: st.openTickets } : t.value === 'notes' && c.notes.length ? { badge: c.notes.length } : {}) }))} current={tab} label="Customer sections" />
      {c.restrictions.length ? <Notice tone="warn" title="Active restrictions">{c.restrictions.map((r) => <span key={r} className="mr-2 inline-flex items-center gap-1.5">{r}{can('accounts:manage') ? <button type="button" className="rounded-sm font-bold underline" onClick={() => restriction(r)}>lift</button> : null}</span>)}</Notice> : null}

      {tab === 'overview' ? (
        <Split main={<>
          <Section title="Account health">
            <FactGrid cols={4}>
              <Fact label="Active services">{st.activeServices} of {st.totalServices}</Fact>
              <Fact label="Outstanding" tone={st.outstanding.length ? 'warn' : undefined}><MoneyByCurrency values={st.outstanding} empty="Nothing owed" /></Fact>
              <Fact label="Paid to date (net of refunds)"><MoneyByCurrency values={st.lifetime} /></Fact>
              <Fact label="Credit balance"><MoneyText value={c.creditBalance} /></Fact>
              <Fact label="Orders">{st.orders}</Fact><Fact label="Open tickets">{st.openTickets}</Fact>
              <Fact label="Last sign-in">{relative(c.lastLoginAt)}</Fact><Fact label="Billing currency">{c.currency}</Fact>
            </FactGrid>
          </Section>
          <Section title="Recent services" actions={<Button size="sm" variant="ghost" onClick={() => nav(`/customers/${c.id}/services`)}>All</Button>}><RelatedTable rows={services.slice(0, 5)} columns={svcCols} getRowId={(s) => s.id} caption="Recent services" pageSize={5} empty="No services yet." /></Section>
        </>} aside={<>
          <Section title="Verification checklist"><ul className="grid gap-2">{checklist.map(([l, ok, hint]) => <li key={l} className="flex items-start justify-between gap-3"><span><span className="font-bold">{l}</span><span className="block text-[12.5px] text-ink3">{hint}</span></span><Badge tone={ok ? 'good' : 'warn'}>{ok ? 'Done' : 'Open'}</Badge></li>)}</ul><div className="mt-3"><Button size="sm" variant="secondary" onClick={verification} disabled={!can('accounts:manage')}>Request verification…</Button></div></Section>
          <Section title="Account owner"><DescriptionList items={[{ label: 'Name', value: c.members[0]?.name ?? '—' }, { label: 'Email', value: c.members[0]?.email ?? '—', copy: c.members[0]?.email }, { label: 'MFA', value: c.members[0]?.mfa ? 'Enabled' : 'Not enabled' }, { label: 'Members', value: c.members.length }]} /></Section>
        </>} />
      ) : null}
      {tab === 'services' ? <Section title="Services"><RelatedTable rows={services} columns={svcCols} getRowId={(s) => s.id} caption="Customer services" empty="This customer has no services." /></Section> : null}
      {tab === 'orders' ? <Section title="Orders"><RelatedTable rows={orders} columns={orderCols} getRowId={(o) => o.id} caption="Customer orders" onRowClick={(o) => nav(`/orders/${o.id}`)} empty="No orders." /></Section> : null}
      {tab === 'billing' ? (
        <Split main={<Section title="Invoices"><RelatedTable rows={invoices} columns={invCols} getRowId={(i) => i.id} caption="Customer invoices" onRowClick={(i) => nav(`/billing/invoices/${i.id}`)} empty="No invoices." /></Section>} aside={<>
          <Section title="Billing profile" actions={<Button size="sm" variant="secondary" onClick={editBilling} disabled={!can('accounts:manage')}>Edit</Button>}>
            <DescriptionList items={[{ label: 'Legal name', value: c.billingProfile.legalName }, { label: 'Address', value: `${c.billingProfile.addressLine}, ${c.billingProfile.postalCode} ${c.billingProfile.city}` }, { label: 'Country', value: c.billingProfile.country }, { label: 'VAT ID', value: c.billingProfile.vatId || '—', mono: true }, { label: 'Tax exempt', value: c.billingProfile.taxExempt ? 'Yes' : 'No' }, { label: 'Credit balance', value: <MoneyText value={c.creditBalance} /> }]} />
          </Section>
          <Section title="Payment methods" description="Brand and last four digits only. Card numbers are never stored or shown."><ul className="grid gap-1.5">{methods.length ? methods.map((m) => <li key={`${m.brand}${m.last4}`} className="rounded-md bg-s2 px-3 py-2 font-semibold">{m.brand} •••• {m.last4}</li>) : <li className="text-ink3">No payment method used yet.</li>}</ul></Section>
        </>} />
      ) : null}
      {tab === 'subscriptions' ? <Section title="Subscriptions"><RelatedTable rows={subs} columns={subCols} getRowId={(s) => s.id} caption="Customer subscriptions" empty="No subscriptions." /></Section> : null}
      {tab === 'support' ? <Section title="Tickets" actions={<Button size="sm" variant="secondary" onClick={() => nav('/support')}>Open inbox</Button>}><RelatedTable rows={tickets} columns={tktCols} getRowId={(t) => t.id} caption="Customer tickets" onRowClick={(t) => nav(`/support/tickets/${t.id}`)} empty="No tickets." /></Section> : null}
      {tab === 'members' ? (
        <Section title="Members" description="People who can sign in to this account. Roles are the customer’s own; staff cannot change a member’s password.">
          <RelatedTable rows={c.members} getRowId={(m) => m.id} caption="Account members" columns={[
            col<Member>('n', 'Member', (m) => <span className="grid"><b>{m.name}</b><span className="text-[12.5px] text-ink3">{m.email}</span></span>, { primary: true, sort: (m) => m.name }), col<Member>('r', 'Role', (m) => <Badge>{m.role}</Badge>, { sort: (m) => m.role }),
            col<Member>('mfa', 'MFA', (m) => <Badge tone={m.mfa ? 'good' : 'warn'}>{m.mfa ? 'Enabled' : 'Off'}</Badge>, { sort: (m) => String(m.mfa) }), col<Member>('l', 'Last sign-in', (m) => relative(m.lastLoginAt), { sort: (m) => m.lastLoginAt ?? '' }), col<Member>('s', 'Status', (m) => <Badge tone={m.status === 'active' ? 'good' : m.status === 'invited' ? 'info' : 'neutral'}>{m.status}</Badge>),
          ]} />
        </Section>
      ) : null}
      {tab === 'security' ? (
        <Columns>
          <Section title="Authentication"><DescriptionList items={[{ label: 'Email verified', value: c.emailVerified ? 'Yes' : 'No' }, { label: 'Owner MFA', value: c.mfaEnabled ? 'Enabled' : 'Not enabled' }, { label: 'Members with MFA', value: `${c.members.filter((m) => m.mfa).length} of ${c.members.length}` }, { label: 'Last sign-in', value: dateTime(c.lastLoginAt) }]} />
            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={resetLink} disabled={!can('accounts:manage')}>Send password reset email…</Button><Button size="sm" variant="danger-subtle" onClick={signOutAll} disabled={!can('accounts:manage')}>Sign out all sessions…</Button></div></Section>
          <Section title="Staff access to credentials"><Notice tone="info" title="Passwords are never visible to staff">Staff cannot read, set or reset a customer password, see MFA secrets or recovery codes, or view API key values. The only available actions send the owner a link or revoke sessions, and both are audited.</Notice></Section>
          <Section title="Security events"><RelatedTable rows={data.security.filter((s) => s.accountId === id)} getRowId={(s) => s.id} caption="Security events for this account" empty="No security events." columns={[col<SecurityEvent>('t', 'When', (s) => relative(s.at), { sort: (s) => s.at, primary: true }), col<SecurityEvent>('k', 'Event', (s) => s.kind.replace(/_/g, ' ')), col<SecurityEvent>('d', 'Detail', (s) => s.detail), col<SecurityEvent>('ip', 'IP', (s) => <span className="font-mono text-[13px]">{s.ip}</span>, { hideOnMobile: true })]} /></Section>
        </Columns>
      ) : null}
      {tab === 'activity' ? <Section title="Activity" description="Audit events for this account, newest first.">{timeline.length ? <Timeline events={timeline} label="Account activity" /> : <p className="text-ink3">No activity recorded.</p>}</Section> : null}
      {tab === 'notes' ? <Section title="Internal notes"><NotesPanel notes={c.notes} onAdd={addNote} /></Section> : null}
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
