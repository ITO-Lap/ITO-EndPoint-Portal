import SwiftUI

struct ManagedSettingsNotificationsTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Presets") {
                HStack {
                    ForEach(NotificationPreset.allCases) { preset in
                        Button(preset.rawValue) { viewModel.applyNotificationPreset(preset) }
                            .buttonStyle(.bordered)
                    }
                }
            }

            SectionCard(title: "Notification Settings") {
                VStack(spacing: 8) {
                    toggleCard(
                        name: "Allow Notifications",
                        selection: $viewModel.notificationSettings.allowNotifications,
                        explanation: "Master switch for whether this app may post notifications at all."
                    )
                    toggleCard(
                        name: "Notification Center",
                        selection: $viewModel.notificationSettings.showInNotificationCenter,
                        explanation: "Show this app's notifications in Notification Center."
                    )
                    toggleCard(
                        name: "Lock Screen",
                        selection: $viewModel.notificationSettings.showOnLockScreen,
                        explanation: "Show this app's notifications on the lock screen."
                    )
                    toggleCard(
                        name: "Sounds",
                        selection: $viewModel.notificationSettings.playSounds,
                        explanation: "Play a sound when this app posts a notification."
                    )
                    toggleCard(
                        name: "Badges",
                        selection: $viewModel.notificationSettings.showBadges,
                        explanation: "Show a badge on this app's Dock icon."
                    )

                    ManagedControlCard(
                        name: "Alert Style",
                        currentSelection: viewModel.notificationSettings.alertStyle.rawValue,
                        explanation: "None disables alerts entirely; Banner auto-dismisses; Alert requires dismissal.",
                        payloadType: "com.apple.notificationsettings",
                        macOSCompatibility: "macOS 10.12+",
                        isRequired: false,
                        status: .requiresMDM,
                        trailing: {
                            Picker("", selection: $viewModel.notificationSettings.alertStyle) {
                                ForEach(NotificationAlertStyle.allCases) { Text($0.rawValue).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 220)
                            .labelsHidden()
                        }
                    )

                    ManagedControlCard(
                        name: "Notification Grouping",
                        currentSelection: viewModel.notificationSettings.grouping.rawValue,
                        explanation: "Controls how this app's notifications are grouped in Notification Center.",
                        payloadType: "com.apple.notificationsettings",
                        macOSCompatibility: "macOS 10.14+",
                        isRequired: false,
                        status: .requiresMDM,
                        trailing: {
                            Picker("", selection: $viewModel.notificationSettings.grouping) {
                                ForEach(NotificationGrouping.allCases) { Text($0.rawValue).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 220)
                            .labelsHidden()
                        }
                    )
                }
            }
        }
    }

    private func toggleCard(name: String, selection: Binding<Bool>, explanation: String) -> some View {
        ManagedControlCard(
            name: name,
            currentSelection: selection.wrappedValue ? "On" : "Off",
            explanation: explanation,
            payloadType: "com.apple.notificationsettings",
            macOSCompatibility: "macOS 10.12+",
            isRequired: false,
            status: .requiresMDM,
            trailing: {
                Toggle("", isOn: selection).labelsHidden()
            }
        )
    }
}
