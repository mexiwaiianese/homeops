"use client";

import { useState } from "react";

export default function SettingsModal({
  alwaysOn,
  onClose,
  onSave,
}: {
  alwaysOn: boolean;
  onClose: () => void;
  onSave: (next: { autoAssignAlwaysOn: boolean }) => Promise<void> | void;
}) {
  const [autoAssignAlwaysOn, setAutoAssignAlwaysOn] = useState(alwaysOn);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <div className="modalShade" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <p className="eyebrow">ORGANIZATION SETTINGS</p>
            <h2>Dispatch defaults</h2>
          </div>
          <button className="closeBtn" onClick={onClose}>×</button>
        </div>
        <p className="summary">When a job is approved, eligible vendors are invited to a private reverse auction by email or SMS. Auto-assign skips the auction and picks one eligible shop. Vendors set autobid themselves after connecting a service calendar. Google review scores and paid placement never enter bidding.</p>
        <label className="checkRow">
          <input type="checkbox" checked={autoAssignAlwaysOn} onChange={(e) => setAutoAssignAlwaysOn(e.target.checked)} />
          <span>
            <strong>Always auto-assign after budget approval</strong>
            <small>Skip the reverse auction and assign an eligible vendor immediately. Leave this off to invite vendors to bid.</small>
          </span>
        </label>
        {message && <div className="notice">{message}</div>}
        <div className="modalActions">
          <button className="secondaryBtn" onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              Promise.resolve(onSave({ autoAssignAlwaysOn }))
                .then(() => onClose())
                .catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : "Could not save settings");
                  setBusy(false);
                });
            }}
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
