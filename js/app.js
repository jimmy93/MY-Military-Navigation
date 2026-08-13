var App = (function() {
  var view = 'compass';
  var fmt = 'epsg-3375';
  var cunit = 'mils';
  var mtype = 'satellite';
  var ulat = null, ulng = null, uacc = null;
  var gpsOn = false;
  var selMode = false;
  var selIds = new Set();
  var tgtId = null;
  var confirmCb = null;
  var watchId = null;

  function byId(id) { return document.getElementById(id); }

  function init() {
    identifyUser();
    loadSettings();
    bindUI();
    Compass.init();
    requestGPS();
    Compass.onHeading(function(d) { MapView.setHeading(d); updNavReadout(); });
    setInterval(updNavReadout, 2000);
    refreshList();
  }
    // User identity is stored locally via getOrCreateUserId().
    // NOTE: umami.identify() was removed because it triggers a server-side
    // Prisma P2002 crash (Unique constraint on session_data_id) in the
    // Umami instance at umami.jimmy.je, returning 500 on every /api/send request.
    // getOrCreateUserId();
  function identifyUser() {
    // Check if we already identified this user in the current browser session tab
    if (sessionStorage.getItem('umami_identified')) return;

    var userId = getOrCreateUserId();

    setTimeout(function() {
      if (window.umami && typeof window.umami.identify === 'function') {
        window.umami.identify(userId, {
          preferred_unit: cunit,
          format: fmt
        });
        sessionStorage.setItem('umami_identified', 'true');
      }
    }, 500);
  }
  function loadSettings() {
    try { var s = JSON.parse(localStorage.getItem('tfo_settings') || '{}'); fmt = s.positionFormat || 'epsg-3375'; cunit = s.compassUnits || 'mils'; mtype = s.mapType || 'satellite'; } catch(e) {}
    applySettings();
  }
  function autoDetectRegion(lat, lng) {
    if (fmt !== 'epsg-3375' && fmt !== 'epsg-3376') return;
    if (lng != null && lng > 109) {
      if (fmt === 'epsg-3375') { fmt = 'epsg-3376'; applySettings(); saveSettings(); }
    }
  }
  function saveSettings() {
    localStorage.setItem('tfo_settings', JSON.stringify({ positionFormat: fmt, compassUnits: cunit, mapType: mtype }));
    sessionStorage.removeItem('umami_identified');
    identifyUser();
  }
  function applySettings() {
    var names = { 'mgrs':'MGRS', 'latlng-dd':'Lat/Lng (DD)', 'latlng-dms':'Lat/Lng (DMS)', 'epsg-3375':'GDM2000 Peninsular RSO', 'epsg-3376':'GDM2000 East Malaysia RSO', 'epsg-3168':'Kertau 1968 Malaya RSO', 'epsg-29873':'Timbalai 1948 Borneo RSO' };
    byId('format-display').textContent = names[fmt] || 'MGRS';
    Compass.setUnit(cunit);
    document.querySelectorAll('input[name="format"]').forEach(function(r) { r.checked = r.value === fmt; });
    document.querySelectorAll('input[name="compass-units"]').forEach(function(r) { r.checked = r.value === cunit; });
    document.querySelectorAll('input[name="map-type"]').forEach(function(r) { r.checked = r.value === mtype; });
    updPosReadout();
    refreshList();
  }

  function requestGPS() {
    if (!navigator.geolocation) { setGPS(false); return; }
    if (watchId) navigator.geolocation.clearWatch(watchId);
    navigator.geolocation.getCurrentPosition(function(pos) {
      ulat = pos.coords.latitude; ulng = pos.coords.longitude; uacc = pos.coords.accuracy;
      autoDetectRegion(ulat, ulng);
      gpsOn = true; setGPS(true); updPosReadout(); updAcc();
      MapView.updPosition(ulat, ulng, uacc); updNavReadout(); updGoNav();
    }, function() { setGPS(false); }, { enableHighAccuracy: true, timeout: 10000 });
    watchId = navigator.geolocation.watchPosition(function(pos) {
      ulat = pos.coords.latitude; ulng = pos.coords.longitude; uacc = pos.coords.accuracy;
      gpsOn = true; setGPS(true); updPosReadout(); updAcc();
      MapView.updPosition(ulat, ulng, uacc); updNavReadout(); updGoNav();
    }, function() {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
  }

  function setGPS(on) { var el = byId('gps-indicator'); if (el) { if (on) el.classList.add('active'); else el.classList.remove('active'); } }
  function updAcc() { if (uacc != null) byId('accuracy-display').textContent = '±' + Math.round(uacc) + 'm'; }
  function updPosReadout() { if (ulat != null && ulng != null) byId('current-pos').textContent = formatCoordinate(ulat, ulng, fmt); }

  function switchView(v) {
    if (view === v) return;
    document.querySelectorAll('.view').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.nav-btn').forEach(function(el) { el.classList.remove('active'); });
    var ve = byId('view-' + v); if (ve) ve.classList.add('active');
    var nb = document.querySelector('.nav-btn[data-view="' + v + '"]'); if (nb) nb.classList.add('active');
    view = v;
    if (v === 'map') setTimeout(function() { MapView.init(); MapView.setTile(mtype); MapView.loadWaypoints(); if (ulat != null) MapView.updPosition(ulat, ulng, uacc); if (tgtId) getWaypoint(tgtId).then(function(w) { if (w) MapView.setTarget(w); }); MapView.updCrosshair(); }, 200);
    if (v === 'locations') refreshList();
  }

  function openDialog(lat, lng, wpId) {
    byId('wp-lat').value = lat != null ? lat : '';
    byId('wp-lng').value = lng != null ? lng : '';
    byId('wp-coords').value = (lat != null && lng != null) ? formatCoordinate(lat, lng, fmt) : '';
    if (wpId) {
      byId('dialog-title').textContent = 'EDIT WAYPOINT'; byId('wp-id').value = wpId;
      getWaypoint(wpId).then(function(w) {
        if (!w) return;
        byId('wp-name').value = w.name || ''; byId('wp-desc').value = w.description || '';
        byId('wp-lat').value = w.latitude; byId('wp-lng').value = w.longitude;
        byId('wp-coords').value = formatCoordinate(w.latitude, w.longitude, fmt);
        setColor(w.color);
      });
    } else {
      byId('dialog-title').textContent = 'SAVE WAYPOINT'; byId('wp-id').value = '';
      byId('wp-name').value = ''; byId('wp-desc').value = ''; setColor('green');
    }
    byId('dialog-save-waypoint').style.display = 'flex';
    setTimeout(function() { byId('wp-name').focus(); }, 100);
  }
  function closeDialog() { byId('dialog-save-waypoint').style.display = 'none'; }

  /* Coordinate search dialog */
  function openSearchDialog() {
    byId('search-coords').value = '';
    byId('dialog-search').style.display = 'flex';
    setTimeout(function() { byId('search-coords').focus(); }, 100);
  }
  function closeSearchDialog() { byId('dialog-search').style.display = 'none'; }
  function searchLocation() {
    var input = byId('search-coords').value.trim();
    if (!input) { toast('Enter coordinates', 'error'); return; }
    var p = null;
    try { p = parseCoordinate(input, fmt); } catch (e) { p = null; }
    if (!p || p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) {
      toast('Invalid coordinates', 'error'); return;
    }
    closeSearchDialog();
    MapView.fly(p.lat, p.lng, 16);
    toast('Flying to: ' + formatCoordinate(p.lat, p.lng, fmt));
  }
  function setColor(c) { document.querySelectorAll('#wp-color-selector .color-btn').forEach(function(b) { if (b.dataset.color === c) b.classList.add('selected'); else b.classList.remove('selected'); }); }
  function getColor() { var s = document.querySelector('#wp-color-selector .color-btn.selected'); return s ? s.dataset.color : 'green'; }

  async function saveFromDialog() {
    var n = byId('wp-name').value.trim();
    if (!n) { toast('Name required', 'error'); return; }
    // Prefer the visible, user-editable coords field; the hidden wp-lat/wp-lng
    // inputs only hold the original values from openDialog() and are NOT updated
    // when the user edits wp-coords (this was the stale-coordinates bug).
    var coordsText = byId('wp-coords').value.trim();
    var lat, lng, parsed = null;
    if (coordsText) {
      try { parsed = parseCoordinate(coordsText, fmt); } catch (e) { parsed = null; }
    }
    if (parsed && parsed.lat != null && parsed.lng != null) {
      lat = parsed.lat; lng = parsed.lng;
      byId('wp-lat').value = lat; byId('wp-lng').value = lng;
    } else if (coordsText) {
      toast('Invalid coords', 'error'); return;
    } else {
      lat = parseFloat(byId('wp-lat').value); lng = parseFloat(byId('wp-lng').value);
    }
    if (isNaN(lat) || isNaN(lng)) { toast('Invalid coords', 'error'); return; }
    var id = byId('wp-id').value;
    var wp = { name: n, description: byId('wp-desc').value.trim(), latitude: lat, longitude: lng, color: getColor(), updatedAt: Date.now() };
    if (id) wp.id = parseInt(id, 10);
    try { await saveWaypoint(wp); closeDialog(); refreshList(); MapView.loadWaypoints(); loadNavWps(); toast(id ? 'Updated' : 'Saved'); }
    catch(e) { toast('Failed: ' + e.message, 'error'); }
  }

  async function refreshList() {
    var list = byId('locations-list'); if (!list) return;
    try {
      var wps = await getAllWaypoints();
      if (!wps.length) { list.innerHTML = '<div class="empty-state">NO WAYPOINTS SAVED</div>'; return; }
      list.innerHTML = wps.map(renderCard).join('');
      bindCards();
    } catch(e) { list.innerHTML = '<div class="empty-state">LOAD ERROR</div>'; }
  }

  function renderCard(wp) {
    var sel = selMode && selIds.has(wp.id) ? ' selected' : '';
    var hex = wp.color === 'blue' ? '#3399ff' : wp.color === 'red' ? '#ff3333' : wp.color === 'yellow' ? '#ffcc00' : wp.color === 'purple' ? '#9944ff' : '#2d8a4e';
    return '<div class="waypoint-card' + sel + '" data-id="' + wp.id + '">' +
      '<div class="wp-color-dot" style="background:' + hex + '"></div>' +
      '<div class="wp-info"><div class="wp-name">' + esc(wp.name) + '</div>' +
      '<div class="wp-coords-display">' + formatCoordinate(wp.latitude, wp.longitude, fmt) + '</div>' +
      (wp.description ? '<div class="wp-desc-display">' + esc(wp.description) + '</div>' : '') +
      '</div><div class="wp-actions' + (selMode ? ' hidden' : '') + '">' +
      '<button class="wp-btn btn-copy-coord" data-id="' + wp.id + '" title="Copy coordinates"><svg viewBox="0 0 115.77 122.88" width="16" height="16"><path fill="currentColor" d="M89.62,13.96v7.73h12.19v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v73.27v0.01h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02h-61.7H40.1v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02V92.51H13.96v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82H0v-0.02V13.96v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07V0h0.02h61.7v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02zm-10.58,7.73v-7.73h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1h-61.7v-0.02c-0.91,0-1.75,0.39-2.37,1.01c-0.61,0.61-1,1.46-1,2.37v64.59h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1h12.19V35.65h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07H79.04zm26.14,87.23V35.65h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1h-61.7v-0.02c-0.91,0-1.75,0.39-2.37,1.01c-0.61,0.61-1,1.46-1,2.37v73.27h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1h61.7v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-1.46,1-2.37z"/></svg></button>' +
      '<button class="wp-btn btn-target" data-id="' + wp.id + '" title="Go to target"><svg viewBox="0 0 122 122" width="16" height="16"><path fill="currentColor" d="M61.44,0c8.31,0,16.25,1.66,23.49,4.66c7.53,3.12,14.29,7.68,19.95,13.34c5.66,5.66,10.22,12.43,13.34,19.95c3,7.24,4.66,15.18,4.66,23.49c0,8.31-1.66,16.25-4.66,23.49c-3.12,7.53-7.68,14.29-13.34,19.95c-5.66,5.66-12.43,10.22-19.95,13.34c-7.24,3-15.18,4.66-23.49,4.66s-16.25-1.66-23.49-4.66c-7.53-3.12-14.29-7.68-19.95-13.34C12.34,99.22,7.77,92.46,4.66,84.93C1.66,77.69,0,69.75,0,61.44c0-8.31,1.66-16.25,4.66-23.49C7.77,30.42,12.34,23.66,18,18c5.66-5.66,12.43-10.22,19.95-13.34C45.19,1.66,53.13,0,61.44,0zM114.93,65.33H91.79c-1.13,0-2.16-0.42-2.91-1.11c-0.78-0.71-1.26-1.69-1.26-2.79c0-1.09,0.48-2.08,1.26-2.79c0.75-0.68,1.78-1.11,2.91-1.11h23.14c-0.45-6.33-2-12.35-4.46-17.88c-2.69-6.06-6.48-11.52-11.11-16.16c-4.63-4.63-10.1-8.42-16.16-11.11C77.68,9.95,71.66,8.4,65.33,7.95v23.12c0,1.13-0.42,2.16-1.11,2.91c-0.71,0.78-1.69,1.26-2.79,1.26s-2.08-0.48-2.79-1.26c-0.68-0.75-1.11-1.78-1.11-2.91V7.95c-6.33,0.45-12.35,2-17.88,4.46c-6.06,2.69-11.52,6.48-16.16,11.11c-4.63,4.63-8.42,10.1-11.11,16.16C9.95,45.2,8.4,51.22,7.95,57.55h22.69c1.13,0,2.16,0.42,2.91,1.11c0.78,0.71,1.26,1.69,1.26,2.79c0,1.09-0.48,2.08-1.26,2.79c-0.75,0.68-1.78,1.11-2.91,1.11H7.95c0.45,6.33,2,12.35,4.46,17.88c2.69,6.06,6.48,11.52,11.11,16.16c4.63,4.63,10.1,8.42,16.16,11.11c5.53,2.46,11.55,4.01,17.88,4.46v-23.7c0-1.13,0.42-2.16,1.11-2.91c0.71-0.78,1.69-1.26,2.79-1.26s2.08,0.48,2.79,1.26c0.68,0.75,1.11,1.78,1.11,2.91v23.7c6.33-0.45,12.35-2,17.88-4.46c6.06-2.69,11.52-6.48,16.16-11.11c4.63-4.63,8.42-10.1,11.11-16.16C112.93,77.68,114.48,71.66,114.93,65.33z"/></svg></button>' +
      '<button class="wp-btn btn-delete" data-id="' + wp.id + '" title="Delete"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="#d44" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2,0,0,0,8,21H16A2,2,0,0,0,18,19V7H6V19Z"/></svg></button></div></div>';
  }

  function bindCards() {
    document.querySelectorAll('.btn-copy-coord').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation();
        getWaypoint(parseInt(b.dataset.id,10)).then(function(w) {
          if (!w) return;
          var txt = formatCoordinate(w.latitude, w.longitude, fmt);
          copyText(txt); toast('Copied: ' + txt);
        });
      });
    });
    document.querySelectorAll('.btn-target').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); setTgt(parseInt(b.dataset.id,10)); });
    });
    document.querySelectorAll('.btn-delete').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation();
        var id = parseInt(b.dataset.id,10);
        confirm('Delete?', async function() { await deleteWaypoint(id); if(tgtId===id) clearTgt(); refreshList(); MapView.loadWaypoints(); loadNavWps(); toast('Deleted'); });
      });
    });
    document.querySelectorAll('.waypoint-card').forEach(function(c) {
      c.addEventListener('click', function() {
        var id = parseInt(c.dataset.id,10);
        if (selMode) { if (selIds.has(id)) { selIds.delete(id); c.classList.remove('selected'); } else { selIds.add(id); c.classList.add('selected'); } }
        else {
          getWaypoint(id).then(function(w) { if(w) openDialog(w.latitude, w.longitude, w.id); });
        }
      });
    });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function setTgt(id) {
    tgtId = id;
    getWaypoint(id).then(function(w) {
      if (w) {
        MapView.setTarget(w);
        MapView.fly(w.latitude, w.longitude, 15);
        toast('Target: ' + w.name);
        updNavReadout();
        switchView('map');
      }
    });
  }
  function clearTgt() { tgtId = null; MapView.setTarget(null); updNavReadout(); }

  function toggleSelect() {
    selMode = !selMode;
    if (selMode) { selIds.clear(); byId('locations-select-bar').style.display = 'flex'; byId('btn-select-mode').textContent = 'CANCEL'; byId('btn-select-mode').classList.add('btn-tactical-accent'); }
    else { selIds.clear(); byId('locations-select-bar').style.display = 'none'; byId('btn-select-mode').textContent = 'SELECT'; byId('btn-select-mode').classList.remove('btn-tactical-accent'); }
    refreshList();
  }
  async function deleteSel() {
    if (!selIds.size) { toast('None selected', 'error'); return; }
    confirm('Delete ' + selIds.size + ' waypoints?', async function() { await deleteWaypoints([...selIds]); if(tgtId&&selIds.has(tgtId)) clearTgt(); toggleSelect(); refreshList(); MapView.loadWaypoints(); loadNavWps(); toast('Deleted'); });
  }
  async function exportSel(format) {
    var ids = selIds.size > 0 ? [...selIds] : null;
    var c, fn, mt;
    if (format === 'json') { c = await exportWaypointsJSON(ids); fn = 'tfo.json'; mt = 'application/json'; }
    else { c = await exportWaypointsGPX(ids); fn = 'tfo.gpx'; mt = 'application/gpx+xml'; }
    var b = new Blob([c],{type:mt}), u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = fn; a.click(); URL.revokeObjectURL(u);
  }

  function updNavReadout() {
    var i = MapView.getNavInfo();
    var ro = byId('map-nav-readout'), de = byId('nav-distance'), he = byId('nav-heading');
    if (i && i.distance != null) {
      if (ro) ro.style.display = 'flex';
      if (de) de.textContent = i.distance >= 1000 ? (i.distance/1000).toFixed(2) + ' KM' : i.distance + ' M';
      if (he) he.textContent = String(i.heading).padStart(4,'0') + ' MILS';
    } else { if (ro) ro.style.display = 'none'; }
  }

  function confirm(m, cb) { byId('confirm-message').textContent = m; confirmCb = cb; byId('dialog-confirm').style.display = 'flex'; }
  function hideConfirm() { byId('dialog-confirm').style.display = 'none'; confirmCb = null; }
  function confirmYes() { if (confirmCb) confirmCb(); hideConfirm(); }

  function toast(m, t) {
    var el = byId('toast'); if (!el) return;
    el.style.display = 'block';
    el.textContent = m; el.className = 'toast ' + (t || ''); el.classList.add('visible');
    clearTimeout(el._t); el._t = setTimeout(function() { el.style.display = 'none'; el.classList.remove('visible'); }, 2500);
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(function() {});
    } else {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }

  var navWps = [];
  function loadNavWps() { if (typeof getAllWaypoints === 'function') getAllWaypoints().then(function(w) { navWps = w; }); }

  function resolveCoord(input) {
    if (!input) return null;
    var match = navWps.find(function(w) { return w.name.toLowerCase() === input.toLowerCase(); });
    if (match) return { lat: match.latitude, lng: match.longitude };
    return parseCoordinate(input, fmt);
  }

  /* ===== GO Live-Navigation Mode ===== */
  var goActive = false;
  var goDest = null;

  function startGo() {
    var d = byId('nav-dest').value.trim();
    if (!d) { toast('Enter destination', 'error'); return; }
    if (ulat == null || ulng == null) { toast('No GPS position', 'error'); return; }
    var dp = resolveCoord(d);
    if (!dp) { toast('Bad destination', 'error'); return; }
    goDest = dp;
    goActive = true;

    // Bind origin to live GPS, dest from input (skip fit so zoom is preserved)
    MapView.setNav({ lat: ulat, lng: ulng }, goDest, { skipFit: true });
    // Center on current position and set a reasonable live-nav zoom
    MapView.fly(ulat, ulng, 16);
    // Switch to Track-Up and sync heading
    if (MapView.getCompassMode() !== 'track-up') MapView.toggleCompass();
    MapView.setHeading(Compass.getHeading());
    // Show STOP NAV button
    byId('btn-stop-nav').style.display = 'block';
    byId('map-nav-panel').style.display = 'none';
    updGoNav();
    toast('Navigation active - Track Up');
  }

  function stopNav() {
    goActive = false;
    goDest = null;
    MapView.clearNav();
    byId('btn-stop-nav').style.display = 'none';
    clearGoCompass();
    // Revert to North Up when Go navigation ends
    if (MapView.getCompassMode() === 'track-up') MapView.toggleCompass();
    updNavReadout();
    toast('Navigation stopped');
  }

  function updGoNav() {
    if (!goActive || !goDest || ulat == null || ulng == null) return;
    // Refresh the nav line without forcing a fitBounds (preserve user-controlled zoom)
    MapView.setNav({ lat: ulat, lng: ulng }, goDest, { skipFit: true });
    // Keep the crosshair centered on the current position at the user's chosen zoom
    MapView.followUser();
    var i = MapView.getNavInfo();
    var ro = byId('map-nav-readout'), de = byId('nav-distance'), he = byId('nav-heading');
    if (i && i.distance != null) {
      if (ro) ro.style.display = 'flex';
      if (de) de.textContent = i.distance >= 1000 ? (i.distance/1000).toFixed(2) + ' KM' : i.distance + ' M';
      if (he) he.textContent = String(i.heading).padStart(4,'0') + ' MILS';
      // Live target dot on the compass dial + compass readout
      var bdeg = (i.heading / 6400) * 360;   // mils -> degrees bearing to target
      Compass.setTargetBearing(bdeg);
      var cro = byId('compass-nav-readout'), cde = byId('cnav-distance'), che = byId('cnav-heading');
      if (cro) cro.style.display = 'flex';
      if (cde) cde.textContent = i.distance >= 1000 ? (i.distance/1000).toFixed(2) + ' KM' : i.distance + ' M';
      if (che) che.textContent = String(i.heading).padStart(4,'0') + ' MILS';
    }
  }

  function clearGoCompass() {
    Compass.clearTarget();
    var cro = byId('compass-nav-readout');
    if (cro) cro.style.display = 'none';
  }

  function bindUI() {
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.addEventListener('click', function() { switchView(b.dataset.view); }); });

    byId('btn-format-compass').addEventListener('click', function() { switchView('settings'); });
    byId('btn-save-compass').addEventListener('click', function() {
      if (ulat != null) openDialog(ulat, ulng, null); else toast('No GPS position', 'error');
    });

    /* Copy position button */
    byId('btn-copy-pos').addEventListener('click', function() {
      var text = byId('current-pos').textContent;
      if (!text || text === '-- --') { toast('No position to copy', 'error'); return; }
      copyText(text);
      toast('Copied: ' + text);
    });

    byId('btn-request-location').addEventListener('click', function() { requestGPS(); toast('Requesting location...'); });
    byId('btn-request-orientation').addEventListener('click', function() { Compass.requestOrientation(); toast('Requesting compass...'); });

    /* Info button */
    byId('btn-info').addEventListener('click', function() {
      var dlg = byId('dialog-info');
      if (!dlg.innerHTML) {
        fetch('info-dialog.html').then(function(r) { return r.text(); }).then(function(html) {
          dlg.innerHTML = html;
          dlg.style.display = 'flex';
        }).catch(function() {
          dlg.innerHTML = '<div class="dialog dialog-info"><h3>ABOUT</h3><div class="info-content"><p>Failed to load info.</p></div><div class="dialog-actions"><button class="btn btn-tactical-accent" onclick="document.getElementById(\'dialog-info\').style.display=\'none\'">CLOSE</button></div></div>';
          dlg.style.display = 'flex';
        });
      } else {
        dlg.style.display = 'flex';
      }
    });

    /* Map FABs */
    byId('fab-locate').addEventListener('click', function() { MapView.centerUser(); });
    byId('fab-search').addEventListener('click', openSearchDialog);
    byId('btn-search-go').addEventListener('click', searchLocation);
    byId('btn-search-cancel').addEventListener('click', closeSearchDialog);
    byId('search-coords').addEventListener('keydown', function(e) { if (e.key === 'Enter') searchLocation(); });
    byId('dialog-search').addEventListener('click', function(e) { if (e.target === byId('dialog-search')) closeSearchDialog(); });
    byId('fab-layer').addEventListener('click', function() {
      var t = ['satellite','topographic','hybrid']; mtype = t[(t.indexOf(mtype)+1)%3];
      MapView.setTile(mtype); saveSettings();
      document.querySelectorAll('input[name="map-type"]').forEach(function(r) { r.checked = r.value === mtype; });
      toast('Map: ' + mtype.toUpperCase());
    });
    byId('fab-compass-mode').addEventListener('click', function() { var m = MapView.toggleCompass(); toast('Compass: ' + m.replace('-',' ').toUpperCase()); });
    byId('fab-nav').addEventListener('click', function() { var p = byId('map-nav-panel'); p.style.display = p.style.display === 'none' ? 'flex' : 'none'; if(p.style.display !== 'none') loadNavWps(); });

    /* Save crosshair */
    byId('btn-save-crosshair').addEventListener('click', function() {
      var pos = MapView.getCenter();
      if (pos && pos.lat != null) openDialog(pos.lat, pos.lng, null);
      else toast('Map not ready', 'error');
    });

    /* Copy crosshair coords */
    byId('btn-copy-crosshair').addEventListener('click', function() {
      var txt = byId('crosshair-coords').textContent;
      if (!txt || txt === '-- --') { toast('No coords', 'error'); return; }
      copyText(txt);
      toast('Copied: ' + txt);
    });

    /* Navigation panel - auto-complete from saved waypoints */
    loadNavWps();

    function setupAutocomplete(inputId, ddId) {
      var inp = byId(inputId), dd = byId(ddId);
      if (!inp || !dd) return;

      inp.addEventListener('input', function() {
        var val = inp.value.trim().toLowerCase();
        if (!val) { dd.classList.remove('show'); return; }
        var matches = navWps.filter(function(w) { return w.name.toLowerCase().indexOf(val) !== -1; });
        if (!matches.length) { dd.classList.remove('show'); return; }
        dd.innerHTML = matches.map(function(w) {
          return '<div class="nav-dropdown-item" data-lat="' + w.latitude + '" data-lng="' + w.longitude + '">' +
            '<span class="dd-name">' + esc(w.name) + '</span>' +
            '<span class="dd-coords">' + formatCoordinate(w.latitude, w.longitude, fmt) + '</span></div>';
        }).join('');
        dd.classList.add('show');
        dd.querySelectorAll('.nav-dropdown-item').forEach(function(item) {
          item.addEventListener('mousedown', function(e) {
            e.preventDefault();
            inp.value = item.querySelector('.dd-name').textContent;
            dd.classList.remove('show');
          });
        });
      });

      inp.addEventListener('blur', function() { setTimeout(function() { dd.classList.remove('show'); }, 200); });
      inp.addEventListener('focus', function() { if (inp.value.trim()) inp.dispatchEvent(new Event('input')); });
    }

    setupAutocomplete('nav-origin', 'nav-origin-dd');
    setupAutocomplete('nav-dest', 'nav-dest-dd');

    byId('btn-nav-connect').addEventListener('click', function() {
      var o = byId('nav-origin').value.trim(), d = byId('nav-dest').value.trim();
      if (!o || !d) { toast('Enter both coords', 'error'); return; }
      var op = resolveCoord(o), dp = resolveCoord(d);
      if (!op || !dp) { toast('Bad coordinates or name not found', 'error'); return; }
      MapView.setNav(op, dp); updNavReadout();
    });
    byId('btn-nav-go').addEventListener('click', startGo);
    byId('btn-stop-nav').addEventListener('click', stopNav);
    byId('btn-nav-clear').addEventListener('click', function() {
      if (goActive) stopNav();
      MapView.clearNav();
      byId('nav-origin').value = ''; byId('nav-dest').value = '';
      toast('Navigation cleared');
    });
    byId('btn-nav-profile').addEventListener('click', function() {
      byId('dialog-elevation').style.display = 'flex';
      MapView.getElevationProfile().then(function(samples) {
        MapView.renderElevationProfile(document.getElementById('elevation-canvas'));
      });
    });
    byId('btn-elevation-close').addEventListener('click', function() { byId('dialog-elevation').style.display = 'none'; });
    byId('btn-elevation-dl').addEventListener('click', function() { MapView.downloadElevationPNG(); });
    byId('dialog-elevation').addEventListener('click', function(e) { if(e.target===byId('dialog-elevation')) byId('dialog-elevation').style.display = 'none'; });

    /* Locations */
    byId('btn-select-mode').addEventListener('click', toggleSelect);
    byId('btn-export').addEventListener('click', function() { byId('dialog-export').style.display = 'flex'; });
    byId('btn-delete-selected').addEventListener('click', deleteSel);
    byId('btn-export-selected').addEventListener('click', function() { byId('dialog-export').style.display = 'flex'; });
    byId('btn-cancel-select').addEventListener('click', toggleSelect);

    /* Export dialog */
    byId('btn-export-json').addEventListener('click', function() { byId('dialog-export').style.display = 'none'; exportSel('json'); });
    byId('btn-export-gpx').addEventListener('click', function() { byId('dialog-export').style.display = 'none'; exportSel('gpx'); });
    byId('btn-export-cancel').addEventListener('click', function() { byId('dialog-export').style.display = 'none'; });

    /* Dialogs */
    byId('btn-dialog-cancel').addEventListener('click', closeDialog);
    byId('btn-dialog-save').addEventListener('click', saveFromDialog);
    byId('btn-confirm-yes').addEventListener('click', confirmYes);
    byId('btn-confirm-no').addEventListener('click', hideConfirm);
    byId('dialog-save-waypoint').addEventListener('click', function(e) { if(e.target===byId('dialog-save-waypoint')) closeDialog(); });
    byId('dialog-confirm').addEventListener('click', function(e) { if(e.target===byId('dialog-confirm')) hideConfirm(); });

    document.querySelectorAll('#wp-color-selector .color-btn').forEach(function(b) { b.addEventListener('click', function() { setColor(b.dataset.color); }); });

    /* Settings */
    document.querySelectorAll('input[name="format"]').forEach(function(r) { r.addEventListener('change', function() { if(r.checked) { fmt = r.value; saveSettings(); updPosReadout(); applySettings(); MapView.updCrosshair(); } }); });
    document.querySelectorAll('input[name="compass-units"]').forEach(function(r) { r.addEventListener('change', function() { if(r.checked) { cunit = r.value; saveSettings(); Compass.setUnit(r.value); MapView.applyCompass(); } }); });
    document.querySelectorAll('input[name="map-type"]').forEach(function(r) { r.addEventListener('change', function() { if(r.checked) { mtype = r.value; saveSettings(); MapView.setTile(r.value); } }); });

    /* Support / Buy Me A Coffee Dialog */
    byId('btn-support').addEventListener('click', function() {
      byId('dialog-support').style.display = 'flex';
    });

    byId('btn-close-support').addEventListener('click', function() {
      byId('dialog-support').style.display = 'none';
    });

    byId('dialog-support').addEventListener('click', function(e) {
      if (e.target === byId('dialog-support')) {
        byId('dialog-support').style.display = 'none';
      }
    });  
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    switchView: switchView, toast: toast,
    getPositionFormat: function() { return fmt; },
    getMapType: function() { return mtype; }
  };
})();
