pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IFlashLoanReceiver.sol";
import "../interfaces/ISwap.sol";
import "hardhat/console.sol";

contract FlashLoanBorrowerExample is IFlashLoanReceiver {
    using SafeMath for uint256;

    // Typical executeOperation function should do the 3 following actions
    // 1. Check if the flashLoan was successful
    // 2. Do actions with the borrowed tokens
    // 3. Repay the debt to the `pool`
    function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external override {
        // 1. Check if the flashLoan was valid
        require(
            IERC20(token).balanceOf(address(this)) >= amount,
            "flashloan is broken?"
        );

        // 2. Do actions with the borrowed token
        bytes32 paramsHash = keccak256(params);
        if (paramsHash == keccak256(bytes("dontRepayDebt"))) {
            return;
        } else if (paramsHash == keccak256(bytes("reentrancy_addLiquidity"))) {
            ISwap(pool).addLiquidity(
                new uint256[](0),
                0,
                now,
                new bytes32[](0)
            );
        } else if (paramsHash == keccak256(bytes("reentrancy_swap"))) {
            ISwap(pool).swap(1, 0, 1e6, 0, now);
        } else if (
            paramsHash == keccak256(bytes("reentrancy_removeLiquidity"))
        ) {
            ISwap(pool).removeLiquidity(1e18, new uint256[](0), now);
        } else if (
            paramsHash == keccak256(bytes("reentrancy_removeLiquidityOneToken"))
        ) {
            ISwap(pool).removeLiquidityOneToken(1e18, 0, 1e18, now);
        }

        // 3. Payback debt
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
