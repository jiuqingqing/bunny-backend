const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('Backend is running!'));

// ---------- 内存存储（模拟数据库）----------
let sessions = [
  { id: 1, name: '示例会话', created_at: new Date(), updated_at: new Date() }
];
let messages = [
  { id: 1, session_id: 1, role: 'assistant', content: '你好！我是你的AI助手。', created_at: new Date() }
];

// 获取所有会话
app.get('/api/sessions', (req, res) => {
  res.json(sessions);
});

// 创建新会话
app.post('/api/sessions', (req, res) => {
  const newSession = {
    id: Date.now(),
    name: req.body.name || '新对话',
    created_at: new Date(),
    updated_at: new Date()
  };
  sessions.unshift(newSession);
  res.json(newSession);
});

// 重命名会话
app.put('/api/sessions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const session = sessions.find(s => s.id === id);
  if (session) {
    session.name = req.body.name;
    session.updated_at = new Date();
    res.json(session);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// 删除会话
app.delete('/api/sessions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  sessions = sessions.filter(s => s.id !== id);
  messages = messages.filter(m => m.session_id !== id);
  res.json({ success: true });
});

// 获取某个会话的消息
app.get('/api/messages/:sessionId', (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const msgs = messages.filter(m => m.session_id === sessionId);
  res.json(msgs);
});

// DeepSeek API 调用函数
async function callDeepSeek(message) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return "⚠️ 请先在 Render 环境变量中配置 DEEPSEEK_API_KEY（从 platform.deepseek.com 获取）";
  }
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: message }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  } catch (err) {
    console.error('DeepSeek 调用失败:', err);
    return `AI 调用出错：${err.message}`;
  }
}

// 聊天接口
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }
  const sessId = parseInt(sessionId);
  // 保存用户消息
  messages.push({
    id: Date.now(),
    session_id: sessId,
    role: 'user',
    content: message,
    created_at: new Date()
  });
  // 获取 AI 回复
  const aiReply = await callDeepSeek(message);
  // 保存 AI 消息
  messages.push({
    id: Date.now() + 1,
    session_id: sessId,
    role: 'assistant',
    content: aiReply,
    created_at: new Date()
  });
  // 更新会话的 updated_at
  const session = sessions.find(s => s.id === sessId);
  if (session) session.updated_at = new Date();
  res.json({ reply: aiReply });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
