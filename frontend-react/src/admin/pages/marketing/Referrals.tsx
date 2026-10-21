import { Notice, NumberField, Select, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { Unsupported } from '../../components/PreviewNote';

/** Architecture of the view only. Every control is disabled and no number is invented: the backend has no referral or affiliate model. */
export default function Referrals() {
  return (
    <AdminPage title="Referrals & affiliates" description="Planned view for rewarding customers who bring new customers." status={<span className="rounded-full bg-warn-bg px-3 py-1 text-[12px] font-bold text-warn">Not supported</span>}>
      <Unsupported title="Needs backend support before it can work">There is no referral code, attribution, reward ledger or payout model in the backend. This page shows how the view will be organised; nothing here saves, simulates or displays data.</Unsupported>
      <Columns>
        <Section title="Programme settings (planned)" description="Disabled until a reward ledger exists."><div className="grid gap-3"><Switch label="Programme enabled" checked={false} disabled description="Needs a referral model" /><Select label="Reward type" value="credit" disabled options={[{ value: 'credit', label: 'Account credit' }, { value: 'discount', label: 'Discount on next invoice' }]} /><NumberField label="Reward amount (minor units)" value={null} disabled placeholder="—" description="Stored in integer minor units per currency" /><NumberField label="Minimum referred spend" value={null} disabled placeholder="—" /></div></Section>
        <Section title="Planned screens"><ul className="grid gap-2 text-ink2"><li><b>Referrers</b>: customers with codes, referred count, credit earned</li><li><b>Attribution</b>: signup → first paid invoice, with fraud checks (same card, same IP)</li><li><b>Rewards ledger</b>: credit issued, reversed on refund or chargeback</li><li><b>Affiliates</b>: partners with payout terms (needs payout and tax handling)</li></ul></Section>
      </Columns>
      <Notice tone="info" title="Guardrails to design first">Rewards must be reversed when the referred payment is refunded or disputed, referrers cannot refer their own accounts, and every credit is an auditable ledger entry.</Notice>
    </AdminPage>
  );
}
