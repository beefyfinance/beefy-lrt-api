# beefy-lrt-api

Wrapper api for the LRT subgraph

# Partners APIs

## Beefy

Prod:

- https://lrt.beefy.finance/api/v2/beefy/begems/summary
- https://lrt.beefy.finance/api/v2/beefy/begems/user/0x539460bd8d7d6130ce6c4a65c0b59da3b3d2da42

Dev:
- http://localhost:4000/api/v2/beefy/begems/summary
- http://localhost:4000/api/v2/beefy/begems/user/0x539460bd8d7d6130ce6c4a65c0b59da3b3d2da42


## Ethena

Token symbols: USDe

### Fetch user list

Prod
- https://lrt.beefy.finance/api/v2/partner/ethena/arbitrum/users
- https://lrt.beefy.finance/api/v2/partner/ethena/fraxtal/users
- https://lrt.beefy.finance/api/v2/partner/ethena/mantle/users
- https://lrt.beefy.finance/api/v2/partner/ethena/optimism/users

Dev
- http://localhost:4000/api/v2/partner/ethena/arbitrum/users
- http://localhost:4000/api/v2/partner/ethena/fraxtal/users
- http://localhost:4000/api/v2/partner/ethena/mantle/users
- http://localhost:4000/api/v2/partner/ethena/optimism/users

### Fetch user balance

Prod
- https://lrt.beefy.finance/api/v2/partner/ethena/arbitrum/user/0x0000000000000000000000000000000000000000/balance/228287548
- https://lrt.beefy.finance/api/v2/partner/ethena/fraxtal/user/0x0000000000000000000000000000000000000000/balance/8937546
- https://lrt.beefy.finance/api/v2/partner/ethena/mantle/user/0x0000000000000000000000000000000000000000/balance/68277738
- https://lrt.beefy.finance/api/v2/partner/ethena/optimism/user/0x0000000000000000000000000000000000000000/balance/124535424

Dev
- http://localhost:4000/api/v2/partner/ethena/arbitrum/user/0x0000000000000000000000000000000000000000/balance/228287548
- http://localhost:4000/api/v2/partner/ethena/fraxtal/user/0x0000000000000000000000000000000000000000/balance/8937546
- http://localhost:4000/api/v2/partner/ethena/mantle/user/0x0000000000000000000000000000000000000000/balance/68277738
- http://localhost:4000/api/v2/partner/ethena/optimism/user/0x0000000000000000000000000000000000000000/balance/124535424



## Etherfi

Token symbols: eETH, weETH, weETH.mode

Prod
- https://lrt.beefy.finance/api/v2/partner/etherfi/arbitrum/points-integration/user-balance?blockNumber=246881993
- https://lrt.beefy.finance/api/v2/partner/etherfi/base/points-integration/user-balance?blockNumber=18940179
- https://lrt.beefy.finance/api/v2/partner/etherfi/bsc/points-integration/user-balance?blockNumber=41698876
- https://lrt.beefy.finance/api/v2/partner/etherfi/ethereum/points-integration/user-balance?blockNumber=20612296
- https://lrt.beefy.finance/api/v2/partner/etherfi/linea/points-integration/user-balance?blockNumber=8629020
- https://lrt.beefy.finance/api/v2/partner/etherfi/mode/points-integration/user-balance?blockNumber=12251035
- https://lrt.beefy.finance/api/v2/partner/etherfi/optimism/points-integration/user-balance?blockNumber=124535424

Dev
- http://localhost:4000/api/v2/partner/etherfi/arbitrum/points-integration/user-balance?blockNumber=246881993
- http://localhost:4000/api/v2/partner/etherfi/base/points-integration/user-balance?blockNumber=18940179
- http://localhost:4000/api/v2/partner/etherfi/bsc/points-integration/user-balance?blockNumber=41698876
- http://localhost:4000/api/v2/partner/etherfi/ethereum/points-integration/user-balance?blockNumber=20612296
- http://localhost:4000/api/v2/partner/etherfi/linea/points-integration/user-balance?blockNumber=8629020
- http://localhost:4000/api/v2/partner/etherfi/mode/points-integration/user-balance?blockNumber=12251035
- http://localhost:4000/api/v2/partner/etherfi/optimism/points-integration/user-balance?blockNumber=124535424


## Infrared

Token symbols: vault whitelist

Prod
- https://lrt.beefy.finance/api/v2/partner/infrared/ir_points_program/0x9AA6183B8E1148969b082B5585b8A7021fA1b6ce/4779606

Dev
- http://localhost:4000/api/v2/partner/infrared/ir_points_program/0x9AA6183B8E1148969b082B5585b8A7021fA1b6ce/4779606



## Resolv

Dev:
- http://localhost:4000/api/v2/partner/resolv/points/plasma?block=2733546&page=1
- http://localhost:4000/api/v2/partner/resolv/points/plasma?block=2733546&page=1&pageSize=10&debug=true

Prod:
- https://lrt.beefy.finance/api/v2/partner/resolv/points/plasma?block=2733546&page=1
- https://lrt.beefy.finance/api/v2/partner/resolv/points/plasma?block=2733546&page=1&pageSize=10&debug=true


# Other Endpoints

## Config

Prod:
- https://lrt.beefy.finance/api/v2/config/arbitrum/points-earning/etherfi
- https://lrt.beefy.finance/api/v2/config/berachain/points-earning/infrared

Dev:
- http://localhost:4000/api/v2/config/arbitrum/points-earning/etherfi
- http://localhost:4000/api/v2/config/berachain/points-earning/infrared

## Orbiter

Prod:
- https://lrt.beefy.finance/api/v2/partner/orbiter/verify/0x4aFb5daf1f6016EdE27EbB838c45a759E0A4e4c4
- https://lrt.beefy.finance/api/v2/partner/orbiter/verify/0xD9d3dd56936F90ea4c7677F554dfEFD45eF6Df0F

Dev:
- http://localhost:4000/api/v2/partner/orbiter/verify/0x4aFb5daf1f6016EdE27EbB838c45a759E0A4e4c4
- http://localhost:4000/api/v2/partner/orbiter/verify/0xD9d3dd56936F90ea4c7677F554dfEFD45eF6Df0F
