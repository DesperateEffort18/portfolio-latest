
import fetch from 'node-fetch';

async function verifyFix() {
    console.log('Verifying Project Retrieval Fix...');

    const query = "What are his most recent projects?";
    console.log(`\nQuery: "${query}"`);

    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: query })
        });
        const text = await response.text();
        console.log('\nResponse:\n', text);

        if (text.includes("AI Course Recommender") || text.includes("MinuteMacros")) {
            console.log('\n✅ SUCCESS: Response mentions actual projects.');
        } else {
            console.log('\n❌ FAILURE: Response does not mention known projects.');
        }

        if (text.includes("USEReady") || text.includes("Intern")) {
            console.log('⚠️ NOTE: Response still mentions internship (may be expected if context scores are high, but should optimize)');
        }

    } catch (e) {
        console.error('Test Failed:', e.message);
    }
}

verifyFix();
