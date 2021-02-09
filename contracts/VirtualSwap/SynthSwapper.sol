pragma solidity 0.6.12;

import "synthetix/contracts/interfaces/ISynthetix.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "../interfaces/ISwap.sol";

// TODO: Add NatSpec tags
contract SynthSwapper {
    address payable immutable bridge;
    // SYNTHETIX points to `ProxyERC20` (0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F).
    // This contract is a proxy of `Synthetix` and is used to exchange synths.
    ISynthetix public constant SYNTHETIX =
        ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
    // "SADDLE" in bytes32 form
    bytes32 public constant TRACKING =
        0x534144444c450000000000000000000000000000000000000000000000000000;

    constructor() public {
        bridge = msg.sender;
    }

    function swapSynth(
        bytes32 sourceKey,
        uint256 synthAmount,
        bytes32 destKey
    ) external returns (uint256) {
        require(msg.sender == bridge, "is not bridge");
        return
            SYNTHETIX.exchangeWithTracking(
                sourceKey,
                synthAmount,
                destKey,
                msg.sender,
                TRACKING
            );
    }

    function swapSynthToToken(
        ISwap swap,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256 minAmount,
        uint256 deadline,
        address recipient
    ) external {
        require(msg.sender == bridge, "is not bridge");
        IERC20 tokenFrom = swap.getToken(tokenFromIndex);
        tokenFrom.approve(address(swap), tokenFromAmount);
        swap.swap(
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
            minAmount,
            deadline
        );
        IERC20 tokenTo = swap.getToken(tokenToIndex);
        tokenTo.transfer(recipient, tokenTo.balanceOf(address(this)));
    }

    function withdraw(
        IERC20 token,
        address recipient,
        uint256 withdrawAmount
    ) external {
        require(msg.sender == bridge, "is not bridge");
        token.transfer(recipient, withdrawAmount);
    }

    function destroy() external {
        require(msg.sender == bridge, "is not bridge");
        selfdestruct(bridge);
    }
}
