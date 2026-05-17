# אפיון — מערכת התראות נהג (Driver Notifications)
**תאריך:** 2026-05-15
**גרסה:** 1.0
**מטרה:** שדרוג מערכת ההתראות באפליקציית הנהג (PWA) לסטנדרט עיצובי וחווייתי אחיד, כולל הוספת התראות דלק חדשות (`fuel_high`, `fuel_km_high`).
**רכיבים מושפעים:** `driver/app.js`, `driver/sw.js`, `driver/index.html`, `13.4.26/code.js` (GAS), `cloudrun-webpush/index.js`.

---

## 1. מבוא ומטרות

### 1.1 רקע
אפליקציית הנהג (PWA) של עמותת עלה כוללת כיום מערכת התראות בסיסית עם 8 סוגי אירועים: `overdue`, `urgent`, `plan`, `km_update`, `test_due`, `test_urgent`, `garage_approved`, `garage_rejected`. המערכת עובדת אך חסרה אחידות עיצובית, אנימציות, מערכת קול ושני סוגי התראות חיוניים בתחום הדלק.

### 1.2 מטרות
1. **אחידות עיצובית** — Design System אחיד מבוסס Dark OLED + Glassmorphism עם פלטת חומרה (Severity) קבועה.
2. **חוויית משתמש מודרנית** — אנימציות spring, swipe-to-delete, stagger entrance, badge bounce.
3. **משוב חושי** — מערכת קול (Web Audio) עם תדרים ייחודיים לכל סוג התראה.
4. **התראות דלק** — הוספת `fuel_high` (צריכה חריגה ל-100ק"מ) ו-`fuel_km_high` (עלות לק"מ חריגה).
5. **נגישות** — תמיכה מלאה ב-`prefers-reduced-motion` (ללא אנימציות וללא קול).
6. **רספונסיביות** — תאימות מלאה ל-iOS Safari, Android Chrome, וכל גודל מסך.

### 1.3 הצלחה
- כל 10 סוגי ההתראות מוצגות באחידות עיצובית.
- Toast מופיע בתוך 400ms עם spring animation.
- Sound trigger פועל על אירועי משתמש (לא autoplay).
- Swipe-to-delete מגיב ב-90px עם haptic feedback.
- אפס שבירות באנימציות כאשר `prefers-reduced-motion: reduce`.

---

## 2. מערכת העיצוב (Design System)

### 2.1 בסיס
- **רקע ראשי:** `#000000` (OLED full-black) / `#121212` (deep gray) / `#0A0E27` (midnight blue)
- **טקסט:** `#FFFFFF` (primary) / `#E0E0E0` (secondary) / `#94a3b8` (muted)
- **פונט:** Noto Sans Hebrew — משקלים 300, 400, 500, 700, 800, 900 (נטען כבר ב-`index.html`)

### 2.2 CSS Variables

```css
:root {
  /* Severity Palette */
  --notif-critical: #ef4444;
  --notif-urgent:   #f59e0b;
  --notif-plan:     #3b82f6;
  --notif-info:     #8b5cf6;
  --notif-approved: #22c55e;

  /* Surface */
  --notif-bg:       rgba(255, 255, 255, 0.06);
  --notif-border:   rgba(255, 255, 255, 0.10);
  --notif-blur:     blur(12px);
  --notif-radius:   16px;

  /* Motion */
  --spring:    cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);

  /* Text */
  --notif-text-primary:   #FFFFFF;
  --notif-text-secondary: #E0E0E0;
  --notif-text-muted:     #94a3b8;
}
```

### 2.3 טבלת Severity

| Severity   | Color    | תור (Hz) | משך toast | אנימציית רקע          | שימוש                            |
|------------|----------|----------|-----------|------------------------|----------------------------------|
| critical   | #ef4444  | 880      | 8000ms    | notif-critical-pulse   | overdue, test_urgent             |
| urgent     | #f59e0b  | 660      | 6000ms    | notif-urgent-shimmer   | urgent, fuel_high, test_due      |
| plan       | #3b82f6  | 440      | 4000ms    | (soft glow)            | plan, km_update                  |
| info       | #8b5cf6  | 330      | 3000ms    | (subtle glow)          | fuel_km_high, garage_rejected    |
| approved   | #22c55e  | 523+659  | 5000ms    | notif-approved-glow    | garage_approved                  |

