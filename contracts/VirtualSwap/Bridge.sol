pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
import "synthetix/contracts/interfaces/ISynthetix.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "synthetix/contracts/interfaces/IExchangeRates.sol";
import "./VirtualTokenNFT.sol";
import "../interfaces/IVirtualLike.sol";
import "../interfaces/ISwap.sol";

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

    mapping(uint256 => PendingVSynthSettlement) public pendingVSynthSettlements;
    mapping(uint256 => uint256) public pendingVTokenSettlements;
    uint256 public settlementLength;

    // Maps swap address to its index + 1
    mapping(address => uint8) public synthIndexesPlusOne;
    // Maps swap address to the synth address the swap pool contains
    mapping(address => address) public synthAddresses;

    // Settlement queue
    struct PendingVSynthSettlement {
        address vSynth;
        address recipient;
    }

    struct TokenToVSynthInfo {
        IERC20 tokenFrom;
        uint8 synthIndex;
        uint256 mediumSynthAmount;
        uint256 vsynthAmount;
        IVirtualSynth vsynth;
        uint256 queueId;
    }

    struct SynthToVTokenInfo {
        bytes32 mediumSynthKey;
        IVirtualSynth vsynth;
        uint256 vsynthAmount;
        uint8 mediumSynthIndex;
        uint256 vTokenId;
    }

    constructor() public {
        virtualTokenNFT = new VirtualTokenNFT("Saddle SynthToToken Virtual Swap NFT", "saddleVirtualSwap");
    }


    function readyToSettle(uint256 queueId) external view returns (bool) {
        require(queueId < settlementLength, "queueId is not recognized");
        uint256 vTokenId = pendingVTokenSettlements[queueId];
        if (vTokenId != 0) {
            return virtualTokenNFT.readyToSettle(vTokenId);
        } else {
            return IVirtualSynth(pendingVSynthSettlements[queueId].vSynth).readyToSettle();
        }
    }

    function settled(uint256 queueId) external view returns (bool) {
        require(queueId < settlementLength, "queueId is not recognized");
        uint256 vTokenId = pendingVTokenSettlements[queueId];
        if (vTokenId != 0) {
            return virtualTokenNFT.settled(vTokenId);
        } else {
            return IVirtualSynth(pendingVSynthSettlements[queueId].vSynth).settled();
        }
    }

    function _getCurrencyKeyFromProxy(address proxyAddress)
        internal
        view
        returns (bytes32)
    {
        return ISynth(Proxy(proxyAddress).target()).currencyKey();
    }

    function settle(uint256 queueId) external {
        _settle(queueId);
    }

    function _settle(uint256 queueId) internal {
        require(queueId < settlementLength, "queueId is not recognized");
        uint256 vTokenId = pendingVTokenSettlements[queueId];
        if (vTokenId != 0) {
            virtualTokenNFT.settle(vTokenId);
        } else {
            IVirtualSynth(pendingVSynthSettlements[queueId].vSynth).settle(pendingVSynthSettlements[queueId].recipient);
        }
    }

    function settleRange(uint256 min, uint256 max) external {
        // Limit range to 25
        require(max.sub(min) < 26, "Range must be lower than 26");

        // Limit queuePos + range from exceeding queueSize
        if (max > settlementLength) {
            max = settlementLength;
        }

        // Iterate through queueData and call settle()
        for (uint256 i = min; i < max; i++) {
            _settle(i);
        }
    }

    function _addToVSynthSettleQueue(
        address virtualSynthOrToken,
        address recipient
    ) internal returns (uint256) {
        require(settlementLength < MAX_UINT256, "settlementLength reached max size");
        pendingVSynthSettlements[settlementLength] = PendingVSynthSettlement(virtualSynthOrToken, recipient);
        return settlementLength++;
    }

    function _addToVTokenSettleQueue(
        uint256 virtualTokenId
    ) internal returns (uint256) {
        require(settlementLength < MAX_UINT256, "queueData reached max size");
        pendingVTokenSettlements[settlementLength] = virtualTokenId;
        return settlementLength++;
    }

    function calcTokenToVSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount
    ) external view returns (uint256) {
        uint8 mediumSynthIndex = _getSynthIndex(swap);
        uint256 expectedMediumSynthAmount =
            swap.calculateSwap(
                tokenFromIndex,
                mediumSynthIndex,
                tokenInAmount
            );
        bytes32 mediumSynthKey =
            _getCurrencyKeyFromProxy(_getSynthAddress(swap));

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
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount,
        uint256 minAmount,
        address recipient
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
            TokenToVSynthInfo(IERC20(0), 0, 0, 0, IVirtualSynth(0), 0);

        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        // Transfer token from msg.sender
        v.tokenFrom = swap.getToken(tokenFromIndex); // revert when token not found in swap pool
        v.tokenFrom.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        tokenInAmount = v.tokenFrom.balanceOf(address(this));
        v.tokenFrom.approve(address(swap), tokenInAmount);

        // Swaps token to the supported synth in the pool (sETH, sBTC, or sUSD depending on the pool)
        v.synthIndex = _getSynthIndex(swap); // revert when synth index is not set for given swap address
        v.mediumSynthAmount = swap.swap(
            tokenFromIndex,
            v.synthIndex,
            tokenInAmount,
            0,
            block.timestamp
        );

        IERC20 mediumSynth = IERC20(_getSynthAddress(swap));
        mediumSynth.approve(address(synthetix), v.mediumSynthAmount);

        // Swap synths
        (v.vsynthAmount, v.vsynth) = synthetix.exchangeWithVirtual(
            _getCurrencyKeyFromProxy(address(mediumSynth)),
            v.mediumSynthAmount,
            synthOutKey,
            0
        );

        require(v.vsynthAmount >= minAmount, "Insufficient output");

        // Give the virtual synth to the recipient
        IERC20(address(v.vsynth)).transfer(recipient, v.vsynthAmount);

        // Add virtual synth to settle queue with a list of accounts to settle to
        v.queueId = _addToVSynthSettleQueue(address(v.vsynth), recipient);

        // Emit TokenToVSynth event with relevant data
        emit TokenToVSynth(
            msg.sender,
            swap,
            v.tokenFrom,
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
        uint8 tokenToIndex,
        uint256 synthInAmount
    ) external view returns (uint256) {
        IExchangeRates exchangeRates =
            IExchangeRates(synthetixResolver.getAddress(EXCHANGE_RATES_NAME));

        uint8 mediumSynthIndex = _getSynthIndex(swap);

        bytes32 mediumSynthKey =
            _getCurrencyKeyFromProxy(_getSynthAddress(swap));

        uint256 expectedMediumSynthAmount =
            exchangeRates.effectiveValue(
                synthInKey,
                synthInAmount,
                mediumSynthKey
            );

        return
            swap.calculateSwap(
                mediumSynthIndex,
                tokenToIndex,
                expectedMediumSynthAmount
            );
    }

    // Swaps any synth to a token that Saddle's pools support
    function synthToVToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount,
        uint256 minAmount,
        address recipient
    )
        external
        returns (
            uint256,
            uint256
        )
    {
        SynthToVTokenInfo memory v =
            SynthToVTokenInfo(0, IVirtualSynth(0), 0, 0, 0);

        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        // Recieve synth from the user
        IERC20 synthFrom =
            IERC20(Target(synthetixResolver.getSynth(synthInKey)).proxy());
        synthFrom.safeTransferFrom(msg.sender, address(this), synthInAmount);

        // Approve synth for transaction.
        synthFrom.approve(address(synthetix), synthInAmount);

        v.mediumSynthIndex = _getSynthIndex(swap);
        v.mediumSynthKey = _getCurrencyKeyFromProxy(
            _getSynthAddress(swap)
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

        // Approve the transfer of the virtual synth to the virtual token NFT contract
        IERC20(address(v.vsynth)).approve(
            address(virtualTokenNFT),
            v.vsynthAmount
        );
        v.vTokenId = virtualTokenNFT.mintNewPendingSwap(
            recipient,
            swap,
            v.vsynth,
            v.vsynthAmount,
            minAmount,
            v.mediumSynthIndex,
            tokenToIndex
        );

        // Add virtual token to settle queue with a list of accounts to settle to
        uint256 queueId = _addToVTokenSettleQueue(v.vTokenId);

        // Emit TokenToVSynth event with relevant data
        emit SynthToVToken(
            msg.sender,
            swap,
            synthFrom,
            v.vTokenId,
            synthInAmount,
            minAmount,
            queueId
        );

        return (v.vTokenId, queueId);
    }

    function setSynthIndex(
        ISwap swap,
        uint8 synthIndex,
        bytes32 currencyKey
    ) external {
        // Ensure that at given `synthIndex`, there exists the synth with same currency key.
        IERC20 synth = swap.getToken(synthIndex);
        require(
            _getCurrencyKeyFromProxy(address(synth)) == currencyKey,
            "currencyKey does not match"
        );
        require(synthIndex < MAX_UINT8, "index is too large");
        synthIndexesPlusOne[address(swap)] = synthIndex + 1;
        synthAddresses[address(swap)] = address(synth);
        emit SynthIndex(address(swap), synthIndex, currencyKey);
    }

    function getSynthIndex(ISwap swap) external view returns (uint8) {
        return _getSynthIndex(swap);
    }

    function _getSynthIndex(ISwap swap) internal view returns (uint8) {
        uint8 synthIndexPlusOne = synthIndexesPlusOne[address(swap)];
        require(synthIndexPlusOne > 0, "synth index not found for given pool");
        return synthIndexPlusOne - 1;
    }

    function getSynthAddress(ISwap swap) external view returns (address) {
        return _getSynthAddress(swap);
    }

    function _getSynthAddress(ISwap swap) internal view returns (address) {
        address synthAddress = synthAddresses[address(swap)];
        require(synthAddress != address(0), "synth addr not found for given pool");
        return synthAddress;
    }
}
