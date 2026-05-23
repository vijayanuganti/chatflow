import Foundation
import Capacitor
import UniformTypeIdentifiers

@objc public class ChatFlowShareStore: NSObject {
    private static var pending: [[String: Any]] = []
    private static let lock = NSLock()

    @objc public static func add(_ item: [String: Any]) {
        lock.lock()
        pending.append(item)
        lock.unlock()
    }

    @objc public static func snapshot() -> [[String: Any]] {
        lock.lock()
        let copy = pending
        lock.unlock()
        return copy
    }

    @objc public static func clear() {
        lock.lock()
        pending.removeAll()
        lock.unlock()
    }

    @objc public static func ingestText(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        add([
            "id": UUID().uuidString,
            "mimeType": "text/plain",
            "text": trimmed,
            "name": "Shared text",
            "size": trimmed.count,
        ])
    }

    @objc public static func ingestFileURL(_ url: URL) {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess { url.stopAccessingSecurityScopedResource() }
        }
        let fm = FileManager.default
        let cache = fm.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("shared_intent", isDirectory: true)
        guard let cacheDir = cache else { return }
        try? fm.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        let id = UUID().uuidString
        let name = url.lastPathComponent.isEmpty ? "shared-\(id)" : url.lastPathComponent
        let dest = cacheDir.appendingPathComponent("\(id)_\(name)")
        do {
            if fm.fileExists(atPath: dest.path) {
                try fm.removeItem(at: dest)
            }
            try fm.copyItem(at: url, to: dest)
            let attrs = try fm.attributesOfItem(atPath: dest.path)
            let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
            let mime = mimeType(for: dest, fallback: nil)
            add([
                "id": id,
                "path": dest.path,
                "name": name,
                "mimeType": mime,
                "size": size,
            ])
        } catch {
            NSLog("ChatFlowShare ingestFileURL failed: \(error)")
        }
    }

    private static func mimeType(for url: URL, fallback: String?) -> String {
        if let ext = url.pathExtension.isEmpty ? nil : url.pathExtension,
           let uti = UTType(filenameExtension: ext),
           let mime = uti.preferredMIMEType {
            return mime
        }
        return fallback ?? "application/octet-stream"
    }
}

@objc(ChatFlowSharePlugin)
public class ChatFlowSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ChatFlowSharePlugin"
    public let jsName = "ChatFlowShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShares", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShares", returnType: CAPPluginReturnPromise),
    ]

    @objc func getPendingShares(_ call: CAPPluginCall) {
        let items = ChatFlowShareStore.snapshot()
        call.resolve(["items": items])
    }

    @objc func clearPendingShares(_ call: CAPPluginCall) {
        ChatFlowShareStore.clear()
        call.resolve()
    }

    @objc public static func notifyIfPending(plugin: ChatFlowSharePlugin?) {
        guard let plugin = plugin, !ChatFlowShareStore.snapshot().isEmpty else { return }
        plugin.notifyListeners("shareReceived", data: [:])
    }
}
