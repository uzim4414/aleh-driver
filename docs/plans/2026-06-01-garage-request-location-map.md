# Garage Request Location Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact, always-visible Google Maps iframe to each garage request card in the Fleet Manager admin UI, showing the vehicle's location at the moment the driver opened the request.

**Architecture:** The `lat`/`lng` coordinates already live in the `FIELD_EVENTS` sheet (header columns `lat`,`lng` — see `code.js:139`). Task 1 exposes them in the `getGarageRequests` JSON response. Task 2 renders a Google Maps **embed iframe** (no API key — `output=embed` URL) inside `_acGarageRequestCard`, inserted after the fault-description block and before the garage-info block, plus its CSS. Task 3 deploys and QAs.

**Tech Stack:** Google Apps Script (`code.js`), vanilla JS string-templated HTML + CSS (`index.html`), Google Maps embed URL (iframe), clasp deploy.

---

## CRITICAL CONSTRAINTS (read before every task)

1. **NEVER use the Write tool on `index.html` or `code.js`** — Edit tool only. Both files are >18k lines; Write silently truncates and has already caused a production incident.
2. **All UI text must be Hebrew.**
3. **Deploy only via** `powershell -ExecutionPolicy Bypass -File ".\clasp-push.ps1"` run from the `13.4.26\` directory. Never `clasp push` directly.
4. **git commit after every task.** After every `git push`, display the short commit hash.
5. **Line-count guard:** after editing `index.html`, `(Get-Content index.html).Count` must be **≥ 23,044**.
6. **No API key** — use the Google Maps embed URL (`output=embed`), NOT the Maps JavaScript API.

## File Structure

| File | Path | Responsibility |
|------|------|----------------|
| Backend | `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js` | Add `lat`/`lng` to `getGarageRequests` `out.push` object |
| Admin UI | `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html` | Render the map block in `_acGarageRequestCard` + add CSS |

## Investigation findings (confirmed against source)

- `_acGarageRequestCard(req, idx)` is the **only** garage card renderer — there is no `_acGarageRenderCard`. The function spans `index.html:5707–5992`. **The active code returns at line 5874**; everything from line 5877 (`/* dead code removed ... */`) onward is dead code — do **NOT** edit the dead block.
- Variable extraction (lines 5708–5733): `var d = req.details || {};` then `description`, `garageName`, etc. There is **no** `lat`/`lng` variable extracted yet, and the coords are top-level on `req` (not inside `req.details`).
- Active fault-description block (`index.html:5788–5789`):
  ```js
        /* fault description — always visible */
        (description ? '<div class="gr-fault-box" style="margin-top:14px"><strong>תיאור: </strong>' + description + '</div>' : '') +
  ```
- Active garage-info block immediately follows (`index.html:5791–5800`), opening with `/* garage block — always visible */`.
- Existing card CSS lives in a `<style>` block; relevant classes at `index.html:2969–2979` (`.gr-fault-box`, `.gr-garage-block`, etc.). New CSS will be inserted right after `.gr-garage-phone` (line 2975).
- `getGarageRequests` is at `code.js:18534`; its `out.push({...})` runs `code.js:18550–18588`. It does **NOT** currently include `lat`/`lng`. The last top-level field before the nested `details:` object is `history: hist,` (`code.js:18577`).
- `FIELD_EVENTS` header order (`code.js:139`) includes `'lat','lng'`, so `_sheetToObjects` returns `r.lat` / `r.lng`. Use `Number(r.lat) || 0`.

---

### Task 1: Expose lat/lng in `getGarageRequests` response (code.js)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js:18577`

- [ ] **Step 1: Add `lat`/`lng` to the `out.push` object**

Use the Edit tool. The `history: hist,` line is unique within this block and sits at the boundary between top-level fields and the nested `details:` object.

old_string:
```js
      history:         hist,
      details: {
```

new_string:
```js
      history:         hist,
      lat:             Number(r.lat) || 0,
      lng:             Number(r.lng) || 0,
      details: {
```

