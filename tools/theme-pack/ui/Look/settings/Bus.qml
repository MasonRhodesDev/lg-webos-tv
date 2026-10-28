pragma Singleton
import QtQuick 2.4

// How LG's system UI reaches our Settings host inside the compositor (Hook A, SystemUiHook.qml): LG loads
// QuickSettingsEntry.qml in its own overlay container, in the same QML engine, so this singleton is shared with the
// host. `ready` says a host is listening.
QtObject {
    property bool ready: false
    // Hook A while it is applied (SystemUiHook.qml), and the file LG's table loads for Quick Settings, so a launch
    // that finds no host can be handed back to LG.
    property QtObject hook: null
    property string lgQuickSettings: ""
    // LG's Quick Settings launch params: none (the gear), { activateType } (the picture-mode and sleep hotkeys), ...
    signal quickSettingsRequested(var params)
}
