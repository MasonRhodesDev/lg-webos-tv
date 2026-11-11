import QtQuick 2.4
import ".."

// Text in one of the type roles: display, title, tile, headline, label, category, value, body, caption, heading, key,
// numeral, entry, cap, cap-word, pad, prompt (each a type-<role> and type-<role>-weight token). Size, weight and case
// come from the style; every kit text is a Label.
Text {
    property string role: "label"
    color: Look.color("ink")
    font.family: Look.font
    font.pixelSize: Look.px("type-" + role)
    font.weight: Look.weight("type-" + role)
    readonly property bool upper: role === "heading" && Look.token("type-heading-case") === "uppercase"
    font.capitalization: upper ? Font.AllUppercase : Font.MixedCase
    font.letterSpacing: upper ? Look.px("type-" + role) * 0.08 : 0
    elide: Text.ElideRight
    maximumLineCount: wrapMode === Text.NoWrap ? 1 : 4
}
