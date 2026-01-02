import Foundation

/// JSON serialization for UI inspection results.
///
/// This file handles converting the inspection results to JSON format
/// that can be consumed by the TypeScript/Node.js side.

// MARK: - Inspector Result

/// The complete result of a UI inspection
struct InspectorResult: Codable {
    /// Whether the inspection succeeded
    let success: Bool

    /// Error message if inspection failed
    let error: String?

    /// App bundle identifier
    let bundleId: String

    /// Root element of the UI tree
    let rootElement: ElementNode?

    /// Statistics about the UI
    let stats: ElementStats?

    /// Timestamp of the inspection
    let timestamp: Date

    // MARK: - JSON Output

    /// Convert to JSON string with pretty printing
    func toJSON() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        do {
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return """
            {
                "success": false,
                "error": "Failed to encode result: \(error.localizedDescription)"
            }
            """
        }
    }

    /// Convert to compact JSON string (no formatting)
    func toCompactJSON() -> String {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        do {
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return """
            {"success":false,"error":"Failed to encode result: \(error.localizedDescription)"}
            """
        }
    }

    /// Write JSON to file
    func writeToFile(_ path: String) throws {
        let json = toJSON()
        try json.write(toFile: path, atomically: true, encoding: .utf8)
    }
}

// MARK: - Output Writer

/// Handles writing inspection output to stdout/file for consumption by Node.js
class InspectorOutputWriter {
    /// Marker to identify start of JSON output in stdout
    static let outputStartMarker = "<<<MAESTRO_INSPECT_OUTPUT_START>>>"

    /// Marker to identify end of JSON output in stdout
    static let outputEndMarker = "<<<MAESTRO_INSPECT_OUTPUT_END>>>"

    /// Write result to stdout with markers
    static func writeToStdout(_ result: InspectorResult) {
        print(outputStartMarker)
        print(result.toJSON())
        print(outputEndMarker)
        fflush(stdout)
    }

    /// Write result to file and print path to stdout
    static func writeToFile(_ result: InspectorResult, path: String) {
        do {
            try result.writeToFile(path)
            print("\(outputStartMarker)")
            print("{\"outputPath\": \"\(path)\"}")
            print("\(outputEndMarker)")
        } catch {
            print("\(outputStartMarker)")
            print("{\"success\": false, \"error\": \"Failed to write to file: \(error.localizedDescription)\"}")
            print("\(outputEndMarker)")
        }
        fflush(stdout)
    }

    /// Write error to stdout
    static func writeError(_ message: String) {
        let result = InspectorResult(
            success: false,
            error: message,
            bundleId: "unknown",
            rootElement: nil,
            stats: nil,
            timestamp: Date()
        )
        writeToStdout(result)
    }
}

// MARK: - JSON Extensions

extension ElementNode {
    /// Convert single element to JSON
    func toJSON() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        do {
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return "{}"
        }
    }
}

extension ElementStats {
    /// Convert stats to JSON
    func toJSON() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        do {
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return "{}"
        }
    }
}

// MARK: - Query Results

/// Result of an element query operation
struct QueryResult: Codable {
    /// Whether the query succeeded
    let success: Bool

    /// Error message if query failed
    let error: String?

    /// Number of matching elements
    let count: Int

    /// Matching elements
    let elements: [ElementNode]

    /// Query that was executed
    let query: String

    func toJSON() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        do {
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return "{}"
        }
    }
}

// MARK: - Condensed Output

/// A condensed version of the element tree for overview
struct CondensedElement: Codable {
    let type: String
    let identifier: String?
    let label: String?
    let isInteractable: Bool
    let children: [CondensedElement]

    init(from node: ElementNode) {
        self.type = node.type
        self.identifier = node.identifier
        self.label = node.label
        self.isInteractable = node.isEnabled && node.isHittable
        self.children = node.children.map { CondensedElement(from: $0) }
    }
}

