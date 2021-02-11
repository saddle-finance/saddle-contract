pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "openzeppelin-contracts-3.4/proxy/Clones.sol";
import "synthetix/contracts/interfaces/IAddressResolver.sol";
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
contract Bridge is Ownable, ERC721 {
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
        uint256 itemId
    );
    event SynthToToken(
        address indexed requester,
        ISwap swapPool,
        IERC20 synthFrom,
        uint256 synthFromInAmount,
        uint256 itemId
    );
    event TokenToToken(
        address indexed requester,
        ISwap[2] swapPools,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
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
    mapping(uint256 => PendingSynthSwap) public pendingSynthSwaps;
    mapping(uint256 => PendingSynthToTokenSwap) public pendingSynthToTokenSwaps;
    uint256 public pendingSwapsLength;

    enum PendingSwapType {Null, TokenToSynth, SynthToToken, TokenToToken}
    enum PendingSwapState {
        Waiting,
        ReadyToSettle,
        Settled,
        PartiallyCompleted,
        Completed
    }

    uint8 private PENDING_SWAP_STATE_LENGTH = 5;
    mapping(uint256 => uint8) private pendingSwapTypeAndState;

    // MAPPINGS FOR STORING SYNTH INFO OF GIVEN POOL
    // Maps swap address to its index of the supported synth + 1
    mapping(address => uint8) private synthIndexesPlusOne;
    // Maps swap address to the address of the supported synth
    mapping(address => address) private synthAddresses;
    // Maps swap address to the bytes32 key of the supported synth
    mapping(address => bytes32) private synthKeys;

    // Structs holding information about pending settlements
    struct PendingSynthSwap {
        SynthSwapper ss;
        bytes32 synthKey;
    }

    struct PendingSynthToTokenSwap {
        SynthSwapper ss;
        bytes32 synthKey;
        ISwap swap;
        uint8 tokenToIndex;
    }

    constructor(string memory name_, string memory symbol_)
        public
        ERC721(name_, symbol_)
    {
        EXCHANGER = IExchanger(SYNTHETIX_RESOLVER.getAddress(EXCHANGER_NAME));
        SYNTH_SWAPPER_MASTER = address(new SynthSwapper());
    }

    function maxSecsLeftInWaitingPeriod(uint256 itemId)
        external
        view
        returns (uint256)
    {
        PendingSynthSwap memory pss = pendingSynthSwaps[itemId];
        address synthSwapper;
        bytes32 synthKey;

        if (address(pss.ss) != address(0)) {
            synthSwapper = address(pss.ss);
            synthKey = pss.synthKey;
        } else {
            PendingSynthToTokenSwap memory pstts =
                pendingSynthToTokenSwaps[itemId];
            synthSwapper = address(pstts.ss);
            synthKey = pstts.synthKey;
        }

        return EXCHANGER.maxSecsLeftInWaitingPeriod(synthSwapper, synthKey);
    }

    function getProxyAddressFromTargetSynthKey(bytes32 synthKey)
        public
        view
        returns (IERC20)
    {
        return IERC20(Target(SYNTHETIX_RESOLVER.getSynth(synthKey)).proxy());
    }

    function _getPendingSwapTypeAndState(uint256 itemId)
        internal
        view
        returns (PendingSwapType, PendingSwapState)
    {
        uint8 typeAndState = pendingSwapTypeAndState[itemId];
        return (
            PendingSwapType(typeAndState / PENDING_SWAP_STATE_LENGTH),
            PendingSwapState(typeAndState % PENDING_SWAP_STATE_LENGTH)
        );
    }

    function getPendingSwapTypeAndState(uint256 itemId)
        external
        view
        returns (PendingSwapType, PendingSwapState)
    {
        (PendingSwapType swapType, PendingSwapState swapState) =
            _getPendingSwapTypeAndState(itemId);
        require(swapType != PendingSwapType.Null, "invalid itemId");

        SynthSwapper synthSwapper;
        bytes32 synthKey;

        if (swapType == PendingSwapType.TokenToSynth) {
            synthSwapper = pendingSynthSwaps[itemId].ss;
            synthKey = pendingSynthSwaps[itemId].synthKey;
        } else {
            synthSwapper = pendingSynthToTokenSwaps[itemId].ss;
            synthKey = pendingSynthToTokenSwaps[itemId].synthKey;
        }

        if (
            swapState == PendingSwapState.Waiting &&
            EXCHANGER.maxSecsLeftInWaitingPeriod(
                address(synthSwapper),
                synthKey
            ) ==
            0
        ) {
            swapState = PendingSwapState.ReadyToSettle;
        }
        return (swapType, swapState);
    }

    function _setPendingSwapType(
        uint256 itemId,
        PendingSwapType pendingSwapType
    ) internal {
        pendingSwapTypeAndState[itemId] =
            uint8(pendingSwapType) *
            PENDING_SWAP_STATE_LENGTH;
    }

    function _setPendingSwapState(
        uint256 itemId,
        PendingSwapState pendingSwapState
    ) internal {
        pendingSwapTypeAndState[itemId] =
            (pendingSwapTypeAndState[itemId] / PENDING_SWAP_STATE_LENGTH) *
            PENDING_SWAP_STATE_LENGTH +
            uint8(pendingSwapState);
    }

    // Settles the synth only.
    function _settle(address synthOwner, bytes32 synthKey) internal {
        require(
            EXCHANGER.maxSecsLeftInWaitingPeriod(synthOwner, synthKey) == 0,
            "synth waiting period is ongoing"
        );

        // Settle synth
        EXCHANGER.settle(synthOwner, synthKey);
    }

    function withdraw(uint256 itemId, uint256 amount) external {
        address nftOwner = ownerOf(itemId);
        require(nftOwner == msg.sender, "not owner");
        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType > PendingSwapType.TokenToSynth, "invalid itemId");
        PendingSynthToTokenSwap memory pstts = pendingSynthToTokenSwaps[itemId];
        _settle(address(pstts.ss), pstts.synthKey);

        IERC20 synth = getProxyAddressFromTargetSynthKey(pstts.synthKey);
        pstts.ss.withdraw(synth, nftOwner, amount);

        if (synth.balanceOf(address(pstts.ss)) == 0) {
            _setPendingSwapState(itemId, PendingSwapState.Completed);
            _burn(itemId);
        } else {
            _setPendingSwapState(itemId, PendingSwapState.PartiallyCompleted);
        }
    }

    function completeToSynth(uint256 itemId) external {
        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType == PendingSwapType.TokenToSynth, "invalid itemId");

        PendingSynthSwap memory pss = pendingSynthSwaps[itemId];
        _settle(address(pss.ss), pss.synthKey);

        IERC20 synth = getProxyAddressFromTargetSynthKey(pss.synthKey);

        // After settlement, withdraw the synth and send it to the recipient
        pss.ss.withdraw(
            synth,
            ownerOf(itemId),
            synth.balanceOf(address(pss.ss))
        );

        // Mark state as complete
        _setPendingSwapState(itemId, PendingSwapState.Completed);
        _burn(itemId);
    }

    function calcCompleteToToken(uint256 itemId, uint256 swapAmount)
        external
        view
        returns (uint256)
    {
        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType > PendingSwapType.TokenToSynth, "invalid itemId");

        PendingSynthToTokenSwap memory pstts = pendingSynthToTokenSwaps[itemId];
        return
            pstts.swap.calculateSwap(
                _getSynthIndex(pstts.swap),
                pstts.tokenToIndex,
                swapAmount
            );
    }

    function completeToToken(
        uint256 itemId,
        uint256 swapAmount,
        uint256 minAmount,
        uint256 deadline
    ) external {
        address nftOwner = ownerOf(itemId);
        require(msg.sender == nftOwner, "must own itemId");

        (PendingSwapType swapType, ) = _getPendingSwapTypeAndState(itemId);
        require(swapType > PendingSwapType.TokenToSynth, "invalid itemId");

        PendingSynthToTokenSwap memory pstts = pendingSynthToTokenSwaps[itemId];

        _settle(address(pstts.ss), pstts.synthKey);
        IERC20 synth = getProxyAddressFromTargetSynthKey(pstts.synthKey);
        uint256 synthBalance = synth.balanceOf(address(pstts.ss));
        // Try swapping the synth to the desired token via the stored swap pool contract
        // If the external call succeeds, send the token to the owner of token with itemId.
        pstts.ss.swapSynthToToken(
            pstts.swap,
            _getSynthIndex(pstts.swap),
            pstts.tokenToIndex,
            swapAmount,
            minAmount,
            deadline,
            nftOwner
        );

        if (swapAmount == synthBalance) {
            _setPendingSwapState(itemId, PendingSwapState.Completed);
            _burn(itemId);
        } else {
            _setPendingSwapState(itemId, PendingSwapState.PartiallyCompleted);
        }
    }

    // Add the given pending synth settlement struct to the list
    function _addToPendingSynthSwapList(PendingSynthSwap memory pss)
        internal
        returns (uint256)
    {
        require(
            pendingSwapsLength < MAX_UINT256,
            "pendingSwapsLength reached max size"
        );
        pendingSynthSwaps[pendingSwapsLength] = pss;
        return pendingSwapsLength++;
    }

    // Add the given pending synth to token settlement struct to the list
    function _addToPendingSynthToTokenSwapList(
        PendingSynthToTokenSwap memory pstts
    ) internal returns (uint256) {
        require(
            pendingSwapsLength < MAX_UINT256,
            "pendingSwapsLength reached max size"
        );
        pendingSynthToTokenSwaps[pendingSwapsLength] = pstts;
        return pendingSwapsLength++;
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
        uint256 minAmount
    ) external returns (uint256) {
        // Transfer token from msg.sender
        IERC20 tokenFrom = swap.getToken(tokenFromIndex); // revert when token not found in swap pool
        tokenFrom.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        tokenInAmount = tokenFrom.balanceOf(address(this));
        tokenFrom.approve(address(swap), tokenInAmount);

        uint256 mediumSynthAmount =
            swap.swap(
                tokenFromIndex,
                _getSynthIndex(swap),
                tokenInAmount,
                0,
                block.timestamp
            );

        SynthSwapper synthSwapper =
            SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
        IERC20(_getSynthAddress(swap)).transfer(
            address(synthSwapper),
            mediumSynthAmount
        );

        // Swap synths via Synthetix network
        require(
            synthSwapper.swapSynth(
                _getSynthKey(swap),
                mediumSynthAmount,
                synthOutKey
            ) >= minAmount,
            "minAmount not reached"
        );

        // Add the synthswapper to the pending settlement list
        uint256 itemId =
            _addToPendingSynthSwapList(
                PendingSynthSwap(synthSwapper, synthOutKey)
            );
        _setPendingSwapType(itemId, PendingSwapType.TokenToSynth);

        // Mint an ERC721 token that represents ownership of the pending synth settlement to msg.sender
        _mint(msg.sender, itemId);

        // Emit TokenToSynth event with relevant data
        emit TokenToSynth(msg.sender, swap, tokenFrom, tokenInAmount, itemId);

        return (itemId);
    }

    function calcSynthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount
    ) external view returns (uint256, uint256) {
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

        return (
            expectedMediumSynthAmount,
            swap.calculateSwap(
                mediumSynthIndex,
                tokenToIndex,
                expectedMediumSynthAmount
            )
        );
    }

    // Swaps any synth to a token that Saddle's pools support
    function synthToToken(
        ISwap swap,
        bytes32 synthInKey,
        uint8 tokenToIndex,
        uint256 synthInAmount,
        uint256 minMediumSynthAmount
    ) external returns (uint256) {
        bytes32 mediumSynthKey = _getSynthKey(swap);
        require(
            synthInKey != mediumSynthKey,
            "synth is supported via normal swap"
        );

        // Receive synth from the user
        IERC20 synthFrom = getProxyAddressFromTargetSynthKey(synthInKey);
        synthFrom.safeTransferFrom(msg.sender, address(this), synthInAmount);

        // Create a new SynthSwapper contract then initiate a swap to the medium synth supported by the swap pool
        SynthSwapper synthSwapper =
            SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
        synthFrom.transfer(address(synthSwapper), synthInAmount);
        require(
            synthSwapper.swapSynth(synthInKey, synthInAmount, mediumSynthKey) >=
                minMediumSynthAmount,
            "minMediumSynthAmount not reached"
        );

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId =
            _addToPendingSynthToTokenSwapList(
                PendingSynthToTokenSwap(
                    synthSwapper,
                    mediumSynthKey,
                    swap,
                    tokenToIndex
                )
            );
        _setPendingSwapType(itemId, PendingSwapType.SynthToToken);

        // Mint an ERC721 token that represents ownership of the pending synth to token settlement to msg.sender
        _mint(msg.sender, itemId);

        // Emit SynthToToken event with relevant data
        emit SynthToToken(msg.sender, swap, synthFrom, synthInAmount, itemId);

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

        uint256 mediumSynthAmount =
            exchangeRates.effectiveValue(
                _getSynthKey(swaps[0]),
                firstSynthAmount,
                _getSynthKey(swaps[1])
            );

        return (
            mediumSynthAmount,
            swaps[1].calculateSwap(
                _getSynthIndex(swaps[1]),
                tokenToIndex,
                mediumSynthAmount
            )
        );
    }

    // Swaps a token from one pool to one in another using the Synthetix network as the bridging exchange
    function tokenToToken(
        ISwap[2] calldata swaps,
        uint8 tokenFromIndex,
        uint8 tokenToIndex,
        uint256 tokenFromAmount,
        uint256 minMediumSynthAmount
    ) external returns (uint256) {
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
                0,
                block.timestamp
            );

        IERC20 synthFrom = IERC20(_getSynthAddress(swap));
        SynthSwapper synthSwapper =
            SynthSwapper(Clones.clone(SYNTH_SWAPPER_MASTER));
        bytes32 mediumSynthKey = _getSynthKey(swaps[1]);
        synthFrom.transfer(address(synthSwapper), firstSynthAmount);
        require(
            synthSwapper.swapSynth(
                _getSynthKey(swap),
                firstSynthAmount,
                mediumSynthKey
            ) >= minMediumSynthAmount,
            "minMediumSynthAmount not reached"
        );

        // Add the synthswapper to the pending synth to token settlement list
        uint256 itemId =
            _addToPendingSynthToTokenSwapList(
                PendingSynthToTokenSwap(
                    synthSwapper,
                    mediumSynthKey,
                    swaps[1],
                    tokenToIndex
                )
            );
        _setPendingSwapType(itemId, PendingSwapType.TokenToToken);
        _mint(msg.sender, itemId);

        // Emit TokenToToken event with relevant data
        emit TokenToToken(
            msg.sender,
            swaps,
            tokenFromIndex,
            tokenToIndex,
            tokenFromAmount,
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

    fallback() external payable {}
}
