import { StartupEditor, type StartupConfig } from '@/features';
import { useService } from '../context';
import { mapStartup } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';

/**
 * Startup variables and Docker image. The startup COMMAND is read-only: the backend exposes no route to change it
 * (only PUT /startup/variable and PUT /startup/image), so the editor shows it locked instead of pretending to save it.
 */
export function StartupTab() {
  const { id, ports, can } = useService();
  const res = useResource(async (s) => {
    const [startup, settings] = await Promise.all([ports.startup.get(id, s), ports.settings.get(id, s)]);
    return { startup, image: settings.image };
  }, [id, ports]);
  return (
    <ResourceView res={res} reload={res.reload} label="Loading startup">
      {({ startup, image }) => {
        const m = mapStartup(startup, image);
        const images = m.images.some((i) => i.value === image) ? m.images : [{ value: image, label: image }, ...m.images];
        const canVars = can('startup.update'); const canImage = can('startup.docker-image');
        const save = async (draft: StartupConfig) => {
          const failed: string[] = [];
          for (const v of draft.variables) {
            const before = m.initial.variables.find((x) => x.key === v.key);
            if (!before || before.value === v.value || v.editable === false) continue;
            try { await ports.startup.setVariable(id, v.key, v.value); } catch (e) { failed.push(`${v.label}: ${e instanceof Error ? e.message : 'failed'}`); }
          }
          if (draft.dockerImage !== image) { try { await ports.startup.setImage(id, draft.dockerImage); } catch (e) { failed.push(`Docker image: ${e instanceof Error ? e.message : 'failed'}`); } }
          res.refresh();
          if (failed.length) throw new Error(`Some changes were not saved. ${failed.join(' ')}`);
        };
        return <StartupEditor key={JSON.stringify(m.initial)} initial={m.initial} images={images} commandEditable={false} onSave={save}
          disabledReason={canVars || canImage ? undefined : 'Your access level can view startup settings but not change them.'} />;
      }}
    </ResourceView>
  );
}
