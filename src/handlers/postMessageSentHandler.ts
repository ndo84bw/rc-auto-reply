import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { claimHint, hintBlocks } from '../hint/hint';
import { isActive } from '../outOfOffice/period';
import { mentionedUsernames, tooSoon } from '../outOfOffice/replies';
import { IOutOfOffice } from '../outOfOffice/types';
import { readOutOfOffice } from '../store';
import { getLanguage, isRoomEncrypted, sendMessage, sendNotifyMessage } from '../utils/helpers';
import { IReplyFrequency } from '../utils/IAutoReplySettings';
import { readLastReplies, saveLastReply } from '../utils/lastReplies';

export class PostMessageSentHandler {
    constructor(
        private readonly app: AutoReplyApp,
        private readonly message: IMessage,
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly persistence: IPersistence,
        private readonly modify: IModify,
    ) {}

    public async execute(): Promise<void> {
        const room = this.message.room;
        // Apps can't send encrypted content, so never reply in E2EE rooms (issue #8). Encrypted
        // messages carry type 'e2e', older engine typings lack IMessage.type.
        if (!room || isRoomEncrypted(room) || (this.message as { type?: string }).type === 'e2e') {
            return;
        }
        const botUser = await this.read.getUserReader().getAppUser(this.app.getID());
        // Never react to the app's own messages, which also stops two away users replying to each other
        if (!botUser || this.message.sender.id === botUser.id || this.message.sender.username === botUser.username) {
            return;
        }

        if (room.type === RoomType.DIRECT_MESSAGE) {
            await this.handleDirectMessage();
        } else if (room.type === RoomType.CHANNEL || room.type === RoomType.PRIVATE_GROUP) {
            await this.handleMentions(botUser);
        }
    }

    private async handleDirectMessage(): Promise<void> {
        const now = Date.now();
        const me = this.message.sender;
        const otherUser = await this.getOtherUserInRoom();
        if (!otherUser) return;

        const mySettings = await readOutOfOffice(me.id, this.read, me.utcOffset);
        if (isActive(mySettings, now)) {
            await this.remindMe(mySettings, otherUser, now);
        }

        const otherSettings = await readOutOfOffice(otherUser.id, this.read, otherUser.utcOffset);
        if (isActive(otherSettings, now)) {
            await this.replyFor(otherUser, otherSettings, now);
        }
    }

    /** Replies for everyone @mentioned who is away and wants replies to mentions */
    private async handleMentions(botUser: IUser): Promise<void> {
        const now = Date.now();
        for (const username of mentionedUsernames(this.message.text ?? '')) {
            let user: IUser | undefined;
            try {
                user = (await this.read.getUserReader().getByUsername(username)) ?? undefined;
            } catch {
                continue;
            }
            if (!user || user.id === this.message.sender.id || user.id === botUser.id) {
                continue;
            }
            const settings = await readOutOfOffice(user.id, this.read, user.utcOffset);
            if (settings.replyToMentions && isActive(settings, now)) {
                await this.replyFor(user, settings, now);
            }
        }
    }

    private async getOtherUserInRoom(): Promise<IUser | undefined> {
        const userIds = this.message.room.userIds ?? [];
        if (userIds.length !== 2) return;

        const otherUserId = userIds.find((u) => u !== this.message.sender.id);
        if (!otherUserId) return;

        // The other user may have been deleted since the room was created
        return (await this.read.getUserReader().getById(otherUserId)) ?? undefined;
    }

    /** The hint for an away user who writes themselves, at most once a day per conversation partner */
    private async remindMe(mySettings: IOutOfOffice, otherUser: IUser, now: number): Promise<void> {
        const me = this.message.sender;
        if (mySettings.excludedUserIds.includes(otherUser.id)) return;
        if (!(await claimHint(me, otherUser.id, now, this.read, this.persistence))) return;

        const blocks = hintBlocks(mySettings, otherUser, now, await getLanguage(this.read, me));
        await sendNotifyMessage(this.app, this.modify, this.message.room, me, undefined, blocks);
    }

    /** The reply of the away user to the sender, as often as the away user allows */
    private async replyFor(awayUser: IUser, settings: IOutOfOffice, now: number): Promise<void> {
        const sender = this.message.sender;
        if (settings.excludedUserIds.includes(sender.id)) return;

        if (settings.replyFrequency !== String(IReplyFrequency.OnEveryMessage)) {
            const replies = await readLastReplies(awayUser.id, this.read);
            const lastReply = replies.find((reply) => reply.userId === sender.id)?.lastMessage ?? null;
            if (tooSoon(settings.replyFrequency, lastReply, now)) return;
        }

        await sendMessage(this.app, this.modify, this.message.room, awayUser, settings.message, this.message.threadId);
        await saveLastReply(awayUser.id, sender.id, this.read, this.persistence);
    }
}
