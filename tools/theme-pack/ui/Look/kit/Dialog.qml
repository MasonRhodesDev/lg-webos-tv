import QtQuick 2.4
import Look 1.0
import "keys.js" as KeyMap

// A dialog: its own dim scrim (when `modal`) and a centred strong panel (decoratable as `dialog`) with an icon well,
// the title, the body and a row of buttons at the right. Fill the screen with it. Our own dialogs give it focus
// and it moves between buttons with Left/Right; OK is activated(), Back is back().
Item {
    id: dialog
    property string title
    property string body
    property string icon
    property int hue: -1
    property var buttons: ["OK"]
    property alias currentIndex: buttonRow.currentIndex
    property bool modal: true
    property bool shown: true
    signal activated(int index)
    signal back()
    anchors.fill: parent

    Keys.forwardTo: [buttonRow]
    Scrim { kind: "dim"; shown: dialog.modal && dialog.shown }
    Panel {
        placement: "center"
        target: "dialog"
        strong: true
        shown: dialog.shown
        padding: Look.px("space-xxl")
        Column {
            width: parent.width
            spacing: Look.px("space-l")
            Row {
                spacing: Look.px("space-m")
                Rectangle {
                    visible: !!dialog.icon
                    width: Look.px("well")
                    height: width
                    radius: width / 2
                    color: Look.color("inner")
                    anchors.verticalCenter: parent.verticalCenter
                    Icon {
                        anchors.centerIn: parent
                        name: dialog.icon
                        size: Look.px("icon") * 1.15
                        color: dialog.hue >= 0 ? Look.hue(dialog.hue) : Look.color("ink")
                    }
                }
                Label { role: "title"; text: dialog.title; anchors.verticalCenter: parent.verticalCenter }
            }
            Label {
                role: "body"
                text: dialog.body
                color: Look.color("ink-2")
                width: parent.width
                wrapMode: Text.Wrap
                maximumLineCount: 6
                lineHeight: 1.3
            }
            Item {
                width: parent.width
                height: buttonRow.height + Look.px("space-xs")
                ButtonRow {
                    id: buttonRow
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    buttons: dialog.buttons
                    onActivated: dialog.activated(index)
                    onBack: dialog.back()
                }
            }
        }
    }
}