### 2.4 Keyframe Animations (8 שמורות)

```css
/* 1. כניסת Toast מלמעלה עם spring */
@keyframes notif-slide-in {
  0%   { opacity: 0; transform: translateY(-32px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(6px)  scale(1.02); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
}

/* 2. יציאת Toast — fade + translate up */
@keyframes notif-slide-out {
  0%   { opacity: 1; transform: translateY(0)     scale(1);    }
  100% { opacity: 0; transform: translateY(-24px) scale(0.96); }
}

/* 3. דופק קריטי — box-shadow אדום פועם */
@keyframes notif-critical-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6),
                         0 8px 32px rgba(239, 68, 68, 0.18); }
  50%      { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0),
                         0 8px 32px rgba(239, 68, 68, 0.32); }
}

/* 4. מבריק urgent — gradient נע */
@keyframes notif-urgent-shimmer {
  0%   { background-position:  -200% 0; }
  100% { background-position:   200% 0; }
}

/* 5. זוהר ירוק approved */
@keyframes notif-approved-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4),
                         0 4px 24px rgba(34, 197, 94, 0.15); }
  50%      { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0),
                         0 4px 24px rgba(34, 197, 94, 0.30); }
}

/* 6. קפיצת Badge על מונה חדש */
@keyframes badge-bounce {
  0%   { transform: scale(1);    }
  40%  { transform: scale(1.35); }
  70%  { transform: scale(0.92); }
  100% { transform: scale(1);    }
}

/* 7. כניסת כרטיס בהיסטוריה — stagger */
@keyframes card-enter {
  0%   { opacity: 0; transform: translateX(20px); }
  100% { opacity: 1; transform: translateX(0);    }
}

/* 8. swipe reveal — שכבת מחיקה אדומה */
@keyframes swipe-reveal {
  0%   { transform: scaleX(0); opacity: 0; }
  100% { transform: scaleX(1); opacity: 1; }
}

/* נגישות — לבטל הכל */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

### 2.5 Severity Classes

```css
.notif-card {
  background: var(--notif-bg);
  backdrop-filter: var(--notif-blur);
  -webkit-backdrop-filter: var(--notif-blur);
  border: 1px solid var(--notif-border);
  border-radius: var(--notif-radius);
  color: var(--notif-text-primary);
  padding: 14px 16px;
  font-family: 'Noto Sans Hebrew', system-ui, sans-serif;
}

.notif-critical {
  border-left: 4px solid var(--notif-critical);
  background: linear-gradient(135deg,
    rgba(239, 68, 68, 0.08) 0%,
    var(--notif-bg) 100%);
  animation: notif-critical-pulse 2s ease-in-out infinite;
}

.notif-urgent {
  border-left: 4px solid var(--notif-urgent);
  background: linear-gradient(90deg,
    rgba(245, 158, 11, 0.04),
    rgba(245, 158, 11, 0.12),
    rgba(245, 158, 11, 0.04));
  background-size: 200% 100%;
  animation: notif-urgent-shimmer 3s linear infinite;
}

.notif-plan {
  border-left: 4px solid var(--notif-plan);
  background: linear-gradient(135deg,
    rgba(59, 130, 246, 0.08) 0%,
    var(--notif-bg) 100%);
  box-shadow: 0 4px 24px rgba(59, 130, 246, 0.10);
}

.notif-info {
  border-left: 4px solid var(--notif-info);
  background: linear-gradient(135deg,
    rgba(139, 92, 246, 0.08) 0%,
    var(--notif-bg) 100%);
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.10);
}

