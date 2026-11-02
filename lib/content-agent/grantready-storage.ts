// Content-only storage. Tokens/credentials and draft bodies must never be logged.
export interface CampaignStorage {
  get(key: string): Promise<string | null>;
  compareAndSet(key: string, previous: string | null, next: string, ttl: number): Promise<boolean>;
}
export function createMemoryCampaignStorage(): CampaignStorage {
  const rows = new Map<string, { value: string; expires: number }>();
  return {
    async get(key) {
      const row = rows.get(key);
      if (!row || row.expires <= Date.now()) { rows.delete(key); return null; }
      return row.value;
    },
    async compareAndSet(key, previous, next, ttl) {
      // No await between read and write: atomic within this local process only.
      const row = rows.get(key);
      const current = row && row.expires > Date.now() ? row.value : null;
      if (current !== previous) return false;
      rows.set(key, { value: next, expires: Date.now() + ttl * 1000 });
      return true;
    },
  };
}
export function createRedisCampaignStorage(url: string, token: string): CampaignStorage {
  if (new URL(url).protocol !== "https:") throw new Error("Campaign storage requires HTTPS.");
  async function command(args: (string | number)[]): Promise<unknown> {
    try {
      const response = await fetch(url, { method: "POST", headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      }, body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Storage request failed");
      const body = await response.json();
      if (body.error || !("result" in body)) throw new Error("Storage command failed");
      return body.result;
    } catch { throw new Error("Campaign storage is unavailable. Approval is not confirmed. Check status before retrying."); }
  }
  return {
    async get(key) {
      const result = await command(["GET", key]);
      if (result !== null && typeof result !== "string") throw new Error("Invalid campaign storage response.");
      return result as string | null;
    },
    async compareAndSet(key, previous, next, ttl) {
      const script = "local v=redis.call('GET',KEYS[1]); if (ARGV[1]=='0' and not v) or (ARGV[1]=='1' and v==ARGV[2]) then redis.call('SET',KEYS[1],ARGV[3],'EX',ARGV[4]); return 1 else return 0 end";
      const result = await command(["EVAL", script, 1, key, previous === null ? "0" : "1", previous ?? "", next, ttl]);
      if (result !== 0 && result !== 1) throw new Error("Invalid campaign storage response. Check approval status.");
      return result === 1;
    },
  };
}
export function configuredCampaignStorage(): CampaignStorage {
  // Select complete credential pairs, never mix URLs/tokens from different services.
  // Explicit Content Agent configuration takes precedence over Vercel's KV aliases.
  for (const [url, token] of [
    [process.env.GRANTREADY_REDIS_REST_URL, process.env.GRANTREADY_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
  ]) {
    if (url || token) {
      if (!url || !token) throw new Error("Shared campaign storage is not configured. Supply a complete GRANTREADY_REDIS_REST_URL / GRANTREADY_REDIS_REST_TOKEN or KV_REST_API_URL / KV_REST_API_TOKEN pair. No approval was recorded by this request.");
      return createRedisCampaignStorage(url, token);
    }
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new Error("Shared campaign storage is not configured. Set GRANTREADY_REDIS_REST_URL and GRANTREADY_REDIS_REST_TOKEN, or KV_REST_API_URL and KV_REST_API_TOKEN. No approval was recorded by this request.");
  return createMemoryCampaignStorage();
}
