# Landscape Tablet Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all landscape CSS with a professional two-column tablet layout — splash screen gets a two-column split (logo right / login left), home screen gets a two-column hero card (car image right / identity+widgets left), all other screens get proper tablet typography and spacing.

**Architecture:** Three CSS edit operations on two files (`index.html` and `splash.css`). No HTML structural changes. Uses RTL flex-direction:row auto-ordering (first child → visual right in RTL) throughout. Ultra-compact block (≤500px, Samsung phones) left completely untouched.

**Tech Stack:** Vanilla CSS `@media (orientation: landscape)`, RTL flex/grid, CSS custom properties, `clamp()`, `env(safe-area-inset-bottom)`

---

## File Map

| File | Lines affected | What changes |
|------|---------------|--------------|
| `driver/index.html` | 213–220 | Replace splash landscape block |
| `driver/index.html` | 457–732 | Replace ENTIRE main landscape block |
| `driver/index.html` | 738–844 | **UNTOUCHED** — ultra-compact phones |
| `driver/splash.css` | 235–278 | Replace splash.css landscape block |
| `driver/sw.js` | 1 | Bump cache v36 → v37 |

---

## Task 1: Splash Screen Landscape — index.html

**Files:**
- Modify: `driver/index.html:213–220`

- [ ] **Step 1: Replace splash landscape block in index.html**

Find this exact block (lines 213–220):
```css
@media (orientation: landscape) {
  .login-chrome .bottom { bottom:14px !important; left:50% !important; right:auto !important; transform:translateX(-50%); width:max-content; }
  .splash-dev-credit { bottom:8px; font-size:9px; }
  #greeting { flex-direction:row; gap:32px; justify-content:center; align-items:center; }
  .gr-time { font-size:16px; }
  .gr-name { font-size:26px; }
  .gr-bar-wrap { margin-top:0; width:160px; }
}
```

Replace with:
```css
@media (orientation: landscape) {
  /* Splash — two-column: logo RIGHT (RTL-start), login LEFT (RTL-end) */
  #splash-react-root {
    flex: 0 0 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-chrome {
    position: static !important;
    flex: 0 0 50% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 20px;
    padding: 20px 48px !important;
    pointer-events: auto !important;
    height: 100vh;
  }
  .login-chrome .top { display: none; }
  .login-chrome .bottom {
    position: static !important;
    bottom: auto !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    width: 100% !important;
    max-width: 340px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 14px !important;
  }
  .signin-btn {
    min-height: 58px !important;
    width: 100% !important;
    padding: 18px 24px !important;
    font-size: 16px !important;
    letter-spacing: 0.42em !important;
  }
  .signin-hint { font-size: 11px; text-align: center; }
  .splash-dev-credit { bottom: 10px; font-size: 9px; }
  /* Greeting overlay */
  #greeting { flex-direction:row; gap:48px; justify-content:center; align-items:center; padding:0 80px; }
  .gr-time { font-size:20px; }
  .gr-name { font-size:32px; }
  .gr-bar-wrap { margin-top:0; width:220px; }
}
```

- [ ] **Step 2: Verify edit saved** — open index.html lines 213–230 and confirm new CSS is present.

---

## Task 2: Splash Screen Landscape — splash.css

**Files:**
- Modify: `driver/splash.css:235–278`

- [ ] **Step 1: Replace landscape block in splash.css**

Find this exact block (lines 235–278):
```css
@media (orientation: landscape) {
  /* לוגו מוקטן — !important כדי לנצח את ה-inline style של React */
  .splash-logo {
    width:  min(220px, calc(50vw)) !important;
    height: min(220px, calc(100vh - 140px)) !important;
  }

  /* רקע מותאם לפורמט רוחבי */
  .stage {
    background:
      radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 55%),
      radial-gradient(ellipse at 70% 85%, rgba(255,45,45,0.05) 0%, rgba(0,0,0,0) 50%),
      #000;
  }

  /* מסתיר את ה-scan-lines שגורמים לפס אפור בנוף */
  .stage::before { display: none; }

  /* chrome עליון: קומפקטי */
  .login-chrome {
    padding: 14px 24px 18px;
  }
  .login-chrome .top {
    font-size: 9px;
    letter-spacing: 0.38em;
  }

  /* כפתור כניסה: דק יותר */
  .signin-btn {
    padding: 13px 44px 13px 48px;
    font-size: 11px;
  }
  .signin-hint {
    font-size: 8px;
  }

  /* replay pill */
  .replay-btn {
    bottom: 12px;
    right: 12px;
    padding: 8px 14px;
    font-size: 9px;
  }
}
```

