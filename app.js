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
  idToken: null
};

/* ══ GAS API ══ */
async function gasPost(action, extra) {
  extra = extra || {};
  if (!GAS_URL) {
    // Demo mode — return mock data
    return mockResponse(action, extra);
  }
  const body = Object.assign({ action, idToken: STATE.idToken }, extra);
  const resp = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'follow'
  });
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
    testDue: '2026-08-15', testDone: '',
    photoLink: 'https://toyota-select.co.il/wp-content/uploads/2025/04/MODELS-SELECT-8.png',
    notes: ''
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
    await loadFullData();
    hideLoader();
    startApp();
  } catch(err) {
    console.error('[auth] error:', err.message);
    hideLoader();
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

async function loadFullData() {
  try {
    const result = await gasPost('driver_vehicle');
    STATE.vehicle   = result.vehicle;
    STATE.documents = result.documents || [];
    STATE.insurance = result.insurance || [];
    STATE.history   = result.history   || [];
    STATE.alerts    = buildAlerts(STATE.vehicle);
  } catch(e) {
    console.warn('loadFullData error:', e.message);
  }
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

  const checks = [
    { label: 'טסט רכב',      date: v.testDue,     skip: !!v.testDone, threshold: 30 },
    { label: 'רישיון רכב',   date: v.licExp,      skip: false,        threshold: 30 },
    { label: 'ביטוח חובה',   date: v.insCompExp,  skip: false,        threshold: 30 },
    { label: 'ביטוח מקיף',   date: v.insFullExp,  skip: false,        threshold: 30 }
  ];

  checks.forEach(function(c) {
    if (c.skip) return;
    const d = daysLeft(c.date);
    if (d === null || d > c.threshold) return;
    const type = d <= 7 ? 'red' : 'warn';
    alerts.push({
      type,
      title: c.label,
      sub: formatDate(c.date),
      days: d,
      label: type === 'red' ? 'דחוף' : 'להתייחסות'
    });
  });

  if (v.lastServiceKm && v.nextServiceKm) {
    const kmLeft = parseInt(v.nextServiceKm) - parseInt(v.lastServiceKm);
    if (kmLeft < 2000 && kmLeft >= 0) {
      alerts.push({ type: 'warn', title: 'טיפול קרוב', sub: 'נותרו ' + kmLeft.toLocaleString('he') + ' ק"מ', days: null, label: 'להתייחסות' });
    }
  }

  return alerts;
}

/* ══ Start App ══ */
function startApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderAll();
  updateClock();
  setInterval(updateClock, 30000);
  if ('serviceWorker' in navigator && GAS_URL) registerFcm();
}

