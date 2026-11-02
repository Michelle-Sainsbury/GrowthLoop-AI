import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { GrantReadyWorkflow, type GrantReadyData } from "./grantready-workflow";

// Server configuration only; never accepted from a request. Tests use disposable
// fixture directories. The original proposed files are always the default.
export async function loadGrantReadyData(): Promise<GrantReadyData> {
  const dir = process.env.GRANTREADY_DATA_DIR ? resolve(process.env.GRANTREADY_DATA_DIR) : join(process.cwd(), "data/seed");
  const values = await Promise.all(["brief.json", "icp.json", "claims.json", "banned_phrases.json"]
    .map(async name => JSON.parse(await readFile(join(dir, name), "utf8"))));
  return { brief: values[0], icp: values[1], registry: values[2], policy: values[3] };
}
export function createGrantReadyStore(load: () => Promise<GrantReadyData> = loadGrantReadyData) {
  const sessions = new Map<string, { flow: GrantReadyWorkflow; created: number }>();
  function prune() {
    for (const [id, row] of sessions) if (Date.now() - row.created > 3600000) sessions.delete(id);
  }
  async function begin() {
    const flow = new GrantReadyWorkflow(await load());
    prune();
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
    const token = randomUUID();
    sessions.set(token, { flow, created: Date.now() });
    return { token, view: flow.view() };
  }
  async function act(token: string, cycle: number, action: "revise" | "approve", value: string, human = false) {
    prune();
    const row = sessions.get(token);
    if (!row) throw new Error("Campaign session expired or server restarted. Start a new campaign.");
    const data = await load(); // No cached authorization across actions.
    if (action === "revise") return row.flow.revise(data, value, cycle);
    if (value !== "A" && value !== "B") throw new Error("Choose Variation A or B.");
    return row.flow.approve(data, value, human, cycle);
  }
  return { begin, act };
}
export const grantReadyStore = createGrantReadyStore();
