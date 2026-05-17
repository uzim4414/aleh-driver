# מערכת התראות נהג — תוכנית מימוש מלאה

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` when executing this plan. Each task below is structured as an independent unit with explicit file paths, code snippets, and verification steps. Spawn parallel subagents only for tasks marked `[parallel-safe]`; tasks touching the same file must run sequentially. Run `superpowers:verification-before-completion` before claiming any task complete, and `superpowers:requesting-code-review` after Task 7 (deploy).

**Goal:** הפיכת מערכת ההתראות של נהג עמותת עלה למערכת מקצה לקצה, מעוצבת, אנימטיבית, אמינה — המכסה את כל 10 סוגי ההתראות (כולל 2 חדשים: `fuel_high`, `fuel_km_high`), עם זרימת UX מותאמת לכל סוג, אנימציות CSS מודרניות, סאונד מבוסס חומרה, רטט (haptics), ומשלוח Web Push דרך Cloud Run.

**Architecture:**
- **Backend (GAS):** `Fleet manager/13.4.26/code.js` — מריץ `dailyCheck()` / `checkMaintenanceAlerts()` / `checkFuelAlerts()` (חדש), קורא ל-`_sendFcmToDriver(vehicleId, title, body, extraData)` ששולח HTTP POST ל-Cloud Run.
- **Relay (Cloud Run):** `Fleet manager/cloudrun-webpush/index.js` — endpoint `/send`, חותם עם VAPID, שולח ל-Web Push endpoints של מנויי הנהג.
- **Frontend (Driver PWA):** `Fleet manager/driver/` — `app.js` (לוגיקה), `sw.js` (Service Worker, push handler, OS notification), `index.html` (UI + CSS).
- **Storage:** מנויי Web Push ב-Sheet `PushSubscriptions`, היסטוריית התראות ב-`localStorage` תחת `driver_notif_history`, מחיקות אינדיבידואליות תחת `driver_notif_deleted_ts`.

**Tech Stack:**
- Web Push API + VAPID keys (ללא Firebase SDK)
- Service Worker v84 (לאחר bump), cache name: `aleh-driver-v84`
- CSS: Tailwind utility classes + custom `@keyframes` ב-`index.html`
- Web Audio API לסאונד התראות (oscillator-based, ללא קבצי mp3)
- Vibration API ל-haptics
- Google Apps Script V8 runtime ב-backend
- `clasp` ל-deploy GAS, `gcloud run deploy` לרילר

---

## 1. סיווג התראות (Alert Taxonomy)

טבלה מלאה של כל 10 סוגי ההתראות במערכת:

| סוג (alertType) | תיאור | חומרה | צבע | רטט (vibrate) | requireInteraction | navigate to |
|---|---|---|---|---|---|---|
| `overdue` | טיפול שעבר תאריך יעד | Critical | אדום `#ef4444` | `[400,100,400,100,400]` | `true` | מסך רכב → טאב מוסך |
| `urgent` | טיפול דחוף (קרוב לתאריך/קמ) | Urgent | ענבר `#f59e0b` | `[300,100,300]` | `false` | מסך רכב → טאב מוסך |
| `plan` | טיפול מתוכנן עתידי | Planned | כחול `#3b82f6` | `[200]` | `false` | מסך רכב → טאב מוסך |
| `km_update` | בקשה לעדכון קילומטראז' | Info | סגול `#8b5cf6` | `[150]` | `false` | מודאל עדכון ק"מ |
| `test_due` | טסט קרוב (פחות מ-30 יום) | Urgent | ענבר `#f59e0b` | `[300,100,300]` | `false` | מסך רכב → טאב מידע → פרטי טסט |
| `test_urgent` | טסט פג / פחות מ-7 ימים | Critical | אדום `#ef4444` | `[400,100,400,100,400]` | `true` | מסך רכב → טאב מידע → פרטי טסט |
| `garage_approved` | בקשת מוסך אושרה | Info+ | כחול `#3b82f6` | `[200,100,200]` | `true` | תפריט עזרה → כרטיס מוסך מאושר |
| `garage_rejected` | בקשת מוסך נדחתה | Critical | אדום `#ef4444` | `[400,100,400]` | `true` | מסך רכב → טאב מוסך → בקשה חדשה |
| `fuel_high` *(חדש)* | צריכת דלק חריגה (>סף ל/100קמ) | Urgent | ענבר `#f59e0b` | `[300,100,300]` | `false` | מסך דלק → כרטיס צריכה |
| `fuel_km_high` *(חדש)* | עלות גבוהה לקמ (>סף ₪/קמ) | Info | סגול `#8b5cf6` | `[150,80,150]` | `false` | מסך דלק → ניתוח עלויות |

**מיפוי חומרה → קלאס CSS:**
- Critical → `.notif-critical` (אדום + pulse)
- Urgent → `.notif-urgent` (ענבר + shimmer)
- Planned → `.notif-planned` (כחול + glow)
- Info → `.notif-info` (סגול רגוע)

---

## 2. ארכיטקטורת המשלוח (Delivery Architecture)

זרימה מלאה מהטריגר ועד התצוגה אצל הנהג:

