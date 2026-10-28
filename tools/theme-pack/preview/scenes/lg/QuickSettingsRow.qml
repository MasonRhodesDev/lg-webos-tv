import QtQuick 2.4

// One row of LG's Quick Settings panel as a part sees it (a QuickSettingsButton): its label, its value, the values
// its dot picker offers, and "opened" while that picker is open. Focus comes from forceActiveFocus().
Item {
    property string caption
    property string subCaption
    property string iconSrc
    property bool disabled: false
    property bool isDotpickerInvisible: false
    property int currentIndex: 0
    property ListModel dotPickerModel: ListModel {}
    signal clicked(var mouse)
    width: 400
    height: 117
    states: State { name: "opened" }
}
