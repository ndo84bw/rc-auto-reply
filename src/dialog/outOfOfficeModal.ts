import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';

import { AppLanguage, translate } from '../i18n/translations';
import { actionIdOf, FormField, WHOLE_DAY } from '../outOfOffice/form';
import { statusText, utcOffsetLabel } from '../outOfOffice/period';
import { IOutOfOffice } from '../outOfOffice/types';
import { IReplyFrequency } from '../utils/IAutoReplySettings';
import { APP_ID, uuid } from '../utils/ids';

export const OPEN_ACTION = 'out-of-office-open';
export const VIEW_ID_PREFIX = 'out-of-office-';

/** Stored value and text key of each reply frequency */
const frequencies = (): Array<[IReplyFrequency, string]> => [
    [IReplyFrequency.OnEveryMessage, 'frequency_every'],
    [IReplyFrequency.Once, 'frequency_once'],
    [IReplyFrequency.OncePerHour, 'frequency_hour'],
    [IReplyFrequency.OncePerDay, 'frequency_day'],
    [IReplyFrequency.OncePerWeek, 'frequency_week'],
    [IReplyFrequency.OncePerMonth, 'frequency_month'],
];

export const replyFrequencies = (): Array<string> => frequencies().map(([value]) => value);

/** The frequency as the dialog names it, e.g. "Once per day" */
export const frequencyText = (value: string, lang: AppLanguage): string => {
    const found = frequencies().find(([frequency]) => frequency === value);
    return found ? translate(found[1], lang) : value;
};

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
    lang?: AppLanguage;
}

export function createOutOfOfficeModal({ settings, now, utcOffset, excludedUsers, saved, viewId, generation = 0, lang = 'en' }: IOutOfOfficeModalInput): IUIKitModalViewParam {
    const t = (key: string, params?: { [k: string]: string }) => translate(key, lang, params);
    const status = statusText(settings, now, lang);
    const input = inputOf(generation);
    const on = option(t('dialog_on'), 'on');
    const off = option(t('dialog_off'), 'off');
    const blocks = [
        { type: 'section', appId: APP_ID, text: { type: 'mrkdwn', text: t(saved ? 'dialog_saved' : 'dialog_status', { status }) } },
        { type: 'divider', appId: APP_ID },
        // A select, because in an input block 8.6.1 stores a checkbox click as a string and a radio label is not clickable
        input('enabled', t('dialog_enabled'), { type: 'static_select', options: [on, off], initialValue: settings.enabled ? 'on' : 'off' }),
        context(t('dialog_enabled_help')),
        input('startDate', t('dialog_first_day'), { type: 'datepicker', initialDate: settings.start?.date, placeholder: plain(t('dialog_first_day_placeholder')) }, true),
        input('startTime', t('dialog_from'), { type: 'static_select', options: timeOptions(t('dialog_start_of_day'), true, settings.start?.time), initialValue: settings.start?.time ?? WHOLE_DAY }),
        input('endDate', t('dialog_last_day'), { type: 'datepicker', initialDate: settings.end?.date, placeholder: plain(t('dialog_last_day_placeholder')) }, true),
        input('endTime', t('dialog_until'), { type: 'static_select', options: timeOptions(t('dialog_end_of_day'), false, settings.end?.time), initialValue: settings.end?.time ?? WHOLE_DAY }),
        context(t('dialog_period_help', { offset: utcOffsetLabel(utcOffset) })),
        { type: 'divider', appId: APP_ID },
        input('message', t('dialog_message'), { type: 'plain_text_input', multiline: true, initialValue: settings.message }),
        input('replyFrequency', t('dialog_frequency'), {
            type: 'static_select',
            options: frequencies().map(([value, key]) => option(t(key), value)),
            initialValue: settings.replyFrequency,
        }),
        input('replyToMentions', t('dialog_mentions'), {
            type: 'static_select',
            options: [option(t('dialog_mentions_off'), 'off'), option(t('dialog_mentions_on'), 'on')],
            initialValue: settings.replyToMentions ? 'on' : 'off',
        }),
        // Saved people as static options: the user picker builds its chips from a search that has not loaded yet
        ...(excludedUsers.length
            ? [input('excludedIds', t('dialog_excluded'), {
                type: 'multi_static_select',
                options: excludedUsers.map((user) => option(user.label, user.id)),
                initialValue: excludedUsers.map((user) => user.id),
            }, true)]
            : []),
        input('addExcluded', t(excludedUsers.length ? 'dialog_add_excluded' : 'dialog_excluded'), { type: 'multi_users_select' }, true),
    ];

    return {
        id: viewId ?? `${VIEW_ID_PREFIX}${uuid()}`,
        title: plain(t('dialog_title')) as any,
        // The generation travels back with the submitted view
        submit: { type: 'button', text: plain(t('dialog_save')), actionId: 'out-of-office-save', blockId: 'out-of-office-save', value: String(generation), appId: APP_ID } as any,
        close: { type: 'button', text: plain(t(saved ? 'dialog_close' : 'dialog_cancel')), actionId: 'out-of-office-close', blockId: 'out-of-office-close', appId: APP_ID } as any,
        blocks: blocks as any,
    };
}
