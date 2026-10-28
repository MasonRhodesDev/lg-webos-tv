import QtQuick 2.4
import Look 1.0

// Our toast (the short message at the top right: "input changed", app and system notices). LG's toast view keeps its
// logic (the notification service subscription, queueing, the 5 s timeout, close and link clicks); this only draws
// the toast LG is showing. The box matches LG's, so pointer clicks still land on LG's close and link areas.
Item {
    id: part
    property Item lg: null
    readonly property int searchDepth: 0
    function claims(item) { return item.objectName === "toastView" && item.model !== undefined && item.close !== undefined; }

    readonly property var model: lg ? lg.model : null
    // LG shows at most one toast at a time, the model's last row.
    readonly property var current: model && model.count > 0 ? model.get(model.count - 1) : null
    readonly property bool shown: lg !== null && lg.visible && current !== null
    // Kept after LG removes the row, so the toast keeps its text while it slides away.
    property var toast: ({})
    onCurrentChanged: if (current) toast = { message: current.message || "", iconPath: current.iconPath || "",
                                               standard: current.type === "standard",
                                               link: !!current.action && Object.keys(current.action).length > 0 }

    anchors.top: parent.top
    anchors.right: parent.right
    anchors.margins: 21
    width: toast.standard ? 825 : Math.min(825, message.implicitWidth + 75 + 36)
    height: toast.standard ? Math.max(111, message.contentHeight + 40) : 75

    Decor {
        id: card
        target: "panel"
        width: parent.width
        height: parent.height
        y: part.shown ? 0 : -(part.height + 40)
        opacity: part.shown ? 1 : 0
        visible: opacity > 0
        Behavior on y { NumberAnimation { duration: 400; easing.type: Easing.OutBack } }
        Behavior on opacity { NumberAnimation { duration: 240 } }

        Rectangle {
            anchors.fill: parent
            radius: Math.min(Look.px("r-panel"), height / 2)
            color: Look.color("surface")
            border.width: 2
            border.color: Look.color("surface-edge")
        }

        Rectangle {
            id: well
            readonly property int size: part.toast.standard ? 75 : 51
            width: size
            height: size
            x: (part.toast.standard ? 111 : 75) / 2 - size / 2 + 6
            anchors.verticalCenter: parent.verticalCenter
            radius: Math.min(Look.px("r-key"), size / 2)
            color: Look.color("inner")
            Image {
                anchors.fill: parent
                anchors.margins: 6
                source: part.toast.iconPath ? "file://" + part.toast.iconPath : ""
                fillMode: Image.PreserveAspectFit
                smooth: true
            }
        }

        Text {
            id: message
            anchors.left: well.right
            anchors.leftMargin: 20
            anchors.right: part.toast.standard ? (link.visible ? link.left : close.left) : undefined
            anchors.rightMargin: 20
            anchors.verticalCenter: parent.verticalCenter
            text: part.toast.message || ""
            color: Look.color("ink")
            font.family: Look.font
            font.pixelSize: part.toast.standard ? 26 : 27
            font.weight: Font.DemiBold
            lineHeightMode: Text.FixedHeight
            lineHeight: part.toast.standard ? 36 : 30
            wrapMode: part.toast.standard ? Text.Wrap : Text.NoWrap
            maximumLineCount: part.toast.standard ? 3 : 1
            elide: Text.ElideRight
        }

        // Close, where LG's close area is; with an action, a link chevron before it, as LG has.
        Item {
            id: close
            visible: part.toast.standard
            width: 60
            height: 60
            anchors.right: parent.right
            anchors.rightMargin: 9
            anchors.verticalCenter: parent.verticalCenter
            Repeater {
                model: [45, -45]
                Rectangle {
                    anchors.centerIn: parent
                    width: 26
                    height: 3
                    radius: 1.5
                    rotation: modelData
                    color: Look.color("ink-3")
                }
            }
        }
        Item {
            id: link
            visible: part.toast.standard && part.toast.link
            width: 60
            height: 60
            anchors.right: close.left
            anchors.verticalCenter: parent.verticalCenter
            Repeater {
                model: [45, -45]
                Rectangle {
                    x: 24
                    y: modelData > 0 ? 24 : 33
                    width: 16
                    height: 3
                    radius: 1.5
                    rotation: modelData
                    color: Look.color("ink")
                }
            }
        }
    }
}
