// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AppGuardianAgent",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "AppGuardianInventory", targets: ["AppGuardianInventory"]),
        .library(name: "AppGuardianAPI", targets: ["AppGuardianAPI"]),
        .executable(name: "AppGuardianAgent", targets: ["AppGuardianAgent"])
    ],
    targets: [
        .target(name: "AppGuardianInventory"),
        .target(name: "AppGuardianAPI", dependencies: ["AppGuardianInventory"]),
        .executableTarget(name: "AppGuardianAgent", dependencies: ["AppGuardianInventory", "AppGuardianAPI"]),
        .testTarget(name: "AppGuardianInventoryTests", dependencies: ["AppGuardianInventory", "AppGuardianAPI"])
    ]
)