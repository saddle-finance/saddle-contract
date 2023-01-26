// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";
import "./ScriptWithConstants.s.sol";

struct SDLBalanceHolder {
    uint256 chainId;
    string optionalName;
    address addr;
    uint256 balance;
}

struct VeSDLSummaryOutput {
    uint256 totalSupply;
    uint256 veSDLTotalSupply;
    uint256 percentOfVeSDL;
    uint256 averageDuration;
}

// Writes veSDL summary and current known SDL holder list into JSON
contract SDLEmissionReport is ScriptWithConstants {
    address SDL; // TODO: Need to be updated for every chain
    VeSDLSummaryOutput veSDLSummaryOutput;
    SDLBalanceHolder[] sdlBalanceHolders;

    // Sets up network information
    function setUp() public override {
        super.setUp();
    }

    // Get current minter balance on mainet
    function getCurrentMinterBalance() {
        address minter = getDeploymentAddress("Minter", 1);
        SDL = getDeploymentAddress("SDL", 1);

        // TODO: ERC20 implementation on Forge
        SDL.balanceOf(minter);

        // TODO: Print SDL balance of minter to JSON entry
    }

    function getCurrentMinichefBalanace() {
        // TODO: Print SDL balance of minincehf to JSON enry
    }

    function getCrossChainBalnaces() {
        // TODO: Print SDL balance of the gauges on
        // side chains as JSON entry
    }

    function printSDLHolders() {}

    function printVeSDLTokenSummary() {
        // TODO: Print total supply, locked veSDL amount
        // percentage of veSDL, average lock duration
        // Print SDL summary to console
        // Write to jsonOutput variable veSDLSummaryOutput
    }

    function writeToJson(VeSDLSummaryOutput memory summaryOutput) {
        // Writes JSON composed of general SDl summary
        // Including veSDL and the % of SDL locked in veSDL
        // this can be used as KPI metric track daily
    }

    function writeToJson(SDLBalanceHolder[] memory holdersOutput) {
        // Writes a list of known holders to JSON
        // This includes minichef, reward systems, Minter, etc
        // Finally the last entry in the list of known holders
        // should be the sum of unknown holders.
        // This will indiciate user holdings.
        // TODO: include vesting contract for employees
        // and investors.
        // TODO: exclude bridges from mainnet counting
        // Arbitrum, Optimism, Nomad(?)
    }

    function run() public {
        for (uint256 i = 0; i < networkNames.length; i++) {
            vm.createSelectFork(networkNames[i]);

            // If this is mainnet, print veSDL report
            if (block.chainid == 1) {
                printVeSDLTokenSummary();
                writeToJson(veSDLSummaryOutput);
            }

            printSDLHolders();
            writeToJson(sdlBalanceHolders);
            delete sdlBalanceHolders;
        }
    }
}
