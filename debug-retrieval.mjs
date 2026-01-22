
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME || 'portfolio-rag';
const index = pinecone.index(indexName);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function debugRetrieval(query) {
    console.log(`\nDebugging Retrieval for query: "${query}"`);

    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
        dimensions: 1024
    });
    const embedding = embeddingResponse.data[0].embedding;

    const queryResponse = await index.query({
        vector: embedding,
        topK: 15,
        includeMetadata: true,
    });

    console.log(`Found ${queryResponse.matches.length} matches.`);
    queryResponse.matches.forEach((match, i) => {
        const textSnippet = match.metadata?.text?.substring(0, 50).replace(/\n/g, ' ') || 'No text';
        console.log(`[${i + 1}] Score: ${match.score.toFixed(4)} | Source: ${match.metadata?.source} | Text: ${textSnippet}...`);
    });
}

// Run debug for specific problematic queries
await debugRetrieval("what are his most recent projects");
await debugRetrieval("MinuteMacros");
await debugRetrieval("UMass AI Course Recommender");
await debugRetrieval("UMass Lends");