.notif-approved {
  border-left: 4px solid var(--notif-approved);
  background: linear-gradient(135deg,
    rgba(34, 197, 94, 0.08) 0%,
    var(--notif-bg) 100%);
  animation: notif-approved-glow 2.4s ease-in-out infinite;
}
```

---

## 3. קטלוג רכיבים (Component Catalog)

### 3.1 Toast Overlay — `showInAppNotification`

**Positioning:**
```css
position: fixed;
top: 16px;
right: 16px;
left: 16px;
z-index: 9000;
max-width: 480px;
margin: 0 auto;
```

**מבנה DOM:**
```html
<div class="notif-toast notif-card notif-{severity}" role="alert">
  <div class="notif-icon">{SVG}</div>
  <div class="notif-content">
    <div class="notif-title">{title}</div>
    <div class="notif-body">{body}</div>
  </div>
  <button class="notif-action">פרטים ›</button>
  <button class="notif-dismiss" aria-label="סגור">×</button>
</div>
```

**אייקונים (SVG inline):**
| Severity | Symbol | מקור |
|----------|--------|------|
| critical | ⚡ Lightning Bolt | lucide `zap` |
| urgent   | ⚠ Triangle Alert | lucide `triangle-alert` |
| plan     | 📅 Calendar | lucide `calendar` |
| info     | 📊 Bar Chart | lucide `bar-chart-3` |
| approved | ✅ Check Circle | lucide `check-circle-2` |

**אנימציה:**
- כניסה: `notif-slide-in 0.4s var(--spring) both`
- יציאה: `notif-slide-out 0.3s var(--ease-out) both`

**Auto-dismiss timings (ms):**
```js
const TOAST_DURATION = {
  critical: 8000,
  urgent:   6000,
  plan:     4000,
  info:     3000,
  approved: 5000
};
```

**Sound trigger:** `_playNotifSound(alertType)` בעת הוספת הטוסט ל-DOM (רק אם המקור הוא user interaction — לא autoplay).

**Action button:** "פרטים ›" — מפעיל `navigateForAlertType(alertType, data)`.

### 3.2 History Card — `renderNotifHistory`

**מבנה:**
```html
<div class="notif-history-item notif-card notif-{severity}"
     style="animation: card-enter 0.35s var(--ease-out) both;
            animation-delay: {i*0.05}s;">
  <div class="notif-icon">{SVG}</div>
  <div class="notif-content">
    <div class="notif-title">{title}</div>
    <div class="notif-body">{body}</div>
    <!-- Meta rows (conditional) -->
    <div class="notif-meta">
      <span>בקשה #{requestNumber}</span>
      <span>{reasonLabel}</span>
      <span>צריכה: {fuelConsumption} ל/100קמ</span>
      <span>עלות: ₪{cost}</span>
    </div>
  </div>
  <div class="notif-time">{timeAgo}</div>
  <!-- Swipe layer -->
  <div class="notif-swipe-reveal">
    <svg>trash icon</svg>
  </div>
</div>
```

**Swipe-to-delete:**
- מעקב `pointerdown` → `pointermove` עם `transform: translateX(-px)`.
- סף 90px → haptic vibrate `[15]` + מחיקת המודעה.
- ביטול (פחות מ-90px) → spring-back: `transform: translateX(0)` עם `var(--spring)` 0.35s.
- שכבת `notif-swipe-reveal`: רקע `#ef4444`, אנימציית `swipe-reveal 0.2s linear`.

**Tap:** `navigateForAlertType(alertType, data)`.

### 3.3 Badge

```html
<span class="notif-badge" data-count="{n}">{n > 99 ? '99+' : n}</span>
```

```css
.notif-badge {
  position: absolute;
  top: -4px;
  inset-inline-end: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--notif-critical);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.notif-badge.is-bumping {
  animation: badge-bounce 0.3s var(--spring);
}
.notif-badge[data-count="0"] {
  display: none;
}
```

**שימוש:** מופיע על אייקון הפעמון (header) ועל טאב "התראות" בתפריט תחתון. הוספת קלאס `is-bumping` בעת אינקרמנט, הסרה אחרי 300ms.

### 3.4 Empty State

```html
<div class="notif-empty">
  <svg class="notif-empty-bell">
    <!-- bell with gentle swing animation -->
  </svg>
  <div class="notif-empty-title">אין התראות חדשות</div>
  <div class="notif-empty-subtitle">נעדכן אותך כשיהיה משהו חשוב</div>
</div>
```

אנימציית פעמון: `transform: rotate(-8deg → 8deg)` במחזור 2.4s ease-in-out.

