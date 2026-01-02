import XCTest

/// Main inspection logic for extracting UI hierarchy from XCUIApplication.
///
/// This class traverses the XCUIElement tree and converts it to
/// a serializable ElementNode structure for consumption by TypeScript/Node.js.
///
/// Usage:
/// ```swift
/// let app = XCUIApplication()
/// app.activate()
///
/// let inspector = UIInspector(app: app)
/// let result = inspector.inspect()
/// print(result.toJSON())
/// ```

class UIInspector {
    // MARK: - Configuration

    /// Configuration options for inspection
    struct Options {
        /// Maximum depth to traverse (nil = unlimited)
        var maxDepth: Int?

        /// Whether to include hidden elements (non-visible frames)
        var includeHidden: Bool

        /// Whether to include frame/position data
        var includeFrames: Bool

        /// Whether to include child elements
        var includeChildren: Bool

        /// Timeout for element queries (in seconds)
        var queryTimeout: TimeInterval

        /// Whether to capture accessibility warnings
        var captureWarnings: Bool

        /// Element types to skip entirely
        var skipTypes: Set<XCUIElement.ElementType>

        /// Default options
        static var `default`: Options {
            Options(
                maxDepth: nil,
                includeHidden: false,
                includeFrames: true,
                includeChildren: true,
                queryTimeout: 5.0,
                captureWarnings: true,
                skipTypes: []
            )
        }

        /// Options for quick overview (limited depth)
        static var quick: Options {
            var opts = Options.default
            opts.maxDepth = 3
            opts.captureWarnings = false
            return opts
        }
    }

    // MARK: - Properties

    private let app: XCUIApplication
    private var options: Options
    private var warnings: [AccessibilityWarning] = []
    private var elementPath: [String] = []

    // Statistics counters
    private var totalElements = 0
    private var interactableCount = 0
    private var identifiedCount = 0
    private var labeledCount = 0
    private var buttonCount = 0
    private var textFieldCount = 0
    private var textElementCount = 0
    private var imageCount = 0
    private var scrollViewCount = 0
    private var tableCount = 0
    private var alertCount = 0

    // MARK: - Initialization

    init(app: XCUIApplication, options: Options = .default) {
        self.app = app
        self.options = options
    }

    // MARK: - Main Inspection

    /// Perform UI inspection and return structured result
    func inspect() -> InspectorResult {
        // Reset state
        warnings.removeAll()
        elementPath.removeAll()
        resetCounters()

        // Ensure app is running
        guard app.state == .runningForeground else {
            return InspectorResult(
                success: false,
                error: "Application is not running in foreground (state: \(app.state.rawValue))",
                bundleId: app.description,
                rootElement: nil,
                stats: nil,
                timestamp: Date()
            )
        }

        // Traverse the element tree starting from the app
        let rootNode = traverseElement(app, depth: 0)

        // Build stats
        let stats = ElementStats(
            totalElements: totalElements,
            interactableElements: interactableCount,
            identifiedElements: identifiedCount,
            labeledElements: labeledCount,
            buttons: buttonCount,
            textFields: textFieldCount,
            textElements: textElementCount,
            images: imageCount,
            scrollViews: scrollViewCount,
            tables: tableCount,
            alerts: alertCount,
            warnings: warnings
        )

        return InspectorResult(
            success: true,
            error: nil,
            bundleId: extractBundleId(),
            rootElement: rootNode,
            stats: stats,
            timestamp: Date()
        )
    }

    /// Inspect a specific element by identifier
    func inspectElement(identifier: String) -> ElementNode? {
        let query = app.descendants(matching: .any).matching(identifier: identifier)
        guard query.count > 0 else { return nil }
        return traverseElement(query.firstMatch, depth: 0)
    }

    /// Inspect elements matching a predicate
    func inspectElements(predicate: NSPredicate) -> [ElementNode] {
        let query = app.descendants(matching: .any).matching(predicate)
        return (0..<query.count).compactMap { index in
            traverseElement(query.element(boundBy: index), depth: 0)
        }
    }

    // MARK: - Tree Traversal

