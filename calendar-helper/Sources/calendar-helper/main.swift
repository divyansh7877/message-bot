import EventKit
import Foundation

struct CalendarAttendeeDTO: Codable {
    let name: String?
    let email: String?
    let phone: String?
}

struct CalendarEventDTO: Codable {
    let eventIdentifier: String
    let title: String
    let startsAt: String
    let endsAt: String?
    let location: String?
    let attendees: [CalendarAttendeeDTO]
    let notes: String?
}

enum HelperError: Error {
    case invalidArguments
    case permissionDenied
    case encodingFailed
}

extension HelperError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .invalidArguments:
            return "Invalid arguments. Expected ISO-8601 timestamps for --from and --to."
        case .permissionDenied:
            return "Calendar permission denied."
        case .encodingFailed:
            return "Failed to encode calendar events."
        }
    }
}

@main
struct CalendarHelperApp {
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            guard let command = args.first else {
                throw HelperError.invalidArguments
            }

            switch command {
            case "permissions":
                let granted = try await requestPermissions()
                FileHandle.standardOutput.write(Data((granted ? "granted" : "denied").utf8))
            case "list":
                let from = try requiredValue("--from", in: args)
                let to = try requiredValue("--to", in: args)
                let events = try await listEvents(from: from, to: to)
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted]
                encoder.dateEncodingStrategy = .iso8601
                let data = try encoder.encode(events)
                FileHandle.standardOutput.write(data)
            default:
                throw HelperError.invalidArguments
            }
        } catch {
            FileHandle.standardError.write(Data("\(error)\n".utf8))
            exit(1)
        }
    }
}

private func requestPermissions() async throws -> Bool {
    let store = EKEventStore()
    return try await withCheckedThrowingContinuation { continuation in
        if #available(macOS 14.0, *) {
            store.requestFullAccessToEvents { granted, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: granted)
            }
        } else {
            store.requestAccess(to: .event) { granted, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: granted)
            }
        }
    }
}

private func listEvents(from fromIso: String, to toIso: String) async throws -> [CalendarEventDTO] {
    let store = EKEventStore()
    let granted = try await requestPermissions()
    guard granted else {
      throw HelperError.permissionDenied
    }

    let formatter = ISO8601DateFormatter()
    guard let fromDate = parseISODate(fromIso), let toDate = parseISODate(toIso) else {
        throw HelperError.invalidArguments
    }

    let predicate = store.predicateForEvents(withStart: fromDate, end: toDate, calendars: nil)
    return store.events(matching: predicate)
        .sorted { $0.startDate < $1.startDate }
        .map { event in
            CalendarEventDTO(
                eventIdentifier: event.eventIdentifier,
                title: event.title,
                startsAt: formatter.string(from: event.startDate),
                endsAt: formatter.string(from: event.endDate),
                location: event.location,
                attendees: (event.attendees ?? []).map { attendee in
                    CalendarAttendeeDTO(
                        name: attendee.name,
                        email: attendee.url.absoluteString.replacingOccurrences(of: "mailto:", with: ""),
                        phone: nil
                    )
                },
                notes: event.notes
            )
        }
}

private func requiredValue(_ flag: String, in args: [String]) throws -> String {
    guard let index = args.firstIndex(of: flag), args.indices.contains(index + 1) else {
        throw HelperError.invalidArguments
    }
    return args[index + 1]
}

private func parseISODate(_ value: String) -> Date? {
    let fractionalFormatter = ISO8601DateFormatter()
    fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

    if let date = fractionalFormatter.date(from: value) {
        return date
    }

    let plainFormatter = ISO8601DateFormatter()
    plainFormatter.formatOptions = [.withInternetDateTime]
    return plainFormatter.date(from: value)
}
