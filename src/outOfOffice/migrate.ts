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

/**
 * Reads settings saved by any version. 2.x and the earlier development state stored whole user
 * objects as excluded users, which could contain null for users deleted later, and scheduler
 * times that never switched anything; neither is carried over.
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
            excludedUserIds: uniqueIds(Array.isArray(raw.excludedUserIds) ? raw.excludedUserIds : []),
        };
    }
    const users: Array<any> = Array.isArray(raw?.users) ? raw.users : [];
    return {
        version: 3,
        enabled: raw?.on === true,
        utcOffset,
        message: text(raw?.message) || DEFAULT_MESSAGE,
        replyFrequency: text(raw?.replyFrequency) || DEFAULT_REPLY_FREQUENCY,
        excludedUserIds: uniqueIds(users.map((user) => user?.id)),
    };
}
