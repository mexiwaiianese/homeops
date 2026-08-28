import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const {supabase,user,organizationId}=await getAuthedContext();
  if(!supabase||!user||!organizationId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json(); const patch:any={};
  if("propertyId" in body){patch.property_id=body.propertyId||null;patch.allocation_status=body.propertyId?"matched":"review";patch.match_confidence=body.propertyId?1:0;patch.match_reason="Controller reviewed";}
  if(body.markOverhead){patch.property_id=null;patch.allocation_status="overhead";patch.match_confidence=1;patch.match_reason="Controller marked as company overhead";}
  if(body.category!==undefined)patch.normalized_category=body.category||null;
  patch.reviewed_by=user.id;patch.reviewed_at=new Date().toISOString();
  const {data,error}=await supabase.from("financial_transactions").update(patch).eq("id",id).eq("organization_id",organizationId).select("*,homes(id,address1,city,state,property_code)").single();
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({transaction:data});
}
