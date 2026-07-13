const cron = require('node-cron');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

/**
 * Track which notifications have been sent recently to avoid duplicates.
 * Key format: `${shopId}_${type}_${productId}`
 * Cache is cleared daily by the cron job at midnight.
 */
const sentCache = new Map();

/**
 * Create low-stock / out-of-stock notifications for a given shop.
 *
 * @param {Object} options
 * @param {string} options.shopId  - MongoDB ObjectId of the shop
 * @param {string} [options.branchId]
 * @param {string} [options.createdBy] - User who triggered the check (optional)
 * @returns {Promise<number>} Number of notifications created
 */
const checkAndNotifyLowStock = async ({ shopId, branchId, createdBy } = {}) => {
  const query = { shopId, isActive: true };

  // ─── Low stock products (quantity > 0 but <= minStockLevel) ───
  const lowStockProducts = await Product.find({
    ...query,
    $expr: {
      $and: [
        { $lte: ['$inventory.quantity', '$inventory.minStockLevel'] },
        { $gt: ['$inventory.quantity', 0] },
      ],
    },
  }).select('name sku inventory');

  // ─── Out of stock products (quantity <= 0) ───
  const outOfStockProducts = await Product.find({
    ...query,
    'inventory.quantity': { $lte: 0 },
  }).select('name sku inventory');

  let created = 0;

  for (const product of lowStockProducts) {
    const cacheKey = `${shopId}_low_stock_${product._id}`;
    if (sentCache.has(cacheKey)) continue;

    // Check if a low_stock notification already exists for this product today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await Notification.findOne({
      shopId,
      type: 'low_stock',
      'data.productId': product._id.toString(),
      createdAt: { $gte: todayStart },
    });

    if (existing) {
      sentCache.set(cacheKey, true);
      continue;
    }

    await Notification.create({
      shopId,
      branchId,
      type: 'low_stock',
      title: 'Low Stock Alert',
      message: `${product.name} (${product.sku}) — only ${product.inventory.quantity} left (threshold: ${product.inventory.minStockLevel})`,
      data: {
        productId: product._id.toString(),
        productName: product.name,
        sku: product.sku,
        currentStock: product.inventory.quantity,
        minStockLevel: product.inventory.minStockLevel,
      },
      channel: 'dashboard',
      isUrgent: product.inventory.quantity === 0,
      createdBy: createdBy || undefined,
    });

    sentCache.set(cacheKey, true);
    created++;
  }

  for (const product of outOfStockProducts) {
    const cacheKey = `${shopId}_out_of_stock_${product._id}`;
    if (sentCache.has(cacheKey)) continue;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await Notification.findOne({
      shopId,
      type: 'out_of_stock',
      'data.productId': product._id.toString(),
      createdAt: { $gte: todayStart },
    });

    if (existing) {
      sentCache.set(cacheKey, true);
      continue;
    }

    await Notification.create({
      shopId,
      branchId,
      type: 'out_of_stock',
      title: 'Out of Stock',
      message: `${product.name} (${product.sku}) is out of stock`,
      data: {
        productId: product._id.toString(),
        productName: product.name,
        sku: product.sku,
        currentStock: product.inventory.quantity,
        minStockLevel: product.inventory.minStockLevel,
      },
      channel: 'dashboard',
      isUrgent: true,
      createdBy: createdBy || undefined,
    });

    sentCache.set(cacheKey, true);
    created++;
  }

  if (created > 0) {
    logger.info(`[LowStockNotification] Created ${created} stock alert(s) for shop ${shopId}`);
  }

  return created;
};

/**
 * Run the low-stock check for ALL active shops.
 * Called by the hourly cron job.
 */
const checkAllShops = async () => {
  logger.info('[LowStockNotification] Running low-stock check for all shops...');
  try {
    const Shop = require('../models/Shop');
    const activeShops = await Shop.find({ status: 'active' }).select('_id').lean();

    let total = 0;
    for (const shop of activeShops) {
      total += await checkAndNotifyLowStock({ shopId: shop._id });
    }

    logger.info(`[LowStockNotification] Completed. Total notifications created: ${total}`);
  } catch (error) {
    logger.error(`[LowStockNotification] Global check failed: ${error.message}`);
  }
};

/**
 * Initialize the low-stock notification cron job.
 * Runs every hour.
 */
const initLowStockNotifications = () => {
  logger.info('[LowStockNotification] Initializing low-stock notification cron job...');

  // Run every hour
  cron.schedule('0 * * * *', () => {
    checkAllShops();
  });

  // Run once 30 seconds after startup
  setTimeout(() => {
    checkAllShops().catch((err) =>
      logger.error(`[LowStockNotification] Initial check failed: ${err.message}`)
    );
  }, 30000);

  // Clear cache daily at midnight
  cron.schedule('0 0 * * *', () => {
    logger.info('[LowStockNotification] Clearing notification cache...');
    sentCache.clear();
  });

  logger.info('[LowStockNotification] Cron job scheduled (every hour).');
};

module.exports = {
  initLowStockNotifications,
  checkAndNotifyLowStock,
};