```
┌─────────────────────────────────────────────────────────────────────┐
│ GAS Triggers (time-driven, daily 06:00 Asia/Jerusalem)              │
│   ├─ dailyCheck()                                                   │
│   │    ├─ checkLicenseAlerts()                                      │
│   │    ├─ checkTestAlerts()      → test_due / test_urgent           │
│   │    └─ checkFuelAlerts() NEW  → fuel_high / fuel_km_high         │
│   └─ checkMaintenanceAlerts()                                       │
│        → overdue / urgent / plan / km_update                        │
│                                                                     │
│   Each alert function:                                              │
│   1. שולף שורות רלוונטיות (Sheet)                                    │
│   2. בודק dedup gate ב-Script Properties (e.g.                      │
│      `fuel_alert_sent_{vehicleId}` < 14 days)                       │
│   3. קורא _sendFcmToDriver(vehicleId, title, body, {                │
│        alertType, vehicleId, severity, meta:{...}                   │
│      })                                                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │ UrlFetchApp.fetch (POST JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Cloud Run /send (cloudrun-webpush/index.js)                         │
│   1. מאמת shared secret (X-Aleh-Secret header)                       │
│   2. שולף subscriptions של הנהג מ-Firestore/Sheet bridge             │
│   3. web-push.sendNotification(sub, payload) עם VAPID                │
│   4. מוחק subscriptions שמחזירות 410 Gone                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Encrypted Web Push (ECE)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Driver Service Worker (sw.js v84)                                   │
│   self.addEventListener('push', e => {                              │
│     const payload = e.data.json();                                  │
│     const cfg = TYPE_CONFIG[payload.alertType] || DEFAULT_CFG;      │
│     // ─── App open? ─── postMessage 'push-foreground' לכל clients   │
│     //     → app.js מציג toast overlay, לא OS notification            │
│     // ─── App closed? ─── self.registration.showNotification(...)   │
│   });                                                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌──────────────────────┐      ┌──────────────────────┐
   │  App OPEN            │      │  App CLOSED/BG       │
   │  showInAppNotif()    │      │  OS notification     │
   │  + toast slide-in    │      │  → user taps         │
   │  + Web Audio sound   │      │  → notificationclick │
   │  + vibrate           │      │  → focus client +    │
   │  + badge++           │      │    postMessage open  │
   └──────────┬───────────┘      └──────────┬───────────┘
              │                             │
              └──────────────┬──────────────┘
                             ▼
              navigateForAlertType(alertType, meta)
                             │
                             ▼
              UX flow per type (ראה §5)
```

---

## 3. התנהגות בתוך האפליקציה (In-App Behavior)

### 3.1 App פתוחה + push מגיע
1. `sw.js` קולט push event, מחלץ `payload`.
2. בודק `clients.matchAll({type:'window'})` — אם יש client פעיל ו-`visibilityState === 'visible'`:
   - שולח `postMessage({ type:'push-foreground', payload })` במקום להציג OS notification.
3. `app.js` מאזין ל-`navigator.serviceWorker.onmessage`:
   - קורא `saveNotifToHistory(payload)` (dedup לפי `payload.ts`).
   - קורא `showInAppNotification(payload)` → מציג toast מרחף בראש המסך עם:
     - slide-in animation (`notif-slide-in`, 320ms cubic-bezier(0.34, 1.56, 0.64, 1))
     - severity class (`notif-critical` / `notif-urgent` / `notif-planned` / `notif-info`)
     - pulse/shimmer/glow לפי חומרה
     - Web Audio sound (ראה §6)
     - `navigator.vibrate(cfg.vibrate)` אם נתמך
     - badge counter ב-tab "התראות" עולה ב-1 + `badge-bounce` animation
   - Auto-dismiss אחרי 8s (critical) / 6s (urgent) / 4s (info), אלא אם המשתמש מקיש.
   - הקשה → סוגר toast + קורא `navigateForAlertType`.

### 3.2 App סגורה / רקע
1. `sw.js` קורא `self.registration.showNotification(title, { body, icon, badge, tag, data, vibrate, requireInteraction, actions })`.
2. `tag` = `${alertType}_${vehicleId}` למניעת כפילויות.
3. `notificationclick` event → `clients.openWindow('/')` או `client.focus()` + postMessage `{type:'open-from-notif', payload}`.
4. `app.js` קולט message ב-`init()` ומריץ `navigateForAlertType`.

