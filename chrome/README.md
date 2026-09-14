# Companion `userChrome.css` — Vivaldi two-level tab bar

The styling half of the Vivaldi-parity setup (design: `docs/VIVALDI-PARITY-FORK.md` §2 and §8).
The fork carries behavior and persistence; this stylesheet carries appearance only. Neither alone
gives Vivaldi parity — together they do.

What it draws: an **expanded** native tab group is lifted out of the tab strip and pinned as an
opaque, full-width bar at the bottom of the tab strip. Collapsed groups stay on the top row as
compact pills. The fork's *single-active* rule (option "Keep only one native tab group expanded at
a time", on by default) guarantees at most one group is expanded per window, so the bottom bar
always shows exactly one group and opening another replaces it.

## Install

1. `about:config` → set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`.
2. `about:support` → "Profile Folder" → Open Folder. Create a `chrome` folder inside it if there
   is none.
3. Copy `userChrome.css` from this folder into `<profile>/chrome/userChrome.css`.
4. Restart Firefox. Changes to the file need a restart too.

Tested against Firefox 154/155 with the default theme. The selectors target `#tabbrowser-tabs`,
`tab-group`, `.tab-group-label-container` and `.tabbrowser-tab`; a Firefox update that renames
those will need the file adjusted.

## Tunables

At the top of the file:

| variable | default | meaning |
| - | - | - |
| `--uc-group-bar-height` | tab height + 8px | height of the bottom bar |
| `--uc-group-tab-min-width` | `120px` | minimum width of a tab inside the bottom bar |
| `--uc-group-tab-max-width` | `260px` | maximum width of a tab inside the bottom bar |
