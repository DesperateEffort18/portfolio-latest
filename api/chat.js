// api/chat.js
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Validate environment variables
if (!process.env.PINECONE_API_KEY) {
    console.error('PINECONE_API_KEY is not set');
}
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
}

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME || 'portfolio-rag';
const index = pinecone.index(indexName);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    const allowedOrigins = [
        'https://adityarakshit.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'POST') {
        try {
            console.log('Environment check:', {
                hasPineconeKey: !!process.env.PINECONE_API_KEY,
                hasOpenAIKey: !!process.env.OPENAI_API_KEY,
                indexName: indexName
            });

            const { prompt, conversationHistory } = req.body;

            if (!prompt) {
                return res.status(400).json({ error: 'Prompt is required' });
            }

            let standaloneQuestion = prompt;

            // 1. Create standalone query based on history & prompt
            if (conversationHistory && conversationHistory.length > 0) {
                const historyText = conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n');

                const rephraseResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone question."
                        },
                        {
                            role: "user",
                            content: `Chat History:\n${historyText}\n\nFollow Up Input: ${prompt}`
                        }
                    ]
                });

                const rephrased = rephraseResponse.choices[0]?.message?.content?.trim();
                if (rephrased) {
                    standaloneQuestion = rephrased;
                }
            }

            // 2. Embed the user's question
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: standaloneQuestion,
                dimensions: 1024
            });
            const embedding = embeddingResponse.data[0].embedding;

            // 3. Retrieve relevant documents from Pinecone
            const queryResponse = await index.query({
                vector: embedding,
                topK: 4,
                includeMetadata: true,
            });

            console.log(`Querying Pinecone for: "${standaloneQuestion}"`);
            console.log(`Found ${queryResponse.matches.length} matches.`);
            queryResponse.matches.forEach((match, i) => {
                console.log(`Match ${i + 1}: Score ${match.score} - Source: ${match.metadata?.source}`);
                console.log(`   Text: ${match.metadata?.text?.substring(0, 100)}...`);
            });

            const context = queryResponse.matches.map(match => match.metadata.text).join('\n\n');

            // 4. Construct the system prompt with context
            const systemPrompt = `
        You are an AI assistant for Aditya Rakshit's portfolio.
        Use the following pieces of context to answer the question at the end.
        If you don't know the answer from the context, just say that you don't have that information.

        Context:
        ${context}
      `;

            // 5. Generate and stream the response
            const stream = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: standaloneQuestion }
                ],
                stream: true,
            });

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    res.write(content);
                }
            }

            res.end();

        } catch (error) {
            console.error('Error in RAG pipeline:', error);
            const errorMessage = process.env.NODE_ENV === 'development'
                ? error.message
                : 'An internal server error occurred.';
            res.status(500).json({
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}