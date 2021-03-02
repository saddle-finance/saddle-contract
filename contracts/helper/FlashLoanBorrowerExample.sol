pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IFlashLoanReceiver.sol";
import "../interfaces/ISwap.sol";
import "hardhat/console.sol";

contract FlashLoanBorrowerExample is IFlashLoanReceiver {
    using SafeMath for uint256;
    bytes32 constant DONT_REPAY_DEBT =
        0x646f6e7452657061794465627400000000000000000000000000000000000000;

    function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external override {
        require(IERC20(token).balanceOf(address(this)) >= amount);

        // Simulate flashloan actions
        if (keccak256(params) == keccak256(abi.encodePacked(DONT_REPAY_DEBT))) {
            return;
        }

        // Payback debt
        uint256 totalDebt = amount.add(fee);
        IERC20(token).transfer(pool, totalDebt);
    }

    function flashLoan(
        ISwap swap,
        IERC20 token,
        uint256 amount,
        bytes memory params
    ) external {
        swap.flashLoan(address(this), token, amount, params);
    }
}
