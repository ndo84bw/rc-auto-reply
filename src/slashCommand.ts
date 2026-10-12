import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { frequencyText, replyFrequencies } from './dialog/outOfOfficeModal';
import { outOfOfficeModalFor } from './dialog/outOfOfficeDialog';
import { translate } from './i18n/translations';
import { endInstant, statusText } from './outOfOffice/period';
import { IOutOfOffice } from './outOfOffice/types';
import { readOutOfOffice, saveOutOfOffice } from './store';
import { getLanguage, sendNotifyMessage } from './utils/helpers';
import { IReplyFrequency } from './utils/IAutoReplySettings';

/**
 * Short names for `/auto-reply frequency`; 2.1's "every", "once" and "cooldown" keep working.
 * A function, because packaging evaluates modules and the enum is not loaded yet inside the import cycle.
 */
const frequencyWords = (): { [word: string]: IReplyFrequency } => ({
    every: IReplyFrequency.OnEveryMessage,
    once: IReplyFrequency.Once,
    hour: IReplyFrequency.OncePerHour,
    day: IReplyFrequency.OncePerDay,
    cooldown: IReplyFrequency.OncePerDay,
    week: IReplyFrequency.OncePerWeek,
    month: IReplyFrequency.OncePerMonth,
});

export class SlashCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const [action = '', ...words] = context.getArguments();
        const sender = context.getSender();
        const lang = await getLanguage(read, sender);
        const t = (key: string, params?: { [k: string]: string }) => translate(key, lang, params);
        const notify = (text: string) => sendNotifyMessage(undefined, modify, context.getRoom(), sender, text);
        const previous = await readOutOfOffice(sender.id, read, sender.utcOffset);
        const save = (next: IOutOfOffice) => saveOutOfOffice(sender.id, previous, next, persis, read);
        const status = (settings: IOutOfOffice) => t('cmd_status', { status: statusText(settings, Date.now(), lang), message: settings.message });

        switch (action.toLowerCase()) {
            case '': {
                const triggerId = context.getTriggerId();
                if (!triggerId) {
                    return notify(t('cmd_usage'));
                }
                return modify.getUiController().openModalView(await outOfOfficeModalFor(sender, read), { triggerId }, sender);
            }
            case 'on':
            case 'enable': {
                // On from now: a first day set earlier would keep it waiting, a last day still to come stays
                const endOver = previous.end !== undefined && endInstant(previous)! <= Date.now();
                const next: IOutOfOffice = { ...previous, enabled: true, start: undefined, end: endOver ? undefined : previous.end, message: words.join(' ') || previous.message };
                await save(next);
                return notify(status(next));
            }
            case 'off':
            case 'disable': {
                const next: IOutOfOffice = { ...previous, enabled: false };
                await save(next);
                return notify(status(next));
            }
            case 'status':
            case 'list':
                return notify(status(previous));
            case 'remove-user':
            case 'include-user': {
                if (!words[0]) {
                    return notify(t('cmd_user_usage', { action: action.toLowerCase() }));
                }
                const user = await findUser(words[0], read);
                if (!user) {
                    return notify(t('cmd_user_not_found', { user: words[0] }));
                }
                if (action.toLowerCase() === 'remove-user') {
                    await save({ ...previous, excludedUserIds: [...new Set([...previous.excludedUserIds, user.id])] });
                    return notify(t('cmd_excluded', { username: user.username }));
                }
                if (!previous.excludedUserIds.includes(user.id)) {
                    return notify(t('cmd_not_excluded', { username: user.username }));
                }
                await save({ ...previous, excludedUserIds: previous.excludedUserIds.filter((id) => id !== user.id) });
                return notify(t('cmd_included', { username: user.username }));
            }
            case 'frequency': {
                const frequency = frequencyWords()[(words[0] ?? '').toLowerCase()];
                if (!frequency || !replyFrequencies().includes(frequency)) {
                    return notify(t('cmd_frequency_usage'));
                }
                await save({ ...previous, replyFrequency: frequency });
                return notify(t('cmd_frequency_set', { frequency: frequencyText(frequency, lang) }));
            }
            case 'mentions': {
                const value = (words[0] ?? '').toLowerCase();
                if (value !== 'on' && value !== 'off') {
                    return notify(t('cmd_mentions_usage'));
                }
                await save({ ...previous, replyToMentions: value === 'on' });
                return notify(t(value === 'on' ? 'cmd_mentions_on' : 'cmd_mentions_off'));
            }
            case 'timezone':
                return notify(t('cmd_timezone_gone'));
            default:
                return notify(t('cmd_usage'));
        }
    }
}

/** By username (with or without @) or by id */
async function findUser(nameOrId: string, read: IRead): Promise<IUser | undefined> {
    const name = nameOrId.replace(/^@/, '');
    const reader = read.getUserReader();
    try {
        const byName = await reader.getByUsername(name);
        if (byName) {
            return byName;
        }
    } catch {
        // not a username, maybe an id
    }
    try {
        return (await reader.getById(name)) ?? undefined;
    } catch {
        return undefined;
    }
}
