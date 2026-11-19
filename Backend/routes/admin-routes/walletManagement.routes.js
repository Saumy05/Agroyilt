const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requireAnyPermission } = require('../../middleware/roleMiddleware');
const {
  getWalletBalances,
  adjustWallet,
  getIncentivesLeaderboard,
  awardIncentive,
  getWalletLedger
} = require('../../controllers/adminControllers/adminWalletController');

// 1. Wallets List & Balances (supports role=vendor|worker|user)
router.get(
  '/wallets',
  authenticate,
  isAdmin,
  requireAnyPermission('settlements.view', 'vendors.view', 'workers.view', 'users.view', 'payments.view'),
  getWalletBalances
);

// 2. Adjust Wallet (Matches Screen 1 Modal: Balance vs COD Dues, Credit vs Debit)
router.post(
  '/wallets/adjust',
  authenticate,
  isAdmin,
  requireAnyPermission('settlements.edit', 'vendors.edit', 'workers.edit', 'users.edit', 'payments.edit'),
  adjustWallet
);

// 3. Entity Ledger
router.get(
  '/wallets/ledger/:role/:id',
  authenticate,
  isAdmin,
  requireAnyPermission('settlements.view', 'vendors.view', 'workers.view', 'users.view'),
  getWalletLedger
);

// 4. Incentives Leaderboard & Period Data (Matches Screen 2 Table)
router.get(
  '/incentives',
  authenticate,
  isAdmin,
  requireAnyPermission('settlements.view', 'vendors.view', 'workers.view'),
  getIncentivesLeaderboard
);

// 5. Award Incentive (Matches Screen 2 Modal)
router.post(
  '/incentives/award',
  authenticate,
  isAdmin,
  requireAnyPermission('settlements.edit', 'vendors.edit', 'workers.edit'),
  awardIncentive
);

module.exports = router;
