import QtQuick 2.4
import Look 1.0

// Text in one of the type roles (DESIGN.md, Type): display, title, tile, label, value, body, caption, heading, key,
// numeral. Size, weight and case come from the style; every kit text is a Label.
Text {
    property string role: "label"
    color: Look.color("ink")
    font.family: Look.font
    font.pixelSize: Look.px("type-" + role)
    font.weight: Look.weight("type-" + role)
    font.capitalization: role === "heading" && Look.token("type-heading-case") === "uppercase" ? Font.AllUppercase : Font.MixedCase
    font.letterSpacing: font.capitalization === Font.AllUppercase ? font.pixelSize * 0.08 : 0
    elide: Text.ElideRight
    maximumLineCount: wrapMode === Text.NoWrap ? 1 : 4
}
