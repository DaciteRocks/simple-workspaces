import Listeners from './listeners.js\
?tabs.onActivated&tabGroups.onCreated\
&tabGroups.onUpdated\
&tabGroups.onMoved\
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
// Which group survives: the one the user explicitly opened; otherwise the one holding the active tab;
// otherwise NONE. So selecting a top-bar tab - an ungrouped tab, a pinned tab, or the active tab of a
// collapsed group (drawn beside its header, docs/TABGROUPS-BEHAVIOR.md §5) - collapses every expanded
// group of that window and the bottom bar goes away (tabs.onActivated is that trigger). Selecting a tab
// inside the expanded group changes nothing. Activating a tab of a collapsed group never expands it.
//
// - the main trigger is the collapsed:true → false TRANSITION of a live group. tabGroups.onUpdated
//   also fires for rename (per keystroke) and recolor (docs/TABGROUPS-BEHAVIOR.md §15) with
//   `collapsed` unchanged, so the previous flag of every live group is remembered here and only a
//   real expand counts. An unknown previous state (a group whose onCreated was missed) never counts.
// - a group that ARRIVES expanded fires no transition: a group born from the browser's own
//   "add tabs to new group" (onCreated, expanded with an empty title - §7) or one moved in from
//   another window (onMoved only - §16). Those count as the user opening that group. Arrivals
//   during an addon operation (a workspace rebuild) do not - there the active tab decides.
// - the addon only ever COLLAPSES, so its own updates can never re-trigger it: no feedback loop.
// - collapsing a group that holds the active tab is fine - the browser keeps drawing the active tab
//   outside the collapsed header (docs/TABGROUPS-BEHAVIOR.md §5).
// - while a composite addon operation is running (workspace switch, restore) the enforcement is
//   parked per window and runs once on idle, when the active tab is settled - a rebuilt workspace
//   whose metadata has several expanded groups keeps the one holding the active tab.
// - the mirror in groups-native.js records the resulting collapsed flags into the workspace
//   metadata like any user collapse - the single-expanded layout is what gets persisted. With the
//   activation rule "expanded" is a function of the active tab plus the last explicit expand, so a
//   stored flag only ever decides a group the active tab does not decide; no extra storage is kept.
// - native groups are window-scoped, so is everything here. Live ids never leave this module.
// - this module is imported by every extension page through groups.js; only the background page
//   calls addListeners(), so only the background ever touches the browser from here.

const TAB_GROUP_ID_NONE = browser.tabGroups.TAB_GROUP_ID_NONE;

const logger = new Logger('GroupsNativeExclusive');
const settings = await Storage.get(['singleExpandedNativeGroup']);

function onStorageChanged(changes) {
    if (Storage.isChangedKey('singleExpandedNativeGroup', changes, Boolean)) {
        settings.singleExpandedNativeGroup = changes.singleExpandedNativeGroup.newValue;

        if (settings.singleExpandedNativeGroup) {
            // switched on: settle every window right away instead of waiting for the next expand
            enforceAllWindows().catch(logger.onCatch('enforceAllWindows failed', false));
        }
    }
}

// the last collapsed flag each live group reported
const collapsedByLiveId = new Map; // liveId → boolean

function remember(groupNative) {
    collapsedByLiveId.set(groupNative.id, groupNative.collapsed);
}

async function seedLiveGroups() {
    const liveGroups = await browser.tabGroups.query({}).catch(logger.onCatch('cant query live groups', false)) ?? [];

    for (const groupNative of liveGroups) {
        // an event that landed during the query knows better than the snapshot
        if (!collapsedByLiveId.has(groupNative.id)) {
            remember(groupNative);
        }
    }

    logger.log(seedLiveGroups, 'count:', liveGroups.length);
}

// listeners
function onCreated(groupNative) {
    remember(groupNative);

    if (!groupNative.collapsed) {
        // born expanded (§7) - the user just opened this one, unless it is the addon's own rebuild
        scheduleEnforce(groupNative.windowId, userKeepId(groupNative));
    }
}

function onUpdated(groupNative) {
    const wasCollapsed = collapsedByLiveId.get(groupNative.id);

    remember(groupNative);

    if (wasCollapsed !== true || groupNative.collapsed) {
        return; // not a collapsed → expanded transition
    }

    logger.log(onUpdated, 'expanded:', groupNative.id, 'window:', groupNative.windowId);

    scheduleEnforce(groupNative.windowId, groupNative.id);
}

