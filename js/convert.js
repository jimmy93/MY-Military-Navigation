/* ============================================================
   COORDINATE CONVERTER (Convert view)
   Thin UI over the coordinate engine:
     parseCoordinate(line, FROM) -> {lat,lng} -> formatCoordinate(lat,lng,TO)
   Supports every registered format, so any From -> To pair works.
   Input: one coordinate per line (commas stay inside a coordinate).
   ============================================================ */

(function() {
  /* Formats offered in the From / To selects (value = app format id). */
  var FORMATS = [
    { value: 'latlng-dd',   label: 'Lat/Lng (DD)' },
    { value: 'latlng-dms',  label: 'Lat/Lng (DMS)' },
    { value: 'mgrs',        label: 'MGRS' },
    { value: 'epsg-3375',   label: 'EPSG:3375 — GDM2000 Peninsular RSO' },
    { value: 'epsg-3376',   label: 'EPSG:3376 — GDM2000 East Malaysia RSO' },
    { value: 'epsg-3168',   label: 'EPSG:3168 — Kertau 1968 RSO Malaya' },
    { value: 'epsg-29873',  label: 'EPSG:29873 — Timbalai 1948 RSO Borneo' },
    { value: 'epsg-3377',   label: 'EPSG:3377 — GDM2000 Johor Grid' },
    { value: 'epsg-3378',   label: 'EPSG:3378 — GDM2000 Sembilan & Melaka Grid' },
    { value: 'epsg-3379',   label: 'EPSG:3379 — GDM2000 Pahang Grid' },
    { value: 'epsg-3380',   label: 'EPSG:3380 — GDM2000 Selangor Grid' },
    { value: 'epsg-3381',   label: 'EPSG:3381 — GDM2000 Terengganu Grid' },
    { value: 'epsg-3382',   label: 'EPSG:3382 — GDM2000 Pinang Grid' },
    { value: 'epsg-3383',   label: 'EPSG:3383 — GDM2000 Kedah & Perlis Grid' },
    { value: 'epsg-3384',   label: 'EPSG:3384 — GDM2000 Perak Grid' },
    { value: 'epsg-3385',   label: 'EPSG:3385 — GDM2000 Kelantan Grid' }
  ];

  var DEFAULT_FROM = 'latlng-dd';
  var DEFAULT_TO   = 'epsg-3375';

  var lastPlain = ''; // plain-text output of the last conversion (for COPY)

  function byId(id) { return document.getElementById(id); }

  function fillSelect(sel, selected) {
    if (!sel) return;
    sel.innerHTML = '';
    FORMATS.forEach(function(f) {
      var opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      if (f.value === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(function() {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function convert() {
    var from = byId('convert-from') ? byId('convert-from').value : DEFAULT_FROM;
    var to   = byId('convert-to') ? byId('convert-to').value : DEFAULT_TO;
    var input = byId('convert-input') ? byId('convert-input').value : '';
    var outEl = byId('convert-output');
    if (!outEl) return;

    var lines = input.split(/\r?\n/);
    var rows = [];
    var plain = [];

    lines.forEach(function(raw) {
      var line = raw.trim();
      if (!line) return;
      var parsed = null;
      try { parsed = parseCoordinate(line, from); } catch (e) { parsed = null; }
      if (parsed && parsed.lat != null && parsed.lng != null && !isNaN(parsed.lat) && !isNaN(parsed.lng)) {
        var out = formatCoordinate(parsed.lat, parsed.lng, to);
        rows.push('<div class="convert-line"><span class="convert-ok">&#10003;</span><span class="convert-val">' + escapeHtml(out) + '</span></div>');
        plain.push(out);
      } else {
        rows.push('<div class="convert-line convert-bad"><span class="convert-err">&#10007;</span><span class="convert-val">' + escapeHtml(line) + ' <em>(unparsed)</em></span></div>');
      }
    });

    if (!rows.length) {
      outEl.innerHTML = '<div class="convert-empty">Output appears here</div>';
    } else {
      outEl.innerHTML = rows.join('');
    }
    lastPlain = plain.join('\n');
  }

  function init() {
    var fromSel = byId('convert-from');
    var toSel = byId('convert-to');
    if (!fromSel || !toSel) return;

    fillSelect(fromSel, DEFAULT_FROM);
    fillSelect(toSel, DEFAULT_TO);

    var inputEl = byId('convert-input');
    if (inputEl) inputEl.addEventListener('input', convert);
    fromSel.addEventListener('change', convert);
    toSel.addEventListener('change', convert);

    var copyBtn = byId('btn-convert-copy');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      if (!lastPlain) { if (window.App && App.toast) App.toast('Nothing to copy', 'error'); return; }
      copyText(lastPlain);
      if (window.App && App.toast) App.toast('Copied output');
    });

    var clearBtn = byId('btn-convert-clear');
    if (clearBtn) clearBtn.addEventListener('click', function() {
      if (inputEl) inputEl.value = '';
      convert();
    });

    convert();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
