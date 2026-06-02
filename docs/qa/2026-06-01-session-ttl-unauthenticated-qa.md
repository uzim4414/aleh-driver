# QA — שגיאת unauthenticated בייבוא פזומט

**תאריך:** 2026-06-01
**מודול:** Auth — Session Management
**קובץ:** `13.4.26/code.js`
**סטטוס:** נפתר — deployed @2545
**commit:** `a660f78`

---

## תיאור הבעיה

ייבוא חשבונית פזומט נכשל ב-step 5 ("אישור") עם:
```
ScriptError: Error: unauthenticated
```

עד היום עבד. לא קשור לשינויים האחרונים במודול מוסך.

---

## שורש הבעיה

### Session TTL קשיח — אין sliding renewal

`_createSession` שומר session ב-`CacheService.getScriptCache()` עם TTL = **6 שעות בדיוק**.
`_getSession` קרא את הcache — ולא חידש את ה-TTL.

**תרחיש כשל:**
```
מנהל מתחבר → TTL מתחיל (6h)
            ↓
מנהל פותח wizard ייבוא פזומט
מעלה PDF → OCR → סקירה → ... (זמן עובר)
            ↓
לאחר 6h: CacheService מסיר את הsession
            ↓
step 5 "אישור" → importFuelBatch → _requirePerm → _getSession → null → throw 'unauthenticated'
```

### פונקציה שבורה שהחמירה

`index.html:7357` קוראת ל-`refreshSessionIfNeeded(APP_SESSION)` כ-keepalive — אבל **הפונקציה לא הייתה קיימת בcode.js**. הקריאה נבלעה ב-`try/catch` בשקט.

---

## התיקון

### 1. Sliding TTL ב-`_getSession`
```javascript
// בכל קריאה מוצלחת — מחדש 6 שעות
cache.put('sess_' + sessionToken, raw, 21600);
```

### 2. הוספת `refreshSessionIfNeeded`
```javascript
function refreshSessionIfNeeded(sessionToken) {
  try {
    var sess = _getSession(sessionToken); // sliding put done inside
    return { ok: !!sess };
  } catch(e) { return { ok: false }; }
}
```

---

## לקחים

| # | לקח |
|---|-----|
| 1 | **Session TTL ללא sliding = bomb מתקתק.** כל wizard/תהליך ארוך יכשל אחרי 6h. |
| 2 | **keepalive שנקרא לפונקציה לא קיימת = שקט מסוכן.** `try/catch` בלי log גורם לתיקונים "עובדים" שלא עושים כלום. |
| 3 | **GAS CacheService can evict early** — גם לפני 6h בלחץ זיכרון. Sliding TTL מגן גם מזה. |
| 4 | **שגיאת "unauthenticated" בstep מאוחר** = לא תמיד בעיה בpermissions — לפעמים פשוט session פג. |
| 5 | **כל function שקוראים לה מ-index.html** — לוודא שהיא קיימת ב-code.js. |

---

## בדיקה ידנית

- [ ] התחבר → המתן >10 דקות → נסה פעולה authed → עובד (sliding מחדש TTL)
- [ ] ייבוא פזומט מלא (5 steps) → אין unauthenticated
