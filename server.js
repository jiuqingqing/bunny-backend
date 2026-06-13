const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 初始化 Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 健康检查
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// 获取所有会话
app.get('/api/sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 创建新会话
app.post('/api/sessions', async (req, res) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from('sessions')
    .insert([{ name: name || '新对话' }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// 获取某个会话的消息
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

// 发送消息并获取 AI 回复（暂时用模拟，稍后接入真实模型）
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  // 1. 保存用户消息
  const { error: userError } = await supabase
    .from('messages')
    .insert([{ session_id: sessionId, role: 'user', content: message }]);
  if (userError) return res.status(500).json({ error: userError.message });

  // 2. 模拟 AI 回复（后续替换为真实 API）
  const aiReply = `这是模拟回复。你发送了: "${message}"。稍后接入 DeepSeek 就会智能回答啦。`;
  
  // 3. 保存 AI 回复
  const { data: aiMsg, error: aiError } = await supabase
    .from('messages')
    .insert([{ session_id: sessionId, role: 'assistant', content: aiReply }])
    .select();
  if (aiError) return res.status(500).json({ error: aiError.message });

  res.json({ reply: aiReply, messageId: aiMsg[0].id });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});