// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts-4.2.0/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-4.2.0/access/Ownable.sol";
import "../SimpleGovernance.sol";

/**
 * @title Generic ERC20 token
 * @notice This contract simulates a generic ERC20 token that is mintable by an owner.
 * @dev This is only for testing the vesting contracts and will not be used in production.
 */
contract GenericERC20WithGovernance is ERC20, Ownable, SimpleGovernance {
    uint8 private _decimals;

    /**
     * @notice Deploy this contract with given name, symbol, and decimals. Governance is set to
     * msg.sender.
     * @dev the caller of this constructor will become the owner of this contract
     * @param name_ name of this token
     * @param symbol_ symbol of this token
     * @param decimals_ number of decimals this token will be based on
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) public ERC20(name_, symbol_) {
        _decimals = decimals_;
        governance = _msgSender();
    }

    /**
     * @notice Mints given amount of tokens to recipient
     * @dev only owner can call this mint function
     * @param recipient address of account to receive the tokens
     * @param amount amount of tokens to mint
     */
    function mint(address recipient, uint256 amount) external onlyOwner {
        require(amount != 0, "amount == 0");
        _mint(recipient, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
