// api/chat.js

import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';

// Validate environment variables
if (!process.env.PINECONE_API_KEY) {
    console.error('PINECONE_API_KEY is not set');
}
if (!process.env.GOOGLE_AI_API_KEY) {
    console.error('GOOGLE_AI_API_KEY is not set');
}

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
// Use environment variable if available, otherwise default to 'portfolio-rag'
const indexName = process.env.PINECONE_INDEX_NAME || 'portfolio-rag';
const index = pinecone.index(indexName);

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export default async function handler(req, res) {
    const allowedOrigins = [
    
        'https://adityarakshit.vercel.app'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle the preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'POST') {
        try {
            // Log environment variable status (without revealing values)
            console.log('Environment check:', {
                hasPineconeKey: !!process.env.PINECONE_API_KEY,
                hasGoogleKey: !!process.env.GOOGLE_AI_API_KEY,
                indexName: process.env.PINECONE_INDEX_NAME || 'portfolio-rag'
            });

            const { prompt, conversationHistory } = req.body;

            if (!prompt) {
                return res.status(400).json({ error: 'Prompt is required' });
            }

            let standaloneQuestion = prompt;

            // 1. Create standalone query based on history & prompt
            if (conversationHistory && conversationHistory.length > 0) {
                const historyText = conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n');

                const questionGenPrompt = `
                    Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone question.
                    
                    Chat History:
                    ${historyText}
                    
                    Follow Up Input: ${prompt}
                    
                    Standalone question:`;

                const questionGenResult = await genAI.models.generateContent({
                    model: "gemini-2.5-flash-lite",
                    contents: questionGenPrompt,
                });
                
                // Extract text from response - handle different response structures
                let responseText = null;
                try {
                    // Try different possible response structures
                    if (questionGenResult?.response?.text) {
                        responseText = typeof questionGenResult.response.text === 'function' 
                            ? await questionGenResult.response.text() 
                            : questionGenResult.response.text;
                    } else if (questionGenResult?.text) {
                        responseText = typeof questionGenResult.text === 'function' 
                            ? await questionGenResult.text() 
                            : questionGenResult.text;
                    } else if (questionGenResult?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                        responseText = questionGenResult.response.candidates[0].content.parts[0].text;
                    }
                    
                    if (responseText && responseText.trim()) {
                        standaloneQuestion = responseText.trim();
                    }
                } catch (err) {
                    console.error('Error extracting text from question generation:', err);
                    // If we can't extract the text, continue with original prompt
                }
            }

            // 2. Embed the user's question
            const { embeddings } = await genAI.models.embedContent({
                model: "gemini-embedding-001",
                contents: standaloneQuestion,
                config: { outputDimensionality: 768 }
            });

            // 3. Retrieve relevant documents from Pinecone
            const queryResponse = await index.query({
                vector: embeddings[0].values,
                topK: 4,
                includeMetadata: true,
            });

            const context = queryResponse.matches.map(match => match.metadata.text).join('\n\n');

            // 4. Construct the augmented prompt
            const augmentedPrompt = `
        You are an AI assistant for Aditya Rakshit's portfolio.
        Use the following pieces of context to answer the question at the end.
        If you don't know the answer from the context, just say that you don't have that information.

        Context:
        ${context}

        Question: ${prompt}
      `;

            // 5. Generate and stream the response
            const result = await genAI.models.generateContentStream({
                model: "gemini-2.5-flash-lite",
                contents: augmentedPrompt,
            });

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');

            // Stream the response - handle different chunk structures
            for await (const chunk of result) {
                try {
                    let text = null;
                    // Try different possible chunk structures
                    if (chunk?.text) {
                        text = chunk.text;
                    } else if (chunk?.response?.text) {
                        text = typeof chunk.response.text === 'function' 
                            ? await chunk.response.text() 
                            : chunk.response.text;
                    } else if (chunk?.candidates?.[0]?.content?.parts?.[0]?.text) {
                        text = chunk.candidates[0].content.parts[0].text;
                    } else if (typeof chunk === 'string') {
                        text = chunk;
                    }
                    
                    if (text) {
                        res.write(text);
                    }
                } catch (chunkError) {
                    console.error('Error processing chunk:', chunkError);
                    // Continue streaming even if one chunk fails
                }
            }

            res.end();

        } catch (error) {
            console.error('Error in RAG pipeline:', error);
            console.error('Error stack:', error.stack);
            console.error('Error message:', error.message);
            // Return more detailed error in development, generic in production
            const errorMessage = process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'An internal server error occurred.';
            res.status(500).json({ 
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } else {
        // ❌ If the method is not POST, send a 405 error
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}