# Strata Workspaces — Privacy Policy

Last updated: 2026-09-14

Strata Workspaces is a Firefox add-on that organizes tabs into workspaces and native tab groups. It is
based on Simple Tab Groups by Drive4ik and is published under the Mozilla Public License 2.0. Source code:
<https://github.com/DaciteRocks/strata-workspaces>.

## The short version

Strata Workspaces does not collect, transmit or sell any data. There is no analytics, telemetry,
tracking, advertising, account or developer server. Everything the add-on stores stays in your Firefox
profile.

## Data stored on your device

To work at all, the add-on keeps the following in Firefox's local extension storage and in Firefox's own
session data for each tab:

- your workspaces: names, colors, icons and settings;
- the tabs in each workspace: address (URL), title, container and, if you enable it, the site icon;
- which Firefox tab group each tab belongs to, and the tab groups' titles, colors and collapsed state;
- your add-on settings.

None of this leaves your device through the add-on. It is removed when you uninstall the add-on.

## Optional features, all on your device

- **Backups** are saved as files in your Downloads folder. Automatic backups are **on by default**: once a
  day the add-on saves a backup of your workspaces, including tab addresses, titles, site icons and
  thumbnails. You can turn this off, change how often it runs, or leave out icons and thumbnails in
  Settings, on the Backup tab. The files stay on your computer.
- **Bookmark export** writes workspaces to your Firefox bookmarks. It needs the optional bookmarks
  permission, which Firefox asks for.
- **Thumbnails** of tabs are captured and kept locally.

Simple Tab Groups' GitHub Gist cloud sync is switched off in Strata Workspaces and cannot be enabled. Its
Windows backup helper app (STGHost) only accepts the original add-on and does not work with Strata
Workspaces.

## Network requests

The add-on itself makes no network requests. It does not contact the developer, Mozilla, GitHub or any
other service. Site icons of tabs you already have open may be shown in the add-on's popup and pages;
Firefox loads those from the sites themselves, as it does for the tab bar. Web pages you open load as they
normally would, and the add-on does not read or send their content.

## Permissions

Firefox shows the permissions the add-on requests at install. They are used only for the add-on's own
features: managing, hiding and grouping tabs; opening tabs in the right container; its menus,
notifications, hotkeys and in-page workspace picker; saving backups; and detecting other tab add-ons that
conflict with it. None of them is used to send data anywhere.

## Children

The add-on is not directed at children and collects no personal data from anyone.

## Changes

Changes to this policy are published with the add-on's source code and in its addons.mozilla.org listing.

## Contact

Open an issue at <https://github.com/DaciteRocks/strata-workspaces/issues>.
