import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { toOutOfOffice } from './outOfOffice/migrate';
import { IOutOfOffice } from './outOfOffice/types';
import { resetLastRepliesForNewAbsence } from './utils/lastReplies';

const association = (userId: string) => new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);

/**
 * 2.1 also stored a tracking record per conversation under the user (plus the room), so reading by
 * the user returns those too. The settings are the record that is not one of them.
 */
const isSettings = (record: any): boolean =>
    !!record && typeof record === 'object' && ('version' in record || 'on' in record || 'message' in record || 'users' in record);

async function readRecords(userId: string, read: IRead): Promise<Array<object>> {
    return read.getPersistenceReader().readByAssociation(association(userId));
}

/** utcOffset: the user's current offset, only used for settings saved before version 3 */
export async function readOutOfOffice(userId: string, read: IRead, utcOffset: number | undefined): Promise<IOutOfOffice> {
    const records = await readRecords(userId, read);
    return toOutOfOffice(records.find(isSettings), utcOffset ?? 0);
}

export async function saveOutOfOffice(userId: string, previous: IOutOfOffice, next: IOutOfOffice, persis: IPersistence, read: IRead): Promise<void> {
    await resetLastRepliesForNewAbsence(userId, previous, next, persis);
    // Unset start/end must not be stored as null
    const record = JSON.parse(JSON.stringify(next));
    // With 2.1 tracking records left, an update could hit one of them instead of the settings
    if ((await readRecords(userId, read)).length > 1) {
        await persis.removeByAssociation(association(userId));
    }
    await persis.updateByAssociation(association(userId), record, true);
}
