import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// API route for chat
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, conversationHistory } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // For now, return a simple response since we don't have the full RAG setup
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.write('I\'m Zuko, Aditya\'s AI assistant. The full RAG functionality requires the Vercel serverless functions to be working properly. ');
        res.write('For now, you can use the terminal commands like "help", "about", "projects", etc. to explore Aditya\'s portfolio!');
        res.end();
        
    } catch (error) {
        console.error('Error in chat API:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

app.listen(PORT, () => {
    console.log(`Portfolio server running at http://localhost:${PORT}`);
    console.log('Note: AI chat has limited functionality without Vercel serverless functions');
});
