import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !openaiApiKey) {
    throw new Error('Missing env variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function run() {
    const { data: docs } = await supabase
        .from('documents')
        .select('id, content')
        .is('embedding', null);

    console.log(`Found ${docs.length} documents`);

    for (const doc of docs) {
        const res = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: doc.content,
        });

        const embedding = res.data[0].embedding;

        await supabase
            .from('documents')
            .update({ embedding })
            .eq('id', doc.id);

        console.log(`Embedded: ${doc.id}`);
    }

    console.log('Done ✅');
}

run();