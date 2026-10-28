import QtQuick 2.4

// LG's alert view as a part sees it (objectName alertView, beside the toast view under the compositor root): a model
// of alerts ({ alertInfo: { title, message, modal, buttons: [{ label }] } }) and an Alert delegate per row carrying
// those fields, its buttons (LG's Button: widthBasis, highlighted) and buttonClicked/closeClicked. A state fills the
// model as LG's notification service would and puts LG's focus on a button.
Item {
    id: scene
    property string part: "Alert.qml"
    property rect frame: Qt.rect(400, 200, 1120, 680)
    property Item lg: alertView
    property int focusButton: 0

    FocusScope {
        id: alertView
        objectName: "alertView"
        anchors.fill: parent
        focus: true
        property ListModel model: ListModel { id: alerts }
        property bool modalAlertsVisible: false
        Repeater {
            model: alerts
            FocusScope {
                id: delegate
                property string title: model.alertInfo.title
                property string message: model.alertInfo.message
                property bool modal: model.alertInfo.modal
                property var buttonModel: model.alertInfo.buttons
                signal buttonClicked(int btnIndex)
                signal closeClicked()
                focus: true
                Row {
                    Repeater {
                        model: delegate.buttonModel
                        FocusScope {
                            property real widthBasis: 200
                            signal highlighted()
                            width: 200
                            height: 60
                            focus: index === scene.focusButton
                        }
                    }
                }
            }
        }
    }

    function show(a) {
        alerts.clear();
        alerts.append({ "alertInfo": { "sourceId": "com.webos.service.pdm", "title": a.title, "message": a.message, "modal": a.modal,
                                       "iconUrl": "", "timeout": 0, "buttons": a.buttons } });
        alertView.modalAlertsVisible = a.modal;
        alertView.forceActiveFocus();
    }

    readonly property var usb: ({ "title": "USB drive removed", "modal": true,
        "message": "The drive was unplugged while it was in use. Files that were being copied may be incomplete. Eject drives from USB media before unplugging them.",
        "buttons": [{ "label": "Open USB media" }, { "label": "OK" }] })

    states: [
        State { name: "modal"; PropertyChanges { target: scene; focusButton: 1 } StateChangeScript { script: scene.show(scene.usb) } },
        State { name: "modal-first"; PropertyChanges { target: scene; focusButton: 0 } StateChangeScript { script: scene.show(scene.usb) } },
        State {
            name: "non-modal"
            StateChangeScript { script: scene.show({ "title": "", "modal": false, "message": "Your TV will turn off in 60 seconds because of the sleep timer.",
                                                     "buttons": [{ "label": "OK" }] }) }
        },
        State { name: "empty"; StateChangeScript { script: alerts.clear() } }
    ]
}
