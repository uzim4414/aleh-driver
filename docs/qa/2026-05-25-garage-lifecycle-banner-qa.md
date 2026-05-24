# QA — Garage Request Lifecycle Banner

**תאריך:** 2026-05-25  
**מודול:** GAS Admin UI — מודאל קביעת תור, באנר בקשת מוסך  
**קבצים:** 13.4.26/code.js · 13.4.26/index.html  
**סטטוס:** הושלם — deployed  
**פלאן:** `driver/docs/plans/2026-05-25-garage-request-lifecycle-banner.md`

---

## שינויים שבוצעו

### שרת (code.js)
- הוספו עמודות `history` + `cancelCount` ל-FIELD_EVENTS_COLS
- נוסף helper `_appendFieldEventHistory()` — כתיבה לפי header-lookup, לא positional
- נוספו handler-ים מלאים עם history hooks:
  - `_garageRequestAction` — `action: 'cancelled_by_driver'`
  - `_garageSetAppointment` — `action: 'appointment_set'`
  - `_cancelAppointment` — `action: 'cancelled_by_driver'` + bump cancelCount
  - `approveGarageRequest` — `action: 'approved'`
  - `rejectGarageRequest` — `action: 'rejected'`
  - `closeGarageRequest` — `action: 'closed'`
- `getGarageRequests` מורחב — מחזיר history, cancelCount, details מלא (description, garageName, garageAddress, km, kmToService, licensePlate)

### קליינט (index.html)
- `_gcApprovedByVehicle` תוקן: עדיפות appointment_set > approved > pending (היה הפוך), tie-break לפי timestamp
- 20+ שדות חדשים מועברים לאובייקט הבאנר
- `_gcUpdatePendingInfo` הוחלף — הפעיל `_glbRenderBanner`
- נוספו `_glbRenderBanner`, `_glbTimeline`, `_glbBadges`, `_glbFoot`, `_glbDescBlock`, `_glbIcon`, `_glbHumanDate`, `_glbActionLabel`, `_glbSeverity`
- CSS חדש: `.glb-card` + 3 variants (pending/approved/appointment), timeline dots, badges
- חסימת שמירה כשלרכב יש pending request (`_gcSaveAppointment` + `_gcAlert`)

---

## בדיקות ביצוע

| # | בדיקה | תוצאה |
|---|-------|--------|
| 1 | backup.py לפני כל שינוי | ✅ |
| 2 | FIELD_EVENTS_COLS כולל history + cancelCount | ✅ |
| 3 | _appendFieldEventHistory — header-lookup ולא positional | ✅ |
| 4 | כל 6 handlers קוראים ל-_appendFieldEventHistory עם action נכון | ✅ |
| 5 | getGarageRequests מחזיר history + cancelCount + details | ✅ |
| 6 | _gcApprovedByVehicle — עדיפות appointment_set > approved | ✅ |
| 7 | 20 שדות ב-_gcApprovedByVehicle כולל history, cancelCount | ✅ |
| 8 | CSS 3 variants + timeline dots + badges | ✅ (20/20 spec checks) |
| 9 | pending variant — כותרת "ממתינה לאישור" | ✅ |
| 10 | approved variant — תיאור תקלה + הערת מנהל | ✅ |
| 11 | staleness badge אחרי 7 ימים | ✅ |
| 12 | cancel badge לפי cancelCount | ✅ |
| 13 | pending save guard — _gcAlert ולא confirm() | ✅ |
| 14 | SVG icons (לא emoji) | ✅ |
| 15 | pre-flight escape scan — 0 bad strings | ✅ |
| 16 | clasp push הצליח | ✅ |

---

## תקלות שנמצאו בזמן המימוש

### תקלה #1 — git repo הותחל מחדש ב-13.4.26/
- **תיאור**: הממשה המצא שאין git repo ב-13.4.26/ ואתחל אחד חדש — קבצים נרשמו כ-"חדשים" גם אם היו קיימים
- **שורש**: ה-repo הראשי נמצא כנראה בתיקיית parent
- **תיקון**: השינויים עצמם נכונים; git blame לא יראה diff נקי אבל הקוד עבד
- **לקח**: לפני Task 1 בשלב הבא — וודא שה-git add/commit מתבצע מה-repo הנכון

### תקלה #2 — _gcEsc כבר קיים ב-index.html
- **תיאור**: ה-patcher הכיל הגדרת _gcEsc חדשה אבל הפונקציה כבר קיימת
- **שורש**: הפלאן לא בדק אם _gcEsc קיים לפני הוספת duplicate
- **תיקון**: agent בדק וזיהה, השמיט את ה-duplicate
- **לקח**: תמיד לבדוק אם פונקציית עזר קיימת לפני הוספה

### תקלה #3 — code.js קוטע (pre-existing truncation)
- **תיאור**: clasp push נכשל בשגיאת SyntaxError בשורה 13182 — ה-file היה קטוע ב-13174 (פונקציה שנגמרה באמצע). גרם לכך שכל 117 פונקציות שנמצאות אחרי נקודת הקטיעה (כולל onOpen, getProtectionHealth, sendFuelAlerts וכד') לא היו קיימות בגרסה המקומית
- **שורש**: תקלה קיימת מ-2026-05-23 — write מחודש לקובץ GAS גדול גרם לקטיעה. הבאקאפ מ-20260522_000009 (17823 שורות) הוא האחרון השלם לפני הקטיעה
- **תיקון**: שחזור מ-backup גרסה 20260522_000009 (1,224,077 bytes) + הוספת בלוק ה-lifecycle שלנו (8,751 bytes) → קובץ חדש 18,008 שורות עם 436 פונקציות. clasp push הצליח
- **לקח**: GAS V8 — function declarations מאוחרות מנצחות, לכן ה-override pattern עבד. תמיד לוודא ש-code.js מתחיל בצורה שלמה לפני כל push

---

## לקחים

- **history column חייב להיות appended** — אסור לשנות סדר עמודות קיימות ב-FIELD_EVENTS_COLS
- **GAS function shadowing** — אם פונקציה קיימת + גרסה חדשה נוספת — הגרסה האחרונה בקובץ מנצחת ב-GAS V8
- **bytes.replace() ONLY** — לעולם לא PowerShell -replace על קבצי GAS גדולים
- **_requirePerm signature** — תמיד לאמת חתימת פונקציה לפני שימוש ב-wrapper
- **SyntaxError = בדוק ABOVE the error line** — GAS מצביע על ה-token שבא אחרי הקטיעה, לא על מקום הקטיעה עצמה
- **backup.py חובה לפני כל כתיבה לקבצי GAS** — ה-backup שמר את גרסת 20260522_000009 שאיפשרה שחזור מלא
