// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "@openzeppelin/contracts-4.4.0/token/ERC20/utils/SafeERC20.sol";

interface IPermissionlessSwap {
    function withdrawAdminFees() external payable;

    function owner() external view returns (address);

    function feeCollector() external view returns (address);

    function getVirtualPrice() external view returns (uint256);
}

contract PermissionlessPoolWithdrawAdminFeeCheckScript is Script {
    uint256 snapshot;
    IPermissionlessSwap basePool =
        IPermissionlessSwap(
            address(0x1933B1D4A372Ecbc3713D92F875b330846ae6A2b)
        );
    IPermissionlessSwap metaPool =
        IPermissionlessSwap(
            address(0xE41389921Cc14e2159232bd6DeBc78924307e5a9)
        );
    IERC20 busd = IERC20(address(0x4Fabb145d64652a948d72533023f6E7A623C7C53));
    IERC20 usdc = IERC20(address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48));
    IERC20 usdt = IERC20(address(0xdAC17F958D2ee523a2206206994597C13D831ec7));

    function setUp() public {
        // Choose a network and block number
        vm.createSelectFork("mainnet", 15684315);

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

    function run() public {
        // https://github.com/foundry-rs/forge-std/blob/master/src/Vm.sol
        checkWithdrawAdminFees(basePool.owner());
        checkWithdrawAdminFees(basePool.feeCollector());
    }
}
