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
            <li>
                <AppWallet></AppWallet>
            </li>
            <li>
                <Dropdown
                    class="network-switch"
                    v-model="selectedNetwork"
                    :options="networkItems"
                    optionLabel="label"
                    optionValue="value"
                    :disabled="!networkReady || networkItems.length <= 1"
                    :placeholder="`Network: ${networkLabel}`"
                    @change="onNetworkSelect"
                >
                    <template #value="slotProps">
                        <span class="network-switch-value">{{ slotProps.value || networkLabel }}</span>
                    </template>
                </Dropdown>
            </li>
            <li>
                <ThemeToggle />
            </li>
        </ul>
    </div>
</template>

<script>
import AppWallet from './AppWallet.vue';
import ThemeToggle from './ThemeToggle.vue';
export default {
    methods: {
        onMenuToggle(event) {
            this.$emit('menu-toggle', event);
        },
        onTopbarMenuToggle(event) {
            this.$emit('topbar-menu-toggle', event);
        },
        onNetworkSelect(event) {
            const value = event?.value;
            if (!value) return;
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
        networkLabel() {
            return this.$store.getters['network/networkDisplayLabel'];
        },
        darkTheme() {
            return this.$appState.darkTheme;
        }
    },
    components: {
        AppWallet: AppWallet,
        ThemeToggle: ThemeToggle
    }
};
</script>

<style scoped>
.layout-topbar .layout-topbar-logo img {
    height: 12rem;
    margin-right: 0.5rem;
}

.network-switch {
    min-width: 118px;
}

.network-switch :deep(.p-dropdown-label) {
    padding: 0.1rem 0.65rem;
    font-size: 0.8rem;
    min-height: 2rem;
}

.network-switch-value {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
}
</style>
