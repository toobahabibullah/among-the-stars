/* Among the Stars — shared exhibit panel component.
   Injected once into any page that includes this script. Both the globe page
   and the Beyond page open exhibits through window.Exhibit so there is a
   single template and a single set of behaviours.

   Section order: hero image, name + status, quick facts, where it is, story,
   how it worked, what it carried, what scientists learned, timeline,
   did you know, where is it now, related machines, learn more.
   A section whose content is entirely TODO is hidden; one small note tells
   the reader that more details are coming. */
(function () {
  "use strict";

  var D = window.ArtifactData;
  var S = window.StatusData;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var TYPE_COLORS = {
    "rover": "#D8DEE9",
    "lander": "#6CB8FF",
    "descent stage": "#6FDC8C",
    "instrument": "#D98FB0",
    "spacecraft": "#A99BE0",
    "helicopter": "#E8C97A",
    "telescope": "#8CC9C2",
    "asteroid lander": "#C7A6E8"
  };
  function typeColor(t) { return TYPE_COLORS[t] || "#D8DEE9"; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* A distinct line icon per artifact type, used by the hero placeholder. */
  function typeGlyph(t) {
    var paths = {
      "rover": '<rect x="6" y="9" width="12" height="6" rx="1.5"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/><path d="M12 9V5M9 5h6M18 11h2l1-2"/>',
      "spacecraft": '<path d="M12 3v6"/><circle cx="12" cy="12" r="3"/><path d="M5 8a9 9 0 0 0 14 0"/><path d="M9 15l-2 6M15 15l2 6M12 15v6"/>',
      "descent stage": '<path d="M8 4h8l2 8H6z"/><path d="M6 12l-2 8M18 12l2 8M10 12v8M14 12v8"/><path d="M4 20h4M16 20h4"/>',
      "lander": '<rect x="8" y="6" width="8" height="7" rx="1"/><path d="M8 13l-3 7M16 13l3 7M12 13v7"/><path d="M3 20h4M17 20h4M10 20h4"/>',
      "instrument": '<rect x="5" y="7" width="14" height="10" rx="1.5"/><path d="M9 7V4h6v3M9 17v3M15 17v3"/><circle cx="12" cy="12" r="2"/>',
      "telescope": '<path d="M3 10l13-5 3 5-13 5z"/><path d="M9 13l-2 7M16 11l2 9"/><path d="M6 20h3M17 20h3"/>',
      "helicopter": '<path d="M4 5h16M12 5v4"/><rect x="8" y="9" width="10" height="6" rx="2"/><path d="M8 12H4M18 15l2 4"/><path d="M3 20h6M14 20h7"/>',
      "asteroid lander": '<path d="M8 4h8v6H8z"/><path d="M8 10l-3 6M16 10l3 6M12 10v6"/><path d="M3 16l3 2 3-2 3 2 3-2 3 2 3-2"/>'
    };
    var p = paths[t] || '<rect x="7" y="9" width="10" height="7" rx="1.5"/><circle cx="9.5" cy="18" r="1.6"/><circle cx="14.5" cy="18" r="1.6"/><path d="M12 9V5M9 5h6"/>';
    return '<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  /* Show/hide a whole section. When it is hidden only because every value is
     still TODO, mark it so the single "more details" note can appear. */
  function setSection(sec, show, todo) {
    if (!sec) return;
    sec.hidden = !show;
    if (!show && todo) sec.setAttribute("data-todo", "1");
    else sec.removeAttribute("data-todo");
  }

  /* Coordinates keep every decimal the data has; only the sign becomes N/S/E/W. */
  function fmtCoords(site) {
    var lat = site.lat, lon = site.lon;
    return Math.abs(lat) + "° " + (lat >= 0 ? "N" : "S") + ", " +
      Math.abs(lon) + "° " + (lon >= 0 ? "E" : "W");
  }
  function sameSite(a, b) {
    return !!a && !!b && a.lat === b.lat && a.lon === b.lon;
  }

  /* Vertical timeline: render fully-filled entries; TODO-only hides it. */
  function renderTimeline(a) {
    var t = Array.isArray(a.timeline) ? a.timeline : [];
    var entries = [];
    t.forEach(function (e) {
      var when = D.clean(e && e.when), what = D.clean(e && e.what);
      if (when !== null && when !== "" && what !== null && what !== "") entries.push([when, what]);
    });
    var node = refs["ex-timeline"];
    if (entries.length) {
      node.innerHTML = '<ol class="exhibit-timeline">' + entries.map(function (e) {
        return '<li><span class="tl-when">' + esc(e[0]) + '</span><span class="tl-what">' + esc(e[1]) + "</span></li>";
      }).join("") + "</ol>";
      setSection(refs["sec-timeline"], true, false);
    } else {
      node.innerHTML = "";
      setSection(refs["sec-timeline"], false, t.some(D.isTodo));
    }
  }

  /* Quick facts: a clean two-column table. TODO rows stay in the markup but
     are hidden; empty rows are omitted; a table with no visible rows hides. */
  function factTable(a) {
    var rows = [], visible = 0;
    function row(label, value) {
      if (D.isTodo(value)) {
        rows.push('<tr hidden><th scope="row">' + esc(label) + '</th><td><span class="coming-soon">Coming soon</span></td></tr>');
        return;
      }
      if (!D.present(value)) return;
      visible++;
      rows.push('<tr><th scope="row">' + esc(label) + '</th><td>' + esc(value) + "</td></tr>");
    }
    var qf = a.quick_facts || {};
    row("Mission", a.mission);
    row("Launch", qf.launch_date);
    row("Landing", qf.landing_date);
    row("Mass", qf.mass);
    row("Size", qf.size);
    row("Power", qf.power_source);
    row("Designed lifetime", qf.designed_lifetime);
    row("Actual lifetime", qf.actual_lifetime);
    row("Last contact", qf.last_contact);
    (Array.isArray(a.key_numbers) ? a.key_numbers : []).forEach(function (k) {
      if (k && D.present(k.label)) row(k.label, k.value);
    });
    refs["ex-facts"].querySelector("tbody").innerHTML = rows.join("");
    refs["ex-facts"].hidden = visible === 0;
  }

  /* "Where on the Moon/Mars": one button per site; a click asks the page to
     fly the camera to that dot. Sites with no sourced coordinates are listed
     but cannot be flown to. */
  var activeSite = null;
  var siteList = [];
  function markSiteButtons() {
    var buttons = refs["ex-sites"].querySelectorAll(".site-btn");
    Array.prototype.forEach.call(buttons, function (btn, i) {
      var on = sameSite(siteList[i], activeSite);
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function renderSites(a) {
    siteList = D.sites(a);
    var sec = refs["sec-where"], host = refs["ex-sites"];
    if (!siteList.length) { host.innerHTML = ""; setSection(sec, false, false); return; }
    var title = a.destination === "Moon" ? "Where on the Moon"
      : a.destination === "Mars" ? "Where on Mars" : "Where it is";
    refs["ex-sites-title"].textContent = title;
    host.innerHTML = siteList.map(function (s, i) {
      var label = D.present(s.label) ? s.label : "Site " + (i + 1);
      var drawable = D.siteLocated(s);
      var coords = drawable ? fmtCoords(s) : "Coordinates coming soon";
      return '<button type="button" class="site-btn" data-site="' + i + '"' +
        (drawable ? "" : ' disabled aria-disabled="true"') + ">" +
        '<span class="site-name">' + esc(label) + "</span>" +
        '<span class="site-coords' + (drawable ? "" : " coming-soon") + '">' + esc(coords) + "</span>" +
        "</button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".site-btn"), function (btn) {
      var site = siteList[Number(btn.getAttribute("data-site"))];
      btn.addEventListener("click", function () {
        if (!D.siteLocated(site)) return;
        activeSite = site;
        markSiteButtons();
        if (opts.onLocateSite) opts.onLocateSite(site);
        else window.location.href = "globe.html#artifact=" + encodeURIComponent(a.id);
      });
    });
    setSection(sec, true, false);
  }

  function renderInstruments(a) {
    var raw = Array.isArray(a.instruments) ? a.instruments : [];
    var real = raw.filter(function (it) { return it && D.present(it.name); });
    var sec = refs["sec-instruments"];
    if (real.length) {
      refs["ex-instruments"].innerHTML = real.map(function (it) {
        var did = D.present(it.what_it_did) ? '<span class="inst-did">' + esc(it.what_it_did) + "</span>" : "";
        return '<li><span class="inst-name">' + esc(it.name) + "</span>" + did + "</li>";
      }).join("");
      setSection(sec, true, false);
    } else {
      refs["ex-instruments"].innerHTML = "";
      setSection(sec, false, raw.length > 0);
    }
  }

  function renderRelated(a) {
    var ids = Array.isArray(a.related) ? a.related : [];
    var all = Array.isArray(opts.all) ? opts.all : [];
    var byId = {};
    all.forEach(function (x) { if (x && x.id) byId[x.id] = x; });
    var chips = [];
    ids.forEach(function (id) {
      var rel = byId[id];
      if (!rel) return;                       // phases not published on this page
      chips.push('<button type="button" class="related-chip" data-id="' + esc(id) + '">' +
        esc(rel.name) + "</button>");
    });
    var sec = refs["sec-related"];
    if (!chips.length) { refs["ex-related"].innerHTML = ""; setSection(sec, false, false); return; }
    refs["ex-related"].innerHTML = chips.join("");
    Array.prototype.forEach.call(refs["ex-related"].querySelectorAll(".related-chip"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (opts.onRelated) opts.onRelated(id);
        else window.location.href = "globe.html#artifact=" + encodeURIComponent(id);
      });
    });
    setSection(sec, true, false);
  }

  function listSection(sec, node, items, renderItem) {
    var raw = Array.isArray(items) ? items : [];
    var real = raw.map(D.clean).filter(function (v) { return v !== null && v !== ""; });
    if (real.length) { node.innerHTML = real.map(renderItem).join(""); setSection(sec, true, false); }
    else { node.innerHTML = ""; setSection(sec, false, raw.some(D.isTodo)); }
  }

  function proseSection(sec, node, value) {
    if (D.present(value)) { node.textContent = value; setSection(sec, true, false); }
    else { node.textContent = ""; setSection(sec, false, D.isTodo(value)); }
  }

  /* Prose for the status detail inside the header (not a whole section). */
  function proseInline(node, value) {
    if (D.isTodo(value)) { node.innerHTML = '<span class="coming-soon">Coming soon</span>'; node.hidden = false; }
    else if (D.present(value)) { node.textContent = value; node.hidden = false; }
    else { node.hidden = true; }
  }

  var TEMPLATE =
    '<aside class="exhibit-panel" id="exhibit-panel" role="dialog" aria-modal="false" aria-labelledby="ex-title" aria-hidden="true">' +
      '<button type="button" class="exhibit-close" id="ex-close" aria-label="Close exhibit">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button>' +
      '<div class="exhibit-scroll">' +
        '<figure class="exhibit-hero">' +
          '<div class="hero-img-wrap">' +
            '<img id="ex-img" alt="" decoding="async" hidden>' +
            '<div class="hero-fallback" id="ex-img-fallback" hidden>' +
              '<span class="hf-glyph" id="hf-glyph" aria-hidden="true"></span>' +
              '<span class="hf-name" id="hf-name"></span>' +
              '<span class="hf-sub" id="hf-sub"></span>' +
            '</div>' +
          '</div>' +
          '<figcaption><span id="ex-credit"></span> <a id="ex-source-link" href="#" target="_blank" rel="noopener noreferrer" hidden>Image source</a></figcaption>' +
        '</figure>' +
        '<header class="exhibit-head">' +
          '<p class="exhibit-kicker"><span id="ex-dest"></span> · <span id="ex-type"></span></p>' +
          '<h2 id="ex-title"></h2>' +
          '<div class="ex-badge-wrap" id="ex-badge"></div>' +
          '<div class="ex-status-note">' +
            '<p class="ex-meaning"><span class="ex-meaning-label">What this means:</span> <span id="ex-definition"></span></p>' +
            '<p class="ex-detail" id="ex-detail"></p>' +
            '<a class="ex-status-source" id="ex-status-source" href="#" target="_blank" rel="noopener noreferrer" hidden>' +
              '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>' +
              '<span>NASA status source</span>' +
            '</a>' +
          '</div>' +
          '<p class="factcheck" id="ex-factcheck" hidden>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' +
            '<span>This information is being fact-checked.</span>' +
          '</p>' +
        '</header>' +
        '<table class="quick-facts" id="ex-facts" hidden><tbody></tbody></table>' +
        '<section class="exhibit-section" id="sec-where" hidden>' +
          '<h3 id="ex-sites-title">Where it is</h3>' +
          '<div class="site-list" id="ex-sites"></div>' +
        '</section>' +
        '<section class="exhibit-section" id="sec-story" hidden><h3>Its story</h3><p id="ex-story"></p></section>' +
        '<section class="exhibit-section" id="sec-how" hidden><h3>How it worked</h3><p id="ex-how"></p></section>' +
        '<section class="exhibit-section" id="sec-instruments" hidden><h3>What it carried</h3><ul class="instrument-list" id="ex-instruments"></ul></section>' +
        '<section class="exhibit-section" id="sec-discoveries" hidden><h3>What scientists learned</h3><ul id="ex-discoveries"></ul></section>' +
        '<section class="exhibit-section" id="sec-timeline" hidden><h3>Timeline</h3><div id="ex-timeline"></div></section>' +
        '<section class="exhibit-section" id="sec-didyouknow" hidden><h3>Did you know?</h3><ul id="ex-didyouknow"></ul></section>' +
        '<section class="exhibit-section" id="sec-status" hidden><h3>Where is it now?</h3><p id="ex-status"></p></section>' +
        '<section class="exhibit-section" id="ex-signal-section" hidden><h3>How long does a signal take?</h3><p id="ex-signal"></p></section>' +
        '<p class="exhibit-more" id="ex-more" hidden>More details coming soon.</p>' +
        '<section class="exhibit-section" id="sec-related" hidden><h3>Related machines</h3><div class="related-chips" id="ex-related"></div></section>' +
        '<section class="exhibit-section" id="sec-sources" hidden><h3>Learn more</h3><ul class="exhibit-sources" id="ex-sources"></ul></section>' +
        '<div class="exhibit-nav" id="ex-nav" hidden>' +
          '<button type="button" class="ex-nav-btn" id="ex-prev" hidden>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Previous</button>' +
          '<button type="button" class="ex-nav-btn ex-locate" id="ex-locate" hidden>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></svg>Locate on globe</button>' +
          '<button type="button" class="ex-nav-btn" id="ex-next" hidden>Next' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>' +
        '</div>' +
        '<button type="button" class="btn back-to-globe" id="ex-back">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>' +
          '<span id="ex-back-label">Back</span>' +
        '</button>' +
      '</div>' +
    '</aside>';

  var panel = null, refs = {}, isOpen = false, current = null, lastFocus = null, opts = {};
  var IDS = ["ex-close", "ex-back", "ex-back-label", "ex-title", "ex-dest", "ex-type",
    "ex-badge", "ex-definition", "ex-detail", "ex-status-source", "ex-factcheck",
    "ex-img", "ex-img-fallback", "ex-credit", "ex-source-link",
    "ex-facts", "ex-story", "ex-how", "ex-discoveries", "ex-status", "ex-sources",
    "ex-timeline", "ex-signal", "ex-signal-section", "hf-glyph", "hf-name", "hf-sub",
    "ex-nav", "ex-prev", "ex-next", "ex-locate",
    "ex-sites", "ex-sites-title", "ex-instruments", "ex-didyouknow", "ex-related",
    "ex-more", "sec-where", "sec-story", "sec-how", "sec-instruments",
    "sec-discoveries", "sec-timeline", "sec-didyouknow", "sec-status",
    "sec-related", "sec-sources"];

  function ensure() {
    if (panel) return;
    var host = document.createElement("div");
    host.innerHTML = TEMPLATE;
    panel = host.firstElementChild;
    document.body.appendChild(panel);
    IDS.forEach(function (id) { refs[id] = panel.querySelector("#" + id); });
    panel.inert = true;
    refs["ex-close"].addEventListener("click", close);
    refs["ex-back"].addEventListener("click", close);
    refs["ex-prev"].addEventListener("click", function () { navigate(-1); });
    refs["ex-next"].addEventListener("click", function () { navigate(1); });
    refs["ex-locate"].addEventListener("click", locate);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) { e.preventDefault(); close(); }
    });
  }

  function indexOfCurrent(list) {
    if (!current) return -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === current.id) return i;
    return -1;
  }
  function navigate(dir) {
    var list = opts.list || [];
    var idx = indexOfCurrent(list);
    var ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= list.length) return;
    var a = list[ni];
    var trigger = dir < 0 ? refs["ex-prev"] : refs["ex-next"];
    if (opts.onNavigate) opts.onNavigate(a, trigger);
    else open(a, opts);
  }
  function locate() {
    if (!current) return;
    var site = activeSite || (D.drawableSites(current)[0] || null);
    if (opts.onLocateSite) { if (site) opts.onLocateSite(site); }
    else if (D.located(current)) window.location.href = "globe.html#artifact=" + encodeURIComponent(current.id);
  }
  function updateNav() {
    var list = opts.list || [];
    var idx = indexOfCurrent(list);
    var hasNav = list.length > 1 && idx >= 0;
    refs["ex-prev"].hidden = !hasNav;
    refs["ex-next"].hidden = !hasNav;
    refs["ex-prev"].disabled = idx <= 0;
    refs["ex-next"].disabled = idx >= list.length - 1;
    var canLoc = opts.canLocate !== undefined ? !!opts.canLocate : D.located(current);
    refs["ex-locate"].hidden = !canLoc;
    refs["ex-nav"].hidden = !hasNav && !canLoc;
  }

  function fill(a) {
    panel.style.setProperty("--ex-type-color", typeColor(a.type));
    refs["ex-title"].textContent = a.name;
    refs["ex-dest"].textContent = a.destination === "Beyond" ? "Deep space" : cap(a.destination);
    refs["ex-type"].textContent = D.present(a.type) ? a.type : "";

    refs["ex-badge"].innerHTML = S.badgeHtml(a.status);
    var def = S.definitionOf(a.status);
    if (def) refs["ex-definition"].textContent = def;
    else refs["ex-definition"].innerHTML = '<span class="coming-soon">Coming soon</span>';
    proseInline(refs["ex-detail"], a.status_detail);
    var statusSrc = D.clean(a.status_source);
    if (statusSrc && /^https?:\/\//i.test(statusSrc)) {
      refs["ex-status-source"].href = statusSrc;
      refs["ex-status-source"].hidden = false;
    } else {
      refs["ex-status-source"].hidden = true;
    }
    refs["ex-factcheck"].hidden = a.verified !== false;

    var img = refs["ex-img"], fb = refs["ex-img-fallback"];
    function showHeroFallback() {
      img.hidden = true; fb.hidden = false;
      refs["hf-glyph"].innerHTML = typeGlyph(a.type);
      refs["hf-glyph"].style.color = typeColor(a.type);
      refs["hf-name"].textContent = a.name;
      refs["hf-sub"].textContent = "Image coming soon";
    }
    var file = D.clean(a.image_file);
    img.alt = D.clean(a.image_alt) || (a.name + " — exhibit image");
    // Placeholder when there is no image file OR the credit is still TODO.
    if (!file || D.isTodo(a.image_credit)) {
      showHeroFallback();
    } else {
      // Lazy by design: src is assigned only when an exhibit opens, so no image
      // is requested on page load. Native loading="lazy" is avoided — it never
      // fires inside this transformed fixed panel, which would block the fallback.
      img.hidden = false; fb.hidden = true;
      img.onerror = showHeroFallback;
      img.onload = function () { img.hidden = false; fb.hidden = true; };
      img.removeAttribute("src"); // force a fresh load (and error) when reopening
      img.src = file;
    }

    if (D.isTodo(a.image_credit)) { refs["ex-credit"].textContent = "Image: Coming soon"; refs["ex-credit"].hidden = false; }
    else if (D.present(a.image_credit)) { refs["ex-credit"].textContent = "Image: " + a.image_credit; refs["ex-credit"].hidden = false; }
    else { refs["ex-credit"].textContent = ""; refs["ex-credit"].hidden = true; }
    var srcUrl = D.clean(a.image_source_url);
    if (srcUrl && /^https?:\/\//i.test(srcUrl)) { refs["ex-source-link"].href = srcUrl; refs["ex-source-link"].hidden = false; }
    else { refs["ex-source-link"].hidden = true; }

    factTable(a);

    activeSite = opts.site || null;
    renderSites(a);
    if (!activeSite) activeSite = D.drawableSites(a)[0] || null;
    if (siteList.length) markSiteButtons();

    proseSection(refs["sec-story"], refs["ex-story"], D.present(a.story) ? a.story : a.mission_context);
    proseSection(refs["sec-how"], refs["ex-how"], a.how_it_worked);
    renderInstruments(a);
    listSection(refs["sec-discoveries"], refs["ex-discoveries"], a.discoveries,
      function (d) { return "<li>" + esc(d) + "</li>"; });
    renderTimeline(a);
    listSection(refs["sec-didyouknow"], refs["ex-didyouknow"], a.did_you_know,
      function (d) { return "<li>" + esc(d) + "</li>"; });
    proseSection(refs["sec-status"], refs["ex-status"], a.status_text);

    var sig = a.signal_travel_note;
    if (D.present(sig)) { refs["ex-signal"].textContent = sig; refs["ex-signal-section"].hidden = false; }
    else if (D.isTodo(sig)) { refs["ex-signal"].innerHTML = '<span class="coming-soon">Coming soon</span>'; refs["ex-signal-section"].hidden = false; }
    else { refs["ex-signal-section"].hidden = true; }

    renderRelated(a);

    listSection(refs["sec-sources"], refs["ex-sources"], a.sources, function (s) {
      if (/^https?:\/\//i.test(s)) {
        var hostName = s.replace(/^https?:\/\//i, "").split("/")[0];
        return '<li><a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(hostName) + "</a></li>";
      }
      return "<li>" + esc(s) + "</li>";
    });

    /* One small note when any detail section is hidden only because it is TODO. */
    var anyTodo = ["sec-where", "sec-story", "sec-how", "sec-instruments",
      "sec-discoveries", "sec-timeline", "sec-didyouknow", "sec-status"].some(function (id) {
        return refs[id] && refs[id].getAttribute("data-todo") === "1";
      });
    refs["ex-more"].hidden = !anyTodo;

    updateNav();
  }

  function open(a, o) {
    ensure();
    opts = o || {};
    current = a;
    if (!isOpen) lastFocus = opts.trigger || document.activeElement;
    fill(a);
    refs["ex-back-label"].textContent = opts.backLabel || "Back";
    isOpen = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    panel.inert = false;
    if (opts.onOpen) opts.onOpen(a);
    window.setTimeout(function () { refs["ex-close"].focus(); }, reduceMotion ? 0 : 120);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("open");
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
    var cb = opts.onClose, lf = lastFocus;
    current = null;
    if (cb) cb();
    if (lf && document.contains(lf)) lf.focus();
  }

  window.Exhibit = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
    current: function () { return current; },
    typeColor: typeColor
  };
})();
