package expo.modules.pocketkeystore

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

private const val ANDROID_KEYSTORE = "AndroidKeyStore"

// Algorithm names. Android Keystore's Ed25519 support routes through
// its EC provider: KeyPairGenerator must be created with "EC" and
// fed an ECGenParameterSpec("ed25519") (lowercase). The Signature side
// accepts "Ed25519" directly.
private const val KEYGEN_ALGORITHM = "EC"
private const val ED25519_CURVE = "ed25519"
private const val SIGN_ALGORITHM = "Ed25519"

// Standard X.509 SubjectPublicKeyInfo for Ed25519 is 44 bytes:
//   12-byte ASN.1 DER header (constant) + 32-byte raw public key.
// We extract the trailing 32 bytes for the Solana-friendly raw form.
private const val ED25519_PUBLIC_KEY_RAW_LENGTH = 32

class PocketKeystoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PocketKeystore")

    Function("isAvailable") {
      // Ed25519 in Android Keystore landed in API 33 (Android 13).
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    }

    Function("hasKey") { alias: String ->
      keystore().containsAlias(alias)
    }

    AsyncFunction("generateKey") { alias: String ->
      requireApi33()

      val spec =
        KeyGenParameterSpec
          .Builder(alias, KeyProperties.PURPOSE_SIGN)
          .setAlgorithmParameterSpec(ECGenParameterSpec(ED25519_CURVE))
          // Ed25519 uses its own internal hashing — DIGEST_NONE is
          // both correct and required by the keystore EC generator
          // for this curve.
          .setDigests(KeyProperties.DIGEST_NONE)
          // No biometric gate yet — Day 7 surface is just the signing
          // path. Day 8+ wires expo-local-authentication before sign().
          .setUserAuthenticationRequired(false)
          .build()

      val gen = KeyPairGenerator.getInstance(KEYGEN_ALGORITHM, ANDROID_KEYSTORE)
      gen.initialize(spec)
      gen.generateKeyPair()

      readPublicKeyRaw(alias)
    }

    Function("getPublicKey") { alias: String ->
      readPublicKeyRaw(alias)
    }

    AsyncFunction("sign") { alias: String, message: ByteArray ->
      requireApi33()

      val entry =
        keystore().getEntry(alias, null) as? KeyStore.PrivateKeyEntry
          ?: throw IllegalStateException("No keystore entry for alias: $alias")

      val sig = Signature.getInstance(SIGN_ALGORITHM)
      sig.initSign(entry.privateKey)
      sig.update(message)
      sig.sign()
    }

    Function("deleteKey") { alias: String ->
      keystore().deleteEntry(alias)
    }
  }

  private fun keystore(): KeyStore {
    val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
    ks.load(null)
    return ks
  }

  private fun readPublicKeyRaw(alias: String): ByteArray {
    val cert =
      keystore().getCertificate(alias)
        ?: throw IllegalStateException("No keystore certificate for alias: $alias")
    val encoded = cert.publicKey.encoded
    if (encoded.size < ED25519_PUBLIC_KEY_RAW_LENGTH) {
      throw IllegalStateException(
        "Encoded public key is shorter than 32 bytes (got ${encoded.size}) — unexpected SPKI shape",
      )
    }
    return encoded.copyOfRange(
      encoded.size - ED25519_PUBLIC_KEY_RAW_LENGTH,
      encoded.size,
    )
  }

  private fun requireApi33() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      throw IllegalStateException(
        "Ed25519 in Android Keystore requires API 33+ (Android 13). " +
          "Current SDK: ${Build.VERSION.SDK_INT}",
      )
    }
  }
}
