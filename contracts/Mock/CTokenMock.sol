pragma solidity ^0.5.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract CTokenMock is ERC20, ERC20Detailed, ERC20Burnable, Ownable {
    using SafeMath for uint256;

    uint256 private initialExchangeRate;
    uint256 private _supplyRatePerBlock;
    mapping(address => uint256) _balances;

    ERC20Detailed public underlying;

    constructor (string memory name, string memory symbol, uint8 decimals, address underlying_) ERC20Detailed(name, symbol, decimals) public {
        underlying = ERC20Detailed(underlying_);
        uint256 underlyingDecimals = underlying.decimals();
        // By default, 1 cToken = 0.02 underlyingToken in their respective precisions
        initialExchangeRate = 2 * (10 ** (18 - decimals + underlyingDecimals - 2));
    }

    // Mocking CToken functions
    // Decimals calculation reference: https://compound.finance/docs#protocol-math
    // CToken contract: https://github.com/compound-finance/compound-protocol/blob/master/contracts/CToken.sol

    function mint(uint256 amount) public returns (uint256) {
        require(underlying.balanceOf(msg.sender) >= amount, "not enough underlying asset");
        uint256 cTokenAmount = amount.mul(1e18).div(exchangeRateCurrent());

        underlying.transferFrom(msg.sender, address(this), amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        _mint(msg.sender, cTokenAmount);
        return 0;
    }

    // https://compound.finance/docs/ctokens#exchange-rate
    function exchangeRateCurrent() public returns (uint256) {
        // exchangeRate = (getCash() + totalBorrows() - totalReserves()) / totalSupply()
        uint256 balance = underlying.balanceOf(address(this));
        if (balance > 0) {
            return balance.mul(1e18).div(totalSupply());
        }
        return initialExchangeRate;
    }

    function supplyRatePerBlock() external returns (uint256) {
        return _supplyRatePerBlock;
    }

    function redeem(uint256 cTokenAmount) external returns (uint) {
        uint256 underlyingTokenAmount = cTokenAmount.mul(exchangeRateCurrent()).div(1e18);
        require(balanceOf(msg.sender) >= cTokenAmount, "user does not own enough cToken");
        require(underlying.balanceOf(address(this)) >= underlyingTokenAmount, "not enough underlying asset");

        _burn(msg.sender, cTokenAmount);
        underlying.transfer(msg.sender, underlyingTokenAmount);
        _balances[msg.sender] = _balances[msg.sender].sub(underlyingTokenAmount);
        return 0;
    }

    function redeemUnderlying(uint256 underlyingTokenAmount) external returns (uint) {
        uint256 cTokenAmount = underlyingTokenAmount.mul(1e18).div(exchangeRateCurrent());
        require(balanceOf(msg.sender) >= cTokenAmount, "user does not own enough cToken");
        require(underlying.balanceOf(address(this)) >= underlyingTokenAmount, "not enough underlying asset");

        _burn(msg.sender, cTokenAmount);
        underlying.transfer(msg.sender, underlyingTokenAmount);
        _balances[msg.sender] = _balances[msg.sender].sub(underlyingTokenAmount);
        return 0;
    }

    function balanceOfUnderlying(address account) external view returns (uint) {
        return _balances[account];
    }

    // Setter for testing purposes
    function _setSupplyRatePerBlock(uint256 supplyRate) external {
        _supplyRatePerBlock = supplyRate;
    }
}
