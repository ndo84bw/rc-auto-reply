# Rocket.Chat Auto-Reply App

A [Rocket.Chat](https://rocket.chat) app that answers incoming **direct messages** (and **@mentions** in channels, if you like) with your away message while you are out of office, so people writing to you know you won't answer soon.

## Features

- **Out of office period** from a first to a last day, each with an optional full hour. Without a time the whole day counts. Leave the first day empty to start right away and the last day empty to keep it on until you switch it off.
- Replies only while switched on **and** inside the period, so a period can be prepared ahead and stays saved when switched off.
- **Reply frequency**: on every message, once per person, or at most once per hour, day, week or month. It counts per absence: switching on again or setting a new period lets everyone get a reply again.
- **People never to reply to**.
- **Mention replies** (opt-in): also reply when you are @mentioned in channels and private groups.
- Replies in the **thread** the message was written in.
- **E2EE-safe**: in end-to-end encrypted rooms the app stays silent (see [limitations](#limitations)).
- **English, German, Russian and Lithuanian**, following your own language setting, otherwise the server language.

## How to use it

Open your user menu (your avatar) and choose **Out of Office**. The dialog shows the current status, for example "Active until Fri, Oct 17, 18:00" or "Off. When enabled: Mon, Oct 13 - Fri, Oct 17".

- **Out of office reply** switches it on or off.
- **First day** and **Last day** set the period.
- **From** and **Until** narrow the first and last day to a full hour. "Start of day (00:00)" and "End of day (24:00)" mean the whole day. Times are in the UTC offset of your profile.
- **Message**, **Reply** (how often), **Mentions in channels** and **Never reply to** set what is sent and to whom.

**Save** checks the input and shows "✅ Saved" with the new status, the dialog stays open.

When you write a direct message while your out of office reply is active, you get a hint at most once a day per conversation, with buttons to turn it off, not to reply to that person, or to open the settings.

### Slash command

```
/auto-reply                               open the dialog
/auto-reply on [message]                  switch on from now, optionally with a new message
/auto-reply off                           switch off, the period stays saved
/auto-reply status                        show the status
/auto-reply remove-user <username|id>     never reply to someone
/auto-reply include-user <username|id>    reply to them again
/auto-reply frequency every|once|hour|day|week|month
/auto-reply mentions on|off               also reply to @mentions in channels
```

`enable`, `disable` and `list` from 2.1 still work. `timezone` is gone: times follow the UTC offset of your profile.

## Limitations

- **End-to-end encrypted (E2EE) rooms**: apps run server-side and cannot read or produce encrypted content. To avoid leaking plaintext into encrypted conversations, Auto-Reply does not reply in E2EE rooms at all (issue #8).
- Only direct messages between two people get a reply, plus @mentions in channels and private groups if switched on.
- Rocket.Chat only knows the UTC offset of your last login, not your time zone. A switch to or from daylight saving time before the period moves its start and end by an hour.

## Upgrading

From **2.1**: the message, the people never to reply to, the reply frequency and the mention setting are kept. A cooldown becomes the next longer fixed step (12 hours become once per day). The schedulers are gone: whoever had one starts switched off, because the schedulers switched on and off behind the user's back and the last state they left says nothing about now. The scheduler job of 2.1 is removed when the app starts.

From **2.0**: an enabled auto-reply stays on without a period, the message and the excluded users are kept.

Going back to 2.x is not supported: 2.x does not understand the new settings and treats every out of office reply as switched off.

## Local development

A full local environment (Rocket.Chat 8.9 + MongoDB 7) is included:

```bash
docker compose up -d          # start Rocket.Chat on http://localhost:3000
./dev/bootstrap.sh            # first-run: creates dev admin + test users (alice/bob/carol),
                              # disables email 2FA, enables E2EE, applies dev license patches
npm install
npm test                      # unit tests of the period, form, migration and reply logic
npm run deploy                # build & deploy the app (rc-apps)
python3 dev/test-suite.py     # REST regression suite (users: alice/bob/carol, password Devpassword123!)
```

Notes:

- The setup wizard cannot be completed headless/offline; log in once as `devadmin` (password `Devpassword123!`) if the browser redirects you to it and step through it, or keep using the API.
- `dev/allow-private-apps.sh` patches the local container so private apps can be enabled/updated without an enterprise license: Rocket.Chat 8.x Community otherwise blocks locally deployed apps (`privateApps` license limit is 0). **Local development only**; real users install the published marketplace build.
- `admin` is a reserved username in Rocket.Chat, the dev admin is `devadmin`.
- `dev/test-suite.py` also runs against another server, see the environment variables at its top.
- The sources compile against apps-engine 1.36 (TypeScript 4.0) as well, which the marketplace build uses.

## Contributing

You'll need the Rocket.Chat Apps dev environment; see https://developer.rocket.chat/apps-engine/getting-started. Adjust [.rcappsconfig](.rcappsconfig) to your server, then:

```bash
npm install
npm run deploy
```