- [ ] **Step 2: Syntax check**

Run (from `13.4.26\` dir):
```
node --check code.js
```
Expected: no output, exit code 0.

- [ ] **Step 3: Line-count sanity check**

Run:
```
(Get-Content code.js).Count
```
Expected: a number ≥ 17,350 (file grew by 2 lines; it was ~18,591).

- [ ] **Step 4: Commit**

```
git add code.js
git commit -m "feat(garage): expose lat/lng in getGarageRequests response"
```

---

### Task 2: Render location map in the garage request card (index.html)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html` (var extraction ~5717, map insertion ~5789, CSS ~2975)

- [ ] **Step 1: Extract `lat`/`lng` variables in `_acGarageRequestCard`**

Use the Edit tool. Anchor on the existing `garagePhone` extraction line (line 5718), which is unique.

old_string:
```js
  var garagePhone = d.garagePhone || '';
```

new_string:
```js
  var garagePhone = d.garagePhone || '';
  var lat         = Number(req.lat) || 0;
  var lng         = Number(req.lng) || 0;
  var hasLoc      = lat !== 0 && lng !== 0;
  var locHtml     = hasLoc
    ? '<div class="acm-loc-wrap">' +
        '<div class="acm-loc-label">📍 מיקום בשעת הפתיחה</div>' +
        '<iframe class="acm-loc-map" src="https://maps.google.com/maps?q=' + lat + ',' + lng + '&z=16&output=embed" loading="lazy" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups"></iframe>' +
        '<a class="acm-loc-link" href="https://maps.google.com/maps?q=' + lat + ',' + lng + '" target="_blank" rel="noopener">פתח במפה ↗</a>' +
      '</div>'
    : '';
```

- [ ] **Step 2: Insert the map block between the fault-description and garage-info blocks**

Use the Edit tool. The anchor below spans the end of the fault-description block and the start of the garage block — it is unique in the active code (`index.html:5788–5792`).

old_string:
```js
      /* fault description — always visible */
      (description ? '<div class="gr-fault-box" style="margin-top:14px"><strong>תיאור: </strong>' + description + '</div>' : '') +

      /* garage block — always visible */
```

new_string:
```js
      /* fault description — always visible */
      (description ? '<div class="gr-fault-box" style="margin-top:14px"><strong>תיאור: </strong>' + description + '</div>' : '') +

      /* location map — shown only when lat/lng are present */
      locHtml +

      /* garage block — always visible */
```

- [ ] **Step 3: Add CSS for the map block**

Use the Edit tool. Anchor on the `.gr-garage-phone` rule (line 2975), which is unique.

old_string:
```css
.gr-garage-phone { font-size:11px; color:#3b82f6; font-weight:600; margin-top:2px; }
```

new_string:
```css
.gr-garage-phone { font-size:11px; color:#3b82f6; font-weight:600; margin-top:2px; }
/* Garage request location map */
.acm-loc-wrap  { margin:12px 18px 0; }
.acm-loc-label { font-size:11px; color:#94a3b8; font-weight:600; margin-bottom:6px; }
.acm-loc-map   { width:100%; height:160px; border:none; border-radius:10px; display:block; }
.acm-loc-link  { display:inline-block; margin-top:6px; font-size:11px; font-weight:600; color:#3b82f6; text-decoration:none; }
.acm-loc-link:hover { text-decoration:underline; }
```

- [ ] **Step 4: Line-count guard**

Run (from `13.4.26\` dir):
```
(Get-Content index.html).Count
```
Expected: a number **≥ 23,044** (file grew by ~22 lines; baseline was ~23,121). If it is below 23,044, STOP — the file was truncated; restore from git and redo with the Edit tool.

- [ ] **Step 5: Verify all three edits landed**

Run:
```
Select-String -Path index.html -Pattern "acm-loc-wrap","var hasLoc","locHtml \+" | Select-Object LineNumber,Line
```
Expected: matches for the CSS class (~line 2977), the `var hasLoc` extraction (~line 5722), the `locHtml +` insertion (~line 5793), and the `.acm-loc-wrap` usage inside `locHtml`.

- [ ] **Step 6: Commit**

```
git add index.html
git commit -m "feat(garage): show vehicle location map on garage request card"
```

---

### Task 3: Deploy + QA

**Files:** none modified — deploy and manual verification only.

- [ ] **Step 1: Deploy via the wrapper**

Run (from `13.4.26\` dir):
```
powershell -ExecutionPolicy Bypass -File ".\clasp-push.ps1"
```
Expected: integrity + brace/paren balance checks pass, `node --check code.js` passes, `clasp push -f` succeeds, then `clasp deploy --deploymentId ...` updates the live web-app. If the script reports a size/integrity failure, STOP and investigate — do not use `-Force` unless a shrink was intended (it was not here).

- [ ] **Step 2: Push and show commit hash**

```
git push
git rev-parse --short HEAD
```
Display the short hash to the user after the push.

- [ ] **Step 3: Manual verification checklist (live admin UI)**

Open the admin web-app, navigate to the garage requests screen, and confirm:
- [ ] A garage request whose driver event has non-zero `lat`/`lng` shows the map block **after** the fault description (`תיאור:`) and **before** the garage info block.
- [ ] The grey Hebrew label `📍 מיקום בשעת הפתיחה` appears above the map.
- [ ] The iframe renders an interactive Google map centered on the coordinates (~zoom 16), height ~160px, rounded corners, full card width, no border.
- [ ] The `פתח במפה ↗` link appears below the map and opens `https://maps.google.com/maps?q={lat},{lng}` in a **new tab**.
- [ ] A garage request **missing** coordinates (lat or lng zero/absent) shows **no** map block — the garage info block follows the description directly with no empty gap.
- [ ] Layout remains correct RTL; the map does not overflow the card.

---

## Self-Review

**Spec coverage:**
- Compact map iframe in garage request card → Task 2 Steps 1–3. ✓
- lat/lng from FIELD_EVENTS cols, returned by getGarageRequests → Task 1 (confirmed header `lat`,`lng` at `code.js:139`). ✓
- Insertion after fault description, before garage block, inside `_acGarageRequestCard` → Task 2 Step 2 (active code, not dead block). ✓
- Always visible, ~160px, hidden when lat/lng missing/zero → `.acm-loc-map height:160px` + `hasLoc` guard. ✓
- Embed URL `?q={lat},{lng}&z=16&output=embed`, no API key → Task 2 Step 1. ✓
- Label `📍 מיקום בשעת הפתיחה` + `פתח במפה` link to non-embed URL in new tab → Task 2 Step 1. ✓
- CSS for `.acm-loc-wrap/.acm-loc-label/.acm-loc-map/.acm-loc-link` (border:none, radius 10px, width 100%, height 160px) → Task 2 Step 3. ✓
- Deploy + QA → Task 3. ✓

**Placeholder scan:** No TBD/TODO/“handle edge cases”; all code is concrete with exact old/new strings. ✓

**Type/name consistency:** `lat`, `lng`, `hasLoc`, `locHtml` defined in Task 2 Step 1 and referenced in Step 2; CSS classes `acm-loc-wrap/label/map/link` match between the JS string (Step 1) and the CSS (Step 3). Backend keys `lat`/`lng` (Task 1) match `req.lat`/`req.lng` read in the UI (Task 2). ✓

**Notes:**
- The map block is built once into `locHtml` (DRY) rather than inlined, so the `hasLoc` guard lives in one place.
- Coordinates are numeric (`Number(...) || 0`), so no `encodeURIComponent` is required for the `q=` value; they cannot contain URL-unsafe characters.
- `sandbox="allow-scripts allow-same-origin allow-popups"` is included as a hardening measure (`allow-popups` lets the embed’s own links work).
