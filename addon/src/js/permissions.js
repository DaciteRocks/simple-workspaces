import Listeners from '/js/listeners.js\
?permissions.onAdded\
&permissions.onRemoved\
';
import * as Constants from './constants.js';

export const {
    BOOKMARKS,
    NATIVE_MESSAGING,
    BROWSER_SETTINGS,
} = Constants.PERMISSIONS;

export const {onAdded, onRemoved} = Listeners.permissions;

export async function has(permission) {
    return browser.permissions.contains(permission);
}

export async function request(permission) {
    return browser.permissions.request(permission);
}

export async function remove(permission) {
    return browser.permissions.remove(permission);
}

export function hasAll(change, def) {
    const c = normalize(change);
    const d = normalize(def);

    return c.permissions.isSupersetOf(d.permissions)
        && c.origins.isSupersetOf(d.origins);
}

export function hasAny(change, def) {
    const c = normalize(change);
    const d = normalize(def);

    return c.permissions.intersection(d.permissions).size > 0
        || c.origins.intersection(d.origins).size > 0;
}

function normalize({permissions, origins}) {
    return {
        permissions: new Set(permissions),
        origins: new Set(origins),
    };
}

// Optional data collection (Firefox built-in data consent, Firefox 140+). Only GitHub Gist sync sends data
// off the device: the user's token (authenticationInfo), tab urls and titles (browsingActivity) and, when
// enabled, favicons (websiteContent). Declared optional in manifest.json, granted per user. docs/PRIVACY.md
export const CLOUD_SYNC_DATA_COLLECTION = Object.freeze(['authenticationInfo', 'browsingActivity', 'websiteContent']);

export async function hasDataCollection(categories) {
    const {data_collection: granted = []} = await browser.permissions.getAll();
    return categories.every(category => granted.includes(category));
}

// permissions.request needs user input: call it from a click/keydown handler BEFORE any other await.
// Already granted categories resolve true without a prompt
export async function requestDataCollection(categories) {
    return browser.permissions.request({data_collection: [...categories]});
}
