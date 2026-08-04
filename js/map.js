var MapView = (function() {
  var map = null;
  var tileLayer = null;
  var labelLayer = null;
  var posMarker = null;
  var targetMarker = null;
  var startMarker = null;
  var trackLine = null;
  var navLine = null;
  var wpMarkers = [];
  var userPos = null;
  var targetWp = null;
  var startWp = null;
  var compassMode = 'north-up';
  var headingDeg = 0;
  var navOrigin = null;
  var navDest = null;
  var navArrows = [];
  var mapContainer = null;
  var elevSamples = null;
  var elevCanvas = null;

  var tiles = {
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    // topographic: 'http://localhost:8081/{z}/{x}/{y}.png',
    topographic: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    hybrid: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    hybridLabel: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
  };

  // /* Helper to convert screen drag offset when container is rotated */
  // function rotateOffset(dx, dy, angleDeg) {
  //   var rad = angleDeg * Math.PI / 180;
  //   var cos = Math.cos(rad);
  //   var sin = Math.sin(rad);
  //   return {
  //     x: dx * cos - dy * sin,
  //     y: dx * sin + dy * cos
  //   };
  // }

  /* Helper to convert screen drag offset when container is rotated */
  function rotateOffset(dx, dy, angleDeg) {
    var rad = angleDeg * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    return {
      x: dx * cos + dy * sin,
      y: -dx * sin + dy * cos
    };
  }

  function init() {
    var c = document.getElementById('map-container');
    if (!c) return;
    if (map) { map.invalidateSize(); return; }
    map = L.map(c, { zoomControl: false, attributionControl: false, center: [4.21, 101.98], zoom: 7 });

    // Override Leaflet dragging logic to handle track-up CSS rotation
    if (map.dragging && map.dragging._draggable) {
      var draggable = map.dragging._draggable;
      var originalUpdatePosition = draggable._updatePosition;

      draggable._updatePosition = function() {
        if (compassMode === 'track-up' && headingDeg !== 0) {
          var dx = this._newPos.x - this._startPos.x;
          var dy = this._newPos.y - this._startPos.y;

          // Rotate drag vector counter to container rotation (-headingDeg)
          var rotated = rotateOffset(dx, dy, -headingDeg);

          this._newPos = L.point(
            this._startPos.x + rotated.x,
            this._startPos.y + rotated.y
          );
        }
        originalUpdatePosition.call(this);
      };
    }

    setTile(mapType() || 'satellite');
    map.on('move', updCrosshair);
    map.on('moveend', updCrosshair);
  }

  function mapType() { return (typeof App !== 'undefined' && App.getMapType) ? App.getMapType() : 'satellite'; }
  function setTile(type) {
    if (!map) return;
    if (tileLayer) map.removeLayer(tileLayer);
    if (labelLayer) map.removeLayer(labelLayer);
    tileLayer = L.tileLayer(tiles[type] || tiles.satellite, { maxZoom: 19 }).addTo(map);
    if (type === 'hybrid') labelLayer = L.tileLayer(tiles.hybridLabel, { maxZoom: 19, opacity: 0.8 }).addTo(map);
  }
  function getCenter() { if (!map) return null; var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
  function updCrosshair() {
    var pos = getCenter(); if (!pos) return;
    var el = document.getElementById('crosshair-coords');
    var fe = document.getElementById('crosshair-format');
    var fmt = (typeof App !== 'undefined' && App.getPositionFormat) ? App.getPositionFormat() : 'mgrs';
    var names = { 'mgrs':'MGRS','latlng-dd':'Lat/Lng (DD)','latlng-dms':'Lat/Lng (DMS)','epsg-3375':'GDM2000 Peninsular RSO','epsg-3376':'GDM2000 East Malaysia RSO','epsg-3168':'Kertau 1968 Malaya RSO','epsg-29873':'Timbalai 1948 Borneo RSO' };
    if (el && typeof formatCoordinate === 'function') el.textContent = formatCoordinate(pos.lat, pos.lng, fmt);
    if (fe) fe.textContent = names[fmt] || 'MGRS';
  }
  function setHeading(d) { headingDeg = d; applyCompass(); }
  function applyCompass() {
    var hdg = document.getElementById('map-heading-indicator');
    var hdgV = document.getElementById('map-heading-value');
    if (!mapContainer) mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;
    if (compassMode === 'north-up') {
      mapContainer.style.transform = ''; mapContainer.style.transformOrigin = '';
      mapContainer.style.width = ''; mapContainer.style.height = '';
      mapContainer.style.left = ''; mapContainer.style.top = '';
      if (map) map.invalidateSize();
      if (hdg) hdg.style.display = 'none';
      var hl = document.getElementById('map-heading-line');
      if (hl) hl.style.display = 'none'; return;
    }
    var hl = document.getElementById('map-heading-line');
    if (hl) hl.style.display = 'block';
    var vw = document.getElementById('view-port').clientWidth;
    var vh = document.getElementById('view-port').clientHeight;
    var diag = Math.ceil(Math.sqrt(vw * vw + vh * vh));
    mapContainer.style.width = diag + 'px'; mapContainer.style.height = diag + 'px';
    mapContainer.style.left = Math.floor((vw - diag) / 2) + 'px';
    mapContainer.style.top = Math.floor((vh - diag) / 2) + 'px';
    mapContainer.style.transformOrigin = 'center center';
    mapContainer.style.transform = 'rotate(' + (-headingDeg) + 'deg)';
    if (map) map.invalidateSize();
    var cunit = 'mils';
    try { cunit = JSON.parse(localStorage.getItem('tfo_settings') || '{}').compassUnits || 'mils'; } catch(e) {}
    if (hdg) hdg.style.display = 'flex';
    if (hdgV) hdgV.textContent = (cunit === 'mils'
      ? String(Math.round((headingDeg / 360) * 6400) % 6400).padStart(4, '0') + ' MILS'
      : String(Math.round(headingDeg)).padStart(3, '0') + ' DEG');
  }
  function toggleCompass() {
    compassMode = compassMode === 'north-up' ? 'track-up' : 'north-up';
    applyCompass();
    var btn = document.getElementById('fab-compass-mode');
    if (btn) { if (compassMode === 'track-up') btn.classList.add('active'); else btn.classList.remove('active'); }
    return compassMode;
  }
  function updPosition(lat, lng, acc) {
    userPos = { lat: lat, lng: lng, accuracy: acc };
    if (!map) return;
    if (!posMarker) posMarker = L.circleMarker([lat, lng], { radius: 5, fillColor: '#4488cc', color: '#fff', weight: 1.5, fillOpacity: 0.9 }).addTo(map).bindPopup('You');
    else posMarker.setLatLng([lat, lng]);
  }
  function loadWaypoints() {
    wpMarkers.forEach(function(m) { map.removeLayer(m); }); wpMarkers = [];
    if (!map || typeof getAllWaypoints !== 'function') return;
    getAllWaypoints().then(function(wps) { wps.forEach(addMarker); });
  }
  function addMarker(wp) {
    if (!map) return;
    var col = wp.color === 'blue' ? '#3399ff' : wp.color === 'red' ? '#ff3333' : wp.color === 'yellow' ? '#ffcc00' : wp.color === 'purple' ? '#9944ff' : '#2d8a4e';
    var m = L.circleMarker([wp.latitude, wp.longitude], { radius: 5, fillColor: col, color: '#fff', weight: 1.5, fillOpacity: 0.9 }).addTo(map);
    m.bindPopup(wp.name || 'WP'); m._wpid = wp.id; m.on('click', function() { m.openPopup(); }); wpMarkers.push(m);
  }
  function setTarget(wp) {
    targetWp = wp;
    if (targetMarker) { map.removeLayer(targetMarker); targetMarker = null; }
    if (!wp || !map) return;
    var col = wp.color === 'blue' ? '#3399ff' : wp.color === 'red' ? '#ff3333' : wp.color === 'yellow' ? '#ffcc00' : wp.color === 'purple' ? '#9944ff' : '#2d8a4e';
    targetMarker = L.marker([wp.latitude, wp.longitude], {
      icon: L.divIcon({ className: '', html: '<div style="width:14px;height:14px;background:' + col + ';border:2px solid #fff;transform:rotate(45deg)"></div>', iconSize: [14,14], iconAnchor: [7,7] })
    }).addTo(map).bindPopup(wp.name || 'Target');
  }
  function setNav(orig, dest) { navOrigin = orig; navDest = dest; elevSamples = null; updNav(); if (orig && dest && map) map.fitBounds(L.latLngBounds([[orig.lat, orig.lng], [dest.lat, dest.lng]]).pad(0.3), { maxZoom: 16 }); }
  function clearNav() { navOrigin = null; navDest = null; elevSamples = null; if (navLine) { map.removeLayer(navLine); navLine = null; } navArrows.forEach(function(a) { map.removeLayer(a); }); navArrows = []; updateReadout(); }
  function updNav() {
    if (!map) return;
    if (navLine) { map.removeLayer(navLine); navLine = null; }
    navArrows.forEach(function(a) { map.removeLayer(a); }); navArrows = [];
    var pts = [];
    if (navOrigin) pts.push([navOrigin.lat, navOrigin.lng]);
    if (navDest) pts.push([navDest.lat, navDest.lng]);
    if (pts.length === 2) { navLine = L.polyline(pts, { color: '#d4742b', weight: 3, opacity: 0.9 }).addTo(map); addNavArrows(pts[0], pts[1]); }
    updateReadout();
  }
  function addNavArrows(p1, p2) {
    var bearingDeg = bearingToMils(p1[0], p1[1], p2[0], p2[1]) / 6400 * 360;
    var icon = L.divIcon({
      className: '', html: '<svg viewBox="0 0 12 12" width="12" height="12" style="display:block;transform:rotate(' + (bearingDeg - 90) + 'deg)"><polygon points="12,6 2,1 2,11" fill="#d4742b" opacity="0.9"/></svg>', iconSize: [12, 12], iconAnchor: [6, 6]
    });
    var lat = (p1[0] + p2[0]) / 2;
    var lng = (p1[1] + p2[1]) / 2;
    var m = L.marker([lat, lng], { icon: icon, interactive: false }).addTo(map);
    navArrows.push(m);
  }
  function updateReadout() {
    var ro = document.getElementById('map-nav-readout'), de = document.getElementById('nav-distance'), he = document.getElementById('nav-heading');
    var info = getNavInfo();
    if (info) { if (ro) ro.style.display = 'flex'; if (de) de.textContent = info.distance >= 1000 ? (info.distance / 1000).toFixed(2) + ' KM' : info.distance + ' M'; if (he) he.textContent = String(info.heading).padStart(4, '0') + ' MILS'; }
    else { if (ro) ro.style.display = 'none'; }
  }
  function getNavInfo() {
    if (navOrigin && navDest && typeof haversineDistance === 'function') return { distance: Math.round(haversineDistance(navOrigin.lat, navOrigin.lng, navDest.lat, navDest.lng)), heading: bearingToMils(navOrigin.lat, navOrigin.lng, navDest.lat, navDest.lng) };
    if (targetWp && userPos && typeof haversineDistance === 'function') return { distance: Math.round(haversineDistance(userPos.lat, userPos.lng, targetWp.latitude, targetWp.longitude)), heading: bearingToMils(userPos.lat, userPos.lng, targetWp.latitude, targetWp.longitude) };
    return null;
  }
  
  function centerUser() { if (userPos && map) {
    const targetZoom = map.getZoom() < 12 ? 16 : map.getZoom();
    map.setView([userPos.lat, userPos.lng], targetZoom);}}
  function fly(lat, lng, z) { if (map) map.setView([lat, lng], z || 15); }

  /* === ELEVATION PROFILE === */
  function sampleElevationProfile() {
    if (!navOrigin || !navDest) return null;
    var dist = haversineDistance(navOrigin.lat, navOrigin.lng, navDest.lat, navDest.lng);
    var count = Math.max(20, Math.min(500, Math.ceil(dist / 100)));
    elevSamples = [];
    for (var i = 0; i <= count; i++) {
      var f = i / count;
      elevSamples.push({ lat: navOrigin.lat + (navDest.lat - navOrigin.lat) * f, lng: navOrigin.lng + (navDest.lng - navOrigin.lng) * f, dist: dist * f / 1000 });
    }
    return elevSamples;
  }
  function elevFromTile(samples) {
    var zoom = 15;
    var n = 1 << zoom;
    var tileCache = {};
    var pending = 0;
    var elevCanvas = document.createElement('canvas');
    elevCanvas.width = 256; elevCanvas.height = 256;
    var ctx = elevCanvas.getContext('2d', { willReadFrequently: true });

    return new Promise(function(resolve) {
      samples.forEach(function(s, idx) {
        (function(i) {
          pending++;
          var x = Math.floor((s.lng + 180) / 360 * n);
          var y = Math.floor((1 - Math.log(Math.tan(s.lat * Math.PI / 180) + 1 / Math.cos(s.lat * Math.PI / 180)) / Math.PI) / 2 * n);
          var pxX = Math.floor(((s.lng + 180) / 360 * n - x) * 256);
          var pxY = Math.floor(((1 - Math.log(Math.tan(s.lat * Math.PI / 180) + 1 / Math.cos(s.lat * Math.PI / 180)) / Math.PI) / 2 * n - y) * 256);
          var tileKey = zoom + '_' + x + '_' + y;

          if (tileCache[tileKey] && tileCache[tileKey].pixels) {
            var p = tileCache[tileKey].pixels;
            var elev = (p[pxY * 256 * 4 + pxX * 4] * 256 + p[pxY * 256 * 4 + pxX * 4 + 1] + p[pxY * 256 * 4 + pxX * 4 + 2] / 256) - 32768;
            samples[i].elev = Math.round(elev * 10) / 10;
            pending--;
            if (pending === 0) resolve(samples);
            return;
          }

          var img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = function() {
            ctx.clearRect(0, 0, 256, 256);
            ctx.drawImage(img, 0, 0);
            tileCache[tileKey] = { pixels: ctx.getImageData(0, 0, 256, 256).data };
            var p = tileCache[tileKey].pixels;
            var elev = (p[pxY * 256 * 4 + pxX * 4] * 256 + p[pxY * 256 * 4 + pxX * 4 + 1] + p[pxY * 256 * 4 + pxX * 4 + 2] / 256) - 32768;
            samples[i].elev = Math.round(elev * 10) / 10;
            pending--;
            if (pending === 0) resolve(samples);
          };
          img.onerror = function() {
            samples[i].elev = null;
            pending--;
            if (pending === 0) resolve(samples);
          };
          img.src = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + zoom + '/' + x + '/' + y + '.png';
        })(idx);
      });
      if (pending === 0) resolve(samples);
    });
  }
  function decodeElevations(samples) {
    return elevFromTile(samples);
  }
  function getElevationProfile() {
    if (elevSamples) return new Promise(function(r) { r(elevSamples); });
    var samples = sampleElevationProfile();
    if (!samples) return new Promise(function(r) { r(null); });
    return decodeElevations(samples).then(function(s) { elevSamples = s; return s; });
  }
  function renderElevationProfile(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d', { willReadFrequently: true }); var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!elevSamples || elevSamples.length < 2) {
      ctx.fillStyle = '#5a5f5d'; ctx.font = '30px monospace'; ctx.textAlign = 'center'; ctx.fillText('No data', W/2, H/2); return;
    }
    var v = elevSamples.filter(function(s) { return s.elev != null && !isNaN(s.elev); });
    if (v.length < 2) {
      ctx.fillStyle = '#5a5f5d'; ctx.font = '30px monospace'; ctx.textAlign = 'center'; ctx.fillText('Unavailable', W/2, H/2); return;
    }

    var el = v.map(function(s) { return s.elev; }), minEl = Math.min.apply(null, el), maxEl = Math.max.apply(null, el);
    var totalDist = elevSamples[elevSamples.length - 1].dist, range = maxEl - minEl || 1;

    // Layout
    var pad = { t: 40, r: 50, b: 70, l: 60 };
    var pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    var x0 = pad.l, y0 = pad.t, x1 = pad.l + pw, y1 = pad.t + ph;

    // Grid
    ctx.strokeStyle = '#2a2d2e'; ctx.lineWidth = 1;
    for (var yi = 0; yi <= 4; yi++) {
      var yy = y0 + (ph / 4) * yi;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    }
    for (var xi = 0; xi <= 4; xi++) {
      var xx = x0 + (pw / 4) * xi;
      ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, y1); ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = '#8a8f8d'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    for (yi = 0; yi <= 4; yi++) {
      var elevVal = maxEl - (range / 4) * yi;
      ctx.fillText(Math.round(elevVal) + 'm', pad.l - 6, y0 + (ph / 4) * yi + 4);
    }
    ctx.textAlign = 'center';
    for (xi = 0; xi <= 4; xi++) {
      var distVal = (totalDist / 4) * xi;
      ctx.fillText(distVal.toFixed(1) + 'km', x0 + (pw / 4) * xi, y1 + 16);
    }

    // Axis lines (bold)
    ctx.strokeStyle = '#5a5f5d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();

    // Axis titles
    ctx.fillStyle = '#8a8f8d'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Distance', W / 2, H - 6);
    ctx.save();
    ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Elevation (m)', 0, 0);
    ctx.restore();

    // Gains/loss
    var gain = 0, loss = 0;
    for (var i = 1; i < el.length; i++) { var d = el[i] - el[i-1]; if (d > 0) gain += d; else loss -= d; }

    // LOS straight line (dest to target)
    var startEl = v[0].elev, endEl = v[v.length - 1].elev;
    ctx.beginPath();
    ctx.moveTo(x0, y1 - ((startEl - minEl) / range) * ph);
    ctx.lineTo(pad.l + pw, y1 - ((endEl - minEl) / range) * ph);
    ctx.strokeStyle = '#d4742b'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

    // Profile fill
    ctx.beginPath(); ctx.moveTo(x0, y1);
    v.forEach(function(s) { var x = x0 + (s.dist / totalDist) * pw; var y = y1 - ((s.elev - minEl) / range) * ph; ctx.lineTo(x, y); });
    ctx.lineTo(pad.l + pw, y1); ctx.closePath();
    ctx.fillStyle = 'rgba(45,90,66,0.3)'; ctx.fill();

    // Profile line
    ctx.beginPath();
    v.forEach(function(s, i) { var x = x0 + (s.dist / totalDist) * pw; var y = y1 - ((s.elev - minEl) / range) * ph; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.strokeStyle = '#3d7a5c'; ctx.lineWidth = 2.5; ctx.stroke();

    // Stats
    ctx.fillStyle = '#8a8f8d'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText('Min: ' + Math.round(minEl) + 'm  Max: ' + Math.round(maxEl) + 'm  Gain: ' + Math.round(gain) + 'm  Loss: ' + Math.round(loss) + 'm', pad.l, H - 28);
    ctx.fillText('Start: ' + Math.round(startEl) + 'm  End: ' + Math.round(endEl) + 'm  Range: ' + (Math.round((maxEl - minEl) * 10) / 10) + 'm', pad.l, H - 16);

    // Footer
    ctx.fillStyle = '#5a5f5d'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
    ctx.fillText('Military Navigation - Profile Analysis', W - 10, H - 4);
  }

  function downloadElevationPNG() {
    if (!elevSamples || elevSamples.length < 2) return;

    // Create high-resolution export canvas (A4 landscape ratio)
    var dlCanvas = document.createElement('canvas');
    dlCanvas.width = 1000; 
    dlCanvas.height = 707;
    
    // Fill background
    var ctx = dlCanvas.getContext('2d');
    ctx.fillStyle = '#131313'; 
    ctx.fillRect(0, 0, 1000, 707);

    // Re-render sharp elevation profile at high DPI
    renderElevationProfile(dlCanvas);

    // Trigger download
    var link = document.createElement('a'); 
    link.download = 'elevation_profile.png';
    link.href = dlCanvas.toDataURL('image/png'); 
    link.click();
  }

  return {
    init: init, setTile: setTile, updPosition: updPosition, setTarget: setTarget,
    centerUser: centerUser, fly: fly, getNavInfo: getNavInfo, setHeading: setHeading,
    getCenter: getCenter, loadWaypoints: loadWaypoints, toggleCompass: toggleCompass,
    getCompassMode: function() { return compassMode; }, setNav: setNav, clearNav: clearNav, updCrosshair: updCrosshair,
    getElevationProfile: getElevationProfile, renderElevationProfile: renderElevationProfile,
    downloadElevationPNG: downloadElevationPNG
  };
})();