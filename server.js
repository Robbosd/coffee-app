const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/order.html'));

const orders = new Map();
let orderCounter = 1;

io.on('connection', (socket) => {

  socket.on('barista_connect', () => {
    socket.join('barista');
    const queue = Array.from(orders.values())
      .filter(o => o.status === 'pending' || o.status === 'accepted')
      .sort((a, b) => a.placedAt - b.placedAt);
    socket.emit('order_queue', queue);
  });

  socket.on('place_order', ({ name, drink, milk, size }) => {
    const order = {
      id: orderCounter++,
      name: name.trim(),
      drink,
      milk,
      size,
      status: 'pending',
      socketId: socket.id,
      placedAt: Date.now(),
    };
    orders.set(order.id, order);
    socket.emit('order_placed', { orderId: order.id });
    io.to('barista').emit('new_order', order);
  });

  socket.on('accept_order', ({ orderId }) => {
    const order = orders.get(orderId);
    if (!order || order.status !== 'pending') return;
    order.status = 'accepted';
    order.acceptedAt = Date.now();
    io.to(order.socketId).emit('order_accepted', { orderId, acceptedAt: order.acceptedAt });
    io.to('barista').emit('order_updated', order);
  });

  socket.on('mark_collected', ({ orderId }) => {
    const order = orders.get(orderId);
    if (!order) return;
    order.status = 'collected';
    io.to('barista').emit('order_updated', order);
    setTimeout(() => orders.delete(orderId), 10000);
  });

  socket.on('disconnect', () => {
    // Clean up stale pending orders from disconnected customers
    for (const [id, order] of orders.entries()) {
      if (order.socketId === socket.id && order.status === 'pending') {
        orders.delete(id);
        io.to('barista').emit('order_cancelled', { orderId: id });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Coffee app running at http://localhost:${PORT}`);
  console.log(`  Order page:   http://localhost:${PORT}/order.html`);
  console.log(`  Barista page: http://localhost:${PORT}/barista.html`);
});
