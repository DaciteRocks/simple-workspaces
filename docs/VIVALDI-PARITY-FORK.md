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
- **Which group survives:** the one the user opened; otherwise the one holding the active tab; otherwise
  the first reported. While an STG composite operation is running (`Operations.isBusy()`), the request
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
- **GitHub fork:** <https://github.com/DaciteRocks/simple-tab-groups>, remote `origin`, branch `vivaldi-parity`.
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
| Ordering & contiguity | handled | `Tabs.moveNative` gathers a workspace as one block before `GroupsNative.apply`; `tabs.group` preserves the order we pass (§3, implication 5) |
| Tab identity across restart | handled | membership is a `sessions.setTabValue` on the tab, which Firefox itself carries across restart (§6); no URL/position heuristic needed |
| Pinned tabs | handled by the browser | pinning strips native membership itself (§19), unpin does not restore it; `queryWindowTabs` excludes pinned; the exclusive module never touches pinned tabs (groups cannot contain them) |
| Split view | **unverified, likely still broken** | upstream #1352 (open, no response): hiding a split-view tab leaves an empty placeholder tab. No split-view handling exists in `addon/src`. Test 7 below; fix would be a follow-up phase |
| Containers (`cookieStoreId`) | handled | membership rides on the tab, independent of container; upstream #1227 (open) describes container groups acting as pinned — a Firefox-side behavior, test 8 |
| Window scoping | handled | native groups are window-scoped (§16); `apply`/`enforceWindow` take a `windowId`; a group moved to another window keeps its live id and is re-enforced via `onMoved` |
| Races / feedback loops | handled | `Operations.isBusy()` parks both the mirror and the enforcement until idle; the exclusive module only collapses, so its own `onUpdated` events never re-trigger it |
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
| 6 | Quit Firefox fully, restart, wait for STG to settle | W1's groups come back grouped, titles and colors intact, at most one expanded |
| 7 | Put two tabs of A in split view, switch to W2 | **known risk (#1352):** check whether an empty placeholder tab appears in W2; record the result in this table |
| 8 | Create a container tab inside A, switch W1 → W2 → W1 | the container tab is back inside A |
| 9 | With B expanded and A collapsed, drag B's header to another position | B is still expanded after the drop and A stays collapsed (§14: the drag collapses then re-expands B; that re-expand keeps B). Dragging a *collapsed* header is not covered by §14 — note what happens |
| 10 | Drag a single tab out of A into a new window | A survives in W1; the new window has one ungrouped tab (§16) and nothing is collapsed anywhere |
| 11 | Options → untick "Keep only one native tab group expanded" → expand A and B | both stay expanded; re-tick → one collapses immediately |
| 12 | `about:debugging` → Inspect the fork → console filter `GroupsNativeExclusive` | one `enforceWindow` line per collapse, none during rename |

**Not run yet.** This session cannot drive the Firefox UI, so none of the 12 checks has a result. Record
pass/fail per row when run; anything that fails becomes its own phase.

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
