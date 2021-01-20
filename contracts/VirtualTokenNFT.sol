pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "./interfaces/ISwap.sol";

import "hardhat/console.sol";

// TODO Add NatSpec tags
contract VirtualTokenNFT is ERC721, Ownable {
    PendingSynthToToken[] pendingSwapData;

    struct PendingSynthToToken {
        ISwap swap; // swap pool to swap the synth to token
        IVirtualSynth vSynth;
        uint256 vSynthAmount;
        uint256 minAmount;
        uint8 tokenFromIndex;
        uint8 tokenToIndex;
        bool settledOrWithdrawn;
    }

    constructor(string memory name_, string memory symbol_)
        public
        Ownable()
        ERC721(name_, symbol_)
    {
        // Populate 0th index of the array with empty data
        pendingSwapData.push(
            PendingSynthToToken(ISwap(0), IVirtualSynth(0), 0, 0, 0, 0, true)
        );
    }

    function mintNewPendingSwap(
        address to,
        ISwap swap_,
        IVirtualSynth vSynth,
        uint256 vSynthAmount,
        uint256 minAmount,
        uint8 tokenFromIndex,
        uint8 tokenToIndex
    ) external onlyOwner returns (uint256) {
        IERC20(address(vSynth)).transferFrom(
            msg.sender,
            address(this),
            vSynthAmount
        );

        pendingSwapData.push(
            PendingSynthToToken(
                swap_,
                vSynth,
                vSynthAmount,
                minAmount,
                tokenFromIndex,
                tokenToIndex,
                false
            )
        );

        uint256 tokenId = pendingSwapData.length - 1;
        // This will trigger onRecieved function on to
        _mint(to, tokenId);
        return tokenId;
    }

    function readyToSettle(uint256 id) external view returns (bool) {
        return pendingSwapData[id].vSynth.readyToSettle();
    }

    function settled(uint256 id) external view returns (bool) {
        return pendingSwapData[id].settledOrWithdrawn;
    }

    function _settleVirtualSynth(IVirtualSynth vSynth) internal {
        // Ensure virtual synth is ready to settle.
        require(
            vSynth.readyToSettle(),
            "Virtual Synth is not ready to settle yet."
        );

        // If virtual synth is not settled, try settling it.
        if (!vSynth.settled()) {
            vSynth.settle(address(this));
        }
    }

    function settle(uint256 tokenId) external {
        PendingSynthToToken memory pending = pendingSwapData[tokenId];
        IVirtualSynth vSynth = pending.vSynth;

        // Setting any virtual synth to synth.
        _settleVirtualSynth(vSynth);

        IERC20 synth = IERC20(address(vSynth.synth()));
        uint256 synthBalance =
            vSynth.rate().mul(pending.vSynthAmount).div(1e18);

        {
            uint256 totalSynthBalance = synth.balanceOf(address(this));
            if (totalSynthBalance < synthBalance) {
                synthBalance = totalSynthBalance;
            }
        }

        synth.approve(address(pending.swap), synthBalance);
        uint256 swapOutAmount =
            pending.swap.swap(
                pending.tokenFromIndex,
                pending.tokenToIndex,
                synthBalance,
                pending.minAmount,
                block.timestamp
            );

        pending.settledOrWithdrawn = true;

        // Transfer respective amount of desired token to `account` and burn its virtual token
        pending.swap.getToken(pending.tokenToIndex).transfer(
            ownerOf(tokenId),
            swapOutAmount
        );

        _burn(tokenId);
    }

    function withdraw(uint256 tokenId) external {
        address ownerOfToken = ownerOf(tokenId);
        require(ownerOfToken == msg.sender, "caller is not owner of token");
        PendingSynthToToken memory pending = pendingSwapData[tokenId];
        IVirtualSynth vSynth = pending.vSynth;
        _settleVirtualSynth(vSynth);

        IERC20 synth = IERC20(address(vSynth.synth()));

        synth.transfer(
            ownerOfToken,
            vSynth.rate().mul(pending.vSynthAmount).div(1e18)
        );

        pending.settledOrWithdrawn = true;
        _burn(tokenId);
    }
}
