// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {TestWithConstants} from "../../forge-script/TestWithConstants.sol";
import {console2 as console} from "forge-std/console2.sol";

interface IMinter {
    function rate() external view returns (uint256);

    function committed_rate() external view returns (uint256);

    function commit_next_emission(uint256) external;

    function admin() external view returns (address);

    function mint(address) external;

    function start_epoch_time_write() external returns (uint256);

    function update_mining_parameters() external;

    function start_epoch_time() external view returns (uint256);
}

interface IRootGuage {
    struct InflationParams {
        uint256 rate;
        uint256 finish_time;
    }

    function inflation_params() external view returns (InflationParams memory);
}

interface ILiquidityGaugeV5 {
    function inflation_rate() external view returns (uint256);
}

contract MinterCommitEmissionTest is TestWithConstants {
    IMinter public minter;
    address public minterAdmin;
    IRootGuage public rootGauge;
    ILiquidityGaugeV5 public liqGaugeV5;

    function setUp() public override {
        super.setUp();
        // Fork mainnet at block 17565727
        vm.createSelectFork("mainnet", 17565727);
        minter = IMinter(getDeploymentAddress("Minter"));
        liqGaugeV5 = ILiquidityGaugeV5(
            getDeploymentAddress(
                "LiquidityGaugeV5_SaddleFRAXalUSDMetaPoolLPToken"
            )
        );
        rootGauge = IRootGuage(
            getDeploymentAddress("RootGauge_42161_SaddleFRAXBPPoolLPToken")
        );
        minterAdmin = minter.admin();

        vm.label(address(minter), "Minter");
    }

    // Test that pendingSaddle reverts when the pool is not updated
    function test_commitEmission() public {
        vm.startPrank(minterAdmin);
        // Assert that the current rate is 30M / 24 weeks
        uint256 currentRate = minter.rate();
        assertEq(currentRate, (uint256(30_000_000 * 1e18) / 24) / 1 weeks);
        console.log("current rate: %s", currentRate);
        console.log("current commited_rate: %s", minter.committed_rate());

        // Apply the new rate of 20M / 24 weeks
        uint256 nextWeeklyRate = (uint256(20_000_000 * 1e18) / 24);
        minter.commit_next_emission(nextWeeklyRate);

        // Assert that the commited rate is updated but the rate is not updated yet
        uint256 commitedRate = minter.committed_rate();
        assertEq(commitedRate, nextWeeklyRate / 1 weeks);
        assertEq(minter.rate(), currentRate);

        // Skip to next mining epoch which is in every 2 weeks
        // Since voting epoch is every 1 week, there may be a week with old rate until
        // the next mining epoch starts that applies the new rate
        vm.warp(((block.timestamp + 2 weeks) / 1 weeks) * 1 weeks);

        // Update mining parameters manually to ensure that the rate is updated
        minter.update_mining_parameters();

        // Ensure that the rate is updated with the commited rate
        uint256 newRate = minter.rate();
        assertEq(newRate, commitedRate);

        // Mint for liqGaugeV5 type gauge and expect that the internal rate var is updated
        minter.mint(address(liqGaugeV5));
        assertEq(newRate, liqGaugeV5.inflation_rate());

        // Mint for rootGauge type gauge and expect that the internal rate var is updated
        minter.mint(address(rootGauge));
        assertEq(newRate, rootGauge.inflation_params().rate);
    }
}
