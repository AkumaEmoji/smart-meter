import { spawnSync } from 'node:child_process';

const files = [
  'index.js',
  'api/data.js',
  'api/firebase.js',
  'api/ingestion.js',
  'api/readings.js',
  'api/readings-store.js',
  'api/v1-handlers.js',
  'api/v1/capabilities.js',
  'api/v1/readings/index.js',
  'api/v1/readings/latest.js',
  'meter.cjs',
  'meter-obis.cjs',
  'hardware/index-firebase.js',
  'hardware/logger_sqlite.js',
  'hardware/SQLtest.js',
  'hardware/simulate.js',
  'test/data-handler.test.js',
  'test/ingestion.test.js',
  'test/meter-obis.test.js',
  'test/readings.test.js',
  'test/v1-handlers.test.js',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} files.`);
