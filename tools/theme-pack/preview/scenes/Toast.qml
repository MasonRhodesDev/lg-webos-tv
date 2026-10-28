import QtQuick 2.4

// LG's toast view as a part sees it (objectName toastView, a direct child of the compositor root): a model of at
// most one toast, and close(). A state fills the model as LG's notification service would.
Item {
    id: scene
    property string part: "Toast.qml"
    property rect frame: Qt.rect(1000, 0, 920, 260)
    property Item lg: toastView

    Item {
        id: toastView
        objectName: "toastView"
        anchors.fill: parent
        z: 10006
        property ListModel model: ListModel { id: toasts }
        function close() { toasts.clear(); }
    }

    function show(t) {
        toasts.clear();
        toasts.append({ "message": t.message, "iconPath": "", "iconUrl": "", "type": t.type, "title": "", "opacity": 1,
                        "sourceId": "com.webos.app.inputcommon", "action": t.action || {}, "isSysReq": false,
                        "onlyToast": true, "schedule": {}, "timestamp": 0 });
    }

    states: [
        State { name: "standard"; StateChangeScript { script: scene.show({ message: "HDMI 2 is connected.", type: "standard" }) } },
        State {
            name: "standard-link"
            StateChangeScript { script: scene.show({ message: "A software update is ready. Install it now to keep your TV up to date and secure.", type: "standard",
                                                     action: { "serviceURI": "luna://com.webos.applicationManager/", "serviceMethod": "launch", "launchParams": {} } }) }
        },
        State { name: "compact"; StateChangeScript { script: scene.show({ message: "Input: HDMI 2", type: "compact" }) } },
        State { name: "empty"; StateChangeScript { script: toasts.clear() } }
    ]
}
