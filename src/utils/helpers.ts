import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IAutoReplySettings, IReplyFrequency } from './IAutoReplySettings';



export async function getAutoReplySettings(userId: string, read: IRead): Promise<IAutoReplySettings> {
    const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
    const autoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(assocMe);
    const autoReplySettings = autoReplySettingsAssoc[0] as IAutoReplySettings | undefined;
    return {
        on: autoReplySettings?.on ?? false,
        message: autoReplySettings?.message || 'Hey, I received your message and will get back to you as soon as possible.',
        users: autoReplySettings?.users ?? [],
        // 2.x stored an unused list here
        schedulers: Array.isArray(autoReplySettings?.schedulers) ? undefined : autoReplySettings?.schedulers,
        replyFrequency: autoReplySettings?.replyFrequency ?? String(IReplyFrequency.OnEveryMessage),
    };
}

/** Must match the id in app.json, UI elements carry it to route interactions back to this app */
export const APP_ID = '821cd5c6-1fb5-4d9e-8e88-e6176463efb6';

/**
 * Copied from https://github.com/sampaiodiego/rocket.chat.app-poll/blob/4188fb6ba2b68b03d1b992735c46ee5f04fc18c8/src/lib/uuid.ts 
 */
export function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
/**
 * Sends a message using bot
 *
 * @param app
 * @param modify
 * @param room Where to send message to
 * @param user who sending the message
 * @param message What to send
 * @param attachments (optional) Message attachments (such as action buttons)
 */
export async function sendMessage(app: AutoReplyApp, modify: IModify, room: IRoom, user: IUser, message: string, threadId?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
    const botUser = (await app.getAccessors()
        .reader.getUserReader()
        .getAppUser(app.getID())) as IUser;

    const messageStructure = modify.getCreator().startMessage()
        .setGroupable(false)
        .setSender(botUser)
        .setUsernameAlias(user.name)
        // .setEmojiAvatar(app.kokoEmojiAvatar)
        .setRoom(room);
    if (message && message.length > 0) {
        messageStructure.setText(message);
    }
    if (attachments && attachments.length > 0) {
        messageStructure.setAttachments(attachments);
    }
    if (blocks !== undefined) {
        messageStructure.setBlocks(blocks);
    }
    if (threadId) {
        messageStructure.setThreadId(threadId)
    }
    try {
        await modify.getCreator().finish(messageStructure);
    } catch (error) {
        app.getLogger().log(error);
    }
}
/**
 * Notifies user using bot
 *
 * @param app
 * @param modify
 * @param user Who to notify
 * @param message What to send
 * @param attachments (optional) Message attachments (such as action buttons)
 */
export async function sendNotifyMessage(app: AutoReplyApp | undefined, modify: IModify, room: IRoom, user: IUser, message?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
    let botUser = user;
    if (app) {
        botUser = (await app.getAccessors()
            .reader.getUserReader()
            .getAppUser(app.getID())) as IUser;
    }

    const notifyMsgStructure = modify.getCreator().startMessage()
        .setUsernameAlias(botUser.name).setEmojiAvatar('bell')
        .setSender(botUser)
        .setRoom(room)

    if (message && message.length > 0) {
        notifyMsgStructure.setText(message);
    }

    if (attachments && attachments.length > 0) {
        notifyMsgStructure.setAttachments(attachments);
    }

    if (blocks !== undefined) {
        notifyMsgStructure.setBlocks(blocks);
    }

    try {
        await modify.getNotifier().notifyUser(user, notifyMsgStructure.getMessage());
    } catch (error) {
        if (app) app.getLogger().log(error);
    }
}
