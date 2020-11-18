pragma solidity 0.5.17;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
import "synthetix/contracts/interfaces/ISynthetix.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "./VirtualToken.sol";
import "./interfaces/IVirtualLike.sol";
import "./interfaces/ISwap.sol";

// TODO Add NatSpec tags
contract Bridge is Ownable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Mainnet Synthetix contracts
    IAddressResolver public synthetixResolver = IAddressResolver(0x61166014E3f04E40C953fe4EAb9D9E40863C83AE);
    ISynthetix public synthetix = ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);

    // Index of synth in each swap pool
    mapping(address => uint8) public synthIndexes;

    // Settlement queue
    struct PendingSettlement {
        IVirtualLike virtualSynthOrToken;
        address[] accounts;
    }

    uint256 public queuePos;
    PendingSettlement[] public queueData;

    constructor () public {

    }

    // TODO single pending settlement?
    function settle(uint256 range) external {
        // Limit range to 25
        require(range < 26, "Range must be lower than 26");
        uint256 maxPos = queuePos.add(range);

        // Limit queuePos + range from exceeding queueSize
        if (maxPos > queueData.length) {
            maxPos = queueData.length;
        }

        // Iterate through queueData and call settle()
        for (uint256 i = queuePos; i < maxPos; i++) {

            // Retrieve pending settlement
            PendingSettlement memory ps = queueData[i];

            // Check if it is already settled by others or not
            if (!ps.virtualSynthOrToken.settled()) {

                // If it's not ready to settle, return early
                if (!ps.virtualSynthOrToken.readyToSettle()) {
                    return;
                }

                // Settle this virtual with the list of accounts
                for (uint j = 0; j < ps.accounts.length; j++) {
                    ps.virtualSynthOrToken.settle(ps.accounts[j]);
                }
            }
            queuePos++;
        }
    }

    function addToSettleQueue(address virtualSynthOrToken, address[] memory accounts) internal {
        queueData.push(
            PendingSettlement(
                IVirtualLike(virtualSynthOrToken),
                accounts
            )
        );
    }

    // Swaps a token from a Saddle's pool to any virtual synth
    function tokenToVSynth(ISwap swap, uint8 tokenFrom, bytes32 synthOutKey,
        uint256 tokenInAmount, address[] calldata accounts) external {

        // Transfer token from msg.sender
        IERC20 token = swap.getToken(tokenFrom);
        token.transferFrom(msg.sender, address(this), tokenInAmount);

        // Swaps token to the supported synth in the pool (sETH, sBTC, or sUSD depending on the pool)
        swap.swap(tokenFrom, synthIndexes[address(swap)], tokenInAmount, 0, block.timestamp);
        IERC20 synthFrom = swap.getToken(synthIndexes[address(swap)]);

        // Approve synth for transaction
        uint256 synthInAmount = synthFrom.balanceOf(address(this));
        synthFrom.approve(address(synthetix), synthInAmount);

        // Swap synths
        (uint vsynthAmount, IVirtualSynth vsynth) = synthetix.exchangeWithVirtual(
            ISynth(address(synthFrom)).currencyKey(),
            synthInAmount,
            synthOutKey,
            0
        );

        // Give the virtual synth to the user
        IERC20(address(vsynth)).transfer(msg.sender, vsynthAmount);

        // Add virtual token to settle queue with a list of accounts to settle to
        addToSettleQueue(address(vsynth), accounts);
    }

    // Swaps any synth to a token that Saddle's pools support
    function synthToVToken(ISwap swap, bytes32 synthInKey, uint8 tokenToIndex,
        uint256 synthInAmount, address[] calldata accounts) external {

        // Limit array size
        require(accounts.length < 6);

        {
        // Recieve synth from the user
        IERC20 synthFrom = IERC20(synthetixResolver.getSynth(synthInKey));
        synthFrom.transferFrom(msg.sender, address(this), synthInAmount);

        // Approve synth for transaction.
        synthFrom.approve(address(synthetix), synthInAmount);
        }

        uint8 synthIndex = synthIndexes[address(swap)];

        // Swap synths
        (uint256 vsynthAmount, IVirtualSynth vsynth) = synthetix.exchangeWithVirtual(
            synthInKey,
            synthInAmount,
            ISynth(address(swap.getToken(synthIndex))).currencyKey(),
            0
        );

        // Create virtual token with information of which token swap to
        ERC20Detailed tokenTo = ERC20Detailed(address(swap.getToken(tokenToIndex)));
        VirtualToken vtoken = new VirtualToken(
            vsynth,
            swap,
            synthIndex,
            tokenToIndex,
            string(abi.encodePacked("Virtual ", tokenTo.name())),
            string(abi.encodePacked("V", tokenTo.symbol())),
            tokenTo.decimals()
        );

        // Trasnfer the virtual synth and initialize virtual token
        IERC20(address(vsynth)).transfer(address(vtoken), vsynthAmount);
        vtoken.initialize(msg.sender, swap.calculateSwap(synthIndex, tokenToIndex, vsynthAmount));

        // Add virtual token to settle queue with a list of accounts to settle to
        addToSettleQueue(address(vtoken), accounts);
    }

    function setSynthIndex(ISwap swap, uint8 synthIndex, bytes32 currencyKey) external onlyOwner {
        // Ensure that at given `synthIndex`, there exists the synth with same currency key.
        require(ISynth(address(swap.getToken(synthIndex))).currencyKey() == currencyKey, "currencyKey does not match");
        synthIndexes[address(swap)] = synthIndex;
    }
}
