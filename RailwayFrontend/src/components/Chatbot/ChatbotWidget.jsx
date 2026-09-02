import { useState, useRef, useEffect } from 'react';

import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  Info,
  Sparkles,
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import api from '@/api/axios';
import { clsx } from 'clsx';


/*
|--------------------------------------------------------------------------
| Chatbot Widget
|--------------------------------------------------------------------------
|
| The chatbot is intentionally styled as a self-contained UI component.
|
| A number of the styles below are explicitly defined instead of relying
| only on Tailwind so that global styles from the application do not
| accidentally change the chatbot's width, alignment, buttons, inputs,
| typography, etc.
|
*/


export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const [messages, setMessages] = useState([]);

  const [input, setInput] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  const [sessionId, setSessionId] = useState(null);

  // Service information card
  const [showServiceInfo, setShowServiceInfo] = useState(true);

  const messagesEndRef = useRef(null);

  const inputRef = useRef(null);


  // -----------------------------------------------------------------------
  // LOAD SESSION
  // -----------------------------------------------------------------------

  useEffect(() => {
    const savedSessionId =
      localStorage.getItem('chatbot_session_id');

    if (savedSessionId) {
      setSessionId(savedSessionId);
    }
  }, []);


  // -----------------------------------------------------------------------
  // AUTO SCROLL
  // -----------------------------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [messages, isLoading]);


  // -----------------------------------------------------------------------
  // FOCUS INPUT
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen]);


  // -----------------------------------------------------------------------
  // SEND MESSAGE
  // -----------------------------------------------------------------------

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    /*
     * Once the actual conversation starts,
     * remove the service information card.
     */
    setShowServiceInfo(false);

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [
      ...prev,
      userMessage,
    ]);

    setInput('');

    setIsLoading(true);

    try {
      const response = await api.post(
        '/chatbot/send',
        {
          message: text,
          session_id: sessionId,
          language: 'myanmar',
          use_live_data: true,
        }
      );

      // Save session
      if (response.data.session_id) {
        setSessionId(response.data.session_id);

        localStorage.setItem(
          'chatbot_session_id',
          response.data.session_id
        );
      }

      const botMessage = {
        role: 'assistant',
        content: response.data.response,
        intent: response.data.intent,
        isLiveData: response.data.is_live_data,
        timestamp: new Date(),
      };

      setMessages((prev) => [
        ...prev,
        botMessage,
      ]);
    } catch (error) {
      console.error('Chatbot error:', error);

      /*
       * Kept only for normal application behavior.
       * The UI itself does not treat this as part of the design.
       */
      const errorMessage = {
        role: 'assistant',
        content:
          'ဝမ်းနည်းပါသည်။ လက်ရှိတွင် ချိတ်ဆက်မှု ပြဿနာရှိနေပါသည်။',
        isError: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [
        ...prev,
        errorMessage,
      ]);
    } finally {
      setIsLoading(false);
    }
  };


  // -----------------------------------------------------------------------
  // SUBMIT
  // -----------------------------------------------------------------------

  const handleSubmit = (e) => {
    e.preventDefault();

    sendMessage(input);
  };


  // -----------------------------------------------------------------------
  // ENTER
  // -----------------------------------------------------------------------

  const handleKeyDown = (e) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey
    ) {
      e.preventDefault();

      sendMessage(input);
    }
  };


  // -----------------------------------------------------------------------
  // SHARED STYLES
  // -----------------------------------------------------------------------

  const fullWidthStyle = {
    width: '100%',
    maxWidth: 'none',
    minWidth: 0,
    boxSizing: 'border-box',
  };


  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  return (
    <>
      {/* ==================================================================
          FLOATING CHAT BUTTON
      ================================================================== */}

      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{
              opacity: 0,
              scale: 0.75,
              y: 12,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.75,
              y: 12,
            }}
            transition={{
              duration: 0.2,
            }}
            onClick={() => setIsOpen(true)}
            whileHover={{
              scale: 1.05,
            }}
            whileTap={{
              scale: 0.95,
            }}
            aria-label="အကူအညီရယူရန်"
            className="
              !fixed
              !z-[9999]
              !right-4
              !bottom-4
              sm:!right-6
              sm:!bottom-6
              !w-14
              !h-14
              sm:!w-16
              sm:!h-16
              !p-0
              !m-0
              !border-0
              !outline-none
              !rounded-2xl
              !flex
              !items-center
              !justify-center
              !bg-gradient-to-br
              !from-blue-700
              !via-blue-600
              !to-sky-500
              !text-white
              !shadow-xl
              !shadow-blue-900/25
              hover:!shadow-2xl
              !transition-all
            "
            style={{
              boxSizing: 'border-box',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            <MessageCircle
              size={26}
              strokeWidth={2}
            />

            {/* Online status */}
            <span
              className="
                !absolute
                !right-1
                !top-1
                !w-3.5
                !h-3.5
                !rounded-full
                !bg-emerald-400
                !border-2
                !border-white
              "
            />
          </motion.button>
        )}
      </AnimatePresence>


      {/* ==================================================================
          CHAT WINDOW
      ================================================================== */}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{
              opacity: 0,
              y: 18,
              scale: 0.97,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: 18,
              scale: 0.97,
            }}
            transition={{
              duration: 0.22,
              ease: 'easeOut',
            }}

            /*
             * IMPORTANT:
             *
             * `isolation: isolate` prevents z-index and blending behavior
             * from leaking between the chatbot and the rest of the page.
             */
            style={{
              position: 'fixed',
              zIndex: 9999,

              right: '24px',
              bottom: '24px',

              width: '470px',
              maxWidth: 'calc(100vw - 24px)',

              height: 'min(680px, calc(100svh - 40px))',
              minHeight: '460px',
              maxHeight: 'calc(100svh - 40px)',

              display: 'flex',
              flexDirection: 'column',

              margin: 0,
              padding: 0,

              overflow: 'hidden',

              boxSizing: 'border-box',

              background: '#ffffff',

              border: '1px solid rgba(226, 232, 240, 0.9)',

              borderRadius: '28px',

              isolation: 'isolate',

              boxShadow:
                '0 25px 60px rgba(15, 23, 42, 0.22)',

              fontFamily:
                'inherit',
            }}

            className="
              chatbot-widget-root
              !flex
              !flex-col
              !overflow-hidden
            "
          >

            {/* ==============================================================
                HEADER
            ============================================================== */}

            <div
              style={{
                ...fullWidthStyle,

                flex: '0 0 72px',

                height: '72px',
                minHeight: '72px',
                maxHeight: '72px',

                display: 'flex',
                alignItems: 'center',

                margin: 0,

                padding:
                  '0 16px',

                boxSizing: 'border-box',

                position: 'relative',

                overflow: 'hidden',

                color: '#ffffff',

                background:
                  'linear-gradient(135deg, #1d4ed8 0%, #2563eb 52%, #0284c7 100%)',
              }}

              className="
                chatbot-header
                !w-full
                !max-w-none
                !min-w-0
                !flex
                !items-center
                !shrink-0
                !m-0
                !border-0
              "
            >

              {/* Decorative circles */}

              <div
                style={{
                  position: 'absolute',
                  right: '-35px',
                  top: '-65px',

                  width: '145px',
                  height: '145px',

                  borderRadius: '9999px',

                  background:
                    'rgba(255,255,255,0.08)',

                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  right: '80px',
                  bottom: '-60px',

                  width: '120px',
                  height: '120px',

                  borderRadius: '9999px',

                  background:
                    'rgba(125,211,252,0.10)',

                  pointerEvents: 'none',
                }}
              />


              {/* Header content */}

              <div
                style={{
                  position: 'relative',

                  width: '100%',

                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',

                  minWidth: 0,
                }}
              >

                {/* Left */}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',

                    gap: '11px',

                    minWidth: 0,

                    flex: '1 1 auto',
                  }}
                >

                  {/* Small robot */}

                  <div
                    style={{
                      position: 'relative',

                      flex: '0 0 40px',

                      width: '40px',
                      height: '40px',

                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',

                      borderRadius: '13px',

                      background:
                        'rgba(255,255,255,0.13)',

                      border:
                        '1px solid rgba(255,255,255,0.20)',

                      color: '#ffffff',

                      boxSizing: 'border-box',
                    }}
                  >
                    <Bot
                      size={20}
                      strokeWidth={1.9}
                    />

                    {/* Online indicator */}

                    <span
                      style={{
                        position: 'absolute',

                        right: '-3px',
                        bottom: '-3px',

                        width: '11px',
                        height: '11px',

                        borderRadius: '9999px',

                        background: '#10b981',

                        border:
                          '2px solid #2563eb',
                      }}
                    />
                  </div>


                  {/* Header text */}

                  <div
                    style={{
                      minWidth: 0,
                      flex: '1 1 auto',
                    }}
                  >
                    <div
                      style={{
                        margin: 0,

                        fontSize: '16px',
                        lineHeight: '1.3',

                        fontWeight: 700,

                        color: '#ffffff',

                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      မီးရထား အကူအညီ
                    </div>

                    <div
                      style={{
                        marginTop: '2px',

                        fontSize: '11px',
                        lineHeight: '1.3',

                        fontWeight: 400,

                        color:
                          'rgba(219,234,254,0.95)',

                        whiteSpace: 'nowrap',
                      }}
                    >
                      Railway Customer Support
                    </div>
                  </div>

                </div>


                {/* Close button */}

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="ချတ်ကို ပိတ်ရန်"

                  style={{
                    flex: '0 0 38px',

                    width: '38px',
                    height: '38px',

                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',

                    margin: 0,
                    padding: 0,

                    border: '0',

                    borderRadius: '12px',

                    background:
                      'rgba(255,255,255,0.10)',

                    color: '#ffffff',

                    cursor: 'pointer',

                    boxSizing: 'border-box',

                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}

                  className="
                    !flex
                    !items-center
                    !justify-center
                    !p-0
                    !m-0
                    !border-0
                    !text-white
                    hover:!bg-white/20
                  "
                >
                  <X size={19} />
                </button>

              </div>
            </div>


            {/* ==============================================================
                SERVICE INFORMATION
            ============================================================== */}

            <AnimatePresence initial={false}>
              {showServiceInfo && (
                <motion.div
                  initial={{
                    opacity: 0,
                    height: 0,
                  }}
                  animate={{
                    opacity: 1,
                    height: 'auto',
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                  }}
                  transition={{
                    duration: 0.2,
                  }}

                  style={{
                    ...fullWidthStyle,

                    flex: '0 0 auto',

                    overflow: 'hidden',

                    margin: 0,
                    padding: 0,
                  }}

                  className="
                    !w-full
                    !max-w-none
                    !min-w-0
                    !m-0
                    !p-0
                  "
                >

                  <div
                    style={{
                      ...fullWidthStyle,

                      padding:
                        '14px 14px 0',

                      boxSizing: 'border-box',
                    }}
                  >

                    <div
                      style={{
                        position: 'relative',

                        width: '100%',

                        display: 'flex',

                        gap: '11px',

                        boxSizing: 'border-box',

                        padding:
                          '13px 42px 13px 13px',

                        borderRadius: '18px',

                        border:
                          '1px solid #dbeafe',

                        background:
                          '#eff6ff',

                        color: '#1e40af',
                      }}
                    >

                      {/* Info icon */}

                      <div
                        style={{
                          flex: '0 0 36px',

                          width: '36px',
                          height: '36px',

                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',

                          borderRadius: '12px',

                          background:
                            '#dbeafe',

                          color: '#2563eb',
                        }}
                      >
                        <Info size={18} />
                      </div>


                      {/* Information */}

                      <div
                        style={{
                          minWidth: 0,
                          flex: '1 1 auto',
                        }}
                      >

                        <div
                          style={{
                            margin: 0,

                            fontSize: '13px',
                            lineHeight: '1.4',

                            fontWeight: 700,

                            color: '#1e40af',
                          }}
                        >
                          ဝန်ဆောင်မှုအချက်အလက်
                        </div>


                        <div
                          style={{
                            marginTop: '4px',

                            fontSize: '11px',
                            lineHeight: '1.6',

                            fontWeight: 400,

                            color: '#2563eb',
                          }}
                        >
                          ရထားအချိန်ဇယား၊ လက်မှတ်ခနှုန်းနှင့်
                          ထိုင်ခုံရရှိနိုင်မှုကဲ့သို့သော
                          အချက်အလက်များကို လက်ရှိတွင်{' '}
                          <strong>
                            ပြည် - ရန်ကုန်
                          </strong>{' '}
                          လမ်းကြောင်းအတွက်သာ
                          အချိန်နှင့်တပြေးညီ
                          ရယူနိုင်ပါသည်။
                        </div>

                      </div>


                      {/* Dismiss */}

                      <button
                        type="button"
                        onClick={() =>
                          setShowServiceInfo(false)
                        }

                        aria-label="အချက်အလက်ကို ဖျောက်ရန်"

                        style={{
                          position: 'absolute',

                          top: '8px',
                          right: '8px',

                          width: '26px',
                          height: '26px',

                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',

                          padding: 0,
                          margin: 0,

                          border: 0,

                          borderRadius: '8px',

                          background:
                            'transparent',

                          color: '#60a5fa',

                          cursor: 'pointer',

                          appearance: 'none',
                        }}

                        className="
                          !flex
                          !items-center
                          !justify-center
                          !p-0
                          !m-0
                          !border-0
                          hover:!bg-blue-100
                          hover:!text-blue-700
                        "
                      >
                        <X size={15} />
                      </button>

                    </div>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>


            {/* ==============================================================
                MESSAGE AREA
            ============================================================== */}

            <div
              style={{
                ...fullWidthStyle,

                flex: '1 1 auto',

                minHeight: 0,

                overflowY: 'auto',
                overflowX: 'hidden',

                margin: 0,

                padding:
                  '16px',

                boxSizing: 'border-box',

                background:
                  'linear-gradient(to bottom, #f8fafc, #ffffff)',
              }}

              className="
                chatbot-messages
                !w-full
                !max-w-none
                !min-w-0
                !flex-1
                !m-0
              "
            >

              {/* ==========================================================
                  EMPTY STATE
              ========================================================== */}

              {messages.length === 0 && (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}

                  style={{
                    width: '100%',

                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',

                    paddingTop: '18px',

                    boxSizing: 'border-box',

                    textAlign: 'center',
                  }}
                >

                  {/* Robot */}

                  <div
                    style={{
                      position: 'relative',

                      width: '62px',
                      height: '62px',

                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',

                      borderRadius: '20px',

                      background:
                        'linear-gradient(135deg, #dbeafe, #e0f2fe)',

                      color: '#2563eb',

                      boxShadow:
                        '0 4px 10px rgba(37,99,235,0.08)',
                    }}
                  >
                    <Bot
                      size={30}
                      strokeWidth={1.6}
                    />

                    <div
                      style={{
                        position: 'absolute',

                        top: '-7px',
                        right: '-6px',

                        width: '27px',
                        height: '27px',

                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',

                        borderRadius: '9999px',

                        background: '#ffffff',

                        boxShadow:
                          '0 3px 8px rgba(15,23,42,0.12)',

                        color: '#2563eb',
                      }}
                    >
                      <Sparkles size={13} />
                    </div>
                  </div>


                  <h4
                    style={{
                      margin:
                        '18px 0 0',

                      padding: 0,

                      fontSize: '20px',
                      lineHeight: '1.4',

                      fontWeight: 700,

                      color: '#0f172a',
                    }}
                  >
                    မင်္ဂလာပါ 👋
                  </h4>


                  <p
                    style={{
                      margin:
                        '5px 0 0',

                      padding: 0,

                      maxWidth: '330px',

                      fontSize: '10px',
                      lineHeight: '1.7',

                      color: '#64748b',
                    }}
                  >
                    မြန်မာ့မီးရထားနှင့် ပတ်သက်သော
                    မေးခွန်းများကို မေးမြန်းနိုင်ပါသည်။
                  </p>


                  {/* Hint */}

                  <div
                    style={{
                      marginTop: '14px',

                      display: 'flex',
                      alignItems: 'center',

                      gap: '7px',

                      padding:
                        '8px 13px',

                      borderRadius: '9999px',

                      background:
                        '#f1f5f9',

                      color: '#64748b',

                      fontSize: '11px',

                      boxSizing: 'border-box',
                    }}
                  >
                    <MessageCircle size={13} />

                    <span>
                      သင့်မေးခွန်းကို အောက်တွင် ရိုက်ထည့်ပါ
                    </span>
                  </div>

                </motion.div>
              )}


              {/* ==========================================================
                  MESSAGE LIST
              ========================================================== */}

              <div
                style={{
                  width: '100%',
                  minWidth: 0,

                  display: 'flex',
                  flexDirection: 'column',

                  gap: '14px',
                }}
              >

                {messages.map((msg, idx) => {
                  const isUser =
                    msg.role === 'user';

                  return (
                    <motion.div
                      key={idx}

                      initial={{
                        opacity: 0,
                        y: 7,
                      }}

                      animate={{
                        opacity: 1,
                        y: 0,
                      }}

                      style={{
                        width: '100%',

                        display: 'flex',
                        alignItems: 'flex-end',

                        justifyContent: isUser
                          ? 'flex-end'
                          : 'flex-start',

                        gap: '9px',

                        boxSizing: 'border-box',
                      }}
                    >

                      {/* Bot avatar */}

                      {!isUser && (
                        <div
                          style={{
                            flex:
                              '0 0 32px',

                            width: '32px',
                            height: '32px',

                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',

                            borderRadius: '11px',

                            background:
                              '#dbeafe',

                            color: '#2563eb',
                          }}
                        >
                          <Bot size={16} />
                        </div>
                      )}


                      {/* Message bubble */}

                      <div
                        style={{
                          maxWidth: '82%',
                          minWidth: 0,

                          padding:
                            '11px 14px',

                          borderRadius:
                            isUser
                              ? '17px 17px 6px 17px'
                              : '17px 17px 17px 6px',

                          boxSizing: 'border-box',

                          background:
                            isUser
                              ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                              : msg.isError
                              ? '#fef2f2'
                              : '#ffffff',

                          color:
                            isUser
                              ? '#ffffff'
                              : msg.isError
                              ? '#b91c1c'
                              : '#334155',

                          border:
                            isUser
                              ? 'none'
                              : msg.isError
                              ? '1px solid #fecaca'
                              : '1px solid #e2e8f0',

                          boxShadow:
                            isUser
                              ? '0 4px 10px rgba(37,99,235,0.12)'
                              : '0 2px 7px rgba(15,23,42,0.05)',
                        }}
                      >

                        {/* Content */}

                        <div
                          style={{
                            margin: 0,
                            padding: 0,

                            fontSize: '13px',
                            lineHeight: '1.7',

                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {msg.content}
                        </div>


                        {/* Live Data */}

                        {msg.isLiveData && (
                          <div
                            style={{
                              display:
                                'inline-flex',

                              alignItems:
                                'center',

                              gap: '6px',

                              marginTop: '8px',

                              padding:
                                '4px 9px',

                              borderRadius:
                                '9999px',

                              background:
                                '#ecfdf5',

                              border:
                                '1px solid #bbf7d0',

                              color:
                                '#047857',

                              fontSize: '10px',

                              fontWeight: 600,
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',

                                borderRadius:
                                  '9999px',

                                background:
                                  '#10b981',
                              }}
                            />

                            အချိန်နှင့်တပြေးညီ အချက်အလက်
                          </div>
                        )}


                        {/* Time */}

                        <div
                          style={{
                            marginTop: '5px',

                            fontSize: '10px',
                            lineHeight: '1.3',

                            color:
                              isUser
                                ? 'rgba(219,234,254,0.9)'
                                : '#94a3b8',
                          }}
                        >
                          {msg.timestamp.toLocaleTimeString(
                            'my-MM',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </div>

                      </div>

                    </motion.div>
                  );
                })}


                {/* ========================================================
                    TYPING INDICATOR
                ======================================================== */}

                {isLoading && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      y: 5,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}

                    style={{
                      width: '100%',

                      display: 'flex',
                      alignItems: 'flex-end',

                      gap: '9px',
                    }}
                  >

                    <div
                      style={{
                        flex:
                          '0 0 32px',

                        width: '32px',
                        height: '32px',

                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',

                        borderRadius: '11px',

                        background:
                          '#dbeafe',

                        color: '#2563eb',
                      }}
                    >
                      <Bot size={16} />
                    </div>


                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',

                        gap: '5px',

                        padding:
                          '12px 15px',

                        borderRadius:
                          '17px 17px 17px 6px',

                        background:
                          '#ffffff',

                        border:
                          '1px solid #e2e8f0',

                        boxShadow:
                          '0 2px 7px rgba(15,23,42,0.05)',
                      }}
                    >

                      <span
                        className="animate-bounce"
                        style={{
                          width: '6px',
                          height: '6px',

                          borderRadius:
                            '9999px',

                          background:
                            '#94a3b8',

                          animationDelay:
                            '0ms',
                        }}
                      />

                      <span
                        className="animate-bounce"
                        style={{
                          width: '6px',
                          height: '6px',

                          borderRadius:
                            '9999px',

                          background:
                            '#94a3b8',

                          animationDelay:
                            '150ms',
                        }}
                      />

                      <span
                        className="animate-bounce"
                        style={{
                          width: '6px',
                          height: '6px',

                          borderRadius:
                            '9999px',

                          background:
                            '#94a3b8',

                          animationDelay:
                            '300ms',
                        }}
                      />

                    </div>

                  </motion.div>
                )}

                <div
                  ref={messagesEndRef}
                  style={{
                    height: 0,
                    width: '100%',
                  }}
                />

              </div>

            </div>


            {/* ==============================================================
                FOOTER / INPUT
            ============================================================== */}

            <div
              style={{
                ...fullWidthStyle,

                flex:
                  '0 0 auto',

                margin: 0,

                padding:
                  '10px 14px 9px',

                boxSizing:
                  'border-box',

                borderTop:
                  '1px solid #e2e8f0',

                background:
                  '#ffffff',
              }}

              className="
                chatbot-footer
                !w-full
                !max-w-none
                !min-w-0
                !shrink-0
                !m-0
              "
            >

              <form
                onSubmit={handleSubmit}

                style={{
                  width: '100%',
                  margin: 0,
                  padding: 0,
                }}
              >

                {/* Input container */}

                <div
                  style={{
                    width: '100%',

                    display: 'flex',
                    alignItems: 'center',

                    gap: '7px',

                    padding:
                      '5px',

                    boxSizing:
                      'border-box',

                    borderRadius:
                      '17px',

                    border:
                      '1px solid #e2e8f0',

                    background:
                      '#f8fafc',

                    transition:
                      'all 0.2s ease',
                  }}
                >

                  {/* Input */}

                  <input
                    ref={inputRef}

                    type="text"

                    value={input}

                    onChange={(e) =>
                      setInput(e.target.value)
                    }

                    onKeyDown={handleKeyDown}

                    placeholder="မေးခွန်းမေးမြန်းပါ..."

                    disabled={isLoading}

                    style={{
                      flex: '1 1 auto',

                      width: '100%',
                      minWidth: 0,

                      height: '38px',

                      margin: 0,
                      padding:
                        '0 10px',

                      border: 0,
                      outline: 'none',

                      background:
                        'transparent',

                      color:
                        '#1e293b',

                      fontSize:
                        '13px',

                      lineHeight:
                        '1.5',

                      fontFamily:
                        'inherit',

                      boxSizing:
                        'border-box',

                      appearance:
                        'none',
                      WebkitAppearance:
                        'none',
                    }}

                    className="
                      !border-0
                      !outline-none
                      !ring-0
                      !shadow-none
                      !bg-transparent
                    "
                  />


                  {/* Send */}

                  <button
                    type="submit"

                    disabled={
                      !input.trim() ||
                      isLoading
                    }

                    aria-label="မေးခွန်းပို့ရန်"

                    style={{
                      flex:
                        '0 0 38px',

                      width: '38px',
                      height: '38px',

                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',

                      margin: 0,
                      padding: 0,

                      border: 0,

                      borderRadius:
                        '12px',

                      background:
                        input.trim() &&
                        !isLoading
                          ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                          : '#e2e8f0',

                      color:
                        input.trim() &&
                        !isLoading
                          ? '#ffffff'
                          : '#94a3b8',

                      cursor:
                        input.trim() &&
                        !isLoading
                          ? 'pointer'
                          : 'not-allowed',

                      boxSizing:
                        'border-box',

                      transition:
                        'all 0.2s ease',

                      appearance:
                        'none',
                      WebkitAppearance:
                        'none',
                    }}

                    className="
                      !flex
                      !items-center
                      !justify-center
                      !p-0
                      !m-0
                      !border-0
                    "
                  >

                    {isLoading ? (
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />
                    ) : (
                      <Send
                        size={17}
                        strokeWidth={2}
                      />
                    )}

                  </button>

                </div>


                {/* Footer note */}

                <div
                  style={{
                    width: '100%',

                    marginTop: '5px',

                    textAlign: 'center',

                    fontSize: '9px',
                    lineHeight: '14px',

                    color: '#94a3b8',
                  }}
                >
                  AI အကူအညီပေးစနစ် • အချက်အလက်များကို ပြန်လည်စစ်ဆေးပါ
                </div>

              </form>

            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}