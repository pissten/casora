// Adaptive Lighting on a tile: which lamps (via attributes or WS map), and whether play or pause is showing.
//   node dev/unit/adaptive-lighting.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const win = {};
const box = { window: win, console };
vm.createContext(box);
vm.runInContext(read('../../custom_components/casora/scripts/local/49-adaptive-lighting.js'), box);
const A = win._casoraAdaptive;
assert.ok(A, 'module loads');
assert.equal(A._booted, undefined, 'does not mount without a document');

const states = {
  'switch.al_stue': {
    state: 'off',
    attributes: {
      configuration: { lights: ['light.stue', 'light.kjokken'] },
      manual_control: ['light.stue'],
    },
  },
  // Real HA default: include_config_in_attributes is False -> configuration is {}
  'switch.al_bad': {
    state: 'on',
    attributes: {
      configuration: {},
      manual_control: [],
    },
  },
  'switch.other': { state: 'on', attributes: { friendly_name: 'Other' } },
  'light.stue': { state: 'on', attributes: { entity_id: ['light.lampe_a', 'light.lampe_b'] } },
  'light.bad_gruppe': { state: 'off', attributes: { entity_id: ['light.downlights_bad'] } },
};
const entities = {
  'switch.al_stue': { platform: 'adaptive_lighting' },
  'switch.al_bad': { platform: 'adaptive_lighting' },
};
const wsMap = { 'switch.al_bad': ['light.downlights_bad'] };

const list = A.switches(states, entities, wsMap);
assert.equal(list.length, 2, 'both attribute-configured and WS-mapped switches count');
const map = A.index(list);
assert.equal(map['light.stue'][0].paused, true);
assert.equal(map['light.kjokken'][0].paused, false);
assert.equal(map['light.downlights_bad'][0].paused, false);
assert.equal(map['light.lampe_a'], undefined);

const one = A.plan(['light.kjokken'], map);
assert.equal(one.paused, false, 'a running lamp shows pause');
assert.equal(one.switches.length, 1);
assert.equal(one.switches[0].id, 'switch.al_stue');
assert.equal(one.switches[0].lights.join(','), 'light.kjokken');
assert.equal(A.plan(['light.stue'], map).paused, true, 'a lamp in manual_control shows play');
assert.equal(A.plan(['light.ingen'], map), null);
assert.equal(A.plan(['light.stue', 'light.kjokken'], map).paused, false, 'play only when every lamp is paused');

const ids = A.collect(states['light.stue'] && Object.assign({ entity_id: 'light.stue' }, states['light.stue']), states, {
  lights: ['light.kjokken'],
  toggle_entity: 'light.stue',
}, function () { return ['light.lampe_a']; });
assert.equal(ids.join(','), 'light.lampe_a,light.stue,light.lampe_b,light.kjokken');
assert.equal(A.plan(ids, map).paused, false, 'a room tile follows every lamp it stands for');

const badIds = A.collect(Object.assign({ entity_id: 'light.bad_gruppe' }, states['light.bad_gruppe']), states, {}, null);
assert.equal(A.plan(badIds, map).switches[0].id, 'switch.al_bad', 'group tile matches WS-mapped Adaptive Lighting switch');

assert.ok(read('../../custom_components/casora/scripts/casora-local.js').includes("'49-adaptive-lighting'"), 'module in MODULES');
assert.ok(!read('../../custom_components/casora/scripts/local/49-adaptive-lighting.js').includes('setInterval'), 'no dashboard scan on a timer');
