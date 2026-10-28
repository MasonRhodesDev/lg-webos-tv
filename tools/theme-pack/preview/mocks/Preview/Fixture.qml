pragma Singleton
import QtQuick 2.4

// The Look service's answer for this preview run, given on the command line as JSON.
QtObject {
    id: fixture
    property var payload: ({})
    property var subscribers: []
    // What the UI reported to the Look service this run, for tests: [{ kind, text }].
    property var reports: []
    // The other Look service calls the UI made (setLook, openSettings, ...), for tests: [{ method, params }].
    property var commands: []
    function command(method, params) {
        var p = JSON.parse(params || "{}");
        if (method === "/report") reports.push(p);
        else commands.push({ "method": method, "params": p });
    }
    function subscribe(s) { subscribers.push(s); }
    function load(json) {
        payload = JSON.parse(json);
        for (var i = 0; i < subscribers.length; i++) subscribers[i].response("/getLook", JSON.stringify(payload));
    }
}
