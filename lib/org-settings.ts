export type OrgDispatchSettings = {
  autoAssignAlwaysOn: boolean;
};

export const DEFAULT_ORG_SETTINGS: OrgDispatchSettings = {
  autoAssignAlwaysOn: false,
};

export function parseOrgSettings(value: unknown): OrgDispatchSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    autoAssignAlwaysOn: raw.autoAssignAlwaysOn === true,
  };
}

export function orgSettingsPatch(current: unknown, next: Partial<OrgDispatchSettings>) {
  return {
    ...parseOrgSettings(current),
    ...next,
  };
}

const demoStore =
  ((globalThis as typeof globalThis & { __homeopsOrgSettings?: OrgDispatchSettings }).__homeopsOrgSettings ??= {
    ...DEFAULT_ORG_SETTINGS,
  });

export function getDemoOrgSettings() {
  return { ...demoStore };
}

export function setDemoOrgSettings(next: Partial<OrgDispatchSettings>) {
  Object.assign(demoStore, parseOrgSettings({ ...demoStore, ...next }));
  return getDemoOrgSettings();
}

/** Put dispatch settings back to the defaults. */
export function resetDemoOrgSettings() {
  Object.assign(demoStore, DEFAULT_ORG_SETTINGS);
  return getDemoOrgSettings();
}
