pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
import "synthetix/contracts/interfaces/ISynthetix.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "synthetix/contracts/interfaces/IExchangeRates.sol";
import "./VirtualTokenNFT.sol";
import "./interfaces/IVirtualLike.sol";
import "./interfaces/ISwap.sol";

import "hardhat/console.sol";

contract Proxy {
    address public target;
}

contract Target {
    address public proxy;
}

// TODO Add NatSpec tags
contract Bridge is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event SynthIndex(
        address indexed swap,
        uint8 synthIndex,
        bytes32 currencyKey
    );
    event TokenToVSynth(
        address indexed requester,
        ISwap swapPool,
        IERC20 tokenFrom,
        IVirtualSynth vSynthTo,
        uint256 tokenFromInAmount,
        uint256 vSynthToOutAmount,
        uint256 queueId
    );
    event SynthToVToken(
        address indexed requester,
        ISwap swapPool,
        IERC20 synthFrom,
        uint256 vTokenId,
        uint256 synthFromInAmount,
        uint256 vTokenToOutAmount,
        uint256 queueId
    );

    // Mainnet Synthetix contracts
    IAddressResolver constant synthetixResolver =
        IAddressResolver(0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2);
    ISynthetix constant synthetix =
        ISynthetix(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);

    uint256 constant MAX_UINT256 = 2**256 - 1;
    uint8 constant MAX_UINT8 = 2**8 - 1;
    bytes32 constant EXCHANGE_RATES_NAME = "ExchangeRates";
    VirtualTokenNFT immutable virtualTokenNFT;

    PendingSettlement[] public queueData;

    // Index of synth in each swap pool
    mapping(address => uint8) public synthIndexPlusOneArray;

    // Settlement queue
    struct PendingSettlement {
        address virtualSynthOrToken;
        address[] accounts;
        uint256 virtualTokenId;
    }

    struct TokenToVSynthInfo {
        uint8 tokenFromIndex;
        uint8 synthIndex;
        uint256 synthInAmount;
        uint256 vsynthAmount;
        IVirtualSynth vsynth;
        uint256 queueId;
    }

    struct SynthToVTokenInfo {
        bytes32 mediumSynthKey;
        IVirtualSynth vsynth;
        uint256 vsynthAmount;
        uint8 mediumSynthIndex;
        uint8 tokenToIndex;
        uint256 vTokenId;
        uint256 queueId;
    }

    constructor() public {
        virtualTokenNFT = new VirtualTokenNFT("Saddle SynthToToken Virtual Swap NFT", "saddleVirtualSwap");
    }

    function _getCurrencyKeyFromProxy(IERC20 proxyAddress)
        internal
        view
        returns (bytes32)
    {
        return ISynth(Proxy(address(proxyAddress)).target()).currencyKey();
    }

    function _settle(uint256 id) internal {
        // Retrieve pending settlement
        PendingSettlement memory ps = queueData[id];

        // This implies the pending settlement is holding a virtual synth
        uint256 virtualTokenid = ps.virtualTokenId;
        if (virtualTokenid == 0) {
            for (uint256 j = 0; j < ps.accounts.length; j++) {
                IVirtualSynth(ps.virtualSynthOrToken).settle(ps.accounts[j]);
            }
        } else {
            virtualTokenNFT.settle(virtualTokenid);
        }
    }

    function settle(uint256 id) external {
        _settle(id);
    }

    function readyToSettle(uint256 id) external view returns (bool) {
        PendingSettlement memory ps = queueData[id];

        uint256 virtualTokenid = ps.virtualTokenId;
        if (virtualTokenid == 0) {
            return IVirtualSynth(ps.virtualSynthOrToken).readyToSettle();
        } else {
            return virtualTokenNFT.readyToSettle(virtualTokenid);
        }
    }

    function settleRange(uint256 min, uint256 max) external {
        // Limit range to 25
        require(max.sub(min) < 26, "Range must be lower than 26");

        // Limit queuePos + range from exceeding queueSize
        if (max > queueData.length) {
            max = queueData.length;
        }

        // Iterate through queueData and call settle()
        for (uint256 i = min; i < max; i++) {
            _settle(i);
        }
    }

    function _addToSettleQueue(
        address virtualSynthOrToken,
        address[] memory accounts,
        uint256 virtualTokenId
    ) internal returns (uint256) {
        require(queueData.length < MAX_UINT256, "queueData reached max size");
        queueData.push(
            PendingSettlement(virtualSynthOrToken, accounts, virtualTokenId)
        );
        return queueData.length - 1;
    }

    function calcTokenToVSynth(
        ISwap swap,
        IERC20 tokenFrom,
        bytes32 synthOutKey,
        uint256 tokenInAmount
    ) external view returns (uint256) {
        uint8 mediumSynthIndex = _getSynthIndex(swap);
        uint256 expectedMediumSynthAmount =
            swap.calculateSwap(
                swap.getTokenIndex(address(tokenFrom)),
                mediumSynthIndex,
                tokenInAmount
            );
        bytes32 mediumSynthKey =
            _getCurrencyKeyFromProxy(swap.getToken(mediumSynthIndex));

        IExchangeRates exchangeRates =
            IExchangeRates(synthetixResolver.getAddress(EXCHANGE_RATES_NAME));
        return
            exchangeRates.effectiveValue(
                mediumSynthKey,
                expectedMediumSynthAmount,
                synthOutKey
            );
    }

    // Swaps a token from a Saddle's pool to any virtual synth
    function tokenToVSynth(
        ISwap swap,
        IERC20 tokenFrom,
        bytes32 synthOutKey,
        uint256 tokenInAmount,
        address[] calldata accounts,
        uint256 minAmount
    )
        external
        returns (
            uint256,
            IVirtualSynth,
            uint256
        )
    {
        // Struct to hold data for this function
        TokenToVSynthInfo memory v =
            TokenToVSynthInfo(0, 0, 0, 0, IVirtualSynth(0), 0);

        // Transfer token from msg.sender
        v.tokenFromIndex = swap.getTokenIndex(address(tokenFrom)); // revert when token not found in swap pool
        tokenFrom.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        tokenInAmount = tokenFrom.balanceOf(address(this));
        tokenFrom.approve(address(swap), tokenInAmount);

        // Swaps token to the supported synth in the pool (sETH, sBTC, or sUSD depending on the pool)
        v.synthIndex = _getSynthIndex(swap); // revert when synth index is not set for given swap address
        swap.swap(
            v.tokenFromIndex,
            v.synthIndex,
            tokenInAmount,
            0,
            block.timestamp
        );
        IERC20 mediumSynth = swap.getToken(v.synthIndex);

        // Approve synth for transaction
        v.synthInAmount = mediumSynth.balanceOf(address(this));
        mediumSynth.approve(address(synthetix), v.synthInAmount);

        // Swap synths
        (v.vsynthAmount, v.vsynth) = synthetix.exchangeWithVirtual(
            _getCurrencyKeyFromProxy(mediumSynth),
            v.synthInAmount,
            synthOutKey,
            0
        );

        require(v.vsynthAmount >= minAmount, "Insufficient output");

        // Give the virtual synth to the user
        IERC20(address(v.vsynth)).transfer(msg.sender, v.vsynthAmount);

        // Add virtual synth to settle queue with a list of accounts to settle to
        v.queueId = _addToSettleQueue(address(v.vsynth), accounts, 0);

        // Emit TokenToVSynth event with relevant data
        emit TokenToVSynth(
            msg.sender,
            swap,
            tokenFrom,
            v.vsynth,
            tokenInAmount,
            v.vsynthAmount,
            v.queueId
        );

        return (v.vsynthAmount, v.vsynth, v.queueId);
    }

    function calcSynthToVToken(
        ISwap swap,
        bytes32 synthInKey,
        ERC20 tokenTo,
        uint256 synthInAmount
    ) external view returns (uint256) {
        IExchangeRates exchangeRates =
            IExchangeRates(synthetixResolver.getAddress(EXCHANGE_RATES_NAME));

        uint8 mediumSynthIndex = _getSynthIndex(swap);

        bytes32 mediumSynthKey =
            _getCurrencyKeyFromProxy(swap.getToken(mediumSynthIndex));

        uint256 expectedMediumSynthAmount =
            exchangeRates.effectiveValue(
                synthInKey,
                synthInAmount,
                mediumSynthKey
            );

        return
            swap.calculateSwap(
                mediumSynthIndex,
                swap.getTokenIndex(address(tokenTo)),
                expectedMediumSynthAmount
            );
    }

    // Swaps any synth to a token that Saddle's pools support
    function synthToVToken(
        ISwap swap,
        bytes32 synthInKey,
        ERC20 tokenTo,
        uint256 synthInAmount,
        uint256 minAmount
    )
        external
        returns (
            uint256,
            uint256
        )
    {
        SynthToVTokenInfo memory v =
            SynthToVTokenInfo(0, IVirtualSynth(0), 0, 0, 0, 0, 0);

        // Recieve synth from the user
        IERC20 synthFrom =
            IERC20(Target(synthetixResolver.getSynth(synthInKey)).proxy());
        synthFrom.safeTransferFrom(msg.sender, address(this), synthInAmount);

        // Approve synth for transaction.
        synthFrom.approve(address(synthetix), synthInAmount);

        v.mediumSynthIndex = _getSynthIndex(swap);
        v.mediumSynthKey = _getCurrencyKeyFromProxy(
            swap.getToken(v.mediumSynthIndex)
        );
        require(
            synthInKey != v.mediumSynthKey,
            "synth is supported via normal swap"
        );

        // Swap synths
        (v.vsynthAmount, v.vsynth) = synthetix.exchangeWithVirtual(
            synthInKey,
            synthInAmount,
            v.mediumSynthKey,
            0
        );

        // Create virtual token with information of which token swap to
        v.tokenToIndex = swap.getTokenIndex(address(tokenTo));

        // Approve the transfer of the virtual synth to the virtual token NFT contract
        IERC20(address(v.vsynth)).approve(
            address(virtualTokenNFT),
            v.vsynthAmount
        );
        v.vTokenId = virtualTokenNFT.mintNewPendingSwap(
            msg.sender,
            swap,
            v.vsynth,
            v.vsynthAmount,
            minAmount,
            v.mediumSynthIndex,
            v.tokenToIndex
        );

        // Add virtual token to settle queue with a list of accounts to settle to
        v.queueId = _addToSettleQueue(address(0), new address[](0), v.vTokenId);

        // Emit TokenToVSynth event with relevant data
        emit SynthToVToken(
            msg.sender,
            swap,
            synthFrom,
            v.vTokenId,
            synthInAmount,
            minAmount,
            v.queueId
        );

        return (v.vTokenId, v.queueId);
    }

    function setSynthIndex(
        ISwap swap,
        uint8 synthIndex,
        bytes32 currencyKey
    ) external {
        // Ensure that at given `synthIndex`, there exists the synth with same currency key.
        require(
            _getCurrencyKeyFromProxy(swap.getToken(synthIndex)) == currencyKey,
            "currencyKey does not match"
        );
        require(synthIndex < MAX_UINT8, "index is too large");
        synthIndexPlusOneArray[address(swap)] = synthIndex + 1;
        emit SynthIndex(address(swap), synthIndex, currencyKey);
    }

    function getSynthIndex(ISwap swap) external view returns (uint8) {
        return _getSynthIndex(swap);
    }

    function _getSynthIndex(ISwap swap) internal view returns (uint8) {
        uint8 synthIndexPlusOne = synthIndexPlusOneArray[address(swap)];
        require(synthIndexPlusOne > 0, "synth index not found for given pool");
        return synthIndexPlusOne - 1;
    }
}
