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
import { UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { IUIKitResponse, UIKitActionButtonInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { OPEN_ACTION, VIEW_ID_PREFIX } from './src/dialog/outOfOfficeModal';
import { outOfOfficeModalFor, submitOutOfOfficeDialog } from './src/dialog/outOfOfficeDialog';
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
    * Extends the Rocket.Chat configuration with the user menu entry and the slash command
    * @param configuration The Rocket.Chat configuration to extend
    * @param environmentRead The environment reader
    */
    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {

        configuration.ui.registerButton({
            actionId: OPEN_ACTION,
            labelI18n: 'out-of-office-menu',
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });
        await configuration.slashCommands.provideSlashCommand(new SlashCommand());

    }

    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const { actionId, user } = context.getInteractionData();
        if (actionId === OPEN_ACTION) {
            return context.getInteractionResponder().openModalViewResponse(await outOfOfficeModalFor(user, read) as any);
        }
        return context.getInteractionResponder().successResponse();
    }

    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        if (context.getInteractionData().view.id.startsWith(VIEW_ID_PREFIX)) {
            return submitOutOfOfficeDialog(context, read, persistence);
        }
        return context.getInteractionResponder().successResponse();
    }
}
