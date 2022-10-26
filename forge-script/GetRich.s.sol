// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ScriptWithConstants.s.sol";
import "forge-std/Test.sol";

contract GetRichScript is Test, ScriptWithConstants {
    address USDC;
    address DAI;

    address hardhatAccount0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function setUp() public override {
        super.setUp();

        // Get the addresses of the tokens in this network
        USDC = getDeploymentAddress("USDC");
        DAI = getDeploymentAddress("DAI");
    }

    function run() public {
        // Use foundry's cheatcode to give us some tokens
        deal(USDC, hardhatAccount0, 1e6 * 10000);
        deal(DAI, hardhatAccount0, 1e18 * 10000);
    }
}
