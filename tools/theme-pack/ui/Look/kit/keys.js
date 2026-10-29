.pragma library
// The remote's keys as the kit's menus read them. One map, so a remote that sends another code for a key is a
// change here rather than in every component.
function nav(event, Qt) {
    switch (event.key) {
    case Qt.Key_Up: return "up";
    case Qt.Key_Down: return "down";
    case Qt.Key_Left: return "left";
    case Qt.Key_Right: return "right";
    case Qt.Key_Return: case Qt.Key_Enter: case Qt.Key_Select: return "ok";
    case Qt.Key_Back: case Qt.Key_Escape: case Qt.Key_Backspace: return "back";
    case 0x01200003: return "back"; // the remote's Back on webOS (WebOS.Key_webOS_Back)
    }
    return "";
}
