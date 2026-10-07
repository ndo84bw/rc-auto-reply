import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

import { outOfOfficeModalFor } from './dialog/outOfOfficeDialog';
import { endInstant, statusText } from './outOfOffice/period';
import { IOutOfOffice } from './outOfOffice/types';
import { readOutOfOffice, saveOutOfOffice } from './store';
import { sendNotifyMessage } from './utils/helpers';

const USAGE = '`/auto-reply` opens the settings. `/auto-reply on [message]` switches the out of office reply on from now, `/auto-reply off` switches it off, `/auto-reply status` shows it.';

export class SlashCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const [action = '', ...words] = context.getArguments();
        const sender = context.getSender();
        const notify = (text: string) => sendNotifyMessage(undefined, modify, context.getRoom(), sender, text);
        const previous = await readOutOfOffice(sender.id, read, sender.utcOffset);
        const status = (settings: IOutOfOffice) => `Out of office reply: ${statusText(settings, Date.now())}\n>${settings.message}`;

        switch (action.toLowerCase()) {
            case '': {
                const triggerId = context.getTriggerId();
                if (!triggerId) {
                    return notify(USAGE);
                }
                return modify.getUiController().openSurfaceView(await outOfOfficeModalFor(sender, read), { triggerId }, sender);
            }
            case 'on':
            case 'enable': {
                // On from now: a first day set earlier would keep it waiting, a last day still to come stays
                const endOver = previous.end !== undefined && endInstant(previous)! <= Date.now();
                const next: IOutOfOffice = { ...previous, enabled: true, start: undefined, end: endOver ? undefined : previous.end, message: words.join(' ') || previous.message };
                await saveOutOfOffice(sender.id, previous, next, persis);
                return notify(status(next));
            }
            case 'off':
            case 'disable': {
                const next: IOutOfOffice = { ...previous, enabled: false };
                await saveOutOfOffice(sender.id, previous, next, persis);
                return notify(status(next));
            }
            case 'status':
                return notify(status(previous));
            case 'remove-user':
                return notify('People not to reply to are now set in the settings (`/auto-reply`), or with "Don\'t reply to" in the hint you get when writing while away.');
            default:
                return notify(USAGE);
        }
    }
}
