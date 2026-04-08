import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.get('/', (req, res) => {
    res.json({ ok: true, message: 'Chatbot API is running' });
});

app.post('/chat', async (req, res) => {
    try {
        const question = req.body.message;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }

        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: question,
        });

        const queryEmbedding = embeddingRes.data[0].embedding;

        const { data: matches, error: matchError } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_count: 5,
        });

        if (matchError) {
            console.error('Supabase error:', matchError);
            return res.status(500).json({ error: 'Search failed' });
        }

        const safeMatches = matches || [];

        if (safeMatches.length === 0) {
            return res.json({
                answer: "I'm not sure based on the available store information. Please contact support for help.",
                sources: [],
            });
        }

        const context = safeMatches.map((m) => m.content).join('\n\n');

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `
You are a professional customer support assistant for Hoverboard Store UK.

Rules:
- Answer ONLY using the provided context
- Be clear, concise, and helpful
- Use natural human language
- Include important details like delivery time, conditions, and options
- If information is missing, say "I'm not sure, please contact support"
- Never invent warranty, refund, or delivery promises

Tone:
- Friendly
- Professional
- UK-based ecommerce style
`,
                },
                {
                    role: 'user',
                    content: `Context:\n${context}\n\nQuestion:\n${question}`,
                },
            ],
        });

        const answer = response.choices[0].message.content;

        res.json({
            answer,
            sources: safeMatches.map((m) => ({
                title: m.title,
                source_type: m.source_type,
                source_id: m.source_id,
            })),
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Chatbot API running on http://localhost:${PORT}`);
});