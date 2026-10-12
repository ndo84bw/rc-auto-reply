import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IUIKitResponse, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { actionIdOf, FormField, FormState, generationOf, readForm } from '../outOfOffice/form';
import { readOutOfOffice, saveOutOfOffice } from '../store';
import { getLanguage } from '../utils/helpers';
import { createOutOfOfficeModal, IExcludedUser, replyFrequencies } from './outOfOfficeModal';

async function excludedUsersOf(userIds: Array<string>, read: IRead): Promise<Array<IExcludedUser>> {
    const users = await Promise.all(userIds.map((id) => read.getUserReader().getById(id)));
    return users
        .filter((user): user is IUser => !!user)
        .map((user) => ({ id: user.id, label: user.name && user.name !== user.username ? `${user.name} (@${user.username})` : `@${user.username}` }));
}

async function idsOf(usernames: Array<string>, read: IRead): Promise<Array<string>> {
    const users = await Promise.all(usernames.map((username) => read.getUserReader().getByUsername(username)));
    return users.filter((user): user is IUser => !!user).map((user) => user.id);
}

/** The dialog with the user's saved settings */
export async function outOfOfficeModalFor(user: IUser, read: IRead): Promise<IUIKitModalViewParam> {
    const settings = await readOutOfOffice(user.id, read, user.utcOffset);
    return createOutOfOfficeModal({
        settings,
        now: Date.now(),
        utcOffset: user.utcOffset,
        excludedUsers: await excludedUsersOf(settings.excludedUserIds, read),
        lang: await getLanguage(read, user),
    });
}

export async function submitOutOfOfficeDialog(context: UIKitViewSubmitInteractionContext, read: IRead, persis: IPersistence): Promise<IUIKitResponse> {
    const { user, view } = context.getInteractionData();
    const responder = context.getInteractionResponder();
    const generation = generationOf(view.submit?.value);
    const previous = await readOutOfOffice(user.id, read, user.utcOffset);
    const now = Date.now();
    const lang = await getLanguage(read, user);
    const { settings, addUsernames, errors } = readForm((view.state ?? {}) as FormState, generation, previous, user.utcOffset ?? 0, now, replyFrequencies(), lang);

    if (Object.keys(errors).length > 0) {
        const byActionId: Record<string, string> = {};
        for (const [field, error] of Object.entries(errors)) {
            byActionId[actionIdOf(field as FormField, generation)] = error as string;
        }
        return responder.viewErrorResponse({ viewId: view.id, errors: byActionId });
    }

    const next = { ...settings, excludedUserIds: [...new Set([...settings.excludedUserIds, ...(await idsOf(addUsernames, read))])] };
    await saveOutOfOffice(user.id, previous, next, persis, read);
    return responder.updateModalViewResponse(createOutOfOfficeModal({
        settings: next,
        now,
        utcOffset: user.utcOffset,
        excludedUsers: await excludedUsersOf(next.excludedUserIds, read),
        saved: true,
        viewId: view.id,
        generation: generation + 1,
        lang,
    }));
}
