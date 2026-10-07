import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { toOutOfOffice } from './outOfOffice/migrate';
import { IOutOfOffice } from './outOfOffice/types';
import { resetLastRepliesForNewAbsence } from './utils/lastReplies';

const association = (userId: string) => new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);

/** utcOffset: the user's current offset, only used for settings saved before version 3 */
export async function readOutOfOffice(userId: string, read: IRead, utcOffset: number | undefined): Promise<IOutOfOffice> {
    const [raw] = await read.getPersistenceReader().readByAssociation(association(userId));
    return toOutOfOffice(raw, utcOffset ?? 0);
}

export async function saveOutOfOffice(userId: string, previous: IOutOfOffice, next: IOutOfOffice, persis: IPersistence): Promise<void> {
    await resetLastRepliesForNewAbsence(userId, previous, next, persis);
    // Unset start/end must not be stored as null
    const record = JSON.parse(JSON.stringify(next));
    await persis.updateByAssociation(association(userId), record, true);
}
