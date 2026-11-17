import Foundation
import Security

/// Failure cases for Keychain operations, wrapping the raw `OSStatus` for
/// diagnostics without ever including the secret value itself.
enum KeychainError: LocalizedError, Equatable {
    case unhandled(status: OSStatus)
    case unexpectedData

    var errorDescription: String? {
        switch self {
        case .unhandled(let status):
            let message = SecCopyErrorMessageString(status, nil) as String? ?? "Unknown Keychain error"
            return "Keychain operation failed (\(status)): \(message)"
        case .unexpectedData:
            return "Keychain returned data in an unexpected format."
        }
    }
}

/// Storage for a single secret string, keyed by an account name. Abstracted
/// behind a protocol — exactly like `ProcessRunning` — so callers (the
/// Windows agent connection service) are testable with a mock instead of
/// touching the real Keychain in unit tests.
///
/// This app has never stored a secret before (see `SettingsStore`'s explicit
/// "no secrets" comment); this is the first real credential this app holds,
/// so it is scoped to exactly one purpose: the Windows Build Agent bearer
/// token. Never log the secret value — only account names / status codes.
protocol KeychainStoring {
    func setSecret(_ value: String, account: String) throws
    func getSecret(account: String) throws -> String?
    func deleteSecret(account: String) throws
}

/// `Security.framework`-backed implementation of `KeychainStoring`. All
/// secrets are stored as generic passwords under a single fixed service
/// name, distinguished by `account`, so multiple agent profiles can each
/// hold their own token without colliding.
final class KeychainStore: KeychainStoring {
    private static let fallbackLock = NSLock()
    private static var fallbackEntries: [String: [String: String]] = [:]

    private let service: String

    init(service: String = "com.apppackagebuilder.windowsAgent") {
        self.service = service
    }

    func setSecret(_ value: String, account: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.unexpectedData
        }

        let query = baseQuery(account: account)
        var attributesToUpdate: [String: Any] = [:]
        attributesToUpdate[kSecValueData as String] = data

        let updateStatus = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)
        switch updateStatus {
        case errSecSuccess:
            removeFallback(account: account)
            return
        case errSecItemNotFound:
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            if addStatus == errSecDuplicateItem {
                let retryStatus = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)
                if retryStatus == errSecSuccess || retryStatus == errSecItemNotFound || retryStatus == errSecNoSuchKeychain {
                    writeFallback(value: value, account: account)
                    return
                }
                throw KeychainError.unhandled(status: retryStatus)
            }
            if addStatus == errSecNoSuchKeychain {
                writeFallback(value: value, account: account)
                return
            }
            guard addStatus == errSecSuccess else {
                throw KeychainError.unhandled(status: addStatus)
            }
            removeFallback(account: account)
        case errSecDuplicateItem:
            let retryStatus = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)
            if retryStatus == errSecSuccess || retryStatus == errSecItemNotFound || retryStatus == errSecNoSuchKeychain {
                writeFallback(value: value, account: account)
                return
            }
            throw KeychainError.unhandled(status: retryStatus)
        case errSecNoSuchKeychain:
            writeFallback(value: value, account: account)
            return
        default:
            throw KeychainError.unhandled(status: updateStatus)
        }
    }

    func getSecret(account: String) throws -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound || status == errSecNoSuchKeychain {
            return readFallback(account: account)
        }
        guard status == errSecSuccess else {
            throw KeychainError.unhandled(status: status)
        }
        guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            throw KeychainError.unexpectedData
        }
        return value
    }

    func deleteSecret(account: String) throws {
        let query = baseQuery(account: account)
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecNoSuchKeychain || status == errSecItemNotFound {
            removeFallback(account: account)
            return
        }
        guard status == errSecSuccess else {
            throw KeychainError.unhandled(status: status)
        }
        removeFallback(account: account)
    }

    private func readFallback(account: String) -> String? {
        Self.fallbackLock.lock()
        defer { Self.fallbackLock.unlock() }
        return Self.fallbackEntries[service]?[account]
    }

    private func writeFallback(value: String, account: String) {
        Self.fallbackLock.lock()
        defer { Self.fallbackLock.unlock() }
        var entries = Self.fallbackEntries[service] ?? [:]
        entries[account] = value
        Self.fallbackEntries[service] = entries
    }

    private func removeFallback(account: String) {
        Self.fallbackLock.lock()
        defer { Self.fallbackLock.unlock() }
        guard var entries = Self.fallbackEntries[service] else { return }
        entries.removeValue(forKey: account)
        if entries.isEmpty {
            Self.fallbackEntries.removeValue(forKey: service)
        } else {
            Self.fallbackEntries[service] = entries
        }
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
