const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Shop = require('../models/Shop');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { multiTenant } = require('../middleware/multiTenant');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticate);
router.use(multiTenant);

// GET /api/chat — fetch messages for the current user's context
router.get('/', async (req, res, next) => {
  try {
    const { shopId } = req.query;
    const user = await User.findById(req.userId);
    if (!user) throw new AppError('User not found', 404);

    const isSuperAdmin = user.role === 'super_admin';
    let query = {};

    if (isSuperAdmin) {
      // Super admin: filter by shopId, only support messages (no receiverId)
      if (shopId) {
        if (!mongoose.Types.ObjectId.isValid(shopId)) {
          throw new AppError('Invalid shop ID', 400);
        }
        query.shopId = shopId;
      }
      query.receiverId = null;
    } else {
      // Shop admin: only see support messages (no receiverId)
      query.shopId = req.shopId;
      query.receiverId = null;
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sender', 'name email role');

    // Mark unread messages as read for the current user (messages from others)
    const otherRole = isSuperAdmin ? 'shop_admin' : 'super_admin';
    await ChatMessage.updateMany(
      { ...query, senderRole: otherRole, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ success: true, data: messages.reverse() });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/team — fetch internal team conversations for the shop admin
router.get('/team', async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) throw new AppError('User not found', 404);

    // Only works for shop-level users (not super_admin)
    if (user.role === 'super_admin') {
      return res.json({ success: true, data: [] });
    }

    // Get all users in the same shop with manager/staff roles (excluding self)
    const teamUsers = await User.find({
      shopId: req.shopId,
      _id: { $ne: req.userId },
      role: { $in: ['shop_admin', 'manager', 'staff'] },
      isActive: true,
    }).select('name email role phone profileImage');

    // For each team member, find the last message and unread count
    const teamConversations = await Promise.all(teamUsers.map(async (member) => {
      // Find messages between current user and this team member
      const threadQuery = {
        shopId: req.shopId,
        receiverId: { $ne: null },
        $or: [
          { sender: req.userId, receiverId: member._id },
          { sender: member._id, receiverId: req.userId },
        ],
      };

      const lastMessage = await ChatMessage.findOne(threadQuery)
        .sort({ createdAt: -1 })
        .select('message createdAt sender');

      const unreadCount = await ChatMessage.countDocuments({
        ...threadQuery,
        sender: member._id,
        read: false,
      });

      return {
        userId: member._id,
        name: member.name,
        email: member.email,
        role: member.role,
        phone: member.phone,
        profileImage: member.profileImage,
        lastMessage,
        unreadCount,
      };
    }));

    // Sort: unread first, then by last message time
    teamConversations.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage?.createdAt?.getTime() || 0;
      const bTime = b.lastMessage?.createdAt?.getTime() || 0;
      return bTime - aTime;
    });

    res.json({ success: true, data: teamConversations });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/team/:userId — fetch messages with a specific team member
router.get('/team/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError('Invalid user ID', 400);
    }

    const user = await User.findById(req.userId);
    if (!user) throw new AppError('User not found', 404);

    // Verify the team member exists in the same shop
    const teamMember = await User.findOne({
      _id: userId,
      shopId: req.shopId,
      isActive: true,
    });
    if (!teamMember) throw new AppError('Team member not found', 404);

    // Get messages between these two users
    const messages = await ChatMessage.find({
      shopId: req.shopId,
      receiverId: { $ne: null },
      $or: [
        { sender: req.userId, receiverId: userId },
        { sender: userId, receiverId: req.userId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sender', 'name email role');

    // Mark messages from the team member as read
    await ChatMessage.updateMany(
      {
        shopId: req.shopId,
        sender: userId,
        receiverId: req.userId,
        read: false,
      },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ success: true, data: messages.reverse(), teamMember: { _id: teamMember._id, name: teamMember.name, role: teamMember.role, email: teamMember.email } });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/conversations — list all shops with unread counts (super admin only)
router.get('/conversations', authorize('super_admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'super_admin') {
      throw new AppError('Access denied', 403);
    }

    const conversations = await ChatMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$shopId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: { $cond: [{ $and: [{ $eq: ['$read', false] }, { $eq: ['$senderRole', 'shop_admin'] }] }, 1, 0] },
          },
          totalMessages: { $sum: 1 },
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
    ]);

    // Populate shop names
    const shopIds = conversations.map(c => c._id);
    const shops = await Shop.find({ _id: { $in: shopIds } }).select('name');
    const shopMap = {};
    shops.forEach(s => { shopMap[s._id.toString()] = s.name; });

    const result = conversations.map(c => ({
      shopId: c._id,
      shopName: shopMap[c._id.toString()] || 'Unknown Shop',
      lastMessage: c.lastMessage,
      unreadCount: c.unreadCount,
      totalMessages: c.totalMessages,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/chat — send a message
router.post('/', async (req, res, next) => {
  try {
    const { message, shopId, receiverId } = req.body;
    if (!message || !message.trim()) {
      throw new AppError('Message is required', 400);
    }

    const user = await User.findById(req.userId);
    if (!user) throw new AppError('User not found', 404);

    const isSuperAdmin = user.role === 'super_admin';

    // Determine the shop context
    let targetShopId;
    if (isSuperAdmin) {
      if (!shopId || !mongoose.Types.ObjectId.isValid(shopId)) {
        throw new AppError('Shop ID is required for super admin messages', 400);
      }
      targetShopId = shopId;
    } else {
      targetShopId = req.shopId;
    }

    // Validate receiverId for internal team messages
    let targetReceiverId = null;
    if (receiverId) {
      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        throw new AppError('Invalid receiver ID', 400);
      }
      // Verify the receiver exists in the same shop (for non-super admin)
      if (!isSuperAdmin) {
        const receiver = await User.findOne({ _id: receiverId, shopId: req.shopId, isActive: true });
        if (!receiver) throw new AppError('Receiver not found in your shop', 404);
      }
      targetReceiverId = receiverId;
    }

    const chatMessage = await ChatMessage.create({
      shopId: targetShopId,
      sender: req.userId,
      senderName: user.name,
      senderRole: user.role,
      receiverId: targetReceiverId,
      message: message.trim(),
    });

    // Emit socket event for real-time delivery
    const io = req.app.get('io');
    if (io) {
      if (targetReceiverId) {
        // Internal team message — emit to sender's and receiver's rooms
        io.to(`user:${targetReceiverId}`).emit('chat:newMessage', chatMessage);
        io.to(`user:${req.userId}`).emit('chat:newMessage', chatMessage);
      } else {
        // Support message
        io.to(`shop:${targetShopId}`).emit('chat:newMessage', chatMessage);
        io.emit('chat:newMessage', { ...chatMessage.toObject(), _isForSuperAdmin: isSuperAdmin ? false : true });
      }
    }

    res.status(201).json({ success: true, data: chatMessage });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/unread-count — get total unread message count for the current user
router.get('/unread-count', async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) throw new AppError('User not found', 404);

    const isSuperAdmin = user.role === 'super_admin';
    let totalUnread = 0;

    if (isSuperAdmin) {
      // Super admin: count unread support messages from shop admins
      totalUnread = await ChatMessage.countDocuments({
        receiverId: null,
        senderRole: 'shop_admin',
        read: false,
      });
    } else {
      // Shop user: count unread support messages from super admin
      const supportUnread = await ChatMessage.countDocuments({
        shopId: req.shopId,
        receiverId: null,
        senderRole: 'super_admin',
        read: false,
      });

      // Count unread team messages from other shop users
      const teamUnread = await ChatMessage.countDocuments({
        shopId: req.shopId,
        receiverId: req.userId,
        sender: { $ne: req.userId },
        read: false,
      });

      totalUnread = supportUnread + teamUnread;
    }

    res.json({ success: true, data: { totalUnread } });
  } catch (error) {
    next(error);
  }
});

// POST /api/chat/broadcast — send a message to ALL shops (super admin only)
router.post('/broadcast', authorize('super_admin'), async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      throw new AppError('Message is required', 400);
    }

    const user = await User.findById(req.userId);
    if (!user) throw new AppError('User not found', 404);

    // Get all active shops
    const shops = await Shop.find({ isActive: true }).select('_id name');
    if (shops.length === 0) {
      throw new AppError('No active shops to broadcast to', 400);
    }

    // Create a message document for every shop
    const messages = shops.map(shop => ({
      shopId: shop._id,
      sender: req.userId,
      senderName: user.name,
      senderRole: 'super_admin',
      message: message.trim(),
      isBroadcast: true,
    }));

    const created = await ChatMessage.insertMany(messages);

    // Emit socket events for real-time delivery to all shops
    const io = req.app.get('io');
    if (io) {
      created.forEach(msg => {
        io.to(`shop:${msg.shopId}`).emit('chat:newMessage', msg);
      });
      let broadcastSummary = { ...created[0].toObject(), _isBroadcast: true, _shopCount: created.length };
      // Remove shopId from the summary to not confuse super admin's socket listener
      delete broadcastSummary.shopId;
      io.emit('chat:newMessage', broadcastSummary);
    }

    res.status(201).json({
      success: true,
      data: { count: created.length, shopNames: shops.map(s => s.name) },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/chat/:id/read — mark a message as read
router.put('/:id/read', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('Invalid message ID', 400);
    }

    const msg = await ChatMessage.findByIdAndUpdate(
      req.params.id,
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!msg) throw new AppError('Message not found', 404);

    res.json({ success: true, data: msg });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
