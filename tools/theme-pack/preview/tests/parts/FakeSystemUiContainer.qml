import QtQuick 2.4

// Stands in for LG's StarfishSystemUIContainer as a system UI's window sees it: lifecycle events, and exit.
Item {
    signal lifeCycleStatusChanged(var payload)
    property int exits: 0
    function windowExit() { exits++; }
}
