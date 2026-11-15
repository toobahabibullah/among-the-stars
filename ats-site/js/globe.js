/* Among the Stars — Moon / Mars globe (realistic surfaces).
   Reads data/artifacts.json, renders one status-coloured marker per located
   site on a Sun-lit planet, and opens the shared exhibit panel. The planet
   itself turns slowly beneath a fixed Sun so the terminator sweeps the surface.
   Degrades to a card list without WebGL. All imagery is local (assets/textures). */
(function () {
  "use strict";

  var D = window.ArtifactData;
  var S = window.StatusData;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var BODIES = {
    moon: {
      name: "the Moon",
      overview: { lat: 12, lng: 0, altitude: 2.6 },
      standin: 0x8d96a3,          // soft grey while the map loads
      atmosphere: false,          // the Moon has no atmosphere: crisp limb
      bumpScale: 0.5
    },
    mars: {
      name: "Mars",
      overview: { lat: 10, lng: 0, altitude: 2.6 },
      standin: 0xa85a38,          // soft rust while the map loads
      atmosphere: true,           // very thin dusty-orange limb haze only
      haze: "#c1743c",
      hazeAltitude: 0.02,
      bumpScale: 0.7
    }
  };

  var state = {
    body: "mars",
    all: [],
    filter: "All",
    search: "",
    userPaused: false,
    panelOpen: false,
    current: null,
    currentSite: null,
    lastPointClickAt: 0,
    globe: null,
    webgl: true
  };

  var el = {};
  function cacheEls() {
    ["globe-viz", "globe-main", "artifact-list", "artifact-chips",
      "legend", "legend-mobile", "sidebar-count", "sidebar-world", "texture-note",
      "btn-reset", "btn-pause", "pause-label", "pause-icon", "webgl-fallback",
      "fb-grid", "fb-world", "beyond-link", "filters-desktop", "filters-mobile",
      "filter-count-mobile", "artifact-search", "artifact-search-mobile",
      "mobile-drawer-toggle", "mobile-drawer-count", "mobile-drawer-content"
    ].forEach(function (id) { el[id] = document.getElementById(id); });
    el.segButtons = Array.prototype.slice.call(document.querySelectorAll(".seg-toggle button"));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function hexRgba(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function activeArtifacts() {
    return state.all.filter(function (a) { return a.destination === cap(state.body); });
  }
  function matchesSearch(a) {
    var q = state.search.trim().toLowerCase();
    if (!q) return true;
    var fields = [a.name, a.mission, a.location];
    D.sites(a).forEach(function (s) { fields.push(s.label); });
    for (var i = 0; i < fields.length; i++) {
      if (D.present(fields[i]) && String(fields[i]).toLowerCase().indexOf(q) >= 0) return true;
    }
    return false;
  }
  function filteredArtifacts() {
    var items = activeArtifacts().filter(matchesSearch);
    if (state.filter === "All") return items;
    return items.filter(function (a) { return S.categoryOf(a.status) === state.filter; });
  }
  /* One marker per drawable site: a dot is drawn only from a numeric
     latitude/longitude that records its source in coord_source. Unlocated
     machines stay in the side list instead. */
  function siteDots() {
    var dots = [];
    filteredArtifacts().forEach(function (a) {
      D.drawableSites(a).forEach(function (s) { dots.push({ a: a, s: s, lat: s.lat, lon: s.lon }); });
    });
    return dots;
  }
  /* The site a deep link or list click should show first. */
  function firstSite(a) {
    var drawable = D.drawableSites(a);
    if (drawable.length) return drawable[0];
    return D.sites(a)[0] || null;
  }

  /* ---------- Texture resolution: 4K on capable desktops, 2K on mobile / weak GPUs ---------- */
  function useLowRes() {
    var narrow = window.innerWidth < 760 || (window.screen && window.screen.width < 760);
    var weak = false;
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) {
        var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        var dbg = gl.getExtension("WEBGL_debug_renderer_info");
        var rend = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
        weak = maxTex < 4096 || /swiftshader|software|llvmpipe|basic render/i.test(rend);
      } else { weak = true; }
    } catch (e) { weak = true; }
    var lowMem = navigator.deviceMemory && navigator.deviceMemory <= 2;
    return !!(narrow || weak || lowMem);
  }
  function texUrls(body) {
    var sfx = useLowRes() ? "_2k" : "";
    return {
      color: "assets/textures/" + body + "_color" + sfx + ".jpg",
      bump: "assets/textures/" + body + "_bump" + sfx + ".jpg"
    };
  }

  /* ---------- Planet spin + per-frame maintenance (one guarded rAF) ---------- */
  var spin = { group: null, raf: null, last: 0, speed: 0.05 };  // rad/s — a calm ~2 min turn
  var fade = { active: false, start: 0, dur: 750 };
  var mapPending = false;
  var dotRadius = 0.36;
  var pointShapeResolutions = {};

  function findSpinGroup() {
    if (!state.globe) return null;
    var sc = state.globe.scene();
    for (var i = 0; i < sc.children.length; i++) if (sc.children[i].isGroup) return sc.children[i];
    return null;
  }
  function spinEnabled() { return !reduceMotion && !state.userPaused && !state.panelOpen; }
  function currentRotDeg() { return spin.group ? spin.group.rotation.y * 180 / Math.PI : 0; }

  function startSpin() {
    if (!state.globe || spin.raf) return;
    spin.group = findSpinGroup();
    spin.last = performance.now();
    function frame(now) {
      spin.raf = requestAnimationFrame(frame);
      var dt = Math.min((now - spin.last) / 1000, 0.1);
      spin.last = now;
      // Turn the planet (terrain + dots together); the Sun stays fixed in world space.
      if (spin.group && spinEnabled()) spin.group.rotation.y += spin.speed * dt;
      maintain(now);
    }
    spin.raf = requestAnimationFrame(frame);
  }

  function maintain(now) {
    if (!state.globe) return;
    applySceneSetup();
    if (fade.active) {
      var mat = state.globe.globeMaterial();
      var t = Math.min((now - fade.start) / fade.dur, 1);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      mat.opacity = e;
      if (t >= 1) { mat.opacity = 1; mat.transparent = false; mat.needsUpdate = true; fade.active = false; }
    }
  }

  /* Apply lighting, acquire the spin group, self-light the dots and configure the
     map once globe.gl has populated the scene. Runs from the rAF loop AND from a
     setTimeout poll + onGlobeReady, so it also applies in a background tab where
     requestAnimationFrame is suspended. Returns true once the lights + group exist. */
  var setupTimer = null;
  function applySceneSetup() {
    if (!state.globe) return false;
    var sc = state.globe.scene();
    var grp = null, sun = false;
    for (var i = 0; i < sc.children.length; i++) {
      var c = sc.children[i];
      if (c.isGroup && !grp) grp = c;
      if (c.isDirectionalLight) sun = true;
    }
    if (!grp || !sun) return false;
    if (!spin.group || spin.group.parent !== sc) spin.group = grp;
    setupLighting();
    restylePoints();
    if (mapPending && configureMap()) mapPending = false;
    return true;
  }
  function pollSetup(n) {
    window.clearTimeout(setupTimer);
    var ready = applySceneSetup();
    if ((!ready || mapPending) && n < 80) {
      setupTimer = window.setTimeout(function () { pollSetup(n + 1); }, 100);
    }
  }

  /* ---------- Realistic lighting: one strong Sun + very dim cool fill ----------
     Applied every frame to the scene's direct children (cheap): the Sun stays
     fixed in world space while the planet group turns beneath it. */
  function setupLighting() {
    var kids = state.globe.scene().children;
    for (var i = 0; i < kids.length; i++) {
      var o = kids[i];
      if (o.isAmbientLight) {
        o.intensity = 0.5;            // dim fill: night side dark, never pure black
        o.color.setHex(0x9fb6d8);
      } else if (o.isDirectionalLight) {
        o.intensity = 4.0;            // the Sun
        o.color.setHex(0xfff4e8);     // faintly warm sunlight
        o.position.set(-1.8, 0.75, 1.0);  // from one side; fixed while the planet turns
      }
    }
  }

  /* Rock and dust, not gloss: minimal specular, subtle relief. */
  function tuneMaterial() {
    var mat = state.globe.globeMaterial();
    if (mat.specular) mat.specular.setHex(0x0a0a0a);
    mat.shininess = 3;
    mat.bumpScale = BODIES[state.body].bumpScale;
  }

  /* sRGB colour, max anisotropy, mipmaps; then fade the real surface in. */
  function configureMap() {
    var mat = state.globe.globeMaterial();
    if (!mat.map) return false;
    var maxAniso = 1;
    try { maxAniso = state.globe.renderer().capabilities.getMaxAnisotropy(); } catch (e) {}
    mat.map.colorSpace = "srgb";
    mat.map.anisotropy = maxAniso;
    mat.map.generateMipmaps = true;
    mat.map.needsUpdate = true;
    if (mat.bumpMap) {
      mat.bumpMap.anisotropy = maxAniso;
      mat.bumpMap.generateMipmaps = true;
      mat.bumpMap.needsUpdate = true;
    }
    // globe.gl sets material.color=null once a map loads, so fade via opacity.
    // Skip the fade in a background tab / reduced motion so the globe is never invisible.
    if (!reduceMotion && !document.hidden) {
      mat.transparent = true; mat.opacity = 0; mat.needsUpdate = true;
      fade.active = true; fade.start = performance.now();
    } else {
      mat.transparent = false; mat.opacity = 1; fade.active = false;
    }
    return true;
  }

  /* ---------- Surface loading (stand-in sphere → real map), with dispose + lazy load ---------- */
  /* globe.gl nulls material.color when a map loads; recreate it for the stand-in. */
  function setStandin(mat, hex) {
    if (mat.color && mat.color.setHex) { mat.color.setHex(hex); return; }
    var C = mat.specular && mat.specular.constructor;
    if (C) mat.color = new C(hex);
  }
  function clearSurface() {
    var mat = state.globe.globeMaterial();
    if (mat.map) { mat.map.dispose(); mat.map = null; }
    if (mat.bumpMap) { mat.bumpMap.dispose(); mat.bumpMap = null; }
    mat.needsUpdate = true;
  }
  function applySurface(body) {
    if (!state.globe) return;
    var mat = state.globe.globeMaterial();
    clearSurface();                       // dispose the previous world's textures
    fade.active = false;
    mat.transparent = false; mat.opacity = 1;
    setStandin(mat, BODIES[body].standin);  // soft grey / rust sphere while loading
    tuneMaterial();
    hideNote();
    var urls = texUrls(body);
    // Only the shown world is fetched; the other stays lazy until switched to.
    var img = new Image();
    img.onload = function () {
      if (state.body !== body || !state.globe) return;
      state.globe.globeImageUrl(urls.color);
      state.globe.bumpImageUrl(urls.bump);
      tuneMaterial();
      mapPending = true;                  // configure + fade once the map is live
      pollSetup(0);                       // catch the map even in a background tab
    };
    img.onerror = function () {
      if (state.body !== body) return;
      showNote("<strong>Surface map unavailable.</strong> Showing a plain globe — the machine list still works.");
    };
    img.src = urls.color;
  }
  function showNote(html) { if (el["texture-note"]) { el["texture-note"].innerHTML = html; el["texture-note"].hidden = false; } }
  function hideNote() { if (el["texture-note"]) el["texture-note"].hidden = true; }

  function setAtmosphere(body) {
    var b = BODIES[body], g = state.globe;
    if (!g) return;
    g.showAtmosphere(!!b.atmosphere);
    if (b.atmosphere) { g.atmosphereColor(b.haze); g.atmosphereAltitude(b.hazeAltitude); }
  }

  /* ---------- WebGL detection ---------- */
  function webglAvailable() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  /* ---------- Globe ---------- */
  function initGlobe() {
    var container = el["globe-viz"];
    var g = Globe({ controlType: "orbit" })(container);
    g.backgroundColor("rgba(0,0,0,0)")     // transparent: the shared star sky shows around the planet
      .width(container.clientWidth)
      .height(container.clientHeight);

    try {
      var r = g.renderer();
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.toneMapping = 4;                  // ACESFilmicToneMapping (three r157): filmic, no clipped highlights
      r.toneMappingExposure = 1.1;
    } catch (e) {}

    var controls = g.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.7;
    controls.autoRotate = false;          // the planet turns, not the camera, so the Sun stays fixed
    controls.minDistance = 118;           // never pass through the surface (radius 100)
    controls.maxDistance = 560;           // never shrink to a tiny dot

    state.globe = g;
    dotRadius = computeDotRadius(BODIES[state.body].overview.altitude);
    tuneMaterial();
    setAtmosphere(state.body);
    g.pointOfView(BODIES[state.body].overview, 0);
    applySurface(state.body);
    updatePoints();
    g.onZoom(function (pov) { if (pov && typeof pov.altitude === "number") scheduleDotSize(pov.altitude); });
    g.onGlobeReady(function () { applySceneSetup(); });
    startSpin();
    pollSetup(0);
  }

  /* Keep each site large enough to see and hit; markers scale gently with zoom. */
  function computeDotRadius(alt) { return Math.max(0.7, Math.min(1.3, 0.7 + alt * 0.16)); }
  var dotTimer = null;
  function scheduleDotSize(alt) {
    window.clearTimeout(dotTimer);
    dotTimer = window.setTimeout(function () {
      if (!state.globe) return;
      var r = computeDotRadius(alt);
      if (Math.abs(r - dotRadius) > 0.01) { dotRadius = r; state.globe.pointRadius(r); }
    }, 120);
  }

  function updatePoints() {
    if (!state.globe) return;
    var data = siteDots();
    pointShapeResolutions = {};
    data.forEach(function (d) {
      pointShapeResolutions[d.lat + "," + d.lon] = S.shapeResolution(S.shapeOf(d.a.status));
    });
    state.globe
      .pointsData(data)
      .pointLat(function (d) { return d.lat; })
      .pointLng(function (d) { return d.lon; })
      .pointColor(function (d) { return S.colourOf(d.a.status); })
      .pointAltitude(0.012)
      .pointRadius(dotRadius)
      .pointResolution(24)
      .pointsTransitionDuration(0)
      .pointLabel(function (d) { return '<span class="tt-name">' + esc(d.a.name) + "</span>"; })
      .onPointClick(function (d) {
        state.lastPointClickAt = performance.now();
        openArtifact(d.a, null, d.s);
      })
      .onGlobeClick(function () {
        if (performance.now() - state.lastPointClickAt < 160) return;
        if (window.Exhibit.isOpen()) window.Exhibit.close();
      });
    updateRings();
  }

  function updateRings() {
    if (!state.globe) return;
    if (reduceMotion) { state.globe.ringsData([]); return; }
    var data = siteDots().map(function (d) {
      d.selected = !!(state.currentSite && state.currentSite.lat === d.lat && state.currentSite.lon === d.lon);
      return d;
    });
    state.globe
      .ringsData(data)
      .ringLat(function (d) { return d.lat; })
      .ringLng(function (d) { return d.lon; })
      .ringColor(function (d) { return hexRgba(d.selected ? "#3DE0FF" : S.colourOf(d.a.status), d.selected ? 0.7 : 0.5); })
      .ringMaxRadius(function (d) { return d.selected ? 2 : 0.85; })
      .ringPropagationSpeed(1.1)
      .ringRepeatPeriod(2000);
  }

  /* Match the marker's polygon geometry to its status shape and keep its colour
     emissive so it remains visible on both the day and night sides. */
  function restylePoints() {
    if (!spin.group) return;
    spin.group.traverse(function (o) {
      if (o.isMesh && o.geometry && o.geometry.type === "CylinderGeometry" &&
          o.material && o.material.emissive) {
        var target = o.__currentTargetD;
        var resolution = target && pointShapeResolutions[target.lat + "," + target.lng] || 24;
        if (o.__atsPointResolution !== resolution) {
          var Geometry = o.geometry.constructor;
          var Matrix = o.matrix.constructor;
          var geometry = new Geometry(1, 1, 1, resolution);
          geometry.applyMatrix4(new Matrix().makeRotationX(Math.PI / 2));
          geometry.applyMatrix4(new Matrix().makeTranslation(0, 0, -0.5));
          if (o.__atsOwnGeometry) o.geometry.dispose();
          o.geometry = geometry;
          o.__atsOwnGeometry = true;
          o.__atsPointResolution = resolution;
        }
        o.material.emissive.copy(o.material.color);
        o.material.emissiveIntensity = 1.15;
      }
    });
  }

  /* A status-coloured pulse surrounds each site; the selected site uses cyan. */
  function updateSelectionRing() {
    updateRings();
  }

  function flyTo(pov, ms) { if (state.globe) state.globe.pointOfView(pov, reduceMotion ? 0 : ms); }
  function flyToSite(s) {
    if (!s || !D.siteLocated(s)) return;
    // Compensate for the planet's turn so the dot stays centred in the fixed world frame.
    flyTo({ lat: s.lat, lng: s.lon + currentRotDeg(), altitude: 1.35 }, 1400);
  }
  function setRotation() {
    if (state.globe) state.globe.controls().autoRotate = false;  // spin is driven by the rAF + flags
  }

  /* ---------- Lists, chips, legend, fallback cards ---------- */
  function updateCount() {
    var shown = filteredArtifacts().length;
    var total = activeArtifacts().length;
    var text = "Showing " + shown + " of " + total;
    if (el["sidebar-count"]) el["sidebar-count"].textContent = text;
    if (el["filter-count-mobile"]) el["filter-count-mobile"].textContent = text;
    if (el["mobile-drawer-count"]) el["mobile-drawer-count"].textContent = text;
  }

  function renderLists() {
    var items = filteredArtifacts();
    el["sidebar-world"].textContent = cap(state.body);
    if (el["fb-world"]) el["fb-world"].textContent = BODIES[state.body].name;
    updateCount();

    // Desktop vertical list
    el["artifact-list"].innerHTML = "";
    // Mobile chips
    el["artifact-chips"].innerHTML = "";
    // Fallback cards
    el["fb-grid"].innerHTML = "";

    if (items.length === 0) {
      var msg = state.filter !== "All"
        ? "No matching hardware on this world."
        : "No machines on this world yet.";
      var empty = document.createElement("li");
      empty.className = "coming-soon";
      empty.style.padding = "12px 13px";
      empty.textContent = msg;
      el["artifact-list"].appendChild(empty);

      var chipEmpty = document.createElement("span");
      chipEmpty.className = "chip-empty";
      chipEmpty.textContent = msg;
      el["artifact-chips"].appendChild(chipEmpty);

      var fbEmpty = document.createElement("p");
      fbEmpty.className = "fleet-empty";
      fbEmpty.textContent = msg;
      el["fb-grid"].appendChild(fbEmpty);
      return;
    }

    items.forEach(function (a) {
      var color = S.colourOf(a.status);
      var shape = S.shapeOf(a.status);
      var pressed = state.current && state.current.id === a.id;
      var typeStr = D.present(a.type) ? cap(a.type) : "";
      var siteList = D.sites(a);
      var locStr = D.present(a.location) ? a.location : "";
      if (siteList.length === 1 && D.present(siteList[0].label)) locStr = siteList[0].label;
      else if (siteList.length > 1) locStr = siteList.length + " sites";
      /* Surface artifacts without a sourced lat/lon have no dot, so the list
         says where the location stands instead of leaving it blank. */
      if (a.destination !== "Beyond" && !D.located(a) && !locStr) {
        locStr = "Location data coming soon";
      }
      var sub = [typeStr, locStr].filter(Boolean).join(" · ");

      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.className = "artifact-btn";
      btn.type = "button";
      btn.dataset.id = a.id;
      btn.style.setProperty("--dot-color", color);
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.setAttribute("aria-label", a.name + (typeStr ? ", " + typeStr : "") +
        (locStr ? ", " + locStr : "") + ", " + S.labelFor(a.status));
      btn.innerHTML = '<span class="a-dot" data-shape="' + shape + '" aria-hidden="true"></span><span class="a-text">' +
        '<span class="a-name">' + esc(a.name) + '</span>' +
        (sub ? '<span class="a-loc">' + esc(sub) + "</span>" : "") + "</span>";
      btn.addEventListener("click", function () { openArtifact(a, btn); });
      li.appendChild(btn);
      el["artifact-list"].appendChild(li);

      var chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.dataset.id = a.id;
      chip.style.setProperty("--dot-color", color);
      chip.setAttribute("aria-pressed", pressed ? "true" : "false");
      chip.innerHTML = '<span class="a-dot" data-shape="' + shape + '" aria-hidden="true"></span>' + esc(a.name);
      chip.addEventListener("click", function () { openArtifact(a, chip); });
      el["artifact-chips"].appendChild(chip);

      var card = document.createElement("button");
      card.className = "fb-card";
      card.type = "button";
      card.dataset.id = a.id;
      card.style.setProperty("--dot-color", color);
      card.innerHTML = '<span class="fb-top"><span class="a-dot" data-shape="' + shape + '" aria-hidden="true"></span>' +
        '<span class="fb-type">' + esc(a.type) + "</span></span>" +
        "<h3>" + esc(a.name) + "</h3>" +
        S.badgeHtml(a.status) +
        '<p class="fb-loc">' + esc(locStr || D.display(a.location)) + "</p>" +
        '<span class="fb-cta">Open exhibit →</span>';
      card.addEventListener("click", function () { openArtifact(a, card); });
      el["fb-grid"].appendChild(card);
    });
  }

  function legendRow(status) {
    var cat = S.categoryOf(status);
    return '<span class="legend-item"><span class="l-dot" ' + S.dotAttrs(status) +
      (cat ? ' title="' + esc(cat) + '"' : "") + '></span>' + esc(S.labelFor(status)) + "</span>";
  }

  /* Legend lists only the statuses that appear on the current world. */
  function renderLegend() {
    var present = {};
    activeArtifacts().forEach(function (a) { present[S.labelFor(a.status)] = true; });
    var rows = [];
    S.all().forEach(function (s) { if (present[s.label]) rows.push(legendRow(s.label)); });
    if (present[S.VERIFY_LABEL]) rows.push(legendRow(null));
    var html = rows.join("");
    el["legend"].innerHTML = '<h3>Mission status</h3><div class="legend-items">' +
      (html || '<span class="legend-empty">No machines on this world yet.</span>') + "</div>" +
      '<p class="legend-hint">Dot shape shows the status group.</p>';
    el["legend-mobile"].innerHTML = html;
  }

  function updatePressed() {
    var id = state.current ? state.current.id : null;
    document.querySelectorAll(".artifact-btn, .chip").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.id === id ? "true" : "false");
    });
  }

  /* ---------- Deep links: #artifact=<id> ---------- */
  function setArtifactHash(id) {
    var frag = "artifact=" + encodeURIComponent(id);
    try { history.replaceState(null, "", "#" + frag); }
    catch (e) { window.location.hash = frag; }
  }
  function clearHash() {
    try { history.replaceState(null, "", window.location.pathname + window.location.search); }
    catch (e) { window.location.hash = ""; }
  }
  function parseArtifactHash() {
    var m = /^#artifact=([^&]+)/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function findArtifact(id) {
    for (var i = 0; i < state.all.length; i++) if (state.all[i].id === id) return state.all[i];
    return null;
  }
  /* A deep link that points at no machine: say so and stay on the globe. */
  function showNotFound() {
    var text = "That machine was not found.";
    var list = el["artifact-list"];
    if (list) {
      var li = document.createElement("li");
      li.className = "coming-soon";
      li.style.padding = "12px 13px";
      li.textContent = text;
      list.insertBefore(li, list.firstChild);
    }
    var chips = el["artifact-chips"];
    if (chips) {
      var chip = document.createElement("span");
      chip.className = "chip-empty";
      chip.textContent = text;
      chips.insertBefore(chip, chips.firstChild);
    }
    var grid = el["fb-grid"];
    if (grid) {
      var p = document.createElement("p");
      p.className = "fleet-empty";
      p.textContent = text;
      grid.insertBefore(p, grid.firstChild);
    }
  }
  function onHashChange() {
    var id = parseArtifactHash();
    if (id) {
      if (state.current && state.current.id === id) return;
      var a = findArtifact(id);
      if (!a) { clearHash(); showNotFound(); return; }
      if (a.destination === "Beyond") { window.location.replace("beyond.html#artifact=" + encodeURIComponent(id)); return; }
      var dest = a.destination === "Moon" ? "moon" : "mars";
      if (dest !== state.body) setBody(dest, true);
      openArtifact(a, null);
    } else if (window.Exhibit.isOpen()) {
      window.Exhibit.close();
    }
  }
  /* Fly to one site of the open artifact (called from the panel's site buttons). */
  function locateOnGlobe(site) {
    if (site) state.currentSite = site;
    if (state.globe && state.currentSite) flyToSite(state.currentSite);
    updateSelectionRing();
  }

  /* Related chips may point at a machine on the other world or in deep space. */
  function openRelated(id) {
    var a = findArtifact(id);
    if (!a) return;
    if (a.destination === "Beyond") {
      window.location.href = "beyond.html#artifact=" + encodeURIComponent(id);
      return;
    }
    var dest = a.destination === "Moon" ? "moon" : "mars";
    if (dest !== state.body) setBody(dest, true);
    openArtifact(a, null);
  }

  /* ---------- Exhibit (shared component) ---------- */
  function openArtifact(a, trigger, site) {
    state.current = a;
    state.currentSite = site || firstSite(a);
    state.panelOpen = true;
    setRotation();
    updateSelectionRing();
    if (state.globe && state.currentSite) flyToSite(state.currentSite);
    updatePressed();
    setArtifactHash(a.id);
    window.Exhibit.open(a, {
      trigger: trigger,
      backLabel: "Back to the globe",
      list: filteredArtifacts(),
      all: state.all,
      site: state.currentSite,
      onNavigate: function (next, t) { openArtifact(next, t); },
      onLocateSite: locateOnGlobe,
      onRelated: openRelated,
      onClose: function () {
        state.panelOpen = false;
        state.current = null;
        state.currentSite = null;
        updateSelectionRing();
        flyTo(BODIES[state.body].overview, 1200);
        setRotation();
        updatePressed();
        clearHash();
      }
    });
  }

  /* ---------- Status filters (kept across Moon / Mars switches) ---------- */
  var filtersDesktop = null, filtersMobile = null;
  function applyFilter(cat) {
    state.filter = cat;
    if (filtersDesktop) filtersDesktop.setActive(cat, false);
    if (filtersMobile) filtersMobile.setActive(cat, false);
    // If the open exhibit no longer matches the filter, close it.
    if (state.current && cat !== "All" && S.categoryOf(state.current.status) !== cat) {
      if (window.Exhibit.isOpen()) window.Exhibit.close();
    }
    updatePoints();
    renderLists();
    renderLegend();
  }
  function wireFilters() {
    var label = "Filter machines by mission status";
    if (el["filters-desktop"]) {
      filtersDesktop = S.mountFilters({ container: el["filters-desktop"], label: label, onChange: applyFilter });
    }
    if (el["filters-mobile"]) {
      filtersMobile = S.mountFilters({ container: el["filters-mobile"], label: label, onChange: applyFilter });
    }
    if (filtersDesktop) filtersDesktop.setActive(state.filter, false);
    if (filtersMobile) filtersMobile.setActive(state.filter, false);
  }

  /* ---------- Body switching ---------- */
  function setBodyUI(body) {
    el["globe-main"].setAttribute("data-body", body);
    el.segButtons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-body") === body ? "true" : "false");
    });
  }
  function setBody(body, keepHash) {
    if (state.body === body && state.globe) return;
    if (window.Exhibit.isOpen()) window.Exhibit.close();
    state.body = body;
    setBodyUI(body);
    if (state.globe) {
      setAtmosphere(body);
      applySurface(body);
      updatePoints();
      flyTo(BODIES[body].overview, 1000);
    }
    renderLists();
    renderLegend();
    if (!keepHash) clearHash();
  }

  /* ---------- Controls ---------- */
  function updatePauseButton() {
    var paused = state.userPaused;
    el["btn-pause"].setAttribute("aria-pressed", paused ? "true" : "false");
    el["pause-label"].textContent = paused ? "Resume" : "Pause";
    el["pause-icon"].innerHTML = paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<path d="M9 5h3v14H9zM15 5h3v14h-3z"/>';
    if (reduceMotion) {
      el["btn-pause"].disabled = true;
      el["btn-pause"].title = "Rotation is off because your device prefers reduced motion.";
    }
  }

  function wireControls() {
    el.segButtons.forEach(function (btn) {
      btn.addEventListener("click", function () { setBody(btn.getAttribute("data-body")); });
    });

    el["btn-reset"].addEventListener("click", function () {
      if (window.Exhibit.isOpen()) window.Exhibit.close();
      else flyTo(BODIES[state.body].overview, 1000);
      setRotation();
    });

    el["btn-pause"].addEventListener("click", function () {
      state.userPaused = !state.userPaused;
      updatePauseButton();
      setRotation();
    });

    if (el["mobile-drawer-toggle"] && el["mobile-drawer-content"]) {
      el["mobile-drawer-toggle"].addEventListener("click", function () {
        var expanded = el["mobile-drawer-toggle"].getAttribute("aria-expanded") !== "true";
        el["mobile-drawer-toggle"].setAttribute("aria-expanded", expanded ? "true" : "false");
        el["mobile-drawer-content"].hidden = !expanded;
        document.querySelector(".globe-mobilebar").classList.toggle("is-open", expanded);
      });
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (state.globe) {
          var c = el["globe-viz"];
          state.globe.width(c.clientWidth).height(c.clientHeight);
        }
      }, 150);
    });
  }

  /* ---------- Fallback mode ---------- */
  function enableFallback() {
    state.webgl = false;
    el["globe-viz"].hidden = true;
    el["webgl-fallback"].hidden = false;
    el["btn-reset"].disabled = true;
    el["btn-pause"].disabled = true;
    el["btn-reset"].title = "3D view unavailable on this device.";
    el["btn-pause"].title = "3D view unavailable on this device.";
    if (el["texture-note"]) el["texture-note"].hidden = true;
    var hint = document.querySelector(".globe-hint");
    if (hint) hint.hidden = true;
  }

  /* ---------- Search ---------- */
  function wireSearch() {
    var inputs = [el["artifact-search"], el["artifact-search-mobile"]].filter(Boolean);
    inputs.forEach(function (inp) {
      inp.addEventListener("input", function () {
        state.search = inp.value;
        inputs.forEach(function (other) { if (other !== inp) other.value = inp.value; });
        if (state.current && !matchesSearch(state.current) && window.Exhibit.isOpen()) window.Exhibit.close();
        updatePoints();
        renderLists();
      });
    });
  }

  /* ---------- Boot ---------- */
  function showError(err) {
    console.error("Machine data failed to load:", err);
    if (el["sidebar-count"]) el["sidebar-count"].textContent = "Data unavailable";
    var html = D.errorBlock("The machine data could not be loaded. If you opened this file directly, run tools/sync-data.js or use a local server, then try again.");
    if (el["artifact-list"]) el["artifact-list"].innerHTML = '<li class="list-error">' + html + "</li>";
    if (el["artifact-chips"]) el["artifact-chips"].innerHTML = "";
    if (el["fb-grid"]) el["fb-grid"].innerHTML = html;
    var note = el["texture-note"];
    if (note) { note.innerHTML = html; note.hidden = false; }
    Array.prototype.forEach.call(document.querySelectorAll(".data-retry"), function (b) {
      b.addEventListener("click", function () {
        if (note) note.hidden = true;
        loadData();
      });
    });
  }

  function loadData() {
    Promise.all([D.load(), S.load()]).then(function (res) {
      state.all = res[0];
      wireFilters();
      var deepId = parseArtifactHash();
      var deep = deepId ? findArtifact(deepId) : null;
      if (deep && deep.destination === "Beyond") {
        window.location.replace("beyond.html#artifact=" + encodeURIComponent(deep.id));
        return;
      }
      // A deep link to a surface artifact selects its world; otherwise ?body= wins.
      var q = new URLSearchParams(window.location.search).get("body");
      if (deep && (deep.destination === "Moon" || deep.destination === "Mars")) {
        state.body = deep.destination.toLowerCase();
      } else if (q === "moon" || q === "mars") {
        state.body = q;
      }
      setBodyUI(state.body);

      if (!state.globe) {
        if (webglAvailable() && typeof Globe !== "undefined") {
          try { initGlobe(); }
          catch (e) { state.globe = null; enableFallback(); }
        } else {
          enableFallback();
        }
      } else {
        updatePoints();
      }
      renderLists();
      renderLegend();
      // A status-group tile on the Home page can open the globe with a filter.
      var f = new URLSearchParams(window.location.search).get("filter");
      if (f && S.categories().indexOf(f) >= 0) applyFilter(f);
      if (deep) openArtifact(deep, null);
      else if (deepId) { clearHash(); showNotFound(); }
    }).catch(showError);
  }

  function boot() {
    document.body.classList.add("globe-page");
    cacheEls();
    wireControls();
    wireSearch();
    updatePauseButton();
    window.addEventListener("hashchange", onHashChange);
    loadData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();