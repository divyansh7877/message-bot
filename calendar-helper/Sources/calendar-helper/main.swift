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
        store.requestFullAccessToEvents { granted, error in
            if let error {
                continuation.resume(throwing: error)
                return
            }
            continuation.resume(returning: granted)
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
    guard let fromDate = formatter.date(from: fromIso), let toDate = formatter.date(from: toIso) else {
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
                        email: attendee.url?.resourceSpecifier.replacingOccurrences(of: "mailto:", with: ""),
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