### 3.3 מסך היסטוריה
- כפתור "התראות" ב-bottom nav → `renderNotifHistory()`.
- כל התראה: card עם border-right בצבע חומרה, אייקון, כותרת, body, timestamp יחסי ("לפני 3 דקות"), metadata (vehicleId, fuel data וכו').
- Stagger animation: `animation-delay: calc(var(--i) * 0.05s)` על כל card.
- Swipe-to-delete: pointer events → translate-X, ב->50% מהרוחב מציג רובד אדום `scale(1.05)`; שחרור < 40% = spring-back; > 40% = remove + push ts ל-`driver_notif_deleted_ts`.

### 3.4 ניהול badge
- `driver_notif_unread_count` ב-localStorage.
- `driver_notif_last_seen_ts` — נשמר בכל פתיחה של מסך התראות.
- Unread = `history.filter(n => n.ts > lastSeen && !deleted.includes(n.ts)).length`.
- Badge גלוי ב-bottom nav + ב-app icon (`navigator.setAppBadge(count)` אם נתמך).

---

## 4. זרימת UX לכל סוג התראה

מימוש מלא ב-`navigateForAlertType(alertType, meta)`:

```js
function navigateForAlertType(alertType, meta = {}) {
  const vid = meta.vehicleId;
  switch (alertType) {
    case 'overdue':
    case 'urgent':
    case 'plan':
      navigateTo('vehicle', { vehicleId: vid, tab: 'garage' });
      highlightTreatment(meta.treatmentId);
      break;

    case 'km_update':
      navigateTo('vehicle', { vehicleId: vid });
      openKmUpdateModal({ requestedBy: 'system', reason: meta.reason });
      break;

    case 'test_due':
    case 'test_urgent':
      navigateTo('vehicle', { vehicleId: vid, tab: 'info' });
      scrollToSection('test-details');
      flashElement('#test-card', meta.severity);
      break;

    case 'garage_approved':
      navigateTo('help');
      renderApprovedGarageCard({
        garageName: meta.garageName,
        address: meta.address,
        phone: meta.phone,
        approvedTreatments: meta.approvedTreatments,
        appointmentLink: meta.appointmentLink
      });
      break;

    case 'garage_rejected':
      navigateTo('vehicle', { vehicleId: vid, tab: 'garage' });
      showRejectionBanner({
        reason: meta.rejectionReason,
        suggestedAction: 'submit_new_request'
      });
      openNewGarageRequestFlow();
      break;

    case 'fuel_high':  // NEW
      navigateTo('fuel');
      renderFuelConsumptionCard({
        currentL100: meta.currentL100,
        threshold: meta.threshold,
        last30dAvg: meta.last30dAvg,
        deltaPercent: meta.deltaPercent
      });
      break;

    case 'fuel_km_high':  // NEW
      navigateTo('fuel');
      renderFuelCostAnalysisCard({
        currentCostPerKm: meta.currentCostPerKm,
        threshold: meta.threshold,
        last30dAvg: meta.last30dAvg,
        suggestions: meta.suggestions || []
      });
      break;
  }
}
```

פירוט per-type:

- **`overdue` / `urgent` / `plan`** → מסך רכב, טאב "מוסך", הטיפול הספציפי מודגש עם flash animation 1.5s.
- **`km_update`** → המודאל המוכר של עדכון ק"מ נפתח אוטומטית עם prefill של תאריך נוכחי.
- **`test_due` / `test_urgent`** → מסך רכב, טאב מידע, scroll חלק לכרטיס טסט, flash אדום (urgent) / ענבר (due).
- **`garage_approved`** → מסך "עזרה", כרטיס ירוק עם פרטי מוסך מאושר, כפתור "התקשר", כפתור "ניווט" (Google Maps deep link), רשימת טיפולים מאושרים.
- **`garage_rejected`** → מסך רכב, טאב מוסך, באנר אדום עם סיבת דחייה + CTA "הגש בקשה חדשה" שפותח את הזרימה.
- **`fuel_high`** *(חדש)* → מסך דלק, כרטיס "צריכה חריגה" עם:
  - גרף 30 ימים אחרונים (ליטר/100קמ)
  - השוואה: נוכחי vs. ממוצע צי vs. סף
  - טיפים: בדוק לחץ אוויר, נסיעה במהירות קבועה, נקה תא מטען
- **`fuel_km_high`** *(חדש)* → מסך דלק, כרטיס "עלות גבוהה לקמ" עם:
  - חישוב עלות ממוצעת לקמ ב-30 יום
  - השוואה למחיר דלק ארצי + לצריכה ממוצעת
  - הפניה ל-`fuel_high` אם הצריכה גם חריגה

---

## 5. מערכת אנימציות (Animation Design System)

### 5.1 Color tokens (CSS variables)

```css
:root {
  --notif-critical-border: #ef4444;
  --notif-critical-bg:     rgba(239, 68, 68, .15);
  --notif-critical-glow:   rgba(239, 68, 68, .40);

  --notif-urgent-border:   #f59e0b;
  --notif-urgent-bg:       rgba(245, 158, 11, .12);
  --notif-urgent-glow:     rgba(245, 158, 11, .35);

  --notif-planned-border:  #3b82f6;
  --notif-planned-bg:      rgba(59, 130, 246, .10);
  --notif-planned-glow:    rgba(59, 130, 246, .30);

  --notif-info-border:     #8b5cf6;
  --notif-info-bg:         rgba(139, 92, 246, .10);
  --notif-info-glow:       rgba(139, 92, 246, .25);

  --notif-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --notif-ease:   cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 5.2 Keyframes

```css
/* כניסת toast: spring physics */
@keyframes notif-slide-in {
  0%   { transform: translateY(-110%) scale(0.95); opacity: 0; }
  60%  { transform: translateY(8%)    scale(1.02); opacity: 1; }
  100% { transform: translateY(0)     scale(1);    opacity: 1; }
}

/* יציאת toast */
@keyframes notif-slide-out {
  from { transform: translateY(0);     opacity: 1; }
  to   { transform: translateY(-110%); opacity: 0; }
}

/* Critical pulse — דופק אדום עוצמתי */
@keyframes notif-critical-pulse {
  0%, 100% { box-shadow: 0 0 0 0  rgba(239, 68, 68, .4); }
  50%      { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
}

/* Urgent shimmer — נצנוץ ענבר */
@keyframes notif-urgent-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* Planned glow — זוהר כחול רך */
@keyframes notif-planned-glow {
  0%, 100% { box-shadow: 0 0 8px  rgba(59, 130, 246, .25); }
  50%      { box-shadow: 0 0 18px rgba(59, 130, 246, .50); }
}

/* Badge bounce — קפיצה כשהגיעה התראה */
@keyframes badge-bounce {
  0%, 100% { transform: scale(1); }
  30%      { transform: scale(1.35) rotate(-6deg); }
  60%      { transform: scale(0.95) rotate(3deg); }
}

/* Card entrance ברשימת היסטוריה */
@keyframes card-enter {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0);    }
}

