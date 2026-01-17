function ab2str(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function str2ab(str) {
    try {
        return Uint8Array.from(atob(str), c => c.charCodeAt(0));
    } catch (e) {
        console.error("Base64 Decoding failed:", e);
        return new Uint8Array(); // Return empty array instead of crashing
    }
}

export async function generateKeyPair() {
    return await window.crypto.subtle.generateKey(
        { name: "RSA-OAEP", 
          modulusLength: 2048, 
          publicExponent: new Uint8Array([1, 0, 1]), 
          hash: "SHA-256" },
        true, 
        ["encrypt", "decrypt"]
    );
}

export async function exportKey(key, type="spki") {
    const exported = await window.crypto.subtle.exportKey(type, key);
    return ab2str(exported);
}

export async function importKey(pem, type="spki", usage=["encrypt"]) {
    const binaryDer = str2ab(pem);
    return await window.crypto.subtle.importKey(
        type, binaryDer, { name: "RSA-OAEP", hash: "SHA-256" }, true, usage
    );
}

export async function encryptMessage(text, receiverPublicKeyPem) {
    const aesKey = await window.crypto.subtle.generateKey({ name: "AES-CBC", length: 256 }, true, ["encrypt", "decrypt"]);
    const receiverPubKey = await importKey(receiverPublicKeyPem, "spki", ["encrypt"]);
    const iv = window.crypto.getRandomValues(new Uint8Array(16));
    const payload = JSON.stringify({ content: text, timestamp: Date.now() });
    const enc = new TextEncoder();
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-CBC", iv: iv }, aesKey, enc.encode(payload));
    
    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const hmacKey = await window.crypto.subtle.importKey("raw", rawAesKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await window.crypto.subtle.sign("HMAC", hmacKey, ciphertext);
    
    const encryptedAesKey = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, receiverPubKey, rawAesKey);
    
    return {
        ciphertext: ab2str(ciphertext), 
        iv: ab2str(iv),
        encryptedAesKey: ab2str(encryptedAesKey), 
        signature: ab2str(signature)
    };
}

export async function decryptMessage(data, privateKey, config = {}) {
    try {
        const rawAesKey = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, str2ab(data.encryptedAesKey));
        const aesKey = await window.crypto.subtle.importKey("raw", rawAesKey, { name: "AES-CBC" }, false, ["decrypt"]);
        const iv = str2ab(data.iv);
        const decryptedBytes = await window.crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, aesKey, str2ab(data.ciphertext));
        
        const payload = JSON.parse(new TextDecoder().decode(decryptedBytes));
        
        
        if (!config.replayProtection) {
            const now = Date.now();
            const diff = Math.abs(now - payload.timestamp);

            if (diff > 60000) { 
                console.error("REPLAY DETECTED!");
                return "⚠️ SECURITY ALERT: REPLAY ATTACK DETECTED (Freshness Check Failed)";
            }
        }

        return payload.content;
    } catch (e) {
        console.error("Decryption system error:", e);
        return "[Decryption Failed]";
    }
}
// Convert Private Key Object -> JSON String (for LocalStorage)
export async function exportPrivateKeyToStorage(key) {
    const exported = await window.crypto.subtle.exportKey("pkcs8", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importPrivateKeyFromStorage(pem) {
    const binaryDerString = atob(pem);
    const binaryDer = new Uint8Array([...binaryDerString].map(char => char.charCodeAt(0)));
    return await window.crypto.subtle.importKey(
        "pkcs8", binaryDer, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
    );
}

/*
The code is structured into several functions, each serving a specific purpose:
    1) ab2str: Converts an ArrayBuffer to a Base64 string.
    2) str2ab: Converts a Base64 string back to an ArrayBuffer.
    3) generateKeyPair: Generates a new RSA key pair.
    4) exportKey: Exports a key to a Base64 string.
    5) importKey: Imports a key from a Base64 string.
    6) encryptMessage: Encrypts a message using a receiver's public key.
    7) decryptMessage: Decrypts a message using the receiver's private key.
*/