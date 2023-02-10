// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;
import "@openzeppelin/contracts-4.4.0/token/ERC20/utils/SafeERC20.sol";
import "../bridgers/Bridger.sol";

contract MockBridger is Bridger {
    using SafeERC20 for IERC20;

    constructor() {}

    function bridge(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    function cost() external view override returns (uint256) {
        return 0;
    }

    function check(address) external view override returns (bool) {
        return true;
    }
}
