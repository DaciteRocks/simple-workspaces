# Simple Workspaces — addons.mozilla.org listing draft

Paste-ready text for the AMO submission form. Choose **"On this site"** (listed) when uploading.

## Upload

| Field | Value |
| - | - |
| Package | `addon/dist-zip/simple-workspaces@dacite.dev-v6.0.0.1-prod.zip` from `npm run build-zip` |
| Source code | `addon/dist-zip/simple-workspaces@dacite.dev-v6.0.0.1-dev.zip` — answer **Yes** to "Do you need to submit source code?" (webpack) |
| Compatibility | Firefox for desktop only (not Android) |

## Describe

**Name:** Simple Workspaces

**Add-on URL slug:** `simple-workspaces`

**Summary** (max 250 characters, this one is 201):

> Vivaldi-style workspaces for your tabs: switch the whole tab bar between named workspaces, keep Firefox tab groups inside each one, restore them after a restart, and keep just one group open at a time.

**Description:**

> Simple Workspaces brings Vivaldi-style workspaces and tab stacks to Firefox.
>
> **Workspaces**
> - Keep separate, named sets of tabs and switch the whole tab bar between them in one click, from the
>   toolbar popup, the sidebar or a hotkey.
> - Tabs of other workspaces are hidden, not closed, so switching is instant.
>
> **Firefox tab groups inside each workspace**
> - Use Firefox's own tab groups inside a workspace. Each workspace remembers its groups, with their
>   names, colors and which tabs belong to them.
> - Groups never leak into other workspaces, and they come back grouped after a browser restart.
>
> **One group open at a time**
> - Opening a tab group automatically collapses the one that was open, like Vivaldi's tab stacks. It can
>   be turned off in Settings.
> - Optional: the project's `userChrome.css` shows the open group on its own second row under the tab
>   bar. Instructions are in the source repository.
>
> **Also included**
> - Containers per workspace, archive, bookmarks export and backups.
>
> **Privacy:** collects nothing and sends nothing. No analytics, no accounts, no developer server.
>
> **Credits:** based on Simple Tab Groups by Drive4ik, licensed under the Mozilla Public License 2.0.
> Source code: https://github.com/DaciteRocks/simple-workspaces
>
> **Known limitations:** some non-English translations still say "STG". Simple Tab Groups' cloud sync is
> switched off, and its plugins and Windows backup helper do not work with this add-on. Do not run it
> together with Simple Tab Groups.

**Categories:** Tabs

**Support email:** leave empty, or use an address you want to publish.

**Support website:** https://github.com/DaciteRocks/simple-workspaces/issues

**License:** Mozilla Public License 2.0

**Privacy policy:** optional, since the add-on collects no data. Pasting `docs/PRIVACY.md` is still
recommended so users can see that.

## Additional details

**Homepage:** https://github.com/DaciteRocks/simple-workspaces

**Tags** (pick from AMO's list): tabs, productivity, tab management

## Images

**Icon:** taken from the manifest (`addon/src/icons/icon.svg`); nothing to upload.

**Screenshots** to take in Firefox with the add-on installed, 1280×800 recommended, one feature each:

1. The toolbar popup listing several workspaces.
2. The tab bar with two Firefox tab groups, one open and one collapsed.
3. The same window after switching to another workspace, showing its own tabs and groups.
4. The `userChrome.css` two-row look, with the open group on the second row.
5. The Settings page section with "Keep only one native tab group expanded at a time".

## Version notes (6.0.0.1)

> First release of Simple Workspaces: workspaces with Firefox tab groups that persist per workspace and
> across restarts, and one tab group open at a time.

## Notes to reviewer

> This is a fork of Simple Tab Groups (MPL-2.0) with a new name, icon and add-on id, plus a module that
> keeps one native tab group expanded per window (`src/js/groups-native-exclusive.js`). Upstream's GitHub
> Gist cloud sync is disabled by `CLOUD_SYNC_AVAILABLE = false` in `src/js/constants.js`; its code is kept
> for merges but its UI, hotkey, menu item and background alarm are off.
>
> Build instructions are in the source archive's README.md: `npm ci` then `npm run build-for-amo`, output
> in `dist/`. No minification.
>
> Data collection: `required: ["none"]`. The add-on makes no network requests of its own; the plugin
> icons on the About page and the conflicting add-on icons use a local generic icon instead of
> addons.mozilla.org.
>
> Permissions: `tabs`, `tabHide`, `tabGroups`, `sessions` manage and hide workspace tabs and their groups;
> `contextualIdentities`, `cookies`, `webRequest`, `webRequestBlocking`, `<all_urls>` reopen a tab in its
> workspace's container; the content script on all pages listens for the add-on's own hotkeys and draws its in-page group picker
> and prompt dialogs;
> `menus`, `notifications`, `alarms` for context menus, messages and scheduled backups; `downloads` saves
> backup files; `management` detects conflicting tab add-ons; `storage`, `unlimitedStorage` store
> workspaces. Optional: `bookmarks` for bookmark export, `nativeMessaging` for the local backup helper,
> `browserSettings` for new-tab settings.