Replace with:
```css
@media (orientation: landscape) {
  /* Two-column stage: #splash-react-root RIGHT, .login-chrome LEFT (RTL) */
  .stage {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(ellipse at 25% 50%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 55%),
      radial-gradient(ellipse at 75% 60%, rgba(255,45,45,0.05) 0%, rgba(0,0,0,0) 50%),
      #000;
  }
  /* Suppress scan-line bar */
  .stage::before { display: none; }

  /* Logo: fills the right column — !important overrides React's inline --logo-scale */
  .splash-logo {
    width:  min(400px, calc(50vw - 40px)) !important;
    height: min(400px, calc(100vh - 60px)) !important;
  }

  /* login-chrome becomes a static flex column (right column in RTL = visual left) */
  .login-chrome {
    padding: 20px 48px 20px !important;
  }
  .login-chrome .top {
    font-size: 9px;
    letter-spacing: 0.38em;
  }

  /* Sign-in button: full-width, tablet proportions */
  .signin-btn {
    padding: 18px 48px !important;
    font-size: 15px;
    width: 100%;
    max-width: 340px;
    min-height: 58px;
  }
  .signin-hint {
    font-size: 10px;
    text-align: center;
  }

  /* Replay pill */
  .replay-btn {
    bottom: 12px;
    right: 12px;
    padding: 8px 14px;
    font-size: 9px;
  }
}
```

- [ ] **Step 2: Verify edit saved** — open splash.css lines 235–end and confirm new CSS present.

---

## Task 3: Main App Landscape Block — Full Replacement

**Files:**
- Modify: `driver/index.html:457–732`

This is the largest change. The ENTIRE `@media (orientation: landscape)` block (lines 457–732, from the comment `LANDSCAPE — רוחבי` through the closing `}`) must be replaced wholesale.

- [ ] **Step 1: Replace main landscape block**

Find the old block that starts with:
```css
/* ══════════════════════════════════════════════════════════════
   LANDSCAPE — רוחבי: flex-column, bnav למטה, תוכן רוחב מלא
══════════════════════════════════════════════════════════════ */
@media (orientation: landscape) {
```
...and ends at the `}` on line 732 (before the ultra-compact comment on line 734).

