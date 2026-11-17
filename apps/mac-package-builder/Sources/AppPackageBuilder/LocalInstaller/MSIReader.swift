import Foundation

enum MSIReaderError: LocalizedError, Equatable {
    case notAnMSI
    case corrupt(String)
    case missingPropertyTable

    var errorDescription: String? {
        switch self {
        case .notAnMSI: return "This is not an MSI (Windows Installer) database."
        case .corrupt(let m): return "The MSI file is damaged or unsupported: \(m)"
        case .missingPropertyTable: return "The MSI has no Property table."
        }
    }
}

struct MSIProperties: Equatable {
    var properties: [String: String]
    var architecture: LocalArchitecture?

    var productCode: String? { properties["ProductCode"].flatMap { $0.isEmpty ? nil : $0 } }
    var upgradeCode: String? { properties["UpgradeCode"].flatMap { $0.isEmpty ? nil : $0 } }
    var productName: String? { properties["ProductName"]?.trimmingCharacters(in: .whitespaces).nilIfEmpty }
    var productVersion: String? { properties["ProductVersion"]?.trimmingCharacters(in: .whitespaces).nilIfEmpty }
    var manufacturer: String? { properties["Manufacturer"]?.trimmingCharacters(in: .whitespaces).nilIfEmpty }
}

private extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

/// Reads ProductCode, ProductVersion, Manufacturer, ProductName, UpgradeCode and the target architecture from an `.msi`
/// WITHOUT Windows: an MSI is an OLE compound file; we parse its container, then decode the Property table and the
/// SummaryInformation template from their documented stream layouts. Read-only; nothing is executed or extracted to disk.
/// Only the small metadata streams are read (never the embedded cabinets), so multi-hundred-MB MSIs are fast.
enum MSIReader {
    private static let freeSector: UInt32 = 0xFFFF_FFFF, endOfChain: UInt32 = 0xFFFF_FFFE
    private static let fatSector: UInt32 = 0xFFFF_FFFD, difSector: UInt32 = 0xFFFF_FFFC

    // MARK: Public

    static func read(_ url: URL) throws -> MSIProperties {
        let streams = try CompoundFile(url: url).streams()
        var byName: [String: CompoundFile.Stream] = [:]
        for s in streams { byName[decodeStreamName(s.name)] = s }

        guard let pool = byName["!_StringPool"], let data = byName["!_StringData"], let prop = byName["!Property"] else {
            throw MSIReaderError.missingPropertyTable
        }
        let (strings, refSize) = try parseStringPool(pool: try pool.read(), data: try data.read())
        let props = parsePropertyTable(try prop.read(), strings: strings, refSize: refSize)

        var arch: LocalArchitecture?
        if let summary = byName.first(where: { $0.key.hasSuffix("SummaryInformation") })?.value, let bytes = try? summary.read() {
            arch = architecture(fromTemplate: template(fromSummary: bytes))
        }
        return MSIProperties(properties: props, architecture: arch)
    }

    // MARK: Stream names (two characters are packed into one UTF-16 unit; U+4840 prefixes a table)

    private static let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._")

    static func decodeStreamName(_ name: String) -> String {
        var out = ""
        for unit in name.utf16 {
            let c = Int(unit)
            if c >= 0x3800 && c < 0x4800 {
                let v = c - 0x3800
                out.append(alphabet[v & 0x3F]); out.append(alphabet[(v >> 6) & 0x3F])
            } else if c >= 0x4800 && c < 0x4840 {
                out.append(alphabet[c - 0x4800])
            } else if c == 0x4840 {
                out.append("!")
            } else if let scalar = Unicode.Scalar(unit) {
                out.append(Character(scalar))
            }
        }
        return out
    }

    static func encodeStreamName(_ name: String, table: Bool = true) -> String {
        var units: [UInt16] = table ? [0x4840] : []
        let chars = Array(name)
        var i = 0
        while i < chars.count {
            let a = alphabet.firstIndex(of: chars[i]) ?? 0
            if i + 1 < chars.count, let b = alphabet.firstIndex(of: chars[i + 1]) { units.append(UInt16(0x3800 + a + (b << 6))) }
            else { units.append(UInt16(0x4800 + a)) }
            i += 2
        }
        return String(utf16CodeUnits: units, count: units.count)
    }

    // MARK: Tables

