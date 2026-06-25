// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Voting
 * @notice Permissioned voting contract for the SecureVote system.
 *         Stores vote hashes keyed by nullifiers to prevent double voting.
 *         Only the deployer (election authority) can record votes.
 */
contract Voting {
    address public immutable authority;
    bool public electionFinalized;

    struct VoteRecord {
        bytes32 voteHash;
        uint256 timestamp;
        bool exists;
    }

    // nullifier => VoteRecord (nullifier prevents double voting)
    mapping(bytes32 => VoteRecord) private voteRecords;

    // All nullifiers in order (for audit enumeration)
    bytes32[] private nullifiers;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event VoteRecorded(
        bytes32 indexed nullifier,
        bytes32 voteHash,
        uint256 timestamp
    );

    event ElectionFinalized(uint256 totalVotes, uint256 timestamp);

    // ----------------------------------------------------------------
    // Modifiers
    // ----------------------------------------------------------------

    modifier onlyAuthority() {
        require(msg.sender == authority, "Not authorized");
        _;
    }

    modifier electionOpen() {
        require(!electionFinalized, "Election is finalized");
        _;
    }

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor() {
        authority = msg.sender;
        electionFinalized = false;
    }

    // ----------------------------------------------------------------
    // State-changing functions
    // ----------------------------------------------------------------

    /**
     * @notice Record a vote on-chain.
     * @param nullifier  A unique per-voter token (SHA-256 of voterToken+salt)
     *                   that prevents double voting without revealing voter identity.
     * @param voteHash   The SHA-256 hash of the full vote payload (candidateId + nonce + timestamp).
     */
    function recordVote(bytes32 nullifier, bytes32 voteHash)
        external
        onlyAuthority
        electionOpen
    {
        require(!voteRecords[nullifier].exists, "Nullifier already used");
        require(voteHash != bytes32(0), "Invalid vote hash");

        voteRecords[nullifier] = VoteRecord({
            voteHash: voteHash,
            timestamp: block.timestamp,
            exists: true
        });

        nullifiers.push(nullifier);

        emit VoteRecorded(nullifier, voteHash, block.timestamp);
    }

    /**
     * @notice Finalize the election — no more votes can be recorded after this.
     */
    function finalizeElection() external onlyAuthority {
        require(!electionFinalized, "Already finalized");
        electionFinalized = true;
        emit ElectionFinalized(nullifiers.length, block.timestamp);
    }

    // ----------------------------------------------------------------
    // View functions
    // ----------------------------------------------------------------

    /**
     * @notice Verify a vote by its nullifier.
     * @return voteHash  The recorded vote hash (bytes32(0) if not found).
     * @return timestamp Block timestamp when the vote was recorded.
     * @return found     Whether the nullifier has a recorded vote.
     */
    function verifyVote(bytes32 nullifier)
        external
        view
        returns (bytes32 voteHash, uint256 timestamp, bool found)
    {
        VoteRecord storage r = voteRecords[nullifier];
        return (r.voteHash, r.timestamp, r.exists);
    }

    /**
     * @notice Check whether a nullifier has been used.
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return voteRecords[nullifier].exists;
    }

    /**
     * @notice Total number of votes recorded on-chain.
     */
    function totalVotes() external view returns (uint256) {
        return nullifiers.length;
    }

    /**
     * @notice Get a nullifier by index (for audit enumeration).
     */
    function getNullifierAt(uint256 index) external view returns (bytes32) {
        require(index < nullifiers.length, "Index out of bounds");
        return nullifiers[index];
    }
}
