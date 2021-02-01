pragma solidity 0.6.12;

import "synthetix/contracts/interfaces/ISynthetix.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// TODO: Add NatSpec tags
contract SynthSwapper {
    address payable immutable owner;
    // "SADDLE" in bytes32 form
    bytes32 constant TRACKING =
        0x534144444c450000000000000000000000000000000000000000000000000000;

    constructor() public {
        owner = msg.sender;
    }

    function swapSynth(
        ISynthetix synthetix,
        bytes32 sourceKey,
        uint256 synthAmount,
        bytes32 destKey
    ) external returns (uint256) {
        require(msg.sender == owner);
        return
            synthetix.exchangeWithTracking(
                sourceKey,
                synthAmount,
                destKey,
                msg.sender,
                TRACKING
            );
    }

    function withdraw(
        IERC20 synth,
        address recipient,
        uint256 withdrawAmount
    ) external {
        require(msg.sender == owner);
        synth.transfer(recipient, withdrawAmount);
        selfdestruct(owner);
    }
}
