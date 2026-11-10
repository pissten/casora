// Shared row span for a custom card that must show all of its lines.
//   node dev/unit/grow.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
const body = src.match(/function casoraGrowSpan\(height, row, gap\) \{([\s\S]*?)\n\}/);
assert.ok(body, 'span function is in smart-row');
const casoraGrowSpan = new Function('height', 'row', 'gap', body[1]);

assert.equal(casoraGrowSpan(20, 66, 8), 0, 'a card that has not drawn yet is left alone');
assert.equal(casoraGrowSpan(66, 66, 8), 2);
assert.equal(casoraGrowSpan(300, 66, 8), 5);
assert.equal(casoraGrowSpan(5000, 66, 8), 16, 'a very tall card stops at 16 rows');
assert.ok(src.includes('window.casoraWatchGrow'), 'one watcher for both grids');
assert.ok(!src.includes('grid-column:1 / -1'), 'a card keeps its own width');
assert.ok(!fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8').includes('grid-column:1 / -1'));
