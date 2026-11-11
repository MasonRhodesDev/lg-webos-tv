pragma Singleton
import QtQuick 2.4

// How LG's system UI reaches our parts inside the compositor (Hook A, SystemUiHook.qml): LG loads
// QuickSettingsEntry.qml and HomeEntry.qml in its own overlay container, in the same QML engine, so this singleton is
// shared with the parts. `ready` says the Settings host is listening, `homeReady` the Home dock.
QtObject {
    property bool ready: false
    // Hook A while it is applied (SystemUiHook.qml), and the file LG's table loads for Quick Settings, so a launch
    // that finds no host can be handed back to LG.
    property QtObject hook: null
    property string lgQuickSettings: ""
    // LG's Quick Settings launch params: none (the gear), { activateType } (the picture-mode and sleep hotkeys), ...
    signal quickSettingsRequested(var params)

    property bool homeReady: false
    // Our overlay entry dev.themepack.home was launched (the Home key's filter, or anyone's systemUIManager/launch).
    signal homeRequested(var params)
    // A part that borrows LG's popup plane (Hold.qml) says so first, with itself as `holder`; any other holder lets go
    // at once, so the plane is given back in the order it was taken.
    signal planeWanted(var holder)
}
