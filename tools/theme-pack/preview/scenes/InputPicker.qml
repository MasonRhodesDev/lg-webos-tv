import QtQuick 2.4

// LG's input picker as a part sees it: InputPickerMainView (mainRibbon, inputPickerListModel) inside the
// `windowContent` FocusScope that holds `state` and `props`. The model is what LG builds: the Home Dashboard tile,
// then Live TV and the HDMI inputs (connected first), then USB and Content Share, with `hasCategory` on the first of each kind.
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

        // LG's geometry: the view hangs 40 below the screen once open, so its 330-tall ribbon is flush with the foot.
        Item {
            id: view
            objectName: "InputPickerMainView"
            width: 1920
            height: 330 + 40
            anchors.bottom: parent.bottom
            anchors.bottomMargin: -40
            property Item mainRibbon: ribbon
            // LG's delegates as hit areas: each tile 45 above the ribbon's foot; a category's first tile 10 further
            // on, the Home Dashboard tile's delegate 63 wider for its separator. The add-on button is LG's rule
            // without its activeFocus term (nothing holds focus in a shot).
            ListView {
                id: ribbon
                x: 40
                // LG's is min(1840, contentWidth); this list is always wider.
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
                // Appended from script as LG does: an `id` role can't be written in a ListElement.
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

    // Base: opened, focus on HDMI 2, the current input.
    states: [
        State { name: "focus-current" },
        State { name: "focus-home"; PropertyChanges { target: ribbon; currentIndex: 0 } },
        State { name: "focus-addon"; PropertyChanges { target: ribbon; currentIndex: 2 } },
        State { name: "focus-disconnected"; PropertyChanges { target: ribbon; currentIndex: 4 } },
        // Focus on USB, scrolled as far as LG's ensureItemVisible takes it (its right edge 40 inside the ribbon's).
        State { name: "focus-usb"; PropertyChanges { target: ribbon; currentIndex: 6; contentX: 423 } },
        // LG scrolled to its end, as it does once focus nears the right edge.
        // Its content is 2643 wide (343 + 7 tiles of 300, three 10 category leads, 7 gaps of 10) in 1840: 803 to the end.
        State { name: "scrolled"; PropertyChanges { target: ribbon; currentIndex: 7; contentX: 803 } },
        // Up from a tile with an add-on: LG's add-on button holds focus, the tile lets go.
        State { name: "addon-focused"; PropertyChanges { target: ribbon; currentIndex: 2 }
                StateChangeScript { script: ribbon.currentItem.hit.children[0].forceActiveFocus() } },
        State { name: "closed"; PropertyChanges { target: windowContent; state: "" } }
    ]
}