/* Flash על אלמנט מודגש (treatment / test card) */
@keyframes element-flash {
  0%, 100% { background-color: transparent; }
  50%      { background-color: var(--notif-urgent-bg); }
}

/* Swipe-to-delete reveal */
@keyframes swipe-reveal-scale {
  to { transform: scale(1.05); }
}
```

### 5.3 קלאסים שימושיים

```css
.notif-toast {
  position: fixed; top: 16px; left: 16px; right: 16px;
  z-index: 9999; border-radius: 16px;
  padding: 14px 16px;
  backdrop-filter: blur(12px) saturate(180%);
  animation: notif-slide-in 320ms var(--notif-spring) both;
}
.notif-toast.dismissing { animation: notif-slide-out 220ms var(--notif-ease) both; }

.notif-critical {
  border: 2px solid var(--notif-critical-border);
  background: var(--notif-critical-bg);
  animation: notif-slide-in 320ms var(--notif-spring) both,
             notif-critical-pulse 1.8s ease-in-out 320ms infinite;
}

.notif-urgent {
  border: 2px solid var(--notif-urgent-border);
  background: linear-gradient(110deg,
    var(--notif-urgent-bg) 0%,
    rgba(245,158,11,.25) 50%,
    var(--notif-urgent-bg) 100%);
  background-size: 200% 100%;
  animation: notif-slide-in 320ms var(--notif-spring) both,
             notif-urgent-shimmer 2.5s linear 320ms infinite;
}

.notif-planned {
  border: 2px solid var(--notif-planned-border);
  background: var(--notif-planned-bg);
  animation: notif-slide-in 320ms var(--notif-spring) both,
             notif-planned-glow 2.2s ease-in-out 320ms infinite;
}

.notif-info {
  border: 2px solid var(--notif-info-border);
  background: var(--notif-info-bg);
  animation: notif-slide-in 320ms var(--notif-spring) both;
}

.notif-badge-bump { animation: badge-bounce 600ms var(--notif-spring); }

.notif-history-card { animation: card-enter 400ms var(--notif-ease) both; }
/* stagger: --i is set inline per item */

.notif-flash { animation: element-flash 1.5s ease-in-out 2; }

@media (prefers-reduced-motion: reduce) {
  .notif-toast, .notif-critical, .notif-urgent, .notif-planned,
  .notif-history-card, .notif-badge-bump { animation: none !important; }
}
```

### 5.4 Haptics (Vibration API)

```js
const HAPTIC_PATTERNS = {
  critical: [400, 100, 400, 100, 400],
  urgent:   [300, 100, 300],
  planned:  [200],
  info:     [150]
};
function fireHaptic(severity) {
  if (!('vibrate' in navigator)) return;
  navigator.vibrate(HAPTIC_PATTERNS[severity] || HAPTIC_PATTERNS.info);
}
```

### 5.5 Sound (Web Audio API oscillator)

```js
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
const TONES = {
  // [frequency Hz, duration ms, waveType, gain]
  critical: [[880, 120, 'square', 0.18], [660, 120, 'square', 0.18], [880, 180, 'square', 0.18]],
  urgent:   [[740, 140, 'triangle', 0.15], [880, 160, 'triangle', 0.15]],
  planned:  [[523, 180, 'sine', 0.12]],
  info:     [[440, 120, 'sine', 0.10]]
};
function playNotifSound(severity) {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const tones = TONES[severity] || TONES.info;
    let t = ctx.currentTime;
    tones.forEach(([freq, dur, type, gain]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur/1000);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + dur/1000);
      t += dur/1000 + 0.04;
    });
  } catch (e) { console.warn('[notif] sound failed', e); }
}
```

---

## 6. משימות מימוש (Implementation Tasks)

> **סדר ביצוע:** 1 → 2 → 3 → 4 → 5 → 6 → 7. משימות 1+2 `[parallel-safe]` (קבצים שונים). 3+4+5 — נוגעות ב-`app.js` ולכן sequential. 6 ב-GAS — `[parallel-safe]`.

### Task 1: הוספת `fuel_high` ו-`fuel_km_high` ל-SW TYPE_CONFIG

**Files:** `Fleet manager/driver/sw.js`

**Steps:**
1. בראש הקובץ — bump גרסה:
   ```js
   const SW_VERSION = 'v84';
   const CACHE_NAME = 'aleh-driver-v84';
   ```
2. הוסף ל-`TYPE_CONFIG`:
   ```js
   const TYPE_CONFIG = {
     // ...existing entries...
     fuel_high: {
       icon: '/icons/fuel-warning.png',
       badge: '/icons/badge.png',
       color: '#f59e0b',
       vibrate: [300, 100, 300],
       requireInteraction: false,
       severity: 'urgent',
       tagPrefix: 'fuel_high'
     },
     fuel_km_high: {
       icon: '/icons/fuel-cost.png',
       badge: '/icons/badge.png',
       color: '#8b5cf6',
       vibrate: [150, 80, 150],
       requireInteraction: false,
       severity: 'info',
       tagPrefix: 'fuel_km_high'
     }
   };
   ```
3. בדוק שב-`push` event ה-`tag` נבנה כך: `tag: \`\${cfg.tagPrefix}_\${payload.vehicleId}\``.
4. ב-`activate` event — נקה caches ישנים:
   ```js
   self.addEventListener('activate', e => {
     e.waitUntil(caches.keys().then(keys =>
       Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
     ).then(() => self.clients.claim()));
   });
   ```

