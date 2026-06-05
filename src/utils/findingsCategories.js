/** Shared category metadata for findings clustering UI.
 *
 *  Must stay in sync with ``CATEGORY_META`` in
 *  ``src/matteroverwatch/internal/findings_clustering.py``.
 */

export const FINDINGS_CATEGORIES = {
    secrets:             { label: 'Secrets / Credentials Exposure',  icon: 'pi-lock',                    order: 1 },
    weak_key_ota:        { label: 'Authenticity (Weak Signing Keys)', icon: 'pi-shield',                  order: 2 },
    backdoor:            { label: 'Backdoor Indicators',              icon: 'pi-bug',                      order: 3 },
    rng_init:            { label: 'RNG / Entropy Issues',             icon: 'pi-cog',                      order: 4 },
    connectivity:        { label: 'Suspicious Endpoints / C2',        icon: 'pi-send',                     order: 5 },
    manifest_integrity:  { label: 'Manifest Integrity',               icon: 'pi-check-square',             order: 6 },
    supply_chain:        { label: 'Supply Chain Issues',              icon: 'pi-sitemap',                  order: 7 },
    weak_key_enc:        { label: 'Weak Encryption Keys',             icon: 'pi-key',                      order: 8 },
    conformance:         { label: 'Conformance Failures',             icon: 'pi-exclamation-triangle',     order: 9 },
    scoring:             { label: 'Priority Scoring (P0-P3)',         icon: 'pi-flag',                     order: 10 },
    non_firmware:        { label: 'Non-Firmware Payload',             icon: 'pi-file',                     order: 11 },
    lineage:             { label: 'Version / Lineage Issues',         icon: 'pi-history',                  order: 12 },
    url_tls:             { label: 'OTA URL / TLS Issues',             icon: 'pi-link',                     order: 13 },
    entropy:             { label: 'Encryption / Entropy',             icon: 'pi-shield',                  order: 14 },
};

/** PrimeVue severity / colour mapping for finding severities. */
export const SEVERITY_COLORS = {
    critical: 'danger',
    high:     'warn',
    medium:   'info',
    low:      'success',
    info:     'info',
};

export function categoryMeta(sectionId) {
    return FINDINGS_CATEGORIES[sectionId] || { label: sectionId, icon: 'pi-question-circle', order: 99 };
}
