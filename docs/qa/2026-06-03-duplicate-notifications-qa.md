# Bug Session — כפילות התראות (חקירה מלאה)
**Date:** 2026-06-03  
**תיקון אחרון:** `e3e66ce`  
**Files touched:** `driver/app.js` only

---

## תיאור הבעיה שדווחה

לאחר הגעת התראה: toast אחד (תקין), אבל **מיידית מופיעים 2 כרטיסים זהים** במסך ההיסטוריה. הופיע בכל סוגי ההתראות.

---

## שלב 1 — מה כבר היה קיים ועובד (לא שונה)

| שכבה | מיקום | מה בודק |
|------|-------|---------|
| TTL 30s | `_notifDedupTtlSeen` (line 543) | `eventId+alertType` ב-30 שניות |
| ts exact | `saveNotifToHistory` line 648 | timestamp זהה |
| eventId | `saveNotifToHistory` line 650 | `eventId+alertType` בהיסטוריה |
| sig | `saveNotifToHistory` line 658 | `alertType\|title\|body\|vehicleId` |
| `dedupNotifList` | line 488 | sig + ts על כל רשימה |
| `getNotifHistory` | line 506 | מריץ `dedupNotifList` על כל קריאה |
| GAS merge | `loadNotifHistoryFromGAS` line 1605 | `dedupNotifList` לאחר merge |
| Firebase listener | line 314 | `dedupNotifList` לפני כתיבה ל-localStorage |

**מסקנה:** כל שכבות ה-dedup היו קיימות ועובדות. הבעיה הייתה בארכיטקטורה.

---

## שלב 2 — חקירת badge count (תוקן ב-`7ea66be`)

### הבעיה
`loadNotifHistoryFromGAS` חישב badge מ-`gasNotifs` (לפני dedup) עם `lastSeen`:
```javascript
// לפני תיקון:
var unread = gasNotifs.filter(function(n) { return n.ts > lastSeen; }).length;
```

Firebase listener חישב מ-`items` (אחרי dedup) עם `clearedAt`:
```javascript
var unread = items.filter(function(n) { return n.ts > clearedAt; }).length;
```

שתי שיטות שונות → badge קפץ בין ערכים כשהמקורות ירו בזו אחר זו.

### התיקון (`7ea66be`)
```javascript
// אחרי תיקון:
var unread = merged.filter(function(n) { return n.ts > clearedAt; }).length;
```
`merged` = הרשימה המאוחדת אחרי dedup, `clearedAt` = עקבי עם Firebase listener.

---

## שלב 3 — שורש הבעיה העיקרי: כפל כתיבה ל-Firebase (תוקן ב-`e3e66ce`)

### הארכיטקטורה שגרמה לבעיה

```
[GAS Server]
  ↓
  כותב notifications/T_GAS ל-Firebase
  ↓
Firebase listener יורה → localStorage = [item_GAS] → renderNotifHistory → 1 כרטיס ✓

[FCM Push מגיע לאפליקציה]
  ↓
  showInAppNotification → saveNotifToHistory:
    • קורא localStorage = [item_GAS]
    • ts check: T_client ≠ T_GAS → לא נתפס ✗
    • eventId: אם אין eventId → לא נתפס ✗
    • sig: אם title/body שונה בין GAS storage ל-FCM payload → לא נתפס ✗
    • מוסיף item_T_client → localStorage = [item_GAS, item_T_client]
    • renderNotifHistory → 2 כרטיסים! ✗
    • _fbSaveNotif(item_T_client) → Firebase = {T_GAS, T_client}
  ↓
Firebase listener יורה שוב → dedupNotifList → localStorage = [item_GAS] → 1 כרטיס
```

**המשתמש ראה:** 1 כרטיס → 2 כרטיסים (מיידי) → 1 כרטיס

### למה sig dedup נכשל?

GAS כותב ל-Firebase עם title/body בפורמט אחד.  
FCM מעביר ל-SW עם title/body בפורמט שיכול להיות שונה.  
`sig:alertType|title|body|vehicleId` → מפתחות שונים → שניהם עוברים.

### התיקון (`e3e66ce`) — הסרת `_fbSaveNotif` מ-`saveNotifToHistory`

```javascript
// הוסר מ-saveNotifToHistory:
_fbSaveNotif(newItem); // ← Firebase sync
```

**סיבה:** GAS הוא הסמכות הבלעדית לכתיבת התראות ל-Firebase. כאשר GAS יוצר התראה:
1. כותב ל-Firebase `notifications/T_GAS`
2. שולח FCM push

הלקוח מקבל את ההתראה דרך FCM ושומר ב-localStorage. אין צורך שהלקוח יכתוב גם ל-Firebase — GAS כבר כתב שם. כתיבת הלקוח יצרה entry שני (`notifications/T_client`) שלא תמיד מוכר כ-duplicate של `notifications/T_GAS`.

### בטיחות השינוי

- **פונקציית `_fbSaveNotif` נשמרת** — לא נמחקה, רק אינה נקראת מ-`saveNotifToHistory`
- **כל שכבות ה-dedup נשמרות** — לא שונו
- **Firebase ← GAS**: הכתיבה ל-Firebase ממשיכה דרך GAS כמו תמיד
- **localStorage ← Firebase listener**: הסנכרון ממשיך כרגיל
- **אין notification שנוצר בלקוח בלי GAS** — הארכיטקטורה תמיד דורשת GAS

---

## תיקונים בסשן זה לפי סדר

| commit | תיקון |
|--------|-------|
| `7ea66be` | badge count מ-`merged` + `clearedAt` עקבי |
| `e3e66ce` | הסרת `_fbSaveNotif` מ-`saveNotifToHistory` |

---

## אימות

```bash
node --check app.js

node -e "
const s = require('fs').readFileSync('app.js','utf8');
const fn = s.slice(s.indexOf('function saveNotifToHistory'), s.indexOf('function saveNotifToHistory')+3000);
console.log('fbSaveNotif removed from history:', !fn.includes('_fbSaveNotif(newItem)'));
console.log('function definition kept:', s.includes('function _fbSaveNotif'));
const start = s.indexOf('async function loadNotifHistoryFromGAS');
const gas = s.slice(start, start + 6000);
console.log('badge uses merged+clearedAt:', gas.includes('merged.filter(function(n) { return n.ts > clearedAt'));
"
# fbSaveNotif removed from history: true
# function definition kept: true
# badge uses merged+clearedAt: true
```
