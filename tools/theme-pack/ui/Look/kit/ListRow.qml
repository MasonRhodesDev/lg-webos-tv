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
//   choice   one value of a picker page: a tick in the current colour when `checked` (the Settings boards)
//   action   the value text, if any, and nothing after it: OK does it (Screen off)
//   category a category in a side list: no trailing control, a little shorter, no plate at rest unless current
//   info     the value text only; not focusable
// `busy` puts a Busy spinner before the value (scanning, connecting). An optional `chip` is attached at the top-right
// corner. Decoratable as `row`; the trailing controls are decoratable too (knob, thumb, radio, check).
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
    // A count or alert chip attached at the row's top-right corner ("3", "!").
    property string chip
    property string chipTone: "attention"
    property bool focused: false
    property bool current: false
    property bool disabled: false
    property bool busy: false
    readonly property Item control: trailing.item
    signal stepped(int index)

    width: parent ? parent.width : Look.px("panel-w")
    height: variant === "category" ? Look.px("row-h") - Look.px("space-xs") : Look.px(hint ? "row-h-2" : "row-h")
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
            rest: row.variant === "category" && !row.current ? "transparent" : Look.color("inner")
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
            Label { role: row.variant === "category" ? "category" : "label"; text: row.label; color: row.ink; width: parent.width }
            Label { visible: !!row.hint; role: "caption"; text: row.hint; color: row.soft; width: parent.width }
        }
        Loader {
            id: trailing
            x: row.width - row.pad - width
            anchors.verticalCenter: parent.verticalCenter
            sourceComponent: row.variant === "toggle" ? toggle : row.variant === "radio" ? radio : row.variant === "check" ? check
                           : row.variant === "slider" ? slider : row.variant === "stepper" ? stepper : row.variant === "choice" ? tick
                           : row.variant === "category" ? null : valueAndChevron
        }

        attachments: [
            Chip { visible: !!row.chip; text: row.chip; tone: row.chipTone; anchor: [100, 0] }
        ]
    }

    Component {
        id: valueAndChevron
        Row {
            spacing: Look.px("space-xs")
            Busy {
                visible: row.busy
                color: row.soft
                anchors.verticalCenter: parent.verticalCenter
            }
            Label {
                visible: !!row.value
                role: "value"
                text: row.value
                color: row.soft
                anchors.verticalCenter: parent.verticalCenter
            }
            Icon {
                visible: row.variant !== "info" && row.variant !== "action"
                name: "drill"
                size: Look.px("icon") * 0.8
                color: row.soft
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
    Component {
        id: tick
        Icon {
            name: "check"
            stroke: 3
            size: Look.px("icon") * 0.95
            color: row.disabled ? Look.color("ink-disabled") : row.inverted ? Look.color("focus-ink") : Look.color("current")
            opacity: row.checked ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: Look.px("motion-value") } }
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
                length: Math.min(Look.px("panel-w") / 2, Math.round(row.width * 0.35))
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
            valueWidth: Math.round(row.width * 0.3)
            options: row.options
            index: row.index
            disabled: row.disabled
            inverted: row.inverted
            onStepped: row.stepped(index)
        }
    }
}
