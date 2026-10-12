import { isValidDate, isValidTime } from './period';
import { DEFAULT_MESSAGE, DEFAULT_REPLY_FREQUENCY, IDayTime, IOutOfOffice } from './types';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function dayTime(value: any): IDayTime | undefined {
    if (!value || !isValidDate(value.date)) {
        return undefined;
    }
    return isValidTime(value.time) ? { date: value.date, time: value.time } : { date: value.date };
}

const uniqueIds = (ids: Array<unknown>): Array<string> => [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))];

const HOUR = 1;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** 2.1 stored "every", "once" or "cooldown" with hours; the cooldown becomes the next longer fixed step */
function frequencyOf(raw: any): string {
    if (text(raw?.replyFrequency)) {
        return raw.replyFrequency;
    }
    switch (raw?.frequency) {
        case 'once':
            return 'Once';
        case 'cooldown': {
            const hours = typeof raw.cooldownHours === 'number' && raw.cooldownHours > 0 ? raw.cooldownHours : DAY;
            return hours <= HOUR ? 'Once Per Hour' : hours <= DAY ? 'Once Per Day' : hours <= WEEK ? 'Once Per Week' : 'Once Per Month';
        }
        default:
            return DEFAULT_REPLY_FREQUENCY;
    }
}

/** 2.1 switched auto-reply on and off by daily and weekly schedulers */
const hadSchedulers = (raw: any): boolean =>
    Array.isArray(raw?.schedulers) && raw.schedulers.some((scheduler: any) => scheduler?.type === 'Daily' || scheduler?.type === 'Weekly');

/**
 * Reads settings saved by any version. 2.x and the earlier development state stored whole user
 * objects as excluded users, which could contain null for users deleted later, and scheduler
 * times; neither is carried over. Whoever had 2.1 schedulers starts switched off: the schedulers
 * set "on" and "off" behind the user's back, so the last state they left says nothing about now.
 */
export function toOutOfOffice(raw: any, utcOffset: number): IOutOfOffice {
    if (raw && raw.version === 3) {
        return {
            version: 3,
            enabled: raw.enabled === true,
            start: dayTime(raw.start),
            end: dayTime(raw.end),
            utcOffset: typeof raw.utcOffset === 'number' ? raw.utcOffset : utcOffset,
            message: text(raw.message) || DEFAULT_MESSAGE,
            replyFrequency: text(raw.replyFrequency) || DEFAULT_REPLY_FREQUENCY,
            replyToMentions: raw.replyToMentions === true,
            excludedUserIds: uniqueIds(Array.isArray(raw.excludedUserIds) ? raw.excludedUserIds : []),
        };
    }
    const users: Array<any> = Array.isArray(raw?.users) ? raw.users : [];
    return {
        version: 3,
        enabled: raw?.on === true && !hadSchedulers(raw),
        utcOffset,
        message: text(raw?.message) || DEFAULT_MESSAGE,
        replyFrequency: frequencyOf(raw),
        replyToMentions: raw?.replyToMentions === true,
        excludedUserIds: uniqueIds(users.map((user) => user?.id)),
    };
}
