import QtQuick 2.4
import Look 1.0

// One component in the layer model: theme rings behind (back slot), the component as the style draws it (the
// origin, given as this item's children), and theme rings in front. Meaning lives in the origin, so turning themes
// off never hides a value or a state.
Item {
    id: decor
    property string target
    property bool focused: false
    property bool current: false
    property bool disabled: false
    default property alias origin: originItem.data

    Repeater {
        model: Look.rings(decor.target, "back")
        Ring { host: decor; theme: modelData.theme; recipe: modelData.recipe; z: 1 }
    }
    Item { id: originItem; anchors.fill: parent; z: 2 }
    Repeater {
        model: Look.rings(decor.target, "front")
        Ring { host: decor; theme: modelData.theme; recipe: modelData.recipe; z: 3 }
    }
}
