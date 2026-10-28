import QtQuick 2.4

// LG's toast view as a part sees it (objectName toastView, a direct child of the compositor root): a model of at
// most one toast, close(), and under its stack a Toast delegate per row that emits activated() on a click. A state
// fills the model as LG's notification service would.
Item {
    id: scene
    property string part: "Toast.qml"
    property rect frame: Qt.rect(960, 600, 960, 480)
    property Item lg: toastView

    Item {
        id: toastView
        objectName: "toastView"
        anchors.fill: parent
        z: 10006
        property ListModel model: ListModel { id: toasts }
        function close() { toasts.clear(); }
        Item {
            id: toastStack
            Repeater {
                model: toasts
                Item {
                    property bool generalToast: model.type === "standard"
                    signal activated()
                    onActivated: toasts.clear()
                }
            }
        }
    }

    function show(t) {
        toasts.clear();
        toasts.append({ "message": t.message, "iconPath": "", "iconUrl": "", "type": t.type, "title": t.title || "", "opacity": 1,
                        "sourceId": "com.webos.app.inputcommon", "action": t.action || {}, "isSysReq": false,
                        "onlyToast": true, "schedule": {}, "timestamp": 0 });
    }

    readonly property var launch: ({ "serviceURI": "luna://com.webos.applicationManager/", "serviceMethod": "launch", "launchParams": {} })

    states: [
        State { name: "standard"; StateChangeScript { script: scene.show({ message: "HDMI 2 is connected.", type: "standard" }) } },
        State {
            name: "standard-title"
            StateChangeScript { script: scene.show({ title: "Signal found on HDMI 3", message: "A device on HDMI 3 just turned on.", type: "standard", action: scene.launch }) }
        },
        State {
            name: "standard-link"
            StateChangeScript { script: scene.show({ message: "A software update is ready. Install it now to keep your TV up to date and secure.", type: "standard", action: scene.launch }) }
        },
        State { name: "compact"; StateChangeScript { script: scene.show({ message: "Input: HDMI 2", type: "compact" }) } },
        State { name: "empty"; StateChangeScript { script: toasts.clear() } }
    ]
}
