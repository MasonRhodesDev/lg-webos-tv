import QtQuick 2.4
import "lg"

// LG's Quick Settings as a part sees it: the full-screen `windowContent` FocusScope (numButtons, utils,
// selectedButton, stringTable) and its panel Column, whose children are the rows plus spacer Rectangles.
Item {
    id: scene
    property string part: "QuickSettings.qml"
    property rect frame: Qt.rect(0, 0, 960, 1080)
    property Item lg: container

    FocusScope {
        id: container
        objectName: "windowContent"
        width: 1920
        height: 1080
        focus: true

        property QtObject utils: QtObject {
            property int close: -1
            property int picture: 0
            property int aspect: 1
            property int soundMode: 2
            property int soundEffect: 4
            property int soundOut: 5
            property int device: 7
            property int timer: 8
            property int network: 9
            property int settings: 10
        }
        property QtObject stringTable: QtObject {
            property string settings: "Settings"
            property string close: "Close"
            property string pictureMode: "Picture Mode"
            property string aspectRatio: "Aspect Ratio"
            property string soundMode: "Sound Mode"
            property string soundOut: "Sound Out"
            property string sleepTimer: "Sleep Timer"
            property string network: "Network"
            property string allSettings: "All Settings"
        }
        readonly property int numButtons: panel.children.length - 1
        property int selectedButton: 0
        property Item currentOpenItem: null
        property int currentOpenButton: -1
        property bool openAnimCompleted: true
        property bool isClosing: false
        property bool cursorVisible: false
        property bool closeButtonVisible: true

        Item { id: close_button; objectName: "close_button"; x: 43; y: 60; width: 90; height: 90 }

        Column {
            id: panel
            objectName: "QuickSettings_panel"
            x: 43
            y: 192
            state: "opened"
            states: [State { name: "opened" }, State { name: "closed" }]

            QuickSettingsRow {
                id: picture
                objectName: "QuickSettings_picture_button"
                caption: container.stringTable.pictureMode
                subCaption: "Cinema"
                currentIndex: 2
                dotPickerModel: ListModel {
                    ListElement { name: "Vivid"; value: "vivid" }
                    ListElement { name: "Standard"; value: "normal" }
                    ListElement { name: "Cinema"; value: "cinema" }
                    ListElement { name: "Sports"; value: "sports" }
                    ListElement { name: "Game"; value: "game" }
                    ListElement { name: "Filmmaker Mode"; value: "filmMaker" }
                }
            }
            QuickSettingsRow {
                objectName: "QuickSettings_aspect_button"
                caption: container.stringTable.aspectRatio
                subCaption: "16:9"
                dotPickerModel: ListModel {
                    ListElement { name: "16:9"; value: "16x9" }
                    ListElement { name: "Original"; value: "original" }
                    ListElement { name: "4:3"; value: "4x3" }
                }
            }
            QuickSettingsRow {
                id: soundMode
                objectName: "QuickSettings_soundMode_button"
                caption: container.stringTable.soundMode
                subCaption: "AI Sound"
                dotPickerModel: ListModel {
                    ListElement { name: "AI Sound"; value: "aiSound" }
                    ListElement { name: "Standard"; value: "standard" }
                    ListElement { name: "Cinema"; value: "movie" }
                    ListElement { name: "Clear Voice III"; value: "news" }
                }
            }
            Rectangle { width: 400; height: 10; color: "transparent" }
            QuickSettingsRow {
                objectName: "QuickSettings_soundEffect_button"
                caption: "Sound Effect"
                subCaption: "Off"
                disabled: true
                isDotpickerInvisible: true
            }
            QuickSettingsRow {
                objectName: "QuickSettings_soundOut_button"
                caption: container.stringTable.soundOut
                subCaption: "TV Speaker"
                dotPickerModel: ListModel {
                    ListElement { name: "TV Speaker"; value: "tv_speaker" }
                    ListElement { name: "HDMI ARC"; value: "external_arc" }
                    ListElement { name: "Optical"; value: "external_optical" }
                }
            }
            Rectangle { width: 400; height: 10; color: "transparent" }
            QuickSettingsRow {
                objectName: "QuickSettings_device_button"
                caption: "Device Selection"
                visible: false
                isDotpickerInvisible: true
            }
            QuickSettingsRow {
                id: timer
                objectName: "QuickSettings_timer_button"
                caption: container.stringTable.sleepTimer
                subCaption: "Off"
                dotPickerModel: ListModel {
                    ListElement { name: "Off"; value: "0" }
                    ListElement { name: "10 min"; value: "10" }
                    ListElement { name: "30 min"; value: "30" }
                    ListElement { name: "1 hr"; value: "60" }
                }
            }
            QuickSettingsRow {
                objectName: "QuickSettings_network_button"
                caption: container.stringTable.network
                subCaption: "Home Wi-Fi"
                isDotpickerInvisible: true
            }
            QuickSettingsRow {
                id: allSettings
                objectName: "QuickSettings_settings_button"
                caption: container.stringTable.allSettings
                isDotpickerInvisible: true
            }
        }
    }

    // Base: open, focus on the first row.
    states: [
        State { name: "focus-first"; StateChangeScript { script: picture.forceActiveFocus() } },
        State {
            name: "picker-open"
            PropertyChanges { target: soundMode; state: "opened"; currentIndex: 0 }
            PropertyChanges { target: container; currentOpenItem: soundMode; currentOpenButton: 2; selectedButton: 2 }
            StateChangeScript { script: soundMode.forceActiveFocus() }
        },
        State { name: "focus-last"; PropertyChanges { target: container; selectedButton: 10 } StateChangeScript { script: allSettings.forceActiveFocus() } },
        State { name: "focus-close"; PropertyChanges { target: container; selectedButton: -1 } StateChangeScript { script: close_button.forceActiveFocus() } },
        State { name: "closing"; PropertyChanges { target: panel; state: "closed" } PropertyChanges { target: container; isClosing: true } }
    ]
}
