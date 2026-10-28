import QtQuick 2.4
import Look 1.0

// A toast (SmokeOverlays board): a glass panel (decoratable as `toast`) with an icon well, an optional title, the
// message, and a trailing chevron when the toast leads somewhere. `compact` is the one-line kind, as wide as its text.
// Placed `toast` by default (the bottom-right corner); toasts never take focus.
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
    padding: Look.px(compact ? "space-m" : "space-lx")
    readonly property real gap: Look.px("space-ml")
    readonly property real wellSize: compact ? Look.px("well") * 2 / 3 : Look.px("well")
    readonly property real tail: chevron.visible ? chevron.width + Look.px("space-s") : 0
    width: compact ? Math.min(Look.px("toast-w"), wellSize + gap + texts.implicitW + tail + 2 * padding) : Look.px("toast-w")

    Item {
        width: toast.width - 2 * toast.padding
        height: Math.max(well.height, texts.height)
        Rectangle {
            id: well
            width: toast.wellSize
            height: width
            radius: Math.min(Look.px("r-tile"), width / 2)
            color: Look.color("inner")
            border.width: Look.px("edge-w")
            border.color: Look.color("surface-edge")
            anchors.verticalCenter: toast.compact ? parent.verticalCenter : undefined
            Icon {
                visible: toast.image == ""
                anchors.centerIn: parent
                name: toast.icon
                size: Look.px(toast.compact ? "icon" : "icon-l")
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
            readonly property real implicitW: Math.ceil(Math.max(titleLabel.implicitWidth, messageLabel.implicitWidth)) + 1
            x: well.width + toast.gap
            width: parent.width - x - toast.tail
            anchors.verticalCenter: toast.compact || !toast.title ? parent.verticalCenter : undefined
            spacing: Look.px("space-xs")
            Label { id: titleLabel; visible: !!toast.title; role: "headline"; text: toast.title; width: parent.width }
            Label {
                id: messageLabel
                role: "body"
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
