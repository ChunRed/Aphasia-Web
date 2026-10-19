const path = require('path');
const dotenv = require('../server/node_modules/dotenv');
const { GoogleGenAI } = require('../server/node_modules/@google/genai');

dotenv.config({ path: path.join(__dirname, '../server/.env.local') });

const rawApiKey =
	process.env.GEMINI_API_KEY ||
	process.env['process.env.GEMINI_API_KEY'] ||
	'';
const GEMINI_API_KEY = rawApiKey.replace(/^['"]|['"]$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function listModels() {
	try {
		console.log('Listing available models for API key...');
		const response = await ai.models.list();
		console.log('Models:');
		for await (const m of response) {
			console.log('-', m.name, '| Display:', m.displayName);
		}
	} catch (e) {
		console.error('List models failed:', e);
	}
}

listModels();
