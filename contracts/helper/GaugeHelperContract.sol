// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "../interfaces/IMasterRegistry.sol";
import "../interfaces/IPoolRegistry.sol";

interface ILiquidityGaugeV5 {
    function lp_token() external view returns (address);
    // reward_count
    function reward_count() external view returns (uint256);
    function reward_tokens() external view returns (address[] memory);
    // function reward_data() external view returns (Reward[]);
    
}

interface ILPToken {
    function owner() external view returns (address);
}

contract GaugeHelperContract {
    IMasterRegistry public immutable MASTER_REGISTRY;
    bytes32 public constant POOL_REGISTRY_NAME =
        0x506f6f6c52656769737472790000000000000000000000000000000000000000;
    struct Reward {
        address token; 
        address distributor; 
        uint256 period_finish; 
        uint256 rate; 
        uint256 last_update; 
        uint256 integral; 
    }
    constructor(address _masterRegistry) public {
        MASTER_REGISTRY = IMasterRegistry(_masterRegistry);
    }

    function gaugeToPoolAddress(address gauge) public view returns (address) {
        try ILiquidityGaugeV5(gauge).lp_token() returns (address lpToken) {
            try ILPToken(lpToken).owner() returns (address owner) {
                return owner;
            } catch Error(string memory reason) {
                revert(reason);
            } catch (bytes memory) {
                revert("lpToken.owner() failed");
            }
        } catch Error(string memory reason) {
            revert(reason);
        } catch (bytes memory) {
            revert("gauge.lp_token() failed");
        }
    }

    function gaugeToPoolData(address gauge)
        public
        view
        returns (IPoolRegistry.PoolData memory)
    {
        return
            IPoolRegistry(
                MASTER_REGISTRY.resolveNameToLatestAddress(POOL_REGISTRY_NAME)
            ).getPoolData(gaugeToPoolAddress(gauge));
    }

    function getGaugeRewards(address gauge) public view returns (address[] memory) { //Reward[] memory
        uint256 reward_count = ILiquidityGaugeV5(gauge).reward_count();
        address[] storage rewardTokenAddresses;
        for (uint256 i = 0; i < 8; i++) {
            rewardTokenAddresses[i] = ILiquidityGaugeV5.reward_tokens(i);
        }
        return rewardTokenAddresses;
        // call reward_data() will all reward token addresses
        // Reward[8] memory rewardData;
        // for (uint256 i = 0; i < 8; i++) {
        //     rewardData[i] = ILiquidityGaugeV5.reward_data(rewardTokenAddresses[i]);
        // }
    }
}