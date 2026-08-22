// Presence Desktop Agent — Fase A: armazenamento seguro da credencial do
// dispositivo.
//
// Usa `safeStorage` do próprio Electron (DPAPI no Windows, Keychain no
// macOS, libsecret no Linux) em vez de uma dependência nativa externa
// (ex. `keytar`, hoje sem manutenção ativa) — mesmo nível de segurança
// (criptografia pelo cofre do próprio SO), zero dependência nativa extra
// pra compilar/instalar.
//
// O segredo bruto do dispositivo NUNCA é logado nem exposto ao renderer —
// só existe em texto puro dentro deste módulo, no processo main.

import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface StoredCredential {
  deviceId: string;
  deviceSecret: string;
}

function credentialPath(): string {
  return path.join(app.getPath("userData"), "device-credential.enc");
}

export async function saveDeviceCredential(credential: StoredCredential): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("presence-agent/secure-storage-unavailable");
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(credential));
  await fs.writeFile(credentialPath(), encrypted);
}

export async function loadDeviceCredential(): Promise<StoredCredential | null> {
  try {
    const encrypted = await fs.readFile(credentialPath());
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as StoredCredential;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("[presence-agent] falha ao ler a credencial do dispositivo", error);
    return null;
  }
}

export async function clearDeviceCredential(): Promise<void> {
  try {
    await fs.unlink(credentialPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
