// Single source of truth for the analysis-pipeline UI:
//   - which backend stages are user-visible (vs tool/enabler stages)
//   - the friendly display label for each stage
//   - the modular "display stages" used by the Stages tab (each one groups
//     one or more backend stages + a list of cards)
//   - the five-state status palette (PASSED / PENDING / SKIPPED / ISSUE /
//     AI REVIEW) and its mapping to PrimeVue severity strings
//
// Both the Stages tab (FirmwareScanResults.vue) and the live progress modal
// (FirmwareJobProgressModal.vue) import from here. Add a new stage / card
// by editing DISPLAY_STAGES — every UI surface picks it up.
//
// A backend stage is "hidden" iff no DISPLAY_STAGES entry lists it in its
// `backend` array. That's how IDA Headless / Sidekick / Capability Recovery
// stay out of the timeline without an explicit denylist.

export const DISPLAY_STAGES = [
  {
    id: 'ota_image',
    label: 'OTA Image Parse',
    backend: ['10_matter_ota'],
    sections: [
      { id: 'E', name: 'Manifest-layer Integrity', desc: 'Verify OtaChecksum from DCL matches actual downloaded image' },
      { id: 'F', name: 'Matter OTA Image Format', desc: 'Magic number check, TLV parse, and header field validation' },
      { id: 'G', name: 'Image Digest / Payload Extraction', desc: 'Extract payload from Matter wrapper, verify ImageDigest' },
    ],
  },
  {
    id: 'chipset',
    label: 'Identify Chipset',
    backend: ['20_chipset_identify'],
    sections: [
      { id: 'H', name: 'Payload Type / Firmware Orientation', desc: 'Identify file type, architecture, platform, and load segments' },
    ],
  },
  {
    id: 'firmware_encryption',
    label: 'Firmware Encryption',
    backend: ['20_chipset_identify'],
    sections: [
      { id: 'I', name: 'Encryption Detection', desc: 'Global + sliding-window Shannon entropy, encryption detection' },
      { id: 'WK_ENC', name: 'Weak Key Test', desc: 'Probe known-weak keys when encryption is confirmed; skipped if firmware is not encrypted' },
    ],
  },
  {
    id: 'extract_executable',
    label: 'Extract Executable',
    backend: ['30_extract_executable'],
    sections: [
      { id: 'Q', name: 'Non-firmware Payload / Contamination', desc: 'Detect non-firmware artifacts (config, certs, backups, debug)' },
    ],
  },
  {
    id: 'ota_authenticity',
    label: 'OTA Authenticity',
    backend: ['45_secure_boot_authenticity'],
    sections: [
      { id: 'L', name: 'Secure Boot', desc: 'Signed-update evidence, signature validation, public-key pinning' },
      { id: 'WK_OTA', name: 'Weak Key Test', desc: 'Probe known-weak / factory-default signing keys; flag if the OTA signature can be forged with a published key' },
      { id: 'CA', name: 'Custom Authenticity Validation', desc: 'Reverse-engineered authenticity check; skipped if Secure Boot is enforced with a strong key' },
    ],
  },
  {
    id: 'sdk_version',
    label: 'SDK Version Recovery',
    backend: ['60_sdk_version'],
    sections: [
      { id: 'K', name: 'Matter SDK / Specification Baseline', desc: 'Recover SpecVer from Basic Information cluster, SDK branch estimate' },
    ],
  },
  {
    id: 'modular_analysis',
    label: 'Modular Analysis',
    backend: [],
    sections: [
      { id: 'N', name: 'RNG Initialization', desc: 'Verify the firmware seeds its RNG with sufficient entropy before generating session keys and certificates' },
      { id: 'O', name: 'Backdoor', desc: 'Detect suspicious sinks, hardcoded credentials, and undocumented remote-control paths' },
      { id: 'P', name: 'Connectivity', desc: 'Map external network endpoints, OTA provider URLs, and beaconing behavior reachable from the firmware' },
    ],
  },
  {
    id: 'finalize',
    label: 'Final Report',
    backend: ['90_finalize'],
    sections: [
      { id: 'S', name: 'Scoring / Prioritization / Triage', desc: 'Aggregate conformance + security scores, assign P0-P3 priority' },
    ],
  },
];

// Derived: every backend stage name that is currently surfaced somewhere.
const _VISIBLE_BACKEND = new Set(
  DISPLAY_STAGES.flatMap(d => d.backend || [])
);

// True iff the backend stage is a tool / enabler that the UI should hide.
export function isToolStage(name) {
  return !_VISIBLE_BACKEND.has(String(name || ''));
}

// Friendly label for a raw backend stage name. Falls back to the raw name
// (with the legacy `NN_` prefix stripped) if no display stage owns it.
export function labelForBackendStage(name) {
  const key = String(name || '');
  for (const d of DISPLAY_STAGES) {
    if ((d.backend || []).includes(key)) return d.label;
  }
  return key.replace(/^\d+_/, '').replace(/_/g, ' ') || '-';
}

// Map any raw status string to one of the five canonical PrimeVue severities.
//   success    → green PASSED
//   danger     → red ISSUE
//   info       → blue AI REVIEW
//   warning    → yellow PENDING (also covers running)
//   secondary  → gray SKIPPED
export function stageSeverity(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'success' || key === 'done' || key === 'passed' || key === 'ok') return 'success';
  if (key === 'failed' || key === 'error' || key === 'issue' || key === 'fail') return 'danger';
  if (key === 'needs_review' || key === 'ai_review' || key === 'review' || key === 'uncertain') return 'info';
  if (key === 'skipped' || key === 'not_applicable' || key === 'n/a' || key === 'na') return 'secondary';
  if (key === 'pending' || key === 'not_checked' || key === 'running' || key === '') return 'warning';
  return 'secondary';
}

// Uppercase badge label (used by the Stages tab cards and the result legend).
export function stageStatusBadgeLabel(status) {
  switch (stageSeverity(status)) {
    case 'success':   return 'PASSED';
    case 'danger':    return 'ISSUE';
    case 'info':      return 'AI REVIEW';
    case 'secondary': return 'SKIPPED';
    case 'warning':   return 'PENDING';
    default:          return String(status || '').toUpperCase();
  }
}

// Title-case label (used by the live progress modal).
export function stageStatusFriendlyLabel(status) {
  // Show "Running" specifically while a stage is in flight, since the modal
  // polls during execution; pending and running look different to the user.
  if (String(status || '').toLowerCase() === 'running') return 'Running';
  switch (stageSeverity(status)) {
    case 'success':   return 'Passed';
    case 'danger':    return 'Issue';
    case 'info':      return 'AI Review';
    case 'secondary': return 'Skipped';
    case 'warning':   return 'Pending';
    default:          return 'Unknown';
  }
}
