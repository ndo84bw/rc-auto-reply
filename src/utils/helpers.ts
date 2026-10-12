import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { AppLanguage, normalizeLanguage } from '../i18n/translations';

/**
 * Sends a message as the app bot, displayed under the away user's name.
 */
export async function sendMessage(app: AutoReplyApp, modify: IModify, room: IRoom, user: IUser, message: string, threadId?: string): Promise<void> {
    const botUser = await app.getAccessors().reader.getUserReader().getAppUser(app.getID());
    if (!botUser) {
        app.getLogger().warn('App user not found; cannot send auto-reply');
        return;
    }

    const messageStructure = modify.getCreator().startMessage()
        .setGroupable(false)
        .setSender(botUser)
        .setUsernameAlias(user.name || user.username)
        .setRoom(room);
    if (message && message.length > 0) {
        messageStructure.setText(message);
    }
    if (threadId) {
        messageStructure.setThreadId(threadId);
    }
    try {
        await modify.getCreator().finish(messageStructure);
    } catch (error) {
        app.getLogger().error({ msg: 'Failed to send auto-reply', error: String(error) });
    }
}

/**
 * Notifies a user in a room (visible only to them). Without an app, the user is the sender.
 */
export async function sendNotifyMessage(app: AutoReplyApp | undefined, modify: IModify, room: IRoom, user: IUser, message?: string, blocks?: Array<object>): Promise<void> {
    let botUser = user;
    if (app) {
        botUser = (await app.getAccessors().reader.getUserReader().getAppUser(app.getID())) ?? user;
    }

    const notifyMsgStructure = modify.getCreator().startMessage()
        .setUsernameAlias(botUser.name || botUser.username || 'auto-reply')
        .setEmojiAvatar('bell')
        .setSender(botUser)
        .setRoom(room);

    if (message && message.length > 0) {
        notifyMsgStructure.setText(message);
    }
    if (blocks !== undefined) {
        // Plain block objects: the block builder of older engines lacks some of the elements used
        notifyMsgStructure.setBlocks(blocks as any);
    }

    try {
        await modify.getNotifier().notifyUser(user, notifyMsgStructure.getMessage());
    } catch (error) {
        if (app) app.getLogger().error({ msg: 'Failed to notify user', error: String(error) });
    }
}

/**
 * E2EE rooms encrypt message content client-side; apps cannot read or send
 * encrypted content, so the app must stay silent there (issue #8). The room
 * document carries `encrypted: true` at runtime even though the apps-engine
 * type does not declare it.
 */
export function isRoomEncrypted(room: IRoom): boolean {
    return (room as unknown as { encrypted?: boolean }).encrypted === true;
}

/**
 * The language of the user's own preference, otherwise of the server's Language setting. 2.1 read
 * the setting from the app's own settings, where it does not exist, and so always answered in English.
 */
export async function getLanguage(read: IRead, user?: IUser): Promise<AppLanguage> {
    const preferred = user?.settings?.preferences?.language;
    if (preferred) {
        return normalizeLanguage(preferred);
    }
    try {
        const language = await read.getEnvironmentReader().getServerSettings().getValueById('Language');
        return normalizeLanguage(language);
    } catch {
        return 'en';
    }
}
