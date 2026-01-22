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
                topK: 15,
                includeMetadata: true,
            });

            console.log(`Querying Pinecone for: "${standaloneQuestion}"`);
            console.log(`Found ${queryResponse.matches.length} matches.`);
            queryResponse.matches.forEach((match, i) => {
                console.log(`Match ${i + 1}: Score ${match.score} - Source: ${match.metadata?.source}`);
                console.log(`   Text: ${match.metadata?.text?.substring(0, 100)}...`);
            });

            const context = queryResponse.matches.map(match => `[Source: ${match.metadata.source}]\n${match.metadata.text}`).join('\n\n');

            // 4. Construct the system prompt with context
            const systemPrompt = `
        You are an AI assistant for Aditya Rakshit's portfolio.
        You have access to the following specific context about Aditya:
        ---
        ${context}
        ---

        Your goal is to answer the user's question helpfully and accurately by synthesizing the context above.
        
        Guidelines:
        1. **Prioritize Context**: Use the provided context as your primary source of truth.
        2. **Be Flexible**: If the user asks for a list (e.g., "all projects", "skills"), compile the most complete list possible from the available chunks, even if some details are brief.
        3. **Projects vs Experience**: While "Projects" and "Experience" are distinct, if a user asks broadly about "work" or "what he has done", you can mention both. valid projects often have '[Source: Project: ...]' but feel free to infer from the text if it describes a built application.
        4. **General Knowledge**: If the context doesn't fully answer the question (e.g., "What is React?"), use your general knowledge to explain the concepts mentioned in the credentials.
        5. **Avoid Refusals**: Try to answer the question to the best of your ability with the information present. Only say "I don't know" if the information is completely absent and cannot be reasonably inferred.
        
        Be friendly, enthusiastic, and professional.
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