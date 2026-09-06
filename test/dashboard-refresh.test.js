import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

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
