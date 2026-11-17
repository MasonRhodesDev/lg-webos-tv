import QtQuick 2.4

Item {
    signal lifeCycleStatusChanged(var payload)
    property int exits: 0
    function windowExit() { exits++; }
}