    private func traverseElement(_ element: XCUIElement, depth: Int) -> ElementNode? {
        // Check depth limit
        if let maxDepth = options.maxDepth, depth > maxDepth {
            return nil
        }

        // Skip if element doesn't exist
        guard element.exists else { return nil }

        let elementType = element.elementType

        // Skip certain element types
        if options.skipTypes.contains(elementType) {
            return nil
        }

        // Get frame
        let frame = element.frame
        let elementFrame = ElementFrame(
            x: frame.origin.x,
            y: frame.origin.y,
            width: frame.size.width,
            height: frame.size.height
        )

        // Skip hidden elements if configured
        if !options.includeHidden && !elementFrame.isVisible {
            return nil
        }

        // Extract properties with error handling
        let identifier = safeString(element.identifier)
        let label = safeString(element.label)
        let value = safeStringValue(element.value)
        let placeholderValue = safeString(element.placeholderValue)
        let title = safeString(element.title)

        // Build element path for debugging
        let typeString = ElementTypeMapper.string(from: elementType)
        elementPath.append(buildPathComponent(type: typeString, identifier: identifier, label: label))

        // Get accessibility traits
        // Note: XCUIElement doesn't expose traits directly, we infer from type
        let traits = inferTraits(from: element)

        // Build the node
        var node = ElementNode(
            type: typeString,
            identifier: identifier,
            label: label,
            value: value,
            placeholderValue: placeholderValue,
            hint: nil, // XCUIElement doesn't expose hint directly
            title: title,
            frame: options.includeFrames ? elementFrame : ElementFrame(x: 0, y: 0, width: 0, height: 0),
            isEnabled: element.isEnabled,
            isSelected: element.isSelected,
            isFocused: false, // XCUIElement doesn't expose focus state directly
            exists: element.exists,
            isHittable: element.isHittable,
            isVisible: elementFrame.isVisible,
            traits: traits,
            children: [],
            elementPath: elementPath.joined(separator: " > "),
            suggestedAction: nil,
            bestTargetId: nil
        )

        // Calculate suggested action and best target
        node = ElementNode(
            type: node.type,
            identifier: node.identifier,
            label: node.label,
            value: node.value,
            placeholderValue: node.placeholderValue,
            hint: node.hint,
            title: node.title,
            frame: node.frame,
            isEnabled: node.isEnabled,
            isSelected: node.isSelected,
            isFocused: node.isFocused,
            exists: node.exists,
            isHittable: node.isHittable,
            isVisible: node.isVisible,
            traits: node.traits,
            children: node.children,
            elementPath: node.elementPath,
            suggestedAction: SuggestedActionMapper.action(for: node),
            bestTargetId: SuggestedActionMapper.bestTargetId(for: node)
        )

        // Update statistics
        updateStats(for: node, elementType: elementType)

        // Check for accessibility issues
        if options.captureWarnings {
            checkAccessibilityIssues(node: node, elementType: elementType, frame: elementFrame)
        }

        // Traverse children if enabled
        if options.includeChildren {
            let children = traverseChildren(of: element, depth: depth + 1)
            node = ElementNode(
                type: node.type,
                identifier: node.identifier,
                label: node.label,
                value: node.value,
                placeholderValue: node.placeholderValue,
                hint: node.hint,
                title: node.title,
                frame: node.frame,
                isEnabled: node.isEnabled,
                isSelected: node.isSelected,
                isFocused: node.isFocused,
                exists: node.exists,
                isHittable: node.isHittable,
                isVisible: node.isVisible,
                traits: node.traits,
                children: children,
                elementPath: node.elementPath,
                suggestedAction: node.suggestedAction,
                bestTargetId: node.bestTargetId
            )
        }

        elementPath.removeLast()

        return node
    }

    private func traverseChildren(of element: XCUIElement, depth: Int) -> [ElementNode] {
        var children: [ElementNode] = []

        // Query all child elements
        let childElements = element.children(matching: .any)
        let count = childElements.count

        for i in 0..<count {
            let child = childElements.element(boundBy: i)
            if let childNode = traverseElement(child, depth: depth) {
                children.append(childNode)
            }
        }

        return children
    }

    // MARK: - Statistics

    private func resetCounters() {
        totalElements = 0
        interactableCount = 0
        identifiedCount = 0
        labeledCount = 0
        buttonCount = 0
        textFieldCount = 0
        textElementCount = 0
        imageCount = 0
        scrollViewCount = 0
        tableCount = 0
        alertCount = 0
    }

