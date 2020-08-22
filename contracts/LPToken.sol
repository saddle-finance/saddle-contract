pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LPToken is ERC20Burnable, Ownable() {
    constructor (string memory name, string memory symbol) ERC20(name, symbol) public {}

    function mint(address recipient, uint256 amount) public onlyOwner {
        _mint(recipient, amount);
    }
}
