"use server";
import { grantReadyStore } from "../../lib/content-agent/grantready-store";

export async function startGrantReady() {
  try { return { ok: true as const, ...await grantReadyStore.begin() }; }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Campaign could not start." }; }
}
export async function updateGrantReady(token: string, cycle: number, action: "revise" | "approve", value: string, human = false) {
  try {
    if (typeof token !== "string" || !Number.isInteger(cycle) || !["revise", "approve"].includes(action) || typeof value !== "string" || typeof human !== "boolean")
      throw new Error("Invalid campaign action.");
    return { ok: true as const, view: await grantReadyStore.act(token, cycle, action, value, human) };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Campaign action failed." }; }
}
