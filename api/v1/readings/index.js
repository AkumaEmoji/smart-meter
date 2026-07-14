import { fetchReadingHistory } from '../../readings-store.js';
import { createHistoryHandler } from '../../v1-handlers.js';

export default createHistoryHandler({ fetchReadingHistory });
