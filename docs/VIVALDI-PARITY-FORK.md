# Fork of Simple Tab Groups — Native Tab Group Integration (Vivaldi-parity project)

> **Goal:** Recreate Vivaldi's browsing model in Firefox — switchable **workspaces**, **tab
> groups/stacks** inside a workspace, and **persistence** of both across restarts — by
> forking **Simple Tab Groups (STG)** and having it manage Firefox's **native tab groups**
> through the `tabGroups` / `tabs.group` WebExtensions APIs, styled by `userChrome.css`.

---

## 0. Fork status and revised plan (living section — updated per phase)

This is the working copy of the design doc, kept in the fork repo. The original lives one folder
up in `FirefoxWorkspaceExtension/stg-fork-native-tab-groups-design.md` and is frozen.

- **Fork base:** `Drive4ik/simple-tab-groups` master at `71b37bf1` (2026-09-12), unreleased
  **v6.0** dev line (`strict_min_version: 140.0`). Remote `upstream`; work happens on branch
  `vivaldi-parity`. No GitHub fork exists yet — `gh` is not installed on this machine; add the
  GitHub fork as `origin` before the first push.
- **Build/gate:** `cd addon && npm install && npm run build` (webpack → `addon/dist/`), lint with
  `npx eslint addon/src` from the repo root. Baseline: build green with 9 pre-existing warnings,
  lint has 1 pre-existing error (`components/popup-helpers.vue:33 vue/no-mutating-props`) that is
  not ours. The gate for this fork is: build compiles, lint introduces no new errors.
- **Load for testing:** `about:debugging` → Load Temporary Add-on → `addon/dist/manifest.json`.

### 0.1 Recon result — what upstream v6.0 already does (milestones 2–5 of §7)

The spec was written against STG v5.2. Upstream master has since integrated native tab groups; the
architecture matches §2/§3 closely, with different names:

| Spec concept (§3/§4)                     | Upstream v6.0 implementation                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `tabGroups` permission                   | already in `addon/src/manifest.json`                                                                               |
| `nativeGroups[]` per workspace           | `group.groupsNative = [{id, title, collapsed, color}]` on each STG group                                           |
| `stableKey` (never persist numeric id)   | `id` = 8-char UUID slice (`GroupsNative.createSubGroupId`); live↔stable maps in `js/groups-native.js`             |
| `tabStableKeys` membership               | per-tab session value `groupNativeId` (`sessions.setTabValue`) — travels with the tab through restart/backup/cloud |
| §4.1 capture                             | `mirrorWindow()` in `groups-native.js`, fed by `tabGroups.on*` + tab events, batched 150 ms, gated per window      |
| §4.2 leaving: ungroup → hide             | `Groups.applyNow → hideTabs()` in `js/groups.js` (~line 145): `GroupsNative.ungroup` then `Tabs.hide`             |
| §4.2 entering: show → group → update     | `Groups.applyNow` (~line 136): `Tabs.show` then `GroupsNative.apply(windowId, group)` rebuilds from sessions       |
| §4.3 startup rebuild                     | `Windows.load(...)` end (`js/windows.js` ~line 990): `GroupsNative.reconcileWindow(win.id, afterRestoring)`       |
| §5 ordering/contiguity                   | `Tabs.moveNative` gathers the group as one block first; `docs/TABGROUPS-BEHAVIOR.md` §20/§21                        |
| §5 pinned / containers / races           | pinned excluded from queries; containers handled by STG core; `Operations.run` busy-gate defers the mirror         |
| §5 cross-workspace bleed                 | fixed by ungroup-before-hide (`docs/TABGROUPS-BEHAVIOR.md` §4: a header of an all-hidden group stays in the bar)   |
| §5 ungrouped-after-restart               | fixed: sessions survive restart, `reconcileWindow(afterRestoring=true)` re-applies                                 |

Browser facts the fork relies on (all from `docs/TABGROUPS-BEHAVIOR.md`, verified live on FF 154):

- §5: `tabGroups.update` cannot change an id; collapsing keeps the **active** tab drawn outside the
  header; activating a tab inside a collapsed group fires only `tabs.onActivated`, no
  `tabGroups.onUpdated`, and `collapsed` stays `true`.
- §14: dragging a group header collapses it for the drag (`onUpdated {collapsed:true}`) and
  re-expands on drop (`onUpdated {collapsed:false}`).
- §15: expand / collapse / recolor each fire exactly one `tabGroups.onUpdated`.

### 0.2 What is NOT in upstream — the fork's actual work

1. **§4.4 single-active enforcement** — nothing in upstream collapses other groups. This is the
   fork's core feature.
2. **Single-active on rebuild** — `GroupsNative.apply` restores every group's saved `collapsed`
   flag; several can come back expanded at once. The enforcement must also run after apply.
3. **Fork identity / packaging (§6)** — a distinct add-on id and name so it can be signed as an
   unlisted AMO add-on alongside or instead of STG; the companion `userChrome.css` (§8) kept in-repo.

### 0.3 Revised phases

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Recon; spec into repo; branch `vivaldi-parity` | done 2026-09-14 |
| 1 | §4.4 single-active: `js/groups-native-exclusive.js`; option `singleExpandedNativeGroup` (default **on**) with Options UI + en locale | done 2026-09-14 (see 0.4) |
| 2 | Fork identity: manifest id/name/version, README section for building/loading/signing, `chrome/userChrome.css` companion committed with install notes | done 2026-09-14 (see 0.5) |
| 3 | Edge cases (§5) audit against upstream behavior + manual test checklist for the user (switch, restart, single-active, header drag, pinned) | done 2026-09-14 (see 0.6); manual tests not yet run |
| 4 | Rename to **Simple Workspaces**: display name, add-on id `simple-workspaces@dacite.dev`, short name, homepage, GitHub repo `DaciteRocks/simple-workspaces` | done 2026-09-14 (see 0.7) |
| 5 | Publishing prep for a **listed** AMO release: new icon, Gist sync disabled and no data collection, privacy policy, `build-for-amo` script and reviewer README, listing draft, repo default branch | done 2026-09-14 (see 0.8); not yet exercised in a live Firefox |
| 6 | One-command local testing: `npm run test:firefox` (build, watch, Firefox with a separate test profile, userChrome.css, checklist page), `:smoke`, `:reset` | done 2026-09-14 (see 0.9); smoke test passes headless |
| 7 | §4.4 activation rule: activating a tab that is in no native tab group collapses the expanded group(s) of that window, so the lower bar disappears; the state-based "which group survives" rule becomes "the active tab's group, else none" | done 2026-09-23 (see 0.10); manual rows 13–18 not yet run |
| 8 | User-visible terminology: the add-on's own groups are called **workspaces** in all English UI text; Firefox native groups are always **tab groups**; identifiers, keys and file names untouched | done 2026-09-23 (see 0.11); review clean from both reviewers |

