# Driver PWA — Notifications Redesign Spec

**Date:** 2026-05-24  
**Status:** Approved  
**Scope:** driver/app.js · driver/sw.js · driver/index.html

---

## Background

The notification system has 20 bugs discovered in a full audit. The two most critical architectural problems are:

1. **Two simultaneous toast mechanisms** — Mechanism A (index.html) and Mechanism B (app.js) both fire on every push → double toast, double sound, double history save.
2. **Missing GAS endpoint** — `sw.js` calls `driver_pending_notifications` which doesn't exist in GAS → every empty push shows a generic "new notification" fallback.

**Decision:** Remove Mechanism A entirely. All notification handling goes through Mechanism B (app.js). This is the only mechanism that supports all 12 notification types.

---

## 12 Notification Types — Full Spec

### Severity / Color / Icon matrix

| Type | Severity | Color | Icon |
|------|----------|-------|------|
| `overdue` | critical | `#f85149` | alert-circle |
| `urgent` | urgent | `#e3b341` | alert-triangle |
| `plan` | plan | `#58a6ff` | calendar |
| `km_update` | info | `#8b949e` | clock |
| `test_due` | urgent | `#e3b341` | bar-chart |
| `test_urgent` | critical | `#f85149` | bar-chart |
| `garage_approved` | approved | `#3fb950` | check |
| `garage_rejected` | info | `#8b949e` | x-circle |
| `garage_appointment_set` | plan | `#58a6ff` | calendar-check |
| `garage_appointment_cancelled` | info | `#8b949e` | calendar-x |
| `fuel_high` | urgent | `#e3b341` | fuel |
| `fuel_km_high` | info | `#8b949e` | dollar-sign |

### Per-type content spec

**overdue** — "טיפול באיחור"
- Body: "הרכב עבר את מועד הטיפול לפני {kmLeft} ק"מ. יש לתאם מיידית."
- Chips: חריגה (kmLeft), מד (currentKm), הבא לטיפול (nextKm), צפי (estKm)
- CTA: "בקש תור מוסך" → navigates to garage request
- Auto-dismiss: 10s

**urgent** — "טיפול מתקרב"
- Body: "נותרו {kmLeft} ק"מ עד לטיפול הבא. מומלץ לתאם בשבוע הקרוב."
- Chips: נותר (kmLeft), עד טיפול (nextKm)
- CTA: "תזמן טיפול"
- Auto-dismiss: 8s

**plan** — "תכנן טיפול עתידי"
- Body: "נותרו {kmLeft} ק"מ עד לטיפול הבא. כדאי להתכונן מראש."
- Chips: נותר (kmLeft), הבא ב (nextKm)
- CTA: "צפה בפרטים"
- Auto-dismiss: 6s

**km_update** — "עדכן קילומטראז׳"
- Body: "לא עדכנת קילומטראז׳ כבר {daysSinceUpdate} ימים."
- Chips: מד אחרון (lastKm), לפני (daysSinceUpdate ימים)
- CTA: "עדכן עכשיו" → opens km update form
- Auto-dismiss: 8s

**test_due** — "טסט רכב מתקרב"
- Body: "הטסט הבא חייב להתבצע לפני {testDate}. נותרו {daysLeft} ימים."
- Chips: תאריך (testDate), ימים (daysLeft)
- CTA: "הוסף תזכורת"
- Auto-dismiss: 8s

**test_urgent** — "טסט רכב — דחוף!"
- Body: "הטסט פג תוקף בעוד {daysLeft} ימים! יש לבצע מיידית."
- Chips: תאריך טסט (testDate), נותרו (daysLeft ימים)
- CTA: "בצע טסט"
- Auto-dismiss: 10s

**garage_approved** — "בקשת מוסך אושרה!"
- Body: "הבקשה אושרה על ידי המנהל. ניתן כעת לקבוע מועד מוסך."
- Chips: מוסך (garageInfo)
- CTA primary: "קבע מועד" | CTA secondary: "מאוחר יותר"
- Auto-dismiss: none (requireInteraction)

**garage_rejected** — "בקשת מוסך נדחתה"
- Body: "הבקשה נדחתה. ניתן לשלוח בקשה חדשה."
- Chips: סיבה (reasonLabel)
- CTA: "שלח בקשה חדשה"
- Auto-dismiss: 8s

**garage_appointment_set** — "תור מוסך נקבע"
- Body: "מנהל קבע עבורך תור מוסך. {appointmentDate} · {appointmentTime}."
- Chips: מוסך (garageInfo), שעה (appointmentTime)
- CTA primary: "הוסף ליומן" | CTA secondary: "בסדר"
- Auto-dismiss: none (requireInteraction)

**garage_appointment_cancelled** — "תור מוסך בוטל"
- Body: "התור ב{appointmentDate} · {appointmentTime} בוטל. ניתן לקבוע מועד חדש."
- CTA primary: "קבע מועד חדש" | CTA secondary: "לא כרגע"
- Auto-dismiss: 8s

