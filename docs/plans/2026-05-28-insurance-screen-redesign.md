# Insurance Screen Redesign — 2026-05-28

## Goal
Full redesign of the insurance tab in the vehicle screen.
No pricing data. Rich categorized display of חובה + מקיף with services + contact buttons.

---

## Data Sources

### Synchronous (immediately available)
- `STATE.vehicle.insCompExp` — liability expiry date
- `STATE.vehicle.insFullExp` — comprehensive expiry date
- `STATE.vehicle.insCompLink` — liability policy doc URL
- `STATE.vehicle.insFullLink` — comprehensive policy doc URL
- `STATE.insurance[]` latest entry: `.company`, `.year`

### Async (`get_vehicle_insurance_details` → gasPost)
- `policyNumber`, `emergencyPhone`, `towingCoverageKm`
- `includesRentalCar`, `windshieldCoverage.provider/phone`

### Never display
- `compCost`, `fullCost` — hidden entirely (driver doesn't need pricing)

---

## Newly-Renewed Detection
- On tab open, compare `insCompExp`/`insFullExp` with `localStorage._prevInsCompExp`/`_prevInsFullExp`
- If date advanced → store `localStorage._insRenewed = 'comp'|'full'|'both'` + timestamp
- Show "חודש! ✓" badge with `insRenewFlash` animation for 24h
- Update prev values in localStorage on each render

---

## Screen Structure (top → bottom)

### Section 1: ביטוח חובה (blue/steel color)
- Section header: shield icon (blue pulse) + "ביטוח חובה" title + status dot (valid/expired)
- Detail rows: שם חברה | מספר פוליסה | תוקף | גיל מינימלי | השתתפות עצמית
- CTA: [📞 פניה לחברה] [📄 הצג פוליסה]

### Section 2: ביטוח מקיף (gold/amber color)
- Section header: shield icon (gold pulse) + "ביטוח מקיף" title + status dot + renewal badge
- Detail rows: same as above
- Services section:
  - Chip: 🚛 גרירה (X ק"מ) → onclick: helpTowing via help menu
  - Chip: 🔧 שמשות (provider) → onclick: helpWindshield via help menu
  - Chip: 🚗 רכב חלופי → show if includesRentalCar
- Expanded service cards (גרירה + שמשות with action buttons)
- CTA: [📞 פניה לחברה] [📄 הצג פוליסה]

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.ins-wrap` | outer padding wrapper |
| `.ins-section` | section card container |
| `.ins-section-header` | colored header with icon + title + status |
| `.ins-section-icon` | animated shield icon wrap |
| `.ins-section-titles` | title + subtitle text block |
| `.ins-status` | valid/expired status chip |
| `.ins-renewed-badge` | "חודש! ✓" flash badge |
| `.ins-detail-list` | detail rows container |
| `.ins-detail-row` | single detail: icon + label + value |
| `.ins-detail-label` | muted uppercase label |
| `.ins-detail-value` | bold value text |
| `.ins-services-header` | "שירותים כלולים" divider |
| `.ins-chips` | flex row of service chips |
| `.ins-chip` | individual service chip |
| `.ins-service-card` | expanded service detail card |
| `.ins-service-card-title` | service card header |
| `.ins-service-action-btn` | action button inside service card |
| `.ins-cta-row` | bottom CTA buttons row |
| `.ins-cta-btn.primary` | green primary CTA |
| `.ins-cta-btn.ghost` | ghost secondary CTA |

---

## Keyframes

| Name | Effect |
|------|--------|
| `insCardEnter` | slide up + fade in on load |
| `insShieldPulseBlue` | blue glow pulse for חובה icon |
| `insShieldPulseGold` | gold glow pulse for מקיף icon |
| `insRenewFlash` | green flash sweep for renewed badge |
| `insChipTap` | chip scale on active |
| `insStatusBlink` | dot blink when expiry < 30 days |

---

## Async Loading Pattern
1. `renderInsuranceTab()` renders immediately with sync data + loading skeletons for async fields
2. Calls `_loadInsuranceDetails()` immediately (async, no await — fire and forget)
3. `_loadInsuranceDetails()` fetches `get_vehicle_insurance_details`, updates DOM by ID:
   - `#ins-full-policy` → policyNumber
   - `#ins-comp-policy` → policyNumber (חובה — if different)
   - `#ins-emergency-phone` → emergencyPhone
   - `#ins-towing-km` → towingCoverageKm
   - `#ins-rental` → includesRentalCar text
   - `#ins-wd-provider` → windshieldCoverage.provider
   - `#ins-wd-phone` → windshieldCoverage.phone

---

## AI Integration Suggestion (future — not in this PR)
Route ChatGPT queries through GAS backend (server-side API key, not exposed in frontend).
Use case: "מה כלול בביטוח שלי?" natural language answer based on policy data.
Implementation: GAS `doPost` action `insurance_ai_explain` → calls OpenAI API → returns text.

---

## Implementation Tasks
- [x] CSS Agent: index.html — keyframes + all ins-* classes (insert after .gar-waze-btn block)
- [x] JS Agent: app.js — renderInsuranceTab() + _loadInsuranceDetails() + update insurance branch
- [ ] verify node --check app.js
- [ ] git commit + push
