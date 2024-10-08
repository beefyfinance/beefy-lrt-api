export const CurveTokenAbi = [
  {
    name: 'Transfer',
    inputs: [
      {
        name: '_from',
        type: 'address',
        indexed: true,
      },
      {
        name: '_to',
        type: 'address',
        indexed: true,
      },
      {
        name: '_value',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'Approval',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        indexed: true,
      },
      {
        name: '_spender',
        type: 'address',
        indexed: true,
      },
      {
        name: '_value',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
    type: 'event',
  },
  {
    stateMutability: 'nonpayable',
    type: 'constructor',
    inputs: [
      {
        name: '_name',
        type: 'string',
      },
      {
        name: '_symbol',
        type: 'string',
      },
    ],
    outputs: [],
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    gas: 288,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'transfer',
    inputs: [
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 78640,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'transferFrom',
    inputs: [
      {
        name: '_from',
        type: 'address',
      },
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 116582,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'approve',
    inputs: [
      {
        name: '_spender',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 39121,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'increaseAllowance',
    inputs: [
      {
        name: '_spender',
        type: 'address',
      },
      {
        name: '_added_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 41665,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'decreaseAllowance',
    inputs: [
      {
        name: '_spender',
        type: 'address',
      },
      {
        name: '_subtracted_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 41689,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'mint',
    inputs: [
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 80879,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'burnFrom',
    inputs: [
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    gas: 80897,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'set_minter',
    inputs: [
      {
        name: '_minter',
        type: 'address',
      },
    ],
    outputs: [],
    gas: 37785,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'set_name',
    inputs: [
      {
        name: '_name',
        type: 'string',
      },
      {
        name: '_symbol',
        type: 'string',
      },
    ],
    outputs: [],
    gas: 181462,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    gas: 12918,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    gas: 10671,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'balanceOf',
    inputs: [
      {
        name: 'arg0',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    gas: 2963,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'allowance',
    inputs: [
      {
        name: 'arg0',
        type: 'address',
      },
      {
        name: 'arg1',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    gas: 3208,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    gas: 2808,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'minter',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    gas: 2838,
  },
] as const;
