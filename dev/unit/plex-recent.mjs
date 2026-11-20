// Plex recently added: header row is not a title, films and episodes become posters,
// tile gets poster background, and popup uses custom:casora-plex-recent-panel.
//   node dev/unit/plex-recent.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const win = {};
const box = { window: win, console, location: { origin: 'http://ha.local:8123' } };
vm.createContext(box);
vm.runInContext(read('../../custom_components/casora/scripts/local/51-plex-recent.js'), box);
const P = win.casoraPlexRecent;
assert.ok(P, 'module loads');

const header = { title_default: '$title', line1_default: '$episode' };
const states = {
  'sensor.plex_recently_added_movie': {
    state: 'Online',
    attributes: { data: [header, {
      title: 'Dune', airdate: new Date().toISOString(), poster: '/p/dune', aired: '2024-03-01',
    }, {
      title: 'Old', airdate: '2020-01-01T00:00:00Z', poster: '/p/old',
    }] },
  },
  'sensor.plex_recently_added_show': {
    state: 'Online',
    attributes: { data: [header, {
      title: 'Severance', episode: 'Hello', number: 'S02E01', airdate: new Date().toISOString(), poster: '/p/s1',
    }, {
      title: 'Severance', episode: 'Goodbye', number: 'S02E02', airdate: new Date(Date.now() - 3600e3).toISOString(), poster: '/p/s2',
    }] },
  },
};
const entity = { entity_id: 'sensor.plex_recently_added_movie' };
const fresh = P.fresh(states, entity, {});
assert.equal(fresh.length, 3, 'header and the old film stay out');
assert.equal(P.line(states, {}, entity), '3 neu');
const posters = P.pack(fresh);
assert.equal(posters.length, 2, 'two episodes of one series share a poster');
const show = posters.find((i) => i.title === 'Severance');
assert.equal(show.eps.length, 2);

const bg = P.tileBg(states, {}, entity);
assert.ok(bg.includes('cs-plex-bg') && bg.includes('http://ha.local:8123/p/'), 'tile background renders newest poster');
const pop = P.popup(states, {}, entity);
assert.equal(pop.type, 'custom:casora-plex-recent-panel', 'popup uses dedicated custom element');
assert.equal(pop.movies_entity, 'sensor.plex_recently_added_movie');
assert.equal(pop.shows_entity, 'sensor.plex_recently_added_show');

assert.equal(P.line({ 'sensor.plex_recently_added_movie': { attributes: { data: [header] } } }, {}, entity), 'Alles aktuell');
assert.equal(P.tileBg({ 'sensor.plex_recently_added_movie': { attributes: { data: [header] } } }, {}, entity), '');
assert.ok(read('../../custom_components/casora/scripts/casora-local.js').includes("'51-plex-recent'"), 'module in MODULES');
