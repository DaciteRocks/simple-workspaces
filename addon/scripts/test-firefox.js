#!/usr/bin/env node
/* global process */

// One-command local test run for Strata Workspaces.
//
//   npm run test:firefox          build, watch, open Firefox with the add-on in a separate test profile
//   npm run test:firefox:smoke    headless check that the add-on installs, then exit (for automation)
//   npm run test:firefox:reset    delete the test profile and start fresh next time
//
// The test profile lives in addon/.firefox-test-profile (gitignored), so your everyday Firefox profile and
// tabs are never touched. Only Firefox processes started with that profile are ever stopped by this script.

import fs from 'fs';
import path from 'path';
import {spawn, spawnSync} from 'child_process';
import {fileURLToPath, pathToFileURL} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADDON_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(ADDON_DIR, '..');
const DIST_DIR = path.join(ADDON_DIR, 'dist');
const PROFILE_DIR = path.join(ADDON_DIR, '.firefox-test-profile');
// the smoke test uses its own throwaway profile, so it never uses up the first run of the real one
const SMOKE_PROFILE_DIR = path.join(ADDON_DIR, '.firefox-test-profile-smoke');
const USER_CHROME_SRC = path.join(REPO_DIR, 'chrome', 'userChrome.css');
const CHECKLIST = path.join(__dirname, 'test-checklist.html');
const WEB_EXT_BIN = path.join(ADDON_DIR, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const WEBPACK_BIN = path.join(ADDON_DIR, 'node_modules', 'webpack', 'bin', 'webpack.js');

const IS_WINDOWS = process.platform === 'win32';
const SMOKE_TIMEOUT_MS = 120_000;

const PREFS = {
    // the companion userChrome.css
    'toolkit.legacyUserProfileCustomizations.stylesheets': true,
    // reopen the previous session, so a second run tests restoring workspaces and groups
    'browser.startup.page': 3,
    // web-ext's profile defaults turn crash recovery off; a stop by Ctrl+C is a hard kill, keep the session
    'browser.sessionstore.resume_from_crash': true,
    // keep workspaces when web-ext removes the temporary add-on on exit
    'extensions.webextensions.keepStorageOnUninstall': true,
    'extensions.webextensions.keepUuidOnUninstall': true,
    'browser.tabs.groups.enabled': true,
    // a quiet test browser: no default-browser prompt, welcome pages or telemetry notices
    'browser.shell.checkDefaultBrowser': false,
    'browser.aboutwelcome.enabled': false,
    'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'browser.tabs.warnOnClose': false,
};

const args = new Set(process.argv.slice(2));
const children = new Set;

// the one profile this run started Firefox with, and whether it is thrown away on exit (smoke)
let activeProfileDir = null;
let deleteProfileOnExit = false;

function log(...message) {
    console.log('[test:firefox]', ...message);
}

function fail(message) {
    console.error('[test:firefox]', message);
    process.exit(1);
}

function run(bin, binArgs, options = {}) {
    const child = spawn(process.execPath, [bin, ...binArgs], {cwd: ADDON_DIR, ...options});
    children.add(child);
    child.on('exit', () => children.delete(child));
    return child;
}

function killTree(child) {
    if (!child || child.exitCode !== null) {
        return;
    }

    if (IS_WINDOWS) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore'});
    } else {
        child.kill('SIGTERM');
    }
}

