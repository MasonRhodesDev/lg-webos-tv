import QtQuick 2.4
import Look 1.0

// The whole screen as a decoration target (`screen`): themes put their sky behind every surface and their edge
// pieces (icicles, corner webs) in front. Our layer has one, filling the display; surfaces go inside it.
Decor {
    target: "screen"
    anchors.fill: parent
}
