// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "AppPackageBuilder",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "AppPackageBuilder", targets: ["AppPackageBuilder"])
    ],
    dependencies: [
        .package(url: "https://github.com/jpsim/Yams", .upToNextMajor(from: "5.0.0"))
    ],
    targets: [
        .executableTarget(
            name: "AppPackageBuilder",
            dependencies: [
                "Yams"
            ],
            path: "Sources/AppPackageBuilder",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "AppPackageBuilderTests",
            dependencies: ["AppPackageBuilder"],
            path: "Tests/AppPackageBuilderTests"
        )
    ]
)
