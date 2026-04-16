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
        const sessionId =
            req.body.sessionId ||
            req.headers['x-session-id'] ||
            'anonymous-session';

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }
        const normalizedQuestion = question.trim().toLowerCase();

const greetingMessages = ['hi', 'hello', 'hey', 'hiya', 'good morning', 'good afternoon', 'good evening'];

if (greetingMessages.includes(normalizedQuestion)) {
  const answer = 'Hi! How can I help you today? You can ask about delivery, returns, warranty, or products.';

  const { error: logError } = await supabase.from('chat_logs').insert([
    {
      session_id: String(sessionId),
      user_message: question,
      assistant_message: answer,
      matched_sources: [],
      confidence: 1.0,
      escalated: false,
    },
  ]);

  if (logError) {
    console.error('Chat log insert error:', logError);
  }

  return res.json({
    answer,
    sources: [],
    sessionId,
  });
}

        const embeddingRes = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            input: question,
        });

        const queryEmbedding = embeddingRes.data[0].embedding;

        const { data: matches, error: matchError } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_count: 5,
        });

        if (matchError) {
            console.error('Supabase search error:', matchError);
            return res.status(500).json({ error: 'Search failed' });
        }

        const safeMatches = matches || [];

        let answer = "I'm not sure based on the available store information. Please contact support for help.";

        if (safeMatches.length > 0) {
            const context = safeMatches.map((m) => m.content).join('\n\n');

            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `
You are a professional customer support assistant for Hoverboard Store UK.

STRICT RULES:
- ONLY answer using the provided context
- DO NOT give generic answers
- DO NOT act like a general chatbot
- If the answer is not clearly in the context, say:
  "I'm not sure, please contact our support team."

STYLE:
- Be clear and helpful
- Include specific details like delivery time, refund timing, warranty limits, and dispatch rules
- Keep answers short, practical, and customer-friendly
`,
                    },
                    {
                        role: 'user',
                        content: `Context:\n${context}\n\nQuestion:\n${question}`,
                    },
                ],
            });

            answer =
                response.choices?.[0]?.message?.content ||
                "I'm not sure, please contact our support team.";
        }

        const matchedSources = safeMatches.map((m) => ({
            title: m.title,
            source_type: m.source_type,
            source_id: m.source_id,
            similarity: m.similarity,
        }));

        const { error: logError } = await supabase.from('chat_logs').insert([
            {
                session_id: String(sessionId),
                user_message: question,
                assistant_message: answer,
                matched_sources: matchedSources,
                confidence: safeMatches.length > 0 ? 0.9 : 0.2,
                escalated: safeMatches.length === 0,
            },
        ]);

        if (logError) {
            console.error('Chat log insert error:', logError);
        }

        return res.json({
            answer,
            sources: matchedSources,
            sessionId,
        });
    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Chatbot API running on port ${PORT}`);
});