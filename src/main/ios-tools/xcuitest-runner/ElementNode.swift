import XCTest

/// Element tree data structure for UI hierarchy representation.
/// Designed to be JSON-serializable for consumption by TypeScript/Node.js.
///
/// This structure captures all relevant accessibility and interaction properties
/// of XCUIElement instances for AI agent consumption.

// MARK: - Element Node

/// A node in the UI element tree representing a single XCUIElement
struct ElementNode: Codable {
    /// XCUIElement type (e.g., "button", "textField", "staticText")
    let type: String

    /// Accessibility identifier (most reliable for testing)
    let identifier: String?

    /// Accessibility label (what VoiceOver reads)
    let label: String?

    /// Current value (for inputs, switches, etc.)
    let value: String?

    /// Placeholder text (for text fields)
    let placeholderValue: String?

    /// Accessibility hint text
    let hint: String?

    /// Element title (some elements have titles)
    let title: String?

    /// Frame in screen coordinates
    let frame: ElementFrame

    /// Whether the element is enabled for interaction
    let isEnabled: Bool

    /// Whether the element is currently selected
    let isSelected: Bool

    /// Whether the element has keyboard focus
    let isFocused: Bool

    /// Whether the element exists in the hierarchy
    let exists: Bool

    /// Whether the element can receive tap events
    let isHittable: Bool

    /// Whether the element is visible (non-zero size)
    let isVisible: Bool

    /// Accessibility traits (button, staticText, header, etc.)
    let traits: [String]

    /// Child elements
    let children: [ElementNode]

    // MARK: - Computed Properties for JSON

    /// Unique path to this element (for debugging/identification)
    let elementPath: String?

    /// Suggested Maestro action based on element type and state
    let suggestedAction: String?

    /// Best identifier to use for targeting this element
    let bestTargetId: String?
}

// MARK: - Element Frame

/// Frame/bounds of an element in screen coordinates
struct ElementFrame: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double

    /// Center point of the element
    var center: ElementPoint {
        ElementPoint(x: x + width / 2, y: y + height / 2)
    }

    /// Whether the frame has non-zero dimensions
    var isVisible: Bool {
        width > 0 && height > 0
    }
}

// MARK: - Element Point

/// A point in screen coordinates
struct ElementPoint: Codable {
    let x: Double
    let y: Double
}

// MARK: - Element Type Mapping

/// Maps XCUIElement.ElementType to string representation
enum ElementTypeMapper {
    static func string(from elementType: XCUIElement.ElementType) -> String {
        switch elementType {
        case .any: return "any"
        case .other: return "other"
        case .application: return "application"
        case .group: return "group"
        case .window: return "window"
        case .sheet: return "sheet"
        case .drawer: return "drawer"
        case .alert: return "alert"
        case .dialog: return "dialog"
        case .button: return "button"
        case .radioButton: return "radioButton"
        case .radioGroup: return "radioGroup"
        case .checkBox: return "checkBox"
        case .disclosureTriangle: return "disclosureTriangle"
        case .popUpButton: return "popUpButton"
        case .comboBox: return "comboBox"
        case .menuButton: return "menuButton"
        case .toolbarButton: return "toolbarButton"
        case .popover: return "popover"
        case .keyboard: return "keyboard"
        case .key: return "key"
        case .navigationBar: return "navigationBar"
        case .tabBar: return "tabBar"
        case .tabGroup: return "tabGroup"
        case .toolbar: return "toolbar"
        case .statusBar: return "statusBar"
        case .table: return "table"
        case .tableRow: return "tableRow"
        case .tableColumn: return "tableColumn"
        case .outline: return "outline"
        case .outlineRow: return "outlineRow"
        case .browser: return "browser"
        case .collectionView: return "collectionView"
        case .slider: return "slider"
        case .pageIndicator: return "pageIndicator"
        case .progressIndicator: return "progressIndicator"
        case .activityIndicator: return "activityIndicator"
        case .segmentedControl: return "segmentedControl"
        case .picker: return "picker"
        case .pickerWheel: return "pickerWheel"
        case .switch: return "switch"
        case .toggle: return "toggle"
        case .link: return "link"
        case .image: return "image"
        case .icon: return "icon"
        case .searchField: return "searchField"
        case .scrollView: return "scrollView"
        case .scrollBar: return "scrollBar"
        case .staticText: return "staticText"
        case .textField: return "textField"
        case .secureTextField: return "secureTextField"
        case .datePicker: return "datePicker"
        case .textView: return "textView"
        case .menu: return "menu"
        case .menuItem: return "menuItem"
        case .menuBar: return "menuBar"
        case .menuBarItem: return "menuBarItem"
        case .map: return "map"
        case .webView: return "webView"
        case .incrementArrow: return "incrementArrow"
        case .decrementArrow: return "decrementArrow"
        case .timeline: return "timeline"
        case .ratingIndicator: return "ratingIndicator"
        case .valueIndicator: return "valueIndicator"
        case .splitGroup: return "splitGroup"
        case .splitter: return "splitter"
        case .relevanceIndicator: return "relevanceIndicator"
        case .colorWell: return "colorWell"
        case .helpTag: return "helpTag"
        case .matte: return "matte"
        case .dockItem: return "dockItem"
        case .ruler: return "ruler"
        case .rulerMarker: return "rulerMarker"
        case .grid: return "grid"
        case .levelIndicator: return "levelIndicator"
        case .cell: return "cell"
        case .layoutArea: return "layoutArea"
        case .layoutItem: return "layoutItem"
        case .handle: return "handle"
        case .stepper: return "stepper"
        case .tab: return "tab"
        case .touchBar: return "touchBar"
        case .statusItem: return "statusItem"
        @unknown default: return "unknown"
        }
    }
}

