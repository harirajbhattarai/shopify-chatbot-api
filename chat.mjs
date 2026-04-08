import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function chat(question) {
    try {
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
            return;
        }

        const safeMatches = matches || [];

        if (safeMatches.length === 0) {
            console.log('No matching documents found.');
            return;
        }

        const context = safeMatches.map((m) => m.content).join('\n\n');

        console.log('\n--- MATCHED CONTEXT ---\n');
        console.log(context);

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

        console.log('\n--- ANSWER ---\n');
        console.log(response.choices[0].message.content);
    } catch (err) {
        console.error('Error:', err);
    }
}

chat('How long does delivery take?');