# Garage Tab Redesign — 2026-05-28

## Goal
Full visual redesign of `renderGarageTab()` in app.js + supporting CSS in index.html.
Keep existing color palette (green #1F8A3D, dark background #0a0a0a, amber warning).

---

## Screen Structure (top → bottom)

### 1. Warning Banner (always at TOP)
- Amber/orange animated banner — glowing border, attention-shake on load
- Icon: animated warning triangle SVG (no emoji)
- Text: "לפנייה למוסך נדרש אישור מנהל"
- Sub: "כל כניסה מחייבת אישור מנהל מראש"
- CSS: `.gar-warning-banner`, keyframe `garWarnPulse` (border glow) + `garWarnShake` (one-shot shake)

### 2. Approval Request Button (below warning)
- Large button, green gradient, animated shimmer shine
- Label: "בקשה לאישור כניסה למוסך"
- Sub label: "לחץ לשליחת בקשה למנהל הצי"
- Icon: door/enter SVG animated with garDoorPulse
- onclick: `APP.openHelpMenu(); setTimeout(function(){ APP.helpGarage(); }, 350);`
- CSS: `.gar-approval-btn`, keyframe `garApprovalShine`

### 3. Garage Hero Header Card
- Centered column layout
- Animated icon: large wrench/tool SVG, `garToolBeat` animation (scale + slight rotate)
- Garage name: large bold centered title
- Sub: "המוסך המשויך לרכב שלך"
- CSS: `.gar-hero-card`, `.gar-hero-icon-wrap`, `.gar-hero-name`, `.gar-hero-sub`

### 4. Address + Map Card
- Location pin SVG icon with `garPinBounce` animation
- Address text (no teal mini-button — removed)
- Map embed: `<iframe>` Google Maps `https://maps.google.com/maps?q=ENCODED_ADDR&output=embed`
- Frame: border-radius:16px, overflow:hidden, height:160px, width:100%
- Navigate (Waze) button below map — large, full-width, blue gradient, `garNavGlow` pulse animation
- onclick: opens Waze URL `https://waze.com/ul?q=ADDR&navigate=yes`
- CSS: `.gar-addr-card`, `.gar-map-frame`, `.gar-waze-btn`

---

## CSS Classes (all new, in index.html after existing `.gar-empty` block ~line 744)

```
.gar-warning-banner   — amber gradient bg, border glow, border-radius:18px, overflow:hidden
.gar-warning-banner-inner — flex row, icon + text block
.gar-approval-btn     — full-width, green gradient, border-radius:18px, overflow:hidden for shine
.gar-approval-shine   — absolute shine pseudo element
.gar-hero-card        — centered column card, border-radius:22px
.gar-hero-icon-wrap   — 72px circle, green gradient bg
.gar-hero-name        — 20px bold, centered
.gar-hero-sub         — 12px muted, centered
.gar-addr-card        — card with border-radius:18px
.gar-addr-row         — flex row, icon + text
.gar-map-frame        — iframe wrapper, height:160px
.gar-waze-btn         — full-width, blue gradient, border-radius:14px
```

## Keyframes (all new, in index.html after existing garage keyframe blocks)

```
@keyframes garWarnPulse   — border-color + box-shadow amber glow 0→peak→0, 2.5s infinite
@keyframes garWarnShake   — 0%{transform:translateX(0)} 15%{...} one-shot left-right shake
@keyframes garToolBeat    — scale(1) → scale(1.15) rotate(-8deg) → scale(1.05) → scale(1), 3s infinite
@keyframes garPinBounce   — translateY(0) → translateY(-5px) → translateY(0), 2s ease-in-out infinite
@keyframes garApprovalShine — shine sweep left→right, 2.5s infinite
@keyframes garNavGlow     — box-shadow 0→blue glow→0, 2.2s ease-in-out infinite
```

---

## JS Changes (app.js — renderGarageTab function lines ~2347–2398)

Full rewrite of `renderGarageTab()` to output the new HTML structure.
No other functions touched.

---

## Implementation Tasks

- [ ] CSS Agent: Add keyframes + CSS classes to index.html (after line 744, gar-empty block)
- [ ] JS Agent: Rewrite renderGarageTab() in app.js (lines 2347–2398)
- [ ] Verify: node --check app.js
- [ ] git commit + push
