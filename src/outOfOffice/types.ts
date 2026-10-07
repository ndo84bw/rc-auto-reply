/** A calendar day on the user's clock, optionally with a time ("2026-10-13", "08:00") */
export interface IDayTime {
    date: string;
    time?: string;
}

export interface IOutOfOffice {
    version: 3;
    enabled: boolean;
    /** Missing: from now on */
    start?: IDayTime;
    /** Missing: until switched off. Without a time the whole last day counts */
    end?: IDayTime;
    /** The user's offset from UTC in hours when the period was saved, used to interpret start and end */
    utcOffset: number;
    message: string;
    replyFrequency: string;
    excludedUserIds: Array<string>;
}

export const DEFAULT_MESSAGE = 'Hey, I received your message and will get back to you as soon as possible.';
export const DEFAULT_REPLY_FREQUENCY = 'On Every Message';
