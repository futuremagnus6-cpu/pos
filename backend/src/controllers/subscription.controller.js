const SubscriptionPlan = require('../models/SubscriptionPlan');
const Shop = require('../models/Shop');
const { AppError } = require('../middleware/errorHandler');
const BillingSubscription = require('../models/BillingSubscription');
const BillingTransaction = require('../models/BillingTransaction');
const { scopeQuery } = require('../middleware/multiTenant');

exports.getPlans = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1, monthlyPrice: 1 });
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
};
exports.getPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) throw new AppError('Plan not found', 404);
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
};
exports.createPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.create({ ...req.body, createdBy: req.userId });
    res.status(201).json({ success: true, message: 'Plan created', data: plan });
  } catch (error) { next(error); }
};
exports.updatePlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.userId }, { new: true, runValidators: true });
    if (!plan) throw new AppError('Plan not found', 404);
    res.json({ success: true, message: 'Plan updated', data: plan });
  } catch (error) { next(error); }
};
exports.deletePlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.userId }, { new: true });
    if (!plan) throw new AppError('Plan not found', 404);
    res.json({ success: true, message: 'Plan deactivated' });
  } catch (error) { next(error); }
};
exports.assignPlan = async (req, res, next) => {
  try {
    const {
      shopId, planId, duration = 1,
      amount, paymentMethod, paymentReference, paymentNotes,
      startFromExpiry,
    } = req.body;

    const shop = await Shop.findById(shopId);
    if (!shop) throw new AppError('Shop not found', 404);
    if (!planId) throw new AppError('Plan ID is required', 400);

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) throw new AppError('Plan not found', 404);

    const months = [1, 3, 6, 12].includes(Number(duration)) ? Number(duration) : 1;

    // Determine period start: either from current plan expiry or from today
    let periodStart = new Date();
    if (startFromExpiry) {
      const expiryDate = shop.subscription?.currentPeriodEnd || shop.subscription?.trialEndsAt;
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        // Only use the expiry date if it's in the future (prevent unintentional backdating)
        if (expiry > periodStart) {
          periodStart = expiry;
        }
      }
    }
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    // Calculate price: prefer plan's bulk price, fall back to monthly * months
    let calculatedAmount = 0;
    if (amount !== undefined && amount !== null && amount !== '') {
      calculatedAmount = Number(amount);
    } else {
      const monthly = plan.monthlyPrice || 0;
      if (months === 12 && plan.annualPrice) {
        calculatedAmount = plan.annualPrice;
      } else if (months === 6 && plan.semiAnnualPrice) {
        calculatedAmount = plan.semiAnnualPrice;
      } else if (months === 3 && plan.quarterlyPrice) {
        calculatedAmount = plan.quarterlyPrice;
      } else {
        calculatedAmount = monthly * months;
      }
    }

    shop.subscription.plan = planId;
    shop.subscription.status = 'active';
    shop.subscription.currentPeriodStart = periodStart;
    shop.subscription.currentPeriodEnd = periodEnd;
    shop.subscription.durationMonths = months;
    shop.subscription.autoRenew = false;
    shop.features = plan.features;
    shop.limits = plan.limits;
    shop.updatedBy = req.userId;
    await shop.save();

    const subscription = await BillingSubscription.findOneAndUpdate(
      { shopId: shop._id, status: { $in: ['pending', 'active', 'past_due'] } },
      {
        shopId: shop._id,
        plan: plan._id,
        status: 'active',
        lifecycle: 'admin_assignment',
        billingCycleMonths: months,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        autoRenew: false,
        metadata: { assignedBy: req.userId },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Build transaction metadata
    const transactionMeta = {
      reason: 'Plan assigned by super admin',
      paymentType: 'offline',
    };
    if (paymentMethod) transactionMeta.paymentMethod = paymentMethod;
    if (paymentReference) transactionMeta.paymentReference = paymentReference;
    if (paymentNotes) transactionMeta.paymentNotes = paymentNotes;

    await BillingTransaction.create({
      shopId: shop._id,
      subscription: subscription._id,
      plan: plan._id,
      type: calculatedAmount > 0 ? 'purchase' : 'adjustment',
      status: 'captured',
      amount: calculatedAmount,
      amountPaid: calculatedAmount,
      billingCycleMonths: months,
      periodStart: periodStart,
      periodEnd,
      invoiceNumber: `ADMIN-${Date.now()}-${shop._id.toString().slice(-6)}`,
      idempotencyKey: `admin:${shop._id}:${plan._id}:${Date.now()}`,
      paidAt: new Date(),
      createdBy: req.userId,
      metadata: transactionMeta,
    });

    res.json({ success: true, message: 'Plan assigned to shop', data: shop });
  } catch (error) { next(error); }
};
exports.getShopSubscription = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.shopId).populate('subscription.plan');
    if (!shop) throw new AppError('Shop not found', 404);
    res.json({ success: true, data: shop.subscription });
  } catch (error) { next(error); }
};
