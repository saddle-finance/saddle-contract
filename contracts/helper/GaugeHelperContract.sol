// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "../interfaces/IMasterRegistry.sol";
import "../interfaces/IPoolRegistry.sol";

interface ILiquidityGaugeV5 {
    struct Reward {
        address token;
        address distributor;
        uint256 period_finish;
        uint256 rate;
        uint256 last_update;
        uint256 integral;
    }

    function lp_token() external view returns (address);

    // reward_count
    function reward_count() external view returns (uint256);

    function reward_tokens(uint256) external view returns (address);

    function reward_data(address) external view returns (Reward memory);

    function claimable_reward(address, address) external view returns (uint256);
}

interface ILPToken {
    function owner() external view returns (address);
}

contract GaugeHelperContract {
    IMasterRegistry public immutable MASTER_REGISTRY;
    bytes32 public constant POOL_REGISTRY_NAME =
        0x506f6f6c52656769737472790000000000000000000000000000000000000000;

    constructor(address _masterRegistry) public {
        MASTER_REGISTRY = IMasterRegistry(_masterRegistry);
    }

    function gaugeToPoolAddress(address gauge) public view returns (address) {
        try ILiquidityGaugeV5(gauge).lp_token() returns (
            address saddleLpToken
        ) {
            try ILPToken(saddleLpToken).owner() returns (
                address saddlePoolAddress
            ) {
                return saddlePoolAddress;
            } catch {
                return address(0);
            }
        } catch {
            // Returns zero address if the gauge is not directly using saddle LP token
            return address(0);
        }
    }

    function gaugeToPoolData(address gauge)
        public
        view
        returns (IPoolRegistry.PoolData memory)
    {
        // Get PoolRegistry from MasterRegistry
        IPoolRegistry poolRegistry = IPoolRegistry(
            MASTER_REGISTRY.resolveNameToLatestAddress(POOL_REGISTRY_NAME)
        );

        // Try getting pool data
        try poolRegistry.getPoolData(gaugeToPoolAddress(gauge)) returns (
            IPoolRegistry.PoolData memory poolData
        ) {
            return poolData;
        } catch {
            // Returns zero address if the gauge is not directly using saddle LP token
            IPoolRegistry.PoolData memory poolData;
            return poolData;
        }
    }

    function getGaugeRewards(address gauge)
        public
        view
        returns (ILiquidityGaugeV5.Reward[] memory)
    {
        uint256 rewardCount = ILiquidityGaugeV5(gauge).reward_count();
        address[] memory rewardTokens = new address[](rewardCount);
        for (uint256 i = 0; i < rewardCount; i++) {
            rewardTokens[i] = ILiquidityGaugeV5(gauge).reward_tokens(i);
        }
        // call reward_data() will all reward token addresses
        ILiquidityGaugeV5.Reward[]
            memory rewardData = new ILiquidityGaugeV5.Reward[](rewardCount);
        for (uint256 i = 0; i < rewardCount; i++) {
            rewardData[i] = ILiquidityGaugeV5(gauge).reward_data(
                rewardTokens[i]
            );
        }
        return rewardData;
    }

    function getClaimableRewards(address gauge, address user)
        public
        view
        returns (uint256[] memory)
    {
        uint256 rewardCount = ILiquidityGaugeV5(gauge).reward_count();
        address[] memory rewardTokens = new address[](rewardCount);
        for (uint256 i = 0; i < rewardCount; i++) {
            rewardTokens[i] = ILiquidityGaugeV5(gauge).reward_tokens(i);
        }
        // call reward_data() will all reward token addresses
        uint256[] memory claimableRewards = new uint256[](rewardCount);
        for (uint256 i = 0; i < rewardCount; i++) {
            claimableRewards[i] = ILiquidityGaugeV5(gauge).claimable_reward(
                user,
                rewardTokens[i]
            );
        }
        return claimableRewards;
    }
}
