var Compass = (function() {
  var heading = 0;
  var unit = 'mils';
  var active = false;
  var listeners = [];
  var dragOn = false, dragStartY = 0, dragStartH = 0;
  var hasAbs = false;

  function init() {
    loadDial('mil');
    loadDial('deg');
    startListen();
    initDrag();
  }

  function loadDial(type) {
    var el = document.getElementById('compass-dial-' + type);
    if (!el) return;
    fetch('compass-' + type + '.svg').then(function(r) { return r.text(); }).then(function(t) {
      var doc = new DOMParser().parseFromString(t, 'image/svg+xml');
      var svg = doc.querySelector('svg');
      if (!svg) return;
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.style.width = '100%'; svg.style.height = '100%';
      var ndl = svg.querySelector('#compass-needle'); if (ndl) ndl.remove();
      svg.querySelectorAll('filter').forEach(function(f) { f.remove(); });
      svg.querySelectorAll('path[d*="glass"]').forEach(function(e) { e.remove(); });
      svg.querySelectorAll('ellipse').forEach(function(e) { e.remove(); });
      svg.querySelectorAll('[fill*="url(#glass"]').forEach(function(e) { e.remove(); });
      el.innerHTML = ''; el.appendChild(svg);
    });
  }

  function showDial(type) {
    var mil = document.getElementById('compass-dial-mil');
    var deg = document.getElementById('compass-dial-deg');
    if (mil) mil.style.display = type === 'mil' ? 'block' : 'none';
    if (deg) deg.style.display = type === 'deg' ? 'block' : 'none';
  }

  function applyRotation(d) {
    // Rotate dial ring to show heading, needle stays static
    var wrap = document.getElementById('compass-dial-wrap');
    var ndl = document.getElementById('compass-needle-overlay');
    if (wrap) wrap.style.transform = 'rotate(' + (-d) + 'deg)';
    if (ndl) ndl.style.transform = 'rotate(0deg)';
  }

  function startListen() {
    if (typeof DeviceOrientationEvent === 'undefined') { setInd(false); return; }
    if ('ondeviceorientationabsolute' in window) {
      hasAbs = true;
      window.addEventListener('deviceorientationabsolute', onAbs, true);
    }
    window.addEventListener('deviceorientation', onOrient, true);
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function(s) {
        if (s === 'granted') { active = true; setInd(true); }
      }).catch(function() {});
    } else { active = true; setInd(true); }
  }

  function onAbs(e) {
    var h = null;
    if (e.webkitCompassHeading != null) { h = e.webkitCompassHeading; }
    else if (e.alpha != null) { h = e.alpha; }
    if (h == null) return;
    setFull(h);
  }

  function onOrient(e) {
    if (hasAbs) return;
    var h = null;
    if (e.webkitCompassHeading != null) { h = e.webkitCompassHeading; }
    else if (e.alpha != null) { h = e.alpha; }
    if (h == null) return;
    setFull(h);
  }

  function setFull(rawAlpha) {
    // rawAlpha from device goes counterclockwise (0=N, right turn decreases alpha)
    // convert to clockwise compass heading for the readout
    var compassDeg = ((360 - rawAlpha) % 360 + 360) % 360;
    heading = compassDeg;

    // dial rotation: use compassDeg directly so dial matches readout
    applyRotation(compassDeg);
    updateReadout(compassDeg);
    listeners.forEach(function(fn) { fn(compassDeg); });
    if (!active) { active = true; setInd(true); }
  }

  function initDrag() {
    var el = document.getElementById('compass-ring');
    if (!el) return;
    el.addEventListener('mousedown', function(e) { e.preventDefault(); dragOn = true; dragStartY = e.clientY; dragStartH = heading; });
    el.addEventListener('touchstart', function(e) { e.preventDefault(); dragOn = true; dragStartY = e.touches[0].clientY; dragStartH = heading; }, {passive:false});
    window.addEventListener('mousemove', function(e) { if (!dragOn) return; setFull((360 - (dragStartH + (e.clientY - dragStartY) * 0.5) % 360) % 360); });
    window.addEventListener('touchmove', function(e) { if (!dragOn) return; setFull((360 - (dragStartH + (e.touches[0].clientY - dragStartY) * 0.5) % 360) % 360); }, {passive:false});
    window.addEventListener('mouseup', function() { dragOn = false; });
    window.addEventListener('touchend', function() { dragOn = false; });
  }

  function updateReadout(d) {
    var v = document.getElementById('heading-value'); if (!v) return;
    v.textContent = unit === 'mils'
      ? String(Math.round((d / 360) * 6400) % 6400).padStart(4, '0')
      : String(Math.round(d)).padStart(3, '0');
  }

  function setUnit(u) {
    unit = u;
    showDial(u === 'mils' ? 'mil' : 'deg');
    var ul = document.querySelector('#compass-readout .readout-unit');
    if (ul) ul.textContent = u === 'mils' ? 'MILS' : 'DEG';
    updateReadout(heading);
  }

  function requestOrientation() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function(s) {
        if (s === 'granted') { active = true; setInd(true); }
      }).catch(function() {});
    }
  }

  function setInd(on) {
    var el = document.getElementById('compass-indicator');
    if (el) { if (on) el.classList.add('active'); else el.classList.remove('active'); }
  }

  // --- Target bearing dot on compass dial ---
  // bearingDeg: bearing (degrees, clockwise from North) to the target.
  // The dot lives inside compass-dial-wrap, which rotates by -heading,
  // so rotating the dot by bearingDeg shows it at (bearing - heading)
  // relative to the top of the ring (i.e. where to steer from current heading).
  function setTargetBearing(bearingDeg) {
    var wrap = document.getElementById('compass-target-dot-wrap');
    var dot = document.querySelector('.compass-target-dot');
    if (!wrap || !dot) return;
    var b = ((bearingDeg % 360) + 360) % 360;
    dot.style.setProperty('--td-rot', b + 'deg');
    wrap.style.display = 'block';
  }

  function clearTarget() {
    var wrap = document.getElementById('compass-target-dot-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  function getHeading() { return heading; }
  function getHeadingMils() { return Math.round((heading / 360) * 6400) % 6400; }
  function onHeading(fn) { listeners.push(fn); }
  function getStatus() { return active; }

  return { init: init, setUnit: setUnit, getHeading: getHeading, getHeadingMils: getHeadingMils, onHeading: onHeading, getStatus: getStatus, requestOrientation: requestOrientation, setTargetBearing: setTargetBearing, clearTarget: clearTarget };
})();
