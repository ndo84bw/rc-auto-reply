# Rocket.Chat Auto-reply App


## Features

- Automatically replies to direct messages while you are away, with your own message.
- One out of office period from a first to a last day, each with an optional time. Without a time the whole day counts.
- Replies only while switched on and inside the period, so a period can be prepared ahead and stays saved when switched off.
- Reply on every message, once per person, or at most once per hour, day, week or month.
- People who should never get the reply.
- Replies in the thread the message was written in.


## How to use it

Open your user menu (your avatar) and choose **Out of Office**. The dialog shows the current status, for example "Active until Fri, Oct 17" or "Off. When enabled: Mon, Oct 13 - Fri, Oct 17".

- **Enabled** switches the out of office reply on or off.
- **First day** and **Last day** set the period. Leave the first day empty to start right away and the last day empty to keep it on until you switch it off. Times are optional and in your current UTC offset.
- **Message**, **Reply** (how often) and **Never reply to** set what is sent and to whom.

**Save** checks the input and shows the saved status.

When you write a direct message while your out of office reply is active, you get a hint once a day per conversation, with buttons to turn it off, not to reply to that person, or to open the settings.

The slash command is a shortcut:

| Command | |
|---|---|
| `/auto-reply` | opens the dialog |
| `/auto-reply on [message]` | switches on from now, optionally with a new message |
| `/auto-reply off` | switches off, the period stays saved |
| `/auto-reply status` | shows the status |

### Limitations

- Only direct messages between two people get a reply.
- Encrypted (E2EE) direct messages get no reply: Rocket.Chat does not pass them to apps as regular messages, and the app could not read them.
- Rocket.Chat only knows the UTC offset of your last login, not your time zone. A switch to or from daylight saving time before the period moves its start and end by an hour.

### Upgrading from 2.x

Settings saved by 2.x keep working: an enabled auto-reply stays on without a period, and the message and the excluded users are kept. The scheduler of the development versions never switched anything and is dropped.

Going back to 2.x is not supported: 2.x does not understand the new settings and treats every out of office reply as switched off.


## Contributing

You'll need to set up the Rocket.Chat Apps dev environment, please see https://developer.rocket.chat/apps-engine/getting-started

To install the using the command line, you have to turn on the setting `Enable development mode` on the Rocket.Chat server under `Admin > General > Apps`.

Change the values from [.rcappsconfig](.rcappsconfig) to reflect your dev environment.

Then you can clone this repo and then:

```bash
npm install
npm test
rc-apps deploy
```

`npm test` checks the period and migration logic in `src/outOfOffice`, which does not depend on Rocket.Chat.

Follow the instructions and when you're done, the app will be installed on your Rocket.Chat server.