**Verification:**
- DevTools → Application → Service Workers → גרסה `v84` פעילה.
- `caches.keys()` בקונסול → רק `aleh-driver-v84`.
- שלח push ידני עם `alertType: 'fuel_high'` → OS notification מופיע עם vibrate `[300,100,300]`.

---

### Task 2: הוספת מערכת האנימציות ל-CSS

**Files:** `Fleet manager/driver/index.html`

**Steps:**
1. אתר את תג ה-`<style>` הראשי (או הוסף `<style id="notif-animations">` אחרי ה-`<link>` של Tailwind).
2. הדבק את **כל** הקוד מ-§5.1, §5.2, §5.3 — variables, keyframes, classes.
3. ודא `@media (prefers-reduced-motion: reduce)` קיים בסוף.
4. אם יש קונפליקט עם Tailwind — עטוף בקלאס שורש `.notif-system *` או השתמש ב-`!important` היכן שדרוש.

**Verification:**
- פתח את ה-PWA → DevTools → Elements → הוסף ידנית `<div class="notif-toast notif-critical">בדיקה</div>` ל-body → ראה pulse אדום.
- בדוק `prefers-reduced-motion` ב-Rendering tab → אנימציות נעצרות.

---

### Task 3: שדרוג `showInAppNotification`

**Files:** `Fleet manager/driver/app.js`

**Steps:**
1. אתר את הפונקציה הקיימת `showInAppNotification(payload)`.
2. החלף ב:
   ```js
   const SEVERITY_BY_TYPE = {
     overdue: 'critical', test_urgent: 'critical', garage_rejected: 'critical',
     urgent: 'urgent', test_due: 'urgent', fuel_high: 'urgent',
     plan: 'planned', garage_approved: 'planned',
     km_update: 'info', fuel_km_high: 'info'
   };
   const AUTO_DISMISS_MS = { critical: 8000, urgent: 6000, planned: 5000, info: 4000 };

   function showInAppNotification(payload) {
     const severity = SEVERITY_BY_TYPE[payload.alertType] || 'info';
     const toast = document.createElement('div');
     toast.className = `notif-toast notif-${severity}`;
     toast.dir = 'rtl';
     toast.innerHTML = `
       <div class="flex items-start gap-3">
         <div class="notif-icon">${iconForType(payload.alertType)}</div>
         <div class="flex-1 min-w-0">
           <div class="font-bold text-base truncate">${escapeHtml(payload.title)}</div>
           <div class="text-sm opacity-90 mt-1">${escapeHtml(payload.body)}</div>
         </div>
         <button class="notif-close" aria-label="סגור">×</button>
       </div>`;
     document.body.appendChild(toast);

     // Sound + haptic
     playNotifSound(severity);
     fireHaptic(severity);

     // Badge bump
     bumpUnreadBadge();

     // Tap → navigate
     toast.addEventListener('click', e => {
       if (e.target.classList.contains('notif-close')) return dismissToast(toast);
       dismissToast(toast);
       navigateForAlertType(payload.alertType, payload.meta || payload);
     });
     toast.querySelector('.notif-close').addEventListener('click', () => dismissToast(toast));

     // Auto-dismiss
     const ms = AUTO_DISMISS_MS[severity];
     const timer = setTimeout(() => dismissToast(toast), ms);
     toast._timer = timer;
   }

   function dismissToast(toast) {
     if (toast._dismissed) return;
     toast._dismissed = true;
     clearTimeout(toast._timer);
     toast.classList.add('dismissing');
     setTimeout(() => toast.remove(), 240);
   }
   ```
3. הוסף את `playNotifSound`, `fireHaptic`, `getAudioCtx`, `HAPTIC_PATTERNS`, `TONES` מ-§5.4-§5.5.
4. הוסף `bumpUnreadBadge()`:
   ```js
   function bumpUnreadBadge() {
     const el = document.querySelector('[data-nav="alerts"] .badge');
     if (!el) return;
     const cur = parseInt(el.textContent || '0', 10);
     el.textContent = String(cur + 1);
     el.classList.remove('notif-badge-bump');
     void el.offsetWidth; // restart animation
     el.classList.add('notif-badge-bump');
     if ('setAppBadge' in navigator) navigator.setAppBadge(cur + 1).catch(()=>{});
   }
   ```

**Verification:**
- שלח push דרך Cloud Run עם `alertType: 'overdue'` והאפליקציה פתוחה → toast אדום עם pulse + 3 צלילים גבוהים + רטט ארוך.
- שלח `fuel_high` → toast ענבר עם shimmer + 2 צלילים בינוניים.
- לחיצה על toast → ניווט נכון. סגירה ב-× → fade-out.

---

### Task 4: שדרוג `renderNotifHistory`

**Files:** `Fleet manager/driver/app.js`

