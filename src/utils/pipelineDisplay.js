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
// A backend stage is "hidden" from the timeline iff no DISPLAY_STAGES entry
// lists it in its `backend` array. After build_databases got its own group,
// the only Phase I stage that stays hidden is the `meta` intake stage (plus
// the Phase II Sidekick helpers) — no explicit denylist needed.

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
        id: 'disassembly_db',
        label: 'Disassembly Databases',
        // Maps to the Phase I `build_databases` stage (formerly the hidden
        // `ida_headless` stage). This is the long pole — IDA recovery + FLIRT
        // and the Binary Ninja .bndb seed run here (~tens of seconds), so it
        // needs its own timeline row instead of being attributed to an
        // earlier group. Runs after Extract Executable because it consumes the
        // extracted ELF, and skips automatically when the payload is encrypted
        // or otherwise unsupported (executable_supported=false).
        //
        // `build_databases` provides the group's aggregate wall-clock; the two
        // synthetic per-builder rows (ida_database / binja_database, derived by
        // derive_database_cards) are listed too so aggregateDisplayStatus —
        // which only resolves section cards against this group's own backend —
        // can read each card's status, mirroring how the sdk_version group
        // lists `capability_recovery`.
        backend: ['build_databases', 'ida_database', 'binja_database'],
        sections: [
            // One card per builder. Their IDs match the synthetic stage rows
            // the backend derives from the build_databases stage details
            // (see derive_database_cards in stage_build_databases.py), so
            // aggregateDisplayStatus / checklistOutcome resolve each card's
            // status by name — the same Phase-I shuttle mechanism as the
            // capability_recovery card. The group is just a container: add
            // another { id, name, desc } here (and a tuple in
            // DATABASE_CARD_META) to represent a further builder.
            { id: 'ida_database', name: 'IDA Database', desc: 'Build the pristine IDA .i64 — cold recovery pass (endpoints, defaults, dynamic spec-version) plus FLIRT signature matching against the chipset family' },
            { id: 'binja_database', name: 'Binary Ninja Database', desc: 'Build / seed the content-addressed Binary Ninja .bndb cache so downstream AI + Sidekick RE reuse it instead of re-analysing the ELF; needs only Binary Ninja (not the Sidekick plugin) — skipped when Binary Ninja is unavailable' }
        ]
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
            // This card mirrors the Phase I `capability_recovery` stage,
            // not a Phase II section — the ID must match the backend
            // stage name so the lookups in PipelineStageTimeline.vue
            // and `aggregateDisplayStatus` can find its status.
            { id: 'capability_recovery', name: 'Capability Recovery', desc: 'Recover and normalize capability evidence from firmware artifacts' },
            { id: 'sdk_baseline', name: 'Matter SDK / Specification Baseline', desc: 'Recover SpecVer from Basic Information cluster, SDK branch estimate' }
        ]
    },
    {
        id: 'sidekick_re',
        label: 'Sidekick Deep RE',
        // Phase II section (no Phase I backend stage). Runs after the Binary
        // Ninja database is built (depends on the .bndb), then BNQL queries +
        // agent triage. The Modular Analysis AI cards wait for this when it
        // runs, and proceed without it when it is skipped/disabled/unavailable.
        backend: [],
        sections: [
            { id: 'sidekick_triage', name: 'Sidekick Triage', desc: 'BNQL semantic queries + Sidekick agent triage over the Binary Ninja .bndb — classifies candidate functions (auth-bypass, command/OTA handlers); reuses the .bndb from the Disassembly Databases step. Skipped when Sidekick is disabled or unavailable.' }
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
//
// Section cards may correspond to either a Phase II analysis section
// (status comes from `sectionResults` keyed by section_id) or a Phase I
// shuttle stage (status comes from the backend stage of the same name —
// e.g. `capability_recovery`). We try Phase II first, then fall back to
// the backend stage by name so Phase-I shuttles don't vote "pending"
// just because they're not in the Phase II results dict.
export function aggregateDisplayStatus(display, linkedBackendStages, sectionResults) {
    const backendByName = new Map(
        (linkedBackendStages || []).map((s) => [String(s?.name || ''), s])
    );
    const sectionSeverities = (display.sections || []).map((def) => {
        const r = (sectionResults || {})[def.id];
        if (r) return stageSeverity(r.status);
        const backend = backendByName.get(def.id);
        if (backend) return stageSeverity(backend.status || '');
        return stageSeverity('pending');
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