Milestones 2–5 of §7 are covered by upstream (see 0.1) and are **not** re-implemented.

### 0.4 Phase 1 — what landed

`addon/src/js/groups-native-exclusive.js`, registered from `background.js` `addEvents()` / `removeEvents()`:

- **Triggers:** (a) `tabGroups.onUpdated` with a remembered collapsed → expanded transition (rename/recolor
  updates are ignored by comparing against the last known flag); (b) `tabGroups.onCreated` of an expanded
  group (the browser's own "add tabs to new group" is born expanded, §7); (c) `tabGroups.onMoved` of an
  expanded group (arrival from another window, §16); (d) after `GroupsNative.apply` / `restoreMembership`
  / `reconcileWindow`; (e) switching the option on.
- **Action:** `tabGroups.update(id, {collapsed: true})` on every other expanded group of that window. The
  module only ever collapses, so it cannot feed itself. Collapsing the group holding the active tab is
  safe (§5: the active tab stays drawn outside the header).
- **Which group survives:** the one the user opened (remembered per window until the next tab activation
  there); otherwise the one holding the active tab; otherwise
  none (phase 7 — it was "the first reported" until then, see 0.10). While an STG composite operation is running (`Operations.isBusy()`), the request
  is parked per window and runs on idle; an explicit "keep this one" is never overwritten by a later
  state-based request from the same operation.
- **Persistence caveat (by design, flagged in review):** the mirror in `groups-native.js` records the
  enforced collapses into `group.groupsNative[].collapsed` exactly as it would a user collapse, so a
  workspace saved with several expanded sub-groups is rewritten to single-expanded the first time it
  is loaded with the option on. Turning the option off later does not bring the old layout back.
- **Review (phase-review + code-review, merged):** both found the `onCreated` gap and the module-scope
  storage listener running in UI pages (fixed: listener registered in `addListeners`, background only).
  Only phase-review found `onMoved`; only code-review found the parked-null overwrite. Skipped: a
  proposed shared "defer while busy" helper — it would refactor upstream code in `groups-native.js`
  and raise merge cost for a duplicate that is 15 lines.
- **Locales:** English only; ru/uk fall back to `default_locale` via `i18n.getMessage`.

### 0.5 Phase 2 — what landed

- **Manifest identity:** id `simple-tab-groups-vivaldi@dacite.dev`, name "Simple Tab Groups - Vivaldi
  Fork", short name `STG-V`, version `6.0.0.1` (digits only, AMO-safe). A distinct id is required to
  sign the fork as an unlisted AMO add-on (§6). Consequences: storage is per id, so an upstream STG
  backup must be exported and imported once (README), with upstream disabled first; STG plugins and the
  Windows backup host (`host/Settings.pas` allowed_extensions) accept only the upstream id and do not
  work with the fork; `homepage_url` still points at upstream.
- **Packaging:** `npm run build-zip` now works (upstream imported a non-existent `webpack.config.mjs`);
  it produces `addon/dist-zip/<id>-v<version>-{prod,dev}.zip`, the prod zip is what gets uploaded to
  AMO. `npm run dev` added as an alias of `watch`.
- **Companion CSS:** `chrome/userChrome.css` (the v6 file from §8) with `chrome/README.md` install
  notes. The profile path in §8 is machine-specific; the README describes the generic path.
- **Not done here:** the actual AMO submission (needs the user's developer account).
- **GitHub repo:** <https://github.com/DaciteRocks/simple-workspaces>, **public, detached from the upstream fork network** since 2026-09-14 (briefly private while detaching), default branch `vivaldi-parity` (renamed from `simple-tab-groups` in phase 4). Remote `origin`, branch `vivaldi-parity`. Upstream changes still come in through the local `upstream` remote.
- **Review (phase-review + code-review, merged):** 0 kept, 4 noted and applied. Both reviewers found the
  toolbar/sidebar titles still reading "Simple Tab Groups" (fixed: en `extensionName` renamed, which
  also gives the fork its own bookmarks root folder). Only code-review found the migration steps never
  disabled upstream (fixed in README, and upstream's id added to `CONFLICTED_EXTENSIONS` so the fork
  warns when both run). Only phase-review found the backup-host id limit and the stale Gesturefy id
  (both documented). Dropped by the verifier: code-review's claim that `6.0.0.1` makes upstream reject
  fork data — `isDataVersionNewer` compares majors only (`compareNumericVersions` returns 4, not 1).

---


### 0.6 Phase 3 — §5 edge-case audit and manual test plan

Nothing in this phase changes code: every §5 item is either already handled by upstream's
native-group layer or is a browser limitation that can only be confirmed by hand. Facts cite
`docs/TABGROUPS-BEHAVIOR.md` (§n) and the upstream issues the spec names.

| §5 item | State | Where / why |
| - | - | - |
| Group-id instability | handled | stable 8-char ids in `group.groupsNative[].id`, live↔stable maps in `groups-native.js`; the exclusive module keys on live ids only for the lifetime of one window and drops them on `onRemoved` |
| Ordering & contiguity | handled | on a normal same-window switch, `tabs.group` pulls the members to the first one and keeps the order we pass (§3, implication 5); `Tabs.moveNative` gathers the workspace into one block first only when some of its tabs are in another window (`groups.js` applyNow) |
| Tab identity across restart | handled | membership is a `sessions.setTabValue` on the tab, which Firefox itself carries across restart (§6); no URL/position heuristic needed |
| Pinned tabs | handled by the browser | pinning strips native membership itself (§19), unpin does not restore it; `queryWindowTabs` excludes pinned; the exclusive module never touches pinned tabs (groups cannot contain them) |
| Split view | **unverified, likely still broken** | upstream #1352 (open, no response): hiding a split-view tab leaves an empty placeholder tab. No split-view handling exists in `addon/src`. Test 7 below; fix would be a follow-up phase |
| Containers (`cookieStoreId`) | handled | membership rides on the tab, independent of container; upstream #1227 (open) describes container groups acting as pinned — a Firefox-side behavior, test 8 |
| Window scoping | handled | native groups are window-scoped (§16); `apply`/`enforceWindow` take a `windowId`; a group moved to another window keeps its live id and is re-enforced via `onMoved` |
| Races / feedback loops | handled | `Operations.isBusy()` parks both the mirror and the enforcement until idle; the exclusive module only collapses, so its own `onUpdated` events never re-trigger it. Groups the addon itself creates during a rebuild are born expanded (§3) and do not claim the kept slot, so the group holding the active tab wins (fixed in phase 3 review) |
| Header-drag flicker (§14) | handled | the drag collapses the group and re-expands it on drop; that re-expand is a real transition and keeps the dragged group, collapsing others — consistent with "the group you touched is the open one" |

#### Manual test plan (Firefox 155, fork loaded as temporary add-on, `chrome/userChrome.css` installed)

Setup: two STG workspaces W1 and W2. In W1 create native groups A (3 tabs) and B (2 tabs) via the
browser's tab context menu; in W2 create group C (2 tabs).

| # | Action | Expected |
| - | - | - |
| 1 | Expand A, then expand B | A collapses on its own; the bottom bar shows only B |
| 2 | With a tab of B active, expand A | B collapses; B's active tab is still drawn beside B's collapsed header (§5); bottom bar shows A |
| 3 | Select two ungrouped tabs → "Add tabs to new group" while A is expanded | the new group is expanded and A collapses |
| 4 | Rename B (type several characters) while A is expanded | A stays expanded; nothing collapses (rename is not an expand) |
| 5 | Switch W1 → W2 → W1 via the STG popup | no A/B headers visible in W2 (no bleed); back in W1 A and B are rebuilt with their titles/colors and at most one expanded |
| 6 | **Needs a signed build.** A temporary add-on is gone after a restart, and Firefox restores groups, titles and collapsed flags on its own (§6), so a temporary run would pass with the fork absent. Steps: untick the option; expand both A and B; activate a tab in A; quit Firefox fully; restart; tick the option again | right after ticking, B collapses and A, which holds the active tab, stays open; switching W1 and W2 still rebuilds both workspaces |
| 7 | Put two tabs of A in split view, switch to W2 | **known risk (#1352):** check whether an empty placeholder tab appears in W2; record the result in this table |
| 8 | Create a container tab inside A, switch W1 → W2 → W1 | the container tab is back inside A |
| 9 | With B expanded and A collapsed, drag B's header to another position | B is still expanded after the drop and A stays collapsed (§14: the drag collapses then re-expands B; that re-expand keeps B). Dragging a *collapsed* header is not covered by §14 — note what happens |
| 10 | Drag a single tab out of A into a new window | A survives in W1; the new window has one ungrouped tab (§16) and nothing is collapsed anywhere |
| 11 | Options → untick "Keep only one native tab group expanded" → expand A and B | both stay expanded; re-tick → both collapse immediately (since phase 7: the active tab is the Options page, on the top bar) |
| 12 | `about:debugging` → Inspect the fork → console filter `GroupsNativeExclusive` | one `enforceWindow` line per collapse, none during rename |
| 13 | A expanded with one of its tabs active; click an ungrouped tab on the top bar | A collapses; the bottom bar is gone; the clicked tab is active |
| 14 | A expanded; click a pinned tab | same as 13 — a pinned tab counts as the top bar |
| 15 | Active tab ungrouped; expand A from its header | A opens and stays open (explicit expand wins over the active tab); now click any top-bar tab → A collapses |
| 16 | A expanded; switch to a tab of collapsed B with Ctrl+Tab or the toolbar popup | A collapses; B stays collapsed with its active tab drawn beside its header (§5); expanding B from the header shows its tabs |
| 17 | A expanded with its active tab in it; close that tab (A keeps at least one other tab) | note which tab Firefox activates; if it is in A, A must stay expanded; if Firefox picks an ungrouped neighbour, A collapses — record which |
| 18 | In W1 make an ungrouped tab active, switch W1 → W2 → W1 | W1 comes back with A and B both collapsed and the ungrouped tab active; in W2 the same rule holds for C |

**Not run yet.** This session cannot drive the Firefox UI, so none of the 18 checks has a result. Record
pass/fail per row when run; anything that fails becomes its own phase. Rows 13–18 (activation rule)
were added by phase 7 (0.10).

**Review (phase-review + code-review, merged):** 1 kept, 2 noted, all applied. Kept (phase-review only):
test 6 could not catch anything with a temporary add-on, rewritten to need a signed build. Noted (code-review
only): during a workspace rebuild the addon's own expanded groups claimed the kept slot, so the last
rebuilt group won over the one holding the active tab; fixed in `groups-native-exclusive.js` by
`userKeepId`, which gives no keep id to arrivals while an addon operation is running. Noted (both): the
ordering row named `Tabs.moveNative`, which only runs for cross-window tabs. Dropped as pedantic: test 12
log wording, "lifetime of one window" phrasing, the intro vs split-view wording, a §16/§17 citation.

### 0.7 Phase 4 — rename to Simple Workspaces

- **Display name:** en `extensionName` is `Simple Workspaces`; every other locale falls back to it, so the
  toolbar button, sidebar, notifications, Backup tab and bookmarks root folder all use it. The name has no
  Mozilla or Vivaldi trademark in it, as the AMO linter requires, and no AMO listing used it on 2026-09-14.
- **Add-on id:** `simple-workspaces@dacite.dev`, replacing the phase 2 id before anything was signed.
  The id is permanent after the first AMO signing. Zip names follow it.
- **Manifest:** `short_name` `Workspaces`, `homepage_url` points at the fork. `author` stays upstream's,
  since the code is theirs under MPL-2.0.
- **GitHub:** repo renamed to `DaciteRocks/simple-workspaces`; GitHub redirects the old URL. The local
  folder keeps its `simple-tab-groups` name. The repo left the fork network and is public again for the listed release, so `homepage_url` and the DB-error "Install" link resolve for everyone.
- **Review (phase-review + code-review, merged):** code-review found nothing. Phase-review found 12 English
  strings still calling the product "STG" (verifier: NOTE 70), applied: they now use `__MSG_extensionName__`.
  The DB-error help page's "Install" link now points at the fork instead of upstream's AMO listing.
  Dropped as untouched by this phase: the About tab's upstream AMO link and the `STG-backups` default
  backup folder, which is a real folder name and stays.
- **Unchanged on purpose:** translator `description` notes that mention Simple Tab Groups, the upstream
  AMO badges in README.md, which the banner now labels as upstream, and this document's file name.
- **Other locales still say STG:** 19 locales use the token 150 times inside inflected grammar, so a
  blind swap would break sentences. Left for translation; English is complete.

### 0.8 Phase 5 — publishing prep for a listed release

Goal: a public, listed addons.mozilla.org release. Decided with the user: the repo is public and
detached from the fork network; upstream is credited; AMO policy requires a fork to be clearly
distinguished, so the add-on also gets its own icon.

- **Icon:** `addon/src/icons/icon.svg` and `icon-animate.svg` redrawn. A workspace window in front with a
  two-level tab bar and another workspace behind it. Single `context-fill` color, so it follows the
  toolbar theme like upstream's. Checked at 128/48/32/16 px on light and dark backgrounds.
- **Cloud sync disabled (user decision, 2026-09-14):** upstream's GitHub Gist sync is not needed for the
  fork's goals. `CLOUD_SYNC_AVAILABLE = false` in `js/constants.js` hides the Settings sync section, the popup
  sync button and menu item, the group editor's "upload to cloud" option and the sync hotkey; background
  `resetSyncAlarm` never arms the alarm and `cloudSync` returns early. The `start-cloud-sync` manifest
  command is removed. Upstream's sync code is kept untouched for merges.
- **No data collection:** manifest declares `data_collection_permissions: {required: ["none"]}`. An earlier
  draft of this phase added optional consent for Gist sync; review found it notified every install daily
  and could break Start sync, and it was reverted once sync was disabled.
- **No remote requests:** `Extensions.loadIconUrl` no longer fetches add-on icons from the AMO API, and the
  About page's plugin icons use the local generic icon instead of addons.mozilla.org. `MOZILLA_API` removed.
- **Review (phase-review + code-review, two rounds):** round 1 on the consent draft kept the daily
  notification on every install (both reviewers), plugin icons loading from addons.mozilla.org and "sync off
  by default" being false (phase-review); noted the content script description and a consent message wiped
  by a 30 s poll. Dropped: a second consent request breaking Start sync, the untracked lockfile. The consent
  code was then reverted with sync disabled. Round 2 on the disable commit found no reachable sync path
  (both). Kept: the privacy policy wrongly said backups only run when turned on, while daily backups to
  Downloads are on by default (phase-review; policy corrected, default left as upstream's). Noted and fixed:
  the container help page fetched `<origin>/favicon.ico` itself (phase-review), and a `start-cloud-sync`
  hotkey from an upstream backup showed a blank action (both; imports now drop unknown actions).
- **Privacy policy:** `docs/PRIVACY.md`, also pasted into the listing.
- **Build for AMO:** `build-for-amo` npm script, `addon/README.md` rewritten as reviewer build notes
  (Windows 11, Node 20.19.6, npm 10.8.2, `npm ci` then `npm run build-for-amo`, output `dist/`).
- **Listing draft:** `docs/AMO-LISTING.md`: summary (201 of 250 characters), description with upstream
  credit and known limitations, category, support links, screenshot list, version notes, reviewer notes
  with a per-permission explanation.
- **GitHub:** default branch set to `vivaldi-parity`.
- **Not verified:** nothing in this phase was exercised in a running Firefox; AMO's default build
  environment (Ubuntu, Node 24) was not tried. Screenshots still have to be taken.

### 0.9 Phase 6 — one-command local testing

Goal from the user: testing locally should be as easy as possible, with everything automated.

- **Tool:** Mozilla's `web-ext` 10.6.0 as a dev dependency. Checked before adding: maintained by Mozilla's
  add-ons automation account, MPL-2.0, monthly releases (latest 2026-08-04), about 164k weekly downloads,
  not deprecated.
- **`npm run test:firefox`** (`addon/scripts/test-firefox.js`): builds once, starts `webpack --watch`, then
  `web-ext run` against `addon/dist` with a persistent test profile in `addon/.firefox-test-profile`
  (gitignored). It copies `chrome/userChrome.css` into the profile and sets prefs for the stylesheet,
  session restore, keeping extension storage when the temporary add-on is removed, and a quiet first run.
  On a new profile it opens `addon/scripts/test-checklist.html`. web-ext reloads the add-on after each
  rebuild. Closing Firefox or Ctrl+C stops the watcher and only the Firefox processes started with the test
  profile; the user's own Firefox is never touched.
- **Checklist page:** setup steps, the 12 tests adapted from 0.6 (test 11 and the new test 12 reflect
  disabled sync), pass/fail/skip plus notes saved in the profile, and a "Copy results" button that produces
  a plain-text report to paste back into a session.
- **`npm run test:firefox:smoke`:** headless run with its own throwaway profile; passes once web-ext reports
  the add-on installed, then cleans up. Verified passing twice on Windows 11 with Firefox 155.0.1 while the
  user's Firefox stayed running.
- **`npm run test:firefox:reset`:** deletes the test profile.
- **Limit:** the restart test in this setup reinstalls the temporary add-on after Firefox restores tabs,
  which is close to but not the same as a restart with an installed add-on.
- **Review (phase-review + code-review, merged):** 2 kept, 3 noted, all applied. Both found that the build
  watcher discarded webpack's stdout, so a broken rebuild was silent (watcher now inherits stdout with
  `--stats errors-only`), and that the profile match was a substring, so the smoke profile and the real one
  matched each other (now the exact `-profile` argument, and only the smoke run deletes its profile). Both
  noted that a failed first launch left the folder and skipped the checklist forever (a profile is now "used"
  only once Firefox wrote `prefs.js` or `times.json`). Only phase-review noted that web-ext's profile defaults
  disable crash recovery while Ctrl+C is a hard kill (`browser.sessionstore.resume_from_crash` set true, and
  closing the window is the recommended stop) and that an unknown saved answer broke the checklist render.

### 0.10 Phase 7 — activation rule: a top-bar tab closes the lower bar

**Status:** done 2026-09-23

**User feedback (verbatim):** "When I click on a tab that is in a tab group, it comes down a level. But
when I click on a tab on the top bar I want the tabs on the lower level to disappear like it does in
vivaldi."

**Scope.** In `addon/src/js/groups-native-exclusive.js`, the state-based "which expanded group survives"
rule changes from *the group holding the active tab, else the first reported* to **the group holding the
active tab, else none**, and `tabs.onActivated` becomes a trigger. Net effect: activating any tab that is
not inside an expanded native tab group — an ungrouped tab, a pinned tab, or the active tab of a
*collapsed* group (Firefox draws it on the top bar beside the header, behavior doc §5) — collapses every
expanded group in that window, so the userChrome.css bottom bar disappears. Activating a tab inside the
expanded group changes nothing. An explicit expand (header click, "add tabs to new group", a group moved
in from another window) still keeps that group even when the active tab is elsewhere — the user asked
for it. What exists at the end:

- `tabs.onActivated` handler: `scheduleEnforce(windowId)` with no keep id, using the event's own
  `windowId` (review: the planned `tabs.get(tabId)` hop was unnecessary and opened a race). Subscribed through `Listeners` in `addListeners` /
  `removeListeners` like the `tabGroups` events (`import Listeners from './listeners.js?...&tabs.onActivated'`).
  No reference to `tabs.js` internals (`skip.tracking`, `skipTrackingWindows` are not exported).
- `pickGroupToKeep` returns `null` when no explicit keep applies and the active tab's group is not among
  the expanded ones; `enforceWindow` then collapses all, and its early return becomes "nothing expanded"
  (`< 1`) instead of "fewer than two".
- The parking rule is unchanged: while `Operations.isBusy()`, requests wait per window and run once on
  idle; an explicit keep is never overwritten by a state-based one. During a workspace rebuild the
  activations STG itself performs are therefore folded into the single idle-time decision — the module
  never fights `GroupsNative.apply`.
- The module stays **collapse-only**. Activating a tab inside a collapsed group does not expand it (that
  is also Firefox's own behavior, §5 R4.02); the user expands it from the header. User decision
  2026-09-23: stay collapse-only, no auto-expand phase.
- Option: gated by the existing `singleExpandedNativeGroup`, no new option — it is the same Vivaldi rule.
  The option's description string in `addon/src/_locales/en/messages.json` (key
  `singleExpandedNativeGroup`, the `...Description` entry beneath it) gains one sentence: selecting a tab
  outside the expanded group collapses it.
- Persistence: enforced collapses are mirrored into `group.groupsNative[].collapsed` (0.4 caveat). Accepted
  as is — with this rule "expanded" is a function of the active tab plus the last explicit expand, so a
  stored flag only ever decides the active tab's own group (a collapse-only module cannot expand it);
  every other stored-expanded group is collapsed on the next enforcement. Document that in the module's
  header comment; no storage change.
- Module header comment, §4.4 (already describes the rule below; check it matches what landed) and the
  0.4 "which group survives" line updated. Rows 13–18 below appended to the §0.6 table and to `TESTS` in
  `addon/scripts/test-checklist.html` (same wording style as its existing entries; bump `STORAGE_KEY` only
  if the saved-answer shape changes, which it should not).

Test rows to add (Firefox 155, setup as in §0.6: W1 with groups A and B, W2 with C):

| # | Action | Expected |
| - | - | - |
| 13 | A expanded with one of its tabs active; click an ungrouped tab on the top bar | A collapses; the bottom bar is gone; the clicked tab is active |
| 14 | A expanded; click a pinned tab | same as 13 — a pinned tab counts as the top bar |
| 15 | Active tab ungrouped; expand A from its header | A opens and stays open (explicit expand wins over the active tab); now click any top-bar tab → A collapses |
| 16 | A expanded; switch to a tab of collapsed B with Ctrl+Tab or the toolbar popup | A collapses; B stays collapsed with its active tab drawn beside its header (§5); expanding B from the header shows its tabs |
| 17 | A expanded with its active tab in it; close that tab (A keeps at least one other tab) | note which tab Firefox activates; if it is in A, A must stay expanded; if Firefox picks an ungrouped neighbour, A collapses — record which |
| 18 | In W1 make an ungrouped tab active, switch W1 → W2 → W1 | W1 comes back with A and B both collapsed and the ungrouped tab active; in W2 the same rule holds for C |

**Budget:** 4 files touched (`groups-native-exclusive.js`, en `messages.json`, `test-checklist.html`, this
spec); read first: `groups-native-exclusive.js` (229 lines), `operations.js` (45 lines), `tabs.js` lines
40–60 and 199–230 (how `Listeners.tabs.onActivated` is subscribed), `docs/TABGROUPS-BEHAVIOR.md` §5.

**Gate:** `cd addon && npm run build` green (no new warnings beyond the 9 baseline), `npx eslint addon/src`
from the repo root with no new errors (1 pre-existing), `cd addon && npm run test:firefox:smoke` passes.

**Verification:** `cd addon && npm run test:firefox`, run rows 13, 15 and 16 from the checklist page; row 13
is the user's ask. `about:debugging` console filter `GroupsNativeExclusive` shows one `enforceWindow` line
per top-bar click that collapsed something and none for clicks inside the expanded group.

**Risks / unknowns:**

- *Flicker during window load or restore.* Firefox activates tabs while `Windows.load` /
  `reconcileWindow` run; if any of that happens outside an `Operations.run` scope, a group could collapse
  and be re-applied within one rebuild. If row 5 or 18 shows a group blink, gate the handler additionally
  on the per-window mirror gate in `groups-native.js` (same one that defers `mirrorWindow`), not on a timer.
- *Tab close inside the expanded group (row 17).* Firefox's choice of the next active tab is not in the
  behavior doc. If it picks an ungrouped neighbour and that feels wrong in use, the fix is a follow-up, not
  a special case here: the rule "the bottom bar shows the active tab's group" is the point.
- *Keyboard tab cycling.* Ctrl+Tab through several ungrouped tabs fires one `enforceWindow` each; each is
  one `tabGroups.query` and returns early once nothing is expanded. No debounce needed; add one only if
  the log shows repeated collapse calls.
- *Other locales* fall back to English for the changed description string, as in phase 1.

**What landed** (commits `28632315`, review fixes after it): the rule, the `tabs.onActivated` trigger,
the options sentence, checklist rows 13–18. Gate: build (9 baseline warnings), eslint (1 pre-existing
error), `test:firefox:smoke` pass.

- **Review (local-code-review + code-review, merged):** 1 kept, 4 noted, all applied. Only
  local-code-review kept that "else none" let a *state-based* enforcement (mirror apply, restore,
  reconcile, the option switched on) collapse a group the user had just expanded while the active tab was
  on the top bar, because the explicit keep lived only for the synchronous call. Fix: the module remembers
  the last explicit expand per window in memory (set on the expand transition and on user arrivals via
  `onCreated` / `onMoved`; cleared by the next activation in that window, when that group collapses, or
  when it is removed), and `pickGroupToKeep` honours it after the active-tab query. Both reviewers found
  the `tabs.get` hop in `onActivated` (the event carries `windowId`); only code-review named the race it
  opened (an activation followed quickly by a header expand could undo the expand) — the event's
  `windowId` plus the remembered expand close it. local-code-review noted the "stored flag" sentence was
  backwards (fixed here and in the module). Only code-review noted that row 11 now expects both groups to
  collapse on re-tick.

### 0.11 Phase 8 — "workspaces" in all English UI text

**Status:** done 2026-09-23 — phase commit `8f1308a6`; review clean from both reviewers
(`local-code-review` and `/code-review` found nothing to fix), so no fixes commit. Gate: build green
(9 baseline warnings), eslint 1 pre-existing error only, `test:firefox:smoke` PASS. Not yet walked through
the Verification steps in a live Firefox.

**What landed.** 6 files: `addon/src/_locales/en/messages.json` (every STG-group string now says workspace,
native groups say tab group; `newGroupTitle` = "Workspace $id$"; one-liner "…quickly change workspaces"),
`addon/src/help/open-in-container.html` fallback text, `addon/scripts/test-checklist.html`, `README.md`
feature bullets, `docs/PRIVACY.md`, `docs/AMO-LISTING.md` (summary 205 characters). No keys, identifiers or
file names changed.

**Surviving "group" in `grep -n -i '"message".*group'` (27 lines), all allowed kinds:**

- *Placeholder names only* (`$grouptitle$`, `$group$`, `$groupTitle$`, `$groupName$`, `$groupscount$`; the
  visible text says workspace): lines 35, 211, 417, 427, 523, 729, 755, 935, 949, 1015, 1093, 1361.
- *`__MSG_manageGroupsTitle__` references* (key kept, text is "Manage workspaces"): 111, 277, 385, 835.
- *Third-party product names* "Tab Groups" (Quicksaver) and "Sync Tab Groups" (Morikko): 159, 163, 625, 629.
- *Native tab group option strings* (`cloneSubGroupsWhenMovingTabs`, `singleExpandedNativeGroup`): 645,
  649, 653, 657.
- *The upstream repository URL* `github.com/drive4ik/simple-tab-groups` in the URL-rules example: 297.

**Left as found (out of scope, noted by review below its reporting bar):** the `el` locale still carries
untranslated English "Group $id$" / "Group" (other locales are untouched by design);
`addon/package.json` description still says "tab groups" (not user-visible).

**User feedback (verbatim):** "can we change the name of the window groups to workspaces instead of
groups? there are two 'tab groups' now and that is confusing."

**Scope.** Every English string a user can see calls the add-on's own per-window tab sets **workspaces**,
and Firefox's native groups **tab groups** — never a bare "group". Text only: no identifier, storage key,
message key, hotkey command name, CSS class or file name changes (keeps upstream merge cost low; same
precedent as phase 4, which removed "STG" from English UI text without touching keys). English only;
every other locale stays as it is and keeps falling back per key.

Term table the implementer applies, string by string (105 of the 347 en messages mention "group"):

| Meaning in the string | Write |
| - | - |
| An STG group (what the popup lists, hotkeys load, backups export, menus move tabs to) | workspace / workspaces / Workspace |
| A Firefox native group (the two options `cloneSubGroupsWhenMovingTabs`, `singleExpandedNativeGroup`, and any string about collapsing / expanding / headers) | tab group — and where the same sentence also names an STG group, that one is "workspace" ("…the native tab group of tabs moved to another workspace") |
| Third-party product names: Quicksaver's "Tab Groups", Morikko's "Sync Tab Groups", upstream "Simple Tab Groups" | unchanged |
| `newGroupTitle` `"Group $id$"` | `"Workspace $id$"` — existing saved titles are data and are not migrated |
| `extensionDescription` "Create, modify and quickly change tab groups" | "…workspaces" (this is the AMO/about:addons one-liner) |
| Translator-facing `description` fields inside `messages.json` | unchanged (not user-visible) |
| Folder / file names shown in UI (`STG-backups`, bookmark root = `extensionName`) | unchanged (real names) |

Files: `addon/src/_locales/en/messages.json` (the bulk), `addon/src/help/open-in-container.html` (three
English fallback paragraphs, ids `helpPageOpenInContainer*` — keep them identical to the locale text),
`addon/scripts/test-checklist.html` (setup text and a few `TESTS` entries still say "group" for
workspaces; native ones stay "tab group"), `README.md` (upstream-inherited feature bullets under the fork
banner; the banner and migration steps already say workspaces and name "Simple Tab Groups" as a product),
`docs/PRIVACY.md` (6 mentions), `docs/AMO-LISTING.md` (already workspace-first; check the "One group open
at a time" block reads "tab group" and the summary stays ≤ 250 characters). Manifest needs nothing: name,
description and every `commands` description are `__MSG_` references.

**Budget:** 6 files touched (+ this spec); read first: `addon/src/_locales/en/messages.json` (only the
`message` values — skip `description`), `addon/src/help/open-in-container.html`, the 0.7 section above for
the phase 4 precedent. No JS is read or changed.

**Gate:** `cd addon && npm run build` green (webpack fails on invalid JSON, which is the check that
matters), `npx eslint addon/src` no new errors, `cd addon && npm run test:firefox:smoke` passes. Then this
listing must come back with only the allowed kinds (native "tab group", product names, "ungrouped"):
`grep -n -i '"message".*group' addon/src/_locales/en/messages.json` — paste the surviving lines into the
Status line's commit note so review can check the judgement calls.

**Verification:** `cd addon && npm run test:firefox`; open the toolbar popup, Options (every tab), the
manage page and a tab's context menu. Nothing says bare "group" or "tab groups" for a workspace; the two
native-group options say "tab group"; a new workspace is titled "Workspace N"; `about:addons` shows the new
one-liner.

**Risks / unknowns:**

- *Ambiguous sentences.* Strings such as "Open group after changing to it", "Tab "$tabtitle$" was moved to
  group "$grouptitle$"" and the backup texts all mean the STG group → workspace. The only strings that mean
  native groups are the two options and anything mentioning collapse / expand / header. When unsure, the
  key name decides: `*SubGroup*` / `*Native*` keys are native, everything else is a workspace.
- *Placeholders and nested messages.* Keep `$name$` placeholders, `__MSG_x__` references and `\n` layout
  intact; the 0.7 precedent shows how `__MSG_manageGroupsTitle__` is reused inside other strings — the key
  stays, only its text changes to "Manage workspaces".
- *Grammar drift.* "a group" → "a workspace" is safe; "groups'" possessives and "group's" need a reread.
  Read every changed line once in place.
- *Plural of the product.* "Simple Workspaces" (product) versus "workspaces" (the things) — do not
  capitalise the common noun.

---

## 1. Background / problem statement

The user is migrating from Vivaldi to Firefox and wants parity for these features:

1. **Workspaces** — switch the whole tab bar between named sets of tabs.
2. **Tab groups (stacks)** — group tabs *within* a workspace, collapsible.
3. **Save/persist** workspaces and groups across full browser restarts.
4. **Single-active "two-level bar" switching** — when a group is opened it drops to a
   dedicated bottom bar; opening a *different* group must automatically send the previous
   one back up (Vivaldi behaves this way; only one group's tabs show on the second bar at
   a time). See §4.4 — this is the remaining unsolved interaction and a required fork goal.

Current stack in use:

- **Simple Tab Groups (STG)** extension → provides workspaces (whole-tab-bar switching by
  hiding tabs).
- **Firefox native tab groups** → provides in-bar grouping (colored, collapsible).
- **`userChrome.css`** → styles native groups into a Vivaldi-style "two-level" bar (the
  active group's tabs drop to a dedicated second row).

### The blocking conflict

STG and Firefox native tab groups do **not** cooperate:

- STG switches workspaces by **hiding tabs** (`tabs.hide()`), but Firefox treats native
  groups as the UI "source of truth."
- Result A (**bleed**): native group labels from *other* workspaces remain visible in the
  current workspace.
- Result B (**data loss**): on a full restart, STG reopens tabs but **native group
  membership is lost** → tabs come back ungrouped.

This is documented upstream in STG issue
[#1237](https://github.com/Drive4ik/simple-tab-groups/issues/1237) (72 👍). The root cause
*at the time* was that Firefox exposed **no WebExtensions API** for native tab groups, so
STG literally could not read/write/persist them.

### What changed — the API now exists

Browser-compat data confirms the needed APIs shipped in Firefox and are available in the
user's build (Firefox 155):

| Capability                              | API                                                                 | Firefox since |
| --------------------------------------- | ------------------------------------------------------------------- | ------------- |
| Create / remove groups                  | `tabs.group()` / `tabs.ungroup()`                                   | 138           |
| Read / update / move groups + events    | `tabGroups.query/get/update/move/onCreated/onUpdated/onRemoved`      | 139           |
| Hide / show tabs (STG already uses)     | `tabs.hide()` / `tabs.show()`                                        | 61            |
| Highlight tabs                          | `tabs.highlight()`                                                   | 63            |

> The meta bug [Bugzilla 1940631](https://bugzilla.mozilla.org/show_bug.cgi?id=1940631) is
> still `NEW`, but that tracks broader/edge functionality — the **core `tabGroups` API and
> `tabs.group()/ungroup()` are shipped** (FF 138/139). STG v5.2 simply predates them.

**Conclusion:** the fork is now technically viable and is the correct path to Vivaldi parity.

---

## 2. Architecture — two layers, two responsibilities

```
Firefox native tab groups        ← the real groups rendered in the tab bar
        ↑ managed by
STG fork (tabGroups/tabs.group)  ← persistence + per-workspace rebuild  [FIXES BOTH BUGS]
        + styled by
userChrome.css                   ← Vivaldi two-level look                [separate, already built]
```

- **STG fork (JavaScript):** owns **behavior + data** — which native groups belong to which
  workspace, their title/color/collapsed state, per-tab membership; rebuilds native groups on
  workspace switch and on startup. Cannot draw its own UI into the top tab bar (extension
  limitation) — it drives Firefox's *native* groups instead.
- **`userChrome.css`:** owns **appearance only** — the two-level bar, pill styling, active-group
  highlight. Styles whatever native groups the fork renders; cannot create or persist groups.

Native **session restore** stays **ON** so Firefox brings tabs back; the fork re-groups them
from its saved metadata.

---

## 3. Data model

Extend STG's per-group (workspace) stored state with native-group metadata.

```jsonc
// Per STG workspace:
{
  "workspaceId": "…",
  "nativeGroups": [
    {
      "stableKey": "uuid-owned-by-fork",   // OUR stable id (native numeric ids are ephemeral)
      "title": "Pull Requests",
      "color": "purple",                   // tabGroups.Color enum
      "collapsed": false,
      "tabStableKeys": ["…", "…"]          // ordered membership -> STG's own tab identity
    }
  ]
}
```

Key rule: **never persist Firefox's numeric `groupId`** as the identity — it changes every
time a group is re-created. Map through the fork's own `stableKey`, and re-resolve the numeric
`groupId` after each `tabs.group()` call.

---

## 4. Behavior hooks (where to modify STG)

Reconnaissance step (do first in the impl session): clone the repo and locate the
**workspace-switch** and **startup/restore** entry points. Then implement a `NativeGroupSync`
module wired into these three moments:

### 4.1 Capture (keep metadata in sync)
Listen to `tabGroups.onCreated/onUpdated/onRemoved` and `tabs.onUpdated` (groupId changes) for
tabs in the **active** workspace. On any change, update the workspace's `nativeGroups` metadata
in STG storage.

### 4.2 Workspace switch (the crux)
Extend STG's existing switch routine:

- **Leaving a workspace:**
  1. Read current native groups → save/refresh metadata (title/color/collapsed/order).
  2. `tabs.ungroup()` those tabs (removes lingering native groups → kills cross-workspace bleed).
  3. `tabs.hide()` the tabs (existing STG behavior).
- **Entering a workspace:**
  1. `tabs.show()` the workspace's tabs (existing STG behavior).
  2. For each saved native group: `tabs.group({ tabIds })` to rebuild, in saved order.
  3. `tabGroups.update(groupId, { title, color, collapsed })` to restore appearance.
  4. Re-resolve + store the new numeric `groupId` against the `stableKey`.

### 4.3 Startup / session restore
After STG restores/adopts the active workspace's tabs on browser start, run the **same
"rebuild groups from metadata"** routine as 4.2 "entering." **This is what fixes the
ungrouped-on-restart bug.**

### 4.4 Single-active enforcement — "two-level bar" tab switching (REQUIRED)
**Problem:** The Vivaldi model shows exactly **one** group's tabs on the second/bottom bar at
a time. Firefox natively allows **multiple** groups to be expanded simultaneously, so the
`userChrome.css` styling layer (which lifts every *expanded* group to the bottom bar) ends up
stacking/overlapping several groups. Pure CSS **cannot** fix this — CSS can style but cannot
run click logic, and Firefox will not auto-collapse other groups. Every CSS-only workaround
fails:

- keying the bar on *expanded state* → multiple groups can be expanded → overlap;
- keying on *hover* → the hovered element moves out from under the cursor → flicker;
- keying on *active tab* → a non-active group's tabs are hidden, so you can't click one to
  activate it → deadlock.

**Solution (fork owns this):** enforce **"only one group expanded at a time"** in JS.

- Listen to **`tabGroups.onUpdated`**; when a group's `collapsed` transitions to `false`
  (i.e., the user opened it), call **`tabGroups.update(otherGroupId, { collapsed: true })`**
  on every *other* group in the same window/workspace.
- Net effect: opening a group automatically collapses the previously-open one, so the
  `userChrome.css` bottom bar always shows exactly one group → true Vivaldi "replace"
  behavior.
- Guard against feedback loops: suppress the fork's own `onUpdated` handler while it is
  programmatically collapsing groups.
- Scope the collapse to the current window (native groups are window-scoped) and to the
  active workspace's groups only.

**Activation rule (phase 7).** The bottom bar also has to *go away* the way it does in Vivaldi:
selecting a tab on the top bar closes the open stack. So the rule is two-sided:

- The group the user **explicitly opened** (header click, "add tabs to new group", a group
  arriving from another window) stays open and every other expanded group collapses.
- Otherwise the only group allowed to stay expanded is **the one holding the active tab**.
  When the active tab becomes one that is in no expanded group — an ungrouped tab, a pinned
  tab, or the active tab of a collapsed group, which Firefox draws on the top bar beside the
  header — **every expanded group in that window collapses** (`tabs.onActivated` is the
  trigger).
- The fork still only ever *collapses*. Activating a tab inside a collapsed group does not
  expand it (that is Firefox's own behavior too, behavior doc §5); the user opens it from the
  header, which is an explicit expand.
- Activations performed by the fork itself during a workspace switch or restore are parked
  with the rest of the enforcement until the operation is idle and are decided once, so the
  rule never fights the rebuild.

This is the same click-to-replace interaction the user described; it lives in the fork so it
works together with persistence (§4.2/§4.3) from one coherent codebase, with no separate
userChrome.js loader required.

---

## 5. Hard parts / edge cases to plan for

- **Group-id instability** — always map via the fork's `stableKey`; re-resolve numeric ids
  after every `group()`.
- **Tab ordering & contiguity** — native groups require contiguous tabs; rebuild in saved
  order and move tabs adjacent before grouping.
- **Tab identity across restart** — Firefox tab ids are not stable across restart; reuse STG's
  existing tab-identity mechanism (URL + cookieStoreId + position/marker) to map saved
  membership back onto restored tabs.
- **Pinned tabs & split-view** — exclude/handle specially (see STG issues #1352, #1227).
- **Window scoping** — native groups are window-specific; STG maps a workspace to a window.
  Ensure grouping happens in the correct target window.
- **Containers (cookieStoreId)** — preserve container identity when regrouping.
- **Race conditions** — batch group/ungroup operations; suppress the fork's own change
  listeners while it is programmatically rebuilding to avoid feedback loops.

---

## 6. Distribution / signing

Firefox release requires signed add-ons. Options:

- **Development:** `web-ext run` against a scratch profile, or load as a **temporary add-on**
  via `about:debugging`.
- **Daily use:** submit the fork as an **unlisted** add-on to AMO (free signing, private), or
  run **Firefox Developer Edition** with `xpinstall.signatures.required=false`.

---

## 7. Proposed milestones

1. **Recon** — clone `Drive4ik/simple-tab-groups`, get it building (`npm install` + webpack),
   map the workspace-switch and startup-restore code paths. Report exact files/functions.
2. **Scaffold** — add `tabGroups` permission to the manifest; create `NativeGroupSync` module
   with capture/rebuild functions (no wiring yet).
3. **Persist** — implement metadata capture (4.1) + storage schema (§3); verify metadata is
   saved/edited correctly.
4. **Switch** — wire the switch routine (4.2); verify no cross-workspace bleed and correct
   rebuild.
5. **Restore** — wire startup rebuild (4.3); verify groups survive a full restart.
6. **Single-active** — implement §4.4 (collapse-others-on-expand via `tabGroups.onUpdated` /
   `tabGroups.update`); verify only one group ever occupies the bottom bar and opening another
   replaces it.
7. **Edge cases** — pinned/split-view/containers/ordering (§5).
8. **Polish + package** — reconcile with `userChrome.css` styling; sign/distribute (§6).

---

## 8. Companion: userChrome.css (separate, parallel workstream)

The Vivaldi "two-level bar" look is handled entirely in `userChrome.css` and is independent of
the fork. Current status: working prototype that pins the **active** native group to a
dedicated bottom bar (single-active "replace" behavior), keyed off the selected/hovered group,
with other groups shown as compact pills on the top row. This file lives in
`<profile>/chrome/userChrome.css` and requires
`toolkit.legacyUserProfileCustomizations.stylesheets = true`.

The fork and the CSS are complementary: the fork carries **persistence/behavior**, the CSS
carries **appearance**. Neither alone achieves Vivaldi parity; together they do.

### Current status of the styling layer
Working well. The two-level bottom bar renders correctly — an expanded group is lifted out of
the flow into an opaque full-width bar at the bottom, without pushing other tabs/pills around,
and the group holding the active tab is drawn on top. **The only remaining issue is tab
switching between groups** (multiple groups can be expanded at once → they stack on the bottom
bar), which is the single-active problem the fork will solve per §4.4.

### Current `userChrome.css` (v6) — the styling layer to keep

Location on the user's machine:
`C:\Users\cwardell\AppData\Roaming\Mozilla\Firefox\Profiles\dkr01n6i.default-release\chrome\userChrome.css`
(requires `toolkit.legacyUserProfileCustomizations.stylesheets = true` in `about:config`).

```css
/* =====================================================================
   Vivaldi-style two-level tab bar for Firefox 155+  (v6 - reliable baseline)
   ---------------------------------------------------------------------
   An EXPANDED group is lifted out of the flow and pinned as an OPAQUE
   full-width bar at the bottom, so it never pushes other tabs/pills around.
   The group that holds the ACTIVE tab is drawn on top, so when more than one
   group is expanded you cleanly see the one you're actually using.

   How to use it (CSS-level flow):
   - Click a group's pill  -> it expands and drops to the bottom bar.
   - Click another group's pill -> it opens on the bottom bar (drawn on top).
   - Collapse the previous group's pill to send it back up.

   NOTE: Automatically collapsing the previous group ("true replace") is not
   possible in pure CSS — Firefox won't auto-collapse groups. That behavior is
   handled by the Simple Tab Groups fork (JS). This file is the styling layer.
   ===================================================================== */

:root{
  --uc-group-bar-height: calc(var(--tab-min-height, 36px) + 8px);
  --uc-group-tab-min-width: 120px;
  --uc-group-tab-max-width: 260px;
}

/* Positioning context for the bottom bar */
#tabbrowser-tabs[orient="horizontal"]{
  position: relative !important;
  min-height: unset !important;
}

/* Reserve one bottom row while any group is expanded */
#tabbrowser-tabs[orient="horizontal"]:has(tab-group:not([collapsed])){
  padding-bottom: var(--uc-group-bar-height) !important;
}

/* An expanded group becomes an OPAQUE full-width bar pinned to the bottom,
   out of normal flow so it never pushes other pills / ungrouped tabs around. */
#tabbrowser-tabs[orient="horizontal"] tab-group:not([collapsed]){
  position: absolute !important;
  inset: auto 0 0 0 !important;
  width: 100% !important;
  height: var(--uc-group-bar-height) !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  gap: 2px !important;
  padding: 2px 6px !important;
  border-top: 1px solid color-mix(in srgb, currentColor 22%, transparent) !important;
  background: var(--toolbar-bgcolor, #2b2a33) !important;   /* opaque so overlaps don't show through */
  z-index: 2 !important;
  scrollbar-width: thin !important;
}

/* The group holding the ACTIVE tab is drawn ON TOP of any other expanded
   group, so the one you're actually using is the one you see. */
#tabbrowser-tabs[orient="horizontal"] tab-group:not([collapsed]):has(.tabbrowser-tab[visuallyselected]){
  z-index: 3 !important;
}

/* The group's label sits at the start of the bottom bar as a heading */
#tabbrowser-tabs[orient="horizontal"] tab-group:not([collapsed]) .tab-group-label-container{
  flex: 0 0 auto !important;
  margin-inline-end: 4px !important;
}

/* Tabs inside the bottom bar: comfortable fixed-ish width, scroll if many */
#tabbrowser-tabs[orient="horizontal"] tab-group:not([collapsed]) .tabbrowser-tab[fadein]{
  min-width: var(--uc-group-tab-min-width) !important;
  max-width: var(--uc-group-tab-max-width) !important;
  flex: 0 0 auto !important;
}
```
