pragma Singleton
import QtQuick 2.4

QtObject {
    id: fixture
    property var payload: ({})
    property var subscribers: []
    property var reports: []
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
