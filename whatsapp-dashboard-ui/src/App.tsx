// src/App.tsx
import { useState, useEffect } from 'react';
import { Search, Send, User, Package } from 'lucide-react';

export default function App() {
  // 1. State for our real database data
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");

  // 2. Automatically fetch customers when the Dashboard loads
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/customers');
        const data = await response.json();
        setCustomers(data);
        
        // Auto-select the first customer in the list so the screen isn't blank
        if (data.length > 0) {
          setSelectedCustomer(data[0]);
        }
      } catch (error) {
        console.error("Error fetching customers:", error);
      }
    };
    fetchCustomers();
  }, []);

  // 3. Fetch chat history automatically whenever you click a different customer
  useEffect(() => {
    if (!selectedCustomer) return;

    const fetchChat = async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/chat/${selectedCustomer.id}`);
        const data = await response.json();
        setChatHistory(data);
      } catch (error) {
        console.error("Error fetching chat:", error);
      }
    };
    fetchChat();
  }, [selectedCustomer]);

  // 4. Send a manual reply back to the server
  const handleSendMessage = async () => {
    if (!replyText.trim() || !selectedCustomer) return;

    try {
      const response = await fetch('http://localhost:3000/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          text: replyText
        })
      });

      if (response.ok) {
        // Optimistically update the UI so the message appears instantly
        setChatHistory(prev => [...prev, {
          id: Date.now(),
          direction: 'outbound',
          message_text: replyText,
          timestamp: new Date().toISOString()
        }]);
        setReplyText(""); // Clear the input box
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      
      {/* LEFT PANE: Customers List */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="text-blue-600" />
            Active Chats
          </h1>
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search customers..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {customers.map((customer) => (
            <div 
              key={customer.id}
              onClick={() => setSelectedCustomer(customer)}
              className={`p-4 border-b border-gray-100 cursor-pointer transition-colors duration-150 ease-in-out hover:bg-gray-50 
                ${selectedCustomer?.id === customer.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-gray-800">{customer.name}</span>
              </div>
              <p className="text-sm text-gray-600 truncate">+{customer.whatsapp_id}</p>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANE: Live Chat */}
      <div className="w-2/3 flex flex-col bg-slate-50">
        
        {selectedCustomer ? (
          <>
            {/* Header */}
            <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="text-gray-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{selectedCustomer.name}</h2>
                  <p className="text-sm text-gray-500">+{selectedCustomer.whatsapp_id}</p>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatHistory.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] p-3 rounded-lg shadow-sm
                    ${msg.direction === 'outbound' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}
                  >
                    <p className="text-sm">{msg.message_text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input Box */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={`Reply to ${selectedCustomer.name}...`}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={handleSendMessage}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a customer to view their chat history.
          </div>
        )}
      </div>

    </div>
  );
}