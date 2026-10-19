const path = require('path');
const dotenv = require('../server/node_modules/dotenv');
const { GoogleGenAI } = require('../server/node_modules/@google/genai');
const { SYSTEM_INSTRUCTION } = require('../server/systemInstruction');

dotenv.config({ path: path.join(__dirname, '../server/.env.local') });

const rawApiKey =
	process.env.GEMINI_API_KEY ||
	process.env['process.env.GEMINI_API_KEY'] ||
	'';
const GEMINI_API_KEY = rawApiKey.replace(/^['"]|['"]$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const testText = '一切都如同我們第一次見面的那個冬天一樣沉默';

async function testModel(modelName) {
	console.log(`\nTesting model: ${modelName}`);
	const t0 = Date.now();
	try {
		const res = await ai.models.generateContent({
			model: modelName,
			contents: testText,
			config: {
				systemInstruction: SYSTEM_INSTRUCTION,
				responseMimeType: 'application/json',
				temperature: 0.2,
			},
		});
		console.log(`[SUCCESS ${modelName}] in ${Date.now() - t0}ms:`, res.text);
		return true;
	} catch (e) {
		console.log(`[FAIL ${modelName}]:`, e.status || e.message);
		return false;
	}
}

async function run() {
	const candidates = [
		'gemini-3.1-flash-lite',
		'models/gemini-3.1-flash-lite',
		'gemini-2.0-flash',
		'gemini-1.5-flash',
		'models/gemini-1.5-flash',
		'gemini-3-flash-preview',
		'gemini-3.5-flash',
		'gemini-3.5-flash-lite'
	];
	for (const m of candidates) {
		const ok = await testModel(m);
		if (ok) break;
	}
}
run();
