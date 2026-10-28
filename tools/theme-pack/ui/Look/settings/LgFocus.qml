import QtQuick 2.4
import "file:///usr/lib/qt5/qml/YSM/Common/FocusHandler.js" as FH

// LG's focus chain (YSM/Common/FocusHandler.js, a `.pragma library`, so this import shares LG's own chain). Loaded
// by FocusLink.qml only where LG's file exists.
QtObject {
    function request(item) { FH.requestFocus(item); }
    function release(item) { FH.releaseFocus(item); }
}
