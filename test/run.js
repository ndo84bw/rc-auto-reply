// Tests for the pure out of office logic. No test framework: transpiles src/outOfOffice with the
// TypeScript compiler from devDependencies and checks it with node:assert. Run: npm test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const src = path.join(__dirname, '..', 'src', 'outOfOffice');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'out-of-office-'));
for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join(src, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    });
    fs.writeFileSync(path.join(out, file.replace(/\.ts$/, '.js')), outputText);
}
const period = require(path.join(out, 'period.js'));
const { toOutOfOffice } = require(path.join(out, 'migrate.js'));

let failed = 0;
const test = (name, fn) => {
    try {
        fn();
        console.log(`ok   ${name}`);
    } catch (error) {
        failed++;
        console.log(`FAIL ${name}\n     ${error.message.split('\n').join('\n     ')}`);
    }
};
const at = (iso) => Date.parse(iso);
const settings = (overrides) => ({
    version: 3, enabled: true, utcOffset: 2, message: 'away', replyFrequency: 'On Every Message', excludedUserIds: [], ...overrides,
});

test('whole days start at midnight and end after the last day on the user clock', () => {
    const s = settings({ start: { date: '2026-10-13' }, end: { date: '2026-10-17' } });
    assert.equal(period.startInstant(s), at('2026-10-12T22:00:00Z'));
    assert.equal(period.endInstant(s), at('2026-10-17T22:00:00Z'));
});

test('times are taken as given on the user clock', () => {
    const s = settings({ start: { date: '2026-10-13', time: '08:00' }, end: { date: '2026-10-17', time: '18:30' } });
    assert.equal(period.startInstant(s), at('2026-10-13T06:00:00Z'));
    assert.equal(period.endInstant(s), at('2026-10-17T16:30:00Z'));
});

for (const [offset, expected] of [[5.5, '2026-10-12T18:30:00Z'], [-3.5, '2026-10-13T03:30:00Z'], [0, '2026-10-13T00:00:00Z'], [-10, '2026-10-13T10:00:00Z'], [5.75, '2026-10-12T18:15:00Z']]) {
    test(`start with offset ${offset}`, () => {
        assert.equal(period.startInstant(settings({ utcOffset: offset, start: { date: '2026-10-13' } })), at(expected));
    });
}

test('status follows the boundaries exactly', () => {
    const s = settings({ start: { date: '2026-10-13' }, end: { date: '2026-10-17' } });
    assert.equal(period.getStatus(s, at('2026-10-12T21:59:59Z')), 'scheduled');
    assert.equal(period.getStatus(s, at('2026-10-12T22:00:00Z')), 'active');
    assert.equal(period.getStatus(s, at('2026-10-17T21:59:59Z')), 'active');
    assert.equal(period.getStatus(s, at('2026-10-17T22:00:00Z')), 'ended');
    assert.equal(period.isActive(s, at('2026-10-15T12:00:00Z')), true);
});

test('switched off never applies, whatever the period', () => {
    const s = settings({ enabled: false, start: { date: '2026-10-13' } });
    assert.equal(period.getStatus(s, at('2026-10-15T12:00:00Z')), 'off');
    assert.equal(period.isActive(s, at('2026-10-15T12:00:00Z')), false);
});

test('no start means from now on, no end means until switched off', () => {
    assert.equal(period.getStatus(settings({}), at('2030-01-01T00:00:00Z')), 'active');
    assert.equal(period.getStatus(settings({ end: { date: '2026-10-17' } }), at('2026-10-01T00:00:00Z')), 'active');
    assert.equal(period.getStatus(settings({ start: { date: '2026-10-13' } }), at('2099-01-01T00:00:00Z')), 'active');
});

test('status texts', () => {
    const now = at('2026-10-15T10:00:00Z');
    assert.equal(period.statusText(settings({ enabled: false }), now), 'Off');
    assert.equal(period.statusText(settings({ enabled: false, start: { date: '2026-10-20' }, end: { date: '2026-10-24' } }), now), 'Off. When enabled: Tue, Oct 20 - Sat, Oct 24');
    assert.equal(period.statusText(settings({ enabled: false, end: { date: '2026-10-24' } }), now), 'Off. When enabled: until Sat, Oct 24');
    assert.equal(period.statusText(settings({ enabled: false, start: { date: '2026-10-01' }, end: { date: '2026-10-05' } }), now), 'Off', 'a period that is over is not offered');
    assert.equal(period.statusText(settings({}), now), 'Active, no end date');
    assert.equal(period.statusText(settings({ end: { date: '2026-10-17' } }), now), 'Active until Sat, Oct 17');
    assert.equal(period.statusText(settings({ end: { date: '2026-10-17', time: '18:00' } }), now), 'Active until Sat, Oct 17, 6:00 PM');
    assert.equal(period.statusText(settings({ start: { date: '2026-10-20' }, end: { date: '2026-10-24' } }), now), 'Scheduled from Tue, Oct 20 until Sat, Oct 24');
    assert.equal(period.statusText(settings({ start: { date: '2026-10-20', time: '12:00' } }), now), 'Scheduled from Tue, Oct 20, 12:00 PM, no end date');
    assert.equal(period.statusText(settings({ end: { date: '2026-10-14' } }), now), 'Ended on Wed, Oct 14');
    assert.equal(period.statusText(settings({ start: { date: '2027-01-04' } }), now), 'Scheduled from Mon, Jan 4, 2027, no end date');
});

