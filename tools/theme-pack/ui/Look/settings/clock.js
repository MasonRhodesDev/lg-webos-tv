.pragma library
// The TV's clock as our Settings shows and sets it. A time is seconds since 1970 (UTC), as the TV's
// time/getSystemTime answers it and time/setSystemTime takes it, and the TV's zone is minutes ahead of UTC (its
// `offset`; behind is negative). The parts are worked out here from those two numbers, never from the zone of the
// process that runs this, which need not be the TV's (the preview's is the desk's).

var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
              "November", "December"];
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The years the Year row steps through. The TV's clock starts each boot in 2019 (it has no battery clock), and its
// 32-bit time ends in January 2038.
var FIRST_YEAR = 2019;
var LAST_YEAR = 2037;

function two(n) { return n < 10 ? "0" + n : String(n); }

// A time in a zone as { year, month (1-12), day, hour (0-23), minute, second, weekday (0 is Sunday) }.
function parts(utc, offset) {
    var d = new Date((utc + offset * 60) * 1000);
    return { "year": d.getUTCFullYear(), "month": d.getUTCMonth() + 1, "day": d.getUTCDate(), "hour": d.getUTCHours(),
             "minute": d.getUTCMinutes(), "second": d.getUTCSeconds(), "weekday": d.getUTCDay() };
}

// The time at which a zone's clocks show those parts.
function utcOf(p, offset) {
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0) / 1000 - offset * 60;
}

function daysIn(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

// The parts with one of them changed. The day stays inside its month (31 March to February is the 28th or 29th), and
// a new minute starts at its first second, as a clock set by hand does.
function withPart(p, part, value) {
    var out = { "year": p.year, "month": p.month, "day": p.day, "hour": p.hour, "minute": p.minute, "second": p.second };
    out[part] = value;
    if (part === "minute") out.second = 0;
    out.day = Math.min(out.day, daysIn(out.year, out.month));
    return out;
}

function hourLabel(h, h24) {
    if (h24) return two(h);
    return (h % 12 || 12) + (h < 12 ? " AM" : " PM");
}

// What one part can be set to, in order: [{ value, label }].
function choices(part, p, h24) {
    var out = [], i;
    if (part === "year") {
        for (i = Math.min(FIRST_YEAR, p.year); i <= Math.max(LAST_YEAR, p.year); i++) out.push({ "value": i, "label": String(i) });
    } else if (part === "month") {
        for (i = 1; i <= 12; i++) out.push({ "value": i, "label": MONTHS[i - 1] });
    } else if (part === "day") {
        for (i = 1; i <= daysIn(p.year, p.month); i++) out.push({ "value": i, "label": String(i) });
    } else if (part === "hour") {
        for (i = 0; i < 24; i++) out.push({ "value": i, "label": hourLabel(i, h24) });
    } else if (part === "minute") {
        for (i = 0; i < 60; i++) out.push({ "value": i, "label": two(i) });
    }
    return out;
}

// "12:07 AM", or "00:07" on a 24-hour clock.
function timeLabel(p, h24) {
    if (h24) return two(p.hour) + ":" + two(p.minute);
    return (p.hour % 12 || 12) + ":" + two(p.minute) + (p.hour < 12 ? " AM" : " PM");
}

// "Wed, Nov 11, 2026".
function dateLabel(p) {
    return DAYS[p.weekday] + ", " + MONTHS[p.month - 1].slice(0, 3) + " " + p.day + ", " + p.year;
}
