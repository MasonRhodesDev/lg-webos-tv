.pragma library
function nav(event, Qt) {
    switch (event.key) {
    case Qt.Key_Up: return "up";
    case Qt.Key_Down: return "down";
    case Qt.Key_Left: return "left";
    case Qt.Key_Right: return "right";
    case Qt.Key_Return: case Qt.Key_Enter: case Qt.Key_Select: return "ok";
    case Qt.Key_Back: case Qt.Key_Escape: case Qt.Key_Backspace: return "back";
    case 0x01200003: return "back";
    }
    return "";
}