---

## 4. זרימת UX מלאה — 10 סוגי התראות

| # | alertType | Severity | יעד ניווט |
|---|-----------|----------|-----------|
| 1 | overdue          | critical | vehicle → garage tab → pulse highlight + "הזמן תור דחוף" |
| 2 | urgent           | urgent   | vehicle → garage tab → amber highlight |
| 3 | plan             | plan     | vehicle → info tab → service planning card |
| 4 | km_update        | plan     | `APP.openKmModal()` pre-filled |
| 5 | test_due         | urgent   | vehicle → info tab → test section highlight + countdown |
| 6 | test_urgent      | critical | כמו test_due + "ייפוי כוח נשלח במייל" notice |
| 7 | garage_approved  | approved | `openHelpMenu()` → `_garageShowApprovedFromStorage` |
| 8 | garage_rejected  | info     | `openHelpMenu()` → garage form עם reason מוטמע |
| 9 | **fuel_high**    | urgent   | vehicle → info tab → fuel alert card + "דווח לצ'ק-אפ" |
| 10 | **fuel_km_high** | info     | vehicle → info tab → cost analysis card + "לדוח מלא" |

### 4.1 פירוט זרימה — overdue (קריטי)
```
Tap toast / history
  → navigateForAlertType('overdue', data)
  → APP.nav('vehicle')
  → APP.switchTab('garage')
  → garage section: classList.add('section-highlight-pulse')
  → render CTA "הזמן תור דחוף" (border-left אדום, פועם)
  → setTimeout(() => removeHighlight(), 4000)
```

### 4.2 urgent
זהה ל-overdue אך amber במקום אדום, ללא pulse — רק `notif-urgent-shimmer` על ה-CTA.

### 4.3 plan
```
Tap → APP.nav('vehicle') → switchTab('info')
  → scrollTo(servicePlanningCard)
  → card classList.add('plan-highlight') for 3s
```

### 4.4 km_update
```
Tap → APP.openKmModal({ prefillFromAlert: true, lastKm: data.lastKm })
```

### 4.5 test_due (urgent)
```
Tap → APP.nav('vehicle') → switchTab('info')
  → scrollTo(testSection)
  → render countdown badge: "טסט בעוד {N} ימים"
  → CTA "קבע טסט" (var(--notif-urgent))
```

### 4.6 test_urgent (critical)
זהה ל-test_due עם תוספות:
- `requireInteraction: true` ב-SW (לא נסגר אוטומטית).
- Notice strip: "ייפוי כוח נשלח אליך במייל — בדוק את תיבת הדואר".
- CTA כפול: "קבע טסט" + "פתח מייל".

### 4.7 garage_approved (approved)
```
Tap → openHelpMenu() (ללא vehicle screen flash)
  → _garageShowApprovedFromStorage({
      requestNumber: data.requestNumber,
      approvedAt:    data.approvedAt,
      reasonLabel:   data.reasonLabel
    })
  → modal עם approved-glow border + סאונד C+E (523+659Hz)
```

### 4.8 garage_rejected (info)
```
Tap → openHelpMenu()
  → garage form pre-fill: { reason: data.reason, comment: data.rejectionComment }
  → CTA "בקשה חדשה" (violet)
  → Notice: "הבקשה הקודמת לא אושרה. הסיבה: {reasonLabel}"
```

### 4.9 fuel_high (חדש — urgent)
```
Tap → APP.nav('vehicle') → switchTab('info')
  → scrollTo(fuelAlertCard)
  → render:
      ┌──────────────────────────────────────┐
      │ ⛽ צריכת דלק חריגה                   │
      │ צריכה ממוצעת:   {fuelConsumption} ל/100קמ │
      │ סף מקובל:        {threshold} ל/100קמ        │
      │ חריגה:           +{diff}% מהממוצע            │
      │ [דווח לצ'ק-אפ →]                    │
      └──────────────────────────────────────┘
  → button → APP._fireFieldEvent('fuel_report', { vehicleId, fuelConsumption })
```

