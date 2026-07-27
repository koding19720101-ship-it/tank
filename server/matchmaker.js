const { Server } = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 3001;
const WORLD_W = 2400;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Matchmaker Server is running!\n");
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const connectedClients = new Map(); // socketId -> profile

// Mode queues: "1v1" | "2v2" | "3v3" -> [{ socketId, profile }]
const queues = { "1v1": [], "2v2": [], "3v3": [] };
const MODE_SIZE = { "1v1": 1, "2v2": 2, "3v3": 3 };

// Active rooms: roomName -> {
//   sockets: [socketId...], joined: [socketId...], teamOf: {socketId:"red"|"blue"},
//   profileOf: {socketId:profile}, turnOrder: [socketId...], turnIndex, mode,
//   deadSet: Set<socketId>, started
// }
const gameRooms = new Map();

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  connectedClients.set(socket.id, null);

  const broadcastStats = () => io.emit("online-stats", { onlineCount: connectedClients.size });
  broadcastStats();

  socket.on("join-queue", ({ profile, mode }) => {
    const m = MODE_SIZE[mode] ? mode : "1v1";
    console.log(`Player ${profile.name} (${socket.id}) joined ${m} queue`);
    connectedClients.set(socket.id, profile);
    const q = queues[m];
    if (!q.some(p => p.socketId === socket.id)) q.push({ socketId: socket.id, profile });
    matchQueue(m);
  });

  socket.on("leave-queue", () => {
    console.log(`Player (${socket.id}) left the matchmaking queue`);
    for (const m of Object.keys(queues)) {
      queues[m] = queues[m].filter(p => p.socketId !== socket.id);
    }
    socket.emit("queue-left");
  });

  socket.on("join-game-room", ({ roomName, profile }) => {
    socket.join(roomName);
    connectedClients.set(socket.id, profile);

    const room = gameRooms.get(roomName);
    if (!room) return;
    room.profileOf[socket.id] = profile;
    if (!room.joined.includes(socket.id)) room.joined.push(socket.id);

    console.log(`Socket ${socket.id} joined game room ${roomName} (${room.joined.length}/${room.sockets.length})`);

    if (room.joined.length === room.sockets.length && !room.started) {
      room.started = true;
      const seed = Math.random() * 1000;
      const size = MODE_SIZE[room.mode];

      const redIds = room.sockets.filter(sid => room.teamOf[sid] === "red");
      const blueIds = room.sockets.filter(sid => room.teamOf[sid] === "blue");
      const redXs = spreadXs(size, "red");
      const blueXs = spreadXs(size, "blue");

      const players = [
        ...redIds.map((sid, i) => ({ socketId: sid, team: "red", slotIndex: i, x: redXs[i], hp: 100, profile: room.profileOf[sid] })),
        ...blueIds.map((sid, i) => ({ socketId: sid, team: "blue", slotIndex: i, x: blueXs[i], hp: 100, profile: room.profileOf[sid] })),
      ];

      io.to(roomName).emit("game-start", {
        players, turnOrder: room.turnOrder, activeSocketId: room.turnOrder[0], seed, mode: room.mode,
      });
      console.log(`Game starting in room ${roomName} (${room.mode})`);
    }
  });

  // Relay in-game actions (move / fire) — action already carries socketId
  socket.on("game-action", ({ roomName, action }) => {
    socket.to(roomName).emit("game-action", action);
  });

  // Advance turn order, skipping players already reported dead
  socket.on("game-turn-end", ({ roomName }) => {
    const room = gameRooms.get(roomName);
    if (!room || room.turnOrder.length === 0) return;
    let next = room.turnIndex;
    for (let i = 0; i < room.turnOrder.length; i++) {
      next = (next + 1) % room.turnOrder.length;
      if (!room.deadSet.has(room.turnOrder[next])) break;
    }
    room.turnIndex = next;
    io.to(roomName).emit("game-new-turn", { activeSocketId: room.turnOrder[next] });
  });

  // A client reports a tank has died (any client may detect this identically;
  // dedupe by deadSet so it's only processed once per player)
  socket.on("report-player-dead", ({ roomName, deadSocketId }) => {
    const room = gameRooms.get(roomName);
    if (!room) return;
    checkAndHandleDeath(roomName, room, deadSocketId);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
    for (const m of Object.keys(queues)) {
      queues[m] = queues[m].filter(p => p.socketId !== socket.id);
    }

    for (const [roomName, room] of gameRooms.entries()) {
      if (room.sockets.includes(socket.id)) {
        checkAndHandleDeath(roomName, room, socket.id);
      }
    }

    broadcastStats();
  });
});

// Spread starting x positions for a team of `size` tanks across the 2400px world.
// Red starts near the left edge, blue near the right edge.
function spreadXs(size, team) {
  const spacing = 250;
  const base = team === "red" ? 200 : WORLD_W - 200;
  const dir = team === "red" ? 1 : -1;
  return Array.from({ length: size }, (_, i) => base + dir * i * spacing);
}

// Mark a player dead (idempotent) and, if that eliminates a whole team,
// broadcast game-ended to everyone in the room and tear it down.
function checkAndHandleDeath(roomName, room, deadSocketId) {
  if (room.deadSet.has(deadSocketId)) return;
  room.deadSet.add(deadSocketId);

  const aliveOnTeam = (team) =>
    room.sockets.filter(sid => room.teamOf[sid] === team && !room.deadSet.has(sid)).length;

  const redAlive = aliveOnTeam("red");
  const blueAlive = aliveOnTeam("blue");

  if (redAlive === 0 || blueAlive === 0) {
    const losingTeam = redAlive === 0 ? "red" : "blue";
    room.sockets.forEach((sid) => {
      const outcome = room.teamOf[sid] === losingTeam ? "defeat" : "victory";
      io.to(sid).emit("game-ended", { reason: outcome });
    });
    gameRooms.delete(roomName);
  }
}

// Try to form a match for a given mode ("1v1" | "2v2" | "3v3")
function matchQueue(mode) {
  const size = MODE_SIZE[mode];
  const need = size * 2;
  const q = queues[mode];

  while (q.length >= need) {
    const picked = q.splice(0, need);
    const redTeam = picked.slice(0, size);
    const blueTeam = picked.slice(size);

    const roomName = `room-${Math.random().toString(36).substring(2, 11)}`;
    const teamOf = {};
    redTeam.forEach(p => { teamOf[p.socketId] = "red"; });
    blueTeam.forEach(p => { teamOf[p.socketId] = "blue"; });

    // Turn order interleaved: red0, blue0, red1, blue1, ...
    const turnOrder = [];
    for (let i = 0; i < size; i++) {
      turnOrder.push(redTeam[i].socketId);
      turnOrder.push(blueTeam[i].socketId);
    }

    const sockets = [...redTeam, ...blueTeam].map(p => p.socketId);

    gameRooms.set(roomName, {
      sockets, joined: [], teamOf, profileOf: {}, turnOrder, turnIndex: 0,
      mode, deadSet: new Set(), started: false,
    });

    console.log(`Match found! Room: ${roomName} (${mode})`);

    sockets.forEach((sid) => {
      const myTeam = teamOf[sid];
      const teammates = picked.filter(p => p.socketId !== sid && teamOf[p.socketId] === myTeam).map(p => p.profile);
      const opponents = picked.filter(p => teamOf[p.socketId] !== myTeam).map(p => p.profile);
      io.to(sid).emit("match-found", { roomName, team: myTeam, teammates, opponents, mode });
    });
  }
}

server.listen(PORT, () => {
  console.log(`WebSocket Matchmaker Server is listening on port ${PORT}`);
});