    static func parseStringPool(pool: Data, data: Data) throws -> (strings: [String], refSize: Int) {
        guard pool.count >= 4 else { throw MSIReaderError.corrupt("string pool is empty") }
        let header = pool.u32(0)
        let refSize = header & 0x8000_0000 != 0 ? 3 : 2
        let encoding: String.Encoding = (header & 0x7FFF_FFFF) == 65001 ? .utf8 : .isoLatin1
        var strings = [""], pos = 0, p = 4
        while p + 4 <= pool.count {
            let size = Int(pool.u16(p)), refs = pool.u16(p + 2)
            if size == 0 && refs != 0 { throw MSIReaderError.corrupt("oversized string entry") }
            guard pos + size <= data.count else { throw MSIReaderError.corrupt("string data is truncated") }
            strings.append(String(data: data.subdata(in: pos..<pos + size), encoding: encoding) ?? "")
            pos += size; p += 4
        }
        return (strings, refSize)
    }

    /// Property table = two string-reference columns stored column-major (all keys, then all values).
    static func parsePropertyTable(_ stream: Data, strings: [String], refSize: Int) -> [String: String] {
        let rows = stream.count / (refSize * 2)
        func ref(_ offset: Int) -> Int { refSize == 3 ? Int(stream.u16(offset)) | Int(stream[offset + 2]) << 16 : Int(stream.u16(offset)) }
        var out: [String: String] = [:]
        for r in 0..<rows {
            let k = ref(r * refSize), v = ref(rows * refSize + r * refSize)
            if k > 0, k < strings.count, !strings[k].isEmpty { out[strings[k]] = v < strings.count ? strings[v] : "" }
        }
        return out
    }

    /// SummaryInformation property 7 is the Template: "x64;1033", "Intel;1033", "Arm64;1033".
    static func template(fromSummary d: Data) -> String? {
        guard d.count >= 52 else { return nil }
        let section = Int(d.u32(44))
        guard section + 8 <= d.count else { return nil }
        let count = Int(d.u32(section + 4))
        for i in 0..<min(count, 64) {
            let at = section + 8 + i * 8
            guard at + 8 <= d.count else { return nil }
            guard d.u32(at) == 7 else { continue }
            let off = section + Int(d.u32(at + 4))
            guard off + 8 <= d.count, d.u32(off) == 0x1E else { return nil }
            let len = Int(d.u32(off + 4))
            guard off + 8 + len <= d.count else { return nil }
            return String(data: d.subdata(in: off + 8..<off + 8 + len), encoding: .isoLatin1)?.trimmingCharacters(in: CharacterSet(charactersIn: "\0"))
        }
        return nil
    }

    static func architecture(fromTemplate t: String?) -> LocalArchitecture? {
        switch t?.split(separator: ";").first.map({ $0.trimmingCharacters(in: .whitespaces).lowercased() }) {
        case "x64", "amd64": return .x64
        case "arm64": return .arm64
        case "intel", "x86": return .x86
        default: return nil
        }
    }
}

// MARK: - OLE compound file container

/// Minimal reader for the Microsoft compound file (CFB) container: FAT/DIFAT/mini-FAT chains and the directory.
struct CompoundFile {
    struct Stream {
        let name: String
        fileprivate let size: Int
        fileprivate let start: UInt32
        fileprivate let owner: Reader
        func read() throws -> Data { try owner.readStream(start: start, size: size) }
    }

    /// Reference type so streams can lazily read from one open file handle.
    final class Reader {
        let handle: FileHandle
        let sectorSize: Int, miniSectorSize: Int, cutoff: Int
        var fat: [UInt32] = [], miniFat: [UInt32] = [], miniStream = Data()
        let fileSize: UInt64
        init(handle: FileHandle, sectorSize: Int, miniSectorSize: Int, cutoff: Int, fileSize: UInt64) {
            self.handle = handle; self.sectorSize = sectorSize; self.miniSectorSize = miniSectorSize; self.cutoff = cutoff; self.fileSize = fileSize
        }
        deinit { try? handle.close() }

        func sector(_ n: UInt32) throws -> Data {
            let offset = UInt64(n + 1) * UInt64(sectorSize)
            guard offset + UInt64(sectorSize) <= fileSize else { throw MSIReaderError.corrupt("sector \(n) is outside the file") }
            try handle.seek(toOffset: offset)
            guard let d = try handle.read(upToCount: sectorSize), d.count == sectorSize else { throw MSIReaderError.corrupt("short read") }
            return d
        }

