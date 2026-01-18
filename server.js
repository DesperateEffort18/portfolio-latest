import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import chatHandler from './api/chat.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// API route for chat
app.post('/api/chat', async (req, res) => {
    await chatHandler(req, res);
});

app.listen(PORT, () => {
    console.log(`Portfolio server running at http://localhost:${PORT}`);
});
