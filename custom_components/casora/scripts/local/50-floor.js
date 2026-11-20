// Climate tile & popup helpers:
// - Standard temperature display: "21°C (22°C)" (measured with target in parentheses)
// - Room + Floor dual-sensor tile display: main reading on primary line, the other sensor as secondary line
// - Heating demand (pådrag) pill next to the climate icon: flame icon + "31%" (or On/Off)
// - Floor & demand group inside the climate popup card
(function () {
  if (typeof window === 'undefined') return;

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function idOf(v) {
    return v && v !== 'None' && v !== 'none' ? String(v) : '';
  }

  function tr(s) { return window.casoraTr ? window.casoraTr(s) : s; }

  var esc = function (t) {
    if (window.casoraEsc) return window.casoraEsc(t);
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function fmt(n) {
    var r = Math.round(n * 10) / 10;
    return window.casoraNum ? window.casoraNum(r, 0, 1) : String(r).replace('.', ',');
  }

  function unitOf(entity, states, variables) {
    var a = (entity && entity.attributes) || {};
    var u = String(a.temperature_unit || a.unit_of_measurement || (variables && variables.temp_unit) || '');
    if (u.indexOf('F') >= 0) return '°F';
    var fs = idOf(variables && variables.floor_sensor);
    var fu = fs && states && states[fs] && states[fs].attributes && String(states[fs].attributes.unit_of_measurement || '');
    if (fu && fu.indexOf('F') >= 0) return '°F';
    return '°C';
  }

  // Format "21°C (22°C)" or "21°C (20–23°C)" or "21°C".
  function pairText(cur, target, unit, rangeLo, rangeHi) {
    var u = unit || '°C';
    var tgtStr = null;
    if (target != null) {
      tgtStr = fmt(target) + u;
    } else if (rangeLo != null && rangeHi != null) {
      tgtStr = fmt(rangeLo) + '–' + fmt(rangeHi) + u;
    }
    if (cur != null && tgtStr) return fmt(cur) + u + ' (' + tgtStr + ')';
    if (cur != null) return fmt(cur) + u;
    if (tgtStr) return '(' + tgtStr + ')';
    return '';
  }

  // Read { cur, target } from a sensor.*, number.*, input_number.*, or climate.* entity.
  function readSensorOrClimate(states, entityId) {
    var id = idOf(entityId);
    var st = id && states && states[id];
    if (!st) return { cur: null, target: null };
    var s = String(st.state == null ? '' : st.state).toLowerCase();
    if (id.indexOf('climate.') === 0) {
      var ca = st.attributes || {};
      var cCur = s === 'unavailable' ? null : num(ca.current_temperature);
      var cTgt = (s !== 'off' && s !== 'unavailable' && s !== 'unknown') ? num(ca.temperature) : null;
      return { cur: cCur, target: cTgt };
    }
    if (s === 'unavailable' || s === 'unknown') return { cur: null, target: null };
    var sa = st.attributes || {};
    var u = String(sa.unit_of_measurement || '');
    if (id.indexOf('sensor.') === 0 && sa.device_class && sa.device_class !== 'temperature' && !/°|^K$/.test(u)) {
      return { cur: null, target: null };
    }
    return { cur: num(st.state), target: null };
  }

  function readTargetEntity(states, entityId) {
    var id = idOf(entityId);
    var st = id && states && states[id];
    if (!st) return null;
    var s = String(st.state == null ? '' : st.state).toLowerCase();
    if (s === 'unavailable' || s === 'unknown') return null;
    if (id.indexOf('climate.') === 0) {
      return s === 'off' ? null : num(st.attributes && st.attributes.temperature);
    }
    return num(st.state);
  }

  function resolveFloorTarget(variables, states, floorPair) {
    if (floorPair && floorPair.target != null) return floorPair.target;
    var v = variables || {};
    var explicit = readTargetEntity(states, v.floor_target);
    if (explicit != null) return explicit;
    var extras = Array.isArray(v.popup_extra_entities) ? v.popup_extra_entities : [];
    for (var i = 0; i < extras.length; i++) {
      var eid = String(extras[i] || '');
      var low = eid.toLowerCase();
      if ((eid.indexOf('number.') === 0 || eid.indexOf('input_number.') === 0)
        && (low.indexOf('gulv') >= 0 || low.indexOf('floor') >= 0 || low.indexOf('boden') >= 0)
        && (low.indexOf('settpunkt') >= 0 || low.indexOf('setpoint') >= 0 || low.indexOf('target') >= 0 || low.indexOf('soll') >= 0)) {
        var found = readTargetEntity(states, eid);
        if (found != null) return found;
      }
    }
    return null;
  }

  function resolveMain(variables, states) {
    var v = variables || {};
    var eid = idOf(v.climate_main_entity);
    if (eid && states && states[eid]) {
      var s = String(states[eid].state == null ? '' : states[eid].state).trim().toLowerCase();
      if (s === 'floor' || s === 'gulv' || s === 'boden' || s === 'on' || s === 'true' || s === '1') {
        return 'floor';
      }
      if (s === 'room' || s === 'rom' || s === 'raum' || s === 'off' || s === 'false' || s === '0') {
        return 'room';
      }
    }
    return v.climate_main === 'floor' ? 'floor' : 'room';
  }

  // Legacy helper kept for unit-test compatibility: main reading when Floor is selected.
  function reading(variables, states) {
    var v = variables || {};
    if (resolveMain(v, states) !== 'floor') return null;
    var fp = readSensorOrClimate(states, v.floor_sensor);
    if (fp.cur == null) return null;
    var ft = resolveFloorTarget(v, states, fp);
    var u = unitOf(null, states, v);
    return {
      value: Math.round(fp.cur * 10) / 10,
      target: ft,
      prefix: pairText(fp.cur, ft, u) + ' · ',
    };
  }

  function stateWord(entity) {
    var mode = entity && entity.state;
    var a = (entity && entity.attributes) || {};
    var act = (window.casoraClimateActive && window.casoraClimateActive(entity)) || {};
    var isAuto = mode === 'auto' || mode === 'heat_cool';
    if (mode === 'unavailable') return 'Nicht verfügbar';
    if (act.cooling || (isAuto && a.hvac_action === 'cooling')) return 'Kühlt';
    if (act.heating || (isAuto && a.hvac_action === 'heating')) return 'Heizt';
    if (mode === 'cool' || mode === 'heat') return 'Bereit';
    if (isAuto) return 'Automatik';
    if (mode === 'dry') return 'Entfeuchten';
    if (mode === 'fan_only') return 'Nur Lüfter';
    return 'Aus';
  }

  function arrowPairText(cur, target, unit, rangeLo, rangeHi) {
    var u = unit || '°C';
    if (cur != null && target != null) return fmt(cur) + '° → ' + fmt(target) + '°';
    if (cur != null && rangeLo != null && rangeHi != null) {
      return fmt(cur) + '° → ' + fmt(rangeLo) + '–' + fmt(rangeHi) + '°';
    }
    if (cur != null) return fmt(cur) + ' ' + u;
    if (target != null) return fmt(target) + ' ' + u;
    if (rangeLo != null && rangeHi != null) return fmt(rangeLo) + '–' + fmt(rangeHi) + ' ' + u;
    return '';
  }

  // Full climate tile state HTML:
  // Line 1 (primary): "<measured>° → <target>° · <state>"
  // Line 2 (secondary, full width left/right): "Gulv    26,9°C" or "Rom    21,5°C"
  function tileState(entity, variables, states) {
    if (!entity) return '';
    var v = variables || {};
    var mode = entity.state;
    if (mode === 'unavailable') return esc(tr('Nicht verfügbar'));
    var a = entity.attributes || {};
    var u = unitOf(entity, states, v);
    var isOff = !mode || mode === 'off' || mode === 'unavailable' || mode === 'unknown';
    var entTgt = !isOff ? num(a.temperature) : null;
    var lo = !isOff ? num(a.target_temp_low) : null;
    var hi = !isOff ? num(a.target_temp_high) : null;

    // Room reading
    var rp = readSensorOrClimate(states, v.temp_sensor);
    var roomCur = rp.cur;
    if (roomCur == null && !idOf(v.temp_sensor) && window.casoraRoomTempOf) {
      roomCur = window.casoraRoomTempOf(entity.entity_id, states);
    }
    if (roomCur == null && !idOf(v.temp_sensor)) {
      roomCur = num(a.current_temperature);
    }

    // Floor reading
    var hasFloorCfg = !!idOf(v.floor_sensor);
    var fp = hasFloorCfg ? readSensorOrClimate(states, v.floor_sensor) : { cur: null, target: null };
    var floorCur = fp.cur;
    var floorTgt = hasFloorCfg ? resolveFloorTarget(v, states, fp) : null;

    var mainFloor = resolveMain(v, states) === 'floor' && (floorCur != null || floorTgt != null);
    var primStr = '';
    var secLabel = '';
    var secVal = '';

    if (mainFloor) {
      var pTgt = floorTgt != null ? floorTgt : entTgt;
      primStr = arrowPairText(floorCur, pTgt, u, pTgt == null ? lo : null, pTgt == null ? hi : null);
      if (roomCur != null) {
        var rTgt = rp.target != null ? rp.target : (floorTgt != null ? entTgt : null);
        secLabel = tr('Raum');
        secVal = arrowPairText(roomCur, rTgt, u);
      }
    } else {
      var rMainTgt = rp.target != null ? rp.target : entTgt;
      primStr = arrowPairText(roomCur, rMainTgt, u, rMainTgt == null ? lo : null, rMainTgt == null ? hi : null);
      if (hasFloorCfg && (floorCur != null || floorTgt != null)) {
        secLabel = tr('Fußboden');
        secVal = arrowPairText(floorCur, floorTgt, u);
      }
    }

    var word = stateWord(entity);
    var line1Text = primStr ? (primStr + ' · ' + word) : word;
    var fit = function (t) {
      return window.casoraStateFit ? window.casoraStateFit(t, undefined, t) : esc(tr(t));
    };
    var html = '<span class="cs-clim-prim" style="display:block;text-align:left;width:100%;">' + fit(line1Text) + '</span>';
    if (secLabel && secVal) {
      html += '<div class="cs-clim-sec" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;width:100%;margin-top:6px;font-size:0.86em;line-height:1.18;text-align:left;">'
        + '<span style="opacity:0.78;font-weight:500;">' + esc(secLabel) + '</span>'
        + '<span data-no-i18n style="opacity:0.95;font-weight:700;">' + esc(secVal) + '</span></div>';
    }
    return html;
  }

  // Format a climate entity's temperature value for popup rows ("21,4°C (22°C)").
  function entityTempText(entityState, states, tempSensorId) {
    if (!entityState) return null;
    var a = entityState.attributes || {};
    var mode = entityState.state;
    var isOff = !mode || mode === 'off' || mode === 'unavailable' || mode === 'unknown';
    var u = String(a.temperature_unit || a.unit_of_measurement || '').indexOf('F') >= 0 ? '°F' : '°C';
    var sp = tempSensorId ? readSensorOrClimate(states, tempSensorId) : { cur: null, target: null };
    var cur = sp.cur != null ? sp.cur : num(a.current_temperature);
    var tgt = !isOff ? num(a.temperature) : null;
    var lo = !isOff ? num(a.target_temp_low) : null;
    var hi = !isOff ? num(a.target_temp_high) : null;
    var res = pairText(cur, tgt, u, lo, hi);
    return res || null;
  }

  // On/off, or a percent. Values above 100 up to 255 are a 0–255 demand (some TRVs).
  function demand(states, entityId) {
    var id = idOf(entityId);
    var st = id && states && states[id];
    if (!st) return null;
    var s = String(st.state == null ? '' : st.state).trim().toLowerCase();
    if (!s || s === 'unavailable' || s === 'unknown' || s === 'none') return null;
    if (s === 'on' || s === 'off' || s === 'true' || s === 'false') {
      var on = s === 'on' || s === 'true';
      return { kind: 'bool', on: on, pct: on ? 100 : 0 };
    }
    var n = num(s);
    if (n == null) return null;
    var unit = String((st.attributes && st.attributes.unit_of_measurement) || '');
    var pct = n;
    if (unit !== '%' && n > 100 && n <= 255) pct = n / 255 * 100;
    pct = Math.max(0, Math.min(100, pct));
    return { kind: 'pct', on: pct > 0, pct: pct };
  }

  function temp(states, entityId) {
    var p = readSensorOrClimate(states, entityId);
    return p.cur;
  }

  function group(UI, variables, states, entity) {
    var v = variables || {};
    var sensor = idOf(v.floor_sensor);
    var demandId = idOf(v.floor_demand);
    if (!sensor && !demandId) return '';
    var u = unitOf(entity, states, v);
    var rows = [];
    if (sensor) {
      var fp = readSensorOrClimate(states, sensor);
      var ft = resolveFloorTarget(v, states, fp);
      var fTxt = pairText(fp.cur, ft, u);
      rows.push({
        icon: 'mdi:heating-coil',
        label: tr('Fußbodentemperatur'),
        value: fTxt || '—',
      });
    }
    if (resolveMain(v, states) === 'floor' && entity) {
      var rp = readSensorOrClimate(states, v.temp_sensor);
      var rCur = rp.cur;
      if (rCur == null && !idOf(v.temp_sensor) && window.casoraRoomTempOf) {
        rCur = window.casoraRoomTempOf(entity.entity_id, states);
      }
      if (rCur == null && !idOf(v.temp_sensor)) {
        rCur = num(entity.attributes && entity.attributes.current_temperature);
      }
      if (rCur != null) {
        var rTgt = rp.target != null ? rp.target : null;
        rows.push({
          icon: 'mdi:thermometer',
          label: tr('Raumtemperatur'),
          value: pairText(rCur, rTgt, u),
        });
      }
    }
    if (demandId) {
      var d = demand(states, demandId);
      var val = '—';
      if (d && d.kind === 'bool') val = tr(d.on ? 'An' : 'Aus');
      else if (d) val = Math.round(d.pct) + ' %';
      rows.push({ icon: 'mdi:fire', label: tr('Anforderung'), value: val });
    }
    if (!rows.length) return '';
    var title = tr('Fußboden');
    if (UI && typeof UI.group === 'function') return '<div style="height:18px"></div>' + UI.group(rows, title);
    return '<div style="height:18px"></div><div class="cs-floor"><b>' + esc(title) + '</b>'
      + rows.map(function (r) { return '<div>' + esc(r.label) + ' ' + esc(r.value) + '</div>'; }).join('')
      + '</div>';
  }

  var api = window._casoraFloor = window._casoraFloor || {};
  api.resolveMain = resolveMain;
  api.reading = reading;
  api.tileState = tileState;
  api.pairText = pairText;
  api.entityTempText = entityTempText;
  api.demand = demand;
  api.temp = temp;
  api.group = group;
  window.casoraFloorReading = reading;
  window.casoraFloorGroup = group;
  window.casoraClimateTileState = tileState;
  window.casoraClimateTempPair = pairText;
  window.casoraClimateEntityTemp = entityTempText;
  if (!window.document || window.document.nodeType !== 9) return;
  if (api._booted) return;
  api._booted = true;

  function hass() {
    var ha = document.querySelector('home-assistant');
    return ha && ha.hass;
  }

  function haCard(card) {
    return card.shadowRoot && card.shadowRoot.querySelector('ha-card');
  }

  var CSS = [
    '.cs-pedal{position:absolute;z-index:4;display:inline-flex;align-items:center;gap:3px;',
    'height:24px;padding:0 8px 0 6px;border-radius:999px;pointer-events:none;',
    'font-size:12px;font-weight:600;line-height:1;letter-spacing:-0.01em;font-variant-numeric:tabular-nums;',
    'background:color-mix(in srgb, var(--casora-entity-name, currentColor) 9%, transparent);',
    'color:var(--casora-entity-state, var(--secondary-text-color));',
    'transition:background .18s ease, color .18s ease;}',
    '.cs-pedal[data-on="1"]{background:rgba(255,149,0,.18);color:color-mix(in srgb, #ff7a00 72%, var(--casora-entity-name, currentColor));}',
    '.cs-pedal ha-icon{--mdc-icon-size:14px;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;opacity:.7;}',
    '.cs-pedal[data-on="1"] ha-icon{color:#ff7a00;opacity:1;}',
    '.cs-pedal.cs-pedal-slot{left:calc(var(--casora-entity-inner-pad-current, var(--casora-entity-inner-pad-desktop, 20px)) + var(--casora-icon-circle-size, 44px) + 8px);',
    'top:calc(var(--casora-icon-center-y, 40px) - 12px);}',
    '#state:has(.cs-clim-sec),#state:has(.cs-clim-prim){width:100% !important;justify-self:stretch !important;text-align:left !important;}',
  ].join('');

  function badgeHtml(d) {
    var on = !!(d && d.on);
    var txt = '—';
    if (d) {
      txt = d.kind === 'bool' ? tr(d.on ? 'An' : 'Aus') : (Math.round(d.pct) + '%');
    }
    var icon = on ? 'mdi:fire' : 'mdi:fire';
    return '<ha-icon icon="' + icon + '"></ha-icon><span data-no-i18n>' + esc(txt) + '</span>';
  }

  function place(card, el) {
    var host = haCard(card);
    var root = card.shadowRoot;
    var puck = root && (root.querySelector('#temp_puck') || root.querySelector('#img-cell'));
    if (!host || !puck) {
      el.classList.add('cs-pedal-slot');
      el.style.left = '';
      el.style.top = '';
      return;
    }
    var pr = puck.getBoundingClientRect();
    var hr = host.getBoundingClientRect();
    if (pr.height < 6 || hr.height < 10) {
      el.classList.add('cs-pedal-slot');
      return;
    }
    el.classList.remove('cs-pedal-slot');
    el.style.left = Math.round(pr.right - hr.left + 8) + 'px';
    el.style.top = Math.round(pr.top - hr.top + (pr.height - 24) / 2) + 'px';
  }

  function paint(el, d) {
    var on = d && d.on ? '1' : '0';
    var pctKey = d ? (d.kind === 'bool' ? ('b:' + on) : String(Math.round(d.pct))) : 'none';
    var label = tr('Anforderung') + (d ? (d.kind === 'bool' ? ' ' + tr(d.on ? 'An' : 'Aus') : ' ' + Math.round(d.pct) + ' %') : '');
    if (el.getAttribute('data-key') === pctKey && el.title === label) return;
    el.setAttribute('data-key', pctKey);
    el.setAttribute('data-on', on);
    el.title = label;
    el.innerHTML = badgeHtml(d);
  }

  function ensure(card) {
    var host = haCard(card);
    var root = card.shadowRoot;
    if (!host || !root) return null;
    if (!root.querySelector('style.cs-pedal-css')) {
      var style = document.createElement('style');
      style.className = 'cs-pedal-css';
      style.textContent = CSS;
      root.appendChild(style);
    }
    var el = host.querySelector(':scope > .cs-pedal');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'cs-pedal cs-pedal-slot';
    host.appendChild(el);
    if (typeof ResizeObserver === 'function') {
      el._ro = new ResizeObserver(function () { place(card, el); });
      el._ro.observe(host);
    }
    return el;
  }

  function drop(card) {
    var host = haCard(card);
    if (!host) return;
    var el = host.querySelector(':scope > .cs-pedal');
    if (!el) return;
    if (el._ro) el._ro.disconnect();
    el.remove();
  }

  function pass() {
    var h = hass();
    if (!h || !h.states) return;
    var seen = [];
    var pendingShadow = false;
    var walk = function (root, depth) {
      if (!root || depth > 14 || !root.querySelectorAll) return;
      var cards = root.querySelectorAll('button-card');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (seen.indexOf(card) !== -1) continue;
        seen.push(card);
        var cfg = card._config || {};
        var tpl = [].concat(cfg.template || []);
        if (!tpl.some(function (t) { return t === 'casora_thermostat' || t === 'casora_popup_fbh'; })) continue;
        if (!haCard(card)) { pendingShadow = true; continue; }
        var vars = cfg.variables || {};
        if (!idOf(vars.floor_demand)) { drop(card); continue; }
        var d = demand(h.states, vars.floor_demand);
        if (!d && !(h.states && h.states[idOf(vars.floor_demand)])) { drop(card); continue; }
        var el = ensure(card);
        if (!el) continue;
        paint(el, d);
        place(card, el);
      }
      var all = root.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot, depth + 1);
    };
    walk(document, 0);
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
      if (id.indexOf('sensor.') !== 0 && id.indexOf('binary_sensor.') !== 0
        && id.indexOf('switch.') !== 0 && id.indexOf('input_boolean.') !== 0 && id.indexOf('number.') !== 0
        && id.indexOf('climate.') !== 0) return;
      schedulePass(60);
    }, 'state_changed')).catch(function () { api._sub = false; });
  }

  function arm() { observeDom(); listen(); pass(); }
  window.addEventListener('location-changed', function () { schedulePass(120); setTimeout(arm, 450); });
  window.addEventListener('popstate', function () { schedulePass(120); });
  [300, 900, 2200].forEach(function (ms) { setTimeout(arm, ms); });
})();
