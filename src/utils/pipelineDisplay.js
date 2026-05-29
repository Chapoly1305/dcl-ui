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
//
// NOTE: DISPLAY_STAGES below is the static fallback. At runtime the backend
// registry (/api/v1/pipeline/components) is the single source of truth — see
// `displayStagesRef` + `loadPipeline()` at the bottom of this file.

import { shallowRef } from 'vue';

export const DISPLAY_STAGES = [
    {
        id: 'intake',
        label: 'OTA / Payload Intake',
        backend: ['meta', 'matter_ota'],
        sections: [
            { id: 'manifest_integrity', name: 'Manifest-layer Integrity', desc: 'Base64 decode OtaChecksum, recompute whole-file hash, compare with DCL declaration' },
            { id: 'ota_format', name: 'Matter OTA Image Format', desc: 'Magic number check, TLV parse, header field validation, cross-reference with DCL fields' },
            { id: 'payload_extraction', name: 'Image-layer Digest / Payload Extraction', desc: 'Extract payload from Matter wrapper, verify ImageDigest, compute payload SHA-256' },
            { id: 'matter_ota', name: 'Matter OTA Detection', desc: 'Detect + peel the Matter OTA wrapper; emit the inner payload.' },
        ]
    },
    {
        id: 'classify',
        label: 'Payload Classification',
        backend: ['chipset_identify', 'secure_boot_authenticity'],
        sections: [
            { id: 'chipset_identify', name: 'Payload Type / Firmware Orientation', desc: 'File type, architecture, platform/vendor identification, load base, segment recovery' },
            { id: 'entropy', name: 'Entropy / Encryption / Compression', desc: 'Global + sliding-window Shannon entropy, opacity cutoff (7.60 bits/byte), compression detection' },
            { id: 'secure_boot', name: 'Secure Boot / OTA Authenticity', desc: 'Signed-update evidence, default/test key detection, pre-install authenticity path analysis' },
            { id: 'weak_key_enc', name: 'Firmware Encryption — Weak Key Test', desc: 'Probe known-weak / factory-default encryption keys against an encrypted firmware payload' },
            { id: 'weak_key_ota', name: 'OTA Authenticity — Weak Key Test', desc: 'Probe known-weak / factory-default OTA signing keys against the captured signature' },
            { id: 'chipset_inference', name: 'Chipset Inference (Deterministic)', desc: 'Aggregate Phase I chipset plugin candidates to produce a confirmed / inferred / unknown verdict with KB family mapping' },
            { id: 'chipset_inference_ai', name: 'Chipset Inference (AI-assisted)', desc: 'LLM-based chipset identification fallback; only runs when deterministic inference is not confirmed' },
        ]
    },
    {
        id: 're_setup',
        label: 'Executable Recovery + Decompiler DB',
        backend: ['extract_executable', 'build_databases'],
        sections: [
            { id: 'extract_executable', name: 'Extract Executable', desc: 'Extract the chipset executable (ELF / ARM-vector bin) from the payload.' },
            { id: 'non_firmware', name: 'Non-firmware Payload / Pipeline Contamination', desc: 'Classify non-firmware artifacts (JSON/CBOR/config/credential/backup), detect pipeline contamination' },
            { id: 'sidekick_triage', name: 'Sidekick Deep RE / Triage', desc: 'BNQL semantic queries + Sidekick agent triage over the Binary Ninja .bndb; classifies candidate functions (auth-bypass, command handlers, OTA handlers). Reuses the .bndb built in Phase I.' },
            { id: 'ida_database', name: 'IDA Database', desc: 'Pristine IDA .i64 — recovery pass + FLIRT signature matching.' },
            { id: 'binja_database', name: 'Binary Ninja Database', desc: 'Content-addressed Binary Ninja .bndb cache for downstream RE.' },
        ]
    },
    {
        id: 'sdk_capability',
        label: 'SDK / Capability Baseline',
        backend: ['capability_recovery', 'sdk_version'],
        sections: [
            { id: 'capability_recovery', name: 'Capability Recovery', desc: 'Recover endpoints / clusters / attribute defaults from the IDA outputs.' },
            { id: 'sdk_baseline', name: 'Matter SDK / Specification Baseline', desc: 'Recover SpecVer from Basic Information cluster or heuristic fallback; SDK branch estimate' },
        ]
    },
    {
        id: 'analysis',
        label: 'Modular Analysis',
        backend: [],
        sections: [
            { id: 'secrets', name: 'Secrets / Sensitive Material Scan', desc: 'AI-enriched byte-scan for embedded secrets; disambiguates real keys from library refs, hex tables, and benign certs' },
            { id: 'rng_init', name: 'RNG / Crypto Initialization', desc: 'AI-enriched RNG audit; traces entropy init through decompiled code to confirm HW source vs deterministic seed' },
            { id: 'custom_auth', name: 'Custom Authenticity Validation', desc: 'AI-driven vendor-rolled signature verification; decompiles OTA apply spine, traces crypto gating, produces transcript' },
            { id: 'backdoor', name: 'Vendor Implementation / Sink-driven RE', desc: 'AI-driven backdoor detection; decompiles candidate sinks, traces data flow, assesses exploitability, discovers missed patterns' },
            { id: 'connectivity', name: 'Vendor-cloud Telemetry / Privacy', desc: 'AI-enriched endpoint audit; researches unclassified endpoints, assesses privacy risk, flags C2 indicators' },
            { id: 'lineage', name: 'Version Lineage / Cross-network / Regression', desc: 'Version chain analysis, testnet/mainnet cross-reference, binary/strings diff, regression detection' },
            { id: 'supply_chain', name: 'Supply-chain / Integration Failure', desc: 'AI-enriched aggregation of secure_boot/rng_init/secrets/sdk_baseline signals; identifies SDK-reuse patterns, assesses key-reuse potential, recommends remediation' },
        ]
    },
    {
        id: 'report',
        label: 'Final Report',
        backend: ['finalize'],
        sections: [
            { id: 'scoring', name: 'Scoring / Prioritization / Triage', desc: 'Conformance score, security score, manual RE priority (P0-P3), final report assembly' },
        ]
    },
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

// ---------------------------------------------------------------------------
// Registry-derived pipeline structure.
//
// The backend `/api/v1/pipeline/components` endpoint (build_pipeline_summary in
// section_registry.py) is the single source of truth for groups, components,
// and dependencies. These helpers turn that payload into the shapes the UI
// already consumes — so DISPLAY_STAGES (above) can become a runtime-derived
// fallback rather than a hand-maintained duplicate. `DISPLAY_STAGES` is kept as
// the static fallback used until/if the fetch resolves.
// ---------------------------------------------------------------------------

// Transform a pipeline summary into the DISPLAY_STAGES shape (groups → cards).
// The `conformance` group (paper Phase I / DCL spec) is excluded from the
// firmware-analysis timeline + DAG, matching the curated design.
export function buildDisplayStages(summary) {
    const groups = (summary && summary.groups ? summary.groups : []).filter((g) => g.id !== 'conformance');
    const comps = (summary && summary.components) ? summary.components : [];
    const byGroup = {};
    for (const c of comps) {
        if (!byGroup[c.group]) byGroup[c.group] = [];
        byGroup[c.group].push(c);
    }
    return groups.map((g) => {
        const members = (byGroup[g.id] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        return {
            id: g.id,
            label: g.label,
            // ctx_stage components carry the Phase-I-style status/timing the
            // timeline reads from `backend-stages`.
            backend: members.filter((c) => c.kind === 'ctx_stage').map((c) => c.id),
            sections: members
                .filter((c) => c.visible !== false)
                .map((c) => ({ id: c.id, name: c.label, desc: c.description })),
        };
    });
}

// Transform the dependency edges into the group→[prerequisite groups] map the
// batch builder's ensurePrerequisites uses (so it is no longer hand-maintained).
export function buildPrereqs(summary) {
    const comps = (summary && summary.components) ? summary.components : [];
    const groupOf = {};
    for (const c of comps) groupOf[c.id] = c.group;
    const deps = {};
    for (const edge of (summary && summary.edges ? summary.edges : [])) {
        const [u, v] = edge;
        const gu = groupOf[u];
        const gv = groupOf[v];
        if (!gu || !gv || gu === gv || gu === 'conformance' || gv === 'conformance') continue;
        if (!deps[gv]) deps[gv] = new Set();
        deps[gv].add(gu);
    }
    const out = {};
    for (const k of Object.keys(deps)) out[k] = [...deps[k]];
    return out;
}

// Fetch the registry-driven pipeline summary from the backend.
export async function fetchPipelineSummary(apiBase) {
    const res = await fetch(`${apiBase}/api/v1/pipeline/components`);
    if (!res.ok) throw new Error(`pipeline components fetch failed (${res.status})`);
    return res.json();
}

// ---------------------------------------------------------------------------
// Reactive pipeline store — the single source the UI consumes at runtime.
//
// Initialized to the static DISPLAY_STAGES (so the UI renders immediately and
// degrades gracefully if the backend is unreachable). `loadPipeline(apiBase)`
// fetches the registry once and swaps in the derived groups + prerequisite map.
// Consumers read `displayStagesRef.value` / `pipelinePrereqsRef.value`; because
// these are refs, Vue computeds re-run when the fetch resolves.
// ---------------------------------------------------------------------------
export const displayStagesRef = shallowRef(DISPLAY_STAGES);
export const pipelineSummaryRef = shallowRef(null);
export const pipelinePrereqsRef = shallowRef(null);

let _pipelineLoaded = false;

export async function loadPipeline(apiBase) {
    if (_pipelineLoaded || !apiBase) return;
    try {
        const summary = await fetchPipelineSummary(apiBase);
        const stages = buildDisplayStages(summary);
        if (Array.isArray(stages) && stages.length) {
            pipelineSummaryRef.value = summary;
            displayStagesRef.value = stages;
            pipelinePrereqsRef.value = buildPrereqs(summary);
            _pipelineLoaded = true;
        }
    } catch (_e) {
        // Backend unreachable / older build — keep the static fallback.
    }
}
