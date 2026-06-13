const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  const reply = `你发送了: "${message}"。这是模拟回复，稍后接入 AI 模型就会智能回答啦。`;
  res.json({ reply });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
