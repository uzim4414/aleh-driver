# QA — אירוע קיצוץ code.js (Race Condition)

**תאריך גילוי:** 2026-05-25
**תאריך האירוע:** 2026-05-24 11:48
**חומרה:** קריטי — 122 פונקציות GAS לא פעלו ~24 שעות
**סטטוס:** נפתר + מוגן

---

## תיאור האירוע

`code.js` קוצץ בשקט מ-17,831 שורות ל-13,120 שורות (אובדן 122 פונקציות) בתאריך 24.5.2026 בשעה 11:48. הקיצוץ לא התגלה ~24 שעות עד שה-clasp push נכשל עם SyntaxError בסשן פיתוח חדש (25.5.2026).

**אירוע ראשון (23.5):** 17,528 → 4,051 שורות — התגלה ותוקן תוך 6 דקות.
**אירוע שני (24.5):** 17,831 → 13,120 שורות — לא התגלה ~24 שעות.

---

## שורש הבעיה

**Race condition** בין Python patcher לבין watch.ps1:

```
[Python patcher]         [watch.ps1 - רץ ברקע]
open(code.js, 'wb')  →  זוהה שינוי
כותב bytes...        →  Get-Content -Raw ← קורא קובץ חלקי!
                     →  WriteAllText     ← כותב קיצוץ בחזרה
                     →  clasp push       ← פורס גרסה פגומה
סוגר קובץ
```

הקובץ נחתך באמצע string literal: `'מתוך ' + fleetSiz` — ללא `}`, `;`, או `\n`.

**6 כשלי הגנה שאיפשרו:**
1. Python patchers לא בדקו גודל אחרי כתיבה
2. `Invoke-BumpSchemaVersion` לא בדק שהתוכן שקרא תקין
3. `backup.py` שמר כל קובץ > 0 bytes ללא השוואה
4. אין git pre-commit hook
5. אין post-push verification
6. כתיבה ישירה (לא atomic) פתחה race window

---

## פונקציות שאבדו (חלקי — 122 סה"כ)

`onOpen`, `_driverAuth`, `sendFuelAlerts`, `getGarageRequests`, כל `_api_db*` (הגנת DB), כל driver auth, כל garage admin, כל triggers, כל FCM/push handlers.

---

## שחזור

```powershell
# שוחזר מגיבוי 20260522_000009_code.js (17,823 שורות, גרסה שלמה)
# + הוספת בלוק lifecycle-banner מהסשן הנוכחי
# תוצאה: 18,007 שורות / 452 פונקציות
```

Commit: `ee41dcf fix(code): restore full code.js from May-22 backup + lifecycle block`

---

## פתרון — 4 שכבות הגנה (ממומשות 2026-05-25)

| שכבה | מה | היכן |
|------|-----|------|
| 1 | Size guard + atomic write בכל Python patcher | כל `patch_*.py` |
| 2 | Git pre-commit hook — חוסם >10% קיצוץ | `.git/hooks/pre-commit` |
| 3 | backup.py מסרב לשמור קובץ שהתכווץ >5% | `backup.py` |
| 4 | watch.ps1 — 3 guards + anti-race + atomic BumpSchema | `watch.ps1` |

---

## לקחים

1. **עצור את watch.ps1** לפני הרצת Python patcher — הוא הגורם לrace
2. כל patcher חייב: `assert new_size >= old_size * 0.95` + כתיבה ל-`.tmp` ואז `os.replace`
3. `backup.py` שומר גיבוי = לא מספיק — חייב גם לאמת שהקובץ לא התכווץ
4. תסמין מוקדם: clasp push מהיר בחריגה → פחות שורות = פחות זמן העלאה
5. בדוק `wc -l code.js` אחרי כל שינוי לפני push
6. הגיבויים הצילו את המצב — 5,829 קבצים, גרנולריות של שניות
