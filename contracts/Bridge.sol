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

    function settle(uint256 range) external {
        // Limit range to 25
        require(range < 26);
        uint256 maxPos = queuePos.add(range);

        // Limit queuePos + range from exceeding queueSize
        if (maxPos > queueData.length) {
            maxPos = queueData.length;
        }

        // Iterate through queueData and call settle()
        for (uint i = queuePos; i < maxPos; i++) {
            PendingSettlement memory ps = queueData[i];
            require(ps.virtualSynthOrToken.readyToSettle());
            for (uint j = 0; j < ps.accounts.length; j++) {
                queueData[i].virtualSynthOrToken.settle(ps.accounts[j]);
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
    function tokenToVSynth(ISwap pool, uint8 tokenFrom, bytes32 synthOutKey,
        uint256 tokenInAmount, address[] calldata accounts) external {

        // Transfer token from msg.sender
        IERC20 token = pool.getToken(tokenFrom);
        token.transferFrom(msg.sender, address(this), tokenInAmount);

        // Swaps token to the supported synth in the pool (sETH, sBTC, or sUSD depending on the pool)
        pool.swap(tokenFrom, synthIndexes[address(pool)], tokenInAmount, 0, block.timestamp);
        IERC20 synthFrom = pool.getToken(synthIndexes[address(pool)]);

        // Approve synth for transaction
        uint256 synthInAmount = synthFrom.balanceOf(address(this));
        synthFrom.approve(address(synthetix), synthInAmount);

        // Swap synths
        (uint vsynthAmount, IVirtualSynth vsynth) = synthetix.exchangeWithVirtual(
            ISynth(address(synthFrom)).currencyKey(),
            synthInAmount,
            synthOutKey
        );

        // Give the virtual synth to the user
        IERC20(address(vsynth)).transfer(msg.sender, vsynthAmount);

        // Add virtual token to settle queue with a list of accounts to settle to
        addToSettleQueue(address(vsynth), accounts);
    }

    // Swaps any synth to a token that Saddle's pools support
    function synthToVToken(ISwap pool, bytes32 synthInKey, uint8 tokenToIndex,
        uint256 synthInAmount, address[] calldata accounts) external {

        // Limit array size
        require(accounts.length < 6);

        // Recieve synth from the user
        IERC20 synthFrom = IERC20(synthetixResolver.getSynth(synthInKey));
        synthFrom.transferFrom(msg.sender, address(this), synthInAmount);

        // Approve synth for transaction.
        synthFrom.approve(address(synthetix), synthInAmount);
        uint8 synthIndex = synthIndexes[address(pool)];

        // Swap synths
        (uint vsynthAmount, IVirtualSynth vsynth) = synthetix.exchangeWithVirtual(
            synthInKey,
            synthInAmount,
            ISynth(address(pool.getToken(synthIndex))).currencyKey()
        );

        // Create virtual token with information of which token swap to
        ERC20Detailed tokenTo = ERC20Detailed(address(pool.getToken(tokenToIndex)));
        VirtualToken vtoken = new VirtualToken(
            vsynth,
            pool,
            synthIndex,
            tokenToIndex,
            string(abi.encodePacked("Virtual ", tokenTo.name())),
            string(abi.encodePacked("V", tokenTo.symbol())),
            tokenTo.decimals()
        );

        // Trasnfer the virtual synth and initialize virtual token
        IERC20(address(vsynth)).transfer(address(vtoken), vsynthAmount);
        vtoken.initialize(msg.sender, pool.calculateSwap(synthIndex, tokenToIndex, vsynthAmount));

        // Add virtual token to settle queue with a list of accounts to settle to
        addToSettleQueue(address(vtoken), accounts);
    }

    function tokenToVToken(ISwap[2] calldata pools, address tokenFrom, address tokenTo, uint amount) external {

    }

    function setSynthIndex(ISwap swap, uint8 synthIndex, bytes32 currencyKey) external onlyOwner {
        require(ISynth(address(swap.getToken(synthIndex))).currencyKey() == currencyKey, "currencyKey does not match");

        synthIndexes[address(swap)] = synthIndex;
    }
}
