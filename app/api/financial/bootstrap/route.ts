import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";

const demoHomes = [
  {id:"h1",address1:"1427 Maple Street",city:"Lehi",state:"UT",property_code:"MAPLE-1427"},
  {id:"h2",address1:"881 Forest Avenue",city:"American Fork",state:"UT",property_code:"FOREST-881"},
  {id:"h3",address1:"44 Canyon View",city:"Highland",state:"UT",property_code:"CANYON-44"},
];
const demoTx = [
  {id:"t1",tx_date:"2026-08-01",vendor_name:"Tenant ACH",description:"August rent",account_name:"Rental Income",amount_cents:225000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[0]},
  {id:"t2",tx_date:"2026-08-03",vendor_name:"ABC Plumbing",description:"Kitchen sink repair",account_name:"Repairs & Maintenance",amount_cents:48600,flow_type:"expense",allocation_status:"matched",match_confidence:.94,homes:demoHomes[0]},
  {id:"t3",tx_date:"2026-08-06",vendor_name:"Home Depot",description:"Supplies",account_name:"Repairs & Maintenance",amount_cents:72816,flow_type:"expense",allocation_status:"review",match_confidence:0,homes:null},
  {id:"t4",tx_date:"2026-08-08",vendor_name:"GreenScape",description:"Monthly landscaping",account_name:"Landscaping",amount_cents:120000,flow_type:"expense",allocation_status:"review",match_confidence:0,homes:null},
  {id:"t5",tx_date:"2026-08-10",vendor_name:"HOA",description:"Quarterly HOA dues",account_name:"HOA",amount_cents:19500,flow_type:"expense",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
];

export async function GET() {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) return NextResponse.json({mode:"demo",homes:demoHomes,transactions:demoTx,imports:[]});
  if (!user || !organizationId) return NextResponse.json({mode:"auth"},{status:401});
  const [homes, tx, imports] = await Promise.all([
    supabase.from("homes").select("id,address1,city,state,property_code").eq("organization_id",organizationId).order("address1"),
    supabase.from("financial_transactions").select("*, homes(id,address1,city,state,property_code)").eq("organization_id",organizationId).order("tx_date",{ascending:false}).limit(1000),
    supabase.from("financial_import_batches").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(20),
  ]);
  const err = homes.error || tx.error || imports.error;
  if (err) return NextResponse.json({error:err.message},{status:500});
  return NextResponse.json({mode:"live",homes:homes.data,transactions:tx.data,imports:imports.data});
}