Replace the entire block with:
```css
/* ══════════════════════════════════════════════════════════════
   LANDSCAPE TABLET — two-column hero, spacious nav, full widths
   Target: Samsung tablet ~1270×752px (height > 500px)
   Ultra-compact phones (≤500px) handled in block below — UNTOUCHED
══════════════════════════════════════════════════════════════ */
@media (orientation: landscape) {

  /* ── App container ── */
  #app {
    max-width: 100% !important;
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    height: 100dvh;
    margin: 0 !important;
  }

  /* ── Topbar: tablet sizing ── */
  #global-topbar { padding: 6px 20px 8px; min-height: 50px; flex-shrink: 0; }
  .tb-btn, .tb-avatar { width: 38px; height: 38px; border-radius: 12px; }
  .tb-badge { width: 15px; height: 15px; font-size: 8px; border-width: 2px; top: -3px; right: -3px; }
  .tb-logo-name  { font-size: 12px; letter-spacing: 0.36em; }
  .tb-logo-sub   { font-size: 7px; letter-spacing: 0.32em; }
  .tb-greet-hi   { font-size: 11px; }
  .tb-greet-name { font-size: 14px; }
  .tb-user { gap: 8px; }

  /* ── Screen scaffold ── */
  .screen        { display: none; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
  .screen.active { display: flex; }
  .content       { flex: 1; overflow-y: auto; min-height: 0; scrollbar-width: none; }
  .content::-webkit-scrollbar { display: none; }

  /* ── Bottom nav: tablet spacious ── */
  .bnav {
    flex-direction: row !important;
    flex-shrink: 0;
    align-self: stretch;
    margin: 4px 12px;
    border-radius: 18px;
    padding: 6px 12px;
    gap: 0;
    justify-content: space-around;
    align-items: center;
    box-sizing: border-box;
    min-height: 68px;
  }
  .bn-item {
    flex: 1;
    flex-direction: column;
    padding: 10px 4px;
    border-radius: 14px;
    gap: 4px;
    min-height: 58px;
  }
  .bn-item.active { flex: 1.5; }
  .bn-lbl                 { font-size: 11px; }
  .bn-item.active .bn-lbl { font-size: 11.5px; font-weight: 700; }
  .bn-ic                  { width: 24px; height: 24px; }

  /* ── phead & tabs ── */
  .phead    { padding: 8px 20px 10px; }
  .ph-title { font-size: 18px; }
  .ph-sub   { font-size: 12px; }
  .tabs { padding: 0 16px; }
  .tab  { padding: 10px 16px; font-size: 13px; }

  /* ════════════════════════════════════════════
     HOME SCREEN — TWO-COLUMN HERO CARD
     RIGHT (38%): car image — RTL-start, visual right
     LEFT  (62%): name + plate + btns + widgets
  ════════════════════════════════════════════ */
  #screen-home > .content {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  #screen-home .hero-card {
    flex: 1;
    min-height: 0;
    margin: 6px 10px;
    flex-direction: row !important;
    align-items: stretch;
    border-radius: 20px;
    overflow: hidden;
  }

  /* RIGHT PANEL — car image (38%) */
  #screen-home .hero-img-area {
    flex: 0 0 38% !important;
    width: 38% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: hidden;
    display: flex !important;
    align-items: center;
    justify-content: center;
    position: relative;
    background: linear-gradient(180deg, #0e0e0e 0%, #111 60%, #0d0d0d 100%);
  }
  #screen-home .hero-img-area::before { animation: none !important; opacity: 0 !important; display: none !important; }
  #screen-home .hero-img-area::after  { display: none !important; }
  #screen-home .car-wrap {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  #screen-home .car-img {
    width: auto !important;
    height: 65% !important;
    max-height: 300px !important;
    max-width: 90% !important;
    object-fit: contain;
  }
  #screen-home .car-glow { width: 60%; bottom: 14px; height: 16px; }
  #screen-home .hl-glow  { display: none; }

  /* LEFT PANEL — content column (62%) */
  #screen-home .hero-body {
    flex: 1 !important;
    min-width: 0;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    padding: 22px 28px !important;
    gap: 12px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    text-align: right;
    min-height: 0;
  }
  #screen-home .hero-body::-webkit-scrollbar { display: none; }

  /* Identity */
  #screen-home .hero-name {
    font-size: clamp(22px, 2.8vw, 38px) !important;
    font-weight: 800;
    text-align: right;
    width: 100%;
    line-height: 1.1;
    flex-shrink: 0;
  }
  #screen-home .hero-plate-wrap {
    text-align: right !important;
    margin-top: 0;
    width: 100%;
    flex-shrink: 0;
  }
  #screen-home .hero-plate {
    font-size: clamp(18px, 2.2vw, 28px) !important;
    padding: 8px 22px !important;
    letter-spacing: 3px;
    border-width: 2px;
  }

  /* Action buttons: 2-col grid, full panel width */
  #screen-home .hero-btns {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
    margin-top: 4px;
    flex-shrink: 0;
  }
  #screen-home .hero-btn {
    min-height: 62px !important;
    padding: 16px 12px !important;
    font-size: 15px !important;
    font-weight: 600;
    border-radius: 14px;
  }
  #screen-home .hero-alert {
    padding: 10px 14px;
    margin-top: 0;
    width: 100%;
    border-radius: 12px;
    flex-shrink: 0;
  }

  /* Widgets: FULL panel width, STACKED vertically */
  #screen-home #svc-progress-mount,
  #screen-home #fuel-widget-mount { width: 100% !important; flex-shrink: 0; }
  #screen-home .svc-card {
    width: 100% !important; box-sizing: border-box;
    margin: 0 !important; padding: 16px 18px 18px !important; border-radius: 16px;
  }
  #screen-home .fuel-widget {
    width: 100% !important; box-sizing: border-box;
    margin: 0 !important; padding: 16px 18px !important; border-radius: 16px;
  }

  /* Hide quick actions in landscape (km via nav tab, fault via FAB) */
  #screen-home .sec,
  #screen-home .qa { display: none !important; }

  /* FAB: above nav */
  .fab {
    bottom: calc(92px + env(safe-area-inset-bottom, 0px));
    left: 18px; right: auto;
    padding: 12px 18px; font-size: 13px;
    animation: none;
  }

  /* ── Widget detail classes ── */
  .svc-hdr     { margin-bottom: 12px; }
  .svc-icn     { width: 32px; height: 32px; border-radius: 10px; }
  .svc-title   { font-size: 14px; }
  .svc-pill    { font-size: 11px; padding: 4px 10px; }
  .svc-stat-lbl{ font-size: 11px; }
  .svc-stat-val{ font-size: 18px; }
  .svc-stat-val .unit { font-size: 11px; }
  .svc-bar-bg  { height: 10px; }
  .svc-bar-wrap.with-marker { padding-bottom: 32px; }
  .svc-foot-txt{ font-size: 12px; }
  .svc-foot-val{ font-size: 13px; }

  .fw-label    { font-size: 13px; }
  .fw-pill     { font-size: 12px; padding: 4px 10px; }
  .fw-badge    { font-size: 28px; }
  .fw-headline { font-size: 16px; }
  .fw-sub      { font-size: 12px; margin-bottom: 8px; }
  .fw-bar-bg   { height: 7px; }
  .fw-bar-labels { font-size: 11px; }
  .fw-cta      { font-size: 12px; padding-top: 6px; }

  /* ── Vehicle screen ── */
  .igrid { grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 12px 16px; }
  .ig-card { padding: 12px 14px; border-radius: 16px; }
  .ig-icon { margin-bottom: 8px; }
  .ig-lbl  { font-size: 11px; }
  .ig-val  { font-size: 15px; }

  .tech-sec-hdr   { padding: 12px 18px 6px; }
  .tech-sec-title { font-size: 15px; }
  .tspec-cat      { padding: 8px 16px 4px; }
  .tspec-cat-title{ font-size: 12px; padding-bottom: 8px; margin-bottom: 8px; }
  .tspec-grid     { grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .tspec-item     { padding: 10px 6px 8px; border-radius: 12px; }
  .tspec-icon     { width: 30px; height: 30px; border-radius: 9px; }
  .tspec-val      { font-size: 12px; }
  .tspec-lbl      { font-size: 9.5px; }
  .tspec-bool     { font-size: 11px; padding: 6px 12px; }

  /* ── Alerts screen ── */
  .ssec       { padding: 10px 18px 6px; }
  .ss-lbl     { font-size: 15px; }
  .ss-count   { font-size: 12px; }
  .alert-card { margin: 0 16px 10px; padding: 14px 18px; border-radius: 16px; }
  .ac-title   { font-size: 15px; }
  .ac-sub     { font-size: 13px; }
  .ac-date    { font-size: 12px; margin-top: 8px; }

  /* ── Documents ── */
  .doc-row      { margin: 0 16px 8px; padding: 12px 16px; border-radius: 16px; gap: 14px; }
  .dr-icon-wrap { width: 38px; height: 38px; border-radius: 12px; }
  .dr-title     { font-size: 15px; }
  .dr-sub       { font-size: 12px; }

  /* ── History / timeline ── */
  .timeline { padding: 12px 16px 16px; }
  .tl-row   { gap: 16px; margin-bottom: 10px; }
  .tl-card  { padding: 12px 16px; border-radius: 16px; }
  .tc-date  { font-size: 14px; }
  .tc-row   { font-size: 13px; margin-top: 5px; }
  .tc-lbl   { font-size: 12px; }
  .tc-tag   { font-size: 12px; padding: 5px 14px; margin-top: 10px; }

  /* ── Service screen ── */
  .km-card    { margin: 12px 16px 0; padding: 18px 22px; border-radius: 18px; }
  .km-label   { font-size: 12px; }
  .km-prev    { font-size: 12px; }
  .km-input   { font-size: 18px; padding: 12px 16px; }
  .km-btn     { font-size: 15px; padding: 14px 20px; }
  .fault-card { margin: 12px 16px; padding: 18px 22px; border-radius: 18px; }
  .fault-label{ font-size: 12px; margin-bottom: 10px; }
  .fault-textarea { font-size: 14px; min-height: 80px; padding: 12px 14px; }
  .fault-btn  { font-size: 15px; padding: 14px; }

  /* ── Garage tab ── */
  .gar-wrap { padding: 12px 16px; gap: 12px; }
  .gar-card { border-radius: 18px; }
  .gar-head { padding: 14px 16px 12px; gap: 14px; }
  .gar-logo { width: 48px; height: 48px; border-radius: 16px; }
  .gar-name { font-size: 17px; }
  .gar-tag  { font-size: 11px; }
  .gar-row  { padding: 12px 16px; gap: 12px; }
  .gar-row-icn { width: 34px; height: 34px; border-radius: 10px; }
  .gar-row-lbl { font-size: 10.5px; }
  .gar-row-val { font-size: 14px; }
  .gar-mini-btn{ width: 36px; height: 36px; border-radius: 12px; }
  .gar-cta     { padding: 12px 16px; gap: 10px; }
  .gar-cta-btn { padding: 12px 16px; font-size: 14px; border-radius: 14px; }

  /* ── Quick actions (sec/qa): only shown on non-home screens if applicable ── */
  .sec { padding: 10px 16px 6px; font-size: 14px; }
  .qa  { gap: 8px; padding: 0 14px; grid-template-columns: 1fr 1fr 1fr; width: 100%; }
  .qa-card    { padding: 12px 8px 10px; border-radius: 16px; gap: 7px; }
  .qa-icon-box{ width: 38px; height: 38px; border-radius: 11px; }
  .qa-lbl     { font-size: 11px; }

  /* ── Fuel modal: centered on tablet ── */
  .fuel-modal { align-items: center; }
  .fm-sheet {
    max-width: min(580px, 86vw);
    max-height: 88vh;
    width: min(580px, 86vw);
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .fuel-modal.open .fm-sheet { animation: modalScaleIn .35s cubic-bezier(.16,1,.3,1) forwards; }
  @keyframes modalScaleIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
  .fm-drag-handle { display: none; }
  .fm-hero        { padding: 16px 20px 14px; }
  .fm-hero-val    { font-size: 40px; letter-spacing: -1px; }
  .fm-hero-unit   { font-size: 13px; }
  .fm-hero-row2   { margin-top: 10px; gap: 8px; }
  .fm-hero-chip,
  .fm-hero-chip2,
  .fm-hero-chip3  { font-size: 12px; padding: 5px 12px; }
  .fm-section     { padding: 0 16px 14px; }
  .fm-sec-title   { font-size: 11px; margin-bottom: 8px; }
  .fm-insight-card{ padding: 14px 16px; border-radius: 16px; }
  .fm-insight-icon{ font-size: 18px; }
  .fm-insight-label{font-size: 11px; }
  .fm-insight-text{ font-size: 13px; line-height: 1.6; }
  .fm-insight-footer{font-size: 10px; margin-top: 8px; }
  .fm-chart       { height: 80px; gap: 6px; }
  .fm-chart-val   { font-size: 9px; }
  .fm-chart-label { font-size: 10px; }
  .fm-chart-cost  { font-size: 8px; }
  .fm-tiles       { grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .fm-tile        { padding: 12px 14px; border-radius: 14px; }
  .fm-tile-lbl    { font-size: 10px; margin-bottom: 5px; }
  .fm-tile-val    { font-size: 18px; }
  .fm-tile-unit   { font-size: 11px; }
  .fm-stations    { gap: 8px; }
  .fm-station-card{ padding: 10px 14px; border-radius: 14px; gap: 12px; }
  .fm-station-rank{ width: 26px; height: 26px; font-size: 12px; }
  .fm-station-name{ font-size: 12px; }
  .fm-station-cost{ font-size: 13px; }
  .fm-station-ppl { font-size: 10px; }
  .fm-annual      { gap: 10px; }
  .fm-annual-item { padding: 10px 14px; border-radius: 14px; }
  .fm-annual-val  { font-size: 16px; }
  .fm-annual-lbl  { font-size: 10px; }
  .fm-close-btn   { margin: 14px; padding: 13px; font-size: 14px; border-radius: 14px; width: calc(100% - 28px); }

  /* ── Confirm modal: centered ── */
  #confirm-modal { align-items: center !important; }
  #confirm-modal > div { border-radius: 20px !important; padding: 28px 24px 32px !important; max-width: 460px !important; }
}
```

- [ ] **Step 2: Verify block replaced** — confirm ultra-compact block still starts immediately after the closing `}`.

---

## Task 4: SW Cache Bump + Deploy

**Files:**
- Modify: `driver/sw.js:1`

- [ ] **Step 1: Bump cache version**

Change:
```js
const CACHE_NAME = 'aleh-driver-v36';
```
To:
```js
const CACHE_NAME = 'aleh-driver-v37';
```

- [ ] **Step 2: Bump splash.css cache-bust in index.html**

Find:
```html
<link rel="stylesheet" href="splash.css?v=21">
```
Change to:
```html
<link rel="stylesheet" href="splash.css?v=22">
```

- [ ] **Step 3: Git commit and push**

```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver"
git add index.html splash.css sw.js
git commit -m "feat(landscape): professional tablet two-column layout — splash two-col, hero split-panel, full-width widgets, spacious nav"
git push
```

Expected output: `main -> main` push confirmation.
