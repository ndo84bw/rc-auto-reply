/** Must match the id in app.json, UI elements carry it to route interactions back to this app */
export const APP_ID = '821cd5c6-1fb5-4d9e-8e88-e6176463efb6';

/**
 * Copied from https://github.com/sampaiodiego/rocket.chat.app-poll/blob/4188fb6ba2b68b03d1b992735c46ee5f04fc18c8/src/lib/uuid.ts 
 */
export function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
