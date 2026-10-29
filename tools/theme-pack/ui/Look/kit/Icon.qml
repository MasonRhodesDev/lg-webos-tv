import QtQuick 2.4
import Look 1.0
import "icons.js" as Icons

// One icon from the kit's set (icons.js), or raw path data on the same 24x24 grid, stroked in `color`.
Canvas {
    id: icon
    property string name
    property color color: Look.color("ink")
    property real size: Look.px("icon")
    property real stroke: 2

    width: size
    height: size
    renderTarget: Canvas.Image
    antialiasing: true
    onNameChanged: requestPaint()
    onColorChanged: requestPaint()
    onStrokeChanged: requestPaint()
    onWidthChanged: requestPaint()
    // On the TV a paint made while hidden or before the canvas is ready may never reach the screen, so it paints
    // again whenever it becomes ready or shows.
    onAvailableChanged: if (available) requestPaint()
    onVisibleChanged: if (visible) requestPaint()

    onPaint: {
        var ctx = getContext("2d");
        ctx.reset();
        if (!name) return;
        ctx.scale(width / 24, height / 24);
        ctx.lineWidth = stroke;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = icon.color;
        ctx.path = Icons.ICONS[name] || name;
        ctx.stroke();
    }
}