    private func updateStats(for node: ElementNode, elementType: XCUIElement.ElementType) {
        totalElements += 1

        if node.identifier != nil && !node.identifier!.isEmpty {
            identifiedCount += 1
        }

        if node.label != nil && !node.label!.isEmpty {
            labeledCount += 1
        }

        if node.isEnabled && node.isHittable {
            interactableCount += 1
        }

        switch elementType {
        case .button, .link:
            buttonCount += 1
        case .textField, .secureTextField, .searchField:
            textFieldCount += 1
        case .staticText, .textView:
            textElementCount += 1
        case .image, .icon:
            imageCount += 1
        case .scrollView:
            scrollViewCount += 1
        case .table, .collectionView:
            tableCount += 1
        case .alert:
            alertCount += 1
        default:
            break
        }
    }

    // MARK: - Accessibility Checks

    private func checkAccessibilityIssues(
        node: ElementNode,
        elementType: XCUIElement.ElementType,
        frame: ElementFrame
    ) {
        // Interactable elements should have identifiers
        if isInteractableType(elementType) && node.isEnabled {
            if node.identifier == nil || node.identifier!.isEmpty {
                warnings.append(AccessibilityWarning(
                    type: "missing_identifier",
                    elementType: node.type,
                    description: "Interactive \(node.type) without accessibility identifier",
                    frame: frame,
                    suggestedFix: "Add accessibilityIdentifier to this element"
                ))
            }

            if node.label == nil || node.label!.isEmpty {
                // Buttons without labels might rely on images
                if elementType == .button {
                    warnings.append(AccessibilityWarning(
                        type: "missing_label",
                        elementType: node.type,
                        description: "Button without accessibility label",
                        frame: frame,
                        suggestedFix: "Add accessibilityLabel for VoiceOver users"
                    ))
                }
            }
        }

        // Check for zero-size interactive elements
        if isInteractableType(elementType) && !frame.isVisible {
            warnings.append(AccessibilityWarning(
                type: "zero_size",
                elementType: node.type,
                description: "\(node.type) has zero size but exists in hierarchy",
                frame: frame,
                suggestedFix: "Check if element is properly laid out or should be removed"
            ))
        }
    }

    private func isInteractableType(_ type: XCUIElement.ElementType) -> Bool {
        switch type {
        case .button, .link, .textField, .secureTextField, .searchField,
             .switch, .toggle, .slider, .stepper, .picker, .datePicker,
             .segmentedControl, .menuItem, .tab, .cell:
            return true
        default:
            return false
        }
    }

    // MARK: - Helpers

    private func safeString(_ value: String) -> String? {
        value.isEmpty ? nil : value
    }

    private func safeStringValue(_ value: Any) -> String? {
        guard let str = value as? String, !str.isEmpty else { return nil }
        return str
    }

    private func inferTraits(from element: XCUIElement) -> [String] {
        var traits: [String] = []

        switch element.elementType {
        case .button:
            traits.append("button")
        case .link:
            traits.append("link")
        case .staticText:
            traits.append("staticText")
        case .image, .icon:
            traits.append("image")
        case .searchField:
            traits.append("searchField")
        case .header:
            traits.append("header")
        default:
            break
        }

        if element.isSelected {
            traits.append("selected")
        }

        if !element.isEnabled {
            traits.append("notEnabled")
        }

        return traits
    }

    private func buildPathComponent(type: String, identifier: String?, label: String?) -> String {
        if let id = identifier, !id.isEmpty {
            return "\(type)#\(id)"
        } else if let lbl = label, !lbl.isEmpty {
            let shortLabel = lbl.prefix(20)
            return "\(type)[\"\(shortLabel)\"]"
        } else {
            return type
        }
    }

    private func extractBundleId() -> String {
        // XCUIApplication doesn't directly expose bundle ID
        // We can try to extract it from the description or use a placeholder
        let desc = app.description
        if let range = desc.range(of: "pid:\\d+", options: .regularExpression) {
            return String(desc[range])
        }
        return "unknown"
    }
}

// MARK: - Application State Extension

extension XCUIApplication.State {
    var rawValue: Int {
        switch self {
        case .unknown: return 0
        case .notRunning: return 1
        case .runningBackgroundSuspended: return 2
        case .runningBackground: return 3
        case .runningForeground: return 4
        @unknown default: return -1
        }
    }
}
