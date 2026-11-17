import QtQuick 2.4
import ".."
import "icons.js" as Icons

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