/// Condensed inspection result for quick overview
struct CondensedResult: Codable {
    let success: Bool
    let elementCount: Int
    let interactableCount: Int
    let tree: CondensedElement?

    init(from result: InspectorResult) {
        self.success = result.success
        self.elementCount = result.stats?.totalElements ?? 0
        self.interactableCount = result.stats?.interactableElements ?? 0
        self.tree = result.rootElement.map { CondensedElement(from: $0) }
    }

    func toJSON() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        do {
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return "{}"
        }
    }
}

// MARK: - ASCII Tree Output

extension InspectorResult {
    /// Generate ASCII tree representation for debugging
    func toAsciiTree(maxDepth: Int = 10) -> String {
        guard let root = rootElement else {
            return "(no elements)"
        }

        var output = ""
        appendAsciiNode(root, to: &output, prefix: "", isLast: true, depth: 0, maxDepth: maxDepth)
        return output
    }

    private func appendAsciiNode(
        _ node: ElementNode,
        to output: inout String,
        prefix: String,
        isLast: Bool,
        depth: Int,
        maxDepth: Int
    ) {
        guard depth <= maxDepth else {
            if depth == maxDepth + 1 && !node.children.isEmpty {
                output += prefix + (isLast ? "└── " : "├── ") + "... (\(node.children.count) more)\n"
            }
            return
        }

        // Build node representation
        var nodeStr = node.type

        if let id = node.identifier, !id.isEmpty {
            nodeStr += " #\(id)"
        }

        if let label = node.label, !label.isEmpty {
            let shortLabel = label.prefix(30)
            nodeStr += " \"\(shortLabel)\""
        }

        if node.isEnabled && node.isHittable {
            nodeStr += " [tappable]"
        }

        output += prefix + (isLast ? "└── " : "├── ") + nodeStr + "\n"

        // Process children
        let childPrefix = prefix + (isLast ? "    " : "│   ")
        for (index, child) in node.children.enumerated() {
            let isLastChild = index == node.children.count - 1
            appendAsciiNode(child, to: &output, prefix: childPrefix, isLast: isLastChild, depth: depth + 1, maxDepth: maxDepth)
        }
    }
}

// MARK: - Markdown Output

extension InspectorResult {
    /// Generate markdown table of interactable elements
    func toMarkdownTable() -> String {
        guard let root = rootElement else {
            return "*No elements found*"
        }

        var elements: [ElementNode] = []
        collectInteractableElements(root, into: &elements)

        if elements.isEmpty {
            return "*No interactable elements found*"
        }

        var output = "| Type | Identifier | Label | Hittable |\n"
        output += "|------|------------|-------|----------|\n"

        for element in elements {
            let type = element.type
            let id = element.identifier ?? "-"
            let label = element.label ?? "-"
            let hittable = element.isHittable ? "Yes" : "No"
            output += "| \(type) | \(id) | \(label) | \(hittable) |\n"
        }

        return output
    }

    private func collectInteractableElements(_ node: ElementNode, into array: inout [ElementNode]) {
        if node.isEnabled && (node.isHittable || isInteractableType(node.type)) {
            array.append(node)
        }

        for child in node.children {
            collectInteractableElements(child, into: &array)
        }
    }

    private func isInteractableType(_ type: String) -> Bool {
        let interactableTypes: Set<String> = [
            "button", "link", "textField", "secureTextField", "searchField",
            "switch", "toggle", "slider", "stepper", "picker", "datePicker",
            "segmentedControl", "menuItem", "tab", "cell"
        ]
        return interactableTypes.contains(type)
    }
}

// MARK: - Element Flattening

extension InspectorResult {
    /// Get all elements as a flat list
    func flattenElements() -> [ElementNode] {
        guard let root = rootElement else { return [] }

        var elements: [ElementNode] = []
        flattenNode(root, into: &elements)
        return elements
    }

    private func flattenNode(_ node: ElementNode, into array: inout [ElementNode]) {
        array.append(node)
        for child in node.children {
            flattenNode(child, into: &array)
        }
    }
}
