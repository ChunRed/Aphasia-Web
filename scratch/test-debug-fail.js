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

async function tryCall(modelName) {
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
		console.log(`[SUCCESS] ${modelName}:`, res.text.trim());
		return true;
	} catch (e) {
		console.log(`[FAIL] ${modelName}:`, e.status || e.message);
		return false;
	}
}

async function run() {
	console.log('Testing various models...');
	await tryCall('gemini-3.1-flash-lite');
	await tryCall('models/gemini-3.1-flash-lite');
	await tryCall('gemini-2.5-flash');
	await tryCall('models/gemini-2.5-flash');
	await tryCall('gemini-1.5-flash');
	await tryCall('models/gemini-1.5-flash');
	await tryCall('gemini-flash-latest');
	await tryCall('models/gemini-flash-latest');
}
run();