function updateClock() {
  const now = new Date();
  document.getElementById('sb-time').textContent =
    now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
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
  const firstName = STATE.user.name.split(' ')[0];
  document.getElementById('user-name').textContent = firstName;

  if (STATE.user.picture) {
    document.getElementById('user-avatar').innerHTML =
      '<img src="' + STATE.user.picture + '" alt="">';
  }

  const badge = document.getElementById('alert-badge');
  const urgentCount = STATE.alerts.filter(function(a) { return a.type === 'red'; }).length;
  if (urgentCount > 0) {
    badge.textContent = urgentCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderHomeScreen() {
  const v = STATE.vehicle;
  if (!v) return;

  document.getElementById('car-name').textContent = ((v.make || '') + ' ' + (v.model || '')).trim();
  document.getElementById('car-plate').textContent = v.num || '—';

  if (v.photoLink) {
    const photo = document.getElementById('car-photo');
    photo.src = v.photoLink;
  }

  const homeAlert = document.getElementById('home-alert');
  const urgent = STATE.alerts.find(function(a) { return a.type === 'red'; });
  if (urgent) {
    document.getElementById('home-alert-title').textContent = urgent.title;
    document.getElementById('home-alert-sub').textContent =
      urgent.days !== null ? urgent.days + ' ימים' : urgent.sub;
    homeAlert.classList.remove('hidden');
  }
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
        '<div class="ig-icon"><svg width="20" height="20"><use href="#' + f.icon + '" color="#E8000D"/></svg></div>' +
        '<div class="ig-lbl">' + f.label + '</div>' +
        '<div class="ig-val' + (f.warn ? ' warn' : '') + '">' + f.val + '</div>' +
      '</div>';
    }).join('') + '</div>';

  } else if (tab === 'docs') {
    if (!STATE.documents.length) {
      content.innerHTML = '<div class="empty">אין מסמכים</div>';
    } else {
      content.innerHTML = STATE.documents.map(function(d, i) {
        return '<div class="doc-row" style="animation-delay:' + (i * 0.05) + 's"' +
          (d.link ? ' onclick="window.open(\'' + d.link + '\',\'_blank\')"' : '') + '>' +
          '<div class="dr-icon-wrap"><svg width="20" height="20"><use href="#ic-file" color="#E8000D"/></svg></div>' +
          '<div class="dr-body">' +
            '<div class="dr-title">' + (d.type || 'מסמך') + '</div>' +
            '<div class="dr-sub' + (daysLeftWarn(d.date, 30) ? ' warn' : '') + '">' + formatDate(d.date) + '</div>' +
          '</div>' +
          (d.link ? '<svg width="16" height="16"><use href="#ic-pin" color="#8A8A8E"/></svg>' : '') +
        '</div>';
      }).join('');
    }

  } else if (tab === 'insurance') {
    if (!STATE.insurance.length) {
      content.innerHTML = '<div class="empty">אין נתוני ביטוח</div>';
    } else {
      content.innerHTML = STATE.insurance.map(function(ins, i) {
        return '<div class="doc-row" style="animation-delay:' + (i * 0.05) + 's">' +
          '<div class="dr-icon-wrap"><svg width="20" height="20"><use href="#ic-shield" color="#E8000D"/></svg></div>' +
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

  } else if (tab === 'agency') {
    content.innerHTML = '<div class="igrid">' +
      '<div class="ig-card">' +
        '<div class="ig-icon"><svg width="20" height="20"><use href="#ic-pin" color="#E8000D"/></svg></div>' +
        '<div class="ig-lbl">אגף</div>' +
        '<div class="ig-val">' + (v.dept || '—') + '</div>' +
      '</div>' +
      '<div class="ig-card">' +
        '<div class="ig-icon"><svg width="20" height="20"><use href="#ic-user" color="#E8000D"/></svg></div>' +
        '<div class="ig-lbl">מחזיק</div>' +
        '<div class="ig-val">' + (v.holder || '—') + '</div>' +
      '</div>' +
      '<div class="ig-card">' +
        '<div class="ig-icon"><svg width="20" height="20"><use href="#ic-cal" color="#E8000D"/></svg></div>' +
        '<div class="ig-lbl">טלפון</div>' +
        '<div class="ig-val" style="font-size:14px;direction:ltr">' + (v.phone || '—') + '</div>' +
      '</div>' +
    '</div>';
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
    if (!km || km < 0) { showToast('הכנס ק"מ תקין'); return; }
    showLoader();
    try {
      await gasPost('driver_update_km', { km: km });
      if (STATE.vehicle) STATE.vehicle.lastServiceKm = km;
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

function showLoader()  { document.getElementById('loader').classList.remove('hidden'); }
function hideLoader()  { document.getElementById('loader').classList.add('hidden'); }

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

/* ══ Boot ══ */
document.addEventListener('DOMContentLoaded', async function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function(e) {
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
      await loadFullData();
      hideLoader();
      startApp();
      return;
    } catch(e) {
      // Session expired or invalid — clear and show login
      localStorage.removeItem(SESSION_KEY);
    }
  } else if (session && session.token === 'demo_token') {
    localStorage.removeItem(SESSION_KEY);
  }

  hideLoader();
  document.getElementById('login-screen').classList.remove('hidden');

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
