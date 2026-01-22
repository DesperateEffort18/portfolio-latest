import { portfolioData } from './portfolio-data.js';

console.log("--- Verifying Project Data ---");
if (!portfolioData.projects) {
    console.error("ERROR: portfolioData.projects is undefined!");
} else {
    console.log(`Found ${portfolioData.projects.length} projects.`);
    portfolioData.projects.forEach((p, i) => {
        console.log(`[${i}] ${p.name}`);
        console.log(`    Tech: ${p.tech}`);
        console.log(`    Desc length: ${p.desc ? p.desc.length : 'N/A'}`);
    });
}
