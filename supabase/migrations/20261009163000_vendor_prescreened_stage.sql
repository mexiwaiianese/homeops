-- Platform admin can move a vendor to Prescreened. Managers can see that stage.

alter table vendors drop constraint if exists vendors_workflow_stage_check;

alter table vendors add constraint vendors_workflow_stage_check
  check (workflow_stage in (
    'candidate',
    'invited',
    'application_submitted',
    'documents_reviewed',
    'prescreened',
    'approved',
    'monitored',
    'renewal_required',
    'suspended'
  ));
