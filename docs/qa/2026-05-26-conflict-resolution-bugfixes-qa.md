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

## Additional Bugs Found During Live Testing (2026-05-26)

| Bug | Severity | File | Description | Status |
|-----|----------|------|-------------|--------|
| B11 | HIGH | code.js | `adminCreateAppointment` isDirectVeh conflict check used `existingSheetRow>0` — skipped when driver set on different date (row was 0) | ✅ Fixed @2518 |
| B12 | MEDIUM | app.js | Duplicate "תור בוטל" toast: FCM + Firebase listener both fired independently | ✅ Fixed (cross-channel dedup) |
| B13 | MEDIUM | code.js | FCM cancel payload `cancelledTime` sent as `String(Date)` → "Mon Jun 01 2026..." | ✅ Fixed (Utilities.formatDate) |
| B14 | HIGH | app.js | `_garageEditAppointment` + `_garageConfirmEditAppointment` used real newlines inside single-quoted JS strings → entire app.js broken | ✅ Fixed (node --check + bytes.replace) |
| B15 | MEDIUM | app.js | Edit/cancel button onclick used wrong quote context → `(\'" + id + "\')` instead of `(\\'' + id + '\\')` | ✅ Fixed (derived from cancel button template) |
| B16 | HIGH | app.js | `_garageEditAppointment` targeted `garage-detail-body` + `help-body` — both IDs don't exist anywhere in the DOM. Silent `return` every time. | ✅ Fixed 2026-05-27 (body overlay) |
| B17 | HIGH | app.js | `_showHelpCard()` writes to `help-card-wrap` which lives inside `#help-menu` (slide-up overlay) — only visible when `openHelpMenu()` called. Calling `APP.nav('service')` does NOT open it. Edit form rendered invisibly. | ✅ Fixed 2026-05-27 (body overlay) |
| B18 | CRITICAL | app.js | `_garageConfirmEditAppointment` called `callGAS(...)` — function does not exist in app.js. Every save attempt threw `ReferenceError` caught silently. Save never worked from day 1. Correct function: `gasPost(...)` | ✅ Fixed 2026-05-27 |

---

## Root Causes / Lessons

1. **B1** — `getGarageRequests` correctly exposed `appointmentSetBy` but the UI mapping (`_gcApprovedByVehicle`) was never updated. Feature silently dead from day 1.

2. **B2** — Two code paths for "set appointment" (by event ID vs by vehicle from dropdown) were treated as independent. Conflict detection only added to one. Always verify ALL callers when adding a guard.

3. **B7/B8** — GAS Date cells return Date objects. `String(date)` produces locale-dependent garbage. Always use `Utilities.formatDate()` for dates and `getHours():getMinutes()` for times. Mirror the normalization pattern from `getGarageRequests`.

4. **B5** — Staleness guard based on timestamp alone is fragile when FCM and Firebase listener run within milliseconds. Content-equality check is the safer guard.

5. **B4** — Firebase payload design: when a field is meaningful for downstream consumers (driver app deciding which toast to show), it must be included in ALL status variants of the payload, not just `cancelled`.

6. **B11** — Conflict detection used `existingSheetRow > 0` as proxy for "driver appointment exists". Wrong — the row search was scoped to the specific date being checked. When driver set appointment on date A and admin sets on date B, row was 0 and conflict skipped. Fix: secondary full-sheet scan by vehicleId regardless of date.

7. **B12** — Dual-channel event delivery (FCM push + Firebase realtime listener) means the same logical event arrives twice. Any toast/notification triggered by both channels will duplicate. Fix: `_normGarageEventKey()` + `_garageDedupSeen()` cross-channel dedup with 8s TTL.

8. **B14 — CRITICAL — JS string literals cannot span real newlines** — `app.js` is a minified/single-file JS bundle served from GitHub Pages. Any `'string\nwith real newline'` inside a string literal produces a SyntaxError that silently breaks the entire file (Google login button → no-op). **Rule: always run `node --check app.js` before `git push`**. This broke login for ~30 minutes in production.

9. **B15 — onclick quote escaping** — When building HTML strings in JS string-building context (`'...' + '...'`), onclick attribute quotes must match the surrounding string's escaping precisely. Never compose a new button from scratch — always derive from an existing working button (e.g., cancel button → edit button) using `bytes.replace()` substitution. Switching quote context mid-string (`"` vs `'`) produces invisible syntax errors.

10. **B16/B17 — Wrong DOM container** — Never assume `getElementById(id)` will find anything without verifying the element exists in the HTML. `garage-detail-body` and `help-body` were invented IDs with no DOM counterpart. Before writing a function that targets a DOM element, grep for the ID in the actual HTML to confirm existence.

11. **B17 — help-card-wrap is inside a closed overlay** — `_showHelpCard()` works only when `#help-menu` has `.open` class (added by `openHelpMenu()`). Any feature that shows a form/card from an external trigger (widget, notification) must NOT rely on `_showHelpCard()` unless it also opens the menu. The cancel-button pattern (`position:fixed` body overlay) is safer for cross-context use.

12. **B18 — CRITICAL — callGAS() does not exist** — `callGAS` was used in `_garageConfirmEditAppointment` but the actual transport function is `gasPost()`. This is the most severe bug: save never worked from day 1, every click silently failed. **Rule:** before using any function name, grep for its definition in the file. Never assume a function exists by name similarity.

---

## Test Matrix

| Scenario | Expected Result | Verified? |
|----------|----------------|-----------|
| Admin opens appointment modal for driver-set event (via event card) | Conflict modal shows | ✅ |
| Admin opens appointment modal for driver-set event (via vehicle dropdown) | Conflict modal shows (B2 fix) | ✅ (B11 fix @2518) |
| Admin clicks "דרוס וקבע חדש" | Both overlays close, calendar refreshes | ✅ |
| Admin clicks "שמור תור נהג" | Both overlays close, calendar refreshes, alert shown | ✅ |
| Admin clicks dark backdrop of conflict modal | Modal closes (B10 fix) | ✅ |
| Badge ⚙️ in appointment banner (garage modal) | Shows "נקבע על ידי הנהג" | ✅ |
| Badge in main appointment banner | Shows "נקבע ע"י הנהג" | ⏳ pending |
| Badge in edit modal pre-fill | Shows setBy source | ⏳ pending |
| Driver cancels from phone → tablet shows | Tablet shows "✅ התור בוטל" (B6 fix) | ⏳ pending |
| Admin sets identical date+time as existing admin appointment | "תור זה כבר קיים" noop alert fires | ⏳ pending |
| Admin cancels driver-set appointment | FCM "המנהל ביטל את התור שקבעת" | ⏳ pending |
| Driver sets appointment → Fleet Manager firebase node | Node includes `setBy: 'driver'` | ⏳ pending |
| Admin sets appointment → driver app change toast | Shows "🔄 המנהל שינה" only if truly changed | ⏳ pending |
| PWA driver sets new appointment | Date+time picker appears, saves via garage_set_appointment | ⏳ pending |
| PWA driver edits existing appointment | Pre-filled picker, saves, widget updates | ⏳ pending |
| Admin sets appointment with no open garage request | Direct banner (green) shown in calendar panel | ⏳ pending |
