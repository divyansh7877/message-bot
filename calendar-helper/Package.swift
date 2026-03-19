// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "calendar-helper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "calendar-helper", targets: ["calendar-helper"])
    ],
    targets: [
        .executableTarget(
            name: "calendar-helper",
            path: "Sources/calendar-helper"
        )
    ]
)
