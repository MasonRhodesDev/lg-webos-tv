import QtQuick 2.4
import Look 1.0

// A toast: a strong panel (decoratable as `toast`) with an icon well, an optional title, the message, and an
// optional trailing chevron when the toast leads somewhere. `compact` is the one-line kind. Placed `toast` by
// default (the top-right of the safe area); toasts never take focus.
Panel {
    id: toast
    property string title
    property string message
    property string icon: "bell"
    property url image
    property int hue: -1
    property bool compact: false
    property bool link: false
    target: "toast"
    placement: "toast"
    strong: true
    padding: Look.px(compact ? "space-s" : "space-m")
    width: compact ? Math.min(Look.px("toast-w"), well.width + texts.implicitW + 2 * padding + Look.px("space-m") + Look.px("space-s"))
                   : Look.px("toast-w")
    readonly property real wellSize: Look.px("well") * (compact ? 0.8 : 1)

    Item {
        width: toast.width - 2 * toast.padding
        height: Math.max(well.height, texts.height)
        Rectangle {
            id: well
            width: toast.wellSize
            height: width
            radius: width / 2
            color: Look.color("inner")
            anchors.verticalCenter: parent.verticalCenter
            Icon {
                visible: toast.image == ""
                anchors.centerIn: parent
                name: toast.icon
                color: toast.hue >= 0 ? Look.hue(toast.hue) : Look.color("ink")
            }
            Image {
                visible: toast.image != ""
                anchors.fill: parent
                anchors.margins: parent.width * 0.14
                source: toast.image
                fillMode: Image.PreserveAspectFit
                smooth: true
            }
        }
        Column {
            id: texts
            readonly property real implicitW: Math.max(titleLabel.implicitWidth, messageLabel.implicitWidth)
            x: well.width + Look.px("space-m")
            width: parent.width - x - (chevron.visible ? chevron.width + Look.px("space-s") : 0)
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2
            Label { id: titleLabel; visible: !!toast.title; role: "label"; text: toast.title; width: parent.width }
            Label {
                id: messageLabel
                role: toast.title ? "value" : "label"
                text: toast.message
                color: toast.title ? Look.color("ink-2") : Look.color("ink")
                width: parent.width
                wrapMode: toast.compact ? Text.NoWrap : Text.Wrap
                maximumLineCount: toast.compact ? 1 : 3
            }
        }
        Icon {
            id: chevron
            visible: toast.link
            name: "drill"
            color: Look.color("ink-3")
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
