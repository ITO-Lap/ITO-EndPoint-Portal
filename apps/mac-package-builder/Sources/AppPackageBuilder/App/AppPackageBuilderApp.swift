import SwiftUI
import AppKit

/// This target ships as a bare Mach-O executable (via `swift build`/`swift run`),
/// not a signed `.app` bundle with an `Info.plist`. Without one, LaunchServices
/// has no `LSUIElement`/bundle info to infer a UI role from, so the process can
/// come up with an activation policy that never becomes the key window no
/// matter what a run loop does later — `applicationDidFinishLaunching` is the
/// earliest point `NSApp` is guaranteed fully set up to force the correct policy.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        var problems: [String] = []
        if let bootstrapError = AppEnvironment.bootstrap() { problems.append(bootstrapError) }
        problems += AppEnvironment.validateBundle().map(\.message)
        AppEnvironment.logOptionalTools()
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        for window in NSApp.windows {
            window.makeKeyAndOrderFront(nil)
        }
        if !problems.isEmpty {
            DispatchQueue.main.async { AppEnvironment.presentStartupProblems(problems) }
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        for window in NSApp.windows {
            window.makeKeyAndOrderFront(nil)
        }
    }
}

@main
struct AppPackageBuilderApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settings = SettingsStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(settings)
                .frame(minWidth: 1080, minHeight: 700)
                .tint(AppTheme.accent)
                // The "modern AI" theme is a light design (vibrant accent on
                // a light surface); force light appearance so it doesn't
                // flip to the system dark controlBackgroundColor/etc.
                .preferredColorScheme(.light)
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}
