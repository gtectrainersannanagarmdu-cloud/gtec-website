# ==========================================================================
#   G-TEC - Course rules (single source of truth, no ML dependencies)
#
#   Mirrors public/courses.html and public/js/recommend.js.
#   Used by:
#       train_course_model.py   as the "teacher" that labels the training grid
#       ai_server.py            as the fallback if the model is unavailable
#
#   Pure standard library, so importing it from Flask costs nothing.
# ==========================================================================

# --------------------------------------------------------------------------
# Course catalogue
# --------------------------------------------------------------------------
COURSES = [
    {"name": "MS Office & Computer Basics",      "category": "software",    "level": "Beginner",     "duration": "3 Months", "img": "assets/images/office.png",          "filter": "software"},
    {"name": "Tally ERP & GST Accounting",        "category": "software",    "level": "Beginner",     "duration": "4 Months", "img": "assets/images/course-finance.jpg",  "filter": "finance"},
    {"name": "SAP FICO (Finance & Controlling)",  "category": "finance",     "level": "Intermediate", "duration": "3 Months", "img": "assets/images/course-sap-fico.jpg", "filter": "finance"},
    {"name": "PC Hardware & Maintenance",         "category": "hardware",    "level": "Beginner",     "duration": "4 Months", "img": "assets/images/course-hardware.jpg", "filter": "hardware"},
    {"name": "Networking & CCNA Prep",            "category": "hardware",    "level": "Intermediate", "duration": "6 Months", "img": "assets/images/cisco.png",           "filter": "hardware"},
    {"name": "Diploma in CCTV Installation DCI",  "category": "hardware",    "level": "Beginner",     "duration": "1 Month",  "img": "assets/images/cctv.png",            "filter": "hardware"},
    {"name": "Adobe Photoshop & Illustrator",     "category": "design",      "level": "Beginner",     "duration": "4 Months", "img": "assets/images/course-graphic.jpg",  "filter": "design"},
    {"name": "Video Editing & Animation",         "category": "design",      "level": "Intermediate", "duration": "5 Months", "img": "assets/images/videoediting.png",    "filter": "design"},
    {"name": "UI/UX Design & Figma",              "category": "design",      "level": "Beginner",     "duration": "4 Months", "img": "assets/images/ui and ux.png",       "filter": "design"},
    {"name": "Full Stack Web Development",        "category": "web",         "level": "Intermediate", "duration": "6 Months", "img": "assets/images/course-web.jpg",      "filter": "web"},
    {"name": "Python Programming",                "category": "programming", "level": "Beginner",     "duration": "5 Months", "img": "assets/images/python.png",          "filter": "programming"},
    {"name": "Certificate Course in Data Analytics (CCDA)", "category": "data", "level": "Intermediate", "duration": "3 Months", "img": "assets/images/ccda.jpg",      "filter": "all"},
    {"name": "Advanced Python",                   "category": "programming", "level": "Intermediate", "duration": "3 Months", "img": "assets/images/advpython.jpg",       "filter": "programming"},
    {"name": "Java & Object-Oriented Programming", "category": "programming", "level": "Intermediate", "duration": "6 Months", "img": "assets/images/java.jpg",           "filter": "programming"},
    {"name": "Digital Marketing & SEO",           "category": "marketing",   "level": "Beginner",     "duration": "4 Months", "img": "assets/images/course-digital.jpg",  "filter": "marketing"},
    {"name": "Social Media Marketing",            "category": "marketing",   "level": "Beginner",     "duration": "3 Months", "img": "assets/images/social.jpg",          "filter": "marketing"},
    {"name": "Financial Accounting & Tally",      "category": "finance",     "level": "Beginner",     "duration": "4 Months", "img": "assets/images/course-finance.jpg",  "filter": "finance"},
    {"name": "Advanced Excel for Finance",        "category": "finance",     "level": "Intermediate", "duration": "3 Months", "img": "assets/images/course-finance.jpg",  "filter": "finance"},
    {"name": "AutoCAD 2D & 3D Design",            "category": "cad",         "level": "Intermediate", "duration": "5 Months", "img": "assets/images/course-cad.jpg",      "filter": "cad"},
    {"name": "SolidWorks & Mechanical Design",    "category": "cad",         "level": "Advanced",     "duration": "6 Months", "img": "assets/images/course-cad.jpg",      "filter": "cad"},
    {"name": "Soft Skill Development Program",    "category": "softskill",   "level": "Beginner",     "duration": "2 Months", "img": "assets/images/softskill.jpg",       "filter": "all"},
    {"name": "G-Tec Internship Programme",        "category": "internship",  "level": "Beginner",     "duration": "3 Months", "img": "assets/images/internship.jpg",      "filter": "all"},
]

BY_NAME = {c["name"]: c for c in COURSES}

BEGINNER_COURSE = {
    "software":    "MS Office & Computer Basics",
    "hardware":    "PC Hardware & Maintenance",
    "design":      "Adobe Photoshop & Illustrator",
    "web":         "UI/UX Design & Figma",
    "programming": "Python Programming",
    "marketing":   "Digital Marketing & SEO",
    "finance":     "Financial Accounting & Tally",
    "cad":         "AutoCAD 2D & 3D Design",
}

