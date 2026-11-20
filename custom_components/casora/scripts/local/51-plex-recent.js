// Recently added on Plex: posters from the plex_recently_added sensors.
// The list is attributes.data. The first entry is the sensor's own header, not a title.
// Movies and shows can be two sensors, or one combined sensor.
//   window.casoraPlexRecent.line / .active / .idle / .tileBg / .popup
(function () {
  if (typeof window === 'undefined') return;
  if (window.casoraPlexRecent) return;

  var esc = window.casoraEsc || function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var tr = function (s) { return window.casoraTr ? window.casoraTr(s) : s; };

  function daysOf(variables) {
    var n = Number(variables && variables.plex_days);
    return n > 0 ? n : 7;
  }

  function pair(states, entity, variables) {
    var v = variables || {};
    var movies = v.plex_movies || (entity && entity.entity_id) || '';
    var shows = v.plex_shows || '';
    if (!shows && /_movie$/.test(movies)) {
      var guess = movies.replace(/_movie$/, '_show');
      if (states && states[guess]) shows = guess;
    }
    return { movies: movies, shows: shows };
  }

  function clean(t) {
    return String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  }

  // forceTv: true, false, or null (decide from the title itself).
  function rows(states, id, forceTv) {
    var d = states && states[id] && states[id].attributes && states[id].attributes.data;
    if (!Array.isArray(d)) return [];
    return d.filter(function (i) { return i && i.title && !i.title_default; }).map(function (i) {
      var tv = forceTv === true || forceTv === false ? forceTv : !!(i.number || (i.episode && i.episode !== i.title));
      return {
        title: String(i.title),
        episode: i.episode ? String(i.episode) : '',
        number: i.number ? String(i.number) : '',
        aired: i.aired ? String(i.aired) : '',
        airdate: i.airdate || '',
        poster: i.poster || i.fanart || '',
        fanart: i.fanart || i.poster || '',
        summary: i.summary ? clean(i.summary) : '',
        genres: i.genres ? clean(i.genres) : '',
        rating: i.rating ? clean(i.rating) : '',
        runtime: i.runtime ? String(i.runtime) : '',
        studio: i.studio ? clean(i.studio) : '',
        link: i.deep_link || '',
        tv: !!tv,
      };
    });
  }

  function fresh(states, entity, variables) {
    var who = pair(states, entity, variables);
    var cut = Date.now() - daysOf(variables) * 864e5;
    var raw = rows(states, who.movies, who.shows ? false : null).concat(rows(states, who.shows, true));
    var seen = {};
    raw = raw.filter(function (i) {
      var k = i.title + '\n' + i.airdate + '\n' + i.number;
      if (seen[k]) return false;
      seen[k] = 1;
      return i.airdate && new Date(i.airdate).getTime() >= cut;
    });
    raw.sort(function (a, b) { return new Date(b.airdate) - new Date(a.airdate); });
    return raw;
  }

  // One poster per film, one per series (its newest episode, plus how many are new).
  function pack(raw) {
    var movies = [];
    var shows = [];
    raw.forEach(function (i) {
      if (!i.tv) { movies.push(i); return; }
      var g = null;
      for (var n = 0; n < shows.length; n++) if (shows[n].title === i.title) { g = shows[n]; break; }
      if (g) g.eps.push(i);
      else shows.push({
        title: i.title,
        airdate: i.airdate,
        aired: i.aired,
        poster: i.poster,
        fanart: i.fanart,
        summary: i.summary,
        genres: i.genres,
        rating: i.rating,
        runtime: i.runtime,
        studio: i.studio,
        link: i.link,
        tv: true,
        number: i.number,
        episode: i.episode,
        eps: [i],
      });
    });
    return movies.concat(shows).sort(function (a, b) { return new Date(b.airdate) - new Date(a.airdate); });
  }

  function ago(iso) {
    var h = (Date.now() - new Date(iso).getTime()) / 36e5;
    if (!(h >= 0)) return '';
    if (h < 1) return tr('gerade eben');
    if (h < 24) return Math.floor(h) + ' ' + tr('Std.');
    var d = Math.floor(h / 24);
    return d + ' ' + (d === 1 ? tr('Tag') : tr('Tage'));
  }

  function url(raw) {
    if (!raw) return '';
    var s = String(raw);
    if (s.charAt(0) === '/' && typeof location !== 'undefined') return location.origin + s;
    return s;
  }

  function sub(i) {
    if (i.eps && i.eps.length > 1) return i.eps.length + ' ' + tr('neue Folgen');
    if (i.tv && i.number) return i.episode && i.episode.toLowerCase() !== i.title.toLowerCase() ? (i.number + ' · ' + i.episode) : i.number;
    var y = String(i.aired || '').match(/^(\d{4})/);
    var g = i.genres ? i.genres.split(',')[0].trim() : '';
    return [y ? y[1] : '', g].filter(Boolean).join(' · ');
  }

  function line(states, variables, entity) {
    var n = fresh(states, entity, variables).length;
    if (n <= 0) return tr('Alles aktuell');
    if (n === 1) return tr('1 neu');
    return tr(n + ' neu');
  }

  function active(states, variables, entity) {
    return fresh(states, entity, variables).length > 0;
  }

  function posterUrl(states, variables, entity) {
    var list = pack(fresh(states, entity, variables));
    if (!list.length) return '';
    // Prefer poster on tile background, fall back to fanart.
    for (var i = 0; i < list.length; i++) {
      var u = url(list[i].poster || list[i].fanart);
      if (u) return u;
    }
    return '';
  }

  // Full-bleed poster background rendered inside casora_plex_recent tile.
  function tileBg(states, variables, entity) {
    var art = posterUrl(states, variables, entity);
    if (!art) return '';
    return '<div class="cs-plex-bg" style="position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none;">'
      + '<div style="position:absolute;inset:-2px;background-image:url(\'' + esc(art) + '\');background-size:cover;background-position:center 22%;filter:saturate(1.08);"></div>'
      + '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,16,.24) 0%,rgba(8,10,16,.46) 46%,rgba(8,10,16,.86) 100%);"></div>'
      + '</div>';
  }

  var R = window.casoraPlexRecent = {
    daysOf: daysOf,
    pair: pair,
    fresh: fresh,
    pack: pack,
    line: line,
    active: active,
    posterUrl: posterUrl,
    tileBg: tileBg,
    idle: function (states, variables, entity) { return !active(states, variables, entity); },
  };

  R.html = function (states, variables, entity) {
    var list = pack(fresh(states, entity, variables));
    R._list = list;
    if (!list.length) {
      return '<div class="cs-plex cs-plex-empty">' + esc(tr('Alles aktuell')) + '</div>';
    }
    var i = R._i || 0;
    if (i >= list.length) i = 0;
    R._i = i;
    var it = list[i];
    var dots = list.map(function (_, n) {
      return '<b data-cs-plex-at="' + n + '"' + (n === i ? ' class="on"' : '') + '></b>';
    }).join('');
    return '<div class="cs-plex" data-cs-plex="1">'
      + '<div class="wash" style="background-image:url(\'' + esc(url(it.fanart || it.poster)) + '\')"></div>'
      + '<div class="shade"></div>'
      + '<button type="button" class="nav prev" data-cs-plex-step="-1" aria-label="' + esc(tr('Zurück')) + '">‹</button>'
      + '<button type="button" class="art" data-cs-plex-open="1" style="background-image:url(\'' + esc(url(it.poster || it.fanart)) + '\')"></button>'
      + '<button type="button" class="nav next" data-cs-plex-step="1" aria-label="' + esc(tr('Weiter')) + '">›</button>'
      + '<div class="meta"><b>' + esc(it.title) + '</b><span>' + esc(sub(it)) + '</span><small>' + esc(ago(it.airdate)) + '</small></div>'
      + '<div class="dots">' + dots + '</div></div>';
  };

  R.popup = function (states, variables, entity) {
    var who = pair(states, entity, variables);
    return {
      type: 'custom:casora-plex-recent-panel',
      movies_entity: who.movies,
      shows_entity: who.shows,
      days: daysOf(variables),
    };
  };

  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') return;
  if (customElements.get('casora-plex-recent-panel')) return;

  var PANEL_CSS = [
    ':host{display:block;font-family:var(--primary-font-family,system-ui,-apple-system,sans-serif);color:#fff;user-select:none;-webkit-user-select:none;}',
    '.stage{position:relative;min-height:530px;border-radius:28px;overflow:hidden;isolation:isolate;background:#12141a;touch-action:pan-y;}',
    '.empty{min-height:160px;display:grid;place-items:center;font-size:15px;color:var(--secondary-text-color,rgba(255,255,255,.7));}',
    '.wash{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(32px) saturate(1.25);transform:scale(1.15);opacity:.62;z-index:-2;transition:background-image .32s ease;pointer-events:none;}',
    '.shade{position:absolute;inset:0;background:radial-gradient(85% 70% at 50% 35%,rgba(0,0,0,.12),rgba(0,0,0,.72));z-index:-1;pointer-events:none;}',
    '.carousel{display:flex;flex-direction:column;align-items:center;padding:28px 20px 22px;transition:opacity .22s ease;}',
    '.stage.detail-open .carousel{opacity:0;pointer-events:none;}',
    '.poster-row{position:relative;width:100%;display:flex;align-items:center;justify-content:center;min-height:316px;}',
    '.art{position:relative;z-index:2;display:block;width:min(216px,58vw);aspect-ratio:2/3;border:0;padding:0;border-radius:16px;',
    'background:#1e222b center/cover no-repeat;box-shadow:0 26px 52px -16px rgba(0,0,0,.85);cursor:pointer;',
    'transition:transform .2s ease,background-image .25s ease;-webkit-tap-highlight-color:transparent;}',
    '.art:active{transform:scale(.97);}',
    '.nav{position:absolute;top:50%;transform:translateY(-50%);z-index:5;width:44px;height:44px;border:1px solid rgba(255,255,255,.16);',
    'border-radius:999px;background:rgba(15,17,24,.52);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
    'color:#fff;font-size:26px;line-height:1;display:grid;place-items:center;cursor:pointer;padding:0;',
    'transition:background .16s ease,transform .12s ease;-webkit-tap-highlight-color:transparent;}',
    '.nav:hover{background:rgba(30,34,46,.72);}',
    '.nav:active{transform:translateY(-50%) scale(.92);}',
    '.nav.prev{left:6px;}',
    '.nav.next{right:6px;}',
    '.nav[hidden]{display:none;}',
    '.meta{text-align:center;padding:18px 20px 0;display:grid;gap:4px;max-width:440px;}',
    '.meta b{font-size:22px;font-weight:700;letter-spacing:-.015em;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}',
    '.meta span{font-size:14.5px;color:rgba(255,255,255,.82);}',
    '.meta small{font-size:13px;color:rgba(255,255,255,.60);margin-top:2px;}',
    '.pager{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:16px;z-index:5;}',
    '.pager[hidden]{display:none;}',
    '.dots{display:flex;align-items:center;justify-content:center;gap:2px;}',
    '.dot-btn{width:24px;height:32px;border:0;padding:0;background:transparent;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
    '.dot-btn i{display:block;width:7px;height:7px;border-radius:999px;background:rgba(255,255,255,.34);transition:transform .2s ease,background .2s ease;}',
    '.dot-btn.on i{background:#fff;transform:scale(1.25);}',
    '.count{font-size:12px;font-weight:600;color:rgba(255,255,255,.62);font-variant-numeric:tabular-nums;}',
    '.detail{position:absolute;inset:0;z-index:6;overflow-y:auto;padding:18px 22px 24px;box-sizing:border-box;',
    'background:linear-gradient(180deg,rgba(12,14,20,.78) 0%,rgba(12,14,20,.94) 100%);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);',
    'opacity:0;pointer-events:none;transition:opacity .22s ease;}',
    '.stage.detail-open .detail{opacity:1;pointer-events:auto;}',
    '.det-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}',
    '.back-btn,.plex-btn{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;',
    'padding:7px 14px;font-size:13.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;}',
    '.plex-btn{background:#e5a00d;border-color:#e5a00d;color:#111;}',
    '.det-hero{display:flex;gap:16px;align-items:flex-start;}',
    '.det-pst{flex:none;width:104px;aspect-ratio:2/3;border-radius:12px;background:#1e222b center/cover no-repeat;box-shadow:0 14px 28px -10px rgba(0,0,0,.8);}',
    '.det-hx{min-width:0;display:grid;gap:6px;}',
    '.det-hx h3{margin:0;font-size:20px;font-weight:700;line-height:1.18;}',
    '.det-sub{font-size:13.5px;color:rgba(255,255,255,.76);}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}',
    '.chip{font-size:12px;font-weight:600;padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.14);color:rgba(255,255,255,.92);}',
    '.det-sum{margin:14px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.86);user-select:text;-webkit-user-select:text;}',
    '.eps{display:grid;gap:8px;margin-top:14px;}',
    '.ep{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.08);display:grid;gap:3px;}',
    '.ep b{font-size:13.5px;font-weight:600;}',
    '.ep small{font-size:12px;color:rgba(255,255,255,.62);}',
  ].join('');

  class CasoraPlexRecentPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._cfg = {};
      this._hass = null;
      this._list = [];
      this._idx = 0;
      this._sig = null;
    }

    setConfig(cfg) {
      this._cfg = cfg || {};
      this._sig = null;
      if (this._hass) this._sync();
    }

    getCardSize() { return 7; }

    set hass(h) {
      this._hass = h;
      this._sync();
    }

    _computeList() {
      if (!this._hass || !this._hass.states) return [];
      var vars = {
        plex_movies: this._cfg.movies_entity || '',
        plex_shows: this._cfg.shows_entity || '',
        plex_days: this._cfg.days || 7,
      };
      var ent = vars.plex_movies ? { entity_id: vars.plex_movies } : null;
      return pack(fresh(this._hass.states, ent, vars));
    }

    _sync() {
      var list = this._computeList();
      var sig = JSON.stringify(list.map(function (i) {
        return [i.title, i.airdate, i.poster, i.eps ? i.eps.length : 0];
      }));
      if (sig === this._sig) return;
      this._sig = sig;
      this._list = list;
      if (this._idx >= list.length) this._idx = 0;
      this._render();
    }

    _stop(ev) {
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }

    _bindTap(el, fn) {
      if (!el) return;
      var self = this;
      var last = 0;
      el.addEventListener('pointerdown', function (ev) { self._stop(ev); });
      el.addEventListener('touchstart', function (ev) { ev._casoraDialRing = true; self._stop(ev); }, { passive: true });
      el.addEventListener('touchend', function (ev) {
        self._stop(ev);
        if (ev.cancelable) ev.preventDefault();
        last = Date.now();
        if (window.casoraHaptic) window.casoraHaptic('light');
        fn();
      });
      el.addEventListener('click', function (ev) {
        self._stop(ev);
        ev.preventDefault();
        if (Date.now() - last < 450) return;
        if (window.casoraHaptic) window.casoraHaptic('light');
        fn();
      });
    }

    _go(nextIdx) {
      var len = this._list.length;
      if (!len) return;
      this._idx = ((nextIdx % len) + len) % len;
      this._paintCurrent();
    }

    _paintCurrent() {
      var root = this.shadowRoot;
      var list = this._list;
      if (!root || !list.length) return;
      var it = list[this._idx];
      var wash = root.querySelector('.wash');
      var art = root.querySelector('.art');
      if (wash) wash.style.backgroundImage = "url('" + url(it.fanart || it.poster) + "')";
      if (art) {
        art.style.backgroundImage = "url('" + url(it.poster || it.fanart) + "')";
        art.setAttribute('aria-label', it.title);
      }
      var titleEl = root.querySelector('.meta b');
      var subEl = root.querySelector('.meta span');
      var agoEl = root.querySelector('.meta small');
      if (titleEl) titleEl.textContent = it.title;
      if (subEl) subEl.textContent = sub(it);
      if (agoEl) agoEl.textContent = ago(it.airdate);
      var dots = root.querySelectorAll('.dot-btn');
      for (var n = 0; n < dots.length; n++) {
        dots[n].classList.toggle('on', n === this._idx);
      }
      var cnt = root.querySelector('.count');
      if (cnt) cnt.textContent = (this._idx + 1) + ' / ' + list.length;
    }

    _openDetail() {
      var root = this.shadowRoot;
      var it = this._list[this._idx];
      if (!root || !it) return;
      var stage = root.querySelector('.stage');
      var det = root.querySelector('.detail-body');
      if (!stage || !det) return;
      var year = (String(it.aired || '').match(/^(\d{4})/) || [])[1] || '';
      var chips = [];
      if (it.rating) chips.push(it.rating);
      if (it.runtime) chips.push(it.runtime + ' min');
      if (year) chips.push(year);
      if (it.genres) {
        it.genres.split(',').slice(0, 3).forEach(function (g) {
          var s = g.trim();
          if (s) chips.push(s);
        });
      }
      var epsHtml = '';
      if (it.eps && it.eps.length > 1) {
        epsHtml = '<div class="eps">' + it.eps.map(function (e) {
          var head = [e.number, e.episode && e.episode !== e.title ? e.episode : ''].filter(Boolean).join(' · ') || e.title;
          return '<div class="ep"><b>' + esc(head) + '</b><small>' + esc(ago(e.airdate)) + '</small>'
            + (e.summary ? '<small>' + esc(e.summary) + '</small>' : '') + '</div>';
        }).join('') + '</div>';
      }
      det.innerHTML = '<div class="det-hero">'
        + '<div class="det-pst" style="background-image:url(\'' + esc(url(it.poster || it.fanart)) + '\')"></div>'
        + '<div class="det-hx"><h3>' + esc(it.title) + '</h3>'
        + '<div class="det-sub">' + esc([sub(it), ago(it.airdate)].filter(Boolean).join(' · ')) + '</div>'
        + (chips.length ? '<div class="chips">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>' : '')
        + '</div></div>'
        + (it.summary ? '<p class="det-sum">' + esc(it.summary) + '</p>' : '')
        + epsHtml;
      var plexBtn = root.querySelector('.plex-btn');
      if (plexBtn) {
        if (it.link) {
          plexBtn.hidden = false;
          plexBtn.href = it.link;
        } else {
          plexBtn.hidden = true;
        }
      }
      stage.classList.add('detail-open');
    }

    _render() {
      var root = this.shadowRoot;
      var list = this._list;
      if (!list.length) {
        root.innerHTML = '<style>' + PANEL_CSS + '</style><div class="empty">' + esc(tr('Alles aktuell')) + '</div>';
        return;
      }
      var self = this;
      var multi = list.length > 1;
      var dots = list.map(function (it, n) {
        return '<button type="button" class="dot-btn' + (n === self._idx ? ' on' : '') + '" data-idx="' + n + '" aria-label="' + esc(it.title) + '"><i></i></button>';
      }).join('');
      root.innerHTML = '<style>' + PANEL_CSS + '</style>'
        + '<div class="stage">'
        + '<div class="wash"></div><div class="shade"></div>'
        + '<div class="carousel">'
        + '<div class="poster-row">'
        + '<button type="button" class="nav prev"' + (multi ? '' : ' hidden') + ' aria-label="' + esc(tr('Zurück')) + '">‹</button>'
        + '<button type="button" class="art"></button>'
        + '<button type="button" class="nav next"' + (multi ? '' : ' hidden') + ' aria-label="' + esc(tr('Weiter')) + '">›</button>'
        + '</div>'
        + '<div class="meta"><b></b><span></span><small></small></div>'
        + '<div class="pager"' + (multi ? '' : ' hidden') + '><div class="dots">' + dots + '</div><span class="count"></span></div>'
        + '</div>'
        + '<div class="detail">'
        + '<div class="det-top">'
        + '<button type="button" class="back-btn">‹ ' + esc(tr('Zurück')) + '</button>'
        + '<a class="plex-btn" target="_blank" rel="noopener" hidden>Plex ↗</a>'
        + '</div>'
        + '<div class="detail-body"></div>'
        + '</div>'
        + '</div>';

      this._paintCurrent();

      var stage = root.querySelector('.stage');
      this._bindTap(root.querySelector('.nav.prev'), function () { self._go(self._idx - 1); });
      this._bindTap(root.querySelector('.nav.next'), function () { self._go(self._idx + 1); });
      var dotBtns = root.querySelectorAll('.dot-btn');
      for (var d = 0; d < dotBtns.length; d++) {
        (function (btn) {
          var idx = Number(btn.getAttribute('data-idx'));
          self._bindTap(btn, function () { self._go(idx); });
        })(dotBtns[d]);
      }
      var swiped = false;
      this._bindTap(root.querySelector('.art'), function () {
        if (swiped) { swiped = false; return; }
        self._openDetail();
      });
      this._bindTap(root.querySelector('.back-btn'), function () {
        stage.classList.remove('detail-open');
      });
      var plexLink = root.querySelector('.plex-btn');
      if (plexLink) {
        plexLink.addEventListener('pointerdown', function (ev) { self._stop(ev); });
        plexLink.addEventListener('click', function (ev) { self._stop(ev); });
      }

      // Horizontal swipe support (mouse & touch) without triggering popup sheet dismiss.
      var sx = null, sy = null;
      var row = root.querySelector('.carousel');
      row.addEventListener('touchstart', function (ev) {
        if (!multi || stage.classList.contains('detail-open')) return;
        var t = ev.touches && ev.touches[0];
        if (!t) return;
        ev._casoraDialRing = true;
        sx = t.clientX;
        sy = t.clientY;
        swiped = false;
      }, { passive: true });
      row.addEventListener('touchend', function (ev) {
        if (sx == null || !multi) return;
        var t = ev.changedTouches && ev.changedTouches[0];
        var dx = t ? t.clientX - sx : 0;
        var dy = t ? t.clientY - sy : 0;
        sx = null;
        sy = null;
        if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          swiped = true;
          self._stop(ev);
          if (window.casoraHaptic) window.casoraHaptic('selection');
          self._go(self._idx + (dx < 0 ? 1 : -1));
        }
      });
      var px = null;
      row.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType === 'touch' || !multi || stage.classList.contains('detail-open')) return;
        px = ev.clientX;
        swiped = false;
      });
      row.addEventListener('pointerup', function (ev) {
        if (px == null || ev.pointerType === 'touch') return;
        var dx = ev.clientX - px;
        px = null;
        if (Math.abs(dx) > 48) {
          swiped = true;
          self._stop(ev);
          self._go(self._idx + (dx < 0 ? 1 : -1));
        }
      });
    }
  }

  customElements.define('casora-plex-recent-panel', CasoraPlexRecentPanel);
})();
