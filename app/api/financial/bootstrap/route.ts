import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";

const demoHomes = [
  {id:"h1",address1:"1427 Maple Street",city:"Lehi",state:"UT",property_code:"MAPLE-1427"},
  {id:"h2",address1:"881 Forest Avenue",city:"American Fork",state:"UT",property_code:"FOREST-881"},
  {id:"h3",address1:"44 Canyon View",city:"Highland",state:"UT",property_code:"CANYON-44"},
];
const demoTx = [
  {id:"t1",tx_date:"2026-05-01",vendor_name:"Tenant ACH",description:"May rent",account_name:"Rental Income",amount_cents:225000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[0]},
  {id:"t2",tx_date:"2026-05-01",vendor_name:"Tenant ACH",description:"May rent",account_name:"Rental Income",amount_cents:249500,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[1]},
  {id:"t3",tx_date:"2026-05-01",vendor_name:"Tenant ACH",description:"May rent",account_name:"Rental Income",amount_cents:285000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
  {id:"t4",tx_date:"2026-05-08",vendor_name:"GreenScape",description:"Monthly landscaping",account_name:"Landscaping",amount_cents:18000,flow_type:"expense",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
  {id:"t5",tx_date:"2026-05-16",vendor_name:"Wasatch HVAC",description:"Spring tune-up",account_name:"HVAC",amount_cents:18900,flow_type:"expense",allocation_status:"matched",match_confidence:.96,homes:demoHomes[0]},
  {id:"t6",tx_date:"2026-06-01",vendor_name:"Tenant ACH",description:"June rent",account_name:"Rental Income",amount_cents:225000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[0]},
  {id:"t7",tx_date:"2026-06-01",vendor_name:"Tenant ACH",description:"June rent",account_name:"Rental Income",amount_cents:249500,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[1]},
  {id:"t8",tx_date:"2026-06-01",vendor_name:"Tenant ACH",description:"June rent",account_name:"Rental Income",amount_cents:285000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
  {id:"t9",tx_date:"2026-06-10",vendor_name:"Summit Plumbing",description:"Water heater valve",account_name:"Plumbing",amount_cents:48600,flow_type:"expense",allocation_status:"matched",match_confidence:.94,homes:demoHomes[0]},
  {id:"t10",tx_date:"2026-06-14",vendor_name:"Peak Roofing",description:"Storm repair",account_name:"Roofing",amount_cents:312500,flow_type:"expense",allocation_status:"matched",match_confidence:1,homes:demoHomes[1]},
  {id:"t11",tx_date:"2026-06-20",vendor_name:"Canyon HOA",description:"Quarterly dues",account_name:"HOA",amount_cents:19500,flow_type:"expense",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
  {id:"t12",tx_date:"2026-07-01",vendor_name:"Tenant ACH",description:"July rent",account_name:"Rental Income",amount_cents:225000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[0]},
  {id:"t13",tx_date:"2026-07-01",vendor_name:"Tenant ACH",description:"July rent",account_name:"Rental Income",amount_cents:249500,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[1]},
  {id:"t14",tx_date:"2026-07-01",vendor_name:"Tenant ACH",description:"July rent",account_name:"Rental Income",amount_cents:285000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
  {id:"t15",tx_date:"2026-07-07",vendor_name:"Wasatch HVAC",description:"AC compressor repair",account_name:"HVAC",amount_cents:168000,flow_type:"expense",allocation_status:"matched",match_confidence:1,homes:demoHomes[1]},
  {id:"t16",tx_date:"2026-07-12",vendor_name:"Beehive Turnovers",description:"Paint and patch",account_name:"Turnover",amount_cents:94000,flow_type:"expense",allocation_status:"matched",match_confidence:.92,homes:demoHomes[2]},
  {id:"t17",tx_date:"2026-07-19",vendor_name:"Home Supply Co.",description:"Maintenance supplies",account_name:"Repairs & Maintenance",amount_cents:21800,flow_type:"expense",allocation_status:"matched",match_confidence:.91,homes:demoHomes[0]},
  {id:"t18",tx_date:"2026-08-01",vendor_name:"Tenant ACH",description:"August rent",account_name:"Rental Income",amount_cents:225000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[0]},
  {id:"t19",tx_date:"2026-08-01",vendor_name:"Tenant ACH",description:"August rent",account_name:"Rental Income",amount_cents:249500,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[1]},
  {id:"t20",tx_date:"2026-08-01",vendor_name:"Tenant ACH",description:"August rent",account_name:"Rental Income",amount_cents:285000,flow_type:"income",allocation_status:"matched",match_confidence:1,homes:demoHomes[2]},
  {id:"t21",tx_date:"2026-08-06",vendor_name:"Home Supply Co.",description:"Supplies - property unclear",account_name:"Repairs & Maintenance",amount_cents:72816,flow_type:"expense",allocation_status:"review",match_confidence:0,homes:null},
  {id:"t22",tx_date:"2026-08-08",vendor_name:"GreenScape",description:"Portfolio landscaping invoice",account_name:"Landscaping",amount_cents:54000,flow_type:"expense",allocation_status:"review",match_confidence:0,homes:null},
  {id:"t23",tx_date:"2026-08-12",vendor_name:"HomeOps Software",description:"Monthly operations software",account_name:"Software",amount_cents:15900,flow_type:"expense",allocation_status:"overhead",match_confidence:1,homes:null},
  {id:"t24",tx_date:"2026-08-16",vendor_name:"Summit Plumbing",description:"Drain clearing",account_name:"Plumbing",amount_cents:32900,flow_type:"expense",allocation_status:"matched",match_confidence:.98,homes:demoHomes[2]},
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
