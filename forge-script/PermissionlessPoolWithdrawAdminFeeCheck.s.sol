// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ScriptWithConstants.s.sol";
import "../contracts/interfaces/IMasterRegistry.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/IERC20.sol";

interface IPermissionlessSwap {
    function withdrawAdminFees() external payable;

    function owner() external view returns (address);

    function feeCollector() external view returns (address);

    function getVirtualPrice() external view returns (uint256);
}

interface IPoolRegistry {
    /* Structs */

    struct PoolData {
        address poolAddress;
        address lpToken;
        uint8 typeOfAsset;
        bytes32 poolName;
        address targetAddress;
        address[] tokens;
        address[] underlyingTokens;
        address basePoolAddress;
        address metaSwapDepositAddress;
        bool isSaddleApproved;
        bool isRemoved;
        bool isGuarded;
    }

    /* Functions */
    function getPoolDataByName(bytes32 poolName)
        external
        view
        returns (PoolData memory);
}

contract PermissionlessPoolWithdrawAdminFeeCheckScript is ScriptWithConstants {
    uint256 snapshot;
    IPermissionlessSwap basePool;
    IPermissionlessSwap metaPool;

    function setUp() public override {
        super.setUp();

        // Choose a network and block number
        vm.createSelectFork("mainnet", 15684315);

        IMasterRegistry mr = IMasterRegistry(
            getDeploymentAddress("MasterRegistry")
        );
        IPoolRegistry pr = IPoolRegistry(
            mr.resolveNameToLatestAddress("PoolRegistry")
        );

        basePool = IPermissionlessSwap(
            (pr.getPoolDataByName("bUSD pool")).poolAddress
        );
        metaPool = IPermissionlessSwap(
            (pr.getPoolDataByName("bUSD Metapool")).poolAddress
        );

        // Create the snapshot to roll back to after each test
        snapshot = vm.snapshot();
    }

    function checkWithdrawAdminFees(address caller) internal {
        // Impersonate owner
        vm.startPrank(caller);

        // Check virtual price is still valid
        uint256 startingVirtualPrice = basePool.getVirtualPrice();
        require(startingVirtualPrice > 1e18, "Virtual price should be > 1");

        // Call withdraw admin fees
        basePool.withdrawAdminFees();

        // Check virtual price is still valid
        require(
            basePool.getVirtualPrice() == startingVirtualPrice,
            "Virtual price was modified after withdrawAdminFees"
        );

        // Stop prank and revert to snapshot
        vm.stopPrank();
        vm.revertTo(snapshot);
    }

    function revertsWhenCalledByNonOwner() public {
        // Impersonate a random account that is not an owner nor fee collector
        address caller = address(0x00000000000000000000000000000000DeaDBeef);
        require(caller != basePool.owner(), "Caller is owner");
        require(caller != basePool.feeCollector(), "Caller is fee collector");

        vm.startPrank(caller);

        // Expect next tx to revert
        vm.expectRevert();
        basePool.withdrawAdminFees();
        vm.stopPrank();
        vm.revertTo(snapshot);
    }

    function run() public {
        // https://github.com/foundry-rs/forge-std/blob/master/src/Vm.sol
        checkWithdrawAdminFees(basePool.owner());
        checkWithdrawAdminFees(basePool.feeCollector());
        revertsWhenCalledByNonOwner();
    }
}
