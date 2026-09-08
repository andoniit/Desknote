import AppIntents

/// Which desk a widget watches. A pair has at most two, so a fixed choice
/// beats a dynamic entity query — no network call just to fill the picker
/// in the widget's edit sheet.
enum DeskChoice: String, AppEnum {
    case mine
    case theirs

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Desk"

    static let caseDisplayRepresentations: [DeskChoice: DisplayRepresentation] = [
        .mine: DisplayRepresentation(
            title: "My desk",
            subtitle: "The display on your own desk"),
        .theirs: DisplayRepresentation(
            title: "Their desk",
            subtitle: "Your partner's display, once you are linked"),
    ]
}

struct SelectDeskIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Choose a desk"
    static let description = IntentDescription("Pick which desk this widget watches.")

    @Parameter(title: "Desk", default: .mine)
    var desk: DeskChoice
}
