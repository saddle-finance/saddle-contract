pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "./interfaces/ISwap.sol";

import "hardhat/console.sol";

// TODO Add NatSpec tags
contract VirtualToken is ERC20, ERC20Burnable {
    bool private _initialized;
    bool private _settled;
    IVirtualSynth public vsynth;
    ISwap public swap;
    uint8 public tokenFromIndex;
    uint8 public tokenToIndex;

    constructor(
        IVirtualSynth vsynth_,
        ISwap swap_,
        uint8 tokenFromIndex_,
        uint8 tokenToIndex_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) public ERC20(name_, symbol_) {
        _setupDecimals(decimals_);
        vsynth = vsynth_;
        swap = swap_;
        tokenFromIndex = tokenFromIndex_;
        tokenToIndex = tokenToIndex_;
    }

    function initialize(address mintTo, uint256 mintAmount) external {
        require(!_initialized, "Can only initialize once");
        require(mintAmount != 0, "Cannot mint 0");
        _mint(mintTo, mintAmount);
        _initialized = true;
    }

    function balanceOfUnderlying(address account)
        public
        view
        returns (uint256)
    {
        return
            swap
                .getToken(tokenToIndex)
                .balanceOf(address(this))
                .mul(balanceOf(account))
                .div(totalSupply());
    }

    function balanceOfSynth(address account) public view returns (uint256) {
        return
            IERC20(address(vsynth.synth()))
                .balanceOf(address(this))
                .mul(balanceOf(account))
                .div(totalSupply());
    }

    function readyToSettle() public view returns (bool) {
        return vsynth.readyToSettle();
    }

    function settled() public view returns (bool) {
        return _settled;
    }

    function _settleVirtualSynth() internal {
        // Ensure virtual synth is ready to settle.
        require(
            vsynth.readyToSettle(),
            "Virtual Synth is not ready to settle yet."
        );

        // If virtual synth is not settled, try settling it.
        if (!vsynth.settled()) {
            vsynth.settle(address(this));
        }
    }

    function _swapSynthToToken() internal {
        // If this contract holds any synth, swap it to the desired token
        IERC20 synth = IERC20(address(vsynth.synth()));
        uint256 synthBalance = synth.balanceOf(address(this));
        if (synthBalance > 0) {
            synth.approve(address(swap), synthBalance);
            swap.swap(
                tokenFromIndex,
                tokenToIndex,
                synthBalance,
                totalSupply(),
                block.timestamp
            );
        }
        _settled = true;
    }

    function settle(address account) external {
        _settleVirtualSynth();
        _swapSynthToToken();

        // Transfer respective amount of desired token to `account` and burn its virtual token
        swap.getToken(tokenToIndex).transfer(
            account,
            balanceOfUnderlying(account)
        );
        _burn(account, balanceOf(account));
    }

    function withdraw(address account) external {
        _settleVirtualSynth();
        IERC20(address(vsynth.synth())).transfer(
            account,
            balanceOfSynth(account)
        );
        _burn(account, balanceOf(account));
    }
}
