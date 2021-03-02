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
    bytes32 constant REENTRANCY =
        0x7265656e7472616e637900000000000000000000000000000000000000000000;

    function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external override {
        require(IERC20(token).balanceOf(address(this)) >= amount);

        // Simulate flashloan actions
        bytes32 paramsHash = keccak256(params);
        if (paramsHash == keccak256(abi.encodePacked(DONT_REPAY_DEBT))) {
            // Exit flashloan without paying the debt
            return;
        } else if (paramsHash == keccak256(abi.encodePacked(REENTRANCY))) {
            uint256[] memory amounts = new uint256[](4);
            amounts[0] = 0;
            amounts[1] = 1e6;
            amounts[2] = 0;
            amounts[3] = 0;
            // Try re-entering the swap contract
            IERC20(token).approve(pool, 1e6);
            ISwap(pool).addLiquidity(amounts, 0, now, new bytes32[](0));
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
