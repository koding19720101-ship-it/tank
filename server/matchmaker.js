const { Server } = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Matchmaker Server is running!\n");
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Connected clients: socketId -> playerProfile
const connectedClients = new Map();

// Mode-based queues: mode -> Array of { socketId, profile }
const queues = {
  "1v1": [],
  "2v2": [],
  "3v3": [],
};

// Players required per mode (total = both teams)
const MODE_SIZE = { "1v1": 2, "2v2": 4, "3v3": 6 };

// Active game rooms
// roomName -> { players: [{ socketId, team, slotIndex, x, hp }], turnOrder: [socketId,...], turnIndex, started, mode }
const gameRooms = new Map();

// World width used for spawn X calculations
const WORLD_W = 2400;

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  connectedClients.set(socket.id, null);

  const broadcastStats = () => {
    io.emit("online-stats", { onlineCount: connectedClients.size });
  };
  broadcastStats();

  // join-queue: { playerProfile, mode }
  socket.on("join-queue", ({ profile, mode }) => {
    const validMode = MODE_SIZE[mode] ? mode : "1v1";
    console.log(`[queue] ${profile.name} (${socket.id}) joining ${validMode} queue`);
    connectedClients.set(socket.id, profile);

    // Remove from any existing queue first
    for (const m of Object.keys(queues)) {
      queues[m] = queues[m].filter(p => p.socketId !== socket.id);
    }

    queues[validMode].push({ socketId: socket.id, profile, mode: validMode });
    matchPlayers(validMode);
  });

  socket.on("leave-queue", () => {
    for (const m of Object.keys(queues)) {
      queues[m] = queues[m].filter(p => p.socketId !== socket.id);
    }
    socket.emit("queue-left");
  });

  // join-game-room: { roomName, profile }
  socket.on("join-game-room", ({ roomName, profile }) => {
    socket.join(roomName);
    connectedClients.set(socket.id, profile);

    if (!gameRooms.has(roomName)) return;
    const room = gameRooms.get(roomName);

    // Update profile for this socket
    const playerSlot = room.players.find(p => p.socketId === socket.id);
    if (playerSlot) playerSlot.profile = profile;

    room.joinedCount = (room.joinedCount || 0) + 1;
    console.log(`[room] ${socket.id} joined ${roomName} (${room.joinedCount}/${MODE_SIZE[room.mode]})`);

    if (room.joinedCount >= MODE_SIZE[room.mode] && !room.started) {
      room.started = true;
      const seed = Math.random() * 1000;

      // Build players array with full profile info
      const playersForClient = room.players.map(p => ({
        socketId: p.socketId,
        team: p.team,
        slotIndex: p.slotIndex,
        x: p.x,
        hp: 100,
        profile: p.profile,
      }));

      console.log(`[room] Game starting in ${roomName}. Turn order: ${room.turnOrder.join(", ")}`);
      io.to(roomName).emit("game-start", {
        players: playersForClient,
        turnOrder: room.turnOrder,
        activeSocketId: room.turnOrder[0],
        seed,
        mode: room.mode,
      });
    }
  });

  // game-action: relay to all others in room
  socket.on("game-action", ({ roomName, action }) => {
    socket.to(roomName).emit("game-action", action);
  });

  // game-turn-end: advance turn order
  socket.on("game-turn-end", ({ roomName }) => {
    const room = gameRooms.get(roomName);
    if (!room || !room.started) return;

    room.turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
    // Skip dead players
    let attempts = 0;
    while (room.deadSockets && room.deadSockets.has(room.turnOrder[room.turnIndex]) && attempts < room.turnOrder.length) {
      room.turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
      attempts++;
    }

    const nextActiveSocketId = room.turnOrder[room.turnIndex];
    io.to(roomName).emit("game-new-turn", { activeSocketId: nextActiveSocketId });
  });

  // report-player-dead: mark a player as dead
  socket.on("report-player-dead", ({ roomName, deadSocketId }) => {
    const room = gameRooms.get(roomName);
    if (!room) return;
    if (!room.deadSockets) room.deadSockets = new Set();
    room.deadSockets.add(deadSocketId);

    // Check if a team is fully dead
    const deadTeams = new Set();
    for (const p of room.players) {
      if (room.deadSockets.has(p.socketId)) deadTeams.add(p.team);
    }
    const teamCounts = {};
    for (const p of room.players) {
      teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
    }

    for (const [team, count] of Object.entries(teamCounts)) {
      const deadCount = room.players.filter(p => p.team === team && room.deadSockets.has(p.socketId)).length;
      if (deadCount >= count) {
        // This team is fully dead — the other team wins
        const winningTeam = Object.keys(teamCounts).find(t => t !== team);
        room.players.forEach(p => {
          const outcome = p.team === winningTeam ? "victory" : "defeat";
          io.to(p.socketId).emit("game-ended", { reason: outcome });
        });
        gameRooms.delete(roomName);
        return;
      }
    }
  });

  // report-game-end (legacy fallback / 1v1 compat)
  socket.on("report-game-end", ({ roomName, reason }) => {
    const room = gameRooms.get(roomName);
    if (!room) return;
    room.players.forEach(p => {
      const outcome = p.socketId === socket.id
        ? reason
        : reason === "victory" ? "defeat" : reason === "defeat" ? "victory" : reason;
      io.to(p.socketId).emit("game-ended", { reason: outcome });
    });
    gameRooms.delete(roomName);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
    for (const m of Object.keys(queues)) {
      queues[m] = queues[m].filter(p => p.socketId !== socket.id);
    }

    for (const [roomName, room] of gameRooms.entries()) {
      const inRoom = room.players.some(p => p.socketId === socket.id);
      if (inRoom) {
        room.players.forEach(p => {
          if (p.socketId !== socket.id) {
            io.to(p.socketId).emit("game-ended", { reason: "opponent_left" });
          }
        });
        gameRooms.delete(roomName);
      }
    }

    broadcastStats();
  });
});