// MARK: - Accessibility Traits

/// Maps accessibility traits to readable strings
enum TraitsMapper {
    static func strings(from traits: UIAccessibilityTraits) -> [String] {
        var result: [String] = []

        if traits.contains(.button) { result.append("button") }
        if traits.contains(.link) { result.append("link") }
        if traits.contains(.header) { result.append("header") }
        if traits.contains(.searchField) { result.append("searchField") }
        if traits.contains(.image) { result.append("image") }
        if traits.contains(.selected) { result.append("selected") }
        if traits.contains(.playsSound) { result.append("playsSound") }
        if traits.contains(.keyboardKey) { result.append("keyboardKey") }
        if traits.contains(.staticText) { result.append("staticText") }
        if traits.contains(.summaryElement) { result.append("summaryElement") }
        if traits.contains(.notEnabled) { result.append("notEnabled") }
        if traits.contains(.updatesFrequently) { result.append("updatesFrequently") }
        if traits.contains(.startsMediaSession) { result.append("startsMediaSession") }
        if traits.contains(.adjustable) { result.append("adjustable") }
        if traits.contains(.allowsDirectInteraction) { result.append("allowsDirectInteraction") }
        if traits.contains(.causesPageTurn) { result.append("causesPageTurn") }
        if traits.contains(.tabBar) { result.append("tabBar") }

        return result
    }
}

// MARK: - Suggested Actions

/// Determines the best action to suggest for an element type
enum SuggestedActionMapper {
    static func action(for node: ElementNode) -> String? {
        // If not interactable, no action suggested
        guard node.isEnabled && node.isHittable else { return nil }

        switch node.type {
        case "button", "link", "menuItem", "tab", "cell":
            return "tap"
        case "textField", "secureTextField", "searchField", "textView":
            return "inputText"
        case "switch", "toggle", "checkBox":
            return "tap (toggle)"
        case "slider":
            return "adjustSlider"
        case "picker", "pickerWheel", "datePicker":
            return "adjustPicker"
        case "scrollView", "table", "collectionView":
            return "scroll"
        case "segmentedControl":
            return "tap (segment)"
        case "stepper":
            return "tap (increment/decrement)"
        default:
            // Check if it has button-like traits
            if node.traits.contains("button") {
                return "tap"
            }
            if node.traits.contains("adjustable") {
                return "adjust"
            }
            return nil
        }
    }

    static func bestTargetId(for node: ElementNode) -> String? {
        // Prefer identifier if available (most stable)
        if let identifier = node.identifier, !identifier.isEmpty {
            return "id:\(identifier)"
        }

        // Then label (might change with localization)
        if let label = node.label, !label.isEmpty {
            return "label:\(label)"
        }

        // Then title
        if let title = node.title, !title.isEmpty {
            return "title:\(title)"
        }

        // Then value for text elements
        if let value = node.value, !value.isEmpty {
            return "text:\(value)"
        }

        // Fall back to coordinates
        if node.frame.isVisible {
            let center = node.frame.center
            return "point:\(Int(center.x)),\(Int(center.y))"
        }

        return nil
    }
}

// MARK: - Element Statistics

/// Summary statistics about the UI hierarchy
struct ElementStats: Codable {
    let totalElements: Int
    let interactableElements: Int
    let identifiedElements: Int  // Elements with accessibility identifiers
    let labeledElements: Int     // Elements with labels
    let buttons: Int
    let textFields: Int
    let textElements: Int
    let images: Int
    let scrollViews: Int
    let tables: Int
    let alerts: Int

    /// Elements that might need accessibility improvements
    let warnings: [AccessibilityWarning]
}

/// Warning about potential accessibility issues
struct AccessibilityWarning: Codable {
    let type: String           // "missing_identifier", "missing_label", "zero_size"
    let elementType: String    // Type of the problematic element
    let description: String    // Human-readable description
    let frame: ElementFrame?   // Location of the element
    let suggestedFix: String?  // How to fix the issue
}
