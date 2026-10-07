import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IUIKitResponse, UIKitBlockInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { outOfOfficeModalFor } from '../dialog/outOfOfficeDialog';
import { formatDayTime, todayOnUserClock } from '../outOfOffice/period';
import { IOutOfOffice } from '../outOfOffice/types';
import { readOutOfOffice, saveOutOfOffice } from '../store';
import { sendNotifyMessage } from '../utils/helpers';
import { APP_ID } from '../utils/ids';

export const HINT_ACTION_PREFIX = 'out-of-office-hint-';
const TURN_OFF = `${HINT_ACTION_PREFIX}turn-off`;
const DONT_REPLY = `${HINT_ACTION_PREFIX}dont-reply`;
const OPEN_SETTINGS = `${HINT_ACTION_PREFIX}open-settings`;

// Deliberately not associated with the user: readOutOfOffice reads everything associated with the user.
const association = (userId: string) => new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `hint-shown:${userId}`);

/** At most one hint per day and conversation partner, on the user's clock */
export async function claimHint(user: IUser, partnerId: string, now: number, read: IRead, persis: IPersistence): Promise<boolean> {
    const [record] = await read.getPersistenceReader().readByAssociation(association(user.id));
    const shown: Record<string, string> = (record as { shown?: Record<string, string> } | undefined)?.shown ?? {};
    const today = todayOnUserClock(now, user.utcOffset);
    if (shown[partnerId] === today) {
        return false;
    }
    // Days before today are no longer needed
    const kept: Record<string, string> = { [partnerId]: today };
    for (const [id, day] of Object.entries(shown)) {
        if (day === today) {
            kept[id] = day;
        }
    }
    await persis.updateByAssociation(association(user.id), { shown: kept }, true);
    return true;
}

const button = (text: string, actionId: string, value?: string, style?: 'danger') => ({
    type: 'button',
    appId: APP_ID,
    blockId: 'out-of-office-hint',
    actionId,
    text: { type: 'plain_text', text, emoji: true },
    ...(value ? { value } : {}),
    ...(style ? { style } : {}),
});

export function hintBlocks(settings: IOutOfOffice, partner: IUser, now: number): Array<object> {
    const until = settings.end ? `until ${formatDayTime(settings.end, now, settings.utcOffset)}` : 'no end date';
    return [
        { type: 'section', appId: APP_ID, blockId: 'out-of-office-hint-text', text: { type: 'mrkdwn', text: `Your out of office reply is on (${until}).` } },
        {
            type: 'actions',
            appId: APP_ID,
            blockId: 'out-of-office-hint',
            elements: [
                button('Turn off', TURN_OFF, undefined, 'danger'),
                button(`Don't reply to ${partner.name || partner.username}`, DONT_REPLY, partner.id),
                button('Open settings', OPEN_SETTINGS),
            ],
        },
    ];
}

export async function handleHintAction(app: AutoReplyApp, context: UIKitBlockInteractionContext, read: IRead, persis: IPersistence, modify: IModify): Promise<IUIKitResponse> {
    const { actionId, user, room, value } = context.getInteractionData();
    const responder = context.getInteractionResponder();
    const confirm = async (text: string) => {
        if (room) {
            await sendNotifyMessage(app, modify, room, user, text);
        }
    };

    if (actionId === OPEN_SETTINGS) {
        return responder.openModalViewResponse(await outOfOfficeModalFor(user, read) as any);
    }

    const previous = await readOutOfOffice(user.id, read, user.utcOffset);
    if (actionId === TURN_OFF) {
        await saveOutOfOffice(user.id, previous, { ...previous, enabled: false }, persis);
        await confirm('Your out of office reply is off.');
    }
    if (actionId === DONT_REPLY && value) {
        const partner = await read.getUserReader().getById(value);
        if (partner) {
            await saveOutOfOffice(user.id, previous, { ...previous, excludedUserIds: [...new Set([...previous.excludedUserIds, partner.id])] }, persis);
            await confirm(`Your out of office reply won't answer @${partner.username} anymore. You can change this in the settings.`);
        }
    }
    return responder.successResponse();
}
