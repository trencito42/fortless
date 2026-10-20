import { Notice } from '@/design-system';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';

export default function ApiKeys() {
  return (
    <div className="grid max-w-4xl gap-5">
      <PageHeader title="API keys" description="Keys let scripts and CI act on your account." crumbs={[{ label: 'Account', to: '/app/account' }, { label: 'API keys' }]} />
      <CapabilityNote area="account" />
      <Notice tone="info" title="Customer API keys not supported">Fortless does not expose customer API keys. Automated deployments and infrastructure provisioning are orchestrated directly by the Fortless backend engine.</Notice>
    </div>
  );
}
