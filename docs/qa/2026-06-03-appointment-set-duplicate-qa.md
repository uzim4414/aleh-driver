# QA: Duplicate `garage_appointment_set` notification cards — 2026-06-03

## Symptom
Driver PWA showed **two** cards in notification history for a single
`garage_appointment_set` event — in **two different formats**:
- Full card (via FCM): `#47`, plate `385-741-02`, date `2026-06-22`, time `12:00`
- Partial card (via Firebase listener): same title/body, missing plate/number

## Root cause
`garage_appointment_set` reaches the app through two channels:

1. **FCM push** → `showInAppNotification()` → `saveNotifToHistory()` → history card
2. **Firebase listener** (`garageSync/`, `status: 'appointment_set'`)

A previous fix changed the listener path from `showToast()` (which never wrote
history) to `showInAppNotification()` (which calls `saveNotifToHistory()`). That
made **both** channels write a history card.

The listener relied on three dedup mechanisms, all of which can fail:

- `_garageDedupSeen(_setDupKey)` — `_garageDedupMap` is populated by the **listener
  path only**, never by FCM. It cannot detect that FCM already saved the card.
- `_notifDedupTtlSeen` inside `saveNotifToHistory` — 30 s TTL on an **in-memory**
  map (`_notifDedupTtlMap`) that **resets on every app reload** and is **not shared
  with the background Service Worker** that processed the FCM push. If FCM saved the
  card while the app was closed, the map is empty when the listener fires on app open.
- eventId dedup inside `saveNotifToHistory` (persistent) — only works when **both**
  channels carry the **same `eventId`**. The FCM payload's `data.eventId` and the
  listener's `_aSet.eventId` can differ or be missing — which is exactly why one card
  appeared in the "partial" format with no plate/number.

When all three miss, two cards in two formats result.

## Why the previous fix caused the regression
`showToast()` → `showInAppNotification()` was intended to give the listener path a
proper history card. But FCM already owns that history card. Promoting the listener
to a second writer violated the **Single Writer Principle**: each notification must be
saved to history exactly once. The listener's job is to sync STATE
(`localStorage.activeGarageAppointment`) and re-render the widget — not to author
history.

## The fix
File: `driver/app.js`, Firebase listener for `appointment_set`.

Before calling `showInAppNotification()`, check **persistent** notification history
(`getNotifHistory()` / `_NOTIF_HISTORY_KEY = 'driver_notif_history'`):

- Match on `eventId` when both sides have it.
- Fall back to a **content fingerprint** (`title` + `body`) when `eventId` is missing
  on either side — this catches the partial-format FCM card.

Only when the event is **not** already in history does the listener save + show it.
If FCM already recorded it, the listener does nothing for the notification — STATE
sync and `renderGarageApptWidget()` (run earlier in the block) are unaffected.

This makes FCM the canonical writer and the listener a fallback that fires only when
FCM didn't deliver, eliminating the duplicate while preserving offline/late-open
coverage.

## הפקת לקחים (Lessons learned)
- **Single Writer Principle, restated:** a notification must be written to history
  exactly once. Only FCM authors `garage_appointment_set` history; the Firebase
  listener syncs STATE and is a fallback author only when history lacks the event.
- **Do not trust in-memory dedup maps for cross-channel/cross-context dedup.**
  `_notifDedupTtlMap` and `_garageDedupMap` reset on reload and are not shared with the
  background Service Worker. The only reliable cross-channel guard is **persistent
  storage** (`driver_notif_history`).
- **eventId-only dedup is insufficient** when the two channels can disagree on or omit
  `eventId`. Always pair it with a content fingerprint fallback.
- The earlier `showToast → showInAppNotification` change "fixed" a missing-card
  complaint but reintroduced duplicates. When changing a notification code path,
  always re-check the other channel that handles the same event.

## Verification
```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver"
node --check app.js   # -> SYNTAX OK
```
Manual (live): set an appointment from the manager calendar with the driver app both
(a) closed then opened, and (b) open in the foreground. In both cases exactly **one**
`garage_appointment_set` card should appear in history.
