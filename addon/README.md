
# Instructions for Mozilla reviewers — Simple Workspaces

Simple Workspaces is a fork of Simple Tab Groups (<https://github.com/Drive4ik/simple-tab-groups>,
MPL-2.0). Full source: <https://github.com/DaciteRocks/simple-workspaces>.

The add-on source is the `.vue` and `.js` files in `src`. webpack bundles only the four UI entry points
(`popup`, `options`, `manage`, `web/content-script`); every other file in `src` is copied to `dist`
unchanged. Minification is off (`optimization.minimize: false` in `webpack.config.js`).

## Build environment used for the submitted package

- Windows 11 x64
- Node.js v20.19.6, npm 10.8.2
- No other tools. No network access is needed after `npm ci`.

AMO's default environment (Ubuntu 24.04, Node 24, npm 11) has not been tested with this package. If its
output differs, please build with Node 20 LTS: <https://nodejs.org/en/download>.

## Build

Run from the folder that contains this README and `package.json`:

```bash
npm ci
npm run build-for-amo
```

The extension is written to `dist/`. Its contents must match the uploaded package file for file.

## How the uploaded files were made

```bash
npm ci
npm run build-zip
```

This creates `dist-zip/simple-workspaces@dacite.dev-v<version>-prod.zip` (the package) and
`dist-zip/simple-workspaces@dacite.dev-v<version>-dev.zip` (this source archive).

## Data collection

`browser_specific_settings.gecko.data_collection_permissions` declares `required: ["none"]`. The add-on
makes no network requests of its own. Upstream's GitHub Gist cloud sync is disabled by
`CLOUD_SYNC_AVAILABLE = false` in `src/js/constants.js`: its UI, hotkey, menu item and background alarm are
off, and its code is kept only to ease merging upstream changes.

## Third-party libraries

- Vue 2.7.16 runtime, unmodified: `src/js/vue.runtime.esm.js`, downloaded from
  <https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.runtime.esm.js>.
