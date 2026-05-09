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
  currentScreen: 'home',
  currentTab: 'info',
  idToken: null,
  govData:    undefined,  // undefined=טרם נטען | null=שגיאה/לא נמצא | object=נטען
  govWLTP:    undefined,
  govLoading: false
};

/* ══ GAS API ══ */
async function gasPost(action, extra) {
  extra = extra || {};
  if (!GAS_URL) {
    // Demo mode — return mock data
    return mockResponse(action, extra);
  }
  const params = Object.assign({ action, idToken: STATE.idToken }, extra);
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'שגיאת שרת');
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
  return { ok: false, error: 'Unknown action' };
}

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
  const imgUrl = driveToImgUrl(v.appPhotoLink) || getCarImageUrl(v.make, v.model);
  if (imgUrl) {
    photo.src = imgUrl;
  } else {
    document.querySelector('.hero-img-area').style.display = 'none';
  }

  renderServiceProgress();

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
  const v = STATE.vehicle;
  if (!v) return;
  const prev = v.lastServiceKm ? Number(v.lastServiceKm).toLocaleString('he') : '—';
  document.getElementById('km-prev').textContent = 'ק"מ אחרון: ' + prev;
  if (v.lastServiceKm) document.getElementById('km-input').value = v.lastServiceKm;
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
    const fab = document.getElementById('fab');
    if (fab) fab.style.display = screen === 'service' ? 'none' : 'flex';

    if (screen === 'vehicle') renderVehicleScreen(STATE.currentTab);
  },

  switchTab: function(tab) {
    STATE.currentTab = tab;
    renderVehicleScreen(tab);
  },

  updateKm: async function() {
    const val = document.getElementById('km-input').value;
    const km = parseInt(val, 10);
    if (!km || isNaN(km) || km <= 0) { showToast('הכנס ק"מ תקין (מספר חיובי)'); return; }
    if (km > 2000000) { showToast('ק"מ לא תקין — ערך גבוה מדי'); return; }
    // Client-side: must not go backwards vs known KM (currentKm = latest report; lastServiceKm = floor)
    const v = STATE.vehicle || {};
    const knownKm = Math.max(
      parseInt(v.currentKm, 10) || 0,
      parseInt(v.lastServiceKm, 10) || 0
    );
    if (knownKm > 0 && km < knownKm) {
      showToast('ק"מ לא תקין — לא ניתן להזין ערך נמוך מהדיווח האחרון (' + knownKm.toLocaleString('he') + ')');
      return;
    }
    if (knownKm > 0 && km > knownKm + 80000) {
      showToast('ק"מ לא תקין — קפיצה לא סבירה (יותר מ-80,000 ק"מ מעל ' + knownKm.toLocaleString('he') + ')');
      return;
    }
    showLoader();
    try {
      await gasPost('driver_update_km', { km: km });
      if (STATE.vehicle) {
        STATE.vehicle.lastServiceKm = km;
        STATE.vehicle.currentKm = km;  // refresh progress bar
      }
      renderService();
      showToast('ק"מ עודכן בהצלחה ✓');
    } catch(e) {
      showToast('שגיאה: ' + e.message);
    } finally {
      hideLoader();
    }
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
