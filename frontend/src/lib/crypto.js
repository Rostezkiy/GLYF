/* src/lib/crypto.js */

let masterKey = null;

// Сохраняем зашифрованный ключ в localStorage (зашифрованный паролем)
async function saveKeyEncrypted(key, password) {
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    // Используем пароль для получения ключа шифрования (Key Wrapping)
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    const wrappingKey = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("glyf-wrap-salt"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    
    const jsonStr = JSON.stringify(exported);
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        wrappingKey,
        enc.encode(jsonStr)
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    localStorage.setItem("glyf_enc_key", btoa(String.fromCharCode(...combined)));
}

async function decryptKey(encryptedData, password) {
    const enc = new TextEncoder();
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    const wrappingKey = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("glyf-wrap-salt"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );
    
    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            wrappingKey,
            data
        );
        const jsonStr = new TextDecoder().decode(decrypted);
        return JSON.parse(jsonStr);
    } catch (e) {
        throw new Error("Wrong password or corrupted key");
    }
}

export async function loadKeyLocally(password) {
    // ВАЖНО: Пароль должен приходить извне (auth.js)
    if (!password) {
        console.warn("[Crypto] No password provided to loadKeyLocally");
        return false;
    }
    
    const encrypted = localStorage.getItem("glyf_enc_key");
    if (!encrypted) {
        console.warn("[Crypto] No encrypted key found");
        return false;
    }
    
    try {
        const jwk = await decryptKey(encrypted, password);
        masterKey = await window.crypto.subtle.importKey(
            "jwk", jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
        );
        console.log("[Crypto] Master key loaded successfully");
        return true;
    } catch (e) {
        console.error("Failed to load key:", e);
        return false;
    }
}

export function clearKeyLocally() {
    localStorage.removeItem("glyf_enc_key");
    masterKey = null;
}

export function hasEncryptedKey() {
    return !!localStorage.getItem("glyf_enc_key");
}

export async function deriveKey(password, email) {
    if (!email || !password) return false;
    const normalizedEmail = email.toLowerCase().trim();
    const enc = new TextEncoder();
    
    // 1. Import Password
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    
    // 2. Derive Key using Email as Salt
    masterKey = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(normalizedEmail),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true, 
        ["encrypt", "decrypt"]
    );

    // Сохраняем "обернутый" ключ на диск
    await saveKeyEncrypted(masterKey, password);
    return true;
}

export function hasKey() {
    return !!masterKey;
}

export async function encryptData(text) {
    if (!text) return ""; 
    if (!masterKey) throw new Error("Encryption key not loaded");
    
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        masterKey,
        enc.encode(text)
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
}

export async function decryptData(base64Str) {
    if (!base64Str) return "";
    if (!masterKey) return "[Locked]"; 
    
    try {
        const combined = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            masterKey,
            data
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.warn("Decryption failed:", e);
        return "[Bad Data]"; 
    }
}