const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 初始化 Supabase (使用 service_role key)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 健康检查
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// ========== 会话 APIs ==========
// 获取所有会话
app.get('/api/sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Error fetching sessions:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 创建新会话
app.post('/api/sessions', async (req, res) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from('sessions')
    .insert([{ name: name || '新对话' }])
    .select();
  if (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data[0]);
});

// 重命名会话
app.put('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const { data, error } = await supabase
    .from('sessions')
    .update({ name, updated_at: new Date() })
    .eq('id', id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// 删除会话（级联删除消息）
app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== 消息 APIs ==========
// 获取某会话的消息历史
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

// 调用 DeepSeek
async function callDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not set');
  }
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
  return data.choices[0].message.content;
}

// 聊天核心接口（保存并回复）
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  try {
    // 1. 保存用户消息
    const { error: userError } = await supabase
      .from('messages')
      .insert([{ session_id: sessionId, role: 'user', content: message }]);
    if (userError) throw userError;

    // 2. 获取该会话的历史消息（最近20条，用于上下文）
    const { data: history, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true })
      .limit(20);
    if (historyError) throw historyError;

    // 构造消息列表（直接使用历史记录，已经包含刚保存的用户消息）
    // 注意：history 可能还没有最新的 AI 回复，但没关系，先发送给 AI
    const chatMessages = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 3. 调用 AI
    const aiReply = await callDeepSeek(chatMessages);

    // 4. 保存 AI 回复
    const { data: aiMsg, error: aiError } = await supabase
      .from('messages')
      .insert([{ session_id: sessionId, role: 'assistant', content: aiReply }])
      .select();
    if (aiError) throw aiError;

    // 5. 更新会话的 updated_at
    await supabase.from('sessions').update({ updated_at: new Date() }).eq('id', sessionId);

    res.json({ reply: aiReply, messageId: aiMsg[0].id });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
