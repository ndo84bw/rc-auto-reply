import { IDayTime, IOutOfOffice } from './types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type OutOfOfficeStatus = 'off' | 'active' | 'scheduled' | 'ended';

export function isValidDate(date: unknown): date is string {
    return typeof date === 'string' && DATE.test(date) && !isNaN(Date.parse(`${date}T00:00:00Z`));
}

export function isValidTime(time: unknown): time is string {
    return typeof time === 'string' && TIME.test(time);
}

const offsetMs = (utcOffset: number): number => Math.round((utcOffset || 0) * 60) * MINUTE;

/** The point in time at which the given day (and time) begins on the user's clock */
function pointInTime(day: IDayTime, utcOffset: number): number {
    const [year, month, date] = day.date.split('-').map(Number);
    const [hour, minute] = day.time ? day.time.split(':').map(Number) : [0, 0];
    return Date.UTC(year, month - 1, date, hour, minute) - offsetMs(utcOffset);
}

export function startInstant(settings: IOutOfOffice): number | undefined {
    return settings.start ? pointInTime(settings.start, settings.utcOffset) : undefined;
}

/** Without a time the period lasts until the end of the last day */
export function endInstant(settings: IOutOfOffice): number | undefined {
    if (!settings.end) {
        return undefined;
    }
    const instant = pointInTime(settings.end, settings.utcOffset);
    return settings.end.time ? instant : instant + DAY;
}

export function getStatus(settings: IOutOfOffice, now: number): OutOfOfficeStatus {
    if (!settings.enabled) {
        return 'off';
    }
    const start = startInstant(settings);
    const end = endInstant(settings);
    if (end !== undefined && now >= end) {
        return 'ended';
    }
    if (start !== undefined && now < start) {
        return 'scheduled';
    }
    return 'active';
}

export function isActive(settings: IOutOfOffice, now: number): boolean {
    return getStatus(settings, now) === 'active';
}

/** Today's date on the user's clock */
export function todayOnUserClock(now: number, utcOffset: number): string {
    return new Date(now + offsetMs(utcOffset)).toISOString().slice(0, 10);
}

/** e.g. "UTC+2", "UTC+5:30", "UTC-3:30" */
export function utcOffsetLabel(utcOffset: number | undefined): string {
    const offset = utcOffset || 0;
    const minutes = Math.round(Math.abs(offset) * 60);
    const rest = minutes % 60;
    return `UTC${offset < 0 ? '-' : '+'}${Math.floor(minutes / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** e.g. "Fri, Oct 17" or "Fri, Oct 17, 6:00 PM", with the year when it is not the current one */
export function formatDayTime(day: IDayTime, now: number, utcOffset: number): string {
    const [year, month, date] = day.date.split('-').map(Number);
    const sameYear = year === Number(todayOnUserClock(now, utcOffset).slice(0, 4));
    const text = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
        timeZone: 'UTC',
    });
    if (!day.time) {
        return text;
    }
    const [hour, minute] = day.time.split(':').map(Number);
    const time = new Date(Date.UTC(1970, 0, 1, hour, minute)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return `${text}, ${time}`;
}

/** e.g. "Mon, Oct 13 - Fri, Oct 17", "from Mon, Oct 13", "until Fri, Oct 17" or "from now on" */
export function periodText(settings: IOutOfOffice, now: number): string {
    const format = (day: IDayTime) => formatDayTime(day, now, settings.utcOffset);
    if (settings.start && settings.end) {
        return `${format(settings.start)} - ${format(settings.end)}`;
    }
    if (settings.start) {
        return `from ${format(settings.start)}`;
    }
    return settings.end ? `until ${format(settings.end)}` : 'from now on';
}

export function statusText(settings: IOutOfOffice, now: number): string {
    const format = (day: IDayTime) => formatDayTime(day, now, settings.utcOffset);
    switch (getStatus(settings, now)) {
        case 'off': {
            const end = endInstant(settings);
            const upcoming = (settings.start || settings.end) && (end === undefined || end > now);
            return upcoming ? `Off. When enabled: ${periodText(settings, now)}` : 'Off';
        }
        case 'active':
            return settings.end ? `Active until ${format(settings.end)}` : 'Active, no end date';
        case 'scheduled':
            return `Scheduled from ${format(settings.start!)}${settings.end ? ` until ${format(settings.end)}` : ', no end date'}`;
        case 'ended':
            return `Ended on ${format(settings.end!)}`;
    }
}

export type OutOfOfficeField = 'message' | 'end';

/** Why the settings can't be saved like this, by field */
export function validateOutOfOffice(settings: IOutOfOffice, now: number): Partial<Record<OutOfOfficeField, string>> {
    const errors: Partial<Record<OutOfOfficeField, string>> = {};
    if (!settings.message.trim()) {
        errors.message = 'Please enter a message.';
    }
    const start = startInstant(settings);
    const end = endInstant(settings);
    if (start !== undefined && end !== undefined && end <= start) {
        errors.end = 'The period ends before it starts.';
    } else if (settings.enabled && end !== undefined && end <= now) {
        errors.end = 'This period has already ended.';
    }
    return errors;
}
