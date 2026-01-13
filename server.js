const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const games = {}; // {room: {players:{}, currentTurn:0, boardState:...}}

const BOARD_DATA = Array.from({length:40}, (_,i) => {
  // Simplified Monopoly board
  const names = ['GO','M1','Community','M2','Tax1','RR1','O1','Chance','O2','Tax2','Jail',
    'P1','Utility1','P2','P3','RR2','P4','Community','P5','P6','FreePark','G1','Chance','G2',
    'G3','RR3','B1','B2','Utility2','B3','GoToJail','I1','I2','Community','I3','RR4','S1','Chance','S2','Tax3'];
  const prices = [0,60,0,60,200,200,100,0,100,100,0,120,150,140,160,200,180,0,180,200,0,220,0,220,240,200,260,260,150,280,0,300,300,0,320,200,350,0,350,100];
  const colors = ['gold','#e74c3c','#fff','#e74c3c','gray','#34495e','#f39c12','#fff','#f39c12','gray','darkblue','#8e44ad','#9b59b6','#9b59b6','#3498db','#34495e','#3498db','#fff','#3498db','#3498db','lime','#2ecc71','#fff','#2ecc71','#27ae60','#34495e','#e67e22','#e67e22','#f1c40f','#e67e22','red','#f39c12','#f39c12','#fff','#f39c12','#34495e','#e74c3c','#fff','#e74c3c','gray'];
  const rents = [0,2,0,4,0,25,6,0,6,0,0,6,10,8,12,25,10,0,10,14,0,12,0,12,14,25,15,15,10,20,0,18,18,0,20,25,22,0,22,0];
  return {name:names[i], price:prices[i], color:colors[i], rent:rents[i], owner:null};
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', ({room, name}) => {
    socket.join(room);
    if(!games[room]) {
      games[room] = {
        players: {},
        board: JSON.parse(JSON.stringify(BOARD_DATA)), // Deep copy
        currentTurn: 0,
        turnPlayer: null,
        phase: 'rolling' // rolling, action, ended
      };
    }
    games[room].players[socket.id] = {name, id:socket.id, cash:1500, pos:0, owned:[], inJail:0, color: `hsl(${Math.random()*360},70%,50%)`};
    io.to(room).emit('gameState', games[room]);
    socket.emit('roomJoined', {room});
  });

  socket.on('rollDice', ({room}) => {
    const game = games[room];
    if(game && socket.id === Object.keys(game.players)[game.currentTurn]) {
      const dice1 = Math.floor(Math.random()*6)+1;
      const dice2 = Math.floor(Math.random()*6)+1;
      const player = game.players[socket.id];
      player.pos = (player.pos + dice1 + dice2) % 40;
      if(player.pos === 0) player.cash += 200;
      game.phase = 'action';
      io.to(room).emit('gameState', game);
    }
  });

  socket.on('buyProperty', ({room, pos}) => {
    const game = games[room];
    if(game && socket.id === Object.keys(game.players)[game.currentTurn]) {
      const player = game.players[socket.id];
      const prop = game.board[pos];
      if(prop.price && !prop.owner && player.cash >= prop.price) {
        player.cash -= prop.price;
        prop.owner = socket.id;
        player.owned.push(pos);
        game.phase = 'ended';
        nextTurn(game, room);
      }
    }
  });

  socket.on('endTurn', ({room}) => {
    const game = games[room];
    if(game && socket.id === Object.keys(game.players)[game.currentTurn]) {
      nextTurn(game, room);
    }
  });

  socket.on('chat', ({room, msg}) => {
    io.to(room).emit('chatMsg', {name: games[room]?.players[socket.id]?.name || 'Anon', msg});
  });

  socket.on('disconnect', () => {
    for(let room in games) {
      if(games[room].players[socket.id]) {
        delete games[room].players[socket.id];
        // Reassign owners? Skip for demo
        io.to(room).emit('gameState', games[room]);
      }
    }
  });
});

function nextTurn(game, room) {
  game.currentTurn = (game.currentTurn + 1) % Object.keys(game.players).length;
  game.phase = 'rolling';
  io.to(room).emit('gameState', game);
}

server.listen(3000, () => console.log('Server on http://localhost:3000'));
