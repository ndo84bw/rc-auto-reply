#!/usr/bin/env python3
"""Regression suite for the rc-auto-reply app against a local Rocket.Chat.

Prep: docker compose up, dev/bootstrap.sh, dev/allow-private-apps.sh,
npm run deploy, users alice/bob exist (carol and a throwaway user are created on demand).

Usage: python3 dev/test-suite.py

Another server: RC_URL, RC_ADMIN_USER, RC_ADMIN_PASS, RC_USERS_PASS (see dev/rcapi.py),
RC_ALICE, RC_BOB, RC_CAROL (usernames), MONGO_CONTAINER, MONGO_DB.

The suite talks to the REST API like a client and reads and writes the app's
records in MongoDB directly, to check what was stored and to set up states
(a period, 2.1 settings) that would otherwise need the dialog.
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rcapi import api, login, ADMIN_USER  # noqa: E402

APP_ID = "821cd5c6-1fb5-4d9e-8e88-e6176463efb6"
BOT = "auto-reply.bot"
ALICE = os.environ.get("RC_ALICE", "alice")
BOB = os.environ.get("RC_BOB", "bob")
CAROL = os.environ.get("RC_CAROL", "carol")
MONGO_CONTAINER = os.environ.get("MONGO_CONTAINER", "rc-auto-reply-mongo-1")
MONGO_DB = os.environ.get("MONGO_DB", "rocketchat")
# Long enough for the app to answer, short enough for a quick run
SETTLE = float(os.environ.get("SETTLE_SECONDS", "3"))

IDS = {}
FAILURES = []
PASSES = []


def check(name, ok, detail=''):
    (PASSES if ok else FAILURES).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}: {name}" + (f" - {detail}" if detail != '' and not ok else ''))


def retry(call, what):
    """The REST API rate limit drops calls silently; retry until they succeed."""
    for _ in range(40):
        r = call()
        if r.get("success"):
            return r
        time.sleep(3)
    raise SystemExit(f"{what} kept failing: {r}")


def cmd(user, room, params):
    retry(lambda: api("POST", "/api/v1/commands.run", {"roomId": room, "command": "auto-reply", "params": params}, user), f"/auto-reply {params}")


def say(user, room, text):
    retry(lambda: api("POST", "/api/v1/chat.postMessage", {"roomId": room, "text": text}, user), "chat.postMessage")
    time.sleep(SETTLE)


def mongo(js):
    return subprocess.check_output(
        ["docker", "exec", MONGO_CONTAINER, "mongosh", "--quiet", "--eval", js, MONGO_DB],
    ).decode().strip()


def replies(room, since_ms, alias=None):
    """Messages of the app bot in a room since a moment, optionally only under one alias."""
    query = {"rid": room, "u.username": BOT, "ts": {"$gt": f"__DATE__{since_ms}"}}
    if alias:
        query["alias"] = alias
    js = json.dumps(query).replace(f'"__DATE__{since_ms}"', f"new Date({since_ms})")
    return int(mongo(f"print(db.rocketchat_message.countDocuments({js}))") or 0)


def now_ms():
    return int(time.time() * 1000)


def settings_of(username):
    out = mongo(
        f"const p = db.rocketchat_apps_persistence.findOne({{appId: '{APP_ID}', associations: {{$size: 1}}, "
        f"'associations.model': 'user', 'associations.id': '{IDS[username]}'}}); print(p ? JSON.stringify(p.data) : 'null')"
    )
    return json.loads(out) if out and out != 'null' else None


def records_of(username):
    return int(mongo(f"print(db.rocketchat_apps_persistence.countDocuments({{appId: '{APP_ID}', 'associations.id': '{IDS[username]}'}}))"))


def write_settings(username, data, extra_records=()):
    """Replaces everything the app stored under the user, e.g. with 2.1 settings and tracking records."""
    uid = IDS[username]
    docs = [{"associations": [{"model": "user", "id": uid}], "data": data}]
    docs += [{"associations": [{"model": "user", "id": uid}, {"model": "room", "id": room}], "data": record} for room, record in extra_records]
    js = "".join(
        f"db.rocketchat_apps_persistence.insertOne({{_id: new ObjectId().toString(), appId: '{APP_ID}', _updatedAt: new Date(), "
        f"associations: {json.dumps(d['associations'])}, data: {json.dumps(d['data'])}}});"
        for d in docs
    )
    mongo(
        f"db.rocketchat_apps_persistence.deleteMany({{appId: '{APP_ID}', 'associations.id': {{$in: ['{uid}', 'last-replies:{uid}', 'hint-shown:{uid}']}}}});" + js
    )


def v3(enabled=True, **overrides):
    return {"version": 3, "enabled": enabled, "utcOffset": 0, "message": f"{ALICE}-away", "replyFrequency": "On Every Message",
            "replyToMentions": False, "excludedUserIds": [], **overrides}


def day(offset_days):
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + offset_days * 86400))


def ensure_user(username):
    r = api("GET", f"/api/v1/users.info?username={username}", None, ADMIN_USER)
    if not r.get("success"):
        api("POST", "/api/v1/users.create", {
            "username": username, "email": f"{username}@example.com", "name": username.capitalize(),
            "password": os.environ.get("RC_USERS_PASS", "Devpassword123!"), "roles": ["user"], "verified": True,
        }, ADMIN_USER)
        r = api("GET", f"/api/v1/users.info?username={username}", None, ADMIN_USER)
    # New users would otherwise need an e-mail code to log in
    mongo(f"db.users.updateOne({{username: '{username}'}}, {{$set: {{'services.email2fa.enabled': false}}}})")
    return r["user"]["_id"]


def main():
    login(ADMIN_USER)
    for u in (ALICE, BOB, CAROL):
        IDS[u] = ensure_user(u)
        login(u)
    dm = api("POST", "/api/v1/im.create", {"username": BOB}, ALICE)["room"]["_id"]
    carol_dm = api("POST", "/api/v1/im.create", {"username": CAROL}, ALICE)["room"]["_id"]
    alias = api("GET", f"/api/v1/users.info?username={ALICE}", None, ADMIN_USER)["user"].get("name") or ALICE
    print(f"DM {ALICE}<->{BOB}: {dm}")
    write_settings(BOB, v3(enabled=False))

    print("\n[1] Replies on every message, nothing while off")
    write_settings(ALICE, v3())
    t = now_ms()
    say(BOB, dm, "hello 1")
    say(BOB, dm, "hello 2")
    check("replies to every message", replies(dm, t, alias) == 2, replies(dm, t, alias))
    cmd(ALICE, dm, "off")
    t = now_ms()
    say(BOB, dm, "hello 3")
    check("no reply while off", replies(dm, t) == 0)
    cmd(ALICE, dm, "on Back on Monday")
    s = settings_of(ALICE)
    check("'on' switches on with the new message", s and s.get("enabled") is True and s.get("message") == "Back on Monday", s)
    t = now_ms()
    say(BOB, dm, "hello 4")
    check("replies again after 'on'", replies(dm, t, alias) == 1)

    print("\n[2] Reply frequency")
    cmd(ALICE, dm, "frequency once")
    # 'once' counts per absence and Bob got a reply in this one already, so start a new one
    cmd(ALICE, dm, "off")
    cmd(ALICE, dm, "on")
    t = now_ms()
    say(BOB, dm, "once 1")
    say(BOB, dm, "once 2")
    check("'once' replies a single time", replies(dm, t, alias) == 1, replies(dm, t, alias))
    cmd(ALICE, dm, "frequency hour")
    t = now_ms()
    say(BOB, dm, "hour 1")
    check("'hour' does not reply within the hour", replies(dm, t, alias) == 0, "last reply was seconds ago")
    mongo(f"db.rocketchat_apps_persistence.updateOne({{appId: '{APP_ID}', 'associations.id': 'last-replies:{IDS[ALICE]}'}}, "
          f"{{$set: {{'data.replies.$[].lastMessage': new Date(Date.now() - 2 * 3600 * 1000).toISOString()}}}})")
    t = now_ms()
    say(BOB, dm, "hour 2")
    check("'hour' replies again after an hour", replies(dm, t, alias) == 1)
    cmd(ALICE, dm, "off")
    cmd(ALICE, dm, "on")
    t = now_ms()
    say(BOB, dm, "after re-enable")
    check("switching on again starts a new absence: replies right away", replies(dm, t, alias) == 1)
    cmd(ALICE, dm, "frequency every")

    print("\n[3] Period")
    write_settings(ALICE, v3(start={"date": day(1)}))
    t = now_ms()
    say(BOB, dm, "before the period")
    check("no reply before the first day", replies(dm, t) == 0)
    write_settings(ALICE, v3(start={"date": day(-2)}, end={"date": day(-1)}))
    t = now_ms()
    say(BOB, dm, "after the period")
    check("no reply after the last day", replies(dm, t) == 0)
    write_settings(ALICE, v3(start={"date": day(-1)}, end={"date": day(0)}))
    t = now_ms()
    say(BOB, dm, "during the period")
    check("reply on the last day, which counts as a whole day", replies(dm, t, alias) == 1)
    cmd(ALICE, dm, "on")
    s = settings_of(ALICE)
    check("'on' keeps a last day still to come and drops the first day", s and "start" not in s and s.get("end", {}).get("date") == day(0), s)

    print("\n[4] People never to reply to")
    write_settings(ALICE, v3())
    cmd(ALICE, dm, f"remove-user @{BOB}")
    check("remove-user stores the id", IDS[BOB] in (settings_of(ALICE) or {}).get("excludedUserIds", []))
    t = now_ms()
    say(BOB, dm, "excluded")
    check("no reply to an excluded person", replies(dm, t) == 0)
    cmd(ALICE, dm, f"include-user {BOB}")
    t = now_ms()
    say(BOB, dm, "included again")
    check("reply again after include-user", replies(dm, t, alias) == 1)
    temp = f"artemp{int(time.time()) % 100000}"
    temp_id = ensure_user(temp)
    cmd(ALICE, dm, f"remove-user {temp}")
    api("POST", "/api/v1/users.delete", {"userId": temp_id, "confirmRelinquish": True}, ADMIN_USER)
    t = now_ms()
    say(BOB, dm, "after deleting an excluded user")
    check("replies still work after an excluded user was deleted (issue #9)", replies(dm, t, alias) == 1)
    cmd(ALICE, dm, "mentions off")
    check("settings stay readable and saveable after that", (settings_of(ALICE) or {}).get("version") == 3)

    print("\n[5] Mentions in channels")
    channel = api("POST", "/api/v1/channels.create", {"name": f"ar-test-{int(time.time())}", "members": [ALICE, BOB]}, ADMIN_USER)["channel"]["_id"]
    write_settings(ALICE, v3(replyToMentions=False))
    t = now_ms()
    say(BOB, channel, f"@{ALICE} are you there?")
    check("no reply to a mention while mentions are off", replies(channel, t) == 0)
    cmd(ALICE, dm, "mentions on")
    cmd(ALICE, dm, "frequency once")
    t = now_ms()
    say(BOB, channel, f"@{ALICE} are you there?")
    say(BOB, channel, f"@{ALICE} still?")
    check("one reply to mentions with frequency 'once'", replies(channel, t, alias) == 1, replies(channel, t, alias))
    t = now_ms()
    say(BOB, channel, "no mention here, and @all")
    check("no reply without a mention, @all does not count", replies(channel, t) == 0)

    print("\n[6] Two people away do not answer each other's replies")
    write_settings(ALICE, v3())
    write_settings(BOB, v3(message=f"{BOB}-away"))
    t = now_ms()
    say(BOB, dm, "both away")
    time.sleep(SETTLE * 2)
    check("exactly one reply, no ping-pong", replies(dm, t) == 1, replies(dm, t))
    write_settings(BOB, v3(enabled=False))

    print("\n[7] Settings of 2.1 are taken over")
    users_21 = [None, {"id": IDS[CAROL], "username": CAROL}]
    write_settings(ALICE, {"on": True, "message": "from 2.1", "users": users_21, "schedulers": [], "frequency": "cooldown", "cooldownHours": 12,
                           "replyToMentions": True, "timezoneOffsetMinutes": 120, "enabledAt": now_ms()},
                   extra_records=[(dm, {"lastReplyAt": now_ms(), "lastNotifyAt": now_ms()}), (carol_dm, {"lastReplyAt": 0})])
    t = now_ms()
    say(BOB, dm, "after the update")
    check("2.1 settings with tracking records still reply", replies(dm, t, alias) == 1, "the tracking records must not be read as settings")
    cmd(ALICE, dm, "status")
    cmd(ALICE, dm, "frequency day")
    s = settings_of(ALICE) or {}
    check("saved in the version 3 format", s.get("version") == 3 and s.get("message") == "from 2.1", s)
    check("mentions and exclusions carried over, null dropped", s.get("replyToMentions") is True and s.get("excludedUserIds") == [IDS[CAROL]], s)
    check("2.1 tracking records are gone after a save", records_of(ALICE) == 1, records_of(ALICE))
    write_settings(ALICE, {"on": True, "message": "with schedule", "users": [], "frequency": "every",
                           "schedulers": [{"id": "s", "type": "Daily", "settings": {"enableTime": "11:00", "disableTime": "12:00"}}]})
    t = now_ms()
    say(BOB, dm, "scheduled user")
    check("whoever had 2.1 schedulers starts switched off", replies(dm, t) == 0)

    write_settings(ALICE, v3(enabled=False))
    print(f"\n{len(PASSES)} passed, {len(FAILURES)} failed")
    if FAILURES:
        for name in FAILURES:
            print(f"  FAIL: {name}")
        sys.exit(1)


if __name__ == "__main__":
    main()
