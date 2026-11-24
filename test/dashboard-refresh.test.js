import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptBlocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]);

test('dashboard inline JavaScript has valid syntax', () => {
  assert.equal(scriptBlocks.length, 1);
  assert.doesNotThrow(() => new Function(scriptBlocks[0]));
});

test('dashboard polls one latest document instead of repeatedly loading legacy history', () => {
  assert.match(html, /fetch\('\/api\/v1\/readings\/latest'/);
  assert.match(html, /setTimeout\(pollLatest, REFRESH_MS\)/);
  assert.doesNotMatch(html, /fetch\(['"]\/api\/data/);
  assert.doesNotMatch(html, /setInterval\(update, REFRESH_MS\)/);
});

test('dashboard history is paged explicitly and selected ranges do not fall back to all data', () => {
  assert.match(html, /fetch\(`\/api\/v1\/readings\?\$\{params\}`\)/);
  assert.match(html, /params\.set\('to'/);
  assert.match(html, /function loadOlderHistory\(\)/);
  assert.match(html, /const data = filteredByTime;/);
  assert.doesNotMatch(html, /filteredByTime\.length \? filteredByTime : allData/);
});

test('dashboard loads twenty samples once, grows the graph from latest polls and pages older data', async () => {
  const calls = [];
  const rendered = [];
  const sample = (i) => ({
    sampleId: `sample-${i}`, timestamp: new Date(Date.UTC(2026, 10, 24, 9, 0, i * 10)).toISOString(),
    powerW: i, energyImportTotalKwh: i / 1000, energyExportTotalKwh: 0,
  });
  let latestIndex = 41;
  const context = vm.createContext({
    console, URLSearchParams, rendered,
    document: { getElementById: () => ({ textContent: '' }) },
    setTimeout: () => 1, clearTimeout: () => {},
    fetch: async (url) => {
      calls.push(url);
      const parsed = new URL(url, 'http://dashboard.test');
      return { ok: true, status: 200, json: async () => {
        if (parsed.pathname.endsWith('/latest')) return sample(latestIndex++);
        assert.equal(parsed.searchParams.get('limit'), '20');
        const newest = parsed.searchParams.has('to') ? 20 : 40;
        return { readings: Array.from({ length: 20 }, (_, i) => sample(newest - i)) };
      } };
    },
  });
  vm.runInContext(scriptBlocks[0].replace(/startDashboard\(\);\s*$/, ''), context);
  vm.runInContext(`
    renderEmptyState = () => {};
    setDbStatus = () => {};
    updateHistoryLoadState = () => {};
    renderDashboard = (data) => rendered.push(data.length);
  `, context);
  await context.startDashboard();
  assert.equal(calls.length, 2);
  assert.equal(rendered.at(-1), 21);
  await context.pollLatest();
  assert.equal(calls.filter((url) => url.includes('/readings?')).length, 1);
  assert.equal(rendered.at(-1), 22);
  await context.loadOlderHistory();
  assert.equal(rendered.at(-1), 42);
  const olderUrl = new URL(calls.at(-1), 'http://dashboard.test');
  assert.equal(olderUrl.searchParams.get('to'),
    new Date(Date.parse(sample(21).timestamp) - 1).toISOString());
});
