import QtQuick 2.4

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
            width: 1920
            height: 330 + 40
            anchors.bottom: parent.bottom
            anchors.bottomMargin: -40
            property Item mainRibbon: ribbon
            ListView {
                id: ribbon
                x: 40
                width: 1920 - 80
                height: 330
                orientation: ListView.Horizontal
                spacing: 10
                interactive: false
                highlightFollowsCurrentItem: false
                currentIndex: 3
                model: inputs
                delegate: Item {
                    readonly property bool title: model.id === "titleItem"
                    readonly property int at: index
                    width: hit.width + (model.hasCategory ? 10 : 0) + (title ? 63 : 0)
                    height: 330
                    property Item hit: hit
                    Item {
                        id: hit
                        x: model.hasCategory ? 10 + (title ? 63 : 0) : 0
                        y: 330 - 45 - 210
                        width: title ? 280 : 300
                        height: 210
                        FocusScope {
                            id: addOn
                            property string tooltipText: model.addonType
                            width: 54
                            height: 54
                            x: (parent.width - width) / 2
                            y: -50 - height
                            visible: model.addonType !== "none" && model.addonType !== "universalBadge" && index === ribbon.currentIndex
                        }
                    }
                }
            }
            property ListModel inputPickerListModel: ListModel {
                id: inputs
                Component.onCompleted: append([
                    { "id": "titleItem", "label": "defaultTile", "subTitle": "", "appId": "com.webos.app.homeconnect", "icon": "inputhub.png", "iconPrefix": "", "activate": true, "inputType": "defaultTile", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "Live TV", "label": "Live TV", "subTitle": "7-1 KQED", "appId": "com.webos.app.livetv", "icon": "tv.png", "iconPrefix": "", "activate": true, "inputType": "input", "hasCategory": true, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 1", "label": "HDMI 1", "subTitle": "Xbox", "appId": "com.webos.app.hdmi1", "icon": "hdmi.png", "iconPrefix": "", "activate": true, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "deviceControl", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 2", "label": "HDMI 2", "subTitle": "Device", "appId": "com.webos.app.hdmi2", "icon": "hdmi.png", "iconPrefix": "", "activate": true, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "universalBadge", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 3", "label": "HDMI 3", "subTitle": "", "appId": "com.webos.app.hdmi3", "icon": "hdmi.png", "iconPrefix": "", "activate": false, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "HDMI 4", "label": "HDMI 4", "subTitle": "", "appId": "com.webos.app.hdmi4", "icon": "hdmi.png", "iconPrefix": "", "activate": false, "inputType": "input", "hasCategory": false, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" },
                    { "id": "USB", "label": "SanDisk", "subTitle": "USB 1", "appId": "com.webos.app.usb", "icon": "usb.png", "iconPrefix": "", "activate": true, "inputType": "usb", "hasCategory": true, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "usb", "deviceStatus": "NORMAL" },
                    { "id": "DLNA", "label": "Living room PC", "subTitle": "Media server", "appId": "com.webos.app.usb", "icon": "dlna.png", "iconPrefix": "", "activate": true, "inputType": "dlna", "hasCategory": true, "isSecondDepth": false, "uniqueId": 999, "lastUniqueId": 255, "addonType": "none", "deviceStatus": "NORMAL" }
                ])
            }
        }
    }

    states: [
        State { name: "focus-current" },
        State { name: "focus-home"; PropertyChanges { target: ribbon; currentIndex: 0 } },
        State { name: "focus-addon"; PropertyChanges { target: ribbon; currentIndex: 2 } },
        State { name: "focus-disconnected"; PropertyChanges { target: ribbon; currentIndex: 4 } },
        State { name: "focus-usb"; PropertyChanges { target: ribbon; currentIndex: 6; contentX: 423 } },
        State { name: "scrolled"; PropertyChanges { target: ribbon; currentIndex: 7; contentX: 803 } },
        State { name: "addon-focused"; PropertyChanges { target: ribbon; currentIndex: 2 }
                StateChangeScript { script: ribbon.currentItem.hit.children[0].forceActiveFocus() } },
        State { name: "closed"; PropertyChanges { target: windowContent; state: "" } }
    ]
}
