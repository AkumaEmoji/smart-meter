import { fetchLatestReading } from '../../readings-store.js';
import { createLatestHandler } from '../../v1-handlers.js';

export default createLatestHandler({ fetchLatestReading });
