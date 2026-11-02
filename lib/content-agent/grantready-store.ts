import { configuredCampaignStorage, type CampaignStorage } from "./grantready-storage";
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
export function createGrantReadyStore(load: () => Promise<GrantReadyData> = loadGrantReadyData, backend?: CampaignStorage) {
  let storage = backend;
  const db = () => storage ??= configuredCampaignStorage();
  type Record = { expires: number; snapshot: ReturnType<GrantReadyWorkflow["snapshot"]>; approvedAt: string | null };
  async function read(token: string) {
    const raw = await db().get("grantready:v1:" + token);
    if (!raw) throw new Error("Campaign session is unavailable or expired. Previous approval cannot be confirmed. Start a new campaign only after reviewing this uncertainty.");
    let row: Record;
    try {
      row = JSON.parse(raw);
      const state = row.snapshot.state;
      if (!Number.isFinite(row.expires) || row.snapshot.version !== 1 ||
          !/^[a-f0-9]{64}$/.test(row.snapshot.fingerprint) ||
          ![null, "A", "B"].includes(state.approvedId) ||
          !Number.isInteger(state.loop.currentCycle) || state.loop.currentCycle < 1 || state.loop.currentCycle > 3 ||
          state.loop.history.length !== state.loop.currentCycle ||
          state.loop.history.some((entry, index) => entry.cycle !== index + 1 || typeof entry.feedback !== "string" ||
            entry.posts.length !== 2 || entry.posts.some((post, i) => post.id !== (i === 0 ? "A" : "B") || typeof post.content !== "string")) ||
          (state.approvedId === null ? row.approvedAt !== null : typeof row.approvedAt !== "string" || !Number.isFinite(Date.parse(row.approvedAt))))
        throw new Error("Invalid record");
    } catch { throw new Error("Saved campaign is corrupted or unsupported. Approval status cannot be confirmed."); }
    if (row.expires <= Date.now()) throw new Error("Campaign session expired. Previous approval cannot be confirmed.");
    return { raw, row };
  }
  async function begin() {
    const flow = new GrantReadyWorkflow(await load());
    const token = randomUUID();
    const row: Record = { expires: Date.now() + 3600000, snapshot: flow.snapshot(), approvedAt: null };
    if (!await db().compareAndSet("grantready:v1:" + token, null, JSON.stringify(row), 3600)) throw new Error("Campaign could not start. Please retry.");
    return { token, view: flow.view() };
  }
  async function status(token: string) {
    const { row } = await read(token);
    return { view: row.snapshot.state, approvedAt: row.approvedAt };
  }
  async function act(token: string, cycle: number, action: "revise" | "approve", value: string, human = false) {
    if (action === "approve" && (!human || !["A", "B"].includes(value))) throw new Error("Human approval and a valid selected variation are required.");
    for (let attempt = 0; attempt < 4; attempt++) {
      const { raw, row } = await read(token);
      const data = await load();
      if (row.snapshot.state.approvedId) {
        if (action === "approve" && row.snapshot.state.approvedId === value && row.snapshot.state.loop.currentCycle === cycle) return structuredClone(row.snapshot.state);
        throw new Error("This campaign is already approved. The revision loop has stopped. Check status for the selected variation.");
      }
      const flow = GrantReadyWorkflow.restore(data, row.snapshot);
      const view = action === "revise" ? flow.revise(data, value, cycle) : flow.approve(data, value as "A" | "B", human, cycle);
      const next: Record = { ...row, snapshot: flow.snapshot(), approvedAt: view.approvedId ? new Date().toISOString() : null };
      if (row.expires <= Date.now()) throw new Error("Campaign expired before saving. Check saved status; approval is not confirmed.");
      if (await db().compareAndSet("grantready:v1:" + token, raw, JSON.stringify(next), Math.max(1, Math.ceil((row.expires - Date.now()) / 1000)))) return view;
    }
    throw new Error("Campaign changed during this request. Check status before continuing.");
  }
  return { begin, act, status };
}
export const grantReadyStore = createGrantReadyStore();
