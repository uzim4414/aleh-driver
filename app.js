/* ══════════════════════════════════════════════════════════════
   עלה נהגים — app.js
   Auth → GAS API → Routing → Render
══════════════════════════════════════════════════════════════ */

// ← הגדר כאן את ה-URL של ה-GAS Web App לאחר deploy
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXUTCX3L9EfDpV0mgIsBxeHsio2yPbx8-ReKN-dmN-DqYpe5oUBXbFaZJA1z9xF6uP/exec';

// ← הגדר כאן את Google OAuth Client ID
const GOOGLE_CLIENT_ID = '11295167732-dov0o2p2858i4nhe0lm1r6aa5sucvukp.apps.googleusercontent.com';

const SESSION_KEY = 'aleh_driver_session';
const SESSION_TTL = 24 * 60 * 60 * 1000;

let STATE = {
  user: null,
  vehicle: null,
  documents: [],
  insurance: [],
  history: [],
  alerts: [],
  fuelData: null,
  fuelSelectedMonth: null,
  currentScreen: 'home',
  currentTab: 'info',
  idToken: null,
  govData:    undefined,  // undefined=טרם נטען | null=שגיאה/לא נמצא | object=נטען
  govWLTP:    undefined,
  govLoading: false,
  helpMenuOpen: false,
  helpGps: null
};

/* ══ GAS API ══ */
function _isTokenExpired(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    return !payload.exp || (payload.exp * 1000) < Date.now();
  } catch(e) { return true; }
}

function _sessionExpired() {
  localStorage.removeItem(SESSION_KEY);
  STATE.idToken = null;
  STATE.vehicle = null;
  STATE.user = null;
  // Show re-login overlay
  var el = document.getElementById('session-expired-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'session-expired-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,41,66,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;direction:rtl';
    el.innerHTML =
      '<div style="font-size:40px">🔒</div>' +
      '<div style="color:#fff;font-size:18px;font-weight:700">פג תוקף ההתחברות</div>' +
      '<div style="color:#94a3b8;font-size:14px">יש להתחבר מחדש להמשך</div>' +
      '<button onclick="window.location.reload()" style="background:#2563eb;color:#fff;border:none;border-radius:12px;padding:12px 32px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px">🔄 התחבר מחדש</button>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

async function gasPost(action, extra) {
  extra = extra || {};
  if (!GAS_URL) return mockResponse(action, extra);

  if (STATE.idToken && STATE.idToken !== 'demo_token' && _isTokenExpired(STATE.idToken)) {
    _sessionExpired();
    throw new Error('session_expired');
  }

  const params = Object.assign({ action, idToken: STATE.idToken }, extra);
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json();
  if (!data.ok) {
    if (data.error && (data.error.includes('idToken') || data.error === 'unauthorized')) {
      _sessionExpired();
      throw new Error('session_expired');
    }
    throw new Error(data.error || 'שגיאת שרת');
  }
  return data;
}

/* ══ Demo / Mock mode (כשאין GAS_URL) ══ */
function mockResponse(action) {
  const mockVehicle = {
    id: 'V001', num: '123-45-678', cat: 'פרטי', make: 'Toyota', model: 'Highlander',
    year: '2022', color: 'לבן', holder: 'משה כהן', dept: 'אגף שיקום',
    email: 'demo@aleh.org', phone: '052-1234567',
    licExp: '2026-08-15', insCompExp: '2025-06-10', insFullExp: '2026-01-20',
    lastServiceDate: '2025-01-10', lastServiceKm: '45000', nextServiceKm: '50000',
    currentKm: 47850,
    testDue: '2026-08-15', testDone: '',
    photoLink: 'https://toyota-select.co.il/wp-content/uploads/2025/04/MODELS-SELECT-8.png',
    notes: '',
    garage: {
      id: 'G001',
      name: 'מוסך טויוטה תל אביב',
      address: 'רחוב הברזל 12, תל אביב',
      phone: '03-6789012',
      contactName: 'יוסי כהן',
      contactPhone: '052-9876543',
      bookingUrl: 'https://toyota.co.il/service/booking'
    }
  };
  if (action === 'driver_auth') {
    return { ok: true, email: 'demo@aleh.org', vehicle: mockVehicle, orgName: 'עלה' };
  }
  if (action === 'driver_vehicle') {
    return {
      ok: true,
      vehicle: mockVehicle,
      fuelData: {
        hasData: true,
        monthKey: '2026-04',
        actualL100: 9.3,
        standardL100: 10.0,
        status: 'excellent',
        statusLabel: 'מצוין',
        kmThisMonth: 1210,
        litersThisMonth: 112.5,
        costThisMonth: 839,
        savingsL: 8.5,
        savingsNIS: 63,
        months: [
          {key:'2025-11',label:"נוב'",l100:10.6,km:990,liters:104.9,cost:783,fills:5,status:'warn',statusLabel:'גבוה'},
          {key:'2025-12',label:"דצ'",l100:10.4,km:1050,liters:109.2,cost:815,fills:6,status:'warn',statusLabel:'גבוה'},
          {key:'2026-01',label:"ינו'",l100:9.8,km:980,liters:96.0,cost:717,fills:5,status:'good',statusLabel:'תקין'},
          {key:'2026-02',label:"פבר'",l100:9.5,km:1180,liters:112.1,cost:837,fills:6,status:'good',statusLabel:'תקין'},
          {key:'2026-03',label:'מרץ',l100:9.1,km:1320,liters:120.1,cost:896,fills:7,status:'excellent',statusLabel:'מצוין'},
          {key:'2026-04',label:"אפר'",l100:9.3,km:1210,liters:112.5,cost:839,fills:6,status:'excellent',statusLabel:'מצוין'}
        ],
        fuelInsight: {
          text: 'באפריל נסעת ביעילות מרשימה — חסכת 63 ₪ בדלק. החיסכון הזה מממן שעתיים של ריפוי בדיבור לנועה בת 5, שכל שעה כזו שווה לה עולם.',
          generatedAt: '2026-05-01T03:02:15',
          monthKey: '2026-04'
        }
      },
      documents: [
        { id: 'D1', type: 'רישיון רכב', date: '2026-08-15', link: '', notes: '' },
        { id: 'D2', type: 'ביטוח חובה', date: '2025-06-10', link: '', notes: '' },
        { id: 'D3', type: 'ביטוח מקיף', date: '2026-01-20', link: '', notes: '' }
      ],
      insurance: [
        { id: 'I1', year: '2025', company: 'מגדל', compCost: 3200, fullCost: 4800 }
      ],
      history: [
        { date: '2025-01-10', garage: 'מוסך טויוטה תל אביב', city: 'תל אביב', km: '45000', type: 'טיפול שוטף' },
        { date: '2024-07-22', garage: 'מוסך טויוטה ירושלים', city: 'ירושלים', km: '38000', type: 'טיפול תקופתי' },
        { date: '2024-01-05', garage: 'מוסך טויוטה תל אביב', city: 'תל אביב', km: '30500', type: 'טיפול שוטף' }
      ]
    };
  }
  if (action === 'driver_update_km') return { ok: true, km: 45000 };
  if (action === 'driver_report_fault') return { ok: true };
  if (action === 'driver_register_fcm') return { ok: true };
  if (action === 'get_service_providers') {
    return { ok: true, providers: [{ id:'SP001', name:'פנצריה מורשית עלה', category:'puncture', address:'רחוב הרצל 14, בני ברק', phone:'03-1234567', contactName:'יוסי כהן', googlePlaceId:'ChIJtest123', notes:'' }] };
  }
  if (action === 'get_vehicle_insurance_details') {
    return { ok: true, insurance: { hasComprehensive:true, company:'מגדל ביטוח', policyNumber:'123456789', emergencyPhone:'1-800-123-456', towingCoverageKm:100, includesRentalCar:true, expiryDate:'2027-01-20' }, garage: { name:'מוסך טויוטה תל אביב', address:'רחוב הברזל 12, תל אביב', phone:'03-6789012' } };
  }
  if (action === 'driver_field_event') {
    return { ok: true, eventId: 'EVT-DEMO-' + Date.now() };
  }
  return { ok: false, error: 'Unknown action' };
}

/* ══════════════════════════════════════════════════════════════
   GPS Utility
══════════════════════════════════════════════════════════════ */
function _getGps(timeoutMs) {
  return new Promise(function(resolve) {
    if (!navigator.geolocation) { resolve({ lat: null, lng: null }); return; }
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; resolve({ lat: null, lng: null }); }
    }, timeoutMs || 8000);
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        if (!done) { done = true; clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }
      },
      function() {
        if (!done) { done = true; clearTimeout(timer); resolve({ lat: null, lng: null }); }
      },
      { enableHighAccuracy: true, timeout: timeoutMs || 8000 }
    );
  });
}

/* ══════════════════════════════════════════════════════════════
   Offline Event Queue
══════════════════════════════════════════════════════════════ */
var PENDING_KEY = 'aleh_pending_events';

function _queueEvent(eventData) {
  var queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  queue.push(Object.assign({ id: 'local-' + Date.now(), retries: 0 }, eventData));
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
}

async function _syncPendingEvents() {
  var queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  if (!queue.length) return;
  var remaining = [];
  for (var i = 0; i < queue.length; i++) {
    var ev = queue[i];
    if (ev.retries >= 3) { ev.syncFailed = true; remaining.push(ev); continue; }
    try {
      var result = await gasPost('driver_field_event', {
        type: ev.type, lat: ev.lat || '', lng: ev.lng || '', details: JSON.stringify(ev.details || {})
      });
      if (!result.ok) { ev.retries++; remaining.push(ev); }
    } catch(e2) { ev.retries++; remaining.push(ev); }
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
}

async function _fireFieldEvent(type, details) {
  var gps = STATE.helpGps || { lat: null, lng: null };
  var payload = { type: type, lat: gps.lat || '', lng: gps.lng || '', details: JSON.stringify(details || {}) };
  try {
    var result = await gasPost('driver_field_event', payload);
    if (!result.ok) throw new Error(result.error);
    return result;
  } catch(e) {
    if (!navigator.onLine) {
      _queueEvent(Object.assign({ type: type, details: details }, gps));
      return { ok: true, eventId: 'queued', queued: true };
    }
    return { ok: false, error: String(e) };
  }
}

window.addEventListener('online', function() { _syncPendingEvents(); });

/* ══ Session ══ */
function saveSession(token, vehicleData, userInfo) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      token, vehicleData, userInfo, ts: Date.now()
    }));
  } catch(e) {}
}

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || Date.now() - s.ts > SESSION_TTL) return null;
    return s;
  } catch { return null; }
}

/* ══ Auth ══ */
function initGoogleAuth() {
  if (!GOOGLE_CLIENT_ID) {
    // Demo mode — skip Google auth
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: false
  });
}

async function handleGoogleCredential(response) {
  showLoader();
  try {
    STATE.idToken = response.credential;

    // Parse JWT payload first (to show user info in errors)
    const parts = response.credential.split('.');
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    STATE.user = {
      email: payload.email || '',
      name: payload.name || (payload.email || '').split('@')[0],
      picture: payload.picture || ''
    };

    console.log('[auth] calling driver_auth for', STATE.user.email);
    const result = await gasPost('driver_auth');
    console.log('[auth] result ok:', result.ok);
    STATE.vehicle = result.vehicle;

    saveSession(STATE.idToken, STATE.vehicle, STATE.user);
    hideLoader();
    showGreeting((result.vehicle && result.vehicle.holder) || STATE.user.name);
    await loadFullData();
    hideGreeting();
    startApp();
  } catch(err) {
    console.error('[auth] error:', err.message);
    showLoginError(err.message);
  }
}

async function demoLogin() {
  showLoader();
  try {
    STATE.idToken = 'demo_token';
    const result = await gasPost('driver_auth');
    STATE.vehicle = result.vehicle;
    STATE.user = { email: 'demo@aleh.org', name: 'משה כהן', picture: '' };
    saveSession(STATE.idToken, STATE.vehicle, STATE.user);
    await loadFullData();
    startApp();
  } catch(err) {
    showLoginError(err.message);
  } finally {
    hideLoader();
  }
}

