# QA — Garage Request Number Fix & Multi-Request Selector

**תאריך:** 2026-06-01
**מודול:** מוסך — מספר תקלה + סלקטור בקשות מרובות
**קבצים:** `13.4.26/code.js` · `13.4.26/index.html` · `driver/app.js`
**סטטוס:** הושלם — deployed @2538
**פלאן:** `driver/docs/plans/2026-06-01-garage-appointment-requestnumber-fix.md`

---

## מה שבנינו

### בעיות שנפתרו
1. **מספר תקלה `#15` תקוע** — widget ב-app הציג מספר תקלה ישנה/מבוטלת לנצח
2. **מנהל לא יכול לפתוח תור עצמאי** — כל תור הוצמד לבקשה קיימת אוטומטית
3. **מספר תקלה לא אמיתי** — נגזר בכל מקום מ-`eventId` trailing digits (מונה גלובלי)
4. **אפליקציה לא ניקתה widget ישן** כשמכשיר היה offline בעת ביטול

### מה שנבנה
- `requestNumber` — שדה אמיתי בגיליון `אירועי_שטח` (עמודה 20), מונה sequential per-vehicle
- `_nextVehicleRequestNumber` — helper שמחשב מספר נכון
- `_reqNumOrDerive` — helper שקורא שדה אמיתי ומחזיר fallback לשורות ישנות
- `driver_garage_status` — GAS endpoint חדש להשוואת מצב server מול localStorage
- `_reconcileGarageStatus` — reconciliation בפתיחת אפליקציה (מנקה widget עם eventId ישן)
- תיקון `consumed` flag — widget מנוקה גם אם canceled event כבר consumed
- `standalone` param — מנהל יכול לקבוע תור ללא בקשה קיימת
- **Multi-request selector** — רשימת כל הבקשות הפתוחות לנהג + "תור עצמאי"

---

## Commits

| Commit | תיאור |
|--------|-------|
| `186fe7d` | feat: add requestNumber column + per-vehicle counter |
| `ea18ac9` | refactor: read requestNumber from real column |
| `3fcb78c` | refactor(ui): use real requestNumber in index.html |
| `8931305` | refactor(driver): prefer real requestNumber in app.js |
| `d37c43f` | feat: driver_garage_status endpoint |
| `c380958` | feat: reconcile stale garage widget on startup |
| `4417c28` | fix: clear cancelled widget regardless of consumed flag |
| `c30f6a7` | feat: standalone param in adminCreateAppointment |
| `dd882bf` | feat: multi-request selector + standalone in modal |
| `e8c507b` | fix: isDirectVeh+standalone in conflict-override payload |
| `834f79b` | fix: _reqNumConfirm undeclared (requestNumber always '') |
| `542c666` | fix: legacy fallback uses matchCount not global counter |
| `73cc103` | fix: block standalone appt when pending request exists |
| `1944e48` | fix: restore requestNumber chip in edit overlay |

---

## באגים שנמצאו בזמן code review (לאחר implementation)

| באג | חומרה | תיאור | תוקן ב |
|-----|-------|--------|--------|
| B1 | 🔴 קריטי | `_gcConflictOverride` — `isDirectVeh` לא מוגדר ב-payload → override קורא לפונקציה הלא נכונה | `e8c507b` |
| B2 | 🔴 קריטי | `_reqNumConfirm` לא מוצהר ב-`_garageConfirmAppointment` → `requestNumber` תמיד `''` | `834f79b` |
| B3 | 🟠 גבוה | `_nextVehicleRequestNumber` legacy fallback משתמש במונה גלובלי במקום per-vehicle | `542c666` |
| B4 | 🟠 גבוה | Pending guard מת כשאין `_gcSelectedRequest` (standalone path) | `73cc103` |
| B5 | 🟡 בינוני | `reqChip = ''` hardcoded ב-`_garageEditAppointment` — chip נעלם | `1944e48` |

---

## לקחים

1. **Code review חובה לפני deploy** — 5 באגים נמצאו ב-review שלא נתפסו ב-spec review. שני קריטיים.
2. **כשמוחקים variable — לחפש כל שימוש בו** — `_reqNumConfirm` הוסר אבל הפניה ב-`_apptData` נשארה.
3. **payload objects דורשים תיעוד** — `_gcSavePayload` שמשמש גם `_gcConflictOverride` — כל שדה שהוסר/הוחלף צריך לעבור גם ל-conflict override.
4. **Legacy data fallback = סכנה** — כל fallback שנגזר מ-field שאינו per-vehicle יפגע בנתונים ישנים.

---

## היכן מוצג מספר תקלה — App צד נהג

| # | פונקציה | מיקום | תצוגה | מתי |
|---|---------|--------|-------|-----|
| 1 | `renderGarageApptWidget` | Home widget | chip `בקשה #N` | תור פעיל במסך ראשי |
| 2 | `_garageShowPending` | Help card | שורה `מספר פנייה: #N` | ממתין לאישור מנהל |
| 3 | `_garageShowApproved` | Help card | שורה `מספר תקלה: #N` | לאחר אישור |
| 4 | `_garageEditAppointment` | Bottom overlay | badge `🔧 #N` | עריכת תור |
| 5 | `showInAppNotification` | Toast | badge `מספר תקלה #N` | push notif מוסך |
| 6 | `_buildToastChips` | Toast chips | chip `מספר תקלה: #N` | garage_approved/rejected/set/cancelled |
| 7 | `renderNotifHistory` | Alerts tab | meta row `בקשה: #N` | היסטוריית התראות (expanded) |

---

## בדיקות ידניות מומלצות

- [ ] נהג שולח בקשה חדשה → `requestNumber` בגיליון = 1 (ראשונה לרכב)
- [ ] נהג שני שולח בקשה → מספר = 1 (per-vehicle, לא גלובלי)
- [ ] מנהל מאשר → FCM push מציג `#1`
- [ ] Widget מציג chip `בקשה #1`
- [ ] מנהל פותח מודל לנהג עם 2 בקשות → רשימה מוצגת
- [ ] בחירת "תור עצמאי" + אין pending → נשמר ADM- עם requestNumber
- [ ] בחירת "תור עצמאי" + יש pending → נחסם עם alert
- [ ] נהג offline בעת ביטול → פתיחת app מנקה widget
- [ ] שורות ישנות (requestNumber ריק) → מספר מוצג מ-matchCount fallback
