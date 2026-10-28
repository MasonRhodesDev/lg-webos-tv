import QtQuick 2.4
import Look 1.0
import "../passes.js" as Presence

// The root component (`screen`): the whole display. Its children are the surfaces, which paint in its passes
// (DESIGN.md, Layers). Its margin is the overscan inset (safe-x × safe-y), where surfaces' decoration may reach and
// content never goes; only the display's edge clips. Its own decoration (a theme's sky, snow, corner pieces) shows
// only while a surface in it is showing, and fades with it, so bare video is never decorated.
Decor {
    id: screen
    target: "screen"
    anchors.fill: parent
    default property alias content: passes.content
    readonly property Item surfaces: passes
    decorated: Presence.presence([passes.back, passes.lift])

    Passes { id: passes; anchors.fill: parent }
}
