import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { canonicalAmount, matchHome, type ImportMapping } from "@/lib/financial";

export async function POST(req: Request) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) return NextResponse.json({error:"Connect Supabase to persist imports"},{status:400});
  if (!user || !organizationId) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body = await req.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const mapping: ImportMapping = body.mapping;
  if (!rows.length || !mapping?.date) return NextResponse.json({error:"Rows and date mapping are required"},{status:400});
  const {data: homes, error: homeErr} = await supabase.from("homes").select("id,address1,city,state,property_code").eq("organization_id",organizationId);
  if (homeErr) return NextResponse.json({error:homeErr.message},{status:500});
  const {data: batch, error: batchErr} = await supabase.from("financial_import_batches").insert({
    organization_id:organizationId, source:"quickbooks_csv", file_name:body.fileName || "QuickBooks export.csv", status:"processing",
    source_config:{mapping}, total_rows:rows.length, imported_by:user.id
  }).select("*").single();
  if (batchErr) return NextResponse.json({error:batchErr.message},{status:500});
  const txRows = rows.map((row: Record<string,string>, i:number) => {
    const amount = canonicalAmount(row,mapping); const match = matchHome(row,mapping,homes ?? []);
    return {
      organization_id:organizationId, import_batch_id:batch.id, external_id:`${batch.id}:${i+1}`,
      tx_date:row[mapping.date] || null, vendor_name:mapping.vendor ? row[mapping.vendor] : null,
      description:mapping.description ? row[mapping.description] : null, memo:mapping.memo ? row[mapping.memo] : null,
      account_name:mapping.account ? row[mapping.account] : null, qb_class:mapping.qbClass ? row[mapping.qbClass] : null,
      qb_location:mapping.qbLocation ? row[mapping.qbLocation] : null, qb_customer_project:mapping.customerProject ? row[mapping.customerProject] : null,
      amount_cents:amount.amount_cents, flow_type:amount.flow_type, property_id:match.propertyId,
      allocation_status:match.propertyId ? "matched" : "review", match_confidence:match.confidence, match_reason:match.reason, raw_data:row
    };
  });
  let matched = 0;
  for (let i=0;i<txRows.length;i+=500) {
    const chunk = txRows.slice(i,i+500); matched += chunk.filter((x:any)=>x.property_id).length;
    const {error} = await supabase.from("financial_transactions").insert(chunk); if (error) return NextResponse.json({error:error.message},{status:500});
  }
  await supabase.from("financial_import_batches").update({status:"complete",matched_rows:matched,review_rows:rows.length-matched}).eq("id",batch.id);
  return NextResponse.json({ok:true,batchId:batch.id,total:rows.length,matched,review:rows.length-matched});
}
