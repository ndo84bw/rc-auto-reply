import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IMessage } from "@rocket.chat/apps-engine/definition/messages";
import { AutoReplyApp } from "../../AutoReplyApp";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { sendMessage, sendNotifyMessage } from "../utils/helpers";
import { readOutOfOffice } from "../store";
import { isActive } from "../outOfOffice/period";
import { IOutOfOffice } from "../outOfOffice/types";
import { readLastReplies, saveLastReply } from "../utils/lastReplies";
import { claimHint, hintBlocks } from "../hint/hint";
import { IReplyFrequency } from "../utils/IAutoReplySettings";

export class PostMessageSentHandler{
    constructor(
        private readonly app: AutoReplyApp,
        private readonly message: IMessage, 
        private readonly read: IRead, 
        private readonly http: IHttp, 
        private readonly persistence: IPersistence, 
        private readonly modify: IModify
    ){}

    public async execute(): Promise<void> {
        const botUser = await this.getBotUser();
        if (this.isSentByBot(botUser)) return;
    
        const now = Date.now();
        const me = this.message.sender;
        const otherUser = await this.getOtherUserInRoom();
        if (!otherUser) return;
    
        const MyAutoReplySettings = await readOutOfOffice(me.id, this.read, me.utcOffset);
        if (isActive(MyAutoReplySettings, now)) {
            await this.handleMyAutoReply(MyAutoReplySettings, otherUser, now);
        }
    
        const OtherAutoReplySettings = await readOutOfOffice(otherUser.id, this.read, otherUser.utcOffset);
        if (isActive(OtherAutoReplySettings, now)) {
            await this.handleOtherUserAutoReply(OtherAutoReplySettings, otherUser, me);
        }
    }
    
    private async getBotUser(): Promise<IUser> {
        return (await this.app.getAccessors().reader.getUserReader().getAppUser(this.app.getID())) as IUser;
    }
    
    private isSentByBot(botUser: IUser): boolean {
        return this.message.sender.username === botUser.username;
    }
    
    private async getOtherUserInRoom(): Promise<IUser | undefined> {
        const otherUserIds = this.message.room.userIds ?? [];
        if (otherUserIds == undefined || otherUserIds.length !== 2) return;
    
        const otherUserId = otherUserIds.find((u) => u !== this.message.sender.id);
        if (!otherUserId) return;
    
        return await this.read.getUserReader().getById(otherUserId);
    }
    
    private async handleMyAutoReply(MyAutoReplySettings: IOutOfOffice, otherUser: IUser, now: number): Promise<void> {
        if (MyAutoReplySettings.excludedUserIds.includes(otherUser.id)) return;
        if (!(await claimHint(this.message.sender, otherUser.id, now, this.read, this.persistence))) return;

        const blocks = hintBlocks(MyAutoReplySettings, otherUser, now);
        await sendNotifyMessage(this.app, this.modify, this.message.room, this.message.sender, undefined, undefined, blocks as any);
    }
    
    private async handleOtherUserAutoReply(OtherAutoReplySettings: IOutOfOffice, otherUser: IUser, me: IUser): Promise<void> {
        if (OtherAutoReplySettings.excludedUserIds.includes(me.id)) return;
    
        const OtherreplyFrequency = OtherAutoReplySettings.replyFrequency;
        if (OtherreplyFrequency !== String(IReplyFrequency.OnEveryMessage)) {
            const OtherLastReply = await this.getOtherUserLastReply(otherUser.id, me.id);
            if (this.shouldSkipAutoReply(OtherreplyFrequency, OtherLastReply)) return;
        }
    
        const threadId = this.message.threadId
        await sendMessage(this.app, this.modify, this.message.room, otherUser, OtherAutoReplySettings.message, threadId);
        await saveLastReply(otherUser.id, me.id, this.read, this.persistence);
    }
    
    private async getOtherUserLastReply(otherUserId: string, meId: string): Promise<Date | null> {
        const replies = await readLastReplies(otherUserId, this.read);
        return replies.find(userLastReply => userLastReply.userId === meId)?.lastMessage || null;
    }
    
    private shouldSkipAutoReply(OtherreplyFrequency: string, OtherLastReply: Date | null): boolean {
        if (OtherLastReply == null) return false;
    
        const currentTime = new Date();
        const lastReplyTime = new Date(OtherLastReply);
        const timeDifference = currentTime.getTime() - lastReplyTime.getTime();
    
        switch (OtherreplyFrequency) {
            case String(IReplyFrequency.Once):
                return true;
            case String(IReplyFrequency.OncePerHour):
                return timeDifference < 1000 * 60 * 60;
            case String(IReplyFrequency.OncePerDay):
                return timeDifference < 1000 * 60 * 60 * 24;
            case String(IReplyFrequency.OncePerWeek):
                return timeDifference < 1000 * 60 * 60 * 24 * 7;
            case String(IReplyFrequency.OncePerMonth):
                return timeDifference < 1000 * 60 * 60 * 24 * 30;
            default:
                return false;
        }
    }
    
    
}