import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  FiSend, FiMessageSquare, FiUser, FiUsers, FiUserPlus, FiMail, FiClock,
  FiCheck, FiCheckCircle, FiRefreshCw, FiSearch, FiX,
  FiChevronLeft, FiShoppingBag, FiVolume2, FiMessageCircle,
  FiAlertCircle, FiHeadphones,
} from 'react-icons/fi';
import { apiService } from '../../services/api';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { user } = useSelector((state) => state.auth);
  const isSuperAdmin = user?.role === 'super_admin';

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [shopCount, setShopCount] = useState(0);
  // Team chat state
  const [chatTab, setChatTab] = useState('support'); // 'support' | 'team'
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedTeamMember, setSelectedTeamMember] = useState(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  // Track last known message IDs for toast notifications on new messages
  const lastMessageIds = useRef(new Set());
  const messagesEndRef = useRef(null);

  // Load total shop count for broadcast
  useEffect(() => {
    if (isSuperAdmin) {
      apiService.get('/shops?limit=1&page=1').then(res => {
        setShopCount(res.data?.pagination?.total || res.data?.total || 0);
      }).catch(() => {});
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadTeamMembers = async () => {
    setLoadingTeam(true);
    try {
      const res = await apiService.get('/chat/team');
      setTeamMembers(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load team members:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  // Load conversations (super admin) or messages (shop admin)
  useEffect(() => {
    if (isSuperAdmin) {
      loadConversations();
    } else if (chatTab === 'team') {
      loadTeamMembers();
    } else {
      loadMessages();
    }
  }, [chatTab]);

  // Load messages when shop changes (super admin)
  useEffect(() => {
    if (isSuperAdmin && selectedShopId) {
      loadMessages(selectedShopId);
    }
  }, [selectedShopId]);

  // Load team messages when selected team member changes
  useEffect(() => {
    if (!isSuperAdmin && selectedTeamMember && chatTab === 'team') {
      loadTeamMessages(selectedTeamMember);
    }
  }, [selectedTeamMember]);

  const loadConversations = async () => {
    try {
      const res = await apiService.get('/chat/conversations');
      const data = res.data?.data || [];
      setConversations(data);
      // Build unread map
      const unreadMap = {};
      data.forEach(c => { unreadMap[c.shopId] = c.unreadCount; });
      setUnreadCounts(unreadMap);
      // Auto-select first conversation with unread messages
      const withUnread = data.find(c => c.unreadCount > 0);
      if (withUnread) {
        setSelectedShopId(withUnread.shopId);
      } else if (data.length > 0) {
        setSelectedShopId(data[0].shopId);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check for new messages and show toast notifications
  const checkForNewMessages = useCallback((newMessages, currentIds) => {
    if (!newMessages || newMessages.length === 0) return;
    const knownIds = currentIds || lastMessageIds.current;
    newMessages.forEach(msg => {
      if (!knownIds.has(msg._id)) {
        // This is a new message we haven't seen before
        const isFromOther = isSuperAdmin
          ? msg.senderRole === 'shop_admin'
          : (chatTab === 'team'
            ? msg.sender !== user?._id && msg.sender?._id !== user?._id
            : msg.senderRole === 'super_admin');

        if (isFromOther) {
          // Determine the context for the toast message
          let title = msg.senderName || 'New message';
          let context = '';
          if (isSuperAdmin) {
            const conv = conversations.find(c => c.shopId === msg.shopId);
            context = conv?.shopName ? ` (${conv.shopName})` : '';
          } else if (chatTab === 'team') {
            context = ' (Team)';
          } else {
            context = ' (Support)';
          }
          const preview = msg.message?.length > 60 ? msg.message.slice(0, 60) + '...' : msg.message;
          toast(
            (t) => (
              <div className="flex items-start gap-2.5 min-w-[260px]">
                <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <FiMessageSquare className="w-3.5 h-3.5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {title}{context}
                  </p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                    {preview}
                  </p>
                </div>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 shrink-0"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </div>
            ),
            { duration: 5000, style: { background: 'transparent', boxShadow: 'none', padding: 0 } }
          );
        }
      }
    });
    // Update known IDs
    lastMessageIds.current = new Set(newMessages.map(m => m._id));
  }, [isSuperAdmin, user, conversations, chatTab]);

  // Update known message IDs (used for detecting new messages on next poll)
  const updateKnownIds = useCallback((newMessages) => {
    if (newMessages && newMessages.length > 0) {
      lastMessageIds.current = new Set(newMessages.map(m => m._id));
    }
  }, []);

  const loadTeamMessages = async (userId, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiService.get(`/chat/team/${userId}`);
      const newMessages = res.data?.data || [];
      // On silent polls with existing messages, check for new ones
      if (silent && messages.length > 0) {
        checkForNewMessages(newMessages);
      }
      // Always update known IDs so next poll can detect changes
      if (!silent) updateKnownIds(newMessages);
      setMessages(newMessages);
      // Refresh team members to update unread counts
      loadTeamMembers();
    } catch (err) {
      if (!silent) {
        console.error('Failed to load team messages:', err);
        setMessages([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMessages = async (shopId, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (shopId) params.shopId = shopId;
      const res = await apiService.get('/chat', { params });
      const newMessages = res.data?.data || [];
      // Check for new messages during silent polling
      if (silent && messages.length > 0) {
        checkForNewMessages(newMessages);
      }
      // Always update known IDs so next poll can detect changes
      if (!silent) updateKnownIds(newMessages);
      setMessages(newMessages);
      // Refresh conversations to update unread counts
      if (isSuperAdmin && !broadcastMode) loadConversations();
    } catch (err) {
      if (!silent) console.error('Failed to load messages:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Poll for new messages every 15 seconds (silent polling with toast detection)
  useEffect(() => {
    if (!loading && !broadcastMode) {
      const interval = setInterval(() => {
        if (isSuperAdmin && selectedShopId) {
          loadMessages(selectedShopId, true);
        } else if (!isSuperAdmin && chatTab === 'support') {
          loadMessages(null, true);
        } else if (!isSuperAdmin && chatTab === 'team' && selectedTeamMember) {
          loadTeamMessages(selectedTeamMember, true);
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [loading, isSuperAdmin, selectedShopId, broadcastMode, chatTab, selectedTeamMember]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      if (isSuperAdmin && broadcastMode) {
        // Broadcast to all shops
        const res = await apiService.post('/chat/broadcast', { message: newMessage.trim() });
        const count = res.data?.data?.count || 0;
        setNewMessage('');
        setBroadcastResult({ success: true, count });
        toast.success(`Broadcast sent to ${count} shop${count !== 1 ? 's' : ''}`);
        setTimeout(() => setBroadcastResult(null), 5000);
      } else if (!isSuperAdmin && chatTab === 'team' && selectedTeamMember) {
        // Internal team message
        const payload = { message: newMessage.trim(), receiverId: selectedTeamMember };
        await apiService.post('/chat', payload);
        setNewMessage('');
        loadTeamMessages(selectedTeamMember);
      } else {
        const payload = { message: newMessage.trim() };
        if (isSuperAdmin && selectedShopId) {
          payload.shopId = selectedShopId;
        }
        await apiService.post('/chat', payload);
        setNewMessage('');
        // Reload messages after sending
        if (!isSuperAdmin) {
          loadMessages();
        } else {
          loadMessages(selectedShopId);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Super admin layout with conversation list
  if (isSuperAdmin) {
    return (
      <div className="page-container h-[calc(100vh-4rem)]">
        <div className="flex h-full gap-0 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          {/* Conversation List */}
          <div className="w-72 lg:w-80 border-r dark:border-gray-700 flex flex-col shrink-0">
            <div className="p-4 border-b dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FiMessageSquare className="w-4 h-4 text-primary-500" />
                Shop Chats
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{conversations.length} conversations</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && conversations.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center text-gray-400">
                  <FiMessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs mt-1">Messages from shop admins will appear here</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.shopId}
                    onClick={() => setSelectedShopId(conv.shopId)}
                    className={`w-full text-left p-3 border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                      selectedShopId === conv.shopId ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                          <FiShoppingBag className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {conv.shopName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {conv.lastMessage?.message?.slice(0, 40) || 'No messages'}
                            {conv.lastMessage?.message?.length > 40 ? '...' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {conv.lastMessage?.createdAt ? formatTime(conv.lastMessage.createdAt) : ''}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary-600 text-white rounded-full min-w-[18px] text-center">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedShopId ? (
              <>
                {/* Chat Header */}
                <div className="p-3 border-b dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      {broadcastMode ? (
                        <FiVolume2 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      ) : (
                        <FiShoppingBag className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {broadcastMode ? 'Broadcast Message' : (conversations.find(c => c.shopId === selectedShopId)?.shopName || 'Shop')}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {broadcastMode ? `Will be sent to ${shopCount} shop${shopCount !== 1 ? 's' : ''}` : `${messages.length} messages`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 flex">
                      <button
                        onClick={() => { setBroadcastMode(false); setBroadcastResult(null); }}
                        className={`p-1.5 rounded-md text-xs transition-colors ${
                          !broadcastMode
                            ? 'bg-white dark:bg-gray-600 shadow-sm text-primary-600 dark:text-primary-400'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                        title="Individual chat"
                      >
                        <FiMessageCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setBroadcastMode(true); setSelectedShopId(null); }}
                        className={`p-1.5 rounded-md text-xs transition-colors ${
                          broadcastMode
                            ? 'bg-white dark:bg-gray-600 shadow-sm text-primary-600 dark:text-primary-400'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                        title="Broadcast to all shops"
                      >
                        <FiVolume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => !broadcastMode && loadMessages(selectedShopId)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                      title="Refresh"
                    >
                      <FiRefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Messages OR Broadcast compose */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
                  {broadcastMode ? (
                    <div className="flex flex-col h-full">
                      {/* Info banner */}
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2.5">
                        <FiAlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Broadcast Mode</p>
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                            This message will be sent to <strong>{shopCount} shop{shopCount !== 1 ? 's' : ''}</strong> simultaneously.
                            Shop admins will see this as a broadcast message in their chat.
                          </p>
                        </div>
                      </div>

                      {/* Broadcast result */}
                      {broadcastResult && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-center gap-2.5">
                          <FiCheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <p className="text-xs text-emerald-800 dark:text-emerald-300">
                            ✓ Successfully sent to <strong>{broadcastResult.count} shop{broadcastResult.count !== 1 ? 's' : ''}</strong>
                          </p>
                        </div>
                      )}

                      {/* Broadcast message preview */}
                      {newMessage.trim() && (
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <FiVolume2 className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                              Broadcast Preview
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-primary-600 text-white text-sm rounded-br-md">
                            <p className="whitespace-pre-wrap break-words">{newMessage}</p>
                          </div>
                        </div>
                      )}

                      {!newMessage.trim() && !broadcastResult && (
                        <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
                          <FiVolume2 className="w-12 h-12 mb-3 opacity-30" />
                          <p className="text-sm font-medium">Compose a broadcast message</p>
                          <p className="text-xs mt-1 text-center px-8">
                            Type your message below and it will be sent to all active shops at once
                          </p>
                        </div>
                      )}
                    </div>
                  ) : loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                          <div className={`h-10 ${i % 2 === 0 ? 'w-48' : 'w-36'} bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse`} />
                        </div>
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <FiMessageSquare className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">No messages yet</p>
                      <p className="text-xs mt-1">Send a message to start the conversation</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMine = msg.senderRole === 'super_admin';
                      return (
                        <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] lg:max-w-[60%]`}>
                            <div className={`flex items-center gap-1.5 mb-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-[10px] font-medium text-gray-500">
                                {isMine ? 'You' : msg.senderName || msg.senderRole}
                              </span>
                              <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                            </div>
                            <div className={`p-2.5 rounded-xl text-sm relative ${
                              isMine
                                ? 'bg-primary-600 text-white rounded-br-md'
                                : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border dark:border-gray-600 rounded-bl-md'
                            }`}>
                              {msg.isBroadcast && !isMine && (
                                <div className="flex items-center gap-1 mb-1 pb-1 border-b border-white/20 dark:border-gray-500/30">
                                  <FiVolume2 className="w-3 h-3 text-amber-300 dark:text-amber-400" />
                                  <span className="text-[9px] font-semibold text-amber-300 dark:text-amber-400 uppercase tracking-wider">
                                    Broadcast
                                  </span>
                                </div>
                              )}
                              {msg.isBroadcast && isMine && (
                                <div className="flex items-center gap-1 mb-1 pb-1 border-b border-white/20">
                                  <FiVolume2 className="w-3 h-3 text-amber-300" />
                                  <span className="text-[9px] font-semibold text-amber-300 uppercase tracking-wider">
                                    Broadcast
                                  </span>
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              {msg.read && (
                                <span className="text-[10px] text-primary-500 flex items-center gap-0.5">
                                  <FiCheckCircle className="w-3 h-3" /> Read
                                </span>
                              )}
                              {!msg.read && isMine && (
                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                  <FiCheck className="w-3 h-3" /> Sent
                                </span>
                              )}
                              {msg.isBroadcast && isMine && (
                                <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                                  <FiVolume2 className="w-3 h-3" /> Broadcast
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    {broadcastMode ? (
                      <>
                        <textarea
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type your broadcast message..."
                          className="input-field flex-1 text-sm resize-none"
                          rows={2}
                          disabled={sending}
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!newMessage.trim() || sending}
                          className="btn-primary p-2.5 rounded-lg disabled:opacity-50 bg-amber-600 hover:bg-amber-700"
                          title="Broadcast to all shops"
                        >
                          {sending ? (
                            <FiRefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <FiVolume2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type your message..."
                          className="input-field flex-1 text-sm"
                          disabled={sending}
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!newMessage.trim() || sending}
                          className="btn-primary p-2.5 rounded-lg disabled:opacity-50"
                        >
                          {sending ? (
                            <FiRefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <FiSend className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <FiMessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Select a conversation</p>
                  <p className="text-xs mt-1">Choose a shop from the list to view messages</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Shop Admin Chat View ───
  // If a team member is selected, show their chat; otherwise show the tab view
  if (!isSuperAdmin && selectedTeamMember && chatTab === 'team') {
    const member = teamMembers.find(m => m.userId === selectedTeamMember);
    return (
      <div className="page-container h-[calc(100vh-4rem)]">
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedTeamMember(null); setMessages([]); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 mr-1"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <FiUser className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {member?.name || 'Team Member'}
                </p>
                <p className="text-[10px] text-gray-500 capitalize">{member?.role || ''}</p>
              </div>
            </div>
            <button
              onClick={() => loadTeamMessages(selectedTeamMember)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              title="Refresh"
            >
              <FiRefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <div className={`h-10 ${i % 2 === 0 ? 'w-48' : 'w-36'} bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse`} />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <FiUser className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1 text-center">Send a message to start the conversation</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender?._id === user?._id || msg.sender === user?._id;
                return (
                  <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] lg:max-w-[60%]`}>
                      <div className={`flex items-center gap-1.5 mb-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] font-medium text-gray-500">
                          {isMine ? 'You' : msg.senderName || 'Team Member'}
                        </span>
                        <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                      </div>
                      <div className={`p-2.5 rounded-xl text-sm ${
                        isMine
                          ? 'bg-violet-600 text-white rounded-br-md'
                          : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border dark:border-gray-600 rounded-bl-md'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        {msg.read && (
                          <span className="text-[10px] text-violet-500 flex items-center gap-0.5">
                            <FiCheckCircle className="w-3 h-3" /> Read
                          </span>
                        )}
                        {!msg.read && isMine && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                            <FiCheck className="w-3 h-3" /> Sent
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="input-field flex-1 text-sm"
                disabled={sending}
                autoFocus
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="btn-primary p-2.5 rounded-lg disabled:opacity-50 bg-violet-600 hover:bg-violet-700"
              >
                {sending ? (
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FiSend className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── Shop Admin: Main view (Support tab + Team tab switcher) ───
  return (
    <div className="page-container h-[calc(100vh-4rem)]">
      <div className="flex h-full gap-0 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
        {/* Left panel — tab switcher + list */}
        <div className="w-64 lg:w-72 border-r dark:border-gray-700 flex flex-col shrink-0">
          {/* Tabs */}
          <div className="p-3 border-b dark:border-gray-700">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 flex">
              <button
                onClick={() => { setChatTab('support'); setSelectedTeamMember(null); setMessages([]); }}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  chatTab === 'support'
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <FiMessageSquare className="w-3.5 h-3.5 inline mr-1" />
                Support
              </button>
              <button
                onClick={() => { setChatTab('team'); setMessages([]); loadTeamMembers(); }}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  chatTab === 'team'
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-violet-600 dark:text-violet-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <FiUsers className="w-3.5 h-3.5 inline mr-1" />
                Team
              </button>
            </div>
          </div>

          {/* List content */}
          <div className="flex-1 overflow-y-auto">
            {chatTab === 'support' ? (
              <>
                <div className="p-3 border-b dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/20">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <FiMessageCircle className="w-3 h-3" />
                    Magnus OS Support
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedTeamMember(null); loadMessages(); }}
                  className={`w-full text-left p-3 border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                    !selectedTeamMember ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                      <FiHeadphones className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Support Chat</p>
                      <p className="text-xs text-gray-500 truncate">
                        {messages[messages.length - 1]?.message?.slice(0, 40) || 'Talk to the Magnus OS team'}
                        {messages[messages.length - 1]?.message?.length > 40 ? '...' : ''}
                      </p>
                    </div>
                  </div>
                </button>
              </>
            ) : (
              /* Team member list */
              <div>
                <div className="p-3 border-b dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/20">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <FiUsers className="w-3 h-3" />
                    {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {loadingTeam && teamMembers.length === 0 ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="p-6 text-center text-gray-400">
                    <FiUserPlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No team members yet</p>
                    <p className="text-xs mt-1">Add employees with login access to chat with them</p>
                  </div>
                ) : (
                  teamMembers.map((member) => (
                    <button
                      key={member.userId}
                      onClick={() => setSelectedTeamMember(member.userId)}
                      className={`w-full text-left p-3 border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                        selectedTeamMember === member.userId ? 'bg-violet-50 dark:bg-violet-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                            <FiUser className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {member.name}
                              </p>
                              <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                {member.role === 'shop_admin' ? 'Admin' : member.role === 'manager' ? 'Mgr' : ''}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {member.lastMessage?.message?.slice(0, 35) || 'No messages yet'}
                              {member.lastMessage?.message?.length > 35 ? '...' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                          {member.lastMessage?.createdAt && (
                            <span className="text-[10px] text-gray-400 whitespace-nowrap">
                              {formatTime(member.lastMessage.createdAt)}
                            </span>
                          )}
                          {member.unreadCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-600 text-white rounded-full min-w-[18px] text-center">
                              {member.unreadCount > 99 ? '99+' : member.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {chatTab === 'support' ? (
            <>
              {/* Support Chat Header */}
              <div className="p-3 border-b dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <FiHeadphones className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Support Chat</p>
                    <p className="text-[10px] text-gray-500">{messages.length} messages</p>
                  </div>
                </div>
                <button
                  onClick={() => loadMessages()}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                  title="Refresh"
                >
                  <FiRefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                        <div className={`h-10 ${i % 2 === 0 ? 'w-48' : 'w-36'} bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse`} />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <FiMessageSquare className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs mt-1 text-center">Send a message to the Magnus OS support team</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderRole === 'shop_admin' || msg.sender?._id === user?._id || msg.sender === user?._id;
                    return (
                      <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] lg:max-w-[60%]`}>
                          <div className={`flex items-center gap-1.5 mb-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] font-medium text-gray-500">
                              {isMine ? 'You' : msg.senderName || 'Support Team'}
                            </span>
                            <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                          </div>
                          <div className={`p-2.5 rounded-xl text-sm relative ${
                            isMine
                              ? 'bg-primary-600 text-white rounded-br-md'
                              : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border dark:border-gray-600 rounded-bl-md'
                          }`}>
                            {msg.isBroadcast && (
                              <div className="flex items-center gap-1 mb-1 pb-1 border-b border-white/20 dark:border-gray-500/30">
                                <FiVolume2 className="w-3 h-3 text-amber-300 dark:text-amber-400" />
                                <span className="text-[9px] font-semibold text-amber-300 dark:text-amber-400 uppercase tracking-wider">
                                  Broadcast
                                </span>
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {msg.read && (
                              <span className="text-[10px] text-primary-500 flex items-center gap-0.5">
                                <FiCheckCircle className="w-3 h-3" /> Read
                              </span>
                            )}
                            {!msg.read && isMine && (
                              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                <FiCheck className="w-3 h-3" /> Sent
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="input-field flex-1 text-sm"
                    disabled={sending}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="btn-primary p-2.5 rounded-lg disabled:opacity-50"
                  >
                    {sending ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <FiSend className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Team member not selected — show prompt */
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <FiUsers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a team member</p>
                <p className="text-xs mt-1">Choose a colleague from the list to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
