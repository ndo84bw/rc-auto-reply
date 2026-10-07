export enum IReplyFrequency {
    OnEveryMessage = 'On Every Message',
    Once = 'Once',
    OncePerHour = 'Once Per Hour',
    OncePerDay = 'Once Per Day',
    OncePerWeek = 'Once Per Week',
    OncePerMonth = 'Once Per Month',
}
export interface IUsersLastReply {
    userId: string,
    lastMessage: Date,
}
