(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------------- Look & feel: theme, accent colour, menu, animations ----------------
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const root = document.documentElement;
  function applyTheme() {
    root.dataset.theme = store.get('sr-theme', 'light');
    root.dataset.accent = store.get('sr-accent', 'indigo');
    const b = $('#themeBtn'); if (b) b.textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙';
    document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.accent === root.dataset.accent));
  }
  applyTheme();
  if ($('#themeBtn')) $('#themeBtn').addEventListener('click', () => { store.set('sr-theme', root.dataset.theme === 'dark' ? 'light' : 'dark'); applyTheme(); });
  document.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => { store.set('sr-accent', s.dataset.accent); applyTheme(); }));
  if ($('#menuBtn')) $('#menuBtn').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
  window.addEventListener('scroll', () => $('.nav').classList.toggle('scrolled', window.scrollY > 10), { passive: true });

  function countUp(el) {
    const end = +el.dataset.count, t0 = performance.now(), dur = 1200;
    (function step(t) {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      if (en.target.dataset.count) countUp(en.target);
      io.unobserve(en.target);
    }), { threshold: .15 });
    document.querySelectorAll('.reveal, [data-count]').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    document.querySelectorAll('[data-count]').forEach(countUp);
  }
  function toast(msg, type = 'info') {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show ' + type;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.className = ''), 3500);
  }

  function initMap(id) {
    const map = L.map(id).setView(window.SR.center, window.SR.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => map.setView([p.coords.latitude, p.coords.longitude], 13), () => {}, { timeout: 6000 });
    }
    return map;
  }

  const getPos = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by this browser.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Could not get your location. Please allow location access.')),
      { enableHighAccuracy: true, timeout: 10000 });
  });

  async function postJSON(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  // distance in metres between two [lat, lng] points
  function dist(a, b) {
    const R = 6371000, k = Math.PI / 180;
    const dLa = (b[0] - a[0]) * k, dLo = (b[1] - a[1]) * k;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * k) * Math.cos(b[0] * k) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  async function geocode(q) {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
    const d = await r.json();
    if (!d.length) throw new Error('Place not found: ' + q);
    return { lat: +d[0].lat, lng: +d[0].lon };
  }

  async function getRoutes(a, b) {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&alternatives=true`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.code !== 'Ok' || !d.routes.length) throw new Error('No route found between these places.');
    return d.routes;
  }

  // ---------------- Dashboard: route planner ----------------
  if ($('#dashMap')) {
    const map = initMap('dashMap');
    const layers = { safe: L.layerGroup().addTo(map), inc: L.layerGroup().addTo(map), risk: L.layerGroup().addTo(map) };
    const routeLayer = L.layerGroup().addTo(map);
    let data = { safe_places: [], incidents: [], risk_zones: [] };
    let startPos = null;

    fetch('/api/map-data').then((r) => r.json()).then((d) => {
      data = d;
      d.safe_places.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 8, color: '#15803d', fillColor: '#22c55e', fillOpacity: .9 })
        .bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.category)}`).addTo(layers.safe));
      d.incidents.forEach((i) => L.circleMarker([i.lat, i.lng], { radius: 7, color: '#b45309', fillColor: '#f59e0b', fillOpacity: .9 })
        .bindPopup(`<b>Incident</b><br>${esc(i.location)}<br>${esc(i.description)}`).addTo(layers.inc));
      d.risk_zones.forEach((z) => L.circle([z.lat, z.lng], { radius: 300, color: '#b91c1c', fillOpacity: .2 })
        .bindPopup(`<b>Risk zone: ${esc(z.name)}</b><br>${esc(z.description)}`).addTo(layers.risk));
    }).catch(() => toast('Could not load map data.', 'error'));

    [['#layerSafe', 'safe'], ['#layerInc', 'inc'], ['#layerRisk', 'risk']].forEach(([sel, key]) =>
      $(sel).addEventListener('change', (e) => (e.target.checked ? map.addLayer(layers[key]) : map.removeLayer(layers[key]))));

    $('#start').addEventListener('input', () => (startPos = null));
    $('#useLoc').addEventListener('click', async () => {
      try { startPos = await getPos(); $('#start').value = 'My location'; map.setView([startPos.lat, startPos.lng], 14); toast('Using your location', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    });

    function showRoutes(routes, sel) {
      routeLayer.clearLayers();
      routes.forEach((r, i) => {
        const on = i === sel;
        L.polyline(r.pts, { color: on ? (i === 0 ? '#16a34a' : '#2563eb') : '#94a3b8', weight: on ? 7 : 4, opacity: on ? .95 : .7, dashArray: on ? null : '8 8' })
          .on('click', () => showRoutes(routes, i)).addTo(routeLayer);
      });
      const chosen = routes[sel].pts;
      L.marker(chosen[0]).bindPopup('Start').addTo(routeLayer);
      L.marker(chosen[chosen.length - 1]).bindPopup('Destination').addTo(routeLayer);
      map.fitBounds(L.polyline(chosen).getBounds(), { padding: [40, 40] });
      $('#results').innerHTML = '<h3>Route options</h3>' + routes.map((r, i) => {
        const level = r.score === 0 ? 'low' : r.score <= 2 ? 'medium' : 'high';
        return `<div class="route ${i === sel ? 'active' : ''}" data-i="${i}">
          <b>Route ${i + 1}</b>${i === 0 ? '<span class="badge best">Safest</span>' : ''}
          <span class="badge ${level}">${level} risk</span><br>
          ${(r.distance / 1000).toFixed(1)} km &middot; ${Math.round(r.duration / 60)} min<br>
          <span class="muted">${r.score} hazard point(s) nearby &middot; ${r.safeNear} safe place(s) within 500 m</span></div>`;
      }).join('');
      document.querySelectorAll('.route').forEach((el) => el.addEventListener('click', () => showRoutes(routes, +el.dataset.i)));
    }

    $('#routeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#findBtn');
      btn.disabled = true; btn.textContent = 'Finding routes...';
      try {
        const a = startPos || await geocode($('#start').value.trim());
        const b = await geocode($('#end').value.trim());
        const routes = await getRoutes(a, b);
        const hazards = [...data.incidents.map((i) => ({ p: [i.lat, i.lng], w: 1 })), ...data.risk_zones.map((z) => ({ p: [z.lat, z.lng], w: 2 }))];
        routes.forEach((r) => {
          r.pts = r.geometry.coordinates.map((c) => [c[1], c[0]]);
          r.score = hazards.reduce((s, h) => s + (r.pts.some((p) => dist(p, h.p) < 300) ? h.w : 0), 0);
          r.safeNear = data.safe_places.filter((sp) => r.pts.some((p) => dist(p, [sp.lat, sp.lng]) < 500)).length;
        });
        routes.sort((x, y) => x.score - y.score || x.duration - y.duration);
        showRoutes(routes, 0);
        toast('Safest route highlighted in green', 'success');
      } catch (err) { toast(err.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = 'Find safest route'; }
    });

    $('#sosBtn').addEventListener('click', async () => {
      if (!confirm('Save an SOS record with your current location?')) return;
      try {
        const p = await getPos();
        const j = await postJSON('/api/sos', { lat: p.lat, lng: p.lng, details: $('#sosNote').value });
        const calls = j.contacts.length
          ? j.contacts.map((c) => `<a class="btn small" href="tel:${esc(c.phone)}">Call ${esc(c.name)}</a>`).join(' ')
          : '<span class="muted">No emergency contacts saved yet. Add them in Alerts &amp; Contacts.</span>';
        $('#sosPanel').innerHTML = `<div class="sos-box"><b>SOS record saved.</b><br>
          <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">Open my location in Google Maps</a>
          <div class="row" style="margin-top:8px">${calls}</div>
          <p class="small-text">Remember: this did not alert any emergency service. Call your local emergency number if you need help.</p></div>`;
        L.marker([p.lat, p.lng]).addTo(map).bindPopup('You are here').openPopup();
        map.setView([p.lat, p.lng], 16);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---------------- Report page: pin incident on map ----------------
  if ($('#reportMap')) {
    const map = initMap('reportMap');
    let pin = null;
    function setPin(lat, lng) {
      $('#lat').value = lat; $('#lng').value = lng;
      $('#pinInfo').textContent = `Pinned: ${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
      if (pin) pin.setLatLng([lat, lng]); else pin = L.marker([lat, lng]).addTo(map);
    }
    map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
    $('#useLoc').addEventListener('click', async () => {
      try { const p = await getPos(); setPin(p.lat, p.lng); map.setView([p.lat, p.lng], 16); }
      catch (e) { toast(e.message, 'error'); }
    });
    $('#incidentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const j = await postJSON('/api/incident', {
          location: $('#location').value, description: $('#description').value, lat: $('#lat').value, lng: $('#lng').value });
        toast(j.message, 'success');
        e.target.reset(); $('#pinInfo').textContent = 'No pin selected (optional).';
        if (pin) { map.removeLayer(pin); pin = null; }
        setTimeout(() => location.reload(), 1200);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---------------- Admin page: pick coordinates from map ----------------
  if ($('#adminMap')) {
    const map = initMap('adminMap');
    let pin = null;
    map.on('click', (e) => {
      const lat = e.latlng.lat.toFixed(6), lng = e.latlng.lng.toFixed(6);
      document.querySelectorAll('.lat').forEach((i) => (i.value = lat));
      document.querySelectorAll('.lng').forEach((i) => (i.value = lng));
      if (pin) pin.setLatLng(e.latlng); else pin = L.marker(e.latlng).addTo(map);
    });
  }
})();