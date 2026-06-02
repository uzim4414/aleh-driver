# Driver Self-Service Appointment Set/Edit

**Date**: 2026-05-26
**Project**: Driver PWA (`driver/app.js`)
**Backend**: GAS `_garageSetAppointment` (action=`garage_set_appointment`) — already exists, no changes
**Status**: In progress

## Goal

Allow the driver to **set** (when none exists yet) and **edit** (when one is already set) the garage appointment date+time directly from the PWA, without waiting for the fleet manager.

## Backend (already wired)

`_garageSetAppointment(params)` accepts:
- `eventId`
- `appointmentDate` (YYYY-MM-DD)
- `appointmentTime` (HH:MM)

It writes to Field Events sheet, sets `appointmentSetBy='driver'`, sends email to fleet manager, and Firebase-syncs (`garageAppointmentSetByDriver/<vehicleId>`). It's idempotent — re-setting just overwrites the row.

## Entry Points — Where to Add UI

### 1. Active Appointment Screen — `APP._garageShowActiveAppointment` (~line 3845)
Currently shows date/time + "התקשר" / "ניווט" / "בטל תור" buttons.
**Add**: a `✏ ערוך תור` button beside `בטל תור`, opening the new date/time picker pre-filled with current values.

### 2. Home-Screen Widget — `renderGarageApptWidget` (~line 1791)
Currently has 3 actions: `📅 יומן`, `🗺 ניווט`, `✕ בטל`.
**Add**: a `✏ שנה` button between `ניווט` and `בטל` — opens the same date/time picker.

### 3. Approved-without-appointment Screen — `APP._garageShowApproved` (~line 4183)
Already asks "האם קבעת תור?" → "כן" calls `APP._garageAppointmentYes`.
**No change needed** here — the existing flow already lets the driver set a fresh appointment via `garage_set_appointment`. But: rename CTA label clarity is not required by spec → skip.

## New Functions to Add

All new — no existing function is modified except the two `innerHTML` strings (widget + active appt screen) which gain one extra button each.

### `APP._garageEditAppointment(eventId)`
Opens a styled help-card with `<input type="date">` + `<input type="time">` pre-filled with current `activeGarageAppointment` values (date + time). Reuses the exact same input/label styling as `_garageAppointmentYes` (consistency). Includes a "שמור שינוי" CTA that calls `APP._garageConfirmEditAppointment(eventId)`.

### `APP._garageConfirmEditAppointment(eventId)`
Mirrors `_garageConfirmAppointment` logic:
1. Read date/time inputs, validate.
2. POST `garage_set_appointment` with `{eventId, appointmentDate, appointmentTime}`.
3. On success: update `localStorage.activeGarageAppointment`, call `_fbSetActiveAppointment`, re-render widget, show success card and return to active-appointment view (`APP._garageShowActiveAppointment`).
4. On error: show toast + re-enable button.

## Implementation Steps

- [x] Plan written
- [x] Backup `code.js` (no GAS changes but rule: backup before any Python patch on the dir — N/A here, only `app.js` changes)
- [x] Backup `app.js`
- [x] Patch 1 — add `✏ ערוך תור` button to `_garageShowActiveAppointment`
- [x] Patch 2 — add `✏ שנה` button to `renderGarageApptWidget` actions
- [x] Patch 3 — add `APP._garageEditAppointment` and `APP._garageConfirmEditAppointment` near `_garageConfirmAppointment` (~line 4262)
- [x] JS string-escape scan (font-family / onclick inner quotes)
- [x] Verify CRLF preserved, file size sane
- [x] git add + commit + push

## Risks / Notes

- **Don't break the cancel button onclick** — string-escape sensitive area in widget.
- Active appointment storage holds the canonical `eventId` — read it from `_loadActiveAppointment()`.
- Date `min` should be `today` (no past dates allowed).
- All HTML strings use single-quoted JS with HTML attrs in double quotes (matches existing pattern).
- Existing function `_garageAppointmentYes` already builds nearly the same picker but for first-time. New edit function pre-fills values — distinct enough to warrant its own function rather than overloading.
