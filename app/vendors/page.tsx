"use client";

import { useEffect, useMemo, useState } from "react";
import type { VendorApprovalStatus, VendorWorkflowStage } from "@/lib/vendors";

type VendorRow = {
  id:string; name:string; trade?:string|null; city?:string|null; state?:string|null;
  workflow_stage:VendorWorkflowStage; approval_status:VendorApprovalStatus;
  emergency_available?:boolean; expected_response_minutes?:number|null;
  minimum_trip_charge_cents?:number|null; hourly_rate_cents?:number|null;
  services?:string[]; vendor_services?:Array<{ specialty?:string|null; service_categories?:{name?:string}|null }>;
  credentials?:Array<{name:string;status:string;expires_on:string}>;
  vendor_credentials?:Array<{name:string;verification_status:string;expires_on?:string|null}>;
  performance?:{jobs:number;avgResponse:number;callbackRate:number;managerRating:number|null};
  vendor_performance_events?:Array<any>;
};

const money=(c?:number|null)=>c==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(c/100);
const stageLabel=(s:string)=>s.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const stages:VendorWorkflowStage[]=["candidate","invited","application_submitted","documents_reviewed","approved","monitored","renewal_required","suspended"];

export default function VendorsPage(){
  const [vendors,setVendors]=useState<VendorRow[]>([]);
  const [mode,setMode]=useState("checking");
  const [q,setQ]=useState("");
  const [status,setStatus]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [toast,setToast]=useState("");

  async function load(){
    const p=new URLSearchParams();
    if(q)p.set("q",q); if(status)p.set("status",status);
    const r=await fetch("/api/vendors?"+p.toString());
    const body=await r.json();
    if(!r.ok){setMode(r.status===401?"auth":"error");return;}
    setMode(body.mode); setVendors(body.vendors??[]);
    if(!selected && body.vendors?.[0]) setSelected(body.vendors[0].id);
  }
  useEffect(()=>{void load();},[status]);
  useEffect(()=>{const t=setTimeout(()=>void load(),250);return()=>clearTimeout(t);},[q]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2500);return()=>clearTimeout(t)},[toast]);

  const vendor=vendors.find(v=>v.id===selected)??vendors[0];
  const stats=useMemo(()=>({
    approved:vendors.filter(v=>["approved","preferred"].includes(v.approval_status)).length,
    conditional:vendors.filter(v=>v.approval_status==="conditional").length,
    renewal:vendors.filter(v=>["renewal_required","suspended"].includes(v.workflow_stage)).length,
    emergency:vendors.filter(v=>v.emergency_available).length
  }),[vendors]);

  async function moveStage(next:VendorWorkflowStage){
    if(!vendor)return;
    if(mode==="demo"){setVendors(rows=>rows.map(v=>v.id===vendor.id?{...v,workflow_stage:next}:v));setToast("Demo workflow updated locally");return;}
    const r=await fetch(`/api/vendors/${vendor.id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({workflowStage:next,approvalStatus:next==="approved"?"approved":vendor.approval_status,reason:"Updated from Vendor Network workspace"})});
    const body=await r.json(); if(!r.ok){setToast(body.error||"Could not update vendor");return;}
    setVendors(rows=>rows.map(v=>v.id===vendor.id?{...v,...body.vendor}:v));setToast("Vendor workflow updated");
  }

  const services=vendor ? (vendor.services??vendor.vendor_services?.map(s=>s.specialty||s.service_categories?.name||"Service").filter(Boolean)??[]) : [];
  const creds=vendor ? (vendor.credentials??vendor.vendor_credentials?.map(c=>({name:c.name,status:c.verification_status,expires_on:c.expires_on??""}))??[]) : [];

  return <main className="vendorShell">
    {toast&&<div className="toast">{toast}</div>}
    <aside className="finSide">
      <a className="brand finBrand" href="/"><div className="brandMark">H</div><div><strong>HomeOps</strong><span>Rental home OS</span></div></a>
      <nav><a className="finNav" href="/">Operations</a><a className="finNav" href="/financials">Financials</a><a className="finNav active" href="/vendors">Approved Vendors</a></nav>
      <div className="portfolio"><small>VENDOR NETWORK</small><strong>{vendors.length} records</strong><span>{stats.approved} approved / preferred</span><span className={"mode "+mode}>{mode==="live"?"● Supabase live":mode==="demo"?"○ Demo mode":"Checking…"}</span></div>
    </aside>
    <section className="vendorContent">
      <header className="finHeader"><div><p className="eyebrow">APPROVED VENDOR NETWORK</p><h1>Trusted vendors, before marketplace growth.</h1><p>Approve, monitor, and route work using structured vendor records, verified credentials, coverage, owner rules, and operational history.</p></div><a className="primary vendorAdd" href="#directory">+ Candidate vendor</a></header>
      <div className="stats finStats"><Stat label="Approved / preferred" value={stats.approved}/><Stat label="Conditional" value={stats.conditional}/><Stat label="Renewal attention" value={stats.renewal}/><Stat label="Emergency capable" value={stats.emergency}/></div>

      <section className="panel">
        <div className="panelHead"><div><p className="eyebrow">APPROVAL WORKFLOW</p><h2>Candidate → monitored</h2></div><span className="pill">Credential-gated</span></div>
        <div className="vendorFlow">{stages.map((s,i)=><button key={s} className={vendor?.workflow_stage===s?"active":""} onClick={()=>void moveStage(s)} disabled={!vendor}><b>{i+1}</b><span>{stageLabel(s)}</span></button>)}</div>
      </section>

      <div className="vendorLayout" id="directory">
        <section className="panel vendorListPanel">
          <div className="panelHead"><div><p className="eyebrow">DIRECTORY</p><h2>{vendors.length} vendors</h2></div></div>
          <div className="vendorFilters"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search trade, city, vendor…" /><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="preferred">Preferred</option><option value="approved">Approved</option><option value="conditional">Conditional</option><option value="suspended">Suspended</option><option value="blocked">Blocked</option></select></div>
          {vendors.map(v=><button className={vendor?.id===v.id?"vendorRow selected":"vendorRow"} key={v.id} onClick={()=>setSelected(v.id)}><div><strong>{v.name}</strong><span>{v.trade||"General vendor"} • {[v.city,v.state].filter(Boolean).join(", ")||"Service area not set"}</span></div><span className={"vendorStatus "+v.approval_status}>{v.approval_status}</span></button>)}
        </section>

        <section className="panel vendorDetail">
          {!vendor?<div className="empty">No vendors match these filters.</div>:<>
            <div className="passportHero"><div><p className="eyebrow">VENDOR RECORD</p><h2>{vendor.name}</h2><p>{vendor.trade||"General vendor"} • {[vendor.city,vendor.state].filter(Boolean).join(", ")}</p></div><span className={"vendorStatus "+vendor.approval_status}>{vendor.approval_status}</span></div>
            <div className="miniStats vendorMini"><div><span>Workflow</span><strong>{stageLabel(vendor.workflow_stage)}</strong></div><div><span>Emergency</span><strong>{vendor.emergency_available?"Available":"Standard hours"}</strong></div><div><span>Expected response</span><strong>{vendor.expected_response_minutes?vendor.expected_response_minutes+" min":"—"}</strong></div><div><span>Trip / hourly</span><strong>{money(vendor.minimum_trip_charge_cents)} / {money(vendor.hourly_rate_cents)}</strong></div></div>

            <div className="sectionTitle"><h3>Services & specialties</h3><span>{services.length} listed</span></div><div className="chipRow">{services.length?services.map(s=><span className="serviceChip" key={s}>{s}</span>):<div className="empty">No services recorded.</div>}</div>
            <div className="sectionTitle"><h3>Credentials</h3><span>Expiration affects eligibility</span></div>
            <div className="credentialList">{creds.length?creds.map(c=><div className="credential" key={c.name}><div><strong>{c.name}</strong><span>{c.expires_on?"Expires "+c.expires_on:"No expiration recorded"}</span></div><span className={"cred "+c.status}>{c.status}</span></div>):<div className="empty">No credentials recorded. Approval should remain conditional until required documents are reviewed.</div>}</div>
            <div className="sectionTitle"><h3>Performance scorecard</h3><span>Objective ≠ subjective</span></div>
            <Scorecard vendor={vendor}/>
            <div className="notice"><strong>Ranking integrity:</strong> performance cannot be purchased. Future sponsored placement must remain visually separate and never change this scorecard or organic qualification.</div>
          </>}
        </section>
      </div>
    </section>
  </main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span>{label}</span><div className="statValue">{value}</div><small>Current filtered directory</small></div>}
function Scorecard({vendor}:{vendor:VendorRow}){
  const p=vendor.performance;
  const events=vendor.vendor_performance_events??[];
  const jobs=p?.jobs??events.length;
  const response=p?.avgResponse??(events.length?Math.round(events.reduce((s,e)=>s+(e.response_minutes||0),0)/events.filter(e=>e.response_minutes!=null).length):null);
  const callback=p?.callbackRate??(events.length?events.filter(e=>e.callback_required).length/events.length:null);
  const rating=p?.managerRating??(events.filter(e=>e.manager_rating!=null).length?events.filter(e=>e.manager_rating!=null).reduce((s,e)=>s+e.manager_rating,0)/events.filter(e=>e.manager_rating!=null).length:null);
  return <div className="scoreGrid"><div><span>Completed sample</span><strong>{jobs} jobs</strong><small>{jobs<5?"Too little history for strong conclusions":"Operational sample available"}</small></div><div><span>Avg response</span><strong>{response!=null?response+" min":"—"}</strong><small>Objective metric</small></div><div><span>Callback rate</span><strong>{callback!=null?Math.round(callback*100)+"%":"—"}</strong><small>Objective metric</small></div><div><span>Manager rating</span><strong>{rating!=null&&jobs>=3?rating.toFixed(1)+"/5":"Insufficient sample"}</strong><small>Subjective • minimum 3</small></div></div>
}
