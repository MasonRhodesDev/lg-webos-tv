import QtQuick 2.4
import "file:///usr/lib/qt5/qml/YSM/Common/FocusHandler.js" as FH

QtObject {
    function request(item) { FH.requestFocus(item); }
    function release(item) { FH.releaseFocus(item); }
}
