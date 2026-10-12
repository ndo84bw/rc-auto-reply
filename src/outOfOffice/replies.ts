/** Which replies to send, kept free of apps-engine imports so the tests can load it */

const HOUR = 1000 * 60 * 60;

/** More mentions in one message are ignored, so one message can't make the app read every user */
const MAX_MENTIONS = 20;

/** @usernames in a message, without @all and @here */
export function mentionedUsernames(text: string): Array<string> {
    const mentioned = new Set<string>();
    const pattern = /(?:^|\s)@([a-z0-9._-]+)/gi;
    let match: RegExpExecArray | null;
    // exec loop instead of matchAll: ES2017-safe for older build toolchains
    while ((match = pattern.exec(text)) !== null && mentioned.size < MAX_MENTIONS) {
        const username = match[1].toLowerCase();
        if (username !== 'all' && username !== 'here') {
            mentioned.add(username);
        }
    }
    return Array.from(mentioned);
}

/** Whether a reply to someone who last got one at lastReply would come too soon */
export function tooSoon(frequency: string, lastReply: Date | null, now: number): boolean {
    if (lastReply == null) {
        return false;
    }
    const since = now - new Date(lastReply).getTime();
    switch (frequency) {
        case 'Once':
            return true;
        case 'Once Per Hour':
            return since < HOUR;
        case 'Once Per Day':
            return since < 24 * HOUR;
        case 'Once Per Week':
            return since < 7 * 24 * HOUR;
        case 'Once Per Month':
            return since < 30 * 24 * HOUR;
        default:
            return false;
    }
}
