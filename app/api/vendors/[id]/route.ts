import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { buildVendorFingerprint, normalizeVendorName } from "@/lib/vendors";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const {supabase,user,organizationId}=await getAuthedContext();
  if(!supabase||!user||!organizationId)return NextResponse.json({error:"Authentication required"},{status:401});
  const {id}=await params; const b=await request.json(); const name=String(b.name??"").trim();
  if(!name)return NextResponse.json({error:"Vendor name is required"},{status:400});
  const row={name,legal_name:b.legalName||null,dba_name:b.dbaName||null,normalized_name:normalizeVendorName(name),identity_fingerprint:buildVendorFingerprint({name,phone:b.phone,email:b.email,postalCode:b.postalCode}),trade:b.trade||null,email:b.email||null,phone:b.phone||null,website:b.website||null,address1:b.address1||null,address2:b.address2||null,city:b.city||null,state:b.state||null,postal_code:b.postalCode||null,private_notes:b.privateNotes||null,emergency_available:Boolean(b.emergencyAvailable),after_hours_available:Boolean(b.afterHoursAvailable),expected_response_minutes:b.expectedResponseMinutes?Number(b.expectedResponseMinutes):null};
  const {data,error}=await supabase.from("vendors").update(row).eq("id",id).eq("organization_id",organizationId).select().single();
  if(error)return NextResponse.json({error:error.message},{status:400}); return NextResponse.json({vendor:data});
}
