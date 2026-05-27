<template>
    <div class="layout-topbar">
        <button class="p-link layout-menu-button layout-topbar-button" @click="onMenuToggle">
            <i class="pi pi-bars"></i>
        </button>
        <router-link to="/" class="layout-topbar-logo">
            <img alt="Logo" src="/images/logo-transparent.png" />
            <span></span>
        </router-link>

        <button class="p-link layout-topbar-menu-button layout-topbar-button" v-styleclass="{ selector: '@next', enterClass: 'hidden', enterActiveClass: 'scalein', leaveToClass: 'hidden', leaveActiveClass: 'fadeout', hideOnOutsideClick: true }">
            <i class="pi pi-ellipsis-v"></i>
        </button>
        <ul class="layout-topbar-menu hidden lg:flex origin-top">
            <li v-if="networkReady && networkItems.length > 1">
                <div class="network-segment" role="radiogroup" aria-label="Network selector">
                    <button
                        v-for="net in networkItems"
                        :key="net.value"
                        class="network-segment-btn"
                        :class="{ active: selectedNetwork === net.value }"
                        :aria-checked="selectedNetwork === net.value"
                        role="radio"
                        @click="onNetworkSegmentClick(net.value)"
                    >
                        {{ net.label }}
                    </button>
                </div>
            </li>
            <li>
                <ThemeToggle />
            </li>
        </ul>
    </div>
</template>

<script>
import ThemeToggle from './ThemeToggle.vue';
export default {
    methods: {
        onMenuToggle(event) {
            this.$emit('menu-toggle', event);
        },
        onTopbarMenuToggle(event) {
            this.$emit('topbar-menu-toggle', event);
        },
        onNetworkSegmentClick(value) {
            if (!value || value === this.selectedNetwork) return;
            this.$emit('network-change', value);
        }
    },
    computed: {
        networkItems() {
            return this.$store.getters['network/networkItems'] || [];
        },
        selectedNetwork: {
            get() {
                return this.$store.state.network.selectedNetwork || this.$store.state.network.defaultNetwork || 'testnet';
            },
            set(network) {
                this.$store.dispatch('network/setSelectedNetwork', network);
            }
        },
        networkReady() {
            return this.$store.getters['network/isReady'];
        },
        darkTheme() {
            return this.$appState.darkTheme;
        }
    },
    components: {
        ThemeToggle: ThemeToggle
    }
};
</script>

<style scoped>
.network-segment {
    display: inline-flex;
    border-radius: var(--border-radius);
    overflow: hidden;
    border: 1px solid var(--surface-border);
}

.network-segment-btn {
    padding: 0.65rem 1.2rem;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: none;
    background: transparent;
    color: var(--text-color-secondary);
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
    outline: none;
    white-space: nowrap;
    font-family: inherit;
}

.network-segment-btn:not(:last-child) {
    border-right: 1px solid var(--surface-border);
}

.network-segment-btn:hover:not(.active) {
    color: var(--text-color);
    background: var(--surface-hover);
}

.network-segment-btn:focus-visible {
    box-shadow: inset 0 0 0 2px var(--primary-color);
}

.network-segment-btn.active {
    background: var(--primary-color);
    color: var(--primary-color-text);
}
</style>