// Matchmaker algorithm
function matchPlayers(mode) {
  const needed = MODE_SIZE[mode];
  while (queues[mode].length >= needed) {
    const group = queues[mode].splice(0, needed);

    const roomName = `room-${Math.random().toString(36).substring(2, 11)}`;
    const perTeam = needed / 2; // 1, 2, or 3

    // Assign teams and spawn X positions
    // Red team: left side, Blue team: right side
    // Spread within each half of the 2400px world
    const players = group.map((entry, i) => {
      const team = i < perTeam ? "red" : "blue";
      const slotIndex = i < perTeam ? i : i - perTeam;
      let x;
      if (team === "red") {
        // Spread from 150 to 150 + (perTeam-1)*200
        x = 150 + slotIndex * 200;
      } else {
        // Spread from (WORLD_W-150) back to (WORLD_W-150) - (perTeam-1)*200
        x = (WORLD_W - 150) - slotIndex * 200;
      }
      return { socketId: entry.socketId, profile: entry.profile, team, slotIndex, x };
    });

    // Turn order: interleave Red1, Blue1, Red2, Blue2, ...
    const redPlayers = players.filter(p => p.team === "red");
    const bluePlayers = players.filter(p => p.team === "blue");
    const turnOrder = [];
    for (let i = 0; i < perTeam; i++) {
      if (redPlayers[i]) turnOrder.push(redPlayers[i].socketId);
      if (bluePlayers[i]) turnOrder.push(bluePlayers[i].socketId);
    }

    gameRooms.set(roomName, {
      players,
      turnOrder,
      turnIndex: 0,
      started: false,
      joinedCount: 0,
      mode,
      deadSockets: new Set(),
    });

    const names = group.map(e => e.profile.name).join(", ");
    console.log(`[match] Room ${roomName} (${mode}): ${names}`);

    // Notify each player with their team info and all teammates/opponents
    players.forEach((p) => {
      const teammates = players.filter(other => other.team === p.team && other.socketId !== p.socketId).map(o => o.profile);
      const opponents = players.filter(other => other.team !== p.team).map(o => o.profile);
      io.to(p.socketId).emit("match-found", {
        roomName,
        team: p.team,
        teammates,
        opponents,
        mode,
      });
    });
  }
}

server.listen(PORT, () => {
  console.log(`WebSocket Matchmaker Server listening on port ${PORT}`);
});
