import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

const STORAGE_KEY = 'matteroverwatch.active_network';

function asLower(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeNetwork(value) {
	const key = asLower(value);
	return key === 'mainnet' || key === 'testnet' ? key : '';
}

function resolveStoredNetwork() {
	if (typeof localStorage === 'undefined') {
		return '';
	}
	return normalizeNetwork(localStorage.getItem(STORAGE_KEY));
}

function persistNetwork(network) {
	if (typeof localStorage === 'undefined') {
		return;
	}
	if (network) {
		localStorage.setItem(STORAGE_KEY, network);
	} else {
		localStorage.removeItem(STORAGE_KEY);
	}
}

function dedupe(values) {
	const out = new Set();
	const result = [];
	for (const value of values) {
		const key = normalizeNetwork(value);
		if (!key || out.has(key)) {
			continue;
		}
		out.add(key);
		result.push({
			value: key,
			label: key === 'mainnet' ? 'Mainnet' : 'Testnet',
		});
	}
	return result;
}

function trimTrailingSlash(value) {
	return String(value || '').replace(/\/$/, '');
}

export default {
	namespaced: true,
	state: () => ({
		initialized: false,
		loading: false,
		error: '',
		requestBase: '',
		defaultNetwork: '',
		enabledNetworks: [],
		options: [],
		selectedNetwork: '',
	}),
	getters: {
		hasNetworks(state) {
			return state.enabledNetworks.length > 0;
		},
		network(state) {
			return state.selectedNetwork || state.defaultNetwork;
		},
		networkItems(state) {
			const items = dedupe(state.enabledNetworks);
		return items.sort((a) => a.value === 'mainnet' ? -1 : 1);
		},
		networkDisplayLabel(state) {
			const value = String(state.selectedNetwork || state.defaultNetwork || '').trim();
			return value === 'mainnet' ? 'Mainnet' : 'Testnet';
		},
		selectedOption(state, getters) {
			const network = getters.network;
			return (state.options || []).find((row) => normalizeNetwork(row?.network) === network) || {};
		},
		dclRestEndpoint(state, getters) {
			const option = getters.selectedOption || {};
			const proxyBase = String(option.dcl_rest_proxy_base || '').trim();
			if (state.requestBase && proxyBase) {
				return `${trimTrailingSlash(state.requestBase)}${proxyBase}`;
			}
			return trimTrailingSlash(import.meta.env.VITE_APP_DCL_API_NODE || 'http://localhost:8080/api');
		},
		dclRpcEndpoint(state, getters) {
			const option = getters.selectedOption || {};
			const proxyBase = String(option.dcl_rpc_proxy_base || '').trim();
			if (state.requestBase && proxyBase) {
				return `${trimTrailingSlash(state.requestBase)}${proxyBase}`;
			}
			return trimTrailingSlash(import.meta.env.VITE_APP_DCL_RPC_NODE || 'http://localhost:8080/rpc');
		},
		dclWebsocketEndpoint() {
			return String(import.meta.env.VITE_APP_DCL_WEBSOCKET_NODE || 'ws://localhost:8080/websocket').replace(/\/$/, '');
		},
		isReady(state) {
			return state.initialized && Boolean(state.defaultNetwork);
		},
	},
	mutations: {
		setLoading(state, value) {
			state.loading = Boolean(value);
		},
		setError(state, value) {
			state.error = value ? String(value) : '';
		},
		setNetworks(state, payload) {
			const defaultNetwork = normalizeNetwork(payload?.default_network || payload?.default);
			const configured = Array.isArray(payload?.enabled_networks)
				? payload.enabled_networks.map((n) => asLower(n)).filter(Boolean)
				: [];
			const deduped = [];
			for (const item of configured) {
				if ((item === 'mainnet' || item === 'testnet') && !deduped.includes(item)) {
					deduped.push(item);
				}
			}
			state.defaultNetwork = defaultNetwork || deduped[0] || 'testnet';
			state.enabledNetworks = deduped;
			state.options = Array.isArray(payload?.networks) ? payload.networks : [];
		},
		setSelectedNetwork(state, value) {
			state.selectedNetwork = normalizeNetwork(value);
		},
		setInitialized(state, value) {
			state.initialized = Boolean(value);
		},
		setRequestBase(state, value) {
			state.requestBase = String(value || '');
		},
	},
	actions: {
		async initialize(context) {
			const { state, commit } = context;
			if (state.initialized) {
				return;
			}

			const { requestBase } = resolveMatteroverwatchApiBase();
			commit('setRequestBase', requestBase);
			commit('setLoading', true);
			commit('setError', '');

			try {
				if (!requestBase) {
					throw new Error('VITE_APP_MATTEROVERWATCH_API_BASE is not configured');
				}

				const response = await fetch(`${requestBase}/api/v1/networks`);
				if (!response.ok) {
					throw new Error(`network bootstrap failed (${response.status})`);
				}

				const payload = await response.json();
				commit('setNetworks', payload);

				const fallback = resolveStoredNetwork() || normalizeNetwork(payload?.default_network) || 'testnet';
				const networks = Array.isArray(state.enabledNetworks) ? state.enabledNetworks : [];
				const selected = networks.includes(fallback) ? fallback : networks[0] || 'testnet';
				commit('setSelectedNetwork', selected);
				persistNetwork(selected);
				commit('setInitialized', true);
			} catch (error) {
				const fallbackNetworks = ['testnet', 'mainnet'];
				commit('setNetworks', {
					default_network: resolveStoredNetwork() || 'testnet',
					enabled_networks: fallbackNetworks,
				});
				const fallback = resolveStoredNetwork() || state.defaultNetwork || fallbackNetworks[0];
				commit('setSelectedNetwork', fallbackNetworks.includes(fallback) ? fallback : fallbackNetworks[0]);
				commit('setError', error instanceof Error ? error.message : 'Unable to load network configuration');
				persistNetwork(state.selectedNetwork);
				commit('setInitialized', true);
			} finally {
				commit('setLoading', false);
			}
		},
		setSelectedNetwork(context, network) {
			const value = normalizeNetwork(network);
			if (!value) {
				return;
			}
			const allowed = context.state.enabledNetworks;
			const safe = allowed.includes(value) ? value : (allowed[0] || context.state.defaultNetwork || 'testnet');
			context.commit('setSelectedNetwork', safe);
			persistNetwork(safe);
		},
		async configureDclEnvironment(context) {
			const restEndpoint = context.getters.dclRestEndpoint;
			const rpcEndpoint = context.getters.dclRpcEndpoint;
			const websocketEndpoint = context.getters.dclWebsocketEndpoint;
			await context.dispatch(
				'common/env/init',
				{
					apiNode: restEndpoint,
					rpcNode: rpcEndpoint,
					wsNode: websocketEndpoint,
					chainId: import.meta.env.VITE_APP_DCL_CHAIN_ID,
					addrPrefix: import.meta.env.VITE_APP_DCL_ADDR_PREFIX,
					sdkVersion: import.meta.env.VITE_APP_DCL_SDK_VERSION,
					getTXApi: `${rpcEndpoint}/tx?hash=0x`,
					refresh: import.meta.env.VITE_APP_DCL_REFRESH,
				},
				{ root: true }
			);
		},
		clearError(context) {
			context.commit('setError', '');
		},
	},
};
