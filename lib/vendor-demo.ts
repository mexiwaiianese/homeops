import type { VendorApprovalStatus, VendorWorkflowStage } from "@/lib/vendors";

export const vendors: Array<{
  id:string; name:string; trade:string; city:string; state:string; workflow_stage:VendorWorkflowStage; approval_status:VendorApprovalStatus;
  services:string[]; emergency_available:boolean; expected_response_minutes:number; minimum_trip_charge_cents:number; hourly_rate_cents:number;
  email?:string|null; phone?:string|null;
  credentials:Array<{name:string;status:string;expires_on:string}>; performance:{jobs:number;avgResponse:number;callbackRate:number;managerRating:number|null};
}> = [
  { id:"v1", name:"Demo Heating Co.", trade:"HVAC", city:"Example City", state:"UT", workflow_stage:"monitored", approval_status:"preferred", services:["HVAC","Furnace","AC"], emergency_available:true, expected_response_minutes:45, minimum_trip_charge_cents:8900, hourly_rate_cents:14500, email:"dispatch@demoheating.example", phone:"(385) 555-0101", credentials:[{name:"State HVAC License",status:"verified",expires_on:"2027-06-30"},{name:"General Liability",status:"verified",expires_on:"2027-01-15"}], performance:{jobs:18,avgResponse:39,callbackRate:.06,managerRating:4.7}},
  { id:"v2", name:"Demo Plumbing Co.", trade:"Plumbing", city:"Example City", state:"UT", workflow_stage:"approved", approval_status:"approved", services:["Plumbing","Water Heater"], emergency_available:true, expected_response_minutes:60, minimum_trip_charge_cents:7900, hourly_rate_cents:13500, email:"office@demoplumbing.example", phone:"(801) 555-0144", credentials:[{name:"Plumbing License",status:"verified",expires_on:"2027-03-01"},{name:"General Liability",status:"verified",expires_on:"2026-10-12"}], performance:{jobs:7,avgResponse:58,callbackRate:.14,managerRating:4.4}},
  { id:"v3", name:"Demo Home Services", trade:"General Maintenance", city:"Sample City", state:"UT", workflow_stage:"documents_reviewed", approval_status:"conditional", services:["General Maintenance","Appliance Repair","Drywall"], emergency_available:false, expected_response_minutes:180, minimum_trip_charge_cents:6500, hourly_rate_cents:9500, email:"jobs@demohomeservices.example", phone:"(801) 555-0177", credentials:[{name:"General Liability",status:"pending",expires_on:"2026-11-30"}], performance:{jobs:2,avgResponse:145,callbackRate:0,managerRating:null}},
];
