import QtQuick 2.4
import Look 1.0

// Work going on (DESIGN.md, Busy): a turning three-quarter ring in the ink it sits on, the size of an icon. Shown in
// a row while it scans or connects (ListRow `busy`); turns only while visible.
Canvas {
    id: busy
    property color color: Look.color("ink-2")
    property real size: Look.px("icon") * 0.8
    width: size
    height: size
    renderTarget: Canvas.Image
    antialiasing: true
    onColorChanged: requestPaint()
    onWidthChanged: requestPaint()

    onPaint: {
        var ctx = getContext("2d"), w = Math.max(2, width / 9);
        ctx.reset();
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.strokeStyle = busy.color;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, width / 2 - w, 0, Math.PI * 1.5, false);
        ctx.stroke();
    }

    RotationAnimation on rotation {
        running: busy.visible
        loops: Animation.Infinite
        from: 0
        to: 360
        duration: Look.px("motion-value") * 5
    }
}
