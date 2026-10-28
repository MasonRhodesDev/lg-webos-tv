pragma Singleton
import QtQuick 2.4

// How LG's system UI reaches our Settings host inside the compositor (Hook A, SystemUiHook.qml): LG loads
// QuickSettingsEntry.qml in its own overlay container, in the same QML engine, so this singleton is shared with the
// host. `ready` says a host is listening.
QtObject {
    property bool ready: false
    // LG's Quick Settings launch params: none (the gear), { activateType } (the picture-mode and sleep hotkeys), ...
    signal quickSettingsRequested(var params)
}
