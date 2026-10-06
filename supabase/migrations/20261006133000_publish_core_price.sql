update subscription_packages
set
  monthly_cents = 9900,
  description = 'Operations desk, owner portal, and vendor desk. Free ACH on included properties.',
  updated_at = now()
where id = 'core';

update subscription_packages
set
  description = 'Adds listings, applications, rent collection, and the approved vendor network. Includes ongoing development time for automations. Free ACH on included properties.',
  updated_at = now()
where id = 'operations';

update subscription_packages
set
  description = 'Adds books and the tenant portal. Includes ongoing development time for personalization and new feature creation. Free ACH on included properties.',
  updated_at = now()
where id = 'portfolio';
