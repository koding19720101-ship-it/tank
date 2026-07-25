const { Server } = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Matchmaker Server is running!\n");
});

const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any origin for development
    methods: ["GET", "POST"],
  },
});

// Map to track active socket connections and their profile info
const connectedClients = new Map(); // socketId -> playerProfile
// Matchmaking queue
let queue = []; // Array of { socketId, profile }

// Active game rooms: roomName -> { sockets: [socketId, socketId], activeSocketId, started }
const gameRooms = new Map();

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  connectedClients.set(socket.id, null);

  // Broadcast online stats to all clients
  const broadcastStats = () => {
    io.emit("online-stats", {
      onlineCount: connectedClients.size,
    });
  };

  broadcastStats();

  // Handle joining matchmaking queue
  socket.on("join-queue", (playerProfile) => {
    console.log(`Player ${playerProfile.name} (${socket.id}) joined matchmaking queue`);
    connectedClients.set(socket.id, playerProfile);

    // Prevent duplicate entries in queue
    if (!queue.some(player => player.socketId === socket.id)) {
      queue.push({
        socketId: socket.id,
        profile: playerProfile,
      });
    }

    // Attempt matching
    matchPlayers();
  });

  // Handle leaving matchmaking queue
  socket.on("leave-queue", () => {
    console.log(`Player (${socket.id}) left the matchmaking queue`);
    queue = queue.filter(player => player.socketId !== socket.id);
    socket.emit("queue-left");
  });

  // Handle joining the actual game room after a match is found
  socket.on("join-game-room", ({ roomName, profile }) => {
    socket.join(roomName);
    connectedClients.set(socket.id, profile);

    if (!gameRooms.has(roomName)) {
      gameRooms.set(roomName, { sockets: [], started: false });
    }
    const room = gameRooms.get(roomName);
    if (!room.sockets.includes(socket.id)) {
      room.sockets.push(socket.id);
    }

    console.log(`Socket ${socket.id} joined game room ${roomName} (${room.sockets.length}/2)`);

    // Once both players have joined, kick off the game
    if (room.sockets.length === 2 && !room.started) {
      room.started = true;
      const [firstId, secondId] = room.sockets;
      const activeSocketId = Math.random() < 0.5 ? firstId : secondId;
      const seed = Math.random() * 1000;

      room.activeSocketId = activeSocketId;

      const players = [
        { socketId: firstId, x: 150, hp: 100 },
        { socketId: secondId, x: 650, hp: 100 },
      ];

      console.log(`Game starting in room ${roomName}, active player: ${activeSocketId}`);
      io.to(roomName).emit("game-start", { players, activeSocketId, seed });
    }
  });

  // Relay in-game actions (move / fire) to the other player in the room
  socket.on("game-action", ({ roomName, action }) => {
    socket.to(roomName).emit("game-action", action);
  });

  // Switch the active turn and notify both players
  socket.on("game-turn-end", ({ roomName }) => {
    const room = gameRooms.get(roomName);
    if (!room || room.sockets.length < 2) return;
    const [firstId, secondId] = room.sockets;
    room.activeSocketId = room.activeSocketId === firstId ? secondId : firstId;
    io.to(roomName).emit("game-new-turn", { activeSocketId: room.activeSocketId });
  });

  // A client reports the game ended (victory/defeat from its own perspective);
  // relay the correct outcome to both players and tear down the room
  socket.on("report-game-end", ({ roomName, reason }) => {
    const room = gameRooms.get(roomName);
    if (!room) return;
    room.sockets.forEach((sid) => {
      const outcome = sid === socket.id
        ? reason
        : reason === "victory" ? "defeat" : reason === "defeat" ? "victory" : reason;
      io.to(sid).emit("game-ended", { reason: outcome });
    });
    gameRooms.delete(roomName);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
    queue = queue.filter(player => player.socketId !== socket.id);

    // If the disconnecting player was in an active game room, notify the opponent
    for (const [roomName, room] of gameRooms.entries()) {
      if (room.sockets.includes(socket.id)) {
        room.sockets.forEach((sid) => {
          if (sid !== socket.id) io.to(sid).emit("game-ended", { reason: "opponent_left" });
        });
        gameRooms.delete(roomName);
      }
    }

    broadcastStats();
  });
});

// Matchmaker algorithm
function matchPlayers() {
  while (queue.length >= 2) {
    const player1 = queue.shift();
    const player2 = queue.shift();

    const roomName = `room-${Math.random().toString(36).substring(2, 11)}`;

    console.log(`Match found! Room: ${roomName} between ${player1.profile.name} and ${player2.profile.name}`);

    // Emit match-found with room info and opponent's profile to each player
    io.to(player1.socketId).emit("match-found", {
      roomName,
      opponent: player2.profile,
    });

    io.to(player2.socketId).emit("match-found", {
      roomName,
      opponent: player1.profile,
    });
  }
}

server.listen(PORT, () => {
  console.log(`WebSocket Matchmaker Server is listening on port ${PORT}`);
});
