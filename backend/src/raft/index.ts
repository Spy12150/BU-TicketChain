/**
 * Raft Consensus Module
 * 
 * Implements leader election, log replication, and commit consensus.
 * Reference: https://raft.github.io/raft.pdf
 */

// ==================== Public Interfaces ====================

export interface RaftConfig {
  nodeId: string;
  peers: string[];             // Peer node URLs
  electionTimeout: number;     // ms
  heartbeatInterval: number;   // ms
}

export interface RaftState {
  currentTerm: number;         // Latest term seen (persisted)
  votedFor: string | null;     // Vote record in current term (persisted)
  log: LogEntry[];             // Log entries (persisted)
  commitIndex: number;         // Highest committed index
  lastApplied: number;         // Highest applied to state machine
}

export interface LogEntry {
  term: number;
  index: number;
  command: Command;
}

export type Command =
  | { type: "TICKET_PURCHASE"; data: { eventId: string; userId: string; txHash: string } }
  | { type: "TICKET_TRANSFER"; data: { ticketId: string; fromUser: string; toUser: string; txHash: string } }
  | { type: "TICKET_REFUND"; data: { ticketId: string; userId: string; txHash: string } }
  | { type: "EVENT_CREATE"; data: { eventId: string; name: string } };

export enum NodeRole {
  FOLLOWER = "FOLLOWER",
  CANDIDATE = "CANDIDATE",
  LEADER = "LEADER",
}

// ==================== RPC Types ====================

interface RequestVoteRequest {
  term: number;
  candidateId: string;
  lastLogIndex: number;        // For log up-to-date check
  lastLogTerm: number;
}

interface RequestVoteResponse {
  term: number;
  voteGranted: boolean;
}

interface AppendEntriesRequest {
  term: number;
  leaderId: string;
  prevLogIndex: number;        // For log consistency check
  prevLogTerm: number;
  entries: LogEntry[];         // Empty = heartbeat
  leaderCommit: number;
}

interface AppendEntriesResponse {
  term: number;
  success: boolean;
  matchIndex?: number;
}

// ==================== RaftNode Implementation ====================

export class RaftNode {
  private config: RaftConfig;
  private state: RaftState;
  private role: NodeRole;
  private leaderId: string | null;
  
  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  
  // Leader state: track replication progress for each peer
  private nextIndex: Record<string, number> = {};
  private matchIndex: Record<string, number> = {};
  
  // Pending client requests waiting for commit
  private pendingRequests: Record<number, {
    resolve: (result: { success: boolean; index?: number }) => void;
    reject: (error: Error) => void;
  }> = {};

  public onCommandApplied: ((entry: LogEntry) => void) | null = null;
  public onLeaderElected: ((leaderId: string) => void) | null = null;

  constructor(config: RaftConfig) {
    this.config = config;
    this.role = NodeRole.FOLLOWER;
    this.leaderId = null;
    this.state = {
      currentTerm: 0,
      votedFor: null,
      log: [],
      commitIndex: 0,
      lastApplied: 0,
    };
    console.log(`[RAFT] Node ${config.nodeId} initialized as FOLLOWER`);
  }

  // ==================== Public API ====================

  async start(): Promise<void> {
    console.log(`[RAFT] Node ${this.config.nodeId} starting...`);
    this.resetElectionTimer();
    console.log(`[RAFT] Node ${this.config.nodeId} started`);
  }

  async stop(): Promise<void> {
    console.log(`[RAFT] Node ${this.config.nodeId} stopping...`);
    this.clearElectionTimer();
    this.clearHeartbeatTimer();
    
    // Reject all pending requests
    for (const key of Object.keys(this.pendingRequests)) {
      const idx = parseInt(key, 10);
      const pending = this.pendingRequests[idx];
      if (pending) {
        pending.reject(new Error("Node stopped"));
        delete this.pendingRequests[idx];
      }
    }
  }

