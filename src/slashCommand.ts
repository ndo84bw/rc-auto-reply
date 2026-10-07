import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

import { statusText } from './outOfOffice/period';
import { IOutOfOffice } from './outOfOffice/types';
import { readOutOfOffice, saveOutOfOffice } from './store';
import { sendNotifyMessage } from './utils/helpers';

export class SlashCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const notify = (text: string) => sendNotifyMessage(undefined, modify, context.getRoom(), sender, text);
        const previous = await readOutOfOffice(sender.id, read, sender.utcOffset);
        const save = (next: IOutOfOffice) => saveOutOfOffice(sender.id, previous, next, persis);
        const status = (settings: IOutOfOffice) => `${statusText(settings, Date.now())}\n>${settings.message}`;

        switch ((args[0] ?? '').toLowerCase()) {
            case 'enable': {
                const next: IOutOfOffice = { ...previous, enabled: true, start: undefined, message: args.slice(1).join(' ') || previous.message };
                await save(next);
                return notify('`auto reply` is enabled: ' + status(next));
            }
            case 'disable': {
                const next: IOutOfOffice = { ...previous, enabled: false };
                await save(next);
                return notify('`auto reply` is disabled.');
            }
            case 'status':
                return notify('`auto reply`: ' + status(previous));
            case 'remove-user': {
                const user = args[1] ? await read.getUserReader().getById(args[1]) : undefined;
                if (!user) {
                    return notify('usage: `/auto-reply remove-user UserId`');
                }
                const next: IOutOfOffice = { ...previous, excludedUserIds: [...new Set([...previous.excludedUserIds, user.id])] };
                await save(next);
                return notify('`auto reply` is disabled for: @' + user.username);
            }
            default:
                return notify('Only `enable`, `disable`, `remove-user` and `status` are accepted options for the first argument.');
        }
    }
}
