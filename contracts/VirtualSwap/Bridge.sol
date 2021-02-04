pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "openzeppelin-contracts-3.4/proxy/Clones.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
import "synthetix/contracts/interfaces/ISynthetix.sol";
import "synthetix/contracts/interfaces/IVirtualSynth.sol";
import "synthetix/contracts/interfaces/IExchanger.sol";
import "synthetix/contracts/interfaces/IExchangeRates.sol";

import "../interfaces/ISwap.sol";

import "hardhat/console.sol";
import "./SynthSwapper.sol";

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
        bytes32 currencyKey,
        address synthAddress
    );
    event TokenToSynth(
        address indexed requester,
        ISwap swapPool,
        IERC20 tokenFrom,
        uint256 tokenFromInAmount,
        uint256 vSynthToOutAmount,
        uint256 itemId
    );
    event SynthToToken(
        address indexed requester,
        ISwap swapPool,
        IERC20 synthFrom,
        uint256 synthFromInAmount,
        uint256 vTokenToOutAmount,
        uint256 itemId
    );
    event TokenToToken(
        address indexed requester,
        ISwap[2] swapPools,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256[2] minAmounts,
        uint256 itemId
    );

    // The addresses for all Synthetix contracts can be found in the below URL.
    // https://docs.synthetix.io/addresses/#mainnet-contracts
    //
    // Since the Synthetix protocol is upgradable, we must use the proxy pairs of each contract such that
    // the composability is not broken after the protocol upgrade.
    //
    // SYNTHETIX_RESOLVER points to `ReadProxyAddressResolver` (0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2).
    // This contract is a read proxy of `AddressResolver` which is responsible for storing the addresses of the contracts
    // used by the Synthetix protocol.
    IAddressResolver public constant SYNTHETIX_RESOLVER =
        IAddressResolver(0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2);

    // EXCHANGER points to `Exchanger`. There is no proxy pair for this contract so we need to update this variable
    // when the protocol is upgraded. This contract is used to settle synths held by SynthSwapper.
    IExchanger public EXCHANGER;

    // CONSTANTS
    uint256 public constant MAX_UINT256 = 2**256 - 1;
    uint8 public constant MAX_UINT8 = 2**8 - 1;
    bytes32 public constant EXCHANGE_RATES_NAME = "ExchangeRates";
    bytes32 public constant EXCHANGER_NAME = "Exchanger";
    address public immutable SYNTH_SWAPPER_MASTER;

    // MAPPINGS FOR STORING PENDING SETTLEMENTS
    // The below two mappings never share the same key.
    mapping(uint256 => PendingSynthSettlement) public pendingSynthSettlements;
    mapping(uint256 => PendingSynthToTokenSettlement)
        public pendingSynthToTokenSettlements;
    uint256 public pendingSettlementsLength;

    // MAPPINGS FOR STORING SYNTH INFO OF GIVEN POOL
    // Maps swap address to its index of the supported synth + 1
    mapping(address => uint8) private synthIndexesPlusOne;
    // Maps swap address to the address of the supported synth
    mapping(address => address) private synthAddresses;
    // Maps swap address to the bytes32 key of the supported synth
    mapping(address => bytes32) private synthKeys;

    // Structs holding information about pending settlements
    struct PendingSynthSettlement {
        SynthSwapper ss;
        bytes32 synthKey;
        address recipient;
        bool settled;
    }

    struct PendingSynthToTokenSettlement {
        SynthSwapper ss;
        bytes32 synthKey;
        address recipient;
        ISwap swap;
        uint8 tokenToIndex;
        uint256 minAmount;
        bool settled;
    }

    // Structs used to avoid stack too deep errors
    struct TokenToSynthInfo {
        IERC20 tokenFrom;
        uint8 synthIndex;
        uint256 mediumSynthAmount;
        uint256 destSynthAmount;
        SynthSwapper synthSwapper;
        uint256 itemId;
    }

    struct SynthToTokenInfo {
        bytes32 mediumSynthKey;
        SynthSwapper synthSwapper;
        uint8 mediumSynthIndex;
    }

    struct TokenToTokenInfo {
        SynthSwapper synthSwapper;
        bytes32 secondSynthKey;
    }

    constructor() public {
        EXCHANGER = IExchanger(SYNTHETIX_RESOLVER.getAddress(EXCHANGER_NAME));
        SYNTH_SWAPPER_MASTER = address(new SynthSwapper());
    }

    modifier checkItemId(uint256 itemId) {
        require(itemId < pendingSettlementsLength, "itemId is not recognized");
        _;
    }

    function maxSecsLeftInWaitingPeriod(uint256 itemId)
        external
        view
        checkItemId(itemId)
        returns (uint256)
    {
        PendingSynthSettlement memory pss = pendingSynthSettlements[itemId];
        address synthSwapper;
        bytes32 synthKey;

        if (address(pss.ss) != address(0)) {
            synthSwapper = address(pss.ss);
            synthKey = pss.synthKey;
        } else {
            PendingSynthToTokenSettlement memory pstts =
                pendingSynthToTokenSettlements[itemId];
            synthSwapper = address(pstts.ss);
            synthKey = pstts.synthKey;
        }

        return EXCHANGER.maxSecsLeftInWaitingPeriod(synthSwapper, synthKey);
    }

    function settled(uint256 itemId)
        external
        view
        checkItemId(itemId)
        returns (bool)
    {
        return
            pendingSynthSettlements[itemId].settled ||
            pendingSynthToTokenSettlements[itemId].settled;
    }

    function settle(uint256 itemId) external checkItemId(itemId) {
        SynthSwapper synthSwapper = pendingSynthSettlements[itemId].ss;

        // Check if the given itemId is for pending synth or pending synth to token settlement
        if (address(synthSwapper) != address(0)) {
            PendingSynthSettlement memory pss = pendingSynthSettlements[itemId];

            // Ensure Synth is ready to settle
            require(
                EXCHANGER.maxSecsLeftInWaitingPeriod(
                    address(synthSwapper),
                    pss.synthKey
                ) == 0
            );

            // Settle synth
            EXCHANGER.settle(address(synthSwapper), pss.synthKey);
            IERC20 synth =
                IERC20(
                    Target(SYNTHETIX_RESOLVER.getSynth(pss.synthKey)).proxy()
                );

            // After settlement, withdraw the synth and send it to the recipient
            synthSwapper.withdrawAll(synth, pss.recipient);
            pendingSynthSettlements[itemId].settled = true;
        } else {
            // Since pendingSynthSettlements has an empty element at the given index, it implies
            // the index belongs to pendingSynthToTokenSettlements
            PendingSynthToTokenSettlement memory pstts =
                pendingSynthToTokenSettlements[itemId];
            synthSwapper = pstts.ss;

            // Ensure synth is ready to settle
            require(
                EXCHANGER.maxSecsLeftInWaitingPeriod(
                    address(synthSwapper),
                    pstts.synthKey
                ) == 0
            );

            // Settle synth
            EXCHANGER.settle(address(synthSwapper), pstts.synthKey);
            IERC20 synth =
                IERC20(
                    Target(SYNTHETIX_RESOLVER.getSynth(pstts.synthKey)).proxy()
                );
            uint256 synthBalance = synth.balanceOf(address(synthSwapper));

            // Try swapping the synth to the desired token via the stored swap pool contract
            // If the external call succeeds, send the token to the recipient.
            // If it reverts, send the settled synth to the recipient instead.
            try
                synthSwapper.swapSynthToToken(
                    pstts.swap,
                    _getSynthIndex(pstts.swap),
                    pstts.tokenToIndex,
                    synthBalance,
                    pstts.minAmount,
                    block.timestamp,
                    pstts.recipient
                )
            {} catch {
                synthSwapper.withdrawAll(synth, pstts.recipient);
            }
            pendingSynthToTokenSettlements[itemId].settled = true;
        }
    }

    // Add the given pending synth settlement struct to the list
    function _addToPendingSynthSettlementList(PendingSynthSettlement memory pss)
        internal
        returns (uint256)
    {
        require(
            pendingSettlementsLength < MAX_UINT256,
            "settlementLength reached max size"
        );
        pendingSynthSettlements[pendingSettlementsLength] = pss;
        return pendingSettlementsLength++;
    }

    // Add the given pending synth to token settlement struct to the list
    function _addToPendingSynthToTokenSettlementList(
        PendingSynthToTokenSettlement memory pstts
    ) internal returns (uint256) {
        require(
            pendingSettlementsLength < MAX_UINT256,
            "settlementLength reached max size"
        );
        pendingSynthToTokenSettlements[pendingSettlementsLength] = pstts;
        return pendingSettlementsLength++;
    }

    function calcTokenToSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount
    ) external view returns (uint256) {
        uint8 mediumSynthIndex = _getSynthIndex(swap);
        uint256 expectedMediumSynthAmount =
            swap.calculateSwap(tokenFromIndex, mediumSynthIndex, tokenInAmount);
        bytes32 mediumSynthKey = _getSynthKey(swap);

        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));
        return
            exchangeRates.effectiveValue(
                mediumSynthKey,
                expectedMediumSynthAmount,
                synthOutKey
            );
    }

    // Swaps a token from a Saddle's pool to any virtual synth
    function tokenToSynth(
        ISwap swap,
        uint8 tokenFromIndex,
        bytes32 synthOutKey,
        uint256 tokenInAmount,
        uint256 minAmount,
        address recipient
    ) external returns (uint256) {
        // Struct to hold data for this function
        TokenToSynthInfo memory v =
            TokenToSynthInfo(IERC20(0), 0, 0, 0, SynthSwapper(0), 0);

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
        v.synthSwapper = SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
        mediumSynth.transfer(address(v.synthSwapper), v.mediumSynthAmount);

        // Swap synths via Synthetix network
        v.destSynthAmount = v.synthSwapper.swapSynth(
            _getSynthKey(swap),
            v.mediumSynthAmount,
            synthOutKey
        );
        require(v.destSynthAmount >= minAmount, "Insufficient output");

        // Add the synthswapper to the pending settlement list
        v.itemId = _addToPendingSynthSettlementList(
            PendingSynthSettlement(
                v.synthSwapper,
                synthOutKey,
                recipient,
                false
            )
        );

        // Emit TokenToSynth event with relevant data
        emit TokenToSynth(
            msg.sender,
            swap,
            v.tokenFrom,
            tokenInAmount,
            v.destSynthAmount,
            v.itemId
        );

        return (v.itemId);
    }

    function calcSynthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount
    ) external view returns (uint256) {
        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));

        uint8 mediumSynthIndex = _getSynthIndex(swap);
        bytes32 mediumSynthKey = _getSynthKey(swap);
        require(synthInKey != mediumSynthKey, "use normal swap");

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
    function synthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount,
        uint256 minAmount,
        address recipient
    ) external returns (uint256) {
        SynthToTokenInfo memory v = SynthToTokenInfo(0, SynthSwapper(0), 0);

        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        v.mediumSynthKey = _getSynthKey(swap);
        require(
            synthInKey != v.mediumSynthKey,
            "synth is supported via normal swap"
        );
        v.mediumSynthIndex = _getSynthIndex(swap);

        // Receive synth from the user
        IERC20 synthFrom =
            IERC20(Target(SYNTHETIX_RESOLVER.getSynth(synthInKey)).proxy());
        synthFrom.safeTransferFrom(msg.sender, address(this), synthInAmount);

        // Create a new SynthSwapper contract then initiate a swap to the medium synth supported by the swap pool
        v.synthSwapper = SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
        synthFrom.transfer(address(v.synthSwapper), synthInAmount);
        v.synthSwapper.swapSynth(synthInKey, synthInAmount, v.mediumSynthKey);

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId =
            _addToPendingSynthToTokenSettlementList(
                PendingSynthToTokenSettlement(
                    v.synthSwapper,
                    v.mediumSynthKey,
                    recipient,
                    swap,
                    tokenToIndex,
                    minAmount,
                    false
                )
            );

        // Emit SynthToToken event with relevant data
        emit SynthToToken(
            msg.sender,
            swap,
            synthFrom,
            synthInAmount,
            minAmount,
            itemId
        );

        return (itemId);
    }

    function calcTokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount
    ) external view returns (uint256, uint256) {
        IExchangeRates exchangeRates =
            IExchangeRates(SYNTHETIX_RESOLVER.getAddress(EXCHANGE_RATES_NAME));

        uint256 firstSynthAmount =
            swaps[0].calculateSwap(
                tokenFromIndex,
                _getSynthIndex(swaps[0]),
                tokenFromAmount
            );

        uint256 secondSynthAmount =
            exchangeRates.effectiveValue(
                _getSynthKey(swaps[0]),
                firstSynthAmount,
                _getSynthKey(swaps[1])
            );

        return (
            firstSynthAmount,
            swaps[1].calculateSwap(
                _getSynthIndex(swaps[1]),
                tokenToIndex,
                secondSynthAmount
            )
        );
    }

    // Swaps a token from one pool to one in another using the Synthetix network as the bridging exchange
    function tokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256[2] calldata minAmounts,
        address recipient
    ) external returns (uint256) {
        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        TokenToTokenInfo memory v = TokenToTokenInfo(SynthSwapper(0), 0);

        // Receive token from the user
        ISwap swap = swaps[0];
        {
            IERC20 tokenFrom = swap.getToken(tokenFromIndex);
            tokenFrom.safeTransferFrom(
                msg.sender,
                address(this),
                tokenFromAmount
            );
            tokenFrom.approve(address(swap), tokenFromAmount);
        }

        uint256 firstSynthAmount =
            swap.swap(
                tokenFromIndex,
                _getSynthIndex(swap),
                tokenFromAmount,
                minAmounts[0],
                block.timestamp
            );

        {
            IERC20 synthFrom = IERC20(_getSynthAddress(swap));
            v.synthSwapper = SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
            v.secondSynthKey = _getSynthKey(swaps[1]);
            synthFrom.transfer(address(v.synthSwapper), firstSynthAmount);
            v.synthSwapper.swapSynth(
                _getSynthKey(swap),
                firstSynthAmount,
                v.secondSynthKey
            );
        }

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId =
            _addToPendingSynthToTokenSettlementList(
                PendingSynthToTokenSettlement(
                    v.synthSwapper,
                    v.secondSynthKey,
                    recipient,
                    swaps[1],
                    tokenToIndex,
                    minAmounts[1],
                    false
                )
            );

        // Emit TokenToToken event with relevant data
        emit TokenToToken(
            msg.sender,
            swaps,
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
            minAmounts,
            itemId
        );

        return (itemId);
    }

    // Management

    function setSynthIndex(
        ISwap swap,
        uint8 synthIndex,
        bytes32 currencyKey
    ) external {
        // Ensure the synth with the same currency key exists at the given `synthIndex`
        IERC20 synth = swap.getToken(synthIndex);
        require(
            ISynth(Proxy(address(synth)).target()).currencyKey() == currencyKey,
            "currencyKey does not match"
        );
        require(synthIndex < MAX_UINT8, "index is too large");
        synthIndexesPlusOne[address(swap)] = synthIndex + 1;
        synthAddresses[address(swap)] = address(synth);
        synthKeys[address(swap)] = currencyKey;
        emit SynthIndex(address(swap), synthIndex, currencyKey, address(synth));
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
        require(
            synthAddress != address(0),
            "synth addr not found for given pool"
        );
        return synthAddress;
    }

    function _getSynthKey(ISwap swap) internal view returns (bytes32) {
        bytes32 synthKey = synthKeys[address(swap)];
        require(synthKey != 0x0, "synth key not found for given pool");
        return synthKey;
    }

    // When a new exchanger contract is deployed by the Synthetix team, we need to update the address stored
    // in this contract.
    function updateExchangerCache() external {
        EXCHANGER = IExchanger(SYNTHETIX_RESOLVER.getAddress(EXCHANGER_NAME));
    }
}
