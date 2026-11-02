import { Suspense } from "react";
import { connection } from "next/server";
import GrantReadyCampaign from "../../components/GrantReadyCampaign";
import { loadGrantReadyData } from "../../lib/content-agent/grantready-store";
import { grantReadyBriefSchema, grantReadyIcpSchema, grantReadyRegistrySchema } from "../../lib/content-agent/grantready-campaign";

async function CampaignData() {
  await connection();
  const data = await loadGrantReadyData();
  const b = grantReadyBriefSchema.parse(data.brief);
  const i = grantReadyIcpSchema.parse(data.icp);
  const r = grantReadyRegistrySchema.parse(data.registry);
  return <GrantReadyCampaign campaign={{ description: b.description, audience: i.audience, disclaimer: b.disclaimer,
    authorization: r.authorization_state, claims: r.claims.filter(row => b.selected_claim_ids.includes(row.claim_id))
      .map(row => ({ id: row.claim_id, text: row.text, status: row.status })) }} synthetic={Boolean(process.env.GRANTREADY_DATA_DIR)} />;
}
export default function GrantReadyPage() {
  return <Suspense fallback={<p>Loading GrantReady proposed campaign…</p>}><CampaignData /></Suspense>;
}
