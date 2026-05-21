# QA — Garage Appointment Sync Bug (2026-05-21)

## תקלה: אפליקציה מציגה "אושר, עוד לא נקבע תור" כשמנהל קבע תור

**תסמין:** לאחר קביעת תור דרך יומן Fleet Manager, אפליקציית הנהג מציגה מצב "אושר אך תאריך לא נקבע" (approvedGarageRequest) במקום "תור נקבע" (activeGarageAppointment).

**שורש:** `adminSetAppointment` ב-code.js שלח push FCM עם `alertType: 'garage_approved'` במקום alertType ייחודי לקביעת תור. ה-handler בapp.js ראה `garage_approved` ושמר `approvedGarageRequest` — מה שהכניס את ה-UI למצב "ממתין לקביעת תאריך".

**תיקון:**

**code.js** — `adminSetAppointment` (שורה ~17518):
```
לפני: alertType: 'garage_approved'
אחרי: alertType: 'garage_appointment_set'
+ נוספ: managerNote: managerNote || ''
```

**app.js** — `saveNotifToHistory` (שורה ~490):
נוסף בלוק חדש לטיפול ב-`garage_appointment_set`:
- מנקה pendingGarageRequest + approvedGarageRequest
- שומר activeGarageAppointment עם תאריך/שעה מה-meta
- קורא ל-_fbSetActiveAppointment + renderGarageApptWidget

**sw.js** — גרסה v86:
- TYPE_CONFIG: נוסף `garage_appointment_set` עם vibrate[200,100,200,100,200]
- LABEL map: נוסף `'📅 תור מוסך נקבע'`
- CACHE_NAME: v86

**לקח:** כל פעולה בעלת משמעות שונה חייבת alertType ייחודי. `garage_approved` = אישור בקשה ממתינה. `garage_appointment_set` = קביעת תאריך על ידי מנהל. ערבוב ביניהם גורם למצב UI שגוי.

**מצב state machine מלא (תיקון):**
| פעולה | alertType | localStorage target |
|-------|-----------|-------------------|
| אישור בקשת נהג | `garage_approved` | `approvedGarageRequest` |
| דחיית בקשת נהג | `garage_rejected` | clear `pendingGarageRequest` |
| קביעת תור מיומן | `garage_appointment_set` | `activeGarageAppointment` |
| ביטול תור | Firebase `cancelled` | clear `activeGarageAppointment` |
