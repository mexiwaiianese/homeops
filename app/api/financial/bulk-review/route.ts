import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
export async function POST(req:Request){
  const {supabase,user,organizationId}=await getAuthedContext(); if(!supabase||!user||!organizationId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json(); const ids=Array.isArray(body.ids)?body.ids:[]; if(!ids.length)return NextResponse.json({error:"No transactions selected"},{status:400});
  const patch:any={reviewed_by:user.id,reviewed_at:new Date().toISOString()};
  if(body.propertyId){patch.property_id=body.propertyId;patch.allocation_status="matched";patch.match_confidence=1;patch.match_reason="Bulk controller assignment";}
  else if(body.markOverhead){patch.property_id=null;patch.allocation_status="overhead";patch.match_confidence=1;patch.match_reason="Bulk controller overhead assignment";}
  const {error}=await supabase.from("financial_transactions").update(patch).eq("organization_id",organizationId).in("id",ids); if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,updated:ids.length});
}
