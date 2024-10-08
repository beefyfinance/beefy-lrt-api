import type { ChainId } from '../config/chains';

export const BEEFY_MOO_VAULT_API = 'https://api.beefy.finance/vaults';
export const BEEFY_COW_VAULT_API = 'https://api.beefy.finance/cow-vaults';
export const BEEFY_GOV_API = 'https://api.beefy.finance/gov-vaults';
export const BEEFY_BOOST_API = 'https://api.beefy.finance/boosts';

// subgraph source: https://github.com/beefyfinance/l2-lxp-liquidity-subgraph
export const getBalanceSubgraphUrl = (chainId: ChainId) =>
  `https://api.goldsky.com/api/public/project_clu2walwem1qm01w40v3yhw1f/subgraphs/beefy-balances-${chainId}/latest/gn`;

export const SUBGRAPH_PAGE_SIZE = 1000;
