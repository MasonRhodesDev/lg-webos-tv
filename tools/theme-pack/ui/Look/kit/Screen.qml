import QtQuick 2.4
import ".."
import "../passes.js" as Presence

Decor {
    id: screen
    target: "screen"
    anchors.fill: parent
    default property alias content: passes.content
    readonly property Item surfaces: passes
    decorated: Presence.presence([passes.back, passes.lift])

    Passes { id: passes; anchors.fill: parent }
}