        func chain(from start: UInt32, table: [UInt32]) throws -> [UInt32] {
            var out: [UInt32] = [], n = start
            while n != 0xFFFF_FFFE {
                guard Int(n) < table.count, out.count <= table.count else { throw MSIReaderError.corrupt("invalid sector chain") }
                out.append(n); n = table[Int(n)]
            }
            return out
        }

        func readStream(start: UInt32, size: Int) throws -> Data {
            guard size >= 0, size < 256 * 1024 * 1024 else { throw MSIReaderError.corrupt("stream too large") }
            if size < cutoff {
                var out = Data()
                for s in try chain(from: start, table: miniFat) {
                    let o = Int(s) * miniSectorSize
                    guard o + miniSectorSize <= miniStream.count else { throw MSIReaderError.corrupt("mini sector out of range") }
                    out.append(miniStream.subdata(in: o..<o + miniSectorSize))
                }
                return out.prefix(size)
            }
            var out = Data()
            for s in try chain(from: start, table: fat) { out.append(try sector(s)) }
            return out.prefix(size)
        }
    }

    private let reader: Reader
    private let dirStart: UInt32

    init(url: URL) throws {
        let handle = try FileHandle(forReadingFrom: url)
        let fileSize = try handle.seekToEnd()
        try handle.seek(toOffset: 0)
        guard let h = try handle.read(upToCount: 512), h.count == 512,
              h.prefix(8) == Data([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) else { throw MSIReaderError.notAnMSI }
        let sectorShift = Int(h.u16(0x1E)), miniShift = Int(h.u16(0x20))
        guard sectorShift == 9 || sectorShift == 12, miniShift == 6 else { throw MSIReaderError.corrupt("unsupported sector size") }
        let r = Reader(handle: handle, sectorSize: 1 << sectorShift, miniSectorSize: 1 << miniShift, cutoff: Int(h.u32(0x38)), fileSize: fileSize)

        // FAT sector list: 109 entries in the header, then the DIFAT chain.
        var fatSectors: [UInt32] = (0..<109).map { h.u32(0x4C + $0 * 4) }.filter { $0 < 0xFFFF_FFFC }
        var difat = h.u32(0x44), guardCount = 0
        while difat < 0xFFFF_FFFC, guardCount < 100_000 {
            let d = try r.sector(difat)
            let per = r.sectorSize / 4 - 1
            for i in 0..<per { let v = d.u32(i * 4); if v < 0xFFFF_FFFC { fatSectors.append(v) } }
            difat = d.u32(per * 4); guardCount += 1
        }
        for s in fatSectors { let d = try r.sector(s); r.fat += (0..<r.sectorSize / 4).map { d.u32($0 * 4) } }

        // Mini FAT
        var mf = h.u32(0x3C), mini: [UInt32] = []
        for s in try r.chain(from: mf, table: r.fat) where mf < 0xFFFF_FFFC { let d = try r.sector(s); mini += (0..<r.sectorSize / 4).map { d.u32($0 * 4) } }
        mf = 0; r.miniFat = mini

        self.reader = r
        self.dirStart = h.u32(0x30)
    }

    func streams() throws -> [Stream] {
        var dir = Data()
        for s in try reader.chain(from: dirStart, table: reader.fat) { dir.append(try reader.sector(s)) }
        var result: [Stream] = []
        var rootStart: UInt32 = 0xFFFF_FFFE, rootSize = 0
        for i in 0..<(dir.count / 128) {
            let e = dir.subdata(in: i * 128..<(i + 1) * 128)
            let type = e[66]
            let nameLen = max(0, min(Int(e.u16(64)) - 2, 62))
            let name = String(data: e.subdata(in: 0..<nameLen), encoding: .utf16LittleEndian) ?? ""
            let start = e.u32(116), size = Int(e.u32(120))
            if type == 5 { rootStart = start; rootSize = size }
            else if type == 2 { result.append(Stream(name: name, size: size, start: start, owner: reader)) }
        }
        if rootStart != 0xFFFF_FFFE, rootSize > 0, rootSize < 256 * 1024 * 1024 {
            var ms = Data()
            for s in try reader.chain(from: rootStart, table: reader.fat) { ms.append(try reader.sector(s)) }
            reader.miniStream = ms.prefix(rootSize)
        }
        return result
    }
}

private extension Data {
    func u16(_ o: Int) -> UInt16 { UInt16(self[startIndex + o]) | UInt16(self[startIndex + o + 1]) << 8 }
    func u32(_ o: Int) -> UInt32 { UInt32(u16(o)) | UInt32(u16(o + 2)) << 16 }
}
