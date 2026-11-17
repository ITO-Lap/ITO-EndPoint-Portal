import Foundation
import IOKit

enum DeviceIdentity {
    static var serialNumber: String {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOPlatformExpertDevice"))
        guard service != 0 else { return "unavailable" }
        defer { IOObjectRelease(service) }
        guard let value = IORegistryEntryCreateCFProperty(
            service,
            "IOPlatformSerialNumber" as CFString,
            kCFAllocatorDefault,
            0
        )?.takeRetainedValue() as? String else { return "unavailable" }
        return value
    }

    static var hostname: String {
        Host.current().localizedName ?? ProcessInfo.processInfo.hostName
    }

    static var loggedInUser: String {
        NSUserName()
    }
}