pragma Singleton
import QtQuick 2.4

QtObject {
    property bool ready: false
    property QtObject hook: null
    property string lgQuickSettings: ""
    signal quickSettingsRequested(var params)

    property bool homeReady: false
    signal homeRequested(var params)
    signal planeWanted(var holder)
}
