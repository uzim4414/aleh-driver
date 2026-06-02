# Bug Session — Garage Approved Request Lifecycle
**Date:** 2026-06-03  
**Reported by:** User  
**Fixed in commit:** `a8d5adb`  
**Files touched:** `driver/app.js` only

---

## Bug 1: בקשה מבוטלת נפתחת מחדש דרך התראה ישנה

### תיאור
לאחר שמנהל אישר בקשת מוסך (**garage_approved**) והנהג ביטל את הבקשה דרך ממשק עזרה, לחיצה על כפתור "קבע תור" בהתראה הישנה פתחה מחדש את הבקשה המבוטלת.

### שרשרת כשלים (שני כשלים)

**כשל ראשי — `_garageDoCancelAppointment` לא ניקה מצב מאושר**

`_garageDoCancelAppointment()` ניקה רק:
- `activeGarageAppointment` מ-localStorage
- Firebase `activeAppointment`

אבל **לא ניקה**:
- `approvedGarageRequest` מ-localStorage  
- Firebase `approvedGarage`

לכן לאחר ביטול — המצב המאושר נשאר בזיכרון.

**כשל משני — fallback ב-`_garageShowApprovedFromStorage` החיה מחדש את הבקשה**

כאשר localStorage ריק (אחרי תיקון ראשי), אבל ה-`meta` המוקפא ב-onclick של כרטיס ההתראה הכיל `eventId`, פונקציית `_garageShowApprovedFromStorage` **כתבה את ה-snapshot הישן חזרה** ל-localStorage ול-Firebase:

```javascript
// הקוד הבעייתי שהוסר:
if (!approved && meta && meta.eventId) {
  localStorage.setItem('approvedGarageRequest', JSON.stringify(_metaApproved));
  _fbSetApprovedGarage(_metaApproved);  // ← החיה מחדש ל-Firebase!
}
```

### תיקונים

**תיקון 1a** — `_garageDoCancelAppointment` (line ~5639):
```javascript
// נוסף:
APP._garageClearApproved();
```

**תיקון 1b** — `_garageShowApprovedFromStorage`:
הוסר בלוק ה-fallback כולו. אם localStorage ריק → `APP.helpGarage()` ישירות.

---

## Bug 2: מספר בקשה מתהפך בממשק (41→77)

### תיאור
לאחר לחיצה על "קבע תור" בהתראה מאושרת, ממשק עזרה > מוסך הציג את מספר הבקשה הנכון (#41) ואז לאחר 2-3 שניות התהפך למספר ישן (#77).

### שרשרת הכשל — Race Condition

1. **Firebase listener** נצמד מוקדם (בזמן auth) עם snapshot ישן (#77) ב-cache
2. **משתמש לוחץ "קבע תור"** → localStorage מתעדכן ל-#41 → UI מציג #41 ✓
3. **כ-2-3 שניות לאחר מכן** — Firebase מפעיל את ה-snapshot הישן (#77)
4. **שורה 395** (לפני תיקון): `localStorage.setItem('approvedGarageRequest', newStr)` — מחליף ל-#77 ללא בדיקת timestamp
5. **שורה 396**: `APP.helpGarage()` → re-render → UI מציג #77

הבעיה: ה-listener לא בדק האם הנתון מ-Firebase חדש יותר או ישן יותר מזה שב-localStorage.

### תיקון

הוספת timestamp guard ב-`approvedRef.on('value')` listener:

```javascript
// נוסף לפני הכתיבה ל-localStorage:
var _prev = JSON.parse(prevRaw || '{}');
var _prevAt = _prev.approvedAt || 0;
var _newAt  = data.approvedAt  || 0;
if (_prevAt && _newAt && _newAt < _prevAt) {
  // Firebase snapshot ישן יותר — דחה אותו ו-sync Firebase לנתון החדש
  _fbSetApprovedGarage(_prev);
  return;
}
```

---

## סיכום תיקונים

| # | פונקציה | שינוי | שורה משוערת |
|---|---------|-------|-------------|
| 1a | `_garageDoCancelAppointment` | נוסף `APP._garageClearApproved()` אחרי `_fbClearActiveAppointment()` | ~5639 |
| 1b | `_garageShowApprovedFromStorage` | הוסר fallback שכתב meta ישן חזרה לstorage | ~5360 |
| 2 | `approvedRef.on('value')` listener | נוסף timestamp guard לדחיית snapshot ישן | ~395 |

## אימות

```bash
node --check app.js  # ← נקי
node -e "
const s = require('fs').readFileSync('app.js','utf8');
const fnIdx = s.indexOf('APP._garageDoCancelAppointment = ');
const fnBody = s.slice(fnIdx, fnIdx + 1200);
console.log('clearApproved in cancel:', fnBody.includes('_garageClearApproved'));
console.log('stale fallback removed:', !s.includes(\"localStorage.setItem('approvedGarageRequest', JSON.stringify(_metaApproved))\"));
console.log('timestamp guard:', s.includes('_newAt < _prevAt'));
"
# clearApproved in cancel: true
# stale fallback removed: true
# timestamp guard: true
```

## לוגיקה שלא שונתה

הפונקציות הבאות **לא נגעו** ועובדות כרגיל:
- `_garageSubmitRequest()` — שליחת בקשה חדשה
- `_garageConfirmAppointment()` — אישור תור (קורא ל-`_garageClearApproved` בעצמו)
- `_garageClearApproved()` — לא שונה, רק נקרא ממקום נוסף
- `_fbSetApprovedGarage()` — לא שונה
- `saveNotifToHistory()` — לא שונה (ממשיך לשמור approved state בקבלת notification חדש)