async function fetchGovData() {
  const v = STATE.vehicle;
  if (!v || !v.num) return;
  const plate = String(v.num).replace(/\D/g, '');
  if (!plate) return;
  STATE.govLoading = true;
  STATE.govData  = undefined;
  STATE.govWLTP  = undefined;
  try {
    // שלב 1: נתוני רישוי לפי לוחית
    const f1  = encodeURIComponent(JSON.stringify({ mispar_rechev: plate }));
    const r1  = await fetch('https://data.gov.il/api/3/action/datastore_search?resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3&filters=' + f1);
    const j1  = await r1.json();
    const reg = (j1.result && j1.result.records && j1.result.records[0]) || null;
    STATE.govData = reg;

    // שלב 2: נתונים טכניים WLTP לפי degem_cd + tozeret_cd
    if (reg && reg.degem_cd && reg.tozeret_cd) {
      const f2 = encodeURIComponent(JSON.stringify({
        degem_cd:   String(reg.degem_cd),
        tozeret_cd: String(reg.tozeret_cd)
      }));
      const r2 = await fetch('https://data.gov.il/api/3/action/datastore_search?resource_id=142afde2-6228-49f9-8a29-9b6c3a0cbe40&filters=' + f2 + '&limit=5');
      const j2 = await r2.json();
      const wRecs = (j2.result && j2.result.records) || [];
      // העדף רשומה שתואמת ramat_gimur, אחרת ראשונה
      const gimur = reg.ramat_gimur;
      STATE.govWLTP = wRecs.find(function(r) { return r.ramat_gimur === gimur; }) || wRecs[0] || null;
    } else {
      STATE.govWLTP = null;
    }
  } catch(e) {
    STATE.govData = null;
    STATE.govWLTP = null;
    console.warn('fetchGovData error:', e);
  }
  STATE.govLoading = false;
  if (STATE.currentTab === 'info' && STATE.currentScreen === 'vehicle') {
    renderVehicleScreen('info');
  }
}

async function loadFullData() {
  try {
    const result = await gasPost('driver_vehicle');
    STATE.vehicle   = result.vehicle;
    STATE.fuelData  = result.fuelData  || null;
    STATE.documents = (result.documents && result.documents.length)
      ? result.documents
      : buildDocumentsFromVehicle(result.vehicle);
    STATE.insurance = result.insurance || [];
    STATE.history   = result.history   || [];
    STATE.alerts    = buildAlerts(STATE.vehicle);
  } catch(e) {
    console.warn('loadFullData error:', e.message);
  }
  // טעינת נתונים טכניים ממשרד התחבורה — ברקע, לא חוסמת
  fetchGovData();
}

/* ══ Alerts ══ */
function buildAlerts(v) {
  if (!v) return [];
  const alerts = [];
  const today = new Date(); today.setHours(0,0,0,0);

  function daysLeft(dateStr) {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr) - today) / 86400000);
  }

  // טסט — רלוונטי לנהג (60 ימים מראש)
  if (!v.testDone && v.testDue) {
    const d = daysLeft(v.testDue);
    if (d !== null && d <= 60) {
      const type = d <= 7 ? 'red' : 'warn';
      alerts.push({ type, title: 'טסט רכב', sub: formatDate(v.testDue), days: d, label: type === 'red' ? 'דחוף' : 'להתייחסות' });
    }
  }

  // טיפול לפי ק"מ — הגנה מפני ערכים לא תקינים
  const lastKm = parseInt(v.lastServiceKm) || 0;
  const nextKm = parseInt(v.nextServiceKm) || 0;
  if (lastKm > 0 && nextKm > 0) {
    const kmLeft = nextKm - lastKm;
    if (kmLeft < -1000) {
      // רק אם עבר ב-1000+ ק"מ — לא עבור שגיאות נתונים
      alerts.push({ type: 'red', title: 'טיפול באיחור!', sub: 'עבר ב-' + Math.abs(kmLeft).toLocaleString('he') + ' ק"מ', days: null, label: 'דחוף' });
    } else if (kmLeft < 3000) {
      alerts.push({ type: 'warn', title: kmLeft < 0 ? 'עבר מועד טיפול' : 'טיפול קרוב', sub: kmLeft < 0 ? 'עבר ב-' + Math.abs(kmLeft).toLocaleString('he') + ' ק"מ' : 'נותרו ' + kmLeft.toLocaleString('he') + ' ק"מ', days: null, label: 'להתייחסות' });
    }
  }

  return alerts;
}

/* ══ Documents fallback ══ */
function buildDocumentsFromVehicle(v) {
  if (!v) return [];
  const docs = [];
  if (v.licExp)     docs.push({ id: 'lic',  type: 'רישיון רכב',  date: v.licExp,    link: v.licLink    || '' });
  if (v.insCompExp) docs.push({ id: 'comp', type: 'ביטוח חובה',  date: v.insCompExp, link: v.insCompLink || '' });
  if (v.insFullExp) docs.push({ id: 'full', type: 'ביטוח מקיף',  date: v.insFullExp, link: v.insFullLink || '' });
  return docs;
}

/* ══ Drive URL → image URL ══ */
function driveToImgUrl(link) {
  if (!link) return null;
  const m = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
  if (link.startsWith('http')) return link;
  return null;
}

/* ══ Car image lookup ══ */
const CAR_IMAGE_MAP = {
  'toyota highlander':    'https://toyota-select.co.il/wp-content/uploads/2025/04/MODELS-SELECT-8.png',
  'toyota sienna':        'https://di-uploads-pod42.dealerinspire.com/toyotaofmurfreesboro/uploads/2022/06/2023-Toyota-Sienna-XSE-scaled.jpg',
  'toyota rav4':          'https://www.motortrend.com/uploads/2022/09/2023-Toyota-RAV4-1.jpg',
  'toyota camry':         'https://www.motortrend.com/uploads/2022/09/2023-Toyota-Camry-1.jpg',
  'toyota corolla':       'https://www.motortrend.com/uploads/2022/09/2023-Toyota-Corolla-1.jpg',
  'toyota corolla cross': 'https://di-uploads-pod42.dealerinspire.com/toyotaofmurfreesboro/uploads/2022/06/2023-Toyota-Corolla-Cross-scaled.jpg',
  'toyota yaris':         'https://www.motortrend.com/uploads/2022/09/2023-Toyota-Yaris-1.jpg',
  'toyota land cruiser':  'https://www.motortrend.com/uploads/2023/03/2024-Toyota-Land-Cruiser-1.jpg',
  'volkswagen transporter': 'https://www.motortrend.com/uploads/2022/01/2022-VW-Transporter-1.jpg',
  'ford transit':         'https://www.motortrend.com/uploads/2021/11/2022-Ford-Transit-1.jpg',
};

function getCarImageUrl(make, model) {
  const key = [make, model].filter(Boolean).join(' ').toLowerCase().trim();
  if (CAR_IMAGE_MAP[key]) return CAR_IMAGE_MAP[key];
  const makeOnly = (make || '').toLowerCase().trim();
  for (const k of Object.keys(CAR_IMAGE_MAP)) {
    if (k.startsWith(makeOnly + ' ')) return CAR_IMAGE_MAP[k];
  }
  return null;
}

/* ══ Swipe navigation ══ */
function initSwipe() {
  const SCREENS = ['home', 'alerts', 'vehicle', 'history'];
  let startX = 0, startY = 0;

  document.getElementById('app').addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.getElementById('app').addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    // Skip swipe when interacting with inputs
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    const idx = SCREENS.indexOf(STATE.currentScreen);
    if (idx === -1) return;
    // RTL: swipe left (dx<0) = go deeper left = higher index
    if (dx < 0 && idx < SCREENS.length - 1) APP.nav(SCREENS[idx + 1]);
    else if (dx > 0 && idx > 0) APP.nav(SCREENS[idx - 1]);
  }, { passive: true });
}

/* ══ Start App ══ */
function startApp() {
  hideLoader();
  document.getElementById('app').classList.remove('hidden');
  renderAll();
  initSwipe();
  if ('serviceWorker' in navigator && GAS_URL) registerFcm();
}

function logout() {
  showConfirmModal({
    icon: '👤',
    title: 'התנתקות מהחשבון',
    sub: 'האם תרצה להתנתק?',
    confirmText: 'התנתק',
    onConfirm: () => {
      localStorage.removeItem(SESSION_KEY);
      location.reload();
    }
  });
}

