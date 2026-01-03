
function ab2str(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function str2ab(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

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

export async function decryptMessage(data, privateKey) {
    try {
        const rawAesKey = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, str2ab(data.encryptedAesKey));
        const hmacKey = await window.crypto.subtle.importKey("raw", rawAesKey, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        const ciphertext = str2ab(data.ciphertext);
        const signature = str2ab(data.signature);
        
        if (!await window.crypto.subtle.verify("HMAC", hmacKey, signature, ciphertext)) throw new Error("Integrity Check Failed");
        
        const aesKey = await window.crypto.subtle.importKey("raw", rawAesKey, { name: "AES-CBC" }, false, ["decrypt"]);
        const iv = str2ab(data.iv);
        const decryptedBytes = await window.crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, aesKey, ciphertext);
        
        const payload = JSON.parse(new TextDecoder().decode(decryptedBytes));
        if (Math.abs(Date.now() - payload.timestamp) > 60000) throw new Error("Replay Detected");
        
        return payload.content;
    } catch (e) {
        console.error(e);
        return "[Decryption Failed]";
    }
}

// Convert Private Key Object -> JSON String (for LocalStorage)
export async function exportPrivateKeyToStorage(key) {
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    return JSON.stringify(exported);
}

// Convert JSON String -> Private Key Object (for App State)
export async function importPrivateKeyFromStorage(jsonString) {
    const jwk = JSON.parse(jsonString);
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"]
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