  // Submit command to cluster (leader only)
  async submitCommand(command: Command): Promise<{ success: boolean; index?: number }> {
    console.log(`[RAFT] Command submitted: ${command.type}`);

    if (this.role !== NodeRole.LEADER) {
      if (this.leaderId) {
        throw new Error(`Not leader. Current leader: ${this.leaderId}`);
      }
      throw new Error("No leader available");
    }

    // Append to local log
    const entry: LogEntry = {
      term: this.state.currentTerm,
      index: this.state.log.length + 1,
      command,
    };
    this.state.log.push(entry);
    console.log(`[RAFT] Leader ${this.config.nodeId} appended entry at index ${entry.index}`);

    // Single node: commit immediately
    if (this.config.peers.length === 0) {
      this.state.commitIndex = entry.index;
      this.applyCommittedEntries();
      return { success: true, index: entry.index };
    }

    // Multi-node: wait for majority replication
    return new Promise((resolve, reject) => {
      this.pendingRequests[entry.index] = { resolve, reject };
      this.replicateLog();
      
      setTimeout(() => {
        const pending = this.pendingRequests[entry.index];
        if (pending) {
          delete this.pendingRequests[entry.index];
          reject(new Error("Replication timeout"));
        }
      }, this.config.electionTimeout * 3);
    });
  }

  getStatus(): {
    nodeId: string;
    role: NodeRole;
    term: number;
    leaderId: string | null;
    logLength: number;
    commitIndex: number;
  } {
    return {
      nodeId: this.config.nodeId,
      role: this.role,
      term: this.state.currentTerm,
      leaderId: this.role === NodeRole.LEADER ? this.config.nodeId : this.leaderId,
      logLength: this.state.log.length,
      commitIndex: this.state.commitIndex,
    };
  }

  // ==================== RPC Handlers ====================

  // Handle vote request from candidate
  handleRequestVote(request: RequestVoteRequest): RequestVoteResponse {
    // Reject stale term
    if (request.term < this.state.currentTerm) {
      return { term: this.state.currentTerm, voteGranted: false };
    }

    // Step down if higher term discovered
    if (request.term > this.state.currentTerm) {
      this.becomeFollower(request.term);
    }

    // Grant vote if: (1) haven't voted or voted for this candidate, AND (2) candidate's log is up-to-date
    const canVote = 
      (this.state.votedFor === null || this.state.votedFor === request.candidateId) &&
      this.isLogUpToDate(request.lastLogIndex, request.lastLogTerm);

    if (canVote) {
      this.state.votedFor = request.candidateId;
      this.resetElectionTimer();
      return { term: this.state.currentTerm, voteGranted: true };
    }

    return { term: this.state.currentTerm, voteGranted: false };
  }

  // Handle log replication / heartbeat from leader
  handleAppendEntries(request: AppendEntriesRequest): AppendEntriesResponse {
    // Reject stale term
    if (request.term < this.state.currentTerm) {
      return { term: this.state.currentTerm, success: false };
    }

    // Recognize leader
    if (request.term >= this.state.currentTerm) {
      this.becomeFollower(request.term);
      this.leaderId = request.leaderId;
    }

    this.resetElectionTimer();

    // Log consistency check: verify prevLogIndex/prevLogTerm match
    if (request.prevLogIndex > 0) {
      if (request.prevLogIndex > this.state.log.length) {
        return { term: this.state.currentTerm, success: false };
      }
      
      const prevEntry = this.state.log[request.prevLogIndex - 1];
      if (prevEntry.term !== request.prevLogTerm) {
        // Delete conflicting entries
        this.state.log = this.state.log.slice(0, request.prevLogIndex - 1);
        return { term: this.state.currentTerm, success: false };
      }
    }

    // Append new entries
    if (request.entries.length > 0) {
      this.state.log = this.state.log.slice(0, request.prevLogIndex);
      this.state.log.push(...request.entries);
    }

    // Update commit index from leader
    if (request.leaderCommit > this.state.commitIndex) {
      this.state.commitIndex = Math.min(request.leaderCommit, this.state.log.length);
      this.applyCommittedEntries();
    }

    return { term: this.state.currentTerm, success: true, matchIndex: this.state.log.length };
  }

  // ==================== Election ====================

