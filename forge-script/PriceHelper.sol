pragma solidity ^0.8.17;
import "forge-std/Script.sol";

interface IChainlinkPriceFeed {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract PriceHelper is Script {
    function getLatestPrices()
        public
        returns (
            uint256 btcPrice,
            uint256 ethPrice,
            uint256 usdPrice
        )
    {
        uint256 activeForkId;
        uint256 snapshotId;
        try vm.activeFork() returns (uint256 _forkId) {
            activeForkId = _forkId;
        } catch {
            // If we are not in fork mode, take a snapshot
            snapshotId = vm.snapshot();
        }

        // Create a mainnet fork
        vm.createSelectFork("mainnet");

        // Fetch the latest BTC price
        (, int256 price, , , ) = IChainlinkPriceFeed(
            address(0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c)
        ).latestRoundData();
        console.log("BTC price: %s", uint256(price));
        btcPrice = uint256(price);

        // Fetch the latest ETH price
        (, price, , , ) = IChainlinkPriceFeed(
            address(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419)
        ).latestRoundData();
        console.log("ETH price: %s", uint256(price));
        ethPrice = uint256(price);

        // Use fixed number for the latest price of USD
        console.log("USD price: %s", 1e8);
        usdPrice = 1e8;

        // Restore fork to previous state
        if (activeForkId != 0) {
            vm.selectFork(activeForkId);
        } else {
            vm.revertTo(snapshotId);
        }
    }
}
