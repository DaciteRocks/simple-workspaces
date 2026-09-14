# Simple Workspaces — Privacy Policy

Last updated: 2026-09-14

Simple Workspaces is a Firefox add-on that organizes tabs into workspaces and native tab groups. It is
based on Simple Tab Groups by Drive4ik and is published under the Mozilla Public License 2.0. Source code:
<https://github.com/DaciteRocks/simple-workspaces>.

## The short version

- The developer of Simple Workspaces receives **no data** from you. There is no analytics, telemetry,
  tracking, advertising or developer server.
- Everything stays in your Firefox profile **unless you turn on GitHub Gist cloud sync**, which sends your
  workspaces to **your own** GitHub account and only after Firefox asks for your permission.

## Data stored on your device

To work at all, the add-on keeps the following in Firefox's local extension storage and in Firefox's own
session data for each tab:

- your workspaces: names, colors, icons and settings;
- the tabs in each workspace: address (URL), title, container and, if you enable it, the site icon;
- which Firefox tab group each tab belongs to, and the groups' titles, colors and collapsed state;
- your add-on settings.

This data never leaves your device through the add-on, except as described under cloud sync below. It is
removed when you uninstall the add-on.

## Optional: GitHub Gist cloud sync

Cloud sync is **off by default**. When you turn it on, Firefox shows a permission prompt for three kinds
of data. Sync does not run unless you allow it, and you can withdraw the permission at any time in
`about:addons` → Simple Workspaces → Permissions.

| Data | Why it is sent | Firefox category |
| - | - | - |
| Your GitHub personal access token | To sign in to your GitHub account | Authentication information |
| Tab URLs and titles, workspace names, container names and settings | This is what gets synced | Browsing activity |
| Site icons, only if "include tab icons" is enabled | To show icons on your other computers | Website content |

Where it goes:

- Only to `api.github.com`, into a **secret gist in your own GitHub account**. A secret gist is not listed
  publicly, but anyone who has its link can open it. It is not encrypted by the add-on.
- The token itself is stored either locally in the add-on or, if you choose that option, in Firefox Sync,
  which Mozilla encrypts and stores for you. The token is not written into the gist.
- GitHub's handling of that data is covered by the
  [GitHub General Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

To remove synced data, delete the gist from your GitHub account and revoke the token on GitHub.

## Other optional features that stay on your device

- **Backups** are saved as files in your Downloads folder. The Simple Tab Groups Windows helper app
  (STGHost), which writes backups to a local folder, only accepts the original add-on and does not work
  with Simple Workspaces.
- **Bookmark export** writes workspaces to your Firefox bookmarks. It needs the optional bookmarks
  permission, which Firefox asks for.
- **Thumbnails** of tabs are captured and kept locally.

## Network requests the add-on makes

- `api.github.com` — only when you use GitHub Gist sync, after consent. The sync settings page then also
  shows your GitHub profile picture, which Firefox loads from GitHub.
- Site icons of tabs you already have open may be displayed in the add-on's popup and pages; Firefox
  loads those from the sites themselves, as it does for the tab bar.
- Nothing else. The add-on does not contact the developer, Mozilla or any other service. Web pages you
  open load as they normally would; the add-on does not read or send their content.

## Permissions

Firefox shows the permissions the add-on requests at install. They are used only for the add-on's own
features: managing, hiding and grouping tabs; opening tabs in the right container; menus, notifications
and hotkeys; saving backups; and detecting other tab add-ons that conflict with it. None of them is used
to send data anywhere.

## Children

The add-on is not directed at children and collects no personal data from anyone.

## Changes

Changes to this policy are published with the add-on's source code and in its addons.mozilla.org listing.

## Contact

Open an issue at <https://github.com/DaciteRocks/simple-workspaces/issues>.
