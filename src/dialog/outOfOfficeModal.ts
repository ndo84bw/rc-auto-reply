import { IUIKitSurfaceViewParam } from '@rocket.chat/apps-engine/definition/accessors';
import { UIKitSurfaceType } from '@rocket.chat/apps-engine/definition/uikit';

import { actionIdOf, FormField, WHOLE_DAY } from '../outOfOffice/form';
import { statusText, utcOffsetLabel } from '../outOfOffice/period';
import { IOutOfOffice } from '../outOfOffice/types';
import { IReplyFrequency } from '../utils/IAutoReplySettings';
import { APP_ID, uuid } from '../utils/ids';

export const OPEN_ACTION = 'out-of-office-open';
export const VIEW_ID_PREFIX = 'out-of-office-';

const frequencies = (): Array<[IReplyFrequency, string]> => [
    [IReplyFrequency.OnEveryMessage, 'On every message'],
    [IReplyFrequency.Once, 'Once per person'],
    [IReplyFrequency.OncePerHour, 'Once per hour'],
    [IReplyFrequency.OncePerDay, 'Once per day'],
    [IReplyFrequency.OncePerWeek, 'Once per week'],
    [IReplyFrequency.OncePerMonth, 'Once per month'],
];

export const replyFrequencies = (): Array<string> => frequencies().map(([value]) => value);

const plain = (text: string) => ({ type: 'plain_text', text, emoji: true });
const option = (text: string, value: string) => ({ text: plain(text), value });

const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * Full hours as a select instead of a time picker: Firefox shows the picker with two clock icons.
 * "Whole day" stands for no time, a saved time that is not a full hour stays selectable.
 */
const timeOptions = (wholeDay: string, first: boolean, saved?: string) => {
    const hours = Array.from({ length: 23 }, (_, i) => hour(i + 1));
    const times = saved && !hours.includes(saved) ? [...hours, saved].sort() : hours;
    const day = option(wholeDay, WHOLE_DAY);
    const options = times.map((time) => option(time, time));
    return first ? [day, ...options] : [...options, day];
};

const inputOf = (generation: number) => (field: FormField, label: string, element: object, optional = false) => ({
    type: 'input',
    blockId: field,
    appId: APP_ID,
    label: plain(label),
    optional,
    element: { ...element, actionId: actionIdOf(field, generation), blockId: field, appId: APP_ID },
});

const context = (text: string) => ({ type: 'context', appId: APP_ID, elements: [{ type: 'mrkdwn', text }] });

export interface IExcludedUser {
    id: string;
    label: string;
}

export interface IOutOfOfficeModalInput {
    settings: IOutOfOffice;
    now: number;
    /** The user's current offset, in which new dates and times are entered */
    utcOffset: number | undefined;
    excludedUsers: Array<IExcludedUser>;
    saved?: boolean;
    viewId?: string;
    generation?: number;
}

export function createOutOfOfficeModal({ settings, now, utcOffset, excludedUsers, saved, viewId, generation = 0 }: IOutOfOfficeModalInput): IUIKitSurfaceViewParam {
    const status = statusText(settings, now);
    const input = inputOf(generation);
    const on = option('On', 'on');
    const off = option('Off', 'off');
    const blocks = [
        { type: 'section', appId: APP_ID, text: { type: 'mrkdwn', text: saved ? `✅ *Saved.* Current status: ${status}` : `*Current status:* ${status}` } },
        { type: 'divider', appId: APP_ID },
        // A select, because in an input block 8.6.1 stores a checkbox click as a string and a radio label is not clickable
        input('enabled', 'Out of office reply', { type: 'static_select', options: [on, off], initialValue: settings.enabled ? 'on' : 'off' }),
        context('Replies are only sent while on and inside the period below.'),
        input('startDate', 'First day', { type: 'datepicker', initialDate: settings.start?.date, placeholder: plain('From now on') }, true),
        input('startTime', 'From', { type: 'static_select', options: timeOptions('Start of day (00:00)', true, settings.start?.time), initialValue: settings.start?.time ?? WHOLE_DAY }),
        input('endDate', 'Last day', { type: 'datepicker', initialDate: settings.end?.date, placeholder: plain('Until switched off') }, true),
        input('endTime', 'Until', { type: 'static_select', options: timeOptions('End of day (24:00)', false, settings.end?.time), initialValue: settings.end?.time ?? WHOLE_DAY }),
        context(`Leave the first day empty to start right away and the last day empty to keep it on until you switch it off. Times are in ${utcOffsetLabel(utcOffset)}.`),
        { type: 'divider', appId: APP_ID },
        input('message', 'Message', { type: 'plain_text_input', multiline: true, initialValue: settings.message }),
        input('replyFrequency', 'Reply', {
            type: 'static_select',
            options: frequencies().map(([value, text]) => option(text, value)),
            initialValue: settings.replyFrequency,
        }),
        // Saved people as static options: the user picker builds its chips from a search that has not loaded yet
        ...(excludedUsers.length
            ? [input('excludedIds', 'Never reply to', {
                type: 'multi_static_select',
                options: excludedUsers.map((user) => option(user.label, user.id)),
                initialValue: excludedUsers.map((user) => user.id),
            }, true)]
            : []),
        input('addExcluded', excludedUsers.length ? 'Add people never to reply to' : 'Never reply to', { type: 'multi_users_select' }, true),
    ];

    return {
        id: viewId ?? `${VIEW_ID_PREFIX}${uuid()}`,
        type: UIKitSurfaceType.MODAL,
        title: plain('Out of Office') as any,
        // The generation travels back with the submitted view
        submit: { type: 'button', text: plain('Save'), actionId: 'out-of-office-save', blockId: 'out-of-office-save', value: String(generation), appId: APP_ID } as any,
        close: { type: 'button', text: plain(saved ? 'Close' : 'Cancel'), actionId: 'out-of-office-close', blockId: 'out-of-office-close', appId: APP_ID } as any,
        blocks: blocks as any,
    };
}
