// Floor & climate tile helpers:
// - 21°C (22°C) standard format
// - primary + secondary sensor view (Room + Floor)
// - demand badge with % unit
// - casora_thermostat popup outer + inner template compilation
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const win = {
  casoraClimateActive: (e) => ({
    heating: e && e.state === 'heat' && (e.attributes && e.attributes.hvac_action) === 'heating',
    cooling: e && e.state === 'cool',
  }),
};
const box = { window: win, console };
vm.createContext(box);
vm.runInContext(read('../../custom_components/casora/scripts/local/50-floor.js'), box);
const F = win._casoraFloor;
assert.ok(F, 'module loads');
assert.equal(F._booted, undefined, 'does not mount without a document');

const states = {
  'sensor.gulv': { state: '27.4', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.rom': { state: '21.5', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
  'number.gulv_settpunkt': { state: '28', attributes: { unit_of_measurement: '°C' } },
  'binary_sensor.paa': { state: 'on', attributes: {} },
  'sensor.av': { state: 'off', attributes: {} },
  'sensor.pst': { state: '40', attributes: { unit_of_measurement: '%' } },
  'sensor.pi': { state: '128', attributes: {} },
  'sensor.tom': { state: 'unavailable', attributes: {} },
};

assert.equal(F.reading({ climate_main: 'room', floor_sensor: 'sensor.gulv' }, states), null);
assert.equal(F.reading({ climate_main: 'floor', floor_sensor: 'sensor.gulv' }, states).prefix, '27,4°C · ');
assert.equal(F.reading({ climate_main: 'floor', floor_sensor: 'sensor.gulv', floor_target: 'number.gulv_settpunkt' }, states).prefix, '27,4°C (28°C) · ');
assert.equal(F.reading({ climate_main: 'floor' }, states), null, 'floor without a sensor keeps the room reading');

// Standard 21°C (22°C) + primary/secondary view on climate tiles
const climateEntity = {
  entity_id: 'climate.bad_climate',
  state: 'heat',
  attributes: { current_temperature: 22, temperature: 23, hvac_action: 'heating', unit_of_measurement: '°C' },
};

// 1) Room is main, Floor is secondary
const roomMainHtml = F.tileState(climateEntity, {
  climate_main: 'room',
  floor_sensor: 'sensor.gulv',
  floor_target: 'number.gulv_settpunkt',
}, states);
assert.ok(roomMainHtml.includes('22° → 23° · Heizt'), 'primary shows room measured -> target · state: ' + roomMainHtml);
assert.ok(roomMainHtml.includes('Fußboden') && roomMainHtml.includes('27,4° → 28°'), 'secondary shows floor measured -> target: ' + roomMainHtml);

// 2) Floor is main, Room is secondary
const floorMainHtml = F.tileState(climateEntity, {
  climate_main: 'floor',
  temp_sensor: 'sensor.rom',
  floor_sensor: 'sensor.gulv',
  floor_target: 'number.gulv_settpunkt',
}, states);
assert.ok(floorMainHtml.includes('27,4° → 28° · Heizt'), 'primary shows floor measured -> target · state: ' + floorMainHtml);
assert.ok(floorMainHtml.includes('Raum') && floorMainHtml.includes('21,5° → 23°'), 'secondary shows room measured -> target: ' + floorMainHtml);

// 3) Standard climate tile without floor sensor
const simpleHtml = F.tileState(climateEntity, {}, states);
assert.ok(simpleHtml.includes('22° → 23° · Heizt'), 'standard climate tile shows measured -> target: ' + simpleHtml);
assert.ok(!simpleHtml.includes('cs-clim-sec'), 'no secondary line when no floor sensor');

assert.equal(F.demand(states, 'binary_sensor.paa').kind, 'bool');
assert.equal(F.demand(states, 'binary_sensor.paa').pct, 100);
assert.equal(F.demand(states, 'sensor.av').pct, 0);
assert.equal(F.demand(states, 'sensor.pst').pct, 40);
assert.equal(Math.round(F.demand(states, 'sensor.pi').pct), 50);
assert.equal(F.demand(states, 'sensor.tom'), null);

const html = F.group(null, { floor_sensor: 'sensor.gulv', floor_target: 'number.gulv_settpunkt', floor_demand: 'sensor.pst' }, states, climateEntity);
assert.ok(html.includes('Fußbodentemperatur'), 'floor row');
assert.ok(html.includes('27,4°C (28°C)'), 'floor row includes setpoint in parentheses');
assert.ok(html.includes('40 %'), 'percent demand');
assert.equal(F.group(null, {}, states), '', 'nothing chosen, nothing shown');

// Validate compiled casora_thermostat popup outer + inner JS syntax so popups never break
const bundle = JSON.parse(read('../../custom_components/casora/panel/casora-templates.json'));
const thermo = bundle.templates.casora_thermostat;
for (const actionKey of ['tap_action', 'hold_action']) {
  const outerJs = thermo[actionKey].casora_popup.content.trim().slice(3, -3);
  const outerFn = new vm.Script(`(function(entity, states, hass, variables, window, localStorage){\n${outerJs}\n})`).runInNewContext({});
  const popupCfg = outerFn(
    climateEntity,
    states,
    { entities: {}, devices: {}, areas: {} },
    { floor_sensor: 'sensor.gulv', floor_demand: 'sensor.pst' },
    { _casoraUI: { tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', font: 'sans-serif' }, soft: () => true, stage: () => '', hero: () => '', settings: () => '' } },
    { getItem: () => 'v3' },
  );
  for (const card of popupCfg.cards) {
    const body = String(card.custom_fields.body || '').trim();
    if (body.startsWith('[[[')) {
      const innerJs = body.slice(3, -3);
      new vm.Script(`(function(entity, states, hass, variables, window, localStorage){\n${innerJs}\n})`);
    }
  }
}

assert.ok(read('../../custom_components/casora/scripts/casora-local.js').includes("'50-floor'"), 'module in MODULES');
assert.ok(!read('../../custom_components/casora/scripts/local/50-floor.js').includes('setInterval'), 'no dashboard scan on a timer');

// Dynamic climate_main_entity switching between room and floor
const switchStates = {
  ...states,
  'input_boolean.bad_gulv_hoved': { state: 'on', attributes: {} },
};
assert.equal(F.resolveMain({ climate_main: 'room', climate_main_entity: 'input_boolean.bad_gulv_hoved' }, switchStates), 'floor');
const dynamicFloorHtml = F.tileState(climateEntity, {
  climate_main: 'room',
  climate_main_entity: 'input_boolean.bad_gulv_hoved',
  temp_sensor: 'sensor.rom',
  floor_sensor: 'sensor.gulv',
  floor_target: 'number.gulv_settpunkt',
}, switchStates);
assert.ok(dynamicFloorHtml.includes('27,4° → 28° · Heizt'), 'entity=on switches primary to floor');
assert.ok(dynamicFloorHtml.includes('Raum') && dynamicFloorHtml.includes('21,5° → 23°'), 'entity=on moves room to secondary');
