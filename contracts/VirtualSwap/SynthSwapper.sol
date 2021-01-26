pragma solidity 0.6.12;

import "synthetix/contracts/interfaces/ISynthetix.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SynthSwapper {
    address payable immutable owner;
    IERC20 immutable synth;
    ISynthetix immutable synthetix;
    uint256 immutable synthAmount;
    bytes32 constant TRACKING =
        0x534144444c450000000000000000000000000000000000000000000000000000;

    constructor(
        IERC20 synth_,
        ISynthetix synthetix_,
        uint256 synthAmount_
    ) public {
        owner = msg.sender;
        synth = synth_;
        synthetix = synthetix_;
        synthAmount = synthAmount_;
    }

    function swapSynth(bytes32 sourceKey, bytes32 destKey)
        external
        returns (uint256)
    {
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
        IERC20 synth_,
        address recipient,
        uint256 amount_
    ) external {
        require(msg.sender == owner);
        synth_.transfer(recipient, amount_);
        selfdestruct(owner);
    }
}
