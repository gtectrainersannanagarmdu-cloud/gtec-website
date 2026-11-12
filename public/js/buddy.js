// ==========================================================================
//   GTEC Buddy — Personalized AI Chatbot & Website Navigator
//   Intent + course predictions come from the G-TEC models on Hugging Face
//   (GtecBuddy/gtec-intent-model). The intent -> page map is published next
//   to the model as navigation.json; the entries below are the offline copy.
// ==========================================================================

(function () {
  'use strict';

  // main.js may also inject this file. If the page already included it with a
  // <script> tag, skip the second copy so listeners and API calls are not
  // registered twice.
  if (window.__gtecBuddyBooted) return;
  window.__gtecBuddyBooted = true;

  // --- Configuration ---
  // AI server location.
  //   Local development : http://127.0.0.1:5001
  //   Production        : your Hugging Face Space URL, for example
  //                       https://gtec-trainers-gtec-ai-server.hf.space
  //
  // You can override it without editing this file by setting
  //   window.GTEC_AI_URL = 'https://your-space.hf.space';
  // in a <script> tag BEFORE buddy.js is loaded.
  const AI_BASE_URL = (window.GTEC_AI_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');

  const CONFIG = {
    avatarSrc: 'assets/images/GTEC Buddy.png',
    apiEndpoint: '/api/predict',
    aiBaseUrl: AI_BASE_URL,
    directAiEndpoint: AI_BASE_URL + '/predict',
    chatEndpoint: '/api/chat',
    directChatEndpoint: AI_BASE_URL + '/chat',
    botName: 'GTEC Buddy',
    greetingText: "Hi there! 👋 I'm <strong>GTEC Buddy</strong>, your AI course advisor. Ask me to find the perfect course for you, navigate the website, or get campus details!",
    quickChips: [
      { label: '🎯 Find My Course', query: 'I need a course recommendation', navigate: 'recommend.html' },
      { label: '💻 Web Development', query: 'Show me web development course' },
      { label: '📊 Tally & GST', query: 'Where can I find Tally and GST?' },
      { label: '🎨 Graphic Design', query: 'Graphic design course details' },
      { label: '🎓 All Courses', query: 'Show all courses' },
      { label: '📍 Madurai Centre', query: 'Where is Madurai centre location?' },
      { label: '💼 Placement Support', query: 'Do you provide job placement support?' },
      { label: '📞 Contact Us', query: 'How do I contact G-TEC?' }
    ]
  };

  // --- Chat Session (for multi-turn COURSE_RECOMMENDATION flow) ---
  const SESSION_ID = 'sess_' + Math.random().toString(36).slice(2) + '_' + Date.now();


  // --- Intent Knowledge Base & Navigation Mapping ---
  const INTENT_MAP = {
    'ABOUT': {
      title: 'About G-TEC',
      text: 'G-TEC Computer Education is an **ISO 9001:2015 certified** global training powerhouse with over **25 years of excellence**, present in 20+ countries with 1.8M+ alumni. We specialize in job-oriented IT and vocational skill development.',
      actionLabel: 'Explore About Us 🏛️',
      targetUrl: 'about.html',
      inPageAnchor: '#about'
    },
    'CENTRE_INFO': {
      title: 'Madurai Anna Nagar Centre',
      text: '📍 **G-TEC Madurai Anna Nagar Centre**:<br>• <strong>Address:</strong> Idhayam Complex No.416, 2nd Floor, 2nd East Main Road, New LIG Colony, Anna Nagar, Madurai – 625020<br>• <strong>Phone:</strong> 9025046473<br>• <strong>Hours:</strong> Mon–Sat: 9:00 AM – 7:00 PM',
      actionLabel: 'Open in Google Maps 🗺️',
      targetUrl: 'https://www.google.com/maps/place/G-TEC+EDUCATION+MADURAI/@9.9212495,78.1466308,753m/data=!3m1!1e3!4m8!3m7!1s0x3b00c56fe8e817c3:0xae96267e04d67618!8m2!3d9.9212495!4d78.1492057!9m1!1b1!16s%2Fg%2F11vdjm_d14?entry=ttu',
      isExternal: true
    },
    'CONTACT': {
      title: 'Contact & Admissions',
      text: 'Have questions regarding admissions, batch timings, or course fees? Reach our Madurai centre at **9025046473** or submit your inquiry online.',
      actionLabel: 'Go to Contact Form ✉️',
      targetUrl: 'contact.html',
      inPageAnchor: '#contactForm'
    },
    'COURSES': {
      title: 'Course Catalog',
      text: 'G-TEC provides recognized certification diplomas across Software, Hardware & Networking, Web Development, Graphic Design, Digital Marketing, and Accounting.',
      actionLabel: 'Browse All Courses 🎓',
      targetUrl: 'courses.html',
      inPageAnchor: '#courses'
    },
    'COURSE_RECOMMENDATION': {
      title: 'Find My Course',
      text: 'Let\'s find your perfect course! I\'ll take you to our <strong>Find My Course</strong> page — answer 4 quick questions and we\'ll match you to the right course.',
      actionLabel: 'Find My Course 🎯',
      targetUrl: 'recommend.html'
    },
    'DIGITAL_MARKETING': {
      title: 'Digital Marketing Master',
      text: 'Our **Digital Marketing Master Course** covers Search Engine Optimization (SEO), Google Search & Display Ads (SEM), Social Media Marketing, Content Strategy, and Analytics.',
      actionLabel: 'View Digital Marketing 📈',
      targetUrl: 'courses.html?filter=marketing',
      categoryFilter: 'marketing'
    },
    'GALLERY': {
      title: 'Campus & Lab Gallery',
      text: 'Take a virtual tour of our high-tech computer labs, modern air-conditioned classrooms, student project presentations, and award events!',
      actionLabel: 'Explore Photo Gallery 📸',
      targetUrl: 'gallery.html'
    },
    'GRAPHIC_DESIGN': {
      title: 'Graphic & UI/UX Design',
      text: 'Master creative software including Adobe Photoshop, Illustrator, InDesign, CorelDraw, and UI/UX design fundamentals with portfolio projects.',
      actionLabel: 'View Graphic Design 🎨',
      targetUrl: 'courses.html?filter=design',
      categoryFilter: 'design'
    },
    'GREETING': {
      title: 'Welcome to G-TEC',
      text: "Hello! 👋 I'm G-TEC Buddy, your AI guide! You can ask me to navigate anywhere on the website, find course syllabi, or get centre details.",
      actionLabel: 'Browse Courses 🚀',
      targetUrl: 'courses.html'
    },
    'GTEC_FACTS': {
      title: 'G-TEC Highlights',
      text: '⭐ **Why Choose G-TEC?**<br>• **25+ Years** of International Heritage<br>• **1.8+ Million** Alumni Worldwide<br>• Present in **20+ Countries**<br>• **ISO 9001:2015 Certified** Curriculum<br>• Practical hands-on training with 100% placement support.',
      actionLabel: 'Read More About G-TEC 🌟',
      targetUrl: 'about.html'
    },
    'HARDWARE_NETWORKING': {
      title: 'Hardware & Networking',
      text: 'Gain hands-on skills in **PC Hardware & Maintenance**, **Cisco CCNA Prep**, and **Diploma in CCTV Installation (DCI)** in our practical networking labs.',
      actionLabel: 'View Hardware & Networking 🔌',
      targetUrl: 'courses.html?filter=hardware',
      categoryFilter: 'hardware'
    },
    'HOME': {
      title: 'Home Page',
      text: 'Navigating to the G-TEC home page featuring campus video tours, certified courses, and student success reviews.',
      actionLabel: 'Go to Home Page 🏠',
      targetUrl: 'index.html',
      inPageAnchor: '#home'
    },
    'LEADERSHIP': {
      title: 'Leadership & Mentors',
      text: 'G-TEC Madurai Anna Nagar is led by certified technical directors and expert faculty committed to student mentorship and career transformation.',
      actionLabel: 'Meet Leadership Team 👥',
      targetUrl: 'about.html'
    },
    'MS_OFFICE': {
      title: 'MS Office & Computer Basics',
      text: 'Our **MS Office & Computer Basics (DCA)** program teaches Microsoft Word, Advanced Excel (VLOOKUP, Pivot Tables, Charts), PowerPoint, and essential digital office tools.',
      actionLabel: 'View MS Office Course 💻',
      targetUrl: 'courses.html?filter=software',
      categoryFilter: 'software'
    },
    'PLACEMENT_SUPPORT': {
      title: '100% Placement Assistance',
      text: '🎯 **Career Support & Placements**:<br>• Dedicated placement coordinator<br>• Resume writing & LinkedIn profile optimization<br>• Mock technical interviews & soft skills training<br>• On-campus & corporate interview referrals.',
      actionLabel: 'Contact Placement Cell 💼',
      targetUrl: 'contact.html'
    },
    'TALLY': {
      title: 'Tally Prime & Financial Accounting',
      text: 'Master computerized accounting with **Tally Prime with GST**, E-way billing, Inventory Management, Payroll, and **SAP FICO** with live business case studies.',
      actionLabel: 'View Tally & Finance Courses 📊',
      targetUrl: 'courses.html?filter=finance',
      categoryFilter: 'finance'
    },
    'TRAINERS': {
      title: 'Certified Faculty & Trainers',
      text: 'At G-TEC, all courses are conducted by certified industry professionals with extensive practical experience in software, finance, multimedia, and hardware.',
      actionLabel: 'Learn More About Us 🏛️',
      targetUrl: 'about.html'
    },
    'WEB_DEVELOPMENT': {
      title: 'Web & Full Stack Development',
      text: 'Become a Full Stack Web Developer! Master **HTML5, CSS3, JavaScript, Python, Django, React**, database integration, and Git portfolio deployment.',
      actionLabel: 'View Web Dev Course 🌐',
      targetUrl: 'courses.html?filter=web',
      categoryFilter: 'web'
    },
    'AFFILIATIONS': {
      title: 'Our Global Affiliations',
      text: 'G-TEC is proud to be affiliated with premier global technology giants and certifying bodies including **Tally, SAP, Adobe, Cisco, Autodesk, EC-Council, Meta, Certiport, Keltron, and ABMA UK**.',
      actionLabel: 'View Affiliations & Partners 🤝',
      targetUrl: 'index.html#affiliations',
      inPageAnchor: '#affiliations'
    }
  };

  // --- Navigation map published with the model on Hugging Face ----------
  // The intent itself is predicted by the Hub model; the page each intent
  // opens lives in navigation.json next to that model. The INTENT_MAP above
  // is only the offline copy used when the AI server is unreachable.
  let navigationLoaded = false;
  async function loadNavigation() {
    if (navigationLoaded) return;
    try {
      const res = await fetch('/api/navigation', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const map = (data && data.intents) || {};
      Object.keys(map).forEach((key) => {
        INTENT_MAP[key] = Object.assign({}, INTENT_MAP[key] || {}, map[key]);
      });
      navigationLoaded = Object.keys(map).length > 0;
    } catch (err) {
      // Keep the built-in map when the AI server is offline.
    }
  }

  // --- Fallback Intent Classifier (Client-Side) ---
  function clientClassifyIntent(query) {
    const q = query.toLowerCase().trim();
    if (/recommend|suggest|which course|what course should|find my course|pick a course|choose.*course|confused|not sure what to (study|learn)|course should i|suits me|best for me|no idea what to study|help me choose|want to (learn|study|do|join)|wish to (learn|study)|like to (learn|study)|interested in (learning|studying|doing|joining)/i.test(q)) {
      return { intent: 'COURSE_RECOMMENDATION', confidence: 0.97 };
    }
    if (/affiliation|affiliate|partner|accreditation|tie-up|certiport|autodesk/i.test(q)) {
      return { intent: 'AFFILIATIONS', confidence: 0.96 };
    }
    if (/web|developer|html|css|javascript|react|python|django|full stack|frontend|backend|coding/i.test(q)) {
      return { intent: 'WEB_DEVELOPMENT', confidence: 0.95 };
    }
    if (/tally|gst|sap|fico|accounting|finance|ledger|balance sheet/i.test(q)) {
      return { intent: 'TALLY', confidence: 0.95 };
    }
    if (/graphic|photoshop|illustrator|coreldraw|design|ui|ux|logo|multimedia/i.test(q)) {
      return { intent: 'GRAPHIC_DESIGN', confidence: 0.94 };
    }
    if (/digital marketing|seo|sem|social media|google ads|ads|marketing/i.test(q)) {
      return { intent: 'DIGITAL_MARKETING', confidence: 0.95 };
    }
    if (/hardware|networking|cisco|ccna|cctv|pc repair|assemble|network/i.test(q)) {
      return { intent: 'HARDWARE_NETWORKING', confidence: 0.93 };
    }
    if (/ms office|excel|word|powerpoint|office basics|dca|computer basic/i.test(q)) {
      return { intent: 'MS_OFFICE', confidence: 0.94 };
    }
    if (/placement|job|career|interview|hiring|recruit|package|salary/i.test(q)) {
      return { intent: 'PLACEMENT_SUPPORT', confidence: 0.92 };
    }
    if (/trainer|teacher|faculty|staff|who teaches|instructor/i.test(q)) {
      return { intent: 'TRAINERS', confidence: 0.93 };
    }
    if (/gallery|photo|picture|lab photo|images|campus/i.test(q)) {
      return { intent: 'GALLERY', confidence: 0.94 };
    }
    if (/location|address|madurai|annanagar|anna nagar|where are you|centre|center|map/i.test(q)) {
      return { intent: 'CENTRE_INFO', confidence: 0.96 };
    }
    if (/contact|phone|email|call|reach|number|inquiry|timing|hours/i.test(q)) {
      return { intent: 'CONTACT', confidence: 0.92 };
    }
    if (/fact|country|branches|iso|how many|legacy|history|certified/i.test(q)) {
      return { intent: 'GTEC_FACTS', confidence: 0.91 };
    }
    if (/about|who is gtec|what is gtec|about us|institution/i.test(q)) {
      return { intent: 'ABOUT', confidence: 0.92 };
    }
    if (/course|program|diploma|syllabus|fees|curriculum|classes/i.test(q)) {
      return { intent: 'COURSES', confidence: 0.94 };
    }
    if (/director|leadership|manager|owner|head/i.test(q)) {
      return { intent: 'LEADERSHIP', confidence: 0.90 };
    }
    if (/home|main page|start/i.test(q)) {
      return { intent: 'HOME', confidence: 0.92 };
    }
    if (/hi|hello|hey|good morning|good afternoon|greetings|help|assist/i.test(q)) {
      return { intent: 'GREETING', confidence: 0.98 };
    }

    return { intent: 'COURSES', confidence: 0.65 };
  }

  // --- Sound Effects using Web Audio API (No external assets required) ---
  const AudioService = {
    ctx: null,
    muted: false,
    init() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      } catch (e) {
        console.warn('Audio not supported');
      }
    },
    playChime() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    }
  };

  // --- Main Buddy App Class ---
  class GTECBuddy {
    constructor() {
      this.isOpen = false;
      this.speechSynth = window.speechSynthesis || null;
      this.isVoiceSpeaking = false;
      this.isListening = false;
      this.recognition = null;
      this.initSpeechRecognition();
      this.injectWidgetDOM();
      this.bindEvents();
      this.checkAutoFilterOnLoad();
      this.testAiServerConnection();
      loadNavigation();
    }

    initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
          this.isListening = true;
          const micBtn = document.getElementById('buddyMicBtn');
          if (micBtn) micBtn.classList.add('listening');
        };

        this.recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          const input = document.getElementById('buddyInputField');
          if (input) {
            input.value = transcript;
            this.handleUserSubmit();
          }
        };

        this.recognition.onerror = () => {
          this.stopListening();
        };

        this.recognition.onend = () => {
          this.stopListening();
        };
      }
    }

    stopListening() {
      this.isListening = false;
      const micBtn = document.getElementById('buddyMicBtn');
      if (micBtn) micBtn.classList.remove('listening');
    }

    toggleListening() {
      if (!this.recognition) {
        alert('Voice input is not supported in this browser. Please type your message.');
        return;
      }
      if (this.isListening) {
        this.recognition.stop();
      } else {
        this.recognition.start();
      }
    }

    injectWidgetDOM() {
      if (document.getElementById('gtecBuddyWidget')) return;

      const widgetHTML = `
        <!-- GTEC Buddy Launcher & Speech Bubble -->
        <div class="gtec-buddy-launcher-wrapper" id="gtecBuddyLauncherWrapper">
          
          <!-- Speech Bubble Callout: "How can I help you?" -->
          <div class="gtec-buddy-speech-bubble" id="gtecBuddySpeechBubble" title="Click to chat with GTEC Buddy">
            <span class="buddy-bubble-icon">👋</span>
            <div class="buddy-bubble-content">
              <div class="buddy-bubble-title">
                <span class="pulse-dot"></span> GTEC Buddy
              </div>
              <div class="buddy-bubble-text">Hi! How can I help you?</div>
            </div>
            <button class="buddy-bubble-close" id="gtecBuddyBubbleClose" aria-label="Close message" title="Dismiss">
              <i class="fa fa-times"></i>
            </button>
          </div>

          <!-- Circular Floating Mascot Trigger -->
          <button class="gtec-buddy-trigger-btn" id="gtecBuddyTriggerBtn" aria-label="Open G-TEC AI Buddy" title="Chat with G-TEC AI Buddy">
            <div class="buddy-halo-ring"></div>
            <div class="buddy-avatar-img-wrap">
              <img src="${CONFIG.avatarSrc}" alt="GTEC Buddy AI" class="buddy-avatar-img">
            </div>
            <span class="buddy-online-badge" title="AI Assistant Online"></span>
            <i class="fa fa-times buddy-launcher-close-icon"></i>
          </button>
        </div>

        <!-- Interactive AI Chat Window -->
        <div class="gtec-buddy-window" id="gtecBuddyWindow" role="dialog" aria-modal="true" aria-label="GTEC Buddy AI Chat">
          <!-- Window Header -->
          <div class="buddy-header">
            <div class="buddy-header-profile">
              <div class="buddy-header-avatar">
                <img src="${CONFIG.avatarSrc}" alt="GTEC Buddy Avatar">
              </div>
              <div class="buddy-header-info">
                <div class="buddy-header-title">
                  G-TEC Buddy <span class="buddy-ai-badge">AI Assistant</span>
                </div>
                <div class="buddy-header-status">
                  <span class="live-indicator"></span>
                  <span id="buddyStatusLabel">Madurai Campus Guide • Ready</span>
                </div>
              </div>
            </div>
            <div class="buddy-header-actions">
              <button class="buddy-icon-btn" id="buddyResetBtn" title="Reset Conversation" aria-label="Reset chat">
                <i class="fa fa-rotate-left"></i>
              </button>
              <button class="buddy-icon-btn" id="buddyMinimizeBtn" title="Minimize Chat" aria-label="Minimize chat">
                <i class="fa fa-minus"></i>
              </button>
            </div>
          </div>

          <!-- Quick Navigation Banner -->
          <div class="buddy-quick-banner">
            <span><i class="fa fa-compass"></i> AI-Powered Page & Course Navigator</span>
            <span class="buddy-server-status" id="buddyServerBadge">
              <i class="fa fa-circle-check"></i> Model Ready
            </span>
          </div>

          <!-- Messages Stream Body -->
          <div class="buddy-chat-body" id="buddyChatBody">
            <!-- Initial Welcome Message from Buddy -->
            <div class="buddy-msg-row buddy">
              <div class="buddy-msg-avatar">
                <img src="${CONFIG.avatarSrc}" alt="Buddy">
              </div>
              <div class="buddy-msg-content">
                <div class="buddy-msg-bubble">
                  ${CONFIG.greetingText}
                  
                  <div class="buddy-chips-container">
                    ${CONFIG.quickChips.map(chip => `
                      <button class="buddy-chip" data-query="${chip.query}" data-nav="${chip.navigate || ''}">
                        ${chip.label}
                      </button>
                    `).join('')}
                  </div>
                </div>
                <span class="buddy-msg-time">Just now</span>
              </div>
            </div>

            <!-- Typing indicator -->
            <div class="buddy-typing-row" id="buddyTypingRow">
              <div class="buddy-msg-avatar">
                <img src="${CONFIG.avatarSrc}" alt="Buddy">
              </div>
              <div class="buddy-typing-bubble">
                <span class="buddy-dot"></span>
                <span class="buddy-dot"></span>
                <span class="buddy-dot"></span>
              </div>
            </div>
          </div>

          <!-- Input Footer -->
          <div class="buddy-footer">
            <div class="buddy-input-wrapper">
              <input 
                type="text" 
                id="buddyInputField" 
                class="buddy-input-field" 
                placeholder="Ask GTEC Buddy anything (e.g., 'Web Dev course')..." 
                autocomplete="off"
              >
              <button class="buddy-mic-btn" id="buddyMicBtn" title="Speak to GTEC Buddy" aria-label="Voice input">
                <i class="fa fa-microphone"></i>
              </button>
              <button class="buddy-send-btn" id="buddySendBtn" title="Send Question" aria-label="Send message">
                <i class="fa fa-paper-plane"></i>
              </button>
            </div>
            <div class="buddy-footer-credits">
              <span>Powered by <strong>G-TEC AI</strong> &bull; Madurai Anna Nagar</span>
            </div>
          </div>
        </div>
      `;

      const wrapper = document.createElement('div');
      wrapper.id = 'gtecBuddyWidget';
      wrapper.innerHTML = widgetHTML;
      document.body.appendChild(wrapper);

      AudioService.init();
    }

    bindEvents() {
      const triggerBtn = document.getElementById('gtecBuddyTriggerBtn');
      const speechBubble = document.getElementById('gtecBuddySpeechBubble');
      const bubbleClose = document.getElementById('gtecBuddyBubbleClose');
      const minimizeBtn = document.getElementById('buddyMinimizeBtn');
      const resetBtn = document.getElementById('buddyResetBtn');
      const sendBtn = document.getElementById('buddySendBtn');
      const inputField = document.getElementById('buddyInputField');
      const micBtn = document.getElementById('buddyMicBtn');
      const chatBody = document.getElementById('buddyChatBody');

      // Trigger Toggle
      if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleChat();
        });
      }

      // Click on Speech Bubble to Open
      if (speechBubble) {
        speechBubble.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openChat();
        });
      }

      // Dismiss Speech Bubble
      if (bubbleClose) {
        bubbleClose.addEventListener('click', (e) => {
          e.stopPropagation();
          speechBubble.style.display = 'none';
        });
      }

      // Minimize
      if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => this.closeChat());
      }

      // Reset
      if (resetBtn) {
        resetBtn.addEventListener('click', () => this.resetConversation());
      }

      // Send on click
      if (sendBtn) {
        sendBtn.addEventListener('click', () => this.handleUserSubmit());
      }

      // Send on Enter
      if (inputField) {
        inputField.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleUserSubmit();
          }
        });
      }

      // Mic Voice Input
      if (micBtn) {
        micBtn.addEventListener('click', () => this.toggleListening());
      }

      // Handle Quick Prompt Chips
      if (chatBody) {
        chatBody.addEventListener('click', (e) => {
          const chip = e.target.closest('.buddy-chip');
          if (!chip) return;
          // Chips with a data-nav value jump straight to a page (bypassing the
          // AI flow) — e.g. "Find My Course" opens the dedicated wizard page.
          if (chip.dataset.nav) {
            window.location.href = chip.dataset.nav;
            return;
          }
          if (chip.dataset.query) {
            this.sendUserMessage(chip.dataset.query);
          }
        });
      }

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closeChat();
        }
      });
    }

    toggleChat() {
      if (this.isOpen) {
        this.closeChat();
      } else {
        this.openChat();
      }
    }

    openChat() {
      this.isOpen = true;
      const windowEl = document.getElementById('gtecBuddyWindow');
      const launcherWrapper = document.getElementById('gtecBuddyLauncherWrapper');
      const speechBubble = document.getElementById('gtecBuddySpeechBubble');
      const inputField = document.getElementById('buddyInputField');

      if (windowEl) windowEl.classList.add('open');
      if (launcherWrapper) launcherWrapper.classList.add('chat-open');
      if (speechBubble) speechBubble.style.display = 'none';

      if (inputField) {
        setTimeout(() => inputField.focus(), 300);
      }
      this.scrollToBottom();
    }

    closeChat() {
      this.isOpen = false;
      const windowEl = document.getElementById('gtecBuddyWindow');
      const launcherWrapper = document.getElementById('gtecBuddyLauncherWrapper');
      if (windowEl) windowEl.classList.remove('open');
      if (launcherWrapper) launcherWrapper.classList.remove('chat-open');
      this.stopListening();
    }

    resetConversation() {
      // Tell the backend to forget this session's recommendation state
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob(
            [JSON.stringify({ session_id: SESSION_ID, message: '' })],
            { type: 'application/json' }
          );
          navigator.sendBeacon(CONFIG.chatEndpoint, blob);
        }
      } catch (_) { /* ignore */ }

      const chatBody = document.getElementById('buddyChatBody');
      const typingRow = document.getElementById('buddyTypingRow');
      if (!chatBody) return;

      chatBody.innerHTML = `
        <div class="buddy-msg-row buddy">
          <div class="buddy-msg-avatar">
            <img src="${CONFIG.avatarSrc}" alt="Buddy">
          </div>
          <div class="buddy-msg-content">
            <div class="buddy-msg-bubble">
              ${CONFIG.greetingText}
              <div class="buddy-chips-container">
                ${CONFIG.quickChips.map(chip => `
                  <button class="buddy-chip" data-query="${chip.query}" data-nav="${chip.navigate || ''}">
                    ${chip.label}
                  </button>
                `).join('')}
              </div>
            </div>
            <span class="buddy-msg-time">Just now</span>
          </div>
        </div>
      `;
      if (typingRow) chatBody.appendChild(typingRow);
    }

    handleUserSubmit() {
      const input = document.getElementById('buddyInputField');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      this.sendUserMessage(text);
    }

    sendUserMessage(message) {
      this.appendUserMessage(message);
      this.showTyping(true);

      // 1. Try the multi-turn /chat endpoint first (handles recommendation flow)
      this.callChatEndpoint(message)
        .then((data) => {
          this.showTyping(false);

          // If the backend produced a conversational reply, use it directly
          if (data && data.reply) {
            this.appendBotReply(data);
            return;
          }

          // Otherwise fall back to normal intent-based routing
          if (data && data.intent) {
            this.handleAiResponse({
              intent: data.intent,
              confidence: data.confidence
            }, message);
            return;
          }

          // Last resort: client-side classifier
          const fallback = clientClassifyIntent(message);
          this.handleAiResponse({
            intent: fallback.intent,
            confidence: fallback.confidence,
            isFallback: true
          }, message);
        })
        .catch((err) => {
          console.warn('Chat endpoint failed, using /predict fallback:', err);
          this.predictIntent(message)
            .then((result) => {
              this.showTyping(false);
              this.handleAiResponse(result, message);
            })
            .catch(() => {
              this.showTyping(false);
              const fallback = clientClassifyIntent(message);
              this.handleAiResponse({
                intent: fallback.intent,
                confidence: fallback.confidence,
                isFallback: true
              }, message);
            });
        });
    }

    // --- NEW: call the Flask /chat endpoint ---
    async callChatEndpoint(message) {
      const post = async (url) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: SESSION_ID, message })
        });
        if (!res.ok) throw new Error('chat endpoint ' + res.status);
        return await res.json();
      };

      // 1. Same-origin Express proxy /api/chat
      try {
        return await post(CONFIG.chatEndpoint);
      } catch (_) {
        // Fall through to the AI server directly
      }

      // 2. Direct AI server (local Flask or Hugging Face Space)
      return await post(CONFIG.directChatEndpoint);
    }

    // --- COURSE ICON MAP ---
    _getCourseIcon(courseName) {
      const c = (courseName || '').toLowerCase();
      if (c.includes('web') || c.includes('full stack')) return '🌐';
      if (c.includes('digital marketing')) return '📈';
      if (c.includes('graphic') || c.includes('ui')) return '🎨';
      if (c.includes('tally') || c.includes('accounting')) return '📊';
      if (c.includes('data analytics') || c.includes('ccda')) return '📊';
      if (c.includes('hardware') || c.includes('network')) return '🔌';
      if (c.includes('ms office') || c.includes('dca')) return '💻';
      if (c.includes('python') || c.includes('java')) return '⌨️';
      return '🎓';
    }

    // --- Render a bot reply bubble from /chat response ---
    appendBotReply(data) {
      const chatBody = document.getElementById('buddyChatBody');
      const typingRow = document.getElementById('buddyTypingRow');
      if (!chatBody) return;

      const time = this.getCurrentTime();
      const msgDiv = document.createElement('div');
      msgDiv.className = 'buddy-msg-row buddy';

      // ── FINAL RECOMMENDATION card ──────────────────────────────────
      if (data.done && data.recommended_course) {
        const filter = this.getCourseFilter(data.recommended_course);
        const icon = this._getCourseIcon(data.recommended_course);
        const navUrl = `courses.html${filter ? '?filter=' + filter : ''}`;

        msgDiv.innerHTML = `
          <div class="buddy-msg-avatar">
            <img src="${CONFIG.avatarSrc}" alt="Buddy">
          </div>
          <div class="buddy-msg-content">
            <div class="buddy-msg-bubble buddy-result-bubble">
              <div class="buddy-intent-tag">
                <i class="fa fa-sparkles"></i> Course Advisor · Result
              </div>
              <div class="buddy-result-text">${this.formatBotReply(data.reply)}</div>
              <div class="buddy-course-result-card">
                <div class="bcrc-icon-wrap">${icon}</div>
                <div class="bcrc-body">
                  <div class="bcrc-label">Your Recommended Course</div>
                  <div class="bcrc-title">${this.escapeHTML(data.recommended_course)}</div>
                  <div class="bcrc-badges">
                    <span class="bcrc-badge">✅ Job-Ready</span>
                    <span class="bcrc-badge">🏅 Certified</span>
                    <span class="bcrc-badge">📋 Placement Support</span>
                  </div>
                </div>
              </div>
              <div class="buddy-result-actions">
                <button class="buddy-action-btn buddy-result-primary-btn"
                        data-url="${navUrl}" data-anchor="" data-filter="${filter}">
                  <i class="fa fa-graduation-cap"></i> Explore This Course
                </button>
                <button class="buddy-action-btn buddy-result-secondary-btn"
                        data-url="contact.html" data-anchor="#contactForm" data-filter="">
                  <i class="fa fa-phone"></i> Enquire Now
                </button>
              </div>
              <div class="buddy-restart-row">
                <button class="buddy-restart-btn" id="buddyRestartWizard">
                  <i class="fa fa-rotate-left"></i> Try Again
                </button>
              </div>
            </div>
            <span class="buddy-msg-time">${time}</span>
          </div>
        `;

        // Bind navigation buttons
        msgDiv.querySelectorAll('[data-url]').forEach(btn => {
          btn.addEventListener('click', () => {
            this.executeNavigation(btn.dataset.url, btn.dataset.anchor, btn.dataset.filter);
          });
        });

        // Restart wizard
        const restartBtn = msgDiv.querySelector('#buddyRestartWizard');
        if (restartBtn) {
          restartBtn.addEventListener('click', () => {
            this.sendUserMessage('I need a course recommendation');
          });
        }

        // PLAIN REPLY (fallback) ────────────────────────────────────
      } else {
        msgDiv.innerHTML = `
          <div class="buddy-msg-avatar">
            <img src="${CONFIG.avatarSrc}" alt="Buddy">
          </div>
          <div class="buddy-msg-content">
            <div class="buddy-msg-bubble">
              <div class="buddy-intent-tag">
                <i class="fa fa-sparkles"></i> Course Advisor
              </div>
              <div>${this.formatBotReply(data.reply)}</div>
            </div>
            <span class="buddy-msg-time">${time}</span>
          </div>
        `;
      }

      if (typingRow) {
        chatBody.insertBefore(msgDiv, typingRow);
      } else {
        chatBody.appendChild(msgDiv);
      }

      AudioService.playChime();
      this.scrollToBottom();
    }

    // --- NEW: convert **bold** and line breaks to HTML ---
    formatBotReply(text) {
      if (!text) return '';
      return this.escapeHTML(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    }

    // --- NEW: map recommended course name → courses.html filter ---
    getCourseFilter(courseName) {
      const c = (courseName || '').toLowerCase();
      if (c.includes('web') || c.includes('full stack')) return 'web';
      if (c.includes('digital marketing') || c.includes('seo')) return 'marketing';
      if (c.includes('graphic') || c.includes('photoshop') ||
        c.includes('ui') || c.includes('illustrator')) return 'design';
      if (c.includes('tally') || c.includes('accounting') ||
        c.includes('sap') || c.includes('excel')) return 'finance';
      if (c.includes('hardware') || c.includes('networking') ||
        c.includes('cctv') || c.includes('ccna')) return 'hardware';
      if (c.includes('python') || c.includes('java') ||
        c.includes('data analytics')) return 'programming';
      if (c.includes('ms office') || c.includes('computer basics')) return 'software';
      if (c.includes('autocad') || c.includes('solidworks')) return 'cad';
      return '';
    }

    async testAiServerConnection() {
      const badge = document.getElementById('buddyServerBadge');

      // Probe both the Express proxy and the AI server endpoint directly.
      // Returns a label when the AI server answers, or null when offline.
      const probe = async () => {
        try {
          const res = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'hello' })
          });
          if (res.ok) return 'AI Model Active';
        } catch (e) {
          // Express proxy not running yet, test the AI server directly
        }

        try {
          const direct = await fetch(CONFIG.directAiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'hello' })
          });
          if (direct.ok) {
            return CONFIG.aiBaseUrl.includes('hf.space')
              ? 'AI Model Active (Hub)'
              : 'AI Server 5001';
          }
        } catch (e) {
          // AI server not ready yet
        }
        return null;
      };

      const setStatus = (label, offline) => {
        if (!badge) return;
        badge.innerHTML = offline
          ? '<i class="fa fa-brain"></i> Smart Local Engine'
          : '<i class="fa fa-bolt"></i> ' + label;
        badge.classList.toggle('offline', !!offline);
      };

      // The model takes a few seconds to load, so show "Smart Local Engine"
      // first, then keep re-checking until the AI server comes online.
      setStatus(null, true);

      const MAX_TRIES = 20;   // up to 20 attempts
      const DELAY_MS = 3000;  // every 3s  ->  ~60s window
      for (let i = 0; i < MAX_TRIES; i++) {
        const label = await probe();
        if (label) {
          setStatus(label, false);
          return;
        }
        setStatus(null, true);
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    async predictIntent(message) {
      // 1. Try Express proxy route /api/predict
      try {
        const res = await fetch(CONFIG.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.intent) return data;
        }
      } catch (e) {
        // Fall through
      }

      // 2. Try the AI server directly (local Flask on 5001 or a HF Space)
      try {
        const res = await fetch(CONFIG.directAiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.intent) return data;
        }
      } catch (e) {
        // Fall through
      }

      // 3. Built-in Client classifier
      return clientClassifyIntent(message);
    }

    handleAiResponse(result, userQuery) {
      const intentKey = (result.intent || 'COURSES').toUpperCase();
      const meta = INTENT_MAP[intentKey] || INTENT_MAP['COURSES'];
      const confidence = result.confidence ? Math.round(result.confidence * 100) : 92;

      AudioService.playChime();

      // Check if user specifically requested direct navigation, or asked for
      // a course recommendation (which we hand off to the Find My Course page).
      const isDirectNavRequest = /go to|take me to|navigate to|open|show me the page/i.test(userQuery)
        || intentKey === 'COURSE_RECOMMENDATION';

      this.appendBuddyMessage({
        intent: intentKey,
        confidence: confidence,
        meta: meta,
        isDirectNav: isDirectNavRequest
      });
    }

    appendUserMessage(text) {
      const chatBody = document.getElementById('buddyChatBody');
      const typingRow = document.getElementById('buddyTypingRow');
      if (!chatBody) return;

      const time = this.getCurrentTime();
      const msgDiv = document.createElement('div');
      msgDiv.className = 'buddy-msg-row user';
      msgDiv.innerHTML = `
        <div class="buddy-msg-content">
          <div class="buddy-msg-bubble">${this.escapeHTML(text)}</div>
          <span class="buddy-msg-time">${time}</span>
        </div>
      `;

      if (typingRow) {
        chatBody.insertBefore(msgDiv, typingRow);
      } else {
        chatBody.appendChild(msgDiv);
      }

      this.scrollToBottom();
    }

    appendBuddyMessage({ intent, confidence, meta, isDirectNav }) {
      const chatBody = document.getElementById('buddyChatBody');
      const typingRow = document.getElementById('buddyTypingRow');
      if (!chatBody) return;

      const time = this.getCurrentTime();
      const msgDiv = document.createElement('div');
      msgDiv.className = 'buddy-msg-row buddy';

      let actionHTML = '';
      if (meta.actionLabel && meta.targetUrl) {
        actionHTML = `
          <div class="buddy-action-card">
            <span class="buddy-action-label">Quick Navigation</span>
            <button class="buddy-action-btn" data-url="${meta.targetUrl}" data-anchor="${meta.inPageAnchor || ''}" data-filter="${meta.categoryFilter || ''}">
              <i class="fa fa-arrow-right"></i> ${meta.actionLabel}
            </button>
          </div>
        `;
      }

      msgDiv.innerHTML = `
        <div class="buddy-msg-avatar">
          <img src="${CONFIG.avatarSrc}" alt="Buddy">
        </div>
        <div class="buddy-msg-content">
          <div class="buddy-msg-bubble">
            <div class="buddy-intent-tag">
              <i class="fa fa-sparkles"></i> ${meta.title || intent} (${confidence}%)
            </div>
            <div>${meta.text}</div>
            ${actionHTML}
          </div>
          <span class="buddy-msg-time">${time}</span>
        </div>
      `;

      // Bind button click for navigation
      const actionBtn = msgDiv.querySelector('.buddy-action-btn');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          this.executeNavigation(
            actionBtn.dataset.url,
            actionBtn.dataset.anchor,
            actionBtn.dataset.filter
          );
        });
      }

      if (typingRow) {
        chatBody.insertBefore(msgDiv, typingRow);
      } else {
        chatBody.appendChild(msgDiv);
      }

      this.scrollToBottom();

      // If direct navigation was explicitly requested, navigate automatically
      if (isDirectNav && meta.targetUrl) {
        const toast = document.createElement('div');
        toast.className = 'buddy-auto-nav-toast';
        toast.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Navigating in 1.5 seconds...';
        msgDiv.querySelector('.buddy-msg-bubble').appendChild(toast);
        setTimeout(() => {
          this.executeNavigation(meta.targetUrl, meta.inPageAnchor, meta.categoryFilter);
        }, 1500);
      }
    }

    executeNavigation(url, inPageAnchor, categoryFilter) {
      if (!url) return;

      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      const targetPage = url.split('?')[0].split('#')[0];

      // Check external URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      // Check if we are already on the target page
      const isSamePage = (currentPage === targetPage) || (currentPage === '' && targetPage === 'index.html');

      if (isSamePage) {
        // If a category filter is specified on courses page
        if (categoryFilter) {
          const tab = document.querySelector(`.cat-tab[data-filter="${categoryFilter}"]`);
          if (tab) {
            tab.click();
            const grid = document.querySelector('.courses-grid') || tab;
            grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }

        // If in-page anchor exists
        if (inPageAnchor) {
          const anchorEl = document.querySelector(inPageAnchor);
          if (anchorEl) {
            anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }
      }

      // Otherwise navigate directly to the URL
      window.location.href = url;
    }

    checkAutoFilterOnLoad() {
      // Check URL search parameters (e.g. ?filter=web)
      const params = new URLSearchParams(window.location.search);
      const filter = params.get('filter');
      if (filter) {
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            const tab = document.querySelector(`.cat-tab[data-filter="${filter}"]`);
            if (tab) {
              tab.click();
              const section = document.querySelector('.courses-grid') || tab;
              section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 300);
        });
      }
    }

    showTyping(show) {
      const row = document.getElementById('buddyTypingRow');
      if (row) {
        if (show) {
          row.classList.add('active');
          this.scrollToBottom();
        } else {
          row.classList.remove('active');
        }
      }
    }

    scrollToBottom() {
      const body = document.getElementById('buddyChatBody');
      if (body) {
        setTimeout(() => {
          body.scrollTop = body.scrollHeight;
        }, 50);
      }
    }

    getCurrentTime() {
      const now = new Date();
      return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }

  // --- Auto-Initialize on DOM ready ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new GTECBuddy());
  } else {
    new GTECBuddy();
  }

})();