function onMoved(groupNative) {
    remember(groupNative);

    if (!groupNative.collapsed) {
        // arrived expanded from another window (§16); a header drag inside the window is
        // collapsed while it moves (§14) and re-expands through onUpdated
        scheduleEnforce(groupNative.windowId, userKeepId(groupNative));
    }
}

// a group that arrives while an addon operation is running is the addon's own doing (GroupsNative.apply
// creates every sub-group expanded, §3) - it must not claim the keep, or the last rebuilt group would win
// over the one holding the active tab
function userKeepId(groupNative) {
    return Operations.isBusy() ? null : groupNative.id;
}

function onRemoved(groupNative) {
    collapsedByLiveId.delete(groupNative.id);
}

// a top-bar tab selected → the expanded group (if it does not hold that tab) collapses. No keep id:
// the active tab decides. During an addon operation this is parked like any other request, so the
// activations of a workspace rebuild are folded into one decision on idle
async function onActivated({tabId}) {
    const tab = await browser.tabs.get(tabId).catch(() => null);

    if (!tab) {
        return; // closed before we got here
    }

    scheduleEnforce(tab.windowId);
}

let unsubscribeIdle = null;

export function addListeners(options) {
    Listeners.tabs.onActivated.add(onActivated, options);
    Listeners.tabGroups.onCreated.add(onCreated, options);
    Listeners.tabGroups.onUpdated.add(onUpdated, options);
    Listeners.tabGroups.onMoved.add(onMoved, options);
    Listeners.tabGroups.onRemoved.add(onRemoved, options);
    Listeners.storage.local.onChanged.add(onStorageChanged, {waitListener: false});

    unsubscribeIdle ??= Operations.onIdle(enforcePendingWindows);

    seedLiveGroups();
}

export function removeListeners() {
    Listeners.tabs.onActivated.remove(onActivated);
    Listeners.tabGroups.onCreated.remove(onCreated);
    Listeners.tabGroups.onUpdated.remove(onUpdated);
    Listeners.tabGroups.onMoved.remove(onMoved);
    Listeners.tabGroups.onRemoved.remove(onRemoved);
    Listeners.storage.local.onChanged.remove(onStorageChanged);

    unsubscribeIdle?.();
    unsubscribeIdle = null;
    pendingByWindow.clear();
}

// methods

// an enforcement asked for while an addon operation is in flight waits for idle: the window is
// mid-rebuild and its active tab is not settled yet. An explicit ask (the group the user opened)
// is never overwritten by a later state-based one from the same operation
const pendingByWindow = new Map; // windowId → keepLiveId | null

function enforcePendingWindows() {
    const pending = [...pendingByWindow];

    pendingByWindow.clear();

    for (const [windowId, keepLiveId] of pending) {
        enforceWindow(windowId, keepLiveId).catch(logger.onCatch(['enforceWindow failed', windowId], false));
    }
}

export function scheduleEnforce(windowId, keepLiveId = null) {
    if (!windowId || !settings.singleExpandedNativeGroup) {
        return;
    }

    if (Operations.isBusy()) {
        pendingByWindow.set(windowId, keepLiveId ?? pendingByWindow.get(windowId) ?? null);
        return;
    }

    enforceWindow(windowId, keepLiveId).catch(logger.onCatch(['enforceWindow failed', windowId], false));
}

// which expanded group survives: the one asked for (the user just expanded it), otherwise the one
// holding the window's active tab, otherwise none (the active tab is on the top bar)
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

    return null;
}

// collapse every expanded group in the window except the one to keep, if any
export async function enforceWindow(windowId, keepLiveId = null) {
    if (!settings.singleExpandedNativeGroup) {
        return;
    }

    const expandedGroups = await browser.tabGroups.query({windowId, collapsed: false});

    if (!expandedGroups.length) {
        return;
    }

    const groupToKeep = await pickGroupToKeep(windowId, expandedGroups, keepLiveId);
    const groupsToCollapse = expandedGroups.filter(groupNative => groupNative.id !== groupToKeep?.id);

    if (!groupsToCollapse.length) {
        return;
    }

    const log = logger.start(enforceWindow, windowId, 'keep:', groupToKeep?.id ?? null, 'collapse:', groupsToCollapse.map(groupNative => groupNative.id));

    await Promise.all(groupsToCollapse.map(groupNative => {
        return browser.tabGroups.update(groupNative.id, {collapsed: true})
            .catch(log.onCatch(['cant collapse native group', groupNative.id], false));
    }));

    log.stop();
}

export async function enforceAllWindows() {
    const windows = await browser.windows.getAll({windowTypes: [browser.windows.WindowType.NORMAL]}).catch(() => []);

    for (const win of windows) {
        scheduleEnforce(win.id);
    }
}
