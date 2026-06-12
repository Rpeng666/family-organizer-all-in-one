import * as Crypto from 'expo-crypto';

export async function hashPinClient(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(pin));
}

