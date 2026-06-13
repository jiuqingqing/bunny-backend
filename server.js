const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// DeepSeek API 调用函数
async function callDeepSeek(message) {
  const apiKey = process.env.DEEPSEEK_API_KEY; // 从环境变量读取
  if (!apiKey) {
    return "请先在 Render 环境变量中配置 DEEPSEEK_API_KEY";
  }
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
  if (data.error) {
    console.error('DeepSeek API 错误:', data.error);
    return `AI 调用失败：${data.error.message || '未知错误'}`;
  }
  return data.choices[0].message.content;
}

// 聊天接口
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }
  try {
    const reply = await callDeepSeek(message);
    res.json({ reply });
  } catch (error) {
    console.error('处理请求出错:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
