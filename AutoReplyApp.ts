import {
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IHttp,
    IPersistence,
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';

import { outOfOfficeModalFor, submitOutOfOfficeDialog } from './src/dialog/outOfOfficeDialog';
import { OPEN_ACTION, VIEW_ID_PREFIX } from './src/dialog/outOfOfficeModal';
import { PostMessageSentHandler } from './src/handlers/postMessageSentHandler';
import { HINT_ACTION_PREFIX, handleHintAction } from './src/hint/hint';
import { SlashCommand } from './src/slashCommand';
import { isRoomEncrypted } from './src/utils/helpers';

/** The recurring job of 2.1's schedulers; nothing handles it anymore */
const LEGACY_SCHEDULER_JOB = 'auto-reply-scheduler-tick';

export class AutoReplyApp extends App implements IPostMessageSent {

    public async checkPostMessageSent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        const room = message.room;
        if (!room || isRoomEncrypted(room)) {
            return false;
        }
        if (room.type === RoomType.DIRECT_MESSAGE) {
            return true;
        }
        if (room.type === RoomType.CHANNEL || room.type === RoomType.PRIVATE_GROUP) {
            // Only of interest when someone is @mentioned
            return /(?:^|\s)@[a-z0-9._-]+/i.test(message.text ?? '');
        }
        return false;
    }

    /**
     * Replies for the recipient of a direct message or for @mentioned users who are away,
     * and reminds a user who writes while away.
     */
    public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
        try {
            await new PostMessageSentHandler(this, message, read, http, persistence, modify).execute();
        } catch (error) {
            this.getLogger().error({ msg: 'executePostMessageSent failed', error: String(error) });
        }
    }

    /**
     * Registers the user menu entry and the slash command
     */
    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        configuration.ui.registerButton({
            actionId: OPEN_ACTION,
            labelI18n: 'out-of-office-menu',
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });
        await configuration.slashCommands.provideSlashCommand(new SlashCommand());
    }

    /** After an update from 2.1 its scheduler job would otherwise log a missing processor every 5 minutes */
    public async onEnable(environment: IEnvironmentRead, configurationModify: IConfigurationModify): Promise<boolean> {
        try {
            await configurationModify.scheduler.cancelJob(LEGACY_SCHEDULER_JOB);
        } catch (error) {
            this.getLogger().debug({ msg: 'no legacy scheduler job to cancel', error: String(error) });
        }
        return true;
    }

    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const { actionId, user } = context.getInteractionData();
        if (actionId === OPEN_ACTION) {
            return context.getInteractionResponder().openModalViewResponse(await outOfOfficeModalFor(user, read));
        }
        return context.getInteractionResponder().successResponse();
    }

    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        if (context.getInteractionData().view.id.startsWith(VIEW_ID_PREFIX)) {
            return submitOutOfOfficeDialog(context, read, persistence);
        }
        return context.getInteractionResponder().successResponse();
    }

    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        if (context.getInteractionData().actionId.startsWith(HINT_ACTION_PREFIX)) {
            return handleHintAction(this, context, read, persistence, modify);
        }
        return context.getInteractionResponder().successResponse();
    }
}
