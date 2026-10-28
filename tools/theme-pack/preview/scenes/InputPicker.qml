import QtQuick 2.4

// LG's input picker as a part sees it: InputPickerMainView (mainRibbon, inputPickerListModel) inside the
// `windowContent` FocusScope that holds `state` and `props`. The model is what LG builds: the Home Dashboard tile,
// then Live TV and the HDMI inputs (connected first), then USB, with `hasCategory` on the first of each kind.
Item {
    id: scene
    property string part: "InputPicker.qml"
    property rect frame: Qt.rect(0, 600, 1920, 480)
    property Item lg: view

    Item {
        id: windowContent
        objectName: "windowContent"
        width: 1920
        height: 1080
        state: "opened"
        states: State { name: "opened" }
        property QtObject props: QtObject { property string forgroundAppValue: "com.webos.app.hdmi2" }
        property QtObject strings: QtObject {
            property string input: "Inputs"
            property string usb: "USB"
            property string contentShare: "Content Share"
        }

        Item {
            id: view
            objectName: "InputPickerMainView"
            anchors.fill: parent
            property Item mainRibbon: Item {
                id: ribbon
                property int currentIndex: 3
                property var model: inputs
                readonly property int count: inputs.count
            }
            property ListModel inputPickerListModel: ListModel {
                id: inputs
                // Appended from script as LG does: an `id` role can't be written in a ListElement.
                Component.onCompleted: append([
                    { "id": "titleItem", "label": "defaultTile", "subTitle": "", "appId": "com.webos.app.homeconnect", "icon": "inputhub.png", "iconPrefix": "", "activate": true, "inputType": "defaultTile", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "Live TV", "label": "Live TV", "subTitle": "7-1 KQED", "appId": "com.webos.app.livetv", "icon": "tv.png", "iconPrefix": "", "activate": true, "inputType": "input", "hasCategory": true, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 1", "label": "HDMI 1", "subTitle": "Xbox", "appId": "com.webos.app.hdmi1", "icon": "hdmi.png", "iconPrefix": "", "activate": true, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "deviceControl", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 2", "label": "HDMI 2", "subTitle": "Device", "appId": "com.webos.app.hdmi2", "icon": "hdmi.png", "iconPrefix": "", "activate": true, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "universalBadge", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 3", "label": "HDMI 3", "subTitle": "", "appId": "com.webos.app.hdmi3", "icon": "hdmi.png", "iconPrefix": "", "activate": false, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "USB", "label": "SanDisk", "subTitle": "USB 1", "appId": "com.webos.app.usb", "icon": "usb.png", "iconPrefix": "", "activate": true, "inputType": "usb", "hasCategory": true, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "usb", "deviceStatus": "NORMAL" }
                ])
            }
        }
    }

    // Base: opened, focus on HDMI 2, the current input.
    states: [
        State { name: "focus-current" },
        State { name: "focus-home"; PropertyChanges { target: ribbon; currentIndex: 0 } },
        State { name: "focus-addon"; PropertyChanges { target: ribbon; currentIndex: 2 } },
        State { name: "focus-disconnected"; PropertyChanges { target: ribbon; currentIndex: 4 } },
        State { name: "focus-usb"; PropertyChanges { target: ribbon; currentIndex: 5 } },
        State { name: "closed"; PropertyChanges { target: windowContent; state: "" } }
    ]
}
