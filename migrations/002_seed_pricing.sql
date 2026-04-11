-- Seed model pricing
-- Prices in micro-USD per 1K tokens/units (e.g., 3000 = $0.003 per 1K tokens)
-- For STT: input_cost_per_1k = cost per 1K seconds of audio
-- For TTS: input_cost_per_1k = cost per 1K characters
-- For Embedding: input_cost_per_1k = cost per 1K tokens, output = 0

INSERT INTO model_pricing (model_id, input_cost_per_1k_micro, output_cost_per_1k_micro, currency)
VALUES
    -- LLM
    ('qwen2.5-72b',          3000,  12000, 'USD'),
    ('llama3.3-70b',         3000,  12000, 'USD'),
    ('mistral-large-2',      4000,  15000, 'USD'),
    ('qwen2.5-32b',           800,   3000, 'USD'),
    ('gemma2-27b',            500,   2000, 'USD'),
    -- Reasoning
    ('deepseek-r1-70b',      3000,  12000, 'USD'),
    ('deepseek-r1-32b',       800,   3000, 'USD'),
    ('qwq-32b',               800,   3000, 'USD'),
    -- Coding
    ('qwen-coder-32b',        800,   3000, 'USD'),
    ('deepseek-coder-v2-lite', 500,  2000, 'USD'),
    ('starcoder2-15b',        300,   1000, 'USD'),
    -- Vision
    ('qwen-vl-7b',           1000,   4000, 'USD'),
    ('qwen-vl-72b',          4000,  16000, 'USD'),
    ('internvl2-8b',          500,   2000, 'USD'),
    -- STT (cost per 1K seconds of audio, output=0)
    ('whisper-large-v3-turbo', 6000,    0, 'USD'),
    ('whisper-large-v3',      8000,     0, 'USD'),
    ('whisper-medium',        3000,     0, 'USD'),
    ('whisperx-large-v3',    10000,     0, 'USD'),
    -- TTS (cost per 1K characters, output=0)
    ('xtts-v2',              15000,     0, 'USD'),
    ('kokoro-v1',             5000,     0, 'USD'),
    ('stylett2-en',          20000,     0, 'USD'),
    -- Embedding
    ('bge-m3',                 100,     0, 'USD'),
    ('nomic-embed-v1.5',        80,     0, 'USD'),
    ('e5-mistral-7b',          300,     0, 'USD')
ON CONFLICT (model_id) DO UPDATE SET
    input_cost_per_1k_micro = EXCLUDED.input_cost_per_1k_micro,
    output_cost_per_1k_micro = EXCLUDED.output_cost_per_1k_micro,
    updated_at = NOW();
