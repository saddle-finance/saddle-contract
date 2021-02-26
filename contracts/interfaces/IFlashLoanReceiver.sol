pragma solidity 0.6.12;

/**
 * @title IFlashLoanReceiver interface
 * @notice Interface for the Saddle fee IFlashLoanReceiver.
 * @author Aave
 * @dev implement this interface to develop a flashloan-compatible flashLoanReceiver contract
 **/
interface IFlashLoanReceiver {
    function executeOperation(
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    ) external;
}
