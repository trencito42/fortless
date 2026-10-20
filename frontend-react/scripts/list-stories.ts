// Writes tests/story-ids.json from the registry so tests and workbench stay in sync.
import { writeFileSync } from 'node:fs';
import { STORIES } from '../src/workbench/stories/index';

writeFileSync(new URL('../tests/story-ids.json', import.meta.url), JSON.stringify(STORIES.map((s) => s.id), null, 2));
console.log(`${STORIES.length} stories`);
