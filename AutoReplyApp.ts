import {
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    IPersistence,
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

import { SlashCommand } from './src/slashCommand';
import { PostMessageSentHandler } from './src/handlers/postMessageSentHandler';
export class AutoReplyApp extends App implements IPostMessageSent {

    public async checkPostMessageSent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        // ToDo:
        // auto-respond to rooms beside direct messages
        // when user is tagged by someone
        return message.room.type === RoomType.DIRECT_MESSAGE;
    }

    /**
    * Executes after a message is sent and checks if it's a match for auto-reply.
    * @param {IMessage} message - Rocket.Chat's instance
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    */
    public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
        const handle = new PostMessageSentHandler(this, message, read, http, persistence, modify)
        return await handle.execute()
    }
    /**
    * Extends the Rocket.Chat configuration with the slash command
    * @param configuration The Rocket.Chat configuration to extend
    * @param environmentRead The environment reader
    */
    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {

        await configuration.slashCommands.provideSlashCommand(new SlashCommand());

    }
}
