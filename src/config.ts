// Presence Desktop Agent — Fase A.
//
// URL do backend cloud (repositório `presence-37deb226`, Infrastructure
// Track). Sobrescrevível via variável de ambiente pra apontar pra um
// ambiente de desenvolvimento local, sem tocar código.

export const CLOUD_BASE_URL = process.env["PRESENCE_CLOUD_URL"] ?? "https://spark-mind-friend.lovable.app";
