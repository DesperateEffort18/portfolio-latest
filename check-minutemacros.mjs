import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME || 'portfolio-rag';
const index = pinecone.index(indexName);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function check() {
    const query = "MinuteMacros";
    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
        dimensions: 1024
    });
    const embedding = embeddingResponse.data[0].embedding;

    const queryResponse = await index.query({
        vector: embedding,
        topK: 20,
        includeMetadata: true,
    });

    const match = queryResponse.matches.find(m =>
        (m.metadata.source && m.metadata.source.includes("MinuteMacros")) ||
        (m.metadata.text && m.metadata.text.includes("MinuteMacros"))
    );

    if (match) {
        console.log("VERIFICATION_SUCCESS: Found MinuteMacros");
        console.log(`Source: ${match.metadata.source}`);
    } else {
        console.log("VERIFICATION_FAILURE: Did NOT find MinuteMacros in top 20");
    }
}

check().catch(console.error);
