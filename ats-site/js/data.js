/* Loads artifact data from data/artifacts.json (the single source of truth).
   When the site is opened by double-clicking index.html (file://), fetch is
   blocked by the browser, so we fall back to data/artifacts.js — a mirror
   generated from the JSON by tools/sync-data.js.

   Field rules used across the site:
     "TODO" (or "TODO: ...")  -> display "Coming soon"
     empty / missing / null   -> hidden entirely (never "undefined"/"null")
     a real value             -> shown as-is */
(function () {
  "use strict";

  function isTodo(value) {
    return typeof value === "string" && value.trim().toUpperCase().indexOf("TODO") === 0;
  }
  /* A real, usable value: not null/undefined, not empty, not TODO. */
  function present(value) {
    return value !== null && value !== undefined && value !== "" && !isTodo(value);
  }
  function clean(value) {
    return present(value) ? value : null;
  }
  /* TODO -> "Coming soon"; real value -> value; empty/missing -> "" (caller hides). */
  function display(value) {
    if (isTodo(value)) return "Coming soon";
    return present(value) ? value : "";
  }
  /* A real position counts only when it records its source in coord_source. */
  function siteLocated(s) {
    return !!s && typeof s.lat === "number" && isFinite(s.lat) &&
      typeof s.lon === "number" && isFinite(s.lon) && present(s.coord_source);
  }
  /* Every site for an artifact: the "sites" list when present, otherwise the
     old lat/lon pair as a single unnamed site. Only real numeric positions are
     returned, so a Beyond craft (or one with null coordinates) yields []. */
  function sites(a) {
    if (!a) return [];
    if (Array.isArray(a.sites) && a.sites.length) return a.sites;
    if (typeof a.lat === "number" && isFinite(a.lat) &&
        typeof a.lon === "number" && isFinite(a.lon)) {
      return [{ label: a.location, lat: a.lat, lon: a.lon, coord_system: null,
        coord_source: a.coord_source }];
    }
    return [];
  }
  function located(a) { return sites(a).some(siteLocated); }
  /* Sites that can actually be drawn: numeric lat/lon plus a recorded source. */
  function drawableSites(a) { return sites(a).filter(siteLocated); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* A friendly, consistent error block with a Retry button. Pages insert this
     HTML and wire the .data-retry button to their own reload function. */
  function errorBlock(message) {
    return '<div class="data-error" role="alert">' +
      '<svg class="data-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>' +
      '<div class="data-error-body">' +
        '<p class="data-error-title">We could not load the mission data.</p>' +
        '<p class="data-error-msg">' + esc(message || "Please check your connection and try again.") + '</p>' +
        '<button type="button" class="btn data-retry">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>' +
          'Try again</button>' +
      '</div></div>';
  }

  /* Bump the version whenever the JSON content changes so no browser or
     service worker can serve a cached copy of an older data file. */
  var DATA_VERSION = "5";

  /* Records are prepared in phases. Phase 2 records are written and checked in
     the data file but stay hidden from the site until the team publishes them;
     raise VISIBLE_PHASE to 2 when they are ready. A record with no phase is
     visible, so older data files keep working. */
  var VISIBLE_PHASE = 1;
  function published(a) {
    if (!a || a.phase === undefined || a.phase === null) return true;
    return a.phase <= VISIBLE_PHASE;
  }

  function fetchJson(url, mirror, invalidMsg) {
    return fetch(url + "?v=" + DATA_VERSION, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(function () {
        if (mirror) return mirror;
        throw new Error("Data unavailable. Run tools/sync-data.js or use a local server.");
      })
      .then(function (data) {
        if (!data) throw new Error(invalidMsg);
        return data;
      });
  }

  window.ArtifactData = {
    isTodo: isTodo,
    present: present,
    clean: clean,
    display: display,
    located: located,
    sites: sites,
    siteLocated: siteLocated,
    drawableSites: drawableSites,
    esc: esc,
    errorBlock: errorBlock,

    load: function () {
      return window.ArtifactData.loadAll().then(function (all) {
        return all.filter(published);
      });
    },

    /* Raw records for developer views and the sources index: includes records
       for later phases that are not shown anywhere else on the site. */
    loadAll: function () {
      return fetchJson("data/artifacts.json", window.ARTIFACTS_MIRROR, "Invalid artifacts.json")
        .then(function (data) {
          if (!Array.isArray(data.artifacts)) throw new Error("Invalid artifacts.json");
          return data.artifacts;
        });
    },

    visiblePhase: VISIBLE_PHASE,

    loadQuiz: function () {
      return fetchJson("data/quiz.json", window.QUIZ_MIRROR, "Invalid quiz.json")
        .then(function (data) {
          if (!Array.isArray(data.questions)) throw new Error("Invalid quiz.json");
          return data.questions;
        });
    },

    loadCredits: function () {
      return fetchJson("data/credits.json", window.CREDITS_MIRROR, "Invalid credits.json")
        .then(function (data) {
          if (!Array.isArray(data.textures) || !Array.isArray(data.fonts)) throw new Error("Invalid credits.json");
          return data;
        });
    }
  };
})();