import QtQuick 2.4
import ".."
import "keys.js" as KeyMap

// Our on-screen keyboard (the Keyboard board): four rows of Keys, `key-gap` apart and centred, driven by the D-pad.
// Letters, with Shift for one capital, and "123" for digits and symbols (Shift there for more). Data out, no text of
// its own: typed(ch), erased(), done(), back(). Up/Down move to the nearest key in the next row; OK presses; the
// remote's digit keys and a USB keyboard's characters type straight in. The finishing key carries the current bar.
//
// Ours, not LG's Maliit keyboard: Maliit is its own process (MaliitServer) drawing a Wayland surface of its own
// type, which only text inputs of client apps summon; our layer's QML is inside the compositor and is no such client.
FocusScope {
    id: board
    property string doneLabel: "Done"
    property bool doneEnabled: true
    property bool focusShown: true
    property bool pointer: true
    property string layout: "letters"
    property bool shifted: false
    property int row: 0
    property int col: 0
    signal typed(string ch)
    signal erased()
    signal done()
    signal back()

    // Wide keys, as the board draws them, in key widths.
    readonly property var wide: ({ "shift": 230 / 132, "erase": 230 / 132, "layout": 230 / 132, "space": 760 / 132, "done": 300 / 132 })
    function chars(s) { var out = []; for (var i = 0; i < s.length; i++) out.push({ "op": "char", "label": s.charAt(i) }); return out; }
    function op(name, label) { return { "op": name, "label": label }; }
    readonly property var rows: {
        var r0, r1, r2, symbols = layout === "symbols";
        if (!symbols) { r0 = "qwertyuiop"; r1 = "asdfghjkl"; r2 = "zxcvbnm"; }
        else if (!shifted) { r0 = "1234567890"; r1 = "-/:;()$&@"; r2 = ".,?!'\"_"; }
        else { r0 = "[]{}#%^*+="; r1 = "\\|~<>`'\"_"; r2 = ".,?!'\"_"; }
        if (!symbols && shifted) { r0 = r0.toUpperCase(); r1 = r1.toUpperCase(); r2 = r2.toUpperCase(); }
        return [chars(r0), chars(r1), [op("shift", symbols ? (shifted ? "123" : "#+=") : "Shift")].concat(chars(r2), [op("erase", "Delete")]),
                [op("layout", symbols ? "ABC" : "123"), op("space", "Space"), op("done", board.doneLabel)]];
    }

    readonly property real gap: Look.px("key-gap")
    function keyWidth(k) { return Math.round(Look.px("key-w") * (wide[k.op] || 1)); }
    function rowWidth(r) {
        var w = 0, keys = rows[r];
        for (var i = 0; i < keys.length; i++) w += keyWidth(keys[i]);
        return w + gap * (keys.length - 1);
    }
    function keyCentre(r, c) {
        var x = (width - rowWidth(r)) / 2, keys = rows[r];
        for (var i = 0; i < c; i++) x += keyWidth(keys[i]) + gap;
        return x + keyWidth(keys[c]) / 2;
    }
    implicitWidth: Math.max(rowWidth(0), rowWidth(1), rowWidth(2), rowWidth(3))
    implicitHeight: 4 * Look.px("key-h") + 3 * gap
    width: implicitWidth
    height: implicitHeight

    // Where a key is, by its name: { row, col } or null.
    function locate(label) {
        for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) if (rows[r][c].label === label) return { "row": r, "col": c };
        return null;
    }
    function moveRow(d) {
        var to = row + d;
        if (to < 0 || to >= rows.length) return;
        var x = keyCentre(row, Math.min(col, rows[row].length - 1)), best = 0, dist = Infinity;
        for (var c = 0; c < rows[to].length; c++) {
            var dx = Math.abs(keyCentre(to, c) - x);
            if (dx < dist) { dist = dx; best = c; }
        }
        row = to;
        col = best;
    }
    function press(k) {
        if (!k) return;
        if (k.op === "char") { typed(k.label); if (shifted && layout === "letters") shifted = false; }
        else if (k.op === "space") typed(" ");
        else if (k.op === "erase") erased();
        else if (k.op === "shift") shifted = !shifted;
        else if (k.op === "layout") { layout = layout === "letters" ? "symbols" : "letters"; shifted = false; col = Math.min(col, rows[row].length - 1); }
        else if (k.op === "done" && doneEnabled) done();
    }
    // Opening again starts on the letters, focus on the first key.
    function reset() { layout = "letters"; shifted = false; row = 0; col = 0; }

    Keys.onPressed: {
        // A USB keyboard's Backspace erases here; the remote's Back still closes.
        if (event.key === Qt.Key_Backspace) { erased(); event.accepted = true; return; }
        var k = KeyMap.nav(event, Qt);
        if (k === "up") moveRow(-1);
        else if (k === "down") moveRow(1);
        else if (k === "left") col = Math.max(0, col - 1);
        else if (k === "right") col = Math.min(rows[row].length - 1, col + 1);
        else if (k === "ok") press(rows[row][col]);
        else if (k === "back") back();
        else if (event.key >= Qt.Key_0 && event.key <= Qt.Key_9) typed(String(event.key - Qt.Key_0));
        else if (event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32) typed(event.text);
        else return;
        event.accepted = true;
    }

    Column {
        spacing: board.gap
        Repeater {
            model: board.rows.length
            Row {
                id: keyRow
                readonly property int r: index
                x: (board.width - width) / 2
                spacing: board.gap
                Repeater {
                    model: board.rows[keyRow.r]
                    Key {
                        width: board.keyWidth(modelData)
                        label: modelData.label
                        role: modelData.op === "char" ? "cap" : "cap-word"
                        current: modelData.op === "done" || (modelData.op === "shift" && board.shifted)
                        disabled: modelData.op === "done" && !board.doneEnabled
                        pointer: board.pointer
                        focused: board.focusShown && keyRow.r === board.row && index === board.col
                        onClicked: { board.row = keyRow.r; board.col = index; board.press(modelData); }
                    }
                }
            }
        }
    }
}
