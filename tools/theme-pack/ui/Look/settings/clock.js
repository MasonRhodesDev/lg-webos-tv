.pragma library

var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
              "November", "December"];
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var FIRST_YEAR = 2019;
var LAST_YEAR = 2037;

function two(n) { return n < 10 ? "0" + n : String(n); }

function parts(utc, offset) {
    var d = new Date((utc + offset * 60) * 1000);
    return { "year": d.getUTCFullYear(), "month": d.getUTCMonth() + 1, "day": d.getUTCDate(), "hour": d.getUTCHours(),
             "minute": d.getUTCMinutes(), "second": d.getUTCSeconds(), "weekday": d.getUTCDay() };
}

function utcOf(p, offset) {
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0) / 1000 - offset * 60;
}

function daysIn(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

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

function timeLabel(p, h24) {
    if (h24) return two(p.hour) + ":" + two(p.minute);
    return (p.hour % 12 || 12) + ":" + two(p.minute) + (p.hour < 12 ? " AM" : " PM");
}

function dateLabel(p) {
    return DAYS[p.weekday] + ", " + MONTHS[p.month - 1].slice(0, 3) + " " + p.day + ", " + p.year;
}
