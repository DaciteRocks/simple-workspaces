import Listeners from './listeners.js\
?tabGroups.onCreated\
&tabGroups.onUpdated\
&tabGroups.onRemoved\
&storage.local.onChanged\
';
import Logger from './logger.js';
import * as Storage from './storage.js';
import * as Operations from './operations.js';

// Single-active native groups (Vivaldi "two-level bar" model, docs/VIVALDI-PARITY-FORK.md §4.4):
// at most ONE native group per window is expanded. When the user expands a group, every other
// expanded group in that window is collapsed by the addon, so a userChrome.css layer keyed on
// `tab-group:not([collapsed])` always shows exactly one group on its bottom bar.
//
// - the trigger is the collapsed:true → false TRANSITION of a live group. tabGroups.onUpdated also
//   fires for rename (per keystroke) and recolor (docs/TABGROUPS-BEHAVIOR.md §15) with `collapsed`
//   unchanged, so the previous flag of every live group is remembered here and only a real expand
//   counts. An unknown previous state (a group whose onCreated was missed) never counts.
// - the addon only ever COLLAPSES, so its own updates can never re-trigger it: no feedback loop.
// - collapsing a group that holds the active tab is fine - the browser keeps drawing the active tab
//   outside the collapsed header (docs/TABGROUPS-BEHAVIOR.md §5).
// - while a composite addon operation is running (workspace switch, restore) the enforcement is
//   parked per window and runs once on idle, when the active tab is settled - a rebuilt workspace
//   whose metadata has several expanded groups keeps the one holding the active tab.
// - native groups are window-scoped, so is everything here. Live ids never leave this module.

const TAB_GROUP_ID_NONE = browser.tabGroups.TAB_GROUP_ID_NONE;

const logger = new Logger('GroupsNativeExclusive');
const settings = await Storage.get(['singleExpandedNativeGroup']);

Listeners.storage.local.onChanged.add(onStorageChanged, {waitListener: false});

function onStorageChanged(changes) {
    if (Storage.isChangedKey('singleExpandedNativeGroup', changes, Boolean)) {
        settings.singleExpandedNativeGroup = changes.singleExpandedNativeGroup.newValue;

        if (settings.singleExpandedNativeGroup) {
            // switched on: settle every window right away instead of waiting for the next expand
            enforceAllWindows().catch(logger.onCatch('enforceAllWindows failed', false));
        }
    }
}

export function isEnabled() {
    return settings.singleExpandedNativeGroup;
}

// the last collapsed flag each live group reported
const collapsedByLiveId = new Map; // liveId → boolean

function remember(groupNative) {
    collapsedByLiveId.set(groupNative.id, groupNative.collapsed);
}

async function seedLiveGroups() {
    const liveGroups = await browser.tabGroups.query({}).catch(logger.onCatch('cant query live groups', false)) ?? [];

    for (const groupNative of liveGroups) {
        remember(groupNative);
    }

    logger.log(seedLiveGroups, 'count:', liveGroups.length);
}

// listeners
function onCreated(groupNative) {
    remember(groupNative);
}

function onUpdated(groupNative) {
    const wasCollapsed = collapsedByLiveId.get(groupNative.id);

    remember(groupNative);

    if (!settings.singleExpandedNativeGroup) {
        return;
    }

    if (wasCollapsed !== true || groupNative.collapsed) {
        return; // not a collapsed → expanded transition
    }

    logger.log(onUpdated, 'expanded:', groupNative.id, 'window:', groupNative.windowId);

    scheduleEnforce(groupNative.windowId, groupNative.id);
}

function onRemoved(groupNative) {
    collapsedByLiveId.delete(groupNative.id);
}

export function addListeners(options) {
    Listeners.tabGroups.onCreated.add(onCreated, options);
    Listeners.tabGroups.onUpdated.add(onUpdated, options);
    Listeners.tabGroups.onRemoved.add(onRemoved, options);

    return seedLiveGroups();
}

export function removeListeners() {
    Listeners.tabGroups.onCreated.remove(onCreated);
    Listeners.tabGroups.onUpdated.remove(onUpdated);
    Listeners.tabGroups.onRemoved.remove(onRemoved);
}

// methods

// an enforcement asked for while an addon operation is in flight waits for idle: the window is
// mid-rebuild and its active tab is not settled yet. The latest ask per window wins
const pendingByWindow = new Map; // windowId → keepLiveId | null

Operations.onIdle(function enforcePendingWindows() {
    const pending = [...pendingByWindow];

    pendingByWindow.clear();

    for (const [windowId, keepLiveId] of pending) {
        enforceWindow(windowId, keepLiveId).catch(logger.onCatch(['enforceWindow failed', windowId], false));
    }
});

export function scheduleEnforce(windowId, keepLiveId = null) {
    if (!windowId || !settings.singleExpandedNativeGroup) {
        return;
    }

    if (Operations.isBusy()) {
        pendingByWindow.set(windowId, keepLiveId);
        return;
    }

    enforceWindow(windowId, keepLiveId).catch(logger.onCatch(['enforceWindow failed', windowId], false));
}

// which expanded group survives: the one asked for (the user just expanded it), otherwise the one
// holding the window's active tab, otherwise the first the browser reports
async function pickGroupToKeep(windowId, expandedGroups, keepLiveId) {
    if (keepLiveId !== null) {
        const asked = expandedGroups.find(groupNative => groupNative.id === keepLiveId);

        if (asked) {
            return asked;
        }
    }

    const [activeTab] = await browser.tabs.query({windowId, active: true}).catch(() => []);

    if (activeTab && activeTab.groupId !== TAB_GROUP_ID_NONE) {
        const active = expandedGroups.find(groupNative => groupNative.id === activeTab.groupId);

        if (active) {
            return active;
        }
    }

    return expandedGroups[0];
}

// collapse every expanded group in the window except one. Returns the number collapsed
export async function enforceWindow(windowId, keepLiveId = null) {
    if (!settings.singleExpandedNativeGroup) {
        return 0;
    }

    const expandedGroups = await browser.tabGroups.query({windowId, collapsed: false});

    if (expandedGroups.length < 2) {
        return 0;
    }

    const groupToKeep = await pickGroupToKeep(windowId, expandedGroups, keepLiveId);
    const groupsToCollapse = expandedGroups.filter(groupNative => groupNative.id !== groupToKeep.id);

    const log = logger.start(enforceWindow, windowId, 'keep:', groupToKeep.id, 'collapse:', groupsToCollapse.map(groupNative => groupNative.id));

    await Promise.all(groupsToCollapse.map(groupNative => {
        return browser.tabGroups.update(groupNative.id, {collapsed: true})
            .catch(log.onCatch(['cant collapse native group', groupNative.id], false));
    }));

    log.stop();

    return groupsToCollapse.length;
}

export async function enforceAllWindows() {
    const windows = await browser.windows.getAll({windowTypes: ['normal']});

    for (const win of windows) {
        scheduleEnforce(win.id);
    }
}
