export function codexConfig(value = {}) {
  const model = (name) => {
    const result = String(name || "").trim();
    if (result && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(result))
      throw new Error("Invalid Codex model name.");
    return result;
  };
  const effort = (value) => {
    if (!["low", "medium", "high", "xhigh"].includes(value))
      throw new Error("Choose low, medium, high or xhigh reasoning effort.");
    return value;
  };
  const max = Number(value.max_agents ?? 3);
  const timeout = Number(value.timeout_minutes ?? 60);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 180)
    throw new Error("Choose a Codex job timeout of 1 to 180 minutes.");
  if (!Number.isInteger(max) || max < 1 || max > 6)
    throw new Error("Choose 1 to 6 concurrent sub-agents.");
  return {
    web_search: value.web_search !== false,
    subagents: value.subagents === true,
    model: model(value.model),
    reasoning_effort: effort(value.reasoning_effort || "high"),
    agent_model: model(value.agent_model),
    agent_reasoning_effort: effort(value.agent_reasoning_effort || "high"),
    max_agents: max,
    timeout_minutes: timeout,
  };
}
// Official configuration reference: https://developers.openai.com/codex/config-reference/
export function codexArguments(config) {
  const s = codexConfig(config);
  const entries = {
    web_search: s.web_search ? "live" : "disabled",
    model_reasoning_effort: s.reasoning_effort,
    "agents.max_threads": s.max_agents,
    "agents.default_subagent_reasoning_effort": s.agent_reasoning_effort,
    ...(s.model ? { model: s.model } : {}),
    ...(s.agent_model
      ? { "agents.default_subagent_model": s.agent_model }
      : {}),
  };
  return [
    s.subagents ? "--enable" : "--disable",
    "multi_agent",
    ...Object.entries(entries).flatMap(([key, value]) => [
      "-c",
      `${key}=${JSON.stringify(value)}`,
    ]),
  ];
}
