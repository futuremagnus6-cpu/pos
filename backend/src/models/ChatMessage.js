const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['shop_admin', 'super_admin', 'manager', 'staff'], required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, description: 'For internal team messages between shop users' },
  message: { type: String, required: true },
  isBroadcast: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
}, {
  timestamps: true,
});

chatMessageSchema.index({ shopId: 1, createdAt: -1 });
chatMessageSchema.index({ sender: 1, receiverId: 1, createdAt: -1 });
chatMessageSchema.index({ receiverId: 1, sender: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