### 4.10 fuel_km_high (חדש — info)
```
Tap → APP.nav('vehicle') → switchTab('info')
  → scrollTo(costAnalysisCard)
  → render:
      ┌──────────────────────────────────────┐
      │ 📊 עלות לקמ חריגה                    │
      │ עלות לקמ ברכבך:   ₪{costPerKm}        │
      │ ממוצע צי:          ₪{fleetAverage}    │
      │ חריגה:             +{diff}% מהממוצע   │
      │ [לדוח מלא →]                        │
      └──────────────────────────────────────┘
  → button → APP.nav('fuel') (פותח מסך דלק מלא)
```

---

## 5. מפרט טכני — Service Worker (`sw.js`)

### 5.1 גרסה
- **SW version:** v83 → **v84**
- **Cache name:** `aleh-driver-v83` → **`aleh-driver-v84`**

### 5.2 TYPE_CONFIG מלא

```javascript
const TYPE_CONFIG = {
  overdue:        { vibrate: [400, 100, 400, 100, 400], requireInteraction: true,  badge: './icons/badge-red.png'    },
  urgent:         { vibrate: [300, 100, 300],            requireInteraction: false, badge: './icons/badge-amber.png'  },
  plan:           { vibrate: [200],                      requireInteraction: false, badge: './icons/badge-blue.png'   },
  km_update:      { vibrate: [150],                      requireInteraction: false, badge: './icons/badge-blue.png'   },
  test_due:       { vibrate: [300, 100, 300],            requireInteraction: false, badge: './icons/badge-amber.png'  },
  test_urgent:    { vibrate: [400, 100, 400, 100, 400], requireInteraction: true,  badge: './icons/badge-red.png'    },
  garage_approved:{ vibrate: [200, 80, 200],             requireInteraction: false, badge: './icons/badge-green.png'  },
  garage_rejected:{ vibrate: [200],                      requireInteraction: false, badge: './icons/badge-violet.png' },
  // NEW
  fuel_high:      { vibrate: [300, 100, 300],            requireInteraction: false, badge: './icons/badge-amber.png'  },
  fuel_km_high:   { vibrate: [150],                      requireInteraction: false, badge: './icons/badge-violet.png' }
};
```

### 5.3 push event handler — לוגיקה זהה לקיים

קרא `event.data.json()` → חלץ `alertType` → השתמש ב-`TYPE_CONFIG[alertType]` → `self.registration.showNotification(title, { body, vibrate, requireInteraction, badge, icon, data, tag: 'aleh-' + alertType + '-' + vehicleId })`.

### 5.4 notificationclick — ניווט

זהה לקיים אך עם תוספת `fuel_high` ו-`fuel_km_high` במיפוי. הודעה ל-client: `{ type: 'NOTIFICATION_CLICK', alertType, data }`.

---

## 6. מפרט טכני — GAS (`13.4.26/code.js`)

### 6.1 פונקציה חדשה — `checkFuelAlerts()`

