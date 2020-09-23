pragma solidity ^0.5.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract LPToken is ERC20, ERC20Detailed, ERC20Burnable, Ownable {
    constructor (string memory name, string memory symbol, uint8 decimals) ERC20Detailed(name, symbol, decimals) public {} // eslint-disable-line

    function mint(address recipient, uint256 amount) external onlyOwner {
        _mint(recipient, amount);
    }
}
