// Adaptive Lighting on a tile: an Adaptive Lighting mark + play/pause button in the top-right
// (directly underneath the tile's toggle switch when visible, or in the toggle slot when not).
// Every light the tile stands for (one lamp, a group, a room, the house) is included when an
// adaptive_lighting switch lists it, whether that switch or lamp is currently on or off.
(function () {
  if (typeof window === 'undefined') return;

  function lightsOf(cfg) {
    if (!cfg) return [];
    if (typeof cfg === 'string') {
      try { cfg = JSON.parse(cfg); } catch (e) { return []; }
    }
    var lights = cfg && cfg.lights;
    if (!Array.isArray(lights)) return [];
    return lights.filter(function (x) { return typeof x === 'string' && x.indexOf('.') > 0; });
  }

  function manualOf(list) {
    var out = {};
    if (!Array.isArray(list)) return out;
    list.forEach(function (x) { if (typeof x === 'string') out[x] = true; });
    return out;
  }

  function regOf(entities, id) {
    if (!entities) return null;
    if (typeof entities.get === 'function') {
      var got = entities.get(id);
      if (got) return got;
    }
    return entities[id] || null;
  }

  // Switches that represent an adaptive_lighting setup.
  // Combines backend WS map (extraMap, needed when include_config_in_attributes is False)
  // with attributes.configuration.lights fallback.
  function switches(states, entities, extraMap) {
    var out = [];
    var extra = extraMap || {};
    var keys = {};
    Object.keys(states || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(extra).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (id) {
      if (id.indexOf('switch.') !== 0) return;
      var st = states && states[id];
      var a = (st && st.attributes) || {};
      var reg = regOf(entities, id);
      var fromCfg = lightsOf(a.configuration);
      var fromWs = Array.isArray(extra[id]) ? extra[id].filter(function (x) { return typeof x === 'string' && x.indexOf('.') > 0; }) : [];
      var lights = fromCfg.length ? fromCfg : fromWs;
      var known = (reg && (reg.platform === 'adaptive_lighting' || reg.platform === 'adaptive_lighting_knx')) || fromWs.length > 0;
      if (!known && !(lights.length && Array.isArray(a.manual_control))) return;
      if (!lights.length) return;
      var hasMcList = Array.isArray(a.manual_control);
      var swOff = !!(st && st.state === 'off' && !hasMcList);
      var manual = manualOf(a.manual_control);
      if (swOff) {
        lights.forEach(function (lid) { manual[lid] = true; });
      }
      out.push({ id: id, lights: lights, manual: manual, switchOff: !!(st && st.state === 'off') });
    });
    return out;
  }

  function index(list) {
    var map = {};
    (list || []).forEach(function (sw) {
      sw.lights.forEach(function (lid) {
        (map[lid] || (map[lid] = [])).push({
          switchId: sw.id,
          paused: !!sw.manual[lid],
          switchOff: !!sw.switchOff,
        });
      });
    });
    return map;
  }

  // The tile's own entity, its group members (recursively expanded), and any room/tally lights.
  function collect(entity, states, vars, tally) {
    var id = (entity && entity.entity_id) || '';
    var ids = [];
    if (typeof tally === 'function') {
      try {
        var got = tally(entity, states, null, vars) || [];
        for (var i = 0; i < got.length; i++) ids.push(got[i]);
      } catch (e) { /* tile without light tally keeps its own entity */ }
    }
    if (id) ids.push(id);
    if (vars && typeof vars.toggle_entity === 'string') ids.push(vars.toggle_entity);
    if (vars && typeof vars.group_entity === 'string') ids.push(vars.group_entity);
    var mem = entity && entity.attributes && entity.attributes.entity_id;
    if (Array.isArray(mem)) mem.forEach(function (m) { if (typeof m === 'string') ids.push(m); });
    if (vars && Array.isArray(vars.lights)) {
      vars.lights.forEach(function (m) { if (typeof m === 'string') ids.push(m); });
    }
    if (vars && Array.isArray(vars.active_entities)) {
      vars.active_entities.forEach(function (m) { if (typeof m === 'string' && m.indexOf('light.') === 0) ids.push(m); });
    }
    // Expand nested light groups present in states (preserving initial order first).
    var seen = {};
    var unique = [];
    ids.forEach(function (x) {
      if (!x || seen[x]) return;
      seen[x] = 1;
      unique.push(x);
    });
    for (var k = 0; k < unique.length && unique.length < 120; k++) {
      var cur = unique[k];
      var sub = states && states[cur] && states[cur].attributes && states[cur].attributes.entity_id;
      if (Array.isArray(sub)) {
        sub.forEach(function (m) {
          if (typeof m === 'string' && !seen[m]) {
            seen[m] = 1;
            unique.push(m);
          }
        });
      }
    }
    return unique;
  }

  // One control for every setup that lists one of these lamps.
  // Paused only when every listed lamp is in manual_control, so play means "resume all".
  function plan(ids, map) {
    var by = {};
    var offBy = {};
    var paused = true;
    var n = 0;
    (ids || []).forEach(function (id) {
      (map[id] || []).forEach(function (h) {
        var bucket = by[h.switchId] || (by[h.switchId] = []);
        if (bucket.indexOf(id) < 0) bucket.push(id);
        if (h.switchOff) offBy[h.switchId] = true;
        if (!h.paused) paused = false;
        n++;
      });
    });
    if (!n) return null;
    return {
      paused: paused,
      switches: Object.keys(by).map(function (sid) {
        return { id: sid, lights: by[sid], switchOff: !!offBy[sid] };
      }),
    };
  }

  var api = window._casoraAdaptive = window._casoraAdaptive || {};
  api.switches = switches;
  api.index = index;
  api.collect = collect;
  api.plan = plan;
  if (!window.document || window.document.nodeType !== 9) return;
  if (api._booted) return;
  api._booted = true;

  function tr(s) { return window.casoraTr ? window.casoraTr(s) : s; }

  function hass() {
    var ha = document.querySelector('home-assistant');
    return ha && ha.hass;
  }

  function haCard(card) {
    return card.shadowRoot && card.shadowRoot.querySelector('ha-card');
  }

  var SKIP_TPL = /^(casora_badge_|casora_room$|casora_scene_|casora_menu_|casora_assist_|casora_notifications_|casora_settings_|casora_time$|casora_weather$|casora_mobile_|casora_now_playing)/;

  var CSS = [
    '.cs-al{position:absolute;z-index:6;display:inline-flex;align-items:center;gap:4px;',
    'padding:3px 6px 3px 7px;border-radius:999px;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;',
    'background:color-mix(in srgb, var(--casora-entity-name, currentColor) 10%, transparent);',
    'border:1px solid color-mix(in srgb, var(--casora-entity-name, currentColor) 12%, transparent);',
    'color:var(--casora-entity-name, var(--primary-text-color));line-height:0;',
    'transition:background .16s ease, transform .12s ease, opacity .16s ease;}',
    '.cs-al:active{transform:scale(.94);}',
    '.cs-al[data-paused="0"]{background:rgba(255,159,10,.18);border-color:rgba(255,159,10,.30);}',
    '.cs-al[data-paused="0"] .cs-al-mark{color:var(--casora-color-orange, #e07a00);opacity:1;}',
    '.cs-al.cs-al-slot{top:calc(var(--casora-icon-center-y, 38px) - 13px);',
    'right:var(--casora-entity-inner-pad-current, var(--casora-entity-inner-pad-desktop, 20px));}',
    '.cs-al-mark{--mdc-icon-size:14px;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;opacity:.75;}',
    '.cs-al-go{border:0;padding:0;margin:0;width:18px;height:18px;border-radius:999px;background:transparent;',
    'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:inherit;}',
    '.cs-al-go ha-icon{--mdc-icon-size:15px;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;}',
    '@media (max-width:767px),(max-height:500px),(max-height:600px) and (hover:hover){',
    'ha-card:has(>.cs-al) #name{margin-inline-end:56px;}}',
  ].join('');

  // Find the Adaptive Lighting control in the event path (shadow DOM included).
  function rowOf(ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.classList && n.classList.contains('cs-al')) return n;
    }
    return null;
  }

  function block(ev) {
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    if (ev.cancelable) ev.preventDefault();
  }

  function place(card, row) {
    var host = haCard(card);
    var root = card.shadowRoot;
    if (!host || !root) return;
    var pick = null;
    ['#toggle', '#progress', '#timer'].some(function (sel) {
      var el = root.querySelector(sel);
      if (!el) return false;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      var rect = el.getBoundingClientRect();
      if (rect.height < 6 || rect.width < 6) return false;
      pick = el;
      return true;
    });
    if (!pick) {
      row.classList.add('cs-al-slot');
      row.style.top = '';
      row.style.right = '';
      return;
    }
    var hr = host.getBoundingClientRect();
    var ar = pick.getBoundingClientRect();
    if (hr.height < 10) {
      row.classList.add('cs-al-slot');
      return;
    }
    row.classList.remove('cs-al-slot');
    row.style.top = Math.round(ar.bottom - hr.top + 5) + 'px';
    row.style.right = Math.max(8, Math.round(hr.right - ar.right)) + 'px';
  }

  function paint(row, spec) {
    row._csPlan = spec;
    row.setAttribute('data-paused', spec.paused ? '1' : '0');
    var icon = row.querySelector('.cs-al-go ha-icon');
    var name = spec.paused ? 'mdi:play' : 'mdi:pause';
    if (icon) {
      icon.icon = name;
      icon.setAttribute('icon', name);
    }
    var label = tr(spec.paused ? 'Adaptives Licht fortsetzen' : 'Adaptives Licht pausieren');
    row.setAttribute('aria-label', label);
    var btn = row.querySelector('.cs-al-go');
    if (btn) btn.setAttribute('aria-label', label);
    row.title = tr('Adaptives Licht') + ' · ' + label;
  }

  function toggleRow(row) {
    var now = Date.now();
    if (now - (row._csTapAt || 0) < 350) return;
    row._csTapAt = now;
    var spec = row._csPlan;
    var h = hass();
    if (!spec || !h || typeof h.callService !== 'function') return;
    var next = !spec.paused;
    if (window.casoraHaptic) window.casoraHaptic('light');
    // Keep the tile from treating this as its own tap (popup / toggle).
    window._casoraSuppressDismiss = Date.now() + 700;
    window._casoraUILastTap = Date.now();
    spec.switches.forEach(function (sw) {
      if (!next && sw.switchOff) {
        h.callService('switch', 'turn_on', { entity_id: sw.id });
      }
      h.callService('adaptive_lighting', 'set_manual_control', {
        entity_id: sw.id,
        lights: sw.lights,
        manual_control: next,
      });
    });
    spec.paused = next;
    paint(row, spec);
  }

  // Capture on window BEFORE button-card sees the tap – otherwise the tile's
  // own popup opens (same pattern as dish-start / music / plex recent).
  if (!api._tapBound) {
    api._tapBound = true;
    var tp0 = null;
    var steal = function (ev) {
      // Stop the event on window capture so it never reaches the tile.
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    };
    window.addEventListener('pointerdown', function (ev) {
      if (!rowOf(ev)) return;
      steal(ev);
      tp0 = { x: ev.clientX, y: ev.clientY };
    }, true);
    window.addEventListener('touchstart', function (ev) {
      if (!rowOf(ev)) return;
      // Tell the popup sheet this touch belongs to a control, not a drag/dismiss.
      ev._casoraDialRing = true;
      steal(ev);
      var t = ev.touches && ev.touches[0];
      tp0 = t ? { x: t.clientX, y: t.clientY } : null;
    }, { capture: true, passive: true });
    window.addEventListener('touchend', function (ev) {
      var row = rowOf(ev);
      if (!row) return;
      block(ev);
      var t = ev.changedTouches && ev.changedTouches[0];
      if (tp0 && t && (Math.abs(t.clientX - tp0.x) > 12 || Math.abs(t.clientY - tp0.y) > 12)) {
        tp0 = null;
        return;
      }
      tp0 = null;
      toggleRow(row);
    }, true);
    window.addEventListener('click', function (ev) {
      var row = rowOf(ev);
      if (!row) return;
      block(ev);
      // A mouse click after a handled touchend: already toggled.
      if (Date.now() - (row._csTapAt || 0) < 450) return;
      if (tp0 && (Math.abs(ev.clientX - tp0.x) > 12 || Math.abs(ev.clientY - tp0.y) > 12)) {
        tp0 = null;
        return;
      }
      tp0 = null;
      toggleRow(row);
    }, true);
  }

  function ensure(card) {
    var host = haCard(card);
    var root = card.shadowRoot;
    if (!host || !root) return null;
    if (!root.querySelector('style.cs-al-css')) {
      var style = document.createElement('style');
      style.className = 'cs-al-css';
      style.textContent = CSS;
      root.appendChild(style);
    }
    var row = host.querySelector(':scope > .cs-al');
    if (row) return row;
    row = document.createElement('div');
    row.className = 'cs-al cs-al-slot';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.innerHTML = '<ha-icon class="cs-al-mark" icon="mdi:theme-light-dark"></ha-icon>'
      + '<span class="cs-al-go"><ha-icon icon="mdi:pause"></ha-icon></span>';
    host.appendChild(row);
    if (typeof ResizeObserver === 'function') {
      row._ro = new ResizeObserver(function () { place(card, row); });
      row._ro.observe(host);
    }
    return row;
  }

  function drop(card) {
    var host = haCard(card);
    if (!host) return;
    var row = host.querySelector(':scope > .cs-al');
    if (!row) return;
    if (row._ro) row._ro.disconnect();
    row.remove();
  }

  function fetchWsMap(h) {
    if (!h || typeof h.callWS !== 'function' || api._wsPending) return;
    if (api._wsMap && Date.now() - (api._wsAt || 0) < 60000) return;
    api._wsPending = true;
    Promise.resolve(h.callWS({ type: 'casora/adaptive_lighting' })).then(function (res) {
      api._wsPending = false;
      if (res && res.switches && typeof res.switches === 'object') {
        api._wsMap = res.switches;
        api._wsAt = Date.now();
        schedulePass(30);
      }
    }).catch(function () {
      api._wsPending = false;
    });
  }

  var painted = [];
  function pass() {
    var h = hass();
    if (!h || !h.states) return;
    fetchWsMap(h);
    var map = index(switches(h.states, h.entities, api._wsMap));
    if (!Object.keys(map).length && !painted.length) return;
    painted = [];
    var seen = [];
    var pendingShadow = false;
    var walk = function (root, d) {
      if (!root || d > 14 || !root.querySelectorAll) return;
      var cards = root.querySelectorAll('button-card');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (seen.indexOf(card) !== -1) continue;
        seen.push(card);
        var cfg = card._config || {};
        var tpl = [].concat(cfg.template || []);
        if (!tpl.some(function (t) { var s = String(t); return s.indexOf('casora_') === 0 && !SKIP_TPL.test(s); })) continue;
        // Skip cards rendered inside popups.
        var up = card;
        var inPopup = false;
        for (var p = 0; p < 12 && up; p++) {
          if (up.tagName === 'CASORA-POPUP') { inPopup = true; break; }
          up = up.parentElement || (up.parentNode && up.parentNode.host) || null;
        }
        if (inPopup) continue;
        if (!haCard(card)) { pendingShadow = true; continue; }
        var eid = cfg.entity || '';
        var st = (eid && h.states[eid]) || null;
        var ids = collect(st || { entity_id: eid, attributes: {} }, h.states, cfg.variables || {},
          window._casoraLightTallyIds
            ? function (entity, states, _h, vars) { return window._casoraLightTallyIds(entity, states, h, vars); }
            : null);
        var spec = plan(ids, map);
        if (!spec) { drop(card); continue; }
        var row = ensure(card);
        if (!row) continue;
        paint(row, spec);
        place(card, row);
        painted.push(card);
      }
      var all = root.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot, d + 1);
    };
    walk(document, 0);
    painted = painted.filter(function (c) { return c.isConnected; });
    if (pendingShadow) schedulePass(250);
  }

  function schedulePass(ms) {
    clearTimeout(api._wait);
    api._wait = setTimeout(pass, ms == null ? 80 : ms);
  }

  function observeDom() {
    if (api._mo || typeof MutationObserver !== 'function') return;
    var ha = document.querySelector('home-assistant');
    if (!ha || !ha.shadowRoot) return;
    api._mo = new MutationObserver(function () { schedulePass(140); });
    api._mo.observe(ha.shadowRoot, { childList: true, subtree: true });
  }

  function listen() {
    var h = hass();
    if (!h || !h.connection || typeof h.connection.subscribeEvents !== 'function' || api._sub) return;
    api._sub = true;
    Promise.resolve(h.connection.subscribeEvents(function (ev) {
      var id = ev && ev.data && ev.data.entity_id || '';
      if (id.indexOf('switch.') !== 0 && id.indexOf('light.') !== 0) return;
      schedulePass(60);
    }, 'state_changed')).catch(function () { api._sub = false; });
  }

  function arm() {
    observeDom();
    listen();
    pass();
  }
  window.addEventListener('location-changed', function () { schedulePass(120); setTimeout(arm, 450); });
  window.addEventListener('popstate', function () { schedulePass(120); });
  [300, 900, 2200].forEach(function (ms) { setTimeout(arm, ms); });
})();
