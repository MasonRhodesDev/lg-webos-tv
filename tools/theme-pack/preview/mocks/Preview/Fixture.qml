pragma Singleton
import QtQuick 2.4

// The Look service's answer for this preview run, given on the command line as JSON.
QtObject {
    id: fixture
    property var payload: ({})
    property var subscribers: []
    function subscribe(s) { subscribers.push(s); }
    function load(json) {
        payload = JSON.parse(json);
        for (var i = 0; i < subscribers.length; i++) subscribers[i].response("/getLook", JSON.stringify(payload));
    }
}
