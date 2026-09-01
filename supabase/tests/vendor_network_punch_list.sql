do $$
declare
  o uuid;
  ow uuid := gen_random_uuid();
  h uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
begin
  select id into o from organizations where slug='homeops-demo-management';
  insert into owners(id,organization_id,full_name) values(ow,o,'Eligibility Test Owner');
  insert into homes(id,organization_id,owner_id,address1,city,state,postal_code,latitude,longitude) values(h,o,ow,'Test','Test','UT','84000',40,-111);
  insert into vendors(id,organization_id,name,approval_status,workflow_stage) values(v,o,'Eligibility Test Vendor','approved','approved');
  insert into vendor_service_areas(id,organization_id,vendor_id,area_type,center_lat,center_lng,radius_miles) values(a,o,v,'radius',40,-111,5);
  if not vendor_area_matches(v,h) then raise exception 'radius match failed'; end if;
  update vendor_service_areas set area_type='polygon',center_lat=null,center_lng=null,radius_miles=null,
    coverage=extensions.st_multi(extensions.st_geomfromtext('POLYGON((-112 39,-110 39,-110 41,-112 41,-112 39))',4326)) where id=a;
  if not vendor_area_matches(v,h) then raise exception 'polygon match failed'; end if;
  insert into vendor_credentials(organization_id,vendor_id,credential_type,name,expires_on,verification_status) values(o,v,'license','Expired test',current_date-1,'verified');
  perform refresh_vendor_eligibility(v);
  if not exists(select 1 from vendors where id=v and approval_status='suspended' and workflow_stage='renewal_required') then raise exception 'expiry refresh failed'; end if;
  delete from vendors where id=v;
  delete from homes where id=h;
  delete from owners where id=ow;
end $$;
