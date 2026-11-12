// ==========================================================================
//   G-TEC — "Find My Course" Recommendation Tool
//   Reads the 4 dropdown answers on recommend.html and recommends a course
//   that exists on the website (courses.html).
// ==========================================================================

(function () {
  'use strict';

  // --- Course catalogue (mirrors courses.html) ---------------------------
  const COURSES = [
    { name: 'MS Office & Computer Basics',      category: 'software',    level: 'Beginner',     duration: '3 Months', img: 'assets/images/office.png' },
    { name: 'Tally ERP & GST Accounting',        category: 'software',    level: 'Beginner',     duration: '4 Months', img: 'assets/images/course-finance.jpg' },
    { name: 'SAP FICO (Finance & Controlling)',  category: 'finance',     level: 'Intermediate', duration: '3 Months', img: 'assets/images/course-sap-fico.jpg' },
    { name: 'PC Hardware & Maintenance',         category: 'hardware',    level: 'Beginner',     duration: '4 Months', img: 'assets/images/course-hardware.jpg' },
    { name: 'Networking & CCNA Prep',            category: 'hardware',    level: 'Intermediate', duration: '6 Months', img: 'assets/images/cisco.png' },
    { name: 'Diploma in CCTV Installation DCI',  category: 'hardware',    level: 'Beginner',     duration: '1 Month',  img: 'assets/images/cctv.png' },
    { name: 'Adobe Photoshop & Illustrator',     category: 'design',      level: 'Beginner',     duration: '4 Months', img: 'assets/images/course-graphic.jpg' },
    { name: 'Video Editing & Animation',         category: 'design',      level: 'Intermediate', duration: '5 Months', img: 'assets/images/videoediting.png' },
    { name: 'UI/UX Design & Figma',              category: 'design',      level: 'Beginner',     duration: '4 Months', img: 'assets/images/ui and ux.png' },
    { name: 'Full Stack Web Development',        category: 'web',         level: 'Intermediate', duration: '6 Months', img: 'assets/images/course-web.jpg' },
    { name: 'Python Programming',                category: 'programming', level: 'Beginner',     duration: '5 Months', img: 'assets/images/python.png' },
    { name: 'Certificate Course in Data Analytics (CCDA)', category: 'data', level: 'Intermediate', duration: '3 Months', img: 'assets/images/ccda.jpg' },
    { name: 'Advanced Python',                   category: 'programming', level: 'Intermediate', duration: '3 Months', img: 'assets/images/advpython.jpg' },
    { name: 'Java & Object-Oriented Programming', category: 'programming', level: 'Intermediate', duration: '6 Months', img: 'assets/images/java.jpg' },
    { name: 'Digital Marketing & SEO',           category: 'marketing',   level: 'Beginner',     duration: '4 Months', img: 'assets/images/course-digital.jpg' },
    { name: 'Social Media Marketing',            category: 'marketing',   level: 'Beginner',     duration: '3 Months', img: 'assets/images/social.jpg' },
    { name: 'Financial Accounting & Tally',      category: 'finance',     level: 'Beginner',     duration: '4 Months', img: 'assets/images/course-finance.jpg' },
    { name: 'Advanced Excel for Finance',        category: 'finance',     level: 'Intermediate', duration: '3 Months', img: 'assets/images/course-finance.jpg' },
    { name: 'AutoCAD 2D & 3D Design',            category: 'cad',         level: 'Intermediate', duration: '5 Months', img: 'assets/images/course-cad.jpg' },
    { name: 'SolidWorks & Mechanical Design',    category: 'cad',         level: 'Advanced',     duration: '6 Months', img: 'assets/images/course-cad.jpg' },
    { name: 'Soft Skill Development Program',    category: 'softskill',   level: 'Beginner',     duration: '2 Months', img: 'assets/images/softskill.jpg' },
    { name: 'G-Tec Internship Programme',        category: 'internship',  level: 'Beginner',     duration: '3 Months', img: 'assets/images/internship.jpg' }
  ];

  const byName = {};
  COURSES.forEach((c) => { byName[c.name] = c; });

  // Exact label used in the contact.html "Course Interested In" dropdown.
  // Listed only where it differs from the catalogue name.
  const CONTACT_OPTION = {
    'Networking & CCNA Prep': 'Networking & CCNA',
    'Java & Object-Oriented Programming': 'Java & OOP'
  };

  const CATEGORY_LABELS = {
    software: 'Software',
    hardware: 'Hardware & Networking',
    design: 'Graphic & UI/UX Design',
    web: 'Web Development',
    programming: 'Programming',
    data: 'Data Analytics',
    marketing: 'Digital Marketing',
    finance: 'Finance & Accounting',
    cad: 'CAD & Engineering Design',
    softskill: 'Career & Soft Skills',
    internship: 'Internship Programme'
  };

  // Beginner-friendly course for each category (used when a beginner picks
  // an advanced/intermediate course).
  const BEGINNER_COURSE = {
    software: 'MS Office & Computer Basics',
    hardware: 'PC Hardware & Maintenance',
    design: 'Adobe Photoshop & Illustrator',
    web: 'UI/UX Design & Figma',
    programming: 'Python Programming',
    marketing: 'Digital Marketing & SEO',
    finance: 'Financial Accounting & Tally',
    cad: 'AutoCAD 2D & 3D Design'
  };

  const FILTERS = new Set(['software', 'hardware', 'design', 'web', 'programming', 'marketing', 'finance', 'cad']);

  const BG_LABELS = {
    '10th_12th': '10th / 12th',
    diploma: 'Diploma',
    arts: 'Arts',
    commerce: 'Commerce',
    science: 'Science',
    engineering: 'Engineering',
    postgraduate: 'Postgraduate',
    working: 'working professional'
  };

  const GOAL_LABELS = {
    job: 'get a job quickly',
    business: 'start your own business',
    upgrade: 'upgrade your skills',
    freelance: 'work from home / freelance',
    exploring: 'explore your options'
  };

  // --- Helpers -----------------------------------------------------------
  function beginnerFor(category) {
    return byName[BEGINNER_COURSE[category]] || byName['MS Office & Computer Basics'];
  }

  function adjustLevel(course, isBeginner) {
    if (!course) return byName['MS Office & Computer Basics'];
    if (isBeginner && course.level !== 'Beginner') {
      return beginnerFor(course.category);
    }
    return course;
  }

  function streamOf(background) {
    if (background === 'arts' || background === 'commerce') return 'commerce';
    if (background === 'science' || background === 'engineering') return 'science';
    return 'general';
  }

  function filterFor(category) {
    return FILTERS.has(category) ? category : 'all';
  }

  function isBeginnerProfile(a) {
    return (
      a.previous === 'none' ||
      a.previous === 'basic' ||
      a.previous === 'self' ||
      a.background === '10th_12th'
    );
  }

  // When the user is not sure what to study, pick based on goal + background.
  function goalDefault(goal, stream, isBeginner) {
    let pc;
    switch (goal) {
      case 'job':
        if (stream === 'commerce') pc = byName['Tally ERP & GST Accounting'];
        else if (stream === 'science') pc = byName['Full Stack Web Development'];
        else pc = byName['MS Office & Computer Basics'];
        break;
      case 'business':
        if (stream === 'commerce') pc = byName['Tally ERP & GST Accounting'];
        else pc = byName['Digital Marketing & SEO'];
        break;
      case 'upgrade':
        if (stream === 'commerce') pc = byName['Advanced Excel for Finance'];
        else if (stream === 'science') pc = byName['Advanced Python'];
        else pc = byName['Full Stack Web Development'];
        break;
      case 'freelance':
        if (stream === 'science') pc = byName['Full Stack Web Development'];
        else pc = byName['Social Media Marketing'];
        break;
      case 'exploring':
      default:
        pc = byName['MS Office & Computer Basics'];
        break;
    }
    return adjustLevel(pc, isBeginner);
  }

  // --- Core recommendation ----------------------------------------------
  function recommend(a) {
    const isBeginner = isBeginnerProfile(a);
    const stream = streamOf(a.background);

    // If the user picked a specific course, recommend exactly that course.
    // (Previously an explicit pick by a "beginner" profile was silently
    //  swapped for an unrelated foundation course — e.g. MS Office.)
    const picked = a.interest && a.interest !== 'unsure' ? byName[a.interest] : null;

    const course = picked || goalDefault(a.goal, stream, isBeginner);

    return {
      course: course,
      isBeginner: isBeginner,
      interestMatched: !!picked,
      reason: buildReason(a, course, isBeginner, !!picked)
    };
  }

  function buildReason(a, course, isBeginner, pickedInterest) {
    const bg = BG_LABELS[a.background] || 'educational';
    const goal = GOAL_LABELS[a.goal] || 'grow';
    const cat = CATEGORY_LABELS[course.category] || 'this area';

    if (pickedInterest) {
      let text = `You told us you are interested in ${cat}, and ${course.name} is the perfect match for that interest. ` +
        `It also suits your ${bg} background and your goal to ${goal}.`;
      if (isBeginner && course.level !== 'Beginner') {
        text += ` Since you're starting out, our counsellor can help you build the basics first if you'd like.`;
      }
      return text;
    }

    return `Based on your ${bg} background and your goal to ${goal}, ${course.name} is the best fit for you. ` +
      (isBeginner
        ? `It is beginner-friendly, so you can start with confidence.`
        : `It will build on the skills you already have.`);
  }

  // --- Rendering ---------------------------------------------------------
  function renderResult(result) {
    const container = document.getElementById('recoResult');
    if (!container) return;

    const c = result.course;
    const filter = filterFor(c.category);
    const courseUrl = c.url || (filter === 'all' ? 'courses.html' : 'courses.html?filter=' + filter);
    const contactParam = CONTACT_OPTION[c.name] || c.name;

    container.innerHTML = `
      <div class="reco-result-head">
        <span class="reco-result-badge"><i class="fa fa-wand-magic-sparkles"></i> Your Recommended Course</span>
      </div>
      <div class="reco-result-main">
        <div class="reco-result-img-wrap">
          <img class="reco-result-img" src="${c.img}" alt="${c.name}">
        </div>
        <div class="reco-result-info">
          <div class="reco-result-cat">${CATEGORY_LABELS[c.category] || 'Course'}</div>
          <h3>${c.name}</h3>
          <div class="reco-result-meta">
            <span><i class="fa fa-signal"></i> ${c.level}</span>
            <span><i class="fa fa-clock"></i> ${c.duration}</span>
            <span><i class="fa fa-certificate"></i> Certified</span>
          </div>
          <p class="reco-reason">${result.reason}</p>
        </div>
      </div>
      <div class="reco-result-actions">
        <a class="btn btn-primary" href="contact.html?course=${encodeURIComponent(contactParam)}">
          <i class="fa fa-phone"></i> Talk to Our Academic Counsellor
        </a>
        <a class="btn btn-blue" href="${courseUrl}">
          <i class="fa fa-graduation-cap"></i> View Course Details
        </a>
      </div>
      <p class="reco-counsellor-note">
        <i class="fa fa-circle-info"></i> Talk to our academic counsellor for more details, fees, and batch timings.
      </p>
      <button type="button" class="reco-restart" id="recoRestart">
        <i class="fa fa-rotate-left"></i> Try Again
      </button>
    `;

    container.hidden = false;
    container.classList.remove('reco-pop');
    // force reflow so the animation replays on every recommendation
    void container.offsetWidth;
    container.classList.add('reco-pop');

    const restart = document.getElementById('recoRestart');
    if (restart) {
      restart.addEventListener('click', () => {
        const form = document.getElementById('recoForm');
        if (form) form.reset();
        container.hidden = true;
        const formCard = document.querySelector('.reco-form-card');
        if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Model call --------------------------------------------------------
  // The recommendation comes from the course model on the Hugging Face Hub,
  // reached through our own /api/recommend proxy. If the AI server is asleep
  // or offline, the submit handler falls back to recommend() below.
  async function fetchRecommendation(answers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
        signal: controller.signal
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.course || !data.course.name) return null;
      return data;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Init --------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('recoForm');
    const errorBox = document.getElementById('recoError');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const answers = {
        background: document.getElementById('qBackground').value,
        goal: document.getElementById('qGoal').value,
        previous: document.getElementById('qPrevious').value,
        interest: document.getElementById('qInterest').value
      };

      const complete = answers.background && answers.goal && answers.previous && answers.interest;

      if (!complete) {
        if (errorBox) errorBox.hidden = false;
        return;
      }
      if (errorBox) errorBox.hidden = true;

      const button = form.querySelector('button[type="submit"], .reco-submit');
      const buttonHtml = button ? button.innerHTML : null;
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Finding your course...';
      }

      try {
        const data = await fetchRecommendation(answers);

        if (data) {
          const picked = answers.interest !== 'unsure';
          // Merge the model's answer with the local catalogue entry so the
          // card always has an image, level and duration to show.
          const course = Object.assign({}, byName[data.course.name] || data.course, {
            url: data.course.url
          });
          renderResult({
            course: course,
            confidence: data.confidence,
            source: data.source,
            isBeginner: isBeginnerProfile(answers),
            interestMatched: picked,
            reason: buildReason(answers, course, isBeginnerProfile(answers), picked)
          });
          return;
        }

        // AI server unavailable -> use the same rules the model was trained on.
        renderResult(recommend(answers));
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = buttonHtml;
        }
      }
    });

    // Hide the error as soon as the user fixes a field.
    form.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        if (errorBox) errorBox.hidden = true;
      });
    });
  });
})();
