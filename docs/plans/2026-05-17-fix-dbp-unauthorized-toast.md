# Fix: DBP Unauthorized Toast on Admin Load

**Goal:** Remove "שגיאה: unauthorized" toast that appears automatically on admin page load.

**Root Cause:** `setTimeout(dbpPollHealth, 1200)` fires on page load. `dbpPollHealth` calls `dbpFetch('db_health')` without `silent:true`. `dbpDispatch` checks `Session.getActiveUser().getEmail()` which returns empty string under ANYONE_ANONYMOUS deployment → returns `{ok:false, error:'unauthorized: '}` → `dbpToast('שגיאה: unauthorized: ', 'error')` fires.

**Fix:**
1. `code.js` — `dbpDispatch`: use `getEffectiveUser()` instead of `getActiveUser()` (effective user = developer = uzi@aleh.org when Execute-as-me)
2. `index.html` — `dbpPollHealth`: pass `{silent:true}` to suppress auth errors in background polling

---

- [ ] Fix `dbpDispatch` in code.js: `getEffectiveUser()` instead of `getActiveUser()`
- [ ] Fix `dbpPollHealth` in index.html: add `silent:true`
- [ ] clasp push + deploy
- [ ] git commit