**Steps:**
1. אתר את `renderNotifHistory()`. החלף את לולאת ה-rendering:
   ```js
   function renderNotifHistory() {
     const history = loadNotifHistory();
     const deleted = JSON.parse(localStorage.getItem('driver_notif_deleted_ts') || '[]');
     const visible = history.filter(n => !deleted.includes(n.ts))
                            .sort((a, b) => b.ts - a.ts);
     const container = document.getElementById('notif-history');
     container.innerHTML = '';
     if (!visible.length) {
       container.innerHTML = '<div class="text-center text-gray-500 py-10">אין התראות</div>';
       return;
     }
     visible.forEach((n, i) => {
       const severity = SEVERITY_BY_TYPE[n.alertType] || 'info';
       const card = document.createElement('div');
       card.className = `notif-history-card notif-${severity}`;
       card.style.setProperty('--i', i);
       card.style.animationDelay = `${i * 0.05}s`;
       card.dataset.ts = n.ts;
       card.innerHTML = `
         <div class="flex items-start gap-3">
           <div class="notif-icon">${iconForType(n.alertType)}</div>
           <div class="flex-1 min-w-0">
             <div class="font-bold">${escapeHtml(n.title)}</div>
             <div class="text-sm opacity-80 mt-1">${escapeHtml(n.body)}</div>
             ${renderNotifMeta(n)}
             <div class="text-xs text-gray-500 mt-2">${relativeTime(n.ts)}</div>
           </div>
         </div>`;
       attachSwipeToDelete(card);
       card.addEventListener('click', () => navigateForAlertType(n.alertType, n.meta || n));
       container.appendChild(card);
     });
     markAlertsAsSeen();
   }

   function renderNotifMeta(n) {
     const m = n.meta || {};
     const rows = [];
     if (m.vehicleId) rows.push(`<span>רכב: ${escapeHtml(m.vehicleId)}</span>`);
     if (n.alertType === 'fuel_high' && m.currentL100)
       rows.push(`<span>צריכה: <b>${m.currentL100}</b> ל'/100ק"מ (סף: ${m.threshold})</span>`);
     if (n.alertType === 'fuel_km_high' && m.currentCostPerKm)
       rows.push(`<span>עלות: <b>${m.currentCostPerKm}</b> ₪/ק"מ (סף: ${m.threshold})</span>`);
     if (m.treatmentName) rows.push(`<span>טיפול: ${escapeHtml(m.treatmentName)}</span>`);
     return rows.length ? `<div class="notif-meta text-xs mt-2 flex flex-wrap gap-x-3 gap-y-1 opacity-75">${rows.join('')}</div>` : '';
   }
   ```
2. ודא `attachSwipeToDelete` הקיים מוסיף קלאס `swipe-reveal-scale` ב->50%.

**Verification:**
- פתח מסך התראות עם 5+ פריטים → stagger אנימציה גלויה (כל card נכנס 50ms אחרי הקודם).
- borders בצבעים שונים לכל חומרה.
- card של `fuel_high` מציג צריכה ו-threshold ב-meta.

---

### Task 5: הוספת `navigateForAlertType` ל-`fuel_high` ו-`fuel_km_high`

**Files:** `Fleet manager/driver/app.js`

**Steps:**
1. אתר את `navigateForAlertType`. הוסף את שני ה-cases מ-§4.
2. הוסף פונקציות עזר:
   ```js
   function renderFuelConsumptionCard({ currentL100, threshold, last30dAvg, deltaPercent }) {
     const wrap = document.getElementById('fuel-info-cards') || ensureFuelInfoContainer();
     wrap.insertAdjacentHTML('afterbegin', `
       <div class="notif-info-card notif-urgent fuel-consumption-card">
         <h3 class="font-bold text-lg">צריכת דלק חריגה</h3>
         <div class="grid grid-cols-3 gap-3 mt-3">
           <div><div class="text-xs opacity-70">נוכחי</div><div class="text-2xl font-bold">${currentL100}</div><div class="text-xs">ל'/100ק"מ</div></div>
           <div><div class="text-xs opacity-70">ממוצע 30 יום</div><div class="text-2xl">${last30dAvg}</div></div>
           <div><div class="text-xs opacity-70">סף התראה</div><div class="text-2xl">${threshold}</div></div>
         </div>
         <div class="mt-3 text-sm">חריגה של <b>${deltaPercent}%</b> מהממוצע. שקול לבדוק לחץ אוויר, סינון אוויר, וסגנון נהיגה.</div>
       </div>`);
   }
   function renderFuelCostAnalysisCard({ currentCostPerKm, threshold, last30dAvg, suggestions }) {
     const wrap = document.getElementById('fuel-info-cards') || ensureFuelInfoContainer();
     wrap.insertAdjacentHTML('afterbegin', `
       <div class="notif-info-card notif-info fuel-cost-card">
         <h3 class="font-bold text-lg">עלות גבוהה לק"מ</h3>
         <div class="grid grid-cols-3 gap-3 mt-3">
           <div><div class="text-xs opacity-70">נוכחי</div><div class="text-2xl font-bold">${currentCostPerKm} ₪</div></div>
           <div><div class="text-xs opacity-70">ממוצע 30 יום</div><div class="text-2xl">${last30dAvg} ₪</div></div>
           <div><div class="text-xs opacity-70">סף</div><div class="text-2xl">${threshold} ₪</div></div>
         </div>
         ${suggestions.length ? `<ul class="mt-3 list-disc pr-5 text-sm">${suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
       </div>`);
   }
   ```
3. ודא `navigateTo('fuel')` קיים. אם אין מסך דלק — הוסף route ב-router ו-section ב-HTML.

**Verification:**
- שלח push `fuel_high` ידני עם meta מלא → אפליקציה נפתחת במסך דלק וכרטיס "צריכה חריגה" מופיע בראש.
- אותו דבר ל-`fuel_km_high`.

---

### Task 6: GAS — הפעלת התראות דלק

**Files:** `Fleet manager/13.4.26/code.js`

**Steps:**
1. אתר `checkFuelAlerts` (stub) או צור חדש:
   ```js
   function checkFuelAlerts() {
     const ss = SpreadsheetApp.getActive();
     const fuelSheet = ss.getSheetByName('FuelLog');
     const vehiclesSheet = ss.getSheetByName('Vehicles');
     const settings = _loadSettings_();
     const L100_THRESHOLD = Number(settings.fuel_alert_threshold_l100 || 12);
     const COST_THRESHOLD = Number(settings.fuel_alert_threshold_cost_km || 0.65);
     const REPEAT_GATE_DAYS = 14;

     const props = PropertiesService.getScriptProperties();
     const now = new Date();
     const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

     const vehicles = _sheetToObjects_(vehiclesSheet);
     const fuel = _sheetToObjects_(fuelSheet)
       .filter(r => r.deletedAt !== true && r.deletedAt !== 'true' && new Date(r.date) >= cutoff);

     vehicles.forEach(v => {
       const rows = fuel.filter(f => f.vehicleId === v.vehicleId);
       if (rows.length < 3) return; // מעט מדי דאטה
       const totalLiters = rows.reduce((s,r) => s + Number(r.liters||0), 0);
       const totalKm     = rows.reduce((s,r) => s + Number(r.km||0), 0);
       const totalCost   = rows.reduce((s,r) => s + Number(r.cost||0), 0);
       if (totalKm <= 0) return;
       const l100   = +(totalLiters / totalKm * 100).toFixed(2);
       const costKm = +(totalCost / totalKm).toFixed(3);

       // fuel_high
       _fuelAlertGated_(props, `fuel_alert_l100_${v.vehicleId}`, REPEAT_GATE_DAYS, () => {
         if (l100 > L100_THRESHOLD) {
           _sendFcmToDriver(v.vehicleId,
             'צריכת דלק חריגה',
             `הצריכה הנוכחית ${l100} ל'/100ק"מ — מעל הסף (${L100_THRESHOLD}).`,
             {
               alertType: 'fuel_high',
               vehicleId: v.vehicleId,
               severity: 'urgent',
               meta: { currentL100: l100, threshold: L100_THRESHOLD,
                       last30dAvg: l100, deltaPercent: +((l100/L100_THRESHOLD-1)*100).toFixed(0) }
             });
           return true;
         }
         return false;
       });

       // fuel_km_high
       _fuelAlertGated_(props, `fuel_alert_costkm_${v.vehicleId}`, REPEAT_GATE_DAYS, () => {
         if (costKm > COST_THRESHOLD) {
           _sendFcmToDriver(v.vehicleId,
             'עלות דלק גבוהה לק"מ',
             `העלות הממוצעת ${costKm} ₪/ק"מ — מעל הסף (${COST_THRESHOLD}).`,
             {
               alertType: 'fuel_km_high',
               vehicleId: v.vehicleId,
               severity: 'info',
               meta: { currentCostPerKm: costKm, threshold: COST_THRESHOLD,
                       last30dAvg: costKm,
                       suggestions: ['בדוק תחנות זולות בקרבת מסלולים', 'הימנע מנסיעות קצרות', 'שמור מהירות קבועה'] }
             });
           return true;
         }
         return false;
       });
     });
   }

   function _fuelAlertGated_(props, key, gateDays, fn) {
     const last = Number(props.getProperty(key) || 0);
     const now = Date.now();
     if (now - last < gateDays * 24 * 3600 * 1000) return;
     const sent = fn();
     if (sent) props.setProperty(key, String(now));
   }
   ```
2. הוסף קריאה ל-`checkFuelAlerts()` בתוך `dailyCheck()` אחרי `checkTestAlerts()`.
3. הוסף ל-Settings sheet שורות:
   - `fuel_alert_threshold_l100` = `12`
   - `fuel_alert_threshold_cost_km` = `0.65`
4. ודא ש-`_sendFcmToDriver` כבר מעביר את `extraData` במלואו ל-payload של Cloud Run (כולל `meta`).

**Verification:**
- הרץ `checkFuelAlerts()` ידנית מ-Apps Script editor.
- בדוק `View → Executions` — אין errors.
- בדוק Script Properties — הוסף `fuel_alert_l100_<vid>` עם timestamp.
- ב-PWA — התראה הופיעה עם meta מלא.
- הרץ שוב מיד → אין כפילות (gate עובד).

---

### Task 7: Deploy ו-commit

**Steps (סדר מחייב):**
1. בדיקות מקומיות:
   ```bash
   cd "Fleet manager/driver"
   # פתח index.html דרך local server, שלח push ידני
   ```
2. Git commit (אוטומטי לפי [feedback_git_commit]):
   ```bash
   cd "Fleet manager"
   git add driver/sw.js driver/app.js driver/index.html driver/docs/plans/2026-05-15-driver-notifications-system.md 13.4.26/code.js
   git commit -m "$(cat <<'EOF'
   feat(driver-notifications): מערכת התראות מלאה + fuel_high/fuel_km_high

   - SW v84: 10 alert types ב-TYPE_CONFIG
   - אנימציות CSS: slide-in, pulse, shimmer, glow, badge-bounce, card-enter
   - Toast in-app עם Web Audio sound + haptics לפי חומרה
   - History עם stagger + swipe-to-delete + severity borders
   - GAS checkFuelAlerts עם dedup gate 14 יום

   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   EOF
   )"
   git push
   ```
3. Deploy GAS:
   ```bash
   cd "Fleet manager/13.4.26"
   clasp push
   clasp deploy -i <PRODUCTION_DEPLOYMENT_ID>
   ```
   ⚠️ **חובה לפי [lesson_gas_deploy_appsscript]:** קרא `appsscript.json` מ-remote ראשון, ודא `access: ANYONE_ANONYMOUS`.
4. Deploy Cloud Run (אם השתנה):
   ```bash
   cd "Fleet manager/cloudrun-webpush"
   gcloud run deploy aleh-webpush --source . --region europe-west1
   ```
5. Smoke test בייצור: שלח push ידני לכל אחד מ-10 סוגי ההתראות, ודא קבלה במכשיר אמיתי.

**Verification:**
- `git log -1` מציג את ה-commit.
- `clasp deployments` מציג deployment חדש.
- PWA במכשיר — Service Worker `v84` פעיל (Application tab).
- Cloud Run logs מראים `200 OK` על `/send`.

---

## 7. הגדרות סף (Configurable Thresholds)

| Setting key (Sheet `Settings`) | ברירת מחדל | תיאור |
|---|---|---|
| `fuel_alert_threshold_l100` | `12` | סף צריכה (ליטר/100ק"מ) להפעלת `fuel_high` |
| `fuel_alert_threshold_cost_km` | `0.65` | סף עלות (₪/ק"מ) להפעלת `fuel_km_high` |
| `fuel_alert_gate_days` | `14` | מספר ימי dedup לפני שליחה חוזרת לאותו רכב |

**Script Properties (dedup keys):**
- `fuel_alert_l100_{vehicleId}` — timestamp שליחה אחרונה של `fuel_high`
- `fuel_alert_costkm_{vehicleId}` — timestamp שליחה אחרונה של `fuel_km_high`
- ניתן לאפס ידנית מ-Project Settings ב-Apps Script.

**שינוי בזמן ריצה:** עדכן את הגיליון `Settings` → `_loadSettings_()` קורא כל בוקר ב-`dailyCheck`.

---

## 8. Self-Review

### בדיקות מקיפות לפני סיום:

- [ ] **כיסוי alert types** — כל 10 הסוגים מוגדרים ב-SW TYPE_CONFIG, ב-SEVERITY_BY_TYPE, וב-navigateForAlertType. ✔
- [ ] **אנימציות** — כל ה-keyframes מ-§5 קיימים ב-`index.html`; `prefers-reduced-motion` מכובד. ✔
- [ ] **סאונד + haptics** — `playNotifSound` ו-`fireHaptic` נקראים מ-`showInAppNotification`. ✔
- [ ] **Dedup** — היסטוריה מסננת לפי `ts`; GAS משתמש ב-Script Properties עם gate 14 יום. ✔
- [ ] **Badge** — `bumpUnreadBadge` + `markAlertsAsSeen` + `setAppBadge` (PWA). ✔
- [ ] **Swipe-to-delete** — spring-back ב-<40%, מחיקה ב->40%, `driver_notif_deleted_ts` מתעדכן. ✔
- [ ] **App open vs closed** — SW בודק visibility ושולח `push-foreground` או מציג OS notification. ✔
- [ ] **Navigate per type** — כל case ב-`navigateForAlertType` מטפל בניווט וב-side-effect (modal/highlight/render card). ✔
- [ ] **אבטחה** — לפי [lesson_email_security_links] אין קישורים ל-`exec?page=...` ב-push payload; ה-PWA פתוחה מ-מקור מהימן בלבד. ✔
- [ ] **גיבוי לפני שינוי GAS** — לפי [feedback_backup_rule] הרץ `backup.py` לפני עריכת `code.js`. ✔
- [ ] **git commit אוטומטי** — לפי [feedback_git_commit] בסוף כל deploy. ✔
- [ ] **עיצוב מושלם** — לפי [feedback_design_excellence] כל toast/card/modal עוצב מודרני עם backdrop-blur, spring physics, צבעי חומרה מובחנים. ✔
- [ ] **אין פופאפים דפדפן** — לפי [feedback_no_browser_popups] אין `confirm/alert/prompt`; הכל מסכי in-app. ✔
- [ ] **ui-ux-pro-max** — לפי [feedback_ui_ux_pro_max] הסקיל הופעל בתכנון העיצוב. ✔

### סיכונים פתוחים:
1. **iOS Web Push** — Safari iOS דורש PWA מותקנת על מסך הבית; ודא קיים `manifest.json` עם `display: standalone` ו-icons תקינים.
2. **Web Audio autoplay** — בדפדפנים שדורשים user gesture, השתמש ב-AudioContext רק אחרי אינטראקציה ראשונה; שמור flag `_audioUnlocked`.
3. **Vibration API ב-iOS** — לא נתמך; הקוד כבר משתמש ב-feature detect `'vibrate' in navigator`.
4. **Reduced motion** — נבדק; אם המשתמש הגדיר, רק animations מבוטלות, sound + haptic עדיין פועלים. שקול גם flag נפרד `notif_sound_enabled`.
5. **Threshold tuning** — סף `12 ל'/100ק"מ` הוא ממוצע צי; כדאי לעבור ל-baseline per-vehicle אחרי איסוף נתונים של 90 יום.

### KPIs לאחר השקה (לעקוב 14 יום):
- אחוז התראות שנפתחו (tap rate) per alertType.
- ממוצע latency: trigger → push received → tap.
- מספר swipe-to-delete לכל alertType (אינדיקציה לרעש).
- אחוז `fuel_high` שגרמו לפעולה בפועל (kpi עסקי).

---

**End of plan.**