```javascript
/**
 * Daily fuel anomaly check.
 * Triggered from dailyCheck().
 */
function checkFuelAlerts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Fuel Consumption History');
  if (!sheet) return;

  const threshold = Number(getSetting('fuel_alert_threshold_l100')) || 12;
  const fleetAvgCostPerKm = Number(getSetting('fuel_alert_fleet_avg_cost_per_km')) || 1.20;
  const costThresholdPct = Number(getSetting('fuel_alert_cost_threshold_pct')) || 25;

  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const idx = (h) => headers.indexOf(h);

  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const props = PropertiesService.getScriptProperties();
  const DEDUP_TTL_MS = 14 * 24 * 60 * 60 * 1000;

  // Group by vehicleId — last 30 days
  const byVehicle = {};
  rows.forEach(r => {
    const date = new Date(r[idx('date')]);
    if (date < cutoff) return;
    const vid = r[idx('vehicleId')];
    if (!byVehicle[vid]) byVehicle[vid] = { liters: 0, km: 0, cost: 0 };
    byVehicle[vid].liters += Number(r[idx('liters')]) || 0;
    byVehicle[vid].km     += Number(r[idx('kmDelta')]) || 0;
    byVehicle[vid].cost   += Number(r[idx('cost')]) || 0;
  });

  Object.keys(byVehicle).forEach(vid => {
    const v = byVehicle[vid];
    if (v.km <= 0) return;

    const l100 = (v.liters / v.km) * 100;
    const costPerKm = v.cost / v.km;

    // --- fuel_high: l/100km > threshold ---
    if (l100 > threshold) {
      const key = `fuel_alert_${vid}`;
      const last = Number(props.getProperty(key)) || 0;
      if (Date.now() - last > DEDUP_TTL_MS) {
        _sendFcmToDriver(vid,
          'צריכת דלק חריגה',
          `הצריכה הממוצעת שלך: ${l100.toFixed(1)} ל/100קמ (סף: ${threshold})`,
          {
            alertType: 'fuel_high',
            fuelConsumption: l100.toFixed(1),
            threshold: threshold,
            vehicleId: vid
          });
        props.setProperty(key, String(Date.now()));
      }
    }

    // --- fuel_km_high: cost/km > fleet avg + threshold% ---
    const costExcessPct = ((costPerKm - fleetAvgCostPerKm) / fleetAvgCostPerKm) * 100;
    if (costExcessPct > costThresholdPct) {
      const key = `fuel_km_alert_${vid}`;
      const last = Number(props.getProperty(key)) || 0;
      if (Date.now() - last > DEDUP_TTL_MS) {
        _sendFcmToDriver(vid,
          'עלות לקמ חריגה',
          `עלות הדלק לקמ: ₪${costPerKm.toFixed(2)} (ממוצע צי: ₪${fleetAvgCostPerKm.toFixed(2)})`,
          {
            alertType: 'fuel_km_high',
            costPerKm: costPerKm.toFixed(2),
            fleetAverage: fleetAvgCostPerKm.toFixed(2),
            vehicleId: vid
          });
        props.setProperty(key, String(Date.now()));
      }
    }
  });
}
```

### 6.2 שילוב ב-`dailyCheck()`

```javascript
function dailyCheck() {
  checkOverdueAlerts();
  checkUrgentAlerts();
  checkPlanAlerts();
  checkTestAlerts();
  checkFuelAlerts();   // <-- NEW
}
```

### 6.3 Deployment
- `clasp push` → `clasp deploy --description "v1.1903 + fuel alerts"`
- Version bump: V1.1902 → **V1.1903**

---

## 7. מפרט Web Audio (Sound System)

### 7.1 פונקציה מלאה

```javascript
let _notifAudioCtx = null;

function _playNotifSound(alertType) {
  // Respect reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.AudioContext && !window.webkitAudioContext) return;

  try {
    if (!_notifAudioCtx) {
      _notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = _notifAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const TONES = {
      overdue:         [880, 660, 880],
      urgent:          [660],
      plan:            [440],
      km_update:       [330],
      fuel_high:       [550],
      fuel_km_high:    [440],
      test_urgent:     [880, 660],
      test_due:        [550],
      garage_approved: [523, 659],   // C5 + E5 — pleasant chord
      garage_rejected: [220]          // low, somber
    };

    const tones = TONES[alertType] || [440];
    const now = ctx.currentTime;
    const ATTACK = 0.01, DECAY = 0.10, SUSTAIN = 0.30, RELEASE = 0.20;
    const NOTE_DUR = 0.20;

    tones.forEach((freq, i) => {
      const start = now + i * (NOTE_DUR + 0.04);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearTargetAtTime?.(0.18, start, ATTACK) ??
        gain.gain.linearRampToValueAtTime(0.18, start + ATTACK);
      gain.gain.linearRampToValueAtTime(SUSTAIN * 0.18, start + ATTACK + DECAY);
      gain.gain.linearRampToValueAtTime(0, start + NOTE_DUR + RELEASE);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + NOTE_DUR + RELEASE + 0.02);
    });
  } catch (e) {
    console.warn('[notif-sound] failed:', e);
  }
}
```

### 7.2 כלל הפעלה
- מופעל **רק** מתוך `showInAppNotification()` כאשר המקור הוא user-interaction (לא mount ראשוני של page).
- ב-iOS Safari — AudioContext דורש interaction; הוא נוצר lazy בקריאה הראשונה.

