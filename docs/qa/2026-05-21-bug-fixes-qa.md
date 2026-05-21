# QA — 5 Bugs Fix Session (2026-05-21)

## באג 1: מודאל תור — בקשות ממתינות מוצגות בטעות

**תסמין:** בחירת רכב במודאל קביעת תור כוללת גם בקשות ממתינות מ-pendingGarage, לא רק רכבי DB
**שורש:** `_gcShowAppointmentModal` בנה את ה-dropdown מ-merge של `_gcAllVehicles` + `_gcPendingRequests`
**תיקון:** dropdown מציג רק `_gcAllVehicles` (רכבי DB). בקשות ממתינות מוצגות כ-readonly div נפרד מתחת לסלקט, למידע בלבד
**לקח:** שני מקורות נתונים שונים (DB vehicles vs. pending requests) חייבים להפרד חד-משמעית בממשק

---

## באג 2: Push notification — OS notification לא מוצג כשאפליקציה סגורה/background

**תסמין:** שמע צליל בלבד. ללא notification נשלף מהמסך העליון
**שורש א:** sw.js בדק `openClients.length > 0` — כל חלון פתוח (כולל ב-background) עצר את ה-OS notification
**שורש ב:** in-app toast עיצוב בסיסי מדי
**תיקון א:** sw.js — שינוי לבדיקת `focusedClients` בלבד:
```js
const focusedClients = openClients.filter(c => c.focused);
if (focusedClients.length > 0) return;
```
**תיקון ב:** OS notification משודרג: icon-512, LABEL map לפי alertType, tag מובנה, actions, timestamp
**תיקון ג:** In-app toast — bounce animation, blur entry/exit, progress bar, icon pop, shadow גדול
**לקח:** `clients.focused` חיוני לאבחון foreground/background; `clients.length > 0` לא מספיק

---

## באג 3: אירועים ישנים נשארים לאחר ביטול תור

**תסמין:** לאחר ביטול תור על ידי נהג — האירוע נשאר ב-garageSync ב-Firebase, ה-widget לא מתנקה
**שורש:** `_cancelAppointment` ב-code.js עדכן את ה-sheet אך לא קרא ל-`_firebaseSyncAdminAppointment`
**תיקון:** הוספת קריאת Firebase sync אחרי עדכון ה-sheet:
```js
try {
  var vehicleId = String(data[i][vIdx]||'');
  _firebaseSyncAdminAppointment(vehicleId, params.eventId, '', '', '');
} catch(fe) { Logger.log('_cancelAppointment firebase sync: ' + fe); }
```
**לקח:** כל פעולת שינוי סטטוס תור (קביעה/ביטול/אישור/דחייה) חייבת לסנכרן Firebase בנוסף ל-sheet

---

## באג 4: widget תור בנהג לא מתעדכן כשמנהל קובע תור

**תסמין:** קביעת תור מ-Fleet Manager לא מעדכנת את ה-widget במסך הבית של הנהג
**שורש:** מסלול Firebase שגוי — מנהל כותב ל-`garageSync/{vehicle.id}` (ID פנימי כגון "V001"), נהג מאזין ל-`garageSync/{vehicle.num}` (לוחית רישוי) בגלל:
```js
// app.js שורה 1069 — לפני תיקון
var vehicleId = STATE.vehicle && (STATE.vehicle.num || STATE.vehicle.id);
```
`num` מוגדר תמיד ב-STATE.vehicle → השתמש בלוחית, בעוד GAS כותב לפי id
**תיקון:** היפוך סדר העדיפויות:
```js
var vehicleId = STATE.vehicle && (STATE.vehicle.id || STATE.vehicle.num);
```
**לקח:** מסלול Firebase חייב להיות עקבי בין כל הצדדים (GAS writer + driver listener). `id` הוא מזהה ראשי של רכב — תמיד עדיף על `num`

---

## באג 5: כפתור ביטול תור מחזיר שגיאה

**תסמין:** לחיצה על "בטל תור" מציגה "שגיאה — נסה שוב" ללא הסבר
**שורש:** כאשר idToken פג תוקף (TTL של שעה), GAS מחזיר `{ok:false, error:'session_expired'}`. `_garageDoCancelAppointment` טיפל בזה כשגיאה גנרית במקום לבצע re-login
**תיקון:** הוספת בדיקה מפורשת ל-session_expired לפני throw:
```js
if (_r && _r.error === 'session_expired') {
  if (btn) { btn.disabled = false; btn.textContent = 'כן, בטל תור'; }
  _sessionExpired();
  return;
}
```
**לקח:** כל gasPost call שעלול לרוץ לאחר יותר משעה פתוחה (ביטול, אישור, קביעה) חייב לבדוק `session_expired` ולקרוא ל-`_sessionExpired()` — לא להציג שגיאה גנרית

---

## גרסאות מושפעות
- sw.js: v85
- app.js: תוקן שורות 1069, 3651-3657
- code.js: תוקן `_cancelAppointment` + `getVehiclesForCalendar` נוסף
- index.html (Fleet Manager): `_gcShowAppointmentModal` תוקן, toast + calendar UI שודרגו
