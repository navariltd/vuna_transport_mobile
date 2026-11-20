package ke.navari.transport.maps

import com.google.android.libraries.navigation.NavigationApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

/** Process-wide guard survives JS reloads; never persists or returns the key. */
class TransportMapsModule : Module() {
  companion object {
    private var owner: String? = null
    private var fingerprint: String? = null
  }

  override fun definition() = ModuleDefinition {
    Name("TransportMaps")
    AsyncFunction("configure") { site: String, apiKey: String ->
      synchronized(TransportMapsModule::class.java) {
        require(site.isNotBlank() && apiKey.isNotBlank()) { "Mobile Google configuration is missing." }
        val digest = MessageDigest.getInstance("SHA-256").digest(apiKey.toByteArray()).joinToString("") { "%02x".format(it) }
        if (owner != null) {
          if (owner == site && fingerprint == digest) "ready" else "restart_required"
        } else {
          // Fail closed even if Google's setter throws: it may have initialized
          // native state, so another site must never reuse this process.
          owner = site
          fingerprint = digest
          try {
            NavigationApi.setApiKey(apiKey)
            "ready"
          } catch (_: Exception) {
            fingerprint = null
            "restart_required"
          }
        }
      }
    }
  }
}
