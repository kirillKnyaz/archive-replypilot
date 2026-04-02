const prisma = require('../lib/prisma.js');

async function authorizeTokens(req, res, next) {
  const user = req.user; // Assuming user is set by a previous middleware
  const requestedTokens = parseInt(req.query.requestedTokens) || 10;

  //check if user has a subscription and if the search tokens are avaliable
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.userId }
  })

  if (!subscription) return res.status(403).json({ message: 'No subscription found' });
  if (!subscription.active) return res.status(403).json({ message: 'Subscription is not active' });
  // Check if the user has enough search tokens
  if (subscription.searchTokens < requestedTokens) {
    return res.status(403).json({ message: 'Insufficient search tokens' });
  }
 
  next();
}

module.exports = authorizeTokens;