// stop only Firefox processes started with exactly this profile: the path must be the whole -profile
// argument, so the smoke profile (a longer path with the same start) and the user's own Firefox never match
function stopFirefoxWithProfile(profileDir) {
    if (!profileDir) {
        return;
    }

    if (IS_WINDOWS) {
        const profile = profileDir.replace(/'/g, "''");
        const script =
            `$pattern = '-profile\\s+"?' + [regex]::Escape('${profile}') + '"?(\\s|$)'; ` +
            `Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | ` +
            'Where-Object { $_.CommandLine -and $_.CommandLine -match $pattern } | ' +
            'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
        spawnSync('powershell', ['-NoProfile', '-Command', script], {stdio: 'ignore'});
    } else {
        const escaped = profileDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        spawnSync('pkill', ['-f', `-profile "?${escaped}"?( |$)`], {stdio: 'ignore'});
    }
}

function cleanupAndExit(code) {
    for (const child of children) {
        killTree(child);
    }
    stopFirefoxWithProfile(activeProfileDir);

    if (deleteProfileOnExit && activeProfileDir) {
        fs.rmSync(activeProfileDir, {recursive: true, force: true});
    }

    process.exit(code);
}

function checkPrerequisites() {
    for (const [file, hint] of [
        [WEB_EXT_BIN, 'run "npm install" in the addon folder first'],
        [WEBPACK_BIN, 'run "npm install" in the addon folder first'],
        [USER_CHROME_SRC, 'chrome/userChrome.css is missing from the repo'],
    ]) {
        if (!fs.existsSync(file)) {
            fail(`${path.relative(REPO_DIR, file)} not found: ${hint}`);
        }
    }
}

function installUserChrome(profileDir) {
    const chromeDir = path.join(profileDir, 'chrome');
    fs.mkdirSync(chromeDir, {recursive: true});
    fs.copyFileSync(USER_CHROME_SRC, path.join(chromeDir, 'userChrome.css'));
}

function buildOnce() {
    log('building the add-on...');
    const result = spawnSync(process.execPath, [WEBPACK_BIN, '--mode', 'production'], {cwd: ADDON_DIR, encoding: 'utf8'});

    if (result.status !== 0) {
        console.error(result.stdout, result.stderr);
        fail('build failed, fix the errors above and run again');
    }

    log('build ok');
}

function webExtArgs({profileDir, isNewProfile, smoke}) {
    const list = [
        'run',
        '--target', 'firefox-desktop',
        '--source-dir', DIST_DIR,
        '--firefox-profile', profileDir,
        '--profile-create-if-missing',
        '--keep-profile-changes',
    ];

    for (const [name, value] of Object.entries(PREFS)) {
        list.push(`--pref=${name}=${value}`);
    }

    // the checklist opens on the first run only; later runs restore the previous session instead
    if (isNewProfile || smoke) {
        list.push('--start-url', pathToFileURL(CHECKLIST).href);
    }

    if (smoke) {
        list.push('--no-reload', '--no-input', '--arg=-headless');
    }

    return list;
}

// a profile counts as used once Firefox itself has written to it, not when this script created the folder
function isUsedProfile(profileDir) {
    return ['prefs.js', 'times.json'].some(file => fs.existsSync(path.join(profileDir, file)));
}

function resetProfile() {
    stopFirefoxWithProfile(PROFILE_DIR);
    fs.rmSync(PROFILE_DIR, {recursive: true, force: true});
    log('test profile deleted:', path.relative(REPO_DIR, PROFILE_DIR));
}

async function smokeTest() {
    checkPrerequisites();
    buildOnce();

    fs.rmSync(SMOKE_PROFILE_DIR, {recursive: true, force: true});
    activeProfileDir = SMOKE_PROFILE_DIR;
    deleteProfileOnExit = true;
    installUserChrome(SMOKE_PROFILE_DIR);

    log('starting headless Firefox to check the add-on installs...');
    const webExt = run(WEB_EXT_BIN, webExtArgs({profileDir: SMOKE_PROFILE_DIR, isNewProfile: true, smoke: true}));

    let output = '';
    const timer = setTimeout(() => {
        console.error(output);
        log('FAIL: the add-on was not installed within', SMOKE_TIMEOUT_MS / 1000, 'seconds');
        cleanupAndExit(1);
    }, SMOKE_TIMEOUT_MS);

    const onData = chunk => {
        output += chunk;

        if (/Installed .* as a temporary add-on/i.test(output)) {
            clearTimeout(timer);
            log('PASS: the add-on installed in Firefox');
            cleanupAndExit(0);
        }
    };

    webExt.stdout.on('data', onData);
    webExt.stderr.on('data', onData);
    webExt.on('exit', code => {
        clearTimeout(timer);
        console.error(output);
        log('FAIL: web-ext exited before the add-on was installed, code', code);
        cleanupAndExit(1);
    });
}

async function interactive() {
    checkPrerequisites();
    buildOnce();

    const isNewProfile = !isUsedProfile(PROFILE_DIR);
    activeProfileDir = PROFILE_DIR;
    installUserChrome(PROFILE_DIR);

    log('watching for code changes, the add-on reloads by itself after each rebuild');
    log('a broken rebuild prints its errors here and the add-on keeps the last good build');
    const watcher = run(WEBPACK_BIN, ['--mode', 'production', '--watch', '--stats', 'errors-only'], {stdio: ['ignore', 'inherit', 'inherit']});
    watcher.on('exit', code => {
        if (code) {
            log('the build watcher stopped, code', code);
        }
    });

    log(isNewProfile
        ? 'opening Firefox with a new test profile and the test checklist'
        : 'opening Firefox with your existing test profile');
    log('to stop, close that Firefox window; Ctrl+C here also works but force-closes Firefox');

    const webExt = run(WEB_EXT_BIN, webExtArgs({profileDir: PROFILE_DIR, isNewProfile, smoke: false}), {stdio: 'inherit'});
    webExt.on('exit', code => {
        log('Firefox closed');
        cleanupAndExit(code ?? 0);
    });
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));

if (args.has('--reset')) {
    resetProfile();
} else if (args.has('--smoke')) {
    await smokeTest();
} else {
    await interactive();
}