  private async startElection(): Promise<void> {
    this.role = NodeRole.CANDIDATE;
    this.state.currentTerm++;
    this.state.votedFor = this.config.nodeId;  // Vote for self
    this.leaderId = null;

    console.log(`[RAFT] Node ${this.config.nodeId} starting election for term ${this.state.currentTerm}`);

    let votesReceived = 1;  // Self vote
    const votesNeeded = Math.floor((this.config.peers.length + 1) / 2) + 1;  // Majority

    // Single node: become leader immediately
    if (this.config.peers.length === 0) {
      this.becomeLeader();
      return;
    }

    const lastLogIndex = this.state.log.length;
    const lastLogTerm = lastLogIndex > 0 ? this.state.log[lastLogIndex - 1].term : 0;
    const currentTerm = this.state.currentTerm;

    const voteRequest: RequestVoteRequest = {
      term: currentTerm,
      candidateId: this.config.nodeId,
      lastLogIndex,
      lastLogTerm,
    };

    // Request votes from all peers in parallel
    const votePromises = this.config.peers.map(async (peer) => {
      try {
        const response = await this.sendRPC<RequestVoteResponse>(peer, "requestVote", voteRequest);
        
        // Check if still candidate in same term
        if (this.role !== NodeRole.CANDIDATE || this.state.currentTerm !== currentTerm) {
          return;
        }

        if (response.term > this.state.currentTerm) {
          this.becomeFollower(response.term);
          return;
        }

        if (response.voteGranted) {
          votesReceived++;
          if (votesReceived >= votesNeeded && this.role === NodeRole.CANDIDATE) {
            this.becomeLeader();
          }
        }
      } catch {
        // Ignore network errors
      }
    });

    await Promise.allSettled(votePromises);

    // If still candidate, restart election timer for next attempt
    if (this.role === NodeRole.CANDIDATE) {
      this.resetElectionTimer();
    }
  }

  private becomeLeader(): void {
    if (this.role === NodeRole.LEADER) return;

    console.log(`[RAFT] Node ${this.config.nodeId} became LEADER for term ${this.state.currentTerm}`);
    
    this.role = NodeRole.LEADER;
    this.leaderId = this.config.nodeId;
    this.clearElectionTimer();

    // Initialize leader state for each peer
    const lastLogIndex = this.state.log.length;
    for (const peer of this.config.peers) {
      this.nextIndex[peer] = lastLogIndex + 1;
      this.matchIndex[peer] = 0;
    }

    // Start heartbeat immediately
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.config.heartbeatInterval);

