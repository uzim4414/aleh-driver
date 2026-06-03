# QA — Permanent fix for duplicate garageSync notification cards

**Date:** 2026-06-03
**Commit:** `66a4fe1`
**Branch:** `fix/garagesync-duplicate-notifications`
**File:** `driver/app.js`

## Symptom (3rd occurrence)

Screenshots showed two `garage_rejected` cards in notification history — two
different formats (one with plate + request #48, one without). Earlier the same
class of bug hit `notifications/` writes (session 1, e3e66ce) and
`garage_appointment_set` (session 2, 07fe373).

## Root cause (corrected from the original hypothesis)

The original theory was that the `garageSync/` Firebase listener writes every
status to history and only `appointment_set` had a guard. That is **not** what
the code does:

- The listener uses `showToast()` (transient, no history) for `rejected` and
  `cancelled`, and does NOT call `showInAppNotification()` for `approved`.
- Only `appointment_set` in the listener writes history, and it already had a
  guard.

The real duplicate path is **cross-channel**, not listener-vs-listener:

1. **FCM push** → `saveNotifToHistory()` writes a card using the *server push*
   title/body format, carrying a particular `eventId` (and `requestNumber`).
2. **GAS history pull** (`loadNotifHistoryFromGAS`) merges the same logical
   event with a *different* title/body format and a possibly **missing or
   different `eventId`**.

The dedup key `_notifDedupKey()` keyed on raw `eventId` **first**. When the two
channels disagreed on `eventId` (or one was empty), the keys differed
(`eid:EVT-48|garage_rejected` vs `sig:garage_rejected|...`), so
`dedupNotifList()` kept both → two cards.

## The permanent fix

Single Writer Principle, enforced at the **one** function every channel funnels
through (`saveNotifToHistory`) plus the shared list-cleaner (`dedupNotifList`),
so it is impossible to fix one channel and miss another.

1. **`_canonGarageType(alertType)`** — maps every garage status/alertType
   (`rejected`/`garage_rejected`, `approved`/`garage_approved`,
   `appointment_set`/`garage_appointment_set`,
   `cancelled`/`garage_appointment_cancelled`) to a single canonical family.

2. **`_notifDedupKey()`** — for garage status types, key on
   **canonical type + requestNumber** (the stable garage request #), then
   `eventId`, then `vehicleId + appointmentDate`, then `vehicleId`. This makes
   FCM and GAS copies of the same request collapse even when their `eventId` or
   title/body format differ. Distinct requests (different request #) stay
   separate.

3. **`_notifAlreadyInHistory(alertType, eventId, title, body, extra)`** —
   universal persistent dedup gate: canonical-key match + content-fingerprint
   fallback + explicit eventId match.

4. **`saveNotifToHistory()`** — calls the gate AFTER the STATE side-effects
   (clear pending, save approved data, update appointment widget) so STATE stays
   synced, but no duplicate card is written.

5. **garageSync `appointment_set` listener** — replaced its bespoke inline
   `_alreadySaved` IIFE with the shared `_notifAlreadyInHistory()` gate.

## All write call sites covered (every path funnels through `saveNotifToHistory`)

- FCM foreground (`push-foreground` → `showInAppNotification` → save)
- `push-received` SW message → save
- Pending-notif buffer replay → save
- Cold-start from OS tap (`?_notif=`, two handlers) → save
- GAS history pull merge → `dedupNotifList` (strengthened key)
- garageSync `appointment_set` listener → shared gate

## Why the previous partial fix was not enough

Session 2 added a history check for `appointment_set` **only**, and it lived at
that one call site. It did not address the cross-channel `eventId`/format
mismatch for `garage_rejected`/`garage_approved`, and it was not centralized, so
the next event type duplicated again.

## Verification

```bash
cd driver
node --check app.js                 # SYNTAX_OK
# Logic test: FCM card (eventId=EVT-48, req=48, full format) vs
#             GAS card (eventId='', req=48, short format)
#   -> both produce key  greq:garage_rejected|48
#   -> dedupNotifList collapses to 1 card
#   -> two DIFFERENT request numbers (#48, #49) stay as 2 cards
```

## הפקת לקחים

- כשמתקנים כפילות עבור סוג התראה אחד, **תמיד** לסרוק את כל סוגי האירועים
  שאותו listener / אותו ערוץ מטפל בהם — לא לתקן נקודה אחת ולפספס את השאר.
- אסור להניח שהבעיה היא "listener מול listener". כאן הכפילות הייתה
  **חוצת-ערוצים** (FCM מול משיכת GAS), ולא נגרמה כלל מה-listener של
  `garageSync`. תמיד לאמת מול הקוד מאיפה כל כרטיס נכתב.
- `_notifAlreadyInHistory` הוא כעת השער המחייב לפני כל כתיבה להיסטוריה,
  וממומש בתוך `saveNotifToHistory` כך שכל הערוצים עוברים דרכו.
- דדופ בזיכרון (TTL map, `_garageDedupMap`) לעולם אינו מספיק לבדו: הוא מתאפס
  ב-reload ואינו משותף עם ה-Service Worker — חייבים בדיקת היסטוריה מתמשכת.
- מפתח הדדופ חייב לקרוס על זהות לוגית יציבה (מספר בקשת מוסך / canonical type),
  לא על `eventId` גולמי שעלול להיות שונה או ריק בין ערוצים.
