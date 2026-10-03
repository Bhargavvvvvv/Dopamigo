import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreGraphics

final class RecordingDelegate: NSObject, SCRecordingOutputDelegate, SCStreamDelegate {
    var finished = false
    var failure: Error?
    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        print("RECORDING_STARTED \(ISO8601DateFormatter().string(from: Date()))")
        fflush(stdout)
    }
    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) { finished = true }
    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) { failure = error; finished = true }
    func stream(_ stream: SCStream, didStopWithError error: Error) { failure = error; finished = true }
}

@main struct RecordScreen {
    static func main() async throws {
        let arguments = CommandLine.arguments
        guard arguments.count >= 4 else { fatalError("Usage: record-screen OUTPUT.mp4 STOP_FILE MAX_SECONDS [bundle IDs separated by commas]") }
        let output = URL(fileURLWithPath: arguments[1])
        let stopFile = arguments[2]
        let seconds = Double(arguments[3]) ?? 180
        let bundleIDs = Set((arguments.count > 4 ? arguments[4] : "com.github.Electron,com.brave.Browser").split(separator: ",").map(String.init))
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
        guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) else { fatalError("No main display") }
        let apps = content.applications.filter { bundleIDs.contains($0.bundleIdentifier) }
        guard !apps.isEmpty else { fatalError("No requested application is running") }
        let filter = SCContentFilter(display: display, including: apps, exceptingWindows: [])
        filter.includeMenuBar = false
        let config = SCStreamConfiguration()
        config.width = 2560
        config.height = Int((2560.0 * Double(display.height) / Double(display.width)) / 2) * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.showsCursor = true
        config.showMouseClicks = true
        config.capturesAudio = true
        config.captureMicrophone = false
        config.sampleRate = 48000
        config.channelCount = 2
        config.excludesCurrentProcessAudio = false
        let backdrop = CGColor(gray: 247.0 / 255.0, alpha: 1)
        config.backgroundColor = backdrop
        config.queueDepth = 5
        let delegate = RecordingDelegate()
        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = output
        recordingConfig.videoCodecType = .h264
        recordingConfig.outputFileType = .mp4
        let recording = SCRecordingOutput(configuration: recordingConfig, delegate: delegate)
        let stream = SCStream(filter: filter, configuration: config, delegate: delegate)
        try stream.addRecordingOutput(recording)
        try await stream.startCapture()
        let start = Date()
        while Date().timeIntervalSince(start) < seconds && !FileManager.default.fileExists(atPath: stopFile) && !delegate.finished {
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        try await stream.stopCapture()
        for _ in 0..<100 where !delegate.finished { try await Task.sleep(nanoseconds: 100_000_000) }
        if let error = delegate.failure { throw error }
        guard delegate.finished else { fatalError("Recording did not finish") }
        withExtendedLifetime(backdrop) {}
        print("RECORDING_FINISHED \(output.lastPathComponent) \(recording.recordedDuration.seconds)s")
    }
}
