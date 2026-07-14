import { createCapabilitiesHandler } from '../v1-handlers.js';
import { fetchLatestReading } from '../readings-store.js';

export default createCapabilitiesHandler({ fetchLatestReading });
