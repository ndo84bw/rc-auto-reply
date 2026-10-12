import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IUIKitResponse, UIKitBlockInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { outOfOfficeModalFor } from '../dialog/outOfOfficeDialog';
import { AppLanguage, translate } from '../i18n/translations';
import { formatDayTime, todayOnUserClock } from '../outOfOffice/period';
import { IOutOfOffice } from '../outOfOffice/types';
import { readOutOfOffice, saveOutOfOffice } from '../store';
import { getLanguage, sendNotifyMessage } from '../utils/helpers';
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

export function hintBlocks(settings: IOutOfOffice, partner: IUser, now: number, lang: AppLanguage): Array<object> {
    const t = (key: string, params?: { [k: string]: string }) => translate(key, lang, params);
    const text = settings.end ? t('hint_on_until', { end: formatDayTime(settings.end, now, settings.utcOffset, lang) }) : t('hint_on_open');
    return [
        { type: 'section', appId: APP_ID, blockId: 'out-of-office-hint-text', text: { type: 'mrkdwn', text } },
        {
            type: 'actions',
            appId: APP_ID,
            blockId: 'out-of-office-hint',
            elements: [
                button(t('hint_turn_off'), TURN_OFF, undefined, 'danger'),
                button(t('hint_dont_reply', { name: partner.name || partner.username }), DONT_REPLY, partner.id),
                button(t('hint_open_settings'), OPEN_SETTINGS),
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
        return responder.openModalViewResponse(await outOfOfficeModalFor(user, read));
    }

    const lang = await getLanguage(read, user);
    const previous = await readOutOfOffice(user.id, read, user.utcOffset);
    if (actionId === TURN_OFF) {
        await saveOutOfOffice(user.id, previous, { ...previous, enabled: false }, persis, read);
        await confirm(translate('hint_turned_off', lang));
    }
    if (actionId === DONT_REPLY && value) {
        const partner = await read.getUserReader().getById(value);
        if (partner) {
            await saveOutOfOffice(user.id, previous, { ...previous, excludedUserIds: [...new Set([...previous.excludedUserIds, partner.id])] }, persis, read);
            await confirm(translate('hint_excluded', lang, { username: partner.username }));
        }
    }
    return responder.successResponse();
}
