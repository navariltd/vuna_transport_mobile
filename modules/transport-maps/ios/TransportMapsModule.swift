import ExpoModulesCore
import GoogleNavigation
import GoogleMaps
import CryptoKit
import Foundation

public class TransportMapsModule: Module {
  private static var owner: String?
  private static var fingerprint: String?

  public func definition() -> ModuleDefinition {
    Name("TransportMaps")
    AsyncFunction("configure") { (site: String, apiKey: String) -> String in
      guard !site.isEmpty && !apiKey.isEmpty else { return "unavailable" }
      let digest = SHA256.hash(data: Data(apiKey.utf8)).map { String(format: "%02x", $0) }.joined()
      if Self.owner != nil {
        return Self.owner == site && Self.fingerprint == digest ? "ready" : "restart_required"
      }
      Self.owner = site
      if GMSServices.provideAPIKey(apiKey) {
        Self.fingerprint = digest
        return "ready"
      }
      return "restart_required"
    }.runOnQueue(.main)
  }
}