test('today on the user clock', () => {
    assert.equal(period.todayOnUserClock(at('2026-10-12T23:30:00Z'), 2), '2026-10-13');
    assert.equal(period.todayOnUserClock(at('2026-10-12T23:30:00Z'), -3), '2026-10-12');
});

test('offset labels', () => {
    assert.deepEqual([2, 5.5, -3.5, 5.75, 0, undefined].map(period.utcOffsetLabel), ['UTC+2', 'UTC+5:30', 'UTC-3:30', 'UTC+5:45', 'UTC+0', 'UTC+0']);
});

test('date and time validation', () => {
    assert.equal(period.isValidDate('2026-10-13'), true);
    assert.equal(period.isValidDate('2026-13-40'), false);
    assert.equal(period.isValidDate('13.10.2026'), false);
    assert.equal(period.isValidTime('08:00'), true);
    assert.equal(period.isValidTime('24:00'), false);
    assert.equal(period.isValidTime('8:00'), false);
});

test('validation of the settings', () => {
    const now = at('2026-10-15T10:00:00Z');
    assert.deepEqual(period.validateOutOfOffice(settings({ start: { date: '2026-10-13' }, end: { date: '2026-10-17' } }), now), {});
    assert.deepEqual(Object.keys(period.validateOutOfOffice(settings({ message: '  ' }), now)), ['message']);
    assert.equal(period.validateOutOfOffice(settings({ start: { date: '2026-10-20' }, end: { date: '2026-10-19' } }), now).end, 'The period ends before it starts.');
    assert.equal(period.validateOutOfOffice(settings({ start: { date: '2026-10-20', time: '10:00' }, end: { date: '2026-10-20', time: '10:00' } }), now).end, 'The period ends before it starts.');
    assert.deepEqual(period.validateOutOfOffice(settings({ start: { date: '2026-10-20' }, end: { date: '2026-10-20' } }), now), {}, 'a single whole day is fine');
    assert.equal(period.validateOutOfOffice(settings({ end: { date: '2026-10-14' } }), now).end, 'This period has already ended.');
    assert.deepEqual(period.validateOutOfOffice(settings({ enabled: false, end: { date: '2026-10-14' } }), now), {}, 'an old period may be kept while switched off');
});

test('migrates 2.x settings and drops null excluded users', () => {
    const s = toOutOfOffice({ on: true, message: 'Bin weg', users: [null, { id: 'a', name: 'A' }, { name: 'no id' }, { id: 'a' }], schedulers: [] }, 2);
    assert.deepEqual(s, { version: 3, enabled: true, utcOffset: 2, message: 'Bin weg', replyFrequency: 'On Every Message', excludedUserIds: ['a'] });
});

test('migrates the development state and drops its scheduler and last replies', () => {
    const s = toOutOfOffice({ on: false, message: '', users: [], schedulers: { enable: { time: new Date() } }, usersLastReply: [{ userId: 'x' }], replyFrequency: 'Once Per Day' }, -4);
    assert.deepEqual(s, { version: 3, enabled: false, utcOffset: -4, message: 'Hey, I received your message and will get back to you as soon as possible.', replyFrequency: 'Once Per Day', excludedUserIds: [] });
});

test('reads its own format and cleans it', () => {
    const raw = { version: 3, enabled: true, start: { date: '2026-10-13', time: 'bad' }, end: { date: 'bad' }, utcOffset: 5.5, message: 'm', replyFrequency: 'Once', excludedUserIds: ['a', null, 'b', 'a'] };
    assert.deepEqual(toOutOfOffice(raw, 2), { version: 3, enabled: true, start: { date: '2026-10-13' }, end: undefined, utcOffset: 5.5, message: 'm', replyFrequency: 'Once', excludedUserIds: ['a', 'b'] });
});

test('nothing saved yet', () => {
    assert.deepEqual(toOutOfOffice(undefined, 1), { version: 3, enabled: false, utcOffset: 1, message: 'Hey, I received your message and will get back to you as soon as possible.', replyFrequency: 'On Every Message', excludedUserIds: [] });
});


fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
