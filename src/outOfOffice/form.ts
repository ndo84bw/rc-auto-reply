import { isValidDate, isValidTime, validateOutOfOffice } from './period';
import { IDayTime, IOutOfOffice } from './types';

/** Every input block of the dialog uses its field name as block id, so the state of a field is state[field] */
export type FormField = 'enabled' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'message' | 'replyFrequency' | 'excludedIds' | 'addExcluded';

export type FormState = Record<string, Record<string, unknown> | undefined>;

/**
 * The client shows a field error until it gets the next errors for the view, and accepts only one
 * response per click, so a successful save can't both clear old errors and show the saved view.
 * After each save the action ids get a new generation ("endDate.1"); old errors then match no field.
 */
export const actionIdOf = (field: FormField, generation: number): string => (generation ? `${field}.${generation}` : field);

/** The generation travels back in the submit button value, which the client could forge */
export function generationOf(submitValue: unknown): number {
    return typeof submitValue === 'string' && /^\d{1,6}$/.test(submitValue) ? Number(submitValue) : 0;
}

/** What the dialog shows for the saved settings */
export function formValues(settings: IOutOfOffice): Record<FormField, unknown> {
    return {
        enabled: settings.enabled ? 'on' : 'off',
        startDate: settings.start?.date,
        startTime: settings.start?.time,
        endDate: settings.end?.date,
        endTime: settings.end?.time,
        message: settings.message,
        replyFrequency: settings.replyFrequency,
        excludedIds: settings.excludedUserIds,
        addExcluded: [],
    };
}

export interface IFormResult {
    settings: IOutOfOffice;
    /** People picked in "Add people", by username, still to be resolved to ids */
    addUsernames: Array<string>;
    errors: Partial<Record<FormField, string>>;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);
const strings = (value: unknown): Array<string> => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : []);

/**
 * Reads the submitted dialog. The client fills its state from the initial values only when the view
 * opens, so after a save a field the user did not touch since is missing from the state; it still
 * shows what was saved, which is what `saved` holds.
 */
export function readForm(state: FormState, generation: number, saved: IOutOfOffice, utcOffset: number, now: number, frequencies: Array<string>): IFormResult {
    const shown = formValues(saved);
    const value = (field: FormField): unknown => {
        const key = actionIdOf(field, generation);
        const values = state[field];
        return values && key in values ? values[key] : shown[field];
    };

    const errors: Partial<Record<FormField, string>> = {};
    const dayTime = (dateField: FormField, timeField: FormField): IDayTime | undefined => {
        const date = text(value(dateField));
        const time = text(value(timeField));
        if (date && !isValidDate(date)) {
            errors[dateField] = 'Please pick a valid date.';
        }
        if (time && !isValidTime(time)) {
            errors[timeField] = 'Please pick a valid time.';
        } else if (time && !date) {
            errors[timeField] = 'Please pick a day for this time.';
        }
        return date && isValidDate(date) ? { date, ...(time && isValidTime(time) ? { time } : {}) } : undefined;
    };

    const frequency = text(value('replyFrequency'));
    const settings: IOutOfOffice = {
        version: 3,
        enabled: value('enabled') === 'on',
        start: dayTime('startDate', 'startTime'),
        end: dayTime('endDate', 'endTime'),
        utcOffset,
        message: text(value('message')) ?? '',
        replyFrequency: frequency && frequencies.includes(frequency) ? frequency : saved.replyFrequency,
        excludedUserIds: [...new Set(strings(value('excludedIds')))],
    };

    if (Object.keys(errors).length === 0) {
        const invalid = validateOutOfOffice(settings, now);
        if (invalid.message) {
            errors.message = invalid.message;
        }
        if (invalid.end) {
            errors.endDate = invalid.end;
        }
    }
    return { settings, addUsernames: strings(value('addExcluded')), errors };
}
