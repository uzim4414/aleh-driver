# Bug Session — כפילות התראות
**Date:** 2026-06-03  
**Fixed in commit:** `7ea66be`  
**Files touched:** `driver/app.js` only

---

## תיאור הבעיה

משתמשים ראו כפילויות בהתראות — כרטיסים כפולים במסך ההיסטוריה ו/או badge שמציג מספר שגוי.

---

## חקירה — מה כבר קיים ועובד

לפני זיהוי הפער, נמצא שמנגנון ה-dedup **כבר מקיף מאוד**:

| שכבה | פונקציה | מה היא בודקת |
|------|---------|--------------|
| 1 | `_notifDedupKey` (line 480) | `eventId` → `requestNumber` → `sig:alertType\|title\|body\|vehicleId` |
| 2 | `_notifDedupTtlSeen` (line 543) | TTL 30s בזיכרון לכל `eventId+alertType` |
| 3 | `saveNotifToHistory` (line 648–658) | ts + eventId+alertType + sig (שלוש שכבות) |
| 4 | `dedupNotifList` (line 488) | sig + ts על כל רשימה |
| 5 | `getNotifHistory` (line 506) | קורא `dedupNotifList` על **כל** קריאה מ-localStorage |
| 6 | `loadNotifHistoryFromGAS` (line 1605) | `dedupNotifList(merged)` אחרי כל ה-merge |
| 7 | Firebase listener (line 314) | `dedupNotifList(items)` לפני כתיבה ל-localStorage |

**מסקנה:** כפילויות של כרטיסים במסך ההיסטוריה מוגנות מכל הכיוונים.

---

## הפער האמיתי — badge count לא עקבי

### שורש הבאג

שתי פונקציות ספרו `unread` בשיטות שונות:

**Firebase listener (line 318–320) — שיטה א׳:**
```javascript
var clearedAt = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
var unread = items.filter(function(n) { return n.ts > clearedAt; }).length;
// items = dedupNotifList(items) ← לאחר dedup ✓
// clearedAt = מועד "נקה הכל" האחרון ✓
```

**`loadNotifHistoryFromGAS` (line 1610–1612 לפני תיקון) — שיטה ב׳:**
```javascript
var lastSeen = parseInt(localStorage.getItem('driver_notif_last_seen') || '0', 10);
var unread = gasNotifs.filter(function(n) { return n.ts > lastSeen; }).length;
// gasNotifs = לפני dedup ✗
// lastSeen ≠ clearedAt ✗
```

**שני כשלים:**
1. `gasNotifs` — לפני dedup. אם GAS החזיר כפילויות (2 ts שונים לאותה התראה לוגית), `unread` = 2 במקום 1.
2. `lastSeen` במקום `clearedAt` — גורם לקפיצות badge בין GAS pull ל-Firebase listener.

### דוגמה לתסריט הכשל

```
1. FCM → saveNotifToHistory → incrementUnreadBadge() → badge = 1
2. Firebase listener → clearedAt-based count → badge = 1 ✓
3. loadNotifHistoryFromGAS → lastSeen-based count על pre-dedup list → badge = 2 ✗
4. Firebase listener → badge = 1 ✓
→ badge מקפץ 1→2→1 מול עיני המשתמש
```

---

## התיקון

**שורות 1609–1611 (אחרי שינוי):**
```javascript
/* Badge count from the deduplicated merged list, using clearedAt (same
   reference point as the Firebase listener) so the two sources agree. */
var unread = merged.filter(function(n) { return n.ts > clearedAt; }).length;
localStorage.setItem('driver_notif_unread', String(unread));
_applyBadgeCount(unread);
```

`clearedAt` כבר מוצהר בשורה 1540 — אין צורך בהצהרה חדשה.

---

## אימות

```bash
node --check app.js  # ← נקי

node -e "
const s = require('fs').readFileSync('app.js','utf8');
const start = s.indexOf('async function loadNotifHistoryFromGAS');
const fn = s.slice(start, start + 6000);
console.log('uses merged + clearedAt:', fn.includes('merged.filter(function(n) { return n.ts > clearedAt'));
console.log('no pre-dedup badge:', !fn.includes('gasNotifs.filter(function(n) { return n.ts > lastSeen'));
"
# uses merged + clearedAt: true
# no pre-dedup badge: true
```

---

## פונקציות שלא שונו

כל מנגנוני ה-dedup הקיימים נשמרו ללא שינוי:
- `_notifDedupKey` — לא שונה
- `dedupNotifList` — לא שונה
- `_notifDedupTtlSeen` — לא שונה
- `saveNotifToHistory` — לא שונה
- `getNotifHistory` — לא שונה
- Firebase listener logic — לא שונה
- `loadNotifHistoryFromGAS` merge loop — לא שונה (רק חישוב badge בסוף)
