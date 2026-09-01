// Presence Desktop Agent — Fase A.
//
// URL do backend cloud (repositório `spark-mind-friend`, Infrastructure
// Track — publicado na Vercel). Sobrescrevível via variável de ambiente
// pra apontar pra um ambiente de desenvolvimento local, sem tocar código.
//
// Corrigido: o padrão apontava pro preview do Lovable (nunca atualizado
// com as credenciais do Supabase novo, depois da migração pra fora do
// Lovable Cloud) — a produção de verdade é o deploy na Vercel.

export const CLOUD_BASE_URL = process.env["PRESENCE_CLOUD_URL"] ?? "https://spark-mind-friend-htvx.vercel.app";
