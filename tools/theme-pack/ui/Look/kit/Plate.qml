import QtQuick 2.4
import QtGraphicalEffects 1.0
import Look 1.0

// The one focus treatment: the plate under a row, tile or button. At rest it is `rest`; focused it
// fills with the focus colour (or the item's hue), gains the focus edge and a lift shadow; current adds the current
// bar along the bottom; disabled keeps the plate and dims the ink. Components read `ink` for their text and icons
// and scale themselves by focus-scale.
Item {
    id: plate
    property bool focused: false
    property bool current: false
    property bool disabled: false
    property int hue: -1
    property real radius: Look.px("r-row")
    property color rest: Look.color("inner")
    property bool edged: false
    readonly property bool inverted: focused && !disabled
    readonly property color fill: inverted ? Look.focusFill(hue) : rest
    readonly property color ink: disabled ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("ink")
    readonly property var lift: Look.shadow("elev-focus")
    anchors.fill: parent

    // The lift shadow and the dashed edge are made the first time they are wanted, not with every plate: a list makes
    // a plate a row, and a glow and a canvas each per row made a page switch take half a second on the TV.
    property bool lit: false
    onInvertedChanged: if (inverted) lit = true
    Loader {
        active: plate.lit || plate.inverted
        anchors.fill: parent
        anchors.topMargin: plate.lift.y + plate.lift.blur / 2
        anchors.bottomMargin: -plate.lift.y + plate.lift.blur / 2
        anchors.leftMargin: plate.lift.blur / 2
        anchors.rightMargin: plate.lift.blur / 2
        opacity: plate.inverted ? 1 : 0
        visible: opacity > 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }
        sourceComponent: RectangularGlow {
            glowRadius: plate.lift.blur / 2
            spread: 0
            cornerRadius: Math.min(plate.radius + glowRadius, Math.min(width, height) / 2 + glowRadius)
            color: plate.lift.color
        }
    }
    Rectangle {
        anchors.fill: parent
        radius: plate.radius
        color: plate.fill
        border.width: plate.edged && !plate.focused && !plate.disabled ? Look.px("edge-w") : 0
        border.color: Look.color("surface-edge")
        Behavior on color { ColorAnimation { duration: Look.px("motion-focus") } }
    }
    // Disabled, a plate gets a dashed edge (`edge-disabled`; an edged one trades its edge for it), as the boards draw
    // disabled tiles, buttons and rows. Context2D has no line dash on the
    // TV's Qt, so the dashes are walked along the rounded outline.
    Loader {
        active: plate.disabled && !plate.focused
        anchors.fill: parent
        sourceComponent: Canvas {
            id: dashes
            renderTarget: Canvas.Image
            antialiasing: true
            readonly property real w: 2 * Look.px("edge-w")
            readonly property color ink: Look.color("edge-disabled")
            onVisibleChanged: requestPaint()
            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onInkChanged: requestPaint()
            onPaint: {
                var ctx = getContext("2d");
                ctx.reset();
                if (!visible || width <= 0 || height <= 0) return;
                var h = w / 2, x0 = h, y0 = h, x1 = width - h, y1 = height - h;
                var r = Math.max(0, Math.min(plate.radius - h, (x1 - x0) / 2, (y1 - y0) / 2));
                var sx = x1 - x0 - 2 * r, sy = y1 - y0 - 2 * r, arc = Math.PI * r / 2;
                var legs = [sx, arc, sy, arc, sx, arc, sy, arc];
                var total = 2 * sx + 2 * sy + 4 * arc;
                // The point at distance d along the outline, clockwise from the top-left corner's end.
                function at(d) {
                    d = ((d % total) + total) % total;
                    var i = 0;
                    while (i < 7 && d > legs[i]) { d -= legs[i]; i++; }
                    var a = r > 0 ? d / r : 0;
                    if (i === 0) return [x0 + r + d, y0];
                    if (i === 1) return [x1 - r + r * Math.sin(a), y0 + r - r * Math.cos(a)];
                    if (i === 2) return [x1, y0 + r + d];
                    if (i === 3) return [x1 - r + r * Math.cos(a), y1 - r + r * Math.sin(a)];
                    if (i === 4) return [x1 - r - d, y1];
                    if (i === 5) return [x0 + r - r * Math.sin(a), y1 - r + r * Math.cos(a)];
                    if (i === 6) return [x0, y1 - r - d];
                    return [x0 + r - r * Math.cos(a), y0 + r - r * Math.sin(a)];
                }
                // CSS dashes are three widths long with equal gaps; round the count so the loop closes evenly.
                var n = Math.max(2, Math.round(total / (6 * w)));
                var dash = total / n / 2;
                ctx.lineWidth = w;
                ctx.lineCap = "butt";
                ctx.strokeStyle = ink;
                ctx.beginPath();
                for (var k = 0; k < n; k++) {
                    var s = k * 2 * dash, p = at(s);
                    ctx.moveTo(p[0], p[1]);
                    for (var t = 2; t < dash; t += 2) { p = at(s + t); ctx.lineTo(p[0], p[1]); }
                    p = at(s + dash);
                    ctx.lineTo(p[0], p[1]);
                }
                ctx.stroke();
            }
        }
    }
    Item {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: Look.px("current-w")
        clip: true
        visible: plate.current && !plate.focused
        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: plate.height
            radius: plate.radius
            color: Look.color("current")
        }
    }
    Rectangle {
        anchors.fill: parent
        radius: plate.radius
        color: "transparent"
        border.width: Look.px("focus-w")
        border.color: Look.color("focus-edge")
        opacity: plate.focused ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }
    }
}
