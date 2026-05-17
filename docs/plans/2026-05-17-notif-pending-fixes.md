# Plan: Notifications Redesign + Pending Screen Fixes

**Goal:** 4 תיקונים: מסך המתנה (אייקון+description+back btn), עיצוב התראות מחדש, כפילות הודעות, swipe-to-delete.

**Files:** `driver/app.js`, `driver/index.html`

---

## Task 1 — מסך "בקשה בהמתנה" — 3 תיקונים

**File:** `driver/app.js:2902-2964`, `driver/index.html` (CSS)

### 1A — אייקון שעון חול עם אנימציה
- [ ] הוסף CSS לאנימציית שעון חול ב-index.html
- [ ] החלף SVG שעון ב-SVG שעון חול עם אנימציית `hourglass-spin`

### 1B — כפתור חזרה — הסר transparent square
- [ ] הוסף `border-radius:20px;padding:6px 14px;` לstyle של הbutton

### 1C — הוסף `description` בתוכן הבקשה
- [ ] הוסף שורת תיאור מ-`pending.description` בcards info box

---

## Task 2 — עיצוב התראות מחדש (renderNotifHistory)

**File:** `driver/app.js:1389-1431`, `driver/index.html` (CSS)

- [ ] כל כרטיס — expand/collapse עם אנימציה
- [ ] layout ברור: icon + title + badge בשורה ראשית, פרטים expanded
- [ ] fix swipe: `_initSwipeDelete` מחפש `.nh-item` — תקן ל-`.notif-history-item`
- [ ] הוסף CSS expand animation

---

## Task 3 — תיקון כפילות הודעות

**File:** `driver/app.js:137-186` (saveNotifToHistory)

**Root cause:** dedup רק לפי `ts` (millisecond). אם אותה push מגיעה פעמיים עם ts שונה (למשל שתי clients פתוחות, או Firebase retry) — נשמר פעמיים.

**Fix:** dedup נוסף לפי `eventId` לגבי garage notifications, ולפי combination של `alertType + body` לשאר.

- [ ] הוסף dedup לפי eventId (אם קיים) ב-saveNotifToHistory

---

## Task 4 — Deploy + Commit
- [ ] clasp push (index.html)
- [ ] git commit app.js + index.html
- [ ] git push
