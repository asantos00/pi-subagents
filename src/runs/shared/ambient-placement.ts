import * as path from "node:path";
import type { AgentConfig } from "../../agents/agents.ts";
import { isToolExtensionPath } from "./child-tool-plan.ts";
import { REX_LOCAL_MACHINE } from "./rex-machine.ts";

export type AmbientPlacementAdapterId = "herdr-core" | "herdr" | "rex";

export interface AmbientPlacementSelection {
	machine: string;
	adapter?: AmbientPlacementAdapterId;
}

interface AmbientPlacementAdapter {
	id: AmbientPlacementAdapterId;
	machine: string;
	detect(env: NodeJS.ProcessEnv): boolean;
}

/** Ambient execution hosts in precedence order. Each adapter must prove enough context for its resolver. */
export const AMBIENT_PLACEMENT_ADAPTERS: readonly AmbientPlacementAdapter[] = [
	{
		id: "herdr",
		machine: REX_LOCAL_MACHINE,
		detect(env) { return env.HERDR_ENV === "1" && Boolean(env.HERDR_PANE_ID?.trim()); },
	},
	{
		id: "herdr-core",
		machine: REX_LOCAL_MACHINE,
		detect(env) {
			const socket = env.HC_TERMINAL_SOCKET?.trim();
			return Boolean(env.HC_TERMINAL_ID?.trim() && socket && path.isAbsolute(socket));
		},
	},
	{
		id: "rex",
		machine: REX_LOCAL_MACHINE,
		detect(env) { return Boolean(env.REX_SESSION?.trim()); },
	},
];

/** Agent-definition capabilities that pane-native Pi transports cannot preserve. */
export function supportsAmbientPlacementAgent(agent: Pick<AgentConfig, "source" | "runner" | "tools" | "skillPath" | "outputSchema" | "toolBudget" | "permissions" | "extensions" | "subagentOnlyExtensions" | "excludeTools" | "mcpDirectTools" | "allowNestedSubagents" | "allowedAgents" | "launcher">): boolean {
	return agent.source !== "runtime" && agent.source !== "user" && (agent.runner === undefined || agent.runner.type === "pi")
		&& agent.outputSchema === undefined && agent.toolBudget === undefined && agent.permissions === undefined
		&& agent.extensions === undefined && !agent.subagentOnlyExtensions?.length && !agent.excludeTools?.length && !agent.mcpDirectTools?.length
		&& !agent.tools?.includes("subagent") && !agent.tools?.some(isToolExtensionPath) && !agent.skillPath?.length
		&& !agent.allowNestedSubagents && !agent.allowedAgents?.length && !agent.launcher;
}

/** Explicit machine choices win. Otherwise the first detected adapter may place a compatible background child. */
export function resolveAmbientPlacement(input: { requested?: string; compatible(): boolean; env?: NodeJS.ProcessEnv }): AmbientPlacementSelection | undefined {
	if (input.requested !== undefined) return { machine: input.requested };
	const env = input.env ?? process.env;
	const adapter = AMBIENT_PLACEMENT_ADAPTERS.find((candidate) => candidate.detect(env));
	if (!adapter || !input.compatible()) return undefined;
	return { machine: adapter.machine, adapter: adapter.id };
}
