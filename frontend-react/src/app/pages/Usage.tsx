import { Button, Notice } from '@/design-system';
import { PageHeader } from '../components/PageHeader';
import { CapabilityNote } from '../components/CapabilityNote';
import { useNavigate } from '../router';

export default function Usage() {
  const navigate = useNavigate();
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Usage" description="Historical resource usage across your services." />
      <CapabilityNote area="usage" />
      <Notice tone="info" title="Live metrics remain available per service">Open a service to inspect the current CPU, memory, disk and network metrics returned by its provider.</Notice>
      <div><Button variant="primary" onClick={() => navigate('/app/services')}>Open services</Button></div>
    </div>
  );
}
