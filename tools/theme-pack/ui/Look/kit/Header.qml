import QtQuick 2.4
import Look 1.0

// A panel's head: an optional breadcrumb (where this page sits), the title, and an optional subtitle at the right.
Item {
    id: header
    property string title
    property string subtitle
    property string crumb
    property string role: "title"
    width: parent ? parent.width : 0
    height: (crumb ? crumbLabel.height + Look.px("space-xs") : 0) + titleLabel.height + Look.px("space-m")

    Label {
        id: crumbLabel
        visible: !!header.crumb
        role: "label"
        text: header.crumb + " ›"
        color: Look.color("ink-3")
        width: parent.width
    }
    Label {
        id: titleLabel
        y: header.crumb ? crumbLabel.height + Look.px("space-xs") : 0
        role: header.role
        text: header.title
        width: Math.min(implicitWidth, parent.width - (sub.visible ? sub.implicitWidth + Look.px("space-m") : 0))
    }
    Label {
        id: sub
        visible: !!header.subtitle
        role: "caption"
        text: header.subtitle
        color: Look.color("ink-3")
        anchors.right: parent.right
        anchors.baseline: titleLabel.baseline
    }
}
