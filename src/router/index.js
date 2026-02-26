import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/components/Dashboard.vue'
import Accounts from '@/views/Accounts/Accounts.vue'
import Vendors from '@/views/VendorInfo/Vendors.vue'
import Models from '@/views/Models/Models.vue'
import Compliance from '@/views/Compliance/Compliance.vue'
import PKI from '@/views/PKI/PKI.vue'
import Validators from '@/views/Validators/Validators.vue'
import Upgrades from '@/views/Upgrades/Upgrades.vue'
import LegacyWallet from '@/views/Tools/LegacyWallet.vue'
import KeplrConnectionDocs from '@/views/Docs/KeplrConnectionDocs.vue'
import Transactions from '@/views/Tools/Transactions.vue'
import FirmwareAvailable from '@/views/Tools/FirmwareAvailable.vue'
import FirmwareDetail from '@/views/Tools/FirmwareDetail.vue'
import FirmwareScanQueue from '@/views/Tools/FirmwareScanQueue.vue'
import FirmwareScanResults from '@/views/Tools/FirmwareScanResults.vue'
const routerHistory = createWebHistory()
const routes = [
    {
        path: '/',
        component: Dashboard
    },
    { path: '/accounts', component: Accounts },
    { path: '/vendors', component: Vendors },
    { path: '/models', component: Models },
    { path: '/compliance', component: Compliance },
    { path: '/pki', component: PKI },
    { path: '/validators', component: Validators },
    { path: '/upgrades', component: Upgrades },
    { path: "/legacy-wallet", component: LegacyWallet },
    { path: '/keplr-wallet', component: KeplrConnectionDocs },
    { path: '/transactions/blocks/:height?', component: Transactions },
    { path: '/firmware-security', redirect: '/firmware-security/available-firmware' },
    { path: '/firmware-security/available-firmware', component: FirmwareAvailable },
    { path: '/firmware-security/firmware/:sha256', component: FirmwareDetail },
    { path: '/firmware-security/scan-queue', component: FirmwareScanQueue },
    { path: '/firmware-security/scan-results', component: FirmwareScanResults },
]

const router = createRouter({
    history: routerHistory,
    routes
})

export default router