    if (this.onLeaderElected) {
      this.onLeaderElected(this.config.nodeId);
    }
  }

  private becomeFollower(term: number): void {
    const wasLeader = this.role === NodeRole.LEADER;
    
    this.role = NodeRole.FOLLOWER;
    this.state.currentTerm = term;
    this.state.votedFor = null;
    
    this.clearHeartbeatTimer();
    this.resetElectionTimer();

    if (wasLeader) {
      console.log(`[RAFT] Node ${this.config.nodeId} stepped down from LEADER to FOLLOWER`);
      // Reject pending requests since no longer leader
      for (const key of Object.keys(this.pendingRequests)) {
        const idx = parseInt(key, 10);
        const pending = this.pendingRequests[idx];
        if (pending) {
          pending.reject(new Error("No longer leader"));
          delete this.pendingRequests[idx];
        }
      }
    }
  }

  // ==================== Log Replication ====================

  private sendHeartbeat(): void {
    if (this.role !== NodeRole.LEADER) return;
    this.replicateLog();
  }

  private replicateLog(): void {
    if (this.role !== NodeRole.LEADER) return;
    for (const peer of this.config.peers) {
      this.replicateToPeer(peer);
    }
  }

  private async replicateToPeer(peer: string): Promise<void> {
    const nextIdx = this.nextIndex[peer] || 1;
    const prevLogIndex = nextIdx - 1;
    const prevLogTerm = prevLogIndex > 0 ? (this.state.log[prevLogIndex - 1]?.term ?? 0) : 0;
    const entries = this.state.log.slice(nextIdx - 1);

    const request: AppendEntriesRequest = {
      term: this.state.currentTerm,
      leaderId: this.config.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.state.commitIndex,
    };

    try {
      const response = await this.sendRPC<AppendEntriesResponse>(peer, "appendEntries", request);

      if (response.term > this.state.currentTerm) {
        this.becomeFollower(response.term);
        return;
      }

      if (this.role !== NodeRole.LEADER) return;

      if (response.success) {
        // Update progress for this peer
        const newMatchIndex = response.matchIndex ?? (prevLogIndex + entries.length);
        this.nextIndex[peer] = newMatchIndex + 1;
        this.matchIndex[peer] = newMatchIndex;
        this.tryCommit();
      } else {
        // Decrement nextIndex and retry (log inconsistency)
        this.nextIndex[peer] = Math.max(1, nextIdx - 1);
        this.replicateToPeer(peer);
      }
    } catch {
      // Ignore network errors, will retry on next heartbeat
    }
  }

  // Check if any new entries can be committed (majority replicated)
  private tryCommit(): void {
    if (this.role !== NodeRole.LEADER) return;

    // Find highest N where majority have matchIndex >= N
    for (let n = this.state.log.length; n > this.state.commitIndex; n--) {
      // Only commit entries from current term (Raft safety guarantee)
      if (this.state.log[n - 1].term !== this.state.currentTerm) continue;

      let count = 1;  // Count self
      for (const peer of this.config.peers) {
        if ((this.matchIndex[peer] ?? 0) >= n) count++;
      }

      const majority = Math.floor((this.config.peers.length + 1) / 2) + 1;
      if (count >= majority) {
        this.state.commitIndex = n;
        this.applyCommittedEntries();
        break;
      }
    }
  }

  // Apply committed entries to state machine
  private applyCommittedEntries(): void {
    while (this.state.lastApplied < this.state.commitIndex) {
      this.state.lastApplied++;
      const entry = this.state.log[this.state.lastApplied - 1];
      
      if (this.onCommandApplied) {
        this.onCommandApplied(entry);
      }

      // Resolve pending client request
      const pending = this.pendingRequests[entry.index];
      if (pending) {
        pending.resolve({ success: true, index: entry.index });
        delete this.pendingRequests[entry.index];
      }
    }
  }

  // ==================== Timer Management ====================

  private resetElectionTimer(): void {
    this.clearElectionTimer();
    // Randomize timeout to prevent split votes
    const timeout = this.config.electionTimeout + Math.random() * this.config.electionTimeout;
    this.electionTimer = setTimeout(() => {
      if (this.role !== NodeRole.LEADER) {
        this.startElection();
      }
    }, timeout);
  }

  private clearElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ==================== Helper Methods ====================

  // Check if candidate's log is at least as up-to-date as ours
  // Raft determines "up-to-date" by comparing last entry's term and index
  private isLogUpToDate(lastLogIndex: number, lastLogTerm: number): boolean {
    const ourLastIndex = this.state.log.length;
    const ourLastTerm = ourLastIndex > 0 ? this.state.log[ourLastIndex - 1].term : 0;

    // Higher term wins; if same term, longer log wins
    if (lastLogTerm !== ourLastTerm) {
      return lastLogTerm > ourLastTerm;
    }
    return lastLogIndex >= ourLastIndex;
  }

  // Send RPC to peer with timeout
  private async sendRPC<T>(peer: string, method: string, data: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.heartbeatInterval * 3);
    
    try {
      const response = await fetch(`${peer}/raft/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as T;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}

// ==================== Factory Functions ====================

export function createRaftNode(nodeId?: string): RaftNode {
  const config: RaftConfig = {
    nodeId: nodeId || process.env.RAFT_NODE_ID || "node-1",
    peers: (process.env.RAFT_PEERS || "").split(",").filter(Boolean),
    electionTimeout: parseInt(process.env.RAFT_ELECTION_TIMEOUT || "300", 10),
    heartbeatInterval: parseInt(process.env.RAFT_HEARTBEAT_INTERVAL || "100", 10),
  };

  return new RaftNode(config);
}

// Singleton instance
let raftNode: RaftNode | null = null;

export function getRaftNode(): RaftNode {
  if (!raftNode) {
    raftNode = createRaftNode();
  }
  return raftNode;
}
