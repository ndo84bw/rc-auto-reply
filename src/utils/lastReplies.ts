import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { isActive } from '../outOfOffice/period';
import { IOutOfOffice } from '../outOfOffice/types';
import { IUsersLastReply } from './IAutoReplySettings';

// Kept apart from the settings, so a reply never overwrites settings changed at the same time.
// Deliberately not associated with the user: readOutOfOffice reads everything associated with the user.
const association = (userId: string) => new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `last-replies:${userId}`);

export async function readLastReplies(userId: string, read: IRead): Promise<IUsersLastReply[]> {
    const [record] = await read.getPersistenceReader().readByAssociation(association(userId));
    return (record as { replies?: IUsersLastReply[] } | undefined)?.replies ?? [];
}

export async function saveLastReply(userId: string, senderId: string, read: IRead, persis: IPersistence): Promise<void> {
    const replies = (await readLastReplies(userId, read)).filter((reply) => reply.userId !== senderId);
    replies.push({ userId: senderId, lastMessage: new Date() });
    await persis.updateByAssociation(association(userId), { replies }, true);
}

/**
 * The reply frequency counts per absence: switching on or setting another period lets everyone get
 * a reply again, but changing a period that is running and keeps running continues the absence.
 */
export async function resetLastRepliesForNewAbsence(userId: string, previous: IOutOfOffice, next: IOutOfOffice, persis: IPersistence): Promise<void> {
    const now = Date.now();
    const samePeriod = JSON.stringify([previous.start, previous.end]) === JSON.stringify([next.start, next.end]);
    const continuing = isActive(previous, now) && isActive(next, now);
    if (next.enabled && !continuing && (!previous.enabled || !samePeriod)) {
        await persis.removeByAssociation(association(userId));
    }
}
