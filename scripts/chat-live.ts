import { loadConfig } from '../apps/desktop/main/config';
import { generateChat } from '../apps/desktop/main/adapters/gemini-chat';
const config = loadConfig('/tmp/dopamigo-chat-live');
if (!config.apiKey) { console.log('SKIP: GEMINI_API_KEY is not configured.'); process.exit(0); }
const stream = 'BT /F1 12 Tf 40 700 Td (Assignment: Compare three studies. Required code: MAPLE-42.) Tj ET';
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf = '%PDF-1.4\n'; const offsets: number[] = [];
for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const answer = await generateChat(config.apiKey, config.chatModel, { id: 'synthetic-test', title: 'Synthetic PDF verification', brief: '', notes: '', resources: [], plan: null, activeStepId: null, nextAction: '', createdAt: '' }, 'Read the attached PDF. What is its required code? Reply with that code only.', [{ name: 'synthetic-assignment.pdf', data: Buffer.from(pdf).toString('base64') }]);
if (!answer.includes('MAPLE-42')) throw new Error('Gemini did not return the code in the synthetic PDF.');
console.log(`PASS: ${config.chatModel} read the native synthetic PDF and returned its code. No personal assignment data was sent.`);
