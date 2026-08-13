/* ============================================================
   TACTICAL FIELD OPERATOR - Storage Layer
   IndexedDB for waypoint persistence
   ============================================================ */

const DB_NAME = 'TFO_Waypoints';
const DB_VERSION = 1;
const STORE_NAME = 'waypoints';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('color', 'color', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject(new Error('Failed to open database: ' + event.target.error));
    };
  });
}

async function getAllWaypoints() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getWaypoint(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveWaypoint(waypoint) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      ...waypoint,
      updatedAt: Date.now()
    };

    if (!record.createdAt) {
      record.createdAt = Date.now();
    }

    let request;
    if (record.id) {
      request = store.put(record);
    } else {
      delete record.id;
      request = store.add(record);
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteWaypoint(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteWaypoints(ids) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    let remaining = ids.length;
    let hasError = false;

    ids.forEach(id => {
      const request = store.delete(id);
      request.onsuccess = () => {
        remaining--;
        if (remaining === 0 && !hasError) resolve();
      };
      request.onerror = () => {
        hasError = true;
        remaining--;
        if (remaining === 0) reject(request.error);
      };
    });

    if (ids.length === 0) resolve();
  });
}

async function exportWaypointsJSON(ids) {
  let waypoints;
  if (ids && ids.length > 0) {
    const all = await getAllWaypoints();
    waypoints = all.filter(wp => ids.includes(wp.id));
  } else {
    waypoints = await getAllWaypoints();
  }

  const exportData = waypoints.map(wp => ({
    name: wp.name,
    description: wp.description || '',
    latitude: wp.latitude,
    longitude: wp.longitude,
    color: wp.color,
    createdAt: wp.createdAt
  }));

  return JSON.stringify(exportData, null, 2);
}

async function exportWaypointsGPX(ids) {
  let waypoints;
  if (ids && ids.length > 0) {
    const all = await getAllWaypoints();
    waypoints = all.filter(wp => ids.includes(wp.id));
  } else {
    waypoints = await getAllWaypoints();
  }

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TacticalFieldOperator"
  xmlns="http://www.topografix.com/GPX/1/1">
`;

  let body = '';
  waypoints.forEach(wp => {
    const time = new Date(wp.createdAt).toISOString();
    body += `  <wpt lat="${wp.latitude}" lon="${wp.longitude}">
    <name>${escapeXml(wp.name)}</name>
    <desc>${escapeXml(wp.description || '')}</desc>
    <time>${time}</time>
  </wpt>
`;
  });

  return header + body + '</gpx>';
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getOrCreateUserId() {
    let userId = localStorage.getItem('app_user_id');
    
    if (!userId) {
        // Generate a random unique ID (e.g., usr_x9k2m1p0q)
        userId = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        localStorage.setItem('app_user_id', userId);
    }
    
    return userId;
}
