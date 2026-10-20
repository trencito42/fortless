import type { StoryDef } from '../types';
import { primitiveStories } from './primitives';
import { actionStories } from './actions';
import { formStories } from './forms';
import { overlayStories } from './overlays';
import { navigationStories } from './navigation';
import { dataStories } from './data';
import { chartStories } from './charts';
import { technicalStories } from './technical';
import { featureStories } from './features';
import { featureStories2 } from './features2';
import { commerceStories } from './commerce';
import { advancedStories } from './advanced';
import { viewStories } from './views';

export const STORIES: StoryDef[] = [...primitiveStories, ...actionStories, ...formStories, ...overlayStories, ...navigationStories, ...dataStories, ...chartStories, ...technicalStories, ...featureStories, ...featureStories2, ...advancedStories, ...commerceStories, ...viewStories];
