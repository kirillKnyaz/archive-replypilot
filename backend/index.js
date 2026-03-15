require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const authenticate = require('./middleware/authenticate');
const { runAllCampaigns } = require('./service/campaignRunner');

const app = express();

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', authenticate, require('./routes/leads'));
app.use('/api/search', authenticate, require('./routes/search'));
app.use('/api/lists', authenticate, require('./routes/lists'));
app.use('/api/campaigns', authenticate, require('./routes/campaigns'));

// Daily campaign runs at 6am
cron.schedule('0 6 * * *', async () => {
  console.log('[cron] Starting daily campaign runs...');
  try {
    const results = await runAllCampaigns();
    console.log('[cron] Daily run complete:', JSON.stringify(results));
  } catch (e) {
    console.error('[cron] Daily run failed:', e.message);
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Server running on http://localhost:${process.env.PORT}`)
);
