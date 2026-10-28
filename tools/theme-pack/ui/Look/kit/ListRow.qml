import QtQuick 2.4
import Look 1.0

// The one row anatomy every list uses (DESIGN.md, Row): icon slot, label (and an optional hint line), value, and a
// trailing control chosen by `variant`:
//   nav      chevron: opens a page (a value, if given, shows what it is set to)
//   value    the value text and a chevron: opens a picker for it
//   toggle   a switch (`on`)
//   radio    a radio (`checked`): one choice of several
//   check    a check box (`checked`): any number of several
//   slider   a slider (`fraction`, `valueText`)
//   stepper  ‹ value › stepping through `options` at `index`
//   info     the value text only; not focusable
// Decoratable as `row`; the trailing controls are decoratable too (knob, thumb, radio, check).
Item {
    id: row
    property string variant: "nav"
    property string label
    property string hint
    property string value
    property string icon
    property int hue: -1
    property bool on: false
    property bool checked: false
    property real fraction: 0
    property string valueText
    property var options: []
    property int index: 0
    property bool focused: false
    property bool current: false
    property bool disabled: false
    readonly property Item control: trailing.item
    signal stepped(int index)

    width: parent ? parent.width : Look.px("panel-w")
    height: Look.px(hint ? "row-h-2" : "row-h")
    z: focused ? 2 : 0
    scale: focused ? Look.px("focus-scale") : 1
    Behavior on scale { NumberAnimation { duration: Look.px("motion-focus"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }

    readonly property real pad: Look.px("row-pad")
    readonly property bool inverted: plate.inverted
    readonly property color ink: plate.ink
    readonly property color soft: disabled ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("ink-2")

    Decor {
        target: "row"
        focused: row.focused
        current: row.current
        disabled: row.disabled
        anchors.fill: parent

        Plate {
            id: plate
            focused: row.focused
            current: row.current
            disabled: row.disabled
            hue: row.hue
        }
        Icon {
            id: glyph
            visible: !!row.icon
            x: row.pad
            anchors.verticalCenter: parent.verticalCenter
            name: row.icon
            color: row.disabled || row.inverted ? row.ink : row.hue >= 0 ? Look.hue(row.hue) : Look.color("ink-2")
        }
        Column {
            id: texts
            x: row.icon ? glyph.x + glyph.width + Look.px("space-m") : row.pad
            width: trailing.x - x - Look.px("space-m")
            anchors.verticalCenter: parent.verticalCenter
            Label { role: "label"; text: row.label; color: row.ink; width: parent.width }
            Label { visible: !!row.hint; role: "caption"; text: row.hint; color: row.soft; width: parent.width }
        }
        Loader {
            id: trailing
            x: row.width - row.pad - width
            anchors.verticalCenter: parent.verticalCenter
            sourceComponent: row.variant === "toggle" ? toggle : row.variant === "radio" ? radio : row.variant === "check" ? check
                           : row.variant === "slider" ? slider : row.variant === "stepper" ? stepper : valueAndChevron
        }
    }

    Component {
        id: valueAndChevron
        Row {
            spacing: Look.px("space-xs")
            Label {
                visible: !!row.value
                role: "value"
                text: row.value
                color: row.soft
                anchors.verticalCenter: parent.verticalCenter
            }
            Icon {
                visible: row.variant !== "info"
                name: "drill"
                size: Look.px("icon") * 0.8
                color: row.soft
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
    Component { id: toggle; Toggle { on: row.on; disabled: row.disabled; inverted: row.inverted } }
    Component { id: radio; Radio { checked: row.checked; disabled: row.disabled; inverted: row.inverted } }
    Component { id: check; Check { checked: row.checked; disabled: row.disabled; inverted: row.inverted; under: plate.fill } }
    Component {
        id: slider
        Row {
            spacing: Look.px("space-m")
            Slider {
                fraction: row.fraction
                disabled: row.disabled
                inverted: row.inverted
                anchors.verticalCenter: parent.verticalCenter
            }
            Label {
                role: "label"
                width: Look.px("type-label") * 2.2
                horizontalAlignment: Text.AlignRight
                text: row.valueText
                color: row.ink
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
    Component {
        id: stepper
        Stepper {
            options: row.options
            index: row.index
            disabled: row.disabled
            inverted: row.inverted
            onStepped: row.stepped(index)
        }
    }
}
