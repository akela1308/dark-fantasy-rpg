import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('все JSON данных читаются', () => {
  for (const f of fs.readdirSync('src/data').filter(f => f.endsWith('.json'))) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(`src/data/${f}`, 'utf8')), f);
  }
});