---

## 8. תוכנית מימוש — 7 משימות

### משימה 1 — CSS Design System (`driver/index.html`)
**מטרה:** הוספת כל הטוקנים, keyframes, severity classes לתוך `<style>` ב-`index.html`.
**מיקום:** בלוק CSS חדש לפני סגירת `</style>` הראשי.
**תוכן:** סעיפים 2.2, 2.4, 2.5 לעיל — verbatim.
**אימות:** טעינה ב-DevTools → `getComputedStyle(document.documentElement).getPropertyValue('--notif-critical')` מחזיר `#ef4444`.

### משימה 2 — Web Audio Sound System (`driver/app.js`)
**מטרה:** הוספת `_playNotifSound(alertType)` ל-`app.js`.
**מיקום:** בסקציית utilities ליד `_fireFieldEvent`.
**תוכן:** סעיף 7.1 verbatim.
**אימות:** מהקונסול: `_playNotifSound('overdue')` → 3 צפצופים בתדרים 880/660/880.

### משימה 3 — שדרוג `showInAppNotification` (`driver/app.js`)
**מטרה:** החלפת הפונקציה הקיימת בגרסה חדשה.
**שינויים:**
- מיפוי `alertType → severity` (`overdue`/`test_urgent` → `critical`, `urgent`/`fuel_high`/`test_due` → `urgent`, וכו').
- הוספת קלאסים `notif-toast notif-card notif-{severity}`.
- שילוב SVG אייקון לפי severity.
- כפתור "פרטים ›" שמפעיל `navigateForAlertType`.
- Auto-dismiss timer לפי `TOAST_DURATION[severity]`.
- קריאה ל-`_playNotifSound(alertType)` בהוספה ל-DOM.
- אנימציית יציאה `notif-slide-out` לפני `remove()`.

### משימה 4 — שדרוג `renderNotifHistory` (`driver/app.js`)
**מטרה:** רינדור מחודש של כרטיסי היסטוריה.
**שינויים:**
- כל פריט: `notif-history-item notif-card notif-{severity}` עם `animation-delay: ${i*0.05}s`.
- שורות meta תנאיות: `requestNumber`, `reasonLabel`, `fuelConsumption`, `cost`.
- Swipe-to-delete: עטיפת event handlers `pointerdown/move/up`, סף 90px, haptic, spring-back.
- Tap → `navigateForAlertType`.
- Empty state כאשר רשימה ריקה (סעיף 3.4).

### משימה 5 — `navigateForAlertType` — fuel flows (`driver/app.js`)
**מטרה:** הוספת cases `fuel_high` ו-`fuel_km_high`.
**תוכן:** סעיפים 4.9, 4.10 verbatim — כולל יצירת ה-HTML של fuel alert card ו-cost analysis card וצירופם ל-vehicle info tab.
**אימות:** Tap על התראה חדשה → ניווט נכון + כרטיס מוצג עם הנתונים.

### משימה 6 — SW v84 + fuel types (`driver/sw.js`)
**מטרה:** bump גרסה והוספת 2 sounds + 2 entries ב-TYPE_CONFIG.
**שינויים:**
- `const SW_VERSION = 'v84';`
- `const CACHE_NAME = 'aleh-driver-v84';`
- הוספת `fuel_high` ו-`fuel_km_high` ל-TYPE_CONFIG (סעיף 5.2).
- `notificationclick` — וידוא שהשני נשלחים ל-client (`type: 'NOTIFICATION_CLICK'`).
**אימות:** DevTools → Application → Service Workers → גרסה חדשה רשומה.

### משימה 7 — GAS `checkFuelAlerts()` + deploy
**מטרה:** הוספת הפונקציה ל-`code.js` ושילובה ב-`dailyCheck`.
**שינויים:**
- הוספת סעיף 6.1 verbatim.
- שורה חדשה ב-`dailyCheck()`: `checkFuelAlerts();`
- הוספת 3 הגדרות לגיליון Settings (סעיף 10).
- `clasp push` → `clasp deploy -d "v1.1903 + fuel alerts"`.
- עדכון `currentVersion.txt` ל-V1.1903.
**אימות:**
- Apps Script editor → Run `checkFuelAlerts` ידנית → לוג מראה calculation.
- שליחת FCM mock עם `alertType: fuel_high` → push מגיע + toast עם severity urgent.

---

## 9. בדיקות ואימות (Verification)

### 9.1 בדיקה ידנית — 10 alert types

| # | Test | Pass criteria |
|---|------|---------------|
| 1 | trigger overdue via mock FCM | Toast אדום פועם, צליל 880-660-880, "פרטים" → garage tab |
| 2 | urgent | Toast amber shimmer, צליל 660 |
| 3 | plan | Toast blue soft glow, צליל 440 |
| 4 | km_update | Toast blue, פותח KM modal |
| 5 | test_due | Toast amber + countdown |
| 6 | test_urgent | Toast אדום, requireInteraction=true, "ייפוי כוח" notice |
| 7 | garage_approved | Toast green glow, צליל C+E, modal approved |
| 8 | garage_rejected | Toast violet, garage form עם reason |
| 9 | **fuel_high** | Toast urgent + fuel card עם l/100 |
| 10 | **fuel_km_high** | Toast info + cost card |

### 9.2 prefers-reduced-motion
- DevTools → Rendering → Emulate CSS `prefers-reduced-motion: reduce`.
- כל ההתראות ללא אנימציה, ללא קול, mounting מיידי.

### 9.3 Mobile
- iOS Safari (iPhone 13+): toast + sound אחרי tap, safe-area-insets נשמר.
- Android Chrome: vibrate API פעיל, swipe-to-delete חלק.

### 9.4 Sound user-gesture
- Mount ראשוני של ה-app → אסור שיופעל קול.
- Tap על פעמון → רשימת התראות → קול רק על toast חדש שמופעל ע"י push.

### 9.5 Dedup (fuel)
- ריצה כפולה של `checkFuelAlerts()` תוך 14 ימים → רק push יחיד (Script Property חוסם).

---

## 10. הגדרות קונפיגורציה — גיליון Settings

| Key                                | Default | תיאור |
|------------------------------------|---------|-------|
| `fuel_alert_threshold_l100`        | 12      | סף צריכת דלק ל-100ק"מ — מעליו נשלחת fuel_high |
| `fuel_alert_fleet_avg_cost_per_km` | 1.20    | עלות דלק ממוצעת לק"מ בצי (₪) |
| `fuel_alert_cost_threshold_pct`    | 25      | אחוז חריגה מהממוצע — מעליו נשלחת fuel_km_high |
| `notif_toast_duration_critical_ms` | 8000    | משך toast קריטי |
| `notif_toast_duration_urgent_ms`   | 6000    | משך toast urgent |
| `notif_toast_duration_plan_ms`     | 4000    | משך toast plan |
| `notif_toast_duration_info_ms`     | 3000    | משך toast info |
| `notif_sound_enabled`              | true    | הפעלת מערכת קול |

הגדרות אלו נקראות ב-GAS דרך `getSetting(key)` ובצד client דרך `APP.settings`.

---

## נספח A — מיפוי alertType → severity

```javascript
const SEVERITY_MAP = {
  overdue:         'critical',
  test_urgent:     'critical',
  urgent:          'urgent',
  test_due:        'urgent',
  fuel_high:       'urgent',
  plan:            'plan',
  km_update:       'plan',
  fuel_km_high:    'info',
  garage_rejected: 'info',
  garage_approved: 'approved'
};
```

## נספח B — checklist deployment

- [ ] משימה 1: CSS ב-`index.html`
- [ ] משימה 2: `_playNotifSound` ב-`app.js`
- [ ] משימה 3: `showInAppNotification` משודרגת
- [ ] משימה 4: `renderNotifHistory` משודרגת
- [ ] משימה 5: `navigateForAlertType` עם fuel cases
- [ ] משימה 6: SW v84 + cache rename
- [ ] משימה 7: GAS `checkFuelAlerts` + deploy V1.1903
- [ ] בדיקה ידנית של כל 10 סוגי ההתראות
- [ ] בדיקת `prefers-reduced-motion`
- [ ] git commit + push

---

**סוף אפיון.**
