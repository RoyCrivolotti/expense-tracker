// Text recognition for scripts/audit-screenshots.mjs, using the Vision framework so
// the audit needs no third-party OCR install on macOS.
//
// Prints "<path>\t<all recognised text on one line>" per image.
// Args: image paths, or "--list <file> [basedir]" to read newline-separated paths.
import Foundation
import Vision
import AppKit

var paths = Array(CommandLine.arguments.dropFirst())
if paths.first == "--list", paths.count > 1 {
    let listFile = paths[1]
    let base = paths.count > 2 ? paths[2] : "."
    let contents = (try? String(contentsOfFile: listFile, encoding: .utf8)) ?? ""
    paths = contents.split(separator: "\n").map { base + "/" + $0 }
}

for path in paths {
    guard let image = NSImage(contentsOfFile: path),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
        print("\(path)\tOCR_ERROR")
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Off: account and merchant names are exactly what autocorrect would "fix".
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([request]) } catch {
        print("\(path)\tOCR_ERROR")
        continue
    }
    let text = (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: " ~ ")
        .replacingOccurrences(of: "\n", with: " ")
    print("\(path)\t\(text)")
}