function showConfirmModal({ icon='❓', title='', sub='', confirmText='אישור', onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('cm-icon').textContent = icon;
  document.getElementById('cm-title').textContent = title;
  document.getElementById('cm-sub').textContent = sub;
  const btn = document.getElementById('cm-confirm');
  btn.textContent = confirmText;
  btn.onclick = () => { closeConfirmModal(); onConfirm(); };
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

/* ══ Render ══ */
function renderAll() {
  renderTopBar();
  renderHomeScreen();
  renderAlerts();
  renderHistory();
  renderService();
}

function renderTopBar() {
  if (!STATE.user) return;

  const holderName = (STATE.vehicle && STATE.vehicle.holder) || STATE.user.name;
  const firstName = holderName.split(' ')[0];
  document.getElementById('user-name').textContent = firstName;

  const initialsEl = document.getElementById('user-initials');
  if (initialsEl) {
    initialsEl.textContent = getInitials(holderName);
    initialsEl.style.color = '#fff';
  }

  const badge = document.getElementById('alert-badge');
  const total = STATE.alerts.length;
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
    const hasRed = STATE.alerts.some(function(a) { return a.type === 'red'; });
    badge.style.background = hasRed ? 'var(--red)' : 'var(--warn)';
  } else {
    badge.classList.add('hidden');
  }
}

function renderHomeScreen() {
  const v = STATE.vehicle;
  if (!v) return;

  document.getElementById('car-name').textContent = ((v.make || '') + ' ' + (v.model || '')).trim();
  document.getElementById('car-plate').textContent = formatPlate(v.num);

  const photo = document.getElementById('car-photo');
  const imgUrl = driveToImgUrl(v.appPhotoLink || v.photoLink) || getCarImageUrl(v.make, v.model);
  if (imgUrl) {
    photo.src = imgUrl;
    photo.onerror = () => { photo.style.display = 'none'; };
  } else {
    document.querySelector('.hero-img-area').style.display = 'none';
  }

  renderServiceProgress();
  renderFuelWidget();

  const homeAlert = document.getElementById('home-alert');
  const topAlert = STATE.alerts.find(function(a) { return a.type === 'red'; }) || STATE.alerts[0];
  if (topAlert) {
    document.getElementById('home-alert-title').textContent = topAlert.title;
    document.getElementById('home-alert-sub').textContent =
      topAlert.days !== null ? topAlert.days + ' ימים' : topAlert.sub;
    homeAlert.style.borderRightColor = topAlert.type === 'red' ? 'var(--red)' : 'var(--warn)';
    homeAlert.classList.remove('hidden');
  } else {
    homeAlert.classList.add('hidden');
  }
}

function renderFuelWidget() {
  var mount = document.getElementById('fuel-widget-mount');
  if (!mount) return;
  var fd = STATE.fuelData;
  if (!fd || !fd.hasData) { mount.innerHTML = ''; return; }

  // find last month with actual data
  var months = fd.months || [];
  var cur = null, curIdx = -1;
  for (var i = months.length - 1; i >= 0; i--) {
    if (months[i].liters > 0) { cur = months[i]; curIdx = i; break; }
  }
  if (!cur) { mount.innerHTML = ''; return; }

  // average liters (exclude current month from avg so comparison is fair)
  var avgLiters = 0, cnt = 0;
  for (var k = 0; k < curIdx; k++) {
    if (months[k].liters > 0) { avgLiters += months[k].liters; cnt++; }
  }
  if (cnt > 0) avgLiters = Math.round(avgLiters / cnt * 10) / 10;

  // vs-average comparison (the core message)
  var diffPct = 0, diffLiters = 0;
  if (avgLiters > 0) {
    diffLiters = Math.round((cur.liters - avgLiters) * 10) / 10;
    diffPct    = Math.round((cur.liters - avgLiters) / avgLiters * 100);
  }

  // derive badge + color + headline sentence
  var badgeClass, badgeIcon, msgColor, headline, subline;
  if (avgLiters === 0) {
    // no history to compare
    badgeClass = 'fw-badge-good'; badgeIcon = '⭐'; msgColor = 'var(--t2)';
    headline = cur.liters + ' ל׳ תודלקו החודש';
    subline  = 'אין עדיין היסטוריה להשוואה';
  } else if (diffPct <= -5) {
    badgeClass = 'fw-badge-excellent'; badgeIcon = '🏆'; msgColor = 'var(--fuel-excellent)';
    headline = 'צריכה נמוכה ב־' + Math.abs(diffPct) + '% מהממוצע';
    subline  = 'חסכת ' + Math.abs(diffLiters) + ' ל׳ לעומת הממוצע שלך (' + avgLiters + ' ל׳)';
  } else if (diffPct < 5) {
    badgeClass = 'fw-badge-good'; badgeIcon = '⭐'; msgColor = 'var(--fuel-good)';
    headline = 'צריכה תקינה — קרוב לממוצע';
    subline  = 'החודש: ' + cur.liters + ' ל׳ · ממוצע: ' + avgLiters + ' ל׳';
  } else if (diffPct < 12) {
    badgeClass = 'fw-badge-warn'; badgeIcon = '⚡'; msgColor = 'var(--fuel-warn)';
    headline = 'צריכה גבוהה ב־' + diffPct + '% מהממוצע';
    subline  = 'תדלקת ' + diffLiters + ' ל׳ יותר מהממוצע שלך (' + avgLiters + ' ל׳)';
  } else {
    badgeClass = 'fw-badge-over'; badgeIcon = '🚨'; msgColor = 'var(--fuel-over)';
    headline = 'צריכה גבוהה ב־' + diffPct + '% מהממוצע';
    subline  = 'תדלקת ' + diffLiters + ' ל׳ יותר מהממוצע שלך (' + avgLiters + ' ל׳)';
  }

  // bar: cur vs average
  var barPct = avgLiters > 0 ? Math.max(4, Math.min(100, Math.round((cur.liters / avgLiters) * 100))) : 60;

  var monthLabel = _heMonthLabel(cur.key) + ' ' + (cur.key + '').slice(0, 4);

  mount.innerHTML =
    '<div class="fuel-widget" onclick="openFuelModal()" role="button" tabindex="0" aria-label="ביצועי דלק">' +
      '<div class="fw-hdr">' +
        '<div class="fw-label">ביצועי דלק · ' + monthLabel + '</div>' +
        '<div class="fw-pill" style="background:' + msgColor + '1a;color:' + msgColor + '">' + cur.liters + ' ל׳</div>' +
      '</div>' +
      '<div class="fw-hero-row">' +
        '<span class="fw-badge ' + badgeClass + '">' + badgeIcon + '</span>' +
        '<span class="fw-headline" style="color:' + msgColor + '">' + headline + '</span>' +
      '</div>' +
      '<div class="fw-sub">' + subline + '</div>' +
      '<div class="fw-bar-bg">' +
        '<div class="fw-bar-fill" style="background:' + msgColor + ';--fw-bar-w:' + barPct + '%"></div>' +
      '</div>' +
      '<div class="fw-bar-labels">' +
        '<span>עלות: ₪' + (cur.cost ? cur.cost.toLocaleString('he') : '—') + '</span>' +
        '<span>' + (cur.km ? cur.km.toLocaleString('he') + ' ק"מ' : '') + '</span>' +
      '</div>' +
      '<div class="fw-cta">לפרטים נוספים ›</div>' +
    '</div>';
}

function _heMonthLabel(monthKey) {
  var labels = {'01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל','05':'מאי','06':'יוני','07':'יולי','08':'אוגוסט','09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר'};
  return labels[(monthKey + '').slice(5,7)] || monthKey;
}

function openFuelModal() {
  var fd = STATE.fuelData;
  if (!fd || !fd.hasData) return;
  renderFuelModal();
  var el = document.getElementById('fuel-modal');
  el.style.display = 'flex';
  requestAnimationFrame(function() { el.classList.add('open'); });
  document.body.style.overflow = 'hidden';
}

function closeFuelModal() {
  var el = document.getElementById('fuel-modal');
  el.classList.remove('open');
  document.body.style.overflow = '';
  STATE.fuelSelectedMonth = null;
  setTimeout(function() { el.style.display = 'none'; }, 380);
}

function selectFuelMonth(key) {
  STATE.fuelSelectedMonth = key;
  renderFuelModal();
  // scroll to tiles section
  var el = document.getElementById('fm-month-detail');
  if (el) el.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderFuelModal() {
  var fd = STATE.fuelData;
  if (!fd || !fd.hasData) return;
  var content = document.getElementById('fuel-modal-content');
  if (!content) return;

  var selKey = STATE.fuelSelectedMonth || fd.monthKey;
  var months = fd.months || [];
  var sel = null;
  for (var i = 0; i < months.length; i++) { if (months[i].key === selKey) { sel = months[i]; break; } }
  if (!sel) sel = {key: fd.monthKey, km: fd.kmThisMonth, liters: fd.litersThisMonth, cost: fd.costThisMonth, pricePerL: fd.pricePerLThisMonth || 0, fills: 0, stations: []};

  // Hero — ליטרים + עלות + מחיר לליטר
  var heroHtml =
    '<div class="fm-hero">' +
      '<div class="fm-hero-val">' + (sel.liters || '—') + '</div>' +
      '<div class="fm-hero-unit">ליטרים · ' + _heMonthLabel(sel.key) + ' ' + (sel.key+'').slice(0,4) + '</div>' +
      '<div class="fm-hero-row2">' +
        '<div class="fm-hero-chip">₪' + (sel.cost ? sel.cost.toLocaleString('he') : '—') + '</div>' +
        (sel.pricePerL ? '<div class="fm-hero-chip2">₪' + sel.pricePerL.toFixed(2) + ' לליטר</div>' : '') +
        '<div class="fm-hero-chip3">תקן: ' + fd.standardL100 + ' ל/100ק"מ</div>' +
      '</div>' +
    '</div>';

  // AI Insight
  var insightHtml = '<div class="fm-section"><div class="fm-sec-title">תובנת AI</div>';
  if (fd.fuelInsight && fd.fuelInsight.text) {
    var genDate = fd.fuelInsight.generatedAt ? fd.fuelInsight.generatedAt.slice(0,10) : '';
    insightHtml +=
      '<div class="fm-insight-card">' +
        '<div class="fm-insight-shimmer"></div>' +
        '<div class="fm-insight-head"><div class="fm-insight-icon">✨</div><div class="fm-insight-label">עלה Intelligence</div></div>' +
        '<div class="fm-insight-text">' + fd.fuelInsight.text + '</div>' +
        (genDate ? '<div class="fm-insight-footer">נוצר ' + genDate + ' · GPT-4o</div>' : '') +
      '</div>';
  } else {
    insightHtml +=
      '<div class="fm-insight-card fm-insight-empty">' +
        '<div class="fm-insight-head"><div class="fm-insight-icon">✨</div><div class="fm-insight-label">עלה Intelligence</div></div>' +
        '<div class="fm-insight-text" style="color:var(--t2)">תובנת AI תיווצר ב-1 לחודש הבא.<br>המערכת מנתחת את דפוסי הנסיעה שלך ומחשבת את ההשפעה על ילדי עלה.</div>' +
      '</div>';
  }
  insightHtml += '</div>';

  // גרף — עמודות ליטרים, עלות בולטת מתחת לכל חודש (issue 1+2)
  var maxL = 0;
  for (var ci = 0; ci < months.length; ci++) { if (months[ci].liters > maxL) maxL = months[ci].liters; }
  if (maxL === 0) maxL = 1;
  var chartCols = '';
  for (var j = 0; j < months.length; j++) {
    var m     = months[j];
    var isSel = (m.key === selKey);
    var barH  = m.liters > 0 ? Math.max(8, Math.round((m.liters / maxL) * 100)) : 4;
    var mColor = isSel ? 'var(--fuel-excellent)' : 'rgba(52,199,89,0.45)';
    var delay = (j * 0.07).toFixed(2) + 's';
    chartCols +=
      '<div class="fm-chart-col" onclick="selectFuelMonth(\'' + m.key + '\')" style="cursor:pointer">' +
        '<div class="fm-bar-wrap">' +
          '<div class="fm-bar' + (isSel ? ' current' : '') + '" ' +
               'style="background:' + mColor + ';--fm-bar-h:' + barH + '%;animation-delay:' + delay + ';' +
               (isSel ? 'outline:2px solid var(--fuel-excellent);outline-offset:2px;' : '') + '"></div>' +
        '</div>' +
        '<div class="fm-chart-val">' + (m.liters > 0 ? m.liters + 'ל׳' : '') + '</div>' +
        '<div class="fm-chart-label' + (isSel ? ' current' : '') + '">' + m.label + '</div>' +
        '<div class="fm-chart-cost">' + (m.cost > 0 ? '₪' + m.cost.toLocaleString('he') : '') + '</div>' +
      '</div>';
  }
  var chartHtml =
    '<div class="fm-section">' +
      '<div class="fm-sec-title">6 חודשים אחרונים <span style="font-size:10px;color:var(--t2);font-weight:400">· לחץ לפרטים</span></div>' +
      '<div class="fm-chart">' + chartCols + '</div>' +
    '</div>';

  // פרטי חודש נבחר
  var tilesHtml =
    '<div class="fm-section" id="fm-month-detail">' +
      '<div class="fm-sec-title">פרטי ' + _heMonthLabel(sel.key) + ' ' + (sel.key+'').slice(0,4) + '</div>' +
      '<div class="fm-tiles">' +
        '<div class="fm-tile"><div class="fm-tile-lbl">ק"מ שנסעת</div><div class="fm-tile-val">' + (sel.km ? sel.km.toLocaleString('he') : '—') + '</div><div class="fm-tile-unit">קילומטר</div></div>' +
        '<div class="fm-tile"><div class="fm-tile-lbl">ליטרים</div><div class="fm-tile-val">' + (sel.liters || '—') + '</div><div class="fm-tile-unit">ליטר</div></div>' +
        '<div class="fm-tile"><div class="fm-tile-lbl">עלות דלק</div><div class="fm-tile-val">₪' + (sel.cost ? sel.cost.toLocaleString('he') : '—') + '</div><div class="fm-tile-unit"></div></div>' +
        '<div class="fm-tile"><div class="fm-tile-lbl">מחיר לליטר</div><div class="fm-tile-val">₪' + (sel.pricePerL ? sel.pricePerL.toFixed(2) : '—') + '</div><div class="fm-tile-unit"></div></div>' +
      '</div>' +
    '</div>';

  // תחנות — של החודש הנבחר (issue 3)
  var stationsHtml = '';
  var stations = (sel.stations && sel.stations.length > 0) ? sel.stations : [];
  if (stations.length > 0) {
    var maxStL = stations[0].liters || 1;
    var rankClass = ['r1','r2','r3'];
    var stCards = '';
    for (var si = 0; si < stations.length; si++) {
      var st  = stations[si];
      var stPct = Math.round((st.liters / maxStL) * 100);
      var rc  = si < 3 ? rankClass[si] : 'rn';
      var dly = (si * 0.1).toFixed(1) + 's';
      stCards +=
        '<div class="fm-station-card" style="animation-delay:' + dly + '">' +
          '<div class="fm-station-rank ' + rc + '">' + (si+1) + '</div>' +
          '<div class="fm-station-body">' +
            '<div class="fm-station-name">' + st.name + '</div>' +
            '<div class="fm-station-bar-bg"><div class="fm-station-bar" style="--st-w:' + stPct + '%;animation-delay:' + dly + '"></div></div>' +
            '<div class="fm-station-meta"><span>' + st.liters + ' ל׳</span><span>' + st.fills + ' תדלוקים</span></div>' +
          '</div>' +
          '<div class="fm-station-right">' +
            '<div class="fm-station-cost">₪' + st.cost.toLocaleString('he') + '</div>' +
            (st.pricePerL ? '<div class="fm-station-ppl">₪' + st.pricePerL.toFixed(2) + '/ל׳</div>' : '') +
          '</div>' +
        '</div>';
    }
    stationsHtml =
      '<div class="fm-section">' +
        '<div class="fm-sec-title">תחנות דלק — ' + _heMonthLabel(sel.key) + '</div>' +
        '<div class="fm-stations">' + stCards + '</div>' +
      '</div>';
  }

  // סיכום 6 חודשים — ק"מ + ליטרים בלבד (ללא עלות — מוצגת בגרף)
  var annKm = 0, annL = 0;
  for (var k = 0; k < months.length; k++) {
    annKm += months[k].km     || 0;
    annL  += months[k].liters || 0;
  }
  var annualHtml =
    '<div class="fm-section">' +
      '<div class="fm-sec-title">סיכום 6 חודשים</div>' +
      '<div class="fm-annual">' +
        '<div class="fm-annual-item"><div class="fm-annual-val">' + Math.round(annKm).toLocaleString('he') + '</div><div class="fm-annual-lbl">ק"מ</div></div>' +
        '<div class="fm-annual-item"><div class="fm-annual-val">' + Math.round(annL).toLocaleString('he') + '</div><div class="fm-annual-lbl">ליטרים</div></div>' +
        '<div class="fm-annual-item"><div class="fm-annual-val">' + (annL > 0 && fd.standardL100 > 0 ? Math.round(annL*100/fd.standardL100).toLocaleString('he') : '—') + '</div><div class="fm-annual-lbl">ק"מ משוער</div></div>' +
      '</div>' +
    '</div>';

  content.innerHTML = heroHtml + insightHtml + chartHtml + tilesHtml + stationsHtml + annualHtml +
    '<button class="fm-close-btn" onclick="closeFuelModal()">סגור</button>';
}

function renderServiceProgress() {
  const mount = document.getElementById('svc-progress-mount');
  if (!mount) return;
  const v = STATE.vehicle;
  if (!v) { mount.innerHTML = ''; return; }

  const lastKm     = parseInt(v.calcLastServiceKm || v.lastServiceKm, 10) || 0;
  const nextKm     = parseInt(v.calcNextServiceKm || v.nextServiceKm, 10) || 0;
  const reportedKm = parseInt(v.currentKm, 10) || 0;   // דיווח אחרון של נהג
  const estKm      = parseInt(v.estKm, 10) || reportedKm; // אומדן אלגוריתם

  if (!nextKm || !lastKm || nextKm <= lastKm) { mount.innerHTML = ''; return; }

  const totalSpan  = nextKm - lastKm;
  const remaining  = nextKm - estKm;  // נשאר לפי אומדן
  let reportedPct  = Math.min(100, Math.max(0, Math.round(((reportedKm - lastKm) / totalSpan) * 100)));
  let estPct       = Math.min(100, Math.max(0, Math.round(((estKm     - lastKm) / totalSpan) * 100)));

  let level, label, footTxt, footCls;
  if (remaining < 0) {
    level = 'red';  label = 'עבר מועד';  reportedPct = 100;  estPct = 100;
    footTxt = 'עבר ב-' + Math.abs(remaining).toLocaleString('he') + ' ק"מ';
    footCls = 'red';
  } else if (remaining < 500) {
    level = 'red';  label = 'דחוף';
    footTxt = 'נותרו ' + remaining.toLocaleString('he') + ' ק"מ לטיפול';
    footCls = 'red';
  } else if (remaining < 1500) {
    level = 'warn';  label = 'מתקרב';
    footTxt = 'נותרו ' + remaining.toLocaleString('he') + ' ק"מ לטיפול';
    footCls = 'warn';
  } else {
    level = 'ok';  label = 'תקין';
    footTxt = 'נותרו ' + remaining.toLocaleString('he') + ' ק"מ לטיפול';
    footCls = 'ok';
  }

  // tick position: bar fills RTL (right=start), so tick left = (100 - estPct)%
  const tickLeft = (100 - estPct);
  const showTick = estKm > reportedKm && estPct > reportedPct && estPct < 100;

  mount.innerHTML =
    '<div class="svc-card">' +
      '<div class="svc-hdr">' +
        '<div class="svc-title-wrap">' +
          '<div class="svc-icn"><svg width="18" height="18"><use href="#ic-tool" color="#1F8A3D"/></svg></div>' +
          '<div class="svc-title">טיפול הבא</div>' +
        '</div>' +
        '<div class="svc-pill ' + level + '">' + label + '</div>' +
      '</div>' +
      '<div class="svc-stats">' +
        '<div class="svc-stat">' +
          '<div class="svc-stat-lbl">ק"מ אחרון</div>' +
          '<div class="svc-stat-val">' + reportedKm.toLocaleString('he') + '<span class="unit">ק"מ</span></div>' +
        '</div>' +
        '<div class="svc-stat right">' +
          '<div class="svc-stat-lbl">טיפול הבא</div>' +
          '<div class="svc-stat-val">' + nextKm.toLocaleString('he') + '<span class="unit">ק"מ</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="svc-bar-wrap' + (showTick ? ' with-marker' : '') + '">' +
        '<div class="svc-bar-bg">' +
          '<div class="svc-bar-fill ' + level + '" style="width:' + reportedPct + '%">' +
            '<div class="svc-bar-shine"></div>' +
          '</div>' +
        '</div>' +
        (showTick ? '<div class="svc-bar-marker" style="left:' + tickLeft + '%"><div class="tri"></div><div class="stem"></div><div class="est-lbl">~' + estKm.toLocaleString('he') + '</div></div>' : '') +
      '</div>' +
      '<div class="svc-foot">' +
        '<div class="svc-foot-txt">' + footTxt + '</div>' +
        '<div class="svc-foot-val ' + footCls + '">' + estPct + '%</div>' +
      '</div>' +
    '</div>';
}

function normalizePhone(p) {
  if (!p) return '';
  return String(p).replace(/\D/g, '');
}

function phoneToWa(p) {
  var d = normalizePhone(p);
  if (!d) return '';
  if (d.charAt(0) === '0') d = '972' + d.substring(1);
  else if (d.indexOf('972') !== 0) d = '972' + d;
  return d;
}

function renderGarageTab() {
  const v = STATE.vehicle || {};
  const g = v.garage;
  if (!g || (!g.name && !g.address && !g.phone && !g.contactPhone && !g.bookingUrl)) {
    return '<div class="gar-empty"><div class="gar-empty-ic">🔧</div>טרם שויך מוסך לרכב.<br>פנה למנהל הצי לקבלת פרטים.</div>';
  }

  let rows = '';

  if (g.address) {
    const wazeUrl = 'https://waze.com/ul?q=' + encodeURIComponent(g.address) + '&navigate=yes';
    rows +=
      '<div class="gar-row">' +
        '<div class="gar-row-icn"><svg width="18" height="18"><use href="#ic-pin" color="#1F8A3D"/></svg></div>' +
        '<div class="gar-row-body">' +
          '<div class="gar-row-lbl">כתובת</div>' +
          '<div class="gar-row-val">' + g.address + '</div>' +
        '</div>' +
        '<div class="gar-row-btns">' +
          '<a class="gar-mini-btn waze" href="' + wazeUrl + '" target="_blank" rel="noopener" title="נווט בוויז">' +
            '<svg width="20" height="20"><use href="#ic-waze" color="#fff"/></svg>' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  if (g.contactName || g.contactPhone) {
    const waBtn = g.contactPhone
      ? '<a class="gar-mini-btn wa" href="https://wa.me/' + phoneToWa(g.contactPhone) + '?text=' + encodeURIComponent('שלום, אני נהג של עמותת עלה ברכב ' + (v.num || '') + '. אשמח לעזרה.') + '" target="_blank" rel="noopener" title="WhatsApp">' +
          '<svg width="20" height="20"><use href="#ic-whatsapp" color="#fff"/></svg></a>'
      : '';
    const telBtn = g.contactPhone
      ? '<a class="gar-mini-btn tel" href="tel:' + normalizePhone(g.contactPhone) + '" title="חייג">' +
          '<svg width="18" height="18"><use href="#ic-phone" color="#fff"/></svg></a>'
      : '';
    rows +=
      '<div class="gar-row">' +
        '<div class="gar-row-icn"><svg width="18" height="18"><use href="#ic-user" color="#1F8A3D"/></svg></div>' +
        '<div class="gar-row-body">' +
          '<div class="gar-row-lbl">איש קשר</div>' +
          '<div class="gar-row-val">' + (g.contactName || '—') +
            (g.contactPhone ? ' <span style="font-size:12px;color:var(--t2);direction:ltr;display:inline-block">· ' + g.contactPhone + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="gar-row-btns">' + waBtn + telBtn + '</div>' +
      '</div>';
  }

  if (g.phone) {
    rows +=
      '<div class="gar-row">' +
        '<div class="gar-row-icn"><svg width="18" height="18"><use href="#ic-phone" color="#1F8A3D"/></svg></div>' +
        '<div class="gar-row-body">' +
          '<div class="gar-row-lbl">טלפון מוסך</div>' +
          '<div class="gar-row-val ltr">' + g.phone + '</div>' +
        '</div>' +
        '<div class="gar-row-btns">' +
          '<a class="gar-mini-btn tel" href="tel:' + normalizePhone(g.phone) + '" title="חייג">' +
            '<svg width="18" height="18"><use href="#ic-phone" color="#fff"/></svg></a>' +
        '</div>' +
      '</div>';
  }

  let cta = '';
  if (g.bookingUrl) {
    cta +=
      '<a class="gar-cta-btn primary" href="' + g.bookingUrl + '" target="_blank" rel="noopener">' +
        '<svg width="17" height="17"><use href="#ic-cal-plus" color="#fff"/></svg>' +
        'קביעת תור אונליין' +
      '</a>';
  }
  if (g.address) {
    const wazeUrl = 'https://waze.com/ul?q=' + encodeURIComponent(g.address) + '&navigate=yes';
    cta +=
      '<a class="gar-cta-btn ghost" href="' + wazeUrl + '" target="_blank" rel="noopener">' +
        '<svg width="17" height="17"><use href="#ic-map" color="#fff"/></svg>' +
        'נווט' +
      '</a>';
  }

  return '<div class="gar-wrap">' +
    '<div class="gar-card">' +
      '<div class="gar-head">' +
        '<div class="gar-logo"><svg width="28" height="28"><use href="#ic-tool" color="#1F8A3D"/></svg></div>' +
        '<div>' +
          '<div class="gar-name">' + (g.name || 'המוסך שלך') + '</div>' +
          '<div class="gar-tag">המוסך המשויך לרכב</div>' +
        '</div>' +
      '</div>' +
      rows +
      (cta ? '<div class="gar-cta">' + cta + '</div>' : '') +
    '</div>' +
  '</div>';
}

function renderAlerts() {
  const container = document.getElementById('alerts-content');
  const empty = document.getElementById('alerts-empty');
  document.getElementById('alerts-count').textContent = STATE.alerts.length + ' התראות';

  if (STATE.alerts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const cats = [
    { key: 'red',  label: 'דחוף' },
    { key: 'warn', label: 'להתייחסות' },
    { key: 'ok',   label: 'פעולות שבוצעו' }
  ];

  let html = '';
  cats.forEach(function(cat) {
    const items = STATE.alerts.filter(function(a) { return a.type === cat.key; });
    if (!items.length) return;
    html += '<div class="ssec"><div class="ss-lbl">' + cat.label + '</div><div class="ss-count">' + items.length + '</div></div>';
    items.forEach(function(a, i) {
      html += '<div class="alert-card ' + a.type + '" style="animation-delay:' + (i * 0.06) + 's">';
      html += '<div class="ac-row">';
      html += '<div><div class="ac-title">' + a.title + '</div><div class="ac-sub">' + a.sub + '</div></div>';
      if (a.type === 'red') {
        html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">';
        html += '<span class="pill red">' + a.label + '</span>';
        html += '<div class="ping-wrap"><div class="ping-dot"></div><div class="ping-ring"></div></div>';
        html += '</div>';
      } else {
        html += '<span class="pill ' + a.type + '">' + a.label + '</span>';
      }
      html += '</div>';
      if (a.days !== null) {
        html += '<div class="ac-date ' + a.type + '">' + a.days + ' ימים</div>';
      }
      html += '</div>';
    });
  });
  container.innerHTML = html;
}

function renderHistory() {
  const tl = document.getElementById('history-timeline');
  if (!STATE.history.length) {
    tl.innerHTML = '<div class="empty">אין היסטוריית טיפולים</div>';
    return;
  }
  tl.innerHTML = STATE.history.map(function(h, i) {
    const isFirst = i === 0;
    const isLast = i === STATE.history.length - 1;
    return '<div class="tl-row">' +
      '<div class="tl-left">' +
        '<div class="tl-dot ' + (isFirst ? 'red' : 'gray') + '"></div>' +
        (!isLast ? '<div class="tl-line-v"></div>' : '') +
      '</div>' +
      '<div class="tl-card" style="animation-delay:' + (i * 0.07) + 's">' +
        '<div class="tc-date">' + (isFirst ? '<div class="tc-red-dot"></div>' : '') + formatDate(h.date) + '</div>' +
        '<div class="tc-divider"></div>' +
        (h.garage ? '<div class="tc-row"><div class="tc-lbl">מוסך:</div><div>' + h.garage + '</div></div>' : '') +
        (h.city   ? '<div class="tc-row"><div class="tc-lbl">עיר:</div><div>' + h.city + '</div></div>' : '') +
        (h.km     ? '<div class="tc-row"><div class="tc-lbl">ק"מ:</div><div>' + Number(h.km).toLocaleString('he') + '</div></div>' : '') +
        (h.type   ? '<div class="tc-tag">' + h.type + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function techItem(icon, label, val, delay) {
  if (!val && val !== 0) return '';
  return '<div class="tspec-item" style="animation-delay:' + (delay||0) + 's">' +
    '<div class="tspec-icon"><svg width="18" height="18"><use href="#' + icon + '" color="#1F8A3D"/></svg></div>' +
    '<div class="tspec-val">' + val + '</div>' +
    '<div class="tspec-lbl">' + label + '</div>' +
  '</div>';
}

function techBool(icon, label, val) {
  var on = val === 1 || val === '1' || val === true;
  return '<div class="tspec-bool' + (on ? ' on' : '') + '">' +
    '<svg width="14" height="14"><use href="#' + icon + '" color="' + (on ? '#30D158' : '#3a3a3c') + '"/></svg>' +
    '<span>' + label + '</span>' +
  '</div>';
}

function techCat(title, html) {
  if (!html || !html.trim()) return '';
  return '<div class="tspec-cat">' +
    '<div class="tspec-cat-title">' + title + '</div>' +
    html +
  '</div>';
}

function renderGovSection() {
  var veh = STATE.vehicle || {};

  if (STATE.govLoading || STATE.govData === undefined) {
    return '<div class="tech-section">' +
      '<div class="tech-sec-hdr"><span class="tech-sec-title">פרטים טכניים</span>' +
      '<span class="tech-sec-badge">טוען...</span></div>' +
      '<div class="tspec-skel">' +
        [1,2,3,4,5,6,7,8].map(function() {
          return '<div class="tspec-skel-item"><div class="sk-line" style="width:36px;height:36px;border-radius:12px;margin-bottom:8px"></div>' +
                 '<div class="sk-line" style="width:50px;height:10px;margin-bottom:6px"></div>' +
                 '<div class="sk-line" style="width:38px;height:8px"></div></div>';
        }).join('') +
      '</div></div>';
  }

  // אם gov נכשל — הסתר
  if (!STATE.govData) return '';

  var g = STATE.govData  || {};
  var w = STATE.govWLTP  || {};

  // ── מנוע ──
  var engine =
    techItem('ic-cylinder', 'נפח מנוע',   w.nefah_manoa  ? Number(w.nefah_manoa).toLocaleString('he') + ' סמ"ק' : null, 0.04) +
    techItem('ic-power',    'הספק',        w.koah_sus     ? w.koah_sus + ' כ"ס'   : null, 0.06) +
    techItem('ic-fuel',     'סוג דלק',     w.delek_nm || g.sug_delek_nm || null, 0.08) +
    techItem('ic-drive',    'הנעה',        w.hanaa_nm && w.hanaa_nm !== 'לא ידוע קוד' ? w.hanaa_nm : null, 0.10) +
    techItem('ic-gear',     'תיבת הילוכים', w.automatic_ind === 1 ? 'אוטומטית' : (w.automatic_ind === 0 ? 'ידנית' : null), 0.12) +
    techItem('ic-engine',   'דגם מנוע',    g.degem_manoa || null, 0.14);

  // ── מרכב ──
  var body =
    techItem('ic-car',      'סוג רכב',    w.merkav          || null, 0.04) +
    techItem('ic-door',     'דלתות',      w.mispar_dlatot   || null, 0.06) +
    techItem('ic-seat',     'מושבים',     w.mispar_moshavim || null, 0.08) +
    techItem('ic-weight',   'משקל כולל',  w.mishkal_kolel ? Number(w.mishkal_kolel).toLocaleString('he') + ' ק"ג' : null, 0.10) +
    techItem('ic-hook',     'כושר גרירה', w.kosher_grira_im_blamim ? Number(w.kosher_grira_im_blamim).toLocaleString('he') + ' ק"ג' : null, 0.12) +
    techItem('ic-wheel',    'צמיג קדמי',  g.zmig_kidmi      || null, 0.15) +
    techItem('ic-wheel',    'צמיג אחורי', g.zmig_ahori      || null, 0.16) +
    techItem('ic-tag',      'רמת גימור',  w.ramat_gimur     || g.ramat_gimur || null, 0.18);

  // ── בטיחות — תכונות בוליאניות ──
  var safetyGrid =
    techItem('ic-airbag',   'כריות אוויר', w.mispar_kariot_avir ? w.mispar_kariot_avir + ' כריות' : null, 0.04) +
    techItem('ic-star',     'ציון בטיחות', w.nikud_betihut ? '★ ' + w.nikud_betihut : null, 0.06);

  var safetyBools =
    techBool('ic-check', 'ABS',              w.abs_ind) +
    techBool('ic-check', 'הגה כוח',          w.hege_koah_ind) +
    techBool('ic-check', 'מצלמת אחורה',     w.matzlemat_reverse_ind) +
    techBool('ic-check', 'בקרת יציבות',      w.bakarat_yatzivut_ind) +
    techBool('ic-check', 'חיישני עייפות',    w.zihuy_matzav_hitkarvut_mesukenet_ind) +
    techBool('ic-check', 'בלימת חירום',       w.teura_automatit_benesiya_kadima_ind) +
    techBool('ic-check', 'שמירת נתיב',       w.bakarat_stiya_menativ_ind) +
    techBool('ic-check', 'חיישני חניה',      w.nitur_merhak_milfanim_ind) +
    techBool('ic-check', 'זיהוי הולכי רגל',  w.zihuy_holchey_regel_ind) +
    techBool('ic-check', 'מזגן',             w.mazgan_ind) +
    techBool('ic-check', 'חלונות חשמל',      w.mispar_halonot_hashmal);

  var safety = safetyGrid +
    (safetyBools.trim() ? '<div class="tspec-bools">' + safetyBools + '</div>' : '');

  // ── סביבה ──
  var env =
    techItem('ic-cloud',  'פליטת CO₂ (WLTP)', w.CO2_WLTP ? w.CO2_WLTP + ' גר\'/ק"מ' : null, 0.04) +
    techItem('ic-leaf',   'מדד ירוק',           w.madad_yarok || null, 0.06) +
    techItem('ic-leaf',   'קבוצת זיהום',        w.kvutzat_zihum || g.kvutzat_zihum || null, 0.08) +
    techItem('ic-filter', 'סוג ממיר',            w.sug_mamir_nm || null, 0.10);

  var html =
    techCat('🔧 מנוע',    '<div class="tspec-grid">' + engine  + '</div>') +
    techCat('🚗 מרכב',    '<div class="tspec-grid">' + body    + '</div>') +
    techCat('🛡️ בטיחות',  safety) +
    techCat('🌿 סביבה',   '<div class="tspec-grid">' + env     + '</div>');

  if (!html.trim()) return '';

  return '<div class="tech-section">' +
    '<div class="tech-sec-hdr">' +
      '<span class="tech-sec-title">פרטים טכניים</span>' +
      '<span class="tech-sec-badge">משרד התחבורה</span>' +
    '</div>' +
    html +
    '<div style="height:8px"></div>' +
  '</div>';
}

function renderVehicleScreen(tab) {
  const v = STATE.vehicle;
  if (!v) return;

  document.getElementById('veh-title').textContent = ((v.make || '') + ' ' + (v.model || '')).trim();
  document.getElementById('veh-sub').textContent = v.num || '';

  document.querySelectorAll('#veh-tabs .tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  const content = document.getElementById('veh-content');

  if (tab === 'info') {
    const fields = [
      { icon:'ic-cal',    label:'טסט הבא',       val: formatDate(v.testDue),    warn: daysLeftWarn(v.testDue, 20) },
      { icon:'ic-shield', label:'ביטוח חובה',     val: formatDate(v.insCompExp), warn: daysLeftWarn(v.insCompExp, 30) },
      { icon:'ic-file',   label:'רישיון רכב',     val: formatDate(v.licExp),     warn: daysLeftWarn(v.licExp, 30) },
      { icon:'ic-gauge',  label:'ק"מ אחרון',      val: v.lastServiceKm ? Number(v.lastServiceKm).toLocaleString('he') : '—', warn: false },
      { icon:'ic-tool',   label:'טיפול הבא',      val: v.nextServiceKm ? Number(v.nextServiceKm).toLocaleString('he') + ' ק"מ' : '—', warn: false },
      { icon:'ic-shield', label:'ביטוח מקיף',     val: formatDate(v.insFullExp), warn: daysLeftWarn(v.insFullExp, 30) },
      { icon:'ic-car',    label:'צבע',            val: v.color || '—',           warn: false },
      { icon:'ic-cal',    label:'שנת יצור',       val: v.year  || '—',           warn: false }
    ];
    content.innerHTML = '<div class="igrid">' + fields.map(function(f, i) {
      return '<div class="ig-card" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="ig-icon"><svg width="20" height="20"><use href="#' + f.icon + '" color="#1F8A3D"/></svg></div>' +
        '<div class="ig-lbl">' + f.label + '</div>' +
        '<div class="ig-val' + (f.warn ? ' warn' : '') + '">' + f.val + '</div>' +
      '</div>';
    }).join('') + '</div>' + renderGovSection();

  } else if (tab === 'docs') {
    if (!STATE.documents.length) {
      content.innerHTML = '<div class="empty">אין מסמכים</div>';
    } else {
      content.innerHTML = STATE.documents.map(function(d, i) {
        const warn = daysLeftWarn(d.date, 30);
        const safeLink  = (d.link  || '').replace(/'/g, "\\'");
        const safeTitle = (d.type || 'מסמך').replace(/'/g, "\\'");
        const onclick   = 'viewDoc(\'' + safeLink + '\',\'' + safeTitle + '\')';
        return '<div class="doc-row" style="animation-delay:' + (i * 0.05) + 's" onclick="' + onclick + '">' +
          '<div class="dr-icon-wrap"><svg width="20" height="20"><use href="#ic-file" color="#1F8A3D"/></svg></div>' +
          '<div class="dr-body">' +
            '<div class="dr-title">' + (d.type || 'מסמך') + '</div>' +
            '<div class="dr-sub' + (warn ? ' warn' : '') + '">' + formatDate(d.date) + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">' +
            '<span style="font-size:11px;font-weight:600;color:' + (d.link ? '#30D158' : '#6e6e73') + '">' + (d.link ? 'פתח' : 'אין קישור') + '</span>' +
            '<svg width="14" height="14" fill="none" stroke="' + (d.link ? '#30D158' : '#4e4e53') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
          '</div>' +
        '</div>';
      }).join('');
    }

  } else if (tab === 'insurance') {
    if (!STATE.insurance.length) {
      content.innerHTML = '<div class="empty">אין נתוני ביטוח</div>';
    } else {
      content.innerHTML = STATE.insurance.map(function(ins, i) {
        return '<div class="doc-row" style="animation-delay:' + (i * 0.05) + 's">' +
          '<div class="dr-icon-wrap"><svg width="20" height="20"><use href="#ic-shield" color="#1F8A3D"/></svg></div>' +
          '<div class="dr-body">' +
            '<div class="dr-title">ביטוח ' + (ins.year || '') + ' — ' + (ins.company || '') + '</div>' +
            '<div class="dr-sub">חובה: ₪' + Number(ins.compCost || 0).toLocaleString('he') + ' | מקיף: ₪' + Number(ins.fullCost || 0).toLocaleString('he') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

  } else if (tab === 'history') {
    renderHistory();
    const histEl = document.getElementById('history-timeline');
    content.innerHTML = '<div class="timeline">' + (histEl ? histEl.innerHTML : '') + '</div>';

  } else if (tab === 'garage') {
    content.innerHTML = renderGarageTab();
  }
}

function renderService() {
  // km display lives in the modal now; nothing else to render here
}

/* ══ Navigation ══ */
const APP = {
  nav: function(screen) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    const el = document.getElementById('screen-' + screen);
    if (el) el.classList.add('active');

    ['home','vehicle','alerts','history','service'].forEach(function(s) {
      const btn = document.getElementById('bn-' + s);
      if (btn) btn.classList.toggle('active', s === screen);
    });

    STATE.currentScreen = screen;
    // help-fab is always visible

    if (screen === 'vehicle') renderVehicleScreen(STATE.currentTab);
  },

  switchTab: function(tab) {
    STATE.currentTab = tab;
    renderVehicleScreen(tab);
  },

  openKmModal: function() {
    const v = STATE.vehicle || {};
    const prev = v.currentKm
      ? Number(v.currentKm).toLocaleString('he') + ' ק"מ'
      : (v.lastServiceKm ? Number(v.lastServiceKm).toLocaleString('he') + ' ק"מ' : '—');
    document.getElementById('km-modal-prev').textContent = 'ק"מ אחרון: ' + prev;
    const inp = document.getElementById('km-modal-input');
    inp.value = '';
    // reset to form state
    document.getElementById('km-modal-form').classList.remove('hidden');
    document.getElementById('km-modal-success').classList.add('hidden');
    document.getElementById('km-modal-submit').disabled = false;
    document.getElementById('km-modal-btn-text').textContent = 'עדכן ק"מ';
    document.getElementById('km-modal-spinner').classList.add('hidden');
    document.getElementById('km-modal-error').classList.add('hidden');
    inp.style.borderColor = '';
    inp.oninput = function() {
      document.getElementById('km-modal-error').classList.add('hidden');
      inp.style.borderColor = '';
    };
    document.getElementById('km-modal').classList.remove('hidden');
    setTimeout(function() { inp.focus(); }, 120);
  },

  closeKmModal: function() {
    var overlay = document.getElementById('km-modal');
    overlay.classList.add('closing');
    setTimeout(function() {
      overlay.classList.add('hidden');
      overlay.classList.remove('closing');
    }, 560);
  },

  submitKm: async function() {
    const val = document.getElementById('km-modal-input').value;
    const km = parseInt(val, 10);
    const v = STATE.vehicle || {};
    const knownKm = Math.max(
      parseInt(v.currentKm, 10) || 0,
      parseInt(v.lastServiceKm, 10) || 0
    );
    function kmErr(msg) {
      var el = document.getElementById('km-modal-error');
      el.textContent = msg;
      el.classList.remove('hidden');
      document.getElementById('km-modal-input').style.borderColor = 'rgba(255,59,48,0.6)';
    }
    function kmErrClear() {
      document.getElementById('km-modal-error').classList.add('hidden');
      document.getElementById('km-modal-input').style.borderColor = '';
    }
    kmErrClear();
    if (!km || isNaN(km) || km <= 0) { kmErr('יש להזין מספר חיובי'); return; }
    if (km > 2000000) { kmErr('ערך גבוה מדי'); return; }
    if (knownKm > 0 && km < knownKm) {
      kmErr('לא ניתן להזין ק"מ נמוך מהדיווח האחרון — ' + knownKm.toLocaleString('he') + ' ק"מ');
      return;
    }
    if (knownKm > 0 && km === knownKm) {
      kmErr('ק"מ זה כבר דווח — הזן ערך חדש');
      return;
    }
    if (knownKm > 0 && km > knownKm + 80000) {
      kmErr('קפיצה לא סבירה — מעל 80,000 ק"מ מהדיווח האחרון');
      return;
    }
    const btn = document.getElementById('km-modal-submit');
    btn.disabled = true;
    document.getElementById('km-modal-btn-text').textContent = 'שולח...';
    document.getElementById('km-modal-spinner').classList.remove('hidden');
    try {
      await gasPost('driver_update_km', { km: km });
      if (STATE.vehicle) {
        STATE.vehicle.lastServiceKm = km;
        STATE.vehicle.currentKm = km;
      }
      renderService();
      renderServiceProgress();
      // show success state
      document.getElementById('km-success-val').textContent = km.toLocaleString('he') + ' ק"מ';
      document.getElementById('km-modal-form').classList.add('hidden');
      document.getElementById('km-modal-success').classList.remove('hidden');
      setTimeout(function() { APP.closeKmModal(); }, 4200);
    } catch(e) {
      btn.disabled = false;
      document.getElementById('km-modal-btn-text').textContent = 'עדכן ק"מ';
      document.getElementById('km-modal-spinner').classList.add('hidden');
      var errEl = document.getElementById('km-modal-error');
      errEl.textContent = 'שגיאה: ' + e.message;
      errEl.classList.remove('hidden');
    }
  },

  updateKm: async function() {
    // legacy — redirect to modal
    APP.openKmModal();
  },

  reportFault: async function() {
    const desc = document.getElementById('fault-text').value.trim();
    if (!desc) { showToast('תאר את התקלה'); return; }
    showLoader();
    try {
      await gasPost('driver_report_fault', { description: desc });
      document.getElementById('fault-text').value = '';
      showToast('דיווח נשלח בהצלחה ✓');
    } catch(e) {
      showToast('שגיאה: ' + e.message);
    } finally {
      hideLoader();
    }
  }
};

/* ══════════════════════════════════════════════════════════════
   Help Menu
══════════════════════════════════════════════════════════════ */
APP.openHelpMenu = async function() {
  if (!STATE.vehicle) { showToast('יש להתחבר תחילה'); return; }
  if (STATE.helpMenuOpen) { APP.closeHelpMenu(); return; }
  STATE.helpMenuOpen = true;
  STATE.helpGps = null;
  _getGps(8000).then(function(gps) { STATE.helpGps = gps; });
  var overlay = document.getElementById('help-overlay');
  var menu    = document.getElementById('help-menu');
  var fab     = document.getElementById('help-fab');
  if (overlay) overlay.classList.add('open');
  if (menu)    menu.classList.add('open');
  if (fab)     fab.classList.add('open');
  var items = document.querySelectorAll('.help-item:not(.help-item-soon)');
  items.forEach(function(el, i) {
    setTimeout(function() { el.classList.add('anim-in'); }, 60 + i * 60);
  });
};

APP.closeHelpMenu = function() {
  STATE.helpMenuOpen = false;
  var overlay = document.getElementById('help-overlay');
  var menu    = document.getElementById('help-menu');
  var fab     = document.getElementById('help-fab');
  if (overlay) overlay.classList.remove('open');
  if (menu)    menu.classList.remove('open');
  if (fab)     fab.classList.remove('open');
  setTimeout(function() {
    document.querySelectorAll('.help-item:not(.help-item-soon)').forEach(function(el) { el.classList.remove('anim-in'); });
    var wrap  = document.getElementById('help-card-wrap');
    var items = document.getElementById('help-menu-items');
    if (wrap)  { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    if (items) items.style.display = '';
  }, 350);
};

function _showHelpCard(html) {
  var wrap  = document.getElementById('help-card-wrap');
  var items = document.getElementById('help-menu-items');
  if (items) items.style.display = 'none';
  if (wrap)  { wrap.style.display = ''; wrap.innerHTML = html; }
}

APP._helpBackToMenu = function() {
  var wrap  = document.getElementById('help-card-wrap');
  var items = document.getElementById('help-menu-items');
  if (wrap)  { wrap.style.display = 'none'; wrap.innerHTML = ''; }
  if (items) { items.style.display = ''; }
  document.querySelectorAll('.help-item:not(.help-item-soon)').forEach(function(el, i) {
    el.classList.remove('anim-in');
    setTimeout(function() { el.classList.add('anim-in'); }, 40 + i * 50);
  });
};

/* ── פנצ'ר ── */
APP.helpPuncture = async function() {
  _fireFieldEvent('puncture', {});
  var gps = STATE.helpGps;
  var mapsUrl = (gps && gps.lat)
    ? 'https://www.google.com/maps/search/%D7%A4%D7%A0%D7%A6%D7%A8%D7%99%D7%94+24+%D7%A9%D7%A2%D7%95%D7%AA/@' + gps.lat + ',' + gps.lng + ',15z'
    : 'https://www.google.com/maps/search/%D7%A4%D7%A0%D7%A6%D7%A8%D7%99%D7%94+24+%D7%A9%D7%A2%D7%95%D7%AA';

  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-spinner">&#x27F3; טוען ספק שירות...</div>' +
    '</div>'
  );

  var providerHtml = '';
  try {
    var res = await gasPost('get_service_providers', { category: 'puncture' });
    if (res.ok && res.providers && res.providers.length > 0) {
      var p = res.providers[0];
      var phoneClean = (p.phone || '').replace(/[^0-9*+]/g, '');
      var waNum = phoneClean.startsWith('+') ? phoneClean.replace('+','') : ('972' + phoneClean.replace(/^0/,''));
      var waText = encodeURIComponent('שלום, אני נהג עמותת עלה וצריך עזרה עם פנצ\'ר.' + (gps && gps.lat ? ' מיקום: https://maps.google.com/?q=' + gps.lat + ',' + gps.lng : ''));

      /* סטטוס פתיחה */
      var isOpen = null;
      if (p.googlePlaceId) {
        try {
          var sr = await gasPost('get_place_status', { placeId: p.googlePlaceId });
          if (sr && sr.ok !== undefined) isOpen = sr.isOpen;
        } catch(e2) {}
      }
      var statusHtml = '';
      if (isOpen === true)  statusHtml = '<div class="pc-status-open">&#x2705; פתוח כרגע</div>';
      if (isOpen === false) statusHtml = '<div class="pc-status-closed">&#x26A0;&#xFE0F; סגור כרגע</div>';

      /* שעות פתיחה */
      var hoursHtml = '';
      if (p.openingHours && p.openingHours.trim()) {
        var dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        var todayName = dayNames[new Date().getDay()];
        var lines = p.openingHours.split('\n').filter(function(l){ return l.trim(); });
        hoursHtml = '<div class="prov-hours-wrap">';
        lines.forEach(function(line) {
          var isToday = line.indexOf(todayName) !== -1;
          hoursHtml += '<div class="prov-hours-row' + (isToday ? ' prov-hours-today' : '') + '">' +
            line.replace(/</g,'&lt;') + '</div>';
        });
        hoursHtml += '</div>';
      }

      var cleanAddr = p.address ? p.address.replace(/,?\s*\d[A-Z0-9]{3}\+[A-Z0-9]{2,}\s*/g,'').trim().replace(/,\s*$/,'') : '';
      var wazUrl = cleanAddr ? 'https://waze.com/ul?q=' + encodeURIComponent(cleanAddr) + '&navigate=yes' : '';
      var isMobile = /^0(5|7)\d/.test((p.phone||'').replace(/\D/g,'').replace(/^972/,'0'));
      /* WA — ללא מיקום, ללא apostrophe בתוך onclick */
      var waMsg = encodeURIComponent('שלום, אני נהג עמותת עלה וצריך עזרה בנושא פנצר.');
      window._pcWaNum = isMobile ? waNum : '';
      window._pcWaMsg = isMobile ? waMsg : '';

      providerHtml =
        '<div class="pc-badge">🏷️ ספק מורשה — עמותת עלה</div>' +
        '<div class="pc-card">' +
          '<div class="pc-header">' +
            '<div class="pc-icon-wrap">🔧</div>' +
            '<div class="pc-name-wrap">' +
              '<div class="pc-name">' + (p.name||'') + '</div>' +
              (p.contactName ? '<div class="pc-contact">'+p.contactName+'</div>' : '') +
            '</div>' +
          '</div>' +
          (statusHtml ? '<div class="pc-status-row">'+statusHtml+'</div>' : '') +
          (cleanAddr ?
            '<div class="pc-addr-row">' +
              '<span class="pc-addr-text">📍 '+cleanAddr+'</span>' +
              (wazUrl ? '<a href="'+wazUrl+'" target="_blank" class="pc-waze-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M19.07 4.93a10 10 0 0 0-16.28 11 1.06 1.06 0 0 1 .09.82l-.8 2.9a1 1 0 0 0 1.24 1.24l2.9-.8a1.05 1.05 0 0 1 .81.1 10 10 0 0 0 12.04-15.26zm-5.2 13.07a1.08 1.08 0 1 1 1.08-1.07 1.08 1.08 0 0 1-1.08 1.07zm1.4-5.14a1.25 1.25 0 0 1-1.25 1h-.15a1.25 1.25 0 0 1-1.1-1.37l.36-3.82a1.11 1.11 0 1 1 2.2.21zm-5.5 5.14a1.08 1.08 0 1 1 1.08-1.07 1.08 1.08 0 0 1-1.05 1.07zm1.4-5.14a1.25 1.25 0 0 1-1.25 1h-.15A1.25 1.25 0 0 1 9.67 12l.36-3.82a1.11 1.11 0 1 1 2.2.21z"/></svg> Waze</a>' : '') +
            '</div>' : '') +
          (hoursHtml ?
            '<details class="pc-hours-toggle"><summary>🕐 שעות פתיחה</summary>'+hoursHtml+'</details>'
            : '') +
          '<div class="pc-btns">' +
            (phoneClean ?
              '<button class="pc-btn-call" onclick="window.open(\'tel:'+phoneClean+'\')">'+
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
                ' חייג — ' + (p.phone||'') +
              '</button>'
            : '') +
            (isMobile ?
              '<button class="pc-btn-wa" onclick="window.open(\'https://wa.me/\'+window._pcWaNum+(window._pcWaMsg?\'?text=\'+window._pcWaMsg:\'\'),\'_blank\')">'+
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
                ' וואטסאפ' +
              '</button>'
            : '') +
          '</div>' +
        '</div>';
    }
  } catch(e) { /* ספק לא נטען */ }

  var emergencyHtml = '';
  if (isOpen === false && providerHtml) {
    emergencyHtml =
      '<div class="pc-emergency">' +
        '<div class="pc-emergency-title">⚠️ ספק השירות המורשה סגור כעת</div>' +
        '<div class="pc-emergency-body">במידה ומדובר במקרה חירום שאינו יכול להידחות לשעות הפעילות של ספק השירות בהסדר — ניתן לאתר שירות פנצריות זמין באזורך.</div>' +
        '<button class="pc-btn-search" onclick="window.open(\''+mapsUrl+'\')">🔍 חיפוש פנצריות פתוחות 24/7 קרוב אליי</button>' +
      '</div>';
  }

  _showHelpCard(
    '<style>' +
    '@keyframes blink-warn{0%,100%{opacity:1}50%{opacity:.45}}' +
    '@keyframes fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '.pc-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;padding:5px 16px;border-radius:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(37,99,235,.35)}' +
    '.pc-card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);animation:fade-in .35s ease}' +
    '.pc-header{display:flex;align-items:center;gap:14px;padding:18px 18px 14px;background:linear-gradient(135deg,#0f2942,#1e3a5f)}' +
    '.pc-icon-wrap{width:48px;height:48px;background:rgba(255,255,255,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}' +
    '.pc-name{font-size:20px;font-weight:800;color:#fff;line-height:1.2}' +
    '.pc-contact{font-size:12px;color:#93c5fd;margin-top:3px}' +
    '.pc-status-row{padding:10px 18px 0}' +
    '.pc-status-open{display:inline-flex;align-items:center;gap:6px;background:#dcfce7;color:#15803d;font-size:13px;font-weight:800;padding:5px 16px;border-radius:20px}' +
    '.pc-status-closed{display:inline-flex;align-items:center;gap:6px;background:#fff3cd;color:#b45309;font-size:13px;font-weight:800;padding:5px 16px;border-radius:20px;animation:blink-warn 1.4s ease-in-out infinite}' +
    '.pc-addr-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px;border-bottom:1px solid #f1f5f9}' +
    '.pc-addr-text{font-size:13px;color:#475569;flex:1;line-height:1.4}' +
    '.pc-waze-btn{display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,#06aed4,#0891b2);color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:12px;text-decoration:none;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px rgba(6,174,212,.4)}' +
    '.pc-hours-toggle{padding:10px 18px;border-bottom:1px solid #f1f5f9}' +
    '.pc-hours-toggle summary{font-size:13px;color:#2563eb;font-weight:700;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}' +
    '.prov-hours-wrap{background:#f8fafc;border-radius:10px;padding:10px 12px;margin-top:8px}' +
    '.prov-hours-row{font-size:12px;color:#64748b;padding:4px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between}' +
    '.prov-hours-row:last-child{border:none}' +
    '.prov-hours-today{font-weight:800;color:#1e3a5f;background:#eff6ff;padding:4px 8px;border-radius:8px;margin:2px -4px}' +
    '.pc-btns{display:flex;flex-direction:column;gap:10px;padding:14px 18px 18px}' +
    '.pc-btn-call{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:17px;font-weight:800;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 16px rgba(22,163,74,.4);transition:transform .15s,box-shadow .15s}' +
    '.pc-btn-call:active{transform:scale(.97)}' +
    '.pc-btn-wa{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:linear-gradient(135deg,#25D366,#1da851);color:#fff;font-size:16px;font-weight:700;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 16px rgba(37,211,102,.35);transition:transform .15s}' +
    '.pc-btn-wa:active{transform:scale(.97)}' +
    '.pc-emergency{margin-top:14px;background:linear-gradient(135deg,#fffbeb,#fef9c3);border:2px solid #fcd34d;border-radius:18px;padding:16px 18px}' +
    '.pc-emergency-title{font-size:15px;font-weight:800;color:#92400e;margin-bottom:8px}' +
    '.pc-emergency-body{font-size:13px;color:#78350f;line-height:1.65;margin-bottom:12px}' +
    '.pc-btn-search{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:14px;font-weight:700;border:none;border-radius:12px;cursor:pointer;box-shadow:0 3px 12px rgba(245,158,11,.4)}' +
    '.pc-no-prov{text-align:center;padding:20px 0 10px;color:#64748b;font-size:14px}' +
    '</style>' +
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    (providerHtml || '<div class="pc-no-prov">לא הוגדר ספק מורשה במערכת</div>') +
    (emergencyHtml || (!providerHtml
      ? '<button class="pc-btn-search" style="margin-top:8px" onclick="window.open(\''+mapsUrl+'\')">🔍 חיפוש פנצריות פתוחות 24/7 קרוב אליי</button>'
      : '')
    ) +
    '</div>'
  );
};

/* ── מצבר / תקוע ── */
APP.helpBattery = function() {
  _fireFieldEvent('battery', { actionTaken: 'none', locationShared: false });
  window._yadWaMsg = encodeURIComponent('שלום, אני נהג עמותת עלה וצריך עזרה עם הרכב.');

  _showHelpCard(
    '<style>' +
    '@keyframes yd-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@keyframes yd-pulse{0%,100%{box-shadow:0 5px 20px rgba(21,128,61,.45)}60%{box-shadow:0 5px 28px rgba(21,128,61,.75)}}' +
    '.yd-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c2d12,#c2410c);color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;padding:5px 16px;border-radius:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(194,65,12,.4)}' +
    '.yd-card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.13);animation:yd-fade .35s ease}' +
    '.yd-header{background:linear-gradient(135deg,#7c2d12,#b91c1c,#dc2626);padding:20px 18px 18px;display:flex;align-items:center;gap:14px}' +
    '.yd-logo-wrap{width:58px;height:58px;flex-shrink:0;background:rgba(255,255,255,.15);border-radius:16px;display:flex;align-items:center;justify-content:center}' +
    '.yd-title-wrap{flex:1}' +
    '.yd-org-name{font-size:24px;font-weight:900;color:#fff;letter-spacing:-.4px;line-height:1.1}' +
    '.yd-org-sub{font-size:11px;color:rgba(255,255,255,.8);margin-top:4px;line-height:1.4}' +
    '.yd-services{display:flex;gap:5px;margin-top:9px;flex-wrap:wrap}' +
    '.yd-svc-tag{background:rgba(255,255,255,.2);color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:10px}' +
    '.yd-vol-notice{margin:14px 16px 0;background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #fed7aa;border-radius:14px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px}' +
    '.yd-vol-icon{font-size:22px;flex-shrink:0}' +
    '.yd-vol-text{font-size:12.5px;color:#7c2d12;font-weight:500;line-height:1.6}' +
    '.yd-vol-text strong{font-weight:800}' +
    '.yd-vol-free{display:inline-block;background:#dc2626;color:#fff;font-size:10px;font-weight:800;padding:2px 9px;border-radius:8px;margin-top:5px}' +
    '.yd-btns{display:flex;flex-direction:column;gap:10px;padding:14px 16px 18px}' +
    '.yd-btn-call{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:17px 14px;background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;font-size:18px;font-weight:900;border:none;border-radius:16px;cursor:pointer;animation:yd-pulse 2.2s ease-in-out infinite}' +
    '.yd-btn-call:active{transform:scale(.97);animation:none}' +
    '.yd-btn-call-inner{display:flex;flex-direction:column;align-items:flex-start}' +
    '.yd-btn-call-main{font-size:18px;font-weight:900;line-height:1.2}' +
    '.yd-btn-call-sub{font-size:11px;font-weight:500;opacity:.85;margin-top:2px}' +
    '.yd-btn-wa{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:linear-gradient(135deg,#25D366,#1da851);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:14px;cursor:pointer;box-shadow:0 3px 14px rgba(37,211,102,.3)}' +
    '.yd-btn-wa:active{transform:scale(.97)}' +
    '</style>' +
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="yd-badge">🛟 סיוע בדרכים</div>' +
    '<div class="yd-card">' +
      '<div class="yd-header">' +
        '<div class="yd-logo-wrap">' +
          /* Yadidim heart+hands logo */
          '<svg width="42" height="42" viewBox="0 0 42 42" fill="none">' +
            '<path d="M21 34C21 34 7 25.5 7 17C7 12.6 10.6 9 15 9C17.6 9 19.9 10.3 21 12.4C22.1 10.3 24.4 9 27 9C31.4 9 35 12.6 35 17C35 25.5 21 34 21 34Z" fill="white"/>' +
            '<path d="M10 38 C14 35 19 33.5 21 33.5 C23 33.5 28 35 32 38" stroke="white" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.65"/>' +
            '<circle cx="21" cy="17" r="3.5" fill="#dc2626"/>' +
          '</svg>' +
        '</div>' +
        '<div class="yd-title-wrap">' +
          '<div class="yd-org-name">ידידים</div>' +
          '<div class="yd-org-sub">ארגון מתנדבים לאומי לסיוע בדרכים</div>' +
          '<div class="yd-services">' +
            '<span class="yd-svc-tag">🔋 מצבר</span>' +
            '<span class="yd-svc-tag">🔧 פנצר</span>' +
            '<span class="yd-svc-tag">🚗 רכב תקוע</span>' +
            '<span class="yd-svc-tag">24/6</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="yd-vol-notice">' +
        '<div class="yd-vol-icon">🤝</div>' +
        '<div class="yd-vol-text">' +
          'שירות זה ניתן <strong>על בסיס התנדבותי בלבד</strong>. מתנדבי ידידים מגיעים לסייע ללא תשלום כלשהו — בהתאם לזמינות המתנדבים באזורך.' +
          '<br><span class="yd-vol-free">חינם לחלוטין</span>' +
        '</div>' +
      '</div>' +
      '<div class="yd-btns">' +
        '<button class="yd-btn-call" onclick="window.open(\'tel:1230\');APP._batteryCall()">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
          '<div class="yd-btn-call-inner">' +
            '<div class="yd-btn-call-main">📞 1230 — מוקד ידידים</div>' +
            '<div class="yd-btn-call-sub">שירות התנדבותי · חייג עכשיו</div>' +
          '</div>' +
        '</button>' +
        '<button class="yd-btn-wa" onclick="window.open(\'https://wa.me/972772021230?text=\'+window._yadWaMsg,\'_blank\')">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
          ' וואטסאפ — ידידים' +
        '</button>' +
      '</div>' +
    '</div>' +
    '</div>'
  );
};

APP._batteryCall = function() { _fireFieldEvent('battery', { actionTaken: 'call', locationShared: false }); };
APP._batteryWa   = function(url) {
  _fireFieldEvent('battery', { actionTaken: 'whatsapp', locationShared: !!(STATE.helpGps && STATE.helpGps.lat) });
  window.open(url, '_blank');
};

/* ── גרר ── */
APP.helpTowing = async function() {
  _fireFieldEvent('towing', { hasInsurance: null });
  _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-spinner">&#x27F3; טוען פרטי ביטוח...</div></div>');
  try {
    var res = await gasPost('get_vehicle_insurance_details', {});
    var ins = res.insurance;
    var garage = res.garage;
    if (!ins || !ins.hasComprehensive) {
      var mgrPhone = (STATE.vehicle && STATE.vehicle.fleetManagerPhone) ? STATE.vehicle.fleetManagerPhone : '';
      _showHelpCard(
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="help-card-title">&#x26A0;&#xFE0F; אין ביטוח מקיף</div>' +
        '<div class="help-card-sub">לא נמצא ביטוח מקיף פעיל לרכב זה.</div>' +
        '<hr class="help-card-divider">' +
        '<div style="font-size:14px;color:#94a3b8;text-align:center;padding:8px">פנה למנהל הצי לסיוע.</div>' +
        (mgrPhone ? '<button class="help-action-btn" onclick="window.open(\'tel:\' + mgrPhone.replace(/[^0-9+]/g,\'\') + \'\')">&#x1F4DE; התקשר למנהל הצי</button>' : '') +
        '</div>'
      );
    } else {
      _showHelpCard(
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="help-card-title">&#x1F69B; גרירה &#x2014; ביטוח מקיף</div>' +
        '<div class="help-card-sub">' + (ins.company||'') + ' | פוליסה: ' + (ins.policyNumber||'') + '</div>' +
        '<hr class="help-card-divider">' +
        (ins.emergencyPhone ? '<button class="help-action-btn" onclick="window.open(\'tel:\' + ins.emergencyPhone.replace(/[^0-9+]/g,\'\') + \'\')">&#x1F4DE; מוקד חירום 24/7 &#x2014; ' + ins.emergencyPhone + '</button>' : '') +
        (ins.towingCoverageKm ? '<div class="help-card-row"><span class="help-card-label">כיסוי גרירה:</span><span class="help-card-value">עד ' + ins.towingCoverageKm + ' ק"מ</span></div>' : '') +
        '<div class="help-card-row"><span class="help-card-label">רכב חלופי:</span><span class="help-card-value">' + (ins.includesRentalCar ? '&#x2705; כלול' : '&#x274C; לא כלול') + '</span></div>' +
        (ins.expiryDate ? '<div class="help-card-row"><span class="help-card-label">בתוקף עד:</span><span class="help-card-value">' + ins.expiryDate + '</span></div>' : '') +
        (garage ? '<hr class="help-card-divider"><div class="help-card-title" style="font-size:14px">&#x1F527; יעד גרירה מומלץ</div><div class="help-card-row">' + (garage.name||'') + '</div>' + (garage.address ? '<div class="help-card-row">&#x1F4CD; ' + garage.address + '</div>' : '') : '') +
        '</div>'
      );
    }
  } catch(e) {
    _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-error">שגיאה בטעינת נתונים.</div></div>');
  }
};

/* ── פנייה למוסך / דיווח תקלה ── */
APP.helpAppointment = function() {
  APP._apptSelectedReason = null;
  var g = (STATE.vehicle && STATE.vehicle.garage) ? STATE.vehicle.garage : null;
  var garageName  = (g && g.name)  ? g.name  : '';
  var garageAddr  = (g && g.address) ? g.address : '';
  var garagePhone = (g && (g.contactPhone || g.phone)) ? (g.contactPhone || g.phone) : '';
  var garageId    = (g && g.id) ? g.id : '';

  var garageSection = '';
  if (garageName || garageAddr || garagePhone) {
    garageSection =
      '<div style="background:rgba(255,255,255,0.07);border-radius:10px;padding:12px 14px;margin-bottom:14px">' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:4px">המוסך שלך</div>' +
      '<div style="font-size:15px;font-weight:700;color:#f1f5f9">' + (garageName || 'מוסך') + '</div>' +
      (garageAddr ? '<div style="font-size:12px;color:#94a3b8;margin-top:2px">&#x1F4CD; ' + garageAddr + '</div>' : '') +
      (garagePhone ?
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button class="help-action-btn secondary" style="flex:1;padding:10px 8px;font-size:13px" onclick="window.open(\'tel:\' + \'' + garagePhone.replace(/[^0-9+]/g,'') + '\')">&#x1F4DE; חייג למוסך</button>' +
        '<button class="help-action-btn secondary" style="flex:1;padding:10px 8px;font-size:13px" onclick="window.open(\'https://wa.me/' + phoneToWa(garagePhone) + '?text=\' + encodeURIComponent(\'שלום, אני נהג עלה ברכב \' + (STATE.vehicle && STATE.vehicle.num || \'\') + \'. אשמח לתאם טיפול.\'))">&#x1F4AC; וואטסאפ</button>' +
        '</div>'
      : '') +
      '</div>';
  } else {
    garageSection = '<div style="font-size:13px;color:#f59e0b;padding:8px 0;margin-bottom:8px">&#x26A0;&#xFE0F; לא שויך מוסך לרכב זה. פנה למנהל הצי.</div>';
  }

  var reasons = [['routine','טיפול תקופתי'],['fault','תקלה / בעיה'],['warning_light','נורה דולקת'],['post_accident','לאחר תאונה'],['noise','רעש / תחושה חריגה'],['other','אחר']];
  var radioHtml = reasons.map(function(r) {
    return '<label class="help-radio-item" onclick="APP._apptSelectReason(\'' + r[0] + '\',this)">' +
           '<input type="radio" name="appt-reason" value="' + r[0] + '"><span class="help-radio-label">' + r[1] + '</span></label>';
  }).join('');

  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">&#x1F527; פנייה למוסך</div>' +
    '<div class="help-card-sub">דווח לצי וקבל תיאום עם המוסך</div>' +
    '<hr class="help-card-divider">' +
    garageSection +
    '<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:8px">מה הסיבה?</div>' +
    '<div class="help-radio-group" id="appt-reasons">' + radioHtml + '</div>' +
    '<textarea class="help-textarea" id="appt-notes" placeholder="פרטים נוספים (אופציונלי)" rows="3"></textarea>' +
    '<button class="help-action-btn" onclick="APP._apptSubmit()">&#x1F4E8; שלח דיווח למנהל הצי</button>' +
    '</div>'
  );
};

APP._apptSelectReason = function(value, el) {
  APP._apptSelectedReason = value;
  document.querySelectorAll('.help-radio-item').forEach(function(item) { item.classList.remove('selected'); });
  if (el) el.classList.add('selected');
};

APP._apptSubmit = async function() {
  if (!APP._apptSelectedReason) { showToast('יש לבחור סיבת תור'); return; }
  var notes   = (document.getElementById('appt-notes') || {}).value || '';
  var _g      = (STATE.vehicle && STATE.vehicle.garage) ? STATE.vehicle.garage : {};
  var garage  = _g.name || '';
  var garageId= _g.id   || '';
  var result  = await _fireFieldEvent('service_request', { garageId: garageId, garageName: garage, reason: APP._apptSelectedReason, notes: notes });
  if (result.ok) {
    _showHelpCard(
      '<div class="help-card" style="text-align:center;padding:32px 20px">' +
      '<div style="font-size:48px;margin-bottom:12px">&#x2705;</div>' +
      '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">הבקשה נשלחה!</div>' +
      '<div style="font-size:14px;color:#94a3b8;margin-bottom:20px">מנהל הצי יצור איתך קשר לתיאום</div>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
      '</div>'
    );
  } else {
    showToast('שגיאה בשליחה — נסה שוב');
  }
};


/* ══ FCM ══ */
async function registerFcm() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const token = reg.scope + '_' + Date.now();
    await gasPost('driver_register_fcm', { fcmToken: token });
  } catch(e) {
    console.warn('FCM registration:', e.message);
  }
}

/* ══ Utils ══ */
function formatPlate(num) {
  if (!num) return '—';
  var d = String(num).replace(/\D/g, '');
  if (d.length === 8) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
  if (d.length === 7) return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
  return num;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return dateStr; }
}

function daysLeftWarn(dateStr, threshold) {
  if (!dateStr) return false;
  return Math.round((new Date(dateStr) - new Date()) / 86400000) <= threshold;
}

function showLoader()  { document.getElementById('splash-screen').classList.remove('hidden'); }
function hideLoader()  { document.getElementById('splash-screen').classList.add('hidden'); }

/* ══ Doc Viewer (PDF.js) ══ */
async function viewDoc(link, title) {
  if (!link) { showToast('לא קיים קישור — פנה למשרד'); return; }
  const overlay  = document.getElementById('doc-viewer');
  const loading  = document.getElementById('doc-viewer-loading');
  const pages    = document.getElementById('doc-viewer-pages');
  const errDiv   = document.getElementById('doc-viewer-error');
  const errMsg   = document.getElementById('doc-viewer-error-msg');
  const ttl      = document.getElementById('doc-viewer-title');

  overlay.style.display  = 'flex';
  loading.style.display  = 'flex';
  pages.style.display    = 'none';
  errDiv.style.display   = 'none';
  pages.innerHTML        = '';
  ttl.textContent        = title || 'מסמך';

  try {
    const result = await gasPost('view_doc_b64', { fileId: link });

    /* iframe עם Google Drive preview — רינדור native מושלם לעברית */
    const iframe = document.createElement('iframe');
    iframe.src = result.previewUrl;
    iframe.style.cssText = 'width:100%;flex:1;border:none;background:#525659';
    iframe.allow = 'autoplay';

    loading.style.display = 'none';
    pages.style.display   = 'flex';
    pages.style.padding   = '0';
    pages.appendChild(iframe);
  } catch(e) {
    loading.style.display = 'none';
    errDiv.style.display  = 'flex';
    errMsg.textContent    = e.message || 'שגיאה בטעינת המסמך';
  }
}

function closeDocViewer() {
  document.getElementById('doc-viewer').style.display = 'none';
  document.getElementById('doc-viewer-pages').innerHTML = '';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 2800);
}

function showLoginError(msg) {
  const el = document.getElementById('login-err');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ══ Greeting ══ */
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'בוקר טוב,';
  if (h >= 12 && h < 17) return 'צהריים טובים,';
  if (h >= 17 && h < 21) return 'ערב טוב,';
  return 'לילה טוב,';
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
}

function showGreeting(holderName) {
  hideLoader();

  document.getElementById('gr-time').textContent = getGreeting();
  document.getElementById('gr-name').textContent = holderName || '';
  const el = document.getElementById('greeting');
  el.classList.remove('hidden');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add('gr-show'); });
  });
}

function hideGreeting() {
  const el = document.getElementById('greeting');
  el.style.transition = 'opacity .4s ease';
  el.style.opacity = '0';
  setTimeout(function() {
    el.classList.add('hidden');
    el.classList.remove('gr-show');
    el.style.opacity = '';
    el.style.transition = '';
  }, 420);
}

/* ══ Boot ══ */
document.addEventListener('DOMContentLoaded', async function() {
  /* פתח נעילת orientation — עוקף manifest ישן ומאפשר סיבוב */
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch(e) {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      /* בדוק עדכון בכל טעינה */
      reg.update();
      reg.addEventListener('updatefound', function() {
        const sw = reg.installing;
        if (!navigator.serviceWorker.controller) return; /* התקנה ראשונה — לא reload */
        sw.addEventListener('statechange', function() {
          if (sw.state === 'activated') window.location.reload();
        });
      });
    }).catch(function(e) {
      console.warn('SW:', e.message);
    });
  }

  // Try cached session
  const session = loadSession();
  if (session && session.token !== 'demo_token') {
    STATE.idToken = session.token;
    STATE.vehicle = session.vehicleData;
    STATE.user    = session.userInfo;
    try {
      hideLoader();
      showGreeting((STATE.vehicle && STATE.vehicle.holder) || (STATE.user && STATE.user.name));
      await loadFullData();
      hideGreeting();
      startApp();
      return;
    } catch(e) {
      hideGreeting();
      localStorage.removeItem(SESSION_KEY);
    }
  } else if (session && session.token === 'demo_token') {
    localStorage.removeItem(SESSION_KEY);
  }

  // splash-screen stays visible — login button appears via CSS at ~4s

  if (!GOOGLE_CLIENT_ID) {
    // Demo mode — login button goes straight in
    document.getElementById('login-btn').addEventListener('click', demoLogin);
    return;
  }

  // Load Google Identity Services
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = function() {
    initGoogleAuth();
    document.getElementById('login-btn').addEventListener('click', function() {
      google.accounts.id.prompt();
    });
  };
  document.head.appendChild(script);
});

/* ══ רענון נתונים בחזרה לאפליקציה ══ */
var _lastRefresh = 0;
var _REFRESH_MIN = 5 * 60 * 1000; // 5 דקות מינימום בין רענונים

document.addEventListener('visibilitychange', async function() {
  if (document.visibilityState !== 'visible') return;
  if (!STATE.idToken || !STATE.vehicle) return;
  if (Date.now() - _lastRefresh < _REFRESH_MIN) return;
  try {
    await loadFullData();
    renderAll();
    _lastRefresh = Date.now();
  } catch(e) {
    console.warn('visibilitychange refresh error:', e.message);
  }
});
