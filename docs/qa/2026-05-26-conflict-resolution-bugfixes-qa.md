# QA Report: Conflict Resolution Bug Fixes — 2026-05-26

**Plan:** `driver/docs/plans/2026-05-26-conflict-resolution-bugfixes.md`
**GAS version:** Post-deploy (clasp push 2026-05-26 02:00)
**GAS commits:** fc7efcb → 1aba619
**Driver commit:** cf21c44

---

## Summary

10 bugs found in deep Opus 4.7 code review of the garage conflict resolution feature (2026-05-25). Fixed in 5 tasks, 6 git commits across GAS repo and driver PWA repo.

---

## Bug Fix Matrix

| Bug | Severity | File | Description | Status |
|-----|----------|------|-------------|--------|
| B1 | HIGH | index.html | `appointmentSetBy` missing from `_gcApprovedByVehicle` → badge dead | ✅ Fixed |
| B2 | HIGH | code.js + index.html | `adminCreateAppointment` had no conflict detection | ✅ Fixed |
| B3 | HIGH | index.html | `_gcConflictKeep` + `_gcConflictOverride` didn't close original modal | ✅ Fixed |
| B4 | MEDIUM | code.js + app.js | Firebase `appointment_set` payload missing `setBy` field | ✅ Fixed |
| B5 | MEDIUM | app.js | Staleness guard too aggressive — suppressed legit admin updates | ✅ Fixed |
| B6 | MEDIUM | app.js | Driver self-cancel on device B: no confirmation toast | ✅ Fixed |
| B7 | MEDIUM | code.js | `_cdDate` Date object → `String()` = garbled, noop never fired | ✅ Fixed |
| B8 | LOW | code.js | `cancelledTime` `String(Date)` = "1899-12-30..." in FCM | ✅ Fixed |
| B9 | LOW | code.js | Conflict guard bypassed when `appointmentSetBy=driver` + empty date | ✅ Fixed |
| B10 | LOW | index.html | Conflict modal: no overlay-click-to-dismiss | ✅ Fixed |

---

## Changes Per File

### `13.4.26/index.html`

| Change | Bug |
|--------|-----|
| Added `appointmentSetBy: String(r.appointmentSetBy \|\| '')` to `_gcApprovedByVehicle` object | B1 |
| `_gcConflictKeep`: added `#gcal-modal-overlay` removal + `_acLoadGarageCalendar()` call | B3a |
| `_gcConflictOverride` success: added `#gcal-modal-overlay` removal | B3b |
| `_gcShowConflictModal`: added overlay-click `addEventListener` → `_gcConflictCancel()` | B10 |
| `_gcSavePayload` now set in `isDirectVeh` branch too (with `isDirectVeh: true` flag) | B2 |
| `_gcConflictOverride`: routes `isDirectVeh` path → `adminCreateAppointment(..., true)` | B2 |

### `13.4.26/code.js`

| Change | Bug |
|--------|-----|
| `adminCreateAppointment`: added `force` 7th param | B2 |
| `adminCreateAppointment`: conflict detection block before write (checks `appointmentSetBy=driver` + `!force`) | B2 |
| `adminSetAppointment` `_cdDate`: normalized via `Utilities.formatDate` when Date object | B7 |
| `adminCancelAppointment` `cancelledTime`: normalized via `getHours():getMinutes()` when Date object | B8 |
| Conflict guard: removed `&& _cdDate` requirement — protects even when date empty | B9 |
| `_firebaseSyncAdminAppointment` appointment_set payload: added `setBy: setBy \|\| ''` | B4 |
| `_garageSetAppointment`: passes `'driver'` as 6th arg to Firebase sync | B4 |
| `adminSetAppointment`: passes `'admin'` as 6th arg to Firebase sync | B4 |
| `adminCreateAppointment`: passes `'admin'` as 6th arg to Firebase sync | B4 |

### `driver/app.js`

| Change | Bug |
|--------|-----|
| Change-detection toast: guards on `data.setBy !== 'driver'` → no "המנהל שינה" when driver set from device B | B4 |
| `appointmentTime` in toast: wrapped in `\|\| ''` guard | B4 |
| Staleness guard: added `_sameApptData` check (date+time match) before skipping | B5 |
| Driver self-cancel toast: changed from `null` to `'✅ התור בוטל'` — shows on all devices | B6 |
| Unknown `setBy` fallback: all non-driver values → admin cancel toast (not null) | B6 |

---

## Root Causes / Lessons

1. **B1** — `getGarageRequests` correctly exposed `appointmentSetBy` but the UI mapping (`_gcApprovedByVehicle`) was never updated. Feature silently dead from day 1.

2. **B2** — Two code paths for "set appointment" (by event ID vs by vehicle from dropdown) were treated as independent. Conflict detection only added to one. Always verify ALL callers when adding a guard.

3. **B7/B8** — GAS Date cells return Date objects. `String(date)` produces locale-dependent garbage. Always use `Utilities.formatDate()` for dates and `getHours():getMinutes()` for times. Mirror the normalization pattern from `getGarageRequests`.

4. **B5** — Staleness guard based on timestamp alone is fragile when FCM and Firebase listener run within milliseconds. Content-equality check is the safer guard.

5. **B4** — Firebase payload design: when a field is meaningful for downstream consumers (driver app deciding which toast to show), it must be included in ALL status variants of the payload, not just `cancelled`.

---

## Test Matrix

| Scenario | Expected Result | Verified? |
|----------|----------------|-----------|
| Admin opens appointment modal for driver-set event (via event card) | Conflict modal shows | Pending live test |
| Admin opens appointment modal for driver-set event (via vehicle dropdown) | Conflict modal shows (B2 fix) | Pending live test |
| Admin clicks "דרוס וקבע חדש" | Both overlays close, calendar refreshes | Pending live test |
| Admin clicks "שמור תור נהג" | Both overlays close, calendar refreshes, alert shown | Pending live test |
| Admin clicks dark backdrop of conflict modal | Modal closes (B10 fix) | Pending live test |
| Badge ⚙️ in appointment banner | Shows green "נקבע ע"י הנהג" or gray "נקבע ע"י מנהל" | Pending live test |
| Driver cancels from phone → tablet shows | Tablet shows "✅ התור בוטל" (B6 fix) | Pending live test |
| Admin sets identical date+time as existing admin appointment | "תור זה כבר קיים" noop alert fires | Pending live test |
| Admin cancels driver-set appointment | FCM "המנהל ביטל את התור שקבעת" | Pending live test |
| Driver sets appointment → Fleet Manager firebase node | Node includes `setBy: 'driver'` | Pending live test |
| Admin sets appointment → driver app change toast | Shows "🔄 המנהל שינה" only if truly changed | Pending live test |