BACKGROUNDS = ["10th_12th", "diploma", "arts", "commerce",
               "science", "engineering", "postgraduate", "working"]

GOALS = ["job", "business", "upgrade", "freelance", "exploring"]

PREVIOUS = ["none", "basic", "technical", "self"]

# Human phrasing, published with the model so every client shows the same words.
BACKGROUND_TEXT = {
    "10th_12th":    "10th / 12th standard",
    "diploma":      "diploma",
    "arts":         "degree in arts",
    "commerce":     "degree in commerce",
    "science":      "degree in science",
    "engineering":  "engineering graduate",
    "postgraduate": "postgraduate",
    "working":      "working professional",
}

GOAL_TEXT = {
    "job":       "get a job quickly",
    "business":  "start my own business",
    "upgrade":   "upgrade my skills",
    "freelance": "work from home or freelance",
    "exploring": "just explore my options",
}

PREVIOUS_TEXT = {
    "none":      "no computer course before, complete beginner",
    "basic":     "completed a basic computer course",
    "technical": "completed a technical course in programming, networking or accounting",
    "self":      "some self-taught computer skills",
}

# The wizard's four questions, as rendered by public/recommend.html
RECOM_QUESTIONS = [
    {
        "key": "background",
        "question": "What is your educational background?",
        "options": [
            {"value": "10th_12th",    "label": "10th / 12th"},
            {"value": "diploma",      "label": "Diploma"},
            {"value": "arts",         "label": "Degree (Arts)"},
            {"value": "commerce",     "label": "Degree (Commerce)"},
            {"value": "science",      "label": "Degree (Science)"},
            {"value": "engineering",  "label": "Degree (Engineering)"},
            {"value": "postgraduate", "label": "Postgraduate"},
            {"value": "working",      "label": "Working professional"},
        ],
    },
    {
        "key": "interest",
        "question": "Which area or course interests you?",
        "options": [{"value": "unsure", "label": "Not sure yet - help me choose"}] +
                   [{"value": c["name"], "label": c["name"]} for c in COURSES],
    },
    {
        "key": "goal",
        "question": "What is your primary goal after the course?",
        "options": [
            {"value": "job",       "label": "Get a job quickly"},
            {"value": "business",  "label": "Start my own business"},
            {"value": "upgrade",   "label": "Upgrade my skills"},
            {"value": "freelance", "label": "Work from home / freelance"},
            {"value": "exploring", "label": "Just exploring"},
        ],
    },
    {
        "key": "previous",
        "question": "Have you completed any computer course before?",
        "options": [
            {"value": "none",      "label": "No, I'm a complete beginner"},
            {"value": "basic",     "label": "Yes, a basic computer course"},
            {"value": "technical", "label": "Yes, a technical course"},
            {"value": "self",      "label": "I have some self-taught skills"},
        ],
    },
]


# --------------------------------------------------------------------------
# Decision rules (exact port of public/js/recommend.js)
# --------------------------------------------------------------------------
def _adjust_level(course, is_beginner):
    if course is None:
        return BY_NAME["MS Office & Computer Basics"]
    if is_beginner and course["level"] != "Beginner":
        return BY_NAME[BEGINNER_COURSE.get(course["category"],
                                           "MS Office & Computer Basics")]
    return course


def _stream_of(background):
    if background in ("arts", "commerce"):
        return "commerce"
    if background in ("science", "engineering"):
        return "science"
    return "general"


def _goal_default(goal, stream, is_beginner):
    if goal == "job":
        if stream == "commerce":
            pc = BY_NAME["Tally ERP & GST Accounting"]
        elif stream == "science":
            pc = BY_NAME["Full Stack Web Development"]
        else:
            pc = BY_NAME["MS Office & Computer Basics"]
    elif goal == "business":
        if stream == "commerce":
            pc = BY_NAME["Tally ERP & GST Accounting"]
        else:
            pc = BY_NAME["Digital Marketing & SEO"]
    elif goal == "upgrade":
        if stream == "commerce":
            pc = BY_NAME["Advanced Excel for Finance"]
        elif stream == "science":
            pc = BY_NAME["Advanced Python"]
        else:
            pc = BY_NAME["Full Stack Web Development"]
    elif goal == "freelance":
        if stream == "science":
            pc = BY_NAME["Full Stack Web Development"]
        else:
            pc = BY_NAME["Social Media Marketing"]
    else:  # exploring
        pc = BY_NAME["MS Office & Computer Basics"]
    return _adjust_level(pc, is_beginner)


def teacher(background, interest, goal, previous):
    """Returns (course_name, is_beginner, interest_matched)."""
    is_beginner = previous in ("none", "basic", "self") or background == "10th_12th"
    stream      = _stream_of(background)
    picked      = BY_NAME.get(interest) if interest and interest != "unsure" else None
    course      = picked or _goal_default(goal, stream, is_beginner)
    return course["name"], is_beginner, bool(picked)


def course_details(name):
    """Catalogue entry plus the courses.html URL for its category."""
    course = BY_NAME.get(name)
    if not course:
        return {"name": name, "category": "all", "filter": "all",
                "url": "courses.html", "level": "", "duration": "", "img": ""}
    details = dict(course)
    flt = details.get("filter") or "all"
    details["url"] = "courses.html" if flt == "all" else f"courses.html?filter={flt}"
    return details
