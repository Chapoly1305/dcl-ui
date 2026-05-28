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
// provenance backend stage is "hidden" iff no DISPLAY_STAGES entry lists it in its
// `backend` array. That's how IDA Headless / Sidekick / Capability Recovery
// stay out of the timeline without an explicit denylist.

export const DISPLAY_STAGES = [
    {
        id: 'ota_image',
        label: 'OTA Image Parse',
        backend: ['matter_ota'],
        sections: [
            { id: 'manifest_integrity', name: 'Manifest-layer Integrity', desc: 'Verify OtaChecksum from DCL matches actual downloaded image' },
            { id: 'ota_format', name: 'Matter OTA Image Format', desc: 'Magic number check, TLV parse, and header field validation' },
            { id: 'payload_extraction', name: 'Image Digest / Payload Extraction', desc: 'Extract payload from Matter wrapper, verify ImageDigest' }
        ]
    },
    {
        id: 'chipset',
        label: 'Identify Chipset',
        backend: ['chipset_identify'],
        sections: [{ id: 'chipset_identify', name: 'Payload Type / Firmware Orientation', desc: 'Identify file type, architecture, platform, and load segments' }]
    },
    {
        id: 'firmware_encryption',
        label: 'Firmware Encryption',
        backend: ['chipset_identify'],
        sections: [
            { id: 'entropy', name: 'Encryption Detection', desc: 'Global + sliding-window Shannon entropy, encryption detection' },
            { id: 'weak_key_enc', name: 'Weak Key Test', desc: 'Probe known-weak keys when encryption is confirmed; skipped if firmware is not encrypted' }
        ]
    },
    {
        id: 'extract_executable',
        label: 'Extract Executable',
        backend: ['extract_executable'],
        sections: [{ id: 'non_firmware', name: 'Non-firmware Payload / Contamination', desc: 'Detect non-firmware artifacts (config, certs, backups, debug)' }]
    },
    {
        id: 'ota_authenticity',
        label: 'OTA Authenticity',
        backend: ['secure_boot_authenticity'],
        sections: [
            { id: 'secure_boot', name: 'Secure Boot', desc: 'Signed-update evidence, signature validation, public-key pinning' },
            { id: 'weak_key_ota', name: 'Weak Key Test', desc: 'Probe known-weak / factory-default signing keys; flag if the OTA signature can be forged with a published key' }
        ]
    },
    {
        id: 'sdk_version',
        label: 'SDK Version Recovery',
        backend: ['capability_recovery', 'sdk_version'],
        sections: [
            { id: 'CAP_RECOVERY', name: 'Capability Recovery', desc: 'Recover and normalize capability evidence from firmware artifacts' },
            { id: 'sdk_baseline', name: 'Matter SDK / Specification Baseline', desc: 'Recover SpecVer from Basic Information cluster, SDK branch estimate' }
        ]
    },
    {
        id: 'modular_analysis',
        label: 'Modular Analysis',
        backend: [],
        sections: [
            { id: 'custom_auth', name: 'Custom Authenticity Validation', desc: 'AI-driven: decompiles OTA apply spine, traces crypto gating, classifies authenticity. Transcript available.' },
            { id: 'secrets', name: 'Secrets / Sensitive Material', desc: 'AI-enriched: byte-scans for embedded secrets, then LLM disambiguates real keys from library refs and hex tables' },
            { id: 'rng_init', name: 'RNG Initialization', desc: 'AI-enriched: string-scans for entropy sources, then LLM traces init paths through decompiled code to confirm HW RNG' },
            { id: 'backdoor', name: 'Backdoor', desc: 'AI-driven: decompiles candidate sinks, traces data flow, assesses exploitability, discovers missed backdoor patterns' },
            { id: 'connectivity', name: 'Connectivity', desc: 'AI-enriched: extracts endpoints, then LLM researches unclassified URLs/IPs for privacy risk and C2 indicators' },
            { id: 'supply_chain', name: 'Supply-chain / Integration Failure', desc: 'AI-enriched: aggregates secure_boot/rng_init/secrets/sdk_baseline signals, then LLM identifies SDK-reuse patterns and recommends remediation' }
        ]
    },
    {
        id: 'finalize',
        label: 'Final Report',
        backend: ['finalize'],
        sections: [{ id: 'scoring', name: 'Scoring / Prioritization / Triage', desc: 'Aggregate conformance + security scores, assign P0-P3 priority' }]
    }
];

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
        case 'success':
            return 'PASSED';
        case 'danger':
            return 'ISSUE';
        case 'info':
            return 'NEEDS REVIEW';
        case 'secondary':
            return 'SKIPPED';
        case 'warning':
            return 'PENDING';
        default:
            return String(status || '').toUpperCase();
    }
}

// Title-case label (used by the live progress modal).
export function stageStatusFriendlyLabel(status) {
    // Show "Running" specifically while a stage is in flight, since the modal
    // polls during execution; pending and running look different to the user.
    if (String(status || '').toLowerCase() === 'running') return 'Running';
    switch (stageSeverity(status)) {
        case 'success':
            return 'Passed';
        case 'danger':
            return 'Issue';
        case 'info':
            return 'Needs Review';
        case 'secondary':
            return 'Skipped';
        case 'warning':
            return 'Pending';
        default:
            return 'Unknown';
    }
}

// Aggregate a display stage's status from its section cards and linked backend
// stages. Priority: danger > info > warning > success > secondary. If every
// contributor is skipped, surface as skipped.
export function aggregateDisplayStatus(display, linkedBackendStages, sectionResults) {
    const sectionSeverities = (display.sections || []).map((def) => {
        const r = (sectionResults || {})[def.id];
        return stageSeverity(r ? r.status : 'pending');
    });
    const backendSeverities = linkedBackendStages.map((s) => stageSeverity(s?.status || ''));
    const all = [...sectionSeverities, ...backendSeverities];
    if (!all.length) return 'pending';
    if (all.includes('danger')) return 'issue';
    if (all.includes('info')) return 'needs_review';
    if (all.every((s) => s === 'secondary')) return 'skipped';
    if (all.includes('warning')) return 'pending';
    if (all.includes('success')) return 'passed';
    return 'pending';
}
