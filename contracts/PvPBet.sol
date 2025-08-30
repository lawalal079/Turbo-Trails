// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface ITurboItems1155 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

interface ITurboItemsPermittable {
    function transferFromWithPermit(
        address owner_,
        address to,
        uint256 id,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// PvPBet (UUPS upgradeable)
/// - Escrows ERC1155 items for wagered PvP rounds.
/// - Gasless stake via TurboItems.transferFromWithPermit using user signatures.
/// - Per-room cap: max 5 stakes per player.
/// - Backend-only settlement pays the winner by transferring escrowed items.
contract PvPBet is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Room {
        address playerA;
        address playerB;
        uint64 expiresAt;          // room expiry for FFP
        bool exists;
    }

    struct RoundEscrow {
        uint256 itemId;
        uint256 qtyA;
        uint256 qtyB;
        bool settled;
    }

    ITurboItems1155 public items;
    ITurboItemsPermittable public itemsPermit;

    address public backend; // server EOA that reports results
    uint8 public constant MAX_STAKES_PER_PLAYER = 5;

    // roomId => Room
    mapping(bytes32 => Room) public rooms;
    // roomId => stakes per player
    mapping(bytes32 => mapping(address => uint8)) public stakesPerPlayer;
    // roomId => current round index (starts at 0)
    mapping(bytes32 => uint256) public roundIndex;
    // roomId => round => escrow
    mapping(bytes32 => mapping(uint256 => RoundEscrow)) public escrows;

    event RoomCreated(bytes32 indexed roomId, address indexed playerA, address indexed playerB, uint64 expiresAt);
    event Staked(bytes32 indexed roomId, uint256 indexed round, address indexed player, uint256 itemId, uint256 qty);
    event ResultReported(bytes32 indexed roomId, uint256 indexed round, address indexed winner, uint256 itemId, uint256 qtyTotal);
    event Refunded(bytes32 indexed roomId, uint256 indexed round, uint256 itemId, uint256 qtyA, uint256 qtyB);
    event BackendUpdated(address indexed backend);

    function initialize(address items_, address backend_, address owner_) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        items = ITurboItems1155(items_);
        itemsPermit = ITurboItemsPermittable(items_);
        backend = backend_;
        _transferOwnership(owner_);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setBackend(address b) external onlyOwner {
        backend = b;
        emit BackendUpdated(b);
    }

    /// Create a room with both players fixed; playerA is the creator, playerB is expected opponent.
    function createRoom(bytes32 roomId, address playerB, uint64 expiresAt) external {
        require(!rooms[roomId].exists, "room exists");
        require(playerB != address(0) && playerB != msg.sender, "bad opponent");
        rooms[roomId] = Room({playerA: msg.sender, playerB: playerB, expiresAt: expiresAt, exists: true});
        emit RoomCreated(roomId, msg.sender, playerB, expiresAt);
    }

    /// Gasless stake using EIP-712 signature held by backend.
    function stakeWithPermit(
        bytes32 roomId,
        uint256 itemId,
        uint256 qty,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        Room memory rm = rooms[roomId];
        require(rm.exists, "no room");
        require(block.timestamp <= rm.expiresAt, "room expired");
        require(msg.sender == rm.playerA || msg.sender == rm.playerB, "not a player");
        require(qty > 0, "qty=0");
        require(stakesPerPlayer[roomId][msg.sender] < MAX_STAKES_PER_PLAYER, "stake cap reached");

        uint256 idx = roundIndex[roomId];
        RoundEscrow storage e = escrows[roomId][idx];

        // First stake in round sets itemId
        if (e.itemId == 0) {
            e.itemId = itemId;
        } else {
            require(e.itemId == itemId, "mismatch itemId");
        }
        require(!e.settled, "round settled");

        // Pull items into escrow contract via permit (gasless for user)
        itemsPermit.transferFromWithPermit(msg.sender, address(this), itemId, qty, deadline, v, r, s);

        if (msg.sender == rm.playerA) {
            e.qtyA += qty;
        } else {
            e.qtyB += qty;
        }

        stakesPerPlayer[roomId][msg.sender] += 1;
        emit Staked(roomId, idx, msg.sender, itemId, qty);
    }

    /// Backend reports result and winner takes all escrowed items for current round.
    function reportResult(bytes32 roomId, address winner) external {
        require(msg.sender == backend, "only backend");
        Room memory rm = rooms[roomId];
        require(rm.exists, "no room");
        require(winner == rm.playerA || winner == rm.playerB, "not a player");

        uint256 idx = roundIndex[roomId];
        RoundEscrow storage e = escrows[roomId][idx];
        require(!e.settled, "already settled");

        uint256 total = e.qtyA + e.qtyB;
        if (total > 0) {
            // Transfer escrowed items to winner
            items.safeTransferFrom(address(this), winner, e.itemId, total, "");
        }
        e.settled = true;
        emit ResultReported(roomId, idx, winner, e.itemId, total);

        // Start next round
        roundIndex[roomId] = idx + 1;
    }

    /// Refund escrow if room expired and current round not settled.
    function cancelIfExpired(bytes32 roomId) external {
        Room memory rm = rooms[roomId];
        require(rm.exists, "no room");
        require(block.timestamp > rm.expiresAt, "not expired");

        uint256 idx = roundIndex[roomId];
        RoundEscrow storage e = escrows[roomId][idx];
        require(!e.settled, "settled");

        if (e.qtyA > 0) {
            items.safeTransferFrom(address(this), rm.playerA, e.itemId, e.qtyA, "");
        }
        if (e.qtyB > 0) {
            items.safeTransferFrom(address(this), rm.playerB, e.itemId, e.qtyB, "");
        }
        e.settled = true;
        emit Refunded(roomId, idx, e.itemId, e.qtyA, e.qtyB);
        // round index stays; players can recreate a new room if needed
    }
}