**fuel_high** — "צריכת דלק חריגה"
- Body: "צריכת הדלק גבוהה ב{pct}% מהממוצע הצפוי."
- Chips: צריכה (fuelConsumption ל׳/100ק"מ), ממוצע (fleetAverage), סף (threshold)
- CTA: "דוח צריכה"
- Auto-dismiss: 8s

**fuel_km_high** — "עלות לק"מ חריגה"
- Body: "עלות הדלק לק"מ גבוהה מממוצע הצי."
- Chips: עלות לק"מ (costPerKm ₪), ממוצע ציי (fleetAverage ₪)
- CTA: "דוח עלויות"
- Auto-dismiss: 6s

---

## Architecture

### Unified event flow (post-fix)

```
FCM Push
  └── sw.js push handler
        ├── app in foreground → postMessage({ type:'PUSH_RECEIVED', data })
        │     └── app.js _onSwMessage → showToast() + saveHistory() (ONLY HERE)
        └── app in background → showNotification() → OS status bar
              └── notificationclick → openWindow ?_notif=...
                    └── app.js _handleUrlNotif → showToast() + saveHistory()
```

**Removed:** index.html push-message listener (Mechanism A) — entirely deleted.

### SEVERITY_MAP additions (app.js)

Add to existing map:
```javascript
garage_appointment_set: 'plan',
garage_appointment_cancelled: 'info',
fuel_high: 'urgent',
fuel_km_high: 'info',
```

### ICON_BY_TYPE additions (app.js, Mechanism B)

Add:
```javascript
fuel_high: 'ic-fuel',
fuel_km_high: 'ic-dollar',
garage_appointment_set: 'ic-calendar-check',
garage_appointment_cancelled: 'ic-calendar-x',
```

### saveNotifToHistory — fields to add

```javascript
// Existing:  alertType, message, ts, severity, read
// ADD:
appointmentDate: data.appointmentDate || '',
appointmentTime: data.appointmentTime || '',
fuelConsumption: data.fuelConsumption || '',
costPerKm: data.costPerKm || '',
fleetAverage: data.fleetAverage || '',
threshold: data.threshold || '',
garageInfo: data.garageInfo || '',
testDate: data.testDate || '',
daysLeft: data.daysLeft || '',
kmLeft: data.kmLeft || '',
estKm: data.estKm || '',
nextKm: data.nextKm || '',
daysSinceUpdate: data.daysSinceUpdate || '',
reasonLabel: data.reasonLabel || '',
```

### OS Notification fix (sw.js)

**Problem:** `driver_pending_notifications` GAS endpoint doesn't exist.  
**Fix:** Remove the GAS fetch in sw.js push handler. The push payload already contains all needed data — parse it directly from `event.data.json()`. No need to fetch from GAS.

The push payload structure (sent by Cloud Run):
```json
{
  "alertType": "overdue",
  "message": "טיפול באיחור...",
  "title": "⚠️ טיפול באיחור",
  "ts": 1716543600000,
  "kmLeft": 1200,
  "nextKm": 86140
}
```

sw.js should use `payload.title` and `payload.message` directly — no GAS roundtrip.

### Dismiss fix (sw.js)

When user dismisses OS notification, clear it from `_pendingNotifs`:
```javascript
self.addEventListener('notificationclose', event => {
  const tag = event.notification.tag;
  _pendingNotifs = _pendingNotifs.filter(n => n.tag !== tag);
});
```

---

## Toast UI Design

### CSS architecture

- Single `<div id="notif-toast-container">` at top of `<body>`, `position:fixed; top:16px; inset-inline:16px; z-index:9999`
- Max 3 toasts visible; 4th stacks behind (scale 0.96, translateY +8px)
- RTL swipe-to-dismiss (swipe right = dismiss)

### Animations

| Event | Keyframe | Duration | Easing |
|-------|----------|----------|--------|
| Enter | translateY(-28px) scale(0.93) → normal | 450ms | cubic-bezier(0.34,1.56,0.64,1) |
| Exit | normal → translateY(-16px) scale(0.96) opacity(0) | 280ms | ease-in |
| Swipe dismiss | translateX(110%) opacity(0) | 300ms | ease-out |
| Critical pulse | scale(1)→scale(2.2) opacity(0) loop | 1.5s | ease-out |
| Progress bar | width 100%→0% | 6s (critical:10s) | linear |

### Toast structure (HTML)

```html
<div class="notif-toast sev-{severity}" data-ts="{ts}" data-type="{alertType}">
  <div class="nt-header">
    <div class="nt-icon">{SVG icon}</div>
    <div class="nt-meta">
      <div class="nt-title">{title}</div>
      <div class="nt-time">{relativeTime}</div>
    </div>
    <div class="nt-badge">{severityLabel}</div>
    <button class="nt-close">×</button>
  </div>
  <div class="nt-body">{message with highlights}</div>
  <div class="nt-chips">{data chips}</div>
  <div class="nt-actions">{CTA buttons}</div>
  <div class="nt-progress"><div class="nt-progress-fill"></div></div>
</div>
```

---

## History Screen

### renderNotifHistory — per-type meta rows

Each card shows meta-data grid (2 columns) with type-specific fields:
- `overdue/urgent/plan`: kmLeft, nextKm, estKm
- `test_due/test_urgent`: testDate, daysLeft
- `garage_approved`: garageInfo (full width)
- `garage_appointment_set/cancelled`: appointmentDate, appointmentTime, garageInfo
- `fuel_high`: fuelConsumption, threshold, fleetAverage
- `fuel_km_high`: costPerKm, fleetAverage
- `km_update`: daysSinceUpdate, lastKm

### History card CTA (active navigation)

| Type | CTA label | Action |
|------|-----------|--------|
| overdue/urgent | "בקש מוסך" | openGarageRequest() |
| garage_approved | "קבע מועד" | helpGarage() |
| garage_appointment_set | "הוסף ליומן" | addToCalendar() |
| km_update | "עדכן ק"מ" | openKmForm() |
| fuel_high/fuel_km_high | "דוח צריכה" | openFuelReport() |

---

## GAS — driver_pending_notifications endpoint

**Decision:** Do NOT add this endpoint. Instead, fix sw.js to use push payload directly (it already contains all needed data). This removes the dependency on a GAS roundtrip when the app is in background.

---

## What is NOT changing

- Cloud Run push sender — payload structure already correct
- FCM subscription / VAPID keys
- Firebase garage sync channels
- Sound playback (_playNotifSound)
- dedup by `ts`
- `?_notif=` URL param handling
