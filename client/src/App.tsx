import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, MessageSquare, XCircle, Trash2 } from 'lucide-react';

interface Message {
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [hasPendingBotResponse, setHasPendingBotResponse] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [participantToken, setParticipantToken] = useState<string | null>(null);
  const [connectionToken, setConnectionToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const notificationSoundRef = useRef<HTMLAudioElement>(new Audio('/pop-up-bubble-gfx-sounds-1-00-00.mp3'));
  const wsRef = useRef<WebSocket | null>(null);

  const initializeChat = useCallback(async () => {
    setIsChatLoading(true);
    try {
      const response = await fetch('http://localhost:5001/api/start-chat', { //change port number
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      const { contactId, participantToken, websocketUrl, connectionToken } = data;

      if (!contactId || !participantToken || !websocketUrl) throw new Error('Missing required data');

      setContactId(contactId);
      setParticipantToken(participantToken);
      setWsUrl(websocketUrl);
      setConnectionToken(connectionToken)

      const ws = new WebSocket(websocketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            topic: 'aws/subscribe',
            content: { topics: ['aws/chat', 'aws/typing'] },
          })
        );
        setIsChatLoading(false);
      };

      ws.onmessage = (event) => {
        try {
          const receivedData = JSON.parse(event.data);
          if (receivedData.topic === 'aws/chat') {
            const chatContent = JSON.parse(receivedData.content);
            if (chatContent.Type === 'MESSAGE') {
              const isCustomerMessage = chatContent.ParticipantRole === 'CUSTOMER';
              const newMessage: Message = {
                content: chatContent.Content,
                sender: isCustomerMessage ? 'user' : 'bot',
                timestamp: new Date(chatContent.AbsoluteTime),
              };

              if (!isCustomerMessage) {
                setMessages((prev) => {
                  const updated = prev.map((msg) =>
                    msg.isLoading && msg.sender === 'user' ? { ...msg, isLoading: false } : msg
                  );
                  return [...updated, newMessage];
                });
                setHasPendingBotResponse(false);
                notificationSoundRef.current?.play();
                if (!isWidgetOpen) setHasNewMessage(true);
              }
            }
          } else if (receivedData.topic === 'aws/typing') {
            const typingContent = JSON.parse(receivedData.content);
            if (typingContent.Type === 'TYPING') {
              setIsTyping(typingContent.State === 'STARTED' && typingContent.ParticipantRole !== 'CUSTOMER');
            }
          }
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setIsChatLoading(false);
      };

      ws.onclose = () => setIsChatLoading(false);
    } catch (err) {
      console.error('Chat initialization failed:', err);
      setIsChatLoading(false);
    }
  }, [isWidgetOpen]);

  useEffect(() => {
    if (isWidgetOpen) {
      initializeChat();
    } else {
      // Do not close WebSocket when minimized
      setMessages((prev) => prev);
      setIsTyping(false);
      setInput('');
      setHasPendingBotResponse(false);
    }
  }, [isWidgetOpen, initializeChat]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !contactId || !participantToken || !wsUrl) return;

    const userMessage: Message = {
      content: input,
      sender: 'user',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setHasPendingBotResponse(true);

    try {
      await fetch('http://localhost:5001/api/send-message', { //change port number
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionToken, content: userMessage.content }),
      });

      wsRef.current?.send(
        JSON.stringify({
          topic: 'aws/typing',
          content: { Type: 'TYPING', State: 'STOPPED' },
        })
      );
    } catch (err) {
      console.error('Message failed:', err);
    }
  };

  const handleEndChat = () => {
    if (wsRef.current) wsRef.current.close();
    setMessages([]);
    setInput('');
    setIsTyping(false);
    setHasPendingBotResponse(false);
    setContactId(null);
    setParticipantToken(null);
    wsRef.current = null;
  };

  const handleClearMessages = () => {
    setMessages([]);
  };

  const handleMinimizeChat = () => {
    setIsWidgetOpen(false); // Minimize chat (do not close WebSocket)
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end space-y-2">
      {isWidgetOpen && (
        <div className="w-[800px] h-[700px] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col relative">
          <div className="bg-blue-700 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-white" />
              <h1 className="text-lg font-bold text-white">Name Here Assistant Chatbot</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClearMessages}
                title="Clear Messages"
                className="text-white hover:text-red-300"
              >
                <Trash2 className="w-6 h-6" />
              </button>
              <button
                onClick={handleMinimizeChat}
                title="Minimize Chat"
                className="text-white hover:text-red-500"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
            {isChatLoading && messages.length === 0 && (
              <div className="absolute inset-0 flex justify-center items-center bg-white z-10">
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full border-t-2 border-b-2 border-blue-600 w-12 h-12 mb-4"></div>
                  <p className="text-lg text-gray-500">Loading...</p>
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <div key={index} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.sender === 'user' ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  {msg.sender === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-5 h-5 text-gray-700" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] rounded-lg p-3 text-sm ${
                    msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {(isTyping || hasPendingBotResponse) && (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-gray-700" />
                </div>
                <div className="flex gap-1 p-3 bg-gray-100 rounded-lg">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-300" />
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 p-2 border rounded-md"
                placeholder="Type your message"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white p-2 rounded-full"
                title="Send Message"
              >
                <Send />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Minimized Chat Icon */}
      {!isWidgetOpen && (
        <button
          onClick={() => setIsWidgetOpen(true)}
          title="Open Chat"
          className="p-3 rounded-full bg-blue-600 text-white shadow-lg"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

export default App;
