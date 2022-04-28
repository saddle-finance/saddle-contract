// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "../interfaces/IMasterRegistry.sol";
import "../interfaces/IPoolRegistry.sol";

interface ILiquidityGaugeV5 {
    function lp_token() external view returns (address);
}

interface ILPToken {
    function owner() external view returns (address);
}

contract HelperContract {
    IMasterRegistry public immutable MASTER_REGISTRY;
    bytes32 public constant POOL_REGISTRY_NAME =
        0x506f6f6c52656769737472790000000000000000000000000000000000000000;

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
}
