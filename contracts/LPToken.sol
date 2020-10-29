pragma solidity 0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract LPToken is ERC20, ERC20Detailed, ERC20Burnable, Ownable {
    constructor (string memory name_, string memory symbol_, uint8 decimals_
    ) public ERC20Detailed(name_, symbol_, decimals_) {}

    function mint(address recipient, uint256 amount) external onlyOwner {
        require(amount != 0, "amount == 0");
        _mint(recipient, amount);
    }
}
