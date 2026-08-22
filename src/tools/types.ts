// Presence Desktop Agent — Fase 10E: contrato do Tool Registry.
//
// `riskTier` é só METADADO nesta fatia — quem de fato aplica os 4
// níveis (bloquear/pedir confirmação) é o Permission Manager da Fase
// 10F, ainda não implementado. Nenhuma ferramenta aqui é executada
// automaticamente a partir de comando livre; só o resolvedor
// determinístico de "abrir X" (`command-resolver.ts`) chama alguma
// delas nesta fatia.

export type RiskTier = "read_only" | "reversible" | "external_comm" | "destructive";

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  riskTier: RiskTier;
  description: string;
  run(args: TArgs): Promise<TResult>;
}
