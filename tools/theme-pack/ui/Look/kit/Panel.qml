import QtQuick 2.4
import Look 1.0

// A panel: the surface material, decorated as `target`, placed by the placement grammar (DESIGN.md, Placement) and
// entering and leaving with the style's motion. Its children are the content, inset by `padding`; they paint in the
// panel's passes (DESIGN.md, Layers).
//   side-left, side-right  the full safe height at a side edge, panel-w wide (Quick Settings, sub-menus)
//   bar                    a pill at the top-right of the safe area, volume-w by volume-h (the volume bar)
//   ribbon                 the full safe width at the bottom (the input picker; usually `bare`)
//   toast                  the bottom-right corner, safe-x in from the right and the bottom
//   center                 centred, dialog-w wide, as tall as its content (dialogs)
//   full                   the whole safe area (our Settings)
//   none                   placed by the parent
Item {
    id: panel
    property string target: bare ? "ribbon" : "panel"
    property string placement: "none"
    property bool shown: true
    property bool strong: false
    property bool elevated: true
    // No surface: the content sits straight on its scrim (a ribbon of tiles, which are surfaces themselves).
    property bool bare: false
    property real padding: Look.px("space-l")
    property real radius: Look.px("r-panel")
    default property alias content: passes.content
    readonly property Item body: passes.contentItem

    readonly property real safeX: Look.px("safe-x")
    readonly property real safeY: Look.px("safe-y")
    readonly property real areaW: parent ? parent.width : 1920
    readonly property real areaH: parent ? parent.height : 1080

    implicitWidth: placement === "center" ? Look.px("dialog-w") : placement === "toast" ? Look.px("toast-w")
                 : placement === "bar" ? Look.px("volume-w") : Look.px("panel-w")
    implicitHeight: passes.contentItem.childrenRect.height + 2 * padding
    width: placement === "ribbon" || placement === "full" ? areaW - 2 * safeX : implicitWidth
    height: placement === "side-left" || placement === "side-right" || placement === "full" ? areaH - 2 * safeY
          : placement === "bar" ? Look.px("volume-h") : implicitHeight
    x: placement === "side-left" || placement === "ribbon" || placement === "full" ? safeX
     : placement === "side-right" || placement === "bar" || placement === "toast" ? areaW - safeX - width
     : placement === "center" ? (areaW - width) / 2 : 0
    y: placement === "ribbon" ? areaH - safeY - height
     : placement === "toast" ? areaH - safeX - height
     : placement === "center" ? (areaH - height) / 2
     : placement === "none" ? 0 : safeY

    // Where it comes from: its own edge for edge panels, a small rise and grow for centred ones.
    readonly property real shift: Look.px("enter-shift")
    readonly property real fromX: placement === "side-left" ? -shift : placement === "side-right" ? shift : 0
    readonly property real fromY: placement === "bar" ? -shift : placement === "toast" || placement === "ribbon" ? shift
                                : placement === "center" || placement === "full" ? shift / 3 : 0
    readonly property bool grows: placement === "center" || placement === "full"

    // 0 (gone) to 1 (in place). Set once, then only animated, so a change of `shown` always plays.
    property real enter: 0
    Component.onCompleted: enter = shown ? 1 : 0
    onShownChanged: {
        enterAnim.stop();
        enterAnim.to = shown ? 1 : 0;
        enterAnim.duration = Look.px(shown ? "motion-enter" : "motion-exit");
        enterAnim.easing.bezierCurve = Look.curve(shown ? "ease-enter" : "ease-exit");
        enterAnim.start();
    }
    NumberAnimation { id: enterAnim; target: panel; property: "enter"; easing.type: Easing.Bezier }

    Decor {
        id: decor
        target: panel.target
        width: panel.width
        height: panel.height
        // Hidden here, not on the root: the Layer owns a part root's `visible`.
        visible: panel.enter > 0.001
        opacity: Math.min(1, panel.enter)
        // Moved and grown with x, y and scale, which the passes carry to the panel's decoration (passes.js).
        x: panel.fromX * (1 - panel.enter)
        y: panel.fromY * (1 - panel.enter)
        scale: panel.grows ? 0.96 + 0.04 * panel.enter : 1

        Surface {
            visible: !panel.bare
            anchors.fill: parent
            strong: panel.strong
            elevated: panel.elevated
            radius: Math.min(panel.radius, panel.height / 2)
        }
        // The panel's rows and tiles paint in its own passes, over its surface, and may reach into its padding.
        Passes {
            id: passes
            anchors.fill: parent
            anchors.margins: panel.padding
        }
    }
}
