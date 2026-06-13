const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => res.send('Backend is running!'));

// 获取全局默认 system_prompt
async function getGlobalSystemPrompt() {
  const { data, error } = await supabase
    .from('settings')
    .select('system_prompt')
    .maybeSingle();
  if (error || !data) return '你是一个温柔、贴心的朋友，用中文回答。';
  return data.system_prompt;
}

// 获取会话的有效 system_prompt（会话自定义 or 全局默认）
async function getEffectiveSystemPrompt(sessionId) {
  // 获取会话信息
  const { data: session, error } = await supabase
    .from('sessions')
    .select('system_prompt')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !session) return await getGlobalSystemPrompt();
  if (session.system_prompt) return session.system_prompt;
  return await getGlobalSystemPrompt();
}

// ---------- 会话 APIs ----------
app.get('/api/sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/sessions', async (req, res) => {
  const { name, system_prompt } = req.body;
  const newSession = {
    name: name || '新对话',
    updated_at: new Date(),
    system_prompt: system_prompt || null
  };
  const { data, error } = await supabase
    .from('sessions')
    .insert([newSession])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// 更新会话（包括重命名和修改 system_prompt）
app.patch('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const { name, system_prompt } = req.body;
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
  updateData.updated_at = new Date();
  
  const { data, error } = await supabase
    .from('sessions')
    .update(updateData)
    .eq('id', id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---------- 消息 APIs ----------
app.get('/api/messages/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('visible', true)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------- DeepSeek 调用 ----------
async function callDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const reply = data.choices[0].message.content;
  const tokenUsage = data.usage?.total_tokens || 0;
  return { reply, tokenUsage };
}

// ---------- 聊天核心 ----------
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: 'Missing' });
  try {
    // 保存用户消息
    const { error: userErr } = await supabase
      .from('messages')
      .insert([{ session_id: sessionId, role: 'user', content: message }]);
    if (userErr) throw userErr;

    // 获取历史消息（最近20条）
    const { data: history, error: histErr } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true })
      .limit(20);
    if (histErr) throw histErr;

    // 获取有效 system_prompt（会话级优先）
    const systemPrompt = await getEffectiveSystemPrompt(sessionId);
    const messagesForAI = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content }))
    ];
    const aiReply = await callDeepSeek(messagesForAI);

    // 保存 AI 回复
    const { error: aiErr } = await supabase
      .from('messages')
      .insert([{ session_id: sessionId, role: 'assistant', content: aiReply }]);
    if (aiErr) throw aiErr;

    // 更新会话的 updated_at
    await supabase.from('sessions').update({ updated_at: new Date() }).eq('id', sessionId);

    res.json({ reply: aiReply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
