import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { BsRobot } from 'react-icons/bs';
import { IoClose, IoSend, IoMic, IoMicOutline, IoVolumeHighOutline, IoVolumeMuteOutline } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import { toastManager } from '../../utils/toastManager';

const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const DEFAULT_WELCOME = "नमस्ते! 🙏 मैं Agroyilt का AI सहायक हूँ।\n\nआप ट्रैक्टर, कंबाइन या ड्रोन रेंटल, बीज व खाद ऑर्डर, लेबर बुकिंग या पेमेंट से जुड़े सवाल हिंदी या अंग्रेजी में पूछ सकते हैं। बोलकर भी पूछ सकते हैं!";

const QUICK_PROMPTS = [
  "🚜 ट्रैक्टर रेंटल कैसे बुक करें?",
  "🌾 बीज और खाद की डिलीवरी कब होगी?",
  "👨‍🌾 लेबर वर्कर बुकिंग सहायता",
  "💳 पेमेंट और रिफंड की जानकारी"
];

const Chatbot = ({ isOpen = false, onClose, initialPrompt = '' }) => {
  const [messages, setMessages] = useState([
    { text: DEFAULT_WELCOME, sender: 'bot', time: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [lastUsedVoice, setLastUsedVoice] = useState(false);
  const messagesEndRef = useRef(null);

  // Stop speech when modal closes or unmounts
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!isOpen && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isOpen]);

  // Handle auto-sending initialPrompt if provided
  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim()) {
      sendMessage(initialPrompt.trim());
    }
  }, [isOpen, initialPrompt]);

  const speakText = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      // Clean up emojis and markdown symbols for cleaner speech
      const clean = text.replace(/[*_#`~🚜🌾👨‍🌾💳🙏]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'hi-IN';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech error:', e);
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toastManager.info("माफ़ करें, आपका ब्राउज़र वॉइस इनपुट सपोर्ट नहीं करता है।");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'hi-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setLastUsedVoice(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev ? prev + " " + transcript : transcript);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error("Mic error:", err);
      setIsListening(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const sendMessage = async (textToSend) => {
    if (!textToSend || !textToSend.trim() || isLoading) return;

    const userMessage = textToSend.trim();
    setInput('');
    setMessages(prev => [...prev, { text: userMessage, sender: 'user', time: new Date() }]);
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/chat`, { message: userMessage });
      if (response.data && response.data.success) {
        const reply = response.data.reply;
        setMessages(prev => [...prev, { text: reply, sender: 'bot', time: new Date() }]);
        if (lastUsedVoice) speakText(reply);
      } else {
        const errorMsg = "माफ़ करें, कुछ तकनीकी समस्या आ गई है। कृपया थोड़ी देर बाद पुनः प्रयास करें।";
        setMessages(prev => [...prev, { text: errorMsg, sender: 'bot', time: new Date() }]);
        if (lastUsedVoice) speakText(errorMsg);
      }
    } catch (error) {
      console.error("Chatbot error:", error);
      const errorMsg = "माफ़ करें, सर्वर से कनेक्ट करने में समस्या हुई। कृपया इंटरनेट कनेक्शन जांचें।";
      setMessages(prev => [...prev, { text: errorMsg, sender: 'bot', time: new Date() }]);
      if (lastUsedVoice) speakText(errorMsg);
    } finally {
      setIsLoading(false);
      setLastUsedVoice(false);
    }
  };

  const handleFormSubmit = (e) => {
    e?.preventDefault();
    sendMessage(input);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
        {/* Backdrop click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ y: '100%', opacity: 0.5 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative bg-white w-full sm:max-w-md h-[90vh] sm:h-[640px] rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10 border border-slate-100"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white px-5 py-4 flex justify-between items-center shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-inner shrink-0">
                <BsRobot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-sm tracking-tight">Agroyilt AI Assistant</h3>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                </div>
                <p className="text-[10px] text-emerald-100 font-medium">कृषि व सहायता AI • 24/7 Voice & Hindi</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className={`p-2 rounded-xl transition-all active:scale-90 ${voiceEnabled ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50'}`}
                title={voiceEnabled ? "Mute Voice Replies" : "Enable Voice Replies"}
              >
                {voiceEnabled ? <IoVolumeHighOutline className="w-4 h-4" /> : <IoVolumeMuteOutline className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white active:scale-90 transition-all"
                aria-label="Close"
              >
                <IoClose className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50/70 flex flex-col gap-3.5 no-scrollbar">
            {messages.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-emerald-600 text-white rounded-br-xs shadow-md shadow-emerald-600/20 font-medium'
                        : 'bg-white text-slate-800 border border-slate-100 rounded-bl-xs shadow-sm font-normal'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 text-slate-700 px-4 py-3 rounded-2xl rounded-bl-xs shadow-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] font-bold text-slate-400 ml-1">सोच रहा है...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts (if chat has 1 or 2 messages) */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 bg-white border-t border-slate-100 overflow-x-auto flex gap-1.5 no-scrollbar shrink-0">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200/60 active:scale-95 transition-all text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={handleFormSubmit}
            className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0"
          >
            <button
              type="button"
              onClick={startListening}
              className={`p-2.5 rounded-full transition-all active:scale-90 shrink-0 ${
                isListening
                  ? 'bg-rose-100 text-rose-600 ring-2 ring-rose-400 animate-pulse'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="बोलकर पूछें (Voice Input)"
            >
              {isListening ? <IoMic className="w-5 h-5" /> : <IoMicOutline className="w-5 h-5" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "सुन रहा हूँ... बोलिए" : "अपना सवाल पूछें (उदा. ट्रैक्टर रेंटल)..."}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400"
            />

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all active:scale-90 shadow-md shadow-emerald-600/20 shrink-0"
            >
              <IoSend className="w-4 h-4 ml-0.5" />
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default Chatbot;
